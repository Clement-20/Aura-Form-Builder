import React, { useState } from 'react';
import {
  Plus,
  CaretLeft,
  CaretRight,
  Trash,
  PencilSimple,
  X,
  Stack,
  Eye,
} from '@phosphor-icons/react';
import { FormStep, FormField } from '../../types/form';

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
    <div className="bg-white/90 backdrop-blur-sm border-b border-black/[0.06] px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3 text-xs shrink-0 overflow-x-auto">
      {/* Left: Page Pills */}
      <div className="flex items-center gap-2 overflow-x-auto py-0.5">
        <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-[#5C6066] shrink-0 mr-1">
          <Stack size={14} weight="light" className="text-[#0F766E]" />
          <span>Pages</span>
        </span>

        {steps.map((step, idx) => {
          const isActive = !viewAllSteps && activeStepNumber === step.stepNumber;
          const stepFieldCount = fields.filter((f) => (f.step || 1) === step.stepNumber).length;
          const isFirst = idx === 0;
          const isLast = idx === steps.length - 1;

          return (
            <div
              key={step.id || step.stepNumber}
              className={`group relative flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 min-h-[38px] rounded-full transition-all shrink-0 ${
                isActive
                  ? 'bg-[#0B0D0F] text-[#F7F6F3] font-semibold'
                  : 'bg-[#F7F6F3] ring-1 ring-black/[0.06] hover:ring-black/20 text-[#0B0D0F]'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectStep(step.stepNumber)}
                className="flex items-center gap-2 text-left"
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${
                    isActive ? 'bg-white text-[#0B0D0F]' : 'bg-black/[0.07] text-[#0B0D0F]'
                  }`}
                >
                  {step.stepNumber}
                </span>
                <span className="truncate max-w-[110px] sm:max-w-[140px]">{step.title}</span>
                <span
                  className={`text-[10px] font-mono ${
                    isActive ? 'text-emerald-300' : 'text-[#5C6066]'
                  }`}
                >
                  ({stepFieldCount})
                </span>
              </button>

              {/* Always accessible on active page for touch devices, hover on desktop */}
              <div
                className={`flex items-center gap-0.5 ml-1 transition-opacity ${
                  isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleStartEdit(step)}
                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                    isActive
                      ? 'hover:bg-white/15 text-white/80 hover:text-white'
                      : 'hover:bg-black/10 text-[#5C6066]'
                  }`}
                  title="Rename page"
                  aria-label={`Rename ${step.title}`}
                >
                  <PencilSimple size={12} weight="light" />
                </button>

                {!isFirst && (
                  <button
                    type="button"
                    onClick={() => onReorderStep(step.stepNumber, 'left')}
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                      isActive
                        ? 'hover:bg-white/15 text-white/80 hover:text-white'
                        : 'hover:bg-black/10 text-[#5C6066]'
                    }`}
                    title="Move page left"
                    aria-label="Move page left"
                  >
                    <CaretLeft size={12} weight="light" />
                  </button>
                )}

                {!isLast && (
                  <button
                    type="button"
                    onClick={() => onReorderStep(step.stepNumber, 'right')}
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                      isActive
                        ? 'hover:bg-white/15 text-white/80 hover:text-white'
                        : 'hover:bg-black/10 text-[#5C6066]'
                    }`}
                    title="Move page right"
                    aria-label="Move page right"
                  >
                    <CaretRight size={12} weight="light" />
                  </button>
                )}

                {steps.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onDeleteStep(step.stepNumber)}
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                      isActive
                        ? 'hover:bg-rose-500/20 text-white/75 hover:text-rose-300'
                        : 'hover:bg-rose-50 text-[#5C6066] hover:text-rose-600'
                    }`}
                    title="Remove page (keeps questions)"
                    aria-label="Remove page"
                  >
                    <Trash size={12} weight="light" />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Add Page Button */}
        <button
          type="button"
          onClick={onAddStep}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] rounded-full border border-dashed border-black/20 hover:border-[#0B0D0F] bg-white hover:bg-[#F7F6F3] text-[#0B0D0F] font-semibold transition-colors shrink-0"
          title="Add a new page to your form"
        >
          <Plus size={14} weight="light" className="text-[#0F766E]" />
          <span>New Page</span>
        </button>
      </div>

      {/* Right: Show All Pages Toggle */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onToggleViewAll}
          className={`px-3.5 py-2 min-h-[38px] rounded-full text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
            viewAllSteps
              ? 'bg-[#0F766E] text-white'
              : 'bg-[#F7F6F3] text-[#0B0D0F] ring-1 ring-black/[0.06] hover:ring-black/20'
          }`}
        >
          <Eye size={14} weight="light" />
          <span className="hidden sm:inline">{viewAllSteps ? 'All Pages' : 'Show All'}</span>
        </button>
      </div>

      {/* Page Rename Modal */}
      {editingStep !== null && (
        <div
          className="fixed inset-0 z-50 bg-[#0B0D0F]/55 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setEditingStep(null)}
        >
          <div
            className="w-full max-w-sm p-1.5 rounded-[2rem] bg-white/25 ring-1 ring-white/30 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-[calc(2rem-6px)] bg-white p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
                <span className="font-display font-semibold text-[#0B0D0F] text-base">
                  Page {editingStep} Details
                </span>
                <button
                  onClick={() => setEditingStep(null)}
                  className="w-8 h-8 rounded-full bg-black/[0.04] hover:bg-black/[0.08] text-[#5C6066] flex items-center justify-center"
                >
                  <X size={15} weight="light" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="space-y-1.5">
                  <label className="font-semibold text-[#0B0D0F] block">Page Title</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="e.g. Contact Information"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F7F6F3] ring-1 ring-black/[0.08] focus:outline-none focus:ring-2 focus:ring-[#0B0D0F] focus:bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-[#0B0D0F] block">
                    Short Description (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="Optional guidance shown at the top of this page..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F7F6F3] ring-1 ring-black/[0.08] focus:outline-none focus:ring-2 focus:ring-[#0B0D0F] focus:bg-white resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingStep(null)}
                  className="px-4 py-2 rounded-full text-[#5C6066] hover:bg-[#F7F6F3] text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveEdit(editingStep)}
                  className="px-5 py-2 rounded-full bg-[#0B0D0F] text-[#F7F6F3] text-xs font-semibold hover:bg-[#191D21] transition-colors"
                >
                  Save Page
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
