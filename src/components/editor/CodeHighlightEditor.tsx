/**
 * FlexStore Form Studio — Syntax-Highlighted Code Editor (Phase 3.1)
 *
 * Pure React tokenized highlight overlay + aligned textarea with tabular line numbers,
 * Tab/Shift+Tab indentation, optional code formatting, and inline error/warning diagnostics.
 * Never uses `dangerouslySetInnerHTML`.
 */

import React, { useMemo, useRef } from 'react';
import {
  CheckCircle,
  MagicWand,
  Warning,
  WarningCircle,
} from '@phosphor-icons/react';
import {
  tokenizeCssForHighlight,
  tokenizeHtmlForHighlight,
  tokenizeJsForHighlight,
} from '../../studio';

export interface CodeDiagnosticItem {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  line?: number;
}

export interface CodeHighlightEditorProps {
  language: 'css' | 'html' | 'js';
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: number;
  maxHeight?: number;
  diagnostics?: CodeDiagnosticItem[];
  onFormat?: () => void;
  label?: string;
  helperText?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  compact?: boolean;
}

const TOKEN_CLASSES: Record<string, string> = {
  comment: 'text-slate-400 italic',
  selector: 'text-teal-300',
  atrule: 'text-amber-300 font-semibold',
  property: 'text-sky-300',
  value: 'text-emerald-300',
  string: 'text-amber-200',
  number: 'text-violet-300',
  punctuation: 'text-slate-400',
  tag: 'text-teal-300 font-semibold',
  attr: 'text-sky-300',
  keyword: 'text-amber-300 font-semibold',
  function: 'text-emerald-300 font-semibold',
  plain: 'text-slate-100',
};

export const CodeHighlightEditor: React.FC<CodeHighlightEditorProps> = ({
  language,
  value,
  onChange,
  placeholder,
  disabled = false,
  minHeight = 220,
  maxHeight = 420,
  diagnostics = [],
  onFormat,
  label,
  helperText,
  textareaRef: externalRef,
  compact = false,
}) => {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const areaRef = externalRef || internalRef;
  const preRef = useRef<HTMLPreElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);

  const tokens = useMemo(() => {
    if (!value) return [];
    if (language === 'css') return tokenizeCssForHighlight(value);
    if (language === 'html') return tokenizeHtmlForHighlight(value);
    return tokenizeJsForHighlight(value);
  }, [language, value]);

  const lines = useMemo(() => {
    const count = Math.max(1, value.split('\n').length);
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [value]);

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  const syncScroll = () => {
    const el = areaRef.current;
    if (!el) return;
    if (preRef.current) {
      preRef.current.scrollTop = el.scrollTop;
      preRef.current.scrollLeft = el.scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = el.scrollTop;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab' && !disabled) {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;

      if (e.shiftKey) {
        // Outdent current line by up to 2 spaces
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        if (value.slice(lineStart, lineStart + 2) === '  ') {
          const next = value.slice(0, lineStart) + value.slice(lineStart + 2);
          onChange(next);
          requestAnimationFrame(() => {
            if (areaRef.current) {
              areaRef.current.selectionStart = Math.max(lineStart, start - 2);
              areaRef.current.selectionEnd = Math.max(lineStart, end - 2);
            }
          });
        }
        return;
      }

      const next = `${value.slice(0, start)}  ${value.slice(end)}`;
      onChange(next);
      requestAnimationFrame(() => {
        if (areaRef.current) {
          areaRef.current.selectionStart = start + 2;
          areaRef.current.selectionEnd = start + 2;
        }
      });
    }
  };

  const langBadge = language === 'css' ? 'CSS' : language === 'html' ? 'HTML' : 'JS';

  return (
    <div className="space-y-2">
      {(label || onFormat) && (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            {label && (
              <span className="text-xs font-semibold text-[#0B0D0F] block truncate">
                {label}
              </span>
            )}
            {helperText && (
              <span className="text-[11px] text-[#5C6066] block truncate">{helperText}</span>
            )}
          </div>
          {onFormat && !disabled && (
            <button
              type="button"
              onClick={onFormat}
              className="px-2.5 py-1 rounded-lg bg-[#F7F6F3] hover:bg-[#EAE7E1] border border-black/[0.08] text-[11px] font-semibold text-[#0B0D0F] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <MagicWand size={12} weight="bold" className="text-[#0F766E]" />
              <span>Format</span>
            </button>
          )}
        </div>
      )}

      {/* Editor Surface */}
      <div className="rounded-xl overflow-hidden border border-black/[0.14] bg-[#0F1317] shadow-xs">
        {/* Top Code Strip */}
        <div className="px-3 py-1.5 bg-[#161B21] border-b border-white/[0.08] flex items-center justify-between gap-2 text-[10px] font-mono">
          <div className="flex items-center gap-2 text-slate-300">
            <span className="px-1.5 py-0.5 rounded bg-white/[0.08] text-teal-300 font-semibold">
              {langBadge}
            </span>
            <span className="text-slate-400 tabular-nums">
              {lines.length} {lines.length === 1 ? 'line' : 'lines'} · {value.length.toLocaleString()} chars
            </span>
          </div>

          <div className="flex items-center gap-2.5 tabular-nums">
            {errorCount === 0 && warningCount === 0 && value.trim().length > 0 && (
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <CheckCircle size={12} weight="fill" />
                <span>Valid</span>
              </span>
            )}
            {errorCount > 0 && (
              <span className="inline-flex items-center gap-1 text-rose-400 font-semibold">
                <WarningCircle size={12} weight="fill" />
                <span>
                  {errorCount} {errorCount === 1 ? 'error' : 'errors'}
                </span>
              </span>
            )}
            {warningCount > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-300 font-semibold">
                <Warning size={12} weight="fill" />
                <span>
                  {warningCount} {warningCount === 1 ? 'warning' : 'warnings'}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Gutter + Layered Syntax Overlay / Textarea */}
        <div
          className="relative flex font-mono text-[12px] leading-[1.6]"
          style={{
            minHeight: `${compact ? Math.min(minHeight, 130) : minHeight}px`,
            maxHeight: `${maxHeight}px`,
          }}
        >
          {/* Line Numbers Gutter */}
          <div
            ref={gutterRef}
            aria-hidden="true"
            className="w-10 shrink-0 py-3 pr-2.5 text-right select-none overflow-hidden bg-[#12171C] border-r border-white/[0.06] text-slate-500 tabular-nums"
          >
            {lines.map((lineNo) => (
              <div key={lineNo} className="leading-[1.6]">
                {lineNo}
              </div>
            ))}
          </div>

          {/* Synchronized Syntax Highlight Layer + Transparent Editable Textarea */}
          <div className="relative flex-1 min-w-0 overflow-hidden">
            <pre
              ref={preRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 m-0 p-3 overflow-hidden whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.6]"
            >
              {value ? (
                <>
                  {tokens.map((tok, i) => (
                    <span
                      key={i}
                      className={TOKEN_CLASSES[tok.type] || 'text-slate-100'}
                    >
                      {tok.text}
                    </span>
                  ))}
                  {value.endsWith('\n') ? ' ' : ''}
                </>
              ) : (
                <span className="text-slate-500">{placeholder}</span>
              )}
            </pre>

            <textarea
              ref={areaRef}
              value={value}
              disabled={disabled}
              onChange={(e) => onChange(e.target.value)}
              onScroll={syncScroll}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-label={label || `${langBadge} code editor`}
              className="relative z-10 block w-full h-full min-h-full resize-none bg-transparent p-3 font-mono text-[12px] leading-[1.6] text-transparent caret-teal-300 selection:bg-teal-500/30 focus:outline-none whitespace-pre-wrap break-words overflow-auto disabled:cursor-not-allowed"
              style={{
                minHeight: `${compact ? Math.min(minHeight, 130) : minHeight}px`,
                maxHeight: `${maxHeight}px`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Inline Diagnostics Feedback */}
      {diagnostics.length > 0 && (
        <div className="rounded-xl border border-black/[0.08] bg-[#FAF9F7] divide-y divide-black/[0.06] max-h-40 overflow-y-auto">
          {diagnostics.slice(0, 12).map((d, idx) => (
            <div
              key={`${d.code}-${idx}`}
              className="px-3 py-2 flex items-start gap-2 text-[11px] leading-snug"
            >
              {d.severity === 'error' ? (
                <WarningCircle size={14} weight="fill" className="text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <Warning size={14} weight="fill" className="text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 flex-1">
                <span className={d.severity === 'error' ? 'text-rose-800 font-medium' : 'text-amber-900'}>
                  {d.message}
                </span>
                {d.line !== undefined && (
                  <span className="ml-1.5 font-mono text-[10px] text-[#5C6066] tabular-nums">
                    Line {d.line}
                  </span>
                )}
              </div>
            </div>
          ))}
          {diagnostics.length > 12 && (
            <div className="px-3 py-1.5 text-[10px] font-mono text-[#5C6066]">
              + {diagnostics.length - 12} more items
            </div>
          )}
        </div>
      )}
    </div>
  );
};
