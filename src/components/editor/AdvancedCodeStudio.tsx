/**
 * FlexStore Form Studio — Advanced Code & Styling Studio (Phase 3.1)
 *
 * Optional workspace for creators who want fine-grained control beyond the visual
 * editor:
 *  1. Form-level Scoped Custom CSS (with interactive selector picker, formatting,
 *     live diagnostics, responsive @media support, preview-before-save, disable & reset)
 *  2. Custom HTML Blocks manager & sanitized editor (live preview + security report)
 *  3. Opt-in Sandboxed Custom JavaScript (disabled by default, opaque-origin iframe,
 *     explicit API docs, snippets, watchdog timeout, and creator runtime console)
 *
 * All preview rendering runs through the exact same `FormDocumentRenderer` used by
 * published forms so styling, responsive rules, and sanitization are 100% consistent.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowCounterClockwise,
  BookOpen,
  Check,
  Code,
  Crosshair,
  Desktop,
  DeviceMobile,
  DeviceTablet,
  FileHtml,
  FloppyDisk,
  MagnifyingGlass,
  PaintBrushBroad,
  Plus,
  ShieldCheck,
  TerminalWindow,
  Trash,
  Warning,
  X,
} from '@phosphor-icons/react';
import {
  buildCssSelectorCatalog,
  compileDocumentCustomCss,
  compileScopedCss,
  CSS_EXAMPLE_SNIPPETS,
  CUSTOM_CODE_SCHEMA_VERSION,
  DEFAULT_JS_TIMEOUT_MS,
  formatCss,
  FormComponentNode,
  FormComponentType,
  FormCustomCodeConfig,
  FormDocument,
  FormDocumentRenderer,
  getOrderedComponents,
  HTML_EXAMPLE_SNIPPETS,
  JS_EXAMPLE_SNIPPETS,
  sanitizeCustomHtml,
  validateCustomJs,
  ViewportMode,
} from '../../studio';
import { CodeHighlightEditor } from './CodeHighlightEditor';

interface AdvancedCodeStudioProps {
  document: FormDocument;
  onSaveCustomCode: (next: FormCustomCodeConfig) => void;
  onUpdateComponent: (id: string, patch: { content?: Record<string, any> }) => void;
  onAddComponent: (type: FormComponentType, targetPageId?: string) => void;
  isReadOnly?: boolean;
}

interface ConsoleEntry {
  id: string;
  kind: 'log' | 'error';
  message: string;
  time: string;
}

function normalizeCustomCode(cfg?: FormCustomCodeConfig): FormCustomCodeConfig {
  return {
    schemaVersion: CUSTOM_CODE_SCHEMA_VERSION,
    css: {
      enabled: cfg?.css?.enabled !== false,
      code: cfg?.css?.code || '',
    },
    js: {
      enabled: Boolean(cfg?.js?.enabled),
      code: cfg?.js?.code || '',
      timeoutMs: cfg?.js?.timeoutMs ?? DEFAULT_JS_TIMEOUT_MS,
    },
  };
}

function nowStamp(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

export const AdvancedCodeStudio: React.FC<AdvancedCodeStudioProps> = ({
  document,
  onSaveCustomCode,
  onUpdateComponent,
  onAddComponent,
  isReadOnly = false,
}) => {
  const [subTab, setSubTab] = useState<'css' | 'html' | 'js'>('css');
  const [previewViewport, setPreviewViewport] = useState<ViewportMode>('desktop');
  const [selectorSearch, setSelectorSearch] = useState('');
  const [cssToolPanel, setCssToolPanel] = useState<'selectors' | 'snippets'>('selectors');
  const [showJsDocs, setShowJsDocs] = useState(true);
  const [copiedSelector, setCopiedSelector] = useState<string | null>(null);
  const [saveBanner, setSaveBanner] = useState<string | null>(null);

  // Preview-before-save draft for form-level CSS & JS
  const savedConfig = useMemo(() => normalizeCustomCode(document.customCode), [document.customCode]);
  const [draft, setDraft] = useState<FormCustomCodeConfig>(savedConfig);

  // Sync draft when switching to a different form document
  const docIdRef = useRef(document.id);
  useEffect(() => {
    if (docIdRef.current !== document.id) {
      docIdRef.current = document.id;
      setDraft(normalizeCustomCode(document.customCode));
    }
  }, [document.id, document.customCode]);

  const hasUnsavedCodeChanges = useMemo(() => {
    return (
      draft.css.enabled !== savedConfig.css.enabled ||
      draft.css.code !== savedConfig.css.code ||
      draft.js.enabled !== savedConfig.js.enabled ||
      draft.js.code !== savedConfig.js.code ||
      (draft.js.timeoutMs ?? DEFAULT_JS_TIMEOUT_MS) !==
        (savedConfig.js.timeoutMs ?? DEFAULT_JS_TIMEOUT_MS)
    );
  }, [draft, savedConfig]);

  // Custom HTML blocks in this form
  const htmlBlocks: FormComponentNode[] = useMemo(
    () => getOrderedComponents(document).filter((n) => n.type === 'custom_html'),
    [document]
  );
  const [selectedHtmlId, setSelectedHtmlId] = useState<string | null>(htmlBlocks[0]?.id || null);

  useEffect(() => {
    if (htmlBlocks.length === 0) {
      setSelectedHtmlId(null);
    } else if (!selectedHtmlId || !htmlBlocks.some((b) => b.id === selectedHtmlId)) {
      setSelectedHtmlId(htmlBlocks[0].id);
    }
  }, [htmlBlocks, selectedHtmlId]);

  const activeHtmlBlock = htmlBlocks.find((b) => b.id === selectedHtmlId) || null;
  const [draftHtml, setDraftHtml] = useState<string>(activeHtmlBlock?.content.htmlContent || '');
  const [draftHtmlPiping, setDraftHtmlPiping] = useState<boolean>(
    activeHtmlBlock?.content.htmlEnablePiping !== false
  );

  useEffect(() => {
    setDraftHtml(activeHtmlBlock?.content.htmlContent || '');
    setDraftHtmlPiping(activeHtmlBlock?.content.htmlEnablePiping !== false);
  }, [activeHtmlBlock?.id, activeHtmlBlock?.content.htmlContent, activeHtmlBlock?.content.htmlEnablePiping]);

  const hasUnsavedHtmlChanges = Boolean(
    activeHtmlBlock &&
      (draftHtml !== (activeHtmlBlock.content.htmlContent || '') ||
        draftHtmlPiping !== (activeHtmlBlock.content.htmlEnablePiping !== false))
  );

  const hasAnyUnsavedChanges = hasUnsavedCodeChanges || hasUnsavedHtmlChanges;

  // Live preview document incorporating unsaved HTML draft so creators can preview before saving
  const previewDocument: FormDocument = useMemo(() => {
    if (!activeHtmlBlock || !hasUnsavedHtmlChanges) return document;
    return {
      ...document,
      components: {
        ...document.components,
        [activeHtmlBlock.id]: {
          ...activeHtmlBlock,
          content: {
            ...activeHtmlBlock.content,
            htmlContent: draftHtml,
            htmlEnablePiping: draftHtmlPiping,
          },
        },
      },
    };
  }, [document, activeHtmlBlock, hasUnsavedHtmlChanges, draftHtml, draftHtmlPiping]);

  // Diagnostics for CSS, HTML, JS
  const cssDiagnostics = useMemo(() => {
    if (!draft.css.code.trim()) return [];
    const res = compileScopedCss(draft.css.code, { formId: document.id, scopeId: 'preview' });
    return [...res.errors, ...res.warnings];
  }, [draft.css.code, document.id]);

  const totalCompiledCss = useMemo(
    () =>
      compileDocumentCustomCss(previewDocument, {
        scopeId: 'preview',
        overrideFormCss: draft.css,
      }),
    [previewDocument, draft.css]
  );

  const htmlSanitized = useMemo(() => sanitizeCustomHtml(draftHtml), [draftHtml]);
  const jsValidation = useMemo(() => validateCustomJs(draft.js.code), [draft.js.code]);

  // Selector catalog for targeting form elements & individual components
  const selectorCatalog = useMemo(() => buildCssSelectorCatalog(document), [document]);
  const filteredSelectors = useMemo(() => {
    const q = selectorSearch.trim().toLowerCase();
    if (!q) return selectorCatalog;
    return selectorCatalog.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.selector.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
    );
  }, [selectorCatalog, selectorSearch]);

  // Creator-only runtime console for Sandboxed JS preview
  const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([]);
  const pushConsole = (kind: 'log' | 'error', message: string) => {
    setConsoleLogs((prev) => [
      ...prev.slice(-24),
      {
        id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        kind,
        message,
        time: nowStamp(),
      },
    ]);
  };

  const cssTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const insertCssSnippet = (snippet: string) => {
    if (isReadOnly) return;
    const current = draft.css.code;
    const prefix = current.trim() ? `${current.trimEnd()}\n\n` : '';
    setDraft((prev) => ({
      ...prev,
      css: { ...prev.css, code: `${prefix}${snippet}` },
    }));
  };

  const handleInsertSelector = (selector: string) => {
    if (isReadOnly) return;
    const block = `${selector} {\n  \n}`;
    insertCssSnippet(block);
    setCopiedSelector(selector);
    setTimeout(() => setCopiedSelector(null), 1400);
  };

  const handleSaveAll = () => {
    if (isReadOnly) return;
    if (hasUnsavedCodeChanges) {
      onSaveCustomCode({
        schemaVersion: CUSTOM_CODE_SCHEMA_VERSION,
        css: {
          enabled: draft.css.enabled,
          code: draft.css.code,
        },
        js: {
          enabled: draft.js.enabled,
          code: draft.js.code,
          timeoutMs: draft.js.timeoutMs ?? DEFAULT_JS_TIMEOUT_MS,
        },
      });
    }
    if (activeHtmlBlock && hasUnsavedHtmlChanges) {
      onUpdateComponent(activeHtmlBlock.id, {
        content: {
          htmlContent: draftHtml,
          htmlEnablePiping: draftHtmlPiping,
        },
      });
    }
    setSaveBanner('Customisation saved to form');
    setTimeout(() => setSaveBanner(null), 2200);
  };

  const handleDiscardAll = () => {
    setDraft(savedConfig);
    if (activeHtmlBlock) {
      setDraftHtml(activeHtmlBlock.content.htmlContent || '');
      setDraftHtmlPiping(activeHtmlBlock.content.htmlEnablePiping !== false);
    }
  };

  const handleResetCss = () => {
    if (isReadOnly) return;
    setDraft((prev) => ({
      ...prev,
      css: { enabled: true, code: '' },
    }));
  };

  const handleResetJs = () => {
    if (isReadOnly) return;
    setDraft((prev) => ({
      ...prev,
      js: { enabled: false, code: '', timeoutMs: DEFAULT_JS_TIMEOUT_MS },
    }));
    setConsoleLogs([]);
  };

  const cssErrorCount = cssDiagnostics.filter((d) => d.severity === 'error').length;
  const jsErrorCount = jsValidation.errors.length;

  return (
    <div className="flex-1 flex flex-col bg-[#F2F0EC] min-h-[calc(100dvh-3.5rem)] lg:h-[calc(100dvh-3.5rem)] overflow-hidden">
      {/* Top Advanced Customisation Bar */}
      <div className="px-4 sm:px-6 py-2.5 bg-white border-b border-black/[0.08] flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Sub-workspace Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#F7F6F3] border border-black/[0.06]">
          <button
            type="button"
            onClick={() => setSubTab('css')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all ${
              subTab === 'css'
                ? 'bg-white text-[#0B0D0F] shadow-xs'
                : 'text-[#5C6066] hover:text-[#0B0D0F]'
            }`}
          >
            <PaintBrushBroad size={14} weight={subTab === 'css' ? 'duotone' : 'regular'} className="text-[#0F766E]" />
            <span>Custom CSS</span>
            {cssErrorCount > 0 && (
              <span className="font-mono text-[10px] text-rose-600 font-bold">({cssErrorCount})</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubTab('html')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all ${
              subTab === 'html'
                ? 'bg-white text-[#0B0D0F] shadow-xs'
                : 'text-[#5C6066] hover:text-[#0B0D0F]'
            }`}
          >
            <FileHtml size={14} weight={subTab === 'html' ? 'duotone' : 'regular'} className="text-[#0F766E]" />
            <span>HTML Blocks ({htmlBlocks.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('js')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all ${
              subTab === 'js'
                ? 'bg-white text-[#0B0D0F] shadow-xs'
                : 'text-[#5C6066] hover:text-[#0B0D0F]'
            }`}
          >
            <TerminalWindow size={14} weight={subTab === 'js' ? 'duotone' : 'regular'} className="text-[#0F766E]" />
            <span>Sandboxed JS</span>
            {draft.js.enabled && (
              <span className="font-mono text-[10px] text-[#0F766E]">ON</span>
            )}
            {jsErrorCount > 0 && (
              <span className="font-mono text-[10px] text-rose-600 font-bold">({jsErrorCount})</span>
            )}
          </button>
        </div>

        {/* Right Controls: Save / Discard Draft + Responsive Preview Breakpoints */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {saveBanner && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-[#0F766E]">
              <Check size={14} weight="bold" />
              <span>{saveBanner}</span>
            </span>
          )}

          {hasAnyUnsavedChanges && !isReadOnly && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-mono text-amber-700 hidden sm:inline">
                Previewing unsaved changes
              </span>
              <button
                type="button"
                onClick={handleDiscardAll}
                className="h-8 px-2.5 rounded-lg border border-black/[0.1] bg-white hover:bg-[#F7F6F3] text-xs font-semibold text-[#5C6066] hover:text-[#0B0D0F] inline-flex items-center gap-1 whitespace-nowrap transition-colors"
              >
                <X size={13} weight="bold" />
                <span>Discard</span>
              </button>
              <button
                type="button"
                onClick={handleSaveAll}
                className="h-8 px-3 rounded-lg bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <FloppyDisk size={13} weight="bold" />
                <span>Save Changes</span>
              </button>
            </div>
          )}

          <div
            className="flex items-center gap-0.5 p-1 rounded-xl bg-[#F7F6F3] border border-black/[0.06]"
            role="group"
            aria-label="Preview viewport"
          >
            {(
              [
                { id: 'desktop', label: 'Desktop', icon: Desktop },
                { id: 'tablet', label: 'Tablet', icon: DeviceTablet },
                { id: 'mobile', label: 'Mobile', icon: DeviceMobile },
              ] as const
            ).map((vp) => {
              const Icon = vp.icon;
              const active = previewViewport === vp.id;
              return (
                <button
                  key={vp.id}
                  type="button"
                  onClick={() => setPreviewViewport(vp.id)}
                  aria-pressed={active}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all ${
                    active
                      ? 'bg-white text-[#0B0D0F] shadow-xs'
                      : 'text-[#5C6066] hover:text-[#0B0D0F]'
                  }`}
                >
                  <Icon size={13} weight={active ? 'bold' : 'regular'} />
                  <span className="hidden sm:inline">{vp.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Split Workspace: Left Code Editor & Tools | Right Live Responsive Preview */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-y-auto lg:overflow-hidden">
        {/* LEFT PANE: Editor, Selector Picker, Snippets & Console */}
        <div className="lg:col-span-6 xl:col-span-5 bg-white border-b lg:border-b-0 lg:border-r border-black/[0.08] overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* =============================================================== */}
          {/* TAB 1: FORM-LEVEL CUSTOM CSS                                    */}
          {/* =============================================================== */}
          {subTab === 'css' && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <h2 className="text-sm font-display font-bold text-[#0B0D0F]">
                    Form-Level Custom CSS
                  </h2>
                  <p className="text-xs text-[#5C6066] leading-relaxed">
                    All rules are automatically scoped to this form so they never affect the FlexStore editor or other forms. Responsive <code className="font-mono text-[11px]">@media</code> queries respond live across Desktop, Tablet, and Mobile previews.
                  </p>
                </div>
              </div>

              {/* Controls Row: Enable/Disable Toggle + Reset */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-[#F7F6F3] border border-black/[0.07]">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#0B0D0F] cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={isReadOnly}
                    checked={draft.css.enabled}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        css: { ...prev.css, enabled: e.target.checked },
                      }))
                    }
                    className="accent-[#0F766E] w-4 h-4 rounded"
                  />
                  <span>{draft.css.enabled ? 'Custom CSS Active' : 'Custom CSS Temporarily Disabled'}</span>
                </label>

                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={handleResetCss}
                    disabled={!draft.css.code.trim()}
                    className="px-2.5 py-1 rounded-lg bg-white border border-black/[0.08] hover:border-rose-300 text-[11px] font-semibold text-[#5C6066] hover:text-rose-700 disabled:opacity-40 inline-flex items-center gap-1 transition-colors"
                  >
                    <ArrowCounterClockwise size={12} weight="bold" />
                    <span>Reset CSS</span>
                  </button>
                )}
              </div>

              {!draft.css.enabled && draft.css.code.trim() && (
                <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                  <Warning size={14} weight="fill" className="text-amber-600 shrink-0" />
                  <span>Custom CSS is temporarily paused. Re-enable above to preview and apply styles.</span>
                </div>
              )}

              <CodeHighlightEditor
                language="css"
                label="Stylesheet"
                helperText="Supports standard selectors, CSS variables, and responsive @media rules"
                value={draft.css.code}
                disabled={isReadOnly}
                minHeight={240}
                maxHeight={380}
                textareaRef={cssTextareaRef}
                onChange={(next) =>
                  setDraft((prev) => ({
                    ...prev,
                    css: { ...prev.css, code: next },
                  }))
                }
                onFormat={() =>
                  setDraft((prev) => ({
                    ...prev,
                    css: { ...prev.css, code: formatCss(prev.css.code) },
                  }))
                }
                placeholder={
                  '/* Example */\n.fs-card {\n  box-shadow: 0 20px 50px -20px rgba(15, 118, 110, 0.2);\n}\n\n@media (max-width: 640px) {\n  .fs-card { padding: 1.25rem; }\n}'
                }
                diagnostics={cssDiagnostics}
              />

              {/* Selector Targeting Interface & Snippets */}
              <div className="space-y-3 pt-2 border-t border-black/[0.08]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#F7F6F3] border border-black/[0.06]">
                    <button
                      type="button"
                      onClick={() => setCssToolPanel('selectors')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${
                        cssToolPanel === 'selectors'
                          ? 'bg-white text-[#0B0D0F] shadow-xs'
                          : 'text-[#5C6066] hover:text-[#0B0D0F]'
                      }`}
                    >
                      <Crosshair size={12} weight="bold" className="text-[#0F766E]" />
                      <span>Selector Picker</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCssToolPanel('snippets')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${
                        cssToolPanel === 'snippets'
                          ? 'bg-white text-[#0B0D0F] shadow-xs'
                          : 'text-[#5C6066] hover:text-[#0B0D0F]'
                      }`}
                    >
                      <BookOpen size={12} weight="bold" className="text-[#0F766E]" />
                      <span>Examples &amp; Docs</span>
                    </button>
                  </div>

                  {totalCompiledCss.scopedCss && (
                    <span className="font-mono text-[10px] text-[#5C6066] tabular-nums">
                      Scoped: {totalCompiledCss.scopedCss.length.toLocaleString()} chars
                    </span>
                  )}
                </div>

                {cssToolPanel === 'selectors' ? (
                  <div className="space-y-2.5">
                    <div className="relative">
                      <MagnifyingGlass
                        size={13}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5C6066]"
                      />
                      <input
                        type="text"
                        value={selectorSearch}
                        onChange={(e) => setSelectorSearch(e.target.value)}
                        placeholder="Filter form regions or components..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs focus:outline-none focus:border-[#0F766E]"
                      />
                    </div>

                    <div className="max-h-60 overflow-y-auto divide-y divide-black/[0.06] rounded-xl border border-black/[0.08]">
                      {filteredSelectors.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => handleInsertSelector(item.selector)}
                          className="w-full px-3 py-2 text-left hover:bg-[#F7F6F3] flex items-center justify-between gap-2 transition-colors disabled:opacity-60"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-[#0B0D0F] truncate">
                                {item.label}
                              </span>
                              <span className="font-mono text-[9px] uppercase text-[#5C6066] shrink-0">
                                {item.group}
                              </span>
                            </div>
                            <code className="font-mono text-[11px] text-[#0F766E] block truncate">
                              {item.selector}
                            </code>
                          </div>
                          <span className="text-[10px] font-semibold text-[#5C6066] shrink-0">
                            {copiedSelector === item.selector ? 'Inserted' : '+ Insert'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {CSS_EXAMPLE_SNIPPETS.map((snip) => (
                      <div
                        key={snip.id}
                        className="p-3 rounded-xl bg-[#FAF9F7] border border-black/[0.07] space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="text-xs font-semibold text-[#0B0D0F] block">
                              {snip.title}
                            </span>
                            <span className="text-[11px] text-[#5C6066]">{snip.description}</span>
                          </div>
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => insertCssSnippet(snip.code)}
                              className="px-2.5 py-1 rounded-lg bg-white border border-black/[0.1] hover:border-[#0F766E] text-[11px] font-semibold text-[#0B0D0F] shrink-0 transition-colors"
                            >
                              Insert
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="p-3 rounded-xl bg-[#F7F6F3] border border-black/[0.06] text-[11px] text-[#5C6066] space-y-1 leading-relaxed">
                      <span className="font-semibold text-[#0B0D0F] block">Security &amp; Scoping Rules</span>
                      <p>
                        External stylesheet imports (<code className="font-mono">@import</code>), data URLs, and legacy script expressions are blocked. Fixed positioning is automatically converted to <code className="font-mono">sticky</code> so custom styles stay contained inside the form.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* =============================================================== */}
          {/* TAB 2: CUSTOM HTML BLOCKS                                       */}
          {/* =============================================================== */}
          {subTab === 'html' && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <h2 className="text-sm font-display font-bold text-[#0B0D0F]">
                    Custom HTML Content Blocks
                  </h2>
                  <p className="text-xs text-[#5C6066] leading-relaxed">
                    Add rich callouts, formatted tables, policy notices, and brand headers using safe semantic HTML.
                  </p>
                </div>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => onAddComponent('custom_html')}
                    className="h-8 px-3 rounded-lg bg-[#0B0D0F] hover:bg-[#1E2329] text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                  >
                    <Plus size={13} weight="bold" />
                    <span>Add HTML Block</span>
                  </button>
                )}
              </div>

              {htmlBlocks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-black/[0.15] bg-[#FAF9F7] p-6 text-center space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-white border border-black/[0.08] mx-auto flex items-center justify-center text-[#0F766E]">
                    <Code size={20} weight="duotone" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-[#0B0D0F]">
                      No Custom HTML blocks in this form yet
                    </p>
                    <p className="text-xs text-[#5C6066] max-w-xs mx-auto leading-relaxed">
                      Add a Custom HTML block here or drag it from the Content category in the Build tab.
                    </p>
                  </div>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => onAddComponent('custom_html')}
                      className="px-3.5 py-2 rounded-lg bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Plus size={13} weight="bold" />
                      <span>Insert Custom HTML Block</span>
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Block Selector */}
                  <div className="flex flex-wrap gap-1.5">
                    {htmlBlocks.map((block, idx) => {
                      const active = block.id === activeHtmlBlock?.id;
                      return (
                        <button
                          key={block.id}
                          type="button"
                          onClick={() => setSelectedHtmlId(block.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            active
                              ? 'bg-[#0B0D0F] text-white border-[#0B0D0F]'
                              : 'bg-[#F7F6F3] text-[#5C6066] border-black/[0.07] hover:text-[#0B0D0F]'
                          }`}
                        >
                          {block.content.label || `HTML Block ${idx + 1}`}
                        </button>
                      );
                    })}
                  </div>

                  {activeHtmlBlock && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#F7F6F3] border border-black/[0.07]">
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#0B0D0F] cursor-pointer">
                          <input
                            type="checkbox"
                            disabled={isReadOnly}
                            checked={draftHtmlPiping}
                            onChange={(e) => setDraftHtmlPiping(e.target.checked)}
                            className="accent-[#0F766E] w-4 h-4 rounded"
                          />
                          <span>Enable safe answer piping (<code className="font-mono text-[11px]">{'{{field}}'}</code>)</span>
                        </label>
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={() => setDraftHtml('')}
                            className="text-[11px] font-semibold text-[#5C6066] hover:text-rose-600 transition-colors"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      <CodeHighlightEditor
                        language="html"
                        label={activeHtmlBlock.content.label || 'HTML Block Source'}
                        helperText="Sanitized live into safe React elements — never injected as raw HTML"
                        value={draftHtml}
                        disabled={isReadOnly}
                        minHeight={220}
                        maxHeight={360}
                        onChange={setDraftHtml}
                        placeholder="<h3>Notice</h3>\n<p>Write semantic HTML here...</p>"
                        diagnostics={[...htmlSanitized.errors, ...htmlSanitized.warnings].map((d) => ({
                          severity: d.severity,
                          code: d.code,
                          message: d.message,
                          line: d.line,
                        }))}
                      />

                      {!isReadOnly && (
                        <div className="space-y-2 pt-2 border-t border-black/[0.08]">
                          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#5C6066] block">
                            Example HTML Snippets
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {HTML_EXAMPLE_SNIPPETS.map((snip) => (
                              <button
                                key={snip.id}
                                type="button"
                                onClick={() => setDraftHtml(snip.html)}
                                className="p-2.5 rounded-xl bg-[#FAF9F7] hover:bg-[#F2F0EC] border border-black/[0.07] text-left transition-colors"
                              >
                                <span className="text-xs font-semibold text-[#0B0D0F] block">
                                  {snip.title}
                                </span>
                                <span className="text-[10px] text-[#5C6066] block mt-0.5 leading-snug">
                                  {snip.description}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="p-3 rounded-xl bg-[#F7F6F3] border border-black/[0.06] text-[11px] text-[#5C6066] space-y-1 leading-relaxed">
                        <span className="font-semibold text-[#0B0D0F] flex items-center gap-1.5">
                          <ShieldCheck size={14} weight="bold" className="text-[#0F766E]" />
                          <span>Allowed HTML &amp; Safety Guarantees</span>
                        </span>
                        <p>
                          Supports headings, paragraphs, links (https/mailto), images (https), lists, tables, blockquotes, badges, <code className="font-mono">&lt;details&gt;</code>, and safe inline styles. Scripts, iframes, embedded forms, SVG/MathML, inline event handlers, and unsafe URL schemes are always removed.
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* =============================================================== */}
          {/* TAB 3: SANDBOXED CUSTOM JAVASCRIPT (OPT-IN, ISOLATED)           */}
          {/* =============================================================== */}
          {subTab === 'js' && (
            <>
              <div className="space-y-1">
                <h2 className="text-sm font-display font-bold text-[#0B0D0F]">
                  Sandboxed Custom JavaScript
                </h2>
                <p className="text-xs text-[#5C6066] leading-relaxed">
                  Optional form behaviour scripts run inside an isolated sandbox with no access to accounts, cookies, browser storage, network requests, or form security rules.
                </p>
              </div>

              {/* Opt-in Toggle, Watchdog Timeout & Remove Controls */}
              <div className="p-3.5 rounded-xl bg-[#F7F6F3] border border-black/[0.08] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#0B0D0F] cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={isReadOnly}
                      checked={draft.js.enabled}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          js: { ...prev.js, enabled: e.target.checked },
                        }))
                      }
                      className="accent-[#0F766E] w-4 h-4 rounded"
                    />
                    <span>
                      {draft.js.enabled ? 'Sandboxed Script Enabled' : 'Disabled by Default (Opt-in)'}
                    </span>
                  </label>

                  {!isReadOnly && (
                    <div className="flex items-center gap-1.5">
                      <select
                        aria-label="Execution timeout limit"
                        value={draft.js.timeoutMs ?? DEFAULT_JS_TIMEOUT_MS}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            js: { ...prev.js, timeoutMs: Number(e.target.value) },
                          }))
                        }
                        className="px-2 py-1 rounded-lg bg-white border border-black/[0.1] font-mono text-[11px] text-[#0B0D0F]"
                      >
                        <option value={100}>Timeout: 100ms</option>
                        <option value={250}>Timeout: 250ms</option>
                        <option value={500}>Timeout: 500ms</option>
                      </select>

                      <button
                        type="button"
                        onClick={handleResetJs}
                        disabled={!draft.js.code.trim() && !draft.js.enabled}
                        className="px-2.5 py-1 rounded-lg bg-white border border-black/[0.1] hover:border-rose-300 text-[11px] font-semibold text-[#5C6066] hover:text-rose-700 disabled:opacity-40 inline-flex items-center gap-1 transition-colors"
                      >
                        <Trash size={12} weight="bold" />
                        <span>Remove</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-start gap-2 text-[11px] text-[#5C6066] leading-relaxed">
                  <ShieldCheck size={14} weight="bold" className="text-[#0F766E] shrink-0 mt-0.5" />
                  <span>
                    Scripts can only listen to form events and display notices, set field hints, or prefill visible inputs. They can never bypass required fields, validation rules, or submission permissions.
                  </span>
                </div>
              </div>

              <CodeHighlightEditor
                language="js"
                label="Sandbox Script"
                helperText="Uses the restricted flexstore API (on, showNotice, setFieldHint, setFieldValue, log)"
                value={draft.js.code}
                disabled={isReadOnly}
                minHeight={210}
                maxHeight={340}
                onChange={(next) =>
                  setDraft((prev) => ({
                    ...prev,
                    js: { ...prev.js, code: next },
                  }))
                }
                placeholder={
                  "flexstore.on('load', (ctx) => {\n  flexstore.log('Loaded with ' + ctx.fieldCount + ' fields');\n});"
                }
                diagnostics={[...jsValidation.errors, ...jsValidation.warnings]}
              />

              {/* Creator-Only Sandbox Runtime Console */}
              <div className="rounded-xl border border-black/[0.09] bg-[#12171C] text-slate-200 overflow-hidden">
                <div className="px-3 py-1.5 bg-[#161B21] border-b border-white/[0.08] flex items-center justify-between text-[10px] font-mono">
                  <span className="text-slate-300 font-semibold">Preview Sandbox Console</span>
                  {consoleLogs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setConsoleLogs([])}
                      className="text-slate-400 hover:text-white transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="p-2.5 max-h-32 overflow-y-auto font-mono text-[11px] space-y-1">
                  {consoleLogs.length === 0 ? (
                    <p className="text-slate-500">
                      {draft.js.enabled
                        ? 'Interact with the live preview on the right to see flexstore.log() output or runtime errors.'
                        : 'Enable Sandboxed Script above to test your script in the live preview.'}
                    </p>
                  ) : (
                    consoleLogs.map((entry) => (
                      <div
                        key={entry.id}
                        className={`flex items-start gap-2 ${
                          entry.kind === 'error' ? 'text-rose-400' : 'text-emerald-300'
                        }`}
                      >
                        <span className="text-slate-500 shrink-0 tabular-nums">{entry.time}</span>
                        <span className="break-words">{entry.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* API Docs & Snippets */}
              <div className="space-y-2.5 pt-2 border-t border-black/[0.08]">
                <button
                  type="button"
                  onClick={() => setShowJsDocs((v) => !v)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-[#0B0D0F]"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <BookOpen size={14} weight="bold" className="text-[#0F766E]" />
                    <span>API Reference &amp; Example Snippets</span>
                  </span>
                  <span className="font-mono text-[10px] text-[#5C6066]">
                    {showJsDocs ? 'Hide' : 'Show'}
                  </span>
                </button>

                {showJsDocs && (
                  <div className="space-y-2.5">
                    <div className="p-3 rounded-xl bg-[#FAF9F7] border border-black/[0.07] font-mono text-[11px] space-y-1 text-[#0B0D0F]">
                      <div>
                        <span className="text-[#0F766E] font-semibold">flexstore.on</span>
                        <span className="text-[#5C6066]">(&apos;load&apos; | &apos;change&apos; | &apos;pageChange&apos;, fn)</span>
                      </div>
                      <div>
                        <span className="text-[#0F766E] font-semibold">flexstore.showNotice</span>
                        <span className="text-[#5C6066]">(message, &apos;info&apos; | &apos;success&apos; | &apos;warning&apos;)</span>
                      </div>
                      <div>
                        <span className="text-[#0F766E] font-semibold">flexstore.setFieldHint</span>
                        <span className="text-[#5C6066]">(fieldId, text)</span>
                      </div>
                      <div>
                        <span className="text-[#0F766E] font-semibold">flexstore.setFieldValue</span>
                        <span className="text-[#5C6066]">(fieldId, value)</span>
                      </div>
                      <div>
                        <span className="text-[#0F766E] font-semibold">flexstore.log</span>
                        <span className="text-[#5C6066]">(message)</span>
                      </div>
                    </div>

                    {JS_EXAMPLE_SNIPPETS.map((snip) => (
                      <div
                        key={snip.id}
                        className="p-3 rounded-xl bg-[#FAF9F7] border border-black/[0.07] flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-[#0B0D0F] block">
                            {snip.title}
                          </span>
                          <span className="text-[11px] text-[#5C6066] block">
                            {snip.description}
                          </span>
                        </div>
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((prev) => ({
                                ...prev,
                                js: { ...prev.js, code: snip.code },
                              }))
                            }
                            className="px-2.5 py-1 rounded-lg bg-white border border-black/[0.1] hover:border-[#0F766E] text-[11px] font-semibold text-[#0B0D0F] shrink-0 transition-colors"
                          >
                            Use
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* RIGHT PANE: Live Responsive Form Preview (Exact Published Renderer) */}
        <div className="lg:col-span-6 xl:col-span-7 bg-[#E9E6E0] overflow-y-auto p-4 sm:p-6 flex flex-col items-center">
          <div className="w-full max-w-4xl flex items-center justify-between gap-2 mb-3 text-[11px] font-mono text-[#5C6066]">
            <span>
              Live Preview · {previewViewport === 'desktop' ? 'Desktop (1280px)' : previewViewport === 'tablet' ? 'Tablet (768px)' : 'Mobile (390px)'}
            </span>
            <span>
              {hasAnyUnsavedChanges ? 'Draft Preview (Unsaved)' : 'Matches Published Form'}
            </span>
          </div>

          <div
            className={`w-full transition-all duration-300 overflow-hidden shadow-2xl border border-black/[0.12] bg-white ${
              previewViewport === 'mobile'
                ? 'max-w-[390px] rounded-[2.25rem] ring-8 ring-[#0B0D0F]/90'
                : previewViewport === 'tablet'
                ? 'max-w-[768px] rounded-2xl ring-4 ring-[#0B0D0F]/15'
                : 'max-w-4xl rounded-2xl'
            }`}
          >
            <FormDocumentRenderer
              source={previewDocument}
              customCodeOverride={draft}
              viewportOverride={previewViewport}
              scopeInstanceSuffix="code_studio_preview"
              isPreview={true}
              embedded={true}
              onSandboxLog={(msg) => pushConsole('log', msg)}
              onSandboxError={(err) => pushConsole('error', err)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
