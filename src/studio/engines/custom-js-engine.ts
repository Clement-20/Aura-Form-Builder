/**
 * FlexStore Form Studio — Isolated Custom JavaScript Sandbox Engine (Phase 3.1)
 *
 * Pure TypeScript core for static JS validation, opaque-origin iframe `srcDoc` generation,
 * strict `postMessage` envelope validation, and execution bounds.
 *
 * Security Architecture:
 *  1. Zero main-thread execution: Custom scripts NEVER run inside the FlexStore app window.
 *  2. Opaque-origin sandbox: `<iframe sandbox="allow-scripts">` (NO `allow-same-origin`,
 *     NO `allow-top-navigation`, NO `allow-popups`, NO `allow-forms`, NO `allow-modals`).
 *     The browser enforces an opaque `null` origin where `document.cookie`, `localStorage`,
 *     `sessionStorage`, `indexedDB`, and `window.parent.document` are inaccessible.
 *  3. Strict Content Security Policy inside the sandbox:
 *     `default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; img-src 'none';
 *      frame-src 'none'; form-action 'none'; base-uri 'none';`
 *     Prevents network exfiltration via fetch, XHR, WebSockets, beacons, or dynamic image loads.
 *  4. Minimal frozen API (`flexstore`):
 *     - `flexstore.on('load' | 'change' | 'pageChange', handler)`
 *     - `flexstore.showNotice(message, tone?)` (plain-text UI notice)
 *     - `flexstore.setFieldHint(fieldId, text)` (plain-text helper hint)
 *     - `flexstore.setFieldValue(fieldId, value)` (prefill visible field; never bypasses validation)
 *     - `flexstore.log(message)` (creator-only diagnostic log)
 *  5. Per-session channel token + strict message schema validation + rate limiting + watchdog timeout.
 */

import { CodeHighlightToken } from './custom-css-engine';

export const MAX_CUSTOM_JS_LENGTH = 20_000;
export const DEFAULT_JS_TIMEOUT_MS = 250;
export const MIN_JS_TIMEOUT_MS = 50;
export const MAX_JS_TIMEOUT_MS = 1000;
export const MAX_SANDBOX_MESSAGES_PER_SECOND = 25;
export const MAX_NOTICE_LENGTH = 240;
export const MAX_HINT_LENGTH = 200;

export const SANDBOX_IFRAME_ATTRS = 'allow-scripts' as const;

export const SANDBOX_CSP_POLICY =
  "default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; media-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none';";

export interface JsDiagnostic {
  severity: 'error' | 'warning';
  code:
    | 'JS_TOO_LARGE'
    | 'FORBIDDEN_API'
    | 'SYNTAX_IMBALANCE'
    | 'NETWORK_BLOCKED'
    | 'STORAGE_BLOCKED'
    | 'PARENT_ACCESS_BLOCKED';
  line: number;
  message: string;
}

export interface JsValidationResult {
  valid: boolean;
  errors: JsDiagnostic[];
  warnings: JsDiagnostic[];
}

export type SandboxInboundMessage =
  | { channelToken: string; type: 'ready' }
  | { channelToken: string; type: 'ack'; requestId: string }
  | {
      channelToken: string;
      type: 'notice';
      message: string;
      tone: 'info' | 'success' | 'warning';
    }
  | {
      channelToken: string;
      type: 'hint';
      fieldId: string;
      text: string;
    }
  | {
      channelToken: string;
      type: 'set_value';
      fieldId: string;
      value: string | number | boolean;
    }
  | {
      channelToken: string;
      type: 'log';
      message: string;
    }
  | {
      channelToken: string;
      type: 'error';
      message: string;
    };

// ============================================================================
// Static Pre-Flight JS Validator
// ============================================================================

const FORBIDDEN_PATTERNS: Array<{
  regex: RegExp;
  code: JsDiagnostic['code'];
  severity: 'error' | 'warning';
  message: string;
}> = [
  {
    regex: /\bdocument\s*\.\s*cookie\b/,
    code: 'STORAGE_BLOCKED',
    severity: 'error',
    message: 'Access to `document.cookie` is blocked in the form script sandbox.',
  },
  {
    regex: /\b(?:localStorage|sessionStorage|indexedDB)\b/,
    code: 'STORAGE_BLOCKED',
    severity: 'error',
    message: 'Browser storage (`localStorage`, `sessionStorage`, `indexedDB`) is blocked in the sandbox.',
  },
  {
    regex: /\b(?:window\s*\.\s*)?(?:parent|top|opener)\b/,
    code: 'PARENT_ACCESS_BLOCKED',
    severity: 'error',
    message: 'Direct access to `parent`, `top`, or `opener` windows is blocked. Use the `flexstore` API.',
  },
  {
    regex: /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts)\b/,
    code: 'NETWORK_BLOCKED',
    severity: 'error',
    message: 'Outbound network calls (`fetch`, `XMLHttpRequest`, `WebSocket`) are blocked to prevent data exfiltration.',
  },
  {
    regex: /\bnavigator\s*\.\s*sendBeacon\b/,
    code: 'NETWORK_BLOCKED',
    severity: 'error',
    message: '`navigator.sendBeacon` is blocked to prevent data exfiltration.',
  },
  {
    regex: /\b(?:eval\s*\(|new\s+Function\b)/,
    code: 'FORBIDDEN_API',
    severity: 'error',
    message: 'Dynamic code evaluation (`eval`, `new Function`) is prohibited.',
  },
  {
    regex: /<\s*\/\s*script\b/i,
    code: 'FORBIDDEN_API',
    severity: 'error',
    message: 'Closing `</script>` tags are not permitted inside custom scripts.',
  },
];

function getLineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

/**
 * Strips comments and string literals so bracket-balance checks don't false-positive on strings.
 */
function checkBalancedDelimiters(code: string, errors: JsDiagnostic[]): void {
  const stack: Array<{ ch: string; line: number }> = [];
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  let i = 0;
  let quote: '"' | "'" | '`' | null = null;

  while (i < code.length) {
    const ch = code[i];
    if (quote) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '/' && code[i + 1] === '/') {
      const nl = code.indexOf('\n', i + 2);
      i = nl === -1 ? code.length : nl + 1;
      continue;
    }
    if (ch === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      if (end === -1) {
        errors.push({
          severity: 'error',
          code: 'SYNTAX_IMBALANCE',
          line: getLineAt(code, i),
          message: 'Unclosed block comment (`/* ... */`).',
        });
        return;
      }
      i = end + 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      i++;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      stack.push({ ch, line: getLineAt(code, i) });
    } else if (ch === ')' || ch === ']' || ch === '}') {
      const top = stack.pop();
      if (!top || top.ch !== pairs[ch]) {
        errors.push({
          severity: 'error',
          code: 'SYNTAX_IMBALANCE',
          line: getLineAt(code, i),
          message: `Unmatched closing \`${ch}\`.`,
        });
        return;
      }
    }
    i++;
  }

  if (quote) {
    errors.push({
      severity: 'error',
      code: 'SYNTAX_IMBALANCE',
      line: getLineAt(code, code.length),
      message: `Unclosed string literal (${quote}).`,
    });
  }

  if (stack.length > 0) {
    const unclosed = stack[stack.length - 1];
    errors.push({
      severity: 'error',
      code: 'SYNTAX_IMBALANCE',
      line: unclosed.line,
      message: `Unclosed \`${unclosed.ch}\` opened on line ${unclosed.line}.`,
    });
  }
}

export function validateCustomJs(rawCode: string): JsValidationResult {
  const errors: JsDiagnostic[] = [];
  const warnings: JsDiagnostic[] = [];

  if (!rawCode || !rawCode.trim()) {
    return { valid: true, errors, warnings };
  }

  if (rawCode.length > MAX_CUSTOM_JS_LENGTH) {
    errors.push({
      severity: 'error',
      code: 'JS_TOO_LARGE',
      line: 1,
      message: `Custom JavaScript exceeds the ${Math.round(
        MAX_CUSTOM_JS_LENGTH / 1000
      )} KB limit.`,
    });
    return { valid: false, errors, warnings };
  }

  for (const rule of FORBIDDEN_PATTERNS) {
    const match = rule.regex.exec(rawCode);
    if (match) {
      const diagnostic: JsDiagnostic = {
        severity: rule.severity,
        code: rule.code,
        line: getLineAt(rawCode, match.index),
        message: rule.message,
      };
      if (rule.severity === 'error') errors.push(diagnostic);
      else warnings.push(diagnostic);
    }
  }

  checkBalancedDelimiters(rawCode, errors);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Message Envelope Validator (Parent <- Sandbox)
// ============================================================================

export function sanitizeRuntimeErrorMessage(raw: unknown): string {
  const str = typeof raw === 'string' ? raw : 'Script execution error.';
  return str
    .replace(/https?:\/\/[^\s)]+/gi, '[redacted-url]')
    .replace(/(?:Bearer|token|key|secret|password)\s*[:=]\s*\S+/gi, '[redacted]')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, 220);
}

export function validateSandboxMessage(
  rawData: unknown,
  expectedChannelToken: string,
  allowedFieldIds: Set<string>
): SandboxInboundMessage | null {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) return null;
  const msg = rawData as Record<string, unknown>;

  if (typeof msg.channelToken !== 'string' || msg.channelToken !== expectedChannelToken) {
    return null;
  }

  const type = msg.type;
  if (type === 'ready') {
    return { channelToken: expectedChannelToken, type: 'ready' };
  }

  if (type === 'ack' && typeof msg.requestId === 'string' && msg.requestId.length <= 64) {
    return { channelToken: expectedChannelToken, type: 'ack', requestId: msg.requestId };
  }

  if (type === 'notice' && typeof msg.message === 'string') {
    const clean = msg.message.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, MAX_NOTICE_LENGTH);
    if (!clean) return null;
    const tone =
      msg.tone === 'success' || msg.tone === 'warning' || msg.tone === 'info'
        ? msg.tone
        : 'info';
    return { channelToken: expectedChannelToken, type: 'notice', message: clean, tone };
  }

  if (
    type === 'hint' &&
    typeof msg.fieldId === 'string' &&
    allowedFieldIds.has(msg.fieldId) &&
    typeof msg.text === 'string'
  ) {
    const clean = msg.text.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, MAX_HINT_LENGTH);
    return { channelToken: expectedChannelToken, type: 'hint', fieldId: msg.fieldId, text: clean };
  }

  if (
    type === 'set_value' &&
    typeof msg.fieldId === 'string' &&
    allowedFieldIds.has(msg.fieldId)
  ) {
    const v = msg.value;
    if (typeof v === 'string') {
      return {
        channelToken: expectedChannelToken,
        type: 'set_value',
        fieldId: msg.fieldId,
        value: v.slice(0, 2000),
      };
    }
    if ((typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean') {
      return {
        channelToken: expectedChannelToken,
        type: 'set_value',
        fieldId: msg.fieldId,
        value: v,
      };
    }
    return null;
  }

  if (type === 'log' && typeof msg.message === 'string') {
    return {
      channelToken: expectedChannelToken,
      type: 'log',
      message: sanitizeRuntimeErrorMessage(msg.message),
    };
  }

  if (type === 'error' && typeof msg.message === 'string') {
    return {
      channelToken: expectedChannelToken,
      type: 'error',
      message: sanitizeRuntimeErrorMessage(msg.message),
    };
  }

  return null;
}

// ============================================================================
// Sandboxed Iframe srcDoc Builder
// ============================================================================

export function buildSandboxSrcDoc(userCode: string, channelToken: string): string {
  const safeTokenJson = JSON.stringify(channelToken);
  // Escape closing script tags defensively even after validation
  const safeUserCode = userCode.replace(/<\s*\/\s*script/gi, '<\\/script');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP_POLICY}" />
</head>
<body>
<script>
(function() {
  "use strict";
  var TOKEN = ${safeTokenJson};
  var parentWin = window.parent;
  var handlers = { load: [], change: [], pageChange: [] };
  var sentCount = 0;
  var windowStart = Date.now();

  function post(payload) {
    var now = Date.now();
    if (now - windowStart > 1000) {
      windowStart = now;
      sentCount = 0;
    }
    if (sentCount >= ${MAX_SANDBOX_MESSAGES_PER_SECOND}) return;
    sentCount++;
    payload.channelToken = TOKEN;
    parentWin.postMessage(payload, '*');
  }

  // Harden runtime globals against network or navigation attempts
  try {
    var blockedFn = function() { throw new Error('Network access is disabled in the form script sandbox.'); };
    Object.defineProperty(window, 'fetch', { value: blockedFn, writable: false, configurable: false });
    Object.defineProperty(window, 'XMLHttpRequest', { value: blockedFn, writable: false, configurable: false });
    Object.defineProperty(window, 'WebSocket', { value: blockedFn, writable: false, configurable: false });
    Object.defineProperty(window, 'EventSource', { value: blockedFn, writable: false, configurable: false });
    Object.defineProperty(window, 'open', { value: blockedFn, writable: false, configurable: false });
  } catch (e) {}

  var flexstore = Object.freeze({
    on: function(eventName, fn) {
      if (typeof fn !== 'function') return;
      if (handlers[eventName] && handlers[eventName].length < 10) {
        handlers[eventName].push(fn);
      }
    },
    showNotice: function(message, tone) {
      post({ type: 'notice', message: String(message || ''), tone: tone || 'info' });
    },
    setFieldHint: function(fieldId, text) {
      post({ type: 'hint', fieldId: String(fieldId || ''), text: String(text || '') });
    },
    setFieldValue: function(fieldId, value) {
      post({ type: 'set_value', fieldId: String(fieldId || ''), value: value });
    },
    log: function(message) {
      post({ type: 'log', message: String(message || '') });
    }
  });

  window.addEventListener('message', function(ev) {
    var data = ev.data;
    if (!data || data.channelToken !== TOKEN || data.type !== 'dispatch') return;
    var eventName = data.eventName;
    var list = handlers[eventName] || [];
    for (var i = 0; i < list.length; i++) {
      try {
        list[i](Object.freeze(data.payload || {}));
      } catch (err) {
        post({ type: 'error', message: (err && err.message) ? String(err.message) : 'Handler error' });
      }
    }
    post({ type: 'ack', requestId: String(data.requestId || '') });
  });

  try {
    (function(flexstore) {
${safeUserCode}
    })(flexstore);
    post({ type: 'ready' });
  } catch (err) {
    post({ type: 'error', message: (err && err.message) ? String(err.message) : 'Script initialization error' });
  }
})();
</script>
</body>
</html>`;
}

// ============================================================================
// JS Syntax Highlighter & Example Snippets
// ============================================================================

const JS_KEYWORDS = new Set([
  'const',
  'let',
  'var',
  'function',
  'return',
  'if',
  'else',
  'for',
  'while',
  'switch',
  'case',
  'break',
  'continue',
  'try',
  'catch',
  'throw',
  'new',
  'typeof',
  'true',
  'false',
  'null',
  'undefined',
]);

export function tokenizeJsForHighlight(code: string): CodeHighlightToken[] {
  const tokens: CodeHighlightToken[] = [];
  let i = 0;

  while (i < code.length) {
    const ch = code[i];

    if (ch === '/' && code[i + 1] === '/') {
      const nl = code.indexOf('\n', i + 2);
      const stop = nl === -1 ? code.length : nl;
      tokens.push({ type: 'comment', text: code.slice(i, stop) });
      i = stop;
      continue;
    }

    if (ch === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? code.length : end + 2;
      tokens.push({ type: 'comment', text: code.slice(i, stop) });
      i = stop;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === '\\') {
          j += 2;
          continue;
        }
        if (code[j] === ch) {
          j++;
          break;
        }
        j++;
      }
      tokens.push({ type: 'string', text: code.slice(i, j) });
      i = j;
      continue;
    }

    if (/\d/.test(ch)) {
      const m = code.slice(i).match(/^\d+(?:\.\d+)?/);
      if (m) {
        tokens.push({ type: 'number', text: m[0] });
        i += m[0].length;
        continue;
      }
    }

    if (/[a-zA-Z_$]/.test(ch)) {
      let j = i + 1;
      while (j < code.length && /[a-zA-Z0-9_$]/.test(code[j])) j++;
      const word = code.slice(i, j);
      if (JS_KEYWORDS.has(word)) {
        tokens.push({ type: 'keyword', text: word });
      } else if (word === 'flexstore') {
        tokens.push({ type: 'function', text: word });
      } else {
        tokens.push({ type: 'plain', text: word });
      }
      i = j;
      continue;
    }

    if (/[{}()[\].,:;+-=*/<>!&|?]/.test(ch)) {
      tokens.push({ type: 'punctuation', text: ch });
      i++;
      continue;
    }

    let j = i + 1;
    while (j < code.length && /\s/.test(code[j])) j++;
    tokens.push({ type: 'plain', text: code.slice(i, j) });
    i = j;
  }

  return tokens;
}

export const JS_EXAMPLE_SNIPPETS: {
  id: string;
  title: string;
  description: string;
  code: string;
}[] = [
  {
    id: 'js_welcome_notice',
    title: 'Show Welcome Guidance Banner',
    description: 'Displays a safe plain-text notice when the form loads.',
    code: `flexstore.on('load', function (ctx) {\n  flexstore.showNotice('All responses are reviewed within 24 hours.', 'info');\n  flexstore.log('Loaded form with ' + ctx.fieldCount + ' visible fields.');\n});`,
  },
  {
    id: 'js_dynamic_hint',
    title: 'Live Answer-Aware Helper Hint',
    description: 'Reacts to changes on any field and surfaces a tailored guidance hint.',
    code: `flexstore.on('change', function (ev) {\n  if (typeof ev.value === 'string' && ev.value.length > 80) {\n    flexstore.setFieldHint(ev.fieldId, 'Great detail — keep it concise for faster review.');\n  } else {\n    flexstore.setFieldHint(ev.fieldId, '');\n  }\n});`,
  },
  {
    id: 'js_page_tip',
    title: 'Multi-Page Progress Tip',
    description: 'Shows an encouraging note when respondents advance past Page 1.',
    code: `flexstore.on('pageChange', function (ev) {\n  if (ev.pageIndex > 1) {\n    flexstore.showNotice('You are on step ' + ev.pageIndex + ' — almost done!', 'success');\n  }\n});`,
  },
];
