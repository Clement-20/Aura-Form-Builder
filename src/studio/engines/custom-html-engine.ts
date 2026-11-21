/**
 * FlexStore Form Studio — Safe Custom HTML Sanitizer & React AST Renderer (Phase 3.1)
 *
 * Pure TypeScript HTML parser + strict allowlist sanitizer (zero DOM `innerHTML` parsing,
 * zero `dangerouslySetInnerHTML`, runs identically in Node tests, preview, and published forms).
 *
 * Security guarantees:
 *  - Only semantic, non-executable HTML elements are permitted.
 *  - Completely strips `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<svg>`, `<math>`,
 *    `<form>`, `<input>`, `<button>`, `<meta>`, `<link>`, `<base>` (and discards dangerous tag bodies).
 *  - Strips all `on*` event handler attributes and `srcdoc` / `formaction` / `xlink:href`.
 *  - Strictly validates `href` (`https:`, `http:`, `mailto:`, `tel:`, `#anchor`) and `img[src]`
 *    (`https:`, `http:`) — blocking `javascript:`, `vbscript:`, `data:`, and entity-obfuscated schemes.
 *  - Enforces `rel="noopener noreferrer"` on links and `referrerPolicy="no-referrer"` on images.
 *  - Sanitizes inline `style` attributes to a safe visual property allowlist (blocking `position: fixed`,
 *    `z-index`, `expression()`, `url()`, `behavior`).
 *  - Renders strictly as a React element tree via `renderSafeHtmlAst()` so malformed tags or XSS
 *    payloads can never execute or corrupt surrounding form layout.
 */

import React from 'react';
import { CodeHighlightToken } from './custom-css-engine';

export const MAX_CUSTOM_HTML_LENGTH = 30_000;

export interface HtmlDiagnostic {
  severity: 'error' | 'warning';
  code:
    | 'HTML_TOO_LARGE'
    | 'BLOCKED_TAG'
    | 'BLOCKED_ATTRIBUTE'
    | 'UNSAFE_URL'
    | 'UNSAFE_STYLE'
    | 'UNCLOSED_TAG';
  line: number;
  message: string;
}

export type SafeHtmlNode =
  | { kind: 'text'; text: string }
  | {
      kind: 'element';
      tag: string;
      attrs: Record<string, string>;
      style?: Record<string, string>;
      children: SafeHtmlNode[];
    };

export interface SanitizedHtmlResult {
  valid: boolean;
  /** True when dangerous constructs (scripts, event handlers, javascript: URLs) were stripped */
  hadSecurityStrips: boolean;
  nodes: SafeHtmlNode[];
  sanitizedHtml: string;
  errors: HtmlDiagnostic[];
  warnings: HtmlDiagnostic[];
}

// ============================================================================
// Strict Tag, Attribute & Style Allowlists
// ============================================================================

export const ALLOWED_HTML_TAGS = new Set<string>([
  'div',
  'section',
  'article',
  'aside',
  'header',
  'footer',
  'main',
  'nav',
  'p',
  'span',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'mark',
  'small',
  'sub',
  'sup',
  'blockquote',
  'q',
  'cite',
  'code',
  'pre',
  'kbd',
  'hr',
  'br',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'a',
  'img',
  'figure',
  'figcaption',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'details',
  'summary',
  'abbr',
  'time',
  'address',
]);

const VOID_HTML_TAGS = new Set<string>(['br', 'hr', 'img']);

/** Tags whose inner content must be completely dropped (not rendered as plain text) */
const DROP_CONTENT_TAGS = new Set<string>([
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'svg',
  'math',
  'noscript',
  'template',
  'head',
  'title',
  'textarea',
  'select',
  'option',
]);

const GLOBAL_ALLOWED_ATTRS = new Set<string>([
  'class',
  'id',
  'title',
  'lang',
  'dir',
  'role',
  'aria-label',
  'aria-hidden',
  'style',
]);

const TAG_SPECIFIC_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height']),
  th: new Set(['colspan', 'rowspan', 'scope']),
  td: new Set(['colspan', 'rowspan']),
  ol: new Set(['start', 'type']),
  details: new Set(['open']),
  time: new Set(['datetime']),
};

const ALLOWED_INLINE_STYLE_PROPS = new Set<string>([
  'color',
  'background-color',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-decoration',
  'text-transform',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-color',
  'border-width',
  'border-style',
  'border-radius',
  'display',
  'flex-direction',
  'align-items',
  'justify-content',
  'gap',
  'grid-template-columns',
  'max-width',
  'width',
  'opacity',
]);

const ALLOWED_ARIA_ROLES = new Set<string>([
  'note',
  'region',
  'status',
  'alert',
  'list',
  'listitem',
  'table',
  'separator',
  'presentation',
  'none',
]);

// ============================================================================
// Entity Decoding & URL Safety
// ============================================================================

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00A0',
  copy: '©',
  reg: '®',
  trade: '™',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  bull: '•',
  middot: '·',
  rarr: '→',
  larr: '←',
  check: '✓',
};

export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (full, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const cp = parseInt(entity.slice(2), 16);
      if (Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff) {
        return String.fromCodePoint(cp);
      }
      return '';
    }
    if (entity.startsWith('#')) {
      const cp = parseInt(entity.slice(1), 10);
      if (Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff) {
        return String.fromCodePoint(cp);
      }
      return '';
    }
    return NAMED_ENTITIES[entity] ?? full;
  });
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlAttr(val: string): string {
  return escapeHtmlText(val).replace(/"/g, '&quot;');
}

export function isSafeHtmlHref(rawUrl: string): boolean {
  const decoded = decodeHtmlEntities(rawUrl).trim();
  if (!decoded) return false;
  if (decoded.startsWith('#')) {
    return /^#[a-zA-Z0-9_-]{1,64}$/.test(decoded);
  }
  const compact = decoded.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
  if (
    compact.startsWith('javascript:') ||
    compact.startsWith('vbscript:') ||
    compact.startsWith('data:') ||
    compact.startsWith('file:') ||
    compact.startsWith('blob:')
  ) {
    return false;
  }
  return (
    compact.startsWith('https://') ||
    compact.startsWith('http://') ||
    compact.startsWith('mailto:') ||
    compact.startsWith('tel:')
  );
}

export function isSafeHtmlImageSrc(rawUrl: string): boolean {
  const decoded = decodeHtmlEntities(rawUrl).trim();
  if (!decoded) return false;
  const compact = decoded.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
  if (
    compact.startsWith('javascript:') ||
    compact.startsWith('vbscript:') ||
    compact.startsWith('data:') ||
    compact.startsWith('file:') ||
    compact.startsWith('blob:')
  ) {
    return false;
  }
  return compact.startsWith('https://') || compact.startsWith('http://');
}

function sanitizeInlineStyleAttr(
  rawStyle: string,
  line: number,
  warnings: HtmlDiagnostic[]
): Record<string, string> | undefined {
  const decoded = decodeHtmlEntities(rawStyle);
  const result: Record<string, string> = {};
  const parts = decoded.split(';');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    const prop = trimmed.slice(0, idx).trim().toLowerCase();
    const val = trimmed.slice(idx + 1).trim();
    if (!ALLOWED_INLINE_STYLE_PROPS.has(prop)) {
      warnings.push({
        severity: 'warning',
        code: 'UNSAFE_STYLE',
        line,
        message: `Inline style property "${prop}" was removed for layout & security isolation.`,
      });
      continue;
    }
    const valLower = val.toLowerCase();
    if (
      /expression\s*\(|url\s*\(|javascript\s*:|behavior\s*:|-moz-binding|@import/i.test(valLower)
    ) {
      warnings.push({
        severity: 'warning',
        code: 'UNSAFE_STYLE',
        line,
        message: `Unsafe inline style value in "${prop}" was removed.`,
      });
      continue;
    }
    if (prop === 'display' && !/^(block|inline|inline-block|flex|inline-flex|grid|none)$/.test(valLower)) {
      continue;
    }
    result[prop] = val;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

// ============================================================================
// Pure-TS HTML Tokenizer & Allowlist AST Sanitizer
// ============================================================================

function getLineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

function parseRawAttributes(attrStr: string): Array<{ name: string; value: string }> {
  const attrs: Array<{ name: string; value: string }> = [];
  let i = 0;
  const len = attrStr.length;

  while (i < len) {
    while (i < len && /[\s/]/.test(attrStr[i])) i++;
    if (i >= len) break;

    let name = '';
    while (i < len && !/[\s=/>]/.test(attrStr[i])) {
      name += attrStr[i];
      i++;
    }
    if (!name) {
      i++;
      continue;
    }

    while (i < len && /\s/.test(attrStr[i])) i++;

    let value = '';
    if (i < len && attrStr[i] === '=') {
      i++;
      while (i < len && /\s/.test(attrStr[i])) i++;
      if (i < len && (attrStr[i] === '"' || attrStr[i] === "'")) {
        const quote = attrStr[i++];
        const start = i;
        while (i < len && attrStr[i] !== quote) i++;
        value = attrStr.slice(start, i);
        if (i < len && attrStr[i] === quote) i++;
      } else {
        const start = i;
        while (i < len && !/[\s>]/.test(attrStr[i])) i++;
        value = attrStr.slice(start, i);
      }
    }

    attrs.push({ name: name.toLowerCase(), value });
  }

  return attrs;
}

function serializeAstNodes(nodes: SafeHtmlNode[]): string {
  return nodes
    .map((node) => {
      if (node.kind === 'text') {
        return escapeHtmlText(node.text);
      }
      const attrParts: string[] = [];
      for (const [k, v] of Object.entries(node.attrs)) {
        attrParts.push(`${k}="${escapeHtmlAttr(v)}"`);
      }
      if (node.style && Object.keys(node.style).length > 0) {
        const styleStr = Object.entries(node.style)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ');
        attrParts.push(`style="${escapeHtmlAttr(styleStr)}"`);
      }
      const openTag = attrParts.length > 0 ? `<${node.tag} ${attrParts.join(' ')}>` : `<${node.tag}>`;
      if (VOID_HTML_TAGS.has(node.tag)) {
        return openTag;
      }
      return `${openTag}${serializeAstNodes(node.children)}</${node.tag}>`;
    })
    .join('');
}

export function sanitizeCustomHtml(rawHtml: string): SanitizedHtmlResult {
  const errors: HtmlDiagnostic[] = [];
  const warnings: HtmlDiagnostic[] = [];
  let hadSecurityStrips = false;

  if (!rawHtml || !rawHtml.trim()) {
    return {
      valid: true,
      hadSecurityStrips: false,
      nodes: [],
      sanitizedHtml: '',
      errors,
      warnings,
    };
  }

  if (rawHtml.length > MAX_CUSTOM_HTML_LENGTH) {
    errors.push({
      severity: 'error',
      code: 'HTML_TOO_LARGE',
      line: 1,
      message: `Custom HTML exceeds the ${Math.round(MAX_CUSTOM_HTML_LENGTH / 1000)} KB limit.`,
    });
    return {
      valid: false,
      hadSecurityStrips: false,
      nodes: [],
      sanitizedHtml: '',
      errors,
      warnings,
    };
  }

  const root: { tag: string; children: SafeHtmlNode[] } = { tag: '__root__', children: [] };
  const stack: Array<{ tag: string; children: SafeHtmlNode[] }> = [root];

  let i = 0;
  const len = rawHtml.length;

  while (i < len) {
    const nextLt = rawHtml.indexOf('<', i);
    if (nextLt === -1) {
      const text = decodeHtmlEntities(rawHtml.slice(i));
      if (text) stack[stack.length - 1].children.push({ kind: 'text', text });
      break;
    }

    if (nextLt > i) {
      const text = decodeHtmlEntities(rawHtml.slice(i, nextLt));
      if (text) stack[stack.length - 1].children.push({ kind: 'text', text });
    }

    const line = getLineAt(rawHtml, nextLt);

    // HTML comment `<!-- ... -->` -> strip quietly
    if (rawHtml.startsWith('<!--', nextLt)) {
      const commentEnd = rawHtml.indexOf('-->', nextLt + 4);
      i = commentEnd === -1 ? len : commentEnd + 3;
      continue;
    }

    // Doctype / CDATA / processing instruction -> strip
    if (rawHtml.startsWith('<!', nextLt) || rawHtml.startsWith('<?', nextLt)) {
      const gt = rawHtml.indexOf('>', nextLt + 2);
      i = gt === -1 ? len : gt + 1;
      continue;
    }

    // Find closing `>` respecting quoted attributes
    let gt = nextLt + 1;
    let quote: '"' | "'" | null = null;
    while (gt < len) {
      const ch = rawHtml[gt];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        break;
      }
      gt++;
    }

    if (gt >= len) {
      // Unclosed `<`, treat remainder as plain text
      const text = decodeHtmlEntities(rawHtml.slice(nextLt));
      if (text) stack[stack.length - 1].children.push({ kind: 'text', text });
      break;
    }

    const tagContent = rawHtml.slice(nextLt + 1, gt).trim();
    i = gt + 1;

    if (!tagContent) continue;

    // Closing tag `</tag>`
    if (tagContent.startsWith('/')) {
      const closeName = tagContent.slice(1).trim().toLowerCase().split(/\s+/)[0];
      // Pop up to matching tag on stack (if present)
      for (let s = stack.length - 1; s >= 1; s--) {
        if (stack[s].tag === closeName) {
          stack.length = s;
          break;
        }
      }
      continue;
    }

    const selfClosing = tagContent.endsWith('/');
    const cleanContent = selfClosing ? tagContent.slice(0, -1).trim() : tagContent;
    const nameMatch = cleanContent.match(/^([a-zA-Z][a-zA-Z0-9:-]*)/);
    if (!nameMatch) continue;

    const tagName = nameMatch[1].toLowerCase();
    const attrSlice = cleanContent.slice(nameMatch[0].length);

    // Blocked dangerous tags whose inner content must be discarded completely
    if (DROP_CONTENT_TAGS.has(tagName)) {
      hadSecurityStrips = true;
      warnings.push({
        severity: 'warning',
        code: 'BLOCKED_TAG',
        line,
        message: `<${tagName}> elements are blocked for security and were removed.`,
      });
      if (!selfClosing) {
        const closeRe = new RegExp(`<\\s*/\\s*${tagName}\\s*>`, 'i');
        const rest = rawHtml.slice(i);
        const closeMatch = closeRe.exec(rest);
        if (closeMatch) {
          i += closeMatch.index + closeMatch[0].length;
        } else {
          // Drop remaining unclosed script/style content
          i = len;
        }
      }
      continue;
    }

    // Disallowed non-semantic tags (e.g. <form>, <input>, <button>, <meta>, <link>, <base>)
    if (!ALLOWED_HTML_TAGS.has(tagName)) {
      hadSecurityStrips = true;
      warnings.push({
        severity: 'warning',
        code: 'BLOCKED_TAG',
        line,
        message: `<${tagName}> is not allowed inside Custom HTML blocks and was stripped.`,
      });
      continue;
    }

    // Sanitize attributes against strict allowlist
    const rawAttrs = parseRawAttributes(attrSlice);
    const safeAttrs: Record<string, string> = {};
    let safeStyle: Record<string, string> | undefined;
    const tagAllowed = TAG_SPECIFIC_ATTRS[tagName];

    for (const { name, value } of rawAttrs) {
      if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction') {
        hadSecurityStrips = true;
        warnings.push({
          severity: 'warning',
          code: 'BLOCKED_ATTRIBUTE',
          line,
          message: `Event handler or unsafe attribute "${name}" on <${tagName}> was removed.`,
        });
        continue;
      }

      const isDataFs = /^data-fs-[a-z0-9-]+$/.test(name);
      if (!GLOBAL_ALLOWED_ATTRS.has(name) && !tagAllowed?.has(name) && !isDataFs) {
        warnings.push({
          severity: 'warning',
          code: 'BLOCKED_ATTRIBUTE',
          line,
          message: `Attribute "${name}" on <${tagName}> is not supported and was removed.`,
        });
        continue;
      }

      const decodedVal = decodeHtmlEntities(value).trim();

      if (name === 'style') {
        safeStyle = sanitizeInlineStyleAttr(value, line, warnings);
        continue;
      }

      if (name === 'href') {
        if (!isSafeHtmlHref(value)) {
          hadSecurityStrips = true;
          warnings.push({
            severity: 'warning',
            code: 'UNSAFE_URL',
            line,
            message: `Blocked unsafe link URL on <a>. Only https://, http://, mailto:, tel:, and #anchors are allowed.`,
          });
          continue;
        }
        safeAttrs.href = decodedVal;
        continue;
      }

      if (name === 'src') {
        if (!isSafeHtmlImageSrc(value)) {
          hadSecurityStrips = true;
          warnings.push({
            severity: 'warning',
            code: 'UNSAFE_URL',
            line,
            message: `Blocked unsafe image source on <img>. Only https:// and http:// URLs are allowed.`,
          });
          continue;
        }
        safeAttrs.src = decodedVal;
        continue;
      }

      if (name === 'class') {
        const cleanClasses = decodedVal
          .split(/\s+/)
          .filter((c) => /^[a-zA-Z_-][a-zA-Z0-9_-]{0,48}$/.test(c))
          .join(' ');
        if (cleanClasses) safeAttrs.class = cleanClasses;
        continue;
      }

      if (name === 'id') {
        const cleanId = decodedVal.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
        if (cleanId) {
          safeAttrs.id = cleanId.startsWith('fs-html-') ? cleanId : `fs-html-${cleanId}`;
        }
        continue;
      }

      if (name === 'role') {
        if (ALLOWED_ARIA_ROLES.has(decodedVal.toLowerCase())) {
          safeAttrs.role = decodedVal.toLowerCase();
        }
        continue;
      }

      if (name === 'target') {
        if (decodedVal === '_blank' || decodedVal === '_self') {
          safeAttrs.target = decodedVal;
        }
        continue;
      }

      if (name === 'rel') {
        // Always overwritten safely below for links
        continue;
      }

      if (name === 'width' || name === 'height' || name === 'colspan' || name === 'rowspan' || name === 'start') {
        if (/^\d{1,4}$/.test(decodedVal)) {
          safeAttrs[name] = decodedVal;
        }
        continue;
      }

      safeAttrs[name] = decodedVal;
    }

    // Security hardening on links and images
    if (tagName === 'a' && safeAttrs.href) {
      if (safeAttrs.href.startsWith('http://') || safeAttrs.href.startsWith('https://')) {
        safeAttrs.target = '_blank';
        safeAttrs.rel = 'noopener noreferrer';
      } else {
        safeAttrs.rel = 'noopener noreferrer';
      }
    }

    if (tagName === 'img') {
      if (!safeAttrs.alt) safeAttrs.alt = '';
      safeAttrs.loading = 'lazy';
      safeAttrs.referrerpolicy = 'no-referrer';
    }

    const elementNode: Extract<SafeHtmlNode, { kind: 'element' }> = {
      kind: 'element',
      tag: tagName,
      attrs: safeAttrs,
      ...(safeStyle ? { style: safeStyle } : {}),
      children: [],
    };

    stack[stack.length - 1].children.push(elementNode);

    if (!selfClosing && !VOID_HTML_TAGS.has(tagName)) {
      stack.push(elementNode);
    }
  }

  return {
    valid: errors.length === 0,
    hadSecurityStrips,
    nodes: root.children,
    sanitizedHtml: serializeAstNodes(root.children),
    errors,
    warnings,
  };
}

// ============================================================================
// React AST Renderer (Zero dangerouslySetInnerHTML)
// ============================================================================

function cssPropToCamel(prop: string): string {
  return prop.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

function toReactProps(
  node: Extract<SafeHtmlNode, { kind: 'element' }>,
  key: string
): Record<string, unknown> {
  const props: Record<string, unknown> = { key };
  for (const [k, v] of Object.entries(node.attrs)) {
    if (k === 'class') props.className = v;
    else if (k === 'colspan') props.colSpan = Number(v);
    else if (k === 'rowspan') props.rowSpan = Number(v);
    else if (k === 'referrerpolicy') props.referrerPolicy = v;
    else if (k === 'datetime') props.dateTime = v;
    else if (k === 'open') props.open = true;
    else props[k] = v;
  }

  if (node.style) {
    const reactStyle: Record<string, string> = {};
    for (const [k, v] of Object.entries(node.style)) {
      reactStyle[cssPropToCamel(k)] = v;
    }
    props.style = reactStyle;
  }

  return props;
}

export function renderSafeHtmlNodes(
  nodes: SafeHtmlNode[],
  transformText?: (text: string) => string,
  keyPrefix = 'h'
): React.ReactNode[] {
  return nodes.map((node, idx) => {
    const key = `${keyPrefix}_${idx}`;
    if (node.kind === 'text') {
      return transformText ? transformText(node.text) : node.text;
    }
    const props = toReactProps(node, key);
    if (VOID_HTML_TAGS.has(node.tag)) {
      return React.createElement(node.tag, props);
    }
    return React.createElement(
      node.tag,
      props,
      ...renderSafeHtmlNodes(node.children, transformText, key)
    );
  });
}

export const SafeHtmlContent: React.FC<{
  html: string;
  transformText?: (text: string) => string;
  className?: string;
}> = ({ html, transformText, className = '' }) => {
  const sanitized = React.useMemo(() => sanitizeCustomHtml(html), [html]);
  const elements = React.useMemo(
    () => renderSafeHtmlNodes(sanitized.nodes, transformText),
    [sanitized.nodes, transformText]
  );

  return React.createElement(
    'div',
    {
      className: `fs-custom-html relative isolate overflow-x-auto break-words max-w-full [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mb-1.5 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:pl-3.5 [&_blockquote]:italic [&_blockquote]:opacity-85 [&_table]:w-full [&_table]:border-collapse [&_th]:text-left [&_th]:p-2 [&_th]:border-b [&_td]:p-2 [&_td]:border-b [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_code]:font-mono [&_code]:text-[0.9em] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-black/[0.06] ${className}`,
    },
    elements
  );
};

// ============================================================================
// HTML Syntax Highlighter Tokenizer & Example Snippets
// ============================================================================

export function tokenizeHtmlForHighlight(code: string): CodeHighlightToken[] {
  const tokens: CodeHighlightToken[] = [];
  let i = 0;

  while (i < code.length) {
    if (code.startsWith('<!--', i)) {
      const end = code.indexOf('-->', i + 4);
      const stop = end === -1 ? code.length : end + 3;
      tokens.push({ type: 'comment', text: code.slice(i, stop) });
      i = stop;
      continue;
    }

    if (code[i] === '<') {
      const gt = code.indexOf('>', i + 1);
      const end = gt === -1 ? code.length : gt + 1;
      const chunk = code.slice(i, end);

      // Tokenize tag name and attributes inside `<...>`
      const tagMatch = chunk.match(/^(<\/?)([a-zA-Z0-9:-]+)([\s\S]*?)(\/?>)$/);
      if (tagMatch) {
        tokens.push({ type: 'punctuation', text: tagMatch[1] });
        tokens.push({ type: 'tag', text: tagMatch[2] });
        const rest = tagMatch[3];
        let k = 0;
        while (k < rest.length) {
          if (/\s/.test(rest[k])) {
            let s = k + 1;
            while (s < rest.length && /\s/.test(rest[s])) s++;
            tokens.push({ type: 'plain', text: rest.slice(k, s) });
            k = s;
            continue;
          }
          if (rest[k] === '"' || rest[k] === "'") {
            const q = rest[k];
            let s = k + 1;
            while (s < rest.length && rest[s] !== q) s++;
            if (s < rest.length) s++;
            tokens.push({ type: 'string', text: rest.slice(k, s) });
            k = s;
            continue;
          }
          if (rest[k] === '=') {
            tokens.push({ type: 'punctuation', text: '=' });
            k++;
            continue;
          }
          let s = k + 1;
          while (s < rest.length && !/[\s='"]/.test(rest[s])) s++;
          tokens.push({ type: 'attr', text: rest.slice(k, s) });
          k = s;
        }
        tokens.push({ type: 'punctuation', text: tagMatch[4] });
      } else {
        tokens.push({ type: 'tag', text: chunk });
      }
      i = end;
      continue;
    }

    const nextLt = code.indexOf('<', i);
    const stop = nextLt === -1 ? code.length : nextLt;
    tokens.push({ type: 'plain', text: code.slice(i, stop) });
    i = stop;
  }

  return tokens;
}

export const HTML_EXAMPLE_SNIPPETS: {
  id: string;
  title: string;
  description: string;
  html: string;
}[] = [
  {
    id: 'html_notice',
    title: 'Important Information Box',
    description: 'Clean callout block for policy notes, deadlines, or instructions.',
    html: `<section style="padding: 16px; border: 1px solid #d4d2cc; border-radius: 12px; background-color: #faf9f7;">\n  <h3>Before you begin</h3>\n  <p>Please have your <strong>reference number</strong> ready. Submissions are reviewed within 2 business days.</p>\n</section>`,
  },
  {
    id: 'html_table',
    title: 'Plan Comparison Table',
    description: 'Accessible semantic table comparing options or deadlines.',
    html: `<table>\n  <thead>\n    <tr>\n      <th scope="col">Tier</th>\n      <th scope="col">Turnaround</th>\n      <th scope="col">Included</th>\n    </tr>\n  </thead>\n  <tbody>\n    <tr>\n      <td><strong>Standard</strong></td>\n      <td>5 business days</td>\n      <td>Email summary</td>\n    </tr>\n    <tr>\n      <td><strong>Priority</strong></td>\n      <td>24 hours</td>\n      <td>Dedicated review call</td>\n    </tr>\n  </tbody>\n</table>`,
  },
  {
    id: 'html_faq',
    title: 'Expandable FAQ Accordion',
    description: 'Native accessible `<details>` disclosures with zero JavaScript required.',
    html: `<details style="padding: 12px 14px; border: 1px solid #e5e3dd; border-radius: 10px;">\n  <summary><strong>How will my data be used?</strong></summary>\n  <p style="margin-top: 8px;">Your response is used strictly to process this request and is never shared with third parties.</p>\n</details>`,
  },
];
