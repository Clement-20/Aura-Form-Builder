import React from 'react';
import { Check, ArrowRight } from 'lucide-react';
import { PlanTier } from '../../types/form';

interface PricingSectionProps {
  onSelectPlan: (plan: PlanTier) => void;
}

export const PricingSection: React.FC<PricingSectionProps> = ({ onSelectPlan }) => {
  return (
    <section className="py-20 bg-neutral-50/70 border-t border-neutral-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-neutral-900">
            Transparent Pricing for High-Intent Teams
          </h2>
          <p className="text-sm text-neutral-500 mt-3 leading-relaxed">
            Choose the workspace scale that aligns with your response volume and custom integration requirements.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Free Tier */}
          <div className="bg-white rounded-2xl p-8 border border-neutral-200 shadow-xs flex flex-col justify-between">
            <div className="space-y-4">
              <div>
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider block">
                  For Solo Creators
                </span>
                <h3 className="text-xl font-bold text-neutral-900 mt-1">Starter</h3>
              </div>

              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold font-mono text-neutral-900 tabular-nums">$0</span>
                <span className="text-xs text-neutral-500">/ forever</span>
              </div>

              <p className="text-xs text-neutral-500 leading-relaxed">
                Test the conversational experience engine and collect initial audience feedback.
              </p>

              <div className="pt-4 border-t border-neutral-100 space-y-2.5 text-xs text-neutral-700">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-neutral-900 shrink-0" />
                  <span>Up to 3 active forms</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-neutral-900 shrink-0" />
                  <span>100 responses per month</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-neutral-900 shrink-0" />
                  <span>Conversational & stepped layouts</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-neutral-900 shrink-0" />
                  <span>Standard theme presets</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => onSelectPlan('free')}
              className="mt-8 w-full py-2.5 px-4 rounded-xl border border-neutral-300 hover:border-neutral-900 text-neutral-900 font-semibold text-xs transition-colors"
            >
              Start Free
            </button>
          </div>

          {/* Pro Tier (Featured) */}
          <div className="bg-white rounded-2xl p-8 border-2 border-neutral-900 shadow-sm flex flex-col justify-between relative">
            <div className="space-y-4">
              <div>
                <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wider block">
                  For Product Teams & Agencies
                </span>
                <h3 className="text-xl font-bold text-neutral-900 mt-1">Pro Studio</h3>
              </div>

              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold font-mono text-neutral-900 tabular-nums">$29</span>
                <span className="text-xs text-neutral-500">/ month</span>
              </div>

              <p className="text-xs text-neutral-500 leading-relaxed">
                Full AI generation, conditional logic rules, unlimited forms, and webhook automations.
              </p>

              <div className="pt-4 border-t border-neutral-100 space-y-2.5 text-xs text-neutral-800 font-medium">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Unlimited active forms</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>5,000 responses per month</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Gemini 3.8 Flash AI Form Architect</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Conditional branching logic</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Real-time webhook events & CSV export</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Full design token customization</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => onSelectPlan('pro')}
              className="mt-8 w-full py-2.5 px-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-xs transition-colors shadow-xs"
            >
              Get Pro Studio
            </button>
          </div>

          {/* Enterprise Tier */}
          <div className="bg-white rounded-2xl p-8 border border-neutral-200 shadow-xs flex flex-col justify-between">
            <div className="space-y-4">
              <div>
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider block">
                  For High-Volume Operations
                </span>
                <h3 className="text-xl font-bold text-neutral-900 mt-1">Enterprise</h3>
              </div>

              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold font-mono text-neutral-900 tabular-nums">$99</span>
                <span className="text-xs text-neutral-500">/ month</span>
              </div>

              <p className="text-xs text-neutral-500 leading-relaxed">
                Dedicated PostgreSQL storage, team collaboration, custom domain routing, and 99.9% uptime SLA.
              </p>

              <div className="pt-4 border-t border-neutral-100 space-y-2.5 text-xs text-neutral-700">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-neutral-900 shrink-0" />
                  <span>Unlimited monthly responses</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-neutral-900 shrink-0" />
                  <span>Direct Supabase / PostgreSQL sync</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-neutral-900 shrink-0" />
                  <span>Custom domain publication</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-neutral-900 shrink-0" />
                  <span>Role-based team seats</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => onSelectPlan('enterprise')}
              className="mt-8 w-full py-2.5 px-4 rounded-xl border border-neutral-300 hover:border-neutral-900 text-neutral-900 font-semibold text-xs transition-colors"
            >
              Contact Enterprise
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
