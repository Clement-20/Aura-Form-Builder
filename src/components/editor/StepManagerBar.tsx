import React, { useState } from 'react';
import { FormStep, FormField, FormSchema } from '../../types/form';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit2,
  Check,
  X,
  Layers,
  Eye,
  Settings2,
} from 'lucide-react';

interface StepManagerBarProps {
  steps: FormStep[];
  activeStepNumber: number;
  onSelectStep: (stepNumber: number) => void;
  onAddStep: () => void;
  onUpdateStep: (stepNumber: number, title: string, description?: string) => void;
  onDeleteStep: (stepNumber: number) => void;
  onReorderStep: (stepNumber: number, direction: 'left' | 'right') => void;
  viewAllSteps: boolean;
  onToggleViewAll: () => void;
  fields: FormField[];
}

export const StepManagerBar: React.FC<StepManagerBarProps> = ({
  steps,
  activeStepNumber,
  onSelectStep,
  onAddStep,
  onUpdateStep,
  onDeleteStep,
  onReorderStep,
  viewAllSteps,
  onToggleViewAll,
  fields,
}) => {
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const handleStartEdit = (step: FormStep) => {
    setEditingStep(step.stepNumber);
    setEditTitle(step.title);
    setEditDesc(step.description || '');
  };

  const handleSaveEdit = (stepNumber: number) => {
    if (editTitle.trim()) {
      onUpdateStep(stepNumber, editTitle.trim(), editDesc.trim());
    }
    setEditingStep(null);
  };

  return (
    <div className="bg-white border-b border-neutral-200 px-4 sm:px-8 py-2.5 flex items-center justify-between gap-4 text-xs shrink-0 overflow-x-auto">
      {/* Left: Step Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto py-0.5">
        <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-neutral-600" />
          <span>Steps</span>
        </span>

        {steps.map((step, idx) => {
          const isActive = !viewAllSteps && activeStepNumber === step.stepNumber;
          const stepFieldCount = fields.filter((f) => (f.step || 1) === step.stepNumber).length;
          const isFirst = idx === 0;
          const isLast = idx === steps.length - 1;

          return (
            <div
              key={step.id || step.stepNumber}
              className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all shrink-0 ${
                isActive
                  ? 'border-neutral-900 bg-neutral-900 text-white font-semibold shadow-xs'
                  : 'border-neutral-200/90 bg-neutral-50 hover:bg-neutral-100 text-neutral-700'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectStep(step.stepNumber)}
                className="flex items-center gap-2 text-left"
              >
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${
                    isActive ? 'bg-white text-neutral-900' : 'bg-neutral-200 text-neutral-700'
                  }`}
                >
                  {step.stepNumber}
                </span>
                <span className="truncate max-w-[130px]">{step.title}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    isActive ? 'bg-white/20 text-white' : 'bg-neutral-200/70 text-neutral-500'
                  }`}
                >
                  {stepFieldCount}
                </span>
              </button>

              {/* Step Quick Controls */}
              <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => handleStartEdit(step)}
                  className={`p-0.5 rounded hover:opacity-100 ${
                    isActive ? 'hover:bg-neutral-800 text-neutral-300' : 'hover:bg-neutral-200 text-neutral-500'
                  }`}
                  title="Rename step"
                >
                  <Edit2 className="w-3 h-3" />
                </button>

                {!isFirst && (
                  <button
                    type="button"
                    onClick={() => onReorderStep(step.stepNumber, 'left')}
                    className={`p-0.5 rounded hover:opacity-100 ${
                      isActive ? 'hover:bg-neutral-800 text-neutral-300' : 'hover:bg-neutral-200 text-neutral-500'
                    }`}
                    title="Move Step Left"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                )}

                {!isLast && (
                  <button
                    type="button"
                    onClick={() => onReorderStep(step.stepNumber, 'right')}
                    className={`p-0.5 rounded hover:opacity-100 ${
                      isActive ? 'hover:bg-neutral-800 text-neutral-300' : 'hover:bg-neutral-200 text-neutral-500'
                    }`}
                    title="Move Step Right"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}

                {steps.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onDeleteStep(step.stepNumber)}
                    className={`p-0.5 rounded hover:text-rose-400 ${
                      isActive ? 'hover:bg-neutral-800 text-neutral-300' : 'hover:bg-neutral-200 text-neutral-500'
                    }`}
                    title="Remove Step (merges fields)"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Add Step Button */}
        <button
          type="button"
          onClick={onAddStep}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-neutral-300 hover:border-neutral-900 bg-white hover:bg-neutral-50 text-neutral-700 font-semibold transition-colors shrink-0 shadow-2xs"
          title="Append a new page/step"
        >
          <Plus className="w-3.5 h-3.5 text-neutral-900" />
          <span>Add Step</span>
        </button>
      </div>

      {/* Right: View Mode Toggle */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onToggleViewAll}
          className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors flex items-center gap-1.5 ${
            viewAllSteps
              ? 'bg-neutral-900 text-white border-neutral-900'
              : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>{viewAllSteps ? 'Viewing All Pages' : 'Show All Pages'}</span>
        </button>
      </div>

      {/* Step Edit Modal */}
      {editingStep !== null && (
        <div className="fixed inset-0 z-50 bg-neutral-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl border border-neutral-200 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
              <span className="font-bold text-neutral-900 text-sm">
                Edit Step {editingStep} Settings
              </span>
              <button
                onClick={() => setEditingStep(null)}
                className="text-neutral-400 hover:text-neutral-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-neutral-700">Step Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="e.g. Session Selection"
                  className="w-full px-3 py-2 border rounded-lg border-neutral-200 focus:outline-none focus:border-neutral-900"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-neutral-700">Description / Subtitle</label>
                <textarea
                  rows={2}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Optional guidance for the respondent..."
                  className="w-full px-3 py-2 border rounded-lg border-neutral-200 focus:outline-none focus:border-neutral-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingStep(null)}
                className="px-3 py-1.5 rounded-lg text-neutral-600 hover:bg-neutral-100 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveEdit(editingStep)}
                className="px-3.5 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 transition-colors"
              >
                Save Step
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
