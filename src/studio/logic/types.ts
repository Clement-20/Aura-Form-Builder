/**
 * FlexStore Form Studio — Central Visual Logic Rule Model (Phase 2)
 *
 * Structured, serialisable, extensible rule schema supporting:
 *  - Nested AND / OR condition groups
 *  - Typed condition operators (text, number, selection, boolean, date)
 *  - All 12 core workflow actions (visibility, state, validation, navigation,
 *    variables, calculated values, inline messaging, early termination)
 *  - Execution priority, triggers, and else-behavior configuration
 *  - Full backward compatibility with legacy v1 LogicRule records
 */

import { LogicRule } from '../../types/form';

export type LogicDataType = 'text' | 'number' | 'selection' | 'boolean' | 'date';

export type LogicCombinator = 'AND' | 'OR';

export type LogicTrigger =
  | 'on_change'
  | 'on_page_enter'
  | 'on_page_leave'
  | 'on_submit'
  | 'always';

export type ConditionSourceType = 'component' | 'variable';

export type LogicOperator =
  // Text & general
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty'
  // Number
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal'
  | 'less_than_or_equal'
  | 'is_between'
  // Selection (radio / select / checkbox)
  | 'is_selected'
  | 'is_not_selected'
  | 'contains_option'
  | 'not_contains_option'
  // Boolean (yes/no / boolean variable)
  | 'is_true'
  | 'is_false'
  // Date
  | 'before'
  | 'after'
  | 'is_today'
  | 'is_in_past'
  | 'is_in_future';

export type LogicActionType =
  | 'show_component'
  | 'hide_component'
  | 'show_page'
  | 'hide_page'
  | 'enable_component'
  | 'disable_component'
  | 'require_component'
  | 'optional_component'
  | 'navigate_to_page'
  | 'skip_pages'
  | 'skip_to_question'
  | 'end_form'
  | 'set_variable'
  | 'display_message'
  | 'set_calculated_value';

export type LogicMessageTone = 'info' | 'success' | 'warning' | 'error';

export interface LogicConditionClause {
  kind: 'condition';
  id: string;
  sourceType: ConditionSourceType;
  /** Component ID when sourceType === 'component', or variable name when sourceType === 'variable' */
  sourceId: string;
  operator: LogicOperator;
  value: string;
  /** Upper bound used by range operators such as `is_between` */
  secondaryValue?: string;
}

export interface LogicConditionGroup {
  kind: 'group';
  id: string;
  combinator: LogicCombinator;
  items: LogicConditionItem[];
}

export type LogicConditionItem = LogicConditionClause | LogicConditionGroup;

export interface LogicActionConfig {
  id: string;
  type: LogicActionType;
  /** Target component ID for component-targeted actions or message anchor */
  targetComponentId?: string;
  /** Target page ID for navigate_to_page, show_page, hide_page */
  targetPageId?: string;
  /** Multiple page IDs for skip_pages */
  targetPageIds?: string[];
  /** Target variable name for set_variable or set_calculated_value */
  variableName?: string;
  /** Static value for set_variable */
  value?: string;
  /** Safe arithmetic/template expression for set_calculated_value (e.g. "{{q1}} * 2 + 10") */
  expression?: string;
  /** Message body for display_message */
  message?: string;
  /** Visual tone for display_message */
  messageTone?: LogicMessageTone;
  /** Custom completion heading/message/redirect for end_form */
  endFormTitle?: string;
  endFormMessage?: string;
  /** Optional safe http(s) redirect URL for end_form result/completion page */
  redirectUrl?: string;
}

export interface LogicExecutionConfig {
  /**
   * 'revert': when the rule's conditions evaluate to false, visibility/state defaults apply
   * (e.g. a show_component rule hides the target while false).
   * 'none': rule only fires its actions when conditions are true.
   */
  elseBehavior: 'revert' | 'none';
  /** If true, stops evaluating lower-priority rules once this rule matches */
  stopOnMatch?: boolean;
}

/**
 * Structured v2 Studio Logic Rule.
 * Extends LogicRule with optional legacy projection fields so existing v1
 * serializers and Firestore documents stay 100% compatible without migration breakage.
 */
export interface StudioLogicRule extends LogicRule {
  schemaVersion: 2;
  name: string;
  enabled: boolean;
  priority: number;
  trigger: LogicTrigger;
  conditionGroup: LogicConditionGroup;
  actions: LogicActionConfig[];
  /** Optional ELSE actions executed when conditionGroup evaluates to false */
  elseActions?: LogicActionConfig[];
  execution: LogicExecutionConfig;
}

export type AnyLogicRule = StudioLogicRule | LogicRule;

// ============================================================================
// Validation & Execution Trace Diagnostics
// ============================================================================

export type LogicIssueSeverity = 'error' | 'warning';

export type LogicIssueCode =
  | 'EMPTY_RULE_NAME'
  | 'EMPTY_CONDITIONS'
  | 'EMPTY_ACTIONS'
  | 'MISSING_SOURCE_COMPONENT'
  | 'MISSING_SOURCE_VARIABLE'
  | 'MISSING_TARGET_COMPONENT'
  | 'MISSING_TARGET_PAGE'
  | 'MISSING_TARGET_VARIABLE'
  | 'INCOMPLETE_CONDITION_VALUE'
  | 'INVALID_RANGE_BOUNDS'
  | 'INVALID_EXPRESSION'
  | 'INVALID_REDIRECT_URL'
  | 'EMPTY_MESSAGE'
  | 'CIRCULAR_NAVIGATION'
  | 'CIRCULAR_CALCULATION'
  | 'VARIABLE_TYPE_MISMATCH'
  | 'DIVISION_BY_ZERO'
  | 'POTENTIAL_ACTION_CONFLICT'
  | 'INCOMPATIBLE_NAVIGATION'
  | 'UNAVAILABLE_CONDITION_SOURCE'
  | 'UNREACHABLE_ACTION'
  | 'INVALID_REGEX_PATTERN'
  | 'INVALID_CROSS_FIELD_RULE'
  | 'INVALID_OUTCOME_URL';

export interface LogicValidationIssue {
  id: string;
  severity: LogicIssueSeverity;
  code: LogicIssueCode;
  ruleId?: string;
  ruleName?: string;
  itemId?: string;
  message: string;
}

export interface LogicValidationReport {
  valid: boolean;
  errors: LogicValidationIssue[];
  warnings: LogicValidationIssue[];
  circularPaths: string[][];
}

export interface ConditionEvaluationTrace {
  itemId: string;
  kind: 'condition' | 'group';
  passed: boolean;
  label: string;
  actualValue?: unknown;
  expectedValue?: string;
  children?: ConditionEvaluationTrace[];
}

export interface LogicConflict {
  targetKey: string;
  winningRuleId: string;
  winningRuleName: string;
  overriddenRuleId: string;
  overriddenRuleName: string;
  description: string;
}

export interface LogicMessage {
  id: string;
  ruleId: string;
  text: string;
  tone: LogicMessageTone;
  targetComponentId?: string;
}

export interface RuleExecutionTrace {
  ruleId: string;
  ruleName: string;
  priority: number;
  enabled: boolean;
  trigger: LogicTrigger;
  matched: boolean;
  branchTaken?: 'then' | 'else' | 'none';
  skippedReason?: string;
  conditionTrace: ConditionEvaluationTrace;
  executedActions: string[];
}
