/**
 * FlexStore Form Studio — Personalised Outcome Result Screen Renderer (Phase 2, Step 4)
 *
 * Shared identically by:
 *  - Respondent Rendering Engine (`rendering-engine.tsx`) on published & previewed forms
 *  - Outcome Builder live result screen preview (`OutcomeBuilder.tsx`)
 *  - Logic Preview & Debugger live result screen preview (`LogicDebuggerPanel.tsx`)
 *
 * Security & Design guarantees:
 *  - Renders strictly plain React text nodes (zero `dangerouslySetInnerHTML`).
 *  - Validates all CTA hrefs via `isSafeHttpUrl`.
 *  - Graceful image error fallback (zero broken images).
 *  - Integrates outcome appearance overrides seamlessly with global FormDesignConfig tokens.
 */

import React, { useEffect, useState } from 'react';
import {
  ArrowCounterClockwise,
  ArrowSquareOut,
  CheckCircle,
  ImageBroken,
  ListChecks,
  Trophy,
} from '@phosphor-icons/react';
import { FormDesignConfig } from '../document/types';
import { isSafeHttpUrl } from '../logic/registries';
import { resolveDesignTokens, ViewportMode } from './design-engine';
import { ResolvedOutcomeResult, ScoringEvaluationResult } from './scoring-engine';

export interface OutcomeResultCardProps {
  outcome: ResolvedOutcomeResult;
  scoring?: ScoringEvaluationResult | null;
  design: FormDesignConfig;
  viewport?: ViewportMode;
  compact?: boolean;
  isPreview?: boolean;
  showRestartButton?: boolean;
  onRestart?: () => void;
}

export const OutcomeResultCard: React.FC<OutcomeResultCardProps> = ({
  outcome,
  scoring,
  design,
  viewport = 'desktop',
  compact = false,
  isPreview = false,
  showRestartButton = false,
  onRestart,
}) => {
  const tokens = resolveDesignTokens(design, viewport);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [outcome.imageUrl]);

  const override = outcome.appearance || {};
  const accentColor = override.accentColor || tokens.colors.primary;
  const surfaceColor = override.surfaceColor || override.backgroundColor || tokens.colors.surface;
  const textColor = override.textColor || tokens.colors.text;
  const textAlign = override.textAlign || 'center';

  const alignClass =
    textAlign === 'left'
      ? 'text-left items-start'
      : textAlign === 'right'
      ? 'text-right items-end'
      : 'text-center items-center';

  const showScoreSection = Boolean(outcome.showScoreCard && scoring?.enabled);
  const showCategoriesSection = Boolean(
    outcome.showCategoryBreakdown && scoring?.enabled && scoring.categories.length > 0
  );

  return (
    <div
      className={`${compact ? 'p-5' : tokens.internalPaddingClass} ${tokens.borderRadiusClass} border transition-colors`}
      style={{
        ...tokens.surfaceStyle,
        backgroundColor: surfaceColor,
        color: textColor,
        borderColor: tokens.colors.border,
      }}
    >
      <div className={`w-full ${compact ? '' : tokens.contentMaxWidthClass} mx-auto space-y-6`}>
        {/* Hero Media (with graceful fallback) */}
        {outcome.imageUrl && (
          <div className={`w-full overflow-hidden ${tokens.borderRadiusClass} border`} style={{ borderColor: tokens.colors.border }}>
            {!imageFailed ? (
              <img
                src={outcome.imageUrl}
                alt={outcome.imageAlt || outcome.heading}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setImageFailed(true)}
                className={`w-full ${compact ? 'max-h-40' : 'max-h-60'} object-cover block`}
              />
            ) : (
              <div
                className={`w-full ${compact ? 'h-28' : 'h-40'} flex flex-col items-center justify-center gap-1.5 text-xs opacity-65`}
                style={{ backgroundColor: `${accentColor}10` }}
              >
                <ImageBroken size={22} weight="light" style={{ color: accentColor }} />
                <span>Result banner preview unavailable</span>
              </div>
            )}
          </div>
        )}

        {/* Header & Description */}
        <div className={`flex flex-col ${alignClass} space-y-3`}>
          {!outcome.imageUrl && (
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: `${accentColor}16`,
                color: accentColor,
              }}
            >
              {showScoreSection ? (
                <Trophy size={26} weight="fill" />
              ) : (
                <CheckCircle size={26} weight="fill" />
              )}
            </div>
          )}

          <div className="space-y-2 max-w-xl">
            <p
              className="font-mono text-[10px] uppercase tracking-[0.16em] font-semibold"
              style={{ color: accentColor }}
            >
              {outcome.outcomeName}
              {scoring?.totalThreshold?.label ? ` · ${scoring.totalThreshold.label}` : ''}
            </p>
            <h2
              className={`${compact ? 'text-xl' : tokens.headingSizeClass} font-display font-bold tracking-tight leading-tight`}
              style={{
                ...tokens.headingStyle,
                color: textColor,
                textAlign,
              }}
            >
              {outcome.heading}
            </h2>
            {outcome.description && (
              <p
                className={`${compact ? 'text-xs' : tokens.bodySizeClass} opacity-80 leading-relaxed whitespace-pre-line`}
                style={{
                  ...tokens.bodyStyle,
                  color: textColor,
                  textAlign,
                }}
              >
                {outcome.description}
              </p>
            )}
          </div>
        </div>

        {/* Total Score Summary Card */}
        {showScoreSection && scoring && (
          <div
            className={`p-4 ${tokens.borderRadiusClass} border text-left space-y-3`}
            style={{
              borderColor: tokens.colors.border,
              backgroundColor: `${accentColor}08`,
            }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] opacity-65 block">
                  Overall Score
                </span>
                <div className="flex items-baseline gap-2 mt-0.5 tabular-nums">
                  <span className="text-2xl font-display font-bold" style={{ color: accentColor }}>
                    {scoring.totalScore}
                  </span>
                  {scoring.maxScore > 0 && (
                    <span className="text-xs opacity-65 font-mono">
                      / {scoring.maxScore} pts ({scoring.percent}%)
                    </span>
                  )}
                </div>
              </div>
              {scoring.totalThreshold?.label && (
                <div className="text-right">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] opacity-60 block">
                    Score Band
                  </span>
                  <span className="text-sm font-semibold" style={{ color: accentColor }}>
                    {scoring.totalThreshold.label}
                  </span>
                </div>
              )}
            </div>

            {scoring.maxScore > 0 && (
              <div className="w-full h-2 rounded-full bg-black/[0.08] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(0, Math.min(100, scoring.percent))}%`,
                    backgroundColor: accentColor,
                  }}
                />
              </div>
            )}

            {scoring.totalThreshold?.description && (
              <p className="text-xs opacity-75 leading-relaxed">
                {scoring.totalThreshold.description}
              </p>
            )}
          </div>
        )}

        {/* Multi-Category Breakdown */}
        {showCategoriesSection && scoring && (
          <div
            className={`p-4 ${tokens.borderRadiusClass} border text-left space-y-3.5`}
            style={{ borderColor: tokens.colors.border }}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] opacity-65 font-semibold">
                Category Breakdown
              </span>
              <span className="font-mono text-[10px] opacity-55 tabular-nums">
                {scoring.categories.length} dimensions
              </span>
            </div>

            <div className="space-y-3">
              {scoring.categories.map((cat) => {
                const barColor = cat.color || accentColor;
                return (
                  <div key={cat.categoryId} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="font-semibold">
                        {cat.name}
                        {cat.threshold?.label && (
                          <span className="font-normal opacity-65"> · {cat.threshold.label}</span>
                        )}
                      </span>
                      <span className="font-mono text-[11px] opacity-75 tabular-nums shrink-0">
                        {cat.score}
                        {cat.maxScore > 0 ? ` / ${cat.maxScore} (${cat.percent}%)` : ' pts'}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-black/[0.08] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${
                            cat.maxScore > 0
                              ? Math.max(0, Math.min(100, cat.percent))
                              : cat.score > 0
                              ? 100
                              : 0
                          }%`,
                          backgroundColor: barColor,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Evaluated Conditional Content Blocks */}
        {outcome.conditionalBlocks.length > 0 && (
          <div className="space-y-2.5 text-left">
            {outcome.conditionalBlocks.map((block) => (
              <div
                key={block.id}
                className={`p-3.5 ${tokens.borderRadiusClass} border space-y-1`}
                style={{
                  borderColor: `${accentColor}30`,
                  backgroundColor: `${accentColor}07`,
                }}
              >
                {block.heading && (
                  <h3 className="text-xs font-semibold" style={{ color: accentColor }}>
                    {block.heading}
                  </h3>
                )}
                {block.body && (
                  <p className="text-xs opacity-85 leading-relaxed whitespace-pre-line">
                    {block.body}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Recommended Next Steps */}
        {outcome.nextSteps.length > 0 && (
          <div
            className={`p-4 ${tokens.borderRadiusClass} border text-left space-y-2.5`}
            style={{ borderColor: tokens.colors.border }}
          >
            <div className="flex items-center gap-1.5">
              <ListChecks size={14} weight="bold" style={{ color: accentColor }} />
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] opacity-70 font-semibold">
                Recommended Next Steps
              </span>
            </div>
            <ol className="space-y-2">
              {outcome.nextSteps.map((step, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-xs leading-relaxed">
                  <span
                    className="font-mono text-[10px] font-bold mt-0.5 tabular-nums shrink-0"
                    style={{ color: accentColor }}
                  >
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <span className="opacity-85">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* CTA Buttons & Restart */}
        {(outcome.buttons.length > 0 || showRestartButton || isPreview) && (
          <div
            className={`pt-1 flex flex-wrap items-center gap-2.5 ${
              textAlign === 'left'
                ? 'justify-start'
                : textAlign === 'right'
                ? 'justify-end'
                : 'justify-center'
            }`}
          >
            {outcome.buttons.map((btn) => {
              if (!isSafeHttpUrl(btn.url)) return null;
              const isPrimary = btn.style === 'primary';
              return (
                <a
                  key={btn.id}
                  href={btn.url}
                  target={btn.openInNewTab !== false ? '_blank' : undefined}
                  rel={btn.openInNewTab !== false ? 'noopener noreferrer' : undefined}
                  className={
                    isPrimary
                      ? tokens.buttonClassName
                      : `inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border transition-opacity hover:opacity-80 ${tokens.borderRadiusClass}`
                  }
                  style={
                    isPrimary
                      ? { ...tokens.buttonStyle, backgroundColor: accentColor }
                      : {
                          borderColor: tokens.colors.border,
                          color: textColor,
                        }
                  }
                >
                  <span>{btn.label}</span>
                  <ArrowSquareOut size={14} weight="bold" />
                </a>
              );
            })}

            {(showRestartButton || isPreview) && onRestart && (
              <button
                type="button"
                onClick={onRestart}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl border hover:opacity-80 transition-opacity"
                style={{
                  borderColor: tokens.colors.border,
                  color: textColor,
                }}
              >
                <ArrowCounterClockwise size={14} weight="bold" />
                <span>{isPreview ? 'Restart preview' : 'Submit another response'}</span>
              </button>
            )}
          </div>
        )}

        {isPreview && (
          <p className="text-[11px] font-mono opacity-55 text-center">
            Preview mode — no real submission was recorded.
          </p>
        )}
      </div>
    </div>
  );
};
