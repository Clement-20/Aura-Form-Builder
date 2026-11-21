/**
 * Built-in Starter Workflow Templates
 *
 * Includes the complete end-to-end example:
 *   New Response -> Check Condition -> Send Notification / Email -> Send Webhook
 *   (plus Else branch -> Create Follow-Up Task)
 */

import type { WorkflowDefinition, WorkflowNode, WorkflowEdge } from './types';
import { WORKFLOW_SCHEMA_VERSION } from './types';

export function buildExampleResponseAutomationTemplate(params: {
  formId: string;
  firstFieldId?: string;
  firstFieldLabel?: string;
  webhookIntegrationId?: string;
  webhookUrl?: string;
}): Omit<WorkflowDefinition, 'id' | 'createdAt' | 'updatedAt'> {
  const fieldId = params.firstFieldId || '';
  const useFieldCondition = Boolean(fieldId);

  const nodes: WorkflowNode[] = [
    {
      id: 'node_trigger_1',
      category: 'trigger',
      type: 'trigger_new_response',
      label: 'New Form Response',
      position: { x: 60, y: 170 },
      config: {},
    },
    {
      id: 'node_cond_1',
      category: 'condition',
      type: 'condition_branch',
      label: useFieldCondition
        ? `Check ${params.firstFieldLabel || 'Response'}`
        : 'Check Score Threshold',
      position: { x: 340, y: 170 },
      config: {
        conditionGroup: {
          id: 'cg_root_1',
          kind: 'group',
          combinator: 'AND',
          items: [
            useFieldCondition
              ? {
                  id: 'cl_1',
                  kind: 'clause',
                  sourceType: 'component',
                  sourceId: fieldId,
                  operator: 'is_not_empty',
                  value: '',
                }
              : {
                  id: 'cl_1',
                  kind: 'clause',
                  sourceType: 'score',
                  sourceId: '',
                  operator: 'greater_than_or_equal',
                  value: '50',
                },
          ],
        },
      },
    },
    {
      id: 'node_notif_1',
      category: 'action',
      type: 'action_send_notification',
      label: 'Send Team Notification',
      position: { x: 650, y: 70 },
      config: {
        notificationTitle: 'Qualified response on {{form_title}}',
        notificationMessage:
          'Submission {{submission_id}} matched workflow criteria and is ready for immediate follow-up.',
        notificationSeverity: 'success',
        notificationChannel: 'workspace',
      },
    },
    {
      id: 'node_email_1',
      category: 'action',
      type: 'action_send_email',
      label: 'Send Confirmation Email',
      position: { x: 650, y: 210 },
      config: {
        emailTo: 'ops@example.com',
        emailSubject: 'New qualified submission: {{form_title}}',
        emailBody:
          'A new qualified response ({{submission_id}}) was received on {{form_title}}.',
      },
    },
    {
      id: 'node_webhook_1',
      category: 'action',
      type: 'action_send_webhook',
      label: 'Send Webhook Payload',
      position: { x: 960, y: 130 },
      config: {
        ...(params.webhookIntegrationId
          ? { integrationId: params.webhookIntegrationId }
          : { webhookUrl: params.webhookUrl || 'https://api.example.com/webhooks/flexstore' }),
        webhookCustomNote: 'Dispatched by Qualified Response Automation',
      },
    },
    {
      id: 'node_task_else',
      category: 'action',
      type: 'action_create_task',
      label: 'Create Review Follow-Up Task',
      position: { x: 650, y: 360 },
      config: {
        taskTitle: 'Review response {{submission_id}}',
        taskDescription:
          'Did not meet automatic qualification criteria on {{form_title}}. Review manually.',
        taskPriority: 'medium',
        taskDueInDays: 2,
      },
    },
  ];

  const edges: WorkflowEdge[] = [
    {
      id: 'edge_1',
      sourceNodeId: 'node_trigger_1',
      targetNodeId: 'node_cond_1',
      branch: 'default',
    },
    {
      id: 'edge_2',
      sourceNodeId: 'node_cond_1',
      targetNodeId: 'node_notif_1',
      branch: 'true',
    },
    {
      id: 'edge_3',
      sourceNodeId: 'node_cond_1',
      targetNodeId: 'node_email_1',
      branch: 'true',
    },
    {
      id: 'edge_4',
      sourceNodeId: 'node_notif_1',
      targetNodeId: 'node_webhook_1',
      branch: 'default',
    },
    {
      id: 'edge_5',
      sourceNodeId: 'node_cond_1',
      targetNodeId: 'node_task_else',
      branch: 'false',
    },
  ];

  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    formId: params.formId,
    name: 'New Response → Condition → Alert & Webhook',
    description:
      'Checks response criteria, notifies the team and sends an email + signed webhook on match, or creates a manual review task otherwise.',
    status: 'draft',
    nodes,
    edges,
  };
}
