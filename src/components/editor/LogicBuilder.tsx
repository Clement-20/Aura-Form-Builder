import React, { useState } from 'react';
import { FormSchema, LogicRule, LogicCondition, LogicAction } from '../../types/form';
import { GitBranch, Plus, Trash2, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';

interface LogicBuilderProps {
  form: FormSchema;
  onUpdateRules: (rules: LogicRule[]) => void;
}

export const LogicBuilder: React.FC<LogicBuilderProps> = ({ form, onUpdateRules }) => {
  const [sourceFieldId, setSourceFieldId] = useState<string>(form.fields[0]?.id || '');
  const [condition, setCondition] = useState<LogicCondition>('equals');
  const [value, setValue] = useState<string>('');
  const [action, setAction] = useState<LogicAction>('show');
  const [targetFieldId, setTargetFieldId] = useState<string>(form.fields[1]?.id || '');

  const handleAddRule = () => {
    if (!sourceFieldId || !targetFieldId || !value.trim()) return;

    const newRule: LogicRule = {
      id: 'rule_' + Math.random().toString(36).substring(2, 9),
      sourceFieldId,
      condition,
      value: value.trim(),
      action,
      targetFieldId,
    };

    onUpdateRules([...form.logicRules, newRule]);
    setValue('');
  };

  const handleDeleteRule = (id: string) => {
    onUpdateRules(form.logicRules.filter((r) => r.id !== id));
  };

  const getFieldLabel = (id: string) => {
    const f = form.fields.find((field) => field.id === id);
    return f ? f.label : id;
  };

  const getSourceField = () => form.fields.find((f) => f.id === sourceFieldId);

  return (
    <div className="flex-1 overflow-y-auto h-[calc(100vh-3.5rem)] bg-neutral-50 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h2 className="text-lg font-bold text-neutral-900 tracking-tight flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-neutral-700" />
            <span>Conditional Logic & Flow Rules</span>
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            Build dynamic branching. Show or hide questions based on how the respondent answers earlier items.
          </p>
        </div>

        {/* Rule Creator Card */}
        <div className="bg-white p-6 rounded-xl border border-neutral-200/80 shadow-xs space-y-5">
          <span className="text-xs font-semibold text-neutral-800 uppercase tracking-wider block">
            Add New Branching Rule
          </span>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Condition Source */}
            <div className="space-y-1.5">
              <label className="font-medium text-neutral-600">IF Question</label>
              <select
                value={sourceFieldId}
                onChange={(e) => setSourceFieldId(e.target.value)}
                className="w-full p-2.5 border rounded-lg border-neutral-200 bg-white"
              >
                {form.fields.map((f, i) => (
                  <option key={f.id} value={f.id}>
                    {i + 1}. {f.label || 'Untitled'}
                  </option>
                ))}
              </select>
            </div>

            {/* Condition Operator */}
            <div className="space-y-1.5">
              <label className="font-medium text-neutral-600">Condition</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as LogicCondition)}
                className="w-full p-2.5 border rounded-lg border-neutral-200 bg-white"
              >
                <option value="equals">is equal to</option>
                <option value="not_equals">is not equal to</option>
                <option value="contains">contains text / option</option>
                <option value="greater_than">is greater than</option>
                <option value="less_than">is less than</option>
              </select>
            </div>

            {/* Value Match */}
            <div className="space-y-1.5">
              <label className="font-medium text-neutral-600">Expected Value</label>
              {getSourceField()?.options && getSourceField()!.options!.length > 0 ? (
                <select
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-full p-2.5 border rounded-lg border-neutral-200 bg-white"
                >
                  <option value="">Select an option...</option>
                  {getSourceField()!.options!.map((opt, i) => (
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
                  placeholder="e.g. Yes, 5, or specific word"
                  className="w-full px-3 py-2 border rounded-lg border-neutral-200"
                />
              )}
            </div>

            {/* Then Action & Target */}
            <div className="space-y-1.5">
              <label className="font-medium text-neutral-600">THEN Action</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value as LogicAction)}
                  className="w-full p-2.5 border rounded-lg border-neutral-200 bg-white"
                >
                  <option value="show">SHOW question</option>
                  <option value="hide">HIDE question</option>
                </select>

                <select
                  value={targetFieldId}
                  onChange={(e) => setTargetFieldId(e.target.value)}
                  className="w-full p-2.5 border rounded-lg border-neutral-200 bg-white"
                >
                  {form.fields
                    .filter((f) => f.id !== sourceFieldId)
                    .map((f, i) => (
                      <option key={f.id} value={f.id}>
                        {f.label || `Field ${i + 1}`}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={handleAddRule}
              disabled={!value.trim()}
              className="px-4 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Logic Rule</span>
            </button>
          </div>
        </div>

        {/* Existing Rules List */}
        <div className="space-y-3">
          <span className="text-xs font-semibold text-neutral-700 uppercase tracking-wider block">
            Active Rules ({form.logicRules.length})
          </span>

          {form.logicRules.length === 0 ? (
            <div className="p-8 bg-white rounded-xl border border-neutral-200 text-center text-neutral-400 text-xs">
              No conditional rules configured. All questions will be displayed sequentially.
            </div>
          ) : (
            <div className="space-y-2">
              {form.logicRules.map((rule, idx) => (
                <div
                  key={rule.id}
                  className="bg-white p-4 rounded-xl border border-neutral-200/80 shadow-xs flex items-center justify-between gap-4 text-xs"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="w-5 h-5 rounded bg-neutral-100 text-neutral-600 font-mono text-[10px] font-semibold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span>
                      IF <strong className="text-neutral-900 font-semibold">{getFieldLabel(rule.sourceFieldId)}</strong>
                    </span>
                    <span className="text-neutral-500 font-mono">
                      {rule.condition === 'equals'
                        ? '=='
                        : rule.condition === 'not_equals'
                        ? '!='
                        : rule.condition}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-neutral-100 font-mono font-medium text-neutral-800">
                      &quot;{rule.value}&quot;
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />
                    <span>
                      THEN <strong className="uppercase font-semibold text-neutral-900">{rule.action}</strong>
                    </span>
                    <strong className="text-neutral-900 font-semibold">
                      {getFieldLabel(rule.targetFieldId || '')}
                    </strong>
                  </div>

                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="p-1.5 text-neutral-400 hover:text-rose-600 rounded transition-colors shrink-0"
                    title="Delete rule"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
