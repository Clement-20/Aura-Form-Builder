/**
 * Frontend API Client for FlexStore Visual Workflow Automation Builder
 *
 * Shares the exact same `getStudioAuthHeader()` session as Phase 3.4 Integrations
 * so workflows can seamlessly reference connected integrations owned by the same user.
 */

import type { User } from 'firebase/auth';
import type {
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowEmailOutboxRecord,
  WorkflowExecutionRun,
  WorkflowNode,
  WorkflowNotificationRecord,
  WorkflowPlanEntitlements,
  WorkflowPlatformSafetyLimits,
  WorkflowResponseRecord,
  WorkflowSubmissionEventInput,
  WorkflowTaskRecord,
  WorkflowValidationReport,
} from '../studio/workflows/types';
import { getStudioAuthHeader } from './integrations-client';

export interface FormWorkflowsStateResponse {
  workflows: WorkflowDefinition[];
  runs: WorkflowExecutionRun[];
  notifications: WorkflowNotificationRecord[];
  tasks: WorkflowTaskRecord[];
  emailOutbox: WorkflowEmailOutboxRecord[];
  responseRecords: WorkflowResponseRecord[];
  entitlements: WorkflowPlanEntitlements;
  platformLimits: WorkflowPlatformSafetyLimits;
}

async function workflowApiJson<T>(
  url: string,
  init: RequestInit,
  firebaseUser?: User | null
): Promise<T> {
  const auth = await getStudioAuthHeader(firebaseUser);
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...auth,
      ...(init.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      typeof data?.error === 'string'
        ? data.error
        : `Workflow API failed with HTTP ${res.status}.`
    ) as Error & { validation?: WorkflowValidationReport };
    if (data?.validation) {
      err.validation = data.validation as WorkflowValidationReport;
    }
    throw err;
  }
  return data as T;
}

export async function fetchFormWorkflowsState(
  formId: string,
  firebaseUser?: User | null
): Promise<FormWorkflowsStateResponse> {
  return workflowApiJson(
    `/api/workflows/forms/${encodeURIComponent(formId)}`,
    { method: 'GET' },
    firebaseUser
  );
}

export async function createFormWorkflow(
  formId: string,
  input: {
    name: string;
    description?: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  },
  firebaseUser?: User | null
): Promise<{ workflow: WorkflowDefinition; validation: WorkflowValidationReport }> {
  return workflowApiJson(
    `/api/workflows/forms/${encodeURIComponent(formId)}`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    firebaseUser
  );
}

export async function updateFormWorkflow(
  formId: string,
  workflowId: string,
  patch: {
    name?: string;
    description?: string;
    nodes?: WorkflowNode[];
    edges?: WorkflowEdge[];
  },
  firebaseUser?: User | null
): Promise<{ workflow: WorkflowDefinition; validation: WorkflowValidationReport }> {
  return workflowApiJson(
    `/api/workflows/forms/${encodeURIComponent(formId)}/${encodeURIComponent(workflowId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
    firebaseUser
  );
}

export async function activateFormWorkflow(
  formId: string,
  workflowId: string,
  firebaseUser?: User | null
): Promise<{ workflow: WorkflowDefinition; validation: WorkflowValidationReport }> {
  return workflowApiJson(
    `/api/workflows/forms/${encodeURIComponent(formId)}/${encodeURIComponent(workflowId)}/activate`,
    { method: 'POST', body: JSON.stringify({}) },
    firebaseUser
  );
}

export async function deactivateFormWorkflow(
  formId: string,
  workflowId: string,
  firebaseUser?: User | null
): Promise<{ workflow: WorkflowDefinition }> {
  return workflowApiJson(
    `/api/workflows/forms/${encodeURIComponent(formId)}/${encodeURIComponent(workflowId)}/deactivate`,
    { method: 'POST', body: JSON.stringify({}) },
    firebaseUser
  );
}

export async function deleteFormWorkflow(
  formId: string,
  workflowId: string,
  firebaseUser?: User | null
): Promise<{ deleted: boolean }> {
  return workflowApiJson(
    `/api/workflows/forms/${encodeURIComponent(formId)}/${encodeURIComponent(workflowId)}`,
    { method: 'DELETE' },
    firebaseUser
  );
}

export async function testFormWorkflow(
  formId: string,
  workflowId: string,
  sampleEvent: Partial<WorkflowSubmissionEventInput>,
  firebaseUser?: User | null
): Promise<{ run: WorkflowExecutionRun }> {
  return workflowApiJson(
    `/api/workflows/forms/${encodeURIComponent(formId)}/${encodeURIComponent(workflowId)}/test`,
    {
      method: 'POST',
      body: JSON.stringify(sampleEvent),
    },
    firebaseUser
  );
}

export async function cancelFormWorkflowRun(
  formId: string,
  runId: string,
  firebaseUser?: User | null
): Promise<{ run: WorkflowExecutionRun }> {
  return workflowApiJson(
    `/api/workflows/forms/${encodeURIComponent(formId)}/runs/${encodeURIComponent(runId)}/cancel`,
    { method: 'POST', body: JSON.stringify({}) },
    firebaseUser
  );
}

export async function toggleFormWorkflowTask(
  formId: string,
  taskId: string,
  completed: boolean,
  firebaseUser?: User | null
): Promise<{ task: WorkflowTaskRecord }> {
  return workflowApiJson(
    `/api/workflows/forms/${encodeURIComponent(formId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ completed }),
    },
    firebaseUser
  );
}

