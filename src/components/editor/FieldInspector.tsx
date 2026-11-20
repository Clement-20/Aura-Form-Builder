import React, { useEffect, useMemo, useState } from 'react';
import {
  Trash,
  Copy,
  Plus,
  X,
  Check,
  TextAlignLeft,
  TextAlignCenter,
  TextAlignRight,
  ArrowBendUpLeft,
  FileText,
  SlidersHorizontal,
  HandWaving,
  Confetti,
  Columns,
  Stack,
  ChatText,
  ListNumbers,
  ArrowCounterClockwise,
  Desktop,
  DeviceTablet,
  DeviceMobile,
  EyeSlash,
  Palette,
} from '@phosphor-icons/react';
import {
  FormLayoutMode,
  FormSettings,
  FormThankYouScreen,
  FormTheme,
  FormWelcomeScreen,
} from '../../types/form';
import {
  BreakpointKey,
  CanvasViewport,
  ComponentAppearanceProps,
  ComponentNodePatch,
  ComponentWidth,
  FormComponentNode,
  FormComponentType,
  FormDesignConfig,
  FormDocument,
  FormPage,
  formComponentRegistry,
  getAllPageComponents,
  hasComponentStyleOverrides,
  RegisteredComponentIcon,
  SelectionTarget,
  SpacingToken,
  TextAlign,
} from '../../studio';
import { AnswerPipingPicker } from './AnswerPipingPicker';

function appendPipingToken(current: string, token: string): string {
  if (!current) return token;
  return /\s$/.test(current) ? `${current}${token}` : `${current} ${token}`;
}

interface FieldInspectorProps {
  document: FormDocument;
  selection: SelectionTarget;
  selectedComponent: FormComponentNode | null;
  selectedPage: FormPage | null;
  pages: FormPage[];
  onSelectTarget: (target: SelectionTarget) => void;
  onUpdateComponent: (id: string, patch: ComponentNodePatch) => void;
  onRequestDeleteComponent: (id: string) => void;
  onDuplicateComponent: (id: string) => void;
  onMoveToPage: (id: string, targetPageId: string) => void;
  onMoveOutOfContainer: (id: string) => void;
  onUpdatePage: (
    pageId: string,
    patch: Partial<Pick<FormPage, 'title' | 'description' | 'appearance' | 'layout'>>
  ) => void;
  onDuplicatePage: (pageId: string) => void;
  onRequestDeletePage: (pageId: string) => void;
  onUpdateTitle: (title: string) => void;
  onUpdateDescription: (description: string) => void;
  onUpdateLayoutMode: (mode: FormLayoutMode) => void;
  onUpdateGlobalSettings: (patch: Partial<FormSettings>) => void;
  onUpdateDesign: (patch: Partial<FormDesignConfig | FormTheme>) => void;
  onUpdateWelcomeScreen: (patch: Partial<FormWelcomeScreen>) => void;
  onUpdateThankYouScreen: (patch: Partial<FormThankYouScreen>) => void;
  canvasViewport?: CanvasViewport;
  onResetComponentAppearance?: (id: string) => void;
  isMobileDrawer?: boolean;
  onCloseMobile?: () => void;
  isReadOnly?: boolean;
}

const ACCENT_SWATCHES = ['#0F766E', '#0B0D0F', '#2563EB', '#7C3AED', '#DC2626', '#D97706'];
const SURFACE_SWATCHES = [
  { label: 'Theme', value: '' },
  { label: 'White', value: '#FFFFFF' },
  { label: 'Alabaster', value: '#F7F6F3' },
  { label: 'Tint', value: '#F0FDFA' },
  { label: 'Slate', value: '#F1F5F9' },
  { label: 'Ink', value: '#0B0D0F' },
];

export const FieldInspector: React.FC<FieldInspectorProps> = ({
  document,
  selection,
  selectedComponent,
  selectedPage,
  pages,
  onSelectTarget,
  onUpdateComponent,
  onRequestDeleteComponent,
  onDuplicateComponent,
  onMoveToPage,
  onMoveOutOfContainer,
  onUpdatePage,
  onDuplicatePage,
  onRequestDeletePage,
  onUpdateTitle,
  onUpdateDescription,
  onUpdateLayoutMode,
  onUpdateGlobalSettings,
  onUpdateDesign,
  onUpdateWelcomeScreen,
  onUpdateThankYouScreen,
  canvasViewport = 'desktop',
  onResetComponentAppearance,
  isMobileDrawer = false,
  onCloseMobile,
  isReadOnly = false,
}) => {
  const [componentTab, setComponentTab] = useState<'content' | 'style' | 'responsive'>('content');
  const [respDevice, setRespDevice] = useState<BreakpointKey>(canvasViewport);

  useEffect(() => {
    setRespDevice(canvasViewport);
  }, [canvasViewport]);

  const insertableDefs = useMemo(() => formComponentRegistry.listInsertable(), []);
  const isQuizMode = document.settings.isQuizMode;
  const layoutMode = document.layoutMode;

  const wrapperClass = isMobileDrawer
    ? 'w-full bg-[#FAF9F7] rounded-t-3xl max-h-[84dvh] flex flex-col overflow-hidden text-xs text-[#0B0D0F]'
    : 'hidden lg:flex w-76 xl:w-[316px] border-l border-black/[0.08] bg-white shrink-0 h-[calc(100dvh-3.5rem)] flex-col overflow-hidden text-xs text-[#0B0D0F]';

  // =========================================================================
  // 1. COMPONENT INSPECTOR
  // =========================================================================
  if (selection.kind === 'component' && selectedComponent) {
    const component = selectedComponent;
    const def = formComponentRegistry.get(component.type);
    const supports = (opt: string) => !def || def.supportedOptions.includes(opt as any);
    const options = component.content.options || [];
    const parentNode = component.parentId ? document.components[component.parentId] : null;
    const isContainer = Boolean(def?.isContainer);

    // Filter type switcher so containers switch between container types, and leaf blocks between leaf types
    const compatibleDefs = insertableDefs.filter(
      (item) => Boolean(item.isContainer) === isContainer
    );

    const handleAddOption = () => {
      onUpdateComponent(component.id, {
        content: { options: [...options, `Option ${options.length + 1}`] },
      });
    };

    const handleUpdateOption = (index: number, val: string) => {
      const next = [...options];
      next[index] = val;
      onUpdateComponent(component.id, { content: { options: next } });
    };

    const handleDeleteOption = (index: number) => {
      onUpdateComponent(component.id, {
        content: { options: options.filter((_, i) => i !== index) },
      });
    };

    const WIDTH_OPTIONS: { id: ComponentWidth; label: string }[] = [
      { id: 'full', label: 'Full' },
      { id: 'half', label: '1/2' },
      { id: 'third', label: '1/3' },
    ];

    const ALIGN_OPTIONS: {
      id: TextAlign;
      icon: React.FC<{ size?: number; weight?: 'regular' | 'bold' }>;
      label: string;
    }[] = [
      { id: 'left', icon: TextAlignLeft, label: 'Left' },
      { id: 'center', icon: TextAlignCenter, label: 'Center' },
      { id: 'right', icon: TextAlignRight, label: 'Right' },
    ];

    return (
      <aside className={wrapperClass} aria-label="Component properties inspector">
        {/* Header */}
        <div className="px-4 pt-3.5 pb-3 bg-white border-b border-black/[0.07] shrink-0">
          {isMobileDrawer && <div className="w-10 h-1 rounded-full bg-black/15 mx-auto mb-3" />}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-lg bg-[#F7F6F3] text-[#0F766E] flex items-center justify-center shrink-0">
                <RegisteredComponentIcon type={component.type} size={16} />
              </span>
              <div className="min-w-0">
                <span className="font-display font-semibold text-sm text-[#0B0D0F] block truncate">
                  {def?.displayName || component.type}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#5C6066]">
                  {isContainer ? 'Layout Container' : def?.isQuestion ? 'Form Field' : 'Content Block'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {!isReadOnly && (
                <>
                  <button
                    type="button"
                    onClick={() => onDuplicateComponent(component.id)}
                    className="w-7 h-7 rounded-lg hover:bg-black/[0.05] text-[#5C6066] hover:text-[#0B0D0F] flex items-center justify-center transition-colors"
                    title="Duplicate Block (Ctrl+D)"
                    aria-label="Duplicate Block"
                  >
                    <Copy size={14} weight="regular" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onRequestDeleteComponent(component.id);
                      if (onCloseMobile) onCloseMobile();
                    }}
                    className="w-7 h-7 rounded-lg hover:bg-rose-50 text-[#5C6066] hover:text-rose-600 flex items-center justify-center transition-colors"
                    title="Delete Block"
                    aria-label="Delete Block"
                  >
                    <Trash size={14} weight="regular" />
                  </button>
                </>
              )}
              {isMobileDrawer && onCloseMobile && (
                <button
                  type="button"
                  onClick={onCloseMobile}
                  className="w-7 h-7 rounded-lg bg-black/[0.05] text-[#0B0D0F] flex items-center justify-center ml-0.5"
                  aria-label="Close Inspector"
                >
                  <X size={14} weight="bold" />
                </button>
              )}
            </div>
          </div>

          {/* Nested Container Breadcrumb & Move Out Action */}
          {parentNode && (
            <div className="mt-2.5 pt-2.5 border-t border-black/[0.06] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onSelectTarget({ kind: 'component', id: parentNode.id })}
                className="text-[11px] text-[#5C6066] hover:text-[#0B0D0F] truncate"
              >
                Inside:{' '}
                <strong className="font-semibold text-[#0B0D0F]">
                  {parentNode.content.label || formComponentRegistry.get(parentNode.type)?.shortLabel}
                </strong>
              </button>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => onMoveOutOfContainer(component.id)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#F7F6F3] hover:bg-[#EAE7E1] text-[10px] font-semibold text-[#0B0D0F] shrink-0"
                  title="Move block out of container"
                >
                  <ArrowBendUpLeft size={11} weight="bold" />
                  <span>Move out</span>
                </button>
              )}
            </div>
          )}

          {/* Inspector Sub-Tabs: Content | Style | Responsive */}
          <div className="mt-3 grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#F7F6F3] border border-black/[0.06]">
            {(
              [
                { id: 'content', label: 'Content' },
                { id: 'style', label: 'Style', dot: hasComponentStyleOverrides(component) },
                {
                  id: 'responsive',
                  label: 'Device',
                  dot: Boolean(
                    component.layout.responsive?.desktop ||
                      component.layout.responsive?.tablet ||
                      component.layout.responsive?.mobile
                  ),
                },
              ] as const
            ).map((tab) => {
              const active = componentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setComponentTab(tab.id)}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    active ? 'bg-white text-[#0B0D0F] shadow-2xs' : 'text-[#5C6066] hover:text-[#0B0D0F]'
                  }`}
                >
                  <span>{tab.label}</span>
                  {'dot' in tab && tab.dot && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0F766E]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Contextual Controls */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {componentTab === 'content' && (
            <>
          {/* CONTENT */}
          <div className="space-y-3.5">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
              Content
            </span>

            <div className="space-y-1">
              <label className="font-semibold text-[#0B0D0F] block">Block Type</label>
              <select
                disabled={isReadOnly}
                value={component.type}
                onChange={(e) => {
                  const nextType = e.target.value as FormComponentType;
                  const nextDef = formComponentRegistry.get(nextType);
                  onUpdateComponent(component.id, {
                    type: nextType,
                    ...(nextDef?.isContainer
                      ? { layout: { columns: nextDef.defaultLayout.columns || 1 } }
                      : {}),
                  });
                }}
                className="w-full px-3 py-2 rounded-lg bg-[#F7F6F3] focus:bg-white border border-black/[0.08] text-xs font-medium focus:border-[#0F766E] focus:outline-none disabled:opacity-60"
              >
                {compatibleDefs.map((item) => (
                  <option key={item.type} value={item.type}>
                    {item.displayName}
                  </option>
                ))}
              </select>
            </div>

            {supports('label') && (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="font-semibold text-[#0B0D0F] block">
                    {def?.isQuestion === false ? 'Heading / Title' : 'Question Label'}
                  </label>
                  <AnswerPipingPicker
                    document={document}
                    disabled={isReadOnly}
                    onInsertToken={(token) =>
                      onUpdateComponent(component.id, {
                        content: { label: appendPipingToken(component.content.label || '', token) },
                      })
                    }
                  />
                </div>
                <textarea
                  rows={2}
                  disabled={isReadOnly}
                  value={component.content.label}
                  onChange={(e) =>
                    onUpdateComponent(component.id, { content: { label: e.target.value } })
                  }
                  placeholder="Enter text..."
                  className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/15 focus:outline-none resize-none font-medium disabled:opacity-60"
                />
              </div>
            )}

            {supports('headingLevel') && (
              <div className="space-y-1">
                <label className="font-semibold text-[#0B0D0F] block">Heading Size</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([1, 2, 3] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      disabled={isReadOnly}
                      onClick={() =>
                        onUpdateComponent(component.id, { content: { headingLevel: lvl } })
                      }
                      className={`py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
                        (component.content.headingLevel || 2) === lvl
                          ? 'bg-[#0B0D0F] text-[#F7F6F3]'
                          : 'bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F]'
                      }`}
                    >
                      H{lvl}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {supports('body') && (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="font-semibold text-[#0B0D0F] block">Body Copy</label>
                  <AnswerPipingPicker
                    document={document}
                    disabled={isReadOnly}
                    onInsertToken={(token) => {
                      const next = appendPipingToken(
                        component.content.body ?? component.content.helpText ?? '',
                        token
                      );
                      onUpdateComponent(component.id, {
                        content: { body: next, helpText: next },
                      });
                    }}
                  />
                </div>
                <textarea
                  rows={4}
                  disabled={isReadOnly}
                  value={component.content.body ?? component.content.helpText ?? ''}
                  onChange={(e) =>
                    onUpdateComponent(component.id, {
                      content: { body: e.target.value, helpText: e.target.value },
                    })
                  }
                  placeholder="Write copy or instructions..."
                  className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none resize-y disabled:opacity-60"
                />
              </div>
            )}

            {supports('helpText') && !supports('body') && (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="font-semibold text-[#0B0D0F] block">
                    Helper Text <span className="font-normal text-[#5C6066]">(Optional)</span>
                  </label>
                  <AnswerPipingPicker
                    document={document}
                    disabled={isReadOnly}
                    onInsertToken={(token) =>
                      onUpdateComponent(component.id, {
                        content: {
                          helpText: appendPipingToken(component.content.helpText || '', token),
                        },
                      })
                    }
                  />
                </div>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={component.content.helpText || ''}
                  onChange={(e) =>
                    onUpdateComponent(component.id, { content: { helpText: e.target.value } })
                  }
                  placeholder="Clarify what respondents should enter..."
                  className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none disabled:opacity-60"
                />
              </div>
            )}

            {supports('placeholder') && (
              <div className="space-y-1">
                <label className="font-semibold text-[#0B0D0F] block">Placeholder</label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={component.content.placeholder || ''}
                  onChange={(e) =>
                    onUpdateComponent(component.id, { content: { placeholder: e.target.value } })
                  }
                  placeholder="e.g. Type your answer..."
                  className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none disabled:opacity-60"
                />
              </div>
            )}

            {supports('media') && (
              <div className="space-y-2.5 pt-1">
                <div className="space-y-1">
                  <label className="font-semibold text-[#0B0D0F] block">Image URL</label>
                  <input
                    type="url"
                    disabled={isReadOnly}
                    value={component.content.mediaUrl || ''}
                    onChange={(e) =>
                      onUpdateComponent(component.id, { content: { mediaUrl: e.target.value } })
                    }
                    placeholder="https://images.unsplash.com/..."
                    className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none disabled:opacity-60"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-[#0B0D0F] block">Alt Text</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={component.content.mediaAlt || ''}
                    onChange={(e) =>
                      onUpdateComponent(component.id, { content: { mediaAlt: e.target.value } })
                    }
                    placeholder="Describe the image for accessibility..."
                    className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none disabled:opacity-60"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-[#0B0D0F] block">Caption</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={component.content.mediaCaption || ''}
                    onChange={(e) =>
                      onUpdateComponent(component.id, {
                        content: { mediaCaption: e.target.value },
                      })
                    }
                    placeholder="Optional caption below image..."
                    className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none disabled:opacity-60"
                  />
                </div>
              </div>
            )}

            {supports('mediaPosition') && (
              <div className="space-y-1">
                <label className="font-semibold text-[#0B0D0F] block">Image Position</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['left', 'right'] as const).map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      disabled={isReadOnly}
                      onClick={() =>
                        onUpdateComponent(component.id, { content: { mediaPosition: pos } })
                      }
                      className={`py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                        (component.content.mediaPosition || 'left') === pos
                          ? 'bg-[#0B0D0F] text-white'
                          : 'bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F]'
                      }`}
                    >
                      Image {pos}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {supports('video') && (
              <div className="space-y-1">
                <label className="font-semibold text-[#0B0D0F] block">
                  Video URL (YouTube, Vimeo, or MP4)
                </label>
                <input
                  type="url"
                  disabled={isReadOnly}
                  value={component.content.videoUrl || ''}
                  onChange={(e) =>
                    onUpdateComponent(component.id, { content: { videoUrl: e.target.value } })
                  }
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none disabled:opacity-60"
                />
              </div>
            )}

            {supports('spacerSize') && (
              <div className="space-y-1">
                <label className="font-semibold text-[#0B0D0F] block">Spacer Height</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['sm', 'md', 'lg'] as const).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      disabled={isReadOnly}
                      onClick={() =>
                        onUpdateComponent(component.id, { content: { spacerSize: sz } })
                      }
                      className={`py-1.5 rounded-lg text-[11px] font-mono uppercase font-semibold transition-all ${
                        (component.content.spacerSize || 'md') === sz
                          ? 'bg-[#0B0D0F] text-white'
                          : 'bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F]'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {supports('fileUpload') && (
              <div className="space-y-2.5 pt-1">
                <div className="space-y-1">
                  <label className="font-semibold text-[#0B0D0F] block">Accepted File Types</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={component.content.acceptedFileTypes || '.pdf,.png,.jpg,.docx'}
                    onChange={(e) =>
                      onUpdateComponent(component.id, {
                        content: { acceptedFileTypes: e.target.value },
                      })
                    }
                    placeholder=".pdf,.png,.jpg"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none disabled:opacity-60 font-mono text-[11px]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-[#0B0D0F] block">Max File Size (MB)</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    disabled={isReadOnly}
                    value={component.content.maxFileSizeMb ?? 10}
                    onChange={(e) =>
                      onUpdateComponent(component.id, {
                        content: { maxFileSizeMb: Math.max(1, Number(e.target.value) || 10) },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none disabled:opacity-60"
                  />
                </div>
              </div>
            )}
          </div>

          {/* CHOICES */}
          {supports('options') && (
            <div className="space-y-2.5 pt-4 border-t border-black/[0.07]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066]">
                  Answer Choices
                </span>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={handleAddOption}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#0F766E]/10 text-[#0F766E] hover:bg-[#0F766E]/15 font-semibold text-[11px] transition-colors"
                  >
                    <Plus size={11} weight="bold" />
                    <span>Add</span>
                  </button>
                )}
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      disabled={isReadOnly}
                      value={opt}
                      onChange={(e) => handleUpdateOption(i, e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none disabled:opacity-60"
                    />
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => handleDeleteOption(i)}
                        className="w-7 h-7 rounded-lg text-[#5C6066] hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center shrink-0"
                        title="Remove choice"
                        aria-label="Remove choice"
                      >
                        <X size={13} weight="bold" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LAYOUT & STYLE */}
          <div className="pt-4 border-t border-black/[0.07] space-y-3.5">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
              Layout &amp; Style
            </span>

            {supports('containerLayout') && (
              <>
                <div className="space-y-1">
                  <label className="font-semibold text-[#0B0D0F] flex items-center gap-1.5">
                    <Columns size={13} weight="regular" className="text-[#0F766E]" />
                    <span>Columns</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([1, 2, 3] as const).map((cols) => {
                      const active = (component.layout.columns || 1) === cols;
                      return (
                        <button
                          key={cols}
                          type="button"
                          disabled={isReadOnly}
                          onClick={() =>
                            onUpdateComponent(component.id, { layout: { columns: cols } })
                          }
                          className={`py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 ${
                            active
                              ? 'bg-[#0B0D0F] text-white'
                              : 'bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F]'
                          }`}
                        >
                          {cols} {cols === 1 ? 'Col' : 'Cols'}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-[#0B0D0F] block">Inner Gap</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['sm', 'md', 'lg'] as SpacingToken[]).map((gap) => (
                      <button
                        key={gap}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => onUpdateComponent(component.id, { layout: { gap } })}
                        className={`py-1.5 rounded-lg text-xs font-mono uppercase font-semibold transition-all disabled:opacity-50 ${
                          (component.layout.gap || 'md') === gap
                            ? 'bg-[#0B0D0F] text-white'
                            : 'bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F]'
                        }`}
                      >
                        {gap}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {supports('width') && !parentNode && (
              <div className="space-y-1">
                <label className="font-semibold text-[#0B0D0F] block">Block Width</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {WIDTH_OPTIONS.map((w) => {
                    const active = (component.layout.width || 'full') === w.id;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() =>
                          onUpdateComponent(component.id, { layout: { width: w.id } })
                        }
                        className={`py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 ${
                          active
                            ? 'bg-[#0B0D0F] text-white'
                            : 'bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F]'
                        }`}
                      >
                        {w.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {supports('textAlign') && (
              <div className="space-y-1">
                <label className="font-semibold text-[#0B0D0F] block">Alignment</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {ALIGN_OPTIONS.map((align) => {
                    const Icon = align.icon;
                    const active = (component.appearance.textAlign || 'left') === align.id;
                    return (
                      <button
                        key={align.id}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() =>
                          onUpdateComponent(component.id, { appearance: { textAlign: align.id } })
                        }
                        className={`py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-all disabled:opacity-50 ${
                          active
                            ? 'bg-[#0B0D0F] text-white'
                            : 'bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F]'
                        }`}
                      >
                        <Icon size={13} weight={active ? 'bold' : 'regular'} />
                        <span>{align.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {supports('backgroundColor') && (
              <div className="space-y-1.5">
                <label className="font-semibold text-[#0B0D0F] block">Surface Fill</label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {SURFACE_SWATCHES.map((swatch) => {
                    const active = (component.appearance.backgroundColor || '') === swatch.value;
                    return (
                      <button
                        key={swatch.label}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() =>
                          onUpdateComponent(component.id, {
                            appearance: { backgroundColor: swatch.value || undefined },
                          })
                        }
                        className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-all ${
                          active
                            ? 'border-[#0F766E] bg-[#0F766E]/10 text-[#0F766E] font-semibold'
                            : 'border-black/[0.1] bg-white text-[#5C6066] hover:text-[#0B0D0F]'
                        }`}
                      >
                        {swatch.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {pages.length > 1 && !parentNode && (
              <div className="space-y-1">
                <label className="font-semibold text-[#0B0D0F] block">Page</label>
                <select
                  disabled={isReadOnly}
                  value={component.pageId}
                  onChange={(e) => onMoveToPage(component.id, e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#F7F6F3] focus:bg-white border border-black/[0.08] focus:border-[#0F766E] focus:outline-none disabled:opacity-60"
                >
                  {pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      Page {p.index}: {p.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* VALIDATION */}
          {(supports('required') || supports('minMax')) && (
            <div className="pt-4 border-t border-black/[0.07] space-y-3">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
                Validation
              </span>

              {supports('required') && (
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() =>
                    onUpdateComponent(component.id, {
                      validation: { required: !component.validation.required },
                    })
                  }
                  className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between transition-all disabled:opacity-60 border ${
                    component.validation.required
                      ? 'bg-[#0B0D0F] text-white border-[#0B0D0F]'
                      : 'bg-[#F7F6F3] text-[#0B0D0F] border-black/[0.07]'
                  }`}
                >
                  <span className="font-semibold text-xs">Required Field</span>
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center ${
                      component.validation.required
                        ? 'bg-emerald-500 text-white'
                        : 'bg-black/[0.08] text-transparent'
                    }`}
                  >
                    <Check size={11} weight="bold" />
                  </span>
                </button>
              )}

              {supports('required') && component.validation.required && (
                <div className="space-y-1">
                  <label className="font-semibold text-[#0B0D0F] block">
                    Custom Error Message
                  </label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={component.validation.customErrorMessage || ''}
                    onChange={(e) =>
                      onUpdateComponent(component.id, {
                        validation: { customErrorMessage: e.target.value },
                      })
                    }
                    placeholder="This field is required."
                    className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none disabled:opacity-60"
                  />
                </div>
              )}

              {supports('minMax') && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="font-semibold text-[#0B0D0F] block">Min</label>
                    <input
                      type="number"
                      disabled={isReadOnly}
                      value={component.validation.min ?? ''}
                      onChange={(e) =>
                        onUpdateComponent(component.id, {
                          validation: {
                            min: e.target.value === '' ? undefined : Number(e.target.value),
                          },
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-[#0B0D0F] block">Max</label>
                    <input
                      type="number"
                      disabled={isReadOnly}
                      value={component.validation.max ?? ''}
                      onChange={(e) =>
                        onUpdateComponent(component.id, {
                          validation: {
                            max: e.target.value === '' ? undefined : Number(e.target.value),
                          },
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* QUIZ SCORING */}
          {isQuizMode && supports('quizScoring') && (
            <div className="space-y-3 pt-4 border-t border-black/[0.07]">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0F766E] block">
                Quiz Scoring
              </span>
              <div className="space-y-1">
                <label className="font-semibold text-[#0B0D0F] block">Points</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  disabled={isReadOnly}
                  value={component.behaviour.points ?? 10}
                  onChange={(e) =>
                    onUpdateComponent(component.id, {
                      behaviour: { points: parseInt(e.target.value, 10) || 0 },
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none"
                />
              </div>

              {(component.type === 'radio' ||
                component.type === 'select' ||
                component.type === 'yes_no') && (
                <div className="space-y-1">
                  <label className="font-semibold text-[#0B0D0F] block">Correct Answer</label>
                  <select
                    disabled={isReadOnly}
                    value={String(component.behaviour.correctAnswer || '')}
                    onChange={(e) =>
                      onUpdateComponent(component.id, {
                        behaviour: { correctAnswer: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none"
                  >
                    <option value="">Not graded</option>
                    {(component.type === 'yes_no'
                      ? ['Yes', 'No']
                      : component.content.options || []
                    ).map((opt, i) => (
                      <option key={i} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
            </>
          )}

          {/* =============================================================== */}
          {/* COMPONENT STYLE OVERRIDES TAB (Inherits Global Theme by Default) */}
          {/* =============================================================== */}
          {componentTab === 'style' && (() => {
            const a = component.appearance || {};
            const hasOverrides = hasComponentStyleOverrides(component);
            const isImageBlock = component.type === 'image' || component.type === 'image_text';
            const isQuestionBlock = Boolean(def?.isQuestion);

            const updateAppearance = (patch: Partial<ComponentAppearanceProps>) => {
              onUpdateComponent(component.id, { appearance: patch });
            };

            return (
              <div className="space-y-5">
                {/* Reset to Global Theme Header */}
                <div className="p-3 rounded-xl bg-[#F7F6F3] border border-black/[0.07] flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-semibold text-[#0B0D0F] text-[11px] flex items-center gap-1.5">
                      <Palette size={13} className="text-[#0F766E]" />
                      <span>{hasOverrides ? 'Custom style overrides' : 'Inheriting form theme'}</span>
                    </span>
                    <span className="text-[10px] text-[#5C6066] block mt-0.5">
                      Override any property individually or reset to global tokens.
                    </span>
                  </div>
                  {hasOverrides && !isReadOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        if (onResetComponentAppearance) {
                          onResetComponentAppearance(component.id);
                        } else {
                          onUpdateComponent(component.id, { appearance: {} });
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-[#0B0D0F] text-[#0B0D0F] hover:text-white border border-black/[0.1] text-[10px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                    >
                      <ArrowCounterClockwise size={11} weight="bold" />
                      <span>Reset to Theme</span>
                    </button>
                  )}
                </div>

                {/* TYPOGRAPHY OVERRIDES */}
                <div className="space-y-3">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
                    Typography
                  </span>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="font-semibold text-[#0B0D0F] block">Font Family</label>
                      <select
                        disabled={isReadOnly}
                        value={a.fontFamily || ''}
                        onChange={(e) =>
                          updateAppearance({ fontFamily: (e.target.value || undefined) as any })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08]"
                      >
                        <option value="">Inherit theme</option>
                        <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
                        <option value="DM Sans">DM Sans</option>
                        <option value="Outfit">Outfit</option>
                        <option value="Inter">Inter</option>
                        <option value="Bricolage Grotesque">Bricolage Grotesque</option>
                        <option value="Playfair Display">Playfair Display</option>
                        <option value="JetBrains Mono">JetBrains Mono</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-[#0B0D0F] block">Text Size</label>
                      <select
                        disabled={isReadOnly}
                        value={a.fontSize || ''}
                        onChange={(e) =>
                          updateAppearance({ fontSize: (e.target.value || undefined) as any })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08]"
                      >
                        <option value="">Inherit theme</option>
                        <option value="xs">XS (12px)</option>
                        <option value="sm">SM (14px)</option>
                        <option value="base">Base (15px)</option>
                        <option value="lg">LG (18px)</option>
                        <option value="xl">XL (22px)</option>
                        <option value="2xl">2XL (28px)</option>
                        <option value="3xl">3XL (34px)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-[#0B0D0F] block">Weight</label>
                      <select
                        disabled={isReadOnly}
                        value={a.fontWeight || ''}
                        onChange={(e) =>
                          updateAppearance({ fontWeight: (e.target.value || undefined) as any })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08]"
                      >
                        <option value="">Inherit</option>
                        <option value="normal">Regular</option>
                        <option value="medium">Medium</option>
                        <option value="semibold">Semibold</option>
                        <option value="bold">Bold</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-[#0B0D0F] block">Line Height</label>
                      <select
                        disabled={isReadOnly}
                        value={a.lineHeight || ''}
                        onChange={(e) =>
                          updateAppearance({ lineHeight: (e.target.value || undefined) as any })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08]"
                      >
                        <option value="">Inherit</option>
                        <option value="tight">Tight</option>
                        <option value="normal">Normal</option>
                        <option value="relaxed">Relaxed</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="font-semibold text-[#0B0D0F] block">Text Colour</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          disabled={isReadOnly}
                          value={a.textColor || document.design.textColor || '#0B0D0F'}
                          onChange={(e) => updateAppearance({ textColor: e.target.value })}
                          className="w-7 h-7 rounded-md border border-black/15 p-0.5 cursor-pointer bg-white"
                        />
                        <input
                          type="text"
                          disabled={isReadOnly}
                          value={a.textColor || ''}
                          placeholder="Theme"
                          onChange={(e) =>
                            updateAppearance({ textColor: e.target.value || undefined })
                          }
                          className="flex-1 min-w-0 px-2 py-1 rounded-md bg-[#F7F6F3] border border-black/[0.08] font-mono text-[10px]"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-[#0B0D0F] block">Bottom Spacing</label>
                      <select
                        disabled={isReadOnly}
                        value={a.spacingBottom || ''}
                        onChange={(e) =>
                          updateAppearance({ spacingBottom: (e.target.value || undefined) as any })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08]"
                      >
                        <option value="">Default</option>
                        <option value="none">None</option>
                        <option value="sm">Small</option>
                        <option value="md">Medium</option>
                        <option value="lg">Large</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-[#0B0D0F] block">Alignment</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {ALIGN_OPTIONS.map((align) => {
                        const Icon = align.icon;
                        const active = (a.textAlign || 'left') === align.id;
                        return (
                          <button
                            key={align.id}
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => updateAppearance({ textAlign: align.id })}
                            className={`py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-all ${
                              active
                                ? 'bg-[#0B0D0F] text-white'
                                : 'bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F]'
                            }`}
                          >
                            <Icon size={13} weight={active ? 'bold' : 'regular'} />
                            <span>{align.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* INPUT STYLING OVERRIDES (For Question Fields) */}
                {isQuestionBlock && (
                  <div className="space-y-3 pt-4 border-t border-black/[0.07]">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
                      Input Styling
                    </span>
                    <div className="grid grid-cols-2 gap-2.5">
                      {(
                        [
                          { key: 'inputBackgroundColor', label: 'Input Fill', fb: '#FAF9F7' },
                          { key: 'inputBorderColor', label: 'Border Colour', fb: '#D6D3CD' },
                          { key: 'inputTextColor', label: 'Input Text', fb: '#0B0D0F' },
                          { key: 'inputPlaceholderColor', label: 'Placeholder', fb: '#787C82' },
                          { key: 'inputFocusColor', label: 'Focus State', fb: '#0F766E' },
                          { key: 'inputErrorColor', label: 'Error State', fb: '#DC2626' },
                        ] as const
                      ).map((field) => (
                        <div key={field.key} className="space-y-1">
                          <label className="text-[11px] font-semibold text-[#0B0D0F] block">
                            {field.label}
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              disabled={isReadOnly}
                              value={(a[field.key] as string) || field.fb}
                              onChange={(e) =>
                                updateAppearance({ [field.key]: e.target.value })
                              }
                              className="w-7 h-7 rounded-md border border-black/15 p-0.5 cursor-pointer bg-white shrink-0"
                            />
                            <input
                              type="text"
                              disabled={isReadOnly}
                              value={(a[field.key] as string) || ''}
                              placeholder="Theme"
                              onChange={(e) =>
                                updateAppearance({ [field.key]: e.target.value || undefined })
                              }
                              className="flex-1 min-w-0 px-2 py-1 rounded-md bg-[#F7F6F3] border border-black/[0.08] font-mono text-[10px]"
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-[#0B0D0F] block">Input Radius</label>
                      <select
                        disabled={isReadOnly}
                        value={a.inputRadius || ''}
                        onChange={(e) =>
                          updateAppearance({ inputRadius: (e.target.value || undefined) as any })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08]"
                      >
                        <option value="">Inherit theme</option>
                        <option value="none">Sharp (0px)</option>
                        <option value="sm">Small (4px)</option>
                        <option value="md">Medium (8px)</option>
                        <option value="lg">Large (12px)</option>
                        <option value="full">Pill (Full)</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* IMAGE STYLING OVERRIDES */}
                {isImageBlock && (
                  <div className="space-y-3 pt-4 border-t border-black/[0.07]">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
                      Image Appearance
                    </span>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="font-semibold text-[#0B0D0F] block">Width</label>
                        <select
                          disabled={isReadOnly}
                          value={a.imageWidth || 'full'}
                          onChange={(e) =>
                            updateAppearance({ imageWidth: e.target.value as any })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08]"
                        >
                          <option value="full">Full (100%)</option>
                          <option value="3/4">Three-Quarters (75%)</option>
                          <option value="1/2">Half (50%)</option>
                          <option value="auto">Auto</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="font-semibold text-[#0B0D0F] block">Height</label>
                        <select
                          disabled={isReadOnly}
                          value={a.imageHeight || 'auto'}
                          onChange={(e) =>
                            updateAppearance({ imageHeight: e.target.value as any })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08]"
                        >
                          <option value="auto">Auto</option>
                          <option value="sm">Compact (160px)</option>
                          <option value="md">Medium (240px)</option>
                          <option value="lg">Tall (320px)</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="font-semibold text-[#0B0D0F] block">Aspect Ratio</label>
                        <select
                          disabled={isReadOnly}
                          value={a.aspectRatio || 'auto'}
                          onChange={(e) =>
                            updateAppearance({ aspectRatio: e.target.value as any })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08]"
                        >
                          <option value="auto">Original</option>
                          <option value="16/9">16:9 Widescreen</option>
                          <option value="4/3">4:3 Classic</option>
                          <option value="1/1">1:1 Square</option>
                          <option value="3/4">3:4 Portrait</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="font-semibold text-[#0B0D0F] block">Object Fit</label>
                        <select
                          disabled={isReadOnly}
                          value={a.objectFit || 'cover'}
                          onChange={(e) =>
                            updateAppearance({ objectFit: e.target.value as any })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08]"
                        >
                          <option value="cover">Cover (Crop to fill)</option>
                          <option value="contain">Contain (No crop)</option>
                          <option value="fill">Stretch to fill</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="font-semibold text-[#0B0D0F] block">Focal Position</label>
                        <select
                          disabled={isReadOnly}
                          value={a.objectPosition || 'center'}
                          onChange={(e) =>
                            updateAppearance({ objectPosition: e.target.value as any })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08]"
                        >
                          <option value="center">Center</option>
                          <option value="top">Top</option>
                          <option value="bottom">Bottom</option>
                          <option value="left">Left</option>
                          <option value="right">Right</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="font-semibold text-[#0B0D0F] block">Alignment</label>
                        <select
                          disabled={isReadOnly}
                          value={a.imageAlignment || 'left'}
                          onChange={(e) =>
                            updateAppearance({ imageAlignment: e.target.value as any })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08]"
                        >
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* SURFACE, BORDER, SHADOW & SPACING */}
                <div className="space-y-3 pt-4 border-t border-black/[0.07]">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
                    Surface, Border &amp; Effects
                  </span>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-[#0B0D0F] block">Background Colour</label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {SURFACE_SWATCHES.map((swatch) => {
                        const active = (a.backgroundColor || '') === swatch.value;
                        return (
                          <button
                            key={swatch.label}
                            type="button"
                            disabled={isReadOnly}
                            onClick={() =>
                              updateAppearance({ backgroundColor: swatch.value || undefined })
                            }
                            className={`px-2 py-1 rounded-md text-[10px] font-medium border transition-all ${
                              active
                                ? 'border-[#0F766E] bg-[#0F766E]/10 text-[#0F766E] font-semibold'
                                : 'border-black/[0.1] bg-white text-[#5C6066] hover:text-[#0B0D0F]'
                            }`}
                          >
                            {swatch.label}
                          </button>
                        );
                      })}
                      <input
                        type="color"
                        disabled={isReadOnly}
                        value={a.backgroundColor || '#FFFFFF'}
                        onChange={(e) => updateAppearance({ backgroundColor: e.target.value })}
                        title="Custom background colour"
                        className="w-6 h-6 rounded border border-black/15 cursor-pointer bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="font-semibold text-[#0B0D0F] block">Border Colour</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          disabled={isReadOnly}
                          value={a.borderColor || '#E5E2DC'}
                          onChange={(e) => updateAppearance({ borderColor: e.target.value })}
                          className="w-7 h-7 rounded-md border border-black/15 p-0.5 cursor-pointer bg-white"
                        />
                        <input
                          type="text"
                          disabled={isReadOnly}
                          value={a.borderColor || ''}
                          placeholder="Theme"
                          onChange={(e) =>
                            updateAppearance({ borderColor: e.target.value || undefined })
                          }
                          className="flex-1 min-w-0 px-2 py-1 rounded-md bg-[#F7F6F3] border border-black/[0.08] font-mono text-[10px]"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-[#0B0D0F] block">Border Width</label>
                      <select
                        disabled={isReadOnly}
                        value={a.borderWidth || ''}
                        onChange={(e) =>
                          updateAppearance({ borderWidth: (e.target.value || undefined) as any })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08]"
                      >
                        <option value="">Default</option>
                        <option value="0">None (0px)</option>
                        <option value="1">Hairline (1px)</option>
                        <option value="2">Bold (2px)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-[#0B0D0F] block">Corner Radius</label>
                      <select
                        disabled={isReadOnly}
                        value={a.borderRadius || ''}
                        onChange={(e) =>
                          updateAppearance({ borderRadius: (e.target.value || undefined) as any })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08]"
                      >
                        <option value="">Inherit theme</option>
                        <option value="none">None (0px)</option>
                        <option value="sm">Small</option>
                        <option value="md">Medium</option>
                        <option value="lg">Large</option>
                        <option value="full">Extra Rounded</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-[#0B0D0F] block">Shadow</label>
                      <select
                        disabled={isReadOnly}
                        value={a.shadow || ''}
                        onChange={(e) =>
                          updateAppearance({ shadow: (e.target.value || undefined) as any })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08]"
                      >
                        <option value="">None</option>
                        <option value="sm">Subtle</option>
                        <option value="md">Medium</option>
                        <option value="lg">Elevated</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-[#0B0D0F] block">Inner Padding</label>
                    <div className="grid grid-cols-4 gap-1">
                      {(['none', 'sm', 'md', 'lg'] as SpacingToken[]).map((pad) => (
                        <button
                          key={pad}
                          type="button"
                          disabled={isReadOnly}
                          onClick={() =>
                            onUpdateComponent(component.id, { layout: { padding: pad } })
                          }
                          className={`py-1.5 rounded-lg font-mono text-[10px] uppercase font-semibold ${
                            (component.layout.padding || 'none') === pad
                              ? 'bg-[#0B0D0F] text-white'
                              : 'bg-[#F7F6F3] text-[#5C6066]'
                          }`}
                        >
                          {pad}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-[#0B0D0F] block">Accent Colour</label>
                    <div className="flex items-center gap-1.5">
                      {ACCENT_SWATCHES.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => updateAppearance({ accentColor: hex })}
                          className={`w-6 h-6 rounded-full border transition-transform ${
                            a.accentColor === hex
                              ? 'scale-110 ring-2 ring-offset-1 ring-[#0B0D0F]'
                              : 'border-black/15'
                          }`}
                          style={{ backgroundColor: hex }}
                          aria-label={`Accent ${hex}`}
                        />
                      ))}
                      <input
                        type="color"
                        disabled={isReadOnly}
                        value={a.accentColor || document.design.primaryColor || '#0F766E'}
                        onChange={(e) => updateAppearance({ accentColor: e.target.value })}
                        className="w-6 h-6 rounded border border-black/15 cursor-pointer bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* =============================================================== */}
          {/* COMPONENT RESPONSIVE OVERRIDES TAB (Desktop / Tablet / Mobile)  */}
          {/* =============================================================== */}
          {componentTab === 'responsive' && (() => {
            const deviceRule = component.layout.responsive?.[respDevice] || {};
            const updateDeviceRule = (
              patch: Partial<{
                hidden: boolean;
                width: ComponentWidth;
                columns: 1 | 2 | 3;
                padding: SpacingToken;
                textAlign: TextAlign;
              }>
            ) => {
              onUpdateComponent(component.id, {
                layout: {
                  responsive: {
                    [respDevice]: {
                      ...deviceRule,
                      ...patch,
                    },
                  },
                },
              });
            };

            const clearDeviceRule = () => {
              const nextResp = { ...(component.layout.responsive || {}) };
              delete nextResp[respDevice];
              onUpdateComponent(component.id, {
                layout: {
                  responsive: {
                    [respDevice]: {
                      hidden: undefined,
                      width: undefined,
                      columns: undefined,
                      padding: undefined,
                      textAlign: undefined,
                    },
                  },
                },
              });
            };

            return (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-[#F7F6F3] border border-black/[0.07] space-y-2.5">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
                    Target Breakpoint
                  </span>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        { id: 'desktop', label: 'Desktop', icon: Desktop },
                        { id: 'tablet', label: 'Tablet', icon: DeviceTablet },
                        { id: 'mobile', label: 'Mobile', icon: DeviceMobile },
                      ] as const
                    ).map((d) => {
                      const Icon = d.icon;
                      const active = respDevice === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setRespDevice(d.id)}
                          className={`py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-all ${
                            active ? 'bg-[#0B0D0F] text-white' : 'bg-white text-[#5C6066]'
                          }`}
                        >
                          <Icon size={13} weight={active ? 'bold' : 'regular'} />
                          <span>{d.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Visibility Toggle */}
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => updateDeviceRule({ hidden: !deviceRule.hidden })}
                  className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between border transition-all ${
                    deviceRule.hidden
                      ? 'bg-amber-50 border-amber-300 text-amber-950'
                      : 'bg-white border-black/[0.08] text-[#0B0D0F]'
                  }`}
                >
                  <span className="font-semibold text-xs flex items-center gap-1.5">
                    <EyeSlash size={14} weight={deviceRule.hidden ? 'fill' : 'regular'} />
                    <span>Hide block on {respDevice}</span>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold ${
                      deviceRule.hidden ? 'bg-amber-200 text-amber-950' : 'bg-[#F7F6F3] text-[#5C6066]'
                    }`}
                  >
                    {deviceRule.hidden ? 'Hidden' : 'Visible'}
                  </span>
                </button>

                {/* Device Width */}
                {!parentNode && (
                  <div className="space-y-1">
                    <label className="font-semibold text-[#0B0D0F] block">
                      Width on {respDevice}
                    </label>
                    <select
                      disabled={isReadOnly}
                      value={deviceRule.width || ''}
                      onChange={(e) =>
                        updateDeviceRule({ width: (e.target.value || undefined) as any })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#F7F6F3] border border-black/[0.08]"
                    >
                      <option value="">Auto / Default</option>
                      <option value="full">Full Width (100%)</option>
                      <option value="half">Half Width (50%)</option>
                      <option value="third">One-Third (33%)</option>
                    </select>
                  </div>
                )}

                {/* Device Columns (for containers) */}
                {isContainer && (
                  <div className="space-y-1">
                    <label className="font-semibold text-[#0B0D0F] block">
                      Columns on {respDevice}
                    </label>
                    <select
                      disabled={isReadOnly}
                      value={deviceRule.columns ? String(deviceRule.columns) : ''}
                      onChange={(e) =>
                        updateDeviceRule({
                          columns: e.target.value ? (Number(e.target.value) as 1 | 2 | 3) : undefined,
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#F7F6F3] border border-black/[0.08]"
                    >
                      <option value="">Auto collapse (Recommended)</option>
                      <option value="1">1 Column</option>
                      <option value="2">2 Columns</option>
                      <option value="3">3 Columns</option>
                    </select>
                  </div>
                )}

                {/* Device Padding */}
                <div className="space-y-1">
                  <label className="font-semibold text-[#0B0D0F] block">
                    Padding on {respDevice}
                  </label>
                  <select
                    disabled={isReadOnly}
                    value={deviceRule.padding || ''}
                    onChange={(e) =>
                      updateDeviceRule({ padding: (e.target.value || undefined) as any })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#F7F6F3] border border-black/[0.08]"
                  >
                    <option value="">Inherit default</option>
                    <option value="none">None</option>
                    <option value="sm">Small</option>
                    <option value="md">Medium</option>
                    <option value="lg">Large</option>
                  </select>
                </div>

                {/* Device Text Alignment */}
                <div className="space-y-1">
                  <label className="font-semibold text-[#0B0D0F] block">
                    Alignment on {respDevice}
                  </label>
                  <select
                    disabled={isReadOnly}
                    value={deviceRule.textAlign || ''}
                    onChange={(e) =>
                      updateDeviceRule({ textAlign: (e.target.value || undefined) as any })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#F7F6F3] border border-black/[0.08]"
                  >
                    <option value="">Inherit default</option>
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>

                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={clearDeviceRule}
                    className="w-full py-2 rounded-lg bg-[#F7F6F3] hover:bg-rose-50 text-[#5C6066] hover:text-rose-600 text-[11px] font-semibold transition-colors"
                  >
                    Reset {respDevice} overrides
                  </button>
                )}
              </div>
            );
          })()}
        </div>

        {isMobileDrawer && onCloseMobile && (
          <div className="p-3 bg-white border-t border-black/[0.07] shrink-0">
            <button
              type="button"
              onClick={onCloseMobile}
              className="w-full py-2.5 rounded-xl bg-[#0B0D0F] text-white text-xs font-semibold"
            >
              Done
            </button>
          </div>
        )}
      </aside>
    );
  }

  // =========================================================================
  // 2. PAGE INSPECTOR
  // =========================================================================
  if (selection.kind === 'page' && selectedPage) {
    const pageBlockCount = getAllPageComponents(document, selectedPage.id).length;
    return (
      <aside className={wrapperClass} aria-label="Page properties inspector">
        <div className="px-4 pt-3.5 pb-3 bg-white border-b border-black/[0.07] shrink-0">
          {isMobileDrawer && <div className="w-10 h-1 rounded-full bg-black/15 mx-auto mb-3" />}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-[#0B0D0F] text-white font-mono text-xs font-bold flex items-center justify-center">
                {selectedPage.index}
              </span>
              <div>
                <span className="font-display font-semibold text-sm text-[#0B0D0F] block">
                  Page Settings
                </span>
                <span className="text-[10px] font-mono text-[#5C6066]">
                  {pageBlockCount} {pageBlockCount === 1 ? 'block' : 'blocks'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {!isReadOnly && (
                <>
                  <button
                    type="button"
                    onClick={() => onDuplicatePage(selectedPage.id)}
                    className="w-7 h-7 rounded-lg hover:bg-black/[0.05] text-[#5C6066] hover:text-[#0B0D0F] flex items-center justify-center"
                    title="Duplicate page"
                    aria-label="Duplicate page"
                  >
                    <Copy size={14} weight="regular" />
                  </button>
                  {pages.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onRequestDeletePage(selectedPage.id)}
                      className="w-7 h-7 rounded-lg hover:bg-rose-50 text-[#5C6066] hover:text-rose-600 flex items-center justify-center"
                      title="Delete page"
                      aria-label="Delete page"
                    >
                      <Trash size={14} weight="regular" />
                    </button>
                  )}
                </>
              )}
              {isMobileDrawer && onCloseMobile && (
                <button
                  type="button"
                  onClick={onCloseMobile}
                  className="w-7 h-7 rounded-lg bg-black/[0.05] text-[#0B0D0F] flex items-center justify-center"
                >
                  <X size={14} weight="bold" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="font-semibold text-[#0B0D0F] block">Page Title</label>
              <AnswerPipingPicker
                document={document}
                disabled={isReadOnly}
                onInsertToken={(token) =>
                  onUpdatePage(selectedPage.id, {
                    title: appendPipingToken(selectedPage.title || '', token),
                  })
                }
              />
            </div>
            <input
              type="text"
              disabled={isReadOnly}
              value={selectedPage.title}
              onChange={(e) => onUpdatePage(selectedPage.id, { title: e.target.value })}
              placeholder={`Page ${selectedPage.index}`}
              className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none font-medium"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="font-semibold text-[#0B0D0F] block">Page Description</label>
              <AnswerPipingPicker
                document={document}
                disabled={isReadOnly}
                onInsertToken={(token) =>
                  onUpdatePage(selectedPage.id, {
                    description: appendPipingToken(selectedPage.description || '', token),
                  })
                }
              />
            </div>
            <textarea
              rows={3}
              disabled={isReadOnly}
              value={selectedPage.description || ''}
              onChange={(e) => onUpdatePage(selectedPage.id, { description: e.target.value })}
              placeholder="Optional subtitle shown at the top of this page..."
              className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none resize-none"
            />
          </div>

          <div className="space-y-1.5 pt-2 border-t border-black/[0.07]">
            <label className="font-semibold text-[#0B0D0F] block">Section Spacing</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['sm', 'md', 'lg'] as SpacingToken[]).map((gap) => (
                <button
                  key={gap}
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => onUpdatePage(selectedPage.id, { layout: { gap } })}
                  className={`py-1.5 rounded-lg text-xs font-mono uppercase font-semibold transition-all ${
                    (selectedPage.layout?.gap || 'md') === gap
                      ? 'bg-[#0B0D0F] text-white'
                      : 'bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F]'
                  }`}
                >
                  {gap}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-black/[0.07]">
            <button
              type="button"
              onClick={() => onSelectTarget({ kind: 'form' })}
              className="w-full py-2 px-3 rounded-lg bg-[#F7F6F3] hover:bg-[#EAE7E1] text-xs font-semibold text-[#0B0D0F] transition-colors flex items-center justify-center gap-1.5"
            >
              <SlidersHorizontal size={14} weight="regular" />
              <span>Edit Form-Wide Properties</span>
            </button>
          </div>
        </div>
      </aside>
    );
  }

  // =========================================================================
  // 3. WELCOME SCREEN INSPECTOR
  // =========================================================================
  if (selection.kind === 'welcome') {
    return (
      <aside className={wrapperClass} aria-label="Welcome screen inspector">
        <div className="px-4 pt-3.5 pb-3 bg-white border-b border-black/[0.07] shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-[#0F766E]/10 text-[#0F766E] flex items-center justify-center">
              <HandWaving size={16} weight="duotone" />
            </span>
            <div>
              <span className="font-display font-semibold text-sm text-[#0B0D0F] block">
                Welcome Screen
              </span>
              <span className="text-[10px] font-mono text-[#5C6066]">Opening cover card</span>
            </div>
          </div>
          {isMobileDrawer && onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="w-7 h-7 rounded-lg bg-black/[0.05] text-[#0B0D0F] flex items-center justify-center"
            >
              <X size={14} weight="bold" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <button
            type="button"
            disabled={isReadOnly}
            onClick={() =>
              onUpdateWelcomeScreen({ enabled: !document.welcomeScreen.enabled })
            }
            className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between border transition-all ${
              document.welcomeScreen.enabled
                ? 'bg-[#0B0D0F] text-white border-[#0B0D0F]'
                : 'bg-[#F7F6F3] text-[#0B0D0F] border-black/[0.07]'
            }`}
          >
            <span className="font-semibold text-xs">Show Welcome Screen</span>
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center ${
                document.welcomeScreen.enabled
                  ? 'bg-emerald-500 text-white'
                  : 'bg-black/[0.08] text-transparent'
              }`}
            >
              <Check size={11} weight="bold" />
            </span>
          </button>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="font-semibold text-[#0B0D0F] block">Headline</label>
              <AnswerPipingPicker
                document={document}
                disabled={isReadOnly}
                onInsertToken={(token) =>
                  onUpdateWelcomeScreen({
                    title: appendPipingToken(document.welcomeScreen.title || '', token),
                  })
                }
              />
            </div>
            <input
              type="text"
              disabled={isReadOnly}
              value={document.welcomeScreen.title}
              onChange={(e) => onUpdateWelcomeScreen({ title: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none font-medium"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="font-semibold text-[#0B0D0F] block">Subtitle</label>
              <AnswerPipingPicker
                document={document}
                disabled={isReadOnly}
                onInsertToken={(token) =>
                  onUpdateWelcomeScreen({
                    subtitle: appendPipingToken(document.welcomeScreen.subtitle || '', token),
                  })
                }
              />
            </div>
            <textarea
              rows={3}
              disabled={isReadOnly}
              value={document.welcomeScreen.subtitle}
              onChange={(e) => onUpdateWelcomeScreen({ subtitle: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none resize-none"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-[#0B0D0F] block">Start Button Text</label>
            <input
              type="text"
              disabled={isReadOnly}
              value={document.welcomeScreen.buttonText}
              onChange={(e) => onUpdateWelcomeScreen({ buttonText: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-[#0B0D0F] block">
              Cover Image URL <span className="font-normal text-[#5C6066]">(Optional)</span>
            </label>
            <input
              type="url"
              disabled={isReadOnly}
              value={document.welcomeScreen.coverImage || ''}
              onChange={(e) => onUpdateWelcomeScreen({ coverImage: e.target.value })}
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none"
            />
          </div>
        </div>
      </aside>
    );
  }

  // =========================================================================
  // 4. THANK-YOU SCREEN INSPECTOR
  // =========================================================================
  if (selection.kind === 'thank_you') {
    return (
      <aside className={wrapperClass} aria-label="Thank you screen inspector">
        <div className="px-4 pt-3.5 pb-3 bg-white border-b border-black/[0.07] shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-[#0F766E]/10 text-[#0F766E] flex items-center justify-center">
              <Confetti size={16} weight="duotone" />
            </span>
            <div>
              <span className="font-display font-semibold text-sm text-[#0B0D0F] block">
                Thank-You Screen
              </span>
              <span className="text-[10px] font-mono text-[#5C6066]">Completion state</span>
            </div>
          </div>
          {isMobileDrawer && onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="w-7 h-7 rounded-lg bg-black/[0.05] text-[#0B0D0F] flex items-center justify-center"
            >
              <X size={14} weight="bold" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="font-semibold text-[#0B0D0F] block">Title</label>
              <AnswerPipingPicker
                document={document}
                disabled={isReadOnly}
                onInsertToken={(token) =>
                  onUpdateThankYouScreen({
                    title: appendPipingToken(document.thankYouScreen.title || '', token),
                  })
                }
              />
            </div>
            <input
              type="text"
              disabled={isReadOnly}
              value={document.thankYouScreen.title}
              onChange={(e) => onUpdateThankYouScreen({ title: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none font-medium"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="font-semibold text-[#0B0D0F] block">Closing Message</label>
              <AnswerPipingPicker
                document={document}
                disabled={isReadOnly}
                onInsertToken={(token) =>
                  onUpdateThankYouScreen({
                    message: appendPipingToken(document.thankYouScreen.message || '', token),
                  })
                }
              />
            </div>
            <textarea
              rows={3}
              disabled={isReadOnly}
              value={document.thankYouScreen.message}
              onChange={(e) => onUpdateThankYouScreen({ message: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none resize-none"
            />
          </div>

          <button
            type="button"
            disabled={isReadOnly}
            onClick={() =>
              onUpdateThankYouScreen({
                showRestartButton: !document.thankYouScreen.showRestartButton,
              })
            }
            className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between border transition-all ${
              document.thankYouScreen.showRestartButton
                ? 'bg-[#0B0D0F] text-white border-[#0B0D0F]'
                : 'bg-[#F7F6F3] text-[#0B0D0F] border-black/[0.07]'
            }`}
          >
            <span className="font-semibold text-xs">Allow Another Response</span>
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center ${
                document.thankYouScreen.showRestartButton
                  ? 'bg-emerald-500 text-white'
                  : 'bg-black/[0.08] text-transparent'
              }`}
            >
              <Check size={11} weight="bold" />
            </span>
          </button>

          <div className="space-y-1">
            <label className="font-semibold text-[#0B0D0F] block">
              Redirect URL <span className="font-normal text-[#5C6066]">(Optional)</span>
            </label>
            <input
              type="url"
              disabled={isReadOnly}
              value={document.thankYouScreen.redirectUrl || ''}
              onChange={(e) => onUpdateThankYouScreen({ redirectUrl: e.target.value })}
              placeholder="https://yoursite.com/thanks"
              className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none"
            />
          </div>
        </div>
      </aside>
    );
  }

  // =========================================================================
  // 5. FORM-LEVEL PROPERTIES INSPECTOR (Default / Background Click)
  // =========================================================================
  const showProgressBar = document.settings.showProgressBar !== false;

  return (
    <aside className={wrapperClass} aria-label="Form properties inspector">
      <div className="px-4 pt-3.5 pb-3 bg-white border-b border-black/[0.07] shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-[#F7F6F3] text-[#0F766E] flex items-center justify-center">
            <FileText size={16} weight="duotone" />
          </span>
          <div>
            <span className="font-display font-semibold text-sm text-[#0B0D0F] block">
              Form Properties
            </span>
            <span className="text-[10px] font-mono text-[#5C6066]">
              Click any block to inspect it
            </span>
          </div>
        </div>
        {isMobileDrawer && onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="w-7 h-7 rounded-lg bg-black/[0.05] text-[#0B0D0F] flex items-center justify-center"
          >
            <X size={14} weight="bold" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Form Metadata */}
        <div className="space-y-3">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
            General
          </span>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="font-semibold text-[#0B0D0F] block">Form Title</label>
              <AnswerPipingPicker
                document={document}
                disabled={isReadOnly}
                onInsertToken={(token) =>
                  onUpdateTitle(appendPipingToken(document.title || '', token))
                }
              />
            </div>
            <input
              type="text"
              disabled={isReadOnly}
              value={document.title}
              onChange={(e) => onUpdateTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none font-medium"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="font-semibold text-[#0B0D0F] block">Form Description</label>
              <AnswerPipingPicker
                document={document}
                disabled={isReadOnly}
                onInsertToken={(token) =>
                  onUpdateDescription(appendPipingToken(document.description || '', token))
                }
              />
            </div>
            <textarea
              rows={2}
              disabled={isReadOnly}
              value={document.description}
              onChange={(e) => onUpdateDescription(e.target.value)}
              placeholder="Short intro shown beneath the title..."
              className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none resize-none"
            />
          </div>
        </div>

        {/* Layout & Flow */}
        <div className="pt-4 border-t border-black/[0.07] space-y-3">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
            Layout &amp; Navigation
          </span>

          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { id: 'conversational', label: '1-by-1', icon: ChatText },
                { id: 'stepped', label: 'Pages', icon: ListNumbers },
                { id: 'standard', label: '1 Page', icon: Stack },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const active = layoutMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => onUpdateLayoutMode(opt.id)}
                  className={`py-2 px-1.5 rounded-lg text-[11px] font-semibold flex flex-col items-center gap-1 transition-all ${
                    active
                      ? 'bg-[#0B0D0F] text-white'
                      : 'bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F]'
                  }`}
                >
                  <Icon size={14} weight={active ? 'bold' : 'regular'} />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => onUpdateGlobalSettings({ showProgressBar: !showProgressBar })}
            className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between border transition-all ${
              showProgressBar
                ? 'bg-[#0B0D0F] text-white border-[#0B0D0F]'
                : 'bg-[#F7F6F3] text-[#0B0D0F] border-black/[0.07]'
            }`}
          >
            <span className="font-semibold text-xs">Show Progress Bar</span>
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center ${
                showProgressBar
                  ? 'bg-emerald-500 text-white'
                  : 'bg-black/[0.08] text-transparent'
              }`}
            >
              <Check size={11} weight="bold" />
            </span>
          </button>
        </div>

        {/* Quick Design Appearance */}
        <div className="pt-4 border-t border-black/[0.07] space-y-3.5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
            Visual Style
          </span>

          <div className="space-y-1.5">
            <label className="font-semibold text-[#0B0D0F] block">Primary Accent</label>
            <div className="flex items-center gap-2">
              {ACCENT_SWATCHES.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => onUpdateDesign({ primaryColor: hex })}
                  className={`w-6 h-6 rounded-full transition-transform ${
                    document.design.primaryColor === hex
                      ? 'ring-2 ring-offset-2 ring-[#0B0D0F] scale-110'
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: hex }}
                  aria-label={`Set primary color to ${hex}`}
                />
              ))}
              <input
                type="color"
                disabled={isReadOnly}
                value={document.design.primaryColor || '#0F766E'}
                onChange={(e) => onUpdateDesign({ primaryColor: e.target.value })}
                className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                aria-label="Custom primary color"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-[#0B0D0F] block">Spacing Scale</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['compact', 'comfortable', 'relaxed'] as const).map((scale) => (
                <button
                  key={scale}
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => onUpdateDesign({ spacingScale: scale })}
                  className={`py-1.5 rounded-lg text-[11px] font-semibold capitalize transition-all ${
                    (document.design.spacingScale || 'comfortable') === scale
                      ? 'bg-[#0B0D0F] text-white'
                      : 'bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F]'
                  }`}
                >
                  {scale}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-[#0B0D0F] block">Form Width</label>
            <div className="grid grid-cols-4 gap-1">
              {(['sm', 'md', 'lg', 'xl'] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => onUpdateDesign({ containerMaxWidth: w })}
                  className={`py-1.5 rounded-lg text-[11px] font-mono uppercase font-semibold transition-all ${
                    (document.design.containerMaxWidth || 'md') === w
                      ? 'bg-[#0B0D0F] text-white'
                      : 'bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F]'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Screens Access */}
        <div className="pt-4 border-t border-black/[0.07] space-y-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
            Form Screens
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onSelectTarget({ kind: 'welcome' })}
              className="p-2.5 rounded-xl bg-[#F7F6F3] hover:bg-[#EAE7E1] text-left transition-colors"
            >
              <span className="text-[11px] font-semibold text-[#0B0D0F] block">Welcome</span>
              <span className="text-[10px] text-[#5C6066]">
                {document.welcomeScreen.enabled ? 'Visible' : 'Hidden'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onSelectTarget({ kind: 'thank_you' })}
              className="p-2.5 rounded-xl bg-[#F7F6F3] hover:bg-[#EAE7E1] text-left transition-colors"
            >
              <span className="text-[11px] font-semibold text-[#0B0D0F] block">Thank You</span>
              <span className="text-[10px] text-[#5C6066]">Completion</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
