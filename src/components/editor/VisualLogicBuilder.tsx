import React, { useState } from 'react';
import {
  FormSchema,
  LogicRule,
  LogicCondition,
  LogicAction,
  FormField,
  FormStep,
} from '../../types/form';
import { ensureFormSteps } from '../../lib/storage';
import {
  GitBranch,
  Plus,
  Trash2,
  ArrowRight,
  Zap,
  Eye,
  EyeOff,
  FastForward,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

interface VisualLogicBuilderProps {
  form: FormSchema;
  onUpdateRules: (rules: LogicRule[]) => void;
}

export const VisualLogicBuilder: React.FC<VisualLogicBuilderProps> = ({
  form,
  onUpdateRules,
}) => {
  const steps = ensureFormSteps(form);
  const fields = form.fields;

  // Rule creation form state
  const [sourceFieldId, setSourceFieldId] = useState<string>(fields[0]?.id || '');
  const [condition, setCondition] = useState<LogicCondition>('equals');
  const [value, setValue] = useState<string>('');
  const [action, setAction] = useState<LogicAction>('show');
  const [targetFieldId, setTargetFieldId] = useState<string>(fields[1]?.id || '');
  const [targetStep, setTargetStep] = useState<number>(2);

  // Active view: Flowchart vs Rules List vs Simulator
  const [viewTab, setViewTab] = useState<'rules' | 'diagram' | 'simulator'>('diagram');

  // Simulator state
  const [simAnswers, setSimAnswers] = useState<Record<string, any>>({});

  const sourceField = fields.find((f) => f.id === sourceFieldId);

  const handleAddRule = () => {
    if (!sourceFieldId) return;

    // For is_empty or is_not_empty, value is not required
    const requiresValue = condition !== 'is_empty' && condition !== 'is_not_empty';
    if (requiresValue && !value.trim()) return;

    const newRule: LogicRule = {
      id: 'rule_' + Math.random().toString(36).substring(2, 9),
      sourceFieldId,
      condition,
      value: requiresValue ? value.trim() : '',
      action,
      targetFieldId: action === 'jump_to_step' ? undefined : targetFieldId,
      targetStep: action === 'jump_to_step' ? targetStep : undefined,
    };

    onUpdateRules([...form.logicRules, newRule]);
    setValue('');
  };

  const handleDeleteRule = (id: string) => {
    onUpdateRules(form.logicRules.filter((r) => r.id !== id));
  };

  const getFieldLabel = (id?: string) => {
    if (!id) return 'Unknown Question';
    const f = fields.find((field) => field.id === id);
    return f ? f.label : id;
  };

  const getStepTitle = (stepNum?: number) => {
    if (!stepNum) return 'Step';
    const s = steps.find((step) => step.stepNumber === stepNum);
    return s ? `Step ${s.stepNumber}: ${s.title}` : `Step ${stepNum}`;
  };

  // Pre-built Quick Logic Patterns
  const handleApplyPresetPattern = (type: 'nps_feedback' | 'vip_skip' | 'opt_in') => {
    if (type === 'nps_feedback') {
      const ratingField = fields.find((f) => f.type === 'rating' || f.type === 'scale');
      const textareaField = fields.find((f) => f.type === 'textarea');
      if (ratingField && textareaField) {
        const rule: LogicRule = {
          id: 'rule_nps_' + Math.random().toString(36).substring(2, 7),
          sourceFieldId: ratingField.id,
          condition: 'less_than',
          value: '4',
          action: 'show',
          targetFieldId: textareaField.id,
        };
        onUpdateRules([...form.logicRules, rule]);
      }
    } else if (type === 'vip_skip') {
      const radioField = fields.find((f) => f.options && f.options.length > 0);
      if (radioField && steps.length > 1) {
        const rule: LogicRule = {
          id: 'rule_skip_' + Math.random().toString(36).substring(2, 7),
          sourceFieldId: radioField.id,
          condition: 'equals',
          value: radioField.options![0],
          action: 'jump_to_step',
          targetStep: 2,
        };
        onUpdateRules([...form.logicRules, rule]);
      }
    }
  };

  // Evaluate logic for simulator
  const evaluateSimulator = () => {
    const triggeredRules: { rule: LogicRule; description: string }[] = [];
    const hiddenFields = new Set<string>();
    const shownFields = new Set<string>();
    let activeStepJump: number | null = null;

    for (const rule of form.logicRules) {
      const srcVal = simAnswers[rule.sourceFieldId];
      let matches = false;

      if (rule.condition === 'equals') {
        matches = String(srcVal ?? '').toLowerCase() === String(rule.value).toLowerCase();
      } else if (rule.condition === 'not_equals') {
        matches = String(srcVal ?? '').toLowerCase() !== String(rule.value).toLowerCase();
      } else if (rule.condition === 'contains') {
        if (Array.isArray(srcVal)) {
          matches = srcVal.includes(rule.value);
        } else {
          matches = String(srcVal || '').toLowerCase().includes(rule.value.toLowerCase());
        }
      } else if (rule.condition === 'not_contains') {
        if (Array.isArray(srcVal)) {
          matches = !srcVal.includes(rule.value);
        } else {
          matches = !String(srcVal || '').toLowerCase().includes(rule.value.toLowerCase());
        }
      } else if (rule.condition === 'greater_than') {
        matches = Number(srcVal) > Number(rule.value);
      } else if (rule.condition === 'less_than') {
        matches = Number(srcVal) < Number(rule.value);
      } else if (rule.condition === 'is_empty') {
        matches = srcVal === undefined || srcVal === null || srcVal === '';
      } else if (rule.condition === 'is_not_empty') {
        matches = srcVal !== undefined && srcVal !== null && srcVal !== '';
      }

      if (matches) {
        if (rule.action === 'show' && rule.targetFieldId) {
          shownFields.add(rule.targetFieldId);
          triggeredRules.push({
            rule,
            description: `Showing question "${getFieldLabel(rule.targetFieldId)}"`,
          });
        } else if (rule.action === 'hide' && rule.targetFieldId) {
          hiddenFields.add(rule.targetFieldId);
          triggeredRules.push({
            rule,
            description: `Hiding question "${getFieldLabel(rule.targetFieldId)}"`,
          });
        } else if (rule.action === 'jump_to_step' && rule.targetStep) {
          activeStepJump = rule.targetStep;
          triggeredRules.push({
            rule,
            description: `Skipping flow and jumping directly to Step ${rule.targetStep}`,
          });
        }
      }
    }

    return { triggeredRules, hiddenFields, shownFields, activeStepJump };
  };

  const simResult = evaluateSimulator();

  return (
    <div className="flex-1 overflow-y-auto h-[calc(100vh-3.5rem)] bg-neutral-50 p-4 sm:p-8 space-y-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Header & View Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-neutral-900 tracking-tight flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-neutral-800" />
              <span>Visual Conditional Logic Builder</span>
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Build branching rules: show/hide questions or skip between steps based on user choices.
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-1 p-1 bg-neutral-200/60 rounded-lg text-xs font-medium">
            <button
              onClick={() => setViewTab('diagram')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                viewTab === 'diagram'
                  ? 'bg-white text-neutral-900 shadow-xs font-semibold'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>Visual Flow Diagram</span>
            </button>
            <button
              onClick={() => setViewTab('rules')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                viewTab === 'rules'
                  ? 'bg-white text-neutral-900 shadow-xs font-semibold'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <span>Rules Manager ({form.logicRules.length})</span>
            </button>
            <button
              onClick={() => setViewTab('simulator')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                viewTab === 'simulator'
                  ? 'bg-white text-neutral-900 shadow-xs font-semibold'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <Play className="w-3.5 h-3.5 text-emerald-600" />
              <span>Test Simulator</span>
            </button>
          </div>
        </div>

        {/* RULE CREATOR CARD */}
        <div className="bg-white p-5 rounded-2xl border border-neutral-200/90 shadow-xs space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-neutral-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-indigo-600" />
              <span>Define Logic Branch</span>
            </span>

            {/* Quick Templates */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-neutral-400">Quick Patterns:</span>
              <button
                type="button"
                onClick={() => handleApplyPresetPattern('vip_skip')}
                className="px-2 py-0.5 rounded border border-neutral-200 hover:bg-neutral-50 text-[11px] text-neutral-700"
              >
                + Step Skip Rule
              </button>
              <button
                type="button"
                onClick={() => handleApplyPresetPattern('nps_feedback')}
                className="px-2 py-0.5 rounded border border-neutral-200 hover:bg-neutral-50 text-[11px] text-neutral-700"
              >
                + Rating Condition
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* 1. IF Source Question */}
            <div className="space-y-1">
              <label className="font-medium text-neutral-600">IF Question</label>
              <select
                value={sourceFieldId}
                onChange={(e) => {
                  setSourceFieldId(e.target.value);
                  setValue('');
                }}
                className="w-full p-2 border rounded-lg border-neutral-200 bg-white font-medium"
              >
                {fields.map((f, i) => (
                  <option key={f.id} value={f.id}>
                    {i + 1}. {f.label.slice(0, 32)}...
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Condition Operator */}
            <div className="space-y-1">
              <label className="font-medium text-neutral-600">Condition</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as LogicCondition)}
                className="w-full p-2 border rounded-lg border-neutral-200 bg-white font-medium"
              >
                <option value="equals">is equal to</option>
                <option value="not_equals">is not equal to</option>
                <option value="contains">contains</option>
                <option value="not_contains">does not contain</option>
                <option value="greater_than">is greater than</option>
                <option value="less_than">is less than</option>
                <option value="is_empty">is unanswered / empty</option>
                <option value="is_not_empty">is answered</option>
              </select>
            </div>

            {/* 3. Expected Value */}
            <div className="space-y-1">
              <label className="font-medium text-neutral-600">Answer Value</label>
              {condition === 'is_empty' || condition === 'is_not_empty' ? (
                <div className="p-2 border rounded-lg bg-neutral-50 text-neutral-400 italic">
                  (Evaluates empty state)
                </div>
              ) : sourceField?.options && sourceField.options.length > 0 ? (
                <select
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-full p-2 border rounded-lg border-neutral-200 bg-white font-medium"
                >
                  <option value="">Select option...</option>
                  {sourceField.options.map((opt, i) => (
                    <option key={i} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Target answer..."
                  className="w-full px-3 py-2 border rounded-lg border-neutral-200 focus:outline-none focus:border-neutral-900"
                />
              )}
            </div>

            {/* 4. THEN Action & Target */}
            <div className="space-y-1">
              <label className="font-medium text-neutral-600">THEN Action</label>
              <div className="space-y-1.5">
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value as LogicAction)}
                  className="w-full p-2 border rounded-lg border-neutral-200 bg-white font-medium"
                >
                  <option value="show">SHOW Question</option>
                  <option value="hide">HIDE Question</option>
                  <option value="jump_to_step">SKIP / JUMP to Step</option>
                </select>

                {action === 'jump_to_step' ? (
                  <select
                    value={targetStep}
                    onChange={(e) => setTargetStep(parseInt(e.target.value, 10))}
                    className="w-full p-2 border rounded-lg border-neutral-200 bg-indigo-50/50 font-medium"
                  >
                    {steps.map((s) => (
                      <option key={s.stepNumber} value={s.stepNumber}>
                        Step {s.stepNumber}: {s.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={targetFieldId}
                    onChange={(e) => setTargetFieldId(e.target.value)}
                    className="w-full p-2 border rounded-lg border-neutral-200 bg-white font-medium"
                  >
                    {fields
                      .filter((f) => f.id !== sourceFieldId)
                      .map((f, i) => (
                        <option key={f.id} value={f.id}>
                          {f.label.slice(0, 30)}...
                        </option>
                      ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={handleAddRule}
              disabled={condition !== 'is_empty' && condition !== 'is_not_empty' && !value.trim()}
              className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 text-white font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Logic Rule</span>
            </button>
          </div>
        </div>

        {/* VIEW 1: VISUAL FLOW DIAGRAM */}
        {viewTab === 'diagram' && (
          <div className="bg-white rounded-2xl border border-neutral-200/90 shadow-xs p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <h3 className="font-bold text-sm text-neutral-900">Interactive Form Logic Graph</h3>
                <p className="text-[11px] text-neutral-500">
                  Visual map of questions and their branching conditions
                </p>
              </div>
              <div className="flex items-center gap-4 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span>Show Target</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span>Hide Target</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                  <span>Skip to Step</span>
                </div>
              </div>
            </div>

            {/* Questions Flow Graph Nodes */}
            <div className="space-y-4">
              {fields.map((field, idx) => {
                const outgoingRules = form.logicRules.filter((r) => r.sourceFieldId === field.id);
                const incomingRules = form.logicRules.filter((r) => r.targetFieldId === field.id);

                return (
                  <div
                    key={field.id}
                    className="p-4 rounded-xl border border-neutral-200 hover:border-neutral-300 bg-neutral-50/40 space-y-3 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-md bg-neutral-900 text-white font-mono text-xs font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="font-bold text-neutral-900 text-xs">{field.label}</p>
                          <div className="flex items-center gap-2 text-[10px] text-neutral-400 font-mono mt-0.5">
                            <span className="capitalize">{field.type}</span>
                            <span aria-hidden="true">·</span>
                            <span>Step {field.step || 1}</span>
                          </div>
                        </div>
                      </div>

                      {/* Rule counts */}
                      <div className="flex items-center gap-2 text-[10px]">
                        {incomingRules.length > 0 && (
                          <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-medium border border-amber-200">
                            Controlled by {incomingRules.length} rule(s)
                          </span>
                        )}
                        {outgoingRules.length > 0 && (
                          <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium border border-indigo-200">
                            Triggers {outgoingRules.length} rule(s)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Outgoing Branch Visual Badges */}
                    {outgoingRules.length > 0 && (
                      <div className="pl-8 pt-1 space-y-1.5 border-l-2 border-neutral-200 ml-3">
                        {outgoingRules.map((rule) => {
                          const isJump = rule.action === 'jump_to_step';
                          const isShow = rule.action === 'show';

                          return (
                            <div
                              key={rule.id}
                              className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-3 ${
                                isJump
                                  ? 'bg-indigo-50/70 border-indigo-200 text-indigo-900'
                                  : isShow
                                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                                  : 'bg-amber-50/70 border-amber-200 text-amber-900'
                              }`}
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                {isJump ? (
                                  <FastForward className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                ) : isShow ? (
                                  <Eye className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                ) : (
                                  <EyeOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                )}

                                <span>
                                  IF answer <span className="font-mono font-semibold">{rule.condition}</span> &quot;
                                  <strong className="font-semibold">{rule.value}</strong>&quot;
                                </span>
                                <ArrowRight className="w-3 h-3 opacity-60" />
                                <span className="font-semibold uppercase tracking-wide text-[10px]">
                                  {rule.action}:
                                </span>
                                <span className="font-bold">
                                  {isJump
                                    ? getStepTitle(rule.targetStep)
                                    : getFieldLabel(rule.targetFieldId)}
                                </span>
                              </div>

                              <button
                                onClick={() => handleDeleteRule(rule.id)}
                                className="p-1 hover:text-rose-600 rounded text-neutral-400"
                                title="Remove rule"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 2: RULES MANAGER TABLE */}
        {viewTab === 'rules' && (
          <div className="bg-white rounded-2xl border border-neutral-200/90 shadow-xs p-6 space-y-4 text-xs">
            <h3 className="font-bold text-sm text-neutral-900">
              Active Logic Rules ({form.logicRules.length})
            </h3>

            {form.logicRules.length === 0 ? (
              <div className="text-center py-12 text-neutral-400">
                No logic rules defined yet. Create your first rule using the creator above.
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {form.logicRules.map((rule, idx) => (
                  <div key={rule.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="w-5 h-5 rounded bg-neutral-100 text-neutral-600 font-mono text-[10px] flex items-center justify-center font-bold">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-semibold text-neutral-900">
                          {getFieldLabel(rule.sourceFieldId)}
                        </p>
                        <p className="text-neutral-500 text-[11px] mt-0.5">
                          When value <strong className="text-neutral-700">{rule.condition}</strong> &quot;
                          {rule.value}&quot; →{' '}
                          <span className="uppercase font-semibold text-indigo-700">{rule.action}</span>{' '}
                          {rule.action === 'jump_to_step'
                            ? getStepTitle(rule.targetStep)
                            : getFieldLabel(rule.targetFieldId)}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-1.5 text-neutral-400 hover:text-rose-600 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW 3: LIVE TEST SIMULATOR */}
        {viewTab === 'simulator' && (
          <div className="bg-white rounded-2xl border border-neutral-200/90 shadow-xs p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <h3 className="font-bold text-sm text-neutral-900">Logic Test Simulator</h3>
                <p className="text-[11px] text-neutral-500">
                  Select sample responses below to see how rules evaluate in real-time
                </p>
              </div>
              <button
                onClick={() => setSimAnswers({})}
                className="px-2.5 py-1 text-xs border border-neutral-200 rounded-md hover:bg-neutral-50 flex items-center gap-1.5 text-neutral-700"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Answers</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Simulator Input Column */}
              <div className="md:col-span-7 space-y-4">
                <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block">
                  Simulate Respondent Answers
                </span>

                {fields.slice(0, 5).map((f) => (
                  <div key={f.id} className="p-3.5 rounded-xl border border-neutral-200 space-y-2 text-xs">
                    <label className="font-semibold text-neutral-800 block">{f.label}</label>

                    {f.options && f.options.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {f.options.map((opt, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setSimAnswers({ ...simAnswers, [f.id]: opt })}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                              simAnswers[f.id] === opt
                                ? 'bg-neutral-900 text-white border-neutral-900'
                                : 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={simAnswers[f.id] || ''}
                        onChange={(e) => setSimAnswers({ ...simAnswers, [f.id]: e.target.value })}
                        placeholder="Type simulated response..."
                        className="w-full px-3 py-1.5 border rounded-lg border-neutral-200 text-xs"
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Simulator Output Column */}
              <div className="md:col-span-5 space-y-4">
                <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block">
                  Real-time Rule Execution Log
                </span>

                <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50 space-y-3 text-xs">
                  {simResult.triggeredRules.length === 0 ? (
                    <p className="text-neutral-400 italic">
                      No rules triggered yet with current simulated answers.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {simResult.triggeredRules.map((t, i) => (
                        <div
                          key={i}
                          className="p-2.5 rounded-lg bg-white border border-neutral-200 text-neutral-800 space-y-1"
                        >
                          <div className="flex items-center gap-1.5 text-emerald-700 font-semibold text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Rule Active</span>
                          </div>
                          <p className="font-medium text-xs">{t.description}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {simResult.activeStepJump && (
                    <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 font-semibold flex items-center gap-2">
                      <FastForward className="w-4 h-4 text-indigo-600" />
                      <span>Next button will skip to Step {simResult.activeStepJump}!</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
