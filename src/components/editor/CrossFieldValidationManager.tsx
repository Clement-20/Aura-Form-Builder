import React, { useMemo, useState } from 'react';
import {
  CheckCircle,
  Copy,
  Lightning,
  Plus,
  ShieldCheck,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react';
import {
  CrossFieldOperator,
  CrossFieldValidationRule,
  FormDocument,
  LogicConditionGroup,
  createEmptyConditionGroup,
  formComponentRegistry,
  getOrderedComponents,
  validateCrossFieldRules,
} from '../../studio';
import { FormulaEditor } from './FormulaEditor';
import { AnswerPipingPicker } from './AnswerPipingPicker';
import { LogicConditionGroupEditor } from './LogicConditionGroupEditor';

interface CrossFieldValidationManagerProps {
  document: FormDocument;
  onUpdateRules: (rules: CrossFieldValidationRule[]) => void;
  sampleAnswers: Record<string, unknown>;
  resolvedVariables: Record<string, unknown>;
  formattedVariables: Record<string, string>;
  visibleComponentIds: Set<string>;
  disabledComponentIds: Set<string>;
  isReadOnly?: boolean;
}

const OPERATOR_OPTIONS: { value: CrossFieldOperator; label: string; group: string }[] = [
  { value: 'equals_field', label: 'Matches another question', group: 'Match' },
  { value: 'not_equals_field', label: 'Differs from another question', group: 'Match' },
  { value: 'after_date_field', label: 'Is after date in', group: 'Dates' },
  { value: 'before_date_field', label: 'Is before date in', group: 'Dates' },
  { value: 'greater_than_field', label: 'Is greater than (>)', group: 'Numbers' },
  { value: 'greater_or_equal_field', label: 'Is at least (>=)', group: 'Numbers' },
  { value: 'less_than_field', label: 'Is less than (<)', group: 'Numbers' },
  { value: 'less_or_equal_field', label: 'Is at most (<=)', group: 'Numbers' },
  { value: 'matches_expression', label: 'Satisfies formula expression', group: 'Formula' },
];

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}`;
}

function appendToken(current: string, token: string): string {
  if (!current) return token;
  return /\s$/.test(current) ? `${current}${token}` : `${current} ${token}`;
}

export const CrossFieldValidationManager: React.FC<CrossFieldValidationManagerProps> = ({
  document,
  onUpdateRules,
  sampleAnswers,
  resolvedVariables,
  formattedVariables,
  visibleComponentIds,
  disabledComponentIds,
  isReadOnly = false,
}) => {
  const rules = useMemo(
    () => document.logic.crossFieldValidations || [],
    [document.logic.crossFieldValidations]
  );

  const questionComponents = useMemo(
    () =>
      getOrderedComponents(document).filter((node) => {
        const def = formComponentRegistry.get(node.type);
        return !def || def.isQuestion;
      }),
    [document]
  );

  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(() => rules[0]?.id || null);

  const selectedRule = useMemo(() => {
    if (selectedRuleId) {
      const match = rules.find((r) => r.id === selectedRuleId);
      if (match) return match;
    }
    return rules[0] || null;
  }, [rules, selectedRuleId]);

  const liveCrossFieldErrors = useMemo(
    () =>
      validateCrossFieldRules(
        document,
        sampleAnswers,
        {
          visibleComponentIds,
          disabledComponentIds,
        },
        {
          document,
          answers: sampleAnswers,
          variables: resolvedVariables,
          formattedVariables,
        }
      ),
    [
      document,
      sampleAnswers,
      visibleComponentIds,
      disabledComponentIds,
      resolvedVariables,
      formattedVariables,
    ]
  );

  const createRule = (overrides?: Partial<CrossFieldValidationRule>) => {
    if (isReadOnly) return;
    const firstId = questionComponents[0]?.id || '';
    const secondId = questionComponents[1]?.id || firstId;
    const next: CrossFieldValidationRule = {
      id: makeId('cfv'),
      name: 'New Cross-Field Check',
      enabled: true,
      sourceComponentId: secondId || firstId,
      compareComponentId: firstId,
      targetComponentId: secondId || firstId,
      operator: 'equals_field',
      caseSensitive: false,
      errorMessage: 'Values do not match.',
      ...overrides,
    };
    onUpdateRules([...rules, next]);
    setSelectedRuleId(next.id);
  };

  const applyPreset = (preset: 'confirm_email' | 'date_range' | 'capacity') => {
    if (preset === 'confirm_email') {
      const emails = questionComponents.filter((c) => c.type === 'email' || c.type === 'text');
      const primary = emails[0]?.id || questionComponents[0]?.id || '';
      const confirm = emails[1]?.id || questionComponents[1]?.id || primary;
      createRule({
        name: 'Confirm Email Matches',
        sourceComponentId: confirm,
        compareComponentId: primary,
        targetComponentId: confirm,
        operator: 'equals_field',
        caseSensitive: false,
        errorMessage: 'Email addresses must match.',
      });
    } else if (preset === 'date_range') {
      const dates = questionComponents.filter((c) => c.type === 'date');
      const start = dates[0]?.id || questionComponents[0]?.id || '';
      const end = dates[1]?.id || questionComponents[1]?.id || start;
      createRule({
        name: 'End Date After Start Date',
        sourceComponentId: end,
        compareComponentId: start,
        targetComponentId: end,
        operator: 'after_date_field',
        errorMessage: 'End date must be after the start date.',
      });
    } else {
      const nums = questionComponents.filter((c) => c.type === 'number');
      const a = nums[0]?.id || questionComponents[0]?.id || '';
      const b = nums[1]?.id || questionComponents[1]?.id || a;
      createRule({
        name: 'Participants Within Capacity',
        sourceComponentId: a,
        compareComponentId: b,
        targetComponentId: a,
        operator: 'less_or_equal_field',
        errorMessage: 'Requested count cannot exceed the available capacity.',
      });
    }
  };

  const updateSelected = (patch: Partial<CrossFieldValidationRule>) => {
    if (isReadOnly || !selectedRule) return;
    onUpdateRules(
      rules.map((r) => (r.id === selectedRule.id ? { ...r, ...patch } : r))
    );
  };

  const toggleEnabled = (id: string) => {
    if (isReadOnly) return;
    onUpdateRules(rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  };

  const duplicateRule = (rule: CrossFieldValidationRule) => {
    if (isReadOnly) return;
    const copy: CrossFieldValidationRule = {
      ...JSON.parse(JSON.stringify(rule)),
      id: makeId('cfv'),
      name: `${rule.name} (Copy)`,
    };
    onUpdateRules([...rules, copy]);
    setSelectedRuleId(copy.id);
  };

  const deleteRule = (id: string) => {
    if (isReadOnly) return;
    const next = rules.filter((r) => r.id !== id);
    onUpdateRules(next);
    if (selectedRuleId === id) {
      setSelectedRuleId(next[0]?.id || null);
    }
  };

  const handleToggleGuard = (enabled: boolean) => {
    if (!selectedRule) return;
    if (enabled) {
      const group: LogicConditionGroup = createEmptyConditionGroup(document);
      updateSelected({ whenConditionGroup: group });
    } else {
      updateSelected({ whenConditionGroup: undefined });
    }
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
      {/* Left Sidebar: Rule List & Presets */}
      <aside className="w-full lg:w-[300px] shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-black/[0.08] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-black/[0.08] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-display font-semibold text-[#0B0D0F] flex items-center gap-1.5">
                <ShieldCheck size={15} weight="duotone" className="text-[#0F766E]" />
                <span>Cross-Field Checks</span>
              </h2>
              <p className="text-[11px] font-mono text-[#5C6066] mt-0.5 tabular-nums">
                {rules.length} total · {rules.filter((r) => r.enabled).length} active
              </p>
            </div>
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => createRule()}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#0B0D0F] hover:bg-[#191D21] text-[#F7F6F3] text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <Plus size={13} weight="bold" />
                <span>Add Check</span>
              </button>
            )}
          </div>

          {!isReadOnly && questionComponents.length >= 2 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] block">
                Quick Templates
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => applyPreset('confirm_email')}
                  className="px-2 py-1 rounded-md border border-black/[0.08] bg-[#FAF9F7] hover:bg-[#EAE7E1] text-[11px] font-medium text-[#0B0D0F] whitespace-nowrap"
                >
                  + Confirm Email
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('date_range')}
                  className="px-2 py-1 rounded-md border border-black/[0.08] bg-[#FAF9F7] hover:bg-[#EAE7E1] text-[11px] font-medium text-[#0B0D0F] whitespace-nowrap"
                >
                  + End &gt; Start Date
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('capacity')}
                  className="px-2 py-1 rounded-md border border-black/[0.08] bg-[#FAF9F7] hover:bg-[#EAE7E1] text-[11px] font-medium text-[#0B0D0F] whitespace-nowrap"
                >
                  + Count &le; Capacity
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 max-h-[240px] lg:max-h-none">
          {rules.length === 0 ? (
            <div className="p-5 text-center text-xs text-[#5C6066] border border-dashed border-black/[0.12] rounded-xl">
              Compare answers across multiple questions — confirm email addresses, validate date
              ranges, check capacity limits, or enforce custom formula rules.
            </div>
          ) : (
            rules.map((rule) => {
              const isSelected = selectedRule?.id === rule.id;
              const targetId = rule.targetComponentId || rule.sourceComponentId;
              const triggeredError = Boolean(liveCrossFieldErrors[targetId]);
              const opLabel =
                OPERATOR_OPTIONS.find((o) => o.value === rule.operator)?.label || rule.operator;

              return (
                <div
                  key={rule.id}
                  onClick={() => setSelectedRuleId(rule.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedRuleId(rule.id);
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
                      <div
                        className={`text-xs font-semibold truncate ${
                          rule.enabled ? 'text-[#0B0D0F]' : 'text-[#5C6066] line-through'
                        }`}
                      >
                        {rule.name || 'Untitled Check'}
                      </div>
                      <div className="mt-1 text-[11px] text-[#5C6066] truncate">
                        {opLabel}
                        {rule.enabled && triggeredError && (
                          <span className="ml-1.5 text-rose-600 font-semibold">· Failing</span>
                        )}
                      </div>
                    </div>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleEnabled(rule.id);
                        }}
                        aria-label={rule.enabled ? 'Disable check' : 'Enable check'}
                        className={`w-7 h-4 rounded-full transition-colors relative shrink-0 ${
                          rule.enabled ? 'bg-[#0F766E]' : 'bg-black/20'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                            rule.enabled ? 'left-3.5' : 'left-0.5'
                          }`}
                        />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Editor */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 min-w-0">
        <div className="max-w-3xl mx-auto space-y-5">
          {!selectedRule ? (
            <div className="bg-white rounded-2xl border border-black/[0.08] p-10 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-[#F7F6F3] border border-black/[0.08] text-[#0F766E] flex items-center justify-center mx-auto">
                <ShieldCheck size={24} weight="duotone" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-base font-display font-semibold text-[#0B0D0F]">
                  Cross-field validation
                </h3>
                <p className="text-xs text-[#5C6066] leading-relaxed">
                  Validate relationships across questions automatically on both client and server —
                  such as matching confirmation emails, verifying end dates fall after start dates,
                  or checking participant counts against capacity.
                </p>
              </div>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => createRule()}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#0B0D0F] hover:bg-[#191D21] text-[#F7F6F3] text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  <Plus size={14} weight="bold" />
                  <span>Create Cross-Field Check</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header & Name */}
              <section className="bg-white rounded-2xl border border-black/[0.08] p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                      Validation Rule Name
                    </label>
                    <input
                      type="text"
                      disabled={isReadOnly}
                      value={selectedRule.name}
                      onChange={(e) => updateSelected({ name: e.target.value })}
                      placeholder="e.g. Confirm email matches primary email"
                      className="w-full h-9 px-3 text-sm font-display font-semibold text-[#0B0D0F] bg-[#FAF9F7] border border-black/[0.08] rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0F766E]"
                    />
                  </div>
                  {!isReadOnly && (
                    <div className="flex items-center gap-2 pt-4">
                      <button
                        type="button"
                        onClick={() => duplicateRule(selectedRule)}
                        className="h-9 px-2.5 rounded-lg border border-black/[0.08] bg-white hover:bg-[#F7F6F3] text-[#0B0D0F] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Copy size={14} />
                        <span>Duplicate</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteRule(selectedRule.id)}
                        className="h-9 px-2.5 rounded-lg border border-black/[0.08] bg-white hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 text-[#5C6066] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                        aria-label="Delete cross-field rule"
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Live status against Debugger simulated answers */}
                {(() => {
                  const targetId = selectedRule.targetComponentId || selectedRule.sourceComponentId;
                  const errMsg = liveCrossFieldErrors[targetId];
                  return (
                    <div
                      className={`px-3 py-2 rounded-lg border text-xs flex items-center gap-2 ${
                        errMsg
                          ? 'bg-rose-50 border-rose-200 text-rose-800'
                          : 'bg-[#0F766E]/[0.06] border-[#0F766E]/20 text-[#0F766E]'
                      }`}
                    >
                      {errMsg ? (
                        <>
                          <WarningCircle size={15} weight="fill" className="shrink-0" />
                          <span>Simulated test fails: {errMsg}</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle size={15} weight="fill" className="shrink-0" />
                          <span>Passing with current simulated test answers</span>
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* Rule Comparison Config */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-black/[0.06]">
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                      Validation Condition
                    </label>
                    <select
                      disabled={isReadOnly}
                      value={selectedRule.operator}
                      onChange={(e) =>
                        updateSelected({ operator: e.target.value as CrossFieldOperator })
                      }
                      className="w-full h-9 px-2.5 text-xs bg-[#FAF9F7] border border-black/[0.08] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    >
                      {OPERATOR_OPTIONS.map((op) => (
                        <option key={op.value} value={op.value}>
                          {op.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                      Show Error On Field
                    </label>
                    <select
                      disabled={isReadOnly}
                      value={selectedRule.targetComponentId || selectedRule.sourceComponentId}
                      onChange={(e) => updateSelected({ targetComponentId: e.target.value })}
                      className="w-full h-9 px-2.5 text-xs bg-[#FAF9F7] border border-black/[0.08] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    >
                      {questionComponents.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.content.label || q.id}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {selectedRule.operator === 'matches_expression' ? (
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066]">
                      Validation Formula (must evaluate to true / non-zero)
                    </label>
                    <FormulaEditor
                      document={document}
                      value={selectedRule.expression || ''}
                      onChange={(expr) => updateSelected({ expression: expr })}
                      sampleAnswers={sampleAnswers}
                      sampleVariables={resolvedVariables}
                      disabled={isReadOnly}
                      placeholder="e.g. {{participants}} <= {{capacity}}"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                        Primary Question
                      </label>
                      <select
                        disabled={isReadOnly}
                        value={selectedRule.sourceComponentId}
                        onChange={(e) =>
                          updateSelected({
                            sourceComponentId: e.target.value,
                            targetComponentId:
                              selectedRule.targetComponentId === selectedRule.sourceComponentId
                                ? e.target.value
                                : selectedRule.targetComponentId,
                          })
                        }
                        className="w-full h-9 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                      >
                        {questionComponents.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.content.label || q.id} ({q.type})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                        Compare Against Question
                      </label>
                      <select
                        disabled={isReadOnly}
                        value={selectedRule.compareComponentId || ''}
                        onChange={(e) => updateSelected({ compareComponentId: e.target.value })}
                        className="w-full h-9 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                      >
                        <option value="">Select comparison question...</option>
                        {questionComponents.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.content.label || q.id} ({q.type})
                          </option>
                        ))}
                      </select>
                    </div>

                    {(selectedRule.operator === 'equals_field' ||
                      selectedRule.operator === 'not_equals_field') && (
                      <label className="sm:col-span-2 inline-flex items-center gap-2 text-xs text-[#5C6066] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          disabled={isReadOnly}
                          checked={Boolean(selectedRule.caseSensitive)}
                          onChange={(e) => updateSelected({ caseSensitive: e.target.checked })}
                          className="accent-[#0F766E]"
                        />
                        <span>Case-sensitive comparison</span>
                      </label>
                    )}
                  </div>
                )}

                {/* Error Message with Answer Piping */}
                <div className="space-y-1.5 pt-2 border-t border-black/[0.06]">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066]">
                      Custom Error Message
                    </label>
                    <AnswerPipingPicker
                      document={document}
                      disabled={isReadOnly}
                      onInsertToken={(token) =>
                        updateSelected({
                          errorMessage: appendToken(selectedRule.errorMessage || '', token),
                        })
                      }
                    />
                  </div>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={selectedRule.errorMessage}
                    onChange={(e) => updateSelected({ errorMessage: e.target.value })}
                    placeholder="e.g. Confirmation email must match your primary email."
                    className="w-full h-9 px-3 text-xs bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>
              </section>

              {/* Optional Conditional Guard */}
              <section className="bg-white rounded-2xl border border-black/[0.08] p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-display font-semibold text-[#0B0D0F] flex items-center gap-1.5">
                      <Lightning size={14} weight="duotone" className="text-[#0F766E]" />
                      <span>Conditional Enforcement (Optional)</span>
                    </h3>
                    <p className="text-[11px] text-[#5C6066] mt-0.5">
                      Only run this cross-field check when specific conditions are met.
                    </p>
                  </div>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => handleToggleGuard(!selectedRule.whenConditionGroup)}
                      className={`h-8 px-3 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        selectedRule.whenConditionGroup
                          ? 'bg-[#0F766E]/10 text-[#0F766E] border-[#0F766E]/30'
                          : 'bg-[#F7F6F3] text-[#5C6066] border-black/[0.08]'
                      }`}
                    >
                      {selectedRule.whenConditionGroup ? 'Condition Active' : 'Add Condition'}
                    </button>
                  )}
                </div>

                {selectedRule.whenConditionGroup && (
                  <LogicConditionGroupEditor
                    document={document}
                    group={selectedRule.whenConditionGroup}
                    onChange={(nextGroup) => updateSelected({ whenConditionGroup: nextGroup })}
                    isReadOnly={isReadOnly}
                    selectableComponents={questionComponents}
                  />
                )}
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
