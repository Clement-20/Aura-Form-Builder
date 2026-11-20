import React, { useState, useEffect } from 'react';
import {
  Desktop,
  DeviceTablet,
  DeviceMobile,
  X,
  Stack,
  ChatText,
  ListNumbers,
} from '@phosphor-icons/react';
import { FormSchema, FormLayoutMode } from '../../types/form';
import { FormRunner } from './FormRunner';

interface PreviewModalProps {
  form: FormSchema;
  isOpen: boolean;
  onClose: () => void;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({ form, isOpen, onClose }) => {
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [layoutOverride, setLayoutOverride] = useState<FormLayoutMode>(form.layoutMode);

  useEffect(() => {
    setLayoutOverride(form.layoutMode);
  }, [form.id, form.layoutMode]);

  if (!isOpen) return null;

  const previewForm: FormSchema = {
    ...form,
    layoutMode: layoutOverride,
  };

  const deviceWidthClass = {
    desktop: 'w-full max-w-5xl h-[84vh]',
    tablet: 'w-full max-w-[768px] h-[84vh]',
    mobile: 'w-full max-w-[390px] h-[84vh]',
  }[device];

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B0D0F]/85 backdrop-blur-xl flex flex-col items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Top Floating Controller Pill */}
      <div
        className="w-full max-w-5xl mb-4 flex flex-wrap items-center justify-between gap-3 text-[#F7F6F3]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#E6E8EB]">
            Shared Runner Preview
          </span>
          <span aria-hidden="true" className="text-white/25">·</span>
          <span className="text-xs text-[#8F969E] truncate max-w-[200px] sm:max-w-xs">
            {form.title}
          </span>
        </div>

        {/* Device Width Switcher */}
        <div className="flex items-center gap-1 p-1 rounded-full bg-white/[0.07] ring-1 ring-white/[0.10]">
          <button
            onClick={() => setDevice('desktop')}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              device === 'desktop'
                ? 'bg-[#F7F6F3] text-[#0B0D0F]'
                : 'text-[#8F969E] hover:text-white'
            }`}
            title="Desktop View"
            aria-label="Desktop View"
          >
            <Desktop size={16} weight="light" />
          </button>
          <button
            onClick={() => setDevice('tablet')}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              device === 'tablet'
                ? 'bg-[#F7F6F3] text-[#0B0D0F]'
                : 'text-[#8F969E] hover:text-white'
            }`}
            title="Tablet View (768px)"
            aria-label="Tablet View"
          >
            <DeviceTablet size={16} weight="light" />
          </button>
          <button
            onClick={() => setDevice('mobile')}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              device === 'mobile'
                ? 'bg-[#F7F6F3] text-[#0B0D0F]'
                : 'text-[#8F969E] hover:text-white'
            }`}
            title="Mobile View (390px)"
            aria-label="Mobile View"
          >
            <DeviceMobile size={16} weight="light" />
          </button>
        </div>

        {/* Layout Mode Override */}
        <div className="hidden md:flex items-center gap-1 p-1 rounded-full bg-white/[0.07] ring-1 ring-white/[0.10] text-xs">
          <button
            onClick={() => setLayoutOverride('conversational')}
            className={`px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 ${
              layoutOverride === 'conversational'
                ? 'bg-[#F7F6F3] text-[#0B0D0F] font-semibold'
                : 'text-[#A2A8B0] hover:text-white'
            }`}
          >
            <ChatText size={14} weight="light" />
            <span>Conversational</span>
          </button>
          <button
            onClick={() => setLayoutOverride('stepped')}
            className={`px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 ${
              layoutOverride === 'stepped'
                ? 'bg-[#F7F6F3] text-[#0B0D0F] font-semibold'
                : 'text-[#A2A8B0] hover:text-white'
            }`}
          >
            <ListNumbers size={14} weight="light" />
            <span>Stepped</span>
          </button>
          <button
            onClick={() => setLayoutOverride('standard')}
            className={`px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 ${
              layoutOverride === 'standard'
                ? 'bg-[#F7F6F3] text-[#0B0D0F] font-semibold'
                : 'text-[#A2A8B0] hover:text-white'
            }`}
          >
            <Stack size={14} weight="light" />
            <span>Classic</span>
          </button>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/[0.08] hover:bg-white/[0.16] text-[#E6E8EB] flex items-center justify-center transition-colors"
          title="Exit Preview"
          aria-label="Exit Preview"
        >
          <X size={17} weight="light" />
        </button>
      </div>

      {/* Double-Bezel Machined Viewport Canvas */}
      <div
        className={`p-1.5 rounded-[2rem] bg-white/[0.09] ring-1 ring-white/[0.14] shadow-[0_36px_90px_-20px_rgba(0,0,0,0.7)] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] flex flex-col ${deviceWidthClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 bg-white rounded-[calc(2rem-6px)] overflow-y-auto overflow-x-hidden flex flex-col">
          <FormRunner
            form={previewForm}
            isInteractivePreview={true}
            viewportOverride={device}
          />
        </div>
      </div>
    </div>
  );
};
