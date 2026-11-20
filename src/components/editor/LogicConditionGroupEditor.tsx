import React from 'react';
import {
  Plus,
  Trash,
  GitBranch,
  CheckCircle,
  XCircle,
  WarningCircle,
} from '@phosphor-icons/react';
import {
  ConditionEvaluationTrace,
  FormComponentNode,
  FormDocument,
  LogicConditionClause,
  LogicConditionGroup,
  LogicConditionItem,
  LogicOperator,
  conditionOperatorRegistry,
  createEmptyConditionClause,
  createEmptyConditionGroup,
  inferComponentDataType,
  inferVariableDataType,
} from '../../studio';

interface LogicConditionGroupEditorProps {
  document: FormDocument;
  group: LogicConditionGroup;
  onChange: (nextGroup: LogicConditionGroup) => void;
  onRemoveGroup?: () => void;
  depth?: number;
  isReadOnly?: boolean;
  /** Optional live trace map (itemId -> ConditionEvaluationTrace) when Debugger is active */
  traceMap?: Map<string, ConditionEvaluationTrace>;
  /** All question/selectable components ordered cleanly */
  selectableComponents: FormComponentNode[];
}

export function indexConditionTraces(
  trace?: ConditionEvaluationTrace,
  map = new Map<string, ConditionEvaluationTrace>()
): Map<string, ConditionEvaluationTrace> {
  if (!trace) return map;
  map.set(trace.itemId, trace);
  if (trace.children) {
    for (const child of trace.children) {
      indexConditionTraces(child, map);
    }
  }
  return map;
}

export const LogicConditionGroupEditor: React.FC<LogicConditionGroupEditorProps> = ({
  document,
  group,
  onChange,
  onRemoveGroup,
  depth = 0,
  isReadOnly = false,
  traceMap,
  selectableComponents,
}) => {
  const groupTrace = traceMap?.get(group.id);

  const handleCombinatorChange = (combinator: 'AND' | 'OR') => {
    if (isReadOnly) return;
    onChange({ ...group, combinator });
  };

  const handleUpdateItem = (itemId: string, nextItem: LogicConditionItem) => {
    if (isReadOnly) return;
    onChange({
      ...group,
      items: group.items.map((item) => (item.id === itemId ? nextItem : item)),
    });
  };

  const handleRemoveItem = (itemId: string) => {
    if (isReadOnly) return;
    onChange({
      ...group,
      items: group.items.filter((item) => item.id !== itemId),
    });
  };

  const handleAddCondition = () => {
    if (isReadOnly) return;
    onChange({
      ...group,
      items: [...group.items, createEmptyConditionClause(document)],
    });
  };

  const handleAddNestedGroup = () => {
    if (isReadOnly || depth >= 2) return;
    const nestedCombinator = group.combinator === 'AND' ? 'OR' : 'AND';
    onChange({
      ...group,
      items: [...group.items, createEmptyConditionGroup(document, nestedCombinator)],
    });
  };

  const handleSourceChange = (clause: LogicConditionClause, encodedValue: string) => {
    const [sourceType, ...rest] = encodedValue.split(':');
    const sourceId = rest.join(':');
    if (sourceType === 'variable') {
      const variable = document.variables.find((v) => v.name === sourceId);
      const dataType = inferVariableDataType(variable);
      const compatible = conditionOperatorRegistry.getForDataType(dataType);
      const nextOp = compatible.some((o) => o.operator === clause.operator)
        ? clause.operator
        : conditionOperatorRegistry.getDefaultOperator(dataType);
      const defaultVal =
        dataType === 'selection' && variable?.options?.[0] ? variable.options[0] : '';
      handleUpdateItem(clause.id, {
        ...clause,
        sourceType: 'variable',
        sourceId,
        operator: nextOp,
        value: defaultVal,
        secondaryValue: undefined,
      });
      return;
    }

    const comp = document.components[sourceId];
    const dataType = inferComponentDataType(comp);
    const compatible = conditionOperatorRegistry.getForDataType(dataType);
    const nextOp = compatible.some((o) => o.operator === clause.operator)
      ? clause.operator
      : conditionOperatorRegistry.getDefaultOperator(dataType);
    const defaultVal =
      dataType === 'selection' && comp?.content.options?.[0] ? comp.content.options[0] : '';

    handleUpdateItem(clause.id, {
      ...clause,
      sourceType: 'component',
      sourceId,
      operator: nextOp,
      value: defaultVal,
      secondaryValue: undefined,
    });
  };

  const renderConditionRow = (clause: LogicConditionClause, index: number) => {
    const isVar = clause.sourceType === 'variable';
    const variable = isVar
      ? document.variables.find((v) => v.name === clause.sourceId)
      : undefined;
    const comp = !isVar ? document.components[clause.sourceId] : undefined;
    const isMissingSource = Boolean(clause.sourceId) && (isVar ? !variable : !comp);

    const dataType = isVar
      ? inferVariableDataType(variable)
      : inferComponentDataType(comp);
    const operators = conditionOperatorRegistry.getForDataType(dataType);
    const activeOpDef =
      conditionOperatorRegistry.get(clause.operator) || operators[0];
    const clauseTrace = traceMap?.get(clause.id);
    const encodedSource = clause.sourceId ? `${clause.sourceType}:${clause.sourceId}` : '';

    return (
      <div
        key={clause.id}
        className={`rounded-xl border p-3 transition-colors ${
          isMissingSource
            ? 'border-rose-300 bg-rose-50/40'
            : 'border-black/[0.08] bg-[#FAF9F7]'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2 text-[11px] font-mono text-[#5C6066]">
            <span>{index === 0 ? 'IF' : group.combinator}</span>
            <span className="opacity-40">·</span>
            <span className="capitalize">{dataType}</span>
            {clauseTrace && (
              <>
                <span className="opacity-40">·</span>
                <span
                  className={`inline-flex items-center gap-1 font-semibold ${
                    clauseTrace.passed ? 'text-[#0F766E]' : 'text-[#5C6066]'
                  }`}
                >
                  {clauseTrace.passed ? (
                    <CheckCircle size={13} weight="fill" />
                  ) : (
                    <XCircle size={13} weight="fill" className="text-black/35" />
                  )}
                  {clauseTrace.passed ? 'Matched' : 'False'}
                </span>
              </>
            )}
          </div>

          {!isReadOnly && (
            <button
              type="button"
              onClick={() => handleRemoveItem(clause.id)}
              disabled={depth === 0 && group.items.length <= 1}
              className="p-1 rounded-md text-[#5C6066] hover:text-rose-600 hover:bg-rose-50 disabled:opacity-25 transition-colors"
              title="Remove condition"
              aria-label="Remove condition"
            >
              <Trash size={14} weight="regular" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
          {/* Source Selector (Questions + Variables) */}
          <div className="md:col-span-5">
            <label className="sr-only">Question or variable</label>
            <select
              disabled={isReadOnly}
              value={encodedSource}
              onChange={(e) => handleSourceChange(clause, e.target.value)}
              className="w-full h-9 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
            >
              <option value="">Select question or variable...</option>
              {isMissingSource && (
                <option value={encodedSource}>
                  Missing {isVar ? 'variable' : 'question'} ({clause.sourceId})
                </option>
              )}
              <optgroup label="Form Questions">
                {selectableComponents.map((c, idx) => (
                  <option key={c.id} value={`component:${c.id}`}>
                    Q{idx + 1}. {c.content.label || 'Untitled question'}
                  </option>
                ))}
              </optgroup>
              {document.variables.length > 0 && (
                <optgroup label="Form Variables">
                  {document.variables.map((v) => (
                    <option key={v.id} value={`variable:${v.name}`}>
                      Variable: {v.name} ({v.valueType})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Typed Operator Selector */}
          <div className={activeOpDef?.valueArity === 0 ? 'md:col-span-7' : 'md:col-span-3'}>
            <label className="sr-only">Operator</label>
            <select
              disabled={isReadOnly}
              value={clause.operator}
              onChange={(e) =>
                handleUpdateItem(clause.id, {
                  ...clause,
                  operator: e.target.value as LogicOperator,
                })
              }
              className="w-full h-9 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
            >
              {operators.map((op) => (
                <option key={op.operator} value={op.operator}>
                  {op.label}
                </option>
              ))}
            </select>
          </div>

          {/* Value Input(s) */}
          {activeOpDef && activeOpDef.valueArity >= 1 && (
            <div className="md:col-span-4">
              {activeOpDef.valueArity === 2 ? (
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type={dataType === 'date' ? 'date' : 'number'}
                    disabled={isReadOnly}
                    value={clause.value}
                    onChange={(e) =>
                      handleUpdateItem(clause.id, { ...clause, value: e.target.value })
                    }
                    placeholder="Min"
                    className="w-full h-9 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                  <input
                    type={dataType === 'date' ? 'date' : 'number'}
                    disabled={isReadOnly}
                    value={clause.secondaryValue ?? ''}
                    onChange={(e) =>
                      handleUpdateItem(clause.id, {
                        ...clause,
                        secondaryValue: e.target.value,
                      })
                    }
                    placeholder="Max"
                    className="w-full h-9 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                </div>
              ) : dataType === 'selection' &&
                ((isVar ? variable?.options?.length : comp?.content.options?.length) || 0) > 0 ? (
                <select
                  disabled={isReadOnly}
                  value={clause.value}
                  onChange={(e) =>
                    handleUpdateItem(clause.id, { ...clause, value: e.target.value })
                  }
                  className="w-full h-9 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                >
                  <option value="">Choose option...</option>
                  {(isVar ? variable?.options || [] : comp?.content.options || []).map(
                    (opt, idx) => (
                      <option key={idx} value={opt}>
                        {opt}
                      </option>
                    )
                  )}
                </select>
              ) : (
                <input
                  type={
                    dataType === 'number'
                      ? 'number'
                      : dataType === 'date'
                      ? 'date'
                      : 'text'
                  }
                  disabled={isReadOnly}
                  value={clause.value}
                  onChange={(e) =>
                    handleUpdateItem(clause.id, { ...clause, value: e.target.value })
                  }
                  placeholder={
                    dataType === 'number'
                      ? 'Enter number...'
                      : dataType === 'date'
                      ? 'Select date...'
                      : 'Enter value...'
                  }
                  className="w-full h-9 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                />
              )}
            </div>
          )}
        </div>

        {isMissingSource && (
          <p className="mt-2 text-[11px] text-rose-700 flex items-center gap-1.5">
            <WarningCircle size={13} weight="fill" className="shrink-0" />
            <span>
              This {isVar ? 'variable' : 'question'} was deleted. Pick a valid source to fix this rule.
            </span>
          </p>
        )}
      </div>
    );
  };

  return (
    <div
      className={`rounded-xl border ${
        depth === 0
          ? 'border-black/[0.08] bg-white p-4'
          : 'border-black/[0.1] bg-[#F7F6F3] p-3.5'
      } space-y-3`}
    >
      {/* Group Header: Combinator Toggle + Trace + Remove Nested Group */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className="inline-flex items-center rounded-lg border border-black/[0.08] bg-[#F7F6F3] p-0.5"
            role="group"
            aria-label="Condition combinator"
          >
            {(['AND', 'OR'] as const).map((comb) => {
              const active = group.combinator === comb;
              return (
                <button
                  key={comb}
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => handleCombinatorChange(comb)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#0B0D0F] text-[#F7F6F3]'
                      : 'text-[#5C6066] hover:text-[#0B0D0F]'
                  }`}
                >
                  {comb === 'AND' ? 'Match ALL (AND)' : 'Match ANY (OR)'}
                </button>
              );
            })}
          </div>

          {groupTrace && (
            <span
              className={`text-[11px] font-mono inline-flex items-center gap-1 ${
                groupTrace.passed ? 'text-[#0F766E] font-semibold' : 'text-[#5C6066]'
              }`}
            >
              {groupTrace.passed ? (
                <CheckCircle size={13} weight="fill" />
              ) : (
                <XCircle size={13} weight="fill" className="text-black/30" />
              )}
              {groupTrace.passed ? 'Group true' : 'Group false'}
            </span>
          )}
        </div>

        {onRemoveGroup && !isReadOnly && (
          <button
            type="button"
            onClick={onRemoveGroup}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#5C6066] hover:text-rose-600 transition-colors whitespace-nowrap"
          >
            <Trash size={13} />
            <span>Remove group</span>
          </button>
        )}
      </div>

      {/* Group Items */}
      <div className="space-y-2.5">
        {group.items.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-black/[0.15] text-center text-xs text-[#5C6066]">
            No conditions in this group yet. Add a condition below.
          </div>
        ) : (
          group.items.map((item, idx) =>
            item.kind === 'group' ? (
              <div key={item.id} className="space-y-1.5">
                {idx > 0 && (
                  <div className="text-[10px] font-mono font-semibold text-[#5C6066] pl-2">
                    {group.combinator}
                  </div>
                )}
                <LogicConditionGroupEditor
                  document={document}
                  group={item}
                  onChange={(nextNested) => handleUpdateItem(item.id, nextNested)}
                  onRemoveGroup={() => handleRemoveItem(item.id)}
                  depth={depth + 1}
                  isReadOnly={isReadOnly}
                  traceMap={traceMap}
                  selectableComponents={selectableComponents}
                />
              </div>
            ) : (
              renderConditionRow(item, idx)
            )
          )
        )}
      </div>

      {/* Group Footer Actions */}
      {!isReadOnly && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleAddCondition}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B0D0F] bg-[#F7F6F3] hover:bg-[#EAE7E1] border border-black/[0.08] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus size={13} weight="bold" />
            <span>Add Condition</span>
          </button>

          {depth < 2 && (
            <button
              type="button"
              onClick={handleAddNestedGroup}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#5C6066] hover:text-[#0B0D0F] bg-white hover:bg-[#F7F6F3] border border-black/[0.08] rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <GitBranch size={13} weight="regular" />
              <span>Add Nested Group</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
