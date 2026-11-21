/**
 * Server-Side Workflow Store & Real Action Artifact Repositories
 *
 * Stores:
 *  - Workflow definitions scoped by `ownerId` and `formId`
 *  - Execution run history (separating `mode: 'live'` and `mode: 'test'`)
 *  - Idempotency deduplication index (24-hour TTL)
 *  - Real backend operational artifacts produced by workflow actions:
 *      - Response status, tags, and field updates (`WorkflowResponseRecord`)
 *      - Workspace notifications (`WorkflowNotificationRecord`)
 *      - Internal follow-up tasks (`WorkflowTaskRecord`)
 *      - Email delivery outbox records (`WorkflowEmailOutboxRecord`)
 */

import type {
  WorkflowDefinition,
  WorkflowEmailOutboxRecord,
  WorkflowExecutionRun,
  WorkflowNotificationRecord,
  WorkflowResponseRecord,
  WorkflowTaskRecord,
} from '../../src/studio/workflows/types';

export interface StoredWorkflowRecord extends WorkflowDefinition {
  ownerId: string;
}

const MAX_RUNS_PER_FORM = 150;
const MAX_ARTIFACTS_PER_FORM = 150;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export function toPublicWorkflow(record: StoredWorkflowRecord): WorkflowDefinition {
  const { ownerId: _omitted, ...publicDef } = record;
  return JSON.parse(JSON.stringify(publicDef)) as WorkflowDefinition;
}

export class WorkflowStore {
  private readonly workflows = new Map<string, StoredWorkflowRecord>();
  private readonly runs = new Map<string, WorkflowExecutionRun>();
  private readonly formRunOrder = new Map<string, string[]>();
  private readonly idempotencyKeys = new Map<string, { runId: string; recordedAt: number }>();

  // Real backend action stores
  private readonly responseRecords = new Map<string, WorkflowResponseRecord>();
  private readonly notificationsByForm = new Map<string, WorkflowNotificationRecord[]>();
  private readonly tasksByForm = new Map<string, WorkflowTaskRecord[]>();
  private readonly emailsByForm = new Map<string, WorkflowEmailOutboxRecord[]>();

  // ---- Workflows ----

  saveWorkflow(record: StoredWorkflowRecord): StoredWorkflowRecord {
    this.workflows.set(record.id, JSON.parse(JSON.stringify(record)) as StoredWorkflowRecord);
    return record;
  }

  getWorkflow(id: string): StoredWorkflowRecord | undefined {
    const found = this.workflows.get(id);
    return found ? (JSON.parse(JSON.stringify(found)) as StoredWorkflowRecord) : undefined;
  }

  listWorkflowsByForm(formId: string, ownerId?: string): StoredWorkflowRecord[] {
    const out: StoredWorkflowRecord[] = [];
    for (const wf of this.workflows.values()) {
      if (wf.formId !== formId) continue;
      if (ownerId && wf.ownerId !== ownerId) continue;
      out.push(JSON.parse(JSON.stringify(wf)) as StoredWorkflowRecord);
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  listActiveWorkflowsForForm(formId: string): StoredWorkflowRecord[] {
    const out: StoredWorkflowRecord[] = [];
    for (const wf of this.workflows.values()) {
      if (wf.formId !== formId || wf.status !== 'active') continue;
      out.push(JSON.parse(JSON.stringify(wf)) as StoredWorkflowRecord);
    }
    return out;
  }

  deleteWorkflow(id: string): boolean {
    return this.workflows.delete(id);
  }

  // ---- Idempotency ----

  getRunIdByIdempotencyKey(key: string, nowMs: number = Date.now()): string | null {
    const hit = this.idempotencyKeys.get(key);
    if (!hit) return null;
    if (nowMs - hit.recordedAt > IDEMPOTENCY_TTL_MS) {
      this.idempotencyKeys.delete(key);
      return null;
    }
    return hit.runId;
  }

  recordIdempotencyKey(key: string, runId: string, nowMs: number = Date.now()): void {
    this.idempotencyKeys.set(key, { runId, recordedAt: nowMs });
    if (this.idempotencyKeys.size > 5_000) {
      for (const [k, v] of this.idempotencyKeys.entries()) {
        if (nowMs - v.recordedAt > IDEMPOTENCY_TTL_MS) {
          this.idempotencyKeys.delete(k);
        }
      }
    }
  }

  // ---- Execution Runs ----

  saveRun(run: WorkflowExecutionRun): void {
    const isNew = !this.runs.has(run.runId);
    this.runs.set(run.runId, JSON.parse(JSON.stringify(run)) as WorkflowExecutionRun);
    if (isNew) {
      const order = this.formRunOrder.get(run.formId) || [];
      order.unshift(run.runId);
      while (order.length > MAX_RUNS_PER_FORM) {
        const evicted = order.pop();
        if (evicted) this.runs.delete(evicted);
      }
      this.formRunOrder.set(run.formId, order);
    }
  }

  getRun(runId: string): WorkflowExecutionRun | undefined {
    const found = this.runs.get(runId);
    return found ? (JSON.parse(JSON.stringify(found)) as WorkflowExecutionRun) : undefined;
  }

  listRunsByForm(
    formId: string,
    allowedWorkflowIds?: Set<string>,
    limit = 60
  ): WorkflowExecutionRun[] {
    const order = this.formRunOrder.get(formId) || [];
    const results: WorkflowExecutionRun[] = [];
    for (const id of order) {
      const run = this.runs.get(id);
      if (!run) continue;
      if (allowedWorkflowIds && !allowedWorkflowIds.has(run.workflowId)) continue;
      results.push(JSON.parse(JSON.stringify(run)) as WorkflowExecutionRun);
      if (results.length >= limit) break;
    }
    return results;
  }

  // ---- Real Backend Action Artifacts ----

  upsertResponseRecord(
    formId: string,
    submissionId: string,
    mutator: (current: WorkflowResponseRecord) => WorkflowResponseRecord
  ): WorkflowResponseRecord {
    const key = `${formId}:${submissionId}`;
    const current: WorkflowResponseRecord = this.responseRecords.get(key) || {
      submissionId,
      formId,
      tags: [],
      updatedFields: {},
      updatedAt: new Date().toISOString(),
    };
    const next = mutator({
      ...current,
      tags: [...current.tags],
      updatedFields: { ...current.updatedFields },
      updatedAt: new Date().toISOString(),
    });
    this.responseRecords.set(key, next);
    return next;
  }

  getResponseRecord(formId: string, submissionId: string): WorkflowResponseRecord | undefined {
    const found = this.responseRecords.get(`${formId}:${submissionId}`);
    return found ? (JSON.parse(JSON.stringify(found)) as WorkflowResponseRecord) : undefined;
  }

  listResponseRecordsByForm(formId: string): WorkflowResponseRecord[] {
    const list: WorkflowResponseRecord[] = [];
    for (const rec of this.responseRecords.values()) {
      if (rec.formId === formId) {
        list.push(JSON.parse(JSON.stringify(rec)) as WorkflowResponseRecord);
      }
    }
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  addNotification(record: WorkflowNotificationRecord): void {
    const list = this.notificationsByForm.get(record.formId) || [];
    list.unshift(record);
    if (list.length > MAX_ARTIFACTS_PER_FORM) list.length = MAX_ARTIFACTS_PER_FORM;
    this.notificationsByForm.set(record.formId, list);
  }

  listNotificationsByForm(
    formId: string,
    allowedWorkflowIds?: Set<string>
  ): WorkflowNotificationRecord[] {
    const list = this.notificationsByForm.get(formId) || [];
    return list
      .filter((n) => !allowedWorkflowIds || allowedWorkflowIds.has(n.workflowId))
      .map((n) => ({ ...n }));
  }

  addTask(record: WorkflowTaskRecord): void {
    const list = this.tasksByForm.get(record.formId) || [];
    list.unshift(record);
    if (list.length > MAX_ARTIFACTS_PER_FORM) list.length = MAX_ARTIFACTS_PER_FORM;
    this.tasksByForm.set(record.formId, list);
  }

  toggleTaskCompleted(formId: string, taskId: string, completed: boolean): WorkflowTaskRecord | null {
    const list = this.tasksByForm.get(formId) || [];
    const target = list.find((t) => t.id === taskId);
    if (!target) return null;
    target.completed = completed;
    return { ...target };
  }

  listTasksByForm(
    formId: string,
    allowedWorkflowIds?: Set<string>
  ): WorkflowTaskRecord[] {
    const list = this.tasksByForm.get(formId) || [];
    return list
      .filter((t) => !allowedWorkflowIds || allowedWorkflowIds.has(t.workflowId))
      .map((t) => ({ ...t }));
  }

  addEmailOutbox(record: WorkflowEmailOutboxRecord): void {
    const list = this.emailsByForm.get(record.formId) || [];
    list.unshift(record);
    if (list.length > MAX_ARTIFACTS_PER_FORM) list.length = MAX_ARTIFACTS_PER_FORM;
    this.emailsByForm.set(record.formId, list);
  }

  listEmailOutboxByForm(
    formId: string,
    allowedWorkflowIds?: Set<string>
  ): WorkflowEmailOutboxRecord[] {
    const list = this.emailsByForm.get(formId) || [];
    return list
      .filter((e) => !allowedWorkflowIds || allowedWorkflowIds.has(e.workflowId))
      .map((e) => ({ ...e }));
  }
}
