/**
 * FlexStore Form Studio — Extensible Condition Operator & Action Registries
 *
 * Keeps condition operators, data-type mapping, safe expression evaluation,
 * and workflow actions cleanly decoupled from the editor UI and execution engine
 * so future actions (webhooks, scoring, CRM triggers) plug in seamlessly.
 */

import { FormComponentNode, FormDocument, FormVariableDefinition } from '../document/types';
import {
  LogicActionConfig,
  LogicActionType,
  LogicConditionClause,
  LogicDataType,
  LogicOperator,
} from './types';
import {
  evaluateFormula,
  extractFormulaTokens,
  validateFormula,
} from '../engines/calculation-engine';
import { resolvePipedText } from '../engines/piping-engine';

// ============================================================================
// Safe URL Validator (blocks javascript: / data: injection in redirects)
// ============================================================================

export function isSafeHttpUrl(raw?: string): boolean {
  if (!raw || !raw.trim()) return true; // Optional field
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// ============================================================================
// Safe Arithmetic & Template Expression Evaluator (Delegated to calculation-engine)
// ============================================================================

export interface ExpressionValidationResult {
  valid: boolean;
  error?: string;
  referencedTokens: string[];
}

export function extractExpressionTokens(expression: string): string[] {
  return extractFormulaTokens(expression);
}

export function validateExpressionSyntax(expression: string): ExpressionValidationResult {
  const res = validateFormula(expression, undefined, { allowPlainTemplate: true });
  return {
    valid: res.valid,
    error: res.errors[0]?.message,
    referencedTokens: res.referencedTokens,
  };
}

export function evaluateSafeExpression(
  expression: string,
  answers: Record<string, unknown>,
  variables: Record<string, unknown>
): number | string {
  const trimmed = (expression || '').trim();
  if (!trimmed) return '';

  const evalRes = evaluateFormula(trimmed, { answers, variables });
  if (evalRes.ok && evalRes.value !== null) {
    return evalRes.value;
  }

  // If division by zero or non-numeric error occurred inside a math expression,
  // avoid leaking NaN/Infinity; fall back to 0 for pure arithmetic or plain text for templates
  const stripped = trimmed.replace(/\{\{\s*[a-zA-Z0-9_\-.]+\s*\}\}/g, '');
  if (/[+\-*/%()=<>]/.test(stripped)) {
    return 0;
  }

  return resolvePipedText(trimmed, { answers, variables });
}

// ============================================================================
// Data Type Inference & Condition Operator Registry
// ============================================================================

export function inferComponentDataType(node?: FormComponentNode | null): LogicDataType {
  if (!node) return 'text';
  switch (node.type) {
    case 'number':
    case 'rating':
    case 'scale':
      return 'number';
    case 'radio':
    case 'select':
    case 'checkbox':
      return 'selection';
    case 'yes_no':
      return 'boolean';
    case 'date':
      return 'date';
    default:
      return 'text';
  }
}

export function inferVariableDataType(variable?: FormVariableDefinition | null): LogicDataType {
  if (!variable) return 'text';
  switch (variable.valueType) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'date';
    case 'selection':
    case 'list':
      return 'selection';
    case 'string':
    default:
      return 'text';
  }
}

export interface ConditionOperatorDefinition {
  operator: LogicOperator;
  label: string;
  shortLabel: string;
  supportedTypes: LogicDataType[];
  /** Number of value inputs required: 0 (unary like is_empty), 1 (standard), 2 (range like is_between) */
  valueArity: 0 | 1 | 2;
  evaluate: (actual: unknown, expected: string, secondary?: string, dataType?: LogicDataType) => boolean;
}

function isEmptyValue(val: unknown): boolean {
  if (val === undefined || val === null) return true;
  if (typeof val === 'string') return val.trim() === '';
  if (Array.isArray(val)) return val.length === 0;
  return false;
}

function toNumeric(val: unknown): number | null {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const parsed = Number(String(val).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function toBooleanValue(val: unknown): boolean | null {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase();
    if (['yes', 'true', '1', 'on'].includes(lower)) return true;
    if (['no', 'false', '0', 'off'].includes(lower)) return false;
  }
  return null;
}

function toDateEpochDay(val: unknown): number | null {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  // Support YYYY-MM-DD cleanly without timezone drift
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    return Date.UTC(year, month, day);
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  const d = new Date(parsed);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function todayUtcEpochDay(): number {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

function normalizedList(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.map((item) => String(item).trim().toLowerCase());
  }
  if (val === undefined || val === null || val === '') return [];
  return [String(val).trim().toLowerCase()];
}

export class ConditionOperatorRegistry {
  private readonly definitions = new Map<LogicOperator, ConditionOperatorDefinition>();

  register(def: ConditionOperatorDefinition): void {
    this.definitions.set(def.operator, def);
  }

  get(operator: LogicOperator): ConditionOperatorDefinition | undefined {
    return this.definitions.get(operator);
  }

  getForDataType(dataType: LogicDataType): ConditionOperatorDefinition[] {
    return Array.from(this.definitions.values()).filter((def) =>
      def.supportedTypes.includes(dataType)
    );
  }

  getDefaultOperator(dataType: LogicDataType): LogicOperator {
    switch (dataType) {
      case 'number':
        return 'equals';
      case 'selection':
        return 'is_selected';
      case 'boolean':
        return 'is_true';
      case 'date':
        return 'after';
      default:
        return 'equals';
    }
  }

  evaluateClause(
    clause: LogicConditionClause,
    actualValue: unknown,
    dataType: LogicDataType
  ): boolean {
    const def = this.definitions.get(clause.operator);
    if (!def) return false;
    return def.evaluate(actualValue, clause.value, clause.secondaryValue, dataType);
  }
}

export const conditionOperatorRegistry = new ConditionOperatorRegistry();

const BUILTIN_OPERATORS: ConditionOperatorDefinition[] = [
  // TEXT & NUMBER equality
  {
    operator: 'equals',
    label: 'equals',
    shortLabel: '=',
    supportedTypes: ['text', 'number'],
    valueArity: 1,
    evaluate: (actual, expected, _sec, dataType) => {
      if (dataType === 'number') {
        const a = toNumeric(actual);
        const b = toNumeric(expected);
        return a !== null && b !== null && a === b;
      }
      return String(actual ?? '').trim().toLowerCase() === String(expected ?? '').trim().toLowerCase();
    },
  },
  {
    operator: 'not_equals',
    label: 'does not equal',
    shortLabel: '≠',
    supportedTypes: ['text', 'number'],
    valueArity: 1,
    evaluate: (actual, expected, _sec, dataType) => {
      if (dataType === 'number') {
        const a = toNumeric(actual);
        const b = toNumeric(expected);
        return a !== null && b !== null && a !== b;
      }
      return String(actual ?? '').trim().toLowerCase() !== String(expected ?? '').trim().toLowerCase();
    },
  },
  // TEXT matching
  {
    operator: 'contains',
    label: 'contains',
    shortLabel: 'contains',
    supportedTypes: ['text'],
    valueArity: 1,
    evaluate: (actual, expected) => {
      if (Array.isArray(actual)) {
        return normalizedList(actual).includes(String(expected ?? '').trim().toLowerCase());
      }
      return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    },
  },
  {
    operator: 'not_contains',
    label: 'does not contain',
    shortLabel: '!contains',
    supportedTypes: ['text'],
    valueArity: 1,
    evaluate: (actual, expected) => {
      if (Array.isArray(actual)) {
        return !normalizedList(actual).includes(String(expected ?? '').trim().toLowerCase());
      }
      return !String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    },
  },
  {
    operator: 'starts_with',
    label: 'starts with',
    shortLabel: 'starts with',
    supportedTypes: ['text'],
    valueArity: 1,
    evaluate: (actual, expected) =>
      String(actual ?? '').trim().toLowerCase().startsWith(String(expected ?? '').trim().toLowerCase()),
  },
  {
    operator: 'ends_with',
    label: 'ends with',
    shortLabel: 'ends with',
    supportedTypes: ['text'],
    valueArity: 1,
    evaluate: (actual, expected) =>
      String(actual ?? '').trim().toLowerCase().endsWith(String(expected ?? '').trim().toLowerCase()),
  },
  // NUMBER comparisons
  {
    operator: 'greater_than',
    label: 'is greater than',
    shortLabel: '>',
    supportedTypes: ['number'],
    valueArity: 1,
    evaluate: (actual, expected) => {
      const a = toNumeric(actual);
      const b = toNumeric(expected);
      return a !== null && b !== null && a > b;
    },
  },
  {
    operator: 'less_than',
    label: 'is less than',
    shortLabel: '<',
    supportedTypes: ['number'],
    valueArity: 1,
    evaluate: (actual, expected) => {
      const a = toNumeric(actual);
      const b = toNumeric(expected);
      return a !== null && b !== null && a < b;
    },
  },
  {
    operator: 'greater_than_or_equal',
    label: 'is greater than or equal to',
    shortLabel: '≥',
    supportedTypes: ['number'],
    valueArity: 1,
    evaluate: (actual, expected) => {
      const a = toNumeric(actual);
      const b = toNumeric(expected);
      return a !== null && b !== null && a >= b;
    },
  },
  {
    operator: 'less_than_or_equal',
    label: 'is less than or equal to',
    shortLabel: '≤',
    supportedTypes: ['number'],
    valueArity: 1,
    evaluate: (actual, expected) => {
      const a = toNumeric(actual);
      const b = toNumeric(expected);
      return a !== null && b !== null && a <= b;
    },
  },
  // RANGE (Number & Date)
  {
    operator: 'is_between',
    label: 'is between',
    shortLabel: 'between',
    supportedTypes: ['number', 'date'],
    valueArity: 2,
    evaluate: (actual, expected, secondary, dataType) => {
      if (dataType === 'date') {
        const a = toDateEpochDay(actual);
        const low = toDateEpochDay(expected);
        const high = toDateEpochDay(secondary);
        if (a === null || low === null || high === null) return false;
        return a >= Math.min(low, high) && a <= Math.max(low, high);
      }
      const a = toNumeric(actual);
      const low = toNumeric(expected);
      const high = toNumeric(secondary);
      if (a === null || low === null || high === null) return false;
      return a >= Math.min(low, high) && a <= Math.max(low, high);
    },
  },
  // SELECTION (Single & Multi choice)
  {
    operator: 'is_selected',
    label: 'is selected',
    shortLabel: 'is selected',
    supportedTypes: ['selection'],
    valueArity: 1,
    evaluate: (actual, expected) => {
      const needle = String(expected ?? '').trim().toLowerCase();
      if (!needle) return false;
      return normalizedList(actual).includes(needle);
    },
  },
  {
    operator: 'is_not_selected',
    label: 'is not selected',
    shortLabel: 'is not selected',
    supportedTypes: ['selection'],
    valueArity: 1,
    evaluate: (actual, expected) => {
      const needle = String(expected ?? '').trim().toLowerCase();
      if (!needle) return false;
      return !normalizedList(actual).includes(needle);
    },
  },
  {
    operator: 'contains_option',
    label: 'contains option',
    shortLabel: 'includes',
    supportedTypes: ['selection'],
    valueArity: 1,
    evaluate: (actual, expected) => {
      const needle = String(expected ?? '').trim().toLowerCase();
      if (!needle) return false;
      return normalizedList(actual).some((item) => item === needle || item.includes(needle));
    },
  },
  {
    operator: 'not_contains_option',
    label: 'does not contain option',
    shortLabel: 'excludes',
    supportedTypes: ['selection'],
    valueArity: 1,
    evaluate: (actual, expected) => {
      const needle = String(expected ?? '').trim().toLowerCase();
      if (!needle) return false;
      return !normalizedList(actual).some((item) => item === needle || item.includes(needle));
    },
  },
  // BOOLEAN
  {
    operator: 'is_true',
    label: 'is Yes / True',
    shortLabel: 'is true',
    supportedTypes: ['boolean'],
    valueArity: 0,
    evaluate: (actual) => toBooleanValue(actual) === true,
  },
  {
    operator: 'is_false',
    label: 'is No / False',
    shortLabel: 'is false',
    supportedTypes: ['boolean'],
    valueArity: 0,
    evaluate: (actual) => toBooleanValue(actual) === false,
  },
  // DATE
  {
    operator: 'before',
    label: 'is before',
    shortLabel: 'before',
    supportedTypes: ['date'],
    valueArity: 1,
    evaluate: (actual, expected) => {
      const a = toDateEpochDay(actual);
      const b = toDateEpochDay(expected);
      return a !== null && b !== null && a < b;
    },
  },
  {
    operator: 'after',
    label: 'is after',
    shortLabel: 'after',
    supportedTypes: ['date'],
    valueArity: 1,
    evaluate: (actual, expected) => {
      const a = toDateEpochDay(actual);
      const b = toDateEpochDay(expected);
      return a !== null && b !== null && a > b;
    },
  },
  {
    operator: 'is_today',
    label: 'is today',
    shortLabel: 'today',
    supportedTypes: ['date'],
    valueArity: 0,
    evaluate: (actual) => {
      const a = toDateEpochDay(actual);
      return a !== null && a === todayUtcEpochDay();
    },
  },
  {
    operator: 'is_in_past',
    label: 'is in the past',
    shortLabel: 'in past',
    supportedTypes: ['date'],
    valueArity: 0,
    evaluate: (actual) => {
      const a = toDateEpochDay(actual);
      return a !== null && a < todayUtcEpochDay();
    },
  },
  {
    operator: 'is_in_future',
    label: 'is in the future',
    shortLabel: 'in future',
    supportedTypes: ['date'],
    valueArity: 0,
    evaluate: (actual) => {
      const a = toDateEpochDay(actual);
      return a !== null && a > todayUtcEpochDay();
    },
  },
  // UNIVERSAL EMPTY CHECKS
  {
    operator: 'is_empty',
    label: 'is empty',
    shortLabel: 'empty',
    supportedTypes: ['text', 'number', 'selection', 'date'],
    valueArity: 0,
    evaluate: (actual) => isEmptyValue(actual),
  },
  {
    operator: 'is_not_empty',
    label: 'is answered (not empty)',
    shortLabel: 'answered',
    supportedTypes: ['text', 'number', 'selection', 'date'],
    valueArity: 0,
    evaluate: (actual) => !isEmptyValue(actual),
  },
];

for (const op of BUILTIN_OPERATORS) {
  conditionOperatorRegistry.register(op);
}

// ============================================================================
// Extensible Logic Action Registry (All 12 Core Actions)
// ============================================================================

export type LogicActionCategory = 'visibility' | 'state' | 'navigation' | 'data' | 'feedback';

export interface LogicActionDefinition {
  type: LogicActionType;
  label: string;
  category: LogicActionCategory;
  description: string;
  requiresComponentTarget?: boolean;
  requiresPageTarget?: boolean;
  requiresMultiPageTarget?: boolean;
  requiresVariableTarget?: boolean;
  supportsComponentOrVariableTarget?: boolean;
  validate?: (action: LogicActionConfig, document: FormDocument) => string | null;
}

export class LogicActionRegistry {
  private readonly definitions = new Map<LogicActionType, LogicActionDefinition>();

  register(def: LogicActionDefinition): void {
    this.definitions.set(def.type, def);
  }

  get(type: LogicActionType): LogicActionDefinition | undefined {
    return this.definitions.get(type);
  }

  listAll(): LogicActionDefinition[] {
    return Array.from(this.definitions.values());
  }

  listByCategory(): { category: LogicActionCategory; label: string; actions: LogicActionDefinition[] }[] {
    const groups: { category: LogicActionCategory; label: string }[] = [
      { category: 'visibility', label: 'Visibility' },
      { category: 'state', label: 'Field State & Validation' },
      { category: 'navigation', label: 'Navigation & Flow' },
      { category: 'data', label: 'Variables & Calculations' },
      { category: 'feedback', label: 'Messaging' },
    ];
    return groups.map((g) => ({
      ...g,
      actions: this.listAll().filter((a) => a.category === g.category),
    }));
  }
}

export const logicActionRegistry = new LogicActionRegistry();

const BUILTIN_ACTIONS: LogicActionDefinition[] = [
  {
    type: 'show_component',
    label: 'Show question, section, or block',
    category: 'visibility',
    description: 'Reveals the target component (and its nested children if a section/container) when conditions match.',
    requiresComponentTarget: true,
  },
  {
    type: 'hide_component',
    label: 'Hide question, section, or block',
    category: 'visibility',
    description: 'Hides the target component (and all nested children) and excludes it from validation.',
    requiresComponentTarget: true,
  },
  {
    type: 'show_page',
    label: 'Show form page',
    category: 'visibility',
    description: 'Includes the target page in the respondent journey when conditions match.',
    requiresPageTarget: true,
  },
  {
    type: 'hide_page',
    label: 'Hide form page',
    category: 'visibility',
    description: 'Hides an entire page and skips its questions and validation automatically.',
    requiresPageTarget: true,
  },
  {
    type: 'enable_component',
    label: 'Enable field',
    category: 'state',
    description: 'Allows the respondent to edit the target input.',
    requiresComponentTarget: true,
  },
  {
    type: 'disable_component',
    label: 'Disable field',
    category: 'state',
    description: 'Locks the target input as read-only and skips required validation.',
    requiresComponentTarget: true,
  },
  {
    type: 'require_component',
    label: 'Make field required',
    category: 'state',
    description: 'Requires an answer before the respondent can continue or submit.',
    requiresComponentTarget: true,
  },
  {
    type: 'optional_component',
    label: 'Make field optional',
    category: 'state',
    description: 'Removes the required constraint from the target field.',
    requiresComponentTarget: true,
  },
  {
    type: 'navigate_to_page',
    label: 'Navigate to page',
    category: 'navigation',
    description: 'Jumps directly to a specific page when the respondent clicks Next.',
    requiresPageTarget: true,
  },
  {
    type: 'skip_pages',
    label: 'Skip one or more pages',
    category: 'navigation',
    description: 'Bypasses the selected pages and their questions during the respondent journey.',
    requiresMultiPageTarget: true,
  },
  {
    type: 'skip_to_question',
    label: 'Skip to question',
    category: 'navigation',
    description: 'Jumps ahead to a specific question (or the page containing it).',
    requiresComponentTarget: true,
  },
  {
    type: 'end_form',
    label: 'End form / Redirect to result',
    category: 'navigation',
    description: 'Ends the form with custom completion copy or redirects to a result page URL.',
  },
  {
    type: 'set_variable',
    label: 'Set variable value',
    category: 'data',
    description: 'Assigns a value to a form variable for downstream rules or calculations.',
    requiresVariableTarget: true,
  },
  {
    type: 'set_calculated_value',
    label: 'Set calculated value',
    category: 'data',
    description: 'Evaluates an arithmetic or template formula (e.g. {{q1}} * 2) into a variable or field.',
    supportsComponentOrVariableTarget: true,
  },
  {
    type: 'display_message',
    label: 'Display inline message',
    category: 'feedback',
    description: 'Shows a contextual info, success, warning, or error notice to the respondent.',
  },
];

for (const action of BUILTIN_ACTIONS) {
  logicActionRegistry.register(action);
}
