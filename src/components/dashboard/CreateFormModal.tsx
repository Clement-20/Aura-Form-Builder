import React from 'react';
import { Plus, Sparkle, Layout, X, ArrowUpRight } from '@phosphor-icons/react';

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
    <div
      className="fixed inset-0 z-50 bg-[#0B0D0F]/55 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg p-1.5 rounded-[2rem] bg-white/25 ring-1 ring-white/30 shadow-[0_32px_80px_-20px_rgba(11,13,15,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-[calc(2rem-6px)] bg-[#F7F6F3] text-[#0B0D0F] overflow-hidden">
          {/* Header */}
          <div className="px-7 py-6 bg-white border-b border-black/[0.06] flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#0F766E]">
                New Schema
              </p>
              <h3 className="text-lg font-display font-semibold text-[#0B0D0F] mt-0.5">
                Choose a starting point
              </h3>
            </div>
            <button
              onClick={onClose}
              aria-label="Close modal"
              className="w-9 h-9 rounded-full bg-black/[0.04] hover:bg-black/[0.08] text-[#5C6066] hover:text-[#0B0D0F] flex items-center justify-center transition-colors"
            >
              <X size={16} weight="light" />
            </button>
          </div>

          {/* Options */}
          <div className="p-6 space-y-3">
            {/* Option 1: AI Form Architect */}
            <button
              onClick={() => {
                onClose();
                onOpenAI();
              }}
              className="w-full p-5 rounded-2xl bg-white ring-1 ring-black/[0.07] hover:ring-[#0B0D0F] text-left transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 group flex items-start gap-4"
            >
              <div className="w-11 h-11 rounded-2xl bg-[#0B0D0F] text-emerald-400 flex items-center justify-center shrink-0 transition-transform duration-500 group-hover:scale-105">
                <Sparkle size={20} weight="light" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-display font-semibold text-[#0B0D0F]">
                    AI Form Architect
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#0F766E]">
                    Fastest
                  </span>
                </div>
                <p className="text-xs text-[#5C6066] mt-1 leading-relaxed">
                  Describe your goal in plain English to generate typed fields, validation, and theme tokens automatically.
                </p>
              </div>
              <ArrowUpRight
                size={16}
                weight="light"
                className="text-[#7B8088] group-hover:text-[#0B0D0F] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0 mt-1"
              />
            </button>

            {/* Option 2: Blueprints */}
            <button
              onClick={() => {
                onClose();
                onBrowseTemplates();
              }}
              className="w-full p-5 rounded-2xl bg-white ring-1 ring-black/[0.07] hover:ring-[#0B0D0F] text-left transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 group flex items-start gap-4"
            >
              <div className="w-11 h-11 rounded-2xl bg-[#F7F6F3] ring-1 ring-black/[0.06] text-[#0F766E] flex items-center justify-center shrink-0 transition-transform duration-500 group-hover:scale-105">
                <Layout size={20} weight="light" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-display font-semibold text-[#0B0D0F] block">
                  Start from Blueprint
                </span>
                <p className="text-xs text-[#5C6066] mt-1 leading-relaxed">
                  Clone a structured registration flow, NPS survey, or scored quiz into your workspace.
                </p>
              </div>
              <ArrowUpRight
                size={16}
                weight="light"
                className="text-[#7B8088] group-hover:text-[#0B0D0F] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0 mt-1"
              />
            </button>

            {/* Option 3: Blank Canvas */}
            <button
              onClick={() => {
                onClose();
                onCreateBlank();
              }}
              className="w-full p-5 rounded-2xl bg-white ring-1 ring-black/[0.07] hover:ring-[#0B0D0F] text-left transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 group flex items-start gap-4"
            >
              <div className="w-11 h-11 rounded-2xl bg-[#F7F6F3] ring-1 ring-black/[0.06] text-[#0B0D0F] flex items-center justify-center shrink-0 transition-transform duration-500 group-hover:scale-105">
                <Plus size={20} weight="light" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-display font-semibold text-[#0B0D0F] block">
                  Blank Schema Canvas
                </span>
                <p className="text-xs text-[#5C6066] mt-1 leading-relaxed">
                  Begin from scratch and assemble custom fields, steps, logic rules, and motion timing.
                </p>
              </div>
              <ArrowUpRight
                size={16}
                weight="light"
                className="text-[#7B8088] group-hover:text-[#0B0D0F] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0 mt-1"
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
