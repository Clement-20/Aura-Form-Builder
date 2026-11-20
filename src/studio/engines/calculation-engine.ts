/**
 * FlexStore Form Studio — Safe Calculation, Dependency Graph & Formatting Engine (Phase 2, Step 3)
 *
 * Pure TypeScript (zero React/DOM imports) so identical deterministic calculations run in:
 *  - Visual Formula Editor live preview & validation
 *  - Respondent Rendering Engine (with incremental dependency caching)
 *  - Client & Server-side Submission Validation (`POST /api/submissions/validate`)
 *
 * Security guarantees:
 *  - ZERO `eval()`, ZERO `new Function()`, ZERO dynamic code execution.
 *  - Strict recursive-descent AST tokenizer & evaluator over whitelisted operators/functions.
 *  - Explicit error handling for division by zero, incompatible types, missing references,
 *    syntax errors, and circular calculation dependencies.
 */

import {
  FormComponentNode,
  FormDocument,
  FormVariableDefinition,
  VariableFormatConfig,
  VariableValueType,
} from '../document/types';

// ============================================================================
// Constants: Variable Types, Currencies & Locales (No Hardcoded Currency Assumption)
// ============================================================================

export const VARIABLE_TYPE_META: Record<
  VariableValueType,
  { label: string; shortLabel: string; description: string; numericCapable: boolean }
> = {
  number: {
    label: 'Number',
    shortLabel: 'Number',
    description: 'Numeric quantities, scores, prices, and calculation outputs.',
    numericCapable: true,
  },
  string: {
    label: 'Text',
    shortLabel: 'Text',
    description: 'Names, labels, tier names, or dynamic summary text.',
    numericCapable: false,
  },
  boolean: {
    label: 'Boolean (Yes / No)',
    shortLabel: 'Boolean',
    description: 'True/false flags for eligibility, discounts, or opt-ins.',
    numericCapable: true,
  },
  date: {
    label: 'Date',
    shortLabel: 'Date',
    description: 'ISO dates (YYYY-MM-DD) for deadlines, bookings, or schedules.',
    numericCapable: false,
  },
  selection: {
    label: 'Selection',
    shortLabel: 'Selection',
    description: 'Single choice constrained to a defined list of options.',
    numericCapable: false,
  },
  list: {
    label: 'List',
    shortLabel: 'List',
    description: 'Ordered collection of items or selected options.',
    numericCapable: false,
  },
};

export const SUPPORTED_CURRENCIES: { code: string; label: string; symbol: string }[] = [
  { code: 'USD', label: 'US Dollar (USD)', symbol: '$' },
  { code: 'EUR', label: 'Euro (EUR)', symbol: '€' },
  { code: 'GBP', label: 'British Pound (GBP)', symbol: '£' },
  { code: 'NGN', label: 'Nigerian Naira (NGN)', symbol: '₦' },
  { code: 'CAD', label: 'Canadian Dollar (CAD)', symbol: 'CA$' },
  { code: 'AUD', label: 'Australian Dollar (AUD)', symbol: 'A$' },
  { code: 'JPY', label: 'Japanese Yen (JPY)', symbol: '¥' },
  { code: 'INR', label: 'Indian Rupee (INR)', symbol: '₹' },
  { code: 'CHF', label: 'Swiss Franc (CHF)', symbol: 'CHF' },
  { code: 'ZAR', label: 'South African Rand (ZAR)', symbol: 'R' },
];

export const SUPPORTED_LOCALES: { tag: string; label: string }[] = [
  { tag: 'en-US', label: 'English (US) — 1,234.56' },
  { tag: 'en-GB', label: 'English (UK) — 1,234.56' },
  { tag: 'de-DE', label: 'German (DE) — 1.234,56' },
  { tag: 'fr-FR', label: 'French (FR) — 1 234,56' },
  { tag: 'es-ES', label: 'Spanish (ES) — 1.234,56' },
  { tag: 'ja-JP', label: 'Japanese (JP) — 1,235' },
  { tag: 'en-NG', label: 'English (Nigeria) — 1,234.56' },
  { tag: 'en-IN', label: 'English (India) — 1,23,456.78' },
];

// ============================================================================
// Variable Type Compatibility & Coercion
// ============================================================================

export interface VariableAssignmentCheck {
  valid: boolean;
  coercedValue: string | number | boolean | string[] | null;
  error?: string;
}

export function isValidIsoDateString(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    );
  }
  const parsed = Date.parse(trimmed);
  return !Number.isNaN(parsed);
}

/**
 * Validates and coerces a value against a variable's declared `valueType` and `options`.
 * Prevents incompatible type assignments (e.g. assigning `"abc"` to a `number` variable,
 * or `"2025-99-99"` to a `date` variable, or an unlisted option to a `selection` variable).
 */
export function validateVariableAssignment(
  variable: Pick<FormVariableDefinition, 'name' | 'valueType' | 'options'>,
  rawValue: unknown
): VariableAssignmentCheck {
  const { valueType, name, options } = variable;

  if (rawValue === undefined || rawValue === null || rawValue === '') {
    if (valueType === 'number') return { valid: true, coercedValue: 0 };
    if (valueType === 'boolean') return { valid: true, coercedValue: false };
    if (valueType === 'list') return { valid: true, coercedValue: [] };
    return { valid: true, coercedValue: '' };
  }

  switch (valueType) {
    case 'number': {
      if (typeof rawValue === 'number') {
        if (!Number.isFinite(rawValue)) {
          return {
            valid: false,
            coercedValue: null,
            error: `Variable "${name}" expects a finite number.`,
          };
        }
        return { valid: true, coercedValue: rawValue };
      }
      if (typeof rawValue === 'boolean') {
        return {
          valid: false,
          coercedValue: null,
          error: `Cannot assign a boolean value to numeric variable "${name}".`,
        };
      }
      if (Array.isArray(rawValue)) {
        return {
          valid: false,
          coercedValue: null,
          error: `Cannot assign a list value to numeric variable "${name}".`,
        };
      }
      const trimmed = String(rawValue).trim();
      const parsed = Number(trimmed);
      if (!trimmed || !Number.isFinite(parsed)) {
        return {
          valid: false,
          coercedValue: null,
          error: `Value "${trimmed}" is not a valid number for variable "${name}".`,
        };
      }
      return { valid: true, coercedValue: parsed };
    }

    case 'boolean': {
      if (typeof rawValue === 'boolean') {
        return { valid: true, coercedValue: rawValue };
      }
      if (typeof rawValue === 'number') {
        if (rawValue === 1 || rawValue === 0) {
          return { valid: true, coercedValue: rawValue === 1 };
        }
        return {
          valid: false,
          coercedValue: null,
          error: `Variable "${name}" expects a boolean (true/false), got number ${rawValue}.`,
        };
      }
      const lower = String(rawValue).trim().toLowerCase();
      if (['true', 'yes', '1', 'on'].includes(lower)) {
        return { valid: true, coercedValue: true };
      }
      if (['false', 'no', '0', 'off'].includes(lower)) {
        return { valid: true, coercedValue: false };
      }
      return {
        valid: false,
        coercedValue: null,
        error: `Value "${String(rawValue)}" is not a valid boolean (true/false or yes/no) for "${name}".`,
      };
    }

    case 'date': {
      if (typeof rawValue !== 'string') {
        return {
          valid: false,
          coercedValue: null,
          error: `Variable "${name}" expects a date string (YYYY-MM-DD).`,
        };
      }
      const trimmed = rawValue.trim();
      if (!isValidIsoDateString(trimmed)) {
        return {
          valid: false,
          coercedValue: null,
          error: `Value "${trimmed}" is not a valid date for "${name}" (expected YYYY-MM-DD).`,
        };
      }
      return { valid: true, coercedValue: trimmed };
    }

    case 'selection': {
      if (Array.isArray(rawValue)) {
        return {
          valid: false,
          coercedValue: null,
          error: `Selection variable "${name}" expects a single value, not a list.`,
        };
      }
      const str = String(rawValue).trim();
      const allowed = (options || []).map((o) => o.trim()).filter(Boolean);
      if (allowed.length > 0) {
        const match = allowed.find((o) => o.toLowerCase() === str.toLowerCase());
        if (!match) {
          return {
            valid: false,
            coercedValue: null,
            error: `"${str}" is not one of the allowed options for "${name}" (${allowed.join(', ')}).`,
          };
        }
        return { valid: true, coercedValue: match };
      }
      return { valid: true, coercedValue: str };
    }

    case 'list': {
      const items: string[] = Array.isArray(rawValue)
        ? rawValue.map((v) => String(v).trim()).filter(Boolean)
        : String(rawValue)
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean);

      const allowed = (options || []).map((o) => o.trim()).filter(Boolean);
      if (allowed.length > 0) {
        const normalized: string[] = [];
        for (const item of items) {
          const match = allowed.find((o) => o.toLowerCase() === item.toLowerCase());
          if (!match) {
            return {
              valid: false,
              coercedValue: null,
              error: `List item "${item}" is not in allowed options for "${name}".`,
            };
          }
          normalized.push(match);
        }
        return { valid: true, coercedValue: normalized };
      }
      return { valid: true, coercedValue: items };
    }

    case 'string':
    default: {
      if (Array.isArray(rawValue)) {
        return { valid: true, coercedValue: rawValue.join(', ') };
      }
      return { valid: true, coercedValue: String(rawValue) };
    }
  }
}

export function getDefaultInitialValueForType(
  valueType: VariableValueType
): string | number | boolean | string[] {
  switch (valueType) {
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'list':
      return [];
    case 'date':
    case 'selection':
    case 'string':
    default:
      return '';
  }
}

export function coerceVariableValueSafe(
  raw: unknown,
  variable?: Pick<FormVariableDefinition, 'name' | 'valueType' | 'options'> | null
): unknown {
  if (!variable) {
    if (raw === undefined || raw === null) return '';
    return raw;
  }
  const check = validateVariableAssignment(variable, raw);
  if (check.valid) return check.coercedValue;
  // Safe fallback that respects the declared type without crashing runtime evaluation
  return getDefaultInitialValueForType(variable.valueType);
}

// ============================================================================
// Locale-Aware Number, Currency, Percentage & Date Formatting
// ============================================================================

export function formatValue(
  value: unknown,
  format?: VariableFormatConfig
): string {
  if (value === undefined || value === null) return '';

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  const style = format?.style || 'plain';

  if (style === 'plain') {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return '';
      return String(Math.round(value * 1_000_000) / 1_000_000);
    }
    return String(value);
  }

  const locale = format?.locale || 'en-US';

  if (style === 'date') {
    const str = String(value).trim();
    if (!str) return '';
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const dateObj = isoMatch
      ? new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])))
      : new Date(str);
    if (Number.isNaN(dateObj.getTime())) return str;
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: format?.dateStyle || 'medium',
        timeZone: isoMatch ? 'UTC' : undefined,
      }).format(dateObj);
    } catch {
      return str;
    }
  }

  // Numeric formatting styles: number | currency | percent
  const num = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(num)) {
    return String(value);
  }

  const decimals =
    typeof format?.decimals === 'number'
      ? Math.max(0, Math.min(6, Math.trunc(format.decimals)))
      : style === 'currency'
      ? 2
      : style === 'percent'
      ? 1
      : 2;

  const useGrouping = format?.useGrouping !== false;

  if (style === 'currency') {
    const currency = (format?.currency || 'USD').toUpperCase();
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping,
      }).format(num);
    } catch {
      // Safe fallback if an unsupported currency or locale tag is provided
      return `${currency} ${num.toFixed(decimals)}`;
    }
  }

  if (style === 'percent') {
    // Convention: values in percentage formulas can be decimals (0.15) or percentages;
    // Intl percent multiplies by 100, so if the creator stored a percentage like 15 vs 0.15,
    // wait: standard spreadsheet/Intl percent treats 0.15 as 15% and 1.0 as 100%.
    // Let's follow standard Intl.NumberFormat('percent') semantics (0.15 -> 15%).
    try {
      return new Intl.NumberFormat(locale, {
        style: 'percent',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping,
      }).format(num);
    } catch {
      return `${(num * 100).toFixed(decimals)}%`;
    }
  }

  // style === 'number'
  try {
    return new Intl.NumberFormat(locale, {
      style: 'decimal',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping,
    }).format(num);
  } catch {
    return num.toFixed(decimals);
  }
}

// ============================================================================
// Safe Recursive-Descent Formula Tokenizer & Evaluator (Zero eval / Zero Function)
// ============================================================================

export type FormulaErrorCode =
  | 'EMPTY_EXPRESSION'
  | 'INVALID_SYNTAX'
  | 'UNKNOWN_FUNCTION'
  | 'INVALID_ARGUMENT_COUNT'
  | 'DIVISION_BY_ZERO'
  | 'TYPE_MISMATCH'
  | 'MISSING_REFERENCE'
  | 'MISSING_VALUE'
  | 'CIRCULAR_DEPENDENCY';

export interface FormulaError {
  code: FormulaErrorCode;
  message: string;
  token?: string;
}

export interface FormulaEvaluationResult {
  ok: boolean;
  value: number | string | null;
  error?: FormulaError;
  referencedTokens: string[];
  missingTokens: string[];
}

export interface FormulaValidationResult {
  valid: boolean;
  errors: FormulaError[];
  warnings: FormulaError[];
  referencedTokens: string[];
}

const FORMULA_TOKEN_REGEX = /\{\{\s*([a-zA-Z0-9_\-.]+)\s*\}\}/g;

export function extractFormulaTokens(expression: string): string[] {
  const tokens: string[] = [];
  if (!expression) return tokens;
  const regex = new RegExp(FORMULA_TOKEN_REGEX.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(expression)) !== null) {
    if (!tokens.includes(match[1])) {
      tokens.push(match[1]);
    }
  }
  return tokens;
}

type LexToken =
  | { type: 'number'; value: number }
  | { type: 'ref'; key: string }
  | { type: 'ident'; name: string }
  | { type: 'op'; op: '+' | '-' | '*' | '/' | '%' }
  | { type: 'cmp'; op: '==' | '!=' | '>=' | '<=' | '>' | '<' }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' };

class FormulaRuntimeError extends Error {
  code: FormulaErrorCode;
  token?: string;

  constructor(code: FormulaErrorCode, message: string, token?: string) {
    super(message);
    this.code = code;
    this.token = token;
  }
}

function tokenizeFormula(input: string): LexToken[] {
  const tokens: LexToken[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    // {{reference}} token
    if (ch === '{' && input[i + 1] === '{') {
      const closeIdx = input.indexOf('}}', i + 2);
      if (closeIdx === -1) {
        throw new FormulaRuntimeError(
          'INVALID_SYNTAX',
          'Unclosed reference token — expected closing "}}".'
        );
      }
      const rawKey = input.slice(i + 2, closeIdx).trim();
      if (!rawKey || !/^[a-zA-Z0-9_\-.]+$/.test(rawKey)) {
        throw new FormulaRuntimeError(
          'INVALID_SYNTAX',
          `Invalid reference name "{{${rawKey}}}". Use letters, numbers, underscores, or hyphens.`
        );
      }
      tokens.push({ type: 'ref', key: rawKey });
      i = closeIdx + 2;
      continue;
    }

    // Numeric literal (e.g. 42, 3.14, .5)
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(input[i + 1] || ''))) {
      let numStr = '';
      let dotCount = 0;
      while (i < input.length && /[0-9.]/.test(input[i])) {
        if (input[i] === '.') dotCount += 1;
        if (dotCount > 1) {
          throw new FormulaRuntimeError(
            'INVALID_SYNTAX',
            `Invalid decimal number near "${numStr}."`
          );
        }
        numStr += input[i];
        i += 1;
      }
      const parsed = Number(numStr);
      if (!Number.isFinite(parsed)) {
        throw new FormulaRuntimeError('INVALID_SYNTAX', `Invalid number "${numStr}".`);
      }
      tokens.push({ type: 'number', value: parsed });
      continue;
    }

    // Function identifier
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        ident += input[i];
        i += 1;
      }
      tokens.push({ type: 'ident', name: ident.toLowerCase() });
      continue;
    }

    // Two-char comparison operators
    const two = input.slice(i, i + 2);
    if (two === '==' || two === '!=' || two === '>=' || two === '<=') {
      tokens.push({ type: 'cmp', op: two });
      i += 2;
      continue;
    }

    if (ch === '>' || ch === '<') {
      tokens.push({ type: 'cmp', op: ch });
      i += 1;
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '%') {
      tokens.push({ type: 'op', op: ch });
      i += 1;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i += 1;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i += 1;
      continue;
    }

    if (ch === ',') {
      tokens.push({ type: 'comma' });
      i += 1;
      continue;
    }

    throw new FormulaRuntimeError(
      'INVALID_SYNTAX',
      `Unexpected character "${ch}" in formula.`
    );
  }

  return tokens;
}

const SUPPORTED_FUNCTIONS: Record<
  string,
  {
    minArgs: number;
    maxArgs: number;
    description: string;
    signature: string;
    execute: (args: number[]) => number;
  }
> = {
  min: {
    minArgs: 1,
    maxArgs: 32,
    signature: 'min(a, b, ...)',
    description: 'Returns the smallest number.',
    execute: (args) => Math.min(...args),
  },
  max: {
    minArgs: 1,
    maxArgs: 32,
    signature: 'max(a, b, ...)',
    description: 'Returns the largest number.',
    execute: (args) => Math.max(...args),
  },
  round: {
    minArgs: 1,
    maxArgs: 2,
    signature: 'round(value, decimals)',
    description: 'Rounds a number to the specified decimal places (default 0).',
    execute: ([n, decimals = 0]) => {
      const d = Math.max(0, Math.min(6, Math.trunc(decimals)));
      const factor = Math.pow(10, d);
      return Math.round(n * factor) / factor;
    },
  },
  floor: {
    minArgs: 1,
    maxArgs: 1,
    signature: 'floor(value)',
    description: 'Rounds a number down to the nearest whole number.',
    execute: ([n]) => Math.floor(n),
  },
  ceil: {
    minArgs: 1,
    maxArgs: 1,
    signature: 'ceil(value)',
    description: 'Rounds a number up to the nearest whole number.',
    execute: ([n]) => Math.ceil(n),
  },
  abs: {
    minArgs: 1,
    maxArgs: 1,
    signature: 'abs(value)',
    description: 'Returns the absolute (non-negative) value.',
    execute: ([n]) => Math.abs(n),
  },
  sum: {
    minArgs: 1,
    maxArgs: 32,
    signature: 'sum(a, b, ...)',
    description: 'Adds all arguments together.',
    execute: (args) => args.reduce((acc, n) => acc + n, 0),
  },
  avg: {
    minArgs: 1,
    maxArgs: 32,
    signature: 'avg(a, b, ...)',
    description: 'Returns the arithmetic mean of all arguments.',
    execute: (args) => args.reduce((acc, n) => acc + n, 0) / args.length,
  },
  pct: {
    minArgs: 2,
    maxArgs: 2,
    signature: 'pct(amount, percent)',
    description: 'Calculates a percentage of an amount: amount * (percent / 100).',
    execute: ([amount, rate]) => amount * (rate / 100),
  },
  percent: {
    minArgs: 2,
    maxArgs: 2,
    signature: 'percent(part, total)',
    description: 'Calculates what percentage part is of total: (part / total) * 100.',
    execute: ([part, total]) => {
      if (total === 0) {
        throw new FormulaRuntimeError(
          'DIVISION_BY_ZERO',
          'Cannot calculate percentage when total is 0.'
        );
      }
      return (part / total) * 100;
    },
  },
  if: {
    minArgs: 3,
    maxArgs: 3,
    signature: 'if(condition, thenValue, elseValue)',
    description: 'Returns thenValue if condition is non-zero/true, otherwise elseValue.',
    execute: ([cond, thenVal, elseVal]) => (cond !== 0 ? thenVal : elseVal),
  },
};

export const FORMULA_FUNCTION_CATALOG = Object.entries(SUPPORTED_FUNCTIONS).map(
  ([name, meta]) => ({
    name,
    signature: meta.signature,
    description: meta.description,
  })
);

function isPostfixPercentPosition(nextToken: LexToken | undefined): boolean {
  if (!nextToken) return true;
  if (nextToken.type === 'rparen' || nextToken.type === 'comma' || nextToken.type === 'cmp') {
    return true;
  }
  if (nextToken.type === 'op') {
    return true;
  }
  return false;
}

export interface FormulaEvalContext {
  answers: Record<string, unknown>;
  variables: Record<string, unknown>;
  /** Optional document to resolve friendly label slugs and check declared types */
  document?: FormDocument;
  /** If true, missing values return a MISSING_VALUE error instead of defaulting to 0 */
  strictMissing?: boolean;
}

function toSlugKey(label: string): string {
  return (label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function findComponentByToken(
  document: FormDocument | undefined,
  tokenKey: string
): FormComponentNode | undefined {
  if (!document) return undefined;
  if (document.components[tokenKey]) return document.components[tokenKey];
  const lower = tokenKey.toLowerCase();
  return Object.values(document.components).find(
    (c) => toSlugKey(c.content.label) === lower
  );
}

function findVariableByToken(
  document: FormDocument | undefined,
  tokenKey: string
): FormVariableDefinition | undefined {
  if (!document) return undefined;
  return document.variables.find((v) => v.name === tokenKey || v.id === tokenKey);
}

function isNumericCapableComponent(node?: FormComponentNode): boolean {
  if (!node) return true;
  return (
    node.type === 'number' ||
    node.type === 'rating' ||
    node.type === 'scale' ||
    node.type === 'yes_no' ||
    node.type === 'checkbox' // checkbox can contribute selected count or numeric option
  );
}

function resolveNumericToken(
  tokenKey: string,
  ctx: FormulaEvalContext,
  missingTokens: string[]
): number {
  const varDef = findVariableByToken(ctx.document, tokenKey);
  const compNode = varDef ? undefined : findComponentByToken(ctx.document, tokenKey);

  // Determine raw value from variables first, then answers
  let hasValue = false;
  let raw: unknown = undefined;

  if (varDef && Object.prototype.hasOwnProperty.call(ctx.variables, varDef.name)) {
    raw = ctx.variables[varDef.name];
    hasValue = true;
  } else if (Object.prototype.hasOwnProperty.call(ctx.variables, tokenKey)) {
    raw = ctx.variables[tokenKey];
    hasValue = true;
  } else if (compNode && Object.prototype.hasOwnProperty.call(ctx.answers, compNode.id)) {
    raw = ctx.answers[compNode.id];
    hasValue = true;
  } else if (Object.prototype.hasOwnProperty.call(ctx.answers, tokenKey)) {
    raw = ctx.answers[tokenKey];
    hasValue = true;
  }

  // Missing value check
  if (!hasValue || raw === undefined || raw === null || raw === '') {
    if (!missingTokens.includes(tokenKey)) {
      missingTokens.push(tokenKey);
    }
    if (ctx.strictMissing) {
      throw new FormulaRuntimeError(
        'MISSING_VALUE',
        `Missing value for "{{${tokenKey}}}".`,
        tokenKey
      );
    }
    return 0;
  }

  // Type compatibility checks
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      throw new FormulaRuntimeError(
        'TYPE_MISMATCH',
        `"{{${tokenKey}}}" is not a finite number.`,
        tokenKey
      );
    }
    return raw;
  }

  if (typeof raw === 'boolean') {
    return raw ? 1 : 0;
  }

  if (Array.isArray(raw)) {
    // Lists/checkboxes evaluate to item count unless all items are numeric
    if (raw.length === 0) return 0;
    return raw.length;
  }

  const str = String(raw).trim();
  const lower = str.toLowerCase();
  if (lower === 'yes' || lower === 'true') return 1;
  if (lower === 'no' || lower === 'false') return 0;

  // Strip optional leading currency symbol/commas if formatted text was passed
  const cleaned = str.replace(/,/g, '');
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    throw new FormulaRuntimeError(
      'TYPE_MISMATCH',
      `Incompatible value "${str}" for "{{${tokenKey}}}" — expected a numeric value.`,
      tokenKey
    );
  }
  return parsed;
}

function evaluateLexTokens(
  tokens: LexToken[],
  resolveRef: (key: string) => number
): number {
  let pos = 0;

  const peek = (offset = 0): LexToken | undefined => tokens[pos + offset];
  const consume = (): LexToken => tokens[pos++];

  const parseComparison = (): number => {
    let left = parseAddSub();
    while (peek()?.type === 'cmp') {
      const op = (consume() as { type: 'cmp'; op: '==' | '!=' | '>=' | '<=' | '>' | '<' }).op;
      const right = parseAddSub();
      switch (op) {
        case '==':
          left = Math.abs(left - right) < 1e-9 ? 1 : 0;
          break;
        case '!=':
          left = Math.abs(left - right) >= 1e-9 ? 1 : 0;
          break;
        case '>':
          left = left > right ? 1 : 0;
          break;
        case '<':
          left = left < right ? 1 : 0;
          break;
        case '>=':
          left = left >= right ? 1 : 0;
          break;
        case '<=':
          left = left <= right ? 1 : 0;
          break;
      }
    }
    return left;
  };

  const parseAddSub = (): number => {
    let left = parseMulDiv();
    while (
      peek()?.type === 'op' &&
      ((peek() as { type: 'op'; op: string }).op === '+' ||
        (peek() as { type: 'op'; op: string }).op === '-')
    ) {
      const op = (consume() as { type: 'op'; op: '+' | '-' }).op;
      const right = parseMulDiv();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };

  const parseMulDiv = (): number => {
    let left = parseUnary();
    while (peek()?.type === 'op') {
      const op = (peek() as { type: 'op'; op: '+' | '-' | '*' | '/' | '%' }).op;
      if (op !== '*' && op !== '/' && op !== '%') break;
      consume();
      const right = parseUnary();
      if (op === '*') {
        left *= right;
      } else if (op === '/') {
        if (right === 0) {
          throw new FormulaRuntimeError(
            'DIVISION_BY_ZERO',
            'Division by zero is not allowed.'
          );
        }
        left /= right;
      } else {
        if (right === 0) {
          throw new FormulaRuntimeError(
            'DIVISION_BY_ZERO',
            'Modulo by zero is not allowed.'
          );
        }
        left %= right;
      }
    }
    return left;
  };

  const parseUnary = (): number => {
    const tok = peek();
    if (tok?.type === 'op' && (tok.op === '+' || tok.op === '-')) {
      consume();
      const val = parseUnary();
      return tok.op === '-' ? -val : val;
    }
    return parsePostfix();
  };

  const parsePostfix = (): number => {
    let val = parsePrimary();
    // Support postfix percentage literal/expression: e.g. 15% => 0.15, (10 + 5)% => 0.15
    while (
      peek()?.type === 'op' &&
      (peek() as { type: 'op'; op: string }).op === '%' &&
      isPostfixPercentPosition(peek(1))
    ) {
      consume();
      val = val / 100;
    }
    return val;
  };

  const parsePrimary = (): number => {
    const tok = peek();
    if (!tok) {
      throw new FormulaRuntimeError('INVALID_SYNTAX', 'Unexpected end of formula.');
    }

    if (tok.type === 'number') {
      consume();
      return tok.value;
    }

    if (tok.type === 'ref') {
      consume();
      return resolveRef(tok.key);
    }

    if (tok.type === 'lparen') {
      consume();
      const val = parseComparison();
      if (peek()?.type !== 'rparen') {
        throw new FormulaRuntimeError('INVALID_SYNTAX', 'Missing closing parenthesis ")".');
      }
      consume();
      return val;
    }

    if (tok.type === 'ident') {
      consume();
      const fn = SUPPORTED_FUNCTIONS[tok.name];
      if (!fn) {
        throw new FormulaRuntimeError(
          'UNKNOWN_FUNCTION',
          `Unknown function "${tok.name}". Supported: ${Object.keys(SUPPORTED_FUNCTIONS).join(', ')}.`
        );
      }
      if (peek()?.type !== 'lparen') {
        throw new FormulaRuntimeError(
          'INVALID_SYNTAX',
          `Function "${tok.name}" must be followed by "(".`
        );
      }
      consume();
      const args: number[] = [];
      if (peek()?.type !== 'rparen') {
        args.push(parseComparison());
        while (peek()?.type === 'comma') {
          consume();
          args.push(parseComparison());
        }
      }
      if (peek()?.type !== 'rparen') {
        throw new FormulaRuntimeError(
          'INVALID_SYNTAX',
          `Missing closing ")" for function "${tok.name}".`
        );
      }
      consume();

      if (args.length < fn.minArgs || args.length > fn.maxArgs) {
        throw new FormulaRuntimeError(
          'INVALID_ARGUMENT_COUNT',
          `Function "${tok.name}" expects ${
            fn.minArgs === fn.maxArgs
              ? `${fn.minArgs} argument${fn.minArgs === 1 ? '' : 's'}`
              : `${fn.minArgs}–${fn.maxArgs} arguments`
          }, received ${args.length}.`
        );
      }

      return fn.execute(args);
    }

    throw new FormulaRuntimeError('INVALID_SYNTAX', 'Invalid operand or syntax in formula.');
  };

  const result = parseComparison();
  if (pos < tokens.length) {
    throw new FormulaRuntimeError('INVALID_SYNTAX', 'Unexpected extra tokens at end of formula.');
  }
  if (!Number.isFinite(result)) {
    throw new FormulaRuntimeError('DIVISION_BY_ZERO', 'Formula produced a non-finite result.');
  }
  return Math.round(result * 1_000_000) / 1_000_000;
}

/**
 * Evaluates a safe numeric calculation formula and returns structured result + errors.
 */
export function evaluateFormula(
  expression: string,
  context: FormulaEvalContext
): FormulaEvaluationResult {
  const trimmed = (expression || '').trim();
  const referencedTokens = extractFormulaTokens(trimmed);
  const missingTokens: string[] = [];

  if (!trimmed) {
    return {
      ok: false,
      value: null,
      error: { code: 'EMPTY_EXPRESSION', message: 'Formula expression cannot be empty.' },
      referencedTokens,
      missingTokens,
    };
  }

  try {
    const tokens = tokenizeFormula(trimmed);
    if (tokens.length === 0) {
      return {
        ok: false,
        value: null,
        error: { code: 'EMPTY_EXPRESSION', message: 'Formula expression cannot be empty.' },
        referencedTokens,
        missingTokens,
      };
    }

    const safeContext: FormulaEvalContext = {
      ...context,
      answers: context?.answers || {},
      variables: context?.variables || {},
    };
    const value = evaluateLexTokens(tokens, (key) =>
      resolveNumericToken(key, safeContext, missingTokens)
    );

    return {
      ok: true,
      value,
      referencedTokens,
      missingTokens,
    };
  } catch (err) {
    if (err instanceof FormulaRuntimeError) {
      return {
        ok: false,
        value: null,
        error: { code: err.code, message: err.message, token: err.token },
        referencedTokens,
        missingTokens,
      };
    }
    return {
      ok: false,
      value: null,
      error: {
        code: 'INVALID_SYNTAX',
        message: err instanceof Error ? err.message : 'Unable to evaluate formula.',
      },
      referencedTokens,
      missingTokens,
    };
  }
}

/**
 * Statically validates a calculation formula against the FormDocument:
 *  - Syntax, parentheses, operators, and whitelisted functions
 *  - Literal division by zero (e.g. `{{price}} / 0`)
 *  - Reference existence (missing question or variable)
 *  - Type compatibility (e.g. using a date/text/selection variable in arithmetic)
 */
export function validateFormula(
  expression: string,
  document?: FormDocument,
  options?: { allowPlainTemplate?: boolean; targetVariableType?: VariableValueType }
): FormulaValidationResult {
  const trimmed = (expression || '').trim();
  const referencedTokens = extractFormulaTokens(trimmed);
  const errors: FormulaError[] = [];
  const warnings: FormulaError[] = [];

  if (!trimmed) {
    errors.push({
      code: 'EMPTY_EXPRESSION',
      message: 'Formula cannot be empty.',
    });
    return { valid: false, errors, warnings, referencedTokens };
  }

  // If target variable is a text template (e.g. string variable), allow plain piping templates
  // when there are no arithmetic operators.
  const isTextTemplateTarget =
    options?.allowPlainTemplate || options?.targetVariableType === 'string';
  const strippedTokens = trimmed.replace(FORMULA_TOKEN_REGEX, '');
  const looksLikePlainText =
    isTextTemplateTarget &&
    referencedTokens.length > 0 &&
    !/[+\-*/%()=<>]/.test(strippedTokens);

  if (!looksLikePlainText) {
    try {
      const lexTokens = tokenizeFormula(trimmed);
      if (lexTokens.length === 0) {
        errors.push({
          code: 'EMPTY_EXPRESSION',
          message: 'Formula cannot be empty.',
        });
        return { valid: false, errors, warnings, referencedTokens };
      }

      // Dry-run parse with safe positive non-zero dummy values (e.g. 2) to catch syntax
      // errors AND literal division-by-zero (e.g. `{{a}} / 0` or `percent({{a}}, 0)`)
      evaluateLexTokens(lexTokens, () => 2);
    } catch (err) {
      if (err instanceof FormulaRuntimeError) {
        errors.push({ code: err.code, message: err.message, token: err.token });
      } else {
        errors.push({
          code: 'INVALID_SYNTAX',
          message: err instanceof Error ? err.message : 'Invalid formula syntax.',
        });
      }
    }
  }

  // Validate referenced tokens against document components & variables
  if (document) {
    for (const token of referencedTokens) {
      const varDef = findVariableByToken(document, token);
      const compNode = varDef ? undefined : findComponentByToken(document, token);

      if (!varDef && !compNode) {
        errors.push({
          code: 'MISSING_REFERENCE',
          token,
          message: `Reference "{{${token}}}" does not match any question or variable in this form.`,
        });
        continue;
      }

      if (!looksLikePlainText) {
        if (varDef && !VARIABLE_TYPE_META[varDef.valueType]?.numericCapable) {
          errors.push({
            code: 'TYPE_MISMATCH',
            token,
            message: `Variable "{{${varDef.name}}}" is of type "${VARIABLE_TYPE_META[varDef.valueType].label}" and cannot be used in numeric calculations.`,
          });
        } else if (compNode && !isNumericCapableComponent(compNode)) {
          warnings.push({
            code: 'TYPE_MISMATCH',
            token,
            message: `Question "${compNode.content.label || compNode.id}" (${compNode.type}) may contain non-numeric text.`,
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    referencedTokens,
  };
}

// ============================================================================
// Dependency Graph (DAG), Circular Dependency Detection & Incremental Caching
// ============================================================================

export interface CalculationDependencyGraph {
  /** variableId -> canonical referenced keys (var:<name> | comp:<id>) */
  dependenciesByVariableId: Record<string, string[]>;
  /** Topological evaluation order of calculated variable IDs (excludes cyclic nodes) */
  evaluationOrder: string[];
  /** Detected circular dependency chains using variable names, e.g. [['a', 'b', 'a']] */
  circularChains: string[][];
  /** Set of variable IDs involved in any circular dependency */
  circularVariableIds: Set<string>;
}

/**
 * Builds the calculation dependency DAG across all calculated variables in a FormDocument.
 * Detects self-references and multi-hop circular chains (A -> B -> C -> A) via DFS.
 */
export function buildCalculationDependencyGraph(
  document: FormDocument
): CalculationDependencyGraph {
  const variables = document.variables || [];
  const varByName = new Map<string, FormVariableDefinition>();
  const varById = new Map<string, FormVariableDefinition>();
  for (const v of variables) {
    varByName.set(v.name, v);
    varById.set(v.id, v);
  }

  const dependenciesByVariableId: Record<string, string[]> = {};
  const varEdges = new Map<string, Set<string>>(); // varId -> Set<depVarId>

  for (const v of variables) {
    if (!v.expression || !v.expression.trim()) continue;
    const rawTokens = extractFormulaTokens(v.expression);
    const depKeys: string[] = [];
    const depVarIds = new Set<string>();

    for (const tok of rawTokens) {
      const targetVar = varByName.get(tok) || varById.get(tok);
      if (targetVar) {
        depKeys.push(`var:${targetVar.name}`);
        depVarIds.add(targetVar.id);
      } else {
        const comp = findComponentByToken(document, tok);
        depKeys.push(`comp:${comp ? comp.id : tok}`);
      }
    }

    dependenciesByVariableId[v.id] = depKeys;
    varEdges.set(v.id, depVarIds);
  }

  // DFS cycle detection + post-order topological sort
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const pathStack: string[] = [];
  const circularChains: string[][] = [];
  const circularVariableIds = new Set<string>();
  const evaluationOrder: string[] = [];

  const dfs = (varId: string) => {
    visited.add(varId);
    inStack.add(varId);
    pathStack.push(varId);

    const deps = varEdges.get(varId);
    if (deps) {
      for (const depId of deps) {
        // Only traverse variable dependencies that themselves have formulas or exist
        if (inStack.has(depId)) {
          const cycleStart = pathStack.indexOf(depId);
          const cycleIds = [...pathStack.slice(cycleStart), depId];
          for (const cid of cycleIds) circularVariableIds.add(cid);
          circularChains.push(cycleIds.map((cid) => varById.get(cid)?.name || cid));
        } else if (!visited.has(depId) && varEdges.has(depId)) {
          dfs(depId);
        }
      }
    }

    pathStack.pop();
    inStack.delete(varId);
    if (!circularVariableIds.has(varId)) {
      evaluationOrder.push(varId);
    }
  };

  for (const varId of varEdges.keys()) {
    if (!visited.has(varId)) {
      dfs(varId);
    }
  }

  return {
    dependenciesByVariableId,
    evaluationOrder,
    circularChains,
    circularVariableIds,
  };
}

interface CachedCalculationEntry {
  expression: string;
  valueType: VariableValueType;
  dependencyFingerprint: string;
  value: unknown;
  error?: FormulaError;
}

/**
 * Memoized dependency cache so changing an unrelated question ONLY recalculates
 * variables whose declared dependencies actually changed.
 */
export class IncrementalCalculationCache {
  private readonly entries = new Map<string, CachedCalculationEntry>();

  get(varId: string): CachedCalculationEntry | undefined {
    return this.entries.get(varId);
  }

  set(varId: string, entry: CachedCalculationEntry): void {
    this.entries.set(varId, entry);
  }

  clear(): void {
    this.entries.clear();
  }
}

export interface DocumentCalculationResult {
  values: Record<string, unknown>;
  formattedValues: Record<string, string>;
  errorsByVariableId: Record<string, FormulaError>;
  circularChains: string[][];
  /** Variable IDs freshly recalculated on this invocation */
  evaluatedVariableIds: string[];
  /** Variable IDs served from dependency cache (inputs unchanged) */
  skippedVariableIds: string[];
}

function buildDependencyFingerprint(
  depKeys: string[],
  answers: Record<string, unknown>,
  variables: Record<string, unknown>
): string {
  const parts: string[] = [];
  for (const key of depKeys) {
    if (key.startsWith('var:')) {
      const name = key.slice(4);
      parts.push(`${key}=${JSON.stringify(variables[name] ?? null)}`);
    } else if (key.startsWith('comp:')) {
      const cid = key.slice(5);
      parts.push(`${key}=${JSON.stringify(answers[cid] ?? null)}`);
    }
  }
  return parts.join('|');
}

/**
 * Evaluates all calculated variables in topological order using selective dependency tracking.
 * When `cache` is provided, variables whose dependency values have not changed are skipped
 * (not re-evaluated) and returned from cache.
 */
export function evaluateDocumentCalculations(
  document: FormDocument,
  answers: Record<string, unknown>,
  seedVariables?: Record<string, unknown>,
  cache?: IncrementalCalculationCache
): DocumentCalculationResult {
  const values: Record<string, unknown> = {};
  const formattedValues: Record<string, string> = {};
  const errorsByVariableId: Record<string, FormulaError> = {};
  const evaluatedVariableIds: string[] = [];
  const skippedVariableIds: string[] = [];

  // Seed baseline variable values
  for (const variable of document.variables || []) {
    const rawSeed =
      seedVariables && Object.prototype.hasOwnProperty.call(seedVariables, variable.name)
        ? seedVariables[variable.name]
        : variable.initialValue;
    values[variable.name] = coerceVariableValueSafe(rawSeed, variable);
  }
  if (seedVariables) {
    for (const [k, v] of Object.entries(seedVariables)) {
      if (!Object.prototype.hasOwnProperty.call(values, k)) {
        values[k] = v;
      }
    }
  }

  const graph = buildCalculationDependencyGraph(document);

  // Mark circular variable errors immediately without infinite looping
  for (const varId of graph.circularVariableIds) {
    const variable = document.variables.find((v) => v.id === varId);
    const matchingChain = graph.circularChains.find(
      (chain) => variable && chain.includes(variable.name)
    );
    errorsByVariableId[varId] = {
      code: 'CIRCULAR_DEPENDENCY',
      message: matchingChain
        ? `Circular calculation dependency detected: ${matchingChain.join(' → ')}.`
        : `Variable "${variable?.name || varId}" has a circular calculation dependency.`,
    };
  }

  // Evaluate acyclic calculated variables in topological dependency order
  for (const varId of graph.evaluationOrder) {
    const variable = document.variables.find((v) => v.id === varId);
    if (!variable || !variable.expression || !variable.expression.trim()) continue;

    const depKeys = graph.dependenciesByVariableId[varId] || [];
    const fingerprint = buildDependencyFingerprint(depKeys, answers, values);
    const cached = cache?.get(varId);

    if (
      cached &&
      cached.expression === variable.expression &&
      cached.valueType === variable.valueType &&
      cached.dependencyFingerprint === fingerprint
    ) {
      values[variable.name] = cached.value;
      if (cached.error) {
        errorsByVariableId[varId] = cached.error;
      }
      skippedVariableIds.push(varId);
      continue;
    }

    evaluatedVariableIds.push(varId);

    // If variable is string type and expression is a plain text template, interpolate as text
    if (
      variable.valueType === 'string' &&
      !/[+\-*/%()=<>]/.test(variable.expression.replace(FORMULA_TOKEN_REGEX, ''))
    ) {
      const interpolated = variable.expression.replace(FORMULA_TOKEN_REGEX, (_m, tok: string) => {
        const refVar = findVariableByToken(document, tok);
        if (refVar) {
          return formatValue(values[refVar.name], refVar.format);
        }
        const refComp = findComponentByToken(document, tok);
        const ans = refComp ? answers[refComp.id] : answers[tok];
        if (ans === undefined || ans === null) return '';
        return Array.isArray(ans) ? ans.join(', ') : String(ans);
      });
      values[variable.name] = interpolated;
      cache?.set(varId, {
        expression: variable.expression,
        valueType: variable.valueType,
        dependencyFingerprint: fingerprint,
        value: interpolated,
      });
      continue;
    }

    const evalRes = evaluateFormula(variable.expression, {
      answers,
      variables: values,
      document,
    });

    if (!evalRes.ok || evalRes.value === null) {
      const fallback = getDefaultInitialValueForType(variable.valueType);
      values[variable.name] = fallback;
      if (evalRes.error) {
        errorsByVariableId[varId] = evalRes.error;
      }
      cache?.set(varId, {
        expression: variable.expression,
        valueType: variable.valueType,
        dependencyFingerprint: fingerprint,
        value: fallback,
        error: evalRes.error,
      });
    } else {
      const coerced = coerceVariableValueSafe(evalRes.value, variable);
      values[variable.name] = coerced;
      cache?.set(varId, {
        expression: variable.expression,
        valueType: variable.valueType,
        dependencyFingerprint: fingerprint,
        value: coerced,
      });
    }
  }

  // Format every variable using its configured VariableFormatConfig
  for (const variable of document.variables || []) {
    formattedValues[variable.name] = formatValue(values[variable.name], variable.format);
  }

  return {
    values,
    formattedValues,
    errorsByVariableId,
    circularChains: graph.circularChains,
    evaluatedVariableIds,
    skippedVariableIds,
  };
}
