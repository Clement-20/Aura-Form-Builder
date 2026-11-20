import React, { useState } from 'react';
import { Sparkle, X, ArrowUpRight } from '@phosphor-icons/react';
import { FormSchema, FormLayoutMode } from '../../types/form';
import { AuraLogo } from '../common/AuraLogo';

interface AIGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFormGenerated: (form: FormSchema) => void;
}

const INSPIRATION_PROMPTS = [
  {
    title: 'Executive Summit Pass',
    prompt: 'A VIP Tech Summit registration form with pass tiers, breakout sessions selection, and dinner RSVP.',
    layout: 'stepped',
  },
  {
    title: 'Customer NPS Review',
    prompt: 'A sleek customer satisfaction survey measuring NPS score 0-10, feature rating, and candid feedback.',
    layout: 'conversational',
  },
  {
    title: 'Web Engineering Quiz',
    prompt: 'A 4-question graded web standards quiz with scoring, correct answer grading, and explanations.',
    layout: 'conversational',
  },
  {
    title: 'Venture Pitch Application',
    prompt: 'A founder pitch application requesting company name, deck URL, current ARR, and funding stage.',
    layout: 'standard',
  },
];

export const AIGeneratorModal: React.FC<AIGeneratorModalProps> = ({
  isOpen,
  onClose,
  onFormGenerated,
}) => {
  const [prompt, setPrompt] = useState('');
  const [layoutMode, setLayoutMode] = useState<FormLayoutMode>('conversational');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async (selectedPrompt?: string, selectedLayout?: FormLayoutMode) => {
    const textToUse = selectedPrompt || prompt;
    const layoutToUse = selectedLayout || layoutMode;

    if (!textToUse.trim()) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/ai/generate-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: textToUse, formType: layoutToUse }),
      });

      const data = await response.json();

      if (data.success && data.form) {
        const generatedForm: FormSchema = {
          id: 'form_' + Math.random().toString(36).substring(2, 9),
          title: data.form.title || 'AI Generated Form',
          description: data.form.description || 'Created with AuraForm AI Architect',
          category: data.form.category || 'survey',
          layoutMode: layoutToUse,
          theme: data.form.theme || {
            primaryColor: '#0B0D0F',
            backgroundColor: '#F7F6F3',
            surfaceColor: '#FFFFFF',
            textColor: '#0B0D0F',
            borderRadius: 'lg',
            fontFamily: 'Plus Jakarta Sans',
            backgroundStyle: 'solid',
            inputStyle: 'bordered',
          },
          welcomeScreen: data.form.welcomeScreen || {
            enabled: true,
            title: data.form.title || 'Welcome',
            subtitle: data.form.description || 'Please complete this form.',
            buttonText: 'Get Started',
          },
          thankYouScreen: data.form.thankYouScreen || {
            title: 'Thank You',
            message: 'Your response has been saved.',
            showRestartButton: true,
          },
          fields: data.form.fields || [],
          logicRules: data.form.logicRules || [],
          settings: {
            isPublished: false,
            slug: (data.form.title || 'new-form')
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '-')
              .slice(0, 32),
            submitButtonText: 'Submit Form',
            allowMultipleSubmissions: true,
            isQuizMode: data.form.category === 'quiz',
            notifyOnSubmission: false,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          responsesCount: 0,
        };

        onFormGenerated(generatedForm);
        onClose();
      } else {
        setErrorMsg(data.error || 'Failed to generate form schema.');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Network error communicating with AI server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B0D0F]/60 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl p-1.5 rounded-[2rem] bg-white/25 ring-1 ring-white/30 shadow-[0_32px_80px_-20px_rgba(11,13,15,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-[calc(2rem-6px)] bg-[#F7F6F3] text-[#0B0D0F] overflow-hidden">
          {/* Header */}
          <div className="px-7 py-5 bg-white border-b border-black/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-[#0B0D0F] text-emerald-400 flex items-center justify-center">
                <Sparkle size={18} weight="light" />
              </div>
              <div>
                <h3 className="text-base font-display font-semibold text-[#0B0D0F]">
                  AI Form Architect
                </h3>
                <p className="text-[11px] font-mono text-[#5C6066]">
                  Synthesizes typed FormSchema JSON &amp; validation
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              aria-label="Close AI Architect"
              className="w-9 h-9 rounded-full bg-black/[0.04] hover:bg-black/[0.08] text-[#5C6066] hover:text-[#0B0D0F] flex items-center justify-center transition-colors"
            >
              <X size={16} weight="light" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 sm:p-7 space-y-5">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#0B0D0F]">
                Describe the form, survey, or quiz you want to build
              </label>
              <textarea
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. A 5-question candidate screening quiz for a React engineer with multiple choice scoring..."
                className="w-full p-4 text-xs rounded-2xl bg-white ring-1 ring-black/[0.08] focus:outline-none focus:ring-2 focus:ring-[#0B0D0F] transition-shadow resize-none"
                disabled={loading}
              />
            </div>

            {/* Layout Mode */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#0B0D0F]">
                Renderer Mode
              </label>
              <div className="grid grid-cols-3 gap-2.5 text-xs">
                {(
                  [
                    { id: 'conversational', label: 'Conversational', desc: 'One question at a time' },
                    { id: 'stepped', label: 'Stepped', desc: 'Multi-page sections' },
                    { id: 'standard', label: 'Classic', desc: 'All fields on one page' },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setLayoutMode(mode.id)}
                    className={`p-3 rounded-2xl text-left transition-all duration-300 ${
                      layoutMode === mode.id
                        ? 'bg-[#0B0D0F] text-[#F7F6F3] ring-1 ring-[#0B0D0F]'
                        : 'bg-white text-[#0B0D0F] ring-1 ring-black/[0.07] hover:ring-black/25'
                    }`}
                  >
                    <span className="block font-semibold text-xs">{mode.label}</span>
                    <span
                      className={`text-[10px] mt-0.5 block ${
                        layoutMode === mode.id ? 'text-[#A2A8B0]' : 'text-[#5C6066]'
                      }`}
                    >
                      {mode.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Inspiration Prompts */}
            <div className="space-y-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#5C6066] block">
                Quick Prompts
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                {INSPIRATION_PROMPTS.map((item, idx) => (
                  <button
                    key={idx}
                    disabled={loading}
                    onClick={() => {
                      setPrompt(item.prompt);
                      setLayoutMode(item.layout as FormLayoutMode);
                      handleGenerate(item.prompt, item.layout as FormLayoutMode);
                    }}
                    className="p-3 rounded-2xl bg-white ring-1 ring-black/[0.06] hover:ring-[#0B0D0F] text-left transition-all duration-300 group disabled:opacity-50"
                  >
                    <p className="font-semibold text-[#0B0D0F] group-hover:text-[#0F766E] transition-colors">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-[#5C6066] truncate mt-0.5">{item.prompt}</p>
                  </button>
                ))}
              </div>
            </div>

            {errorMsg && (
              <p className="text-xs text-rose-700 bg-rose-50 p-3 rounded-xl ring-1 ring-rose-200">
                {errorMsg}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="px-7 py-4 bg-white border-t border-black/[0.06] flex items-center justify-between gap-4">
            <span className="text-[11px] font-mono text-[#5C6066]">
              Fields · Tokens · Validation
            </span>

            <div className="flex items-center gap-2.5">
              <button
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-xs font-medium text-[#5C6066] hover:text-[#0B0D0F] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleGenerate()}
                disabled={loading || !prompt.trim()}
                className="group inline-flex items-center gap-2.5 pl-5 pr-2 py-2 text-xs font-semibold text-[#F7F6F3] bg-[#0B0D0F] hover:bg-[#191D21] disabled:opacity-40 rounded-full transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
              >
                {loading ? (
                  <>
                    <AuraLogo className="w-6 h-6" size={24} animate={true} tone="light" />
                    <span className="pr-3">Synthesizing...</span>
                  </>
                ) : (
                  <>
                    <span>Generate Schema</span>
                    <span className="w-7 h-7 rounded-full bg-white/[0.14] flex items-center justify-center transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                      <ArrowUpRight size={14} weight="light" />
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
