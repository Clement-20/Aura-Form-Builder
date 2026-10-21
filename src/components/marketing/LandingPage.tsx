import React, { useState } from 'react';
import { FormSchema } from '../../types/form';
import { SAMPLE_FORMS } from '../../lib/sample-data';
import { FormRunner } from '../runner/FormRunner';
import { PricingSection } from './PricingSection';
import {
  Sparkles,
  ArrowRight,
  MessageSquare,
  ListOrdered,
  Layers,
  Palette,
  GitBranch,
  BarChart3,
  Check,
  Zap,
  Globe,
  Sliders,
} from 'lucide-react';

interface LandingPageProps {
  onOpenCreate: () => void;
  onOpenAI: () => void;
  onBrowseTemplates: () => void;
  onSelectForm: (id: string) => void;
  onPreviewForm: (form: FormSchema) => void;
  onNavigate: (view: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenCreate,
  onOpenAI,
  onBrowseTemplates,
  onSelectForm,
  onPreviewForm,
  onNavigate,
}) => {
  // Demo interactive form inside hero
  const [activeHeroDemoId, setActiveHeroDemoId] = useState<string>('form_product_feedback');

  const activeDemoForm =
    SAMPLE_FORMS.find((f) => f.id === activeHeroDemoId) || SAMPLE_FORMS[1];

  return (
    <div className="bg-white text-neutral-900">
      {/* 1. HERO SECTION */}
      <section className="relative overflow-hidden pt-12 pb-20 border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Headline & Pitch */}
            <div className="lg:col-span-6 space-y-6">
              <div className="flex items-center gap-2 text-xs font-semibold text-neutral-600">
                <span className="w-2 h-2 rounded-full bg-neutral-900" />
                <span className="uppercase tracking-wider">AuraForm Experience Architecture</span>
                <span aria-hidden="true">·</span>
                <span>Version 2.4</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-neutral-900 text-balance leading-[1.08]">
                Every form is a designed experience.
              </h1>

              <p className="text-base sm:text-lg text-neutral-600 leading-relaxed max-w-xl text-pretty">
                Combine the conversational flow of modern questionnaire runners with the visual precision of an enterprise design editor. Build surveys, quizzes, registration flows, and multi-step applications in minutes.
              </p>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  onClick={onOpenCreate}
                  className="px-6 py-3.5 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 text-sm"
                >
                  <span>Build Experience Form</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  onClick={onOpenAI}
                  className="px-5 py-3.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>Generate with AI</span>
                </button>
              </div>

              {/* Editorial Trust Markers (No badges/pills) */}
              <div className="pt-6 border-t border-neutral-100 flex items-center gap-6 text-xs text-neutral-500">
                <span>Conversational One-by-One</span>
                <span aria-hidden="true">·</span>
                <span>Stepped Multi-Page</span>
                <span aria-hidden="true">·</span>
                <span>Instant Score Quizzes</span>
              </div>
            </div>

            {/* Right: LIVE INTERACTIVE EMBEDDED DEMO RUNNER */}
            <div className="lg:col-span-6">
              <div className="bg-neutral-100/70 p-3 sm:p-4 rounded-2xl border border-neutral-300 shadow-xl">
                {/* Demo Switcher Tabs */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-1.5 text-xs text-neutral-600">
                    <span className="font-semibold text-neutral-900">Live Interactive Demo</span>
                    <span className="hidden sm:inline text-neutral-400">· Click below to test</span>
                  </div>

                  <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-neutral-200 text-xs font-medium">
                    <button
                      onClick={() => setActiveHeroDemoId('form_product_feedback')}
                      className={`px-2.5 py-1 rounded transition-colors ${
                        activeHeroDemoId === 'form_product_feedback'
                          ? 'bg-neutral-900 text-white'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      Conversational
                    </button>
                    <button
                      onClick={() => setActiveHeroDemoId('form_summit_2026')}
                      className={`px-2.5 py-1 rounded transition-colors ${
                        activeHeroDemoId === 'form_summit_2026'
                          ? 'bg-neutral-900 text-white'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      Stepped
                    </button>
                    <button
                      onClick={() => setActiveHeroDemoId('form_web_standards_quiz')}
                      className={`px-2.5 py-1 rounded transition-colors ${
                        activeHeroDemoId === 'form_web_standards_quiz'
                          ? 'bg-neutral-900 text-white'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      Quiz
                    </button>
                  </div>
                </div>

                {/* Embedded Runner Window */}
                <div className="bg-white rounded-xl shadow-xs overflow-hidden border border-neutral-200/80 min-h-[440px]">
                  <FormRunner
                    key={activeDemoForm.id}
                    form={activeDemoForm}
                    isInteractivePreview={true}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. QUANTITATIVE PROOF & ADJACENCY METRICS */}
      <section className="py-12 bg-neutral-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center sm:text-left">
            <div>
              <p className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-white">
                3.4×
              </p>
              <p className="text-xs text-neutral-400 mt-1 font-medium">
                Higher Completion vs Traditional Forms
              </p>
            </div>
            <div>
              <p className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-white">
                48s
              </p>
              <p className="text-xs text-neutral-400 mt-1 font-medium">
                Average Completion Time with Shortcuts
              </p>
            </div>
            <div>
              <p className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-white">
                100%
              </p>
              <p className="text-xs text-neutral-400 mt-1 font-medium">
                WCAG AA Accessible & Keyboard Driven
              </p>
            </div>
            <div>
              <p className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-white">
                0 Code
              </p>
              <p className="text-xs text-neutral-400 mt-1 font-medium">
                Visual Tokens, Webhooks & Logic Builder
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. CAPABILITIES SHOWCASE */}
      <section id="capabilities" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          <div className="max-w-2xl">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider block">
              Core Capabilities
            </span>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-neutral-900 mt-2">
              Engineered for seamless respondents and precision creators.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="p-6 rounded-2xl border border-neutral-200/90 bg-neutral-50/50 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center">
                <MessageSquare className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-neutral-900">
                Conversational One-by-One
              </h3>
              <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
                Respondents focus on exactly one question at a time. Keyboard navigation with Enter and letter keys (A, B, C) guides them to completion without cognitive fatigue.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-6 rounded-2xl border border-neutral-200/90 bg-neutral-50/50 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center">
                <Palette className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-neutral-900">
                Design Token Studio
              </h3>
              <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
                Control typography pairings, corner radii, surface colors, and background textures. Maintain strict WCAG contrast automatically across light and dark tones.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-6 rounded-2xl border border-neutral-200/90 bg-neutral-50/50 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center">
                <GitBranch className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-neutral-900">
                Branching Conditional Logic
              </h3>
              <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
                Show or hide questions dynamically based on earlier responses. Create personalized flows that only ask for information relevant to the specific user.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-6 rounded-2xl border border-neutral-200/90 bg-neutral-50/50 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-indigo-400" />
              </div>
              <h3 className="text-lg font-bold text-neutral-900">
                Gemini 3.8 Flash Architect
              </h3>
              <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
                Turn a single conversational sentence into an entire multi-question form schema with validation, options, and themed layouts in under 3 seconds.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="p-6 rounded-2xl border border-neutral-200/90 bg-neutral-50/50 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-neutral-900">
                Drop-Off Analytics & Export
              </h3>
              <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
                Diagnose exact drop-off rates question by question. Download raw response records to CSV and JSON or stream submissions in real-time via webhooks.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="p-6 rounded-2xl border border-neutral-200/90 bg-neutral-50/50 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center">
                <Globe className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-neutral-900">
                Instant QR Codes & iFrames
              </h3>
              <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
                Generate high-resolution SVG QR codes for live stage presentations or embed responsive iframe snippets cleanly into React, Webflow, and HTML pages.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. TEMPLATES SHOWCASE SECTION */}
      <section id="templates" className="py-20 bg-neutral-50/70 border-t border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider block">
                Template Gallery
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 mt-1">
                Start from tested, high-converting templates.
              </h2>
            </div>

            <button
              onClick={onBrowseTemplates}
              className="text-xs font-semibold text-neutral-900 hover:underline flex items-center gap-1.5"
            >
              <span>View All Templates</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {SAMPLE_FORMS.map((tmpl) => (
              <div
                key={tmpl.id}
                className="bg-white rounded-2xl border border-neutral-200/90 overflow-hidden hover:border-neutral-900/60 transition-all shadow-xs flex flex-col justify-between group"
              >
                <div>
                  <div className="h-44 bg-neutral-100 overflow-hidden relative">
                    {tmpl.welcomeScreen.coverImage && (
                      <img
                        src={tmpl.welcomeScreen.coverImage}
                        alt={tmpl.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    )}
                    <span className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded text-[10px] font-mono font-semibold bg-white/95 text-neutral-900 shadow-xs capitalize">
                      {tmpl.layoutMode}
                    </span>
                  </div>

                  <div className="p-6 space-y-2">
                    <h3 className="font-bold text-base text-neutral-900 group-hover:text-neutral-700 transition-colors">
                      {tmpl.title}
                    </h3>
                    <p className="text-xs text-neutral-500 line-clamp-2 leading-relaxed">
                      {tmpl.description}
                    </p>
                  </div>
                </div>

                <div className="p-6 pt-0 flex items-center gap-3">
                  <button
                    onClick={() => onPreviewForm(tmpl)}
                    className="flex-1 py-2 text-xs font-semibold rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-800 transition-colors"
                  >
                    Test Preview
                  </button>
                  <button
                    onClick={() => onSelectForm(tmpl.id)}
                    className="flex-1 py-2 text-xs font-semibold rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white transition-colors"
                  >
                    Customize
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. PRICING SECTION */}
      <div id="pricing">
        <PricingSection onSelectPlan={() => onNavigate('dashboard')} />
      </div>

      {/* 6. CALL TO ACTION */}
      <section className="py-20 bg-neutral-900 text-white text-center">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Ready to design your next form experience?
          </h2>
          <p className="text-sm sm:text-base text-neutral-400 max-w-xl mx-auto leading-relaxed">
            Join innovative product builders and researchers collecting higher quality responses with zero friction.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={onOpenCreate}
              className="px-6 py-3 bg-white text-neutral-900 font-semibold rounded-xl text-xs hover:bg-neutral-100 transition-colors shadow-xs"
            >
              Open Form Builder
            </button>
            <button
              onClick={onOpenAI}
              className="px-6 py-3 bg-neutral-800 text-white font-semibold rounded-xl text-xs hover:bg-neutral-700 transition-colors flex items-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Prompt AI Architect</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
