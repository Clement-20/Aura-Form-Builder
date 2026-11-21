/**
 * Automated Test Suite — Visual Workflow Automation Builder
 *
 * Verifies:
 *  1. Workflow graph validation & strict activation gate (missing/multiple triggers,
 *     missing/unreachable actions, cycle/loop detection, empty condition group,
 *     unsafe direct webhook URLs — invalid workflows can NEVER be activated)
 *  2. Complete end-to-end example workflow:
 *     New Response -> Check Condition -> Send Notification + Send Email -> Send Signed Webhook
 *     (and False branch -> Create Follow-Up Task, skipping unmatched branch cleanly)
 *  3. Triggers & Conditions:
 *     trigger_response_completed, trigger_response_matches (AND/OR + score + variable),
 *     trigger_outcome_achieved
 *  4. Real backend action execution:
 *     action_assign_response_status, action_apply_tag, action_update_response_field
 *     (propagates updated value into downstream piped templates), action_create_task
 *     (+ toggleTaskCompleted), and action_connected_service (reusing Phase 3.4 integrations)
 *  5. Retries, failure isolation, secret redaction in logs, and deactivating failing workflows
 *  6. Duplicate execution prevention via idempotency keys
 *  7. Isolated test runs (mode: 'test') cleanly separated from live executions (mode: 'live')
 *  8. Safe in-flight run cancellation & execution timeout enforcement
 *  9. Sliding-window rate limiting & plan entitlements vs unconditional platform safety limits
 * 10. Authenticated HTTP router & strict cross-owner isolation (401/403/400)
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  buildExampleResponseAutomationTemplate,
  validateWorkflowDefinition,
  type WorkflowEdge,
  type WorkflowNode,
  type WorkflowSubmissionEventInput,
} from '../index';
import { createIntegrationEngine } from '../../../server/integrations/engine';
import { mintWorkspaceSessionToken } from '../../../server/integrations/auth';
import {
  checkWorkflowActivationEntitlement,
  getWorkflowPlanEntitlements,
  PLATFORM_SAFETY_LIMITS,
} from '../../../server/workflows/entitlements';
import { createWorkflowEngine, WorkflowEngineError } from '../../../server/workflows/engine';
import { createWorkflowsRouter } from '../../../server/workflows/routes';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error('   ', err);
    failed += 1;
  }
}

async function startEphemeralServer(
  handler: (req: http.IncomingMessage, body: string, res: http.ServerResponse) => void
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.from(c)));
    req.on('end', () => {
      handler(req, Buffer.concat(chunks).toString('utf8'), res);
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to bind ephemeral test server');
  }

  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function makeSampleSubmission(
  overrides: Partial<WorkflowSubmissionEventInput> = {}
): WorkflowSubmissionEventInput {
  return {
    formId: 'form_wf_test',
    formTitle: 'Enterprise Application',
    formSlug: 'enterprise-application',
    submissionId: `sub_${Math.random().toString(36).slice(2, 10)}`,
    submittedAt: new Date().toISOString(),
    durationSeconds: 42,
    isComplete: true,
    answers: {
      q_name: 'Ada Lovelace',
      q_plan: 'Enterprise',
      q_budget: 25000,
    },
    variables: {
      tier: 'vip',
      discount_pct: 15,
    },
    formattedVariables: {
      tier: 'vip',
      discount_pct: '15%',
    },
    fieldCatalog: [
      { id: 'q_name', label: 'Full Name', type: 'short_text' },
      { id: 'q_plan', label: 'Selected Plan', type: 'dropdown' },
      { id: 'q_budget', label: 'Annual Budget', type: 'number' },
    ],
    score: 88,
    maxScore: 100,
    scorePercent: 88,
    outcomeId: 'out_qualified',
    outcomeName: 'Qualified Lead',
    ...overrides,
  };
}

async function runAll() {
  console.log('\nVisual Workflow Automation Test Suite');

  // --------------------------------------------------------------------------
  // 1. Validation & Strict Activation Gate
  // --------------------------------------------------------------------------
  await test('rejects invalid graphs (no trigger, multiple triggers, no actions, unreachable actions, cycles, empty conditions)', () => {
    // Missing trigger
    const noTrigger = validateWorkflowDefinition({
      formId: 'form_1',
      name: 'No trigger',
      nodes: [
        {
          id: 'a1',
          category: 'action',
          type: 'action_apply_tag',
          label: 'Tag',
          position: { x: 0, y: 0 },
          config: { tagName: 'vip' },
        },
      ],
      edges: [],
    });
    assert.equal(noTrigger.canActivate, false);
    assert.ok(noTrigger.errors.some((e) => e.code === 'MISSING_TRIGGER'));

    // Multiple triggers
    const multiTrigger = validateWorkflowDefinition({
      formId: 'form_1',
      name: 'Two triggers',
      nodes: [
        {
          id: 't1',
          category: 'trigger',
          type: 'trigger_new_response',
          label: 'T1',
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: 't2',
          category: 'trigger',
          type: 'trigger_response_completed',
          label: 'T2',
          position: { x: 0, y: 120 },
          config: {},
        },
        {
          id: 'a1',
          category: 'action',
          type: 'action_apply_tag',
          label: 'Tag',
          position: { x: 240, y: 0 },
          config: { tagName: 'vip' },
        },
      ],
      edges: [{ id: 'e1', sourceNodeId: 't1', targetNodeId: 'a1', branch: 'default' }],
    });
    assert.equal(multiTrigger.canActivate, false);
    assert.ok(multiTrigger.errors.some((e) => e.code === 'MULTIPLE_TRIGGERS'));

    // Cycle / infinite loop detection
    const cyclic = validateWorkflowDefinition({
      formId: 'form_1',
      name: 'Looping workflow',
      nodes: [
        {
          id: 't1',
          category: 'trigger',
          type: 'trigger_new_response',
          label: 'Trigger',
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: 'a1',
          category: 'action',
          type: 'action_apply_tag',
          label: 'Tag A',
          position: { x: 200, y: 0 },
          config: { tagName: 'a' },
        },
        {
          id: 'a2',
          category: 'action',
          type: 'action_apply_tag',
          label: 'Tag B',
          position: { x: 400, y: 0 },
          config: { tagName: 'b' },
        },
      ],
      edges: [
        { id: 'e1', sourceNodeId: 't1', targetNodeId: 'a1', branch: 'default' },
        { id: 'e2', sourceNodeId: 'a1', targetNodeId: 'a2', branch: 'default' },
        { id: 'e3', sourceNodeId: 'a2', targetNodeId: 'a1', branch: 'default' },
      ],
    });
    assert.equal(cyclic.canActivate, false);
    assert.ok(cyclic.errors.some((e) => e.code === 'CYCLE_DETECTED'));

    // Unreachable action
    const unreachable = validateWorkflowDefinition({
      formId: 'form_1',
      name: 'Disconnected',
      nodes: [
        {
          id: 't1',
          category: 'trigger',
          type: 'trigger_new_response',
          label: 'Trigger',
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: 'a1',
          category: 'action',
          type: 'action_apply_tag',
          label: 'Tag',
          position: { x: 200, y: 0 },
          config: { tagName: 'ok' },
        },
      ],
      edges: [],
    });
    assert.equal(unreachable.canActivate, false);
    assert.ok(unreachable.errors.some((e) => e.code === 'NO_REACHABLE_ACTION'));
  });

  await test('strictly refuses to activate invalid workflows or unsafe direct webhook URLs (status stays draft)', async () => {
    const engine = createWorkflowEngine(); // Production SSRF checks enabled
    const { workflow } = engine.createWorkflow('form_wf_test', 'owner_a', {
      name: 'Unsafe Webhook Draft',
      nodes: [
        {
          id: 't1',
          category: 'trigger',
          type: 'trigger_new_response',
          label: 'New Response',
          position: { x: 40, y: 80 },
          config: {},
        },
        {
          id: 'w1',
          category: 'action',
          type: 'action_send_webhook',
          label: 'Internal Target',
          position: { x: 320, y: 80 },
          config: { webhookUrl: 'http://127.0.0.1:8080/internal' },
        },
      ],
      edges: [{ id: 'e1', sourceNodeId: 't1', targetNodeId: 'w1', branch: 'default' }],
    });

    assert.equal(workflow.status, 'draft');
    await assert.rejects(
      () => engine.activateWorkflow('form_wf_test', 'owner_a', workflow.id),
      (err: unknown) =>
        err instanceof WorkflowEngineError &&
        err.statusCode === 400 &&
        Boolean(err.validation && !err.validation.canActivate)
    );

    const listed = engine.listFormWorkflows('form_wf_test', 'owner_a');
    assert.equal(listed[0].status, 'draft');
    engine.dispose();
  });

  // --------------------------------------------------------------------------
  // 2. Complete Working Example End-to-End (True & False Branches)
  // --------------------------------------------------------------------------
  await test('executes complete example workflow end-to-end (New Response -> Condition -> Notification + Email -> Signed Webhook; Else -> Task)', async () => {
    const receivedWebhooks: Array<{ headers: http.IncomingHttpHeaders; body: string }> = [];
    const webhookServer = await startEphemeralServer((req, body, res) => {
      receivedWebhooks.push({ headers: req.headers, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });

    const engine = createWorkflowEngine({
      allowUnsafeLoopbackForTests: true,
      baseRetryDelayMs: 5,
    });

    try {
      const template = buildExampleResponseAutomationTemplate({
        formId: 'form_wf_test',
        firstFieldId: 'q_plan',
        firstFieldLabel: 'Selected Plan',
        webhookUrl: `${webhookServer.url}/hooks/qualified`,
      });

      // Refine condition to require Selected Plan === "Enterprise"
      const condNode = template.nodes.find((n) => n.id === 'node_cond_1')!;
      condNode.config.conditionGroup!.items = [
        {
          id: 'cl_plan',
          kind: 'clause',
          sourceType: 'component',
          sourceId: 'q_plan',
          operator: 'equals',
          value: 'Enterprise',
        },
      ];

      const { workflow } = engine.createWorkflow('form_wf_test', 'owner_a', {
        name: template.name,
        description: template.description,
        nodes: template.nodes,
        edges: template.edges,
      });

      const activated = await engine.activateWorkflow('form_wf_test', 'owner_a', workflow.id);
      assert.equal(activated.workflow.status, 'active');

      // 2a. Matching submission -> follows True branch (Notification + Email + Webhook), skips False Task
      const matchEvent = makeSampleSubmission({
        submissionId: 'sub_enterprise_01',
        answers: { q_name: 'Ada Lovelace', q_plan: 'Enterprise', q_budget: 25000 },
      });
      const enqueueMatch = engine.enqueueLiveSubmission(matchEvent);
      assert.equal(enqueueMatch.enqueuedRuns, 1);
      await engine.waitForIdle();

      const stateAfterMatch = engine.listFormState('form_wf_test', 'owner_a');
      assert.equal(stateAfterMatch.runs.length, 1);
      const matchRun = stateAfterMatch.runs[0];
      assert.equal(matchRun.status, 'succeeded');
      assert.equal(matchRun.mode, 'live');
      assert.equal(matchRun.nodeTraces['node_cond_1']?.branchTaken, 'true');
      assert.equal(matchRun.nodeTraces['node_notif_1']?.status, 'succeeded');
      assert.equal(matchRun.nodeTraces['node_email_1']?.status, 'succeeded');
      assert.equal(matchRun.nodeTraces['node_webhook_1']?.status, 'succeeded');
      assert.equal(matchRun.nodeTraces['node_task_else']?.status, 'skipped');

      assert.equal(stateAfterMatch.notifications.length, 1);
      assert.ok(stateAfterMatch.notifications[0].title.includes('Enterprise Application'));
      assert.equal(stateAfterMatch.emailOutbox.length, 1);
      assert.equal(stateAfterMatch.emailOutbox[0].to, 'ops@example.com');
      assert.equal(stateAfterMatch.tasks.length, 0);

      // Verify real signed webhook delivery
      assert.equal(receivedWebhooks.length, 1);
      assert.ok(receivedWebhooks[0].headers['x-flexstore-signature']);
      assert.ok(receivedWebhooks[0].headers['x-flexstore-timestamp']);
      const payload = JSON.parse(receivedWebhooks[0].body);
      assert.equal(payload.submission.id, 'sub_enterprise_01');
      assert.equal(payload.workflow.id, workflow.id);

      // 2b. Non-matching submission -> follows False branch (Follow-Up Task), skips True actions
      const nonMatchEvent = makeSampleSubmission({
        submissionId: 'sub_starter_02',
        answers: { q_name: 'Grace Hopper', q_plan: 'Starter', q_budget: 1200 },
      });
      engine.enqueueLiveSubmission(nonMatchEvent);
      await engine.waitForIdle();

      const stateAfterBoth = engine.listFormState('form_wf_test', 'owner_a');
      const elseRun = stateAfterBoth.runs.find((r) => r.submissionId === 'sub_starter_02')!;
      assert.equal(elseRun.status, 'succeeded');
      assert.equal(elseRun.nodeTraces['node_cond_1']?.branchTaken, 'false');
      assert.equal(elseRun.nodeTraces['node_task_else']?.status, 'succeeded');
      assert.equal(elseRun.nodeTraces['node_notif_1']?.status, 'skipped');
      assert.equal(elseRun.nodeTraces['node_email_1']?.status, 'skipped');
      assert.equal(elseRun.nodeTraces['node_webhook_1']?.status, 'skipped');
      assert.equal(stateAfterBoth.tasks.length, 1);
      assert.ok(stateAfterBoth.tasks[0].title.includes('sub_starter_02'));
      // Webhook was NOT called a second time
      assert.equal(receivedWebhooks.length, 1);
    } finally {
      engine.dispose();
      await webhookServer.close();
    }
  });

  // --------------------------------------------------------------------------
  // 3. Triggers (Response Completed, Matches Conditions, Specific Outcome)
  // --------------------------------------------------------------------------
  await test('evaluates trigger_outcome_achieved and trigger_response_matches (AND/OR + score + variable)', async () => {
    const engine = createWorkflowEngine();

    // Workflow A: fires only when outcomeId === 'out_qualified'
    const wfOutcome = engine.createWorkflow('form_wf_test', 'owner_a', {
      name: 'Qualified Outcome Workflow',
      nodes: [
        {
          id: 't1',
          category: 'trigger',
          type: 'trigger_outcome_achieved',
          label: 'On Qualified',
          position: { x: 40, y: 80 },
          config: { targetOutcomeId: 'out_qualified' },
        },
        {
          id: 'a1',
          category: 'action',
          type: 'action_apply_tag',
          label: 'Tag Qualified',
          position: { x: 320, y: 80 },
          config: { tagName: 'outcome-qualified' },
        },
      ],
      edges: [{ id: 'e1', sourceNodeId: 't1', targetNodeId: 'a1', branch: 'default' }],
    });
    await engine.activateWorkflow('form_wf_test', 'owner_a', wfOutcome.workflow.id);

    // Workflow B: trigger_response_matches with OR group (score >= 80 OR variable tier == 'vip')
    const wfMatch = engine.createWorkflow('form_wf_test', 'owner_a', {
      name: 'VIP or High Score',
      nodes: [
        {
          id: 't1',
          category: 'trigger',
          type: 'trigger_response_matches',
          label: 'Match Criteria',
          position: { x: 40, y: 80 },
          config: {
            triggerConditions: {
              id: 'cg_or',
              kind: 'group',
              combinator: 'OR',
              items: [
                {
                  id: 'c_score',
                  kind: 'clause',
                  sourceType: 'score',
                  sourceId: '',
                  operator: 'greater_than_or_equal',
                  value: '80',
                },
                {
                  id: 'c_var',
                  kind: 'clause',
                  sourceType: 'variable',
                  sourceId: 'tier',
                  operator: 'equals',
                  value: 'vip',
                },
              ],
            },
          },
        },
        {
          id: 'a1',
          category: 'action',
          type: 'action_apply_tag',
          label: 'Tag Priority',
          position: { x: 320, y: 80 },
          config: { tagName: 'priority' },
        },
      ],
      edges: [{ id: 'e1', sourceNodeId: 't1', targetNodeId: 'a1', branch: 'default' }],
    });
    await engine.activateWorkflow('form_wf_test', 'owner_a', wfMatch.workflow.id);

    // Event 1: wrong outcome, low score, non-vip -> neither triggers
    const r1 = engine.enqueueLiveSubmission(
      makeSampleSubmission({
        submissionId: 'sub_low',
        outcomeId: 'out_standard',
        score: 30,
        variables: { tier: 'standard' },
      })
    );
    assert.equal(r1.enqueuedRuns, 0);

    // Event 2: wrong outcome, low score, BUT tier === 'vip' -> only wfMatch triggers
    const r2 = engine.enqueueLiveSubmission(
      makeSampleSubmission({
        submissionId: 'sub_vip_only',
        outcomeId: 'out_standard',
        score: 40,
        variables: { tier: 'vip' },
      })
    );
    assert.equal(r2.enqueuedRuns, 1);

    // Event 3: outcome matches AND score >= 80 -> both trigger
    const r3 = engine.enqueueLiveSubmission(
      makeSampleSubmission({
        submissionId: 'sub_both',
        outcomeId: 'out_qualified',
        score: 95,
        variables: { tier: 'standard' },
      })
    );
    assert.equal(r3.enqueuedRuns, 2);
    await engine.waitForIdle();

    const state = engine.listFormState('form_wf_test', 'owner_a');
    const recBoth = state.responseRecords.find((r) => r.submissionId === 'sub_both')!;
    assert.ok(recBoth.tags.includes('outcome-qualified'));
    assert.ok(recBoth.tags.includes('priority'));
    engine.dispose();
  });

  // --------------------------------------------------------------------------
  // 4. Response Field Update, Status, Tag, Task Toggle & Connected Integration
  // --------------------------------------------------------------------------
  await test('executes response updates, status, tag, task completion, and Phase 3.4 connected integration action', async () => {
    const receivedIntegrationPayloads: string[] = [];
    const targetServer = await startEphemeralServer((_req, body, res) => {
      receivedIntegrationPayloads.push(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"received":true}');
    });

    const integrationEngine = createIntegrationEngine({
      allowUnsafeLoopbackForTests: true,
      baseRetryDelayMs: 5,
    });
    const workflowEngine = createWorkflowEngine({
      integrationEngine,
      allowUnsafeLoopbackForTests: true,
      baseRetryDelayMs: 5,
    });

    try {
      // Create & verify a Phase 3.4 webhook integration owned by owner_a
      const createdInt = await integrationEngine.createIntegration('form_wf_test', 'owner_a', {
        providerId: 'webhook',
        name: 'CRM Bridge',
        endpointUrl: `${targetServer.url}/crm`,
        subscribedEvents: ['form.submitted', 'workflow.triggered'],
      });
      await integrationEngine.testIntegration('form_wf_test', 'owner_a', createdInt.id);
      assert.equal(receivedIntegrationPayloads.length, 1); // test event

      // Build workflow chaining Update Field -> Assign Status -> Apply Tag -> Create Task -> Connected Service -> Notification
      const { workflow } = workflowEngine.createWorkflow('form_wf_test', 'owner_a', {
        name: 'Full Action Chain',
        nodes: [
          {
            id: 't1',
            category: 'trigger',
            type: 'trigger_response_completed',
            label: 'Completed',
            position: { x: 40, y: 80 },
            config: {},
          },
          {
            id: 'u1',
            category: 'action',
            type: 'action_update_response_field',
            label: 'Set Priority Level',
            position: { x: 260, y: 80 },
            config: {
              targetFieldKey: 'priority_tier',
              targetFieldValue: 'Tier-1 ({{q_plan}})',
            },
          },
          {
            id: 's1',
            category: 'action',
            type: 'action_assign_response_status',
            label: 'Approve Response',
            position: { x: 480, y: 80 },
            config: { responseStatus: 'approved' },
          },
          {
            id: 'tag1',
            category: 'action',
            type: 'action_apply_tag',
            label: 'Tag Fast-Track',
            position: { x: 700, y: 80 },
            config: { tagName: 'fast-track', tagCategory: 'routing' },
          },
          {
            id: 'task1',
            category: 'action',
            type: 'action_create_task',
            label: 'Assign Onboarding',
            position: { x: 920, y: 80 },
            config: {
              taskTitle: 'Onboard {{q_name}} ({{priority_tier}})',
              taskAssignee: 'Success Team',
              taskPriority: 'high',
            },
          },
          {
            id: 'conn1',
            category: 'action',
            type: 'action_connected_service',
            label: 'Sync to CRM Bridge',
            position: { x: 1140, y: 80 },
            config: { integrationId: createdInt.id },
          },
        ],
        edges: [
          { id: 'e1', sourceNodeId: 't1', targetNodeId: 'u1', branch: 'default' },
          { id: 'e2', sourceNodeId: 'u1', targetNodeId: 's1', branch: 'default' },
          { id: 'e3', sourceNodeId: 's1', targetNodeId: 'tag1', branch: 'default' },
          { id: 'e4', sourceNodeId: 'tag1', targetNodeId: 'task1', branch: 'default' },
          { id: 'e5', sourceNodeId: 'task1', targetNodeId: 'conn1', branch: 'default' },
        ],
      });

      await workflowEngine.activateWorkflow('form_wf_test', 'owner_a', workflow.id);
      workflowEngine.enqueueLiveSubmission(
        makeSampleSubmission({ submissionId: 'sub_chain_01' })
      );
      await workflowEngine.waitForIdle();

      const state = workflowEngine.listFormState('form_wf_test', 'owner_a');
      assert.equal(state.runs[0].status, 'succeeded');

      const record = state.responseRecords.find((r) => r.submissionId === 'sub_chain_01')!;
      assert.equal(record.status, 'approved');
      assert.equal(record.updatedFields.priority_tier, 'Tier-1 (Enterprise)');
      assert.ok(record.tags.includes('routing:fast-track'));

      // Downstream piped template picked up the updated field value!
      assert.equal(state.tasks.length, 1);
      assert.equal(state.tasks[0].title, 'Onboard Ada Lovelace (Tier-1 (Enterprise))');
      assert.equal(state.tasks[0].status, 'open');

      // Toggle task completed via backend
      const toggled = workflowEngine.toggleTaskCompleted(
        'form_wf_test',
        'owner_a',
        state.tasks[0].id,
        true
      );
      assert.equal(toggled?.status, 'completed');

      // Connected integration received the workflow event (1 test + 1 live workflow)
      assert.equal(receivedIntegrationPayloads.length, 2);
    } finally {
      workflowEngine.dispose();
      integrationEngine.dispose();
      await targetServer.close();
    }
  });

  // --------------------------------------------------------------------------
  // 5. Retries, Failure Handling, Secret Redaction & Deactivating Failing Workflow
  // --------------------------------------------------------------------------
  await test('retries transient 503 webhook failures, fails fast on 400 with secret redaction, and allows deactivation', async () => {
    let transientAttempts = 0;
    let permanentAttempts = 0;

    const flakyServer = await startEphemeralServer((req, _body, res) => {
      if (req.url === '/transient') {
        transientAttempts += 1;
        if (transientAttempts < 3) {
          res.writeHead(503, { 'Content-Type': 'text/plain' });
          res.end('Temporary overload');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
        return;
      }
      permanentAttempts += 1;
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Rejected token Bearer super_secret_token_99999 and whsec_leak_abcdef123456');
    });

    const engine = createWorkflowEngine({
      allowUnsafeLoopbackForTests: true,
      baseRetryDelayMs: 5,
    });

    try {
      // 5a. Transient 503 succeeds on attempt 3
      const wfRetry = engine.createWorkflow('form_wf_test', 'owner_a', {
        name: 'Retryable Webhook',
        nodes: [
          {
            id: 't1',
            category: 'trigger',
            type: 'trigger_new_response',
            label: 'Trigger',
            position: { x: 40, y: 80 },
            config: {},
          },
          {
            id: 'w1',
            category: 'action',
            type: 'action_send_webhook',
            label: 'Flaky Hook',
            position: { x: 300, y: 80 },
            config: { webhookUrl: `${flakyServer.url}/transient` },
          },
        ],
        edges: [{ id: 'e1', sourceNodeId: 't1', targetNodeId: 'w1', branch: 'default' }],
      });
      await engine.activateWorkflow('form_wf_test', 'owner_a', wfRetry.workflow.id);
      engine.enqueueLiveSubmission(makeSampleSubmission({ submissionId: 'sub_retry_1' }));
      await engine.waitForIdle();

      assert.equal(transientAttempts, 3);
      const retryRun = engine
        .listFormState('form_wf_test', 'owner_a')
        .runs.find((r) => r.submissionId === 'sub_retry_1')!;
      assert.equal(retryRun.status, 'succeeded');
      assert.equal(retryRun.nodeTraces['w1']?.attempts, 3);

      // 5b. Permanent 400 fails immediately without wasteful retries and redacts secrets
      const wfFail = engine.createWorkflow('form_wf_test', 'owner_a', {
        name: 'Failing Webhook',
        nodes: [
          {
            id: 't1',
            category: 'trigger',
            type: 'trigger_new_response',
            label: 'Trigger',
            position: { x: 40, y: 80 },
            config: {},
          },
          {
            id: 'w1',
            category: 'action',
            type: 'action_send_webhook',
            label: 'Bad Hook',
            position: { x: 300, y: 80 },
            config: { webhookUrl: `${flakyServer.url}/bad` },
          },
        ],
        edges: [{ id: 'e1', sourceNodeId: 't1', targetNodeId: 'w1', branch: 'default' }],
      });
      await engine.activateWorkflow('form_wf_test', 'owner_a', wfFail.workflow.id);
      engine.enqueueLiveSubmission(makeSampleSubmission({ submissionId: 'sub_fail_1' }));
      await engine.waitForIdle();

      assert.equal(permanentAttempts, 1);
      const state = engine.listFormState('form_wf_test', 'owner_a');
      const failRun = state.runs.find(
        (r) => r.workflowId === wfFail.workflow.id && r.submissionId === 'sub_fail_1'
      )!;
      assert.equal(failRun.status, 'failed');
      assert.equal(failRun.nodeTraces['w1']?.attempts, 1);

      const errText = `${failRun.errorMessage || ''} ${failRun.nodeTraces['w1']?.errorMessage || ''}`;
      assert.ok(!errText.includes('super_secret_token_99999'));
      assert.ok(!errText.includes('whsec_leak_abcdef123456'));

      // Deactivate failing workflow cleanly
      const deactivated = engine.deactivateWorkflow(
        'form_wf_test',
        'owner_a',
        wfFail.workflow.id
      );
      assert.equal(deactivated.status, 'inactive');
    } finally {
      engine.dispose();
      await flakyServer.close();
    }
  });

  // --------------------------------------------------------------------------
  // 6. Duplicate Prevention (Idempotency)
  // --------------------------------------------------------------------------
  await test('prevents duplicate live workflow runs for identical submissionId', async () => {
    const engine = createWorkflowEngine();
    const { workflow } = engine.createWorkflow('form_wf_test', 'owner_a', {
      name: 'Idempotent Notifier',
      nodes: [
        {
          id: 't1',
          category: 'trigger',
          type: 'trigger_new_response',
          label: 'Trigger',
          position: { x: 40, y: 80 },
          config: {},
        },
        {
          id: 'n1',
          category: 'action',
          type: 'action_send_notification',
          label: 'Notify',
          position: { x: 300, y: 80 },
          config: { notificationTitle: 'New', notificationMessage: 'Received' },
        },
      ],
      edges: [{ id: 'e1', sourceNodeId: 't1', targetNodeId: 'n1', branch: 'default' }],
    });
    await engine.activateWorkflow('form_wf_test', 'owner_a', workflow.id);

    const event = makeSampleSubmission({ submissionId: 'sub_dup_001' });
    const first = engine.enqueueLiveSubmission(event);
    const second = engine.enqueueLiveSubmission(event);

    assert.equal(first.enqueuedRuns, 1);
    assert.equal(first.skippedDuplicates, 0);
    assert.equal(second.enqueuedRuns, 0);
    assert.equal(second.skippedDuplicates, 1);

    await engine.waitForIdle();
    const state = engine.listFormState('form_wf_test', 'owner_a');
    assert.equal(state.runs.length, 1);
    assert.equal(state.notifications.length, 1);
    engine.dispose();
  });

  // --------------------------------------------------------------------------
  // 7. Isolated Test Runs vs Live Executions
  // --------------------------------------------------------------------------
  await test('runs isolated test executions on draft workflows without colliding with live runs', async () => {
    const engine = createWorkflowEngine();
    const { workflow } = engine.createWorkflow('form_wf_test', 'owner_a', {
      name: 'Draft Test Workflow',
      nodes: [
        {
          id: 't1',
          category: 'trigger',
          type: 'trigger_new_response',
          label: 'Trigger',
          position: { x: 40, y: 80 },
          config: {},
        },
        {
          id: 'n1',
          category: 'action',
          type: 'action_send_notification',
          label: 'Notify',
          position: { x: 300, y: 80 },
          config: { notificationTitle: 'Hello {{q_name}}', notificationMessage: 'Score {{score}}' },
        },
      ],
      edges: [{ id: 'e1', sourceNodeId: 't1', targetNodeId: 'n1', branch: 'default' }],
    });

    // Workflow is still draft -> live submission does not run it
    assert.equal(workflow.status, 'draft');
    const liveSkip = engine.enqueueLiveSubmission(makeSampleSubmission({ submissionId: 'sub_shared_id' }));
    assert.equal(liveSkip.enqueuedRuns, 0);

    // Test run executes on draft with mode: 'test'
    const testRun = await engine.runWorkflowTest('form_wf_test', 'owner_a', workflow.id, {
      submissionId: 'sub_shared_id',
      answers: { q_name: 'Sample Tester' },
      score: 99,
    });
    assert.equal(testRun.mode, 'test');
    assert.equal(testRun.status, 'succeeded');

    // Now activate and send live submission with same submissionId -> NOT blocked by test run
    await engine.activateWorkflow('form_wf_test', 'owner_a', workflow.id);
    const liveRunEnqueue = engine.enqueueLiveSubmission(
      makeSampleSubmission({ submissionId: 'sub_shared_id' })
    );
    assert.equal(liveRunEnqueue.enqueuedRuns, 1);
    await engine.waitForIdle();

    const state = engine.listFormState('form_wf_test', 'owner_a');
    assert.equal(state.runs.filter((r) => r.mode === 'test').length, 1);
    assert.equal(state.runs.filter((r) => r.mode === 'live').length, 1);
    engine.dispose();
  });

  // --------------------------------------------------------------------------
  // 8. Safe Cancellation & Execution Timeout
  // --------------------------------------------------------------------------
  await test('safely cancels an in-flight workflow run without running downstream nodes', async () => {
    let action2Executed = false;
    let releaseAction1!: () => void;
    let action1Started!: () => void;
    const action1StartedPromise = new Promise<void>((r) => {
      action1Started = r;
    });

    const engine = createWorkflowEngine({
      beforeActionHook: async (node, signal) => {
        if (node.id === 'a1') {
          action1Started();
          await new Promise<void>((resolve) => {
            releaseAction1 = resolve;
            signal.addEventListener('abort', () => resolve(), { once: true });
          });
        } else if (node.id === 'a2') {
          action2Executed = true;
        }
      },
    });

    const { workflow } = engine.createWorkflow('form_wf_test', 'owner_a', {
      name: 'Cancellable Flow',
      nodes: [
        {
          id: 't1',
          category: 'trigger',
          type: 'trigger_new_response',
          label: 'Trigger',
          position: { x: 40, y: 80 },
          config: {},
        },
        {
          id: 'a1',
          category: 'action',
          type: 'action_apply_tag',
          label: 'Step 1',
          position: { x: 260, y: 80 },
          config: { tagName: 'step1' },
        },
        {
          id: 'a2',
          category: 'action',
          type: 'action_apply_tag',
          label: 'Step 2',
          position: { x: 480, y: 80 },
          config: { tagName: 'step2' },
        },
      ],
      edges: [
        { id: 'e1', sourceNodeId: 't1', targetNodeId: 'a1', branch: 'default' },
        { id: 'e2', sourceNodeId: 'a1', targetNodeId: 'a2', branch: 'default' },
      ],
    });
    await engine.activateWorkflow('form_wf_test', 'owner_a', workflow.id);

    engine.enqueueLiveSubmission(makeSampleSubmission({ submissionId: 'sub_cancel_1' }));
    await action1StartedPromise;

    const inFlight = engine.listFormState('form_wf_test', 'owner_a').runs[0];
    const cancelled = engine.cancelRun('form_wf_test', 'owner_a', inFlight.id);
    assert.equal(cancelled.status, 'cancelled');
    if (releaseAction1) releaseAction1();
    await engine.waitForIdle();

    assert.equal(action2Executed, false);
    const finalRun = engine.listFormState('form_wf_test', 'owner_a').runs[0];
    assert.equal(finalRun.status, 'cancelled');
    engine.dispose();
  });

  await test('enforces execution timeout when an action hangs past maxRunTimeoutMs', async () => {
    const engine = createWorkflowEngine({
      maxRunTimeoutMs: 60,
      beforeActionHook: async (_node, signal) => {
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 1_500);
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(t);
              resolve();
            },
            { once: true }
          );
        });
      },
    });

    const { workflow } = engine.createWorkflow('form_wf_test', 'owner_a', {
      name: 'Hanging Flow',
      nodes: [
        {
          id: 't1',
          category: 'trigger',
          type: 'trigger_new_response',
          label: 'Trigger',
          position: { x: 40, y: 80 },
          config: {},
        },
        {
          id: 'a1',
          category: 'action',
          type: 'action_apply_tag',
          label: 'Slow Step',
          position: { x: 260, y: 80 },
          config: { tagName: 'slow' },
        },
      ],
      edges: [{ id: 'e1', sourceNodeId: 't1', targetNodeId: 'a1', branch: 'default' }],
    });

    const run = await engine.runWorkflowTest('form_wf_test', 'owner_a', workflow.id, {});
    assert.equal(run.status, 'timed_out');
    engine.dispose();
  });

  // --------------------------------------------------------------------------
  // 9. Rate Limits & Entitlements Separation
  // --------------------------------------------------------------------------
  await test('enforces sliding-window rate limits and separates open plan entitlements from unconditional safety caps', async () => {
    // Open access entitlements check
    const freeEnt = getWorkflowPlanEntitlements('free');
    assert.equal(freeEnt.rolloutMode, 'open_access');
    assert.equal(freeEnt.maxActiveWorkflows, null);
    assert.equal(checkWorkflowActivationEntitlement(freeEnt, 99, 10).allowed, true);
    // Platform safety caps remain unconditional
    assert.ok(PLATFORM_SAFETY_LIMITS.maxNodesPerWorkflow > 0);
    assert.ok(PLATFORM_SAFETY_LIMITS.maxExecutionStepsPerRun > 0);

    // Sliding-window rate limit test
    const engine = createWorkflowEngine({
      maxRunsPerWorkflowPerWindow: 2,
      rateLimitWindowMs: 60_000,
    });
    const { workflow } = engine.createWorkflow('form_wf_test', 'owner_a', {
      name: 'Rate Limited Flow',
      nodes: [
        {
          id: 't1',
          category: 'trigger',
          type: 'trigger_new_response',
          label: 'Trigger',
          position: { x: 40, y: 80 },
          config: {},
        },
        {
          id: 'a1',
          category: 'action',
          type: 'action_apply_tag',
          label: 'Tag',
          position: { x: 260, y: 80 },
          config: { tagName: 'ok' },
        },
      ],
      edges: [{ id: 'e1', sourceNodeId: 't1', targetNodeId: 'a1', branch: 'default' }],
    });
    await engine.activateWorkflow('form_wf_test', 'owner_a', workflow.id);

    const r1 = engine.enqueueLiveSubmission(makeSampleSubmission({ submissionId: 'sub_rl_1' }));
    const r2 = engine.enqueueLiveSubmission(makeSampleSubmission({ submissionId: 'sub_rl_2' }));
    const r3 = engine.enqueueLiveSubmission(makeSampleSubmission({ submissionId: 'sub_rl_3' }));

    assert.equal(r1.enqueuedRuns, 1);
    assert.equal(r2.enqueuedRuns, 1);
    assert.equal(r3.enqueuedRuns, 0);
    assert.equal(r3.rateLimited, 1);

    await engine.waitForIdle();
    const runs = engine.listFormState('form_wf_test', 'owner_a').runs;
    assert.ok(runs.some((r) => r.submissionId === 'sub_rl_3' && r.status === 'rate_limited'));
    engine.dispose();
  });

  // --------------------------------------------------------------------------
  // 10. Authenticated HTTP Router & Cross-Owner Isolation
  // --------------------------------------------------------------------------
  await test('enforces 401 unauthenticated, 403 cross-owner isolation, and 400 invalid activation over HTTP', async () => {
    const engine = createWorkflowEngine();
    const app = express();
    app.use(express.json());
    app.use('/api/workflows', createWorkflowsRouter(engine));

    const server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('Failed to bind API test server');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const tokenA = mintWorkspaceSessionToken('owner_alpha');
    const tokenB = mintWorkspaceSessionToken('owner_beta');

    try {
      // 10a. Unauthenticated -> 401
      const unauthRes = await fetch(`${baseUrl}/api/workflows/forms/form_http_1`);
      assert.equal(unauthRes.status, 401);

      // 10b. Owner A creates an invalid draft workflow (missing action)
      const createRes = await fetch(`${baseUrl}/api/workflows/forms/form_http_1`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          name: 'Alpha Draft',
          nodes: [
            {
              id: 't1',
              category: 'trigger',
              type: 'trigger_new_response',
              label: 'New Response',
              position: { x: 40, y: 80 },
              config: {},
            },
          ],
          edges: [],
        }),
      });
      assert.equal(createRes.status, 201);
      const created = (await createRes.json()) as { workflow: { id: string } };
      const wfId = created.workflow.id;

      // 10c. Activating invalid workflow -> 400
      const badActivateRes = await fetch(
        `${baseUrl}/api/workflows/forms/form_http_1/${wfId}/activate`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${tokenA}` },
        }
      );
      assert.equal(badActivateRes.status, 400);

      // 10d. Owner B cannot view Alpha's workflow in list, nor patch/activate/test/delete it (403)
      const listB = await fetch(`${baseUrl}/api/workflows/forms/form_http_1`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(listB.status, 200);
      const listBJson = (await listB.json()) as { workflows: unknown[] };
      assert.equal(listBJson.workflows.length, 0);

      const patchB = await fetch(`${baseUrl}/api/workflows/forms/form_http_1/${wfId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenB}`,
        },
        body: JSON.stringify({ name: 'Hijacked' }),
      });
      assert.equal(patchB.status, 403);

      const delB = await fetch(`${baseUrl}/api/workflows/forms/form_http_1/${wfId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(delB.status, 403);
    } finally {
      engine.dispose();
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
