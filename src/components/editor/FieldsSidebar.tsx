import React, { useMemo, useState } from 'react';
import {
  Plus,
  Trash,
  ArrowUp,
  ArrowDown,
  ChatText,
  ListNumbers,
  Stack,
  X,
  MagnifyingGlass,
  DotsSixVertical,
  Copy,
  PencilSimple,
  Check,
  CaretDown,
  CaretRight,
  SquaresFour,
  Files,
  Eye,
  Cube,
} from '@phosphor-icons/react';
import { FormLayoutMode } from '../../types/form';
import {
  DEFAULT_REUSABLE_CATEGORIES,
  filterReusableDefinitions,
  FormComponentType,
  FormDocument,
  FormPage,
  formComponentRegistry,
  getAllPageComponents,
  getPageComponents,
  listInstanceIdsForDefinition,
  RegisteredComponentIcon,
  ReusableComponentDefinition,
} from '../../studio';
import {
  parseDragPayload,
  serializeDragPayload,
  STUDIO_DND_MIME,
  StudioDragPayload,
} from './dnd-types';

interface FieldsSidebarProps {
  document: FormDocument;
  activePageId: string;
  activeComponentId: string | null;
  viewAllPages: boolean;
  onToggleViewAllPages: () => void;
  onSelectPage: (pageId: string) => void;
  onCreatePage: () => void;
  onDuplicatePage: (pageId: string) => void;
  onRenamePage: (pageId: string, title: string) => void;
  onRequestDeletePage: (pageId: string) => void;
  onReorderPage: (pageId: string, direction: 'left' | 'right') => void;
  onSelectComponent: (id: string) => void;
  onInsertComponent: (type: FormComponentType) => void;
  onRequestDeleteComponent: (id: string) => void;
  onMoveComponentByOffset: (id: string, direction: 'up' | 'down') => void;
  onDropPayloadOnPage: (payload: StudioDragPayload, targetPageId: string) => void;
  activeDrag: StudioDragPayload | null;
  onDragStartPayload: (payload: StudioDragPayload) => void;
  onDragEndPayload: () => void;
  layoutMode: FormLayoutMode;
  onChangeLayoutMode: (mode: FormLayoutMode) => void;
  reusableDefinitions?: ReusableComponentDefinition[];
  onCreateReusableComponent?: () => void;
  onInsertReusableComponent?: (definition: ReusableComponentDefinition) => void;
  onEditReusableComponent?: (definition: ReusableComponentDefinition) => void;
  onRenameReusableComponent?: (definitionId: string, name: string) => void;
  onDuplicateReusableComponent?: (definition: ReusableComponentDefinition) => void;
  onDeleteReusableComponent?: (definitionId: string) => void;
  initialTab?: 'components' | 'reusable' | 'pages';
  onCloseMobile?: () => void;
  isMobileDrawer?: boolean;
  isReadOnly?: boolean;
}

export const FieldsSidebar: React.FC<FieldsSidebarProps> = ({
  document,
  activePageId,
  activeComponentId,
  viewAllPages,
  onToggleViewAllPages,
  onSelectPage,
  onCreatePage,
  onDuplicatePage,
  onRenamePage,
  onRequestDeletePage,
  onReorderPage,
  onSelectComponent,
  onInsertComponent,
  onRequestDeleteComponent,
  onMoveComponentByOffset,
  onDropPayloadOnPage,
  activeDrag,
  onDragStartPayload,
  onDragEndPayload,
  layoutMode,
  onChangeLayoutMode,
  reusableDefinitions = [],
  onCreateReusableComponent,
  onInsertReusableComponent,
  onEditReusableComponent,
  onRenameReusableComponent,
  onDuplicateReusableComponent,
  onDeleteReusableComponent,
  initialTab = 'components',
  onCloseMobile,
  isMobileDrawer = false,
  isReadOnly = false,
}) => {
  const [sidebarTab, setSidebarTab] = useState<'components' | 'reusable' | 'pages'>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [reusableSearch, setReusableSearch] = useState('');
  const [reusableCategory, setReusableCategory] = useState('All');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renamingDefId, setRenamingDefId] = useState<string | null>(null);
  const [renameDefDraft, setRenameDefDraft] = useState('');
  const [dragOverPageId, setDragOverPageId] = useState<string | null>(null);

  const categoryGroups = useMemo(
    () => formComponentRegistry.listByCategory(searchQuery),
    [searchQuery]
  );

  const reusableCategories = useMemo(() => {
    const set = new Set<string>(['All', ...DEFAULT_REUSABLE_CATEGORIES]);
    for (const def of reusableDefinitions) {
      if (def.category?.trim()) set.add(def.category.trim());
    }
    return Array.from(set);
  }, [reusableDefinitions]);

  const filteredReusable = useMemo(
    () => filterReusableDefinitions(reusableDefinitions, reusableSearch, reusableCategory),
    [reusableDefinitions, reusableSearch, reusableCategory]
  );

  const startRenameDef = (def: ReusableComponentDefinition) => {
    if (isReadOnly) return;
    setRenamingDefId(def.id);
    setRenameDefDraft(def.name);
  };

  const commitRenameDef = () => {
    if (renamingDefId && renameDefDraft.trim() && onRenameReusableComponent) {
      onRenameReusableComponent(renamingDefId, renameDefDraft.trim());
    }
    setRenamingDefId(null);
  };

  const toggleCategory = (categoryId: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  };

  const startRename = (page: FormPage) => {
    if (isReadOnly) return;
    setRenamingPageId(page.id);
    setRenameDraft(page.title || `Page ${page.index}`);
  };

  const commitRename = () => {
    if (renamingPageId && renameDraft.trim()) {
      onRenamePage(renamingPageId, renameDraft.trim());
    }
    setRenamingPageId(null);
  };

  const LAYOUT_OPTIONS: {
    id: FormLayoutMode;
    label: string;
    icon: React.FC<{ size?: number; weight?: 'regular' | 'bold' }>;
  }[] = [
    { id: 'conversational', label: '1-by-1', icon: ChatText },
    { id: 'stepped', label: 'Pages', icon: ListNumbers },
    { id: 'standard', label: '1 Page', icon: Stack },
  ];

  return (
    <aside
      className={
        isMobileDrawer
          ? 'w-full bg-white flex flex-col max-h-[84dvh] rounded-t-3xl overflow-hidden'
          : 'hidden lg:flex w-72 xl:w-[296px] border-r border-black/[0.08] bg-white flex-col shrink-0 h-[calc(100dvh-3.5rem)] overflow-hidden'
      }
      aria-label="Components and pages sidebar"
    >
      {/* Mobile Drawer Handle & Header */}
      {isMobileDrawer && (
        <div className="px-5 pt-3 pb-3 bg-white border-b border-black/[0.07] shrink-0">
          <div className="w-10 h-1 rounded-full bg-black/15 mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display font-semibold text-base text-[#0B0D0F]">
                {sidebarTab === 'components'
                  ? 'Component Library'
                  : sidebarTab === 'reusable'
                    ? 'Reusable Components'
                    : 'Pages & Outline'}
              </h3>
              <p className="text-xs text-[#5C6066]">
                {sidebarTab === 'components'
                  ? 'Tap any block to insert it into your form'
                  : sidebarTab === 'reusable'
                    ? 'Insert saved components across any page or form'
                    : 'Manage pages, reorder sections, or jump to blocks'}
              </p>
            </div>
            {onCloseMobile && (
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close panel"
                className="w-8 h-8 rounded-lg bg-[#F7F6F3] text-[#0B0D0F] flex items-center justify-center"
              >
                <X size={16} weight="bold" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Primary Sidebar Tab Switcher: Blocks | Reusable | Pages */}
      <div className="p-3 border-b border-black/[0.07] bg-[#FAF9F7] shrink-0">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-black/[0.05]">
          <button
            type="button"
            onClick={() => setSidebarTab('components')}
            className={`py-2 px-1.5 rounded-lg text-[11px] font-semibold transition-all flex items-center justify-center gap-1 ${
              sidebarTab === 'components'
                ? 'bg-white text-[#0B0D0F] shadow-xs'
                : 'text-[#5C6066] hover:text-[#0B0D0F]'
            }`}
          >
            <SquaresFour size={14} weight={sidebarTab === 'components' ? 'duotone' : 'regular'} />
            <span>Blocks</span>
          </button>
          <button
            type="button"
            onClick={() => setSidebarTab('reusable')}
            className={`py-2 px-1.5 rounded-lg text-[11px] font-semibold transition-all flex items-center justify-center gap-1 ${
              sidebarTab === 'reusable'
                ? 'bg-white text-[#0B0D0F] shadow-xs'
                : 'text-[#5C6066] hover:text-[#0B0D0F]'
            }`}
          >
            <Cube size={14} weight={sidebarTab === 'reusable' ? 'duotone' : 'regular'} />
            <span>Saved{reusableDefinitions.length > 0 ? ` (${reusableDefinitions.length})` : ''}</span>
          </button>
          <button
            type="button"
            onClick={() => setSidebarTab('pages')}
            className={`py-2 px-1.5 rounded-lg text-[11px] font-semibold transition-all flex items-center justify-center gap-1 ${
              sidebarTab === 'pages'
                ? 'bg-white text-[#0B0D0F] shadow-xs'
                : 'text-[#5C6066] hover:text-[#0B0D0F]'
            }`}
          >
            <Files size={14} weight={sidebarTab === 'pages' ? 'duotone' : 'regular'} />
            <span>Pages ({document.pages.length})</span>
          </button>
        </div>
      </div>

      {/* ====================================================================
          TAB A: SEARCHABLE & CATEGORIZED COMPONENT LIBRARY
      ==================================================================== */}
      {sidebarTab === 'components' && (
        <>
          {/* Live Search Input */}
          <div className="px-3 pt-3 pb-2 bg-white border-b border-black/[0.06] shrink-0">
            <div className="relative">
              <MagnifyingGlass
                size={15}
                weight="regular"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5C6066] pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search blocks (e.g. email, columns)..."
                aria-label="Search components"
                className="w-full pl-9 pr-8 py-2 rounded-lg bg-[#F7F6F3] focus:bg-white border border-black/[0.07] focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/15 text-xs text-[#0B0D0F] placeholder:text-[#5C6066]/70 focus:outline-none transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear component search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md hover:bg-black/[0.06] text-[#5C6066] flex items-center justify-center"
                >
                  <X size={12} weight="bold" />
                </button>
              )}
            </div>
            {!isMobileDrawer && !isReadOnly && (
              <p className="mt-1.5 px-0.5 text-[10px] text-[#5C6066]">
                Drag onto the canvas or click any block to insert.
              </p>
            )}
          </div>

          {/* Categorized Component Tiles */}
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {categoryGroups.length === 0 ? (
              <div className="p-6 rounded-xl bg-[#FAF9F7] border border-black/[0.06] text-center space-y-2">
                <p className="text-xs font-semibold text-[#0B0D0F]">No matching blocks</p>
                <p className="text-[11px] text-[#5C6066]">
                  Try searching for &quot;text&quot;, &quot;choice&quot;, &quot;image&quot;, or &quot;column&quot;.
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-xs font-semibold text-[#0F766E] hover:underline"
                >
                  Reset search
                </button>
              </div>
            ) : (
              categoryGroups.map((group) => {
                const isCollapsed = !searchQuery && Boolean(collapsedCategories[group.id]);
                return (
                  <div key={group.id} className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => toggleCategory(group.id)}
                      className="w-full flex items-center justify-between px-1 py-0.5 text-left group"
                      aria-expanded={!isCollapsed}
                    >
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] group-hover:text-[#0B0D0F] transition-colors">
                        {group.label} · {group.components.length}
                      </span>
                      <span className="text-[#5C6066]">
                        {isCollapsed ? (
                          <CaretRight size={12} weight="bold" />
                        ) : (
                          <CaretDown size={12} weight="bold" />
                        )}
                      </span>
                    </button>

                    {!isCollapsed && (
                      <div className="grid grid-cols-2 gap-1.5">
                        {group.components.map((def) => {
                          const Icon = def.icon;
                          const dragPayload: StudioDragPayload = {
                            kind: 'new',
                            componentType: def.type,
                          };
                          return (
                            <button
                              key={def.type}
                              type="button"
                              disabled={isReadOnly}
                              draggable={!isReadOnly}
                              onDragStart={(e) => {
                                if (isReadOnly) return;
                                e.dataTransfer.effectAllowed = 'copy';
                                e.dataTransfer.setData(
                                  STUDIO_DND_MIME,
                                  serializeDragPayload(dragPayload)
                                );
                                e.dataTransfer.setData(
                                  'text/plain',
                                  serializeDragPayload(dragPayload)
                                );
                                onDragStartPayload(dragPayload);
                              }}
                              onDragEnd={() => onDragEndPayload()}
                              onClick={() => {
                                onInsertComponent(def.type);
                                if (onCloseMobile) onCloseMobile();
                              }}
                              title={`${def.displayName} — ${def.hint}`}
                              className="group relative text-left p-2.5 rounded-xl bg-white border border-black/[0.08] hover:border-[#0F766E] hover:bg-[#0F766E]/[0.03] transition-all flex flex-col gap-1.5 cursor-grab active:cursor-grabbing active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                            >
                              <div className="flex items-center justify-between w-full">
                                <span className="w-7 h-7 rounded-lg bg-[#F7F6F3] group-hover:bg-[#0F766E] group-hover:text-white text-[#0F766E] flex items-center justify-center shrink-0 transition-colors">
                                  <Icon size={15} weight="regular" />
                                </span>
                                {!isReadOnly && (
                                  <span className="text-[#5C6066]/40 group-hover:text-[#0F766E] transition-colors flex items-center gap-0.5">
                                    <DotsSixVertical size={13} weight="bold" />
                                  </span>
                                )}
                              </div>
                              <div className="min-w-0">
                                <span className="block text-[11px] font-semibold text-[#0B0D0F] leading-tight truncate">
                                  {def.shortLabel}
                                </span>
                                <span className="block text-[10px] text-[#5C6066] truncate mt-0.5">
                                  {def.hint}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* ====================================================================
          TAB B: REUSABLE COMPONENT LIBRARY (CROSS-FORM SAVED COMPONENTS)
      ==================================================================== */}
      {sidebarTab === 'reusable' && (
        <>
          <div className="p-3 bg-white border-b border-black/[0.06] space-y-2.5 shrink-0">
            {!isReadOnly && onCreateReusableComponent && (
              <button
                type="button"
                onClick={onCreateReusableComponent}
                className="w-full py-2 px-3 rounded-lg bg-[#0F766E] hover:bg-[#0D665F] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
              >
                <Plus size={14} weight="bold" />
                <span>Create Reusable Component</span>
              </button>
            )}

            <div className="relative">
              <MagnifyingGlass
                size={14}
                weight="regular"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5C6066] pointer-events-none"
              />
              <input
                type="text"
                value={reusableSearch}
                onChange={(e) => setReusableSearch(e.target.value)}
                placeholder="Search saved components..."
                aria-label="Search reusable components"
                className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-[#F7F6F3] focus:bg-white border border-black/[0.07] focus:border-[#0F766E] text-xs text-[#0B0D0F] placeholder:text-[#5C6066]/70 focus:outline-none transition-all"
              />
              {reusableSearch && (
                <button
                  type="button"
                  onClick={() => setReusableSearch('')}
                  aria-label="Clear reusable search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md hover:bg-black/[0.06] text-[#5C6066] flex items-center justify-center"
                >
                  <X size={11} weight="bold" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="reusable-cat-filter"
                className="font-mono text-[10px] uppercase tracking-wider text-[#5C6066] shrink-0"
              >
                Category
              </label>
              <select
                id="reusable-cat-filter"
                value={reusableCategory}
                onChange={(e) => setReusableCategory(e.target.value)}
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#F7F6F3] border border-black/[0.07] text-[11px] font-medium text-[#0B0D0F] focus:border-[#0F766E] focus:outline-none"
              >
                {reusableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {reusableDefinitions.length === 0 ? (
              <div className="p-5 rounded-xl bg-[#FAF9F7] border border-dashed border-black/[0.12] text-center space-y-2.5">
                <div className="w-9 h-9 rounded-xl bg-white border border-black/[0.08] text-[#0F766E] mx-auto flex items-center justify-center">
                  <Cube size={18} weight="duotone" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-[#0B0D0F]">No saved components yet</p>
                  <p className="text-[11px] text-[#5C6066] leading-relaxed">
                    Build custom headers, callouts, or field groups once and reuse them across any form.
                  </p>
                </div>
                {!isReadOnly && onCreateReusableComponent && (
                  <button
                    type="button"
                    onClick={onCreateReusableComponent}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B0D0F] hover:bg-[#191D21] text-white text-[11px] font-semibold transition-colors"
                  >
                    <Plus size={12} weight="bold" />
                    <span>Build First Component</span>
                  </button>
                )}
              </div>
            ) : filteredReusable.length === 0 ? (
              <div className="p-5 rounded-xl bg-[#FAF9F7] border border-black/[0.06] text-center space-y-2">
                <p className="text-xs font-semibold text-[#0B0D0F]">No matching saved components</p>
                <button
                  type="button"
                  onClick={() => {
                    setReusableSearch('');
                    setReusableCategory('All');
                  }}
                  className="text-xs font-semibold text-[#0F766E] hover:underline"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              filteredReusable.map((def) => {
                const instanceCount = listInstanceIdsForDefinition(document, def.id).length;
                const dragPayload: StudioDragPayload = {
                  kind: 'reusable',
                  definitionId: def.id,
                };
                const isRenaming = renamingDefId === def.id;

                return (
                  <div
                    key={def.id}
                    draggable={!isReadOnly && !isRenaming}
                    onDragStart={(e) => {
                      if (isReadOnly || isRenaming) return;
                      e.dataTransfer.effectAllowed = 'copy';
                      e.dataTransfer.setData(STUDIO_DND_MIME, serializeDragPayload(dragPayload));
                      e.dataTransfer.setData('text/plain', serializeDragPayload(dragPayload));
                      onDragStartPayload(dragPayload);
                    }}
                    onDragEnd={() => onDragEndPayload()}
                    className="group rounded-xl bg-white border border-black/[0.09] hover:border-[#0F766E] transition-all p-2.5 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <span className="w-7 h-7 rounded-lg bg-[#0F766E]/10 text-[#0F766E] flex items-center justify-center shrink-0 mt-0.5">
                          <Cube size={15} weight="duotone" />
                        </span>
                        <div className="min-w-0 flex-1">
                          {isRenaming ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                autoFocus
                                value={renameDefDraft}
                                onChange={(e) => setRenameDefDraft(e.target.value)}
                                onBlur={commitRenameDef}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitRenameDef();
                                  if (e.key === 'Escape') setRenamingDefId(null);
                                }}
                                className="w-full px-1.5 py-0.5 text-xs font-semibold rounded bg-white border border-[#0F766E] focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={commitRenameDef}
                                className="w-5 h-5 rounded bg-[#0F766E] text-white flex items-center justify-center shrink-0"
                                aria-label="Confirm rename"
                              >
                                <Check size={11} weight="bold" />
                              </button>
                            </div>
                          ) : (
                            <p
                              className="text-xs font-semibold text-[#0B0D0F] truncate"
                              onDoubleClick={() => startRenameDef(def)}
                              title={def.description || def.name}
                            >
                              {def.name}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5 text-[10px] font-mono text-[#5C6066]">
                            <span>{def.category}</span>
                            <span>·</span>
                            <span>v{def.version}</span>
                            <span>·</span>
                            <span>
                              {Object.keys(def.slots).length}{' '}
                              {Object.keys(def.slots).length === 1 ? 'block' : 'blocks'}
                            </span>
                            {instanceCount > 0 && (
                              <>
                                <span>·</span>
                                <span className="text-[#0F766E] font-semibold">
                                  {instanceCount} on form
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {!isReadOnly && (
                        <span
                          className="text-[#5C6066]/40 group-hover:text-[#0F766E] cursor-grab active:cursor-grabbing shrink-0 pt-0.5"
                          title="Drag onto canvas"
                        >
                          <DotsSixVertical size={13} weight="bold" />
                        </span>
                      )}
                    </div>

                    {def.description && (
                      <p className="text-[11px] text-[#5C6066] line-clamp-2 leading-snug">
                        {def.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-black/[0.05]">
                      <button
                        type="button"
                        disabled={isReadOnly || !onInsertReusableComponent}
                        onClick={() => {
                          onInsertReusableComponent?.(def);
                          if (onCloseMobile) onCloseMobile();
                        }}
                        className="px-2.5 py-1 rounded-md bg-[#F7F6F3] hover:bg-[#0F766E] text-[#0B0D0F] hover:text-white text-[11px] font-semibold flex items-center gap-1 transition-colors disabled:opacity-45"
                      >
                        <Plus size={11} weight="bold" />
                        <span>Insert</span>
                      </button>

                      {!isReadOnly && (
                        <div className="flex items-center gap-0.5">
                          {onEditReusableComponent && (
                            <button
                              type="button"
                              onClick={() => onEditReusableComponent(def)}
                              className="px-1.5 py-1 rounded-md hover:bg-black/[0.06] text-[10px] font-semibold text-[#5C6066] hover:text-[#0B0D0F] transition-colors"
                              title="Edit component definition"
                            >
                              Edit
                            </button>
                          )}
                          {onRenameReusableComponent && (
                            <button
                              type="button"
                              onClick={() => startRenameDef(def)}
                              className="w-6 h-6 rounded-md hover:bg-black/[0.06] text-[#5C6066] hover:text-[#0B0D0F] flex items-center justify-center"
                              title="Rename component"
                              aria-label="Rename component"
                            >
                              <PencilSimple size={12} weight="regular" />
                            </button>
                          )}
                          {onDuplicateReusableComponent && (
                            <button
                              type="button"
                              onClick={() => onDuplicateReusableComponent(def)}
                              className="w-6 h-6 rounded-md hover:bg-black/[0.06] text-[#5C6066] hover:text-[#0B0D0F] flex items-center justify-center"
                              title="Duplicate component"
                              aria-label="Duplicate component"
                            >
                              <Copy size={12} weight="regular" />
                            </button>
                          )}
                          {onDeleteReusableComponent && (
                            <button
                              type="button"
                              onClick={() => onDeleteReusableComponent(def.id)}
                              className="w-6 h-6 rounded-md hover:bg-rose-50 text-[#5C6066] hover:text-rose-600 flex items-center justify-center"
                              title="Delete from library"
                              aria-label="Delete from library"
                            >
                              <Trash size={12} weight="regular" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* ====================================================================
          TAB C: PAGE NAVIGATOR & FORM OUTLINE
      ==================================================================== */}
      {sidebarTab === 'pages' && (
        <>
          <div className="p-3 border-b border-black/[0.06] bg-white space-y-2.5 shrink-0">
            <div className="flex items-center gap-1.5">
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={onCreatePage}
                  className="flex-1 py-2 px-3 rounded-lg bg-[#0B0D0F] hover:bg-[#191D21] text-[#F7F6F3] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Plus size={14} weight="bold" />
                  <span>Add Page</span>
                </button>
              )}
              <button
                type="button"
                onClick={onToggleViewAllPages}
                className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
                  viewAllPages
                    ? 'bg-[#0F766E] text-white border-[#0F766E]'
                    : 'bg-[#F7F6F3] text-[#0B0D0F] border-black/[0.07] hover:bg-[#EAE7E1]'
                }`}
                title="Show all pages stacked on the canvas"
              >
                <Eye size={14} weight="regular" />
                <span>All</span>
              </button>
            </div>

            {activeDrag && (
              <div className="px-2.5 py-1.5 rounded-lg bg-[#0F766E]/10 text-[#0F766E] text-[11px] font-medium">
                Drop onto any page below to move or insert it there.
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {document.pages.map((page, pageIdx) => {
              const isActive = !viewAllPages && activePageId === page.id;
              const allOnPage = getAllPageComponents(document, page.id);
              const topLevelOnPage = getPageComponents(document, page.id);
              const isDropHover = dragOverPageId === page.id;

              return (
                <div
                  key={page.id}
                  onDragOver={(e) => {
                    if (isReadOnly) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect =
                      activeDrag?.kind === 'existing' ? 'move' : 'copy';
                    if (dragOverPageId !== page.id) setDragOverPageId(page.id);
                  }}
                  onDragLeave={() => {
                    if (dragOverPageId === page.id) setDragOverPageId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverPageId(null);
                    if (isReadOnly) return;
                    const payload =
                      activeDrag ||
                      parseDragPayload(
                        e.dataTransfer.getData(STUDIO_DND_MIME) ||
                          e.dataTransfer.getData('text/plain')
                      );
                    if (payload) {
                      onDropPayloadOnPage(payload, page.id);
                    }
                  }}
                  className={`rounded-xl border transition-all ${
                    isDropHover
                      ? 'border-[#0F766E] bg-[#0F766E]/10 ring-2 ring-[#0F766E]/30'
                      : isActive
                        ? 'border-[#0B0D0F] bg-[#FAF9F7]'
                        : 'border-black/[0.08] bg-white hover:border-black/20'
                  }`}
                >
                  {/* Page Row Header */}
                  <div
                    onClick={() => onSelectPage(page.id)}
                    className="p-2.5 flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className={`w-6 h-6 rounded-md font-mono text-[11px] font-semibold flex items-center justify-center shrink-0 ${
                          isActive
                            ? 'bg-[#0B0D0F] text-white'
                            : 'bg-[#F7F6F3] text-[#5C6066]'
                        }`}
                      >
                        {page.index}
                      </span>

                      {renamingPageId === page.id ? (
                        <div
                          className="flex items-center gap-1 flex-1 min-w-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            autoFocus
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitRename();
                              if (e.key === 'Escape') setRenamingPageId(null);
                            }}
                            className="w-full px-2 py-1 text-xs font-semibold rounded-md bg-white border border-[#0F766E] focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={commitRename}
                            className="w-6 h-6 rounded-md bg-[#0F766E] text-white flex items-center justify-center shrink-0"
                            aria-label="Save page title"
                          >
                            <Check size={12} weight="bold" />
                          </button>
                        </div>
                      ) : (
                        <div
                          className="min-w-0 flex-1"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            startRename(page);
                          }}
                        >
                          <span className="block text-xs font-semibold text-[#0B0D0F] truncate">
                            {page.title || `Page ${page.index}`}
                          </span>
                          <span className="block text-[10px] font-mono text-[#5C6066]">
                            {allOnPage.length} {allOnPage.length === 1 ? 'block' : 'blocks'}
                          </span>
                        </div>
                      )}
                    </div>

                    {!isReadOnly && renamingPageId !== page.id && (
                      <div
                        className="flex items-center gap-0.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => startRename(page)}
                          className="w-6 h-6 rounded-md hover:bg-black/[0.06] text-[#5C6066] hover:text-[#0B0D0F] flex items-center justify-center"
                          title="Rename page"
                          aria-label="Rename page"
                        >
                          <PencilSimple size={12} weight="regular" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicatePage(page.id)}
                          className="w-6 h-6 rounded-md hover:bg-black/[0.06] text-[#5C6066] hover:text-[#0B0D0F] flex items-center justify-center"
                          title="Duplicate page"
                          aria-label="Duplicate page"
                        >
                          <Copy size={12} weight="regular" />
                        </button>
                        <button
                          type="button"
                          disabled={pageIdx === 0}
                          onClick={() => onReorderPage(page.id, 'left')}
                          className="w-6 h-6 rounded-md hover:bg-black/[0.06] text-[#5C6066] hover:text-[#0B0D0F] disabled:opacity-25 flex items-center justify-center"
                          title="Move page up"
                          aria-label="Move page up"
                        >
                          <ArrowUp size={12} weight="regular" />
                        </button>
                        <button
                          type="button"
                          disabled={pageIdx === document.pages.length - 1}
                          onClick={() => onReorderPage(page.id, 'right')}
                          className="w-6 h-6 rounded-md hover:bg-black/[0.06] text-[#5C6066] hover:text-[#0B0D0F] disabled:opacity-25 flex items-center justify-center"
                          title="Move page down"
                          aria-label="Move page down"
                        >
                          <ArrowDown size={12} weight="regular" />
                        </button>
                        {document.pages.length > 1 && (
                          <button
                            type="button"
                            onClick={() => onRequestDeletePage(page.id)}
                            className="w-6 h-6 rounded-md hover:bg-rose-50 text-[#5C6066] hover:text-rose-600 flex items-center justify-center"
                            title="Delete page"
                            aria-label="Delete page"
                          >
                            <Trash size={12} weight="regular" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Active Page Block Outline */}
                  {isActive && topLevelOnPage.length > 0 && (
                    <div className="px-2 pb-2 pt-1 border-t border-black/[0.06] space-y-1">
                      {allOnPage.map((node) => {
                        const isSelected = activeComponentId === node.id;
                        const def = formComponentRegistry.get(node.type);
                        const isNested = Boolean(node.parentId);
                        return (
                          <div
                            key={node.id}
                            onClick={() => {
                              onSelectComponent(node.id);
                              if (onCloseMobile) onCloseMobile();
                            }}
                            className={`group px-2 py-1.5 rounded-lg text-[11px] cursor-pointer flex items-center justify-between gap-1.5 transition-colors ${
                              isNested ? 'ml-4 border-l-2 border-black/[0.08] pl-2.5' : ''
                            } ${
                              isSelected
                                ? 'bg-[#0B0D0F] text-[#F7F6F3] font-medium'
                                : 'hover:bg-black/[0.04] text-[#0B0D0F]'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <RegisteredComponentIcon
                                type={node.type}
                                size={13}
                                className={
                                  isSelected
                                    ? 'text-emerald-400 shrink-0'
                                    : 'text-[#0F766E] shrink-0'
                                }
                              />
                              <span className="truncate">
                                {node.content.label || def?.displayName || 'Untitled'}
                              </span>
                            </div>

                            {!isReadOnly && (
                              <div
                                className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => onMoveComponentByOffset(node.id, 'up')}
                                  className={`w-5 h-5 rounded flex items-center justify-center ${
                                    isSelected ? 'hover:bg-white/15' : 'hover:bg-black/[0.08]'
                                  }`}
                                  title="Move block up"
                                  aria-label="Move block up"
                                >
                                  <ArrowUp size={11} weight="bold" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onMoveComponentByOffset(node.id, 'down')}
                                  className={`w-5 h-5 rounded flex items-center justify-center ${
                                    isSelected ? 'hover:bg-white/15' : 'hover:bg-black/[0.08]'
                                  }`}
                                  title="Move block down"
                                  aria-label="Move block down"
                                >
                                  <ArrowDown size={11} weight="bold" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onRequestDeleteComponent(node.id)}
                                  className={`w-5 h-5 rounded flex items-center justify-center ${
                                    isSelected
                                      ? 'hover:bg-rose-500/20 text-rose-300'
                                      : 'hover:bg-rose-50 text-[#5C6066] hover:text-rose-600'
                                  }`}
                                  title="Delete block"
                                  aria-label="Delete block"
                                >
                                  <Trash size={11} weight="bold" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Form Flow Style Footer */}
          <div className="p-3 border-t border-black/[0.07] bg-[#FAF9F7] shrink-0 space-y-1.5">
            <span className="font-mono text-[10px] font-semibold text-[#5C6066] uppercase tracking-[0.14em] block">
              Delivery Style
            </span>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-black/[0.05] text-[11px]">
              {LAYOUT_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = layoutMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => onChangeLayoutMode(opt.id)}
                    className={`py-1.5 px-1.5 rounded-lg font-medium transition-all flex items-center justify-center gap-1 disabled:opacity-50 ${
                      active
                        ? 'bg-white text-[#0B0D0F] shadow-xs font-semibold'
                        : 'text-[#5C6066] hover:text-[#0B0D0F]'
                    }`}
                  >
                    <Icon size={13} weight={active ? 'bold' : 'regular'} />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </aside>
  );
};
