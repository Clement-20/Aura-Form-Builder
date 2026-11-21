/**
 * FlexStore Form Studio — Visual Workflow Automation Shared Contract
 *
 * Pure TypeScript types shared between the visual node-graph editor,
 * static validator, Phase 2-backed condition evaluator, and server execution engine.
 *
 * SECURITY INVARIANT:
 *   No raw secrets or OAuth tokens are stored inside workflow node configs.
 *   Webhook/service nodes reference server-managed Phase 3.4 integrations by ID
 *   or public HTTPS URLs validated strictly on the server.
 */

import type { LogicConditionGroup, LogicOperator } from '../logic/types';
import type { PlanTier } from '../../types/form';

export const WORKFLOW_SCHEMA_VERSION = 1;

export type WorkflowStatus = 'draft' | 'active' | 'inactive';

export type WorkflowNodeCategory = 'trigger' | 'condition' | 'action';

export type WorkflowTriggerType =
  | 'trigger_new_response'
  | 'trigger_response_completed'
  | 'trigger_response_matches'
  | 'trigger_outcome_achieved';

export type WorkflowConditionNodeType = 'condition_branch';

export type WorkflowActionType =
  | 'action_send_email'
  | 'action_send_notification'
  | 'action_update_response_field'
  | 'action_assign_response_status'
  | 'action_apply_tag'
  | 'action_create_task'
  | 'action_send_webhook'
  | 'action_connected_service';

export type WorkflowNodeType =
  | WorkflowTriggerType
  | WorkflowConditionNodeType
  | WorkflowActionType;

export type WorkflowEdgeBranch = 'default' | 'true' | 'false';

/**
 * Extended condition clause for workflows that reuses Phase 2 operators while
 * also supporting score thresholds and outcome matching directly.
 */
export type WorkflowConditionSourceType =
  | 'component'
  | 'variable'
  | 'score'
  | 'score_percent'
  | 'outcome';

export interface WorkflowConditionClause {
  id: string;
  kind: 'clause';
  sourceType: WorkflowConditionSourceType;
  /** Field ID, variable name/ID, or empty for score/outcome */
  sourceId: string;
  operator: LogicOperator;
  value: string;
  secondaryValue?: string;
}

export interface WorkflowConditionGroup {
  id: string;
  kind: 'group';
  combinator: 'AND' | 'OR';
  items: Array<WorkflowConditionClause | WorkflowConditionGroup>;
}

/**
 * Node configuration union — strongly typed per category while remaining JSON-serializable.
 */
export interface WorkflowNodeConfig {
  // Trigger configs
  outcomeId?: string;
  outcomeName?: string;
  triggerConditionGroup?: WorkflowConditionGroup;

  // Condition branch config (supports nested AND/OR groups + Phase 2 operators)
  conditionGroup?: WorkflowConditionGroup;
  legacyConditionGroup?: LogicConditionGroup;

  // Action: Send Email
  emailTo?: string;
  emailSubject?: string;
  emailBody?: string;

  // Action: Send Notification
  notificationTitle?: string;
  notificationMessage?: string;
  notificationSeverity?: 'info' | 'success' | 'warning';
  notificationChannel?: 'workspace' | 'slack_integration';
  slackIntegrationId?: string;

  // Action: Update Response Field
  targetFieldId?: string;
  targetFieldValue?: string;

  // Action: Assign Response Status
  responseStatus?: string;

  // Action: Apply Tag / Category
  tags?: string[];

  // Action: Create Internal Task / Follow-up
  taskTitle?: string;
  taskDescription?: string;
  taskPriority?: 'low' | 'medium' | 'high' | 'urgent';
  taskDueInDays?: number;
  taskAssignee?: string;

  // Action: Send Webhook (either references a Phase 3.4 integration OR a direct HTTPS URL)
  integrationId?: string;
  webhookUrl?: string;
  webhookIncludeFields?: string[];
  webhookCustomNote?: string;
}

export interface WorkflowNode {
  id: string;
  category: WorkflowNodeCategory;
  type: WorkflowNodeType;
  label: string;
  position: { x: number; y: number };
  config: WorkflowNodeConfig;
}

export interface WorkflowEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  branch: WorkflowEdgeBranch;
}

export interface WorkflowDefinition {
  id: string;
  schemaVersion: number;
  formId: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string | null;
  lastError?: string | null;
}

// ============================================================================
// Validation Diagnostics
// ============================================================================

export interface WorkflowValidationIssue {
  id: string;
  severity: 'error' | 'warning';
  code: string;
  nodeId?: string;
  edgeId?: string;
  message: string;
}

export interface WorkflowValidationReport {
  valid: boolean;
  canActivate: boolean;
  errors: WorkflowValidationIssue[];
  warnings: WorkflowValidationIssue[];
}

// ============================================================================
// Execution Runs, Node Traces & Real Backend Artifacts
// ============================================================================

export type WorkflowRunMode = 'live' | 'test';

export type WorkflowRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'rate_limited';

export type WorkflowNodeTraceStatus =
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface WorkflowNodeExecutionTrace {
  nodeId: string;
  nodeLabel: string;
  nodeType: WorkflowNodeType;
  category: WorkflowNodeCategory;
  status: WorkflowNodeTraceStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  attempts: number;
  branchTaken?: WorkflowEdgeBranch;
  conditionSummary?: string;
  outputSummary?: string;
  errorMessage?: string;
}

export interface WorkflowExecutionRun {
  runId: string;
  workflowId: string;
  workflowName: string;
  formId: string;
  mode: WorkflowRunMode;
  status: WorkflowRunStatus;
  triggerEvent: string;
  submissionId: string;
  idempotencyKey: string;
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
  nodeTraces: WorkflowNodeExecutionTrace[];
  errorMessage?: string | null;
  cancelledBy?: string | null;
}

export interface WorkflowResponseRecord {
  submissionId: string;
  formId: string;
  status?: string;
  tags: string[];
  updatedFields: Record<string, unknown>;
  updatedAt: string;
}

export interface WorkflowNotificationRecord {
  id: string;
  formId: string;
  workflowId: string;
  runId: string;
  mode: WorkflowRunMode;
  title: string;
  message: string;
  severity: 'info' | 'success' | 'warning';
  channel: string;
  createdAt: string;
}

export interface WorkflowTaskRecord {
  id: string;
  formId: string;
  workflowId: string;
  runId: string;
  submissionId: string;
  mode: WorkflowRunMode;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueAt?: string | null;
  assignee?: string;
  completed: boolean;
  createdAt: string;
}

export interface WorkflowEmailOutboxRecord {
  id: string;
  formId: string;
  workflowId: string;
  runId: string;
  mode: WorkflowRunMode;
  to: string;
  subject: string;
  body: string;
  deliveryMode: 'live_resend' | 'workspace_outbox';
  createdAt: string;
}

// ============================================================================
// Entitlements (Commercial Plan Ready) & Platform Protection Limits (Separate)
// ============================================================================

export interface WorkflowPlanEntitlements {
  planTier: PlanTier;
  /** Rollout note: currently all capabilities are unlocked across plans. */
  rolloutMode: 'open_access';
  maxActiveWorkflows: number | null; // null = unlimited in current rollout
  maxMonthlyExecutions: number | null;
  maxActionsPerWorkflow: number | null;
  allowedIntegrationProviders: 'all' | string[];
}

export interface WorkflowPlatformSafetyLimits {
  maxNodesPerWorkflow: number;
  maxActionsPerWorkflow: number;
  maxExecutionStepsPerRun: number;
  maxRunTimeoutMs: number;
  maxActionTimeoutMs: number;
  maxRunsPerWorkflowPerMinute: number;
  maxRunsPerFormPerMinute: number;
}

export interface WorkflowSubmissionEventInput {
  formId: string;
  formTitle: string;
  formSlug?: string;
  submissionId: string;
  submittedAt: string;
  durationSeconds?: number;
  isComplete?: boolean;
  answers: Record<string, unknown>;
  variables?: Record<string, unknown>;
  formattedVariables?: Record<string, string>;
  fieldCatalog?: Array<{ id: string; label: string; type?: string }>;
  score?: number;
  maxScore?: number;
  scorePercent?: number;
  categoryScores?: Record<string, unknown>;
  outcomeId?: string;
  outcomeName?: string;
  deviceInfo?: string;
}

export interface WorkflowNodePaletteItem {
  type: WorkflowNodeType;
  category: WorkflowNodeCategory;
  label: string;
  shortLabel: string;
  description: string;
}

export const WORKFLOW_NODE_CATALOG: readonly WorkflowNodePaletteItem[] = [
  // Triggers
  {
    type: 'trigger_new_response',
    category: 'trigger',
    label: 'New Form Response',
    shortLabel: 'New Response',
    description: 'Starts automatically whenever a verified submission is received.',
  },
  {
    type: 'trigger_response_completed',
    category: 'trigger',
    label: 'Response Completed',
    shortLabel: 'Completed',
    description: 'Starts when a respondent finishes a complete submission.',
  },
  {
    type: 'trigger_response_matches',
    category: 'trigger',
    label: 'Response Matches Condition',
    shortLabel: 'Matched Response',
    description: 'Starts only when submitted answers, variables, or score match criteria.',
  },
  {
    type: 'trigger_outcome_achieved',
    category: 'trigger',
    label: 'Specific Outcome Achieved',
    shortLabel: 'Outcome Achieved',
    description: 'Starts when scoring or logic assigns a target personalised outcome.',
  },
  // Conditions
  {
    type: 'condition_branch',
    category: 'condition',
    label: 'Condition Branch (IF / ELSE)',
    shortLabel: 'Condition',
    description: 'Evaluates AND/OR answer, numeric, score, or variable rules and routes True/False branches.',
  },
  // Actions
  {
    type: 'action_send_email',
    category: 'action',
    label: 'Send Email',
    shortLabel: 'Send Email',
    description: 'Sends a templated email via Resend when configured, or records to the email outbox.',
  },
  {
    type: 'action_send_notification',
    category: 'action',
    label: 'Send Notification',
    shortLabel: 'Notification',
    description: 'Creates a workspace alert and optionally posts to a connected Slack integration.',
  },
  {
    type: 'action_assign_response_status',
    category: 'action',
    label: 'Assign Response Status',
    shortLabel: 'Set Status',
    description: 'Assigns a workflow status (e.g., Qualified, In Review, Approved) to the submission.',
  },
  {
    type: 'action_apply_tag',
    category: 'action',
    label: 'Apply Tags / Category',
    shortLabel: 'Apply Tags',
    description: 'Labels the response with one or more structured tags or categories.',
  },
  {
    type: 'action_update_response_field',
    category: 'action',
    label: 'Update Response Field',
    shortLabel: 'Update Field',
    description: 'Updates a supported response field value using static text or piped answers.',
  },
  {
    type: 'action_create_task',
    category: 'action',
    label: 'Create Follow-Up Task',
    shortLabel: 'Create Task',
    description: 'Generates an internal follow-up task with priority, due window, and assignee.',
  },
  {
    type: 'action_send_webhook',
    category: 'action',
    label: 'Send Webhook',
    shortLabel: 'Webhook',
    description: 'Dispatches a signed HTTPS webhook via Phase 3.4 integration security & retries.',
  },
  {
    type: 'action_connected_service',
    category: 'action',
    label: 'Send to Connected Service',
    shortLabel: 'Connected Service',
    description: 'Adds a record or sends formatted data through a connected Phase 3.4 provider.',
  },
] as const;

export function getWorkflowNodeMeta(type: WorkflowNodeType): WorkflowNodePaletteItem {
  return (
    WORKFLOW_NODE_CATALOG.find((item) => item.type === type) || {
      type,
      category: 'action',
      label: type,
      shortLabel: type,
      description: '',
    }
  );
}
