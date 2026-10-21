import React from 'react';
import { Plus, Sparkles, LayoutTemplate, X, ArrowRight } from 'lucide-react';

interface CreateFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateBlank: () => void;
  onOpenAI: () => void;
  onBrowseTemplates: () => void;
}

export const CreateFormModal: React.FC<CreateFormModalProps> = ({
  isOpen,
  onClose,
  onCreateBlank,
  onOpenAI,
  onBrowseTemplates,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden text-neutral-800 animate-in fade-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-neutral-900">Create New Experience Form</h3>
            <p className="text-xs text-neutral-500 mt-0.5">Select how you want to begin designing</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-3">
          {/* Option 1: AI Prompt Architect */}
          <button
            onClick={() => {
              onClose();
              onOpenAI();
            }}
            className="w-full p-4 rounded-xl border border-neutral-200/90 hover:border-neutral-900 hover:bg-neutral-50/50 text-left transition-all group flex items-start gap-4"
          >
            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-neutral-900">
                  AI Form Architect
                </span>
                <span className="text-[11px] font-semibold text-indigo-700">Recommended</span>
              </div>
              <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                Describe the goal of your form in plain English. Gemini 3.8 Flash creates questions, themes, and logic instantly.
              </p>
            </div>
          </button>

          {/* Option 2: Curated Templates */}
          <button
            onClick={() => {
              onClose();
              onBrowseTemplates();
            }}
            className="w-full p-4 rounded-xl border border-neutral-200/90 hover:border-neutral-900 hover:bg-neutral-50/50 text-left transition-all group flex items-start gap-4"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <LayoutTemplate className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <span className="text-sm font-bold text-neutral-900">
                Start from Curated Template
              </span>
              <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                Choose from tested registration forms, conversational NPS reviews, or scored knowledge quizzes.
              </p>
            </div>
          </button>

          {/* Option 3: Blank Canvas */}
          <button
            onClick={() => {
              onClose();
              onCreateBlank();
            }}
            className="w-full p-4 rounded-xl border border-neutral-200/90 hover:border-neutral-900 hover:bg-neutral-50/50 text-left transition-all group flex items-start gap-4"
          >
            <div className="w-10 h-10 rounded-lg bg-neutral-100 text-neutral-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Plus className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <span className="text-sm font-bold text-neutral-900">
                Blank Form Canvas
              </span>
              <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                Start with a clean slate and add your custom questions, steps, and styling from scratch.
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
