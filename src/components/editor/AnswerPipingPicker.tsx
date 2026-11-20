import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BracketsCurly,
  MagnifyingGlass,
  Function as FunctionIcon,
  Question,
  X,
} from '@phosphor-icons/react';
import {
  buildPipingCatalog,
  FormDocument,
  formComponentRegistry,
} from '../../studio';

interface AnswerPipingPickerProps {
  document: FormDocument;
  onInsertToken: (tokenSnippet: string) => void;
  disabled?: boolean;
  /** Optional alignment of popover menu */
  align?: 'left' | 'right';
  /** Compact icon+text button size */
  compact?: boolean;
}

/**
 * Accessible picker allowing creators to insert dynamic respondent answers and variables
 * (`{{key}}` or `{{key | fallback}}`) into headings, paragraphs, questions, descriptions,
 * confirmation messages, and logic notices without memorising token syntax.
 */
export const AnswerPipingPicker: React.FC<AnswerPipingPickerProps> = ({
  document,
  onInsertToken,
  disabled = false,
  align = 'right',
  compact = true,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [fallbackText, setFallbackText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const catalog = useMemo(
    () =>
      buildPipingCatalog(document, (node) => {
        const def = formComponentRegistry.get(node.type);
        return !def || def.isQuestion;
      }),
    [document]
  );

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.document.addEventListener('mousedown', handleOutside);
    window.document.addEventListener('keydown', handleKey);
    return () => {
      window.document.removeEventListener('mousedown', handleOutside);
      window.document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const lowerQ = query.trim().toLowerCase();
  const filteredQuestions = useMemo(
    () =>
      lowerQ
        ? catalog.questions.filter(
            (item) =>
              item.label.toLowerCase().includes(lowerQ) ||
              item.tokenKey.toLowerCase().includes(lowerQ)
          )
        : catalog.questions,
    [catalog.questions, lowerQ]
  );

  const filteredVariables = useMemo(
    () =>
      lowerQ
        ? catalog.variables.filter(
            (item) =>
              item.label.toLowerCase().includes(lowerQ) ||
              item.typeBadge.toLowerCase().includes(lowerQ)
          )
        : catalog.variables,
    [catalog.variables, lowerQ]
  );

  const handlePick = (tokenKey: string) => {
    const cleanFallback = fallbackText.trim();
    const snippet = cleanFallback
      ? `{{${tokenKey} | ${cleanFallback}}}`
      : `{{${tokenKey}}}`;
    onInsertToken(snippet);
    setFallbackText('');
    setQuery('');
    setOpen(false);
  };

  if (disabled) return null;

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-1 rounded-md border border-black/[0.1] bg-[#FAF9F7] hover:bg-[#EAE7E1] text-[#0F766E] font-medium transition-colors whitespace-nowrap shrink-0 ${
          compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
        }`}
        title="Insert respondent answer or variable"
      >
        <BracketsCurly size={compact ? 11 : 13} weight="bold" />
        <span>Insert answer</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Insert answer or variable"
          className={`absolute z-50 mt-1.5 w-72 rounded-xl bg-white border border-black/[0.12] shadow-xl overflow-hidden ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {/* Header + Search */}
          <div className="p-2.5 border-b border-black/[0.08] bg-[#FAF9F7] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-display font-semibold text-[#0B0D0F]">
                Insert Dynamic Value
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-0.5 rounded text-[#5C6066] hover:text-[#0B0D0F]"
                aria-label="Close picker"
              >
                <X size={12} weight="bold" />
              </button>
            </div>

            <div className="relative">
              <MagnifyingGlass
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5C6066] pointer-events-none"
              />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search questions or variables..."
                className="w-full h-7 pl-7 pr-2 text-[11px] bg-white border border-black/[0.1] rounded-md text-[#0B0D0F] placeholder:text-[#5C6066] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono text-[#5C6066] mb-0.5">
                Fallback text if unanswered (optional)
              </label>
              <input
                type="text"
                value={fallbackText}
                onChange={(e) => setFallbackText(e.target.value)}
                placeholder="e.g. there, N/A, $0.00"
                className="w-full h-7 px-2 text-[11px] bg-white border border-black/[0.1] rounded-md text-[#0B0D0F] placeholder:text-[#5C6066] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              />
            </div>
          </div>

          {/* Items List */}
          <div className="max-h-60 overflow-y-auto p-1.5 space-y-2">
            {filteredVariables.length > 0 && (
              <div>
                <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066]">
                  Variables &amp; Calculations
                </div>
                <div className="space-y-0.5">
                  {filteredVariables.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => handlePick(v.tokenKey)}
                      className="w-full px-2 py-1.5 rounded-lg hover:bg-[#0F766E]/[0.07] text-left flex items-center justify-between gap-2 transition-colors"
                    >
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <FunctionIcon size={13} className="text-[#0F766E] shrink-0" />
                        <span className="text-xs font-mono font-medium text-[#0B0D0F] truncate">
                          {v.label}
                        </span>
                      </span>
                      <span className="text-[10px] font-mono text-[#5C6066] shrink-0">
                        {v.typeBadge}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {filteredQuestions.length > 0 && (
              <div>
                <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066]">
                  Form Questions
                </div>
                <div className="space-y-0.5">
                  {filteredQuestions.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => handlePick(q.tokenKey)}
                      className="w-full px-2 py-1.5 rounded-lg hover:bg-black/[0.04] text-left flex items-center justify-between gap-2 transition-colors"
                    >
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <Question size={13} className="text-[#5C6066] shrink-0" />
                        <span className="text-xs text-[#0B0D0F] truncate">{q.label}</span>
                      </span>
                      <span className="text-[10px] font-mono text-[#5C6066] shrink-0 capitalize">
                        {q.typeBadge}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {filteredVariables.length === 0 && filteredQuestions.length === 0 && (
              <p className="p-3 text-center text-[11px] text-[#5C6066]">
                No matching questions or variables found.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
