import React from 'react';
import { X, ArrowUpRight, Eye, Sparkle } from '@phosphor-icons/react';
import { SAMPLE_FORMS } from '../../lib/sample-data';
import { FormSchema } from '../../types/form';
import FormDefault from '@/components/ui/form-template-demo';

interface TemplatePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: FormSchema) => void;
  onPreviewTemplate: (template: FormSchema) => void;
}

const BASE_UI_EMAIL_USER_TEMPLATE: FormSchema = {
  id: 'tmpl_base_ui_email_capture',
  title: 'Quick Email Capture (Base UI)',
  description:
    'Clean single-field email capture template powered by accessible @base-ui/react validation and instant submission feedback.',
  category: 'lead-gen',
  layoutMode: 'standard',
  theme: {
    primaryColor: '#0B0D0F',
    backgroundColor: '#F7F6F3',
    surfaceColor: '#FFFFFF',
    textColor: '#0B0D0F',
    borderRadius: 'lg',
    fontFamily: 'Plus Jakarta Sans',
    backgroundStyle: 'solid',
    inputStyle: 'bordered',
  },
  welcomeScreen: {
    enabled: false,
    title: 'Stay in the Loop',
    subtitle: 'Drop your email to receive updates.',
    buttonText: 'Continue',
  },
  thankYouScreen: {
    title: 'Email Captured',
    message: 'Thanks! We have received your email address.',
    showRestartButton: true,
  },
  fields: [
    {
      id: 'f_email_capture_1',
      type: 'email',
      label: 'Email',
      placeholder: 'you@example.com',
      helpText: 'Please enter a valid email.',
      required: true,
      step: 1,
    },
  ],
  logicRules: [],
  settings: {
    isPublished: true,
    slug: 'quick-email-capture',
    submitButtonText: 'Submit',
    allowMultipleSubmissions: true,
    isQuizMode: false,
    notifyOnSubmission: false,
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  responsesCount: 0,
};

export const TemplatePickerModal: React.FC<TemplatePickerModalProps> = ({
  isOpen,
  onClose,
  onSelectTemplate,
  onPreviewTemplate,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B0D0F]/60 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-5xl p-1.5 rounded-t-[2rem] sm:rounded-[2rem] bg-white/25 ring-1 ring-white/30 shadow-[0_32px_80px_-20px_rgba(11,13,15,0.45)] max-h-[92dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-t-[calc(2rem-6px)] sm:rounded-[calc(2rem-6px)] bg-[#F7F6F3] text-[#0B0D0F] overflow-hidden flex flex-col max-h-full">
          {/* Header */}
          <div className="px-5 sm:px-7 py-5 sm:py-6 bg-white border-b border-black/[0.06] flex items-center justify-between shrink-0">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#0F766E]">
                User Template Library
              </p>
              <h3 className="text-base sm:text-lg font-display font-semibold text-[#0B0D0F] mt-0.5">
                Pick a ready template or test the live Base UI starter
              </h3>
            </div>
            <button
              onClick={onClose}
              aria-label="Close templates"
              className="w-9 h-9 rounded-full bg-black/[0.04] hover:bg-black/[0.08] text-[#5C6066] hover:text-[#0B0D0F] flex items-center justify-center transition-colors shrink-0"
            >
              <X size={16} weight="light" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="p-5 sm:p-7 overflow-y-auto space-y-6">
            {/* Featured Interactive Base UI User Template */}
            <div className="bezel-outer">
              <div className="bezel-inner p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
                <div className="lg:col-span-6 space-y-3">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0F766E]/10 text-[#0F766E] font-mono text-[10px] uppercase tracking-wider font-semibold">
                    <Sparkle size={12} weight="fill" />
                    <span>Interactive User Template · Base UI</span>
                  </div>
                  <h4 className="font-display font-semibold text-lg sm:text-xl text-[#0B0D0F]">
                    {BASE_UI_EMAIL_USER_TEMPLATE.title}
                  </h4>
                  <p className="text-xs text-[#5C6066] leading-relaxed">
                    Try the live accessible <code className="font-mono text-[#0B0D0F]">@base-ui/react</code> form on the right with built-in email validation and loading state, then clone it straight into your workspace.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onSelectTemplate(BASE_UI_EMAIL_USER_TEMPLATE);
                      }}
                      className="min-h-[42px] px-5 py-2.5 bg-[#0B0D0F] hover:bg-[#191D21] text-[#F7F6F3] text-xs font-semibold rounded-full transition-all inline-flex items-center gap-1.5 active:scale-[0.98]"
                    >
                      <span>Use This Template</span>
                      <ArrowUpRight size={14} weight="light" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onPreviewTemplate(BASE_UI_EMAIL_USER_TEMPLATE)}
                      className="min-h-[42px] px-4 py-2.5 bg-[#F7F6F3] hover:bg-[#EFECE6] ring-1 ring-black/[0.06] text-[#0B0D0F] text-xs font-semibold rounded-full transition-colors inline-flex items-center gap-1.5"
                    >
                      <Eye size={14} weight="light" />
                      <span>Full Preview</span>
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-6">
                  <FormDefault compact />
                </div>
              </div>
            </div>

            {/* Standard Blueprint Templates Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {SAMPLE_FORMS.map((tmpl) => {
                const cover = tmpl.welcomeScreen.coverImage;

                return (
                  <div
                    key={tmpl.id}
                    className="bezel-outer flex flex-col group transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5"
                  >
                    <div className="bezel-inner flex-1 overflow-hidden flex flex-col justify-between">
                      <div>
                        {/* Image Frame */}
                        <div className="h-40 bg-[#13161A] overflow-hidden relative">
                          {cover ? (
                            <img
                              src={cover}
                              alt={tmpl.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.03]"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-[#0B0D0F] text-emerald-400 font-mono text-xs uppercase tracking-widest">
                              {tmpl.layoutMode}
                            </div>
                          )}
                        </div>

                        <div className="p-5 space-y-2.5">
                          <div className="flex items-center gap-2 font-mono text-[11px] text-[#5C6066] capitalize">
                            <span className="text-[#0F766E] font-medium">{tmpl.layoutMode}</span>
                            <span aria-hidden="true" className="text-black/20">·</span>
                            <span>{tmpl.fields.length} questions</span>
                            <span aria-hidden="true" className="text-black/20">·</span>
                            <span>{tmpl.category}</span>
                          </div>
                          <h4 className="font-display font-semibold text-base text-[#0B0D0F] leading-snug">
                            {tmpl.title}
                          </h4>
                          <p className="text-xs text-[#5C6066] line-clamp-2 leading-relaxed">
                            {tmpl.description}
                          </p>
                        </div>
                      </div>

                      <div className="px-5 pb-5 pt-2 flex items-center gap-2">
                        <button
                          onClick={() => onPreviewTemplate(tmpl)}
                          className="w-9 h-9 rounded-full bg-[#F7F6F3] hover:bg-[#EFECE6] ring-1 ring-black/[0.06] text-[#0B0D0F] flex items-center justify-center transition-colors shrink-0"
                          title="Live Test Preview"
                          aria-label={`Preview ${tmpl.title}`}
                        >
                          <Eye size={16} weight="light" />
                        </button>
                        <button
                          onClick={() => {
                            onClose();
                            onSelectTemplate(tmpl);
                          }}
                          className="flex-1 py-2.5 px-4 bg-[#0B0D0F] hover:bg-[#191D21] text-[#F7F6F3] text-xs font-semibold rounded-full transition-all duration-300 flex items-center justify-center gap-1.5 active:scale-[0.98]"
                        >
                          <span>Use Blueprint</span>
                          <ArrowUpRight size={14} weight="light" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
