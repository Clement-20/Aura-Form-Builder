/**
 * FlexStore Form Studio — Unified Client & Server-Side Submission Validator (Phase 2, Step 4)
 *
 * Independently re-evaluates all conditional logic, visibility (including hidden sections,
 * containers, and pages), disabled states, dynamic requirements, ALL advanced field constraints,
 * cross-field validation rules, calculated variables & formulas, multi-category scoring,
 * personalised outcome resolution, and hidden-answer sanitization policy.
 *
 * Security guarantees:
 *  - Pure TypeScript with zero React/DOM dependencies — runs identically on server (`server.ts`)
 *    and client (`FormRunner.tsx`).
 *  - Never trusts client-provided visibility flags, disabled flags, required flags, scores,
 *    category scores, outcome IDs, or calculated values — always recomputes from raw answers.
 *  - Strips unknown payload keys and applies the form's explicit `hiddenFieldPolicy`.
 *  - Validates `redirectUrl`, outcome buttons, and media URLs via safe URL checks.
 */

import { HiddenFieldPolicy } from '../../types/form';
import { FormDocument } from '../document/types';
import { defaultLogicEngine, ILogicEngine } from './logic-engine';
import { isInteractiveQuestionComponent } from './navigation-engine';
import { isSafeHttpUrl } from '../logic/registries';
import { FormulaError } from './calculation-engine';
import {
  buildPipedNotificationPayload,
  PipedNotificationPayload,
} from './piping-engine';
import { validateCrossFieldRules, validateFieldValue } from './validation-engine';
import {
  buildScoringPipingVariables,
  evaluateFormOutcomes,
  evaluateFormScoring,
  OutcomeEvaluationResult,
  ResolvedOutcomeResult,
  ScoringEvaluationResult,
} from './scoring-engine';
import { getExpandedReusableQuestionNodes } from './reusable-component-engine';

export interface SubmissionValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  crossFieldErrors: Record<string, string>;
  sanitizedAnswers: Record<string, unknown>;
  calculatedValues: Record<string, unknown>;
  resolvedVariables: Record<string, unknown>;
  formattedVariables: Record<string, string>;
  calculationErrors: Record<string, FormulaError>;
  notificationPayload: PipedNotificationPayload;
  visibleComponentIds: string[];
  visiblePageIds: string[];
  hiddenFieldPolicy: HiddenFieldPolicy;
  endedEarly: boolean;
  endFormTitle?: string;
  endFormMessage?: string;
  redirectUrl?: string;
  score?: number;
  maxScore?: number;
  scorePercent?: number;
  categoryScores?: Record<
    string,
    { name: string; score: number; maxScore: number; percent: number; band?: string }
  >;
  scoring?: ScoringEvaluationResult;
  outcomeResult?: OutcomeEvaluationResult;
  selectedOutcome?: ResolvedOutcomeResult | null;
  outcomeId?: string;
  outcomeName?: string;
}

/**
 * Re-evaluates all conditional logic rules on `rawAnswers`, enforces `hiddenFieldPolicy`,
 * validates all visible enabled fields (field-level + cross-field), recalculates variables,
 * multi-category scores, and resolves the personalised outcome.
 */
export function validateAndSanitizeSubmission(
  document: FormDocument,
  rawAnswers: Record<string, unknown>,
  options?: {
    variables?: Record<string, unknown>;
    logicEngine?: ILogicEngine;
    /** When true (early-end completion), skip validating questions on pages after the end trigger */
    endedEarly?: boolean;
    endedOnPageId?: string;
    /** Optional deterministic clock override for date validation tests */
    now?: Date;
  }
): SubmissionValidationResult {
  const engine = options?.logicEngine || defaultLogicEngine;
  const hiddenFieldPolicy: HiddenFieldPolicy =
    document.settings.hiddenFieldPolicy || 'preserve_on_hide_omit_on_submit';

  // Collect all known internal question IDs from reusable component instances
  const allReusableQuestions = getExpandedReusableQuestionNodes(document);
  const reusableParentByFieldId = new Map<string, string>();
  for (const item of allReusableQuestions) {
    reusableParentByFieldId.set(item.node.id, item.instanceId);
  }

  // Copy only known component IDs (top-level + reusable instance slots) to prevent arbitrary payload key pollution
  const cleanRawAnswers: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawAnswers || {})) {
    if (
      Object.prototype.hasOwnProperty.call(document.components, key) ||
      reusableParentByFieldId.has(key)
    ) {
      cleanRawAnswers[key] = value;
    }
  }

  // Re-evaluate logic independently on raw answers (creator debug trace disabled)
  const logicResult = engine.evaluate(document, {
    answers: cleanRawAnswers,
    variables: options?.variables,
    currentPageId: options?.endedOnPageId,
    trigger: 'on_submit',
    includeDebugTrace: false,
  });

  // Merge engine-calculated component values (never trust client-forged calculated fields)
  const effectiveAnswers: Record<string, unknown> = {
    ...cleanRawAnswers,
    ...logicResult.calculatedComponentValues,
  };

  // Determine active early-end directive if any
  const endDirective = logicResult.navigationDirectives.find((d) => d.actionType === 'end_form');
  const endedEarly = Boolean(options?.endedEarly || logicResult.endFormTriggered);
  const endTriggerPageId = options?.endedOnPageId || endDirective?.triggerPageId;
  const endTriggerPageIndex = endTriggerPageId
    ? document.pages.findIndex((p) => p.id === endTriggerPageId)
    : -1;

  // Build effective visible set excluding pages after an early-end trigger
  const activeVisibleIds = new Set<string>();
  for (const id of logicResult.visibleComponentIds) {
    const comp = document.components[id];
    if (!comp) continue;
    if (endedEarly && endTriggerPageIndex >= 0) {
      const compPageIdx = document.pages.findIndex((p) => p.id === comp.pageId);
      if (compPageIdx > endTriggerPageIndex) continue;
    }
    activeVisibleIds.add(id);
  }

  // 1. Field-level validation across every visible, enabled interactive question
  const errors: Record<string, string> = {};

  for (const component of Object.values(document.components)) {
    if (!isInteractiveQuestionComponent(component)) continue;
    if (!activeVisibleIds.has(component.id)) continue;
    if (logicResult.disabledComponentIds.has(component.id)) continue;

    const val = effectiveAnswers[component.id];
    const isRequired = logicResult.requiredComponentIds.has(component.id);

    const fieldCheck = validateFieldValue(component, val, {
      required: isRequired,
      now: options?.now,
    });
    if (!fieldCheck.valid && fieldCheck.error) {
      errors[component.id] = fieldCheck.error;
    }
  }

  // 1b. Validate internal interactive questions inside visible, enabled reusable component instances
  const activeReusableQuestions = getExpandedReusableQuestionNodes(document, {
    visibleComponentIds: activeVisibleIds,
    disabledComponentIds: logicResult.disabledComponentIds,
  });
  for (const { node: innerNode, disabled } of activeReusableQuestions) {
    if (disabled) continue;
    const val = effectiveAnswers[innerNode.id];
    const fieldCheck = validateFieldValue(innerNode, val, {
      required: Boolean(innerNode.validation.required),
      now: options?.now,
    });
    if (!fieldCheck.valid && fieldCheck.error) {
      errors[innerNode.id] = fieldCheck.error;
    }
  }

  // 2. Cross-field validation across visible, enabled fields
  const crossFieldErrors = validateCrossFieldRules(
    document,
    effectiveAnswers,
    {
      visibleComponentIds: activeVisibleIds,
      disabledComponentIds: logicResult.disabledComponentIds,
    },
    {
      document,
      answers: effectiveAnswers,
      variables: logicResult.resolvedVariables,
      formattedVariables: logicResult.formattedVariables,
    }
  );

  for (const [compId, msg] of Object.entries(crossFieldErrors)) {
    if (!errors[compId]) {
      errors[compId] = msg;
    }
  }

  // 3. Apply explicit hiddenFieldPolicy to build sanitizedAnswers
  const sanitizedAnswers: Record<string, unknown> = {};
  for (const [compId, value] of Object.entries(effectiveAnswers)) {
    const component = document.components[compId];
    const reusableParentId = reusableParentByFieldId.get(compId);
    if (!component && !reusableParentId) continue;

    const isVisible = component
      ? activeVisibleIds.has(compId)
      : Boolean(reusableParentId && activeVisibleIds.has(reusableParentId));
    if (hiddenFieldPolicy === 'preserve_always') {
      sanitizedAnswers[compId] = value;
    } else if (isVisible) {
      sanitizedAnswers[compId] = value;
    }
  }

  // 4. Authoritative multi-category scoring (ignores any client-submitted scores)
  const scoring = evaluateFormScoring(
    document,
    sanitizedAnswers,
    logicResult.resolvedVariables,
    activeVisibleIds
  );

  const score = scoring.enabled ? scoring.totalScore : undefined;
  const maxScore = scoring.enabled ? scoring.maxScore : undefined;
  const scorePercent = scoring.enabled ? scoring.percent : undefined;
  const categoryScores =
    scoring.enabled && Object.keys(scoring.categoryScoresMap).length > 0
      ? scoring.categoryScoresMap
      : undefined;

  // 5. Authoritative personalised outcome resolution
  const basePipingContext = {
    document,
    answers: sanitizedAnswers,
    variables: logicResult.resolvedVariables,
    formattedVariables: logicResult.formattedVariables,
  };

  const outcomeResult = evaluateFormOutcomes(
    document,
    sanitizedAnswers,
    logicResult.resolvedVariables,
    scoring,
    basePipingContext
  );

  const selectedOutcome = outcomeResult.selectedOutcome;

  // Merge scoring piping vars into notification payload so confirmation emails/webhooks see scores too
  const mergedNotificationVars = scoring.enabled
    ? {
        ...logicResult.resolvedVariables,
        ...buildScoringPipingVariables(scoring, selectedOutcome?.outcomeName),
      }
    : logicResult.resolvedVariables;

  const safeRedirectUrl =
    logicResult.endFormRedirectUrl && isSafeHttpUrl(logicResult.endFormRedirectUrl)
      ? logicResult.endFormRedirectUrl
      : undefined;

  const notificationPayload = buildPipedNotificationPayload(
    document,
    sanitizedAnswers,
    mergedNotificationVars,
    logicResult.formattedVariables
  );

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    crossFieldErrors,
    sanitizedAnswers,
    calculatedValues: logicResult.calculatedComponentValues,
    resolvedVariables: logicResult.resolvedVariables,
    formattedVariables: logicResult.formattedVariables,
    calculationErrors: logicResult.calculationErrors,
    notificationPayload,
    visibleComponentIds: Array.from(activeVisibleIds),
    visiblePageIds: Array.from(logicResult.visiblePageIds),
    hiddenFieldPolicy,
    endedEarly,
    endFormTitle: logicResult.endFormTitle || endDirective?.endFormTitle,
    endFormMessage: logicResult.endFormMessage || endDirective?.endFormMessage,
    redirectUrl: safeRedirectUrl,
    score,
    maxScore,
    scorePercent,
    categoryScores,
    scoring: scoring.enabled ? scoring : undefined,
    outcomeResult: outcomeResult.enabled ? outcomeResult : undefined,
    selectedOutcome,
    outcomeId: selectedOutcome?.outcomeId,
    outcomeName: selectedOutcome?.outcomeName,
  };
}
