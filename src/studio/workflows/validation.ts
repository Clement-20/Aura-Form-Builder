/**
 * Deterministic Workflow Graph Validator
 *
 * Runs identically in the browser editor (instant feedback) and on the backend
 * (strict activation gate — invalid workflows can NEVER be marked active).
 *
 * Checks:
 *  - Exactly one trigger node
 *  - At least one reachable action node
 *  - Cycle / infinite-loop detection across directed edges (DFS)
 *  - Valid edge references & condition branch wiring
 *  - Required per-node configuration (URLs, emails, condition clauses, titles, tags, status)
 *  - Platform protection limits (max nodes & max actions per workflow)
 */

import type {
  WorkflowConditionGroup,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowValidationIssue,
  WorkflowValidationReport,
} from './types';

export const DEFAULT_MAX_NODES_PER_WORKFLOW = 30;
export const DEFAULT_MAX_ACTIONS_PER_WORKFLOW = 20;

export interface WorkflowValidationContext {
  maxNodes?: number;
  maxActions?: number;
  availableIntegrationIds?: Set<string>;
}

function countConditionClauses(group?: WorkflowConditionGroup): number {
  if (!group || !Array.isArray(group.items)) return 0;
  let total = 0;
  for (const item of group.items) {
    if (item.kind === 'group') {
      total += countConditionClauses(item);
    } else {
      total += 1;
    }
  }
  return total;
}

function validateConditionGroupClauses(
  group: WorkflowConditionGroup | undefined,
  node: WorkflowNode,
  issues: WorkflowValidationIssue[]
): void {
  if (!group || countConditionClauses(group) === 0) {
    issues.push({
      id: `issue_${node.id}_empty_cond`,
      severity: 'error',
      code: 'EMPTY_CONDITION_GROUP',
      nodeId: node.id,
      message: `"${node.label}" requires at least one condition rule.`,
    });
    return;
  }

  const visit = (g: WorkflowConditionGroup) => {
    for (const item of g.items) {
      if (item.kind === 'group') {
        visit(item);
      } else {
        if (
          (item.sourceType === 'component' || item.sourceType === 'variable') &&
          !item.sourceId.trim()
        ) {
          issues.push({
            id: `issue_${node.id}_missing_source_${item.id}`,
            severity: 'error',
            code: 'MISSING_CONDITION_SOURCE',
            nodeId: node.id,
            message: `"${node.label}" has a condition missing a field or variable source.`,
          });
        }
      }
    }
  };
  visit(group);
}

function isPlausibleEmailOrTemplate(val?: string): boolean {
  if (!val || !val.trim()) return false;
  const trimmed = val.trim();
  if (trimmed.includes('{{') && trimmed.includes('}}')) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function isPlausibleHttpsUrl(raw?: string): boolean {
  if (!raw || !raw.trim()) return false;
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateWorkflowDefinition(
  workflow: Pick<WorkflowDefinition, 'name' | 'nodes' | 'edges'>,
  context: WorkflowValidationContext = {}
): WorkflowValidationReport {
  const errors: WorkflowValidationIssue[] = [];
  const warnings: WorkflowValidationIssue[] = [];

  const maxNodes = context.maxNodes ?? DEFAULT_MAX_NODES_PER_WORKFLOW;
  const maxActions = context.maxActions ?? DEFAULT_MAX_ACTIONS_PER_WORKFLOW;

  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const edges = Array.isArray(workflow.edges) ? workflow.edges : [];
  const nodeById = new Map<string, WorkflowNode>();

  for (const node of nodes) {
    if (nodeById.has(node.id)) {
      errors.push({
        id: `dup_node_${node.id}`,
        severity: 'error',
        code: 'DUPLICATE_NODE_ID',
        nodeId: node.id,
        message: `Duplicate node ID "${node.id}".`,
      });
    }
    nodeById.set(node.id, node);
  }

  if (!workflow.name || !workflow.name.trim()) {
    errors.push({
      id: 'missing_workflow_name',
      severity: 'error',
      code: 'MISSING_NAME',
      message: 'Workflow must have a name.',
    });
  }

  // Platform safety bounds
  if (nodes.length > maxNodes) {
    errors.push({
      id: 'max_nodes_exceeded',
      severity: 'error',
      code: 'MAX_NODES_EXCEEDED',
      message: `Workflow exceeds the maximum of ${maxNodes} nodes.`,
    });
  }

  const triggers = nodes.filter((n) => n.category === 'trigger');
  const actions = nodes.filter((n) => n.category === 'action');

  if (actions.length > maxActions) {
    errors.push({
      id: 'max_actions_exceeded',
      severity: 'error',
      code: 'MAX_ACTIONS_EXCEEDED',
      message: `Workflow exceeds the maximum of ${maxActions} actions.`,
    });
  }

  if (triggers.length === 0) {
    errors.push({
      id: 'missing_trigger',
      severity: 'error',
      code: 'MISSING_TRIGGER',
      message: 'Add a Trigger node to start this workflow.',
    });
  } else if (triggers.length > 1) {
    errors.push({
      id: 'multiple_triggers',
      severity: 'error',
      code: 'MULTIPLE_TRIGGERS',
      message: 'A workflow can only have one Trigger node.',
    });
  }

  if (actions.length === 0) {
    errors.push({
      id: 'missing_action',
      severity: 'error',
      code: 'MISSING_ACTION',
      message: 'Add at least one Action node for this workflow to execute.',
    });
  }

  // Validate edges & build adjacency list
  const outgoing = new Map<string, typeof edges>();
  const incomingCount = new Map<string, number>();

  for (const edge of edges) {
    if (!nodeById.has(edge.sourceNodeId) || !nodeById.has(edge.targetNodeId)) {
      errors.push({
        id: `broken_edge_${edge.id}`,
        severity: 'error',
        code: 'BROKEN_EDGE',
        edgeId: edge.id,
        message: 'A connection references a missing node.',
      });
      continue;
    }
    if (edge.sourceNodeId === edge.targetNodeId) {
      errors.push({
        id: `self_loop_${edge.id}`,
        severity: 'error',
        code: 'SELF_LOOP',
        nodeId: edge.sourceNodeId,
        edgeId: edge.id,
        message: 'A node cannot connect to itself.',
      });
      continue;
    }
    const targetNode = nodeById.get(edge.targetNodeId)!;
    if (targetNode.category === 'trigger') {
      errors.push({
        id: `edge_to_trigger_${edge.id}`,
        severity: 'error',
        code: 'EDGE_TO_TRIGGER',
        nodeId: targetNode.id,
        edgeId: edge.id,
        message: 'Trigger nodes cannot have incoming connections.',
      });
    }

    const list = outgoing.get(edge.sourceNodeId) || [];
    list.push(edge);
    outgoing.set(edge.sourceNodeId, list);
    incomingCount.set(edge.targetNodeId, (incomingCount.get(edge.targetNodeId) || 0) + 1);
  }

  // Cycle detection via 3-color DFS (0 = unvisited, 1 = visiting, 2 = done)
  const color = new Map<string, 0 | 1 | 2>();
  let cycleFound = false;

  const dfs = (nodeId: string) => {
    color.set(nodeId, 1);
    for (const edge of outgoing.get(nodeId) || []) {
      const nextColor = color.get(edge.targetNodeId) || 0;
      if (nextColor === 1) {
        cycleFound = true;
        errors.push({
          id: `cycle_${edge.id}`,
          severity: 'error',
          code: 'CYCLE_DETECTED',
          nodeId: edge.targetNodeId,
          edgeId: edge.id,
          message:
            'Circular loop detected in workflow connections. Remove the cycle before activating.',
        });
      } else if (nextColor === 0) {
        dfs(edge.targetNodeId);
      }
    }
    color.set(nodeId, 2);
  };

  for (const node of nodes) {
    if ((color.get(node.id) || 0) === 0) {
      dfs(node.id);
    }
  }

  // Reachability from trigger
  const reachable = new Set<string>();
  if (triggers.length === 1 && !cycleFound) {
    const queue: string[] = [triggers[0].id];
    reachable.add(triggers[0].id);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of outgoing.get(current) || []) {
        if (!reachable.has(edge.targetNodeId)) {
          reachable.add(edge.targetNodeId);
          queue.push(edge.targetNodeId);
        }
      }
    }

    const reachableActions = actions.filter((a) => reachable.has(a.id));
    if (actions.length > 0 && reachableActions.length === 0) {
      errors.push({
        id: 'no_reachable_action',
        severity: 'error',
        code: 'NO_REACHABLE_ACTION',
        message: 'Connect your Trigger node to at least one Action node.',
      });
    }

    for (const node of nodes) {
      if (node.category !== 'trigger' && !reachable.has(node.id)) {
        warnings.push({
          id: `unreachable_${node.id}`,
          severity: 'warning',
          code: 'UNREACHABLE_NODE',
          nodeId: node.id,
          message: `"${node.label}" is not connected to the trigger path and will not run.`,
        });
      }
    }
  }

  // Per-node config validation
  for (const node of nodes) {
    const cfg = node.config || {};
    const nodeOut = outgoing.get(node.id) || [];

    if (node.type === 'trigger_response_matches') {
      validateConditionGroupClauses(cfg.triggerConditionGroup, node, errors);
    }

    if (node.type === 'trigger_outcome_achieved') {
      if (!cfg.outcomeId?.trim() && !cfg.outcomeName?.trim()) {
        errors.push({
          id: `missing_outcome_${node.id}`,
          severity: 'error',
          code: 'MISSING_OUTCOME_TARGET',
          nodeId: node.id,
          message: `"${node.label}" must specify a target outcome ID or name.`,
        });
      }
    }

    if (node.type === 'condition_branch') {
      validateConditionGroupClauses(cfg.conditionGroup, node, errors);
      const hasTrue = nodeOut.some((e) => e.branch === 'true');
      const hasFalse = nodeOut.some((e) => e.branch === 'false');
      if (!hasTrue && !hasFalse) {
        errors.push({
          id: `cond_no_branches_${node.id}`,
          severity: 'error',
          code: 'CONDITION_NO_OUTPUT',
          nodeId: node.id,
          message: `"${node.label}" must connect to at least one True or False branch.`,
        });
      }
    }

    if (node.type === 'action_send_email') {
      if (!isPlausibleEmailOrTemplate(cfg.emailTo)) {
        errors.push({
          id: `email_to_${node.id}`,
          severity: 'error',
          code: 'INVALID_EMAIL_RECIPIENT',
          nodeId: node.id,
          message: `"${node.label}" requires a valid recipient email or piped field (e.g. {{email}}).`,
        });
      }
      if (!cfg.emailSubject?.trim()) {
        errors.push({
          id: `email_subject_${node.id}`,
          severity: 'error',
          code: 'MISSING_EMAIL_SUBJECT',
          nodeId: node.id,
          message: `"${node.label}" requires an email subject.`,
        });
      }
    }

    if (node.type === 'action_send_notification') {
      if (!cfg.notificationTitle?.trim() || !cfg.notificationMessage?.trim()) {
        errors.push({
          id: `notif_fields_${node.id}`,
          severity: 'error',
          code: 'MISSING_NOTIFICATION_CONTENT',
          nodeId: node.id,
          message: `"${node.label}" requires both a notification title and message.`,
        });
      }
    }

    if (node.type === 'action_assign_response_status') {
      if (!cfg.responseStatus?.trim()) {
        errors.push({
          id: `status_missing_${node.id}`,
          severity: 'error',
          code: 'MISSING_RESPONSE_STATUS',
          nodeId: node.id,
          message: `"${node.label}" requires a status label to assign.`,
        });
      }
    }

    if (node.type === 'action_apply_tag') {
      const validTags = (cfg.tags || []).filter((t) => t.trim().length > 0);
      if (validTags.length === 0) {
        errors.push({
          id: `tags_missing_${node.id}`,
          severity: 'error',
          code: 'MISSING_TAGS',
          nodeId: node.id,
          message: `"${node.label}" requires at least one tag or category.`,
        });
      }
    }

    if (node.type === 'action_update_response_field') {
      if (!cfg.targetFieldId?.trim()) {
        errors.push({
          id: `field_missing_${node.id}`,
          severity: 'error',
          code: 'MISSING_TARGET_FIELD',
          nodeId: node.id,
          message: `"${node.label}" must choose a response field to update.`,
        });
      }
    }

    if (node.type === 'action_create_task') {
      if (!cfg.taskTitle?.trim()) {
        errors.push({
          id: `task_title_${node.id}`,
          severity: 'error',
          code: 'MISSING_TASK_TITLE',
          nodeId: node.id,
          message: `"${node.label}" requires a follow-up task title.`,
        });
      }
    }

    if (node.type === 'action_send_webhook') {
      const hasIntegration = Boolean(cfg.integrationId?.trim());
      const hasUrl = Boolean(cfg.webhookUrl?.trim());
      if (!hasIntegration && !hasUrl) {
        errors.push({
          id: `webhook_target_${node.id}`,
          severity: 'error',
          code: 'MISSING_WEBHOOK_TARGET',
          nodeId: node.id,
          message: `"${node.label}" requires a connected webhook integration or an HTTPS endpoint URL.`,
        });
      } else if (hasUrl && !hasIntegration && !isPlausibleHttpsUrl(cfg.webhookUrl)) {
        errors.push({
          id: `webhook_https_${node.id}`,
          severity: 'error',
          code: 'INVALID_WEBHOOK_URL',
          nodeId: node.id,
          message: `"${node.label}" direct webhook URL must use HTTPS.`,
        });
      } else if (
        hasIntegration &&
        context.availableIntegrationIds &&
        !context.availableIntegrationIds.has(cfg.integrationId!)
      ) {
        warnings.push({
          id: `webhook_int_missing_${node.id}`,
          severity: 'warning',
          code: 'INTEGRATION_NOT_FOUND',
          nodeId: node.id,
          message: `"${node.label}" references an integration that is not currently configured.`,
        });
      }
    }

    if (node.type === 'action_connected_service') {
      if (!cfg.integrationId?.trim()) {
        errors.push({
          id: `service_missing_${node.id}`,
          severity: 'error',
          code: 'MISSING_CONNECTED_SERVICE',
          nodeId: node.id,
          message: `"${node.label}" must select a connected Phase 3.4 integration.`,
        });
      } else if (
        context.availableIntegrationIds &&
        !context.availableIntegrationIds.has(cfg.integrationId!)
      ) {
        errors.push({
          id: `service_not_found_${node.id}`,
          severity: 'error',
          code: 'INTEGRATION_NOT_FOUND',
          nodeId: node.id,
          message: `"${node.label}" references a connected service that no longer exists.`,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    canActivate: errors.length === 0,
    errors,
    warnings,
  };
}
