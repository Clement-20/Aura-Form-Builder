import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlowArrow,
  Lightning,
  GitBranch,
  EnvelopeSimple,
  Bell,
  Tag,
  CheckSquare,
  ListChecks,
  WebhooksLogo,
  PlugsConnected,
  PencilSimple,
  Plus,
  Copy,
  Trash,
  Play,
  Pause,
  CheckCircle,
  WarningCircle,
  XCircle,
  MagnifyingGlassPlus,
  MagnifyingGlassMinus,
  ArrowsOutSimple,
  Sparkle,
  ClockCountdown,
  CaretDown,
  CaretUp,
  ArrowsClockwise,
  FloppyDisk,
  ListBullets,
  Graph,
  StopCircle,
} from '@phosphor-icons/react';
import type { User } from 'firebase/auth';
import {
  buildExampleResponseAutomationTemplate,
  conditionOperatorRegistry,
  formComponentRegistry,
  getWorkflowNodeMeta,
  validateWorkflowDefinition,
  WORKFLOW_NODE_CATALOG,
  type FormDocument,
  type FormIntegrationSummary,
  type LogicOperator,
  type WorkflowConditionClause,
  type WorkflowConditionGroup,
  type WorkflowConditionSourceType,
  type WorkflowDefinition,
  type WorkflowEdge,
  type WorkflowEdgeBranch,
  type WorkflowEmailOutboxRecord,
  type WorkflowExecutionRun,
  type WorkflowNode,
  type WorkflowNodeExecutionTrace,
  type WorkflowNodeType,
  type WorkflowNotificationRecord,
  type WorkflowResponseRecord,
  type WorkflowTaskRecord,
} from '../../studio';
import { fetchFormIntegrations } from '../../lib/integrations-client';
import {
  activateFormWorkflow,
  cancelFormWorkflowRun,
  createFormWorkflow,
  deactivateFormWorkflow,
  deleteFormWorkflow,
  fetchFormWorkflowsState,
  testFormWorkflow,
  toggleFormWorkflowTask,
  updateFormWorkflow,
} from '../../lib/workflows-client';

interface WorkflowBuilderStudioProps {
  document: FormDocument;
  firebaseUser?: User | null;
  isReadOnly?: boolean;
}

type StudioViewMode = 'editor' | 'history' | 'outputs';
type HistoryFilterMode = 'live' | 'test' | 'all';

const NODE_WIDTH = 240;
const NODE_HEIGHT = 104;

const NODE_ICONS: Record<WorkflowNodeType, React.ComponentType<any>> = {
  trigger_new_response: Lightning,
  trigger_response_completed: CheckCircle,
  trigger_response_matches: GitBranch,
  trigger_outcome_achieved: Sparkle,
  condition_branch: GitBranch,
  action_send_email: EnvelopeSimple,
  action_send_notification: Bell,
  action_update_response_field: PencilSimple,
  action_assign_response_status: CheckSquare,
  action_apply_tag: Tag,
  action_create_task: ListChecks,
  action_send_webhook: WebhooksLogo,
  action_connected_service: PlugsConnected,
};

const WORKFLOW_OPERATORS: Array<{ op: LogicOperator; label: string }> = [
  { op: 'equals', label: 'equals' },
  { op: 'not_equals', label: 'does not equal' },
  { op: 'contains', label: 'contains' },
  { op: 'not_contains', label: 'does not contain' },
  { op: 'greater_than', label: '>' },
  { op: 'greater_than_or_equal', label: '>=' },
  { op: 'less_than', label: '<' },
  { op: 'less_than_or_equal', label: '<=' },
  { op: 'is_between', label: 'is between' },
  { op: 'is_empty', label: 'is empty' },
  { op: 'is_not_empty', label: 'is not empty' },
];

const RESPONSE_STATUS_PRESETS = [
  'qualified',
  'in_review',
  'follow_up',
  'approved',
  'rejected',
  'archived',
];

function createDefaultConditionGroup(firstFieldId = ''): WorkflowConditionGroup {
  return {
    id: `cg_${Math.random().toString(36).slice(2, 8)}`,
    kind: 'group',
    combinator: 'AND',
    items: [
      {
        id: `cl_${Math.random().toString(36).slice(2, 8)}`,
        kind: 'clause',
        sourceType: firstFieldId ? 'component' : 'score',
        sourceId: firstFieldId,
        operator: firstFieldId ? 'is_not_empty' : 'greater_than_or_equal',
        value: firstFieldId ? '' : '50',
      },
    ],
  };
}

function createDefaultNode(
  type: WorkflowNodeType,
  position: { x: number; y: number },
  firstFieldId = ''
): WorkflowNode {
  const meta = getWorkflowNodeMeta(type);
  const id = `node_${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}`;

  const base: WorkflowNode = {
    id,
    category: meta.category,
    type,
    label: meta.label,
    position,
    config: {},
  };

  switch (type) {
    case 'trigger_response_matches':
      base.config.triggerConditionGroup = createDefaultConditionGroup(firstFieldId);
      break;
    case 'condition_branch':
      base.config.conditionGroup = createDefaultConditionGroup(firstFieldId);
      break;
    case 'action_send_email':
      base.config.emailTo = 'team@example.com';
      base.config.emailSubject = 'New response on {{form_title}}';
      base.config.emailBody = 'Submission {{submission_id}} was received.';
      break;
    case 'action_send_notification':
      base.config.notificationTitle = 'New submission on {{form_title}}';
      base.config.notificationMessage = 'Response {{submission_id}} triggered this workflow.';
      base.config.notificationSeverity = 'info';
      base.config.notificationChannel = 'workspace';
      break;
    case 'action_assign_response_status':
      base.config.responseStatus = 'qualified';
      break;
    case 'action_apply_tag':
      base.config.tags = ['Qualified'];
      break;
    case 'action_update_response_field':
      base.config.targetFieldId = firstFieldId;
      base.config.targetFieldValue = '';
      break;
    case 'action_create_task':
      base.config.taskTitle = 'Follow up on {{submission_id}}';
      base.config.taskDescription = 'Review submission from {{form_title}}.';
      base.config.taskPriority = 'medium';
      base.config.taskDueInDays = 2;
      break;
    case 'action_send_webhook':
      base.config.webhookUrl = 'https://api.example.com/webhooks/flexstore';
      break;
    default:
      break;
  }

  return base;
}

function autoLayoutNodes(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  if (nodes.length === 0) return nodes;
  const trigger = nodes.find((n) => n.category === 'trigger') || nodes[0];
  const outgoing = new Map<string, WorkflowEdge[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.sourceNodeId) || [];
    list.push(edge);
    outgoing.set(edge.sourceNodeId, list);
  }

  const levelById = new Map<string, number>();
  const queue: string[] = [trigger.id];
  levelById.set(trigger.id, 0);

  while (queue.length > 0) {
    const id = queue.shift()!;
    const lvl = levelById.get(id) || 0;
    for (const edge of outgoing.get(id) || []) {
      const nextLvl = lvl + 1;
      if (!levelById.has(edge.targetNodeId) || levelById.get(edge.targetNodeId)! < nextLvl) {
        levelById.set(edge.targetNodeId, nextLvl);
        queue.push(edge.targetNodeId);
      }
    }
  }

  // Place disconnected nodes at the far right
  const maxLvl = Math.max(0, ...Array.from(levelById.values()));
  for (const n of nodes) {
    if (!levelById.has(n.id)) {
      levelById.set(n.id, maxLvl + 1);
    }
  }

  const columns = new Map<number, WorkflowNode[]>();
  for (const n of nodes) {
    const col = levelById.get(n.id) || 0;
    const list = columns.get(col) || [];
    list.push(n);
    columns.set(col, list);
  }

  const posMap = new Map<string, { x: number; y: number }>();
  for (const [col, colNodes] of columns.entries()) {
    colNodes.forEach((n, idx) => {
      posMap.set(n.id, {
        x: 60 + col * 300,
        y: 64 + idx * 150,
      });
    });
  }

  return nodes.map((n) => ({
    ...n,
    position: posMap.get(n.id) || n.position,
  }));
}

function workflowStatusBadge(status: WorkflowDefinition['status']): {
  label: string;
  classes: string;
} {
  if (status === 'active') {
    return { label: 'Active', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  if (status === 'inactive') {
    return { label: 'Inactive', classes: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
  return { label: 'Draft', classes: 'bg-amber-50 text-amber-800 border-amber-200' };
}

function runStatusBadge(status: WorkflowExecutionRun['status']): {
  label: string;
  classes: string;
} {
  switch (status) {
    case 'succeeded':
      return { label: 'Succeeded', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'running':
    case 'queued':
      return { label: 'Running', classes: 'bg-sky-50 text-sky-700 border-sky-200' };
    case 'cancelled':
      return { label: 'Cancelled', classes: 'bg-slate-100 text-slate-700 border-slate-200' };
    case 'rate_limited':
      return { label: 'Rate Limited', classes: 'bg-orange-50 text-orange-700 border-orange-200' };
    default:
      return { label: 'Failed', classes: 'bg-rose-50 text-rose-700 border-rose-200' };
  }
}

export const WorkflowBuilderStudio: React.FC<WorkflowBuilderStudioProps> = ({
  document: doc,
  firebaseUser,
  isReadOnly = false,
}) => {
  const [viewMode, setViewMode] = useState<StudioViewMode>('editor');
  const [mobileLayout, setMobileLayout] = useState<'canvas' | 'list'>('list');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilterMode>('all');

  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [runs, setRuns] = useState<WorkflowExecutionRun[]>([]);
  const [notifications, setNotifications] = useState<WorkflowNotificationRecord[]>([]);
  const [tasks, setTasks] = useState<WorkflowTaskRecord[]>([]);
  const [emailOutbox, setEmailOutbox] = useState<WorkflowEmailOutboxRecord[]>([]);
  const [responseRecords, setResponseRecords] = useState<WorkflowResponseRecord[]>([]);
  const [integrations, setIntegrations] = useState<FormIntegrationSummary[]>([]);

  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftNodes, setDraftNodes] = useState<WorkflowNode[]>([]);
  const [draftEdges, setDraftEdges] = useState<WorkflowEdge[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<{
    nodeId: string;
    branch: WorkflowEdgeBranch;
  } | null>(null);

  // Canvas zoom & pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragNodeRef = useRef<{
    nodeId: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const panDragRef = useRef<{
    startClientX: number;
    startClientY: number;
    origPanX: number;
    origPanY: number;
  } | null>(null);

  // Test Runner Drawer state
  const [isTestDrawerOpen, setIsTestDrawerOpen] = useState(false);
  const [sampleAnswers, setSampleAnswers] = useState<Record<string, string>>({});
  const [sampleScore, setSampleScore] = useState<string>('75');
  const [sampleOutcomeName, setSampleOutcomeName] = useState<string>('');
  const [latestTestRun, setLatestTestRun] = useState<WorkflowExecutionRun | null>(null);
  const [isRunningTest, setIsRunningTest] = useState(false);

  // UI Status banners
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const fieldCatalog = useMemo(() => {
    const list: Array<{ id: string; label: string; type: string }> = [];
    for (const page of doc.pages) {
      const visit = (id: string) => {
        const node = doc.components[id];
        if (!node) return;
        const def = formComponentRegistry.get(node.type);
        if (def && def.category === 'fields') {
          list.push({
            id: node.id,
            label: node.content.label || def.displayName,
            type: node.type,
          });
        }
        if (Array.isArray(node.children)) {
          for (const cid of node.children) visit(cid);
        }
      };
      for (const cid of page.componentIds) visit(cid);
    }
    return list;
  }, [doc.pages, doc.components]);

  const outcomeOptions = useMemo(() => {
    return doc.outcomes?.outcomes || [];
  }, [doc.outcomes]);

  const variableOptions = useMemo(() => {
    return doc.variables || [];
  }, [doc.variables]);

  // Pre-populate sample answers for Test Runner when form fields change
  useEffect(() => {
    setSampleAnswers((prev) => {
      const next = { ...prev };
      for (const f of fieldCatalog) {
        if (next[f.id] === undefined) {
          next[f.id] =
            f.type === 'email'
              ? 'alex@acme.io'
              : f.type === 'number' || f.type === 'rating' || f.type === 'scale'
                ? '5'
                : `Sample ${f.label}`;
        }
      }
      return next;
    });
  }, [fieldCatalog]);

  const loadState = useCallback(async () => {
    setIsLoading(true);
    setBannerError(null);
    try {
      const [wfState, intState] = await Promise.all([
        fetchFormWorkflowsState(doc.id, firebaseUser),
        fetchFormIntegrations(doc.id, firebaseUser).catch(() => ({
          integrations: [],
          deliveries: [],
          providers: [],
        })),
      ]);
      setWorkflows(wfState.workflows);
      setRuns(wfState.runs);
      setNotifications(wfState.notifications);
      setTasks(wfState.tasks);
      setEmailOutbox(wfState.emailOutbox);
      setResponseRecords(wfState.responseRecords);
      setIntegrations(intState.integrations);

      setSelectedWorkflowId((prev) => {
        if (prev && wfState.workflows.some((w) => w.id === prev)) return prev;
        return wfState.workflows[0]?.id ?? null;
      });
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : 'Unable to load workflows.');
    } finally {
      setIsLoading(false);
    }
  }, [doc.id, firebaseUser]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const selectedWorkflow = useMemo(
    () => workflows.find((w) => w.id === selectedWorkflowId) || null,
    [workflows, selectedWorkflowId]
  );

  // Hydrate canvas draft when switching workflows
  useEffect(() => {
    if (!selectedWorkflow) {
      setDraftName('');
      setDraftDescription('');
      setDraftNodes([]);
      setDraftEdges([]);
      setSelectedNodeId(null);
      setIsDirty(false);
      setLatestTestRun(null);
      return;
    }
    setDraftName(selectedWorkflow.name);
    setDraftDescription(selectedWorkflow.description || '');
    setDraftNodes(JSON.parse(JSON.stringify(selectedWorkflow.nodes)));
    setDraftEdges(JSON.parse(JSON.stringify(selectedWorkflow.edges)));
    setSelectedNodeId(selectedWorkflow.nodes[0]?.id ?? null);
    setIsDirty(false);
    setConnectingFrom(null);
    // Attach most recent test run for this workflow if any
    const lastTest = runs.find(
      (r) => r.workflowId === selectedWorkflow.id && r.mode === 'test'
    );
    setLatestTestRun(lastTest || null);
  }, [selectedWorkflow?.id]);

  // Cancel connecting mode on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && connectingFrom) {
        setConnectingFrom(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [connectingFrom]);

  // Live client-side validation (uses the EXACT same validator as the backend)
  const validationReport = useMemo(() => {
    if (!selectedWorkflow) return null;
    return validateWorkflowDefinition(
      {
        name: draftName,
        nodes: draftNodes,
        edges: draftEdges,
      },
      {
        availableIntegrationIds: new Set(integrations.map((i) => i.id)),
      }
    );
  }, [selectedWorkflow, draftName, draftNodes, draftEdges, integrations]);

  const errorsByNodeId = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!validationReport) return map;
    for (const err of validationReport.errors) {
      if (!err.nodeId) continue;
      const list = map.get(err.nodeId) || [];
      list.push(err.message);
      map.set(err.nodeId, list);
    }
    return map;
  }, [validationReport]);

  const traceByNodeId = useMemo(() => {
    const map = new Map<string, WorkflowNodeExecutionTrace>();
    if (!latestTestRun) return map;
    for (const trace of latestTestRun.nodeTraces) {
      map.set(trace.nodeId, trace);
    }
    return map;
  }, [latestTestRun]);

  const selectedNode = useMemo(
    () => draftNodes.find((n) => n.id === selectedNodeId) || null,
    [draftNodes, selectedNodeId]
  );

  // ---- Workflow CRUD & Template Helpers ----

  const handleCreateBlank = async () => {
    if (isReadOnly) return;
    setBannerError(null);
    setBannerNotice(null);
    const firstField = fieldCatalog[0];
    const trigger = createDefaultNode('trigger_new_response', { x: 80, y: 150 }, firstField?.id);
    const action = createDefaultNode('action_send_notification', { x: 390, y: 150 }, firstField?.id);
    const edge: WorkflowEdge = {
      id: `edge_${Date.now().toString(36)}`,
      sourceNodeId: trigger.id,
      targetNodeId: action.id,
      branch: 'default',
    };
    try {
      const res = await createFormWorkflow(
        doc.id,
        {
          name: `Automation ${workflows.length + 1}`,
          description: 'Custom form submission automation',
          nodes: [trigger, action],
          edges: [edge],
        },
        firebaseUser
      );
      setWorkflows((prev) => [res.workflow, ...prev]);
      setSelectedWorkflowId(res.workflow.id);
      setViewMode('editor');
      setBannerNotice('Created new draft workflow.');
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : 'Failed to create workflow.');
    }
  };

  const handleCreateExampleTemplate = async () => {
    if (isReadOnly) return;
    setBannerError(null);
    setBannerNotice(null);
    const firstField = fieldCatalog[0];
    const webhookIntegration = integrations.find(
      (i) => i.providerId === 'outbound_webhook' && i.status !== 'disconnected'
    );
    const tpl = buildExampleResponseAutomationTemplate({
      formId: doc.id,
      firstFieldId: firstField?.id,
      firstFieldLabel: firstField?.label,
      webhookIntegrationId: webhookIntegration?.id,
    });
    try {
      const res = await createFormWorkflow(
        doc.id,
        {
          name: tpl.name,
          description: tpl.description,
          nodes: tpl.nodes,
          edges: tpl.edges,
        },
        firebaseUser
      );
      setWorkflows((prev) => [res.workflow, ...prev]);
      setSelectedWorkflowId(res.workflow.id);
      setViewMode('editor');
      setBannerNotice(
        'Loaded example workflow: New Response → Condition → Notification & Email → Webhook (with Else → Follow-Up Task).'
      );
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : 'Failed to create template workflow.');
    }
  };

  const persistCurrentDraft = async (): Promise<WorkflowDefinition | null> => {
    if (!selectedWorkflow || isReadOnly) return selectedWorkflow;
    setIsSaving(true);
    setBannerError(null);
    try {
      const res = await updateFormWorkflow(
        doc.id,
        selectedWorkflow.id,
        {
          name: draftName.trim() || 'Untitled Workflow',
          description: draftDescription.trim(),
          nodes: draftNodes,
          edges: draftEdges,
        },
        firebaseUser
      );
      setWorkflows((prev) =>
        prev.map((w) => (w.id === res.workflow.id ? res.workflow : w))
      );
      setIsDirty(false);
      return res.workflow;
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : 'Failed to save workflow draft.');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraftClick = async () => {
    const saved = await persistCurrentDraft();
    if (saved) {
      setBannerNotice('Draft saved.');
    }
  };

  const handleToggleActive = async (targetWorkflow?: WorkflowDefinition) => {
    const wf = targetWorkflow || selectedWorkflow;
    if (!wf || isReadOnly) return;
    setIsTogglingStatus(true);
    setBannerError(null);
    setBannerNotice(null);

    try {
      if (wf.status === 'active') {
        const res = await deactivateFormWorkflow(doc.id, wf.id, firebaseUser);
        setWorkflows((prev) => prev.map((w) => (w.id === res.workflow.id ? res.workflow : w)));
        setBannerNotice(`"${res.workflow.name}" deactivated.`);
      } else {
        // Save any unsaved edits first before validating and activating on the server
        if (wf.id === selectedWorkflow?.id && isDirty) {
          const saved = await persistCurrentDraft();
          if (!saved) return;
        }
        const res = await activateFormWorkflow(doc.id, wf.id, firebaseUser);
        setWorkflows((prev) => prev.map((w) => (w.id === res.workflow.id ? res.workflow : w)));
        setBannerNotice(
          `"${res.workflow.name}" is now Active and will execute automatically on verified form submissions.`
        );
      }
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : 'Could not change workflow status.');
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const handleDeleteWorkflow = async () => {
    if (!selectedWorkflow || isReadOnly) return;
    setBannerError(null);
    const idToRemove = selectedWorkflow.id;
    try {
      await deleteFormWorkflow(doc.id, idToRemove, firebaseUser);
      const remaining = workflows.filter((w) => w.id !== idToRemove);
      setWorkflows(remaining);
      setSelectedWorkflowId(remaining[0]?.id ?? null);
      setBannerNotice('Workflow deleted.');
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : 'Could not delete workflow.');
    }
  };

  const handleRunTest = async () => {
    if (!selectedWorkflow || isReadOnly) return;
    setIsRunningTest(true);
    setBannerError(null);
    setBannerNotice(null);
    try {
      if (isDirty) {
        const saved = await persistCurrentDraft();
        if (!saved) return;
      }

      const parsedAnswers: Record<string, unknown> = {};
      for (const f of fieldCatalog) {
        const raw = sampleAnswers[f.id];
        if (raw === undefined) continue;
        if (f.type === 'number' || f.type === 'rating' || f.type === 'scale') {
          const num = Number(raw);
          parsedAnswers[f.id] = Number.isFinite(num) && raw.trim() !== '' ? num : raw;
        } else {
          parsedAnswers[f.id] = raw;
        }
      }

      const numericScore = sampleScore.trim() !== '' ? Number(sampleScore) : undefined;
      const res = await testFormWorkflow(
        doc.id,
        selectedWorkflow.id,
        {
          formTitle: doc.title,
          formSlug: doc.settings.slug,
          answers: parsedAnswers,
          fieldCatalog,
          score: Number.isFinite(numericScore) ? numericScore : undefined,
          maxScore: 100,
          scorePercent: Number.isFinite(numericScore) ? numericScore : undefined,
          outcomeName: sampleOutcomeName.trim() || undefined,
          outcomeId:
            outcomeOptions.find((o) => o.name === sampleOutcomeName)?.id ||
            (sampleOutcomeName.trim() ? sampleOutcomeName.trim() : undefined),
        },
        firebaseUser
      );

      setLatestTestRun(res.run);
      setRuns((prev) => [res.run, ...prev]);
      // Reload outputs (test notifications/tasks/emails)
      const fresh = await fetchFormWorkflowsState(doc.id, firebaseUser);
      setNotifications(fresh.notifications);
      setTasks(fresh.tasks);
      setEmailOutbox(fresh.emailOutbox);

      if (res.run.status === 'succeeded') {
        setBannerNotice(
          `Isolated test run succeeded in ${res.run.durationMs ?? 1}ms (${res.run.nodeTraces.filter((t) => t.status === 'succeeded').length} nodes executed).`
        );
      } else {
        setBannerError(
          res.run.errorMessage || 'Test run encountered an error. Inspect highlighted nodes on canvas.'
        );
      }
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : 'Test run failed.');
    } finally {
      setIsRunningTest(false);
    }
  };

  const handleCancelRun = async (runId: string) => {
    if (isReadOnly) return;
    try {
      const res = await cancelFormWorkflowRun(doc.id, runId, firebaseUser);
      setRuns((prev) => prev.map((r) => (r.runId === res.run.runId ? res.run : r)));
      setBannerNotice('Workflow execution cancelled.');
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : 'Could not cancel run.');
    }
  };

  const handleToggleTask = async (task: WorkflowTaskRecord) => {
    if (isReadOnly) return;
    try {
      const res = await toggleFormWorkflowTask(doc.id, task.id, !task.completed, firebaseUser);
      setTasks((prev) => prev.map((t) => (t.id === res.task.id ? res.task : t)));
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : 'Could not update task.');
    }
  };

  // ---- Canvas Node & Edge Operations ----

  const handleAddNode = (type: WorkflowNodeType) => {
    if (isReadOnly || !selectedWorkflow) return;
    const offset = draftNodes.length;
    const pos = {
      x: 100 + (offset % 4) * 280,
      y: 80 + Math.floor(offset / 4) * 150,
    };
    const node = createDefaultNode(type, pos, fieldCatalog[0]?.id || '');
    setDraftNodes((prev) => [...prev, node]);
    setSelectedNodeId(node.id);
    setIsDirty(true);
  };

  const handleDuplicateNode = (nodeId: string) => {
    if (isReadOnly) return;
    const src = draftNodes.find((n) => n.id === nodeId);
    if (!src) return;
    const clone: WorkflowNode = {
      ...JSON.parse(JSON.stringify(src)),
      id: `node_${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}`,
      label: `${src.label} (Copy)`,
      position: { x: src.position.x + 36, y: src.position.y + 42 },
    };
    setDraftNodes((prev) => [...prev, clone]);
    setSelectedNodeId(clone.id);
    setIsDirty(true);
  };

  const handleDeleteNode = (nodeId: string) => {
    if (isReadOnly) return;
    setDraftNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setDraftEdges((prev) =>
      prev.filter((e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId)
    );
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
    if (connectingFrom?.nodeId === nodeId) {
      setConnectingFrom(null);
    }
    setIsDirty(true);
  };

  const handleConnectToNode = (targetNodeId: string) => {
    if (!connectingFrom || isReadOnly) return;
    if (connectingFrom.nodeId === targetNodeId) {
      setConnectingFrom(null);
      return;
    }
    const targetNode = draftNodes.find((n) => n.id === targetNodeId);
    if (!targetNode || targetNode.category === 'trigger') {
      setConnectingFrom(null);
      return;
    }
    const alreadyExists = draftEdges.some(
      (e) =>
        e.sourceNodeId === connectingFrom.nodeId &&
        e.targetNodeId === targetNodeId &&
        e.branch === connectingFrom.branch
    );
    if (!alreadyExists) {
      const edge: WorkflowEdge = {
        id: `edge_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        sourceNodeId: connectingFrom.nodeId,
        targetNodeId,
        branch: connectingFrom.branch,
      };
      setDraftEdges((prev) => [...prev, edge]);
      setIsDirty(true);
    }
    setConnectingFrom(null);
  };

  const handleDeleteEdge = (edgeId: string) => {
    if (isReadOnly) return;
    setDraftEdges((prev) => prev.filter((e) => e.id !== edgeId));
    setIsDirty(true);
  };

  const updateSelectedNode = (updater: (node: WorkflowNode) => WorkflowNode) => {
    if (!selectedNodeId || isReadOnly) return;
    setDraftNodes((prev) =>
      prev.map((n) => (n.id === selectedNodeId ? updater(n) : n))
    );
    setIsDirty(true);
  };

  // ---- Pointer Drag for Nodes & Canvas Panning ----

  const handleNodePointerDown = (e: React.PointerEvent, node: WorkflowNode) => {
    if (connectingFrom) {
      e.stopPropagation();
      handleConnectToNode(node.id);
      return;
    }
    e.stopPropagation();
    setSelectedNodeId(node.id);
    if (isReadOnly) return;
    dragNodeRef.current = {
      nodeId: node.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: node.position.x,
      origY: node.position.y,
    };
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (connectingFrom) {
      setConnectingFrom(null);
      return;
    }
    panDragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      origPanX: pan.x,
      origPanY: pan.y,
    };
  };

  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    if (dragNodeRef.current) {
      const { nodeId, startClientX, startClientY, origX, origY } = dragNodeRef.current;
      const dx = (e.clientX - startClientX) / zoom;
      const dy = (e.clientY - startClientY) / zoom;
      const nextX = Math.max(20, Math.round((origX + dx) / 10) * 10);
      const nextY = Math.max(20, Math.round((origY + dy) / 10) * 10);
      setDraftNodes((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, position: { x: nextX, y: nextY } } : n))
      );
      setIsDirty(true);
      return;
    }
    if (panDragRef.current) {
      const { startClientX, startClientY, origPanX, origPanY } = panDragRef.current;
      setPan({
        x: origPanX + (e.clientX - startClientX),
        y: origPanY + (e.clientY - startClientY),
      });
    }
  };

  const handleCanvasPointerUp = () => {
    dragNodeRef.current = null;
    panDragRef.current = null;
  };

  const handleAutoLayout = () => {
    if (isReadOnly) return;
    setDraftNodes((prev) => autoLayoutNodes(prev, draftEdges));
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setIsDirty(true);
  };

  // ---- Condition Group Editor Helper (reused for Condition nodes & Match triggers) ----

  const renderConditionGroupEditor = (
    group: WorkflowConditionGroup,
    onChangeGroup: (next: WorkflowConditionGroup) => void
  ) => {
    const clauses = group.items.filter(
      (i): i is WorkflowConditionClause => i.kind === 'clause'
    );

    const addClause = () => {
      const nextClause: WorkflowConditionClause = {
        id: `cl_${Math.random().toString(36).slice(2, 8)}`,
        kind: 'clause',
        sourceType: fieldCatalog[0] ? 'component' : 'score',
        sourceId: fieldCatalog[0]?.id || '',
        operator: 'equals',
        value: '',
      };
      onChangeGroup({ ...group, items: [...group.items, nextClause] });
    };

    const updateClause = (clauseId: string, patch: Partial<WorkflowConditionClause>) => {
      onChangeGroup({
        ...group,
        items: group.items.map((item) =>
          item.kind === 'clause' && item.id === clauseId ? { ...item, ...patch } : item
        ),
      });
    };

    const removeClause = (clauseId: string) => {
      onChangeGroup({
        ...group,
        items: group.items.filter((item) => !(item.kind === 'clause' && item.id === clauseId)),
      });
    };

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-[#0B0D0F]">Match Logic</span>
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08]">
            {(['AND', 'OR'] as const).map((comb) => (
              <button
                key={comb}
                type="button"
                disabled={isReadOnly}
                onClick={() => onChangeGroup({ ...group, combinator: comb })}
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                  group.combinator === comb
                    ? 'bg-[#0B0D0F] text-white'
                    : 'text-[#5C6066] hover:text-[#0B0D0F]'
                }`}
              >
                {comb}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {clauses.map((clause) => {
            const opMeta = conditionOperatorRegistry.get(clause.operator);
            const arity = opMeta?.valueArity ?? 1;
            return (
              <div
                key={clause.id}
                className="p-2.5 rounded-xl bg-[#FAF9F7] border border-black/[0.08] space-y-2"
              >
                <div className="flex items-center justify-between gap-1.5">
                  <select
                    value={clause.sourceType}
                    disabled={isReadOnly}
                    onChange={(e) => {
                      const nextSource = e.target.value as WorkflowConditionSourceType;
                      updateClause(clause.id, {
                        sourceType: nextSource,
                        sourceId:
                          nextSource === 'component'
                            ? fieldCatalog[0]?.id || ''
                            : nextSource === 'variable'
                              ? variableOptions[0]?.name || ''
                              : '',
                      });
                    }}
                    className="flex-1 h-8 px-2 rounded-lg bg-white border border-black/[0.08] text-[11px] font-medium"
                  >
                    <option value="component">Form Answer</option>
                    <option value="score">Total Score</option>
                    <option value="score_percent">Score %</option>
                    <option value="variable">Variable</option>
                    <option value="outcome">Outcome</option>
                  </select>

                  {!isReadOnly && clauses.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeClause(clause.id)}
                      className="w-7 h-7 rounded-lg text-[#5C6066] hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center"
                      aria-label="Remove condition"
                    >
                      <Trash size={13} />
                    </button>
                  )}
                </div>

                {clause.sourceType === 'component' && (
                  <select
                    value={clause.sourceId}
                    disabled={isReadOnly}
                    onChange={(e) => updateClause(clause.id, { sourceId: e.target.value })}
                    className="w-full h-8 px-2 rounded-lg bg-white border border-black/[0.08] text-[11px]"
                  >
                    <option value="">Select form field…</option>
                    {fieldCatalog.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                )}

                {clause.sourceType === 'variable' && (
                  <input
                    type="text"
                    value={clause.sourceId}
                    readOnly={isReadOnly}
                    placeholder="Variable name (e.g. total_price)"
                    onChange={(e) => updateClause(clause.id, { sourceId: e.target.value })}
                    className="w-full h-8 px-2.5 rounded-lg bg-white border border-black/[0.08] text-[11px] font-mono"
                  />
                )}

                <select
                  value={clause.operator}
                  disabled={isReadOnly}
                  onChange={(e) =>
                    updateClause(clause.id, { operator: e.target.value as LogicOperator })
                  }
                  className="w-full h-8 px-2 rounded-lg bg-white border border-black/[0.08] text-[11px]"
                >
                  {WORKFLOW_OPERATORS.map((o) => (
                    <option key={o.op} value={o.op}>
                      {o.label}
                    </option>
                  ))}
                </select>

                {arity >= 1 && (
                  <input
                    type="text"
                    value={clause.value}
                    readOnly={isReadOnly}
                    placeholder={arity === 2 ? 'Minimum value' : 'Comparison value'}
                    onChange={(e) => updateClause(clause.id, { value: e.target.value })}
                    className="w-full h-8 px-2.5 rounded-lg bg-white border border-black/[0.08] text-[11px]"
                  />
                )}
                {arity === 2 && (
                  <input
                    type="text"
                    value={clause.secondaryValue || ''}
                    readOnly={isReadOnly}
                    placeholder="Maximum value"
                    onChange={(e) => updateClause(clause.id, { secondaryValue: e.target.value })}
                    className="w-full h-8 px-2.5 rounded-lg bg-white border border-black/[0.08] text-[11px]"
                  />
                )}
              </div>
            );
          })}
        </div>

        {!isReadOnly && (
          <button
            type="button"
            onClick={addClause}
            className="w-full h-8 rounded-lg border border-dashed border-black/20 text-[11px] font-semibold text-[#0F766E] hover:bg-[#0F766E]/5 flex items-center justify-center gap-1"
          >
            <Plus size={12} weight="bold" />
            <span>Add Condition Clause</span>
          </button>
        )}
      </div>
    );
  };

  const filteredRuns = useMemo(() => {
    if (historyFilter === 'all') return runs;
    return runs.filter((r) => r.mode === historyFilter);
  }, [runs, historyFilter]);

  const liveRunCount = useMemo(() => runs.filter((r) => r.mode === 'live').length, [runs]);
  const testRunCount = useMemo(() => runs.filter((r) => r.mode === 'test').length, [runs]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#F7F6F3]">
      {/* Top Studio Bar */}
      <div className="bg-white border-b border-black/[0.08] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-[#0F766E] font-semibold">
            <FlowArrow size={15} weight="duotone" />
            <span className="hidden sm:inline">Workflows</span>
          </div>

          {workflows.length > 0 && (
            <select
              value={selectedWorkflowId || ''}
              onChange={(e) => setSelectedWorkflowId(e.target.value)}
              className="h-8 px-2.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs font-semibold text-[#0B0D0F] max-w-[220px]"
              aria-label="Select workflow"
            >
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.status})
                </option>
              ))}
            </select>
          )}

          {selectedWorkflow && (
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                workflowStatusBadge(selectedWorkflow.status).classes
              }`}
            >
              {workflowStatusBadge(selectedWorkflow.status).label}
            </span>
          )}

          {/* Sub-view Switcher */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[#F7F6F3] border border-black/[0.06]">
            {(
              [
                { id: 'editor', label: 'Builder' },
                { id: 'history', label: `Runs (${runs.length})` },
                { id: 'outputs', label: `Outputs (${tasks.length + notifications.length})` },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setViewMode(t.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  viewMode === t.id
                    ? 'bg-white text-[#0B0D0F] shadow-xs'
                    : 'text-[#5C6066] hover:text-[#0B0D0F]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          {!isReadOnly && (
            <>
              <button
                type="button"
                onClick={() => void handleCreateExampleTemplate()}
                className="h-8 px-2.5 rounded-lg bg-[#0F766E]/10 hover:bg-[#0F766E]/15 text-[#0F766E] border border-[#0F766E]/25 text-xs font-semibold flex items-center gap-1.5"
              >
                <Sparkle size={13} weight="fill" />
                <span className="hidden md:inline">Example Workflow</span>
              </button>
              <button
                type="button"
                onClick={() => void handleCreateBlank()}
                className="h-8 px-2.5 rounded-lg bg-[#F7F6F3] hover:bg-[#EAE7E1] border border-black/[0.08] text-xs font-semibold text-[#0B0D0F] flex items-center gap-1"
              >
                <Plus size={13} weight="bold" />
                <span>New</span>
              </button>
            </>
          )}

          {selectedWorkflow && viewMode === 'editor' && (
            <>
              <button
                type="button"
                onClick={() => setIsTestDrawerOpen((prev) => !prev)}
                className={`h-8 px-2.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 ${
                  isTestDrawerOpen
                    ? 'bg-[#0B0D0F] text-white border-[#0B0D0F]'
                    : 'bg-white text-[#0B0D0F] border-black/[0.1] hover:bg-[#F7F6F3]'
                }`}
              >
                <Play size={13} weight="fill" />
                <span>Test</span>
              </button>

              {!isReadOnly && (
                <>
                  <button
                    type="button"
                    disabled={isSaving || !isDirty}
                    onClick={() => void handleSaveDraftClick()}
                    className="h-8 px-2.5 rounded-lg bg-white hover:bg-[#F7F6F3] disabled:opacity-40 border border-black/[0.1] text-xs font-semibold text-[#0B0D0F] flex items-center gap-1"
                  >
                    <FloppyDisk size={13} />
                    <span>{isSaving ? 'Saving…' : 'Save'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={
                      isTogglingStatus ||
                      (selectedWorkflow.status !== 'active' &&
                        Boolean(validationReport && !validationReport.canActivate))
                    }
                    onClick={() => void handleToggleActive()}
                    title={
                      selectedWorkflow.status !== 'active' &&
                      validationReport &&
                      !validationReport.canActivate
                        ? 'Fix validation errors before activating'
                        : undefined
                    }
                    className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 transition-colors ${
                      selectedWorkflow.status === 'active'
                        ? 'bg-amber-600 hover:bg-amber-700 text-white'
                        : 'bg-[#0F766E] hover:bg-[#115E59] text-white'
                    }`}
                  >
                    {selectedWorkflow.status === 'active' ? (
                      <>
                        <Pause size={13} weight="fill" />
                        <span>Deactivate</span>
                      </>
                    ) : (
                      <>
                        <Play size={13} weight="fill" />
                        <span>Activate</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Banners */}
      {(bannerError || bannerNotice) && (
        <div className="px-4 pt-2.5 space-y-1.5">
          {bannerError && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2 text-xs text-rose-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <WarningCircle size={15} weight="fill" className="text-rose-600 shrink-0" />
                <span>{bannerError}</span>
              </div>
              <button
                type="button"
                onClick={() => setBannerError(null)}
                className="font-semibold text-rose-700"
              >
                Dismiss
              </button>
            </div>
          )}
          {bannerNotice && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2 text-xs text-emerald-900 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle size={15} weight="fill" className="text-emerald-600 shrink-0" />
                <span>{bannerNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setBannerNotice(null)}
                className="font-semibold text-emerald-700"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* EMPTY STATE                                                        */}
      {/* ================================================================== */}
      {!isLoading && workflows.length === 0 && viewMode === 'editor' ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-lg w-full rounded-2xl bg-white border border-black/[0.08] p-8 text-center space-y-5 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-[#0F766E]/10 text-[#0F766E] flex items-center justify-center mx-auto">
              <FlowArrow size={24} weight="duotone" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg font-display font-semibold text-[#0B0D0F]">
                Automate Actions When Responses Arrive
              </h2>
              <p className="text-xs text-[#5C6066] leading-relaxed">
                Connect triggers, AND/OR condition branches, notifications, emails, status & tag
                updates, follow-up tasks, and signed webhooks—executed reliably on the backend.
              </p>
            </div>
            {!isReadOnly && (
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => void handleCreateExampleTemplate()}
                  className="h-9 px-4 rounded-lg bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Sparkle size={14} weight="fill" />
                  <span>Load Working Example Workflow</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateBlank()}
                  className="h-9 px-4 rounded-lg bg-[#F7F6F3] hover:bg-[#EAE7E1] border border-black/[0.08] text-[#0B0D0F] text-xs font-semibold flex items-center gap-1.5"
                >
                  <Plus size={14} weight="bold" />
                  <span>Start Blank Workflow</span>
                </button>
              </div>
            )}
          </div>
        </div>
      ) : viewMode === 'editor' && selectedWorkflow ? (
        /* ================================================================ */
        /* VIEW 1: VISUAL NODE-GRAPH BUILDER                                */
        /* ================================================================ */
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left Palette (Desktop) */}
          <aside className="hidden lg:flex lg:w-60 bg-white border-r border-black/[0.08] flex-col overflow-y-auto shrink-0">
            <div className="p-3.5 border-b border-black/[0.06] space-y-2">
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[#5C6066]">
                Workflow Name
              </label>
              <input
                type="text"
                value={draftName}
                readOnly={isReadOnly}
                onChange={(e) => {
                  setDraftName(e.target.value);
                  setIsDirty(true);
                }}
                className="w-full h-8 px-2.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs font-semibold text-[#0B0D0F]"
              />
              {validationReport && (
                <div
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium flex items-center gap-1.5 border ${
                    validationReport.valid
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}
                >
                  {validationReport.valid ? (
                    <>
                      <CheckCircle size={13} weight="fill" />
                      <span>Valid · Ready to activate</span>
                    </>
                  ) : (
                    <>
                      <WarningCircle size={13} weight="fill" />
                      <span>
                        {validationReport.errors.length} issue
                        {validationReport.errors.length === 1 ? '' : 's'} to fix
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="p-3 space-y-4">
              {(['trigger', 'condition', 'action'] as const).map((cat) => (
                <div key={cat} className="space-y-1.5">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[#5C6066] px-1">
                    {cat === 'trigger'
                      ? 'Triggers'
                      : cat === 'condition'
                        ? 'Conditions'
                        : 'Actions'}
                  </div>
                  {WORKFLOW_NODE_CATALOG.filter((item) => item.category === cat).map((item) => {
                    const Icon = NODE_ICONS[item.type] || FlowArrow;
                    return (
                      <button
                        key={item.type}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => handleAddNode(item.type)}
                        className="w-full text-left px-2.5 py-2 rounded-xl border border-black/[0.07] bg-[#FAF9F7] hover:bg-white hover:border-[#0F766E]/40 transition-all flex items-center gap-2 disabled:opacity-40"
                      >
                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                            cat === 'trigger'
                              ? 'bg-[#0F766E]/12 text-[#0F766E]'
                              : cat === 'condition'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-[#0B0D0F]/8 text-[#0B0D0F]'
                          }`}
                        >
                          <Icon size={13} weight="duotone" />
                        </div>
                        <span className="text-[11px] font-semibold text-[#0B0D0F] truncate">
                          {item.shortLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </aside>

          {/* Center Interactive Canvas + Optional Test Runner Drawer */}
          <div className="flex-1 flex flex-col overflow-hidden relative">
            {/* Canvas Floating Controls */}
            <div className="px-3 py-2 bg-white/90 border-b border-black/[0.06] flex flex-wrap items-center justify-between gap-2 z-10">
              <div className="flex items-center gap-1.5">
                {/* Mobile Step List vs Canvas switcher */}
                <div className="flex lg:hidden items-center gap-0.5 p-0.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08]">
                  <button
                    type="button"
                    onClick={() => setMobileLayout('list')}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 ${
                      mobileLayout === 'list' ? 'bg-white text-[#0B0D0F] shadow-xs' : 'text-[#5C6066]'
                    }`}
                  >
                    <ListBullets size={13} />
                    <span>Steps</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileLayout('canvas')}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 ${
                      mobileLayout === 'canvas' ? 'bg-white text-[#0B0D0F] shadow-xs' : 'text-[#5C6066]'
                    }`}
                  >
                    <Graph size={13} />
                    <span>Canvas</span>
                  </button>
                </div>

                {connectingFrom ? (
                  <div className="px-2.5 py-1 rounded-lg bg-[#0F766E] text-white text-[11px] font-semibold flex items-center gap-2">
                    <span>
                      Click target node to connect ({connectingFrom.branch.toUpperCase()} branch)
                    </span>
                    <button
                      type="button"
                      onClick={() => setConnectingFrom(null)}
                      className="underline text-white/90"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] text-[#5C6066] hidden sm:inline">
                    Drag nodes to arrange · Click an output port to connect · Drag background to pan
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}
                  className="w-7 h-7 rounded-lg bg-[#F7F6F3] hover:bg-[#EAE7E1] flex items-center justify-center text-[#0B0D0F]"
                  title="Zoom out"
                >
                  <MagnifyingGlassMinus size={14} />
                </button>
                <span className="text-[11px] font-mono w-10 text-center text-[#0B0D0F]">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(1.5, Number((z + 0.1).toFixed(2))))}
                  className="w-7 h-7 rounded-lg bg-[#F7F6F3] hover:bg-[#EAE7E1] flex items-center justify-center text-[#0B0D0F]"
                  title="Zoom in"
                >
                  <MagnifyingGlassPlus size={14} />
                </button>
                <button
                  type="button"
                  onClick={handleAutoLayout}
                  disabled={isReadOnly}
                  className="h-7 px-2.5 rounded-lg bg-[#F7F6F3] hover:bg-[#EAE7E1] text-[11px] font-semibold text-[#0B0D0F] flex items-center gap-1 disabled:opacity-40"
                >
                  <ArrowsOutSimple size={13} />
                  <span className="hidden sm:inline">Auto-Layout</span>
                </button>
              </div>
            </div>

            {/* Mobile Step List View (practical mobile experience on < lg) */}
            <div
              className={`${
                mobileLayout === 'list' ? 'block lg:hidden' : 'hidden'
              } flex-1 overflow-y-auto p-4 space-y-3`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#0B0D0F]">
                  Workflow Steps ({draftNodes.length})
                </span>
                {!isReadOnly && (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddNode(e.target.value as WorkflowNodeType);
                        e.target.value = '';
                      }
                    }}
                    className="h-8 px-2 rounded-lg bg-white border border-black/[0.1] text-xs font-semibold"
                  >
                    <option value="">+ Add Node…</option>
                    {WORKFLOW_NODE_CATALOG.map((item) => (
                      <option key={item.type} value={item.type}>
                        [{item.category}] {item.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {draftNodes.map((node) => {
                const Icon = NODE_ICONS[node.type] || FlowArrow;
                const trace = traceByNodeId.get(node.id);
                const nodeErrors = errorsByNodeId.get(node.id) || [];
                const outgoing = draftEdges.filter((e) => e.sourceNodeId === node.id);
                return (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNodeId(node.id)}
                    className={`rounded-xl bg-white p-3.5 border space-y-2 ${
                      selectedNodeId === node.id
                        ? 'border-[#0F766E] shadow-xs'
                        : 'border-black/[0.08]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon size={15} weight="duotone" className="text-[#0F766E] shrink-0" />
                        <span className="text-xs font-semibold text-[#0B0D0F] truncate">
                          {node.label}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono uppercase text-[#5C6066]">
                        {node.category}
                      </span>
                    </div>
                    {outgoing.length > 0 && (
                      <div className="text-[11px] text-[#5C6066]">
                        Connects to:{' '}
                        {outgoing
                          .map((e) => {
                            const t = draftNodes.find((n) => n.id === e.targetNodeId);
                            return `${e.branch !== 'default' ? `[${e.branch.toUpperCase()}] ` : ''}${t?.label || e.targetNodeId}`;
                          })
                          .join(', ')}
                      </div>
                    )}
                    {nodeErrors.length > 0 && (
                      <div className="text-[11px] text-rose-700">{nodeErrors[0]}</div>
                    )}
                    {trace && (
                      <div className="text-[11px] font-mono text-[#0F766E]">
                        Test: {trace.status} {trace.outputSummary ? `— ${trace.outputSummary}` : ''}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop + Mobile Canvas View */}
            <div
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerLeave={handleCanvasPointerUp}
              className={`${
                mobileLayout === 'canvas' ? 'flex' : 'hidden lg:flex'
              } flex-1 relative overflow-hidden select-none cursor-grab active:cursor-grabbing`}
              style={{
                backgroundImage:
                  'radial-gradient(rgba(11, 13, 15, 0.14) 1px, transparent 1px)',
                backgroundSize: `${22 * zoom}px ${22 * zoom}px`,
                backgroundPosition: `${pan.x}px ${pan.y}px`,
              }}
            >
              <div
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: '0 0',
                  width: 2400,
                  height: 1600,
                  position: 'relative',
                }}
              >
                {/* SVG Edges Layer */}
                <svg
                  width={2400}
                  height={1600}
                  className="absolute inset-0 pointer-events-none overflow-visible"
                >
                  {draftEdges.map((edge) => {
                    const src = draftNodes.find((n) => n.id === edge.sourceNodeId);
                    const dst = draftNodes.find((n) => n.id === edge.targetNodeId);
                    if (!src || !dst) return null;

                    const x1 = src.position.x + NODE_WIDTH;
                    const y1 =
                      src.position.y +
                      (edge.branch === 'true'
                        ? NODE_HEIGHT * 0.36
                        : edge.branch === 'false'
                          ? NODE_HEIGHT * 0.72
                          : NODE_HEIGHT * 0.5);
                    const x2 = dst.position.x;
                    const y2 = dst.position.y + NODE_HEIGHT * 0.5;
                    const dx = Math.max(60, Math.abs(x2 - x1) * 0.45);
                    const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

                    const stroke =
                      edge.branch === 'true'
                        ? '#0F766E'
                        : edge.branch === 'false'
                          ? '#D97706'
                          : '#64748B';
                    const midX = (x1 + x2) / 2;
                    const midY = (y1 + y2) / 2;

                    return (
                      <g key={edge.id}>
                        <path
                          d={pathD}
                          fill="none"
                          stroke={stroke}
                          strokeWidth={2.2}
                          strokeDasharray={edge.branch === 'false' ? '6 4' : undefined}
                        />
                        <circle cx={x2} cy={y2} r={4} fill={stroke} />
                        <foreignObject
                          x={midX - 34}
                          y={midY - 12}
                          width={68}
                          height={24}
                          className="pointer-events-auto overflow-visible"
                        >
                          <div className="flex items-center justify-center">
                            <button
                              type="button"
                              disabled={isReadOnly}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                handleDeleteEdge(edge.id);
                              }}
                              title="Remove connection"
                              className="px-1.5 py-0.5 rounded-md bg-white border border-black/15 text-[10px] font-mono font-semibold text-[#0B0D0F] hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 shadow-xs"
                            >
                              {edge.branch === 'true'
                                ? 'TRUE ×'
                                : edge.branch === 'false'
                                  ? 'FALSE ×'
                                  : '×'}
                            </button>
                          </div>
                        </foreignObject>
                      </g>
                    );
                  })}
                </svg>

                {/* Draggable Node Cards */}
                {draftNodes.map((node) => {
                  const Icon = NODE_ICONS[node.type] || FlowArrow;
                  const isSelected = node.id === selectedNodeId;
                  const nodeErrors = errorsByNodeId.get(node.id) || [];
                  const trace = traceByNodeId.get(node.id);
                  const isConnectTarget =
                    Boolean(connectingFrom) &&
                    connectingFrom?.nodeId !== node.id &&
                    node.category !== 'trigger';

                  const accentBar =
                    node.category === 'trigger'
                      ? 'bg-[#0F766E]'
                      : node.category === 'condition'
                        ? 'bg-amber-500'
                        : 'bg-[#0B0D0F]';

                  return (
                    <div
                      key={node.id}
                      onPointerDown={(e) => handleNodePointerDown(e, node)}
                      style={{
                        left: node.position.x,
                        top: node.position.y,
                        width: NODE_WIDTH,
                        minHeight: NODE_HEIGHT,
                      }}
                      className={`absolute rounded-2xl bg-white border transition-shadow overflow-hidden cursor-pointer ${
                        isSelected
                          ? 'border-[#0F766E] ring-2 ring-[#0F766E]/20 shadow-md'
                          : isConnectTarget
                            ? 'border-[#0F766E] ring-2 ring-[#0F766E]/35 shadow-sm'
                            : nodeErrors.length > 0
                              ? 'border-rose-400 shadow-xs'
                              : 'border-black/[0.1] shadow-xs hover:shadow-sm'
                      }`}
                    >
                      <div className={`h-1.5 w-full ${accentBar}`} />

                      <div className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-[#F7F6F3] flex items-center justify-center text-[#0B0D0F] shrink-0">
                              <Icon size={15} weight="duotone" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-[10px] font-mono uppercase tracking-wider text-[#5C6066]">
                                {node.category}
                              </div>
                              <div className="text-xs font-semibold text-[#0B0D0F] truncate">
                                {node.label}
                              </div>
                            </div>
                          </div>

                          {!isReadOnly && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDuplicateNode(node.id);
                                }}
                                className="w-6 h-6 rounded-md text-[#5C6066] hover:text-[#0B0D0F] hover:bg-[#F7F6F3] flex items-center justify-center"
                                title="Duplicate node"
                              >
                                <Copy size={12} />
                              </button>
                              <button
                                type="button"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteNode(node.id);
                                }}
                                className="w-6 h-6 rounded-md text-[#5C6066] hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center"
                                title="Delete node"
                              >
                                <Trash size={12} />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Test Status / Validation Indicator */}
                        {trace && (
                          <div
                            className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold flex items-center justify-between ${
                              trace.status === 'succeeded'
                                ? 'bg-emerald-50 text-emerald-700'
                                : trace.status === 'failed'
                                  ? 'bg-rose-50 text-rose-700'
                                  : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            <span>
                              {trace.status === 'succeeded'
                                ? '✓ Passed'
                                : trace.status === 'failed'
                                  ? '✕ Failed'
                                  : '⊘ Skipped'}
                            </span>
                            {trace.branchTaken && trace.branchTaken !== 'default' && (
                              <span className="uppercase">{trace.branchTaken}</span>
                            )}
                          </div>
                        )}

                        {nodeErrors.length > 0 && !trace && (
                          <div className="text-[10px] text-rose-600 truncate font-medium">
                            ! {nodeErrors[0]}
                          </div>
                        )}

                        {/* Output Connection Ports */}
                        {!isReadOnly && (
                          <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-black/[0.05]">
                            {node.category === 'condition' ? (
                              <>
                                <button
                                  type="button"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConnectingFrom({ nodeId: node.id, branch: 'true' });
                                  }}
                                  className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-semibold"
                                >
                                  True →
                                </button>
                                <button
                                  type="button"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConnectingFrom({ nodeId: node.id, branch: 'false' });
                                  }}
                                  className="px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-semibold"
                                >
                                  False →
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConnectingFrom({ nodeId: node.id, branch: 'default' });
                                }}
                                className="px-2 py-0.5 rounded-md bg-[#F7F6F3] hover:bg-[#EAE7E1] text-[#0B0D0F] border border-black/[0.08] text-[10px] font-semibold"
                              >
                                Connect →
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Collapsible Isolated Test Runner Drawer */}
            {isTestDrawerOpen && (
              <div className="border-t border-black/[0.1] bg-white p-4 space-y-3 max-h-72 overflow-y-auto shadow-lg z-20">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-display font-semibold text-[#0B0D0F]">
                      Isolated Test Execution (Separated from Live Runs)
                    </h3>
                    <p className="text-[11px] text-[#5C6066]">
                      Simulate a submission with sample answers, score, and outcome to inspect
                      branches and node outcomes.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isRunningTest || isReadOnly}
                      onClick={() => void handleRunTest()}
                      className="h-8 px-3.5 rounded-lg bg-[#0F766E] hover:bg-[#115E59] disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Play size={13} weight="fill" />
                      <span>{isRunningTest ? 'Running Test…' : 'Run Isolated Test'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsTestDrawerOpen(false)}
                      className="text-xs text-[#5C6066] hover:text-[#0B0D0F]"
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {fieldCatalog.slice(0, 4).map((f) => (
                    <div key={f.id}>
                      <label className="block text-[10px] font-semibold text-[#5C6066] truncate mb-0.5">
                        {f.label}
                      </label>
                      <input
                        type="text"
                        value={sampleAnswers[f.id] ?? ''}
                        onChange={(e) =>
                          setSampleAnswers((prev) => ({ ...prev, [f.id]: e.target.value }))
                        }
                        className="w-full h-8 px-2.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs"
                      />
                    </div>
                  ))}
                  <div>
                    <label className="block text-[10px] font-semibold text-[#5C6066] mb-0.5">
                      Sample Score
                    </label>
                    <input
                      type="number"
                      value={sampleScore}
                      onChange={(e) => setSampleScore(e.target.value)}
                      className="w-full h-8 px-2.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-[#5C6066] mb-0.5">
                      Sample Outcome (optional)
                    </label>
                    <input
                      type="text"
                      value={sampleOutcomeName}
                      onChange={(e) => setSampleOutcomeName(e.target.value)}
                      placeholder="e.g. Qualified Lead"
                      className="w-full h-8 px-2.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs"
                    />
                  </div>
                </div>

                {latestTestRun && (
                  <div className="rounded-xl bg-[#FAF9F7] border border-black/[0.07] p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="font-semibold text-[#0B0D0F]">
                        Latest Test Trace · {latestTestRun.status.toUpperCase()} (
                        {latestTestRun.durationMs ?? 0}ms)
                      </span>
                      <span className="text-[#5C6066]">{latestTestRun.runId}</span>
                    </div>
                    <div className="space-y-1">
                      {latestTestRun.nodeTraces.map((tr) => (
                        <div
                          key={`${tr.nodeId}_${tr.startedAt}`}
                          className="text-[11px] flex flex-wrap items-center gap-2"
                        >
                          <span
                            className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold ${
                              tr.status === 'succeeded'
                                ? 'bg-emerald-100 text-emerald-800'
                                : tr.status === 'failed'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {tr.status}
                          </span>
                          <span className="font-semibold text-[#0B0D0F]">{tr.nodeLabel}</span>
                          {tr.conditionSummary && (
                            <span className="text-[#5C6066] font-mono text-[10px]">
                              ({tr.conditionSummary})
                            </span>
                          )}
                          {tr.outputSummary && (
                            <span className="text-[#5C6066]">— {tr.outputSummary}</span>
                          )}
                          {tr.errorMessage && (
                            <span className="text-rose-700 font-medium">— {tr.errorMessage}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Node Inspector */}
          <aside className="w-full lg:w-80 bg-white border-t lg:border-t-0 lg:border-l border-black/[0.08] overflow-y-auto shrink-0 p-4 space-y-4">
            {!selectedNode ? (
              <div className="space-y-4">
                <div className="text-xs font-semibold text-[#0B0D0F]">Workflow Validation</div>
                {validationReport && validationReport.errors.length > 0 ? (
                  <div className="space-y-1.5">
                    {validationReport.errors.map((err) => (
                      <button
                        key={err.id}
                        type="button"
                        onClick={() => err.nodeId && setSelectedNodeId(err.nodeId)}
                        className="w-full text-left p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800"
                      >
                        {err.message}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#5C6066]">
                    Select a node on the canvas to configure its settings, conditions, or action
                    parameters.
                  </p>
                )}

                {!isReadOnly && (
                  <div className="pt-4 border-t border-black/[0.06]">
                    <button
                      type="button"
                      onClick={() => void handleDeleteWorkflow()}
                      className="h-8 px-3 rounded-lg border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-50 flex items-center gap-1.5"
                    >
                      <Trash size={13} />
                      <span>Delete Workflow</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2 pb-3 border-b border-black/[0.06]">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-[#0F766E]">
                      {selectedNode.category} Inspector
                    </div>
                    <h3 className="text-sm font-display font-semibold text-[#0B0D0F]">
                      {getWorkflowNodeMeta(selectedNode.type).label}
                    </h3>
                  </div>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => handleDeleteNode(selectedNode.id)}
                      className="w-7 h-7 rounded-lg text-[#5C6066] hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center"
                      title="Delete node"
                    >
                      <Trash size={14} />
                    </button>
                  )}
                </div>

                {/* Common Node Label */}
                <div>
                  <label className="block text-[11px] font-semibold text-[#0B0D0F] mb-1">
                    Node Label
                  </label>
                  <input
                    type="text"
                    value={selectedNode.label}
                    readOnly={isReadOnly}
                    onChange={(e) =>
                      updateSelectedNode((n) => ({ ...n, label: e.target.value }))
                    }
                    className="w-full h-9 px-3 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs text-[#0B0D0F]"
                  />
                </div>

                {/* Trigger-specific settings */}
                {selectedNode.type === 'trigger_outcome_achieved' && (
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-[#0B0D0F]">
                      Target Outcome Name or ID
                    </label>
                    {outcomeOptions.length > 0 && (
                      <select
                        value={selectedNode.config.outcomeId || ''}
                        disabled={isReadOnly}
                        onChange={(e) => {
                          const match = outcomeOptions.find((o) => o.id === e.target.value);
                          updateSelectedNode((n) => ({
                            ...n,
                            config: {
                              ...n.config,
                              outcomeId: e.target.value,
                              outcomeName: match?.name || n.config.outcomeName,
                            },
                          }));
                        }}
                        className="w-full h-9 px-2.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs"
                      >
                        <option value="">Choose configured outcome…</option>
                        {outcomeOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      type="text"
                      value={selectedNode.config.outcomeName || ''}
                      readOnly={isReadOnly}
                      placeholder="Outcome name (e.g. Qualified Lead)"
                      onChange={(e) =>
                        updateSelectedNode((n) => ({
                          ...n,
                          config: { ...n.config, outcomeName: e.target.value },
                        }))
                      }
                      className="w-full h-9 px-3 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs"
                    />
                  </div>
                )}

                {selectedNode.type === 'trigger_response_matches' &&
                  renderConditionGroupEditor(
                    selectedNode.config.triggerConditionGroup ||
                      createDefaultConditionGroup(fieldCatalog[0]?.id || ''),
                    (nextGroup) =>
                      updateSelectedNode((n) => ({
                        ...n,
                        config: { ...n.config, triggerConditionGroup: nextGroup },
                      }))
                  )}

                {/* Condition Branch Settings */}
                {selectedNode.type === 'condition_branch' &&
                  renderConditionGroupEditor(
                    selectedNode.config.conditionGroup ||
                      createDefaultConditionGroup(fieldCatalog[0]?.id || ''),
                    (nextGroup) =>
                      updateSelectedNode((n) => ({
                        ...n,
                        config: { ...n.config, conditionGroup: nextGroup },
                      }))
                  )}

                {/* Action: Send Email */}
                {selectedNode.type === 'action_send_email' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#0B0D0F] mb-1">
                        Recipient Email (supports {'{{field}}'})
                      </label>
                      <input
                        type="text"
                        value={selectedNode.config.emailTo || ''}
                        readOnly={isReadOnly}
                        onChange={(e) =>
                          updateSelectedNode((n) => ({
                            ...n,
                            config: { ...n.config, emailTo: e.target.value },
                          }))
                        }
                        placeholder="ops@example.com or {{email}}"
                        className="w-full h-9 px-3 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#0B0D0F] mb-1">
                        Subject
                      </label>
                      <input
                        type="text"
                        value={selectedNode.config.emailSubject || ''}
                        readOnly={isReadOnly}
                        onChange={(e) =>
                          updateSelectedNode((n) => ({
                            ...n,
                            config: { ...n.config, emailSubject: e.target.value },
                          }))
                        }
                        className="w-full h-9 px-3 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#0B0D0F] mb-1">
                        Body
                      </label>
                      <textarea
                        rows={4}
                        value={selectedNode.config.emailBody || ''}
                        readOnly={isReadOnly}
                        onChange={(e) =>
                          updateSelectedNode((n) => ({
                            ...n,
                            config: { ...n.config, emailBody: e.target.value },
                          }))
                        }
                        className="w-full p-2.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs"
                      />
                    </div>
                  </div>
                )}

                {/* Action: Send Notification */}
                {selectedNode.type === 'action_send_notification' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#0B0D0F] mb-1">
                        Title
                      </label>
                      <input
                        type="text"
                        value={selectedNode.config.notificationTitle || ''}
                        readOnly={isReadOnly}
                        onChange={(e) =>
                          updateSelectedNode((n) => ({
                            ...n,
                            config: { ...n.config, notificationTitle: e.target.value },
                          }))
                        }
                        className="w-full h-9 px-3 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#0B0D0F] mb-1">
                        Message (supports {'{{field}}'}, {'{{score}}'}, {'{{outcome}}'})
                      </label>
                      <textarea
                        rows={3}
                        value={selectedNode.config.notificationMessage || ''}
                        readOnly={isReadOnly}
                        onChange={(e) =>
                          updateSelectedNode((n) => ({
                            ...n,
                            config: { ...n.config, notificationMessage: e.target.value },
                          }))
                        }
                        className="w-full p-2.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#0B0D0F] mb-1">
                          Severity
                        </label>
                        <select
                          value={selectedNode.config.notificationSeverity || 'info'}
                          disabled={isReadOnly}
                          onChange={(e) =>
                            updateSelectedNode((n) => ({
                              ...n,
                              config: {
                                ...n.config,
                                notificationSeverity: e.target.value as
                                  | 'info'
                                  | 'success'
                                  | 'warning',
                              },
                            }))
                          }
                          className="w-full h-8 px-2 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs"
                        >
                          <option value="info">Info</option>
                          <option value="success">Success</option>
                          <option value="warning">Warning</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#0B0D0F] mb-1">
                          Channel
                        </label>
                        <select
                          value={selectedNode.config.notificationChannel || 'workspace'}
                          disabled={isReadOnly}
                          onChange={(e) =>
                            updateSelectedNode((n) => ({
                              ...n,
                              config: {
                                ...n.config,
                                notificationChannel: e.target.value as
                                  | 'workspace'
                                  | 'slack_integration',
                              },
                            }))
                          }
                          className="w-full h-8 px-2 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs"
                        >
                          <option value="workspace">Workspace Alert</option>
                          <option value="slack_integration">Slack Integration</option>
                        </select>
                      </div>
                    </div>
                    {selectedNode.config.notificationChannel === 'slack_integration' && (
                      <select
                        value={selectedNode.config.slackIntegrationId || ''}
                        disabled={isReadOnly}
                        onChange={(e) =>
                          updateSelectedNode((n) => ({
                            ...n,
                            config: { ...n.config, slackIntegrationId: e.target.value },
                          }))
                        }
                        className="w-full h-9 px-2.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs"
                      >
                        <option value="">Select Slack integration…</option>
                        {integrations
                          .filter((i) => i.providerId === 'slack_webhook')
                          .map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name} ({i.status})
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                )}

                {/* Action: Assign Response Status */}
                {selectedNode.type === 'action_assign_response_status' && (
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-[#0B0D0F]">
                      Response Status
                    </label>
                    <select
                      value={
                        RESPONSE_STATUS_PRESETS.includes(selectedNode.config.responseStatus || '')
                          ? selectedNode.config.responseStatus
                          : '__custom__'
                      }
                      disabled={isReadOnly}
                      onChange={(e) => {
                        if (e.target.value !== '__custom__') {
                          updateSelectedNode((n) => ({
                            ...n,
                            config: { ...n.config, responseStatus: e.target.value },
                          }));
                        }
                      }}
                      className="w-full h-9 px-2.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs"
                    >
                      {RESPONSE_STATUS_PRESETS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                      <option value="__custom__">Custom status…</option>
                    </select>
                    <input
                      type="text"
                      value={selectedNode.config.responseStatus || ''}
                      readOnly={isReadOnly}
                      onChange={(e) =>
                        updateSelectedNode((n) => ({
                          ...n,
                          config: { ...n.config, responseStatus: e.target.value },
                        }))
                      }
                      className="w-full h-9 px-3 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs font-mono"
                    />
                  </div>
                )}

                {/* Action: Apply Tags */}
                {selectedNode.type === 'action_apply_tag' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-[#0B0D0F] mb-1">
                      Tags / Categories (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={(selectedNode.config.tags || []).join(', ')}
                      readOnly={isReadOnly}
                      onChange={(e) =>
                        updateSelectedNode((n) => ({
                          ...n,
                          config: {
                            ...n.config,
                            tags: e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean),
                          },
                        }))
                      }
                      placeholder="Enterprise, Priority, Follow-Up"
                      className="w-full h-9 px-3 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs"
                    />
                  </div>
                )}

                {/* Action: Update Response Field */}
                {selectedNode.type === 'action_update_response_field' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#0B0D0F] mb-1">
                        Target Field
                      </label>
                      <select
                        value={selectedNode.config.targetFieldId || ''}
                        disabled={isReadOnly}
                        onChange={(e) =>
                          updateSelectedNode((n) => ({
                            ...n,
                            config: { ...n.config, targetFieldId: e.target.value },
                          }))
                        }
                        className="w-full h-9 px-2.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs"
                      >
                        <option value="">Select field…</option>
                        {fieldCatalog.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#0B0D0F] mb-1">
                        New Value (supports {'{{field}}'})
                      </label>
                      <input
                        type="text"
                        value={selectedNode.config.targetFieldValue || ''}
                        readOnly={isReadOnly}
                        onChange={(e) =>
                          updateSelectedNode((n) => ({
                            ...n,
                            config: { ...n.config, targetFieldValue: e.target.value },
                          }))
                        }
                        className="w-full h-9 px-3 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs"
                      />
                    </div>
                  </div>
                )}

                {/* Action: Create Task */}
                {selectedNode.type === 'action_create_task' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#0B0D0F] mb-1">
                        Task Title
                      </label>
                      <input
                        type="text"
                        value={selectedNode.config.taskTitle || ''}
                        readOnly={isReadOnly}
                        onChange={(e) =>
                          updateSelectedNode((n) => ({
                            ...n,
                            config: { ...n.config, taskTitle: e.target.value },
                          }))
                        }
                        className="w-full h-9 px-3 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#0B0D0F] mb-1">
                        Description
                      </label>
                      <textarea
                        rows={3}
                        value={selectedNode.config.taskDescription || ''}
                        readOnly={isReadOnly}
                        onChange={(e) =>
                          updateSelectedNode((n) => ({
                            ...n,
                            config: { ...n.config, taskDescription: e.target.value },
                          }))
                        }
                        className="w-full p-2.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#0B0D0F] mb-1">
                          Priority
                        </label>
                        <select
                          value={selectedNode.config.taskPriority || 'medium'}
                          disabled={isReadOnly}
                          onChange={(e) =>
                            updateSelectedNode((n) => ({
                              ...n,
                              config: {
                                ...n.config,
                                taskPriority: e.target.value as
                                  | 'low'
                                  | 'medium'
                                  | 'high'
                                  | 'urgent',
                              },
                            }))
                          }
                          className="w-full h-8 px-2 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#0B0D0F] mb-1">
                          Due In (Days)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={selectedNode.config.taskDueInDays ?? 2}
                          readOnly={isReadOnly}
                          onChange={(e) =>
                            updateSelectedNode((n) => ({
                              ...n,
                              config: {
                                ...n.config,
                                taskDueInDays: Number(e.target.value) || 1,
                              },
                            }))
                          }
                          className="w-full h-8 px-2.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs font-mono"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#0B0D0F] mb-1">
                        Assignee (optional)
                      </label>
                      <input
                        type="text"
                        value={selectedNode.config.taskAssignee || ''}
                        readOnly={isReadOnly}
                        placeholder="e.g. Sales Ops"
                        onChange={(e) =>
                          updateSelectedNode((n) => ({
                            ...n,
                            config: { ...n.config, taskAssignee: e.target.value },
                          }))
                        }
                        className="w-full h-8 px-2.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs"
                      />
                    </div>
                  </div>
                )}

                {/* Action: Send Webhook */}
                {selectedNode.type === 'action_send_webhook' && (
                  <div className="space-y-3">
                    {integrations.length > 0 && (
                      <div>
                        <label className="block text-[11px] font-semibold text-[#0B0D0F] mb-1">
                          Use Connected Integration (optional)
                        </label>
                        <select
                          value={selectedNode.config.integrationId || ''}
                          disabled={isReadOnly}
                          onChange={(e) =>
                            updateSelectedNode((n) => ({
                              ...n,
                              config: { ...n.config, integrationId: e.target.value || undefined },
                            }))
                          }
                          className="w-full h-9 px-2.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs"
                        >
                          <option value="">Or specify direct HTTPS URL below…</option>
                          {integrations.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name} ({i.providerId})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {!selectedNode.config.integrationId && (
                      <div>
                        <label className="block text-[11px] font-semibold text-[#0B0D0F] mb-1">
                          Direct HTTPS Webhook URL
                        </label>
                        <input
                          type="url"
                          value={selectedNode.config.webhookUrl || ''}
                          readOnly={isReadOnly}
                          placeholder="https://api.yourdomain.com/webhook"
                          onChange={(e) =>
                            updateSelectedNode((n) => ({
                              ...n,
                              config: { ...n.config, webhookUrl: e.target.value },
                            }))
                          }
                          className="w-full h-9 px-3 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs font-mono"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-[11px] font-semibold text-[#0B0D0F] mb-1">
                        Custom Note (optional)
                      </label>
                      <input
                        type="text"
                        value={selectedNode.config.webhookCustomNote || ''}
                        readOnly={isReadOnly}
                        onChange={(e) =>
                          updateSelectedNode((n) => ({
                            ...n,
                            config: { ...n.config, webhookCustomNote: e.target.value },
                          }))
                        }
                        className="w-full h-8 px-2.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs"
                      />
                    </div>
                  </div>
                )}

                {/* Action: Connected Service */}
                {selectedNode.type === 'action_connected_service' && (
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-[#0B0D0F]">
                      Connected Integration Service
                    </label>
                    <select
                      value={selectedNode.config.integrationId || ''}
                      disabled={isReadOnly}
                      onChange={(e) =>
                        updateSelectedNode((n) => ({
                          ...n,
                          config: { ...n.config, integrationId: e.target.value },
                        }))
                      }
                      className="w-full h-9 px-2.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs"
                    >
                      <option value="">Choose an integration from Integrations tab…</option>
                      {integrations.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} — {i.status}
                        </option>
                      ))}
                    </select>
                    {integrations.length === 0 && (
                      <p className="text-[11px] text-[#5C6066]">
                        Configure a Slack, REST API, or Webhook connection in the Integrations tab
                        first.
                      </p>
                    )}
                  </div>
                )}

                {/* Selected Node Validation Errors */}
                {(errorsByNodeId.get(selectedNode.id) || []).length > 0 && (
                  <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 space-y-1">
                    {(errorsByNodeId.get(selectedNode.id) || []).map((msg, idx) => (
                      <div key={idx} className="text-[11px] text-rose-800 flex items-start gap-1.5">
                        <XCircle size={13} weight="fill" className="text-rose-600 shrink-0 mt-0.5" />
                        <span>{msg}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Selected Node Test Trace */}
                {traceByNodeId.get(selectedNode.id) && (
                  <div className="rounded-xl bg-[#FAF9F7] border border-black/[0.08] p-3 space-y-1 text-[11px]">
                    <div className="font-mono font-semibold text-[#0B0D0F]">
                      Last Test: {traceByNodeId.get(selectedNode.id)!.status.toUpperCase()}
                    </div>
                    {traceByNodeId.get(selectedNode.id)!.conditionSummary && (
                      <div className="font-mono text-[10px] text-[#5C6066]">
                        {traceByNodeId.get(selectedNode.id)!.conditionSummary}
                      </div>
                    )}
                    {traceByNodeId.get(selectedNode.id)!.outputSummary && (
                      <div className="text-[#0F766E]">
                        {traceByNodeId.get(selectedNode.id)!.outputSummary}
                      </div>
                    )}
                    {traceByNodeId.get(selectedNode.id)!.errorMessage && (
                      <div className="text-rose-700">
                        {traceByNodeId.get(selectedNode.id)!.errorMessage}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      ) : viewMode === 'history' ? (
        /* ================================================================ */
        /* VIEW 2: EXECUTION HISTORY (LIVE VS TEST CLEARLY SEPARATED)       */
        /* ================================================================ */
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          <div className="max-w-5xl mx-auto space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-display font-semibold text-[#0B0D0F]">
                  Workflow Execution History
                </h2>
                <p className="text-xs text-[#5C6066]">
                  Live executions are strictly separated from isolated test runs.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-white border border-black/[0.08] text-xs">
                  {(
                    [
                      { id: 'all', label: `All (${runs.length})` },
                      { id: 'live', label: `Live (${liveRunCount})` },
                      { id: 'test', label: `Test Runs (${testRunCount})` },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setHistoryFilter(f.id)}
                      className={`px-2.5 py-1 rounded-md font-semibold ${
                        historyFilter === f.id
                          ? 'bg-[#0B0D0F] text-white'
                          : 'text-[#5C6066] hover:text-[#0B0D0F]'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void loadState()}
                  className="h-8 px-2.5 rounded-lg bg-white border border-black/[0.08] text-xs font-medium flex items-center gap-1"
                >
                  <ArrowsClockwise size={13} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {filteredRuns.length === 0 ? (
              <div className="rounded-2xl bg-white border border-black/[0.08] p-10 text-center space-y-2">
                <ClockCountdown size={24} className="mx-auto text-[#5C6066]" />
                <p className="text-xs text-[#5C6066]">
                  No {historyFilter === 'all' ? '' : historyFilter} workflow runs recorded yet.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl bg-white border border-black/[0.08] divide-y divide-black/[0.06] overflow-hidden">
                {filteredRuns.map((run) => {
                  const badge = runStatusBadge(run.status);
                  const isExpanded = expandedRunId === run.runId;
                  const parentWf = workflows.find((w) => w.id === run.workflowId);
                  return (
                    <div key={run.runId} className="p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${badge.classes}`}
                          >
                            {badge.label}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold uppercase ${
                              run.mode === 'test'
                                ? 'bg-indigo-50 text-indigo-700'
                                : 'bg-[#0F766E]/10 text-[#0F766E]'
                            }`}
                          >
                            {run.mode}
                          </span>
                          <span className="text-xs font-semibold text-[#0B0D0F]">
                            {run.workflowName}
                          </span>
                          <span className="text-[11px] font-mono text-[#5C6066]">
                            · {new Date(run.startedAt).toLocaleString()}
                            {run.durationMs !== null && run.durationMs !== undefined
                              ? ` · ${run.durationMs}ms`
                              : ''}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {(run.status === 'running' || run.status === 'queued') && !isReadOnly && (
                            <button
                              type="button"
                              onClick={() => void handleCancelRun(run.runId)}
                              className="h-7 px-2.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-semibold flex items-center gap-1"
                            >
                              <StopCircle size={12} />
                              <span>Cancel</span>
                            </button>
                          )}
                          {run.status === 'failed' &&
                            parentWf?.status === 'active' &&
                            !isReadOnly && (
                              <button
                                type="button"
                                onClick={() => void handleToggleActive(parentWf)}
                                className="h-7 px-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-semibold"
                              >
                                Deactivate Failing Workflow
                              </button>
                            )}
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedRunId(isExpanded ? null : run.runId)
                            }
                            className="h-7 px-2 rounded-lg border border-black/[0.08] text-[11px] text-[#5C6066] hover:text-[#0B0D0F] flex items-center gap-1"
                          >
                            <span>Trace ({run.nodeTraces.length})</span>
                            {isExpanded ? <CaretUp size={12} /> : <CaretDown size={12} />}
                          </button>
                        </div>
                      </div>

                      {run.errorMessage && (
                        <div className="text-xs text-rose-700">{run.errorMessage}</div>
                      )}

                      {isExpanded && (
                        <div className="rounded-xl bg-[#FAF9F7] border border-black/[0.06] p-3 space-y-2 text-[11px]">
                          <div className="font-mono text-[10px] text-[#5C6066]">
                            Run ID: {run.runId} · Submission: {run.submissionId} · Idempotency:{' '}
                            {run.idempotencyKey}
                          </div>
                          {run.nodeTraces.map((tr) => (
                            <div
                              key={`${tr.nodeId}_${tr.startedAt}`}
                              className="p-2 rounded-lg bg-white border border-black/[0.06] space-y-0.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-[#0B0D0F]">
                                  {tr.nodeLabel}{' '}
                                  <span className="font-mono font-normal text-[#5C6066]">
                                    ({tr.nodeType})
                                  </span>
                                </span>
                                <span className="font-mono text-[10px] text-[#5C6066]">
                                  {tr.status.toUpperCase()} · {tr.durationMs}ms · {tr.attempts}{' '}
                                  attempt{tr.attempts === 1 ? '' : 's'}
                                </span>
                              </div>
                              {tr.conditionSummary && (
                                <div className="font-mono text-[10px] text-amber-800">
                                  Condition: {tr.conditionSummary}
                                </div>
                              )}
                              {tr.outputSummary && (
                                <div className="text-[#0F766E]">{tr.outputSummary}</div>
                              )}
                              {tr.errorMessage && (
                                <div className="text-rose-700">{tr.errorMessage}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ================================================================ */
        /* VIEW 3: GENERATED OUTPUTS (TASKS, NOTIFICATIONS, EMAILS, TAGS)   */
        /* ================================================================ */
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Follow-up Tasks */}
            <div className="rounded-2xl bg-white border border-black/[0.08] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-display font-semibold text-[#0B0D0F] flex items-center gap-2">
                  <ListChecks size={16} className="text-[#0F766E]" />
                  <span>Generated Follow-Up Tasks ({tasks.length})</span>
                </h3>
              </div>
              {tasks.length === 0 ? (
                <p className="text-xs text-[#5C6066]">No follow-up tasks generated yet.</p>
              ) : (
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-3 rounded-xl bg-[#FAF9F7] border border-black/[0.06] flex items-start gap-2.5"
                    >
                      <input
                        type="checkbox"
                        checked={task.completed}
                        disabled={isReadOnly}
                        onChange={() => void handleToggleTask(task)}
                        className="mt-0.5 rounded border-black/25 text-[#0F766E]"
                      />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div
                          className={`text-xs font-semibold ${
                            task.completed ? 'line-through text-[#5C6066]' : 'text-[#0B0D0F]'
                          }`}
                        >
                          {task.title}
                        </div>
                        {task.description && (
                          <p className="text-[11px] text-[#5C6066]">{task.description}</p>
                        )}
                        <div className="text-[10px] font-mono text-[#5C6066]">
                          {task.mode.toUpperCase()} · {task.priority.toUpperCase()}
                          {task.assignee ? ` · ${task.assignee}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notifications & Email Outbox */}
            <div className="space-y-5">
              <div className="rounded-2xl bg-white border border-black/[0.08] p-5 space-y-3">
                <h3 className="text-sm font-display font-semibold text-[#0B0D0F] flex items-center gap-2">
                  <Bell size={16} className="text-[#0F766E]" />
                  <span>Workspace Notifications ({notifications.length})</span>
                </h3>
                {notifications.length === 0 ? (
                  <p className="text-xs text-[#5C6066]">No notifications triggered yet.</p>
                ) : (
                  <div className="space-y-2">
                    {notifications.slice(0, 12).map((n) => (
                      <div
                        key={n.id}
                        className="p-3 rounded-xl bg-[#FAF9F7] border border-black/[0.06] space-y-0.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[#0B0D0F]">{n.title}</span>
                          <span className="text-[10px] font-mono uppercase text-[#5C6066]">
                            {n.mode}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#5C6066]">{n.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-white border border-black/[0.08] p-5 space-y-3">
                <h3 className="text-sm font-display font-semibold text-[#0B0D0F] flex items-center gap-2">
                  <EnvelopeSimple size={16} className="text-[#0F766E]" />
                  <span>Email Outbox ({emailOutbox.length})</span>
                </h3>
                {emailOutbox.length === 0 ? (
                  <p className="text-xs text-[#5C6066]">No emails dispatched yet.</p>
                ) : (
                  <div className="space-y-2">
                    {emailOutbox.slice(0, 10).map((eml) => (
                      <div
                        key={eml.id}
                        className="p-3 rounded-xl bg-[#FAF9F7] border border-black/[0.06] space-y-0.5"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-[#0B0D0F] truncate">
                            {eml.subject}
                          </span>
                          <span className="text-[10px] font-mono text-[#0F766E] shrink-0">
                            {eml.deliveryMode === 'live_resend' ? 'SENT LIVE' : 'OUTBOX'}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-[#5C6066]">To: {eml.to}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-white border border-black/[0.08] p-5 space-y-3">
                <h3 className="text-sm font-display font-semibold text-[#0B0D0F] flex items-center gap-2">
                  <Tag size={16} className="text-[#0F766E]" />
                  <span>Response Statuses & Tags ({responseRecords.length})</span>
                </h3>
                {responseRecords.length === 0 ? (
                  <p className="text-xs text-[#5C6066]">
                    Live response statuses and tags applied by workflows will appear here.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {responseRecords.slice(0, 10).map((rec) => (
                      <div
                        key={rec.submissionId}
                        className="p-3 rounded-xl bg-[#FAF9F7] border border-black/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <span className="font-mono text-[#0B0D0F]">{rec.submissionId}</span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {rec.status && (
                            <span className="px-2 py-0.5 rounded-md bg-[#0F766E]/10 text-[#0F766E] text-[10px] font-semibold">
                              {rec.status}
                            </span>
                          )}
                          {rec.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 rounded-md bg-white border border-black/[0.1] text-[10px] font-medium text-[#0B0D0F]"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
