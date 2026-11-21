/**
 * Backend Visual Workflow Execution Engine
 *
 * Executes connected workflow graphs exclusively on the server:
 *  - Triggered from verified backend form submissions (never relies on browser)
 *  - Reuses Phase 2 condition evaluator & dynamic piping
 *  - Reuses Phase 3.4 integration framework, SSRF URL/DNS/redirect validation & HMAC signing
 *  - Supports deterministic branching (True / False), bounded retries, execution timeouts,
 *    loop guards, idempotency keys, rate limits, safe cancellation, and secret redaction
 *  - Strictly refuses to activate any invalid workflow
 */

import crypto from 'node:crypto';
import type { PlanTier } from '../../src/types/form';
import {
  evaluateWorkflowConditionGroup,
  resolveWorkflowTemplate,
} from '../../src/studio/workflows/condition-evaluator';
import {
  type WorkflowDefinition,
  type WorkflowEdge,
  type WorkflowExecutionRun,
  type WorkflowNode,
  type WorkflowNodeExecutionTrace,
  type WorkflowRunMode,
  type WorkflowSubmissionEventInput,
  type WorkflowValidationReport,
  WORKFLOW_SCHEMA_VERSION,
} from '../../src/studio/workflows/types';
import { validateWorkflowDefinition } from '../../src/studio/workflows/validation';
import type { IntegrationExecutionEngine } from '../integrations/engine';
import {
  buildSanitizedEventPayload,
  type DnsLookupFn,
  type FetchLikeFn,
  safeFetchWithRedirectValidation,
  signWebhookPayload,
  SlidingWindowRateLimiter,
  validateOutboundUrl,
} from '../integrations/security';
import {
  checkWorkflowActivationEntitlement,
  getWorkflowPlanEntitlements,
  PLATFORM_SAFETY_LIMITS,
} from './entitlements';
import {
  type StoredWorkflowRecord,
  toPublicWorkflow,
  WorkflowStore,
} from './store';

export class WorkflowEngineError extends Error {
  readonly statusCode: number;
  readonly validation?: WorkflowValidationReport;

  constructor(message: string, statusCode = 400, validation?: WorkflowValidationReport) {
    super(message);
    this.name = 'WorkflowEngineError';
    this.statusCode = statusCode;
    this.validation = validation;
  }
}

export interface WorkflowEngineOptions {
  store?: WorkflowStore;
  integrationEngine?: IntegrationExecutionEngine;
  /** Override retry delay in ms (default 600ms; tests can set 10ms). */
  baseRetryDelayMs?: number;
  /** Override max run timeout (defaults to PLATFORM_SAFETY_LIMITS.maxRunTimeoutMs). */
  maxRunTimeoutMs?: number;
  /** Override per-workflow rate limit per window. */
  maxRunsPerWorkflowPerWindow?: number;
  /** Override rate limit window ms (default 60_000ms). */
  rateLimitWindowMs?: number;
  /** Optional custom fetch / DNS lookup for deterministic tests. */
  fetchImpl?: FetchLikeFn;
  dnsLookup?: DnsLookupFn;
  /** TEST-ONLY: allow ephemeral local 127.0.0.1 HTTP test receivers. */
  allowUnsafeLoopbackForTests?: boolean;
  /** Optional test hook called right before each action executes (for cancellation/delay tests). */
  beforeActionHook?: (node: WorkflowNode, signal: AbortSignal) => Promise<void>;
}

const SENSITIVE_LOG_PATTERNS = [
  /whsec_[a-zA-Z0-9_-]{8,}/g,
  /Bearer\s+[a-zA-Z0-9._~+/=-]{8,}/gi,
  /(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi,
];

function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SENSITIVE_LOG_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out.slice(0, 500);
}

export interface CreateWorkflowInput {
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
}

export class WorkflowExecutionEngine {
  readonly store: WorkflowStore;
  private readonly integrationEngine?: IntegrationExecutionEngine;
  private readonly workflowRateLimiter: SlidingWindowRateLimiter;
  private readonly formRateLimiter: SlidingWindowRateLimiter;
  private readonly baseRetryDelayMs: number;
  private readonly maxRunTimeoutMs: number;
  private readonly fetchImpl?: FetchLikeFn;
  private readonly dnsLookup?: DnsLookupFn;
  private readonly allowUnsafeLoopbackForTests: boolean;
  private readonly beforeActionHook?: (node: WorkflowNode, signal: AbortSignal) => Promise<void>;
  private readonly activeRunControllers = new Map<string, AbortController>();
  private readonly activeJobs = new Set<Promise<void>>();
  private readonly scheduledTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(options: WorkflowEngineOptions = {}) {
    this.store = options.store ?? new WorkflowStore();
    this.integrationEngine = options.integrationEngine;
    this.baseRetryDelayMs = options.baseRetryDelayMs ?? 600;
    this.maxRunTimeoutMs = Math.min(
      options.maxRunTimeoutMs ?? PLATFORM_SAFETY_LIMITS.maxRunTimeoutMs,
      PLATFORM_SAFETY_LIMITS.maxRunTimeoutMs
    );
    this.fetchImpl = options.fetchImpl;
    this.dnsLookup = options.dnsLookup;
    this.allowUnsafeLoopbackForTests = Boolean(options.allowUnsafeLoopbackForTests);
    this.beforeActionHook = options.beforeActionHook;

    const windowMs = options.rateLimitWindowMs ?? 60_000;
    const perWf =
      options.maxRunsPerWorkflowPerWindow ?? PLATFORM_SAFETY_LIMITS.maxRunsPerWorkflowPerMinute;
    this.workflowRateLimiter = new SlidingWindowRateLimiter(perWf, windowMs);
    this.formRateLimiter = new SlidingWindowRateLimiter(
      Math.max(perWf * 3, PLATFORM_SAFETY_LIMITS.maxRunsPerFormPerMinute),
      windowMs
    );
  }

  private assertOwnedWorkflow(
    formId: string,
    ownerId: string,
    workflowId: string
  ): StoredWorkflowRecord {
    const wf = this.store.getWorkflow(workflowId);
    if (!wf || wf.formId !== formId) {
      throw new WorkflowEngineError('Workflow not found.', 404);
    }
    if (wf.ownerId !== ownerId) {
      throw new WorkflowEngineError(
        'You do not have permission to access or modify this workflow.',
        403
      );
    }
    return wf;
  }

  private getOwnerIntegrationIds(formId: string, ownerId: string): Set<string> | undefined {
    if (!this.integrationEngine) return undefined;
    const list = this.integrationEngine.listFormIntegrations(formId, ownerId);
    return new Set(list.map((i) => i.id));
  }

  listFormWorkflows(formId: string, ownerId: string): WorkflowDefinition[] {
    return this.store.listWorkflowsByForm(formId, ownerId).map(toPublicWorkflow);
  }

  listFormState(formId: string, ownerId: string, planTier: PlanTier = 'free') {
    const ownedWorkflows = this.store.listWorkflowsByForm(formId, ownerId);
    const ownedIds = new Set(ownedWorkflows.map((w) => w.id));
    return {
      workflows: ownedWorkflows.map(toPublicWorkflow),
      runs: this.store.listRunsByForm(formId, ownedIds),
      notifications: this.store.listNotificationsByForm(formId, ownedIds),
      tasks: this.store.listTasksByForm(formId, ownedIds),
      emailOutbox: this.store.listEmailOutboxByForm(formId, ownedIds),
      responseRecords: this.store.listResponseRecordsByForm(formId),
      entitlements: getWorkflowPlanEntitlements(planTier),
      platformLimits: PLATFORM_SAFETY_LIMITS,
    };
  }

  createWorkflow(
    formId: string,
    ownerId: string,
    input: CreateWorkflowInput
  ): { workflow: WorkflowDefinition; validation: WorkflowValidationReport } {
    const now = new Date().toISOString();
    const record: StoredWorkflowRecord = {
      id: `wf_${crypto.randomBytes(8).toString('hex')}`,
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      formId,
      ownerId,
      name: (input.name || 'Untitled Workflow').trim().slice(0, 120),
      description: input.description?.trim().slice(0, 400),
      // Always created as draft until explicitly validated and activated
      status: 'draft',
      nodes: Array.isArray(input.nodes) ? input.nodes : [],
      edges: Array.isArray(input.edges) ? input.edges : [],
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
      lastError: null,
    };

    const validation = this.validateWorkflowSync(record, ownerId);
    this.store.saveWorkflow(record);
    return { workflow: toPublicWorkflow(record), validation };
  }

  updateWorkflow(
    formId: string,
    ownerId: string,
    workflowId: string,
    patch: UpdateWorkflowInput
  ): { workflow: WorkflowDefinition; validation: WorkflowValidationReport } {
    const existing = this.assertOwnedWorkflow(formId, ownerId, workflowId);
    const updated: StoredWorkflowRecord = {
      ...existing,
      name:
        patch.name !== undefined
          ? patch.name.trim().slice(0, 120)
          : existing.name,
      description:
        patch.description !== undefined
          ? patch.description.trim().slice(0, 400)
          : existing.description,
      nodes: patch.nodes !== undefined ? patch.nodes : existing.nodes,
      edges: patch.edges !== undefined ? patch.edges : existing.edges,
      updatedAt: new Date().toISOString(),
    };

    const validation = this.validateWorkflowSync(updated, ownerId);
    // Never keep an invalid workflow active
    if (updated.status === 'active' && !validation.canActivate) {
      updated.status = 'draft';
    }

    this.store.saveWorkflow(updated);
    return { workflow: toPublicWorkflow(updated), validation };
  }

  validateWorkflowSync(
    workflow: Pick<WorkflowDefinition, 'formId' | 'name' | 'nodes' | 'edges'>,
    ownerId: string
  ): WorkflowValidationReport {
    return validateWorkflowDefinition(workflow, {
      maxNodes: PLATFORM_SAFETY_LIMITS.maxNodesPerWorkflow,
      maxActions: PLATFORM_SAFETY_LIMITS.maxActionsPerWorkflow,
      availableIntegrationIds: this.getOwnerIntegrationIds(workflow.formId, ownerId),
    });
  }

  async validateWorkflowForActivation(
    workflow: StoredWorkflowRecord
  ): Promise<WorkflowValidationReport> {
    const base = this.validateWorkflowSync(workflow, workflow.ownerId);
    const extraErrors = [...base.errors];

    // Server-side SSRF/HTTPS validation for every direct webhook node URL
    for (const node of workflow.nodes) {
      if (node.type === 'action_send_webhook' && node.config.webhookUrl && !node.config.integrationId) {
        const urlCheck = await validateOutboundUrl(node.config.webhookUrl, {
          allowUnsafeLoopbackForTests: this.allowUnsafeLoopbackForTests,
          dnsLookup: this.dnsLookup,
        });
        if (!urlCheck.valid) {
          extraErrors.push({
            id: `ssrf_${node.id}`,
            severity: 'error',
            code: 'UNSAFE_WEBHOOK_URL',
            nodeId: node.id,
            message: `"${node.label}": ${urlCheck.error || 'Destination URL is not permitted.'}`,
          });
        }
      }
    }

    return {
      valid: extraErrors.length === 0,
      canActivate: extraErrors.length === 0,
      errors: extraErrors,
      warnings: base.warnings,
    };
  }

  async activateWorkflow(
    formId: string,
    ownerId: string,
    workflowId: string,
    planTier: PlanTier = 'free'
  ): Promise<{ workflow: WorkflowDefinition; validation: WorkflowValidationReport }> {
    const existing = this.assertOwnedWorkflow(formId, ownerId, workflowId);
    const validation = await this.validateWorkflowForActivation(existing);

    if (!validation.canActivate) {
      throw new WorkflowEngineError(
        validation.errors[0]?.message || 'Workflow configuration is invalid and cannot be activated.',
        400,
        validation
      );
    }

    const activeCount = this.store
      .listWorkflowsByForm(formId, ownerId)
      .filter((w) => w.status === 'active' && w.id !== workflowId).length;
    const actionCount = existing.nodes.filter((n) => n.category === 'action').length;
    const entitlements = getWorkflowPlanEntitlements(planTier);
    const entCheck = checkWorkflowActivationEntitlement(entitlements, activeCount, actionCount);
    if (!entCheck.allowed) {
      throw new WorkflowEngineError(entCheck.reason || 'Workflow entitlement limit reached.', 403);
    }

    const activated: StoredWorkflowRecord = {
      ...existing,
      status: 'active',
      lastError: null,
      updatedAt: new Date().toISOString(),
    };
    this.store.saveWorkflow(activated);
    return { workflow: toPublicWorkflow(activated), validation };
  }

  deactivateWorkflow(
    formId: string,
    ownerId: string,
    workflowId: string
  ): WorkflowDefinition {
    const existing = this.assertOwnedWorkflow(formId, ownerId, workflowId);
    const updated: StoredWorkflowRecord = {
      ...existing,
      status: 'inactive',
      updatedAt: new Date().toISOString(),
    };
    this.store.saveWorkflow(updated);
    return toPublicWorkflow(updated);
  }

  deleteWorkflow(formId: string, ownerId: string, workflowId: string): void {
    this.assertOwnedWorkflow(formId, ownerId, workflowId);
    this.store.deleteWorkflow(workflowId);
  }

  toggleTaskCompleted(
    formId: string,
    ownerId: string,
    taskId: string,
    completed: boolean
  ) {
    // Verify caller owns the workflow that generated this task
    const ownedIds = new Set(
      this.store.listWorkflowsByForm(formId, ownerId).map((w) => w.id)
    );
    const tasks = this.store.listTasksByForm(formId, ownedIds);
    if (!tasks.some((t) => t.id === taskId)) {
      throw new WorkflowEngineError('Task not found.', 404);
    }
    return this.store.toggleTaskCompleted(formId, taskId, completed);
  }

  /**
   * Safely cancels an in-flight workflow execution run owned by the caller.
   */
  cancelRun(
    formId: string,
    ownerId: string,
    runId: string
  ): WorkflowExecutionRun {
    const run = this.store.getRun(runId);
    if (!run || run.formId !== formId) {
      throw new WorkflowEngineError('Workflow run not found.', 404);
    }
    this.assertOwnedWorkflow(formId, ownerId, run.workflowId);

    const controller = this.activeRunControllers.get(runId);
    if (controller && !controller.signal.aborted) {
      controller.abort('Cancelled by workflow owner');
    }

    const latest = this.store.getRun(runId) || run;
    if (latest.status === 'queued' || latest.status === 'running') {
      const cancelled: WorkflowExecutionRun = {
        ...latest,
        status: 'cancelled',
        cancelledBy: ownerId,
        completedAt: new Date().toISOString(),
        durationMs: Math.max(1, Date.now() - Date.parse(latest.startedAt)),
        errorMessage: 'Execution cancelled by user.',
      };
      this.store.saveRun(cancelled);
      return cancelled;
    }

    return latest;
  }

  /**
   * Executes an isolated test run (`mode: 'test'`) using sample data.
   * Test runs are strictly separated from live runs and can run against draft workflows.
   */
  async runWorkflowTest(
    formId: string,
    ownerId: string,
    workflowId: string,
    sampleEvent: Partial<WorkflowSubmissionEventInput>
  ): Promise<WorkflowExecutionRun> {
    const wf = this.assertOwnedWorkflow(formId, ownerId, workflowId);
    const validation = this.validateWorkflowSync(wf, ownerId);
    if (!validation.valid) {
      throw new WorkflowEngineError(
        validation.errors[0]?.message || 'Fix validation errors before running a test.',
        400,
        validation
      );
    }

    const testSubmissionId =
      sampleEvent.submissionId || `test_${crypto.randomBytes(4).toString('hex')}`;
    const event: WorkflowSubmissionEventInput = {
      formId,
      formTitle: sampleEvent.formTitle || 'Sample Form',
      formSlug: sampleEvent.formSlug,
      submissionId: testSubmissionId,
      submittedAt: new Date().toISOString(),
      durationSeconds: sampleEvent.durationSeconds ?? 18,
      isComplete: sampleEvent.isComplete ?? true,
      answers: sampleEvent.answers || {},
      variables: sampleEvent.variables || {},
      formattedVariables: sampleEvent.formattedVariables,
      fieldCatalog: sampleEvent.fieldCatalog || [],
      score: sampleEvent.score,
      maxScore: sampleEvent.maxScore,
      scorePercent: sampleEvent.scorePercent,
      categoryScores: sampleEvent.categoryScores,
      outcomeId: sampleEvent.outcomeId,
      outcomeName: sampleEvent.outcomeName,
      deviceInfo: 'Workflow Test Runner',
    };

    const runId = `run_test_${crypto.randomBytes(6).toString('hex')}`;
    return this.executeWorkflowRun(wf, event, {
      runId,
      mode: 'test',
      idempotencyKey: `test:${wf.id}:${runId}`,
    });
  }

  /**
   * Enqueues asynchronous live workflow runs triggered by a verified backend submission.
   * Non-blocking: returns immediately with queued run IDs so form submission never stalls.
   */
  enqueueLiveSubmission(event: WorkflowSubmissionEventInput): {
    queuedRunIds: string[];
    skippedDuplicates: number;
    skippedUnmatchedTriggers: number;
    rateLimited: number;
  } {
    const activeWorkflows = this.store.listActiveWorkflowsForForm(event.formId);
    const queuedRunIds: string[] = [];
    let skippedDuplicates = 0;
    let skippedUnmatchedTriggers = 0;
    let rateLimited = 0;

    for (const wf of activeWorkflows) {
      const triggerNode = wf.nodes.find((n) => n.category === 'trigger');
      if (!triggerNode) continue;

      if (!this.doesTriggerMatch(triggerNode, event)) {
        skippedUnmatchedTriggers += 1;
        continue;
      }

      const idempotencyKey = `live:${wf.id}:${triggerNode.type}:${event.submissionId}`;
      if (this.store.getRunIdByIdempotencyKey(idempotencyKey)) {
        skippedDuplicates += 1;
        continue;
      }

      const formLimit = this.formRateLimiter.consume(`wf_form:${event.formId}`);
      const wfLimit = this.workflowRateLimiter.consume(`wf:${wf.id}`);
      const runId = `run_${crypto.randomBytes(8).toString('hex')}`;
      const now = new Date().toISOString();

      if (!formLimit.allowed || !wfLimit.allowed) {
        rateLimited += 1;
        this.store.saveRun({
          runId,
          workflowId: wf.id,
          workflowName: wf.name,
          formId: wf.formId,
          mode: 'live',
          status: 'rate_limited',
          triggerEvent: triggerNode.type,
          submissionId: event.submissionId,
          idempotencyKey,
          startedAt: now,
          completedAt: now,
          durationMs: 0,
          nodeTraces: [],
          errorMessage: 'Platform execution rate limit exceeded for this workflow.',
        });
        continue;
      }

      this.store.recordIdempotencyKey(idempotencyKey, runId);
      this.store.saveRun({
        runId,
        workflowId: wf.id,
        workflowName: wf.name,
        formId: wf.formId,
        mode: 'live',
        status: 'queued',
        triggerEvent: triggerNode.type,
        submissionId: event.submissionId,
        idempotencyKey,
        startedAt: now,
        nodeTraces: [],
      });

      queuedRunIds.push(runId);

      this.scheduleAsyncJob(async () => {
        await this.executeWorkflowRun(wf, event, {
          runId,
          mode: 'live',
          idempotencyKey,
        });
      });
    }

    return {
      queuedRunIds,
      skippedDuplicates,
      skippedUnmatchedTriggers,
      rateLimited,
    };
  }

  private doesTriggerMatch(
    trigger: WorkflowNode,
    event: WorkflowSubmissionEventInput
  ): boolean {
    switch (trigger.type) {
      case 'trigger_new_response':
        return true;
      case 'trigger_response_completed':
        return event.isComplete !== false;
      case 'trigger_response_matches': {
        const res = evaluateWorkflowConditionGroup(
          trigger.config.triggerConditionGroup,
          event
        );
        return res.matched;
      }
      case 'trigger_outcome_achieved': {
        const targetId = trigger.config.outcomeId?.trim().toLowerCase();
        const targetName = trigger.config.outcomeName?.trim().toLowerCase();
        const actualId = (event.outcomeId || '').trim().toLowerCase();
        const actualName = (event.outcomeName || '').trim().toLowerCase();
        if (!actualId && !actualName) return false;
        if (targetId && actualId === targetId) return true;
        if (targetName && actualName === targetName) return true;
        return false;
      }
      default:
        return false;
    }
  }

  private async executeWorkflowRun(
    wf: StoredWorkflowRecord,
    event: WorkflowSubmissionEventInput,
    meta: { runId: string; mode: WorkflowRunMode; idempotencyKey: string }
  ): Promise<WorkflowExecutionRun> {
    const triggerNode = wf.nodes.find((n) => n.category === 'trigger');
    const startedMs = Date.now();
    const startedAt = new Date(startedMs).toISOString();

    const run: WorkflowExecutionRun = {
      runId: meta.runId,
      workflowId: wf.id,
      workflowName: wf.name,
      formId: wf.formId,
      mode: meta.mode,
      status: 'running',
      triggerEvent: triggerNode?.type || 'unknown',
      submissionId: event.submissionId,
      idempotencyKey: meta.idempotencyKey,
      startedAt,
      nodeTraces: [],
      errorMessage: null,
    };
    this.store.saveRun(run);

    if (!triggerNode) {
      run.status = 'failed';
      run.errorMessage = 'Workflow has no trigger node.';
      run.completedAt = new Date().toISOString();
      run.durationMs = Math.max(1, Date.now() - startedMs);
      this.store.saveRun(run);
      return run;
    }

    const controller = new AbortController();
    this.activeRunControllers.set(meta.runId, controller);
    const timeoutTimer = setTimeout(() => {
      controller.abort(`Workflow timed out after ${this.maxRunTimeoutMs}ms.`);
    }, this.maxRunTimeoutMs);
    this.scheduledTimers.add(timeoutTimer);

    const nodeById = new Map(wf.nodes.map((n) => [n.id, n]));
    const outgoingBySource = new Map<string, WorkflowEdge[]>();
    for (const edge of wf.edges) {
      const list = outgoingBySource.get(edge.sourceNodeId) || [];
      list.push(edge);
      outgoingBySource.set(edge.sourceNodeId, list);
    }

    // Mutable event copy so `action_update_response_field` feeds downstream nodes cleanly
    const workingEvent: WorkflowSubmissionEventInput = {
      ...event,
      answers: { ...(event.answers || {}) },
      variables: { ...(event.variables || {}) },
    };

    const visitedInRun = new Set<string>();
    const queue: string[] = [triggerNode.id];
    let stepsExecuted = 0;
    let hadFailure = false;
    let firstError: string | null = null;

    try {
      while (queue.length > 0) {
        if (controller.signal.aborted) {
          const reason =
            typeof controller.signal.reason === 'string'
              ? controller.signal.reason
              : 'Execution cancelled.';
          const isTimeout = reason.toLowerCase().includes('timed out');
          run.status = isTimeout ? 'failed' : 'cancelled';
          run.errorMessage = redactSecrets(reason);
          break;
        }

        const currentId = queue.shift()!;
        if (visitedInRun.has(currentId)) {
          // Runtime loop guard in case a corrupted graph ever bypassed static validation
          continue;
        }
        visitedInRun.add(currentId);
        stepsExecuted += 1;

        if (stepsExecuted > PLATFORM_SAFETY_LIMITS.maxExecutionStepsPerRun) {
          hadFailure = true;
          firstError = `Execution halted by loop guard (exceeded ${PLATFORM_SAFETY_LIMITS.maxExecutionStepsPerRun} steps).`;
          break;
        }

        const node = nodeById.get(currentId);
        if (!node) continue;

        const nodeStartMs = Date.now();
        const nodeStartedAt = new Date(nodeStartMs).toISOString();

        if (node.category === 'trigger') {
          const matched = this.doesTriggerMatch(node, workingEvent);
          const trace: WorkflowNodeExecutionTrace = {
            nodeId: node.id,
            nodeLabel: node.label,
            nodeType: node.type,
            category: node.category,
            status: matched ? 'succeeded' : 'skipped',
            startedAt: nodeStartedAt,
            completedAt: new Date().toISOString(),
            durationMs: Math.max(1, Date.now() - nodeStartMs),
            attempts: 1,
            branchTaken: 'default',
            outputSummary: matched
              ? `Triggered by ${node.type} (submission ${workingEvent.submissionId})`
              : `Trigger criteria not met for ${node.type}`,
          };
          run.nodeTraces.push(trace);
          this.store.saveRun(run);

          if (!matched) {
            break;
          }
          for (const edge of outgoingBySource.get(node.id) || []) {
            queue.push(edge.targetNodeId);
          }
          continue;
        }

        if (node.category === 'condition') {
          const evalResult = evaluateWorkflowConditionGroup(
            node.config.conditionGroup,
            workingEvent
          );
          const chosenBranch = evalResult.matched ? 'true' : 'false';
          const skippedBranch = evalResult.matched ? 'false' : 'true';

          const trace: WorkflowNodeExecutionTrace = {
            nodeId: node.id,
            nodeLabel: node.label,
            nodeType: node.type,
            category: node.category,
            status: 'succeeded',
            startedAt: nodeStartedAt,
            completedAt: new Date().toISOString(),
            durationMs: Math.max(1, Date.now() - nodeStartMs),
            attempts: 1,
            branchTaken: chosenBranch,
            conditionSummary: evalResult.summary,
            outputSummary: `Followed ${chosenBranch.toUpperCase()} branch`,
          };
          run.nodeTraces.push(trace);
          this.store.saveRun(run);

          const edges = outgoingBySource.get(node.id) || [];
          for (const edge of edges) {
            if (edge.branch === chosenBranch) {
              queue.push(edge.targetNodeId);
            } else if (edge.branch === skippedBranch) {
              const skippedNode = nodeById.get(edge.targetNodeId);
              if (skippedNode && !visitedInRun.has(skippedNode.id)) {
                run.nodeTraces.push({
                  nodeId: skippedNode.id,
                  nodeLabel: skippedNode.label,
                  nodeType: skippedNode.type,
                  category: skippedNode.category,
                  status: 'skipped',
                  startedAt: nodeStartedAt,
                  completedAt: nodeStartedAt,
                  durationMs: 0,
                  attempts: 0,
                  outputSummary: `Skipped (${skippedBranch.toUpperCase()} branch not taken)`,
                });
              }
            }
          }
          this.store.saveRun(run);
          continue;
        }

        // Action execution with bounded retries
        const actionResult = await this.executeActionNodeWithRetries(
          wf,
          node,
          workingEvent,
          meta,
          controller.signal
        );

        run.nodeTraces.push({
          nodeId: node.id,
          nodeLabel: node.label,
          nodeType: node.type,
          category: node.category,
          status: actionResult.status,
          startedAt: nodeStartedAt,
          completedAt: new Date().toISOString(),
          durationMs: Math.max(1, Date.now() - nodeStartMs),
          attempts: actionResult.attempts,
          outputSummary: actionResult.outputSummary
            ? redactSecrets(actionResult.outputSummary)
            : undefined,
          errorMessage: actionResult.errorMessage
            ? redactSecrets(actionResult.errorMessage)
            : undefined,
        });
        this.store.saveRun(run);

        if (actionResult.status === 'cancelled') {
          run.status = 'cancelled';
          run.errorMessage = redactSecrets(actionResult.errorMessage || 'Execution cancelled.');
          break;
        }

        if (actionResult.status === 'failed') {
          hadFailure = true;
          if (!firstError) {
            firstError = redactSecrets(actionResult.errorMessage || `Action "${node.label}" failed.`);
          }
          // Stop following downstream edges of a failed action
          continue;
        }

        for (const edge of outgoingBySource.get(node.id) || []) {
          queue.push(edge.targetNodeId);
        }
      }

      if (run.status === 'running') {
        run.status = hadFailure ? 'failed' : 'succeeded';
        run.errorMessage = hadFailure ? firstError : null;
      }
    } finally {
      clearTimeout(timeoutTimer);
      this.scheduledTimers.delete(timeoutTimer);
      this.activeRunControllers.delete(meta.runId);
      run.completedAt = new Date().toISOString();
      run.durationMs = Math.max(1, Date.now() - startedMs);
      this.store.saveRun(run);

      if (meta.mode === 'live') {
        const latestWf = this.store.getWorkflow(wf.id);
        if (latestWf) {
          this.store.saveWorkflow({
            ...latestWf,
            lastRunAt: run.completedAt,
            lastError: run.status === 'failed' ? run.errorMessage : null,
          });
        }
      }
    }

    return run;
  }

  private async executeActionNodeWithRetries(
    wf: StoredWorkflowRecord,
    node: WorkflowNode,
    event: WorkflowSubmissionEventInput,
    meta: { runId: string; mode: WorkflowRunMode; idempotencyKey: string },
    signal: AbortSignal
  ): Promise<{
    status: 'succeeded' | 'failed' | 'cancelled';
    attempts: number;
    outputSummary?: string;
    errorMessage?: string;
  }> {
    const isNetworkAction =
      node.type === 'action_send_webhook' ||
      node.type === 'action_connected_service' ||
      (node.type === 'action_send_email' && Boolean(process.env.RESEND_API_KEY));
    const maxAttempts = isNetworkAction ? 3 : 1;

    let attempt = 0;
    while (attempt < maxAttempts) {
      if (signal.aborted) {
        return {
          status: 'cancelled',
          attempts: attempt,
          errorMessage:
            typeof signal.reason === 'string' ? signal.reason : 'Execution cancelled.',
        };
      }

      attempt += 1;
      try {
        if (this.beforeActionHook) {
          await this.beforeActionHook(node, signal);
        }
        if (signal.aborted) {
          return {
            status: 'cancelled',
            attempts: attempt,
            errorMessage:
              typeof signal.reason === 'string' ? signal.reason : 'Execution cancelled.',
          };
        }

        const summary = await this.executeSingleAction(wf, node, event, meta, signal);
        return {
          status: 'succeeded',
          attempts: attempt,
          outputSummary: summary,
        };
      } catch (err: unknown) {
        if (signal.aborted) {
          return {
            status: 'cancelled',
            attempts: attempt,
            errorMessage:
              typeof signal.reason === 'string' ? signal.reason : 'Execution cancelled.',
          };
        }
        const message = err instanceof Error ? err.message : 'Action execution failed.';
        const nonRetryable =
          message.includes('HTTP 400') ||
          message.includes('HTTP 401') ||
          message.includes('HTTP 403') ||
          message.includes('HTTP 404') ||
          message.includes('HTTP 422') ||
          message.includes('Only HTTPS') ||
          message.includes('private, loopback, or reserved') ||
          message.includes('not found');

        if (attempt >= maxAttempts || nonRetryable) {
          return {
            status: 'failed',
            attempts: attempt,
            errorMessage: message,
          };
        }

        const backoff = this.baseRetryDelayMs * Math.pow(2, attempt - 1);
        await this.delayWithAbort(backoff, signal);
      }
    }

    return {
      status: 'failed',
      attempts: maxAttempts,
      errorMessage: 'Action exhausted maximum retry attempts.',
    };
  }

  private async executeSingleAction(
    wf: StoredWorkflowRecord,
    node: WorkflowNode,
    event: WorkflowSubmissionEventInput,
    meta: { runId: string; mode: WorkflowRunMode; idempotencyKey: string },
    signal: AbortSignal
  ): Promise<string> {
    const cfg = node.config || {};

    switch (node.type) {
      case 'action_assign_response_status': {
        const status = resolveWorkflowTemplate(cfg.responseStatus || '', event).trim();
        if (!status) throw new Error('Response status cannot be empty.');
        if (meta.mode === 'live') {
          this.store.upsertResponseRecord(wf.formId, event.submissionId, (rec) => ({
            ...rec,
            status,
          }));
        }
        return `Assigned response status "${status}"${meta.mode === 'test' ? ' (test preview)' : ''}.`;
      }

      case 'action_apply_tag': {
        const tags = (cfg.tags || [])
          .map((t) => resolveWorkflowTemplate(t, event).trim())
          .filter(Boolean);
        if (tags.length === 0) throw new Error('At least one tag is required.');
        if (meta.mode === 'live') {
          this.store.upsertResponseRecord(wf.formId, event.submissionId, (rec) => ({
            ...rec,
            tags: Array.from(new Set([...rec.tags, ...tags])),
          }));
        }
        return `Applied tags: ${tags.join(', ')}${meta.mode === 'test' ? ' (test preview)' : ''}.`;
      }

      case 'action_update_response_field': {
        const fieldId = cfg.targetFieldId?.trim();
        if (!fieldId) throw new Error('Target response field ID is required.');
        const resolvedValue = resolveWorkflowTemplate(cfg.targetFieldValue ?? '', event);
        event.answers[fieldId] = resolvedValue;
        if (meta.mode === 'live') {
          this.store.upsertResponseRecord(wf.formId, event.submissionId, (rec) => ({
            ...rec,
            updatedFields: { ...rec.updatedFields, [fieldId]: resolvedValue },
          }));
        }
        return `Updated field "${fieldId}" = "${resolvedValue.slice(0, 80)}"${meta.mode === 'test' ? ' (test preview)' : ''}.`;
      }

      case 'action_create_task': {
        const title = resolveWorkflowTemplate(cfg.taskTitle || '', event).trim();
        if (!title) throw new Error('Task title cannot be empty.');
        const description = resolveWorkflowTemplate(cfg.taskDescription || '', event).trim();
        const dueDays =
          typeof cfg.taskDueInDays === 'number' && cfg.taskDueInDays > 0
            ? Math.min(cfg.taskDueInDays, 365)
            : null;
        const dueAt = dueDays
          ? new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000).toISOString()
          : null;
        const taskId = `task_${crypto.randomBytes(6).toString('hex')}`;
        this.store.addTask({
          id: taskId,
          formId: wf.formId,
          workflowId: wf.id,
          runId: meta.runId,
          submissionId: event.submissionId,
          mode: meta.mode,
          title,
          description: description || undefined,
          priority: cfg.taskPriority || 'medium',
          dueAt,
          assignee: cfg.taskAssignee?.trim() || undefined,
          completed: false,
          createdAt: new Date().toISOString(),
        });
        return `Created follow-up task "${title}" (${cfg.taskPriority || 'medium'}).`;
      }

      case 'action_send_notification': {
        const title = resolveWorkflowTemplate(cfg.notificationTitle || '', event).trim();
        const message = resolveWorkflowTemplate(cfg.notificationMessage || '', event).trim();
        if (!title || !message) throw new Error('Notification title and message are required.');

        let channelUsed = 'workspace';
        if (
          cfg.notificationChannel === 'slack_integration' &&
          cfg.slackIntegrationId &&
          this.integrationEngine
        ) {
          await this.dispatchViaIntegrationRecord(
            wf,
            cfg.slackIntegrationId,
            event,
            meta,
            { customNote: `${title}: ${message}` },
            signal
          );
          channelUsed = `slack:${cfg.slackIntegrationId}`;
        }

        this.store.addNotification({
          id: `ntf_${crypto.randomBytes(6).toString('hex')}`,
          formId: wf.formId,
          workflowId: wf.id,
          runId: meta.runId,
          mode: meta.mode,
          title,
          message,
          severity: cfg.notificationSeverity || 'info',
          channel: channelUsed,
          createdAt: new Date().toISOString(),
        });
        return `Notification sent (${channelUsed}): "${title}".`;
      }

      case 'action_send_email': {
        const to = resolveWorkflowTemplate(cfg.emailTo || '', event).trim();
        const subject = resolveWorkflowTemplate(cfg.emailSubject || '', event).trim();
        const body = resolveWorkflowTemplate(cfg.emailBody || '', event).trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
          throw new Error(`Resolved recipient "${to}" is not a valid email address.`);
        }
        if (!subject) throw new Error('Email subject is required.');

        const apiKey = process.env.RESEND_API_KEY;
        const fromEmail = process.env.RESEND_FROM_EMAIL;
        let deliveryMode: 'live_resend' | 'workspace_outbox' = 'workspace_outbox';

        if (apiKey && fromEmail) {
          const res = await safeFetchWithRedirectValidation(
            'https://api.resend.com/emails',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                Authorization: `Bearer ${apiKey}`,
                'Idempotency-Key': `${meta.idempotencyKey}:${node.id}`,
              },
              body: JSON.stringify({
                from: fromEmail,
                to: [to],
                subject,
                text: body || subject,
              }),
            },
            {
              allowedHosts: ['api.resend.com'],
              timeoutMs: PLATFORM_SAFETY_LIMITS.maxActionTimeoutMs,
              fetchImpl: this.fetchImpl,
              dnsLookup: this.dnsLookup,
              allowUnsafeLoopbackForTests: this.allowUnsafeLoopbackForTests,
            }
          );
          if (!res.ok) {
            throw new Error(`Email service returned HTTP ${res.status}.`);
          }
          deliveryMode = 'live_resend';
        }

        this.store.addEmailOutbox({
          id: `eml_${crypto.randomBytes(6).toString('hex')}`,
          formId: wf.formId,
          workflowId: wf.id,
          runId: meta.runId,
          mode: meta.mode,
          to,
          subject,
          body,
          deliveryMode,
          createdAt: new Date().toISOString(),
        });

        return deliveryMode === 'live_resend'
          ? `Sent email to ${to} via Resend ("${subject}").`
          : `Recorded email to ${to} in workspace outbox ("${subject}" — set RESEND_API_KEY for live SMTP delivery).`;
      }

      case 'action_send_webhook': {
        if (cfg.integrationId && this.integrationEngine) {
          return this.dispatchViaIntegrationRecord(
            wf,
            cfg.integrationId,
            event,
            meta,
            { customNote: cfg.webhookCustomNote },
            signal
          );
        }
        const url = cfg.webhookUrl?.trim();
        if (!url) throw new Error('Webhook destination URL or integration ID is required.');

        const deliveryId = `dlv_wf_${crypto.randomBytes(6).toString('hex')}`;
        const payload = buildSanitizedEventPayload(
          {
            formId: event.formId,
            formTitle: event.formTitle,
            formSlug: event.formSlug,
            submissionId: event.submissionId,
            submittedAt: event.submittedAt,
            durationSeconds: event.durationSeconds,
            answers: event.answers,
            fieldCatalog: event.fieldCatalog || [],
            score: event.score,
            maxScore: event.maxScore,
            scorePercent: event.scorePercent,
            categoryScores: event.categoryScores,
            outcomeId: event.outcomeId,
            outcomeName: event.outcomeName,
            deviceInfo: event.deviceInfo,
            isComplete: event.isComplete,
          },
          {
            includedFieldIds: cfg.webhookIncludeFields || [],
            includeMetadata: true,
            includeScoreAndOutcome: true,
          },
          meta.mode === 'test' ? 'webhook.test' : 'form.submitted',
          `evt_wf_${crypto.randomBytes(4).toString('hex')}`,
          deliveryId
        );

        const body = JSON.stringify({
          ...payload,
          workflow: {
            workflowId: wf.id,
            workflowName: wf.name,
            runId: meta.runId,
            mode: meta.mode,
            ...(cfg.webhookCustomNote
              ? { note: resolveWorkflowTemplate(cfg.webhookCustomNote, event) }
              : {}),
          },
        });

        // Sign with deterministic workflow-derived ephemeral secret header if no integration secret
        const derivedSecret = crypto
          .createHash('sha256')
          .update(`${wf.id}:${wf.ownerId}`)
          .digest('hex');
        const signed = signWebhookPayload(body, `whsec_${derivedSecret}`);

        if (signal.aborted) throw new Error('Execution cancelled.');

        const res = await safeFetchWithRedirectValidation(
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'User-Agent': 'FlexStore-Workflow-Engine/1.0',
              'X-FlexStore-Event': meta.mode === 'test' ? 'webhook.test' : 'form.submitted',
              'X-FlexStore-Delivery-Id': deliveryId,
              'X-FlexStore-Idempotency-Key': `${meta.idempotencyKey}:${node.id}`,
              'X-FlexStore-Workflow-Id': wf.id,
              'X-FlexStore-Timestamp': String(signed.timestamp),
              'X-FlexStore-Signature': signed.headerValue,
            },
            body,
          },
          {
            timeoutMs: PLATFORM_SAFETY_LIMITS.maxActionTimeoutMs,
            fetchImpl: this.fetchImpl,
            dnsLookup: this.dnsLookup,
            allowUnsafeLoopbackForTests: this.allowUnsafeLoopbackForTests,
          }
        );

        if (!res.ok) {
          throw new Error(`Webhook endpoint returned HTTP ${res.status}.`);
        }
        return `Delivered signed webhook (HTTP ${res.status} in ${res.durationMs}ms).`;
      }

      case 'action_connected_service': {
        if (!cfg.integrationId || !this.integrationEngine) {
          throw new Error('Connected service integration ID is required.');
        }
        return this.dispatchViaIntegrationRecord(wf, cfg.integrationId, event, meta, {}, signal);
      }

      default:
        throw new Error(`Unsupported workflow action type "${node.type}".`);
    }
  }

  private async dispatchViaIntegrationRecord(
    wf: StoredWorkflowRecord,
    integrationId: string,
    event: WorkflowSubmissionEventInput,
    meta: { runId: string; mode: WorkflowRunMode; idempotencyKey: string },
    extra: { customNote?: string },
    signal: AbortSignal
  ): Promise<string> {
    if (!this.integrationEngine) {
      throw new Error('Integration engine is not available.');
    }

    const record = this.integrationEngine.store.getIntegration(integrationId);
    if (!record || record.formId !== wf.formId || record.ownerId !== wf.ownerId) {
      throw new Error('Selected integration was not found or is not owned by this form creator.');
    }
    if (record.status === 'disconnected') {
      throw new Error(`Integration "${record.name}" is disconnected.`);
    }

    const provider = this.integrationEngine.registry.get(record.providerId);
    if (!provider) {
      throw new Error(`Provider "${record.providerId}" is not registered.`);
    }

    const deliveryId = `dlv_wf_${crypto.randomBytes(6).toString('hex')}`;
    const payload = buildSanitizedEventPayload(
      {
        formId: event.formId,
        formTitle: event.formTitle,
        formSlug: event.formSlug,
        submissionId: event.submissionId,
        submittedAt: event.submittedAt,
        durationSeconds: event.durationSeconds,
        answers: extra.customNote
          ? { ...event.answers, workflow_note: extra.customNote }
          : event.answers,
        fieldCatalog: event.fieldCatalog || [],
        score: event.score,
        maxScore: event.maxScore,
        scorePercent: event.scorePercent,
        categoryScores: event.categoryScores,
        outcomeId: event.outcomeId,
        outcomeName: event.outcomeName,
        deviceInfo: event.deviceInfo,
        isComplete: event.isComplete,
      },
      {
        includedFieldIds: record.includedFieldIds,
        includeMetadata: record.includeMetadata,
        includeScoreAndOutcome: record.includeScoreAndOutcome,
      },
      meta.mode === 'test' ? 'webhook.test' : 'form.submitted',
      `evt_wf_${crypto.randomBytes(4).toString('hex')}`,
      deliveryId
    );

    const built = provider.buildRequest({
      integrationId: record.id,
      integrationName: record.name,
      endpointUrl: record.endpointUrl,
      httpMethod: record.httpMethod,
      authHeaderName: record.authHeaderName,
      authSecret: record.authSecret,
      signingSecret: record.signingSecret,
      recipientEmail: record.recipientEmail,
      eventType: meta.mode === 'test' ? 'webhook.test' : 'form.submitted',
      deliveryId,
      idempotencyKey: `${meta.idempotencyKey}:${record.id}`,
      payload,
    });

    if (signal.aborted) throw new Error('Execution cancelled.');

    const res = await safeFetchWithRedirectValidation(
      built.url,
      {
        method: built.method,
        headers: built.headers,
        body: built.body,
      },
      {
        ...built.securityOptions,
        timeoutMs: Math.min(record.timeoutMs, PLATFORM_SAFETY_LIMITS.maxActionTimeoutMs),
        fetchImpl: this.fetchImpl,
        dnsLookup: this.dnsLookup,
        allowUnsafeLoopbackForTests: this.allowUnsafeLoopbackForTests,
      }
    );

    const evalRes = provider.evaluateResponse(res.status, res.responseSnippet);
    if (!evalRes.ok) {
      throw new Error(evalRes.errorMessage || `Provider returned HTTP ${res.status}.`);
    }

    return `Delivered via ${record.name} (HTTP ${res.status} in ${res.durationMs}ms).`;
  }

  private scheduleAsyncJob(task: () => Promise<void>): void {
    const wrapped = (async () => {
      try {
        await task();
      } catch {
        // Isolated: background workflow execution never crashes the server
      }
    })();
    this.activeJobs.add(wrapped);
    wrapped.finally(() => {
      this.activeJobs.delete(wrapped);
    });
  }

  private delayWithAbort(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        this.scheduledTimers.delete(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        this.scheduledTimers.delete(timer);
        resolve();
      }, ms);
      this.scheduledTimers.add(timer);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  async waitForIdle(timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this.activeJobs.size > 0 && Date.now() < deadline) {
      await Promise.all(Array.from(this.activeJobs));
    }
  }

  dispose(): void {
    for (const controller of this.activeRunControllers.values()) {
      controller.abort('Engine shutting down');
    }
    this.activeRunControllers.clear();
    for (const timer of this.scheduledTimers) {
      clearTimeout(timer);
    }
    this.scheduledTimers.clear();
  }
}

export function createWorkflowEngine(
  options?: WorkflowEngineOptions
): WorkflowExecutionEngine {
  return new WorkflowExecutionEngine(options);
}
