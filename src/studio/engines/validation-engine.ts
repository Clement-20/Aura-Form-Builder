/**
 * FlexStore Form Studio — Advanced Field & Cross-Field Validation Engine (Phase 2, Step 4)
 *
 * Pure TypeScript (zero React/DOM imports) so identical deterministic validation runs in:
 *  - Field Inspector live regex & rule verification
 *  - Respondent Rendering Engine (real-time + per-page + submit)
 *  - Logic Builder Preview & Debugger (isolated test mode)
 *  - Unified Client & Server-side Submission Validator (`POST /api/submissions/validate`)
 *
 * Security guarantees:
 *  - ReDoS-safe regex validation (length limit, nested quantifier & backreference rejection)
 *  - Strict http:// / https:// URL validation (blocks javascript:, data:, vbscript:)
 *  - Strict ISO calendar date validation (rejects impossible dates like 2025-02-30)
 *  - File filename traversal protection & dangerous executable extension blocking
 *  - Selection option allowlist enforcement to prevent tampered client payloads
 */

import {
  CrossFieldValidationRule,
  FormComponentNode,
  FormDocument,
  UploadedFileMeta,
  ValidationRuleKey,
} from '../document/types';
import { LogicConditionGroup } from '../logic/types';
import {
  conditionOperatorRegistry,
  inferComponentDataType,
  inferVariableDataType,
  isSafeHttpUrl,
} from '../logic/registries';
import { evaluateFormula } from './calculation-engine';
import { PipingContext, resolvePipedText } from './piping-engine';

// ============================================================================
// ReDoS-Safe Regular Expression Guard
// ============================================================================

export const MAX_REGEX_LENGTH = 200;

export interface RegexSafetyCheck {
  safe: boolean;
  error?: string;
}

/**
 * Checks that a user-configured regular expression is syntactically valid and
 * free of catastrophic backtracking (ReDoS) constructs before executing it.
 */
export function isSafeRegexPattern(pattern: string): RegexSafetyCheck {
  if (typeof pattern !== 'string') {
    return { safe: false, error: 'Pattern must be a string.' };
  }
  const trimmed = pattern.trim();
  if (!trimmed) {
    return { safe: true };
  }
  if (trimmed.length > MAX_REGEX_LENGTH) {
    return {
      safe: false,
      error: `Pattern exceeds maximum length of ${MAX_REGEX_LENGTH} characters.`,
    };
  }

  // Reject backreferences (\1 .. \9) which can cause exponential matching time
  if (/\\[1-9]/.test(trimmed)) {
    return {
      safe: false,
      error: 'Backreferences (\\1–\\9) are not allowed in validation patterns.',
    };
  }

  // Reject nested quantifiers such as (a+)+, (a*)*, (.+)+, (a{2,})+, (a|aa)+, ([^x]+)*
  const nestedQuantifierRegex = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)\s*(?:[+*?]|\{\d+,?\d*\})/;
  if (nestedQuantifierRegex.test(trimmed)) {
    return {
      safe: false,
      error: 'Pattern contains nested quantifiers that may cause slow validation.',
    };
  }

  // Reject repeated bounded quantifier groups like (a{1,10}){1,10}
  const nestedBraceRegex = /\((?:[^()\\]|\\.)*\{\d+,\d*\}(?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d+,?\d*\})/;
  if (nestedBraceRegex.test(trimmed)) {
    return {
      safe: false,
      error: 'Pattern contains nested repetition ranges that may cause slow validation.',
    };
  }

  // Reject consecutive ambiguous quantifiers like ++, **, *+, +*
  if (/(?:^|[^\\])[+*][+*]/.test(trimmed)) {
    return {
      safe: false,
      error: 'Pattern contains consecutive quantifiers.',
    };
  }

  // Reject overlapping alternation under a quantifier like (a|ab)+ or (.|a)*
  const quantifiedAlternationRegex = /\((?:[^()\\]|\\.)*\|(?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d+,\d*\})/;
  if (quantifiedAlternationRegex.test(trimmed)) {
    const insideMatch = trimmed.match(/\(((?:[^()\\]|\\.)*\|(?:[^()\\]|\\.)*)\)/);
    if (insideMatch) {
      const branches = insideMatch[1].split('|').map((b) => b.trim());
      const hasWildcardOrOverlap =
        branches.some((b) => b.includes('.') || b.includes('+') || b.includes('*')) ||
        branches.some((b, idx) =>
          branches.some((other, oIdx) => idx !== oIdx && (b.startsWith(other) || other.startsWith(b)))
        );
      if (hasWildcardOrOverlap) {
        return {
          safe: false,
          error: 'Pattern contains overlapping quantified alternation.',
        };
      }
    }
  }

  try {
    // eslint-disable-next-line no-new
    new RegExp(trimmed);
    return { safe: true };
  } catch (err) {
    return {
      safe: false,
      error: err instanceof Error ? `Invalid regular expression: ${err.message}` : 'Invalid regular expression.',
    };
  }
}

// ============================================================================
// Pure Nested Condition Group Evaluator (Shared by Validation & Outcomes)
// ============================================================================

export function evaluateConditionGroup(
  document: FormDocument,
  group: LogicConditionGroup | undefined,
  answers: Record<string, unknown>,
  variables: Record<string, unknown>
): boolean {
  if (!group || !group.items || group.items.length === 0) {
    return false;
  }

  const results: boolean[] = [];
  for (const item of group.items) {
    if (item.kind === 'group') {
      results.push(evaluateConditionGroup(document, item, answers, variables));
    } else if (item.sourceType === 'variable') {
      const varDef = document.variables.find(
        (v) => v.name === item.sourceId || v.id === item.sourceId
      );
      const varKey = varDef?.name || item.sourceId;
      const dataType = inferVariableDataType(varDef);
      const actualValue = variables[varKey];
      results.push(conditionOperatorRegistry.evaluateClause(item, actualValue, dataType));
    } else {
      const node = document.components[item.sourceId];
      const dataType = inferComponentDataType(node);
      const actualValue = answers[item.sourceId];
      results.push(conditionOperatorRegistry.evaluateClause(item, actualValue, dataType));
    }
  }

  return group.combinator === 'OR'
    ? results.some(Boolean)
    : results.every(Boolean);
}

// ============================================================================
// Helper Utilities: Dates, Emails, Numbers, Files
// ============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const DANGEROUS_FILE_EXTENSIONS = new Set<string>([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.msi',
  '.scr',
  '.pif',
  '.sh',
  '.bash',
  '.zsh',
  '.ps1',
  '.vbs',
  '.vbe',
  '.js',
  '.jse',
  '.mjs',
  '.cjs',
  '.jar',
  '.php',
  '.phtml',
  '.html',
  '.htm',
  '.xhtml',
  '.svg',
  '.dll',
  '.so',
  '.dylib',
  '.app',
  '.dmg',
]);

export function isValidEmailAddress(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254) return false;
  return EMAIL_REGEX.test(trimmed);
}

/**
 * Strictly parses an ISO calendar date (`YYYY-MM-DD`) and verifies the day
 * actually exists on the Gregorian calendar (e.g. rejects `2025-02-30`).
 */
export function parseStrictIsoDate(raw: string): { year: number; month: number; day: number; iso: string; utcMs: number } | null {
  const trimmed = (raw || '').trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return {
    year,
    month,
    day,
    iso: `${match[1]}-${match[2]}-${match[3]}`,
    utcMs: dt.getTime(),
  };
}

function toUtcIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isSafeFilename(name: string): boolean {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 255) return false;
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('\0')) {
    return false;
  }
  return true;
}

export function getFileExtension(filename: string): string {
  const trimmed = filename.trim();
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === trimmed.length - 1) return '';
  return trimmed.slice(lastDot).toLowerCase();
}

export function normalizeExtensionList(raw?: string[] | string): string[] {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : raw.split(',');
  return items
    .map((ext) => ext.trim().toLowerCase())
    .filter(Boolean)
    .map((ext) => (ext.startsWith('.') ? ext : `.${ext}`));
}

export function normalizeMimeTypeList(raw?: string[] | string): string[] {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : raw.split(',');
  return items.map((m) => m.trim().toLowerCase()).filter(Boolean);
}

function matchesMimeType(actualMime: string, allowedPatterns: string[]): boolean {
  const mime = (actualMime || '').trim().toLowerCase();
  if (!mime) return false;
  for (const pattern of allowedPatterns) {
    if (pattern === '*/*') return true;
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -1); // e.g. 'image/'
      if (mime.startsWith(prefix)) return true;
    } else if (mime === pattern) {
      return true;
    }
  }
  return false;
}

export function normalizeUploadedFiles(rawValue: unknown): UploadedFileMeta[] {
  if (rawValue === undefined || rawValue === null) return [];
  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    return trimmed ? [{ name: trimmed, size: 0, type: '' }] : [];
  }
  if (Array.isArray(rawValue)) {
    const out: UploadedFileMeta[] = [];
    for (const item of rawValue) {
      if (typeof item === 'string' && item.trim()) {
        out.push({ name: item.trim(), size: 0, type: '' });
      } else if (item && typeof item === 'object' && typeof (item as UploadedFileMeta).name === 'string') {
        const f = item as UploadedFileMeta;
        out.push({
          name: f.name,
          size: typeof f.size === 'number' && Number.isFinite(f.size) && f.size >= 0 ? f.size : 0,
          type: typeof f.type === 'string' ? f.type : '',
          lastModified: typeof f.lastModified === 'number' ? f.lastModified : undefined,
        });
      }
    }
    return out;
  }
  if (typeof rawValue === 'object' && typeof (rawValue as UploadedFileMeta).name === 'string') {
    const f = rawValue as UploadedFileMeta;
    return [
      {
        name: f.name,
        size: typeof f.size === 'number' && Number.isFinite(f.size) && f.size >= 0 ? f.size : 0,
        type: typeof f.type === 'string' ? f.type : '',
        lastModified: typeof f.lastModified === 'number' ? f.lastModified : undefined,
      },
    ];
  }
  return [];
}

export function isEmptyFieldValue(val: unknown): boolean {
  if (val === undefined || val === null) return true;
  if (typeof val === 'string') return val.trim() === '';
  if (Array.isArray(val)) return val.length === 0;
  return false;
}

function countDecimalPlaces(rawValue: unknown, num: number): number {
  const str = typeof rawValue === 'string' ? rawValue.trim() : String(num);
  // Handle scientific notation safely
  if (/[eE]/.test(str)) {
    const fixed = num.toFixed(10).replace(/0+$/, '');
    const dot = fixed.indexOf('.');
    return dot === -1 ? 0 : fixed.length - dot - 1;
  }
  const dotIdx = str.indexOf('.');
  if (dotIdx === -1) return 0;
  // Ignore trailing zeros only if numeric value was passed as number
  const frac = str.slice(dotIdx + 1);
  return frac.length;
}

// ============================================================================
// Single-Field Comprehensive Validator
// ============================================================================

export interface FieldValidationResult {
  valid: boolean;
  error?: string;
  ruleKey?: ValidationRuleKey;
}

function fail(
  node: FormComponentNode,
  ruleKey: ValidationRuleKey,
  defaultMessage: string
): FieldValidationResult {
  const custom =
    node.validation.customMessages?.[ruleKey]?.trim() ||
    node.validation.customErrorMessage?.trim();
  return {
    valid: false,
    ruleKey,
    error: custom || defaultMessage,
  };
}

/**
 * Validates a single component answer against ALL configured constraints
 * (Text, Number, Date, File, Selection) and custom error messages.
 */
export function validateFieldValue(
  node: FormComponentNode,
  rawValue: unknown,
  options?: { required?: boolean; now?: Date }
): FieldValidationResult {
  const v = node.validation || {};
  const isRequired = options?.required ?? Boolean(v.required);
  const label = node.content.label || 'This field';

  // Special empty check for file uploads
  if (node.type === 'file_upload') {
    const files = normalizeUploadedFiles(rawValue);
    if (files.length === 0) {
      if (isRequired) {
        return fail(node, 'required', `${label} requires at least one file.`);
      }
      return { valid: true };
    }

    if (v.minFiles !== undefined && files.length < v.minFiles) {
      return fail(
        node,
        'minFiles',
        `Please upload at least ${v.minFiles} file${v.minFiles === 1 ? '' : 's'}.`
      );
    }
    if (v.maxFiles !== undefined && files.length > v.maxFiles) {
      return fail(
        node,
        'maxFiles',
        `You can upload at most ${v.maxFiles} file${v.maxFiles === 1 ? '' : 's'}.`
      );
    }

    // Derive allowed extensions from validation.allowedExtensions or content.acceptedFileTypes
    const explicitExts = normalizeExtensionList(v.allowedExtensions);
    const fallbackExts =
      explicitExts.length === 0 && node.content.acceptedFileTypes
        ? normalizeExtensionList(
            node.content.acceptedFileTypes
              .split(',')
              .filter((tok) => tok.trim().startsWith('.'))
          )
        : [];
    const allowedExts = explicitExts.length > 0 ? explicitExts : fallbackExts;

    const explicitMimes = normalizeMimeTypeList(v.allowedMimeTypes);
    const fallbackMimes =
      explicitMimes.length === 0 && node.content.acceptedFileTypes
        ? normalizeMimeTypeList(
            node.content.acceptedFileTypes
              .split(',')
              .filter((tok) => tok.includes('/'))
          )
        : [];
    const allowedMimes = explicitMimes.length > 0 ? explicitMimes : fallbackMimes;

    const maxSizeMb = v.maxFileSizeMb ?? node.content.maxFileSizeMb;

    for (const file of files) {
      if (!isSafeFilename(file.name)) {
        return fail(
          node,
          'allowedExtensions',
          `File name "${file.name}" contains invalid path characters.`
        );
      }

      const ext = getFileExtension(file.name);
      if (ext && DANGEROUS_FILE_EXTENSIONS.has(ext)) {
        return fail(
          node,
          'allowedExtensions',
          `File type "${ext}" is blocked for security reasons.`
        );
      }

      if (allowedExts.length > 0 && (!ext || !allowedExts.includes(ext))) {
        return fail(
          node,
          'allowedExtensions',
          `File "${file.name}" must use an allowed extension (${allowedExts.join(', ')}).`
        );
      }

      if (allowedMimes.length > 0 && file.type && !matchesMimeType(file.type, allowedMimes)) {
        return fail(
          node,
          'allowedMimeTypes',
          `File "${file.name}" has an unsupported file type (${file.type}). Allowed: ${allowedMimes.join(', ')}.`
        );
      }

      if (typeof maxSizeMb === 'number' && maxSizeMb > 0 && file.size > maxSizeMb * 1024 * 1024) {
        return fail(
          node,
          'maxFileSizeMb',
          `File "${file.name}" exceeds the maximum size of ${maxSizeMb} MB.`
        );
      }
    }

    return { valid: true };
  }

  // Standard required / empty check
  if (isEmptyFieldValue(rawValue)) {
    if (isRequired) {
      return fail(node, 'required', `${label} is required.`);
    }
    return { valid: true };
  }

  // --------------------------------------------------------------------------
  // NUMBER / RATING / SCALE VALIDATION
  // --------------------------------------------------------------------------
  if (node.type === 'number' || node.type === 'rating' || node.type === 'scale') {
    const num = typeof rawValue === 'number' ? rawValue : Number(String(rawValue).trim());
    if (!Number.isFinite(num)) {
      return fail(node, 'number', 'Please enter a valid number.');
    }

    if (v.wholeNumberOnly && !Number.isInteger(num)) {
      return fail(node, 'wholeNumberOnly', 'Please enter a whole number (no decimals).');
    }

    if (
      typeof v.maxDecimals === 'number' &&
      v.maxDecimals >= 0 &&
      countDecimalPlaces(rawValue, num) > v.maxDecimals
    ) {
      return fail(
        node,
        'maxDecimals',
        v.maxDecimals === 0
          ? 'Please enter a whole number with no decimal places.'
          : `Please enter at most ${v.maxDecimals} decimal place${v.maxDecimals === 1 ? '' : 's'}.`
      );
    }

    if (typeof v.exactValue === 'number' && Math.abs(num - v.exactValue) >= 1e-9) {
      return fail(node, 'exactValue', `Value must be exactly ${v.exactValue}.`);
    }

    if (typeof v.min === 'number' && num < v.min) {
      const msg =
        typeof v.max === 'number'
          ? `Value must be between ${v.min} and ${v.max}.`
          : `Minimum value is ${v.min}.`;
      return fail(node, 'min', msg);
    }

    if (typeof v.max === 'number' && num > v.max) {
      const msg =
        typeof v.min === 'number'
          ? `Value must be between ${v.min} and ${v.max}.`
          : `Maximum value is ${v.max}.`;
      return fail(node, 'max', msg);
    }

    return { valid: true };
  }

  // --------------------------------------------------------------------------
  // DATE VALIDATION
  // --------------------------------------------------------------------------
  if (node.type === 'date') {
    const strVal = String(rawValue).trim();
    const parsed = parseStrictIsoDate(strVal);
    if (!parsed) {
      return fail(node, 'date', 'Please enter a valid date (YYYY-MM-DD).');
    }

    const todayIso = toUtcIsoDate(options?.now || new Date());

    if (v.pastDatesOnly && parsed.iso >= todayIso) {
      return fail(node, 'pastDatesOnly', 'Please choose a date in the past.');
    }

    if (v.futureDatesOnly && parsed.iso <= todayIso) {
      return fail(node, 'futureDatesOnly', 'Please choose a date in the future.');
    }

    if (v.minDate) {
      const minParsed = parseStrictIsoDate(v.minDate);
      if (minParsed && parsed.iso < minParsed.iso) {
        const msg = v.maxDate
          ? `Date must be between ${minParsed.iso} and ${v.maxDate}.`
          : `Date must be on or after ${minParsed.iso}.`;
        return fail(node, 'minDate', msg);
      }
    }

    if (v.maxDate) {
      const maxParsed = parseStrictIsoDate(v.maxDate);
      if (maxParsed && parsed.iso > maxParsed.iso) {
        const msg = v.minDate
          ? `Date must be between ${v.minDate} and ${maxParsed.iso}.`
          : `Date must be on or before ${maxParsed.iso}.`;
        return fail(node, 'maxDate', msg);
      }
    }

    return { valid: true };
  }

  // --------------------------------------------------------------------------
  // SELECTION VALIDATION (checkbox, radio, select, yes_no)
  // --------------------------------------------------------------------------
  if (
    node.type === 'checkbox' ||
    node.type === 'radio' ||
    node.type === 'select' ||
    node.type === 'yes_no'
  ) {
    const configuredOptions =
      node.content.options && node.content.options.length > 0
        ? node.content.options
        : node.type === 'yes_no'
        ? ['Yes', 'No']
        : [];

    if (node.type === 'checkbox' || Array.isArray(rawValue)) {
      const selected = Array.isArray(rawValue)
        ? rawValue.map((x) => String(x)).filter(Boolean)
        : [String(rawValue)];

      if (configuredOptions.length > 0) {
        for (const item of selected) {
          if (!configuredOptions.includes(item)) {
            return fail(
              node,
              'invalidOption',
              `"${item}" is not a valid option for ${label}.`
            );
          }
        }
      }

      if (typeof v.exactSelections === 'number' && selected.length !== v.exactSelections) {
        return fail(
          node,
          'exactSelections',
          `Please select exactly ${v.exactSelections} option${v.exactSelections === 1 ? '' : 's'}.`
        );
      }

      if (typeof v.minSelections === 'number' && selected.length < v.minSelections) {
        return fail(
          node,
          'minSelections',
          `Please select at least ${v.minSelections} option${v.minSelections === 1 ? '' : 's'}.`
        );
      }

      if (typeof v.maxSelections === 'number' && selected.length > v.maxSelections) {
        return fail(
          node,
          'maxSelections',
          `Please select at most ${v.maxSelections} option${v.maxSelections === 1 ? '' : 's'}.`
        );
      }

      return { valid: true };
    }

    // Single selection (radio / select / yes_no)
    const strVal = String(rawValue);
    if (configuredOptions.length > 0 && !configuredOptions.includes(strVal)) {
      return fail(node, 'invalidOption', `"${strVal}" is not a valid option for ${label}.`);
    }
    return { valid: true };
  }

  // --------------------------------------------------------------------------
  // TEXT / EMAIL / URL / PHONE / TIME VALIDATION
  // --------------------------------------------------------------------------
  const str = String(rawValue);
  const trimmed = str.trim();

  if (node.type === 'email' || v.validateEmail) {
    if (!isValidEmailAddress(trimmed)) {
      return fail(node, 'email', 'Please enter a valid email address.');
    }
  }

  if (node.type === 'url' || v.validateUrl) {
    if (!isSafeHttpUrl(trimmed)) {
      return fail(node, 'url', 'Please enter a valid http:// or https:// URL.');
    }
  }

  if (typeof v.exactLength === 'number' && str.length !== v.exactLength) {
    return fail(
      node,
      'exactLength',
      `Must be exactly ${v.exactLength} character${v.exactLength === 1 ? '' : 's'}.`
    );
  }

  if (typeof v.minLength === 'number' && str.length < v.minLength) {
    return fail(
      node,
      'minLength',
      `Must be at least ${v.minLength} character${v.minLength === 1 ? '' : 's'}.`
    );
  }

  if (typeof v.maxLength === 'number' && str.length > v.maxLength) {
    return fail(
      node,
      'maxLength',
      `Must be no more than ${v.maxLength} character${v.maxLength === 1 ? '' : 's'}.`
    );
  }

  if (v.pattern && v.pattern.trim()) {
    const check = isSafeRegexPattern(v.pattern);
    if (check.safe) {
      const regex = new RegExp(v.pattern.trim());
      if (!regex.test(str)) {
        return fail(node, 'pattern', `Value does not match the required format.`);
      }
    }
  }

  if (v.disallowedPattern && v.disallowedPattern.trim()) {
    const check = isSafeRegexPattern(v.disallowedPattern);
    if (check.safe) {
      const regex = new RegExp(v.disallowedPattern.trim());
      if (regex.test(str)) {
        return fail(node, 'disallowedPattern', `Value contains disallowed characters or text.`);
      }
    }
  }

  return { valid: true };
}

// ============================================================================
// Cross-Field Validation Engine
// ============================================================================

export interface CrossFieldVisibilityScope {
  visibleComponentIds: Set<string>;
  disabledComponentIds: Set<string>;
  /** Optional subset of component IDs (e.g. current page) to restrict evaluation */
  activeComponentIds?: Set<string>;
}

function toFiniteNumber(val: unknown): number | null {
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'string' && val.trim() !== '') {
    const n = Number(val.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function valuesEqual(a: unknown, b: unknown, caseSensitive: boolean): boolean {
  const numA = toFiniteNumber(a);
  const numB = toFiniteNumber(b);
  if (numA !== null && numB !== null) {
    return Math.abs(numA - numB) < 1e-9;
  }
  const strA = Array.isArray(a) ? a.join(',') : String(a ?? '').trim();
  const strB = Array.isArray(b) ? b.join(',') : String(b ?? '').trim();
  return caseSensitive ? strA === strB : strA.toLowerCase() === strB.toLowerCase();
}

function evaluateSingleCrossFieldRule(
  rule: CrossFieldValidationRule,
  document: FormDocument,
  answers: Record<string, unknown>,
  variables: Record<string, unknown>
): boolean {
  const sourceVal = answers[rule.sourceComponentId];
  const compareVal = rule.compareComponentId ? answers[rule.compareComponentId] : undefined;
  const sourceEmpty = isEmptyFieldValue(sourceVal);
  const compareEmpty = isEmptyFieldValue(compareVal);

  switch (rule.operator) {
    case 'equals_field': {
      if (sourceEmpty && compareEmpty) return true;
      return valuesEqual(sourceVal, compareVal, Boolean(rule.caseSensitive));
    }

    case 'not_equals_field': {
      if (sourceEmpty || compareEmpty) return true;
      return !valuesEqual(sourceVal, compareVal, Boolean(rule.caseSensitive));
    }

    case 'greater_than_field':
    case 'greater_or_equal_field':
    case 'less_than_field':
    case 'less_or_equal_field': {
      if (sourceEmpty || compareEmpty) return true;
      const a = toFiniteNumber(sourceVal);
      const b = toFiniteNumber(compareVal);
      if (a === null || b === null) return false;
      if (rule.operator === 'greater_than_field') return a > b;
      if (rule.operator === 'greater_or_equal_field') return a >= b;
      if (rule.operator === 'less_than_field') return a < b;
      return a <= b;
    }

    case 'after_date_field':
    case 'before_date_field': {
      if (sourceEmpty || compareEmpty) return true;
      const dA = parseStrictIsoDate(String(sourceVal));
      const dB = parseStrictIsoDate(String(compareVal));
      if (!dA || !dB) return false;
      return rule.operator === 'after_date_field' ? dA.iso > dB.iso : dA.iso < dB.iso;
    }

    case 'matches_expression': {
      if (!rule.expression || !rule.expression.trim()) return true;
      // Skip expression check when source field is completely empty and not explicitly filled
      if (rule.sourceComponentId && sourceEmpty && !rule.expression.includes('== 0')) {
        // Check if all referenced tokens are empty; if so skip until user enters data
        const evalCheck = evaluateFormula(rule.expression, {
          answers,
          variables,
          document,
          strictMissing: true,
        });
        if (!evalCheck.ok && evalCheck.error?.code === 'MISSING_VALUE') {
          return true;
        }
      }
      const res = evaluateFormula(rule.expression, {
        answers,
        variables,
        document,
      });
      if (!res.ok || res.value === null) return false;
      return typeof res.value === 'number' ? res.value !== 0 : Boolean(res.value);
    }

    default:
      return true;
  }
}

/**
 * Evaluates all enabled `document.logic.crossFieldValidations` against visible, enabled fields
 * and returns a map of `componentId -> resolved error message`.
 */
export function validateCrossFieldRules(
  document: FormDocument,
  answers: Record<string, unknown>,
  visibility: CrossFieldVisibilityScope,
  pipingContext: PipingContext
): Record<string, string> {
  const errors: Record<string, string> = {};
  const rules = document.logic.crossFieldValidations || [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    const targetId = rule.targetComponentId || rule.sourceComponentId;
    if (!targetId || !document.components[targetId]) continue;

    // Never block submission on hidden or disabled fields
    if (!visibility.visibleComponentIds.has(targetId)) continue;
    if (visibility.disabledComponentIds.has(targetId)) continue;

    if (
      rule.sourceComponentId &&
      document.components[rule.sourceComponentId] &&
      !visibility.visibleComponentIds.has(rule.sourceComponentId)
    ) {
      continue;
    }

    if (
      rule.compareComponentId &&
      document.components[rule.compareComponentId] &&
      !visibility.visibleComponentIds.has(rule.compareComponentId)
    ) {
      continue;
    }

    // For per-page stepping validation, only run rules whose target belongs to the active page
    if (visibility.activeComponentIds && !visibility.activeComponentIds.has(targetId)) {
      continue;
    }

    // Optional conditional guard: only enforce this rule when guard condition group passes
    if (rule.whenConditionGroup && rule.whenConditionGroup.items.length > 0) {
      const guardPassed = evaluateConditionGroup(
        document,
        rule.whenConditionGroup,
        answers,
        pipingContext.variables
      );
      if (!guardPassed) continue;
    }

    const passed = evaluateSingleCrossFieldRule(
      rule,
      document,
      answers,
      pipingContext.variables
    );

    if (!passed && !errors[targetId]) {
      const fallbackMsg = `${rule.name || 'Validation check'} failed.`;
      errors[targetId] = resolvePipedText(rule.errorMessage || fallbackMsg, pipingContext);
    }
  }

  return errors;
}
