import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowUpRight,
  Sparkle,
  GitBranch,
  SlidersHorizontal,
  Export,
  QrCode,
  Play,
  Eye,
  Code,
  Check,
  Plus,
  Layout,
  ChatText,
  ListNumbers,
  Stack,
} from '@phosphor-icons/react';
import { FormSchema } from '../../types/form';
import { SAMPLE_FORMS } from '../../lib/sample-data';
import { FormRunner } from '../runner/FormRunner';
import { PricingSection } from './PricingSection';

interface LandingPageProps {
  onOpenCreate: () => void;
  onCreateBlank: () => void;
  onOpenAI: () => void;
  onBrowseTemplates: () => void;
  onCloneTemplate: (template: FormSchema) => void;
  onPreviewForm: (form: FormSchema) => void;
  onNavigate: (view: string) => void;
}

const VANGUARD_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

const TOKEN_SWATCHES = [
  {
    id: 'alabaster',
    name: 'Alabaster Ink',
    bg: '#F7F6F3',
    surface: '#FFFFFF',
    text: '#0B0D0F',
    accent: '#0F766E',
    contrast: '18.2:1 AAA',
  },
  {
    id: 'obsidian',
    name: 'Obsidian Slate',
    bg: '#0B0D0F',
    surface: '#15191E',
    text: '#F7F6F3',
    accent: '#10B981',
    contrast: '16.9:1 AAA',
  },
  {
    id: 'sandstone',
    name: 'Warm Sandstone',
    bg: '#EFECE6',
    surface: '#FAF8F5',
    text: '#1C1917',
    accent: '#B45309',
    contrast: '15.1:1 AAA',
  },
] as const;

const MOTION_PRESETS = [
  { id: 'snappy', label: 'Snappy', ms: 240, curve: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  { id: 'vanguard', label: 'Vanguard', ms: 480, curve: 'cubic-bezier(0.32, 0.72, 0, 1)' },
  { id: 'gentle', label: 'Gentle', ms: 680, curve: 'cubic-bezier(0.22, 1, 0.36, 1)' },
] as const;

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenCreate,
  onCreateBlank,
  onOpenAI,
  onBrowseTemplates,
  onCloneTemplate,
  onPreviewForm,
  onNavigate,
}) => {
  const prefersReduced = useReducedMotion();

  // Interactive hero runner state
  const [activeHeroDemoId, setActiveHeroDemoId] = useState<string>('form_product_feedback');
  // Interactive Bento card states
  const [activeTokenIdx, setActiveTokenIdx] = useState<number>(0);
  const [activeMotionIdx, setActiveMotionIdx] = useState<number>(1);
  const [motionReplayKey, setMotionReplayKey] = useState<number>(0);

  const activeDemoForm =
    SAMPLE_FORMS.find((f) => f.id === activeHeroDemoId) || SAMPLE_FORMS[1];

  const activeToken = TOKEN_SWATCHES[activeTokenIdx];
  const activeMotion = MOTION_PRESETS[activeMotionIdx];

  return (
    <div className="bg-[#F7F6F3] text-[#0B0D0F]">
      {/* ===================================================================== */}
      {/* SCREEN 1: MOBILE-FIRST EDITORIAL HERO WITH 1-TAP BEGINNER PATHS       */}
      {/* ===================================================================== */}
      <section className="relative min-h-[calc(100dvh-5rem)] flex items-center pt-6 pb-16 sm:pt-12 sm:pb-24">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
            {/* Left Editorial Typography Column (Stacks first on mobile) */}
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.75, ease: VANGUARD_EASE }}
              className="lg:col-span-6 space-y-6 sm:space-y-8"
            >
              {/* Quiet Eyebrow */}
              <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] text-[#0F766E]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Simple Form Builder · Mobile-First</span>
              </div>

              {/* H1: Plain, Beginner-Friendly, High-Craft Typography */}
              <h1 className="text-[2.25rem] sm:text-5xl lg:text-[4rem] font-display font-semibold tracking-[-0.035em] text-[#0B0D0F] leading-[1.05] text-balance">
                Create any form,{' '}
                <span className="font-serif-editorial italic font-normal text-[#0F766E]">
                  your way
                </span>
                —in minutes.
              </h1>

              {/* Plain, Jargon-Free Value Proposition */}
              <p className="text-sm sm:text-lg text-[#5C6066] leading-relaxed max-w-xl text-pretty">
                Start from a blank page, describe what you need to AI, or clone a ready template. Switch effortlessly between one-question-at-a-time, multi-page, or single-page layouts on phone or desktop.
              </p>

              {/* Primary Mobile-First CTAs (>= 48px touch targets) */}
              <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  onClick={onCreateBlank}
                  className="group min-h-[52px] inline-flex items-center justify-between sm:justify-start gap-4 pl-6 pr-2 py-2 rounded-full bg-[#0B0D0F] text-[#F7F6F3] text-sm font-semibold transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[#1A1E23] active:scale-[0.98] shadow-[0_14px_34px_-12px_rgba(11,13,15,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0B0D0F]"
                >
                  <span>Start Building Free</span>
                  <span className="w-9 h-9 rounded-full bg-white/[0.13] flex items-center justify-center transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:scale-105">
                    <ArrowUpRight size={17} weight="light" />
                  </span>
                </button>

                <button
                  onClick={onOpenAI}
                  className="group min-h-[52px] inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-full bg-white text-[#0B0D0F] text-sm font-semibold ring-1 ring-black/[0.08] hover:ring-black/[0.18] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B0D0F]"
                >
                  <Sparkle size={17} weight="light" className="text-[#0F766E]" />
                  <span>Build with AI</span>
                </button>
              </div>

              {/* Beginner 1-Tap Starter Strip (Create Anyhow with React Icons) */}
              <div className="pt-4 border-t border-black/[0.07] grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={onCreateBlank}
                  className="p-3 rounded-2xl bg-white ring-1 ring-black/[0.06] hover:ring-[#0B0D0F] text-left transition-all active:scale-[0.98] flex flex-col gap-1.5"
                >
                  <Plus size={18} weight="light" className="text-[#0F766E]" />
                  <span className="text-xs font-semibold text-[#0B0D0F]">Blank Page</span>
                  <span className="text-[11px] text-[#5C6066] hidden sm:inline">Type &amp; go</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenAI}
                  className="p-3 rounded-2xl bg-white ring-1 ring-black/[0.06] hover:ring-[#0B0D0F] text-left transition-all active:scale-[0.98] flex flex-col gap-1.5"
                >
                  <Sparkle size={18} weight="light" className="text-[#0F766E]" />
                  <span className="text-xs font-semibold text-[#0B0D0F]">AI Prompt</span>
                  <span className="text-[11px] text-[#5C6066] hidden sm:inline">1 sentence</span>
                </button>

                <button
                  type="button"
                  onClick={onBrowseTemplates}
                  className="p-3 rounded-2xl bg-white ring-1 ring-black/[0.06] hover:ring-[#0B0D0F] text-left transition-all active:scale-[0.98] flex flex-col gap-1.5"
                >
                  <Layout size={18} weight="light" className="text-[#0F766E]" />
                  <span className="text-xs font-semibold text-[#0B0D0F]">Templates</span>
                  <span className="text-[11px] text-[#5C6066] hidden sm:inline">Clone &amp; edit</span>
                </button>
              </div>
            </motion.div>

            {/* Right Column: Live Interactive Machined Double-Bezel App-Frame */}
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.85, delay: prefersReduced ? 0 : 0.08, ease: VANGUARD_EASE }}
              className="lg:col-span-6"
            >
              <div className="bezel-outer">
                <div className="bezel-inner overflow-hidden">
                  {/* Machined Frame Header (Mobile-first stacked gracefully) */}
                  <div className="px-3.5 sm:px-5 py-3 border-b border-black/[0.06] bg-[#FAF9F7] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      <span className="font-mono text-[11px] text-[#0B0D0F] font-medium">
                        Try a live form
                      </span>
                      <span className="text-[11px] text-[#7B8088]">· Tap to test</span>
                    </div>

                    {/* Interactive Mode Switcher with React Icons */}
                    <div className="grid grid-cols-3 sm:flex items-center gap-1 p-1 rounded-full bg-black/[0.045] text-[11px] font-medium">
                      {[
                        { id: 'form_product_feedback', label: '1-by-1', icon: ChatText },
                        { id: 'form_summit_2026', label: 'Pages', icon: ListNumbers },
                        { id: 'form_web_standards_quiz', label: 'Quiz', icon: Stack },
                      ].map((mode) => {
                        const Icon = mode.icon;
                        return (
                          <button
                            key={mode.id}
                            onClick={() => setActiveHeroDemoId(mode.id)}
                            className={`px-2.5 py-1.5 rounded-full transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] inline-flex items-center justify-center gap-1.5 ${
                              activeHeroDemoId === mode.id
                                ? 'bg-[#0B0D0F] text-[#F7F6F3] shadow-xs'
                                : 'text-[#5C6066] hover:text-[#0B0D0F]'
                            }`}
                          >
                            <Icon size={13} weight="light" />
                            <span>{mode.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Real Shared FormRunner Canvas */}
                  <div className="bg-white min-h-[380px] sm:min-h-[430px] max-h-[500px] overflow-y-auto">
                    <FormRunner
                      key={activeDemoForm.id}
                      form={activeDemoForm}
                      isInteractivePreview={true}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* SCREEN 2: ASYMMETRICAL BENTO ARCHITECTURE GRID                        */}
      {/* ===================================================================== */}
      <section id="capabilities" className="py-28 sm:py-36 bg-white border-t border-black/[0.05]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          {/* Header */}
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.75, ease: VANGUARD_EASE }}
            className="max-w-2xl space-y-4"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#0F766E] font-medium">
              System Architecture
            </p>
            <h2 className="text-3xl sm:text-5xl font-display font-semibold tracking-tight text-[#0B0D0F] leading-[1.08]">
              Engineered as one coherent{' '}
              <span className="font-serif-editorial italic font-normal text-[#0F766E]">
                pipeline.
              </span>
            </h2>
            <p className="text-base text-[#5C6066] leading-relaxed">
              Every question, page break, visual token, motion curve, and branching rule compiles from a single schema definition.
            </p>
          </motion.div>

          {/* 12-Col Asymmetrical Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-7">
            {/* BENTO 1 (7 cols): One Schema -> Three Surfaces Pulsing Architecture Diagram */}
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.75, ease: VANGUARD_EASE }}
              className="md:col-span-7 bezel-outer"
            >
              <div className="bezel-inner h-full p-7 sm:p-9 flex flex-col justify-between gap-8">
                <div className="space-y-2.5">
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#0F766E]">
                    01 · Shared Renderer
                  </span>
                  <h3 className="text-2xl font-display font-semibold text-[#0B0D0F]">
                    Zero drift between editor and production
                  </h3>
                  <p className="text-sm text-[#5C6066] leading-relaxed max-w-lg">
                    One typed FormSchema feeds the builder canvas, responsive device preview, and live public runner simultaneously.
                  </p>
                </div>

                {/* Live Pulsing Architecture Diagram (Hub -> Main Processor -> 3 Parallel Lanes) */}
                <div className="p-5 rounded-2xl bg-[#F7F6F3] ring-1 ring-black/[0.05] overflow-hidden">
                  <svg
                    viewBox="0 0 560 170"
                    className="w-full h-auto"
                    role="img"
                    aria-label="FormSchema flowing through FormRunner to Editor, Preview, and Published surfaces"
                  >
                    {/* Static Base Tracks */}
                    <path d="M 118 85 L 218 85" stroke="#D4D6DA" strokeWidth="1.5" fill="none" />
                    <path d="M 334 85 C 378 85, 378 32, 422 32" stroke="#D4D6DA" strokeWidth="1.5" fill="none" />
                    <path d="M 334 85 L 422 85" stroke="#D4D6DA" strokeWidth="1.5" fill="none" />
                    <path d="M 334 85 C 378 85, 378 138, 422 138" stroke="#D4D6DA" strokeWidth="1.5" fill="none" />

                    {/* Animated Signal Pulses */}
                    <path d="M 118 85 L 218 85" stroke="#0F766E" strokeWidth="2" fill="none" className="animate-signal-flow" />
                    <path d="M 334 85 C 378 85, 378 32, 422 32" stroke="#10B981" strokeWidth="2" fill="none" className="animate-signal-flow" />
                    <path d="M 334 85 L 422 85" stroke="#0F766E" strokeWidth="2" fill="none" className="animate-signal-flow" />
                    <path d="M 334 85 C 378 85, 378 138, 422 138" stroke="#10B981" strokeWidth="2" fill="none" className="animate-signal-flow" />

                    {/* Input Node: FormSchema */}
                    <rect x="8" y="57" width="110" height="56" rx="14" fill="#FFFFFF" stroke="rgba(11,13,15,0.12)" />
                    <text x="63" y="81" textAnchor="middle" fill="#0B0D0F" fontSize="11" fontWeight="600" fontFamily="JetBrains Mono, monospace">FormSchema</text>
                    <text x="63" y="99" textAnchor="middle" fill="#5C6066" fontSize="9.5" fontFamily="JetBrains Mono, monospace">JSON v1</text>

                    {/* Processor Node: FormRunner */}
                    <rect x="218" y="53" width="116" height="64" rx="16" fill="#0B0D0F" />
                    <circle cx="236" cy="73" r="3.5" fill="#10B981" />
                    <text x="276" y="81" textAnchor="middle" fill="#F7F6F3" fontSize="11.5" fontWeight="600" fontFamily="JetBrains Mono, monospace">FormRunner</text>
                    <text x="276" y="99" textAnchor="middle" fill="#8F969E" fontSize="9.5" fontFamily="JetBrains Mono, monospace">shared core</text>

                    {/* 3 Output Surface Lanes */}
                    <rect x="422" y="12" width="130" height="40" rx="12" fill="#FFFFFF" stroke="rgba(11,13,15,0.10)" />
                    <text x="487" y="36" textAnchor="middle" fill="#0B0D0F" fontSize="11" fontWeight="500" fontFamily="Plus Jakarta Sans, sans-serif">Visual Editor</text>

                    <rect x="422" y="65" width="130" height="40" rx="12" fill="#FFFFFF" stroke="rgba(11,13,15,0.10)" />
                    <text x="487" y="89" textAnchor="middle" fill="#0B0D0F" fontSize="11" fontWeight="500" fontFamily="Plus Jakarta Sans, sans-serif">Device Preview</text>

                    <rect x="422" y="118" width="130" height="40" rx="12" fill="#FFFFFF" stroke="rgba(15,118,110,0.35)" />
                    <text x="487" y="142" textAnchor="middle" fill="#0F766E" fontSize="11" fontWeight="600" fontFamily="Plus Jakarta Sans, sans-serif">Published URL</text>
                  </svg>
                </div>
              </div>
            </motion.div>

            {/* BENTO 2 (5 cols): Visual Conditional Branching Logic */}
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.75, delay: prefersReduced ? 0 : 0.06, ease: VANGUARD_EASE }}
              className="md:col-span-5 bezel-outer"
            >
              <div className="bezel-inner h-full p-7 sm:p-9 flex flex-col justify-between gap-7">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#0F766E]">
                      02 · Branching Logic
                    </span>
                    <GitBranch size={18} weight="light" className="text-[#5C6066]" />
                  </div>
                  <h3 className="text-2xl font-display font-semibold text-[#0B0D0F]">
                    Conditional paths &amp; step jumps
                  </h3>
                  <p className="text-sm text-[#5C6066] leading-relaxed">
                    Show, hide, require, or jump across steps based on prior answers with an integrated rule test harness.
                  </p>
                </div>

                {/* Rule Graph Mini Visual */}
                <div className="p-4 rounded-2xl bg-[#F7F6F3] ring-1 ring-black/[0.05] space-y-3 font-mono text-[11px]">
                  <div className="p-3 rounded-xl bg-white ring-1 ring-black/[0.06] flex items-center justify-between">
                    <span className="text-[#5C6066]">IF ticket_tier</span>
                    <span className="text-[#0B0D0F] font-semibold">== &quot;VIP Pass&quot;</span>
                  </div>
                  <div className="flex justify-center">
                    <svg width="24" height="22" viewBox="0 0 24 22" fill="none" aria-hidden="true">
                      <path d="M12 0V20" stroke="#0F766E" strokeWidth="1.5" className="animate-signal-flow" />
                      <path d="M7 15L12 20L17 15" stroke="#0F766E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="p-3 rounded-xl bg-[#0B0D0F] text-[#F7F6F3] flex items-center justify-between">
                    <span className="text-emerald-400">SHOW</span>
                    <span>vip_dinner_rsvp</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* BENTO 3 (5 cols): Choreographed Motion Engine (Interactive Preview) */}
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.75, ease: VANGUARD_EASE }}
              className="md:col-span-5 bezel-outer"
            >
              <div className="bezel-inner h-full p-7 sm:p-9 flex flex-col justify-between gap-7">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#0F766E]">
                      03 · Motion Engine
                    </span>
                    <Play size={18} weight="light" className="text-[#5C6066]" />
                  </div>
                  <h3 className="text-2xl font-display font-semibold text-[#0B0D0F]">
                    Intro, transition &amp; outro timing
                  </h3>
                  <p className="text-sm text-[#5C6066] leading-relaxed">
                    Independent durations, delays, easing curves, video backgrounds, and automatic reduced-motion compliance.
                  </p>
                </div>

                {/* Interactive Motion Curve Tester */}
                <div className="p-4 rounded-2xl bg-[#F7F6F3] ring-1 ring-black/[0.05] space-y-4">
                  <div className="flex items-center gap-1.5">
                    {MOTION_PRESETS.map((preset, idx) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setActiveMotionIdx(idx);
                          setMotionReplayKey((k) => k + 1);
                        }}
                        className={`flex-1 py-1.5 px-2.5 rounded-full text-[11px] font-medium transition-all duration-300 ${
                          activeMotionIdx === idx
                            ? 'bg-[#0B0D0F] text-[#F7F6F3]'
                            : 'bg-white text-[#5C6066] hover:text-[#0B0D0F] ring-1 ring-black/[0.06]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <div className="p-3.5 rounded-xl bg-white ring-1 ring-black/[0.06] overflow-hidden">
                    <motion.div
                      key={`${activeMotion.id}-${motionReplayKey}`}
                      initial={prefersReduced ? false : { x: -18, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{
                        duration: activeMotion.ms / 1000,
                        ease: VANGUARD_EASE,
                      }}
                      className="flex items-center justify-between"
                    >
                      <span className="text-xs font-semibold text-[#0B0D0F]">
                        Question 02 · Enter
                      </span>
                      <span className="font-mono text-[11px] text-[#0F766E] tabular-nums">
                        {activeMotion.ms}ms
                      </span>
                    </motion.div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* BENTO 4 (7 cols): Interactive Design Token Studio */}
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.75, delay: prefersReduced ? 0 : 0.06, ease: VANGUARD_EASE }}
              className="md:col-span-7 bezel-outer"
            >
              <div className="bezel-inner h-full p-7 sm:p-9 flex flex-col justify-between gap-7">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-2.5 max-w-md">
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#0F766E]">
                      04 · Design Token Studio
                    </span>
                    <h3 className="text-2xl font-display font-semibold text-[#0B0D0F]">
                      Live palette, font &amp; radius tokens
                    </h3>
                    <p className="text-sm text-[#5C6066] leading-relaxed">
                      Switch surface tones, button shapes, and typography scales while preserving strict WCAG AA legibility.
                    </p>
                  </div>

                  <SlidersHorizontal size={20} weight="light" className="text-[#5C6066] hidden sm:block shrink-0" />
                </div>

                {/* Live Interactive Token Preview */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-stretch">
                  <div className="sm:col-span-5 flex flex-col gap-2">
                    {TOKEN_SWATCHES.map((swatch, idx) => (
                      <button
                        key={swatch.id}
                        type="button"
                        onClick={() => setActiveTokenIdx(idx)}
                        className={`p-3 rounded-xl text-left flex items-center justify-between transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                          activeTokenIdx === idx
                            ? 'bg-[#0B0D0F] text-[#F7F6F3]'
                            : 'bg-[#F7F6F3] text-[#0B0D0F] hover:bg-[#EFECE6]'
                        }`}
                      >
                        <span className="flex items-center gap-2.5 text-xs font-medium">
                          <span
                            className="w-4 h-4 rounded-full ring-1 ring-black/15 shrink-0"
                            style={{ backgroundColor: swatch.accent }}
                          />
                          <span>{swatch.name}</span>
                        </span>
                        {activeTokenIdx === idx && <Check size={14} weight="light" className="text-emerald-400" />}
                      </button>
                    ))}
                  </div>

                  <div
                    className="sm:col-span-7 p-5 rounded-2xl ring-1 ring-black/[0.08] flex flex-col justify-between gap-4 transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
                    style={{
                      backgroundColor: activeToken.bg,
                      color: activeToken.text,
                    }}
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono opacity-75">
                      <span>{activeToken.name}</span>
                      <span>{activeToken.contrast}</span>
                    </div>
                    <div
                      className="p-3.5 rounded-xl border transition-colors duration-500"
                      style={{
                        backgroundColor: activeToken.surface,
                        borderColor: 'rgba(128,128,128,0.2)',
                      }}
                    >
                      <p className="text-xs font-semibold">Where should we send your summary?</p>
                      <p className="text-[11px] opacity-55 mt-1 font-mono">name@company.example</p>
                    </div>
                    <div className="flex justify-end">
                      <span
                        className="px-4 py-1.5 rounded-full text-[11px] font-semibold text-white transition-colors duration-500"
                        style={{ backgroundColor: activeToken.accent }}
                      >
                        Continue
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* BENTO 5 (6 cols): AI Form Architect */}
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.75, ease: VANGUARD_EASE }}
              className="md:col-span-6 bezel-outer"
            >
              <div className="bezel-inner h-full p-7 sm:p-9 flex flex-col justify-between gap-6">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#0F766E]">
                      05 · AI Form Architect
                    </span>
                    <Code size={18} weight="light" className="text-[#5C6066]" />
                  </div>
                  <h3 className="text-2xl font-display font-semibold text-[#0B0D0F]">
                    Prompt to validated schema
                  </h3>
                  <p className="text-sm text-[#5C6066] leading-relaxed">
                    Describe your survey, application, or quiz in plain language to generate fields, validation, and layout structure directly into the editor.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-[#F7F6F3] ring-1 ring-black/[0.05] font-mono text-[11px] space-y-2 text-[#272A2E]">
                  <p className="text-[#5C6066]">&gt; &quot;3-step onboarding with NPS scale &amp; role logic&quot;</p>
                  <div className="h-px bg-black/[0.06]" />
                  <p className="text-[#0F766E]">+ fields[6] · steps[3] · logicRules[2] · theme.tokens</p>
                </div>
              </div>
            </motion.div>

            {/* BENTO 6 (6 cols): Drop-off Analytics, Exports & QR */}
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.75, delay: prefersReduced ? 0 : 0.06, ease: VANGUARD_EASE }}
              className="md:col-span-6 bezel-outer"
            >
              <div className="bezel-inner h-full p-7 sm:p-9 flex flex-col justify-between gap-6">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#0F766E]">
                      06 · Publishing &amp; Exports
                    </span>
                    <Export size={18} weight="light" className="text-[#5C6066]" />
                  </div>
                  <h3 className="text-2xl font-display font-semibold text-[#0B0D0F]">
                    QR codes, embeds &amp; clean exports
                  </h3>
                  <p className="text-sm text-[#5C6066] leading-relaxed">
                    Publish to a shareable slug, copy an iframe snippet, generate SVG QR codes, or export collected responses to CSV and JSON.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2.5 font-mono text-[11px]">
                  <div className="p-3 rounded-xl bg-[#F7F6F3] ring-1 ring-black/[0.05] text-center">
                    <span className="block font-semibold text-[#0B0D0F]">CSV / JSON</span>
                    <span className="text-[10px] text-[#5C6066]">Raw export</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#F7F6F3] ring-1 ring-black/[0.05] text-center">
                    <span className="block font-semibold text-[#0B0D0F]">SVG QR</span>
                    <span className="text-[10px] text-[#5C6066]">Print ready</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#F7F6F3] ring-1 ring-black/[0.05] text-center flex flex-col items-center justify-center">
                    <QrCode size={15} weight="light" className="text-[#0F766E] mb-0.5" />
                    <span className="text-[10px] text-[#5C6066]">Webhooks</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* SCREEN 3: SIGNATURE DARK ARCHITECTURAL BAND — TEMPLATE GALLERY        */}
      {/* ===================================================================== */}
      <section id="templates" className="py-28 sm:py-36 bg-[#0B0D0F] text-[#F7F6F3]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.75, ease: VANGUARD_EASE }}
            className="flex flex-col md:flex-row md:items-end justify-between gap-6"
          >
            <div className="max-w-2xl space-y-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-400">
                Ready-to-Clone Blueprints
              </p>
              <h2 className="text-3xl sm:text-5xl font-display font-semibold tracking-tight leading-[1.08]">
                Start from a real{' '}
                <span className="font-serif-editorial italic font-normal text-emerald-400">
                  working schema.
                </span>
              </h2>
            </div>

            <button
              onClick={onBrowseTemplates}
              className="group inline-flex items-center gap-3 pl-5 pr-2 py-2 rounded-full bg-white/[0.07] hover:bg-white/[0.12] ring-1 ring-white/[0.12] text-xs font-semibold text-[#F7F6F3] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] self-start md:self-auto"
            >
              <span>Explore All Templates</span>
              <span className="w-7 h-7 rounded-full bg-white/[0.10] flex items-center justify-center transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                <ArrowUpRight size={14} weight="light" />
              </span>
            </button>
          </motion.div>

          {/* Dark Double-Bezel Template Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
            {SAMPLE_FORMS.map((tmpl, idx) => (
              <motion.div
                key={tmpl.id}
                initial={prefersReduced ? false : { opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{
                  duration: 0.75,
                  delay: prefersReduced ? 0 : idx * 0.08,
                  ease: VANGUARD_EASE,
                }}
                className="bezel-outer-dark flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-1 group"
              >
                <div className="bezel-inner-dark flex-1 overflow-hidden flex flex-col justify-between">
                  <div>
                    {/* Image Frame (Zoom 1.03 inside frame, zero captions underneath) */}
                    <div className="h-48 bg-[#1A1E24] overflow-hidden relative">
                      {tmpl.welcomeScreen.coverImage ? (
                        <img
                          src={tmpl.welcomeScreen.coverImage}
                          alt={tmpl.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#161B22] to-[#0B0D0F] font-mono text-xs tracking-widest uppercase text-emerald-400/80">
                          {tmpl.layoutMode}
                        </div>
                      )}
                    </div>

                    <div className="p-7 space-y-3">
                      <div className="flex items-center gap-2 font-mono text-[11px] text-[#8F969E] capitalize">
                        <span className="text-emerald-400">{tmpl.layoutMode}</span>
                        <span aria-hidden="true">·</span>
                        <span>{tmpl.fields.length} questions</span>
                      </div>
                      <h3 className="text-lg font-display font-semibold text-[#F7F6F3] leading-snug">
                        {tmpl.title}
                      </h3>
                      <p className="text-sm text-[#8F969E] line-clamp-2 leading-relaxed">
                        {tmpl.description}
                      </p>
                    </div>
                  </div>

                  <div className="px-7 pb-7 pt-2 flex items-center gap-2.5">
                    <button
                      onClick={() => onPreviewForm(tmpl)}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] ring-1 ring-white/[0.10] text-xs font-medium text-[#E6E8EB] transition-all duration-300"
                    >
                      <Eye size={14} weight="light" />
                      <span>Preview</span>
                    </button>
                    <button
                      onClick={() => onCloneTemplate(tmpl)}
                      className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-full bg-[#F7F6F3] hover:bg-white text-[#0B0D0F] text-xs font-semibold transition-all duration-300 active:scale-[0.98]"
                    >
                      <span>Use Blueprint</span>
                      <ArrowUpRight size={14} weight="light" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* SCREEN 4: PRICING ARCHITECTURE                                        */}
      {/* ===================================================================== */}
      <div id="pricing">
        <PricingSection onSelectPlan={() => onNavigate('dashboard')} />
      </div>

      {/* ===================================================================== */}
      {/* SCREEN 5: EDITORIAL CLOSE BAND                                        */}
      {/* ===================================================================== */}
      <section className="py-28 sm:py-36 bg-white border-t border-black/[0.06]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.75, ease: VANGUARD_EASE }}
            className="space-y-8"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#0F766E]">
              Start Building Now
            </p>
            <h2 className="text-4xl sm:text-6xl font-display font-semibold tracking-[-0.03em] text-[#0B0D0F] leading-[1.05] text-balance">
              Design your next form on one{' '}
              <span className="font-serif-editorial italic font-normal text-[#0F766E]">
                unified
              </span>{' '}
              renderer.
            </h2>
            <p className="text-base sm:text-lg text-[#5C6066] max-w-xl mx-auto leading-relaxed">
              Open the visual workspace with zero pre-loaded clutter, or describe your workflow to synthesize a complete schema in seconds.
            </p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={onOpenCreate}
                className="group inline-flex items-center gap-4 pl-7 pr-2 py-2 rounded-full bg-[#0B0D0F] text-[#F7F6F3] text-sm font-semibold transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[#1A1E23] active:scale-[0.98]"
              >
                <span>Open Form Builder</span>
                <span className="w-9 h-9 rounded-full bg-white/[0.13] flex items-center justify-center transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:scale-105">
                  <ArrowUpRight size={17} weight="light" />
                </span>
              </button>

              <button
                onClick={onOpenAI}
                className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-full bg-[#F7F6F3] hover:bg-[#EFECE6] text-[#0B0D0F] text-sm font-semibold ring-1 ring-black/[0.08] transition-all duration-300 active:scale-[0.98]"
              >
                <Sparkle size={16} weight="light" className="text-[#0F766E]" />
                <span>Prompt AI Architect</span>
              </button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};
