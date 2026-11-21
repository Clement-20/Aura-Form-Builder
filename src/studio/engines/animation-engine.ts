/**
 * FlexStore Form Studio — Central Animation & Transition Engine (Phase 3.3)
 *
 * Single source of truth for:
 *  - Configurable animation presets & metadata (used by Editor UI & Renderer)
 *  - Global FormMotionConfig normalization & backward compatibility with legacy FormTheme fields
 *  - Per-component animation resolution (inheritance, overrides, disable, stagger, mobile tuning)
 *  - Page & conversational 1-by-1 transition resolution (direction-aware enter/exit)
 *  - Conditional visibility & result screen animation resolution
 *  - Progress bar transition resolution
 *  - Accessibility: prefers-reduced-motion compliance
 *
 * Uses pure GPU-composited CSS animations (transform, opacity, clip-path) defined in src/index.css.
 * Zero layout shifts, zero heavy third-party animation dependencies.
 */

import type React from 'react';
import {
  MOTION_SCHEMA_VERSION,
  type AnimationDirection,
  type AnimationEasing,
  type AnimationPresetType,
  type AnimationTrigger,
  type ComponentAnimationConfig,
  type FormComponentNode,
  type FormDesignConfig,
  type FormMotionConfig,
  type ProgressTransitionStyle,
} from '../document/types';
import type { ViewportMode } from './design-engine';

// ============================================================================
// Constants & Catalog Metadata (Single Source of Truth for UI & Engine)
// ============================================================================

export const ANIMATION_DURATION_MIN = 80;
export const ANIMATION_DURATION_MAX = 1200;
export const ANIMATION_DELAY_MIN = 0;
export const ANIMATION_DELAY_MAX = 1000;
export const STAGGER_INTERVAL_MIN = 0;
export const STAGGER_INTERVAL_MAX = 200;

/** Cap cumulative stagger delay so long forms remain snappy and never stall interaction */
export const MAX_STAGGER_DELAY_DESKTOP_MS = 480;
export const MAX_STAGGER_DELAY_MOBILE_MS = 320;

export interface AnimationPresetMeta {
  id: AnimationPresetType;
  label: string;
  shortDescription: string;
  category: 'none' | 'entrance' | 'exit' | 'sequence';
  supportsDirection: boolean;
  supportsStagger: boolean;
}

export const ANIMATION_PRESET_CATALOG: AnimationPresetMeta[] = [
  {
    id: 'none',
    label: 'None',
    shortDescription: 'Instant display with no animation.',
    category: 'none',
    supportsDirection: false,
    supportsStagger: false,
  },
  {
    id: 'fade_in',
    label: 'Fade in',
    shortDescription: 'Clean opacity fade-in without movement.',
    category: 'entrance',
    supportsDirection: false,
    supportsStagger: false,
  },
  {
    id: 'slide_in',
    label: 'Slide in',
    shortDescription: 'Gentle directional glide with opacity fade.',
    category: 'entrance',
    supportsDirection: true,
    supportsStagger: false,
  },
  {
    id: 'scale_in',
    label: 'Scale in',
    shortDescription: 'Soft scale entrance from 96% to 100%.',
    category: 'entrance',
    supportsDirection: false,
    supportsStagger: false,
  },
  {
    id: 'subtle_zoom',
    label: 'Subtle zoom',
    shortDescription: 'Refined micro-zoom with smooth focus settle.',
    category: 'entrance',
    supportsDirection: false,
    supportsStagger: false,
  },
  {
    id: 'reveal',
    label: 'Reveal',
    shortDescription: 'Smooth directional clip-path uncover with zero reflow.',
    category: 'entrance',
    supportsDirection: true,
    supportsStagger: false,
  },
  {
    id: 'stagger',
    label: 'Staggered entrance',
    shortDescription: 'Cascades sibling blocks sequentially with subtle glide.',
    category: 'sequence',
    supportsDirection: true,
    supportsStagger: true,
  },
  {
    id: 'fade_out',
    label: 'Fade out',
    shortDescription: 'Clean opacity fade-out for page or block exit.',
    category: 'exit',
    supportsDirection: false,
    supportsStagger: false,
  },
  {
    id: 'slide_out',
    label: 'Slide out',
    shortDescription: 'Directional glide-out with fade for outgoing pages.',
    category: 'exit',
    supportsDirection: true,
    supportsStagger: false,
  },
  {
    id: 'scale_out',
    label: 'Scale out',
    shortDescription: 'Gentle shrink and fade for outgoing views.',
    category: 'exit',
    supportsDirection: false,
    supportsStagger: false,
  },
];

export const COMPONENT_ENTRANCE_PRESETS = ANIMATION_PRESET_CATALOG.filter(
  (p) => p.category === 'none' || p.category === 'entrance' || p.category === 'sequence'
);

export const PAGE_ENTER_PRESETS = ANIMATION_PRESET_CATALOG.filter(
  (p) => p.category === 'none' || p.category === 'entrance'
);

export const PAGE_EXIT_PRESETS = ANIMATION_PRESET_CATALOG.filter(
  (p) => p.category === 'none' || p.category === 'exit'
);

export const ANIMATION_DIRECTION_OPTIONS: { id: AnimationDirection; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'up', label: 'Up' },
  { id: 'down', label: 'Down' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
];

export const ANIMATION_EASING_OPTIONS: {
  id: AnimationEasing;
  label: string;
  cssValue: string;
}[] = [
  { id: 'ease-out', label: 'Ease Out (Crisp)', cssValue: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  { id: 'ease', label: 'Ease (Balanced)', cssValue: 'cubic-bezier(0.25, 0.1, 0.25, 1)' },
  { id: 'ease-in-out', label: 'Ease In-Out', cssValue: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  { id: 'spring', label: 'Gentle Spring', cssValue: 'cubic-bezier(0.34, 1.28, 0.64, 1)' },
  { id: 'linear', label: 'Linear', cssValue: 'linear' },
];

export const ANIMATION_TRIGGER_OPTIONS: {
  id: Exclude<AnimationTrigger, 'on_conditional_result'>;
  label: string;
  description: string;
}[] = [
  {
    id: 'on_page_load',
    label: 'When page loads',
    description: 'Plays immediately when the form or active page renders.',
  },
  {
    id: 'on_viewport_enter',
    label: 'When entering viewport',
    description: 'Plays once the block scrolls into the respondent viewport.',
  },
  {
    id: 'on_conditional_show',
    label: 'When revealed by logic',
    description: 'Plays only when conditional logic makes a hidden block visible.',
  },
  {
    id: 'on_page_change',
    label: 'On page / question change',
    description: 'Replays whenever the respondent advances or navigates steps.',
  },
];

export const PROGRESS_TRANSITION_OPTIONS: {
  id: ProgressTransitionStyle;
  label: string;
  cssEasing: string;
}[] = [
  { id: 'smooth', label: 'Smooth', cssEasing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  { id: 'spring', label: 'Gentle Spring', cssEasing: 'cubic-bezier(0.34, 1.22, 0.64, 1)' },
  { id: 'linear', label: 'Linear', cssEasing: 'linear' },
  { id: 'none', label: 'Instant (None)', cssEasing: 'linear' },
];

export const DEFAULT_FORM_MOTION_CONFIG: FormMotionConfig = {
  schemaVersion: MOTION_SCHEMA_VERSION,
  enabled: true,
  respectReducedMotion: true,
  componentPreset: 'fade_in',
  durationMs: 280,
  delayMs: 0,
  direction: 'up',
  easing: 'ease-out',
  trigger: 'on_page_load',
  staggerIntervalMs: 55,
  pageTransition: {
    enabled: true,
    enterPreset: 'slide_in',
    exitPreset: 'fade_out',
    durationMs: 240,
    easing: 'ease-out',
    direction: 'auto',
  },
  conditionalReveal: {
    enabled: true,
    preset: 'slide_in',
    durationMs: 220,
    direction: 'up',
    easing: 'ease-out',
  },
  resultScreen: {
    enabled: true,
    preset: 'scale_in',
    durationMs: 320,
    direction: 'up',
    easing: 'spring',
  },
  progressTransition: {
    style: 'smooth',
    durationMs: 340,
  },
};

// ============================================================================
// Normalization & Clamping Helpers
// ============================================================================

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

export function getEasingCssValue(easing?: AnimationEasing): string {
  const match = ANIMATION_EASING_OPTIONS.find((e) => e.id === easing);
  return match ? match.cssValue : ANIMATION_EASING_OPTIONS[0].cssValue;
}

function mapLegacyThemePreset(design?: Partial<FormDesignConfig>): {
  preset?: FormMotionConfig['componentPreset'];
  direction?: AnimationDirection;
  durationMs?: number;
  easing?: AnimationEasing;
  enabled?: boolean;
} {
  if (!design) return {};
  const result: {
    preset?: FormMotionConfig['componentPreset'];
    direction?: AnimationDirection;
    durationMs?: number;
    easing?: AnimationEasing;
    enabled?: boolean;
  } = {};

  if (design.animationPreset === 'none' || design.animationIntro === 'none') {
    result.preset = 'none';
    result.enabled = false;
  } else if (design.animationIntro === 'zoom-in' || design.animationPreset === 'fade-scale') {
    result.preset = 'scale_in';
  } else if (design.animationPreset === 'slide-horizontal') {
    result.preset = 'slide_in';
    result.direction = 'left';
  } else if (design.animationIntro === 'slide-up' || design.animationPreset === 'slide-vertical') {
    result.preset = 'slide_in';
    result.direction = 'up';
  } else if (design.animationPreset === 'smooth-reveal') {
    result.preset = 'reveal';
  } else if (design.animationIntro === 'fade-in') {
    result.preset = 'fade_in';
  }

  if (typeof design.animationDuration === 'number' && Number.isFinite(design.animationDuration)) {
    result.durationMs = clampNumber(
      design.animationDuration,
      ANIMATION_DURATION_MIN,
      ANIMATION_DURATION_MAX,
      DEFAULT_FORM_MOTION_CONFIG.durationMs
    );
  } else if (design.transitionSpeed === 'snappy') {
    result.durationMs = 180;
  } else if (design.transitionSpeed === 'gentle') {
    result.durationMs = 420;
  }

  if (design.animationEasing) {
    result.easing =
      design.animationEasing === 'ease-in' ? 'ease-in-out' : design.animationEasing;
  }

  return result;
}

/**
 * Produces a complete, safe, clamped FormMotionConfig from FormDesignConfig.
 * Seamlessly honors legacy FormTheme animation properties when `design.motion` is not yet set.
 */
export function normalizeFormMotionConfig(
  design?: Partial<FormDesignConfig>
): FormMotionConfig {
  const raw = design?.motion;
  const legacy = mapLegacyThemePreset(design);

  const enabled =
    typeof raw?.enabled === 'boolean'
      ? raw.enabled
      : typeof legacy.enabled === 'boolean'
      ? legacy.enabled
      : DEFAULT_FORM_MOTION_CONFIG.enabled;

  const respectReducedMotion =
    typeof raw?.respectReducedMotion === 'boolean'
      ? raw.respectReducedMotion
      : typeof design?.respectReducedMotion === 'boolean'
      ? design.respectReducedMotion
      : DEFAULT_FORM_MOTION_CONFIG.respectReducedMotion;

  const componentPreset =
    raw?.componentPreset || legacy.preset || DEFAULT_FORM_MOTION_CONFIG.componentPreset;

  const durationMs = clampNumber(
    raw?.durationMs ?? legacy.durationMs,
    ANIMATION_DURATION_MIN,
    ANIMATION_DURATION_MAX,
    DEFAULT_FORM_MOTION_CONFIG.durationMs
  );

  const delayMs = clampNumber(
    raw?.delayMs ?? design?.animationDelay,
    ANIMATION_DELAY_MIN,
    ANIMATION_DELAY_MAX,
    DEFAULT_FORM_MOTION_CONFIG.delayMs
  );

  const direction: AnimationDirection =
    raw?.direction || legacy.direction || DEFAULT_FORM_MOTION_CONFIG.direction;

  const easing: AnimationEasing =
    raw?.easing || legacy.easing || DEFAULT_FORM_MOTION_CONFIG.easing;

  const trigger: FormMotionConfig['trigger'] =
    raw?.trigger || DEFAULT_FORM_MOTION_CONFIG.trigger;

  const staggerIntervalMs = clampNumber(
    raw?.staggerIntervalMs,
    STAGGER_INTERVAL_MIN,
    STAGGER_INTERVAL_MAX,
    DEFAULT_FORM_MOTION_CONFIG.staggerIntervalMs
  );

  const rawPage = raw?.pageTransition;
  const pageTransition: FormMotionConfig['pageTransition'] = {
    enabled:
      typeof rawPage?.enabled === 'boolean'
        ? rawPage.enabled
        : DEFAULT_FORM_MOTION_CONFIG.pageTransition.enabled,
    enterPreset:
      rawPage?.enterPreset || DEFAULT_FORM_MOTION_CONFIG.pageTransition.enterPreset,
    exitPreset:
      rawPage?.exitPreset || DEFAULT_FORM_MOTION_CONFIG.pageTransition.exitPreset,
    durationMs: clampNumber(
      rawPage?.durationMs,
      ANIMATION_DURATION_MIN,
      ANIMATION_DURATION_MAX,
      DEFAULT_FORM_MOTION_CONFIG.pageTransition.durationMs
    ),
    easing: rawPage?.easing || DEFAULT_FORM_MOTION_CONFIG.pageTransition.easing,
    direction: rawPage?.direction || DEFAULT_FORM_MOTION_CONFIG.pageTransition.direction,
  };

  const rawConditional = raw?.conditionalReveal;
  const conditionalReveal: FormMotionConfig['conditionalReveal'] = {
    enabled:
      typeof rawConditional?.enabled === 'boolean'
        ? rawConditional.enabled
        : DEFAULT_FORM_MOTION_CONFIG.conditionalReveal.enabled,
    preset:
      rawConditional?.preset || DEFAULT_FORM_MOTION_CONFIG.conditionalReveal.preset,
    durationMs: clampNumber(
      rawConditional?.durationMs,
      ANIMATION_DURATION_MIN,
      ANIMATION_DURATION_MAX,
      DEFAULT_FORM_MOTION_CONFIG.conditionalReveal.durationMs
    ),
    direction:
      rawConditional?.direction || DEFAULT_FORM_MOTION_CONFIG.conditionalReveal.direction,
    easing: rawConditional?.easing || DEFAULT_FORM_MOTION_CONFIG.conditionalReveal.easing,
  };

  const rawResult = raw?.resultScreen;
  const resultScreen: FormMotionConfig['resultScreen'] = {
    enabled:
      typeof rawResult?.enabled === 'boolean'
        ? rawResult.enabled
        : DEFAULT_FORM_MOTION_CONFIG.resultScreen.enabled,
    preset: rawResult?.preset || DEFAULT_FORM_MOTION_CONFIG.resultScreen.preset,
    durationMs: clampNumber(
      rawResult?.durationMs,
      ANIMATION_DURATION_MIN,
      ANIMATION_DURATION_MAX,
      DEFAULT_FORM_MOTION_CONFIG.resultScreen.durationMs
    ),
    direction: rawResult?.direction || DEFAULT_FORM_MOTION_CONFIG.resultScreen.direction,
    easing: rawResult?.easing || DEFAULT_FORM_MOTION_CONFIG.resultScreen.easing,
  };

  const rawProgress = raw?.progressTransition;
  const progressTransition: FormMotionConfig['progressTransition'] = {
    style: rawProgress?.style || DEFAULT_FORM_MOTION_CONFIG.progressTransition.style,
    durationMs: clampNumber(
      rawProgress?.durationMs,
      ANIMATION_DURATION_MIN,
      ANIMATION_DURATION_MAX,
      DEFAULT_FORM_MOTION_CONFIG.progressTransition.durationMs
    ),
  };

  return {
    schemaVersion: MOTION_SCHEMA_VERSION,
    enabled,
    respectReducedMotion,
    componentPreset,
    durationMs,
    delayMs,
    direction,
    easing,
    trigger,
    staggerIntervalMs,
    pageTransition,
    conditionalReveal,
    resultScreen,
    progressTransition,
  };
}

// ============================================================================
// Vector / CSS Variable Resolution Helpers
// ============================================================================

function resolveOffsetForDirection(
  direction: AnimationDirection,
  distancePx: number,
  isExit: boolean
): { x: string; y: string; clipFrom: string } {
  const dir = direction === 'auto' ? 'up' : direction;
  const sign = isExit ? -1 : 1;

  switch (dir) {
    case 'down':
      return {
        x: '0px',
        y: `${-distancePx * sign}px`,
        clipFrom: 'inset(0 0 100% 0)',
      };
    case 'left':
      return {
        x: `${distancePx * sign}px`,
        y: '0px',
        clipFrom: 'inset(0 0 0 100%)',
      };
    case 'right':
      return {
        x: `${-distancePx * sign}px`,
        y: '0px',
        clipFrom: 'inset(0 100% 0 0)',
      };
    case 'up':
    default:
      return {
        x: '0px',
        y: `${distancePx * sign}px`,
        clipFrom: 'inset(100% 0 0 0)',
      };
  }
}

export function getPresetCssClass(preset: AnimationPresetType): string {
  switch (preset) {
    case 'fade_in':
      return 'fs-anim-fade-in';
    case 'fade_out':
      return 'fs-anim-fade-out';
    case 'slide_in':
    case 'stagger':
      return 'fs-anim-slide-in';
    case 'slide_out':
      return 'fs-anim-slide-out';
    case 'scale_in':
      return 'fs-anim-scale-in';
    case 'scale_out':
      return 'fs-anim-scale-out';
    case 'subtle_zoom':
      return 'fs-anim-subtle-zoom';
    case 'reveal':
      return 'fs-anim-reveal';
    case 'none':
    default:
      return '';
  }
}

function buildAnimationCssVars(params: {
  durationMs: number;
  delayMs: number;
  easing: AnimationEasing;
  direction: AnimationDirection;
  viewport?: ViewportMode;
  isExit?: boolean;
}): React.CSSProperties {
  // Subtle mobile optimization: slightly tighter travel distance for crisp mobile motion
  const distancePx = params.viewport === 'mobile' ? 12 : 18;
  const { x, y, clipFrom } = resolveOffsetForDirection(
    params.direction,
    distancePx,
    Boolean(params.isExit)
  );

  return {
    ['--fs-anim-duration' as string]: `${params.durationMs}ms`,
    ['--fs-anim-delay' as string]: `${params.delayMs}ms`,
    ['--fs-anim-ease' as string]: getEasingCssValue(params.easing),
    ['--fs-anim-x' as string]: x,
    ['--fs-anim-y' as string]: y,
    ['--fs-anim-clip-from' as string]: clipFrom,
  };
}

// ============================================================================
// Component Animation Resolution
// ============================================================================

export interface ComponentAnimationContext {
  /** Sibling index inside the current page or container (for stagger) */
  indexInContainer: number;
  viewport?: ViewportMode;
  /** True when user OS has prefers-reduced-motion: reduce OR preview toggle is active */
  reducedMotion?: boolean;
  /** True on the render cycle when conditional logic transitioned this node from hidden -> visible */
  justRevealedByLogic?: boolean;
  /** Monotonic counter incremented on page/step navigation */
  pageTransitionTick?: number;
  /** True when triggered explicitly via the editor preview replay button */
  forcePlay?: boolean;
}

export interface ResolvedComponentAnimation {
  active: boolean;
  preset: AnimationPresetType;
  trigger: Exclude<AnimationTrigger, 'on_conditional_result'>;
  className: string;
  style: React.CSSProperties;
  effectiveDurationMs: number;
  effectiveDelayMs: number;
  needsViewportObserver: boolean;
  isDisabledByReducedMotion: boolean;
}

/**
 * Resolves the exact CSS class and variables for any FormComponentNode.
 * Shared identically by EditorCanvas preview, PreviewModal, ThemeStudio, and published FormDocumentRenderer.
 */
export function resolveComponentAnimation(
  node: FormComponentNode,
  design: Partial<FormDesignConfig> | undefined,
  context: ComponentAnimationContext
): ResolvedComponentAnimation {
  const motion = normalizeFormMotionConfig(design);
  const local: ComponentAnimationConfig | undefined = node.appearance?.animation;

  const isDisabledByReducedMotion = Boolean(context.reducedMotion && motion.respectReducedMotion);
  const inactiveResult = (
    trigger: Exclude<AnimationTrigger, 'on_conditional_result'> = motion.trigger
  ): ResolvedComponentAnimation => ({
    active: false,
    preset: 'none',
    trigger,
    className: '',
    style: {},
    effectiveDurationMs: 0,
    effectiveDelayMs: 0,
    needsViewportObserver: false,
    isDisabledByReducedMotion,
  });

  if (!motion.enabled || isDisabledByReducedMotion) {
    return inactiveResult(local?.trigger || motion.trigger);
  }

  if (local?.mode === 'disabled') {
    return inactiveResult(local.trigger || motion.trigger);
  }

  const useCustom = local?.mode === 'custom';

  // If the block was just revealed by conditional logic, honor either its custom conditional trigger
  // or the global conditionalReveal animation configuration.
  if (context.justRevealedByLogic && !context.forcePlay) {
    if (useCustom && local?.preset && local.preset !== 'none') {
      const durationMs = clampNumber(
        local.durationMs,
        ANIMATION_DURATION_MIN,
        ANIMATION_DURATION_MAX,
        motion.conditionalReveal.durationMs
      );
      const delayMs = clampNumber(
        local.delayMs,
        ANIMATION_DELAY_MIN,
        ANIMATION_DELAY_MAX,
        0
      );
      const direction = local.direction || motion.conditionalReveal.direction;
      const easing = local.easing || motion.conditionalReveal.easing;
      const className = getPresetCssClass(local.preset);
      return {
        active: Boolean(className),
        preset: local.preset,
        trigger: 'on_conditional_show',
        className,
        style: buildAnimationCssVars({
          durationMs,
          delayMs,
          easing,
          direction,
          viewport: context.viewport,
          isExit: local.preset.endsWith('_out'),
        }),
        effectiveDurationMs: durationMs,
        effectiveDelayMs: delayMs,
        needsViewportObserver: false,
        isDisabledByReducedMotion: false,
      };
    }

    if (motion.conditionalReveal.enabled && motion.conditionalReveal.preset !== 'none') {
      const { preset, durationMs, direction, easing } = motion.conditionalReveal;
      const className = getPresetCssClass(preset);
      return {
        active: Boolean(className),
        preset,
        trigger: 'on_conditional_show',
        className,
        style: buildAnimationCssVars({
          durationMs,
          delayMs: 0,
          easing,
          direction,
          viewport: context.viewport,
        }),
        effectiveDurationMs: durationMs,
        effectiveDelayMs: 0,
        needsViewportObserver: false,
        isDisabledByReducedMotion: false,
      };
    }
  }

  const preset: AnimationPresetType = useCustom
    ? local?.preset ?? motion.componentPreset
    : motion.componentPreset;

  const trigger: Exclude<AnimationTrigger, 'on_conditional_result'> = useCustom
    ? local?.trigger ?? motion.trigger
    : motion.trigger;

  if (preset === 'none') {
    return inactiveResult(trigger);
  }

  // Trigger gate: 'on_conditional_show' only plays when revealed by logic (or explicitly replayed in editor)
  if (trigger === 'on_conditional_show' && !context.justRevealedByLogic && !context.forcePlay) {
    return inactiveResult(trigger);
  }

  // Trigger gate: 'on_page_change' plays after navigation (tick > 0) or when explicitly replayed
  if (trigger === 'on_page_change' && !(context.pageTransitionTick && context.pageTransitionTick > 0) && !context.forcePlay) {
    return inactiveResult(trigger);
  }

  const durationMs = clampNumber(
    useCustom ? local?.durationMs : undefined,
    ANIMATION_DURATION_MIN,
    ANIMATION_DURATION_MAX,
    motion.durationMs
  );

  const baseDelayMs = clampNumber(
    useCustom ? local?.delayMs : undefined,
    ANIMATION_DELAY_MIN,
    ANIMATION_DELAY_MAX,
    motion.delayMs
  );

  const staggerIntervalMs = clampNumber(
    useCustom ? local?.staggerIntervalMs : undefined,
    STAGGER_INTERVAL_MIN,
    STAGGER_INTERVAL_MAX,
    motion.staggerIntervalMs
  );

  const maxStagger =
    context.viewport === 'mobile' ? MAX_STAGGER_DELAY_MOBILE_MS : MAX_STAGGER_DELAY_DESKTOP_MS;

  const staggerExtraMs =
    preset === 'stagger' && !context.forcePlay
      ? Math.min(Math.max(0, context.indexInContainer) * staggerIntervalMs, maxStagger)
      : 0;

  const effectiveDelayMs = baseDelayMs + staggerExtraMs;

  const direction: AnimationDirection = useCustom
    ? local?.direction || motion.direction
    : motion.direction;

  const easing: AnimationEasing = useCustom ? local?.easing || motion.easing : motion.easing;
  const className = getPresetCssClass(preset);
  const isExit = preset === 'fade_out' || preset === 'slide_out' || preset === 'scale_out';

  return {
    active: Boolean(className),
    preset,
    trigger,
    className,
    style: buildAnimationCssVars({
      durationMs,
      delayMs: effectiveDelayMs,
      easing,
      direction,
      viewport: context.viewport,
      isExit,
    }),
    effectiveDurationMs: durationMs,
    effectiveDelayMs,
    needsViewportObserver: trigger === 'on_viewport_enter' && !context.forcePlay,
    isDisabledByReducedMotion: false,
  };
}

// ============================================================================
// Page & Conversational 1-by-1 Transition Resolution
// ============================================================================

export type NavigationDirection = 'forward' | 'backward';
export type TransitionPhase = 'idle' | 'exiting' | 'entering';

export interface ResolvedPageTransition {
  active: boolean;
  phase: TransitionPhase;
  preset: AnimationPresetType;
  className: string;
  style: React.CSSProperties;
  exitDurationMs: number;
  enterDurationMs: number;
}

function resolveDirectionalPageVector(
  configured: AnimationDirection,
  navDirection: NavigationDirection
): AnimationDirection {
  if (configured !== 'auto') {
    if (navDirection === 'backward') {
      if (configured === 'left') return 'right';
      if (configured === 'right') return 'left';
      if (configured === 'up') return 'down';
      if (configured === 'down') return 'up';
    }
    return configured;
  }
  // Auto direction: forward glides in from right -> left, backward glides in from left -> right
  return navDirection === 'forward' ? 'left' : 'right';
}

/**
 * Resolves the enter/exit CSS transition for stepped pages and conversational 1-by-1 views.
 * Automatically reverses direction when navigating backward and collapses to instant under reduced motion.
 */
export function resolvePageTransition(
  design: Partial<FormDesignConfig> | undefined,
  options: {
    phase: TransitionPhase;
    navDirection: NavigationDirection;
    viewport?: ViewportMode;
    reducedMotion?: boolean;
  }
): ResolvedPageTransition {
  const motion = normalizeFormMotionConfig(design);
  const pt = motion.pageTransition;
  const reduced = Boolean(options.reducedMotion && motion.respectReducedMotion);

  if (!motion.enabled || !pt.enabled || reduced) {
    return {
      active: false,
      phase: 'idle',
      preset: 'none',
      className: '',
      style: {},
      exitDurationMs: 0,
      enterDurationMs: 0,
    };
  }

  // Keep exit phase crisp & slightly faster than enter so transitions never feel sluggish
  const enterDurationMs = pt.enterPreset === 'none' ? 0 : pt.durationMs;
  const exitDurationMs =
    pt.exitPreset === 'none' ? 0 : Math.max(80, Math.round(pt.durationMs * 0.65));

  if (options.phase === 'idle') {
    return {
      active: false,
      phase: 'idle',
      preset: 'none',
      className: '',
      style: {},
      exitDurationMs,
      enterDurationMs,
    };
  }

  const isExit = options.phase === 'exiting';
  const preset: AnimationPresetType = isExit ? pt.exitPreset : pt.enterPreset;
  if (preset === 'none') {
    return {
      active: false,
      phase: options.phase,
      preset: 'none',
      className: '',
      style: {},
      exitDurationMs,
      enterDurationMs,
    };
  }

  const effectiveDirection = resolveDirectionalPageVector(pt.direction, options.navDirection);
  const durationMs = isExit ? exitDurationMs : enterDurationMs;
  const className = getPresetCssClass(preset);

  return {
    active: Boolean(className),
    phase: options.phase,
    preset,
    className,
    style: buildAnimationCssVars({
      durationMs,
      delayMs: 0,
      easing: pt.easing,
      direction: effectiveDirection,
      viewport: options.viewport,
      isExit,
    }),
    exitDurationMs,
    enterDurationMs,
  };
}

// ============================================================================
// Conditional Result Screen & Logic Message Callout Animation
// ============================================================================

export interface ResolvedResultAnimation {
  active: boolean;
  preset: AnimationPresetType;
  className: string;
  style: React.CSSProperties;
  durationMs: number;
}

export function resolveResultScreenAnimation(
  design: Partial<FormDesignConfig> | undefined,
  options: {
    viewport?: ViewportMode;
    reducedMotion?: boolean;
  } = {}
): ResolvedResultAnimation {
  const motion = normalizeFormMotionConfig(design);
  const rs = motion.resultScreen;
  const reduced = Boolean(options.reducedMotion && motion.respectReducedMotion);

  if (!motion.enabled || !rs.enabled || rs.preset === 'none' || reduced) {
    return {
      active: false,
      preset: 'none',
      className: '',
      style: {},
      durationMs: 0,
    };
  }

  const className = getPresetCssClass(rs.preset);
  return {
    active: Boolean(className),
    preset: rs.preset,
    className,
    style: buildAnimationCssVars({
      durationMs: rs.durationMs,
      delayMs: 0,
      easing: rs.easing,
      direction: rs.direction,
      viewport: options.viewport,
    }),
    durationMs: rs.durationMs,
  };
}

// ============================================================================
// Progress Bar Transition Resolution
// ============================================================================

export function resolveProgressBarTransition(
  design: Partial<FormDesignConfig> | undefined,
  reducedMotion?: boolean
): React.CSSProperties {
  const motion = normalizeFormMotionConfig(design);
  const reduced = Boolean(reducedMotion && motion.respectReducedMotion);

  if (!motion.enabled || reduced || motion.progressTransition.style === 'none') {
    return { transition: 'none' };
  }

  const option =
    PROGRESS_TRANSITION_OPTIONS.find((o) => o.id === motion.progressTransition.style) ||
    PROGRESS_TRANSITION_OPTIONS[0];

  return {
    transitionProperty: 'width',
    transitionDuration: `${motion.progressTransition.durationMs}ms`,
    transitionTimingFunction: option.cssEasing,
  };
}

// ============================================================================
// Helpers for Editor Introspection
// ============================================================================

export function hasCustomComponentAnimation(node: FormComponentNode): boolean {
  const anim = node.appearance?.animation;
  if (!anim) return false;
  return anim.mode === 'custom' || anim.mode === 'disabled';
}
