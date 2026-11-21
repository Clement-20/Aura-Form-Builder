/**
 * FlexStore Form Studio — Scoped Custom CSS Engine (Phase 3.1)
 *
 * Pure TypeScript (zero DOM/React dependencies) so identical validation, sanitization,
 * responsive media evaluation, formatting, and strict form-level scoping run in:
 *  - Advanced Customisation CSS Editor & Field Inspector
 *  - EditorCanvas & Theme/Code Live Preview (Desktop 1280px / Tablet 768px / Mobile 390px)
 *  - Published FormDocumentRenderer (zero leakage to FlexStore host UI or sibling forms)
 *  - Automated test suite
 *
 * Security guarantees:
 *  - Blocks `@import`, `@charset`, `@namespace`, `</style>`, HTML tags, `expression()`,
 *    `-moz-binding`, `behavior`, and non-http(s) `url(...)` schemes (`javascript:`, `data:`, etc.).
 *  - Rewrites every selector under `[data-fs-form-scope="<safeFormScope>"]` so rules can never
 *    target `body`, `html`, `:root`, FlexStore chrome, or another form rendered on the same page.
 *  - Component-level CSS is additionally confined to `[data-fs-component="<safeComponentId>"]`.
 *  - Enforces a 50 KB maximum payload limit.
 */

import { FormDocument } from '../document/types';
import { ViewportMode } from './design-engine';

export const MAX_CUSTOM_CSS_LENGTH = 50_000;

export interface CssDiagnostic {
  severity: 'error' | 'warning';
  code:
    | 'CSS_TOO_LARGE'
    | 'UNBALANCED_BRACES'
    | 'UNCLOSED_COMMENT'
    | 'UNCLOSED_STRING'
    | 'BLOCKED_AT_RULE'
    | 'UNSAFE_VALUE'
    | 'UNSAFE_URL'
    | 'STYLE_TAG_BREAKOUT'
    | 'INVALID_DECLARATION'
    | 'EMPTY_SELECTOR'
    | 'UNSUPPORTED_AT_RULE';
  line: number;
  message: string;
}

export interface CompiledCssResult {
  valid: boolean;
  scopedCss: string;
  errors: CssDiagnostic[];
  warnings: CssDiagnostic[];
  ruleCount: number;
}

export interface CssSelectorTarget {
  id: string;
  group: 'form' | 'controls' | 'screens' | 'component';
  label: string;
  selector: string;
  description: string;
  snippet: string;
  componentId?: string;
  componentType?: string;
}

export interface CodeHighlightToken {
  type:
    | 'plain'
    | 'comment'
    | 'selector'
    | 'atrule'
    | 'property'
    | 'value'
    | 'string'
    | 'number'
    | 'punctuation'
    | 'keyword'
    | 'tag'
    | 'attr'
    | 'function';
  text: string;
}

// ============================================================================
// Scope Identifier Helpers
// ============================================================================

/**
 * Produces a deterministic, attribute-safe scope identifier for a form.
 * Distinct form IDs always map to distinct scopes so two forms on the same page
 * never share or leak custom CSS rules.
 */
export function buildFormCssScopeId(formId: string, instanceSuffix?: string): string {
  const cleanId = String(formId || 'form')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64);
  if (instanceSuffix) {
    const cleanSuffix = instanceSuffix.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24);
    return `fs_${cleanId}_${cleanSuffix}`;
  }
  return `fs_${cleanId}`;
}

function sanitizeAttributeToken(raw: string): string {
  return String(raw || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

const VIEWPORT_SIMULATED_WIDTH_PX: Record<ViewportMode, number> = {
  desktop: 1280,
  tablet: 768,
  mobile: 390,
};

// ============================================================================
// Value & URL Safety Checks
// ============================================================================

const BLOCKED_AT_RULES = new Set(['import', 'charset', 'namespace', 'font-face']);
const ALLOWED_CONDITIONAL_AT_RULES = new Set(['media', 'supports', 'container']);
const ALLOWED_KEYFRAME_AT_RULES = new Set(['keyframes', '-webkit-keyframes']);

function isSafeCssUrl(rawUrl: string): boolean {
  const cleaned = rawUrl.trim().replace(/^['"]|['"]$/g, '').trim();
  if (!cleaned) return false;
  // Block any control characters or whitespace-obfuscated schemes
  const normalized = cleaned.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
  if (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('file:') ||
    normalized.startsWith('blob:')
  ) {
    return false;
  }
  return normalized.startsWith('https://') || normalized.startsWith('http://');
}

function sanitizeDeclarationValue(
  property: string,
  value: string,
  line: number,
  errors: CssDiagnostic[],
  warnings: CssDiagnostic[]
): string | null {
  const propLower = property.trim().toLowerCase();
  const valTrimmed = value.trim();

  if (!propLower || !valTrimmed) return null;

  // Reject invalid property names (allow standard identifiers and --custom-vars)
  if (!/^(?:--[a-zA-Z0-9_-]+|-?[a-zA-Z][a-zA-Z0-9-]*)$/.test(propLower)) {
    errors.push({
      severity: 'error',
      code: 'INVALID_DECLARATION',
      line,
      message: `Invalid CSS property name "${property.trim()}".`,
    });
    return null;
  }

  // Block legacy script-executing properties
  if (propLower === 'behavior' || propLower === '-moz-binding') {
    errors.push({
      severity: 'error',
      code: 'UNSAFE_VALUE',
      line,
      message: `Property "${propLower}" is blocked for security.`,
    });
    return null;
  }

  // Block </style> or HTML tag injection inside CSS values
  if (/<\s*\/?\s*style/i.test(valTrimmed) || /<\/?[a-z]/i.test(valTrimmed)) {
    errors.push({
      severity: 'error',
      code: 'STYLE_TAG_BREAKOUT',
      line,
      message: 'HTML tags are not permitted inside CSS values.',
    });
    return null;
  }

  // Block IE expression() and javascript: anywhere in value
  const compactLower = valTrimmed.replace(/\/\*[\s\S]*?\*\//g, '').toLowerCase();
  if (/\bexpression\s*\(/.test(compactLower) || /javascript\s*:/i.test(compactLower)) {
    errors.push({
      severity: 'error',
      code: 'UNSAFE_VALUE',
      line,
      message: `Unsafe CSS expression detected in "${propLower}".`,
    });
    return null;
  }

  // Validate every url(...) call
  const urlMatches = valTrimmed.matchAll(/url\s*\(([^)]*)\)/gi);
  for (const match of urlMatches) {
    const candidate = match[1] || '';
    if (!isSafeCssUrl(candidate)) {
      errors.push({
        severity: 'error',
        code: 'UNSAFE_URL',
        line,
        message: `Blocked unsafe URL in "${propLower}". Only http:// and https:// URLs are allowed.`,
      });
      return null;
    }
  }

  // Warn when position: fixed is used (could cover host editor chrome if not contained)
  if (propLower === 'position' && /\bfixed\b/i.test(valTrimmed)) {
    warnings.push({
      severity: 'warning',
      code: 'UNSAFE_VALUE',
      line,
      message: 'Converted "position: fixed" to "position: sticky" to keep styles contained inside the form.',
    });
    return valTrimmed.replace(/\bfixed\b/gi, 'sticky');
  }

  return valTrimmed;
}

// ============================================================================
// Selector Rewriting & Strict Form Scoping
// ============================================================================

function splitTopLevelCommas(input: string): string[] {
  const parts: string[] = [];
  let current = '';
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      current += ch;
      if (ch === quote && input[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);

    if (ch === ',' && parenDepth === 0 && bracketDepth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function scopeSingleSelector(
  rawSelector: string,
  scopePrefix: string,
  componentScopePrefix?: string
): string | null {
  const trimmed = rawSelector.trim();
  if (!trimmed) return null;

  // Reject any attempt to inject tags or braces
  if (/[<>{}]/.test(trimmed)) return null;

  const effectiveRoot = componentScopePrefix || scopePrefix;

  // Component-level CSS `&` self-reference (e.g. `&:hover`, `& .fs-input`)
  if (componentScopePrefix && trimmed.includes('&')) {
    return trimmed.replace(/&/g, componentScopePrefix);
  }

  // Root-targeting aliases map directly to the form scope root (never page html/body/:root)
  if (/^(?::root|:host|html|body)$/i.test(trimmed)) {
    return effectiveRoot;
  }

  // Selectors starting with `html `, `body `, `:root ` get rewritten to start at the scope root
  const strippedGlobalPrefix = trimmed
    .replace(/^(?:html|body|:root|:host)\s*>\s*/i, `${effectiveRoot} > `)
    .replace(/^(?:html|body|:root|:host)\s+/i, `${effectiveRoot} `);
  if (strippedGlobalPrefix !== trimmed) {
    return strippedGlobalPrefix;
  }

  // If the creator explicitly targeted `.fs-form` (which IS on the scope root element), attach directly
  if (/^\.fs-form(?=$|[\s.:#[\>+~])/.test(trimmed)) {
    if (componentScopePrefix) {
      return `${componentScopePrefix}`;
    }
    return `${scopePrefix}${trimmed}`;
  }

  // If already prefixed with our exact scope, keep it as-is
  if (trimmed.startsWith(effectiveRoot)) {
    return trimmed;
  }

  return `${effectiveRoot} ${trimmed}`;
}

function scopeSelectorList(
  selectorText: string,
  scopePrefix: string,
  componentScopePrefix?: string
): string {
  const parts = splitTopLevelCommas(selectorText);
  const scoped: string[] = [];
  for (const part of parts) {
    const rewritten = scopeSingleSelector(part, scopePrefix, componentScopePrefix);
    if (rewritten) scoped.push(rewritten);
  }
  return scoped.join(', ');
}

// ============================================================================
// Responsive @media Query Evaluation for Simulated Preview Viewports
// ============================================================================

/**
 * Evaluates simple width-based `@media` conditions (`max-width`, `min-width`) against
 * a simulated preview viewport width (desktop=1280, tablet=768, mobile=390).
 * Returns:
 *  - `true` if the media query matches the simulated viewport (unwrap rules so preview renders them)
 *  - `false` if it does not match (omit rules in this simulated viewport)
 *  - `null` if the query contains non-width conditions (keep `@media` wrapper intact)
 */
function evaluateMediaConditionForPreview(
  prelude: string,
  viewport: ViewportMode
): boolean | null {
  const widthPx = VIEWPORT_SIMULATED_WIDTH_PX[viewport];
  const lower = prelude.trim().toLowerCase();
  if (!lower) return true;

  // Handle comma-separated media query list (OR semantics)
  const branches = splitTopLevelCommas(lower);
  let sawAnyWidth = false;

  for (const branch of branches) {
    // Skip print-only queries in screen previews
    if (/^\s*print\b/.test(branch)) {
      sawAnyWidth = true;
      continue;
    }

    const stripped = branch
      .replace(/^\s*(?:only\s+)?(?:screen|all)\s*(?:and\s+)?/i, '')
      .trim();

    if (!stripped) {
      return true;
    }

    const clauses = stripped.split(/\s+and\s+/i).map((c) => c.trim());
    let branchMatched = true;
    let branchRecognized = true;

    for (const clause of clauses) {
      const maxMatch = clause.match(/^\(\s*max-width\s*:\s*(\d+(?:\.\d+)?)(px|rem|em)?\s*\)$/);
      if (maxMatch) {
        sawAnyWidth = true;
        const unit = maxMatch[2] || 'px';
        const val = parseFloat(maxMatch[1]) * (unit === 'rem' || unit === 'em' ? 16 : 1);
        if (widthPx > val) branchMatched = false;
        continue;
      }

      const minMatch = clause.match(/^\(\s*min-width\s*:\s*(\d+(?:\.\d+)?)(px|rem|em)?\s*\)$/);
      if (minMatch) {
        sawAnyWidth = true;
        const unit = minMatch[2] || 'px';
        const val = parseFloat(minMatch[1]) * (unit === 'rem' || unit === 'em' ? 16 : 1);
        if (widthPx < val) branchMatched = false;
        continue;
      }

      // Range syntax: (width <= 768px) or (width >= 640px)
      const rangeMatch = clause.match(
        /^\(\s*width\s*(<=|>=|<|>)\s*(\d+(?:\.\d+)?)(px|rem|em)?\s*\)$/
      );
      if (rangeMatch) {
        sawAnyWidth = true;
        const op = rangeMatch[1];
        const unit = rangeMatch[3] || 'px';
        const val = parseFloat(rangeMatch[2]) * (unit === 'rem' || unit === 'em' ? 16 : 1);
        if (op === '<=' && !(widthPx <= val)) branchMatched = false;
        if (op === '>=' && !(widthPx >= val)) branchMatched = false;
        if (op === '<' && !(widthPx < val)) branchMatched = false;
        if (op === '>' && !(widthPx > val)) branchMatched = false;
        continue;
      }

      branchRecognized = false;
      break;
    }

    if (!branchRecognized) return null;
    if (branchMatched) return true;
  }

  return sawAnyWidth ? false : null;
}

// ============================================================================
// Core CSS Parser, Validator & Scoper
// ============================================================================

interface CssParserContext {
  scopePrefix: string;
  componentScopePrefix?: string;
  previewViewport?: ViewportMode;
  errors: CssDiagnostic[];
  warnings: CssDiagnostic[];
  ruleCount: number;
}

function getLineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

/**
 * Strips CSS block comments while preserving newlines so diagnostic line numbers remain exact.
 */
function stripCommentsPreservingLines(
  input: string,
  errors: CssDiagnostic[]
): string {
  let out = '';
  let i = 0;
  let quote: '"' | "'" | null = null;

  while (i < input.length) {
    const ch = input[i];
    if (quote) {
      out += ch;
      if (ch === quote && input[i - 1] !== '\\') quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === '/' && input[i + 1] === '*') {
      const startLine = getLineAt(input, i);
      const endIdx = input.indexOf('*/', i + 2);
      if (endIdx === -1) {
        errors.push({
          severity: 'error',
          code: 'UNCLOSED_COMMENT',
          line: startLine,
          message: 'Unclosed CSS comment (`/* ... */`).',
        });
        return out;
      }
      const commentBody = input.slice(i, endIdx + 2);
      // Preserve newline count
      for (let k = 0; k < commentBody.length; k++) {
        if (commentBody[k] === '\n') out += '\n';
      }
      i = endIdx + 2;
      continue;
    }
    out += ch;
    i++;
  }

  if (quote) {
    errors.push({
      severity: 'error',
      code: 'UNCLOSED_STRING',
      line: getLineAt(input, input.length),
      message: `Unclosed string literal (${quote}).`,
    });
  }

  return out;
}

function parseDeclarationsBlock(
  body: string,
  baseLineOffset: number,
  ctx: CssParserContext
): string[] {
  const declarations: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let parenDepth = 0;
  let declStartOffset = 0;

  const flushDecl = (raw: string, startOffset: number) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const colonIdx = trimmed.indexOf(':');
    const line = baseLineOffset + getLineAt(body, startOffset) - 1;
    if (colonIdx === -1) {
      ctx.errors.push({
        severity: 'error',
        code: 'INVALID_DECLARATION',
        line,
        message: `Expected "property: value;" near "${trimmed.slice(0, 40)}".`,
      });
      return;
    }
    const prop = trimmed.slice(0, colonIdx).trim();
    const val = trimmed.slice(colonIdx + 1).trim();
    const safeVal = sanitizeDeclarationValue(prop, val, line, ctx.errors, ctx.warnings);
    if (safeVal !== null) {
      declarations.push(`  ${prop}: ${safeVal};`);
    }
  };

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (!current.trim()) declStartOffset = i;
    if (quote) {
      current += ch;
      if (ch === quote && body[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);

    if (ch === ';' && parenDepth === 0) {
      flushDecl(current, declStartOffset);
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim()) {
    flushDecl(current, declStartOffset);
  }

  return declarations;
}

function parseBlockSequence(
  source: string,
  baseLineOffset: number,
  ctx: CssParserContext
): string {
  const outputChunks: string[] = [];
  let i = 0;
  const len = source.length;

  while (i < len) {
    // Skip whitespace
    while (i < len && /\s/.test(source[i])) i++;
    if (i >= len) break;

    // Check stray closing brace
    if (source[i] === '}') {
      ctx.errors.push({
        severity: 'error',
        code: 'UNBALANCED_BRACES',
        line: baseLineOffset + getLineAt(source, i) - 1,
        message: 'Unexpected closing brace `}`.',
      });
      i++;
      continue;
    }

    const stmtStart = i;
    const stmtLine = baseLineOffset + getLineAt(source, stmtStart) - 1;

    // Scan prelude until `{` or `;`
    let prelude = '';
    let quote: '"' | "'" | null = null;
    let foundChar: '{' | ';' | null = null;

    while (i < len) {
      const ch = source[i];
      if (quote) {
        prelude += ch;
        if (ch === quote && source[i - 1] !== '\\') quote = null;
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        prelude += ch;
        i++;
        continue;
      }
      if (ch === '{' || ch === ';') {
        foundChar = ch;
        i++;
        break;
      }
      if (ch === '}') {
        ctx.errors.push({
          severity: 'error',
          code: 'UNBALANCED_BRACES',
          line: baseLineOffset + getLineAt(source, i) - 1,
          message: 'Unexpected `}` before rule block opened.',
        });
        i++;
        break;
      }
      prelude += ch;
      i++;
    }

    const trimmedPrelude = prelude.trim();
    if (!trimmedPrelude) continue;

    // Statement terminated by `;` (e.g. `@import ...;` or bare declaration in component CSS)
    if (foundChar === ';') {
      if (trimmedPrelude.startsWith('@')) {
        const atMatch = trimmedPrelude.match(/^@([a-zA-Z-]+)/);
        const atName = (atMatch?.[1] || '').toLowerCase();
        if (BLOCKED_AT_RULES.has(atName)) {
          ctx.errors.push({
            severity: 'error',
            code: 'BLOCKED_AT_RULE',
            line: stmtLine,
            message: `@${atName} rules are blocked to protect form isolation and privacy.`,
          });
        } else {
          ctx.warnings.push({
            severity: 'warning',
            code: 'UNSUPPORTED_AT_RULE',
            line: stmtLine,
            message: `Unsupported at-rule "@${atName}" was ignored.`,
          });
        }
      } else if (ctx.componentScopePrefix && trimmedPrelude.includes(':')) {
        // Support bare declarations inside component-level CSS (e.g. `border-radius: 14px;`)
        const decls = parseDeclarationsBlock(`${trimmedPrelude};`, stmtLine, ctx);
        if (decls.length > 0) {
          ctx.ruleCount++;
          outputChunks.push(`${ctx.componentScopePrefix} {\n${decls.join('\n')}\n}`);
        }
      } else {
        ctx.errors.push({
          severity: 'error',
          code: 'INVALID_DECLARATION',
          line: stmtLine,
          message: `Unexpected statement "${trimmedPrelude.slice(0, 40)}" outside of a CSS rule block.`,
        });
      }
      continue;
    }

    // Missing `{`
    if (foundChar !== '{') {
      if (ctx.componentScopePrefix && trimmedPrelude.includes(':')) {
        const decls = parseDeclarationsBlock(trimmedPrelude, stmtLine, ctx);
        if (decls.length > 0) {
          ctx.ruleCount++;
          outputChunks.push(`${ctx.componentScopePrefix} {\n${decls.join('\n')}\n}`);
        }
      } else {
        ctx.errors.push({
          severity: 'error',
          code: 'UNBALANCED_BRACES',
          line: stmtLine,
          message: `Selector "${trimmedPrelude.slice(0, 40)}" is missing an opening \`{\` block.`,
        });
      }
      continue;
    }

    // Read balanced block body until matching `}`
    const bodyStart = i;
    let depth = 1;
    quote = null;
    while (i < len && depth > 0) {
      const ch = source[i];
      if (quote) {
        if (ch === quote && source[i - 1] !== '\\') quote = null;
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        i++;
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      i++;
    }

    if (depth !== 0) {
      ctx.errors.push({
        severity: 'error',
        code: 'UNBALANCED_BRACES',
        line: stmtLine,
        message: `Unclosed CSS block for "${trimmedPrelude.slice(0, 40)}". Missing closing \`}\`.`,
      });
      continue;
    }

    const body = source.slice(bodyStart, i - 1);
    const bodyLineOffset = baseLineOffset + getLineAt(source, bodyStart) - 1;

    // Handle at-rules with blocks (`@media`, `@supports`, `@container`, `@keyframes`)
    if (trimmedPrelude.startsWith('@')) {
      const atMatch = trimmedPrelude.match(/^@([a-zA-Z-]+)\s*([\s\S]*)$/);
      const atName = (atMatch?.[1] || '').toLowerCase();
      const atArgs = (atMatch?.[2] || '').trim();

      if (BLOCKED_AT_RULES.has(atName)) {
        ctx.errors.push({
          severity: 'error',
          code: 'BLOCKED_AT_RULE',
          line: stmtLine,
          message: `@${atName} is blocked to prevent external tracking and host interference.`,
        });
        continue;
      }

      if (ALLOWED_CONDITIONAL_AT_RULES.has(atName)) {
        if (atName === 'media' && ctx.previewViewport) {
          const previewEval = evaluateMediaConditionForPreview(atArgs, ctx.previewViewport);
          if (previewEval === false) {
            // Still parse inner rules so syntax/security errors are reported even when inactive!
            parseBlockSequence(body, bodyLineOffset, ctx);
            continue;
          }
          if (previewEval === true) {
            const innerCss = parseBlockSequence(body, bodyLineOffset, ctx);
            if (innerCss.trim()) outputChunks.push(innerCss);
            continue;
          }
        }
        const innerCss = parseBlockSequence(body, bodyLineOffset, ctx);
        if (innerCss.trim()) {
          outputChunks.push(`@${atName} ${atArgs} {\n${innerCss}\n}`);
        }
        continue;
      }

      if (ALLOWED_KEYFRAME_AT_RULES.has(atName)) {
        // Scope keyframe animation names per form so animations don't collide across forms
        const safeName = atArgs.replace(/[^a-zA-Z0-9_-]/g, '');
        if (!safeName) {
          ctx.errors.push({
            severity: 'error',
            code: 'EMPTY_SELECTOR',
            line: stmtLine,
            message: `@${atName} requires a valid animation name.`,
          });
          continue;
        }
        // Parse inner keyframe stops safely (from, to, 0%..100%)
        const stopBlocks: string[] = [];
        const stopRegex = /([^{]+)\{([^}]*)\}/g;
        let m: RegExpExecArray | null;
        while ((m = stopRegex.exec(body)) !== null) {
          const stopSel = m[1].trim();
          const stopBody = m[2];
          if (!/^(?:from|to|\d{1,3}%)(?:\s*,\s*(?:from|to|\d{1,3}%))*$/i.test(stopSel)) {
            continue;
          }
          const decls = parseDeclarationsBlock(stopBody, bodyLineOffset, ctx);
          if (decls.length > 0) {
            stopBlocks.push(`  ${stopSel} {\n${decls.join('\n')}\n  }`);
          }
        }
        if (stopBlocks.length > 0) {
          ctx.ruleCount++;
          outputChunks.push(`@${atName} ${safeName} {\n${stopBlocks.join('\n')}\n}`);
        }
        continue;
      }

      ctx.warnings.push({
        severity: 'warning',
        code: 'UNSUPPORTED_AT_RULE',
        line: stmtLine,
        message: `Unsupported at-rule "@${atName}" was ignored.`,
      });
      continue;
    }

    // Standard style rule
    const scopedSelector = scopeSelectorList(
      trimmedPrelude,
      ctx.scopePrefix,
      ctx.componentScopePrefix
    );
    if (!scopedSelector) {
      ctx.errors.push({
        severity: 'error',
        code: 'EMPTY_SELECTOR',
        line: stmtLine,
        message: `Invalid or empty CSS selector "${trimmedPrelude.slice(0, 40)}".`,
      });
      continue;
    }

    const decls = parseDeclarationsBlock(body, bodyLineOffset, ctx);
    if (decls.length > 0) {
      ctx.ruleCount++;
      outputChunks.push(`${scopedSelector} {\n${decls.join('\n')}\n}`);
    }
  }

  return outputChunks.join('\n\n');
}

// ============================================================================
// Public Compilation & Validation APIs
// ============================================================================

export function compileScopedCss(
  rawCss: string,
  options: {
    formId: string;
    scopeId?: string;
    componentId?: string;
    previewViewport?: ViewportMode;
  }
): CompiledCssResult {
  const errors: CssDiagnostic[] = [];
  const warnings: CssDiagnostic[] = [];

  if (!rawCss || !rawCss.trim()) {
    return { valid: true, scopedCss: '', errors, warnings, ruleCount: 0 };
  }

  if (rawCss.length > MAX_CUSTOM_CSS_LENGTH) {
    errors.push({
      severity: 'error',
      code: 'CSS_TOO_LARGE',
      line: 1,
      message: `Custom CSS exceeds the maximum size limit of ${Math.round(
        MAX_CUSTOM_CSS_LENGTH / 1000
      )} KB.`,
    });
    return { valid: false, scopedCss: '', errors, warnings, ruleCount: 0 };
  }

  if (/<\s*\/?\s*style/i.test(rawCss)) {
    errors.push({
      severity: 'error',
      code: 'STYLE_TAG_BREAKOUT',
      line: getLineAt(rawCss, rawCss.search(/<\s*\/?\s*style/i)),
      message: 'HTML `<style>` tags are not permitted inside custom CSS.',
    });
    return { valid: false, scopedCss: '', errors, warnings, ruleCount: 0 };
  }

  const scopeId = options.scopeId || buildFormCssScopeId(options.formId);
  const safeScopeId = sanitizeAttributeToken(scopeId);
  const scopePrefix = `[data-fs-form-scope="${safeScopeId}"]`;
  const componentScopePrefix = options.componentId
    ? `${scopePrefix} [data-fs-component="${sanitizeAttributeToken(options.componentId)}"]`
    : undefined;

  const stripped = stripCommentsPreservingLines(rawCss, errors);
  const ctx: CssParserContext = {
    scopePrefix,
    componentScopePrefix,
    previewViewport: options.previewViewport,
    errors,
    warnings,
    ruleCount: 0,
  };

  const scopedCss = parseBlockSequence(stripped, 1, ctx);

  return {
    valid: errors.length === 0,
    scopedCss,
    errors,
    warnings,
    ruleCount: ctx.ruleCount,
  };
}

/**
 * Compiles both form-level custom CSS and all enabled component-level custom CSS
 * into a single strictly-scoped stylesheet for a FormDocument.
 */
export function compileDocumentCustomCss(
  doc: FormDocument,
  options?: {
    scopeId?: string;
    previewViewport?: ViewportMode;
    /** Override form-level CSS for live preview before saving */
    overrideFormCss?: { enabled: boolean; code: string };
  }
): CompiledCssResult {
  const scopeId = options?.scopeId || buildFormCssScopeId(doc.id);
  const allErrors: CssDiagnostic[] = [];
  const allWarnings: CssDiagnostic[] = [];
  const cssParts: string[] = [];
  let totalRules = 0;

  const formCssConfig = options?.overrideFormCss ??
    doc.customCode?.css ?? {
      enabled: Boolean(doc.design.customCss?.trim()),
      code: doc.design.customCss || '',
    };

  if (formCssConfig.enabled && formCssConfig.code.trim()) {
    const formResult = compileScopedCss(formCssConfig.code, {
      formId: doc.id,
      scopeId,
      previewViewport: options?.previewViewport,
    });
    allErrors.push(...formResult.errors);
    allWarnings.push(...formResult.warnings);
    totalRules += formResult.ruleCount;
    if (formResult.scopedCss) cssParts.push(formResult.scopedCss);
  }

  for (const node of Object.values(doc.components)) {
    const compCss = node.appearance?.customCss;
    const compEnabled = node.appearance?.customCssEnabled !== false;
    if (compEnabled && compCss && compCss.trim()) {
      const compResult = compileScopedCss(compCss, {
        formId: doc.id,
        scopeId,
        componentId: node.id,
        previewViewport: options?.previewViewport,
      });
      allErrors.push(...compResult.errors);
      allWarnings.push(...compResult.warnings);
      totalRules += compResult.ruleCount;
      if (compResult.scopedCss) cssParts.push(compResult.scopedCss);
    }
  }

  return {
    valid: allErrors.length === 0,
    scopedCss: cssParts.join('\n\n'),
    errors: allErrors,
    warnings: allWarnings,
    ruleCount: totalRules,
  };
}

// ============================================================================
// CSS Formatter
// ============================================================================

export function formatCss(rawCss: string): string {
  if (!rawCss.trim()) return '';
  let formatted = '';
  let indent = 0;
  let i = 0;
  let quote: '"' | "'" | null = null;
  let inComment = false;
  const src = rawCss.replace(/\r\n/g, '\n');

  const pad = () => '  '.repeat(Math.max(0, indent));

  while (i < src.length) {
    const ch = src[i];
    if (inComment) {
      formatted += ch;
      if (ch === '*' && src[i + 1] === '/') {
        formatted += '/\n';
        inComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (quote) {
      formatted += ch;
      if (ch === quote && src[i - 1] !== '\\') quote = null;
      i++;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      if (formatted && !formatted.endsWith('\n')) formatted += '\n';
      formatted += `${pad()}/*`;
      inComment = true;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      formatted += ch;
      i++;
      continue;
    }
    if (ch === '{') {
      formatted = formatted.trimEnd() + ' {\n';
      indent++;
      formatted += pad();
      i++;
      while (i < src.length && /\s/.test(src[i])) i++;
      continue;
    }
    if (ch === '}') {
      indent = Math.max(0, indent - 1);
      formatted = formatted.trimEnd() + '\n' + pad() + '}\n';
      if (indent === 0) formatted += '\n';
      else formatted += pad();
      i++;
      while (i < src.length && /\s/.test(src[i])) i++;
      continue;
    }
    if (ch === ';') {
      formatted = formatted.trimEnd() + ';\n' + pad();
      i++;
      while (i < src.length && /\s/.test(src[i])) i++;
      continue;
    }
    if (ch === '\n' || ch === '\t') {
      if (!formatted.endsWith(' ') && !formatted.endsWith('\n')) formatted += ' ';
      i++;
      continue;
    }
    if (ch === ' ') {
      if (!formatted.endsWith(' ') && !formatted.endsWith('\n')) formatted += ' ';
      i++;
      continue;
    }
    formatted += ch;
    i++;
  }

  return formatted
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ============================================================================
// Selector & Component Targeting Catalog
// ============================================================================

export function buildCssSelectorCatalog(doc: FormDocument): CssSelectorTarget[] {
  const targets: CssSelectorTarget[] = [
    {
      id: 'sel_form',
      group: 'form',
      label: 'Form Canvas Background',
      selector: '.fs-form',
      description: 'Outer form canvas wrapper and inherited CSS variables',
      snippet: `.fs-form {\n  background: linear-gradient(180deg, #F7F6F3 0%, #EAE7E1 100%);\n}`,
    },
    {
      id: 'sel_card',
      group: 'form',
      label: 'Form Card Surface',
      selector: '.fs-card',
      description: 'Main form container card holding pages and questions',
      snippet: `.fs-card {\n  border: 1px solid rgba(11, 13, 15, 0.12);\n  box-shadow: 0 20px 50px rgba(11, 13, 15, 0.08);\n}`,
    },
    {
      id: 'sel_header',
      group: 'form',
      label: 'Form Header & Title',
      selector: '.fs-form-title',
      description: 'Main heading displayed at the top of the form',
      snippet: `.fs-form-title {\n  letter-spacing: -0.03em;\n  font-weight: 700;\n}`,
    },
    {
      id: 'sel_progress',
      group: 'form',
      label: 'Progress Bar Fill',
      selector: '.fs-progress-fill',
      description: 'Active progress indicator bar',
      snippet: `.fs-progress-fill {\n  background: linear-gradient(90deg, #0F766E, #14B8A6);\n}`,
    },
    {
      id: 'sel_field',
      group: 'controls',
      label: 'All Question Blocks',
      selector: '.fs-field',
      description: 'Wrapper around every individual form block',
      snippet: `.fs-field {\n  padding: 12px;\n  border-radius: 12px;\n  transition: background-color 150ms ease;\n}`,
    },
    {
      id: 'sel_input',
      group: 'controls',
      label: 'Text & Select Inputs',
      selector: '.fs-field input, .fs-field textarea, .fs-field select',
      description: 'All text inputs, textareas, and dropdown controls',
      snippet: `.fs-field input, .fs-field textarea, .fs-field select {\n  border-width: 1.5px;\n}\n.fs-field input:focus {\n  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.18);\n}`,
    },
    {
      id: 'sel_submit',
      group: 'controls',
      label: 'Primary Action Button',
      selector: '.fs-submit-btn',
      description: 'Next / Continue / Submit button',
      snippet: `.fs-submit-btn {\n  letter-spacing: 0.01em;\n  padding-left: 28px;\n  padding-right: 28px;\n}`,
    },
    {
      id: 'sel_welcome',
      group: 'screens',
      label: 'Welcome Screen',
      selector: '.fs-welcome-screen',
      description: 'Introductory welcome card before the first page',
      snippet: `.fs-welcome-screen {\n  padding-top: 48px;\n  padding-bottom: 48px;\n}`,
    },
    {
      id: 'sel_thankyou',
      group: 'screens',
      label: 'Completion & Result Screen',
      selector: '.fs-thankyou-screen',
      description: 'Thank-you or personalised outcome container',
      snippet: `.fs-thankyou-screen {\n  border-top: 3px solid #0F766E;\n}`,
    },
    {
      id: 'sel_custom_html',
      group: 'screens',
      label: 'Custom HTML Blocks',
      selector: '.fs-custom-html',
      description: 'All sanitized Custom HTML content containers',
      snippet: `.fs-custom-html {\n  line-height: 1.65;\n}`,
    },
  ];

  // Add every real component in the form so creators never guess internal IDs
  const seen = new Set<string>();
  for (const page of doc.pages) {
    const visit = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      const comp = doc.components[id];
      if (!comp) return;
      const safeId = sanitizeAttributeToken(comp.id);
      const label = comp.content.label?.trim() || `${comp.type} block`;
      const selector = `[data-fs-component="${safeId}"]`;
      targets.push({
        id: `comp_${safeId}`,
        group: 'component',
        label,
        selector,
        description: `Targets "${label}" (${comp.type}) on ${page.title}`,
        snippet: `${selector} {\n  /* Styles scoped to "${label}" */\n  padding: 14px;\n  border-radius: 12px;\n}`,
        componentId: comp.id,
        componentType: comp.type,
      });
      if (Array.isArray(comp.children)) {
        for (const cid of comp.children) visit(cid);
      }
    };
    for (const cid of page.componentIds) visit(cid);
  }

  return targets;
}

// ============================================================================
// Pure-TS Syntax Highlighter Tokenizer (Zero dangerouslySetInnerHTML)
// ============================================================================

export function tokenizeCssForHighlight(code: string): CodeHighlightToken[] {
  const tokens: CodeHighlightToken[] = [];
  let i = 0;
  let inBlock = false;
  let expectingValue = false;

  while (i < code.length) {
    const ch = code[i];

    // Comments
    if (ch === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? code.length : end + 2;
      tokens.push({ type: 'comment', text: code.slice(i, stop) });
      i = stop;
      continue;
    }

    // Strings
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < code.length && (code[j] !== ch || code[j - 1] === '\\')) j++;
      if (j < code.length) j++;
      tokens.push({ type: 'string', text: code.slice(i, j) });
      i = j;
      continue;
    }

    // Braces / punctuation
    if (ch === '{') {
      tokens.push({ type: 'punctuation', text: ch });
      inBlock = true;
      expectingValue = false;
      i++;
      continue;
    }
    if (ch === '}') {
      tokens.push({ type: 'punctuation', text: ch });
      inBlock = false;
      expectingValue = false;
      i++;
      continue;
    }
    if (ch === ':') {
      tokens.push({ type: 'punctuation', text: ch });
      if (inBlock) expectingValue = true;
      i++;
      continue;
    }
    if (ch === ';') {
      tokens.push({ type: 'punctuation', text: ch });
      expectingValue = false;
      i++;
      continue;
    }

    // At-rules
    if (ch === '@') {
      let j = i + 1;
      while (j < code.length && /[a-zA-Z0-9-]/.test(code[j])) j++;
      tokens.push({ type: 'atrule', text: code.slice(i, j) });
      i = j;
      continue;
    }

    // Whitespace
    if (/\s/.test(ch)) {
      let j = i + 1;
      while (j < code.length && /\s/.test(code[j])) j++;
      tokens.push({ type: 'plain', text: code.slice(i, j) });
      i = j;
      continue;
    }

    // Inside declaration value: highlight numbers/colors/functions
    if (inBlock && expectingValue) {
      if (ch === '#' && /[0-9a-fA-F]{3,8}/.test(code.slice(i + 1, i + 9))) {
        const m = code.slice(i).match(/^#[0-9a-fA-F]{3,8}/);
        if (m) {
          tokens.push({ type: 'number', text: m[0] });
          i += m[0].length;
          continue;
        }
      }
      const numMatch = code.slice(i).match(/^-?\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|ms|s|deg)?/);
      if (numMatch) {
        tokens.push({ type: 'number', text: numMatch[0] });
        i += numMatch[0].length;
        continue;
      }
      let j = i + 1;
      while (j < code.length && !/[\s;{}'"/#]/.test(code[j])) j++;
      tokens.push({ type: 'value', text: code.slice(i, j) });
      i = j;
      continue;
    }

    // Inside block: property name
    if (inBlock && !expectingValue) {
      let j = i + 1;
      while (j < code.length && !/[\s:;{}]/.test(code[j])) j++;
      tokens.push({ type: 'property', text: code.slice(i, j) });
      i = j;
      continue;
    }

    // Outside block: selector
    let j = i + 1;
    while (j < code.length && !/[{};'"/@]/.test(code[j]) && !/\n/.test(code[j])) j++;
    tokens.push({ type: 'selector', text: code.slice(i, j) });
    i = j;
  }

  return tokens;
}

export const CSS_EXAMPLE_SNIPPETS: {
  id: string;
  title: string;
  description: string;
  code: string;
}[] = [
  {
    id: 'snip_elevated_card',
    title: 'Editorial Elevated Card',
    description: 'Crisp border, generous padding, and soft depth on the form card.',
    code: `.fs-card {\n  border: 1px solid rgba(11, 13, 15, 0.12);\n  box-shadow: 0 24px 60px rgba(11, 13, 15, 0.08);\n}\n\n.fs-form-title {\n  letter-spacing: -0.03em;\n}`,
  },
  {
    id: 'snip_focus_ring',
    title: 'Refined Input Focus States',
    description: 'High-contrast focus ring and subtle lift on form inputs.',
    code: `.fs-field input,\n.fs-field textarea,\n.fs-field select {\n  transition: border-color 150ms ease, box-shadow 150ms ease;\n}\n\n.fs-field input:focus,\n.fs-field textarea:focus,\n.fs-field select:focus {\n  border-color: #0F766E;\n  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.16);\n}`,
  },
  {
    id: 'snip_responsive',
    title: 'Responsive Tablet & Mobile Rules',
    description: 'Tightens card spacing and button width automatically on smaller viewports.',
    code: `@media (max-width: 768px) {\n  .fs-card {\n    padding: 20px;\n  }\n}\n\n@media (max-width: 480px) {\n  .fs-form-title {\n    font-size: 1.35rem;\n  }\n  .fs-submit-btn {\n    width: 100%;\n    justify-content: center;\n  }\n}`,
  },
  {
    id: 'snip_progress_pill',
    title: 'Gradient Progress Bar',
    description: 'Adds a smooth two-tone gradient across the progress indicator.',
    code: `.fs-progress-fill {\n  background: linear-gradient(90deg, #0F766E 0%, #0D9488 100%);\n  border-radius: 999px;\n}`,
  },
];
