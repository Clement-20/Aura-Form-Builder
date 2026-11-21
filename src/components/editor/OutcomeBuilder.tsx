import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle,
  Copy,
  Eye,
  FlagCheckered,
  Plus,
  Sparkle,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react';
import {
  FormDocument,
  FormOutcomeConfig,
  FormOutcomeDefinition,
  OutcomeActionButton,
  OutcomeComparisonOperator,
  OutcomeCondition,
  OutcomeConditionSource,
  OutcomeConditionalBlock,
  OutcomeEvaluationResult,
  OutcomeResultScreen,
  ScoringEvaluationResult,
  TextAlign,
  createEmptyConditionGroup,
  evaluateFormOutcomes,
  formComponentRegistry,
  getOrderedComponents,
  isSafeHttpUrl,
  isSafeMediaUrl,
  toPipingSlug,
} from '../../studio';
import { OutcomeResultCard } from '../../studio/engines/OutcomeResultCard';
import { AnswerPipingPicker } from './AnswerPipingPicker';
import { LogicConditionGroupEditor } from './LogicConditionGroupEditor';

interface OutcomeBuilderProps {
  document: FormDocument;
  onUpdateOutcomes: (outcomes: FormOutcomeConfig) => void;
  liveScoring: ScoringEvaluationResult;
  liveOutcomeResult: OutcomeEvaluationResult;
  sampleAnswers: Record<string, unknown>;
  resolvedVariables: Record<string, unknown>;
  formattedVariables: Record<string, string>;
  isReadOnly?: boolean;
}

const DEFAULT_OUTCOMES_CONFIG: FormOutcomeConfig = {
  enabled: false,
  outcomes: [],
};

const SOURCE_OPTIONS: { value: OutcomeConditionSource; label: string }[] = [
  { value: 'total_score', label: 'Total Score (points)' },
  { value: 'total_percent', label: 'Total Score (%)' },
  { value: 'category_score', label: 'Category Score (points)' },
  { value: 'category_percent', label: 'Category Score (%)' },
  { value: 'component', label: 'Specific Question Answer' },
  { value: 'variable', label: 'Form Variable' },
  { value: 'logic_group', label: 'Advanced Nested Condition Group' },
];

const OPERATOR_OPTIONS: { value: OutcomeComparisonOperator; label: string }[] = [
  { value: 'greater_than_or_equal', label: 'is at least (>=)' },
  { value: 'greater_than', label: 'is greater than (>)' },
  { value: 'less_than_or_equal', label: 'is at most (<=)' },
  { value: 'less_than', label: 'is less than (<)' },
  { value: 'between', label: 'is between' },
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'contains', label: 'contains' },
];

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}`;
}

function appendToken(current: string, token: string): string {
  if (!current) return token;
  return /\s$/.test(current) ? `${current}${token}` : `${current} ${token}`;
}

export const OutcomeBuilder: React.FC<OutcomeBuilderProps> = ({
  document,
  onUpdateOutcomes,
  liveScoring,
  liveOutcomeResult,
  sampleAnswers,
  resolvedVariables,
  formattedVariables,
  isReadOnly = false,
}) => {
  const config: FormOutcomeConfig = useMemo(
    () => ({
      ...DEFAULT_OUTCOMES_CONFIG,
      ...(document.outcomes || {}),
      outcomes: (document.outcomes?.outcomes || [])
        .slice()
        .sort((a, b) => a.priority - b.priority),
    }),
    [document.outcomes]
  );

  const [selectedId, setSelectedId] = useState<string | null>(() => config.outcomes[0]?.id || null);
  const [editorTab, setEditorTab] = useState<'rules' | 'screen' | 'preview'>('screen');

  const questionComponents = useMemo(
    () =>
      getOrderedComponents(document).filter((node) => {
        const def = formComponentRegistry.get(node.type);
        return !def || def.isQuestion;
      }),
    [document]
  );

  const categories = document.scoring?.categories || [];

  const selectedOutcome = useMemo(() => {
    if (selectedId) {
      const match = config.outcomes.find((o) => o.id === selectedId);
      if (match) return match;
    }
    return config.outcomes[0] || null;
  }, [config.outcomes, selectedId]);

  // Build an isolated preview of the currently selected outcome screen so creators can design it live
  const selectedOutcomePreview = useMemo(() => {
    if (!selectedOutcome) return null;
    const syntheticDoc: FormDocument = {
      ...document,
      outcomes: {
        enabled: true,
        defaultOutcomeId: selectedOutcome.id,
        outcomes: [{ ...selectedOutcome, enabled: true, conditions: [] }],
      },
    };
    const res = evaluateFormOutcomes(
      syntheticDoc,
      sampleAnswers,
      resolvedVariables,
      liveScoring,
      {
        document,
        answers: sampleAnswers,
        variables: resolvedVariables,
        formattedVariables,
      }
    );
    return res.selectedOutcome;
  }, [
    selectedOutcome,
    document,
    sampleAnswers,
    resolvedVariables,
    formattedVariables,
    liveScoring,
  ]);

  const updateConfig = (patch: Partial<FormOutcomeConfig>) => {
    if (isReadOnly) return;
    onUpdateOutcomes({ ...config, ...patch });
  };

  const createOutcome = () => {
    if (isReadOnly) return;
    const idx = config.outcomes.length + 1;
    const created: FormOutcomeDefinition = {
      id: makeId('out'),
      name: idx === 1 ? 'High Readiness' : `Outcome ${idx}`,
      enabled: true,
      priority: idx * 10,
      matchMode: 'all',
      conditions: [
        {
          id: makeId('oc'),
          source: 'total_percent',
          operator: 'greater_than_or_equal',
          value: idx === 1 ? '75' : '0',
        },
      ],
      resultScreen: {
        heading: 'Your personalised results are ready',
        description:
          'You scored {{total_score}} out of {{max_score}} ({{score_percent}}%). Review your breakdown and recommended next steps below.',
        showScoreCard: Boolean(document.scoring?.enabled),
        showCategoryBreakdown: categories.length > 0,
        nextSteps: ['Review your strongest scoring areas', 'Schedule a follow-up consultation'],
        buttons: [],
        conditionalBlocks: [],
        appearance: { textAlign: 'center' },
      },
    };
    updateConfig({
      enabled: true,
      defaultOutcomeId: config.defaultOutcomeId || created.id,
      outcomes: [...config.outcomes, created],
    });
    setSelectedId(created.id);
  };

  const updateSelected = (patch: Partial<FormOutcomeDefinition>) => {
    if (isReadOnly || !selectedOutcome) return;
    updateConfig({
      outcomes: config.outcomes.map((o) =>
        o.id === selectedOutcome.id ? { ...o, ...patch } : o
      ),
    });
  };

  const updateScreen = (patch: Partial<OutcomeResultScreen>) => {
    if (!selectedOutcome) return;
    updateSelected({
      resultScreen: {
        ...selectedOutcome.resultScreen,
        ...patch,
      },
    });
  };

  const duplicateOutcome = (outcome: FormOutcomeDefinition) => {
    if (isReadOnly) return;
    const copy: FormOutcomeDefinition = {
      ...JSON.parse(JSON.stringify(outcome)),
      id: makeId('out'),
      name: `${outcome.name} (Copy)`,
      priority: (config.outcomes.length + 1) * 10,
    };
    updateConfig({ outcomes: [...config.outcomes, copy] });
    setSelectedId(copy.id);
  };

  const deleteOutcome = (id: string) => {
    if (isReadOnly) return;
    const next = config.outcomes.filter((o) => o.id !== id);
    updateConfig({
      outcomes: next,
      defaultOutcomeId: config.defaultOutcomeId === id ? next[0]?.id : config.defaultOutcomeId,
    });
    if (selectedId === id) {
      setSelectedId(next[0]?.id || null);
    }
  };

  const movePriority = (id: string, dir: 'up' | 'down') => {
    if (isReadOnly) return;
    const idx = config.outcomes.findIndex((o) => o.id === id);
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || targetIdx < 0 || targetIdx >= config.outcomes.length) return;
    const next = [...config.outcomes];
    const tmp = next[idx];
    next[idx] = next[targetIdx];
    next[targetIdx] = tmp;
    updateConfig({
      outcomes: next.map((o, i) => ({ ...o, priority: (i + 1) * 10 })),
    });
  };

  const quickScoreTokens = useMemo(() => {
    const tokens = [
      { label: 'Total Score', snippet: '{{total_score}}' },
      { label: 'Max Score', snippet: '{{max_score}}' },
      { label: 'Score %', snippet: '{{score_percent}}%' },
      { label: 'Score Band', snippet: '{{score_band}}' },
      { label: 'Outcome Name', snippet: '{{outcome_name}}' },
    ];
    for (const cat of categories) {
      const slug = toPipingSlug(cat.name) || cat.id;
      tokens.push({ label: `${cat.name} Score`, snippet: `{{category.${slug}}}` });
    }
    return tokens;
  }, [categories]);

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
      {/* Left Sidebar: Prioritised Outcome List */}
      <aside className="w-full lg:w-[300px] shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-black/[0.08] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-black/[0.08] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-display font-semibold text-[#0B0D0F] flex items-center gap-1.5">
                <FlagCheckered size={15} weight="duotone" className="text-[#0F766E]" />
                <span>Personalised Outcomes</span>
              </h2>
              <p className="text-[11px] font-mono text-[#5C6066] mt-0.5 tabular-nums">
                {config.outcomes.length} outcomes · {config.enabled ? 'Active' : 'Disabled'}
              </p>
            </div>
            {!isReadOnly && (
              <button
                type="button"
                onClick={createOutcome}
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-[#0B0D0F] hover:bg-[#191D21] text-[#F7F6F3] text-xs font-semibold whitespace-nowrap shrink-0"
              >
                <Plus size={13} weight="bold" />
                <span>New</span>
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="text-xs text-[#5C6066] font-medium">Enable outcomes</label>
            <button
              type="button"
              disabled={isReadOnly}
              onClick={() => updateConfig({ enabled: !config.enabled })}
              className={`w-8 h-4.5 rounded-full transition-colors relative ${
                config.enabled ? 'bg-[#0F766E]' : 'bg-black/20'
              }`}
              aria-label="Toggle outcomes"
            >
              <span
                className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                  config.enabled ? 'left-4' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {config.outcomes.length > 0 && (
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                Default Fallback Outcome
              </label>
              <select
                disabled={isReadOnly}
                value={config.defaultOutcomeId || ''}
                onChange={(e) =>
                  updateConfig({ defaultOutcomeId: e.target.value || undefined })
                }
                className="w-full h-8 px-2 text-xs bg-[#FAF9F7] border border-black/[0.08] rounded-lg text-[#0B0D0F]"
              >
                <option value="">Use Standard Thank-You Screen</option>
                {config.outcomes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 max-h-[240px] lg:max-h-none">
          {config.outcomes.length === 0 ? (
            <div className="p-5 text-center text-xs text-[#5C6066] border border-dashed border-black/[0.12] rounded-xl">
              Define tailored result screens driven by total score, category scores, answers, or
              variables.
            </div>
          ) : (
            config.outcomes.map((outcome, idx) => {
              const isSelected = selectedOutcome?.id === outcome.id;
              const isWinner = liveOutcomeResult.selectedOutcome?.outcomeId === outcome.id;
              const isDefault = config.defaultOutcomeId === outcome.id;

              return (
                <div
                  key={outcome.id}
                  onClick={() => setSelectedId(outcome.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedId(outcome.id);
                    }
                  }}
                  className={`rounded-xl border p-2.5 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#0F766E]/[0.06] border-[#0F766E]/40'
                      : 'bg-white border-black/[0.07] hover:bg-[#FAF9F7]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-[#5C6066] tabular-nums">
                          #{idx + 1}
                        </span>
                        <span
                          className={`text-xs font-semibold truncate ${
                            outcome.enabled ? 'text-[#0B0D0F]' : 'text-[#5C6066] line-through'
                          }`}
                        >
                          {outcome.name}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-[#5C6066] font-mono tabular-nums">
                        {outcome.conditions.length} cond
                        {isDefault ? ' · Fallback' : ''}
                        {isWinner && (
                          <span className="text-[#0F766E] font-semibold"> · Active Match</span>
                        )}
                      </div>
                    </div>
                    {!isReadOnly && isSelected && (
                      <div
                        className="flex items-center gap-0.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => movePriority(outcome.id, 'up')}
                          className="p-1 text-[#5C6066] hover:text-[#0B0D0F] disabled:opacity-25"
                          aria-label="Higher priority"
                        >
                          <ArrowUp size={12} weight="bold" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === config.outcomes.length - 1}
                          onClick={() => movePriority(outcome.id, 'down')}
                          className="p-1 text-[#5C6066] hover:text-[#0B0D0F] disabled:opacity-25"
                          aria-label="Lower priority"
                        >
                          <ArrowDown size={12} weight="bold" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Right Outcome Workspace */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 min-w-0">
        <div className="max-w-3xl mx-auto space-y-5">
          {!selectedOutcome ? (
            <div className="bg-white rounded-2xl border border-black/[0.08] p-10 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-[#F7F6F3] border border-black/[0.08] text-[#0F766E] flex items-center justify-center mx-auto">
                <Sparkle size={24} weight="duotone" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-base font-display font-semibold text-[#0B0D0F]">
                  Design personalised outcome screens
                </h3>
                <p className="text-xs text-[#5C6066] leading-relaxed">
                  Show each respondent tailored feedback, score breakdowns, conditional advice
                  blocks, next steps, and calls to action based on their answers and scores.
                </p>
              </div>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={createOutcome}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#0B0D0F] hover:bg-[#191D21] text-[#F7F6F3] text-xs font-semibold whitespace-nowrap"
                >
                  <Plus size={14} weight="bold" />
                  <span>Create First Outcome</span>
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Outcome Name + Actions + Sub-Tabs */}
              <section className="bg-white rounded-2xl border border-black/[0.08] p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                      Outcome Name
                    </label>
                    <input
                      type="text"
                      disabled={isReadOnly}
                      value={selectedOutcome.name}
                      onChange={(e) => updateSelected({ name: e.target.value })}
                      className="w-full h-9 px-3 text-sm font-display font-semibold text-[#0B0D0F] bg-[#FAF9F7] border border-black/[0.08] rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0F766E]"
                    />
                  </div>
                  {!isReadOnly && (
                    <div className="flex items-center gap-2 pt-4">
                      <button
                        type="button"
                        onClick={() => updateSelected({ enabled: !selectedOutcome.enabled })}
                        className={`h-9 px-3 rounded-lg border text-xs font-semibold whitespace-nowrap ${
                          selectedOutcome.enabled
                            ? 'bg-[#0F766E]/10 text-[#0F766E] border-[#0F766E]/30'
                            : 'bg-[#F7F6F3] text-[#5C6066] border-black/[0.08]'
                        }`}
                      >
                        {selectedOutcome.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateOutcome(selectedOutcome)}
                        className="h-9 px-2.5 rounded-lg border border-black/[0.08] bg-white hover:bg-[#F7F6F3] text-[#0B0D0F]"
                        aria-label="Duplicate outcome"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteOutcome(selectedOutcome.id)}
                        className="h-9 px-2.5 rounded-lg border border-black/[0.08] bg-white hover:bg-rose-50 hover:text-rose-600 text-[#5C6066]"
                        aria-label="Delete outcome"
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Sub-tabs */}
                <div className="inline-flex items-center rounded-lg border border-black/[0.08] bg-[#F7F6F3] p-0.5">
                  <button
                    type="button"
                    onClick={() => setEditorTab('rules')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ${
                      editorTab === 'rules'
                        ? 'bg-[#0B0D0F] text-[#F7F6F3]'
                        : 'text-[#5C6066] hover:text-[#0B0D0F]'
                    }`}
                  >
                    Matching Rules ({selectedOutcome.conditions.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorTab('screen')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ${
                      editorTab === 'screen'
                        ? 'bg-[#0B0D0F] text-[#F7F6F3]'
                        : 'text-[#5C6066] hover:text-[#0B0D0F]'
                    }`}
                  >
                    Result Screen Designer
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorTab('preview')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ${
                      editorTab === 'preview'
                        ? 'bg-[#0F766E] text-white'
                        : 'text-[#5C6066] hover:text-[#0B0D0F]'
                    }`}
                  >
                    <Eye size={13} />
                    <span>Live Preview</span>
                  </button>
                </div>
              </section>

              {/* TAB 1: MATCHING RULES */}
              {editorTab === 'rules' && (
                <section className="bg-white rounded-2xl border border-black/[0.08] p-4 sm:p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-[#5C6066] font-medium">Trigger this outcome when</span>
                      <select
                        disabled={isReadOnly}
                        value={selectedOutcome.matchMode}
                        onChange={(e) =>
                          updateSelected({ matchMode: e.target.value as 'all' | 'any' })
                        }
                        className="h-8 px-2.5 rounded-lg border border-black/[0.1] bg-[#FAF9F7] text-xs font-semibold text-[#0B0D0F]"
                      >
                        <option value="all">ALL conditions match (AND)</option>
                        <option value="any">ANY condition matches (OR)</option>
                      </select>
                    </div>

                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => {
                          const nextCond: OutcomeCondition = {
                            id: makeId('oc'),
                            source: 'total_score',
                            operator: 'greater_than_or_equal',
                            value: '0',
                          };
                          updateSelected({
                            conditions: [...selectedOutcome.conditions, nextCond],
                          });
                        }}
                        className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-[#0F766E] text-white text-xs font-semibold whitespace-nowrap"
                      >
                        <Plus size={12} weight="bold" />
                        <span>Add Condition</span>
                      </button>
                    )}
                  </div>

                  {selectedOutcome.conditions.length === 0 ? (
                    <div className="p-5 rounded-xl border border-dashed border-black/[0.12] text-xs text-[#5C6066] text-center">
                      No matching conditions. This outcome will only appear if selected as the
                      Default Fallback Outcome.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {selectedOutcome.conditions.map((cond) => {
                        const patchCond = (patch: Partial<OutcomeCondition>) => {
                          updateSelected({
                            conditions: selectedOutcome.conditions.map((c) =>
                              c.id === cond.id ? { ...c, ...patch } : c
                            ),
                          });
                        };

                        return (
                          <div
                            key={cond.id}
                            className="p-3 rounded-xl border border-black/[0.08] bg-[#FAF9F7] space-y-2.5"
                          >
                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                              <select
                                disabled={isReadOnly}
                                value={cond.source}
                                onChange={(e) => {
                                  const nextSource = e.target.value as OutcomeConditionSource;
                                  patchCond({
                                    source: nextSource,
                                    sourceId:
                                      nextSource === 'category_score' ||
                                      nextSource === 'category_percent'
                                        ? categories[0]?.id || ''
                                        : nextSource === 'component'
                                        ? questionComponents[0]?.id || ''
                                        : nextSource === 'variable'
                                        ? document.variables[0]?.name || ''
                                        : undefined,
                                    logicGroup:
                                      nextSource === 'logic_group'
                                        ? cond.logicGroup || createEmptyConditionGroup(document)
                                        : undefined,
                                  });
                                }}
                                className="sm:col-span-4 h-8 px-2 text-xs bg-white border border-black/[0.1] rounded-lg"
                              >
                                {SOURCE_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>

                              {(cond.source === 'category_score' ||
                                cond.source === 'category_percent') && (
                                <select
                                  disabled={isReadOnly}
                                  value={cond.sourceId || ''}
                                  onChange={(e) => patchCond({ sourceId: e.target.value })}
                                  className="sm:col-span-3 h-8 px-2 text-xs bg-white border border-black/[0.1] rounded-lg"
                                >
                                  <option value="">Select category...</option>
                                  {categories.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                                </select>
                              )}

                              {cond.source === 'component' && (
                                <select
                                  disabled={isReadOnly}
                                  value={cond.sourceId || ''}
                                  onChange={(e) => patchCond({ sourceId: e.target.value })}
                                  className="sm:col-span-3 h-8 px-2 text-xs bg-white border border-black/[0.1] rounded-lg"
                                >
                                  <option value="">Select question...</option>
                                  {questionComponents.map((q) => (
                                    <option key={q.id} value={q.id}>
                                      {q.content.label || q.id}
                                    </option>
                                  ))}
                                </select>
                              )}

                              {cond.source === 'variable' && (
                                <select
                                  disabled={isReadOnly}
                                  value={cond.sourceId || ''}
                                  onChange={(e) => patchCond({ sourceId: e.target.value })}
                                  className="sm:col-span-3 h-8 px-2 text-xs bg-white border border-black/[0.1] rounded-lg"
                                >
                                  <option value="">Select variable...</option>
                                  {document.variables.map((v) => (
                                    <option key={v.id} value={v.name}>
                                      {v.name}
                                    </option>
                                  ))}
                                </select>
                              )}

                              {cond.source !== 'logic_group' && (
                                <>
                                  <select
                                    disabled={isReadOnly}
                                    value={cond.operator}
                                    onChange={(e) =>
                                      patchCond({
                                        operator: e.target.value as OutcomeComparisonOperator,
                                      })
                                    }
                                    className="sm:col-span-2 h-8 px-2 text-xs bg-white border border-black/[0.1] rounded-lg"
                                  >
                                    {OPERATOR_OPTIONS.map((op) => (
                                      <option key={op.value} value={op.value}>
                                        {op.label}
                                      </option>
                                    ))}
                                  </select>

                                  <div
                                    className={
                                      cond.source === 'total_score' ||
                                      cond.source === 'total_percent'
                                        ? 'sm:col-span-5 flex items-center gap-1.5'
                                        : 'sm:col-span-2 flex items-center gap-1.5'
                                    }
                                  >
                                    <input
                                      type="text"
                                      disabled={isReadOnly}
                                      value={cond.value}
                                      onChange={(e) => patchCond({ value: e.target.value })}
                                      placeholder="Value"
                                      className="w-full h-8 px-2 text-xs font-mono bg-white border border-black/[0.1] rounded-lg"
                                    />
                                    {cond.operator === 'between' && (
                                      <input
                                        type="text"
                                        disabled={isReadOnly}
                                        value={cond.secondaryValue || ''}
                                        onChange={(e) =>
                                          patchCond({ secondaryValue: e.target.value })
                                        }
                                        placeholder="Max"
                                        className="w-full h-8 px-2 text-xs font-mono bg-white border border-black/[0.1] rounded-lg"
                                      />
                                    )}
                                  </div>
                                </>
                              )}

                              {!isReadOnly && (
                                <div className="sm:col-span-1 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateSelected({
                                        conditions: selectedOutcome.conditions.filter(
                                          (c) => c.id !== cond.id
                                        ),
                                      })
                                    }
                                    className="p-1.5 text-[#5C6066] hover:text-rose-600"
                                    aria-label="Remove condition"
                                  >
                                    <Trash size={13} />
                                  </button>
                                </div>
                              )}
                            </div>

                            {cond.source === 'logic_group' && cond.logicGroup && (
                              <LogicConditionGroupEditor
                                document={document}
                                group={cond.logicGroup}
                                onChange={(nextGroup) => patchCond({ logicGroup: nextGroup })}
                                isReadOnly={isReadOnly}
                                selectableComponents={questionComponents}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* TAB 2: RESULT SCREEN DESIGNER */}
              {editorTab === 'screen' && (
                <div className="space-y-4">
                  {/* Copy & Score Tokens */}
                  <section className="bg-white rounded-2xl border border-black/[0.08] p-4 sm:p-5 space-y-4">
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] block">
                        Quick Insert Score Tokens (into Description)
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {quickScoreTokens.map((tok) => (
                          <button
                            key={tok.snippet}
                            type="button"
                            disabled={isReadOnly}
                            onClick={() =>
                              updateScreen({
                                description: appendToken(
                                  selectedOutcome.resultScreen.description || '',
                                  tok.snippet
                                ),
                              })
                            }
                            className="px-2 py-1 rounded-md border border-black/[0.08] bg-[#FAF9F7] hover:bg-[#EAE7E1] text-[11px] font-mono text-[#0F766E] whitespace-nowrap"
                          >
                            + {tok.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066]">
                          Result Heading
                        </label>
                        <AnswerPipingPicker
                          document={document}
                          disabled={isReadOnly}
                          onInsertToken={(token) =>
                            updateScreen({
                              heading: appendToken(
                                selectedOutcome.resultScreen.heading || '',
                                token
                              ),
                            })
                          }
                        />
                      </div>
                      <input
                        type="text"
                        disabled={isReadOnly}
                        value={selectedOutcome.resultScreen.heading}
                        onChange={(e) => updateScreen({ heading: e.target.value })}
                        placeholder="e.g. Great work, {{first_name | there}}!"
                        className="w-full h-9 px-3 text-sm font-semibold bg-white border border-black/[0.1] rounded-lg"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066]">
                          Result Description
                        </label>
                        <AnswerPipingPicker
                          document={document}
                          disabled={isReadOnly}
                          onInsertToken={(token) =>
                            updateScreen({
                              description: appendToken(
                                selectedOutcome.resultScreen.description || '',
                                token
                              ),
                            })
                          }
                        />
                      </div>
                      <textarea
                        rows={3}
                        disabled={isReadOnly}
                        value={selectedOutcome.resultScreen.description}
                        onChange={(e) => updateScreen({ description: e.target.value })}
                        className="w-full p-3 text-xs bg-white border border-black/[0.1] rounded-lg leading-relaxed"
                      />
                    </div>

                    {/* Hero Image & Display Toggles */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-black/[0.06]">
                      <div>
                        <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                          Hero Image URL (Optional)
                        </label>
                        <input
                          type="url"
                          disabled={isReadOnly}
                          value={selectedOutcome.resultScreen.imageUrl || ''}
                          onChange={(e) => updateScreen({ imageUrl: e.target.value || undefined })}
                          placeholder="https://images.unsplash.com/..."
                          className="w-full h-8 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg"
                        />
                        {selectedOutcome.resultScreen.imageUrl &&
                          !isSafeMediaUrl(selectedOutcome.resultScreen.imageUrl) && (
                            <p className="mt-1 text-[11px] text-rose-600 flex items-center gap-1">
                              <WarningCircle size={12} weight="fill" />
                              <span>Use an http:// or https:// image URL.</span>
                            </p>
                          )}
                      </div>

                      <div className="flex flex-col justify-center gap-2 pt-3">
                        <label className="inline-flex items-center gap-2 text-xs text-[#0B0D0F] cursor-pointer">
                          <input
                            type="checkbox"
                            disabled={isReadOnly}
                            checked={Boolean(selectedOutcome.resultScreen.showScoreCard)}
                            onChange={(e) => updateScreen({ showScoreCard: e.target.checked })}
                            className="accent-[#0F766E]"
                          />
                          <span>Show overall score card &amp; band</span>
                        </label>
                        <label className="inline-flex items-center gap-2 text-xs text-[#0B0D0F] cursor-pointer">
                          <input
                            type="checkbox"
                            disabled={isReadOnly}
                            checked={Boolean(selectedOutcome.resultScreen.showCategoryBreakdown)}
                            onChange={(e) =>
                              updateScreen({ showCategoryBreakdown: e.target.checked })
                            }
                            className="accent-[#0F766E]"
                          />
                          <span>Show multi-category breakdown chart</span>
                        </label>
                      </div>
                    </div>
                  </section>

                  {/* Next Steps */}
                  <section className="bg-white rounded-2xl border border-black/[0.08] p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066]">
                        Recommended Next Steps
                      </span>
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() =>
                            updateScreen({
                              nextSteps: [...(selectedOutcome.resultScreen.nextSteps || []), ''],
                            })
                          }
                          className="text-xs font-semibold text-[#0F766E] hover:underline inline-flex items-center gap-1"
                        >
                          <Plus size={12} weight="bold" />
                          <span>Add Step</span>
                        </button>
                      )}
                    </div>
                    {(selectedOutcome.resultScreen.nextSteps || []).map((step, sIdx) => (
                      <div key={sIdx} className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-[#5C6066] w-5 tabular-nums">
                          {String(sIdx + 1).padStart(2, '0')}
                        </span>
                        <input
                          type="text"
                          disabled={isReadOnly}
                          value={step}
                          onChange={(e) =>
                            updateScreen({
                              nextSteps: (selectedOutcome.resultScreen.nextSteps || []).map(
                                (v, i) => (i === sIdx ? e.target.value : v)
                              ),
                            })
                          }
                          placeholder="Describe next step (supports {{piping}})..."
                          className="flex-1 h-8 px-2.5 text-xs bg-[#FAF9F7] border border-black/[0.08] rounded-lg"
                        />
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={() =>
                              updateScreen({
                                nextSteps: (selectedOutcome.resultScreen.nextSteps || []).filter(
                                  (_, i) => i !== sIdx
                                ),
                              })
                            }
                            className="p-1.5 text-[#5C6066] hover:text-rose-600"
                            aria-label="Remove step"
                          >
                            <Trash size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </section>

                  {/* Action Buttons */}
                  <section className="bg-white rounded-2xl border border-black/[0.08] p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066]">
                        Call-to-Action Buttons
                      </span>
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => {
                            const btn: OutcomeActionButton = {
                              id: makeId('btn'),
                              label: 'Book a Strategy Call',
                              url: 'https://example.com',
                              style:
                                (selectedOutcome.resultScreen.buttons || []).length === 0
                                  ? 'primary'
                                  : 'secondary',
                              openInNewTab: true,
                            };
                            updateScreen({
                              buttons: [...(selectedOutcome.resultScreen.buttons || []), btn],
                            });
                          }}
                          className="text-xs font-semibold text-[#0F766E] hover:underline inline-flex items-center gap-1"
                        >
                          <Plus size={12} weight="bold" />
                          <span>Add Button</span>
                        </button>
                      )}
                    </div>

                    {(selectedOutcome.resultScreen.buttons || []).map((btn) => {
                      const invalidUrl =
                        Boolean(btn.url?.trim()) &&
                        !btn.url.includes('{{') &&
                        !isSafeHttpUrl(btn.url);
                      return (
                        <div
                          key={btn.id}
                          className="p-3 rounded-xl bg-[#FAF9F7] border border-black/[0.08] space-y-2"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                            <input
                              type="text"
                              disabled={isReadOnly}
                              value={btn.label}
                              placeholder="Button label"
                              onChange={(e) =>
                                updateScreen({
                                  buttons: (selectedOutcome.resultScreen.buttons || []).map((b) =>
                                    b.id === btn.id ? { ...b, label: e.target.value } : b
                                  ),
                                })
                              }
                              className="sm:col-span-4 h-8 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg"
                            />
                            <input
                              type="url"
                              disabled={isReadOnly}
                              value={btn.url}
                              placeholder="https://..."
                              onChange={(e) =>
                                updateScreen({
                                  buttons: (selectedOutcome.resultScreen.buttons || []).map((b) =>
                                    b.id === btn.id ? { ...b, url: e.target.value } : b
                                  ),
                                })
                              }
                              className="sm:col-span-5 h-8 px-2.5 text-xs font-mono bg-white border border-black/[0.1] rounded-lg"
                            />
                            <select
                              disabled={isReadOnly}
                              value={btn.style}
                              onChange={(e) =>
                                updateScreen({
                                  buttons: (selectedOutcome.resultScreen.buttons || []).map((b) =>
                                    b.id === btn.id
                                      ? { ...b, style: e.target.value as 'primary' | 'secondary' }
                                      : b
                                  ),
                                })
                              }
                              className="sm:col-span-2 h-8 px-2 text-xs bg-white border border-black/[0.1] rounded-lg"
                            >
                              <option value="primary">Primary</option>
                              <option value="secondary">Secondary</option>
                            </select>
                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={() =>
                                  updateScreen({
                                    buttons: (selectedOutcome.resultScreen.buttons || []).filter(
                                      (b) => b.id !== btn.id
                                    ),
                                  })
                                }
                                className="sm:col-span-1 flex justify-end text-[#5C6066] hover:text-rose-600"
                                aria-label="Remove button"
                              >
                                <Trash size={13} />
                              </button>
                            )}
                          </div>
                          {invalidUrl && (
                            <p className="text-[11px] text-rose-600 flex items-center gap-1">
                              <WarningCircle size={12} weight="fill" />
                              <span>Button URL must begin with http:// or https://</span>
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </section>

                  {/* Conditional Content Blocks */}
                  <section className="bg-white rounded-2xl border border-black/[0.08] p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] block">
                          Conditional Content Blocks
                        </span>
                        <span className="text-[11px] text-[#5C6066]">
                          Show targeted advice blocks inside this result screen only when extra
                          conditions pass.
                        </span>
                      </div>
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => {
                            const blk: OutcomeConditionalBlock = {
                              id: makeId('cblk'),
                              heading: 'Tailored Recommendation',
                              body: 'Based on your answers, consider focusing on this area next.',
                              conditionGroup: createEmptyConditionGroup(document),
                            };
                            updateScreen({
                              conditionalBlocks: [
                                ...(selectedOutcome.resultScreen.conditionalBlocks || []),
                                blk,
                              ],
                            });
                          }}
                          className="text-xs font-semibold text-[#0F766E] hover:underline inline-flex items-center gap-1 shrink-0"
                        >
                          <Plus size={12} weight="bold" />
                          <span>Add Block</span>
                        </button>
                      )}
                    </div>

                    {(selectedOutcome.resultScreen.conditionalBlocks || []).map((blk) => (
                      <div
                        key={blk.id}
                        className="p-3.5 rounded-xl bg-[#FAF9F7] border border-black/[0.08] space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={blk.heading}
                            onChange={(e) =>
                              updateScreen({
                                conditionalBlocks: (
                                  selectedOutcome.resultScreen.conditionalBlocks || []
                                ).map((b) =>
                                  b.id === blk.id ? { ...b, heading: e.target.value } : b
                                ),
                              })
                            }
                            placeholder="Block heading"
                            className="flex-1 h-8 px-2.5 text-xs font-semibold bg-white border border-black/[0.1] rounded-lg"
                          />
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() =>
                                updateScreen({
                                  conditionalBlocks: (
                                    selectedOutcome.resultScreen.conditionalBlocks || []
                                  ).filter((b) => b.id !== blk.id),
                                })
                              }
                              className="p-1.5 text-[#5C6066] hover:text-rose-600"
                              aria-label="Remove block"
                            >
                              <Trash size={13} />
                            </button>
                          )}
                        </div>
                        <textarea
                          rows={2}
                          disabled={isReadOnly}
                          value={blk.body}
                          onChange={(e) =>
                            updateScreen({
                              conditionalBlocks: (
                                selectedOutcome.resultScreen.conditionalBlocks || []
                              ).map((b) => (b.id === blk.id ? { ...b, body: e.target.value } : b)),
                            })
                          }
                          placeholder="Conditional message body (supports {{piping}})..."
                          className="w-full p-2.5 text-xs bg-white border border-black/[0.1] rounded-lg"
                        />
                        <LogicConditionGroupEditor
                          document={document}
                          group={blk.conditionGroup}
                          onChange={(nextGroup) =>
                            updateScreen({
                              conditionalBlocks: (
                                selectedOutcome.resultScreen.conditionalBlocks || []
                              ).map((b) =>
                                b.id === blk.id ? { ...b, conditionGroup: nextGroup } : b
                              ),
                            })
                          }
                          isReadOnly={isReadOnly}
                          selectableComponents={questionComponents}
                        />
                      </div>
                    ))}
                  </section>

                  {/* Design System Overrides */}
                  <section className="bg-white rounded-2xl border border-black/[0.08] p-4 sm:p-5 space-y-3">
                    <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] block">
                      Design Overrides (Inherits Global Theme When Blank)
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#5C6066] mb-1">Accent</label>
                        <input
                          type="color"
                          disabled={isReadOnly}
                          value={
                            selectedOutcome.resultScreen.appearance?.accentColor ||
                            document.design.primaryColor ||
                            '#0F766E'
                          }
                          onChange={(e) =>
                            updateScreen({
                              appearance: {
                                ...(selectedOutcome.resultScreen.appearance || {}),
                                accentColor: e.target.value,
                              },
                            })
                          }
                          className="w-full h-8 rounded-lg border border-black/[0.1] cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#5C6066] mb-1">Surface</label>
                        <input
                          type="color"
                          disabled={isReadOnly}
                          value={
                            selectedOutcome.resultScreen.appearance?.surfaceColor ||
                            document.design.surfaceColor ||
                            '#FFFFFF'
                          }
                          onChange={(e) =>
                            updateScreen({
                              appearance: {
                                ...(selectedOutcome.resultScreen.appearance || {}),
                                surfaceColor: e.target.value,
                              },
                            })
                          }
                          className="w-full h-8 rounded-lg border border-black/[0.1] cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#5C6066] mb-1">Text</label>
                        <input
                          type="color"
                          disabled={isReadOnly}
                          value={
                            selectedOutcome.resultScreen.appearance?.textColor ||
                            document.design.textColor ||
                            '#0B0D0F'
                          }
                          onChange={(e) =>
                            updateScreen({
                              appearance: {
                                ...(selectedOutcome.resultScreen.appearance || {}),
                                textColor: e.target.value,
                              },
                            })
                          }
                          className="w-full h-8 rounded-lg border border-black/[0.1] cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#5C6066] mb-1">Alignment</label>
                        <select
                          disabled={isReadOnly}
                          value={selectedOutcome.resultScreen.appearance?.textAlign || 'center'}
                          onChange={(e) =>
                            updateScreen({
                              appearance: {
                                ...(selectedOutcome.resultScreen.appearance || {}),
                                textAlign: e.target.value as TextAlign,
                              },
                            })
                          }
                          className="w-full h-8 px-2 text-xs bg-white border border-black/[0.1] rounded-lg"
                        >
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {/* TAB 3: LIVE RESULT SCREEN PREVIEW */}
              {editorTab === 'preview' && selectedOutcomePreview && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-[#5C6066]">
                    <span className="inline-flex items-center gap-1.5 font-medium text-[#0B0D0F]">
                      <CheckCircle size={14} weight="fill" className="text-[#0F766E]" />
                      <span>
                        Previewing &ldquo;{selectedOutcome.name}&rdquo; with current simulated
                        answers
                      </span>
                    </span>
                    <span className="font-mono text-[11px]">Isolated test mode</span>
                  </div>
                  <OutcomeResultCard
                    outcome={selectedOutcomePreview}
                    scoring={liveScoring}
                    design={document.design}
                    isPreview={true}
                  />
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};
