import React, { useMemo, useState } from 'react';
import {
  Calculator,
  ChartBar,
  LockSimple,
  Plus,
  SlidersHorizontal,
  Trash,
  Trophy,
} from '@phosphor-icons/react';
import {
  FormDocument,
  FormScoringConfig,
  NumericRangeScoreRule,
  QuestionScoringMode,
  QuestionScoringRule,
  ScoreThreshold,
  ScoringCategory,
  ScoringEvaluationResult,
  formComponentRegistry,
  getOrderedComponents,
} from '../../studio';
import { FormulaEditor } from './FormulaEditor';

interface ScoringManagerProps {
  document: FormDocument;
  onUpdateScoring: (scoring: FormScoringConfig) => void;
  liveScoring: ScoringEvaluationResult;
  sampleAnswers: Record<string, unknown>;
  resolvedVariables: Record<string, unknown>;
  isReadOnly?: boolean;
}

const DEFAULT_SCORING_CONFIG: FormScoringConfig = {
  enabled: false,
  hidePrivateConfigFromRespondents: true,
  categories: [],
  rules: [],
  totalThresholds: [],
};

const CATEGORY_COLORS = [
  '#0F766E',
  '#2563EB',
  '#7C3AED',
  '#D97706',
  '#DC2626',
  '#059669',
  '#0B0D0F',
];

const MODE_OPTIONS: { value: QuestionScoringMode; label: string }[] = [
  { value: 'option_points', label: 'Points per answer option' },
  { value: 'exact_match', label: 'Correct answer match' },
  { value: 'numeric_value', label: 'Direct numeric answer' },
  { value: 'range_points', label: 'Numeric score ranges' },
  { value: 'formula', label: 'Calculated formula' },
];

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}`;
}

export const ScoringManager: React.FC<ScoringManagerProps> = ({
  document,
  onUpdateScoring,
  liveScoring,
  sampleAnswers,
  resolvedVariables,
  isReadOnly = false,
}) => {
  const scoring: FormScoringConfig = useMemo(
    () => ({
      ...DEFAULT_SCORING_CONFIG,
      ...(document.scoring || {}),
      categories: document.scoring?.categories || [],
      rules: document.scoring?.rules || [],
      totalThresholds: document.scoring?.totalThresholds || [],
    }),
    [document.scoring]
  );

  const [section, setSection] = useState<'questions' | 'categories' | 'thresholds'>('questions');
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);

  const questionComponents = useMemo(
    () =>
      getOrderedComponents(document).filter((node) => {
        const def = formComponentRegistry.get(node.type);
        return !def || def.isQuestion;
      }),
    [document]
  );

  const update = (patch: Partial<FormScoringConfig>) => {
    if (isReadOnly) return;
    onUpdateScoring({ ...scoring, ...patch });
  };

  // Category CRUD
  const addCategory = () => {
    const color = CATEGORY_COLORS[scoring.categories.length % CATEGORY_COLORS.length];
    const next: ScoringCategory = {
      id: makeId('cat'),
      name: `Category ${scoring.categories.length + 1}`,
      description: '',
      color,
      thresholds: [],
    };
    update({ enabled: true, categories: [...scoring.categories, next] });
  };

  const updateCategory = (id: string, patch: Partial<ScoringCategory>) => {
    update({
      categories: scoring.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  };

  const deleteCategory = (id: string) => {
    update({
      categories: scoring.categories.filter((c) => c.id !== id),
      rules: scoring.rules.map((r) => (r.categoryId === id ? { ...r, categoryId: undefined } : r)),
    });
  };

  // Threshold helper (shared for Total & Category thresholds)
  const makeThreshold = (count: number): ScoreThreshold => ({
    id: makeId('thr'),
    label: count === 0 ? 'Low' : count === 1 ? 'Moderate' : 'High',
    minPercent: count === 0 ? 0 : count === 1 ? 50 : 80,
    maxPercent: count === 0 ? 49 : count === 1 ? 79 : 100,
    description: '',
  });

  // Question scoring rule helpers
  const getRuleForQuestion = (componentId: string): QuestionScoringRule | undefined =>
    scoring.rules.find((r) => r.componentId === componentId);

  const upsertQuestionRule = (componentId: string, patch?: Partial<QuestionScoringRule>) => {
    const existing = getRuleForQuestion(componentId);
    if (existing) {
      update({
        rules: scoring.rules.map((r) =>
          r.id === existing.id ? { ...r, ...patch } : r
        ),
      });
      return;
    }
    const comp = document.components[componentId];
    const hasChoices =
      comp &&
      (comp.type === 'radio' ||
        comp.type === 'select' ||
        comp.type === 'checkbox' ||
        comp.type === 'yes_no');
    const isNumeric = comp && (comp.type === 'number' || comp.type === 'rating' || comp.type === 'scale');

    const defaultMode: QuestionScoringMode = hasChoices
      ? 'option_points'
      : isNumeric
      ? 'numeric_value'
      : 'exact_match';

    const optionPoints: Record<string, number> = {};
    if (hasChoices) {
      const opts =
        comp.type === 'yes_no'
          ? ['Yes', 'No']
          : comp.content.options || [];
      opts.forEach((opt, idx) => {
        optionPoints[opt] = idx === 0 ? 10 : Math.max(0, 10 - idx * 3);
      });
    }

    const created: QuestionScoringRule = {
      id: makeId('srule'),
      componentId,
      enabled: true,
      weight: 1,
      mode: defaultMode,
      optionPoints: hasChoices ? optionPoints : undefined,
      points: 10,
      rangePoints: isNumeric
        ? [
            { id: makeId('rng'), min: 0, max: 3, points: 2 },
            { id: makeId('rng'), min: 4, max: 10, points: 10 },
          ]
        : undefined,
      ...patch,
    };

    update({
      enabled: true,
      rules: [...scoring.rules, created],
    });
    setSelectedQuestionId(componentId);
  };

  const removeQuestionRule = (componentId: string) => {
    update({
      rules: scoring.rules.filter((r) => r.componentId !== componentId),
    });
  };

  const activeQuestionId = selectedQuestionId || questionComponents[0]?.id || null;
  const activeQuestion = activeQuestionId ? document.components[activeQuestionId] : undefined;
  const activeRule = activeQuestionId ? getRuleForQuestion(activeQuestionId) : undefined;

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {/* Header Bar */}
      <div className="px-4 sm:px-6 py-3.5 bg-white border-b border-black/[0.08] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#0F766E]/10 text-[#0F766E] flex items-center justify-center shrink-0">
            <Trophy size={18} weight="duotone" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-display font-semibold text-[#0B0D0F]">
              Assessment Scoring &amp; Categories
            </h2>
            <p className="text-xs text-[#5C6066] truncate">
              Assign option points, weights, ranges, formulas, multi-category dimensions, and score
              bands.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {scoring.enabled && (
            <label className="inline-flex items-center gap-1.5 text-xs text-[#5C6066] cursor-pointer select-none">
              <input
                type="checkbox"
                disabled={isReadOnly}
                checked={scoring.hidePrivateConfigFromRespondents !== false}
                onChange={(e) =>
                  update({ hidePrivateConfigFromRespondents: e.target.checked })
                }
                className="accent-[#0F766E]"
              />
              <LockSimple size={13} className="text-[#0F766E]" />
              <span>Keep answer keys private</span>
            </label>
          )}

          {!isReadOnly && (
            <button
              type="button"
              onClick={() => update({ enabled: !scoring.enabled })}
              className={`h-8 px-3.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                scoring.enabled
                  ? 'bg-[#0F766E] text-white border-[#0F766E]'
                  : 'bg-[#F7F6F3] text-[#0B0D0F] border-black/[0.1] hover:bg-[#EAE7E1]'
              }`}
            >
              {scoring.enabled ? 'Scoring Enabled' : 'Enable Scoring'}
            </button>
          )}
        </div>
      </div>

      {/* Live Score Strip + Sub-Navigation */}
      <div className="px-4 sm:px-6 py-2.5 bg-[#FAF9F7] border-b border-black/[0.08] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="inline-flex items-center rounded-lg border border-black/[0.08] bg-white p-0.5">
          <button
            type="button"
            onClick={() => setSection('questions')}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold whitespace-nowrap ${
              section === 'questions'
                ? 'bg-[#0B0D0F] text-[#F7F6F3]'
                : 'text-[#5C6066] hover:text-[#0B0D0F]'
            }`}
          >
            <Calculator size={13} />
            <span>Question Scoring ({scoring.rules.filter((r) => r.enabled).length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSection('categories')}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold whitespace-nowrap ${
              section === 'categories'
                ? 'bg-[#0B0D0F] text-[#F7F6F3]'
                : 'text-[#5C6066] hover:text-[#0B0D0F]'
            }`}
          >
            <ChartBar size={13} />
            <span>Categories ({scoring.categories.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSection('thresholds')}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold whitespace-nowrap ${
              section === 'thresholds'
                ? 'bg-[#0B0D0F] text-[#F7F6F3]'
                : 'text-[#5C6066] hover:text-[#0B0D0F]'
            }`}
          >
            <SlidersHorizontal size={13} />
            <span>Score Bands ({scoring.totalThresholds.length})</span>
          </button>
        </div>

        {liveScoring.enabled && (
          <div className="text-xs font-mono text-[#0B0D0F] tabular-nums flex items-center gap-2">
            <span className="text-[#5C6066]">Live Test Score:</span>
            <span className="font-semibold text-[#0F766E]">
              {liveScoring.totalScore} / {liveScoring.maxScore} ({liveScoring.percent}%)
            </span>
            {liveScoring.totalThreshold?.label && (
              <span className="text-[#5C6066]">· {liveScoring.totalThreshold.label}</span>
            )}
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0">
        {section === 'questions' && (
          <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Question List */}
            <div className="lg:col-span-4 space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] px-1 mb-2">
                Select Question to Score
              </div>
              {questionComponents.length === 0 ? (
                <div className="p-5 bg-white rounded-xl border border-dashed border-black/[0.12] text-xs text-[#5C6066] text-center">
                  Add questions in the Build tab to configure scoring.
                </div>
              ) : (
                questionComponents.map((q, idx) => {
                  const rule = getRuleForQuestion(q.id);
                  const isSelected = activeQuestionId === q.id;
                  const cat = rule?.categoryId
                    ? scoring.categories.find((c) => c.id === rule.categoryId)
                    : undefined;
                  const breakdown = liveScoring.questionBreakdowns.find(
                    (b) => b.componentId === q.id
                  );

                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setSelectedQuestionId(q.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-colors ${
                        isSelected
                          ? 'bg-[#0F766E]/[0.06] border-[#0F766E]/40'
                          : 'bg-white border-black/[0.08] hover:bg-[#FAF9F7]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-[#0B0D0F] truncate">
                          Q{idx + 1}. {q.content.label || 'Untitled'}
                        </span>
                        {rule?.enabled ? (
                          <span className="text-[11px] font-mono font-semibold text-[#0F766E] tabular-nums shrink-0">
                            {breakdown ? `${breakdown.weightedPoints}pt` : `${rule.weight}×`}
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-[#5C6066] shrink-0">
                            Unscored
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[11px] text-[#5C6066] truncate">
                        {q.type}
                        {cat ? ` · ${cat.name}` : ''}
                        {rule?.enabled ? ` · ${rule.mode.replace(/_/g, ' ')}` : ''}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Right Question Scoring Configurator */}
            <div className="lg:col-span-8">
              {!activeQuestion ? (
                <div className="bg-white rounded-2xl border border-black/[0.08] p-8 text-center text-xs text-[#5C6066]">
                  Select a question to configure its scoring rule.
                </div>
              ) : !activeRule ? (
                <div className="bg-white rounded-2xl border border-black/[0.08] p-8 text-center space-y-3">
                  <h3 className="text-sm font-display font-semibold text-[#0B0D0F]">
                    {activeQuestion.content.label || 'Untitled Question'}
                  </h3>
                  <p className="text-xs text-[#5C6066] max-w-md mx-auto">
                    This question is not currently scored. Add a scoring rule to award points per
                    option, by numeric range, exact answer, or formula.
                  </p>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => upsertQuestionRule(activeQuestion.id)}
                      className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#0B0D0F] hover:bg-[#191D21] text-[#F7F6F3] text-xs font-semibold transition-colors whitespace-nowrap"
                    >
                      <Plus size={14} weight="bold" />
                      <span>Configure Scoring for This Question</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-black/[0.08] p-5 space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-black/[0.07]">
                    <div className="min-w-0">
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#5C6066] block">
                        Scoring Rule · {activeQuestion.type}
                      </span>
                      <h3 className="text-sm font-display font-semibold text-[#0B0D0F] truncate">
                        {activeQuestion.content.label || 'Untitled Question'}
                      </h3>
                    </div>
                    {!isReadOnly && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            upsertQuestionRule(activeQuestion.id, { enabled: !activeRule.enabled })
                          }
                          className={`h-8 px-3 rounded-lg border text-xs font-semibold whitespace-nowrap ${
                            activeRule.enabled
                              ? 'bg-[#0F766E]/10 text-[#0F766E] border-[#0F766E]/30'
                              : 'bg-[#F7F6F3] text-[#5C6066] border-black/[0.08]'
                          }`}
                        >
                          {activeRule.enabled ? 'Active' : 'Paused'}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeQuestionRule(activeQuestion.id)}
                          className="h-8 px-2.5 rounded-lg border border-black/[0.08] text-[#5C6066] hover:text-rose-600 hover:bg-rose-50"
                          aria-label="Remove scoring rule"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Mode, Category, Weight */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                        Scoring Method
                      </label>
                      <select
                        disabled={isReadOnly}
                        value={activeRule.mode}
                        onChange={(e) =>
                          upsertQuestionRule(activeQuestion.id, {
                            mode: e.target.value as QuestionScoringMode,
                          })
                        }
                        className="w-full h-9 px-2.5 text-xs bg-[#FAF9F7] border border-black/[0.08] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                      >
                        {MODE_OPTIONS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                        Scoring Category
                      </label>
                      <select
                        disabled={isReadOnly}
                        value={activeRule.categoryId || ''}
                        onChange={(e) =>
                          upsertQuestionRule(activeQuestion.id, {
                            categoryId: e.target.value || undefined,
                          })
                        }
                        className="w-full h-9 px-2.5 text-xs bg-[#FAF9F7] border border-black/[0.08] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                      >
                        <option value="">Overall Total Only</option>
                        {scoring.categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                          Weight
                        </label>
                        <input
                          type="number"
                          step="0.25"
                          disabled={isReadOnly}
                          value={activeRule.weight}
                          onChange={(e) =>
                            upsertQuestionRule(activeQuestion.id, {
                              weight: Number(e.target.value) || 0,
                            })
                          }
                          className="w-full h-9 px-2.5 text-xs font-mono tabular-nums bg-white border border-black/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                          Max Override
                        </label>
                        <input
                          type="number"
                          disabled={isReadOnly}
                          value={activeRule.maxPointsOverride ?? ''}
                          placeholder="Auto"
                          onChange={(e) =>
                            upsertQuestionRule(activeQuestion.id, {
                              maxPointsOverride:
                                e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                          className="w-full h-9 px-2.5 text-xs font-mono tabular-nums bg-white border border-black/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Mode-specific controls */}
                  {activeRule.mode === 'option_points' && (
                    <div className="space-y-2 pt-2 border-t border-black/[0.06]">
                      <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066]">
                        Points Per Answer Option
                      </div>
                      {(() => {
                        const opts =
                          activeQuestion.type === 'yes_no'
                            ? ['Yes', 'No']
                            : activeQuestion.content.options || [];
                        if (opts.length === 0) {
                          return (
                            <p className="text-xs text-[#5C6066]">
                              This question has no choice options. Add options in Build or switch
                              scoring method.
                            </p>
                          );
                        }
                        return (
                          <div className="space-y-1.5">
                            {opts.map((opt) => (
                              <div
                                key={opt}
                                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-[#FAF9F7] border border-black/[0.06]"
                              >
                                <span className="text-xs font-medium text-[#0B0D0F] truncate">
                                  {opt}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <input
                                    type="number"
                                    step="0.5"
                                    disabled={isReadOnly}
                                    value={activeRule.optionPoints?.[opt] ?? 0}
                                    onChange={(e) =>
                                      upsertQuestionRule(activeQuestion.id, {
                                        optionPoints: {
                                          ...(activeRule.optionPoints || {}),
                                          [opt]: Number(e.target.value) || 0,
                                        },
                                      })
                                    }
                                    className="w-20 h-8 px-2 text-xs font-mono text-right tabular-nums bg-white border border-black/[0.1] rounded-md focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                                  />
                                  <span className="text-[11px] font-mono text-[#5C6066]">pts</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {activeRule.mode === 'exact_match' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-black/[0.06]">
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                          Correct Answer
                        </label>
                        {(activeQuestion.type === 'radio' ||
                          activeQuestion.type === 'select' ||
                          activeQuestion.type === 'yes_no') ? (
                          <select
                            disabled={isReadOnly}
                            value={String(activeRule.correctAnswer || '')}
                            onChange={(e) =>
                              upsertQuestionRule(activeQuestion.id, {
                                correctAnswer: e.target.value,
                              })
                            }
                            className="w-full h-9 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg"
                          >
                            <option value="">Select correct answer...</option>
                            {(activeQuestion.type === 'yes_no'
                              ? ['Yes', 'No']
                              : activeQuestion.content.options || []
                            ).map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={
                              Array.isArray(activeRule.correctAnswer)
                                ? activeRule.correctAnswer.join(', ')
                                : String(activeRule.correctAnswer || '')
                            }
                            onChange={(e) =>
                              upsertQuestionRule(activeQuestion.id, {
                                correctAnswer: e.target.value,
                              })
                            }
                            placeholder="Expected answer..."
                            className="w-full h-9 px-3 text-xs bg-white border border-black/[0.1] rounded-lg"
                          />
                        )}
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                          Points Awarded
                        </label>
                        <input
                          type="number"
                          disabled={isReadOnly}
                          value={activeRule.points ?? 10}
                          onChange={(e) =>
                            upsertQuestionRule(activeQuestion.id, {
                              points: Number(e.target.value) || 0,
                            })
                          }
                          className="w-full h-9 px-2.5 text-xs font-mono tabular-nums bg-white border border-black/[0.1] rounded-lg"
                        />
                      </div>
                    </div>
                  )}

                  {activeRule.mode === 'numeric_value' && (
                    <div className="p-3 rounded-xl bg-[#FAF9F7] border border-black/[0.06] text-xs text-[#5C6066]">
                      Awards the respondent&apos;s numeric answer directly multiplied by the
                      question weight ({activeRule.weight}×). Set a Max Override above if the
                      question has no built-in maximum.
                    </div>
                  )}

                  {activeRule.mode === 'range_points' && (
                    <div className="space-y-2.5 pt-2 border-t border-black/[0.06]">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066]">
                          Numeric Score Ranges (Inclusive)
                        </span>
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={() => {
                              const nextRange: NumericRangeScoreRule = {
                                id: makeId('rng'),
                                min: 0,
                                max: 10,
                                points: 5,
                              };
                              upsertQuestionRule(activeQuestion.id, {
                                rangePoints: [...(activeRule.rangePoints || []), nextRange],
                              });
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F766E] hover:underline"
                          >
                            <Plus size={12} weight="bold" />
                            <span>Add Range</span>
                          </button>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {(activeRule.rangePoints || []).map((rng) => (
                          <div
                            key={rng.id}
                            className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg bg-[#FAF9F7] border border-black/[0.06]"
                          >
                            <input
                              type="number"
                              disabled={isReadOnly}
                              placeholder="Min"
                              value={rng.min ?? ''}
                              onChange={(e) =>
                                upsertQuestionRule(activeQuestion.id, {
                                  rangePoints: (activeRule.rangePoints || []).map((r) =>
                                    r.id === rng.id
                                      ? {
                                          ...r,
                                          min:
                                            e.target.value === ''
                                              ? undefined
                                              : Number(e.target.value),
                                        }
                                      : r
                                  ),
                                })
                              }
                              className="col-span-4 h-8 px-2 text-xs font-mono tabular-nums bg-white border border-black/[0.1] rounded-md"
                            />
                            <input
                              type="number"
                              disabled={isReadOnly}
                              placeholder="Max"
                              value={rng.max ?? ''}
                              onChange={(e) =>
                                upsertQuestionRule(activeQuestion.id, {
                                  rangePoints: (activeRule.rangePoints || []).map((r) =>
                                    r.id === rng.id
                                      ? {
                                          ...r,
                                          max:
                                            e.target.value === ''
                                              ? undefined
                                              : Number(e.target.value),
                                        }
                                      : r
                                  ),
                                })
                              }
                              className="col-span-4 h-8 px-2 text-xs font-mono tabular-nums bg-white border border-black/[0.1] rounded-md"
                            />
                            <input
                              type="number"
                              disabled={isReadOnly}
                              placeholder="Pts"
                              value={rng.points}
                              onChange={(e) =>
                                upsertQuestionRule(activeQuestion.id, {
                                  rangePoints: (activeRule.rangePoints || []).map((r) =>
                                    r.id === rng.id
                                      ? { ...r, points: Number(e.target.value) || 0 }
                                      : r
                                  ),
                                })
                              }
                              className="col-span-3 h-8 px-2 text-xs font-mono tabular-nums bg-white border border-black/[0.1] rounded-md"
                            />
                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={() =>
                                  upsertQuestionRule(activeQuestion.id, {
                                    rangePoints: (activeRule.rangePoints || []).filter(
                                      (r) => r.id !== rng.id
                                    ),
                                  })
                                }
                                className="col-span-1 flex justify-center text-[#5C6066] hover:text-rose-600"
                                aria-label="Remove range"
                              >
                                <Trash size={13} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeRule.mode === 'formula' && (
                    <div className="space-y-1.5 pt-2 border-t border-black/[0.06]">
                      <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066]">
                        Calculated Score Formula
                      </label>
                      <FormulaEditor
                        document={document}
                        value={activeRule.formulaExpression || ''}
                        onChange={(expr) =>
                          upsertQuestionRule(activeQuestion.id, { formulaExpression: expr })
                        }
                        sampleAnswers={sampleAnswers}
                        sampleVariables={resolvedVariables}
                        disabled={isReadOnly}
                        placeholder="e.g. min({{hours}} * 2, 20)"
                      />
                    </div>
                  )}

                  {activeRule.categoryId && (
                    <label className="inline-flex items-center gap-2 text-xs text-[#5C6066] cursor-pointer select-none pt-1">
                      <input
                        type="checkbox"
                        disabled={isReadOnly}
                        checked={Boolean(activeRule.excludeFromTotal)}
                        onChange={(e) =>
                          upsertQuestionRule(activeQuestion.id, {
                            excludeFromTotal: e.target.checked,
                          })
                        }
                        className="accent-[#0F766E]"
                      />
                      <span>Count only toward selected category (exclude from overall total)</span>
                    </label>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {section === 'categories' && (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-display font-semibold text-[#0B0D0F]">
                  Independent Scoring Categories
                </h3>
                <p className="text-xs text-[#5C6066]">
                  Track separate dimensions such as Communication, Leadership, Technical knowledge,
                  or Financial readiness.
                </p>
              </div>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={addCategory}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#0B0D0F] hover:bg-[#191D21] text-[#F7F6F3] text-xs font-semibold whitespace-nowrap shrink-0"
                >
                  <Plus size={13} weight="bold" />
                  <span>Add Category</span>
                </button>
              )}
            </div>

            {scoring.categories.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-black/[0.14] p-8 text-center text-xs text-[#5C6066]">
                No scoring categories yet. Add categories to compute multi-dimensional scores and
                render category breakdowns on personalised result screens.
              </div>
            ) : (
              <div className="space-y-4">
                {scoring.categories.map((cat) => {
                  const liveCat = liveScoring.categories.find((c) => c.categoryId === cat.id);
                  return (
                    <div
                      key={cat.id}
                      className="bg-white rounded-2xl border border-black/[0.08] p-4 sm:p-5 space-y-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex-1 min-w-[200px] grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                              Category Name
                            </label>
                            <input
                              type="text"
                              disabled={isReadOnly}
                              value={cat.name}
                              onChange={(e) => updateCategory(cat.id, { name: e.target.value })}
                              placeholder="e.g. Leadership"
                              className="w-full h-9 px-3 text-xs font-semibold bg-[#FAF9F7] border border-black/[0.08] rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0F766E]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                              Max Score Override
                            </label>
                            <input
                              type="number"
                              disabled={isReadOnly}
                              value={cat.maxScoreOverride ?? ''}
                              placeholder="Auto"
                              onChange={(e) =>
                                updateCategory(cat.id, {
                                  maxScoreOverride:
                                    e.target.value === '' ? undefined : Number(e.target.value),
                                })
                              }
                              className="w-full h-9 px-2.5 text-xs font-mono tabular-nums bg-white border border-black/[0.1] rounded-lg"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-5">
                          {liveCat && (
                            <span className="text-xs font-mono font-semibold text-[#0F766E] tabular-nums">
                              {liveCat.score}/{liveCat.maxScore} ({liveCat.percent}%)
                            </span>
                          )}
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => deleteCategory(cat.id)}
                              className="p-2 rounded-lg border border-black/[0.08] text-[#5C6066] hover:text-rose-600 hover:bg-rose-50"
                              aria-label="Delete category"
                            >
                              <Trash size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066]">
                          Accent
                        </span>
                        {CATEGORY_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => updateCategory(cat.id, { color: c })}
                            className={`w-5 h-5 rounded-full border-2 transition-transform ${
                              cat.color === c ? 'border-[#0B0D0F] scale-110' : 'border-transparent'
                            }`}
                            style={{ backgroundColor: c }}
                            aria-label={`Color ${c}`}
                          />
                        ))}
                      </div>

                      {/* Category Thresholds */}
                      <div className="space-y-2 pt-3 border-t border-black/[0.06]">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066]">
                            Category Score Bands ({cat.thresholds.length})
                          </span>
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() =>
                                updateCategory(cat.id, {
                                  thresholds: [
                                    ...cat.thresholds,
                                    makeThreshold(cat.thresholds.length),
                                  ],
                                })
                              }
                              className="text-xs font-semibold text-[#0F766E] hover:underline inline-flex items-center gap-1"
                            >
                              <Plus size={12} weight="bold" />
                              <span>Add Band</span>
                            </button>
                          )}
                        </div>
                        {cat.thresholds.map((thr) => (
                          <div
                            key={thr.id}
                            className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg bg-[#FAF9F7] border border-black/[0.06]"
                          >
                            <input
                              type="text"
                              disabled={isReadOnly}
                              value={thr.label}
                              placeholder="Band label"
                              onChange={(e) =>
                                updateCategory(cat.id, {
                                  thresholds: cat.thresholds.map((t) =>
                                    t.id === thr.id ? { ...t, label: e.target.value } : t
                                  ),
                                })
                              }
                              className="col-span-5 h-8 px-2 text-xs bg-white border border-black/[0.1] rounded-md"
                            />
                            <input
                              type="number"
                              disabled={isReadOnly}
                              placeholder="Min %"
                              value={thr.minPercent ?? ''}
                              onChange={(e) =>
                                updateCategory(cat.id, {
                                  thresholds: cat.thresholds.map((t) =>
                                    t.id === thr.id
                                      ? {
                                          ...t,
                                          minPercent:
                                            e.target.value === ''
                                              ? undefined
                                              : Number(e.target.value),
                                        }
                                      : t
                                  ),
                                })
                              }
                              className="col-span-3 h-8 px-2 text-xs font-mono tabular-nums bg-white border border-black/[0.1] rounded-md"
                            />
                            <input
                              type="number"
                              disabled={isReadOnly}
                              placeholder="Max %"
                              value={thr.maxPercent ?? ''}
                              onChange={(e) =>
                                updateCategory(cat.id, {
                                  thresholds: cat.thresholds.map((t) =>
                                    t.id === thr.id
                                      ? {
                                          ...t,
                                          maxPercent:
                                            e.target.value === ''
                                              ? undefined
                                              : Number(e.target.value),
                                        }
                                      : t
                                  ),
                                })
                              }
                              className="col-span-3 h-8 px-2 text-xs font-mono tabular-nums bg-white border border-black/[0.1] rounded-md"
                            />
                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={() =>
                                  updateCategory(cat.id, {
                                    thresholds: cat.thresholds.filter((t) => t.id !== thr.id),
                                  })
                                }
                                className="col-span-1 flex justify-center text-[#5C6066] hover:text-rose-600"
                                aria-label="Remove band"
                              >
                                <Trash size={13} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {section === 'thresholds' && (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-display font-semibold text-[#0B0D0F]">
                  Overall Score Thresholds
                </h3>
                <p className="text-xs text-[#5C6066]">
                  Map total score or percentage ranges to named bands usable via{' '}
                  <code className="font-mono text-[#0F766E]">{'{{score_band}}'}</code>.
                </p>
              </div>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() =>
                    update({
                      enabled: true,
                      totalThresholds: [
                        ...scoring.totalThresholds,
                        makeThreshold(scoring.totalThresholds.length),
                      ],
                    })
                  }
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#0B0D0F] hover:bg-[#191D21] text-[#F7F6F3] text-xs font-semibold whitespace-nowrap shrink-0"
                >
                  <Plus size={13} weight="bold" />
                  <span>Add Threshold</span>
                </button>
              )}
            </div>

            {scoring.totalThresholds.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-black/[0.14] p-8 text-center text-xs text-[#5C6066]">
                No score thresholds defined yet. Add bands like Developing (0–49%), Proficient
                (50–79%), and Mastery (80–100%).
              </div>
            ) : (
              <div className="space-y-3">
                {scoring.totalThresholds.map((thr) => (
                  <div
                    key={thr.id}
                    className="bg-white rounded-xl border border-black/[0.08] p-4 space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                      <div className="sm:col-span-4">
                        <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                          Band Label
                        </label>
                        <input
                          type="text"
                          disabled={isReadOnly}
                          value={thr.label}
                          onChange={(e) =>
                            update({
                              totalThresholds: scoring.totalThresholds.map((t) =>
                                t.id === thr.id ? { ...t, label: e.target.value } : t
                              ),
                            })
                          }
                          className="w-full h-8 px-2.5 text-xs font-semibold bg-[#FAF9F7] border border-black/[0.08] rounded-lg"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                          Min Score
                        </label>
                        <input
                          type="number"
                          disabled={isReadOnly}
                          value={thr.minScore ?? ''}
                          placeholder="Any"
                          onChange={(e) =>
                            update({
                              totalThresholds: scoring.totalThresholds.map((t) =>
                                t.id === thr.id
                                  ? {
                                      ...t,
                                      minScore:
                                        e.target.value === ''
                                          ? undefined
                                          : Number(e.target.value),
                                    }
                                  : t
                              ),
                            })
                          }
                          className="w-full h-8 px-2 text-xs font-mono tabular-nums bg-white border border-black/[0.1] rounded-lg"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                          Max Score
                        </label>
                        <input
                          type="number"
                          disabled={isReadOnly}
                          value={thr.maxScore ?? ''}
                          placeholder="Any"
                          onChange={(e) =>
                            update({
                              totalThresholds: scoring.totalThresholds.map((t) =>
                                t.id === thr.id
                                  ? {
                                      ...t,
                                      maxScore:
                                        e.target.value === ''
                                          ? undefined
                                          : Number(e.target.value),
                                    }
                                  : t
                              ),
                            })
                          }
                          className="w-full h-8 px-2 text-xs font-mono tabular-nums bg-white border border-black/[0.1] rounded-lg"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                          Min %
                        </label>
                        <input
                          type="number"
                          disabled={isReadOnly}
                          value={thr.minPercent ?? ''}
                          placeholder="Any"
                          onChange={(e) =>
                            update({
                              totalThresholds: scoring.totalThresholds.map((t) =>
                                t.id === thr.id
                                  ? {
                                      ...t,
                                      minPercent:
                                        e.target.value === ''
                                          ? undefined
                                          : Number(e.target.value),
                                    }
                                  : t
                              ),
                            })
                          }
                          className="w-full h-8 px-2 text-xs font-mono tabular-nums bg-white border border-black/[0.1] rounded-lg"
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                          Max %
                        </label>
                        <input
                          type="number"
                          disabled={isReadOnly}
                          value={thr.maxPercent ?? ''}
                          placeholder="Any"
                          onChange={(e) =>
                            update({
                              totalThresholds: scoring.totalThresholds.map((t) =>
                                t.id === thr.id
                                  ? {
                                      ...t,
                                      maxPercent:
                                        e.target.value === ''
                                          ? undefined
                                          : Number(e.target.value),
                                    }
                                  : t
                              ),
                            })
                          }
                          className="w-full h-8 px-2 text-xs font-mono tabular-nums bg-white border border-black/[0.1] rounded-lg"
                        />
                      </div>
                      <div className="sm:col-span-1 flex justify-end">
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={() =>
                              update({
                                totalThresholds: scoring.totalThresholds.filter(
                                  (t) => t.id !== thr.id
                                ),
                              })
                            }
                            className="p-2 rounded-lg text-[#5C6066] hover:text-rose-600 hover:bg-rose-50"
                            aria-label="Remove threshold"
                          >
                            <Trash size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    <input
                      type="text"
                      disabled={isReadOnly}
                      value={thr.description || ''}
                      placeholder="Optional summary shown inside the score card for this band..."
                      onChange={(e) =>
                        update({
                          totalThresholds: scoring.totalThresholds.map((t) =>
                            t.id === thr.id ? { ...t, description: e.target.value } : t
                          ),
                        })
                      }
                      className="w-full h-8 px-2.5 text-xs bg-[#FAF9F7] border border-black/[0.08] rounded-lg"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
