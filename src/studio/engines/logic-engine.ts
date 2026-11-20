/**
 * FlexStore Form Studio — Deterministic Logic Execution Engine & Static Validator (Phase 2, Step 2)
 *
 * Evaluates structured StudioLogicRules (and legacy v1 LogicRules) deterministically:
 *  - Priority-ordered execution (ascending priority, then declaration order)
 *  - Nested AND / OR condition groups with typed operators
 *  - IF / THEN / ELSE branching (`actions` when matched, optional `elseActions` when unmatched)
 *  - All 15 workflow actions:
 *      Visibility & state: show/hide component (recursive for sections/containers),
 *        enable/disable component, require/optional component, show/hide page
 *      Navigation & branching: navigate_to_page, skip_pages, skip_to_question, end_form (+ safe redirectUrl)
 *      Data & feedback: set_variable, set_calculated_value, display_message
 *  - Page-scoped NavigationDirectives so jumping from Page A -> Page B never traps respondents on Page B
 *  - Bounded multi-pass variable resolution with infinite-loop & oscillation guard
 *  - Conflict detection & deterministic resolution
 *  - Comprehensive static validation across all 6 diagnostic categories:
 *      1. Conflicting visibility / requirement / state rules (components & pages)
 *      2. Multiple incompatible navigation actions
 *      3. Navigation to deleted / missing / unavailable pages or unsafe redirect URLs
 *      4. Circular page navigation loops (DFS across THEN + ELSE branches)
 *      5. Conditions referring to unavailable questions (deleted, hidden-without-show, or future-page)
 *      6. Actions that can never execute (contradictory AND conditions, shadowed rules, hidden-page targets)
 *
 * Security & privacy note:
 *  `trace`, `conflicts`, and `loopGuardTriggered` are strictly creator-facing
 *  diagnostics for the Logic Builder Debugger and must never be exposed to respondents.
 */

import { FormDocument } from '../document/types';
import {
  AnyLogicRule,
  ConditionEvaluationTrace,
  LogicActionConfig,
  LogicConditionClause,
  LogicConditionGroup,
  LogicConflict,
  LogicDataType,
  LogicMessage,
  LogicTrigger,
  LogicValidationIssue,
  LogicValidationReport,
  RuleExecutionTrace,
  StudioLogicRule,
} from '../logic/types';
import {
  conditionOperatorRegistry,
  inferComponentDataType,
  inferVariableDataType,
  isSafeHttpUrl,
  logicActionRegistry,
} from '../logic/registries';
import { normalizeLogicRule } from '../logic/migration';
import {
  buildCalculationDependencyGraph,
  coerceVariableValueSafe,
  evaluateDocumentCalculations,
  evaluateFormula,
  formatValue,
  FormulaError,
  IncrementalCalculationCache,
  validateFormula,
  validateVariableAssignment,
} from './calculation-engine';
import { resolvePipedText } from './piping-engine';
import { isSafeRegexPattern } from './validation-engine';
import { isSafeMediaUrl } from './scoring-engine';

export const MAX_EVALUATION_PASSES = 5;

export interface NavigationDirective {
  ruleId: string;
  ruleName: string;
  priority: number;
  branch: 'then' | 'else';
  actionType: 'navigate_to_page' | 'skip_to_question' | 'end_form';
  /** Pages containing questions referenced by the rule's condition group */
  sourcePageIds: string[];
  /** Component IDs referenced by the rule's condition group */
  sourceComponentIds: string[];
  /**
   * The latest page in document order among `sourcePageIds`.
   * Navigation rules fire when leaving this page (so multi-page conditions like
   * "Employment on Page 1 AND Income on Page 2" fire cleanly at the end of Page 2).
   * Undefined if the condition only references global variables.
   */
  triggerPageId?: string;
  targetPageId?: string;
  targetComponentId?: string;
  endFormTitle?: string;
  endFormMessage?: string;
  redirectUrl?: string;
}

export interface LogicEvaluationContext {
  answers: Record<string, unknown>;
  variables?: Record<string, unknown>;
  currentPageId?: string;
  trigger?: LogicTrigger;
  /** Optional incremental dependency cache to avoid recalculating unrelated variables */
  calculationCache?: IncrementalCalculationCache;
  /** Only set to true inside the creator's Logic Builder Debugger */
  includeDebugTrace?: boolean;
}

export interface LogicEvaluationResult {
  visibleComponentIds: Set<string>;
  disabledComponentIds: Set<string>;
  requiredComponentIds: Set<string>;
  /** Pages that are visible (not hidden by `hide_page` or unshown `show_page`) */
  visiblePageIds: Set<string>;
  /** Pages explicitly marked to be bypassed by `skip_pages` actions */
  skippedPageIds: Set<string>;
  resolvedVariables: Record<string, unknown>;
  /** Locale- & currency-formatted string representations of every defined variable */
  formattedVariables: Record<string, string>;
  /** Any runtime calculation errors keyed by variable ID or action ID */
  calculationErrors: Record<string, FormulaError>;
  calculatedComponentValues: Record<string, unknown>;
  messages: LogicMessage[];
  /** All active navigation/end-form directives ordered by rule priority */
  navigationDirectives: NavigationDirective[];
  nextPageIdOverride?: string;
  /** 1-based page number mirror for legacy stepped runners */
  nextStepOverride?: number;
  skipToComponentId?: string;
  endFormTriggered: boolean;
  endFormTitle?: string;
  endFormMessage?: string;
  endFormRedirectUrl?: string;
  /** Creator-only diagnostics (empty unless includeDebugTrace === true) */
  conflicts: LogicConflict[];
  loopGuardTriggered: boolean;
  passesExecuted: number;
  trace: RuleExecutionTrace[];
}

export interface ILogicEngine {
  evaluate(document: FormDocument, context: LogicEvaluationContext): LogicEvaluationResult;
}

// ============================================================================
// Helpers: Variable Coercion, Plain-Text Interpolation & Source Collection
// ============================================================================

function interpolatePlainMessage(
  document: FormDocument,
  template: string,
  answers: Record<string, unknown>,
  variables: Record<string, unknown>,
  formattedVariables?: Record<string, string>
): string {
  return resolvePipedText(template, {
    document,
    answers,
    variables,
    formattedVariables,
  });
}

function collectConditionSources(
  document: FormDocument,
  group: LogicConditionGroup,
  outPages: Set<string>,
  outComponents: Set<string>
): void {
  for (const item of group.items || []) {
    if (item.kind === 'group') {
      collectConditionSources(document, item, outPages, outComponents);
    } else if (item.sourceType === 'component' && document.components[item.sourceId]) {
      outComponents.add(item.sourceId);
      outPages.add(document.components[item.sourceId].pageId);
    }
  }
}

function resolveTriggerPageId(
  document: FormDocument,
  sourcePageIds: string[]
): string | undefined {
  if (sourcePageIds.length === 0) return undefined;
  let latestIndex = -1;
  let latestPageId: string | undefined;
  for (const pid of sourcePageIds) {
    const idx = document.pages.findIndex((p) => p.id === pid);
    if (idx > latestIndex) {
      latestIndex = idx;
      latestPageId = pid;
    }
  }
  return latestPageId;
}

function resolveClauseContext(
  document: FormDocument,
  clause: LogicConditionClause,
  answers: Record<string, unknown>,
  variables: Record<string, unknown>
): { dataType: LogicDataType; actualValue: unknown; sourceLabel: string } {
  if (clause.sourceType === 'variable') {
    const variable = document.variables.find(
      (v) => v.name === clause.sourceId || v.id === clause.sourceId
    );
    const varKey = variable?.name || clause.sourceId;
    return {
      dataType: inferVariableDataType(variable),
      actualValue: variables[varKey],
      sourceLabel: variable
        ? `Variable: ${variable.name}`
        : `Missing variable (${clause.sourceId || 'none'})`,
    };
  }

  const node = document.components[clause.sourceId];
  return {
    dataType: inferComponentDataType(node),
    actualValue: answers[clause.sourceId],
    sourceLabel:
      node?.content.label ||
      (clause.sourceId ? `Missing question (${clause.sourceId})` : 'Unselected question'),
  };
}

function evaluateConditionGroupWithTrace(
  document: FormDocument,
  group: LogicConditionGroup,
  answers: Record<string, unknown>,
  variables: Record<string, unknown>
): ConditionEvaluationTrace {
  if (!group.items || group.items.length === 0) {
    return {
      itemId: group.id,
      kind: 'group',
      passed: false,
      label: `${group.combinator} group (no conditions)`,
      children: [],
    };
  }

  const children: ConditionEvaluationTrace[] = [];

  for (const item of group.items) {
    if (item.kind === 'group') {
      children.push(evaluateConditionGroupWithTrace(document, item, answers, variables));
    } else {
      const { dataType, actualValue, sourceLabel } = resolveClauseContext(
        document,
        item,
        answers,
        variables
      );
      const opDef = conditionOperatorRegistry.get(item.operator);
      const passed = conditionOperatorRegistry.evaluateClause(item, actualValue, dataType);
      const expectedStr =
        opDef?.valueArity === 0
          ? ''
          : opDef?.valueArity === 2
          ? `${item.value} – ${item.secondaryValue ?? ''}`
          : item.value;

      children.push({
        itemId: item.id,
        kind: 'condition',
        passed,
        label: `${sourceLabel} ${opDef?.label || item.operator}${expectedStr ? ` "${expectedStr}"` : ''}`,
        actualValue,
        expectedValue: expectedStr || undefined,
      });
    }
  }

  const passed =
    group.combinator === 'OR'
      ? children.some((c) => c.passed)
      : children.every((c) => c.passed);

  return {
    itemId: group.id,
    kind: 'group',
    passed,
    label: `Match ${group.combinator === 'OR' ? 'ANY (OR)' : 'ALL (AND)'}`,
    children,
  };
}

function ruleAppliesForTrigger(rule: StudioLogicRule, trigger?: LogicTrigger): boolean {
  if (!trigger || rule.trigger === 'always' || rule.trigger === 'on_change') {
    return true;
  }
  return rule.trigger === trigger;
}

function summarizeAction(action: LogicActionConfig, document: FormDocument): string {
  const def = logicActionRegistry.get(action.type);
  const label = def?.label || action.type;
  if (action.type === 'skip_pages') {
    const ids = action.targetPageIds && action.targetPageIds.length > 0
      ? action.targetPageIds
      : action.targetPageId
      ? [action.targetPageId]
      : [];
    const names = ids.map((id) => document.pages.find((p) => p.id === id)?.title || id);
    return `${label}: ${names.length > 0 ? names.join(', ') : '(none)'}`;
  }
  if (action.targetComponentId) {
    const compName =
      document.components[action.targetComponentId]?.content.label || action.targetComponentId;
    return `${label}: "${compName}"`;
  }
  if (action.targetPageId) {
    const page = document.pages.find((p) => p.id === action.targetPageId);
    return `${label}: "${page?.title || action.targetPageId}"`;
  }
  if (action.variableName) {
    return `${label}: ${action.variableName}`;
  }
  return label;
}

// ============================================================================
// Deterministic Multi-Pass Logic Engine
// ============================================================================

export class DefaultLogicEngine implements ILogicEngine {
  evaluate(document: FormDocument, context: LogicEvaluationContext): LogicEvaluationResult {
    const normalizedRules: StudioLogicRule[] = (document.logic.rules || [])
      .map((r, idx) => normalizeLogicRule(r as AnyLogicRule, document, idx))
      .sort((a, b) => a.priority - b.priority);

    // Track working answers (incorporating calculated component outputs safely without mutating caller)
    const workingAnswers: Record<string, unknown> = { ...(context.answers || {}) };
    const calculatedComponentValues: Record<string, unknown> = {};

    // Evaluate all calculated variables in topological DAG order (with circular guard & incremental cache)
    const initialCalc = evaluateDocumentCalculations(
      document,
      workingAnswers,
      context.variables,
      context.calculationCache
    );
    const resolvedVariables: Record<string, unknown> = { ...initialCalc.values };
    let formattedVariables: Record<string, string> = { ...initialCalc.formattedValues };
    const calculationErrors: Record<string, FormulaError> = {
      ...initialCalc.errorsByVariableId,
    };

    let passesExecuted = 0;
    let loopGuardTriggered = false;
    let finalVisible = new Set<string>();
    let finalDisabled = new Set<string>();
    let finalRequired = new Set<string>();
    let finalVisiblePages = new Set<string>(document.pages.map((p) => p.id));
    let finalSkippedPages = new Set<string>();
    let finalMessages: LogicMessage[] = [];
    let finalConflicts: LogicConflict[] = [];
    let finalTrace: RuleExecutionTrace[] = [];
    let finalNavigationDirectives: NavigationDirective[] = [];
    let nextPageIdOverride: string | undefined;
    let nextStepOverride: number | undefined;
    let skipToComponentId: string | undefined;
    let endFormTriggered = false;
    let endFormTitle: string | undefined;
    let endFormMessage: string | undefined;
    let endFormRedirectUrl: string | undefined;

    for (let pass = 0; pass < MAX_EVALUATION_PASSES; pass += 1) {
      passesExecuted = pass + 1;
      const prevVarSnapshot = JSON.stringify(resolvedVariables);
      const prevCalcSnapshot = JSON.stringify(calculatedComponentValues);

      // Baseline component & page states
      const visibleMap = new Map<string, boolean>();
      const disabledMap = new Map<string, boolean>();
      const requiredMap = new Map<string, boolean>();
      const pageVisibleMap = new Map<string, boolean>();
      const skippedPages = new Set<string>();

      for (const page of document.pages) {
        pageVisibleMap.set(page.id, true);
      }

      for (const component of Object.values(document.components)) {
        visibleMap.set(component.id, !component.behaviour.hiddenByDefault);
        disabledMap.set(component.id, Boolean(component.behaviour.readOnly));
        requiredMap.set(component.id, Boolean(component.validation.required));
      }

      // Track last writer per target slot for deterministic conflict detection
      const visibilityWriter = new Map<
        string,
        { ruleId: string; ruleName: string; value: boolean }
      >();
      const pageVisibilityWriter = new Map<
        string,
        { ruleId: string; ruleName: string; value: boolean }
      >();
      const disabledWriter = new Map<
        string,
        { ruleId: string; ruleName: string; value: boolean }
      >();
      const requiredWriter = new Map<
        string,
        { ruleId: string; ruleName: string; value: boolean }
      >();
      // Scope navigation conflict detection by triggerPageId (or '__global__')
      const navWriterByScope = new Map<
        string,
        { ruleId: string; ruleName: string; summary: string }
      >();

      const passMessages: LogicMessage[] = [];
      const passConflicts: LogicConflict[] = [];
      const passTrace: RuleExecutionTrace[] = [];
      const passDirectives: NavigationDirective[] = [];

      nextPageIdOverride = undefined;
      nextStepOverride = undefined;
      skipToComponentId = undefined;
      endFormTriggered = false;
      endFormTitle = undefined;
      endFormMessage = undefined;
      endFormRedirectUrl = undefined;

      // Pre-pass: For enabled rules with elseBehavior === 'revert', any target of a
      // `show_component` or `show_page` action starts hidden unless a matching rule reveals it.
      for (const rule of normalizedRules) {
        if (!rule.enabled || rule.execution.elseBehavior !== 'revert') continue;
        if (!ruleAppliesForTrigger(rule, context.trigger)) continue;
        for (const action of rule.actions) {
          if (
            action.type === 'show_component' &&
            action.targetComponentId &&
            visibleMap.has(action.targetComponentId)
          ) {
            visibleMap.set(action.targetComponentId, false);
          }
          if (
            action.type === 'show_page' &&
            action.targetPageId &&
            pageVisibleMap.has(action.targetPageId)
          ) {
            pageVisibleMap.set(action.targetPageId, false);
          }
        }
      }

      const executeActionList = (
        rule: StudioLogicRule,
        actions: LogicActionConfig[],
        branch: 'then' | 'else',
        sourcePageIds: string[],
        sourceComponentIds: string[],
        triggerPageId: string | undefined,
        executedActions: string[]
      ) => {
        const navScopeKey = triggerPageId || '__global__';

        for (const action of actions) {
          switch (action.type) {
            case 'show_component': {
              const tid = action.targetComponentId;
              if (tid && visibleMap.has(tid)) {
                const prev = visibilityWriter.get(tid);
                if (prev && prev.value === false && prev.ruleId !== rule.id) {
                  passConflicts.push({
                    targetKey: `visibility:${tid}`,
                    winningRuleId: rule.id,
                    winningRuleName: rule.name,
                    overriddenRuleId: prev.ruleId,
                    overriddenRuleName: prev.ruleName,
                    description: `Visibility conflict on "${document.components[tid]?.content.label || tid}": "${rule.name}" (Show) overrode "${prev.ruleName}" (Hide).`,
                  });
                }
                visibleMap.set(tid, true);
                visibilityWriter.set(tid, { ruleId: rule.id, ruleName: rule.name, value: true });
                executedActions.push(summarizeAction(action, document));
              }
              break;
            }

            case 'hide_component': {
              const tid = action.targetComponentId;
              if (tid && visibleMap.has(tid)) {
                const prev = visibilityWriter.get(tid);
                if (prev && prev.value === true && prev.ruleId !== rule.id) {
                  passConflicts.push({
                    targetKey: `visibility:${tid}`,
                    winningRuleId: rule.id,
                    winningRuleName: rule.name,
                    overriddenRuleId: prev.ruleId,
                    overriddenRuleName: prev.ruleName,
                    description: `Visibility conflict on "${document.components[tid]?.content.label || tid}": "${rule.name}" (Hide) overrode "${prev.ruleName}" (Show).`,
                  });
                }
                visibleMap.set(tid, false);
                visibilityWriter.set(tid, { ruleId: rule.id, ruleName: rule.name, value: false });
                executedActions.push(summarizeAction(action, document));
              }
              break;
            }

            case 'show_page': {
              const pid = action.targetPageId;
              if (pid && pageVisibleMap.has(pid)) {
                const prev = pageVisibilityWriter.get(pid);
                if (prev && prev.value === false && prev.ruleId !== rule.id) {
                  const pageTitle = document.pages.find((p) => p.id === pid)?.title || pid;
                  passConflicts.push({
                    targetKey: `page_visibility:${pid}`,
                    winningRuleId: rule.id,
                    winningRuleName: rule.name,
                    overriddenRuleId: prev.ruleId,
                    overriddenRuleName: prev.ruleName,
                    description: `Page visibility conflict on "${pageTitle}": "${rule.name}" (Show Page) overrode "${prev.ruleName}" (Hide Page).`,
                  });
                }
                pageVisibleMap.set(pid, true);
                skippedPages.delete(pid);
                pageVisibilityWriter.set(pid, {
                  ruleId: rule.id,
                  ruleName: rule.name,
                  value: true,
                });
                executedActions.push(summarizeAction(action, document));
              }
              break;
            }

            case 'hide_page': {
              const pid = action.targetPageId;
              if (pid && pageVisibleMap.has(pid)) {
                const prev = pageVisibilityWriter.get(pid);
                if (prev && prev.value === true && prev.ruleId !== rule.id) {
                  const pageTitle = document.pages.find((p) => p.id === pid)?.title || pid;
                  passConflicts.push({
                    targetKey: `page_visibility:${pid}`,
                    winningRuleId: rule.id,
                    winningRuleName: rule.name,
                    overriddenRuleId: prev.ruleId,
                    overriddenRuleName: prev.ruleName,
                    description: `Page visibility conflict on "${pageTitle}": "${rule.name}" (Hide Page) overrode "${prev.ruleName}" (Show Page).`,
                  });
                }
                pageVisibleMap.set(pid, false);
                pageVisibilityWriter.set(pid, {
                  ruleId: rule.id,
                  ruleName: rule.name,
                  value: false,
                });
                executedActions.push(summarizeAction(action, document));
              }
              break;
            }

            case 'skip_pages': {
              const targetIds =
                action.targetPageIds && action.targetPageIds.length > 0
                  ? action.targetPageIds
                  : action.targetPageId
                  ? [action.targetPageId]
                  : [];
              let anySkipped = false;
              for (const pid of targetIds) {
                if (pageVisibleMap.has(pid)) {
                  skippedPages.add(pid);
                  anySkipped = true;
                }
              }
              if (anySkipped) {
                executedActions.push(summarizeAction(action, document));
              }
              break;
            }

            case 'enable_component': {
              const tid = action.targetComponentId;
              if (tid && disabledMap.has(tid)) {
                const prev = disabledWriter.get(tid);
                if (prev && prev.value === true && prev.ruleId !== rule.id) {
                  passConflicts.push({
                    targetKey: `disabled:${tid}`,
                    winningRuleId: rule.id,
                    winningRuleName: rule.name,
                    overriddenRuleId: prev.ruleId,
                    overriddenRuleName: prev.ruleName,
                    description: `State conflict on "${document.components[tid]?.content.label || tid}": "${rule.name}" (Enable) overrode "${prev.ruleName}" (Disable).`,
                  });
                }
                disabledMap.set(tid, false);
                disabledWriter.set(tid, { ruleId: rule.id, ruleName: rule.name, value: false });
                executedActions.push(summarizeAction(action, document));
              }
              break;
            }

            case 'disable_component': {
              const tid = action.targetComponentId;
              if (tid && disabledMap.has(tid)) {
                const prev = disabledWriter.get(tid);
                if (prev && prev.value === false && prev.ruleId !== rule.id) {
                  passConflicts.push({
                    targetKey: `disabled:${tid}`,
                    winningRuleId: rule.id,
                    winningRuleName: rule.name,
                    overriddenRuleId: prev.ruleId,
                    overriddenRuleName: prev.ruleName,
                    description: `State conflict on "${document.components[tid]?.content.label || tid}": "${rule.name}" (Disable) overrode "${prev.ruleName}" (Enable).`,
                  });
                }
                disabledMap.set(tid, true);
                disabledWriter.set(tid, { ruleId: rule.id, ruleName: rule.name, value: true });
                executedActions.push(summarizeAction(action, document));
              }
              break;
            }

            case 'require_component': {
              const tid = action.targetComponentId;
              if (tid && requiredMap.has(tid)) {
                const prev = requiredWriter.get(tid);
                if (prev && prev.value === false && prev.ruleId !== rule.id) {
                  passConflicts.push({
                    targetKey: `required:${tid}`,
                    winningRuleId: rule.id,
                    winningRuleName: rule.name,
                    overriddenRuleId: prev.ruleId,
                    overriddenRuleName: prev.ruleName,
                    description: `Validation conflict on "${document.components[tid]?.content.label || tid}": "${rule.name}" (Require) overrode "${prev.ruleName}" (Optional).`,
                  });
                }
                requiredMap.set(tid, true);
                requiredWriter.set(tid, { ruleId: rule.id, ruleName: rule.name, value: true });
                executedActions.push(summarizeAction(action, document));
              }
              break;
            }

            case 'optional_component': {
              const tid = action.targetComponentId;
              if (tid && requiredMap.has(tid)) {
                const prev = requiredWriter.get(tid);
                if (prev && prev.value === true && prev.ruleId !== rule.id) {
                  passConflicts.push({
                    targetKey: `required:${tid}`,
                    winningRuleId: rule.id,
                    winningRuleName: rule.name,
                    overriddenRuleId: prev.ruleId,
                    overriddenRuleName: prev.ruleName,
                    description: `Validation conflict on "${document.components[tid]?.content.label || tid}": "${rule.name}" (Optional) overrode "${prev.ruleName}" (Require).`,
                  });
                }
                requiredMap.set(tid, false);
                requiredWriter.set(tid, { ruleId: rule.id, ruleName: rule.name, value: false });
                executedActions.push(summarizeAction(action, document));
              }
              break;
            }

            case 'navigate_to_page': {
              if (action.targetPageId) {
                const pageIndex = document.pages.findIndex((p) => p.id === action.targetPageId);
                if (pageIndex >= 0) {
                  const summary = `Navigate to ${document.pages[pageIndex].title || `Page ${pageIndex + 1}`}`;
                  const existingNav = navWriterByScope.get(navScopeKey);
                  if (existingNav && existingNav.ruleId !== rule.id) {
                    passConflicts.push({
                      targetKey: `navigation:${navScopeKey}`,
                      winningRuleId: existingNav.ruleId,
                      winningRuleName: existingNav.ruleName,
                      overriddenRuleId: rule.id,
                      overriddenRuleName: rule.name,
                      description: `Navigation conflict: higher-priority "${existingNav.ruleName}" (${existingNav.summary}) kept precedence over "${rule.name}" (${summary}).`,
                    });
                  } else if (!existingNav) {
                    navWriterByScope.set(navScopeKey, {
                      ruleId: rule.id,
                      ruleName: rule.name,
                      summary,
                    });
                    passDirectives.push({
                      ruleId: rule.id,
                      ruleName: rule.name,
                      priority: rule.priority,
                      branch,
                      actionType: 'navigate_to_page',
                      sourcePageIds,
                      sourceComponentIds,
                      triggerPageId,
                      targetPageId: action.targetPageId,
                    });
                    executedActions.push(summarizeAction(action, document));
                  }
                }
              }
              break;
            }

            case 'skip_to_question': {
              const tid = action.targetComponentId;
              if (tid && document.components[tid]) {
                const summary = `Skip to "${document.components[tid].content.label || tid}"`;
                const existingNav = navWriterByScope.get(navScopeKey);
                if (existingNav && existingNav.ruleId !== rule.id) {
                  passConflicts.push({
                    targetKey: `navigation:${navScopeKey}`,
                    winningRuleId: existingNav.ruleId,
                    winningRuleName: existingNav.ruleName,
                    overriddenRuleId: rule.id,
                    overriddenRuleName: rule.name,
                    description: `Navigation conflict: higher-priority "${existingNav.ruleName}" (${existingNav.summary}) kept precedence over "${rule.name}" (${summary}).`,
                  });
                } else if (!existingNav) {
                  navWriterByScope.set(navScopeKey, {
                    ruleId: rule.id,
                    ruleName: rule.name,
                    summary,
                  });
                  passDirectives.push({
                    ruleId: rule.id,
                    ruleName: rule.name,
                    priority: rule.priority,
                    branch,
                    actionType: 'skip_to_question',
                    sourcePageIds,
                    sourceComponentIds,
                    triggerPageId,
                    targetComponentId: tid,
                    targetPageId: document.components[tid].pageId,
                  });
                  executedActions.push(summarizeAction(action, document));
                }
              }
              break;
            }

            case 'end_form': {
              const summary = 'End form early';
              const existingNav = navWriterByScope.get(navScopeKey);
              if (existingNav && existingNav.ruleId !== rule.id) {
                passConflicts.push({
                  targetKey: `navigation:${navScopeKey}`,
                  winningRuleId: existingNav.ruleId,
                  winningRuleName: existingNav.ruleName,
                  overriddenRuleId: rule.id,
                  overriddenRuleName: rule.name,
                  description: `Navigation conflict: higher-priority "${existingNav.ruleName}" (${existingNav.summary}) kept precedence over "${rule.name}" (${summary}).`,
                });
              } else if (!existingNav) {
                navWriterByScope.set(navScopeKey, {
                  ruleId: rule.id,
                  ruleName: rule.name,
                  summary,
                });
                const resolvedTitle = action.endFormTitle
                  ? interpolatePlainMessage(
                      document,
                      action.endFormTitle,
                      workingAnswers,
                      resolvedVariables,
                      formattedVariables
                    )
                  : undefined;
                const resolvedMessage = action.endFormMessage
                  ? interpolatePlainMessage(
                      document,
                      action.endFormMessage,
                      workingAnswers,
                      resolvedVariables,
                      formattedVariables
                    )
                  : undefined;
                const rawRedirect = action.redirectUrl
                  ? interpolatePlainMessage(
                      document,
                      action.redirectUrl,
                      workingAnswers,
                      resolvedVariables,
                      formattedVariables
                    ).trim()
                  : '';
                const safeRedirect = rawRedirect && isSafeHttpUrl(rawRedirect) ? rawRedirect : undefined;

                passDirectives.push({
                  ruleId: rule.id,
                  ruleName: rule.name,
                  priority: rule.priority,
                  branch,
                  actionType: 'end_form',
                  sourcePageIds,
                  sourceComponentIds,
                  triggerPageId,
                  endFormTitle: resolvedTitle,
                  endFormMessage: resolvedMessage,
                  redirectUrl: safeRedirect,
                });
                executedActions.push(summarizeAction(action, document));
              }
              break;
            }

            case 'set_variable': {
              if (action.variableName) {
                const varDef = document.variables.find((v) => v.name === action.variableName);
                const interpolated = interpolatePlainMessage(
                  document,
                  action.value ?? '',
                  workingAnswers,
                  resolvedVariables,
                  formattedVariables
                );
                resolvedVariables[action.variableName] = coerceVariableValueSafe(
                  interpolated,
                  varDef
                );
                if (varDef) {
                  formattedVariables[varDef.name] = formatValue(
                    resolvedVariables[varDef.name],
                    varDef.format
                  );
                }
                executedActions.push(
                  `Set ${action.variableName} = ${String(resolvedVariables[action.variableName])}`
                );
              }
              break;
            }

            case 'set_calculated_value': {
              if (action.expression && action.expression.trim()) {
                const varDef = action.variableName
                  ? document.variables.find((v) => v.name === action.variableName)
                  : undefined;

                const evalRes = evaluateFormula(action.expression, {
                  answers: workingAnswers,
                  variables: resolvedVariables,
                  document,
                });

                let computed: unknown;
                if (evalRes.ok && evalRes.value !== null) {
                  computed = evalRes.value;
                  delete calculationErrors[action.id];
                } else {
                  const stripped = action.expression.replace(
                    /\{\{\s*[a-zA-Z0-9_\-.]+\s*\}\}/g,
                    ''
                  );
                  if (varDef?.valueType === 'string' && !/[+\-*/%()=<>]/.test(stripped)) {
                    computed = interpolatePlainMessage(
                      document,
                      action.expression,
                      workingAnswers,
                      resolvedVariables,
                      formattedVariables
                    );
                  } else {
                    computed = 0;
                    if (evalRes.error) {
                      calculationErrors[action.id] = evalRes.error;
                    }
                  }
                }

                if (action.variableName) {
                  const coerced = coerceVariableValueSafe(computed, varDef);
                  resolvedVariables[action.variableName] = coerced;
                  if (varDef) {
                    formattedVariables[varDef.name] = formatValue(coerced, varDef.format);
                  }
                  executedActions.push(`Calculated ${action.variableName} = ${String(coerced)}`);
                } else if (
                  action.targetComponentId &&
                  document.components[action.targetComponentId]
                ) {
                  calculatedComponentValues[action.targetComponentId] = computed;
                  workingAnswers[action.targetComponentId] = computed;
                  executedActions.push(
                    `Calculated "${document.components[action.targetComponentId].content.label}" = ${String(computed)}`
                  );
                }
              }
              break;
            }

            case 'display_message': {
              if (action.message && action.message.trim()) {
                passMessages.push({
                  id: `${rule.id}_${action.id}`,
                  ruleId: rule.id,
                  text: interpolatePlainMessage(
                    document,
                    action.message,
                    workingAnswers,
                    resolvedVariables,
                    formattedVariables
                  ),
                  tone: action.messageTone || 'info',
                  targetComponentId: action.targetComponentId || undefined,
                });
                executedActions.push(summarizeAction(action, document));
              }
              break;
            }
          }
        }
      };

      let stoppedByPriorRule = false;

      for (const rule of normalizedRules) {
        if (!rule.enabled) {
          passTrace.push({
            ruleId: rule.id,
            ruleName: rule.name,
            priority: rule.priority,
            enabled: false,
            trigger: rule.trigger,
            matched: false,
            branchTaken: 'none',
            skippedReason: 'Rule is disabled',
            conditionTrace: {
              itemId: rule.conditionGroup.id,
              kind: 'group',
              passed: false,
              label: 'Disabled',
            },
            executedActions: [],
          });
          continue;
        }

        if (stoppedByPriorRule) {
          passTrace.push({
            ruleId: rule.id,
            ruleName: rule.name,
            priority: rule.priority,
            enabled: true,
            trigger: rule.trigger,
            matched: false,
            branchTaken: 'none',
            skippedReason: 'Stopped by a higher-priority rule with stop-on-match enabled',
            conditionTrace: {
              itemId: rule.conditionGroup.id,
              kind: 'group',
              passed: false,
              label: 'Skipped',
            },
            executedActions: [],
          });
          continue;
        }

        if (!ruleAppliesForTrigger(rule, context.trigger)) {
          passTrace.push({
            ruleId: rule.id,
            ruleName: rule.name,
            priority: rule.priority,
            enabled: true,
            trigger: rule.trigger,
            matched: false,
            branchTaken: 'none',
            skippedReason: `Trigger (${rule.trigger}) does not match current event`,
            conditionTrace: {
              itemId: rule.conditionGroup.id,
              kind: 'group',
              passed: false,
              label: 'Inactive trigger',
            },
            executedActions: [],
          });
          continue;
        }

        const conditionTrace = evaluateConditionGroupWithTrace(
          document,
          rule.conditionGroup,
          workingAnswers,
          resolvedVariables
        );

        const sourcePagesSet = new Set<string>();
        const sourceComponentsSet = new Set<string>();
        collectConditionSources(document, rule.conditionGroup, sourcePagesSet, sourceComponentsSet);
        const sourcePageIds = Array.from(sourcePagesSet);
        const sourceComponentIds = Array.from(sourceComponentsSet);
        const triggerPageId = resolveTriggerPageId(document, sourcePageIds);

        const executedActions: string[] = [];
        let branchTaken: 'then' | 'else' | 'none' = 'none';

        if (conditionTrace.passed) {
          branchTaken = 'then';
          executeActionList(
            rule,
            rule.actions,
            'then',
            sourcePageIds,
            sourceComponentIds,
            triggerPageId,
            executedActions
          );
          if (rule.execution.stopOnMatch) {
            stoppedByPriorRule = true;
          }
        } else if (rule.elseActions && rule.elseActions.length > 0) {
          branchTaken = 'else';
          executeActionList(
            rule,
            rule.elseActions,
            'else',
            sourcePageIds,
            sourceComponentIds,
            triggerPageId,
            executedActions
          );
        }

        passTrace.push({
          ruleId: rule.id,
          ruleName: rule.name,
          priority: rule.priority,
          enabled: true,
          trigger: rule.trigger,
          matched: conditionTrace.passed,
          branchTaken,
          conditionTrace,
          executedActions,
        });
      }

      // Compute visible pages (excluding hidden pages)
      const nextVisiblePages = new Set<string>();
      const hiddenOrSkippedPages = new Set<string>();
      for (const page of document.pages) {
        const isPageVis = pageVisibleMap.get(page.id) !== false;
        if (isPageVis) {
          nextVisiblePages.add(page.id);
        }
        if (!isPageVis || skippedPages.has(page.id)) {
          hiddenOrSkippedPages.add(page.id);
        }
      }

      // Propagate hidden state recursively from hidden/skipped pages AND hidden sections/containers
      // down to every nested child component so hidden descendants NEVER remain visible or required.
      const effectiveVisibleMap = new Map<string, boolean>();
      const visitedTreeNodes = new Set<string>();

      const walkComponentTree = (nodeId: string, ancestorHidden: boolean) => {
        if (visitedTreeNodes.has(nodeId)) return;
        visitedTreeNodes.add(nodeId);
        const node = document.components[nodeId];
        if (!node) return;

        const selfVisible = visibleMap.get(nodeId) === true;
        const effectiveVisible = !ancestorHidden && selfVisible;
        effectiveVisibleMap.set(nodeId, effectiveVisible);

        for (const childId of node.children || []) {
          walkComponentTree(childId, !effectiveVisible);
        }
      };

      for (const page of document.pages) {
        const pageHidden = hiddenOrSkippedPages.has(page.id);
        for (const rootId of page.componentIds || []) {
          walkComponentTree(rootId, pageHidden);
        }
      }

      // Fallback for any component not reachable from rootComponentIds
      for (const component of Object.values(document.components)) {
        if (!effectiveVisibleMap.has(component.id)) {
          const pageHidden = hiddenOrSkippedPages.has(component.pageId);
          effectiveVisibleMap.set(
            component.id,
            !pageHidden && visibleMap.get(component.id) === true
          );
        }
      }

      // Build final sets for this pass (hidden or disabled components are NEVER required)
      const nextVisible = new Set<string>();
      const nextDisabled = new Set<string>();
      const nextRequired = new Set<string>();

      for (const [id, isVis] of effectiveVisibleMap.entries()) {
        const isDis = disabledMap.get(id) === true;
        const isReq = requiredMap.get(id) === true;
        if (isVis) {
          nextVisible.add(id);
          if (isDis) {
            nextDisabled.add(id);
          } else if (isReq) {
            nextRequired.add(id);
          }
        }
      }

      // Project the active primary navigation directive for backward-compatible top-level fields.
      // When context.currentPageId is supplied, pick the first directive scoped to that page
      // (or global). Otherwise pick the first directive in priority order.
      const activeDirective = context.currentPageId
        ? passDirectives.find(
            (d) => !d.triggerPageId || d.triggerPageId === context.currentPageId
          )
        : passDirectives[0];

      if (activeDirective) {
        if (activeDirective.actionType === 'navigate_to_page' && activeDirective.targetPageId) {
          const idx = document.pages.findIndex((p) => p.id === activeDirective.targetPageId);
          if (idx >= 0) {
            nextPageIdOverride = activeDirective.targetPageId;
            nextStepOverride = idx + 1;
          }
        } else if (
          activeDirective.actionType === 'skip_to_question' &&
          activeDirective.targetComponentId
        ) {
          skipToComponentId = activeDirective.targetComponentId;
          const targetPageId = activeDirective.targetPageId;
          const idx = targetPageId
            ? document.pages.findIndex((p) => p.id === targetPageId)
            : -1;
          if (idx >= 0) {
            nextPageIdOverride = document.pages[idx].id;
            nextStepOverride = idx + 1;
          }
        } else if (activeDirective.actionType === 'end_form') {
          endFormTriggered = true;
          endFormTitle = activeDirective.endFormTitle;
          endFormMessage = activeDirective.endFormMessage;
          endFormRedirectUrl = activeDirective.redirectUrl;
        }
      }

      finalVisible = nextVisible;
      finalDisabled = nextDisabled;
      finalRequired = nextRequired;
      finalVisiblePages = nextVisiblePages;
      finalSkippedPages = skippedPages;
      finalMessages = passMessages;
      finalConflicts = passConflicts;
      finalTrace = passTrace;
      finalNavigationDirectives = passDirectives;

      // Re-run dependent calculated variables if any rule updated a variable or calculated field
      if ((document.variables || []).some((v) => v.expression && v.expression.trim())) {
        const refreshed = evaluateDocumentCalculations(
          document,
          workingAnswers,
          resolvedVariables,
          context.calculationCache
        );
        Object.assign(resolvedVariables, refreshed.values);
        formattedVariables = { ...refreshed.formattedValues };
        Object.assign(calculationErrors, refreshed.errorsByVariableId);
      } else {
        for (const v of document.variables || []) {
          formattedVariables[v.name] = formatValue(resolvedVariables[v.name], v.format);
        }
      }

      const nextVarSnapshot = JSON.stringify(resolvedVariables);
      const nextCalcSnapshot = JSON.stringify(calculatedComponentValues);

      // Fixed-point reached: no variables or calculated values changed during this pass
      if (nextVarSnapshot === prevVarSnapshot && nextCalcSnapshot === prevCalcSnapshot) {
        break;
      }

      if (pass === MAX_EVALUATION_PASSES - 1) {
        loopGuardTriggered = true;
      }
    }

    return {
      visibleComponentIds: finalVisible,
      disabledComponentIds: finalDisabled,
      requiredComponentIds: finalRequired,
      visiblePageIds: finalVisiblePages,
      skippedPageIds: finalSkippedPages,
      resolvedVariables,
      formattedVariables,
      calculationErrors,
      calculatedComponentValues,
      messages: finalMessages,
      navigationDirectives: finalNavigationDirectives,
      nextPageIdOverride,
      nextStepOverride,
      skipToComponentId,
      endFormTriggered,
      endFormTitle,
      endFormMessage,
      endFormRedirectUrl,
      conflicts: context.includeDebugTrace ? finalConflicts : [],
      loopGuardTriggered,
      passesExecuted,
      trace: context.includeDebugTrace ? finalTrace : [],
    };
  }
}

export const defaultLogicEngine: ILogicEngine = new DefaultLogicEngine();

// ============================================================================
// Static Rule Validator, Conflict Analyzer & Circular Navigation Detector
// ============================================================================

const NAV_ACTION_TYPES = new Set(['navigate_to_page', 'skip_to_question', 'end_form']);

function hasContradictoryAndGroup(group: LogicConditionGroup): string | null {
  if (!group.items || group.items.length === 0) return null;

  if (group.combinator === 'OR') {
    // An OR group is unsatisfiable only if EVERY child group is unsatisfiable
    const subResults = group.items.map((item) =>
      item.kind === 'group' ? hasContradictoryAndGroup(item) : null
    );
    if (subResults.every((r) => r !== null)) {
      return subResults[0];
    }
    return null;
  }

  // AND group: if any nested group is contradictory, the whole AND group is contradictory
  const directClauses: LogicConditionClause[] = [];
  for (const item of group.items) {
    if (item.kind === 'group') {
      const sub = hasContradictoryAndGroup(item);
      if (sub) return sub;
    } else if (item.sourceId) {
      directClauses.push(item);
    }
  }

  // Group direct clauses by (sourceType, sourceId)
  const bySource = new Map<string, LogicConditionClause[]>();
  for (const clause of directClauses) {
    const key = `${clause.sourceType}:${clause.sourceId}`;
    const list = bySource.get(key) || [];
    list.push(clause);
    bySource.set(key, list);
  }

  for (const clauses of bySource.values()) {
    if (clauses.length < 2) continue;

    // equals A AND equals B (A !== B)
    const eqValues = new Set(
      clauses
        .filter((c) => c.operator === 'equals' && String(c.value ?? '').trim() !== '')
        .map((c) => String(c.value).trim().toLowerCase())
    );
    if (eqValues.size > 1) {
      return 'requires the same field to equal two different values at once';
    }

    // equals A AND not_equals A
    for (const eqVal of eqValues) {
      const hasNotEq = clauses.some(
        (c) =>
          c.operator === 'not_equals' &&
          String(c.value ?? '').trim().toLowerCase() === eqVal
      );
      if (hasNotEq) {
        return 'requires the same field to both equal and not equal the same value';
      }
    }

    // is_empty AND is_not_empty
    const hasEmpty = clauses.some((c) => c.operator === 'is_empty');
    const hasNotEmpty = clauses.some((c) => c.operator === 'is_not_empty');
    if (hasEmpty && hasNotEmpty) {
      return 'requires the same field to be both empty and not empty';
    }

    // is_true AND is_false
    const hasTrue = clauses.some((c) => c.operator === 'is_true');
    const hasFalse = clauses.some((c) => c.operator === 'is_false');
    if (hasTrue && hasFalse) {
      return 'requires the same field to be both Yes/True and No/False';
    }

    // Numeric lower vs upper bound contradiction
    let strictMin = -Infinity;
    let inclusiveMin = -Infinity;
    let strictMax = Infinity;
    let inclusiveMax = Infinity;

    for (const c of clauses) {
      const n = Number(c.value);
      if (!Number.isFinite(n)) continue;
      if (c.operator === 'greater_than') strictMin = Math.max(strictMin, n);
      if (c.operator === 'greater_than_or_equal') inclusiveMin = Math.max(inclusiveMin, n);
      if (c.operator === 'less_than') strictMax = Math.min(strictMax, n);
      if (c.operator === 'less_than_or_equal') inclusiveMax = Math.min(inclusiveMax, n);
    }

    const effectiveMin = Math.max(strictMin, inclusiveMin);
    const effectiveMax = Math.min(strictMax, inclusiveMax);
    if (effectiveMin > effectiveMax) {
      return 'contains contradictory numeric range bounds';
    }
    if (effectiveMin === effectiveMax && (strictMin === effectiveMin || strictMax === effectiveMax)) {
      return 'contains mutually exclusive numeric bounds';
    }
  }

  return null;
}

function isTautologyGroup(group: LogicConditionGroup): boolean {
  if (!group.items || group.items.length === 0) return false;
  if (group.combinator !== 'OR') return false;

  const directClauses = group.items.filter(
    (item): item is LogicConditionClause => item.kind === 'condition' && Boolean(item.sourceId)
  );
  const bySource = new Map<string, LogicConditionClause[]>();
  for (const c of directClauses) {
    const key = `${c.sourceType}:${c.sourceId}`;
    const list = bySource.get(key) || [];
    list.push(c);
    bySource.set(key, list);
  }

  for (const clauses of bySource.values()) {
    const hasEmpty = clauses.some((c) => c.operator === 'is_empty');
    const hasNotEmpty = clauses.some((c) => c.operator === 'is_not_empty');
    if (hasEmpty && hasNotEmpty) return true;
  }
  return false;
}

function validateConditionGroupStatic(
  document: FormDocument,
  rule: StudioLogicRule,
  group: LogicConditionGroup,
  errors: LogicValidationIssue[],
  warnings: LogicValidationIssue[]
): void {
  if (!group.items || group.items.length === 0) {
    errors.push({
      id: `${rule.id}_${group.id}_empty`,
      severity: 'error',
      code: 'EMPTY_CONDITIONS',
      ruleId: rule.id,
      ruleName: rule.name,
      itemId: group.id,
      message: `Rule "${rule.name}" has an empty condition group.`,
    });
    return;
  }

  for (const item of group.items) {
    if (item.kind === 'group') {
      validateConditionGroupStatic(document, rule, item, errors, warnings);
      continue;
    }

    let dataType: LogicDataType = 'text';
    if (item.sourceType === 'variable') {
      const variable = document.variables.find(
        (v) => v.name === item.sourceId || v.id === item.sourceId
      );
      if (!item.sourceId || !variable) {
        errors.push({
          id: `${rule.id}_${item.id}_missing_var`,
          severity: 'error',
          code: 'MISSING_SOURCE_VARIABLE',
          ruleId: rule.id,
          ruleName: rule.name,
          itemId: item.id,
          message: `Rule "${rule.name}" references a variable ("${item.sourceId || 'none'}") that no longer exists.`,
        });
        continue;
      }
      dataType = inferVariableDataType(variable);
    } else {
      const node = document.components[item.sourceId];
      if (!item.sourceId || !node) {
        errors.push({
          id: `${rule.id}_${item.id}_missing_comp`,
          severity: 'error',
          code: 'MISSING_SOURCE_COMPONENT',
          ruleId: rule.id,
          ruleName: rule.name,
          itemId: item.id,
          message: `Rule "${rule.name}" references a deleted or missing question in its conditions.`,
        });
        continue;
      }
      dataType = inferComponentDataType(node);
    }

    const opDef = conditionOperatorRegistry.get(item.operator);
    if (opDef && opDef.valueArity >= 1 && String(item.value ?? '').trim() === '') {
      errors.push({
        id: `${rule.id}_${item.id}_empty_val`,
        severity: 'error',
        code: 'INCOMPLETE_CONDITION_VALUE',
        ruleId: rule.id,
        ruleName: rule.name,
        itemId: item.id,
        message: `Rule "${rule.name}" is missing a comparison value for "${opDef.label}".`,
      });
    }

    if (opDef && opDef.valueArity === 2) {
      if (String(item.secondaryValue ?? '').trim() === '') {
        errors.push({
          id: `${rule.id}_${item.id}_empty_val2`,
          severity: 'error',
          code: 'INCOMPLETE_CONDITION_VALUE',
          ruleId: rule.id,
          ruleName: rule.name,
          itemId: item.id,
          message: `Rule "${rule.name}" requires both a minimum and maximum value for "is between".`,
        });
      } else if (dataType === 'number') {
        const low = Number(item.value);
        const high = Number(item.secondaryValue);
        if (Number.isNaN(low) || Number.isNaN(high)) {
          errors.push({
            id: `${rule.id}_${item.id}_nan_range`,
            severity: 'error',
            code: 'INVALID_RANGE_BOUNDS',
            ruleId: rule.id,
            ruleName: rule.name,
            itemId: item.id,
            message: `Rule "${rule.name}" has non-numeric bounds for "is between".`,
          });
        } else if (low > high) {
          warnings.push({
            id: `${rule.id}_${item.id}_reversed_range`,
            severity: 'warning',
            code: 'INVALID_RANGE_BOUNDS',
            ruleId: rule.id,
            ruleName: rule.name,
            itemId: item.id,
            message: `Rule "${rule.name}" has inverted range bounds (${low} > ${high}). Bounds will be normalized automatically.`,
          });
        }
      }
    }
  }
}

export function validateFormLogic(document: FormDocument): LogicValidationReport {
  const errors: LogicValidationIssue[] = [];
  const warnings: LogicValidationIssue[] = [];
  const rules = (document.logic.rules || [])
    .map((r, idx) => normalizeLogicRule(r as AnyLogicRule, document, idx))
    .sort((a, b) => a.priority - b.priority);

  const pageIds = new Set(document.pages.map((p) => p.id));
  const pageIndexById = new Map<string, number>();
  document.pages.forEach((p, idx) => pageIndexById.set(p.id, idx));
  const variableNames = new Set((document.variables || []).map((v) => v.name));

  // Directed graph for circular navigation detection: pageId -> Set<targetPageId>
  const navEdges = new Map<string, Set<string>>();
  // Track static potential visibility/required/state conflicts across enabled rules
  const targetActionsMap = new Map<string, { ruleId: string; ruleName: string; type: string }[]>();
  const pageTargetActionsMap = new Map<
    string,
    { ruleId: string; ruleName: string; type: string }[]
  >();
  // Track navigation destinations per trigger page for competing-branch diagnostics
  const navDestinationsByScope = new Map<
    string,
    { ruleId: string; ruleName: string; summary: string }[]
  >();

  // Track which hidden-by-default components have at least one enabled show_component rule
  const shownByAnyRule = new Set<string>();
  for (const r of rules) {
    if (!r.enabled) continue;
    for (const act of [...(r.actions || []), ...(r.elseActions || [])]) {
      if (act.type === 'show_component' && act.targetComponentId) {
        shownByAnyRule.add(act.targetComponentId);
      }
    }
  }

  let unconditionalStopRule: StudioLogicRule | null = null;

  const validateActionBranch = (
    rule: StudioLogicRule,
    actions: LogicActionConfig[],
    branchLabel: 'THEN' | 'ELSE',
    sourcePages: Set<string>,
    sourceComponents: Set<string>,
    triggerPageId: string | undefined
  ) => {
    const navActionsInBranch: LogicActionConfig[] = [];
    const maxSourcePageIdx =
      sourcePages.size > 0
        ? Math.max(...Array.from(sourcePages).map((pid) => pageIndexById.get(pid) ?? -1))
        : -1;

    for (const action of actions) {
      const def = logicActionRegistry.get(action.type);
      if (!def) continue;

      if (NAV_ACTION_TYPES.has(action.type)) {
        navActionsInBranch.push(action);
      }

      if (def.requiresComponentTarget) {
        if (!action.targetComponentId || !document.components[action.targetComponentId]) {
          errors.push({
            id: `${rule.id}_${action.id}_missing_target_comp`,
            severity: 'error',
            code: 'MISSING_TARGET_COMPONENT',
            ruleId: rule.id,
            ruleName: rule.name,
            itemId: action.id,
            message: `Rule "${rule.name}" (${branchLabel}) targets a deleted or unselected question/block in "${def.label}".`,
          });
        } else if (rule.enabled) {
          const list = targetActionsMap.get(action.targetComponentId) || [];
          list.push({ ruleId: rule.id, ruleName: rule.name, type: action.type });
          targetActionsMap.set(action.targetComponentId, list);

          // Check if a visibility/requirement rule on an earlier page depends on a question on a LATER page
          if (action.type !== 'skip_to_question' && maxSourcePageIdx >= 0) {
            const targetNode = document.components[action.targetComponentId];
            const targetPageIdx = pageIndexById.get(targetNode.pageId) ?? -1;
            if (targetPageIdx >= 0 && maxSourcePageIdx > targetPageIdx) {
              warnings.push({
                id: `${rule.id}_${action.id}_future_source`,
                severity: 'warning',
                code: 'UNAVAILABLE_CONDITION_SOURCE',
                ruleId: rule.id,
                ruleName: rule.name,
                itemId: action.id,
                message: `Rule "${rule.name}" updates "${targetNode.content.label}" on Page ${targetPageIdx + 1} using an answer from Page ${maxSourcePageIdx + 1}, which has not been answered yet when respondents first see that page.`,
              });
            }
          }
        }
      }

      if (def.requiresPageTarget) {
        if (!action.targetPageId || !pageIds.has(action.targetPageId)) {
          errors.push({
            id: `${rule.id}_${action.id}_missing_target_page`,
            severity: 'error',
            code: 'MISSING_TARGET_PAGE',
            ruleId: rule.id,
            ruleName: rule.name,
            itemId: action.id,
            message: `Rule "${rule.name}" (${branchLabel}) targets a page that no longer exists.`,
          });
        } else if (rule.enabled) {
          if (action.type === 'show_page' || action.type === 'hide_page') {
            const list = pageTargetActionsMap.get(action.targetPageId) || [];
            list.push({ ruleId: rule.id, ruleName: rule.name, type: action.type });
            pageTargetActionsMap.set(action.targetPageId, list);
          }

          if (action.type === 'navigate_to_page') {
            const edgeOriginPages = triggerPageId ? [triggerPageId] : Array.from(sourcePages);
            for (const srcPageId of edgeOriginPages) {
              if (!navEdges.has(srcPageId)) navEdges.set(srcPageId, new Set());
              navEdges.get(srcPageId)!.add(action.targetPageId);
            }
            const scopeKey = triggerPageId || '__global__';
            const navList = navDestinationsByScope.get(scopeKey) || [];
            const pageName =
              document.pages.find((p) => p.id === action.targetPageId)?.title ||
              action.targetPageId;
            navList.push({
              ruleId: rule.id,
              ruleName: rule.name,
              summary: `Navigate to "${pageName}"`,
            });
            navDestinationsByScope.set(scopeKey, navList);
          }
        }
      }

      if (def.requiresMultiPageTarget) {
        const ids = action.targetPageIds || [];
        if (ids.length === 0) {
          errors.push({
            id: `${rule.id}_${action.id}_empty_skip_pages`,
            severity: 'error',
            code: 'MISSING_TARGET_PAGE',
            ruleId: rule.id,
            ruleName: rule.name,
            itemId: action.id,
            message: `Rule "${rule.name}" (${branchLabel}) has a Skip Pages action with no pages selected.`,
          });
        } else {
          for (const pid of ids) {
            if (!pageIds.has(pid)) {
              errors.push({
                id: `${rule.id}_${action.id}_missing_skip_page_${pid}`,
                severity: 'error',
                code: 'MISSING_TARGET_PAGE',
                ruleId: rule.id,
                ruleName: rule.name,
                itemId: action.id,
                message: `Rule "${rule.name}" (${branchLabel}) attempts to skip a page that no longer exists.`,
              });
            }
          }
        }
      }

      if (action.type === 'skip_to_question' && action.targetComponentId && rule.enabled) {
        const targetNode = document.components[action.targetComponentId];
        if (targetNode) {
          const edgeOriginPages = triggerPageId ? [triggerPageId] : Array.from(sourcePages);
          for (const srcPageId of edgeOriginPages) {
            if (srcPageId !== targetNode.pageId) {
              if (!navEdges.has(srcPageId)) navEdges.set(srcPageId, new Set());
              navEdges.get(srcPageId)!.add(targetNode.pageId);
            }
          }
          const scopeKey = triggerPageId || '__global__';
          const navList = navDestinationsByScope.get(scopeKey) || [];
          navList.push({
            ruleId: rule.id,
            ruleName: rule.name,
            summary: `Skip to "${targetNode.content.label}"`,
          });
          navDestinationsByScope.set(scopeKey, navList);
        }
      }

      if (action.type === 'end_form') {
        if (action.redirectUrl && action.redirectUrl.trim() && !isSafeHttpUrl(action.redirectUrl)) {
          errors.push({
            id: `${rule.id}_${action.id}_invalid_redirect`,
            severity: 'error',
            code: 'INVALID_REDIRECT_URL',
            ruleId: rule.id,
            ruleName: rule.name,
            itemId: action.id,
            message: `Rule "${rule.name}" (${branchLabel}) has an invalid redirect URL. Only http:// or https:// URLs are allowed.`,
          });
        }
        if (rule.enabled) {
          const scopeKey = triggerPageId || '__global__';
          const navList = navDestinationsByScope.get(scopeKey) || [];
          navList.push({
            ruleId: rule.id,
            ruleName: rule.name,
            summary: 'End Form',
          });
          navDestinationsByScope.set(scopeKey, navList);
        }
      }

      if (def.requiresVariableTarget) {
        const targetVar = document.variables.find((v) => v.name === action.variableName);
        if (!action.variableName || !targetVar) {
          errors.push({
            id: `${rule.id}_${action.id}_missing_var`,
            severity: 'error',
            code: 'MISSING_TARGET_VARIABLE',
            ruleId: rule.id,
            ruleName: rule.name,
            itemId: action.id,
            message: `Rule "${rule.name}" (${branchLabel}) sets a variable ("${action.variableName || 'none'}") that is not defined.`,
          });
        } else if (action.value && !action.value.includes('{{')) {
          const check = validateVariableAssignment(targetVar, action.value);
          if (!check.valid) {
            errors.push({
              id: `${rule.id}_${action.id}_var_type_mismatch`,
              severity: 'error',
              code: 'VARIABLE_TYPE_MISMATCH',
              ruleId: rule.id,
              ruleName: rule.name,
              itemId: action.id,
              message: `Rule "${rule.name}" (${branchLabel}): ${check.error}`,
            });
          }
        }
      }

      if (action.type === 'set_calculated_value') {
        const targetVar = action.variableName
          ? document.variables.find((v) => v.name === action.variableName)
          : undefined;
        const hasValidVar = Boolean(targetVar);
        const hasValidComp = Boolean(
          action.targetComponentId && document.components[action.targetComponentId]
        );
        if (!hasValidVar && !hasValidComp) {
          errors.push({
            id: `${rule.id}_${action.id}_missing_calc_target`,
            severity: 'error',
            code: 'MISSING_TARGET_VARIABLE',
            ruleId: rule.id,
            ruleName: rule.name,
            itemId: action.id,
            message: `Rule "${rule.name}" (${branchLabel}) must select a valid variable or question for the calculated value.`,
          });
        }
        const formulaCheck = validateFormula(action.expression || '', document, {
          targetVariableType: targetVar?.valueType,
        });
        for (const fErr of formulaCheck.errors) {
          const mappedCode =
            fErr.code === 'DIVISION_BY_ZERO'
              ? 'DIVISION_BY_ZERO'
              : fErr.code === 'TYPE_MISMATCH'
              ? 'VARIABLE_TYPE_MISMATCH'
              : 'INVALID_EXPRESSION';
          errors.push({
            id: `${rule.id}_${action.id}_${fErr.code}_${fErr.token || 'expr'}`,
            severity: 'error',
            code: mappedCode,
            ruleId: rule.id,
            ruleName: rule.name,
            itemId: action.id,
            message: `Rule "${rule.name}" (${branchLabel}): ${fErr.message}`,
          });
        }
        for (const fWarn of formulaCheck.warnings) {
          warnings.push({
            id: `${rule.id}_${action.id}_warn_${fWarn.token || 'expr'}`,
            severity: 'warning',
            code: 'INVALID_EXPRESSION',
            ruleId: rule.id,
            ruleName: rule.name,
            itemId: action.id,
            message: `Rule "${rule.name}" (${branchLabel}): ${fWarn.message}`,
          });
        }
      }

      if (action.type === 'display_message') {
        if (!action.message || !action.message.trim()) {
          errors.push({
            id: `${rule.id}_${action.id}_empty_msg`,
            severity: 'error',
            code: 'EMPTY_MESSAGE',
            ruleId: rule.id,
            ruleName: rule.name,
            itemId: action.id,
            message: `Rule "${rule.name}" (${branchLabel}) has a Display Message action with no message text.`,
          });
        }
        if (action.targetComponentId && !document.components[action.targetComponentId]) {
          warnings.push({
            id: `${rule.id}_${action.id}_msg_anchor`,
            severity: 'warning',
            code: 'MISSING_TARGET_COMPONENT',
            ruleId: rule.id,
            ruleName: rule.name,
            itemId: action.id,
            message: `Message in "${rule.name}" was anchored to a deleted block; it will display at the top of the page instead.`,
          });
        }
      }
    }

    // Multiple incompatible navigation actions inside the same branch of a single rule
    if (navActionsInBranch.length > 1) {
      warnings.push({
        id: `${rule.id}_${branchLabel}_multi_nav`,
        severity: 'warning',
        code: 'INCOMPATIBLE_NAVIGATION',
        ruleId: rule.id,
        ruleName: rule.name,
        message: `Rule "${rule.name}" (${branchLabel}) contains ${navActionsInBranch.length} navigation/end-form actions. Only the first action can execute; remove extra navigation actions in this branch.`,
      });
    }

    // Check if any condition source is hiddenByDefault and never shown by any rule
    for (const srcCompId of sourceComponents) {
      const node = document.components[srcCompId];
      if (node?.behaviour.hiddenByDefault && !shownByAnyRule.has(srcCompId)) {
        warnings.push({
          id: `${rule.id}_unshown_source_${srcCompId}`,
          severity: 'warning',
          code: 'UNAVAILABLE_CONDITION_SOURCE',
          ruleId: rule.id,
          ruleName: rule.name,
          message: `Rule "${rule.name}" depends on "${node.content.label}", which is hidden by default and has no rule that ever shows it.`,
        });
      }
    }
  };

  for (const rule of rules) {
    if (!rule.name || !rule.name.trim()) {
      warnings.push({
        id: `${rule.id}_empty_name`,
        severity: 'warning',
        code: 'EMPTY_RULE_NAME',
        ruleId: rule.id,
        message: 'A logic rule has an empty name. Give it a clear title for easier maintenance.',
      });
    }

    validateConditionGroupStatic(document, rule, rule.conditionGroup, errors, warnings);

    if (rule.enabled && unconditionalStopRule) {
      warnings.push({
        id: `${rule.id}_shadowed_by_stop`,
        severity: 'warning',
        code: 'UNREACHABLE_ACTION',
        ruleId: rule.id,
        ruleName: rule.name,
        message: `Rule "${rule.name}" can never execute because higher-priority rule "${unconditionalStopRule.name}" always matches and stops further evaluation.`,
      });
    }

    // Contradictory AND conditions make THEN actions unreachable
    const contradictionReason = hasContradictoryAndGroup(rule.conditionGroup);
    if (rule.enabled && contradictionReason) {
      warnings.push({
        id: `${rule.id}_contradiction`,
        severity: 'warning',
        code: 'UNREACHABLE_ACTION',
        ruleId: rule.id,
        ruleName: rule.name,
        message: `Actions in rule "${rule.name}" can never execute because its condition group ${contradictionReason}.`,
      });
    }

    if (!rule.actions || rule.actions.length === 0) {
      errors.push({
        id: `${rule.id}_no_actions`,
        severity: 'error',
        code: 'EMPTY_ACTIONS',
        ruleId: rule.id,
        ruleName: rule.name,
        message: `Rule "${rule.name}" has no actions configured.`,
      });
      continue;
    }

    const sourcePages = new Set<string>();
    const sourceComponents = new Set<string>();
    collectConditionSources(document, rule.conditionGroup, sourcePages, sourceComponents);
    const triggerPageId = resolveTriggerPageId(document, Array.from(sourcePages));

    validateActionBranch(rule, rule.actions, 'THEN', sourcePages, sourceComponents, triggerPageId);
    if (rule.elseActions && rule.elseActions.length > 0) {
      validateActionBranch(
        rule,
        rule.elseActions,
        'ELSE',
        sourcePages,
        sourceComponents,
        triggerPageId
      );
    }

    if (
      rule.enabled &&
      rule.execution.stopOnMatch &&
      isTautologyGroup(rule.conditionGroup) &&
      !unconditionalStopRule
    ) {
      unconditionalStopRule = rule;
    }
  }

  // Detect static conflicting action pairs targeting the same component across distinct rules
  for (const [compId, entries] of targetActionsMap.entries()) {
    const compName = document.components[compId]?.content.label || compId;
    const hasShow = entries.find((e) => e.type === 'show_component');
    const hasHide = entries.find((e) => e.type === 'hide_component');
    if (hasShow && hasHide && hasShow.ruleId !== hasHide.ruleId) {
      warnings.push({
        id: `conflict_vis_${compId}`,
        severity: 'warning',
        code: 'POTENTIAL_ACTION_CONFLICT',
        message: `"${compName}" is both shown by "${hasShow.ruleName}" and hidden by "${hasHide.ruleName}". Execution priority determines the winner if both match.`,
      });
    }
    const hasReq = entries.find((e) => e.type === 'require_component');
    const hasOpt = entries.find((e) => e.type === 'optional_component');
    if (hasReq && hasOpt && hasReq.ruleId !== hasOpt.ruleId) {
      warnings.push({
        id: `conflict_req_${compId}`,
        severity: 'warning',
        code: 'POTENTIAL_ACTION_CONFLICT',
        message: `"${compName}" is marked required by "${hasReq.ruleName}" and optional by "${hasOpt.ruleName}".`,
      });
    }
    const hasEnable = entries.find((e) => e.type === 'enable_component');
    const hasDisable = entries.find((e) => e.type === 'disable_component');
    if (hasEnable && hasDisable && hasEnable.ruleId !== hasDisable.ruleId) {
      warnings.push({
        id: `conflict_state_${compId}`,
        severity: 'warning',
        code: 'POTENTIAL_ACTION_CONFLICT',
        message: `"${compName}" is enabled by "${hasEnable.ruleName}" and disabled by "${hasDisable.ruleName}".`,
      });
    }
  }

  // Detect conflicting page visibility rules (show_page vs hide_page on same page)
  for (const [pid, entries] of pageTargetActionsMap.entries()) {
    const pageName = document.pages.find((p) => p.id === pid)?.title || pid;
    const hasShow = entries.find((e) => e.type === 'show_page');
    const hasHide = entries.find((e) => e.type === 'hide_page');
    if (hasShow && hasHide && hasShow.ruleId !== hasHide.ruleId) {
      warnings.push({
        id: `conflict_page_vis_${pid}`,
        severity: 'warning',
        code: 'POTENTIAL_ACTION_CONFLICT',
        message: `Page "${pageName}" is both shown by "${hasShow.ruleName}" and hidden by "${hasHide.ruleName}". Execution priority determines the winner if both match.`,
      });
    }
  }

  // Detect circular page navigation loops using DFS (across both THEN and ELSE branches)
  const circularPaths: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const pathStack: string[] = [];

  const dfs = (pageId: string) => {
    visited.add(pageId);
    inStack.add(pageId);
    pathStack.push(pageId);

    const neighbors = navEdges.get(pageId);
    if (neighbors) {
      for (const nextId of neighbors) {
        if (inStack.has(nextId)) {
          const cycleStart = pathStack.indexOf(nextId);
          const cycle = [...pathStack.slice(cycleStart), nextId];
          circularPaths.push(cycle);
        } else if (!visited.has(nextId)) {
          dfs(nextId);
        }
      }
    }

    pathStack.pop();
    inStack.delete(pageId);
  };

  for (const pageId of navEdges.keys()) {
    if (!visited.has(pageId)) {
      dfs(pageId);
    }
  }

  for (let i = 0; i < circularPaths.length; i += 1) {
    const cycle = circularPaths[i];
    const readable = cycle
      .map((pid) => document.pages.find((p) => p.id === pid)?.title || pid)
      .join(' → ');
    errors.push({
      id: `circular_nav_${i}`,
      severity: 'error',
      code: 'CIRCULAR_NAVIGATION',
      message: `Circular page navigation detected: ${readable}. Respondents could get stuck in an infinite loop.`,
    });
  }

  // Validate variable definitions, initial values, calculated formulas & circular calculation chains
  const calcGraph = buildCalculationDependencyGraph(document);
  for (let i = 0; i < calcGraph.circularChains.length; i += 1) {
    const chain = calcGraph.circularChains[i];
    errors.push({
      id: `circular_calc_${i}`,
      severity: 'error',
      code: 'CIRCULAR_CALCULATION',
      message: `Circular calculation dependency detected: ${chain.join(' → ')}. Break the cycle before publishing.`,
    });
  }

  for (const variable of document.variables || []) {
    if (
      variable.initialValue !== undefined &&
      variable.initialValue !== null &&
      variable.initialValue !== ''
    ) {
      const initCheck = validateVariableAssignment(variable, variable.initialValue);
      if (!initCheck.valid) {
        errors.push({
          id: `var_init_${variable.id}`,
          severity: 'error',
          code: 'VARIABLE_TYPE_MISMATCH',
          itemId: variable.id,
          message: `Variable "${variable.name}" initial value: ${initCheck.error}`,
        });
      }
    }

    if (variable.expression && variable.expression.trim()) {
      const fCheck = validateFormula(variable.expression, document, {
        targetVariableType: variable.valueType,
      });
      for (const fErr of fCheck.errors) {
        const mappedCode =
          fErr.code === 'DIVISION_BY_ZERO'
            ? 'DIVISION_BY_ZERO'
            : fErr.code === 'TYPE_MISMATCH'
            ? 'VARIABLE_TYPE_MISMATCH'
            : 'INVALID_EXPRESSION';
        errors.push({
          id: `var_expr_${variable.id}_${fErr.code}_${fErr.token || 'e'}`,
          severity: 'error',
          code: mappedCode,
          itemId: variable.id,
          message: `Variable "${variable.name}" formula: ${fErr.message}`,
        });
      }
      for (const fWarn of fCheck.warnings) {
        warnings.push({
          id: `var_expr_warn_${variable.id}_${fWarn.token || 'w'}`,
          severity: 'warning',
          code: 'INVALID_EXPRESSION',
          itemId: variable.id,
          message: `Variable "${variable.name}" formula: ${fWarn.message}`,
        });
      }
    }
  }

  // Validate component regex patterns for safety (ReDoS & syntax)
  for (const comp of Object.values(document.components || {})) {
    if (comp.validation.pattern && comp.validation.pattern.trim()) {
      const check = isSafeRegexPattern(comp.validation.pattern);
      if (!check.safe) {
        errors.push({
          id: `regex_pattern_${comp.id}`,
          severity: 'error',
          code: 'INVALID_REGEX_PATTERN',
          itemId: comp.id,
          message: `"${comp.content.label || comp.id}" allowed pattern: ${check.error}`,
        });
      }
    }
    if (comp.validation.disallowedPattern && comp.validation.disallowedPattern.trim()) {
      const check = isSafeRegexPattern(comp.validation.disallowedPattern);
      if (!check.safe) {
        errors.push({
          id: `regex_disallowed_${comp.id}`,
          severity: 'error',
          code: 'INVALID_REGEX_PATTERN',
          itemId: comp.id,
          message: `"${comp.content.label || comp.id}" disallowed pattern: ${check.error}`,
        });
      }
    }
  }

  // Validate cross-field validation rules
  for (const cfRule of document.logic.crossFieldValidations || []) {
    if (!cfRule.enabled) continue;
    const targetId = cfRule.targetComponentId || cfRule.sourceComponentId;
    if (!targetId || !document.components[targetId]) {
      errors.push({
        id: `cf_missing_target_${cfRule.id}`,
        severity: 'error',
        code: 'INVALID_CROSS_FIELD_RULE',
        ruleId: cfRule.id,
        ruleName: cfRule.name,
        message: `Cross-field rule "${cfRule.name || cfRule.id}" targets a missing question.`,
      });
    }
    if (cfRule.operator === 'matches_expression') {
      const fCheck = validateFormula(cfRule.expression || '', document);
      for (const fErr of fCheck.errors) {
        errors.push({
          id: `cf_expr_${cfRule.id}_${fErr.code}`,
          severity: 'error',
          code: 'INVALID_CROSS_FIELD_RULE',
          ruleId: cfRule.id,
          ruleName: cfRule.name,
          message: `Cross-field rule "${cfRule.name || cfRule.id}": ${fErr.message}`,
        });
      }
    } else {
      if (!cfRule.sourceComponentId || !document.components[cfRule.sourceComponentId]) {
        errors.push({
          id: `cf_missing_src_${cfRule.id}`,
          severity: 'error',
          code: 'INVALID_CROSS_FIELD_RULE',
          ruleId: cfRule.id,
          ruleName: cfRule.name,
          message: `Cross-field rule "${cfRule.name || cfRule.id}" references a missing primary question.`,
        });
      }
      if (!cfRule.compareComponentId || !document.components[cfRule.compareComponentId]) {
        errors.push({
          id: `cf_missing_cmp_${cfRule.id}`,
          severity: 'error',
          code: 'INVALID_CROSS_FIELD_RULE',
          ruleId: cfRule.id,
          ruleName: cfRule.name,
          message: `Cross-field rule "${cfRule.name || cfRule.id}" references a missing comparison question.`,
        });
      }
    }
  }

  // Validate scoring formula expressions
  if (document.scoring?.enabled) {
    for (const sRule of document.scoring.rules || []) {
      if (!sRule.enabled) continue;
      if (!document.components[sRule.componentId]) {
        warnings.push({
          id: `scoring_missing_comp_${sRule.id}`,
          severity: 'warning',
          code: 'MISSING_SOURCE_COMPONENT',
          itemId: sRule.id,
          message: `A scoring rule references a deleted question and will be ignored.`,
        });
      }
      if (sRule.mode === 'formula' && sRule.formulaExpression?.trim()) {
        const fCheck = validateFormula(sRule.formulaExpression, document);
        for (const fErr of fCheck.errors) {
          errors.push({
            id: `scoring_formula_${sRule.id}_${fErr.code}`,
            severity: 'error',
            code: fErr.code === 'DIVISION_BY_ZERO' ? 'DIVISION_BY_ZERO' : 'INVALID_EXPRESSION',
            itemId: sRule.id,
            message: `Scoring rule formula: ${fErr.message}`,
          });
        }
      }
    }
    for (const cat of document.scoring.categories || []) {
      if (cat.formulaExpression?.trim()) {
        const fCheck = validateFormula(cat.formulaExpression, document);
        for (const fErr of fCheck.errors) {
          errors.push({
            id: `scoring_cat_formula_${cat.id}_${fErr.code}`,
            severity: 'error',
            code: fErr.code === 'DIVISION_BY_ZERO' ? 'DIVISION_BY_ZERO' : 'INVALID_EXPRESSION',
            itemId: cat.id,
            message: `Scoring category "${cat.name}" formula: ${fErr.message}`,
          });
        }
      }
    }
  }

  // Validate outcome CTA URLs & hero media URLs
  if (document.outcomes?.enabled) {
    for (const outcome of document.outcomes.outcomes || []) {
      if (!outcome.enabled) continue;
      const imgUrl = outcome.resultScreen.imageUrl?.trim();
      if (imgUrl && !isSafeMediaUrl(imgUrl)) {
        errors.push({
          id: `outcome_img_url_${outcome.id}`,
          severity: 'error',
          code: 'INVALID_OUTCOME_URL',
          itemId: outcome.id,
          message: `Outcome "${outcome.name}" hero image URL must use http://, https://, or a safe local asset path.`,
        });
      }
      for (const btn of outcome.resultScreen.buttons || []) {
        const rawUrl = btn.url?.trim();
        if (rawUrl && !rawUrl.includes('{{') && !isSafeHttpUrl(rawUrl)) {
          errors.push({
            id: `outcome_btn_url_${outcome.id}_${btn.id}`,
            severity: 'error',
            code: 'INVALID_OUTCOME_URL',
            itemId: btn.id,
            message: `Outcome "${outcome.name}" button "${btn.label}" URL must start with http:// or https://.`,
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    circularPaths,
  };
}
