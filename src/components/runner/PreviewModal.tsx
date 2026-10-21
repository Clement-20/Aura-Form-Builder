import React, { useState } from 'react';
import { FormSchema, FormLayoutMode } from '../../types/form';
import { FormRunner } from './FormRunner';
import { Monitor, Tablet, Smartphone, X, Layers, MessageSquare, ListOrdered } from 'lucide-react';

interface PreviewModalProps {
  form: FormSchema;
  isOpen: boolean;
  onClose: () => void;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({ form, isOpen, onClose }) => {
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [layoutOverride, setLayoutOverride] = useState<FormLayoutMode>(form.layoutMode);

  if (!isOpen) return null;

  const previewForm: FormSchema = {
    ...form,
    layoutMode: layoutOverride,
  };

  const deviceWidthClass = {
    desktop: 'w-full max-w-5xl h-[85vh]',
    tablet: 'w-[768px] h-[85vh]',
    mobile: 'w-[375px] h-[85vh]',
  }[device];

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/80 backdrop-blur-xs flex flex-col items-center justify-center p-4">
      {/* Top Controller Bar */}
      <div className="w-full max-w-5xl mb-3 flex items-center justify-between gap-4 text-white">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
            Interactive Test Runner
          </span>
          <span aria-hidden="true" className="text-neutral-600">·</span>
          <span className="text-xs text-neutral-400 truncate max-w-xs">{form.title}</span>
        </div>

        {/* Device Switcher */}
        <div className="flex items-center gap-1 bg-neutral-800 p-1 rounded-lg border border-neutral-700">
          <button
            onClick={() => setDevice('desktop')}
            className={`p-1.5 rounded text-xs transition-colors ${
              device === 'desktop' ? 'bg-neutral-700 text-white shadow-xs' : 'text-neutral-400 hover:text-white'
            }`}
            title="Desktop View (100%)"
          >
            <Monitor className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDevice('tablet')}
            className={`p-1.5 rounded text-xs transition-colors ${
              device === 'tablet' ? 'bg-neutral-700 text-white shadow-xs' : 'text-neutral-400 hover:text-white'
            }`}
            title="Tablet View (768px)"
          >
            <Tablet className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDevice('mobile')}
            className={`p-1.5 rounded text-xs transition-colors ${
              device === 'mobile' ? 'bg-neutral-700 text-white shadow-xs' : 'text-neutral-400 hover:text-white'
            }`}
            title="Mobile View (375px)"
          >
            <Smartphone className="w-4 h-4" />
          </button>
        </div>

        {/* Layout Mode Override Toggles */}
        <div className="hidden sm:flex items-center gap-1 bg-neutral-800 p-1 rounded-lg border border-neutral-700 text-xs">
          <button
            onClick={() => setLayoutOverride('conversational')}
            className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${
              layoutOverride === 'conversational' ? 'bg-neutral-700 text-white font-medium' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Conversational</span>
          </button>
          <button
            onClick={() => setLayoutOverride('stepped')}
            className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${
              layoutOverride === 'stepped' ? 'bg-neutral-700 text-white font-medium' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5" />
            <span>Stepped</span>
          </button>
          <button
            onClick={() => setLayoutOverride('standard')}
            className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${
              layoutOverride === 'standard' ? 'bg-neutral-700 text-white font-medium' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Classic</span>
          </button>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
          title="Exit Preview"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Device Viewport Canvas */}
      <div
        className={`bg-white rounded-2xl shadow-2xl overflow-y-auto border border-neutral-700/50 transition-all duration-300 flex flex-col ${deviceWidthClass}`}
      >
        <FormRunner form={previewForm} isInteractivePreview={true} />
      </div>
    </div>
  );
};
