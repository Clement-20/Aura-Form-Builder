import React from 'react';
import {
  ArrowCounterClockwise,
  CheckCircle,
  XCircle,
  Warning,
  WarningCircle,
  Play,
  EyeSlash,
  LockSimple,
  Asterisk,
  ArrowRight,
  FlagCheckered,
  ChatText,
} from '@phosphor-icons/react';
import {
  FormComponentNode,
  FormDocument,
  LogicEvaluationResult,
  LogicValidationReport,
} from '../../studio';

interface LogicDebuggerPanelProps {
  document: FormDocument;
  selectableComponents: FormComponentNode[];
  testAnswers: Record<string, unknown>;
  onChangeTestAnswer: (componentId: string, value: unknown) => void;
  onResetTestAnswers: () => void;
  evaluation: LogicEvaluationResult;
  validation: LogicValidationReport;
  selectedRuleId: string | null;
  onSelectRule: (ruleId: string) => void;
}

export const LogicDebuggerPanel: React.FC<LogicDebuggerPanelProps> = ({
  document,
  selectableComponents,
  testAnswers,
  onChangeTestAnswer,
  onResetTestAnswers,
  evaluation,
  validation,
  selectedRuleId,
  onSelectRule,
}) => {
  const hiddenComponents = Object.values(document.components).filter(
    (c) => !evaluation.visibleComponentIds.has(c.id)
  );
  const disabledComponents = Object.values(document.components).filter((c) =>
    evaluation.disabledComponentIds.has(c.id)
  );
  const dynamicallyRequired = Object.values(document.components).filter(
    (c) => evaluation.requiredComponentIds.has(c.id) && !c.validation.required
  );
  const hiddenPages = document.pages.filter(
    (p) => !evaluation.visiblePageIds.has(p.id) || evaluation.skippedPageIds.has(p.id)
  );
  const calculatedEntries = Object.entries(evaluation.calculatedComponentValues || {});
  const variableEntries = Object.entries(evaluation.resolvedVariables || {});
  const formattedVariables = evaluation.formattedVariables || {};
  const calcErrorEntries = Object.entries(evaluation.calculationErrors || {});

  const targetPageTitle = evaluation.nextPageIdOverride
    ? document.pages.find((p) => p.id === evaluation.nextPageIdOverride)?.title ||
      evaluation.nextPageIdOverride
    : null;
  const skipTargetLabel = evaluation.skipToComponentId
    ? document.components[evaluation.skipToComponentId]?.content.label ||
      evaluation.skipToComponentId
    : null;

  return (
    <aside className="w-full xl:w-[340px] shrink-0 border-t xl:border-t-0 xl:border-l border-black/[0.08] bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-black/[0.08] flex items-center justify-between gap-2 bg-[#FAF9F7]">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-display font-semibold text-[#0B0D0F]">
            <Play size={13} weight="fill" className="text-[#0F766E] shrink-0" />
            <span>Logic Preview &amp; Debugger</span>
          </div>
          <p className="text-[11px] text-[#5C6066] truncate">
            Test answers live · Private to creators
          </p>
        </div>
        <button
          type="button"
          onClick={onResetTestAnswers}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#5C6066] hover:text-[#0B0D0F] bg-white border border-black/[0.08] rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <ArrowCounterClockwise size={12} />
          <span>Reset</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Static Errors, Warnings, Circular Loops, Calculation Errors & Runtime Conflicts */}
        {(validation.errors.length > 0 ||
          validation.warnings.length > 0 ||
          evaluation.conflicts.length > 0 ||
          calcErrorEntries.length > 0 ||
          evaluation.loopGuardTriggered) && (
          <section className="space-y-2">
            <h3 className="text-[11px] font-mono uppercase tracking-[0.12em] text-rose-700 font-semibold">
              Diagnostics (
              {validation.errors.length +
                validation.warnings.length +
                evaluation.conflicts.length +
                calcErrorEntries.length +
                (evaluation.loopGuardTriggered ? 1 : 0)}
              )
            </h3>

            {evaluation.loopGuardTriggered && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                <WarningCircle size={15} weight="fill" className="shrink-0 mt-0.5" />
                <span>
                  Loop protection stopped evaluation after {evaluation.passesExecuted} passes. Check
                  circular variable calculations.
                </span>
              </div>
            )}

            {calcErrorEntries.map(([targetKey, err]) => (
              <div
                key={`calc_err_${targetKey}`}
                className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2"
              >
                <WarningCircle size={15} weight="fill" className="shrink-0 mt-0.5" />
                <span>
                  <strong className="font-mono">{targetKey}:</strong> {err.message}
                </span>
              </div>
            ))}

            {validation.errors.map((err) => (
              <button
                key={err.id}
                type="button"
                onClick={() => err.ruleId && onSelectRule(err.ruleId)}
                className="w-full text-left p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2 hover:bg-rose-100/70 transition-colors"
              >
                <WarningCircle size={15} weight="fill" className="shrink-0 mt-0.5" />
                <span>{err.message}</span>
              </button>
            ))}

            {validation.warnings.map((warn) => (
              <button
                key={warn.id}
                type="button"
                onClick={() => warn.ruleId && onSelectRule(warn.ruleId)}
                className="w-full text-left p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2 hover:bg-amber-100/70 transition-colors"
              >
                <Warning size={15} weight="fill" className="shrink-0 mt-0.5" />
                <span>{warn.message}</span>
              </button>
            ))}

            {evaluation.conflicts.map((conflict, idx) => (
              <div
                key={`${conflict.targetKey}_${idx}`}
                className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2"
              >
                <Warning size={15} weight="fill" className="shrink-0 mt-0.5" />
                <span>{conflict.description}</span>
              </div>
            ))}
          </section>
        )}

        {/* Interactive Test Inputs */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#5C6066]">
              Simulated Answers
            </h3>
            <span className="text-[11px] font-mono text-[#5C6066] tabular-nums">
              {selectableComponents.length} fields
            </span>
          </div>

          {selectableComponents.length === 0 ? (
            <p className="text-xs text-[#5C6066] bg-[#F7F6F3] rounded-lg p-3">
              Add questions in the Build tab to simulate logic rules here.
            </p>
          ) : (
            <div className="space-y-2.5">
              {selectableComponents.map((comp, idx) => {
                const rawVal = testAnswers[comp.id];
                const isHidden = !evaluation.visibleComponentIds.has(comp.id);
                const isDisabled = evaluation.disabledComponentIds.has(comp.id);
                const isCalc = Object.prototype.hasOwnProperty.call(
                  evaluation.calculatedComponentValues,
                  comp.id
                );

                return (
                  <div
                    key={comp.id}
                    className={`p-2.5 rounded-lg border transition-colors ${
                      isHidden
                        ? 'border-dashed border-black/[0.12] bg-[#FAF9F7] opacity-65'
                        : 'border-black/[0.08] bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-medium text-[#0B0D0F] truncate">
                        Q{idx + 1}. {comp.content.label || 'Untitled'}
                      </span>
                      <span className="text-[10px] font-mono text-[#5C6066] shrink-0">
                        {isHidden ? 'Hidden' : isDisabled ? 'Disabled' : isCalc ? 'Calculated' : ''}
                      </span>
                    </div>

                    {comp.type === 'yes_no' ? (
                      <div className="grid grid-cols-2 gap-1.5">
                        {['Yes', 'No'].map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() =>
                              onChangeTestAnswer(comp.id, rawVal === opt ? '' : opt)
                            }
                            className={`h-8 text-xs font-medium rounded-md border transition-colors ${
                              rawVal === opt
                                ? 'bg-[#0F766E] text-white border-[#0F766E]'
                                : 'bg-[#F7F6F3] text-[#0B0D0F] border-black/[0.08]'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    ) : comp.type === 'checkbox' && comp.content.options?.length ? (
                      <div className="space-y-1">
                        {comp.content.options.map((opt, optIdx) => {
                          const list = Array.isArray(rawVal) ? (rawVal as string[]) : [];
                          const checked = list.includes(opt);
                          return (
                            <label
                              key={optIdx}
                              className="flex items-center gap-2 text-xs text-[#0B0D0F] cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const next = checked
                                    ? list.filter((i) => i !== opt)
                                    : [...list, opt];
                                  onChangeTestAnswer(comp.id, next);
                                }}
                                className="accent-[#0F766E]"
                              />
                              <span className="truncate">{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (comp.type === 'radio' || comp.type === 'select') &&
                      comp.content.options?.length ? (
                      <select
                        value={String(rawVal ?? '')}
                        onChange={(e) => onChangeTestAnswer(comp.id, e.target.value)}
                        className="w-full h-8 px-2 text-xs bg-[#FAF9F7] border border-black/[0.08] rounded-md text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                      >
                        <option value="">(Unanswered)</option>
                        {comp.content.options.map((opt, optIdx) => (
                          <option key={optIdx} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={
                          comp.type === 'number' ||
                          comp.type === 'rating' ||
                          comp.type === 'scale'
                            ? 'number'
                            : comp.type === 'date'
                            ? 'date'
                            : 'text'
                        }
                        value={String(
                          isCalc
                            ? evaluation.calculatedComponentValues[comp.id] ?? ''
                            : rawVal ?? ''
                        )}
                        onChange={(e) => onChangeTestAnswer(comp.id, e.target.value)}
                        placeholder={`Test ${comp.type} value...`}
                        className="w-full h-8 px-2 text-xs bg-[#FAF9F7] border border-black/[0.08] rounded-md text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Live Outcome Summary */}
        <section className="space-y-2.5 pt-3 border-t border-black/[0.08]">
          <h3 className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#5C6066]">
            Live Form Outcome
          </h3>

          <div className="space-y-2 text-xs">
            {evaluation.endFormTriggered && (
              <div className="p-2.5 rounded-lg bg-[#0F766E]/10 border border-[#0F766E]/25 text-[#0F766E] flex items-start gap-2">
                <FlagCheckered size={15} weight="fill" className="shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-semibold">Form ends early</div>
                  {evaluation.endFormTitle && (
                    <div className="text-[11px] opacity-90">{evaluation.endFormTitle}</div>
                  )}
                  {evaluation.endFormRedirectUrl && (
                    <div className="text-[10px] font-mono opacity-80 truncate">
                      → {evaluation.endFormRedirectUrl}
                    </div>
                  )}
                </div>
              </div>
            )}

            {hiddenPages.length > 0 && (
              <div className="p-2.5 rounded-lg bg-[#FAF9F7] border border-black/[0.08] text-xs text-[#0B0D0F]">
                <span className="font-mono text-[10px] uppercase text-[#5C6066] block mb-0.5">
                  Hidden / Skipped Pages ({hiddenPages.length})
                </span>
                <span className="text-[#0B0D0F]">
                  {hiddenPages.map((p) => p.title || `Page ${p.index}`).join(', ')}
                </span>
              </div>
            )}

            {!evaluation.endFormTriggered && (skipTargetLabel || targetPageTitle) && (
              <div className="p-2.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-[#0B0D0F] flex items-center gap-2">
                <ArrowRight size={14} weight="bold" className="text-[#0F766E] shrink-0" />
                <span>
                  {skipTargetLabel
                    ? `Skips to "${skipTargetLabel}"`
                    : `Jumps to "${targetPageTitle}"`}
                </span>
              </div>
            )}

            {evaluation.messages.length > 0 && (
              <div className="space-y-1.5">
                {evaluation.messages.map((m) => (
                  <div
                    key={m.id}
                    className="p-2.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] flex items-start gap-2"
                  >
                    <ChatText size={14} className="text-[#0F766E] shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-[10px] font-mono uppercase text-[#5C6066]">
                        {m.tone} message
                      </div>
                      <div className="text-xs text-[#0B0D0F]">{m.text}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="p-2 rounded-lg bg-[#FAF9F7] border border-black/[0.06]">
                <div className="text-[10px] text-[#5C6066] flex items-center justify-center gap-1">
                  <EyeSlash size={11} />
                  <span>Hidden</span>
                </div>
                <div className="text-sm font-mono font-semibold text-[#0B0D0F] tabular-nums">
                  {hiddenComponents.length}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-[#FAF9F7] border border-black/[0.06]">
                <div className="text-[10px] text-[#5C6066] flex items-center justify-center gap-1">
                  <LockSimple size={11} />
                  <span>Disabled</span>
                </div>
                <div className="text-sm font-mono font-semibold text-[#0B0D0F] tabular-nums">
                  {disabledComponents.length}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-[#FAF9F7] border border-black/[0.06]">
                <div className="text-[10px] text-[#5C6066] flex items-center justify-center gap-1">
                  <Asterisk size={11} />
                  <span>+Required</span>
                </div>
                <div className="text-sm font-mono font-semibold text-[#0B0D0F] tabular-nums">
                  {dynamicallyRequired.length}
                </div>
              </div>
            </div>

            {(variableEntries.length > 0 || calculatedEntries.length > 0) && (
              <div className="p-2.5 rounded-lg bg-[#FAF9F7] border border-black/[0.06] space-y-1.5">
                <div className="text-[10px] font-mono uppercase text-[#5C6066]">
                  Resolved Variables &amp; Calculations
                </div>
                {variableEntries.map(([name, val]) => {
                  const formatted = formattedVariables[name];
                  const rawStr =
                    val === null || val === undefined
                      ? '—'
                      : Array.isArray(val)
                      ? val.join(', ') || '[]'
                      : String(val);
                  const display = formatted && formatted.length > 0 ? formatted : rawStr;
                  const showRawHint = formatted && formatted !== rawStr && rawStr !== '—';
                  const hasCalcErr = Boolean(evaluation.calculationErrors?.[name]);

                  return (
                    <div
                      key={name}
                      className="flex items-center justify-between gap-2 text-xs font-mono"
                    >
                      <span className="text-[#5C6066] truncate">{name}</span>
                      <span className="inline-flex items-center gap-1.5 shrink-0 tabular-nums">
                        {hasCalcErr ? (
                          <span className="text-rose-600 font-semibold">Error</span>
                        ) : (
                          <>
                            <span className="font-semibold text-[#0F766E]">{display}</span>
                            {showRawHint && (
                              <span className="text-[10px] text-[#5C6066]">({rawStr})</span>
                            )}
                          </>
                        )}
                      </span>
                    </div>
                  );
                })}
                {calculatedEntries.map(([compId, val]) => (
                  <div key={compId} className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#5C6066] truncate max-w-[160px]">
                      {document.components[compId]?.content.label || compId}
                    </span>
                    <span className="font-semibold text-[#0F766E] tabular-nums">
                      {String(val)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Per-Rule Execution Trace */}
        <section className="space-y-2 pt-3 border-t border-black/[0.08]">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#5C6066]">
              Rule Evaluation Trace
            </h3>
            <span className="text-[10px] font-mono text-[#5C6066] tabular-nums">
              {evaluation.passesExecuted} pass{evaluation.passesExecuted === 1 ? '' : 'es'}
            </span>
          </div>

          {evaluation.trace.length === 0 ? (
            <p className="text-xs text-[#5C6066]">No rules evaluated yet.</p>
          ) : (
            <div className="space-y-1.5">
              {evaluation.trace.map((item) => {
                const isSelected = item.ruleId === selectedRuleId;
                return (
                  <button
                    key={item.ruleId}
                    type="button"
                    onClick={() => onSelectRule(item.ruleId)}
                    className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                      isSelected
                        ? 'border-[#0F766E] bg-[#0F766E]/[0.05]'
                        : 'border-black/[0.07] bg-white hover:bg-[#FAF9F7]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#0B0D0F] truncate">
                        {item.ruleName}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-mono shrink-0 ${
                          !item.enabled
                            ? 'text-[#5C6066]'
                            : item.matched
                            ? 'text-[#0F766E] font-semibold'
                            : item.branchTaken === 'else'
                            ? 'text-amber-700 font-semibold'
                            : 'text-[#5C6066]'
                        }`}
                      >
                        {!item.enabled ? (
                          'Paused'
                        ) : item.matched ? (
                          <>
                            <CheckCircle size={13} weight="fill" />
                            <span>THEN</span>
                          </>
                        ) : item.branchTaken === 'else' ? (
                          <>
                            <ArrowRight size={12} weight="bold" />
                            <span>ELSE</span>
                          </>
                        ) : (
                          <>
                            <XCircle size={13} weight="fill" className="text-black/30" />
                            <span>False</span>
                          </>
                        )}
                      </span>
                    </div>

                    {item.skippedReason && (
                      <p className="mt-1 text-[11px] text-[#5C6066]">{item.skippedReason}</p>
                    )}

                    {item.executedActions.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 text-[11px] text-[#0F766E]">
                        {item.executedActions.map((actSummary, aIdx) => (
                          <li key={aIdx} className="truncate">
                            → {actSummary}
                          </li>
                        ))}
                      </ul>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
};
