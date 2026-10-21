import React from 'react';
import { FormField, FieldType, FormLayoutMode } from '../../types/form';
import { Trash2, Copy, Plus, X } from 'lucide-react';

interface FieldInspectorProps {
  field: FormField | null;
  onUpdateField: (field: FormField) => void;
  onDeleteField: (id: string) => void;
  onDuplicateField: (id: string) => void;
  isQuizMode: boolean;
  layoutMode: FormLayoutMode;
}

export const FieldInspector: React.FC<FieldInspectorProps> = ({
  field,
  onUpdateField,
  onDeleteField,
  onDuplicateField,
  isQuizMode,
  layoutMode,
}) => {
  if (!field) {
    return (
      <aside className="w-72 lg:w-80 border-l border-neutral-200 bg-white p-6 text-xs text-neutral-400 shrink-0 h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center text-center">
        <p className="max-w-[200px]">
          Select any question on the canvas to configure its properties, validation rules, and choice options.
        </p>
      </aside>
    );
  }

  const handleAddOption = () => {
    const currentOptions = field.options || [];
    const newOpt = `Option ${currentOptions.length + 1}`;
    onUpdateField({
      ...field,
      options: [...currentOptions, newOpt],
    });
  };

  const handleUpdateOption = (index: number, val: string) => {
    const currentOptions = [...(field.options || [])];
    currentOptions[index] = val;
    onUpdateField({
      ...field,
      options: currentOptions,
    });
  };

  const handleDeleteOption = (index: number) => {
    const currentOptions = (field.options || []).filter((_, i) => i !== index);
    onUpdateField({
      ...field,
      options: currentOptions,
    });
  };

  return (
    <aside className="w-72 lg:w-80 border-l border-neutral-200 bg-white p-5 shrink-0 h-[calc(100vh-3.5rem)] overflow-y-auto space-y-6 text-xs text-neutral-700">
      <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
        <span className="font-semibold text-neutral-900 uppercase tracking-wider text-[11px]">
          Field Properties
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onDuplicateField(field.id)}
            className="p-1 text-neutral-400 hover:text-neutral-700 rounded hover:bg-neutral-100 transition-colors"
            title="Duplicate Field"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDeleteField(field.id)}
            className="p-1 text-neutral-400 hover:text-rose-600 rounded hover:bg-neutral-100 transition-colors"
            title="Delete Field"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Field Type Selector */}
      <div className="space-y-1.5">
        <label className="font-medium text-neutral-600">Element Type</label>
        <select
          value={field.type}
          onChange={(e) => onUpdateField({ ...field, type: e.target.value as FieldType })}
          className="w-full p-2 border rounded-md border-neutral-200 bg-white text-xs font-medium focus:border-neutral-900 focus:outline-none"
        >
          <option value="text">Short Text</option>
          <option value="textarea">Long Paragraph</option>
          <option value="email">Email Address</option>
          <option value="phone">Phone Number</option>
          <option value="url">Website URL</option>
          <option value="radio">Single Choice (Radio)</option>
          <option value="checkbox">Multiple Choice (Checkboxes)</option>
          <option value="select">Dropdown Select</option>
          <option value="rating">Star Rating (1-5)</option>
          <option value="scale">Opinion Scale (0-10)</option>
          <option value="number">Numeric Value</option>
          <option value="date">Date Picker</option>
          <option value="statement">Informational Statement</option>
        </select>
      </div>

      {/* Question Label */}
      <div className="space-y-1.5">
        <label className="font-medium text-neutral-600">Question Title / Label</label>
        <textarea
          rows={2}
          value={field.label}
          onChange={(e) => onUpdateField({ ...field, label: e.target.value })}
          className="w-full p-2 border rounded-md border-neutral-200 focus:border-neutral-900 focus:outline-none resize-none font-medium"
        />
      </div>

      {/* Help / Description Text */}
      <div className="space-y-1.5">
        <label className="font-medium text-neutral-600">Help / Subtitle text (Optional)</label>
        <input
          type="text"
          value={field.helpText || ''}
          onChange={(e) => onUpdateField({ ...field, helpText: e.target.value })}
          placeholder="e.g. Please enter your legal name..."
          className="w-full px-2.5 py-1.5 border rounded-md border-neutral-200 focus:border-neutral-900 focus:outline-none"
        />
      </div>

      {/* Placeholder text */}
      <div className="space-y-1.5">
        <label className="font-medium text-neutral-600">Placeholder Text</label>
        <input
          type="text"
          value={field.placeholder || ''}
          onChange={(e) => onUpdateField({ ...field, placeholder: e.target.value })}
          placeholder="e.g. Type your answer..."
          className="w-full px-2.5 py-1.5 border rounded-md border-neutral-200 focus:border-neutral-900 focus:outline-none"
        />
      </div>

      {/* Options Manager for choice types */}
      {(field.type === 'radio' || field.type === 'checkbox' || field.type === 'select') && (
        <div className="space-y-2 pt-2 border-t border-neutral-100">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-neutral-900 uppercase tracking-wider text-[10px]">
              Choices / Options
            </span>
            <button
              type="button"
              onClick={handleAddOption}
              className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              <span>Add Option</span>
            </button>
          </div>

          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {(field.options || []).map((opt, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => handleUpdateOption(i, e.target.value)}
                  className="w-full px-2 py-1 text-xs border rounded border-neutral-200 focus:border-neutral-900 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleDeleteOption(i)}
                  className="p-1 text-neutral-400 hover:text-rose-600 rounded"
                  title="Remove Option"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Validation toggles */}
      <div className="space-y-3 pt-2 border-t border-neutral-100">
        <span className="font-semibold text-neutral-900 uppercase tracking-wider text-[10px] block">
          Validation & Rules
        </span>

        <label className="flex items-center gap-2 cursor-pointer font-medium">
          <input
            type="checkbox"
            checked={Boolean(field.required)}
            onChange={(e) => onUpdateField({ ...field, required: e.target.checked })}
            className="rounded text-neutral-900"
          />
          <span>Required question</span>
        </label>

        {layoutMode === 'stepped' && (
          <div className="space-y-1 pt-1">
            <label className="font-medium text-neutral-600">Assigned Page Step</label>
            <input
              type="number"
              min={1}
              max={10}
              value={field.step || 1}
              onChange={(e) => onUpdateField({ ...field, step: parseInt(e.target.value, 10) || 1 })}
              className="w-full px-2.5 py-1.5 border rounded-md border-neutral-200 focus:border-neutral-900"
            />
          </div>
        )}
      </div>

      {/* Quiz Attributes */}
      {isQuizMode && (
        <div className="space-y-3 pt-3 border-t border-neutral-100">
          <span className="font-semibold text-indigo-700 uppercase tracking-wider text-[10px] block">
            Quiz & Scoring Settings
          </span>

          <div className="space-y-1">
            <label className="font-medium text-neutral-600">Points Awarded</label>
            <input
              type="number"
              min={0}
              max={100}
              value={field.points || 10}
              onChange={(e) => onUpdateField({ ...field, points: parseInt(e.target.value, 10) || 0 })}
              className="w-full px-2.5 py-1.5 border rounded-md border-neutral-200 focus:border-neutral-900"
            />
          </div>

          {(field.type === 'radio' || field.type === 'select') && field.options && (
            <div className="space-y-1">
              <label className="font-medium text-neutral-600">Designated Correct Answer</label>
              <select
                value={String(field.correctAnswer || '')}
                onChange={(e) => onUpdateField({ ...field, correctAnswer: e.target.value })}
                className="w-full p-2 border rounded-md border-neutral-200 bg-white"
              >
                <option value="">None / Not graded</option>
                {field.options.map((opt, i) => (
                  <option key={i} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
