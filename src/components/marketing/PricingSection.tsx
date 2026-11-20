import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check, ArrowUpRight } from '@phosphor-icons/react';
import { PlanTier } from '../../types/form';

interface PricingSectionProps {
  onSelectPlan: (plan: PlanTier) => void;
}

const VANGUARD_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

const TIERS: {
  id: PlanTier;
  eyebrow: string;
  name: string;
  price: string;
  cadence: string;
  summary: string;
  features: string[];
  cta: string;
  featured?: boolean;
}[] = [
  {
    id: 'free',
    eyebrow: 'Solo Builders',
    name: 'Starter',
    price: '$0',
    cadence: '/ forever',
    summary: 'Design conversational and stepped forms locally with instant exports.',
    features: [
      'Up to 3 active forms',
      '100 monthly responses',
      'Conversational, stepped & classic runners',
      'Standard theme presets & motion controls',
    ],
    cta: 'Start Free',
  },
  {
    id: 'pro',
    eyebrow: 'Product Teams',
    name: 'Pro Studio',
    price: '$29',
    cadence: '/ month',
    summary: 'Full schema synthesis, branching logic, unlimited forms, and webhook dispatch.',
    features: [
      'Unlimited active forms',
      '5,000 monthly responses',
      'AI Form Architect schema synthesis',
      'Visual branching conditional logic',
      'Webhooks, SVG QR codes & CSV/JSON export',
      'Custom typography, tokens & video backgrounds',
    ],
    cta: 'Choose Pro Studio',
    featured: true,
  },
  {
    id: 'enterprise',
    eyebrow: 'High-Volume Scale',
    name: 'Enterprise',
    price: '$99',
    cadence: '/ month',
    summary: 'Dedicated PostgreSQL sync, custom domains, and workspace governance.',
    features: [
      'Unlimited monthly responses',
      'Direct Supabase / PostgreSQL persistence',
      'Custom domain routing & embeds',
      'Role-based workspace permissions',
    ],
    cta: 'Open Enterprise',
  },
];

export const PricingSection: React.FC<PricingSectionProps> = ({ onSelectPlan }) => {
  const prefersReduced = useReducedMotion();

  return (
    <section className="py-28 sm:py-36 bg-[#F7F6F3] text-[#0B0D0F]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.75, ease: VANGUARD_EASE }}
          className="max-w-2xl mb-16 sm:mb-20 space-y-4"
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#0F766E] font-medium">
            Workspace Plans
          </p>
          <h2 className="text-3xl sm:text-5xl font-display font-semibold tracking-tight text-[#0B0D0F] leading-[1.08]">
            Clear scale for every{' '}
            <span className="font-serif-editorial italic font-normal text-[#0F766E]">
              response volume.
            </span>
          </h2>
          <p className="text-base text-[#5C6066] leading-relaxed max-w-xl">
            Every tier runs the exact same shared FormRunner and versioned schema engine. Upgrade only when your workspace needs higher volume or cloud database sync.
          </p>
        </motion.div>

        {/* Double-Bezel 3-Column Tier Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-7 items-stretch">
          {TIERS.map((tier, idx) => {
            const isFeatured = Boolean(tier.featured);

            return (
              <motion.div
                key={tier.id}
                initial={prefersReduced ? false : { opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{
                  duration: 0.75,
                  delay: prefersReduced ? 0 : idx * 0.08,
                  ease: VANGUARD_EASE,
                }}
                className={`${
                  isFeatured
                    ? 'p-1.5 rounded-[2rem] bg-[#0B0D0F]/[0.10] ring-1 ring-[#0B0D0F]/20'
                    : 'bezel-outer'
                } flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-1`}
              >
                <div
                  className={`flex-1 flex flex-col justify-between p-8 sm:p-9 ${
                    isFeatured
                      ? 'rounded-[calc(2rem-6px)] bg-[#0B0D0F] text-[#F7F6F3] shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_28px_60px_-20px_rgba(11,13,15,0.45)]'
                      : 'bezel-inner text-[#0B0D0F]'
                  }`}
                >
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <span
                        className={`font-mono text-[10px] uppercase tracking-[0.2em] block ${
                          isFeatured ? 'text-emerald-400' : 'text-[#5C6066]'
                        }`}
                      >
                        {tier.eyebrow}
                      </span>
                      <h3 className="text-2xl font-display font-semibold tracking-tight">
                        {tier.name}
                      </h3>
                    </div>

                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-display font-semibold font-mono tabular-nums tracking-tight">
                        {tier.price}
                      </span>
                      <span
                        className={`text-xs ${
                          isFeatured ? 'text-[#8F969E]' : 'text-[#5C6066]'
                        }`}
                      >
                        {tier.cadence}
                      </span>
                    </div>

                    <p
                      className={`text-sm leading-relaxed ${
                        isFeatured ? 'text-[#A2A8B0]' : 'text-[#5C6066]'
                      }`}
                    >
                      {tier.summary}
                    </p>

                    <ul
                      className={`pt-6 border-t space-y-3 text-sm ${
                        isFeatured
                          ? 'border-white/[0.09] text-[#E6E8EB]'
                          : 'border-black/[0.06] text-[#272A2E]'
                      }`}
                    >
                      {tier.features.map((feat) => (
                        <li key={feat} className="flex items-start gap-2.5">
                          <Check
                            size={16}
                            weight="light"
                            className={`mt-0.5 shrink-0 ${
                              isFeatured ? 'text-emerald-400' : 'text-[#0F766E]'
                            }`}
                          />
                          <span className="leading-snug">{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Button-in-Button CTA */}
                  <button
                    onClick={() => onSelectPlan(tier.id)}
                    className={`group mt-9 w-full inline-flex items-center justify-between pl-6 pr-2 py-2 rounded-full text-xs font-semibold transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                      isFeatured
                        ? 'bg-[#F7F6F3] text-[#0B0D0F] hover:bg-white focus-visible:ring-emerald-400 focus-visible:ring-offset-[#0B0D0F]'
                        : 'bg-[#0B0D0F]/[0.05] text-[#0B0D0F] hover:bg-[#0B0D0F] hover:text-[#F7F6F3] focus-visible:ring-[#0B0D0F]'
                    }`}
                  >
                    <span>{tier.cta}</span>
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:scale-105 ${
                        isFeatured
                          ? 'bg-[#0B0D0F]/10 text-[#0B0D0F]'
                          : 'bg-[#0B0D0F]/[0.07] group-hover:bg-white/15'
                      }`}
                    >
                      <ArrowUpRight size={15} weight="light" />
                    </span>
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
