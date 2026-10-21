import React from 'react';
import { SAMPLE_FORMS } from '../../lib/sample-data';
import { FormSchema } from '../../types/form';
import { X, ArrowRight, Eye, Sparkles, MessageSquare, ListOrdered, Award } from 'lucide-react';

interface TemplatePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: FormSchema) => void;
  onPreviewTemplate: (template: FormSchema) => void;
}

export const TemplatePickerModal: React.FC<TemplatePickerModalProps> = ({
  isOpen,
  onClose,
  onSelectTemplate,
  onPreviewTemplate,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden text-neutral-800 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-neutral-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-bold text-neutral-900">Curated Template Library</h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Production-grade form experiences ready for instant cloning and custom branding
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Templates Grid */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {SAMPLE_FORMS.map((tmpl) => {
            const cover = tmpl.welcomeScreen.coverImage;

            return (
              <div
                key={tmpl.id}
                className="rounded-xl border border-neutral-200/90 overflow-hidden hover:border-neutral-900/50 transition-all flex flex-col justify-between group bg-white shadow-xs"
              >
                <div>
                  {/* Thumbnail Banner */}
                  <div className="h-36 bg-neutral-100 border-b border-neutral-200 relative overflow-hidden">
                    {cover ? (
                      <img
                        src={cover}
                        alt={tmpl.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-neutral-900 text-white font-mono text-xs">
                        {tmpl.layoutMode.toUpperCase()}
                      </div>
                    )}
                    <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-white/90 text-neutral-900 backdrop-blur-xs capitalize">
                      {tmpl.layoutMode}
                    </span>
                  </div>

                  <div className="p-4 space-y-2">
                    <h4 className="font-bold text-sm text-neutral-900 leading-snug">
                      {tmpl.title}
                    </h4>
                    <p className="text-xs text-neutral-500 line-clamp-2 leading-relaxed">
                      {tmpl.description}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-neutral-400 pt-1">
                      <span>{tmpl.fields.length} questions</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">{tmpl.category}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 pt-0 flex items-center gap-2">
                  <button
                    onClick={() => onPreviewTemplate(tmpl)}
                    className="p-2 border border-neutral-200 hover:bg-neutral-50 rounded-lg text-neutral-700 transition-colors"
                    title="Live Test Preview"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      onSelectTemplate(tmpl);
                    }}
                    className="flex-1 py-2 px-3 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <span>Use Template</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
