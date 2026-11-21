/**
 * FlexStore / AuraForm Studio — Unified Rendering Engine (Phase 2, Step 2)
 *
 * Converts a FormDocument (v2) into the respondent-facing form experience across:
 *  - Standard (single-page scrolling)
 *  - Stepped (multi-page with dynamic page visibility, branching, skip pages & back stack)
 *  - Conversational (one-question-at-a-time dynamic branching flow)
 *
 * Used identically for Published Forms, Editor Live Preview, PreviewModal, and ThemeStudio
 * so preview and published rendering share 100% identical design tokens, component overrides,
 * responsive rules, conditional logic, dynamic branching, hidden-answer policies, and validation.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  CheckCircle,
  ArrowCounterClockwise,
  Eye,
  Info,
  Warning,
  WarningCircle,
} from '@phosphor-icons/react';
import { FormSchema } from '../../types/form';
import { FormComponentNode, FormDocument } from '../document/types';
import { LogicMessage } from '../logic/types';
import { isSafeHttpUrl } from '../logic/registries';
import { migrateLegacyFormToDocument } from '../document/migration';
import {
  resolveComponentGridClass,
  resolveComponentTokens,
  resolveDesignTokens,
  ViewportMode,
} from './design-engine';
import {
  normalizeFormMotionConfig,
  resolveComponentAnimation,
  resolvePageTransition,
  resolveProgressBarTransition,
  resolveResultScreenAnimation,
  type NavigationDirection,
  type ResolvedComponentAnimation,
  type TransitionPhase,
} from './animation-engine';
import { defaultLogicEngine, ILogicEngine } from './logic-engine';
import { IncrementalCalculationCache } from './calculation-engine';
import { pipeComponentNode, PipingContext, resolvePipedText } from './piping-engine';
import {
  computeConversationalProgress,
  computeSteppedProgress,
  getVisibleConversationalNodes,
  getVisiblePages,
  resolveConversationalNext,
  resolveSteppedNext,
} from './navigation-engine';
import { validateAndSanitizeSubmission } from './submission-validator';
import { validateCrossFieldRules, validateFieldValue } from './validation-engine';
import {
  buildScoringPipingVariables,
  ResolvedOutcomeResult,
  ScoringEvaluationResult,
} from './scoring-engine';
import { OutcomeResultCard } from './OutcomeResultCard';
import { ComponentRegistry } from '../registry/ComponentRegistry';
import { formComponentRegistry } from '../registry/builtin-components';
import { getAllPageComponents, getOrderedComponents } from './document-engine';
import { FormCustomCodeConfig } from '../document/types';
import {
  buildFormCssScopeId,
  compileDocumentCustomCss,
} from './custom-css-engine';
import { CustomScriptSandbox, SandboxNotice } from './CustomScriptSandbox';
import { getExpandedReusableQuestionNodes } from './reusable-component-engine';

export interface FormSubmitMetadata {
  rawAnswers: Record<string, unknown>;
  endedEarly: boolean;
  endedOnPageId?: string;
  redirectUrl?: string;
  scorePercent?: number;
  categoryScores?: Record<
    string,
    { name: string; score: number; maxScore: number; percent: number; band?: string }
  >;
  outcomeId?: string;
  outcomeName?: string;
}

export interface FormDocumentRendererProps {
  source: FormDocument | FormSchema;
  onSubmit?: (
    answers: Record<string, any>,
    durationSeconds: number,
    score?: number,
    maxScore?: number,
    meta?: FormSubmitMetadata
  ) => void;
  registry?: ComponentRegistry;
  logicEngine?: ILogicEngine;
  /** Forces a specific responsive breakpoint inside Desktop/Tablet/Mobile preview frames */
  viewportOverride?: ViewportMode;
  /** When true, marks the run as a non-persisting interactive preview */
  isPreview?: boolean;
  /** When true, fits cleanly inside an embedded panel rather than forcing 100dvh */
  embedded?: boolean;
  /** Optional initial page index (0-based) for stepped previewing */
  initialPageIndex?: number;
  /** Preview-only unsaved custom CSS/JS draft override (preview before save) */
  customCodeOverride?: FormCustomCodeConfig;
  /** Optional suffix to guarantee unique CSS scoping when multiple previews render together */
  scopeInstanceSuffix?: string;
  /** Creator-only callback receiving sanitized logs from the isolated JS sandbox */
  onSandboxLog?: (message: string) => void;
  /** Creator-only callback receiving sanitized runtime errors from the isolated JS sandbox */
  onSandboxError?: (errorMessage: string) => void;
  /** Optional preview-only override to simulate prefers-reduced-motion: reduce */
  forceReducedMotion?: boolean;
  /** Optional monotonic counter to replay entrance animations on demand in Editor / ThemeStudio */
  animationReplayNonce?: number;
}

interface AnimatedFormBlockProps {
  componentId: string;
  componentType: string;
  animation: ResolvedComponentAnimation;
  replayKey: string;
  className: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

const AnimatedFormBlock: React.FC<AnimatedFormBlockProps> = ({
  componentId,
  componentType,
  animation,
  replayKey,
  className,
  style,
  children,
}) => {
  const blockRef = useRef<HTMLDivElement | null>(null);
  const [hasEnteredViewport, setHasEnteredViewport] = useState(
    () => !animation.needsViewportObserver || typeof IntersectionObserver === 'undefined'
  );

  useEffect(() => {
    if (!animation.needsViewportObserver) {
      setHasEnteredViewport(true);
      return;
    }
    if (typeof IntersectionObserver === 'undefined') {
      setHasEnteredViewport(true);
      return;
    }
    const el = blockRef.current;
    if (!el) return;

    setHasEnteredViewport(false);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setHasEnteredViewport(true);
          observer.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -16px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [animation.needsViewportObserver, replayKey]);

  const animClass = !animation.active
    ? ''
    : animation.needsViewportObserver && !hasEnteredViewport
    ? 'fs-anim-awaiting-viewport'
    : animation.className;

  const mergedStyle: React.CSSProperties | undefined =
    animation.active && (!animation.needsViewportObserver || hasEnteredViewport)
      ? { ...(style || {}), ...animation.style }
      : style;

  return (
    <div
      ref={blockRef}
      data-fs-component={componentId}
      data-fs-type={componentType}
      data-fs-anim-preset={animation.active ? animation.preset : 'none'}
      data-fs-anim-trigger={animation.trigger}
      className={`${className} ${animClass}`.trim()}
      style={mergedStyle}
    >
      {children}
    </div>
  );
};

export const FormDocumentRenderer: React.FC<FormDocumentRendererProps> = ({
  source,
  onSubmit,
  registry = formComponentRegistry,
  logicEngine = defaultLogicEngine,
  viewportOverride,
  isPreview = false,
  embedded = false,
  initialPageIndex = 0,
  customCodeOverride,
  scopeInstanceSuffix,
  onSandboxLog,
  onSandboxError,
  forceReducedMotion = false,
  animationReplayNonce = 0,
}) => {
  const document = useMemo(() => migrateLegacyFormToDocument(source), [source]);
  const effectiveViewport: ViewportMode = viewportOverride || 'desktop';
  const tokens = useMemo(
    () => resolveDesignTokens(document.design, effectiveViewport),
    [document.design, effectiveViewport]
  );
  const motionConfig = useMemo(
    () => normalizeFormMotionConfig(document.design),
    [document.design]
  );

  // Reactive prefers-reduced-motion media query listener
  const [osReducedMotion, setOsReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setOsReducedMotion(e.matches);
    setOsReducedMotion(mq.matches);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    return undefined;
  }, []);

  const effectiveReducedMotion = Boolean(
    forceReducedMotion || (osReducedMotion && motionConfig.respectReducedMotion)
  );

  // Scoped custom CSS (strictly isolated to this form instance)
  const formScopeId = useMemo(
    () => buildFormCssScopeId(document.id, scopeInstanceSuffix),
    [document.id, scopeInstanceSuffix]
  );
  const compiledCustomCss = useMemo(
    () =>
      compileDocumentCustomCss(document, {
        scopeId: formScopeId,
        previewViewport: isPreview ? viewportOverride : undefined,
        overrideFormCss: customCodeOverride?.css,
      }),
    [document, formScopeId, isPreview, viewportOverride, customCodeOverride?.css]
  );
  const effectiveCustomJs = customCodeOverride?.js ?? document.customCode?.js;

  const [sandboxNotices, setSandboxNotices] = useState<SandboxNotice[]>([]);
  const [sandboxFieldHints, setSandboxFieldHints] = useState<Record<string, string>>({});

  const initialPageId =
    document.pages[Math.max(0, Math.min(initialPageIndex, Math.max(0, document.pages.length - 1)))]
      ?.id ||
    document.pages[0]?.id ||
    '';

  const [started, setStarted] = useState(!document.welcomeScreen.enabled);
  const [submitted, setSubmitted] = useState(false);
  const [currentPageId, setCurrentPageId] = useState<string>(initialPageId);
  const [currentComponentId, setCurrentComponentId] = useState<string | null>(null);
  const [pageHistory, setPageHistory] = useState<string[]>([]);
  const [componentHistory, setComponentHistory] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const node of Object.values(document.components)) {
      if (node.behaviour.defaultValue !== undefined) {
        initial[node.id] = node.behaviour.defaultValue;
      }
    }
    for (const { node: inner } of getExpandedReusableQuestionNodes(document)) {
      if (inner.behaviour.defaultValue !== undefined) {
        initial[inner.id] = inner.behaviour.defaultValue;
      }
    }
    return initial;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [finalScore, setFinalScore] = useState<{ score: number; maxScore: number } | null>(null);
  const [resolvedScoring, setResolvedScoring] = useState<ScoringEvaluationResult | null>(null);
  const [resolvedOutcome, setResolvedOutcome] = useState<ResolvedOutcomeResult | null>(null);
  const [earlyEndCopy, setEarlyEndCopy] = useState<{
    title?: string;
    message?: string;
    redirectUrl?: string;
  } | null>(null);
  const startTimeRef = useRef(Date.now());
  const calculationCacheRef = useRef(new IncrementalCalculationCache());
  const isSubmittingRef = useRef(false);
  const transitionTimerRef = useRef<number | null>(null);
  const prevVisibleIdsRef = useRef<Set<string> | null>(null);

  // Page & conversational transition state
  const [transitionPhase, setTransitionPhase] = useState<TransitionPhase>('idle');
  const [transitionDirection, setTransitionDirection] = useState<NavigationDirection>('forward');
  const [stepTransitionTick, setStepTransitionTick] = useState<number>(0);
  const [justRevealedIds, setJustRevealedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  // Resolve current page safely even if document pages changed
  const activePage =
    document.pages.find((p) => p.id === currentPageId) || document.pages[0];
  const activePageId = activePage?.id || '';

  const logicResult = useMemo(
    () =>
      logicEngine.evaluate(document, {
        answers,
        currentPageId: activePageId,
        calculationCache: calculationCacheRef.current,
        includeDebugTrace: false,
      }),
    [logicEngine, document, answers, activePageId]
  );

  // Track components that just transitioned from hidden -> visible for `on_conditional_show`
  useEffect(() => {
    const currentSet = logicResult.visibleComponentIds;
    const prevSet = prevVisibleIdsRef.current;
    if (prevSet) {
      const newlyVisible: string[] = [];
      currentSet.forEach((id) => {
        if (!prevSet.has(id)) newlyVisible.push(id);
      });
      if (newlyVisible.length > 0) {
        setJustRevealedIds(new Set(newlyVisible));
      } else if (justRevealedIds.size > 0) {
        setJustRevealedIds(new Set());
      }
    }
    prevVisibleIdsRef.current = new Set(currentSet);
  }, [logicResult.visibleComponentIds]);

  // Merge live calculated component values over user answers for rendering
  const effectiveAnswers = useMemo(() => {
    const calcEntries = Object.entries(logicResult.calculatedComponentValues || {});
    if (calcEntries.length === 0) return answers;
    return {
      ...answers,
      ...logicResult.calculatedComponentValues,
    };
  }, [answers, logicResult.calculatedComponentValues]);

  // Unified plain-text piping context (never renders HTML)
  const pipingContext: PipingContext = useMemo(
    () => ({
      document,
      answers: effectiveAnswers,
      variables: logicResult.resolvedVariables,
      formattedVariables: logicResult.formattedVariables,
    }),
    [document, effectiveAnswers, logicResult.resolvedVariables, logicResult.formattedVariables]
  );

  // Visible pages (excluding hidden & skipped pages)
  const visiblePages = useMemo(
    () => getVisiblePages(document, logicResult),
    [document, logicResult]
  );

  // Ensure current page in stepped mode is navigable if the current one was dynamically hidden
  const effectiveSteppedPage = useMemo(() => {
    if (
      activePage &&
      logicResult.visiblePageIds.has(activePage.id) &&
      !logicResult.skippedPageIds.has(activePage.id)
    ) {
      return activePage;
    }
    return visiblePages[0] || activePage;
  }, [activePage, visiblePages, logicResult.visiblePageIds, logicResult.skippedPageIds]);

  const effectiveSteppedPageId = effectiveSteppedPage?.id || '';
  const effectiveSteppedPageIndex = document.pages.findIndex(
    (p) => p.id === effectiveSteppedPageId
  );

  // Flat pre-order list (including nested children) for standard mode & validation
  const orderedNodes = useMemo(() => getOrderedComponents(document), [document]);
  const visibleNodes = useMemo(
    () =>
      orderedNodes.filter((n) => {
        if (!logicResult.visibleComponentIds.has(n.id)) return false;
        if (viewportOverride && n.layout.responsive?.[viewportOverride]?.hidden) return false;
        return true;
      }),
    [orderedNodes, logicResult.visibleComponentIds, viewportOverride]
  );

  // Conversational visible question/content nodes across navigable pages
  const conversationalNodes = useMemo(
    () => getVisibleConversationalNodes(document, logicResult, viewportOverride),
    [document, logicResult, viewportOverride]
  );

  const activeConversationalNode = useMemo(() => {
    if (conversationalNodes.length === 0) return undefined;
    if (currentComponentId) {
      const match = conversationalNodes.find((n) => n.id === currentComponentId);
      if (match) return match;
    }
    return conversationalNodes[0];
  }, [conversationalNodes, currentComponentId]);

  const isMultiPageStepped = document.layoutMode === 'stepped' && document.pages.length > 1;
  const isConversational =
    document.layoutMode === 'conversational' && conversationalNodes.length > 0;

  // Top-level nodes to render in standard or stepped mode
  const topLevelNodes = useMemo(() => {
    const pagesToShow =
      isMultiPageStepped && effectiveSteppedPage
        ? [effectiveSteppedPage]
        : visiblePages;
    const result: FormComponentNode[] = [];
    for (const page of pagesToShow) {
      for (const id of page.componentIds) {
        const node = document.components[id];
        if (node && logicResult.visibleComponentIds.has(node.id)) {
          if (viewportOverride && node.layout.responsive?.[viewportOverride]?.hidden) continue;
          result.push(node);
        }
      }
    }
    return result;
  }, [
    document,
    isMultiPageStepped,
    effectiveSteppedPage,
    visiblePages,
    logicResult.visibleComponentIds,
    viewportOverride,
  ]);

  // Honest, non-misleading progress calculation for Linear vs Dynamic Branching forms
  const progressDisplay = useMemo(() => {
    if (isConversational && activeConversationalNode) {
      const dyn = computeConversationalProgress(
        document,
        activeConversationalNode.id,
        componentHistory.length + 1,
        logicResult,
        viewportOverride
      );
      return {
        visible: conversationalNodes.length > 0,
        label: dyn.label,
        detailLabel: dyn.detailLabel,
        barPercent: dyn.barPercent,
        isDynamicBranching: dyn.isDynamicBranching,
      };
    }

    if (isMultiPageStepped && effectiveSteppedPageId) {
      const dyn = computeSteppedProgress(
        document,
        effectiveSteppedPageId,
        pageHistory.length + 1,
        logicResult
      );
      return {
        visible: visiblePages.length > 0,
        label: dyn.label,
        detailLabel: dyn.detailLabel,
        barPercent: dyn.barPercent,
        isDynamicBranching: dyn.isDynamicBranching,
      };
    }

    const questionNodes = visibleNodes.filter((n) => {
      const def = registry.get(n.type);
      return !def || def.isQuestion;
    });
    const total = questionNodes.length;
    if (total === 0) {
      return {
        visible: false,
        label: '',
        detailLabel: '',
        barPercent: 0,
        isDynamicBranching: false,
      };
    }
    const answered = questionNodes.filter((n) => {
      const val = effectiveAnswers[n.id];
      if (val === undefined || val === null || val === '') return false;
      if (Array.isArray(val) && val.length === 0) return false;
      return true;
    }).length;
    const pct = Math.round((answered / total) * 100);
    return {
      visible: true,
      label: `${answered} of ${total} answered`,
      detailLabel: `${pct}%`,
      barPercent: pct,
      isDynamicBranching: false,
    };
  }, [
    isConversational,
    activeConversationalNode,
    document,
    componentHistory.length,
    logicResult,
    viewportOverride,
    conversationalNodes.length,
    isMultiPageStepped,
    effectiveSteppedPageId,
    pageHistory.length,
    visiblePages.length,
    visibleNodes,
    registry,
    effectiveAnswers,
  ]);

  // Preview next action label accurately (Continue / Next / Finish / Submit)
  const previewNextDestination = useMemo(() => {
    if (isConversational && activeConversationalNode) {
      return resolveConversationalNext(
        document,
        activeConversationalNode.id,
        answers,
        componentHistory,
        logicEngine,
        viewportOverride
      );
    }
    if (isMultiPageStepped && effectiveSteppedPageId) {
      return resolveSteppedNext(
        document,
        effectiveSteppedPageId,
        answers,
        pageHistory,
        logicEngine
      );
    }
    return null;
  }, [
    isConversational,
    activeConversationalNode,
    isMultiPageStepped,
    effectiveSteppedPageId,
    document,
    answers,
    componentHistory,
    pageHistory,
    logicEngine,
    viewportOverride,
  ]);

  const primaryColor = tokens.colors.primary;

  const handleFieldChange = (componentId: string, nextVal: unknown) => {
    setAnswers((prev) => {
      const updated: Record<string, unknown> = { ...prev, [componentId]: nextVal };

      // Enforce explicit hiddenFieldPolicy: ONLY clear hidden answers immediately when
      // the creator explicitly opted into 'clear_on_hide'. Default policy preserves answers
      // during editing/back-navigation and strips them deterministically on submission.
      if (document.settings.hiddenFieldPolicy === 'clear_on_hide') {
        const nextLogic = logicEngine.evaluate(document, {
          answers: updated,
          currentPageId: activePageId,
          includeDebugTrace: false,
        });
        for (const key of Object.keys(updated)) {
          if (key !== componentId && !nextLogic.visibleComponentIds.has(key)) {
            delete updated[key];
          }
        }
      }
      return updated;
    });

    if (errors[componentId]) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[componentId];
        return copy;
      });
    }
  };

  const validateNodes = (nodesToCheck: FormComponentNode[]): Record<string, string> => {
    const nextErrors: Record<string, string> = {};
    const activeIds = new Set<string>();

    const reusableInstanceIds = new Set<string>();
    for (const node of nodesToCheck) {
      if (!logicResult.visibleComponentIds.has(node.id)) continue;
      if (logicResult.disabledComponentIds.has(node.id)) continue;
      if (viewportOverride && node.layout.responsive?.[viewportOverride]?.hidden) continue;

      if (node.type === 'reusable_instance') {
        reusableInstanceIds.add(node.id);
        continue;
      }

      const def = registry.get(node.type);
      if (def && !def.isQuestion) continue;

      activeIds.add(node.id);
      const isRequired = logicResult.requiredComponentIds.has(node.id);
      const val = effectiveAnswers[node.id];

      const check = validateFieldValue(node, val, { required: isRequired });
      if (!check.valid && check.error) {
        nextErrors[node.id] = check.error;
      }
    }

    // Validate all internal interactive questions inside visible reusable component instances
    if (reusableInstanceIds.size > 0) {
      const expanded = getExpandedReusableQuestionNodes(document, {
        visibleComponentIds: logicResult.visibleComponentIds,
        disabledComponentIds: logicResult.disabledComponentIds,
        viewport: effectiveViewport,
        onlyForInstanceIds: reusableInstanceIds,
      });
      for (const { node: innerNode, disabled } of expanded) {
        if (disabled) continue;
        activeIds.add(innerNode.id);
        const val = effectiveAnswers[innerNode.id];
        const check = validateFieldValue(innerNode, val, {
          required: Boolean(innerNode.validation.required),
        });
        if (!check.valid && check.error) {
          nextErrors[innerNode.id] = check.error;
        }
      }
    }

    // Evaluate cross-field rules targeting any active node on this step/page
    const crossFieldErrs = validateCrossFieldRules(
      document,
      effectiveAnswers,
      {
        visibleComponentIds: logicResult.visibleComponentIds,
        disabledComponentIds: logicResult.disabledComponentIds,
        activeComponentIds: activeIds,
      },
      pipingContext
    );
    for (const [compId, msg] of Object.entries(crossFieldErrs)) {
      if (!nextErrors[compId]) {
        nextErrors[compId] = msg;
      }
    }

    return nextErrors;
  };

  const finalizeSubmit = (customEnd?: {
    title?: string;
    message?: string;
    redirectUrl?: string;
    endedEarly?: boolean;
    endedOnPageId?: string;
  }) => {
    // Duplicate submission guard: never fire onSubmit twice during transitions or rapid double-clicks
    if (isSubmittingRef.current || submitted) return;

    const durationSeconds = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
    const endedEarlyFlag = Boolean(customEnd?.endedEarly || logicResult.endFormTriggered);
    const endedOnPageId = customEnd?.endedOnPageId || effectiveSteppedPageId || activePageId;

    // Run unified validator & hiddenFieldPolicy sanitizer identically to the backend
    const validation = validateAndSanitizeSubmission(document, answers, {
      logicEngine,
      endedEarly: endedEarlyFlag,
      endedOnPageId,
    });

    if (!endedEarlyFlag && !validation.valid) {
      setErrors(validation.errors);
      return;
    }

    isSubmittingRef.current = true;
    if (transitionTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    setTransitionPhase('idle');

    if (validation.scoring?.enabled) {
      setResolvedScoring(validation.scoring);
      setFinalScore({
        score: validation.scoring.totalScore,
        maxScore: validation.scoring.maxScore,
      });
    } else if (
      document.settings.isQuizMode &&
      validation.score !== undefined &&
      validation.maxScore !== undefined
    ) {
      setFinalScore({ score: validation.score, maxScore: validation.maxScore });
      setResolvedScoring(null);
    } else {
      setFinalScore(null);
      setResolvedScoring(null);
    }

    setResolvedOutcome(validation.selectedOutcome || null);

    const rawRedirect =
      customEnd?.redirectUrl ||
      validation.redirectUrl ||
      document.thankYouScreen.redirectUrl ||
      undefined;
    const safeRedirect = rawRedirect && isSafeHttpUrl(rawRedirect) ? rawRedirect : undefined;

    if (customEnd?.title || customEnd?.message || safeRedirect) {
      setEarlyEndCopy({
        title: customEnd?.title,
        message: customEnd?.message,
        redirectUrl: safeRedirect,
      });
    } else if (
      logicResult.endFormTriggered &&
      (logicResult.endFormTitle || logicResult.endFormMessage || logicResult.endFormRedirectUrl)
    ) {
      setEarlyEndCopy({
        title: logicResult.endFormTitle,
        message: logicResult.endFormMessage,
        redirectUrl: safeRedirect,
      });
    } else {
      setEarlyEndCopy(null);
    }

    // Never persist submissions during Preview Mode
    if (!isPreview && onSubmit) {
      onSubmit(
        validation.sanitizedAnswers,
        durationSeconds,
        validation.score,
        validation.maxScore,
        {
          rawAnswers: answers,
          endedEarly: endedEarlyFlag,
          endedOnPageId,
          redirectUrl: safeRedirect,
          scorePercent: validation.scorePercent,
          categoryScores: validation.categoryScores,
          outcomeId: validation.outcomeId,
          outcomeName: validation.outcomeName,
        }
      );
    }
    setSubmitted(true);

    if (document.design.enableConfetti && !effectiveReducedMotion) {
      try {
        confetti({ particleCount: 70, spread: 65, origin: { y: 0.65 } });
      } catch {
        // Ignore confetti errors in headless environments
      }
    }
  };

  // Push safe browser history state for published multi-page / conversational navigation (preserves answers)
  const pushFormHistoryEntry = useCallback(
    (entry: {
      pageId: string;
      componentId: string | null;
      pageHistory: string[];
      componentHistory: string[];
    }) => {
      if (isPreview || embedded || typeof window === 'undefined' || !window.history?.pushState) {
        return;
      }
      try {
        window.history.pushState(
          {
            __fsFormNav: true,
            formId: document.id,
            ...entry,
          },
          ''
        );
      } catch {
        // Ignore SecurityError in sandboxed iframes
      }
    },
    [isPreview, embedded, document.id]
  );

  // Direction-aware transition runner for both stepped pages and conversational 1-by-1 views
  const runStepTransition = useCallback(
    (
      direction: NavigationDirection,
      applyNavigation: () => void,
      historySnapshot?: {
        pageId: string;
        componentId: string | null;
        pageHistory: string[];
        componentHistory: string[];
      }
    ) => {
      if (transitionTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }

      const exitPlan = resolvePageTransition(document.design, {
        phase: 'exiting',
        navDirection: direction,
        viewport: effectiveViewport,
        reducedMotion: effectiveReducedMotion,
      });

      const enterPlan = resolvePageTransition(document.design, {
        phase: 'entering',
        navDirection: direction,
        viewport: effectiveViewport,
        reducedMotion: effectiveReducedMotion,
      });

      setTransitionDirection(direction);

      const finishEnter = () => {
        applyNavigation();
        if (historySnapshot) {
          pushFormHistoryEntry(historySnapshot);
        }
        setStepTransitionTick((t) => t + 1);
        if (enterPlan.active && enterPlan.enterDurationMs > 0 && typeof window !== 'undefined') {
          setTransitionPhase('entering');
          transitionTimerRef.current = window.setTimeout(() => {
            setTransitionPhase('idle');
            transitionTimerRef.current = null;
          }, enterPlan.enterDurationMs + 20);
        } else {
          setTransitionPhase('idle');
        }
      };

      if (exitPlan.active && exitPlan.exitDurationMs > 0 && typeof window !== 'undefined') {
        setTransitionPhase('exiting');
        transitionTimerRef.current = window.setTimeout(() => {
          transitionTimerRef.current = null;
          finishEnter();
        }, exitPlan.exitDurationMs);
      } else {
        finishEnter();
      }
    },
    [document.design, effectiveViewport, effectiveReducedMotion, pushFormHistoryEntry]
  );

  // Support browser back/forward buttons on published multi-page / conversational forms while preserving answers
  useEffect(() => {
    if (isPreview || embedded || typeof window === 'undefined') return;
    if (!isMultiPageStepped && !isConversational) return;

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state;
      if (!state || state.__fsFormNav !== true || state.formId !== document.id) return;
      setErrors({});
      runStepTransition('backward', () => {
        if (typeof state.pageId === 'string') setCurrentPageId(state.pageId);
        if (state.componentId === null || typeof state.componentId === 'string') {
          setCurrentComponentId(state.componentId);
        }
        if (Array.isArray(state.pageHistory)) setPageHistory(state.pageHistory);
        if (Array.isArray(state.componentHistory)) setComponentHistory(state.componentHistory);
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isPreview, embedded, isMultiPageStepped, isConversational, document.id, runStepTransition]);

  const handleNextStep = () => {
    if (transitionPhase === 'exiting' || isSubmittingRef.current || submitted) return;

    if (isConversational && activeConversationalNode) {
      const errs = validateNodes([activeConversationalNode]);
      if (Object.keys(errs).length > 0) {
        setErrors(errs);
        return;
      }

      const next = resolveConversationalNext(
        document,
        activeConversationalNode.id,
        answers,
        componentHistory,
        logicEngine,
        viewportOverride
      );

      if (next.kind === 'end_form') {
        finalizeSubmit({
          title: next.title,
          message: next.message,
          redirectUrl: next.redirectUrl,
          endedEarly: true,
          endedOnPageId: activeConversationalNode.pageId,
        });
        return;
      }

      if (next.kind === 'component') {
        const nextHistory = [...componentHistory.slice(-40), activeConversationalNode.id];
        const nextComp = document.components[next.componentId];
        const nextPageId = nextComp ? nextComp.pageId : activePageId;
        runStepTransition(
          'forward',
          () => {
            setComponentHistory(nextHistory);
            setCurrentComponentId(next.componentId);
            if (nextComp) setCurrentPageId(nextComp.pageId);
          },
          {
            pageId: nextPageId,
            componentId: next.componentId,
            pageHistory,
            componentHistory: nextHistory,
          }
        );
        return;
      }

      finalizeSubmit();
      return;
    }

    if (isMultiPageStepped && effectiveSteppedPage) {
      const pageNodes = getAllPageComponents(document, effectiveSteppedPage.id);
      const errs = validateNodes(pageNodes);
      if (Object.keys(errs).length > 0) {
        setErrors(errs);
        return;
      }

      const next = resolveSteppedNext(
        document,
        effectiveSteppedPage.id,
        answers,
        pageHistory,
        logicEngine
      );

      if (next.kind === 'end_form') {
        finalizeSubmit({
          title: next.title,
          message: next.message,
          redirectUrl: next.redirectUrl,
          endedEarly: true,
          endedOnPageId: effectiveSteppedPage.id,
        });
        return;
      }

      if (next.kind === 'page') {
        const nextPageHist = [...pageHistory.slice(-40), effectiveSteppedPage.id];
        runStepTransition(
          'forward',
          () => {
            setPageHistory(nextPageHist);
            setCurrentPageId(next.pageId);
          },
          {
            pageId: next.pageId,
            componentId: currentComponentId,
            pageHistory: nextPageHist,
            componentHistory,
          }
        );
        return;
      }

      finalizeSubmit();
    }
  };

  const handlePreviousStep = () => {
    if (transitionPhase === 'exiting' || isSubmittingRef.current) return;
    setErrors({});
    if (isConversational) {
      if (componentHistory.length > 0) {
        const prevCompId = componentHistory[componentHistory.length - 1];
        const nextCompHistory = componentHistory.slice(0, -1);
        const prevNode = document.components[prevCompId];
        runStepTransition(
          'backward',
          () => {
            setComponentHistory(nextCompHistory);
            setCurrentComponentId(prevCompId);
            if (prevNode) setCurrentPageId(prevNode.pageId);
          },
          {
            pageId: prevNode ? prevNode.pageId : activePageId,
            componentId: prevCompId,
            pageHistory,
            componentHistory: nextCompHistory,
          }
        );
      } else if (activeConversationalNode) {
        const idx = conversationalNodes.findIndex((n) => n.id === activeConversationalNode.id);
        if (idx > 0) {
          const prevCompId = conversationalNodes[idx - 1].id;
          runStepTransition('backward', () => {
            setCurrentComponentId(prevCompId);
          });
        }
      }
      return;
    }

    if (isMultiPageStepped) {
      if (pageHistory.length > 0) {
        const prevPageId = pageHistory[pageHistory.length - 1];
        const nextPageHistory = pageHistory.slice(0, -1);
        runStepTransition(
          'backward',
          () => {
            setPageHistory(nextPageHistory);
            setCurrentPageId(prevPageId);
          },
          {
            pageId: prevPageId,
            componentId: currentComponentId,
            pageHistory: nextPageHistory,
            componentHistory,
          }
        );
      } else {
        const visIdx = visiblePages.findIndex((p) => p.id === effectiveSteppedPageId);
        if (visIdx > 0) {
          const prevPageId = visiblePages[visIdx - 1].id;
          runStepTransition('backward', () => {
            setCurrentPageId(prevPageId);
          });
        }
      }
    }
  };

  const validateAndSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isConversational || isMultiPageStepped) {
      handleNextStep();
      return;
    }

    // Standard single-page mode
    if (logicResult.endFormTriggered) {
      const endDirective = logicResult.navigationDirectives.find((d) => d.actionType === 'end_form');
      finalizeSubmit({
        title: logicResult.endFormTitle || endDirective?.endFormTitle,
        message: logicResult.endFormMessage || endDirective?.endFormMessage,
        redirectUrl: logicResult.endFormRedirectUrl || endDirective?.redirectUrl,
        endedEarly: true,
        endedOnPageId: endDirective?.triggerPageId || activePageId,
      });
      return;
    }

    const nextErrors = validateNodes(visibleNodes);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    finalizeSubmit();
  };

  const handleRestart = () => {
    const initial: Record<string, unknown> = {};
    for (const node of Object.values(document.components)) {
      if (node.behaviour.defaultValue !== undefined) {
        initial[node.id] = node.behaviour.defaultValue;
      }
    }
    setAnswers(initial);
    setErrors({});
    setSubmitted(false);
    isSubmittingRef.current = false;
    setTransitionPhase('idle');
    setStepTransitionTick((t) => t + 1);
    setFinalScore(null);
    setResolvedScoring(null);
    setResolvedOutcome(null);
    setEarlyEndCopy(null);
    setPageHistory([]);
    setComponentHistory([]);
    setCurrentPageId(initialPageId);
    setCurrentComponentId(null);
    setStarted(!document.welcomeScreen.enabled);
    calculationCacheRef.current.clear();
    startTimeRef.current = Date.now();
  };

  const resultScreenAnimation = useMemo(
    () =>
      resolveResultScreenAnimation(document.design, {
        viewport: effectiveViewport,
        reducedMotion: effectiveReducedMotion,
      }),
    [document.design, effectiveViewport, effectiveReducedMotion]
  );

  const pageTransition = useMemo(
    () =>
      resolvePageTransition(document.design, {
        phase: transitionPhase,
        navDirection: transitionDirection,
        viewport: effectiveViewport,
        reducedMotion: effectiveReducedMotion,
      }),
    [document.design, transitionPhase, transitionDirection, effectiveViewport, effectiveReducedMotion]
  );

  const progressBarTransitionStyle = useMemo(
    () => resolveProgressBarTransition(document.design, effectiveReducedMotion),
    [document.design, effectiveReducedMotion]
  );

  const renderLogicMessageCallout = (msg: LogicMessage) => {
    const toneStyles: Record<
      LogicMessage['tone'],
      { bg: string; border: string; text: string; Icon: React.ComponentType<any> }
    > = {
      info: {
        bg: 'rgba(15, 118, 110, 0.08)',
        border: 'rgba(15, 118, 110, 0.28)',
        text: '#0F766E',
        Icon: Info,
      },
      success: {
        bg: 'rgba(16, 185, 129, 0.1)',
        border: 'rgba(16, 185, 129, 0.32)',
        text: '#047857',
        Icon: CheckCircle,
      },
      warning: {
        bg: 'rgba(245, 158, 11, 0.1)',
        border: 'rgba(245, 158, 11, 0.35)',
        text: '#B45309',
        Icon: Warning,
      },
      error: {
        bg: 'rgba(220, 38, 38, 0.08)',
        border: 'rgba(220, 38, 38, 0.3)',
        text: '#B91C1C',
        Icon: WarningCircle,
      },
    };
    const t = toneStyles[msg.tone] || toneStyles.info;
    const Icon = t.Icon;
    return (
      <div
        key={msg.id}
        role={msg.tone === 'error' || msg.tone === 'warning' ? 'alert' : 'status'}
        className={`flex items-start gap-2.5 px-3.5 py-2.5 border text-xs leading-relaxed ${tokens.borderRadiusClass} ${
          resultScreenAnimation.active ? resultScreenAnimation.className : ''
        }`}
        style={{
          backgroundColor: t.bg,
          borderColor: t.border,
          color: t.text,
          ...(resultScreenAnimation.active ? resultScreenAnimation.style : {}),
        }}
      >
        <Icon size={16} weight="fill" className="shrink-0 mt-0.5" />
        <span className="font-medium">{msg.text}</span>
      </div>
    );
  };

  const unanchoredMessages = useMemo(
    () =>
      logicResult.messages.filter(
        (m) => !m.targetComponentId || !document.components[m.targetComponentId]
      ),
    [logicResult.messages, document.components]
  );

  const renderNode = (
    node: FormComponentNode,
    isInsideContainer = false,
    indexInContainer = 0
  ): React.ReactNode => {
    const def = registry.get(node.type);
    const ct = resolveComponentTokens(node, document.design, effectiveViewport);
    if (ct.isHidden) return null;

    const gridClass = isInsideContainer
      ? ''
      : resolveComponentGridClass(node.layout, viewportOverride);

    if (!def) {
      return (
        <div
          key={node.id}
          className={`${gridClass} p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900`}
        >
          Unsupported block type: <code className="font-mono">{node.type}</code>
        </div>
      );
    }

    const RespondentComponent = def.RespondentRenderer;
    let renderedChildren: React.ReactNode = undefined;
    if (def.isContainer && node.children?.length) {
      renderedChildren = node.children
        .map((cid) => document.components[cid])
        .filter((child): child is FormComponentNode =>
          Boolean(child && logicResult.visibleComponentIds.has(child.id))
        )
        .map((child, childIdx) => renderNode(child, true, childIdx));
    }

    const anchoredMessages = logicResult.messages.filter(
      (m) => m.targetComponentId === node.id
    );
    const isDisabled = logicResult.disabledComponentIds.has(node.id);
    const pipedNode = pipeComponentNode(node, pipingContext);

    const sandboxHint = sandboxFieldHints[node.id];

    const resolvedAnim = resolveComponentAnimation(node, document.design, {
      indexInContainer,
      viewport: effectiveViewport,
      reducedMotion: effectiveReducedMotion,
      justRevealedByLogic: justRevealedIds.has(node.id),
      pageTransitionTick: stepTransitionTick,
      forcePlay: animationReplayNonce > 0,
    });

    const replayKey = `${node.id}:${effectiveSteppedPageId}:${stepTransitionTick}:${animationReplayNonce}`;

    return (
      <AnimatedFormBlock
        key={
          resolvedAnim.active &&
          (animationReplayNonce > 0 || resolvedAnim.trigger === 'on_page_change')
            ? replayKey
            : node.id
        }
        componentId={node.id}
        componentType={node.type}
        animation={resolvedAnim}
        replayKey={replayKey}
        className={`fs-field ${gridClass} ${ct.wrapperClassName} min-w-0 space-y-2`}
        style={def.isContainer ? undefined : ct.wrapperStyle}
      >
        {anchoredMessages.map((msg) => renderLogicMessageCallout(msg))}
        <RespondentComponent
          node={pipedNode}
          value={effectiveAnswers[node.id]}
          onChange={(val) => handleFieldChange(node.id, val)}
          error={errors[node.id]}
          required={logicResult.requiredComponentIds.has(node.id)}
          disabled={isDisabled}
          design={document.design}
          primaryColor={primaryColor}
          radiusClass={tokens.borderRadiusClass}
          viewport={effectiveViewport}
          renderedChildren={renderedChildren}
          progressPercent={progressDisplay.barPercent}
          reusableDefinitions={document.componentDefinitions}
          nestedAnswers={effectiveAnswers}
          nestedErrors={errors}
          onNestedChange={handleFieldChange}
          pipeNode={(inner) => pipeComponentNode(inner, pipingContext)}
        />
        {sandboxHint && (
          <p className="text-[11px] font-medium opacity-80 flex items-center gap-1.5 pt-0.5">
            <Info size={13} weight="fill" className="shrink-0" style={{ color: primaryColor }} />
            <span>{sandboxHint}</span>
          </p>
        )}
      </AnimatedFormBlock>
    );
  };

  const canGoBack = isConversational
    ? componentHistory.length > 0
    : isMultiPageStepped
    ? pageHistory.length > 0
    : false;

  const primaryActionLabel = useMemo(() => {
    if (previewNextDestination?.kind === 'end_form') {
      return document.settings.submitButtonText || 'Finish';
    }
    if (isConversational) {
      return previewNextDestination?.kind === 'component'
        ? 'Next'
        : document.settings.submitButtonText || 'Submit';
    }
    if (isMultiPageStepped) {
      return previewNextDestination?.kind === 'page'
        ? 'Continue'
        : document.settings.submitButtonText || 'Submit';
    }
    if (logicResult.endFormTriggered) {
      return document.settings.submitButtonText || 'Finish';
    }
    return document.settings.submitButtonText || 'Submit';
  }, [
    previewNextDestination,
    isConversational,
    isMultiPageStepped,
    logicResult.endFormTriggered,
    document.settings.submitButtonText,
  ]);

  const safeCompletionRedirectUrl =
    earlyEndCopy?.redirectUrl && isSafeHttpUrl(earlyEndCopy.redirectUrl)
      ? earlyEndCopy.redirectUrl
      : document.thankYouScreen.redirectUrl && isSafeHttpUrl(document.thankYouScreen.redirectUrl)
      ? document.thankYouScreen.redirectUrl
      : undefined;

  const sandboxAllowedFieldIds = useMemo(
    () =>
      visibleNodes
        .filter((n) => {
          const def = registry.get(n.type);
          return Boolean(def?.isQuestion && !logicResult.disabledComponentIds.has(n.id));
        })
        .map((n) => n.id),
    [visibleNodes, registry, logicResult.disabledComponentIds]
  );

  return (
    <div
      data-fs-form-scope={formScopeId}
      data-fs-reduced-motion={effectiveReducedMotion ? 'true' : undefined}
      className={`fs-form studio-surface relative w-full overflow-x-hidden flex flex-col justify-center ${
        embedded ? 'min-h-full py-6 px-3 sm:px-5' : 'min-h-[100dvh] py-8 sm:py-12 px-4 sm:px-6'
      } ${tokens.fontFamilyClass}`}
      style={{
        ...tokens.backgroundStyle,
        ...(tokens.cssVariables as React.CSSProperties),
        color: tokens.colors.text,
      }}
    >
      {/* Strictly Form-Scoped Custom CSS (never leaks to host UI or other forms) */}
      {compiledCustomCss.scopedCss && (
        <style data-fs-custom-css={formScopeId}>{compiledCustomCss.scopedCss}</style>
      )}

      {/* Opt-In Isolated Custom JS Sandbox (Opaque-Origin Iframe, Zero Host Access) */}
      {effectiveCustomJs?.enabled && effectiveCustomJs.code.trim() && (
        <CustomScriptSandbox
          enabled={Boolean(effectiveCustomJs.enabled)}
          code={effectiveCustomJs.code}
          timeoutMs={effectiveCustomJs.timeoutMs}
          answers={effectiveAnswers}
          allowedFieldIds={sandboxAllowedFieldIds}
          activePageId={effectiveSteppedPageId || activePageId}
          activePageIndex={Math.max(1, effectiveSteppedPageIndex + 1)}
          onNotice={(notice) =>
            setSandboxNotices((prev) => [...prev.slice(-2), notice])
          }
          onFieldHint={(fieldId, text) =>
            setSandboxFieldHints((prev) => {
              if (!text) {
                const copy = { ...prev };
                delete copy[fieldId];
                return copy;
              }
              return { ...prev, [fieldId]: text };
            })
          }
          onSetFieldValue={(fieldId, value) => {
            // Only allow updating visible, enabled question fields (never bypasses validation)
            if (sandboxAllowedFieldIds.includes(fieldId)) {
              handleFieldChange(fieldId, value);
            }
          }}
          onLog={onSandboxLog}
          onError={onSandboxError}
        />
      )}

      {/* Optimized Background Image Layer (lazy-loaded, zero layout shift) */}
      {tokens.backgroundImageUrl && (
        <img
          src={tokens.backgroundImageUrl}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full pointer-events-none select-none"
          style={tokens.backgroundImageStyle}
        />
      )}

      {/* Optional Background Overlay Scrim for Contrast */}
      {tokens.backgroundOverlayStyle && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={tokens.backgroundOverlayStyle}
        />
      )}

      {/* Main Positioned Form Shell */}
      <div
        className={`relative z-10 w-full ${tokens.containerMaxWidthClass} ${tokens.pageAlignmentClass}`}
      >
        {/* Non-Saving Preview Mode Indicator */}
        {isPreview && (
          <div className="mb-3 px-3.5 py-2 rounded-xl bg-[#0B0D0F]/85 backdrop-blur-md text-[#F7F6F3] text-[11px] flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Eye size={13} weight="bold" className="text-emerald-400 shrink-0" />
              <span>Interactive Preview — responses are not saved</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setSandboxNotices([]);
                setSandboxFieldHints({});
                handleRestart();
              }}
              className="text-[11px] font-mono text-emerald-300 hover:text-white underline underline-offset-2 shrink-0"
            >
              Reset
            </button>
          </div>
        )}

        {/* Welcome Screen */}
        {!started && !submitted && (
          <div
            key={`welcome:${animationReplayNonce}`}
            className={`fs-card fs-welcome-screen ${tokens.internalPaddingClass} ${tokens.borderRadiusClass} space-y-6 text-center ${
              resultScreenAnimation.active ? resultScreenAnimation.className : ''
            }`}
            style={{
              ...tokens.surfaceStyle,
              ...(resultScreenAnimation.active ? resultScreenAnimation.style : {}),
            }}
          >
            <div className={`w-full ${tokens.contentMaxWidthClass} mx-auto space-y-5`}>
              {document.welcomeScreen.coverImage && (
                <img
                  src={document.welcomeScreen.coverImage}
                  alt={document.welcomeScreen.title || document.title}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className={`w-full max-h-56 object-cover ${tokens.borderRadiusClass}`}
                />
              )}
              <h1
                className={`fs-form-title ${tokens.headingSizeClass} font-display font-bold tracking-tight`}
                style={{ ...tokens.headingStyle, textAlign: 'center' }}
              >
                {resolvePipedText(document.welcomeScreen.title || document.title, pipingContext)}
              </h1>
              {document.welcomeScreen.subtitle && (
                <p
                  className={`${tokens.bodySizeClass} opacity-80 max-w-lg mx-auto leading-relaxed`}
                  style={{ ...tokens.bodyStyle, textAlign: 'center' }}
                >
                  {resolvePipedText(document.welcomeScreen.subtitle, pipingContext)}
                </p>
              )}
              <div className="pt-1 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setStarted(true);
                    startTimeRef.current = Date.now();
                  }}
                  className={`fs-submit-btn ${tokens.buttonClassName}`}
                  style={tokens.buttonStyle}
                >
                  <span>{resolvePipedText(document.welcomeScreen.buttonText || 'Start', pipingContext)}</span>
                  <ArrowRight size={16} weight="bold" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Active Form Surface */}
        {started && !submitted && (
          <form
            onSubmit={validateAndSubmit}
            noValidate
            className={`fs-card ${tokens.internalPaddingClass} ${tokens.borderRadiusClass} space-y-7`}
            style={tokens.surfaceStyle}
          >
            <div className={`w-full ${tokens.contentMaxWidthClass} mx-auto space-y-7`}>
              {/* Form / Page Header */}
              <div
                className="space-y-3 pb-4 border-b"
                style={{ borderColor: tokens.colors.border }}
              >
                <div className="space-y-1.5">
                  {isMultiPageStepped && effectiveSteppedPage && (
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-60 block">
                      {progressDisplay.isDynamicBranching
                        ? `Step ${pageHistory.length + 1}${effectiveSteppedPage.title ? ` · ${resolvePipedText(effectiveSteppedPage.title, pipingContext)}` : ''}`
                        : `Page ${Math.max(1, visiblePages.findIndex((p) => p.id === effectiveSteppedPage.id) + 1)} of ${Math.max(1, visiblePages.length)}${effectiveSteppedPage.title ? ` · ${resolvePipedText(effectiveSteppedPage.title, pipingContext)}` : ''}`}
                    </span>
                  )}
                  <h1
                    className={`fs-form-title ${tokens.headingSizeClass} font-display font-bold tracking-tight`}
                    style={tokens.headingStyle}
                  >
                    {resolvePipedText(
                      isMultiPageStepped && effectiveSteppedPageIndex > 0 && effectiveSteppedPage?.title
                        ? effectiveSteppedPage.title
                        : document.title,
                      pipingContext
                    )}
                  </h1>
                  {(isMultiPageStepped && effectiveSteppedPageIndex > 0
                    ? effectiveSteppedPage?.description
                    : document.description) && (
                    <p
                      className={`${tokens.bodySizeClass} opacity-75 leading-relaxed`}
                      style={tokens.bodyStyle}
                    >
                      {resolvePipedText(
                        isMultiPageStepped && effectiveSteppedPageIndex > 0
                          ? effectiveSteppedPage?.description
                          : document.description,
                        pipingContext
                      )}
                    </p>
                  )}
                </div>

                {document.settings.showProgressBar !== false && progressDisplay.visible && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] font-mono opacity-65">
                      <span>{progressDisplay.label}</span>
                      <span className="tabular-nums">{progressDisplay.detailLabel}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-black/[0.08] overflow-hidden">
                      <div
                        className="fs-progress-fill h-full rounded-full"
                        style={{
                          width: `${progressDisplay.barPercent}%`,
                          backgroundColor: primaryColor,
                          ...progressBarTransitionStyle,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Sandboxed Custom Script Notices (Plain Text Only) */}
              {sandboxNotices.length > 0 && (
                <div className="space-y-2">
                  {sandboxNotices.map((notice) =>
                    renderLogicMessageCallout({
                      id: notice.id,
                      ruleId: 'custom_js_sandbox',
                      tone: notice.tone,
                      text: notice.message,
                    })
                  )}
                </div>
              )}

              {/* Inline Page-Level Logic Messages */}
              {unanchoredMessages.length > 0 && (
                <div className="space-y-2">
                  {unanchoredMessages.map((msg) => renderLogicMessageCallout(msg))}
                </div>
              )}

              {/* Conversational 1-by-1 View OR 12-Column Responsive Component Grid with Page Transition */}
              <div
                key={`step:${effectiveSteppedPageId}:${activeConversationalNode?.id || 'grid'}:${stepTransitionTick}:${animationReplayNonce}`}
                data-fs-transition-phase={pageTransition.phase}
                className={pageTransition.active ? pageTransition.className : undefined}
                style={pageTransition.active ? pageTransition.style : undefined}
              >
                {isConversational && activeConversationalNode ? (
                  <div className="py-2">{renderNode(activeConversationalNode, true, 0)}</div>
                ) : (
                  <div className={`grid grid-cols-12 ${tokens.componentGapClass}`}>
                    {topLevelNodes.map((node, idx) => renderNode(node, false, idx))}
                  </div>
                )}
              </div>

              {/* Navigation & Submit Footer */}
              <div
                className="pt-4 border-t flex flex-wrap items-center justify-between gap-3"
                style={{ borderColor: tokens.colors.border }}
              >
                <div>
                  {canGoBack && (
                    <button
                      type="button"
                      disabled={transitionPhase === 'exiting'}
                      onClick={handlePreviousStep}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border transition-colors hover:opacity-80 disabled:opacity-50"
                      style={{
                        borderColor: tokens.colors.border,
                        color: tokens.colors.text,
                      }}
                    >
                      <ArrowLeft size={14} weight="bold" />
                      <span>{isConversational ? 'Back' : 'Previous'}</span>
                    </button>
                  )}
                </div>

                <div className={document.design.buttonFullWidth ? 'w-full' : ''}>
                  <button
                    type="submit"
                    disabled={transitionPhase === 'exiting' || submitted}
                    className={`fs-submit-btn ${tokens.buttonClassName} disabled:opacity-60`}
                    style={tokens.buttonStyle}
                  >
                    <span>{primaryActionLabel}</span>
                    <ArrowRight size={16} weight="bold" />
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* Personalised Outcome Screen OR Standard Thank You / Early Completion Screen */}
        {submitted && resolvedOutcome && !earlyEndCopy?.title && !earlyEndCopy?.message && (
          <div
            key={`outcome:${resolvedOutcome.outcomeId}:${animationReplayNonce}`}
            className={resultScreenAnimation.active ? resultScreenAnimation.className : undefined}
            style={resultScreenAnimation.active ? resultScreenAnimation.style : undefined}
          >
            <OutcomeResultCard
              outcome={resolvedOutcome}
              scoring={resolvedScoring}
              design={document.design}
              viewport={effectiveViewport}
              isPreview={isPreview}
              showRestartButton={Boolean(document.thankYouScreen.showRestartButton)}
              onRestart={handleRestart}
            />
          </div>
        )}

        {submitted && (!resolvedOutcome || Boolean(earlyEndCopy?.title || earlyEndCopy?.message)) && (
          (() => {
            const completionPipingCtx: PipingContext = resolvedScoring?.enabled
              ? {
                  ...pipingContext,
                  variables: {
                    ...pipingContext.variables,
                    ...buildScoringPipingVariables(resolvedScoring, resolvedOutcome?.outcomeName),
                  },
                }
              : pipingContext;

            return (
              <div
                key={`thankyou:${animationReplayNonce}`}
                className={`fs-card fs-thankyou-screen ${tokens.internalPaddingClass} ${tokens.borderRadiusClass} space-y-5 text-center ${
                  resultScreenAnimation.active ? resultScreenAnimation.className : ''
                }`}
                style={{
                  ...tokens.surfaceStyle,
                  ...(resultScreenAnimation.active ? resultScreenAnimation.style : {}),
                }}
              >
                <div
                  className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center"
                  style={{
                    backgroundColor: `${tokens.colors.success}18`,
                    color: tokens.colors.success,
                  }}
                >
                  <CheckCircle size={32} weight="fill" />
                </div>
                <h2
                  className={`${tokens.headingSizeClass} font-display font-bold tracking-tight`}
                  style={{ ...tokens.headingStyle, textAlign: 'center' }}
                >
                  {resolvePipedText(
                    earlyEndCopy?.title || document.thankYouScreen.title || 'Thank you!',
                    completionPipingCtx
                  )}
                </h2>
                <p
                  className={`${tokens.bodySizeClass} opacity-80 max-w-md mx-auto leading-relaxed`}
                  style={{ ...tokens.bodyStyle, textAlign: 'center' }}
                >
                  {earlyEndCopy?.message
                    ? resolvePipedText(earlyEndCopy.message, completionPipingCtx)
                    : document.thankYouScreen.message
                    ? resolvePipedText(document.thankYouScreen.message, completionPipingCtx)
                    : isPreview
                    ? 'Preview completed cleanly! No real submission was recorded.'
                    : 'Your response has been recorded.'}
                </p>
                {isPreview && document.thankYouScreen.message && !earlyEndCopy?.message && (
                  <p className="text-[11px] font-mono opacity-55">
                    Preview mode — no real submission was recorded.
                  </p>
                )}
                {finalScore && finalScore.maxScore > 0 && (
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-black/[0.06] text-sm font-semibold tabular-nums">
                    <span>
                      Score: {finalScore.score} / {finalScore.maxScore}
                    </span>
                    {resolvedScoring?.totalThreshold?.label && (
                      <span className="opacity-70">· {resolvedScoring.totalThreshold.label}</span>
                    )}
                  </div>
                )}
                {resolvedScoring?.enabled && resolvedScoring.categories.length > 0 && (
                  <div className="max-w-md mx-auto text-left space-y-2 pt-2">
                    {resolvedScoring.categories.map((cat) => (
                      <div key={cat.categoryId} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">
                            {cat.name}
                            {cat.threshold?.label ? ` · ${cat.threshold.label}` : ''}
                          </span>
                          <span className="font-mono text-[11px] opacity-70 tabular-nums">
                            {cat.score} / {cat.maxScore} ({cat.percent}%)
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-black/[0.08] overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(0, Math.min(100, cat.percent))}%`,
                              backgroundColor: cat.color || primaryColor,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="pt-1 flex flex-wrap items-center justify-center gap-3">
                  {safeCompletionRedirectUrl && (
                    <a
                      href={safeCompletionRedirectUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={tokens.buttonClassName}
                      style={tokens.buttonStyle}
                    >
                      <span>Continue to Result Page</span>
                      <ArrowSquareOut size={15} weight="bold" />
                    </a>
                  )}
                  {(document.thankYouScreen.showRestartButton || isPreview) && (
                    <button
                      type="button"
                      onClick={handleRestart}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-xl border hover:opacity-80 transition-opacity"
                      style={{
                        borderColor: tokens.colors.border,
                        color: tokens.colors.text,
                      }}
                    >
                      <ArrowCounterClockwise size={14} weight="bold" />
                      <span>{isPreview ? 'Restart preview' : 'Submit another response'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
};
