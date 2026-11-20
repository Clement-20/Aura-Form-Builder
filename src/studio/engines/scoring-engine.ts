/**
 * FlexStore Form Studio — Configurable Multi-Category Scoring & Personalised Outcome Engine (Phase 2, Step 4)
 *
 * Pure TypeScript (zero React/DOM imports) so identical deterministic scoring & outcome resolution runs in:
 *  - Scoring Manager & Outcome Builder live previews
 *  - Logic Builder Preview & Debugger (isolated creator test mode)
 *  - Respondent Rendering Engine (personalised result screens)
 *  - Unified Client & Server-Side Submission Validator (`POST /api/submissions/validate`)
 *
 * Design & Security guarantees:
 *  - Zero hardcoded scoring assumptions: supports arbitrary option points, multi-category
 *    dimensions, question weights, numeric values, numeric ranges, safe formulas, and thresholds.
 *  - Zero `eval()` / `new Function()` — delegates all formulas to `calculation-engine.ts`.
 *  - Plain-text answer & score piping (`{{total_score}}`, `{{score_percent}}`, `{{score_band}}`,
 *    `{{outcome_name}}`, `{{category.<slug>}}`, plus answers & variables).
 *  - Safe URL sanitization on outcome CTA buttons and result screen imagery.
 *  - `sanitizeFormDocumentForRespondent()` strips private scoring weights, answer keys, and
 *    outcome conditions when `hidePrivateConfigFromRespondents` is enabled.
 */

import {
  FormDocument,
  FormOutcomeDefinition,
  OutcomeActionButton,
  OutcomeCondition,
  OutcomeResultScreen,
  QuestionScoringRule,
  ScoreThreshold,
} from '../document/types';
import { isSafeHttpUrl } from '../logic/registries';
import { evaluateFormula } from './calculation-engine';
import { isInteractiveQuestionComponent } from './navigation-engine';
import { PipingContext, resolvePipedText, toPipingSlug } from './piping-engine';
import { evaluateConditionGroup, isEmptyFieldValue } from './validation-engine';

// ============================================================================
// Result Data Structures
// ============================================================================

export interface CategoryScoreResult {
  categoryId: string;
  name: string;
  slug: string;
  color?: string;
  description?: string;
  score: number;
  maxScore: number;
  percent: number;
  threshold?: ScoreThreshold;
}

export interface QuestionScoreBreakdown {
  ruleId: string;
  componentId: string;
  label: string;
  categoryId?: string;
  rawPoints: number;
  weight: number;
  weightedPoints: number;
  maxWeightedPoints: number;
}

export interface ScoringEvaluationResult {
  enabled: boolean;
  totalScore: number;
  maxScore: number;
  percent: number;
  totalThreshold?: ScoreThreshold;
  categories: CategoryScoreResult[];
  /** Compact map stored onto FormSubmission.categoryScores */
  categoryScoresMap: Record<
    string,
    { name: string; score: number; maxScore: number; percent: number; band?: string }
  >;
  questionBreakdowns: QuestionScoreBreakdown[];
  errors: Record<string, string>;
}

export interface ResolvedOutcomeConditionalBlock {
  id: string;
  heading: string;
  body: string;
}

export interface ResolvedOutcomeResult {
  outcomeId: string;
  outcomeName: string;
  isDefaultFallback: boolean;
  matchedConditionSummary: string[];
  heading: string;
  description: string;
  imageUrl?: string;
  imageAlt?: string;
  showScoreCard: boolean;
  showCategoryBreakdown: boolean;
  nextSteps: string[];
  buttons: OutcomeActionButton[];
  conditionalBlocks: ResolvedOutcomeConditionalBlock[];
  appearance?: OutcomeResultScreen['appearance'];
}

export interface EvaluatedOutcomeDiagnostic {
  outcomeId: string;
  name: string;
  priority: number;
  enabled: boolean;
  matched: boolean;
  isDefaultFallback: boolean;
  reason: string;
}

export interface OutcomeEvaluationResult {
  enabled: boolean;
  selectedOutcome: ResolvedOutcomeResult | null;
  evaluatedOutcomes: EvaluatedOutcomeDiagnostic[];
}

// ============================================================================
// Threshold & Score Helpers
// ============================================================================

function roundScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function computePercent(score: number, maxScore: number): number {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
    return 0;
  }
  const pct = (score / maxScore) * 100;
  return Math.round(pct * 10) / 10;
}

/**
 * Matches the first threshold whose raw score bounds and/or percentage bounds
 * contain `(score, percent)` (inclusive).
 */
export function evaluateThreshold(
  thresholds: ScoreThreshold[] | undefined,
  score: number,
  percent: number
): ScoreThreshold | undefined {
  if (!thresholds || thresholds.length === 0) return undefined;
  for (const t of thresholds) {
    const hasScoreBounds = t.minScore !== undefined || t.maxScore !== undefined;
    const hasPercentBounds = t.minPercent !== undefined || t.maxPercent !== undefined;
    if (!hasScoreBounds && !hasPercentBounds) continue;

    const scoreOk =
      !hasScoreBounds ||
      ((t.minScore === undefined || score >= t.minScore) &&
        (t.maxScore === undefined || score <= t.maxScore));

    const percentOk =
      !hasPercentBounds ||
      ((t.minPercent === undefined || percent >= t.minPercent) &&
        (t.maxPercent === undefined || percent <= t.maxPercent));

    if (scoreOk && percentOk) {
      return t;
    }
  }
  return undefined;
}

function evaluateQuestionScoringRule(
  rule: QuestionScoringRule,
  document: FormDocument,
  answers: Record<string, unknown>,
  variables: Record<string, unknown>,
  errors: Record<string, string>
): { rawPoints: number; rawMax: number } {
  const node = document.components[rule.componentId];
  if (!node) return { rawPoints: 0, rawMax: 0 };

  const answer = answers[rule.componentId];

  switch (rule.mode) {
    case 'option_points': {
      const map = rule.optionPoints || {};
      const allValues = Object.values(map).filter(
        (n): n is number => typeof n === 'number' && Number.isFinite(n)
      );

      if (node.type === 'checkbox' || Array.isArray(answer)) {
        const selected = Array.isArray(answer)
          ? answer.map((v) => String(v))
          : !isEmptyFieldValue(answer)
          ? [String(answer)]
          : [];
        let earned = 0;
        for (const opt of selected) {
          const pts = map[opt];
          if (typeof pts === 'number' && Number.isFinite(pts)) {
            earned += pts;
          }
        }
        const computedMax = allValues.filter((n) => n > 0).reduce((a, b) => a + b, 0);
        return {
          rawPoints: earned,
          rawMax: rule.maxPointsOverride ?? computedMax,
        };
      }

      const key = answer !== undefined && answer !== null ? String(answer) : '';
      const earned =
        key && typeof map[key] === 'number' && Number.isFinite(map[key]) ? map[key] : 0;
      const computedMax = allValues.length > 0 ? Math.max(0, ...allValues) : 0;
      return {
        rawPoints: earned,
        rawMax: rule.maxPointsOverride ?? computedMax,
      };
    }

    case 'exact_match': {
      const pts = typeof rule.points === 'number' && Number.isFinite(rule.points) ? rule.points : 10;
      const expected = rule.correctAnswer ?? node.behaviour.correctAnswer;
      const rawMax = rule.maxPointsOverride ?? Math.max(0, pts);

      if (
        expected === undefined ||
        expected === '' ||
        (Array.isArray(expected) && expected.length === 0) ||
        isEmptyFieldValue(answer)
      ) {
        return { rawPoints: 0, rawMax };
      }

      if (Array.isArray(expected)) {
        const actualArr = (Array.isArray(answer) ? answer : [answer])
          .map((x) => String(x).trim().toLowerCase())
          .sort();
        const expectedArr = expected.map((x) => String(x).trim().toLowerCase()).sort();
        const matched =
          actualArr.length === expectedArr.length &&
          actualArr.every((val, idx) => val === expectedArr[idx]);
        return { rawPoints: matched ? pts : 0, rawMax };
      }

      const actualStr = Array.isArray(answer)
        ? answer.join(',').trim().toLowerCase()
        : String(answer).trim().toLowerCase();
      const expectedStr = String(expected).trim().toLowerCase();
      return { rawPoints: actualStr === expectedStr ? pts : 0, rawMax };
    }

    case 'numeric_value': {
      const num =
        typeof answer === 'number'
          ? answer
          : !isEmptyFieldValue(answer)
          ? Number(String(answer).trim())
          : 0;
      const earned = Number.isFinite(num) ? num : 0;
      const inferredMax =
        rule.maxPointsOverride ??
        node.validation.max ??
        (node.type === 'rating' ? 5 : node.type === 'scale' ? 10 : Math.max(0, earned));
      return { rawPoints: earned, rawMax: inferredMax };
    }

    case 'range_points': {
      const ranges = rule.rangePoints || [];
      const computedMax =
        ranges.length > 0 ? Math.max(0, ...ranges.map((r) => (Number.isFinite(r.points) ? r.points : 0))) : 0;
      const rawMax = rule.maxPointsOverride ?? computedMax;

      if (isEmptyFieldValue(answer)) {
        return { rawPoints: 0, rawMax };
      }
      const num = typeof answer === 'number' ? answer : Number(String(answer).trim());
      if (!Number.isFinite(num)) {
        return { rawPoints: 0, rawMax };
      }

      for (const range of ranges) {
        const minOk = range.min === undefined || num >= range.min;
        const maxOk = range.max === undefined || num <= range.max;
        if (minOk && maxOk) {
          return { rawPoints: Number.isFinite(range.points) ? range.points : 0, rawMax };
        }
      }
      return { rawPoints: 0, rawMax };
    }

    case 'formula': {
      if (!rule.formulaExpression || !rule.formulaExpression.trim()) {
        return { rawPoints: 0, rawMax: rule.maxPointsOverride ?? 0 };
      }
      const evalRes = evaluateFormula(rule.formulaExpression, {
        answers,
        variables,
        document,
      });
      if (!evalRes.ok || typeof evalRes.value !== 'number') {
        if (evalRes.error) {
          errors[rule.id] = evalRes.error.message;
        }
        return { rawPoints: 0, rawMax: rule.maxPointsOverride ?? 0 };
      }
      const earned = evalRes.value;
      return {
        rawPoints: earned,
        rawMax: rule.maxPointsOverride ?? Math.max(0, earned),
      };
    }

    default:
      return { rawPoints: 0, rawMax: 0 };
  }
}

// ============================================================================
// Form Scoring Engine (Multi-Category + Legacy Quiz Mode Compatibility)
// ============================================================================

export function evaluateFormScoring(
  document: FormDocument,
  answers: Record<string, unknown>,
  resolvedVariables: Record<string, unknown>,
  visibleComponentIds: Set<string>
): ScoringEvaluationResult {
  const scoring = document.scoring;
  const errors: Record<string, string> = {};

  // Case 1: New Phase 2 Step 4 Scoring System is enabled
  if (scoring && scoring.enabled) {
    const questionBreakdowns: QuestionScoreBreakdown[] = [];
    const categoryTotals = new Map<string, { score: number; maxScore: number }>();

    for (const cat of scoring.categories || []) {
      categoryTotals.set(cat.id, { score: 0, maxScore: 0 });
    }

    let totalScore = 0;
    let totalMaxScore = 0;

    for (const rule of scoring.rules || []) {
      if (!rule.enabled) continue;
      const node = document.components[rule.componentId];
      if (!node || !isInteractiveQuestionComponent(node)) continue;
      if (!visibleComponentIds.has(node.id)) continue;

      const weight =
        typeof rule.weight === 'number' && Number.isFinite(rule.weight) ? rule.weight : 1;

      const { rawPoints, rawMax } = evaluateQuestionScoringRule(
        rule,
        document,
        answers,
        resolvedVariables,
        errors
      );

      const weightedPoints = roundScore(rawPoints * weight);
      const maxWeightedPoints = roundScore(Math.max(0, rawMax * Math.abs(weight)));

      questionBreakdowns.push({
        ruleId: rule.id,
        componentId: node.id,
        label: node.content.label || node.id,
        categoryId: rule.categoryId,
        rawPoints: roundScore(rawPoints),
        weight,
        weightedPoints,
        maxWeightedPoints,
      });

      if (rule.categoryId && categoryTotals.has(rule.categoryId)) {
        const acc = categoryTotals.get(rule.categoryId)!;
        acc.score = roundScore(acc.score + weightedPoints);
        acc.maxScore = roundScore(acc.maxScore + maxWeightedPoints);
      }

      if (!rule.excludeFromTotal) {
        totalScore = roundScore(totalScore + weightedPoints);
        totalMaxScore = roundScore(totalMaxScore + maxWeightedPoints);
      }
    }

    // Build category results (supporting optional category formula overrides)
    const categories: CategoryScoreResult[] = [];
    const categoryScoresMap: ScoringEvaluationResult['categoryScoresMap'] = {};

    for (const cat of scoring.categories || []) {
      const slug = toPipingSlug(cat.name) || cat.id;
      const acc = categoryTotals.get(cat.id) || { score: 0, maxScore: 0 };
      let catScore = acc.score;
      let catMax = cat.maxScoreOverride ?? acc.maxScore;

      if (cat.formulaExpression && cat.formulaExpression.trim()) {
        const evalRes = evaluateFormula(cat.formulaExpression, {
          answers,
          variables: {
            ...resolvedVariables,
            [`category_${slug}`]: acc.score,
          },
          document,
        });
        if (evalRes.ok && typeof evalRes.value === 'number') {
          const delta = roundScore(evalRes.value - acc.score);
          catScore = roundScore(evalRes.value);
          // If no question rules fed this category, reflect formula score in total as well
          if (acc.maxScore === 0 && acc.score === 0) {
            totalScore = roundScore(totalScore + catScore);
            if (cat.maxScoreOverride !== undefined) {
              totalMaxScore = roundScore(totalMaxScore + cat.maxScoreOverride);
            }
          } else {
            totalScore = roundScore(totalScore + delta);
          }
        } else if (evalRes.error) {
          errors[cat.id] = evalRes.error.message;
        }
      }

      if (cat.maxScoreOverride !== undefined && acc.maxScore !== cat.maxScoreOverride) {
        catMax = cat.maxScoreOverride;
      }

      const catPercent = computePercent(catScore, catMax);
      const threshold = evaluateThreshold(cat.thresholds, catScore, catPercent);

      categories.push({
        categoryId: cat.id,
        name: cat.name,
        slug,
        color: cat.color,
        description: cat.description,
        score: catScore,
        maxScore: catMax,
        percent: catPercent,
        threshold,
      });

      categoryScoresMap[cat.id] = {
        name: cat.name,
        score: catScore,
        maxScore: catMax,
        percent: catPercent,
        band: threshold?.label,
      };
    }

    const percent = computePercent(totalScore, totalMaxScore);
    const totalThreshold = evaluateThreshold(scoring.totalThresholds, totalScore, percent);

    return {
      enabled: true,
      totalScore,
      maxScore: totalMaxScore,
      percent,
      totalThreshold,
      categories,
      categoryScoresMap,
      questionBreakdowns,
      errors,
    };
  }

  // Case 2: Backward-compatible legacy Quiz Mode (`settings.isQuizMode`)
  if (document.settings.isQuizMode) {
    let score = 0;
    let maxScore = 0;
    const questionBreakdowns: QuestionScoreBreakdown[] = [];

    for (const component of Object.values(document.components)) {
      if (!isInteractiveQuestionComponent(component)) continue;
      if (!visibleComponentIds.has(component.id)) continue;
      const correct = component.behaviour.correctAnswer;
      if (
        correct === undefined ||
        correct === '' ||
        (Array.isArray(correct) && correct.length === 0)
      ) {
        continue;
      }

      const pts = component.behaviour.points ?? 10;
      maxScore += pts;
      const answer = answers[component.id];
      const expectedText = Array.isArray(correct) ? correct.join(',') : String(correct);
      const actualText = Array.isArray(answer) ? answer.join(',') : String(answer ?? '');
      const earned =
        answer !== undefined &&
        answer !== null &&
        actualText.trim().toLowerCase() === expectedText.trim().toLowerCase()
          ? pts
          : 0;
      score += earned;

      questionBreakdowns.push({
        ruleId: `quiz_${component.id}`,
        componentId: component.id,
        label: component.content.label || component.id,
        rawPoints: earned,
        weight: 1,
        weightedPoints: earned,
        maxWeightedPoints: pts,
      });
    }

    return {
      enabled: true,
      totalScore: roundScore(score),
      maxScore: roundScore(maxScore),
      percent: computePercent(score, maxScore),
      categories: [],
      categoryScoresMap: {},
      questionBreakdowns,
      errors,
    };
  }

  return {
    enabled: false,
    totalScore: 0,
    maxScore: 0,
    percent: 0,
    categories: [],
    categoryScoresMap: {},
    questionBreakdowns: [],
    errors,
  };
}

// ============================================================================
// Score Piping Variables Builder
// ============================================================================

export function buildScoringPipingVariables(
  scoring: ScoringEvaluationResult,
  outcomeName?: string
): Record<string, unknown> {
  const vars: Record<string, unknown> = {
    total_score: scoring.totalScore,
    max_score: scoring.maxScore,
    score_percent: scoring.percent,
    score_band: scoring.totalThreshold?.label || '',
    outcome_name: outcomeName || '',
  };

  for (const cat of scoring.categories) {
    vars[`category.${cat.slug}`] = cat.score;
    vars[`category.${cat.slug}_max`] = cat.maxScore;
    vars[`category.${cat.slug}_percent`] = cat.percent;
    vars[`category.${cat.slug}_band`] = cat.threshold?.label || '';
    // Also expose by raw category ID
    vars[`category.${cat.categoryId}`] = cat.score;
  }

  return vars;
}

// ============================================================================
// Outcome Builder Evaluation & Personalised Result Screen Resolution
// ============================================================================

function compareOutcomeValue(
  actual: unknown,
  operator: OutcomeCondition['operator'],
  expectedRaw: string,
  secondaryRaw?: string
): boolean {
  const numActual =
    typeof actual === 'number'
      ? actual
      : actual !== undefined && actual !== null && String(actual).trim() !== ''
      ? Number(String(actual).trim())
      : NaN;
  const numExpected = Number(expectedRaw);
  const numSecondary = secondaryRaw !== undefined && secondaryRaw !== '' ? Number(secondaryRaw) : NaN;

  switch (operator) {
    case 'greater_than':
      return Number.isFinite(numActual) && Number.isFinite(numExpected) && numActual > numExpected;
    case 'greater_than_or_equal':
      return Number.isFinite(numActual) && Number.isFinite(numExpected) && numActual >= numExpected;
    case 'less_than':
      return Number.isFinite(numActual) && Number.isFinite(numExpected) && numActual < numExpected;
    case 'less_than_or_equal':
      return Number.isFinite(numActual) && Number.isFinite(numExpected) && numActual <= numExpected;
    case 'between':
      return (
        Number.isFinite(numActual) &&
        Number.isFinite(numExpected) &&
        Number.isFinite(numSecondary) &&
        numActual >= Math.min(numExpected, numSecondary) &&
        numActual <= Math.max(numExpected, numSecondary)
      );
    case 'contains': {
      if (Array.isArray(actual)) {
        return actual.some(
          (item) => String(item).trim().toLowerCase() === expectedRaw.trim().toLowerCase()
        );
      }
      return String(actual ?? '')
        .toLowerCase()
        .includes(expectedRaw.trim().toLowerCase());
    }
    case 'not_equals': {
      if (Number.isFinite(numActual) && Number.isFinite(numExpected)) {
        return Math.abs(numActual - numExpected) >= 1e-9;
      }
      return String(actual ?? '').trim().toLowerCase() !== expectedRaw.trim().toLowerCase();
    }
    case 'equals':
    default: {
      if (Number.isFinite(numActual) && Number.isFinite(numExpected)) {
        return Math.abs(numActual - numExpected) < 1e-9;
      }
      if (Array.isArray(actual)) {
        return actual.some(
          (item) => String(item).trim().toLowerCase() === expectedRaw.trim().toLowerCase()
        );
      }
      return String(actual ?? '').trim().toLowerCase() === expectedRaw.trim().toLowerCase();
    }
  }
}

function evaluateSingleOutcomeCondition(
  cond: OutcomeCondition,
  document: FormDocument,
  answers: Record<string, unknown>,
  variables: Record<string, unknown>,
  scoring: ScoringEvaluationResult
): { passed: boolean; summary: string } {
  switch (cond.source) {
    case 'total_score': {
      const passed = compareOutcomeValue(
        scoring.totalScore,
        cond.operator,
        cond.value,
        cond.secondaryValue
      );
      return {
        passed,
        summary: `Total score (${scoring.totalScore}) ${cond.operator.replace(/_/g, ' ')} ${cond.value}${cond.operator === 'between' && cond.secondaryValue ? `–${cond.secondaryValue}` : ''}`,
      };
    }

    case 'total_percent': {
      const passed = compareOutcomeValue(
        scoring.percent,
        cond.operator,
        cond.value,
        cond.secondaryValue
      );
      return {
        passed,
        summary: `Total score % (${scoring.percent}%) ${cond.operator.replace(/_/g, ' ')} ${cond.value}%${cond.operator === 'between' && cond.secondaryValue ? `–${cond.secondaryValue}%` : ''}`,
      };
    }

    case 'category_score':
    case 'category_percent': {
      const cat = scoring.categories.find(
        (c) => c.categoryId === cond.sourceId || c.slug === cond.sourceId || c.name === cond.sourceId
      );
      if (!cat) {
        return { passed: false, summary: `Category "${cond.sourceId || 'missing'}" not found` };
      }
      const val = cond.source === 'category_score' ? cat.score : cat.percent;
      const passed = compareOutcomeValue(val, cond.operator, cond.value, cond.secondaryValue);
      return {
        passed,
        summary: `${cat.name} ${cond.source === 'category_percent' ? '%' : 'score'} (${val}${cond.source === 'category_percent' ? '%' : ''}) ${cond.operator.replace(/_/g, ' ')} ${cond.value}`,
      };
    }

    case 'component': {
      const node = cond.sourceId ? document.components[cond.sourceId] : undefined;
      const actual = cond.sourceId ? answers[cond.sourceId] : undefined;
      const passed = compareOutcomeValue(actual, cond.operator, cond.value, cond.secondaryValue);
      return {
        passed,
        summary: `"${node?.content.label || cond.sourceId || 'Question'}" ${cond.operator.replace(/_/g, ' ')} "${cond.value}"`,
      };
    }

    case 'variable': {
      const varKey = cond.sourceId || '';
      const actual = variables[varKey];
      const passed = compareOutcomeValue(actual, cond.operator, cond.value, cond.secondaryValue);
      return {
        passed,
        summary: `Variable "${varKey}" ${cond.operator.replace(/_/g, ' ')} "${cond.value}"`,
      };
    }

    case 'logic_group': {
      const passed = evaluateConditionGroup(document, cond.logicGroup, answers, variables);
      return {
        passed,
        summary: `Nested condition group (${cond.logicGroup?.combinator || 'AND'})`,
      };
    }

    default:
      return { passed: false, summary: 'Unknown condition source' };
  }
}

export function isSafeMediaUrl(url: string | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  // Allow safe local app asset paths in addition to http/https
  if (trimmed.startsWith('/assets/') || trimmed.startsWith('/src/assets/')) {
    return !trimmed.includes('..');
  }
  return isSafeHttpUrl(trimmed);
}

function resolveOutcomeScreen(
  outcome: FormOutcomeDefinition,
  isDefaultFallback: boolean,
  matchedConditionSummary: string[],
  document: FormDocument,
  answers: Record<string, unknown>,
  resolvedVariables: Record<string, unknown>,
  scoring: ScoringEvaluationResult,
  basePipingContext: PipingContext
): ResolvedOutcomeResult {
  const scoringVars = buildScoringPipingVariables(scoring, outcome.name);
  const mergedVariables: Record<string, unknown> = {
    ...basePipingContext.variables,
    ...resolvedVariables,
    ...scoringVars,
  };
  const pipingCtx: PipingContext = {
    document,
    answers,
    variables: mergedVariables,
    formattedVariables: basePipingContext.formattedVariables,
  };

  const screen = outcome.resultScreen;
  const safeImageUrl =
    screen.imageUrl && isSafeMediaUrl(screen.imageUrl) ? screen.imageUrl.trim() : undefined;

  const safeButtons: OutcomeActionButton[] = (screen.buttons || [])
    .map((btn) => {
      const pipedUrl = resolvePipedText(btn.url, pipingCtx).trim();
      if (!isSafeHttpUrl(pipedUrl)) return null;
      return {
        ...btn,
        label: resolvePipedText(btn.label, pipingCtx).trim() || 'Continue',
        url: pipedUrl,
      };
    })
    .filter((b): b is OutcomeActionButton => b !== null);

  const conditionalBlocks: ResolvedOutcomeConditionalBlock[] = [];
  for (const block of screen.conditionalBlocks || []) {
    if (evaluateConditionGroup(document, block.conditionGroup, answers, mergedVariables)) {
      conditionalBlocks.push({
        id: block.id,
        heading: resolvePipedText(block.heading, pipingCtx),
        body: resolvePipedText(block.body, pipingCtx),
      });
    }
  }

  return {
    outcomeId: outcome.id,
    outcomeName: outcome.name,
    isDefaultFallback,
    matchedConditionSummary,
    heading: resolvePipedText(screen.heading || outcome.name, pipingCtx),
    description: resolvePipedText(screen.description || '', pipingCtx),
    imageUrl: safeImageUrl,
    imageAlt: screen.imageAlt ? resolvePipedText(screen.imageAlt, pipingCtx) : outcome.name,
    showScoreCard: Boolean(screen.showScoreCard),
    showCategoryBreakdown: Boolean(screen.showCategoryBreakdown),
    nextSteps: (screen.nextSteps || [])
      .map((step) => resolvePipedText(step, pipingCtx).trim())
      .filter(Boolean),
    buttons: safeButtons,
    conditionalBlocks,
    appearance: screen.appearance ? { ...screen.appearance } : undefined,
  };
}

/**
 * Evaluates all configured outcomes in priority order and produces the resolved
 * personalised result screen (or falls back to the configured default outcome).
 */
export function evaluateFormOutcomes(
  document: FormDocument,
  answers: Record<string, unknown>,
  resolvedVariables: Record<string, unknown>,
  scoring: ScoringEvaluationResult,
  basePipingContext: PipingContext
): OutcomeEvaluationResult {
  const config = document.outcomes;
  if (!config || !config.enabled || !Array.isArray(config.outcomes) || config.outcomes.length === 0) {
    return {
      enabled: false,
      selectedOutcome: null,
      evaluatedOutcomes: [],
    };
  }

  const mergedVarsForEval: Record<string, unknown> = {
    ...resolvedVariables,
    ...buildScoringPipingVariables(scoring),
  };

  const sorted = [...config.outcomes].sort((a, b) => a.priority - b.priority);
  const evaluatedOutcomes: EvaluatedOutcomeDiagnostic[] = [];
  let winner: FormOutcomeDefinition | null = null;
  let winnerSummaries: string[] = [];

  for (const outcome of sorted) {
    if (!outcome.enabled) {
      evaluatedOutcomes.push({
        outcomeId: outcome.id,
        name: outcome.name,
        priority: outcome.priority,
        enabled: false,
        matched: false,
        isDefaultFallback: outcome.id === config.defaultOutcomeId,
        reason: 'Outcome is disabled',
      });
      continue;
    }

    const conditions = outcome.conditions || [];
    if (conditions.length === 0) {
      evaluatedOutcomes.push({
        outcomeId: outcome.id,
        name: outcome.name,
        priority: outcome.priority,
        enabled: true,
        matched: false,
        isDefaultFallback: outcome.id === config.defaultOutcomeId,
        reason:
          outcome.id === config.defaultOutcomeId
            ? 'Fallback default outcome (no conditions)'
            : 'No conditions configured',
      });
      continue;
    }

    const results = conditions.map((c) =>
      evaluateSingleOutcomeCondition(c, document, answers, mergedVarsForEval, scoring)
    );
    const matched =
      outcome.matchMode === 'any'
        ? results.some((r) => r.passed)
        : results.every((r) => r.passed);

    evaluatedOutcomes.push({
      outcomeId: outcome.id,
      name: outcome.name,
      priority: outcome.priority,
      enabled: true,
      matched,
      isDefaultFallback: outcome.id === config.defaultOutcomeId,
      reason: matched
        ? `Matched (${outcome.matchMode === 'any' ? 'ANY' : 'ALL'}): ${results
            .filter((r) => r.passed)
            .map((r) => r.summary)
            .join('; ')}`
        : `Not matched: ${results
            .filter((r) => !r.passed)
            .map((r) => r.summary)
            .join('; ')}`,
    });

    if (matched && !winner) {
      winner = outcome;
      winnerSummaries = results.filter((r) => r.passed).map((r) => r.summary);
    }
  }

  let isDefaultFallback = false;
  if (!winner && config.defaultOutcomeId) {
    const fallback = config.outcomes.find((o) => o.id === config.defaultOutcomeId && o.enabled);
    if (fallback) {
      winner = fallback;
      isDefaultFallback = true;
      winnerSummaries = ['Selected as default fallback outcome'];
    }
  }

  const selectedOutcome = winner
    ? resolveOutcomeScreen(
        winner,
        isDefaultFallback,
        winnerSummaries,
        document,
        answers,
        resolvedVariables,
        scoring,
        basePipingContext
      )
    : null;

  return {
    enabled: true,
    selectedOutcome,
    evaluatedOutcomes,
  };
}

// ============================================================================
// Privacy Hardening: Strip Private Scoring Keys & Outcome Logic for Respondents
// ============================================================================

/**
 * Produces a respondent-safe copy of a FormDocument that hides private scoring weights,
 * option point tables, correct answers, and private outcome matching criteria when
 * `document.scoring?.hidePrivateConfigFromRespondents !== false`.
 */
export function sanitizeFormDocumentForRespondent(document: FormDocument): FormDocument {
  const hidePrivate = document.scoring?.hidePrivateConfigFromRespondents !== false;
  if (!hidePrivate) {
    return document;
  }

  const sanitizedComponents: FormDocument['components'] = {};
  for (const [id, comp] of Object.entries(document.components)) {
    const { correctAnswer: _ca, points: _pts, ...publicBehaviour } = comp.behaviour;
    sanitizedComponents[id] = {
      ...comp,
      behaviour: publicBehaviour,
    };
  }

  return {
    ...document,
    components: sanitizedComponents,
    scoring: document.scoring
      ? {
          enabled: document.scoring.enabled,
          hidePrivateConfigFromRespondents: true,
          categories: (document.scoring.categories || []).map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
            color: c.color,
            thresholds: [],
          })),
          rules: [],
          totalThresholds: [],
        }
      : undefined,
    outcomes: document.outcomes
      ? {
          enabled: document.outcomes.enabled,
          outcomes: [],
        }
      : undefined,
  };
}
