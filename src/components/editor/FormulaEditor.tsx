import React, { useMemo, useState } from 'react';
import {
  CheckCircle,
  WarningCircle,
  Warning,
  Function as FunctionIcon,
  Plus,
  Backspace,
} from '@phosphor-icons/react';
import {
  buildCalculationDependencyGraph,
  evaluateFormula,
  extractFormulaTokens,
  FormDocument,
  FORMULA_FUNCTION_CATALOG,
  formatValue,
  formComponentRegistry,
  getOrderedComponents,
  validateFormula,
  VariableFormatConfig,
  VariableValueType,
} from '../../studio';

interface FormulaEditorProps {
  document: FormDocument;
  value: string;
  onChange: (nextExpression: string) => void;
  /** Optional ID of the variable currently being edited (for circular dependency highlighting) */
  editingVariableId?: string;
  /** Target variable type for compatibility validation */
  targetVariableType?: VariableValueType;
  /** Optional display format to preview formatted output alongside raw output */
  formatConfig?: VariableFormatConfig;
  /** Optional simulated test answers from Logic Debugger */
  sampleAnswers?: Record<string, unknown>;
  /** Optional resolved variables from Logic Debugger */
  sampleVariables?: Record<string, unknown>;
  disabled?: boolean;
  placeholder?: string;
}

const QUICK_OPERATORS: { label: string; insert: string; title: string }[] = [
  { label: '+', insert: ' + ', title: 'Add' },
  { label: '−', insert: ' - ', title: 'Subtract' },
  { label: '×', insert: ' * ', title: 'Multiply' },
  { label: '÷', insert: ' / ', title: 'Divide' },
  { label: '%', insert: '%', title: 'Percent (e.g. 15% = 0.15)' },
  { label: '(', insert: '(', title: 'Open group' },
  { label: ')', insert: ')', title: 'Close group' },
  { label: '>', insert: ' > ', title: 'Greater than' },
  { label: '<', insert: ' < ', title: 'Less than' },
  { label: '≥', insert: ' >= ', title: 'Greater or equal' },
  { label: '≤', insert: ' <= ', title: 'Less or equal' },
  { label: '==', insert: ' == ', title: 'Equals' },
];

const QUICK_FUNCTIONS: { name: string; template: string; title: string }[] = [
  { name: 'round', template: 'round(, 2)', title: 'Round to decimal places' },
  { name: 'min', template: 'min(, )', title: 'Smallest value' },
  { name: 'max', template: 'max(, )', title: 'Largest value' },
  { name: 'abs', template: 'abs()', title: 'Absolute value' },
  { name: 'pct', template: 'pct(, 10)', title: 'Percentage of an amount' },
  { name: 'percent', template: 'percent(, )', title: 'Part as % of total' },
  { name: 'sum', template: 'sum(, )', title: 'Sum of values' },
  { name: 'avg', template: 'avg(, )', title: 'Average of values' },
  { name: 'if', template: 'if( > 0, , 0)', title: 'Conditional value' },
];

/**
 * Visual No-Code Formula Editor with:
 *  - Question & Variable pickers
 *  - Arithmetic, percentage, comparison, grouping, and math function buttons
 *  - Constant insertion helper
 *  - Live static + runtime validation (division by zero, type mismatch, circular deps)
 *  - Live interactive result preview (raw + locale/currency formatted)
 */
export const FormulaEditor: React.FC<FormulaEditorProps> = ({
  document,
  value,
  onChange,
  editingVariableId,
  targetVariableType = 'number',
  formatConfig,
  sampleAnswers,
  sampleVariables,
  disabled = false,
  placeholder = 'e.g. round(({{qty}} * {{unit_price}}) * (1 + 10%), 2)',
}) => {
  const [constantInput, setConstantInput] = useState('');
  const [localSamples, setLocalSamples] = useState<Record<string, string>>({});

  const questions = useMemo(
    () =>
      getOrderedComponents(document).filter((n) => {
        const def = formComponentRegistry.get(n.type);
        return !def || def.isQuestion;
      }),
    [document]
  );

  const availableVariables = useMemo(
    () => (document.variables || []).filter((v) => v.id !== editingVariableId),
    [document.variables, editingVariableId]
  );

  const validation = useMemo(
    () =>
      validateFormula(value, document, {
        targetVariableType,
      }),
    [value, document, targetVariableType]
  );

  // Detect circular calculation dependencies if editing a calculated variable
  const circularError = useMemo(() => {
    if (!editingVariableId || !value.trim()) return null;
    const simulatedDoc: FormDocument = {
      ...document,
      variables: document.variables.map((v) =>
        v.id === editingVariableId ? { ...v, expression: value } : v
      ),
    };
    const graph = buildCalculationDependencyGraph(simulatedDoc);
    if (!graph.circularVariableIds.has(editingVariableId)) return null;
    const editingVar = document.variables.find((v) => v.id === editingVariableId);
    const chain = graph.circularChains.find(
      (c) => editingVar && c.includes(editingVar.name)
    );
    return chain
      ? `Circular calculation dependency: ${chain.join(' → ')}.`
      : 'Circular calculation dependency detected.';
  }, [document, editingVariableId, value]);

  const referencedTokens = useMemo(() => extractFormulaTokens(value), [value]);

  // Build effective preview inputs combining debugger values, local inline test values, and defaults
  const previewResult = useMemo(() => {
    if (!value.trim()) return null;
    const mergedAnswers: Record<string, unknown> = { ...(sampleAnswers || {}) };
    const mergedVars: Record<string, unknown> = {};

    for (const v of document.variables || []) {
      mergedVars[v.name] =
        sampleVariables && Object.prototype.hasOwnProperty.call(sampleVariables, v.name)
          ? sampleVariables[v.name]
          : v.initialValue ?? 0;
    }

    for (const tok of referencedTokens) {
      if (Object.prototype.hasOwnProperty.call(localSamples, tok) && localSamples[tok] !== '') {
        const isVar = document.variables.some((v) => v.name === tok || v.id === tok);
        if (isVar) {
          const v = document.variables.find((item) => item.name === tok || item.id === tok);
          if (v) mergedVars[v.name] = localSamples[tok];
        } else {
          mergedAnswers[tok] = localSamples[tok];
        }
      }
    }

    return evaluateFormula(value, {
      answers: mergedAnswers,
      variables: mergedVars,
      document,
    });
  }, [value, sampleAnswers, sampleVariables, document, referencedTokens, localSamples]);

  const appendSnippet = (snippet: string) => {
    if (disabled) return;
    onChange(`${value}${snippet}`);
  };

  const handleWrapParentheses = () => {
    if (disabled || !value.trim()) return;
    onChange(`(${value.trim()})`);
  };

  const handleInsertConstant = () => {
    if (disabled) return;
    const trimmed = constantInput.trim();
    if (!trimmed) return;
    appendSnippet(trimmed);
    setConstantInput('');
  };

  const allErrors = [
    ...(circularError ? [{ code: 'CIRCULAR_DEPENDENCY', message: circularError }] : []),
    ...validation.errors,
  ];

  const formattedPreview =
    previewResult?.ok && previewResult.value !== null
      ? formatValue(previewResult.value, formatConfig)
      : null;

  return (
    <div className="rounded-xl border border-black/[0.1] bg-white p-3 space-y-3">
      {/* Formula Input Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] flex items-center gap-1.5">
            <FunctionIcon size={12} className="text-[#0F766E]" />
            <span>Formula Expression</span>
          </label>
          {!disabled && value && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleWrapParentheses}
                className="px-1.5 py-0.5 text-[10px] font-mono text-[#5C6066] hover:text-[#0B0D0F] bg-[#F7F6F3] hover:bg-[#EAE7E1] rounded border border-black/[0.08]"
                title="Wrap current formula in parentheses"
              >
                Group ( … )
              </button>
              <button
                type="button"
                onClick={() => onChange('')}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono text-[#5C6066] hover:text-rose-600 bg-[#F7F6F3] hover:bg-rose-50 rounded border border-black/[0.08]"
                title="Clear formula"
              >
                <Backspace size={11} />
                <span>Clear</span>
              </button>
            </div>
          )}
        </div>

        <textarea
          rows={2}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full px-2.5 py-2 text-xs font-mono rounded-lg border focus:outline-none focus:ring-2 resize-y ${
            allErrors.length > 0 && value.trim()
              ? 'border-rose-300 bg-rose-50/30 text-[#0B0D0F] focus:ring-rose-500/30'
              : 'border-black/[0.12] bg-[#FAF9F7] focus:bg-white text-[#0B0D0F] focus:ring-[#0F766E]'
          }`}
        />
      </div>

      {/* Visual Builder Controls */}
      {!disabled && (
        <div className="space-y-2.5 pt-1 border-t border-black/[0.06]">
          {/* Row 1: Pick Question, Pick Variable, Insert Constant */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-mono text-[#5C6066] mb-1">
                Insert Question
              </label>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) appendSnippet(`{{${e.target.value}}}`);
                }}
                className="w-full h-8 px-2 text-xs bg-[#FAF9F7] border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              >
                <option value="">+ Pick question...</option>
                {questions.map((q, idx) => (
                  <option key={q.id} value={q.id}>
                    Q{idx + 1}. {q.content.label || q.type} ({q.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-[#5C6066] mb-1">
                Insert Variable
              </label>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) appendSnippet(`{{${e.target.value}}}`);
                }}
                className="w-full h-8 px-2 text-xs bg-[#FAF9F7] border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              >
                <option value="">+ Pick variable...</option>
                {availableVariables.map((v) => (
                  <option key={v.id} value={v.name}>
                    {v.name} ({v.valueType})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-[#5C6066] mb-1">
                Add Constant
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="any"
                  value={constantInput}
                  onChange={(e) => setConstantInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleInsertConstant();
                    }
                  }}
                  placeholder="e.g. 1.15"
                  className="w-full h-8 px-2 text-xs font-mono bg-[#FAF9F7] border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                />
                <button
                  type="button"
                  onClick={handleInsertConstant}
                  className="h-8 px-2 rounded-lg bg-[#0B0D0F] hover:bg-[#191D21] text-white text-xs font-semibold shrink-0"
                  title="Insert constant"
                  aria-label="Insert constant"
                >
                  <Plus size={12} weight="bold" />
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Operators */}
          <div className="space-y-1">
            <span className="block text-[10px] font-mono text-[#5C6066]">Operators</span>
            <div className="flex flex-wrap gap-1">
              {QUICK_OPERATORS.map((op) => (
                <button
                  key={op.label}
                  type="button"
                  onClick={() => appendSnippet(op.insert)}
                  title={op.title}
                  className="h-7 min-w-[28px] px-2 text-xs font-mono font-semibold bg-[#F7F6F3] hover:bg-[#EAE7E1] border border-black/[0.08] rounded-md text-[#0B0D0F] transition-colors"
                >
                  {op.label}
                </button>
              ))}
            </div>
          </div>

          {/* Row 3: Math & Logical Functions */}
          <div className="space-y-1">
            <span className="block text-[10px] font-mono text-[#5C6066]">Functions</span>
            <div className="flex flex-wrap gap-1">
              {QUICK_FUNCTIONS.map((fn) => {
                const docMeta = FORMULA_FUNCTION_CATALOG.find((c) => c.name === fn.name);
                return (
                  <button
                    key={fn.name}
                    type="button"
                    onClick={() => appendSnippet(fn.template)}
                    title={docMeta ? `${docMeta.signature} — ${docMeta.description}` : fn.title}
                    className="h-7 px-2 text-[11px] font-mono bg-[#0F766E]/[0.07] hover:bg-[#0F766E]/[0.15] border border-[#0F766E]/20 rounded-md text-[#0F766E] font-medium transition-colors"
                  >
                    {fn.name}()
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Live Preview + Sample Values + Diagnostics */}
      {value.trim() && (
        <div className="pt-2 border-t border-black/[0.06] space-y-2">
          {/* Inline Sample Values for Referenced Tokens */}
          {referencedTokens.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-[#5C6066]">
                Test values:
              </span>
              {referencedTokens.map((tok) => {
                const comp = document.components[tok];
                const label = comp ? comp.content.label || tok : tok;
                const currentVal =
                  localSamples[tok] ??
                  (sampleVariables && Object.prototype.hasOwnProperty.call(sampleVariables, tok)
                    ? String(sampleVariables[tok] ?? '')
                    : sampleAnswers && Object.prototype.hasOwnProperty.call(sampleAnswers, tok)
                    ? String(sampleAnswers[tok] ?? '')
                    : '');
                return (
                  <label
                    key={tok}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#F7F6F3] border border-black/[0.08] text-[11px]"
                  >
                    <span className="text-[#5C6066] max-w-[110px] truncate" title={label}>
                      {label}
                    </span>
                    <input
                      type="text"
                      value={currentVal}
                      onChange={(e) =>
                        setLocalSamples((prev) => ({ ...prev, [tok]: e.target.value }))
                      }
                      placeholder="0"
                      className="w-16 h-5 px-1.5 text-[11px] font-mono bg-white border border-black/[0.1] rounded text-[#0B0D0F] tabular-nums focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                    />
                  </label>
                );
              })}
            </div>
          )}

          {/* Static & Runtime Errors */}
          {allErrors.length > 0 && (
            <div className="space-y-1">
              {allErrors.map((err, i) => (
                <div
                  key={`${err.code}_${i}`}
                  className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-800 flex items-start gap-1.5"
                >
                  <WarningCircle size={14} weight="fill" className="shrink-0 mt-0.5" />
                  <span>{err.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Runtime Error (e.g. division by zero with current sample values) */}
          {allErrors.length === 0 && previewResult && !previewResult.ok && previewResult.error && (
            <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-800 flex items-start gap-1.5">
              <WarningCircle size={14} weight="fill" className="shrink-0 mt-0.5" />
              <span>{previewResult.error.message}</span>
            </div>
          )}

          {/* Warnings */}
          {validation.warnings.map((warn, i) => (
            <div
              key={`warn_${i}`}
              className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-1.5"
            >
              <Warning size={14} weight="fill" className="shrink-0 mt-0.5" />
              <span>{warn.message}</span>
            </div>
          ))}

          {/* Live Evaluated Preview Result */}
          {allErrors.length === 0 && previewResult?.ok && (
            <div className="px-2.5 py-2 rounded-lg bg-[#0F766E]/[0.07] border border-[#0F766E]/25 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 text-[#0F766E] font-medium">
                <CheckCircle size={14} weight="fill" />
                <span>Live Preview Result</span>
              </span>
              <div className="flex items-center gap-2 font-mono tabular-nums">
                <span className="font-bold text-[#0B0D0F]">
                  {formattedPreview && formattedPreview !== String(previewResult.value)
                    ? formattedPreview
                    : String(previewResult.value)}
                </span>
                {formattedPreview && formattedPreview !== String(previewResult.value) && (
                  <span className="text-[10px] text-[#5C6066]">
                    (raw: {String(previewResult.value)})
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
