import React, { useState } from 'react';
import { FormSchema, FormLayoutMode } from '../../types/form';
import { Sparkles, X, ArrowRight, Check } from 'lucide-react';
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
            primaryColor: '#18181b',
            backgroundColor: '#fafafa',
            surfaceColor: '#ffffff',
            textColor: '#09090b',
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
    <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden text-neutral-800 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900">AI Form Architect</h3>
              <p className="text-[11px] text-neutral-500">
                Powered by Gemini 3.8 Flash & AuraForm procedural schema engine
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-neutral-800">
              Describe the form, survey, or quiz you want to create:
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. A 5-question candidate screening quiz for a React developer position with multiple choice options and scoring..."
              className="w-full p-3 text-xs border rounded-xl border-neutral-200 focus:outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
              disabled={loading}
            />
          </div>

          {/* Experience Format Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-neutral-800">
              Experience Flow Format:
            </label>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {(
                [
                  { id: 'conversational', label: 'Conversational', desc: '1 question at a time' },
                  { id: 'stepped', label: 'Stepped Wizard', desc: 'Multi-page progression' },
                  { id: 'standard', label: 'Classic Single Page', desc: 'All fields visible' },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setLayoutMode(mode.id)}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    layoutMode === mode.id
                      ? 'border-neutral-900 bg-neutral-900/5 font-semibold text-neutral-900'
                      : 'border-neutral-200 hover:border-neutral-300 text-neutral-600'
                  }`}
                >
                  <span className="block text-xs">{mode.label}</span>
                  <span className="text-[10px] text-neutral-400 mt-0.5 block">{mode.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Inspiration Chips */}
          <div className="space-y-2 pt-1">
            <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block">
              Quick Inspiration
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {INSPIRATION_PROMPTS.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setPrompt(item.prompt);
                    setLayoutMode(item.layout as FormLayoutMode);
                    handleGenerate(item.prompt, item.layout as FormLayoutMode);
                  }}
                  className="p-2.5 rounded-lg border border-neutral-200/80 hover:border-neutral-400 text-left transition-all bg-neutral-50 hover:bg-white group"
                >
                  <p className="font-semibold text-neutral-800 group-hover:text-neutral-900">
                    {item.title}
                  </p>
                  <p className="text-[11px] text-neutral-500 truncate mt-0.5">{item.prompt}</p>
                </button>
              ))}
            </div>
          </div>

          {errorMsg && (
            <p className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-100">
              {errorMsg}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-neutral-50 border-t border-neutral-100 flex items-center justify-between">
          <span className="text-[11px] text-neutral-400">
            Generates fields, design tokens & validation
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900"
            >
              Cancel
            </button>
            <button
              onClick={() => handleGenerate()}
              disabled={loading || !prompt.trim()}
              className="px-4 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 rounded-lg transition-colors flex items-center gap-2 shadow-xs"
            >
              {loading ? (
                <>
                  <AuraLogo className="w-5 h-5" size={20} animate={true} />
                  <span>Synthesizing Form...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Generate Form</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
