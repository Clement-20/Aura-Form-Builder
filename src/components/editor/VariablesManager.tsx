import React, { useMemo, useState } from 'react';
import {
  Function as FunctionIcon,
  Plus,
  Trash,
  CheckCircle,
  WarningCircle,
  Warning,
  MagnifyingGlass,
  PencilSimple,
  CurrencyDollar,
  Calculator,
  X,
} from '@phosphor-icons/react';
import {
  createLogicId,
  findVariableUsages,
  FormDocument,
  formatValue,
  FormVariableDefinition,
  getDefaultInitialValueForType,
  SUPPORTED_CURRENCIES,
  SUPPORTED_LOCALES,
  validateVariableAssignment,
  VARIABLE_TYPE_META,
  VariableFormatConfig,
  VariableFormatStyle,
  VariableValueType,
} from '../../studio';
import { FormulaEditor } from './FormulaEditor';

interface VariablesManagerProps {
  document: FormDocument;
  onUpdateVariables: (variables: FormVariableDefinition[]) => void;
  onRenameVariable?: (variableId: string, nextName: string) => { error?: string };
  sampleAnswers?: Record<string, unknown>;
  resolvedVariables?: Record<string, unknown>;
  formattedVariables?: Record<string, string>;
  isReadOnly?: boolean;
}

const VARIABLE_TYPES: VariableValueType[] = [
  'number',
  'string',
  'boolean',
  'date',
  'selection',
  'list',
];

export const VariablesManager: React.FC<VariablesManagerProps> = ({
  document,
  onUpdateVariables,
  onRenameVariable,
  sampleAnswers,
  resolvedVariables,
  formattedVariables,
  isReadOnly = false,
}) => {
  const variables = document.variables || [];
  const [selectedId, setSelectedId] = useState<string | null>(() => variables[0]?.id || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [renameDraft, setRenameDraft] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [newOptionInput, setNewOptionInput] = useState('');
  const [deleteBlockedId, setDeleteBlockedId] = useState<string | null>(null);

  const selectedVariable = useMemo(() => {
    if (selectedId) {
      const match = variables.find((v) => v.id === selectedId);
      if (match) return match;
    }
    return variables[0] || null;
  }, [variables, selectedId]);

  const usageMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof findVariableUsages>>();
    for (const v of variables) {
      map.set(v.id, findVariableUsages(document, v));
    }
    return map;
  }, [document, variables]);

  const filteredVariables = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return variables;
    return variables.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.valueType.toLowerCase().includes(q) ||
        (v.description || '').toLowerCase().includes(q)
    );
  }, [variables, searchQuery]);

  const handleCreateVariable = () => {
    if (isReadOnly) return;
    let idx = variables.length + 1;
    let candidate = `variable_${idx}`;
    while (variables.some((v) => v.name.toLowerCase() === candidate.toLowerCase())) {
      idx += 1;
      candidate = `variable_${idx}`;
    }

    const created: FormVariableDefinition = {
      id: createLogicId('var'),
      name: candidate,
      valueType: 'number',
      initialValue: 0,
      format: { style: 'plain' },
    };
    onUpdateVariables([...variables, created]);
    setSelectedId(created.id);
    setRenameDraft(null);
    setRenameError(null);
    setDeleteBlockedId(null);
  };

  const handlePatchSelected = (patch: Partial<FormVariableDefinition>) => {
    if (isReadOnly || !selectedVariable) return;
    onUpdateVariables(
      variables.map((v) => (v.id === selectedVariable.id ? { ...v, ...patch } : v))
    );
  };

  const handleChangeType = (nextType: VariableValueType) => {
    if (isReadOnly || !selectedVariable) return;
    const defaultInit = getDefaultInitialValueForType(nextType);
    const defaultFormat: VariableFormatConfig =
      nextType === 'date'
        ? { style: 'date', dateStyle: 'medium', locale: 'en-US' }
        : nextType === 'number'
        ? selectedVariable.format?.style === 'date'
          ? { style: 'plain' }
          : selectedVariable.format || { style: 'plain' }
        : { style: 'plain' };

    handlePatchSelected({
      valueType: nextType,
      initialValue: defaultInit,
      options:
        nextType === 'selection' || nextType === 'list'
          ? selectedVariable.options?.length
            ? selectedVariable.options
            : ['Option A', 'Option B']
          : undefined,
      format: defaultFormat,
      // Clear numeric formula if switching to a non-formula type
      expression:
        nextType === 'number' || nextType === 'string' || nextType === 'boolean'
          ? selectedVariable.expression
          : undefined,
    });
  };

  const handleCommitRename = () => {
    if (!selectedVariable || renameDraft === null || isReadOnly) return;
    const trimmed = renameDraft.trim();
    if (!trimmed || trimmed === selectedVariable.name) {
      setRenameDraft(null);
      setRenameError(null);
      return;
    }

    if (onRenameVariable) {
      const res = onRenameVariable(selectedVariable.id, trimmed);
      if (res.error) {
        setRenameError(res.error);
        return;
      }
      setRenameDraft(null);
      setRenameError(null);
      return;
    }

    // Fallback if caller did not supply atomic rename handler
    const clean = trimmed.replace(/[^a-zA-Z0-9_]/g, '_');
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(clean)) {
      setRenameError('Start with a letter or underscore; use letters, numbers, and underscores.');
      return;
    }
    if (variables.some((v) => v.id !== selectedVariable.id && v.name.toLowerCase() === clean.toLowerCase())) {
      setRenameError(`Variable "${clean}" already exists.`);
      return;
    }
    handlePatchSelected({ name: clean });
    setRenameDraft(null);
    setRenameError(null);
  };

  const handleDeleteVariable = (varId: string, force = false) => {
    if (isReadOnly) return;
    const usages = usageMap.get(varId) || [];
    if (usages.length > 0 && !force) {
      setDeleteBlockedId(varId);
      return;
    }
    const next = variables.filter((v) => v.id !== varId);
    onUpdateVariables(next);
    setDeleteBlockedId(null);
    if (selectedVariable?.id === varId) {
      setSelectedId(next[0]?.id || null);
    }
  };

  const selectedUsages = selectedVariable ? usageMap.get(selectedVariable.id) || [] : [];
  const isCalculated = Boolean(selectedVariable?.expression !== undefined);

  const initialValueCheck = useMemo(() => {
    if (!selectedVariable) return { valid: true, error: undefined as string | undefined };
    return validateVariableAssignment(selectedVariable, selectedVariable.initialValue);
  }, [selectedVariable]);

  const liveRawValue = selectedVariable
    ? resolvedVariables && Object.prototype.hasOwnProperty.call(resolvedVariables, selectedVariable.name)
      ? resolvedVariables[selectedVariable.name]
      : selectedVariable.initialValue
    : undefined;

  const liveFormattedPreview = selectedVariable
    ? (formattedVariables && formattedVariables[selectedVariable.name]) ||
      formatValue(liveRawValue, selectedVariable.format)
    : '';

  const formatStyle: VariableFormatStyle = selectedVariable?.format?.style || 'plain';

  return (
    <div className="flex-1 flex flex-col lg:flex-row bg-[#F7F6F3] overflow-hidden min-h-0">
      {/* LEFT PANEL: Variables List */}
      <aside className="w-full lg:w-[300px] shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-black/[0.08] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-black/[0.08] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-display font-semibold text-[#0B0D0F] flex items-center gap-1.5">
                <FunctionIcon size={15} weight="duotone" className="text-[#0F766E]" />
                <span>Variables</span>
              </h2>
              <p className="text-[11px] font-mono text-[#5C6066] mt-0.5 tabular-nums">
                {variables.length} defined ·{' '}
                {variables.filter((v) => Boolean(v.expression?.trim())).length} calculated
              </p>
            </div>

            {!isReadOnly && (
              <button
                type="button"
                onClick={handleCreateVariable}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#0B0D0F] hover:bg-[#191D21] text-[#F7F6F3] text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <Plus size={13} weight="bold" />
                <span>New Variable</span>
              </button>
            )}
          </div>

          <div className="relative">
            <MagnifyingGlass
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5C6066] pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter variables..."
              className="w-full h-8 pl-8 pr-3 text-xs bg-[#F7F6F3] border border-black/[0.08] rounded-lg text-[#0B0D0F] placeholder:text-[#5C6066] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0F766E]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 max-h-[240px] lg:max-h-none">
          {filteredVariables.length === 0 ? (
            <div className="p-5 text-center text-xs text-[#5C6066] border border-dashed border-black/[0.12] rounded-xl">
              {variables.length === 0
                ? 'No variables yet. Create variables to compute totals, scores, discounts, or personalised text.'
                : 'No variables match your search.'}
            </div>
          ) : (
            filteredVariables.map((v) => {
              const active = selectedVariable?.id === v.id;
              const usages = usageMap.get(v.id) || [];
              const hasFormula = Boolean(v.expression && v.expression.trim());
              const previewText =
                (formattedVariables && formattedVariables[v.name]) ||
                formatValue(v.initialValue, v.format);

              return (
                <div
                  key={v.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedId(v.id);
                    setRenameDraft(null);
                    setRenameError(null);
                    setDeleteBlockedId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedId(v.id);
                    }
                  }}
                  className={`rounded-xl border p-2.5 cursor-pointer transition-colors ${
                    active
                      ? 'bg-[#0F766E]/[0.06] border-[#0F766E]/40'
                      : 'bg-white border-black/[0.07] hover:bg-[#FAF9F7]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {hasFormula && (
                          <Calculator size={12} weight="bold" className="text-[#0F766E] shrink-0" />
                        )}
                        <span className="text-xs font-mono font-semibold text-[#0B0D0F] truncate">
                          {v.name}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] font-mono text-[#5C6066] tabular-nums">
                        <span>{VARIABLE_TYPE_META[v.valueType]?.shortLabel || v.valueType}</span>
                        <span>·</span>
                        <span>
                          {usages.length === 0
                            ? 'Unused'
                            : `${usages.length} ref${usages.length === 1 ? '' : 's'}`}
                        </span>
                        {previewText && (
                          <>
                            <span>·</span>
                            <span className="text-[#0B0D0F] truncate max-w-[90px]">
                              {previewText}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {!isReadOnly && usages.length === 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteVariable(v.id);
                        }}
                        className="p-1 rounded-md text-[#5C6066] hover:text-rose-600 hover:bg-rose-50 shrink-0"
                        title="Delete unused variable"
                        aria-label={`Delete unused variable ${v.name}`}
                      >
                        <Trash size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* MAIN EDITOR: Selected Variable Configuration, Formula & Formatting */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 min-w-0">
        <div className="max-w-3xl mx-auto space-y-5">
          {!selectedVariable ? (
            <div className="bg-white rounded-2xl border border-black/[0.08] p-10 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-[#F7F6F3] border border-black/[0.08] text-[#0F766E] flex items-center justify-center mx-auto">
                <Calculator size={24} weight="duotone" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-base font-display font-semibold text-[#0B0D0F]">
                  Variables, Calculations &amp; Dynamic Piping
                </h3>
                <p className="text-xs text-[#5C6066] leading-relaxed">
                  Create typed variables to calculate totals, quiz scores, percentages, and personalised
                  summary text. Reference any variable using{' '}
                  <code className="font-mono text-[#0F766E]">{'{{variable_name}}'}</code> across
                  headings, questions, logic rules, and confirmation screens.
                </p>
              </div>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={handleCreateVariable}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#0B0D0F] hover:bg-[#191D21] text-[#F7F6F3] text-xs font-semibold transition-colors"
                >
                  <Plus size={14} weight="bold" />
                  <span>Create First Variable</span>
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Identity, Rename, Type & Delete Card */}
              <section className="bg-white rounded-2xl border border-black/[0.08] p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-[220px] space-y-1">
                    <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066]">
                      Variable Identifier (Piping Token: {'{{' + selectedVariable.name + '}}'})
                    </label>
                    {renameDraft !== null ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          autoFocus
                          value={renameDraft}
                          onChange={(e) => {
                            setRenameDraft(e.target.value);
                            setRenameError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCommitRename();
                            if (e.key === 'Escape') {
                              setRenameDraft(null);
                              setRenameError(null);
                            }
                          }}
                          className="flex-1 h-9 px-3 text-sm font-mono font-semibold text-[#0B0D0F] bg-white border border-[#0F766E] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25"
                        />
                        <button
                          type="button"
                          onClick={handleCommitRename}
                          className="h-9 px-3 rounded-lg bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold"
                        >
                          Save Name
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRenameDraft(null);
                            setRenameError(null);
                          }}
                          className="h-9 px-2.5 rounded-lg border border-black/[0.1] text-[#5C6066] hover:text-[#0B0D0F]"
                          aria-label="Cancel rename"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-base font-mono font-bold text-[#0B0D0F]">
                          {selectedVariable.name}
                        </span>
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={() => {
                              setRenameDraft(selectedVariable.name);
                              setRenameError(null);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-[#5C6066] hover:text-[#0B0D0F] bg-[#F7F6F3] hover:bg-[#EAE7E1]"
                          >
                            <PencilSimple size={12} />
                            <span>Rename</span>
                          </button>
                        )}
                      </div>
                    )}
                    {renameError && <p className="text-[11px] text-rose-600">{renameError}</p>}
                  </div>

                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => handleDeleteVariable(selectedVariable.id)}
                      className="h-9 px-3 rounded-lg border border-black/[0.08] bg-white hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 text-[#5C6066] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Trash size={14} />
                      <span>Delete</span>
                    </button>
                  )}
                </div>

                {/* Protection notice when trying to delete an actively referenced variable */}
                {deleteBlockedId === selectedVariable.id && selectedUsages.length > 0 && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
                    <div className="flex items-start gap-2">
                      <Warning size={15} weight="fill" className="shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">
                          "{selectedVariable.name}" is referenced in {selectedUsages.length}{' '}
                          place{selectedUsages.length === 1 ? '' : 's'}.
                        </p>
                        <p className="text-[11px] opacity-90 mt-0.5">
                          Remove those references first, or delete anyway (which will flag affected
                          rules before publishing).
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pl-6">
                      <button
                        type="button"
                        onClick={() => handleDeleteVariable(selectedVariable.id, true)}
                        className="px-2.5 py-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold"
                      >
                        Delete Anyway
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteBlockedId(null)}
                        className="px-2.5 py-1 rounded-md bg-white border border-black/[0.1] text-[#0B0D0F] text-[11px] font-medium"
                      >
                        Keep Variable
                      </button>
                    </div>
                  </div>
                )}

                {/* Data Type & Description */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-black/[0.06]">
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                      Data Type
                    </label>
                    <select
                      disabled={isReadOnly}
                      value={selectedVariable.valueType}
                      onChange={(e) => handleChangeType(e.target.value as VariableValueType)}
                      className="w-full h-9 px-2.5 text-xs bg-[#FAF9F7] border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    >
                      {VARIABLE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {VARIABLE_TYPE_META[t].label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-[#5C6066]">
                      {VARIABLE_TYPE_META[selectedVariable.valueType].description}
                    </p>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                      Description (optional)
                    </label>
                    <input
                      type="text"
                      disabled={isReadOnly}
                      value={selectedVariable.description || ''}
                      onChange={(e) => handlePatchSelected({ description: e.target.value })}
                      placeholder="e.g. Order subtotal including tax"
                      className="w-full h-9 px-3 text-xs bg-[#FAF9F7] focus:bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    />
                    <p className="mt-1 text-[10px] font-mono text-[#5C6066]">
                      Stable ID: {selectedVariable.id}
                    </p>
                  </div>
                </div>

                {/* Allowed Options Editor for Selection & List types */}
                {(selectedVariable.valueType === 'selection' ||
                  selectedVariable.valueType === 'list') && (
                  <div className="pt-3 border-t border-black/[0.06] space-y-2">
                    <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066]">
                      Allowed Options ({selectedVariable.options?.length || 0})
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {(selectedVariable.options || []).map((opt, idx) => (
                        <span
                          key={`${opt}_${idx}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs text-[#0B0D0F]"
                        >
                          <span>{opt}</span>
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() =>
                                handlePatchSelected({
                                  options: (selectedVariable.options || []).filter(
                                    (_, i) => i !== idx
                                  ),
                                })
                              }
                              className="text-[#5C6066] hover:text-rose-600"
                              aria-label={`Remove option ${opt}`}
                            >
                              <X size={11} weight="bold" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                    {!isReadOnly && (
                      <div className="flex items-center gap-1.5 max-w-sm">
                        <input
                          type="text"
                          value={newOptionInput}
                          onChange={(e) => setNewOptionInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const trimmed = newOptionInput.trim();
                              if (!trimmed) return;
                              handlePatchSelected({
                                options: [...(selectedVariable.options || []), trimmed],
                              });
                              setNewOptionInput('');
                            }
                          }}
                          placeholder="Add allowed option..."
                          className="flex-1 h-8 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const trimmed = newOptionInput.trim();
                            if (!trimmed) return;
                            handlePatchSelected({
                              options: [...(selectedVariable.options || []), trimmed],
                            });
                            setNewOptionInput('');
                          }}
                          className="h-8 px-3 rounded-lg bg-[#0B0D0F] text-white text-xs font-semibold"
                        >
                          Add
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Value Source: Static Initial Value OR Live Calculated Formula */}
              <section className="bg-white rounded-2xl border border-black/[0.08] p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-display font-semibold text-[#0B0D0F]">
                      Value Source &amp; Calculation
                    </h3>
                    <p className="text-[11px] text-[#5C6066]">
                      Set a static starting value (updated by logic rules) or calculate live from a
                      formula.
                    </p>
                  </div>

                  {(selectedVariable.valueType === 'number' ||
                    selectedVariable.valueType === 'string' ||
                    selectedVariable.valueType === 'boolean') && (
                    <div
                      className="inline-flex items-center rounded-lg border border-black/[0.08] bg-[#F7F6F3] p-0.5"
                      role="group"
                      aria-label="Variable value mode"
                    >
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => handlePatchSelected({ expression: undefined })}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                          !isCalculated
                            ? 'bg-[#0B0D0F] text-[#F7F6F3]'
                            : 'text-[#5C6066] hover:text-[#0B0D0F]'
                        }`}
                      >
                        Static / Rules
                      </button>
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() =>
                          handlePatchSelected({
                            expression: selectedVariable.expression ?? '',
                          })
                        }
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                          isCalculated
                            ? 'bg-[#0F766E] text-white'
                            : 'text-[#5C6066] hover:text-[#0B0D0F]'
                        }`}
                      >
                        Calculated Formula
                      </button>
                    </div>
                  )}
                </div>

                {!isCalculated ? (
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066]">
                      Initial Value
                    </label>

                    {selectedVariable.valueType === 'boolean' ? (
                      <div className="grid grid-cols-2 gap-2 max-w-xs">
                        {[
                          { label: 'True / Yes', val: true },
                          { label: 'False / No', val: false },
                        ].map((opt) => (
                          <button
                            key={opt.label}
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => handlePatchSelected({ initialValue: opt.val })}
                            className={`h-9 rounded-lg border text-xs font-semibold transition-colors ${
                              Boolean(selectedVariable.initialValue) === opt.val
                                ? 'bg-[#0F766E] text-white border-[#0F766E]'
                                : 'bg-[#FAF9F7] text-[#0B0D0F] border-black/[0.1]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    ) : selectedVariable.valueType === 'selection' &&
                      selectedVariable.options?.length ? (
                      <select
                        disabled={isReadOnly}
                        value={String(selectedVariable.initialValue ?? '')}
                        onChange={(e) => handlePatchSelected({ initialValue: e.target.value })}
                        className="w-full max-w-sm h-9 px-2.5 text-xs bg-[#FAF9F7] border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                      >
                        <option value="">(None selected)</option>
                        {selectedVariable.options.map((opt, idx) => (
                          <option key={idx} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : selectedVariable.valueType === 'list' ? (
                      <input
                        type="text"
                        disabled={isReadOnly}
                        value={
                          Array.isArray(selectedVariable.initialValue)
                            ? selectedVariable.initialValue.join(', ')
                            : String(selectedVariable.initialValue ?? '')
                        }
                        onChange={(e) => {
                          const items = e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean);
                          handlePatchSelected({ initialValue: items });
                        }}
                        placeholder="Comma-separated items (e.g. Option A, Option B)"
                        className="w-full h-9 px-3 text-xs bg-[#FAF9F7] focus:bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                      />
                    ) : (
                      <input
                        type={
                          selectedVariable.valueType === 'number'
                            ? 'number'
                            : selectedVariable.valueType === 'date'
                            ? 'date'
                            : 'text'
                        }
                        step="any"
                        disabled={isReadOnly}
                        value={String(selectedVariable.initialValue ?? '')}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (selectedVariable.valueType === 'number') {
                            handlePatchSelected({
                              initialValue: raw === '' ? 0 : Number(raw),
                            });
                          } else {
                            handlePatchSelected({ initialValue: raw });
                          }
                        }}
                        placeholder={
                          selectedVariable.valueType === 'number'
                            ? '0'
                            : selectedVariable.valueType === 'date'
                            ? 'YYYY-MM-DD'
                            : 'Default text...'
                        }
                        className="w-full max-w-sm h-9 px-3 text-xs font-mono bg-[#FAF9F7] focus:bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                      />
                    )}

                    {!initialValueCheck.valid && initialValueCheck.error && (
                      <p className="text-[11px] text-rose-600 flex items-center gap-1">
                        <WarningCircle size={13} weight="fill" />
                        <span>{initialValueCheck.error}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <FormulaEditor
                    document={document}
                    value={selectedVariable.expression || ''}
                    onChange={(nextExpr) => handlePatchSelected({ expression: nextExpr })}
                    editingVariableId={selectedVariable.id}
                    targetVariableType={selectedVariable.valueType}
                    formatConfig={selectedVariable.format}
                    sampleAnswers={sampleAnswers}
                    sampleVariables={resolvedVariables}
                    disabled={isReadOnly}
                  />
                )}
              </section>

              {/* Formatting Controls (Number, Currency, Percentage, Date) */}
              {(selectedVariable.valueType === 'number' ||
                selectedVariable.valueType === 'date') && (
                <section className="bg-white rounded-2xl border border-black/[0.08] p-4 sm:p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-display font-semibold text-[#0B0D0F] flex items-center gap-1.5">
                        <CurrencyDollar size={14} className="text-[#0F766E]" />
                        <span>Display Formatting</span>
                      </h3>
                      <p className="text-[11px] text-[#5C6066]">
                        Controls how {'{{' + selectedVariable.name + '}}'} renders in headings,
                        messages, and result screens.
                      </p>
                    </div>
                    <div className="px-2.5 py-1 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs font-mono tabular-nums text-[#0B0D0F]">
                      Preview: <strong>{liveFormattedPreview || '—'}</strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                        Format Style
                      </label>
                      <select
                        disabled={isReadOnly}
                        value={formatStyle}
                        onChange={(e) => {
                          const style = e.target.value as VariableFormatStyle;
                          handlePatchSelected({
                            format: {
                              ...(selectedVariable.format || {}),
                              style,
                              currency:
                                style === 'currency'
                                  ? selectedVariable.format?.currency || 'USD'
                                  : selectedVariable.format?.currency,
                              locale: selectedVariable.format?.locale || 'en-US',
                              decimals:
                                selectedVariable.format?.decimals ??
                                (style === 'currency' ? 2 : style === 'percent' ? 1 : 2),
                            },
                          });
                        }}
                        className="w-full h-9 px-2.5 text-xs bg-[#FAF9F7] border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                      >
                        <option value="plain">Plain (Unformatted)</option>
                        {selectedVariable.valueType === 'number' && (
                          <>
                            <option value="number">Number</option>
                            <option value="currency">Currency</option>
                            <option value="percent">Percentage</option>
                          </>
                        )}
                        {selectedVariable.valueType === 'date' && (
                          <option value="date">Formatted Date</option>
                        )}
                      </select>
                    </div>

                    {formatStyle === 'currency' && (
                      <div>
                        <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                          Currency
                        </label>
                        <select
                          disabled={isReadOnly}
                          value={selectedVariable.format?.currency || 'USD'}
                          onChange={(e) =>
                            handlePatchSelected({
                              format: {
                                ...(selectedVariable.format || { style: 'currency' }),
                                style: 'currency',
                                currency: e.target.value,
                              },
                            })
                          }
                          className="w-full h-9 px-2.5 text-xs bg-[#FAF9F7] border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                        >
                          {SUPPORTED_CURRENCIES.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {formatStyle !== 'plain' && (
                      <div>
                        <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                          Locale
                        </label>
                        <select
                          disabled={isReadOnly}
                          value={selectedVariable.format?.locale || 'en-US'}
                          onChange={(e) =>
                            handlePatchSelected({
                              format: {
                                ...(selectedVariable.format || { style: formatStyle }),
                                style: formatStyle,
                                locale: e.target.value,
                              },
                            })
                          }
                          className="w-full h-9 px-2.5 text-xs bg-[#FAF9F7] border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                        >
                          {SUPPORTED_LOCALES.map((loc) => (
                            <option key={loc.tag} value={loc.tag}>
                              {loc.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {(formatStyle === 'number' ||
                      formatStyle === 'currency' ||
                      formatStyle === 'percent') && (
                      <>
                        <div>
                          <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                            Decimal Places
                          </label>
                          <select
                            disabled={isReadOnly}
                            value={selectedVariable.format?.decimals ?? 2}
                            onChange={(e) =>
                              handlePatchSelected({
                                format: {
                                  ...(selectedVariable.format || { style: formatStyle }),
                                  style: formatStyle,
                                  decimals: Number(e.target.value),
                                },
                              })
                            }
                            className="w-full h-9 px-2.5 text-xs font-mono bg-[#FAF9F7] border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                          >
                            {[0, 1, 2, 3, 4].map((d) => (
                              <option key={d} value={d}>
                                {d} decimal{d === 1 ? '' : 's'}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-end">
                          <label className="flex items-center gap-2 text-xs text-[#0B0D0F] h-9 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              disabled={isReadOnly}
                              checked={selectedVariable.format?.useGrouping !== false}
                              onChange={(e) =>
                                handlePatchSelected({
                                  format: {
                                    ...(selectedVariable.format || { style: formatStyle }),
                                    style: formatStyle,
                                    useGrouping: e.target.checked,
                                  },
                                })
                              }
                              className="accent-[#0F766E]"
                            />
                            <span>Thousand separators</span>
                          </label>
                        </div>
                      </>
                    )}

                    {formatStyle === 'date' && (
                      <div>
                        <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                          Date Style
                        </label>
                        <select
                          disabled={isReadOnly}
                          value={selectedVariable.format?.dateStyle || 'medium'}
                          onChange={(e) =>
                            handlePatchSelected({
                              format: {
                                ...(selectedVariable.format || { style: 'date' }),
                                style: 'date',
                                dateStyle: e.target.value as 'short' | 'medium' | 'long',
                              },
                            })
                          }
                          className="w-full h-9 px-2.5 text-xs bg-[#FAF9F7] border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                        >
                          <option value="short">Short (e.g. 5/14/26)</option>
                          <option value="medium">Medium (e.g. May 14, 2026)</option>
                          <option value="long">Long (e.g. May 14, 2026)</option>
                        </select>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Variable Usage Summary */}
              <section className="bg-white rounded-2xl border border-black/[0.08] p-4 sm:p-5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-display font-semibold text-[#0B0D0F]">
                    Where This Variable Is Used
                  </h3>
                  <span className="text-[11px] font-mono text-[#5C6066] tabular-nums">
                    {selectedUsages.length} reference{selectedUsages.length === 1 ? '' : 's'}
                  </span>
                </div>

                {selectedUsages.length === 0 ? (
                  <p className="text-xs text-[#5C6066] flex items-center gap-1.5">
                    <CheckCircle size={14} className="text-[#0F766E] shrink-0" />
                    <span>
                      Not referenced anywhere yet. Use{' '}
                      <code className="font-mono text-[#0B0D0F]">
                        {'{{' + selectedVariable.name + '}}'}
                      </code>{' '}
                      in headings, questions, formulas, or logic conditions.
                    </span>
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {selectedUsages.map((u, idx) => (
                      <li
                        key={`${u.kind}_${idx}`}
                        className="text-xs text-[#0B0D0F] px-2.5 py-1.5 rounded-lg bg-[#FAF9F7] border border-black/[0.06] flex items-center justify-between gap-2"
                      >
                        <span>{u.description}</span>
                        <span className="text-[10px] font-mono uppercase text-[#5C6066]">
                          {u.kind}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
};
