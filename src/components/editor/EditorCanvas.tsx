import React, { useMemo, useState } from 'react';
import {
  Trash,
  Copy,
  Plus,
  Check,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  X,
  HandWaving,
  Confetti,
  ChatCircleText,
  Eye,
  DotsSixVertical,
  ArrowBendUpLeft,
  MagnifyingGlass,
  Prohibit,
  Columns,
  FilePlus,
  PencilSimple,
  EyeSlash,
} from '@phosphor-icons/react';
import { FormSchema, FormLayoutMode } from '../../types/form';
import { CollaboratorPresence, FormComment } from '../../types/team';
import {
  CanvasViewport,
  ComponentNodePatch,
  FormComponentNode,
  FormComponentType,
  FormDocument,
  FormDocumentRenderer,
  FormPage,
  formComponentRegistry,
  getAllPageComponents,
  getContainerChildren,
  getPageComponents,
  MoveComponentDestination,
  NestingValidationResult,
  RegisteredComponentIcon,
  resolveComponentAppearanceClasses,
  resolveComponentTokens,
  resolveContainerColumns,
  resolveDesignTokens,
  SelectionTarget,
} from '../../studio';
import {
  getDraggedIdentifier,
  parseDragPayload,
  serializeDragPayload,
  STUDIO_DND_MIME,
  StudioDragPayload,
} from './dnd-types';

interface EditorCanvasProps {
  document: FormDocument;
  activePageId: string;
  viewAllPages: boolean;
  canvasViewport: CanvasViewport;
  isLivePreviewMode?: boolean;
  onExitLivePreview?: () => void;
  selection: SelectionTarget;
  onSelectTarget: (target: SelectionTarget) => void;
  onSelectPageById: (pageId: string, inspectPage?: boolean) => void;
  onCreatePage: () => void;
  onToggleViewAllPages: () => void;
  onUpdateTitle: (title: string) => void;
  onUpdateDescription: (description: string) => void;
  onUpdateComponent: (id: string, patch: ComponentNodePatch) => void;
  onRequestDeleteComponent: (id: string) => void;
  onDuplicateComponent: (id: string) => void;
  onMoveComponent: (id: string, destination: MoveComponentDestination) => void;
  onMoveComponentByOffset: (id: string, direction: 'up' | 'down') => void;
  onMoveOutOfContainer: (id: string) => void;
  onAddComponent: (
    type: FormComponentType,
    targetPageId?: string,
    options?: { parentId?: string | null; insertAtIndex?: number }
  ) => void;
  canNestComponent: (
    componentIdOrType: string,
    targetParentId: string | null
  ) => NestingValidationResult;
  activeDrag: StudioDragPayload | null;
  onDragStartPayload: (payload: StudioDragPayload) => void;
  onDragEndPayload: () => void;
  onDropPayloadOnPage: (payload: StudioDragPayload, targetPageId: string) => void;
  onChangeLayoutMode: (mode: FormLayoutMode) => void;
  onOpenMobileAddDrawer?: () => void;
  onOpenMobileInspector?: (componentId: string) => void;
  onUpdateWelcome: (welcome: Partial<FormSchema['welcomeScreen']>) => void;
  onUpdateThankYou: (thankYou: Partial<FormSchema['thankYouScreen']>) => void;
  collaborators?: CollaboratorPresence[];
  currentUserId?: string;
  comments?: FormComment[];
  onOpenCoAuthor?: (componentId?: string) => void;
  isReadOnly?: boolean;
}

interface InsertionPopoverTarget {
  pageId: string;
  parentId: string | null;
  index: number;
}

const STARTER_BLOCKS: FormComponentType[] = ['heading', 'text', 'radio', 'two_column'];

export const EditorCanvas: React.FC<EditorCanvasProps> = ({
  document,
  activePageId,
  viewAllPages,
  canvasViewport,
  isLivePreviewMode = false,
  onExitLivePreview,
  selection,
  onSelectTarget,
  onSelectPageById,
  onCreatePage,
  onToggleViewAllPages,
  onUpdateTitle,
  onUpdateDescription,
  onUpdateComponent,
  onRequestDeleteComponent,
  onDuplicateComponent,
  onMoveComponent,
  onMoveComponentByOffset,
  onMoveOutOfContainer,
  onAddComponent,
  canNestComponent,
  activeDrag,
  onDragStartPayload,
  onDragEndPayload,
  onDropPayloadOnPage,
  onOpenMobileAddDrawer,
  onOpenMobileInspector,
  onUpdateWelcome,
  onUpdateThankYou,
  collaborators = [],
  currentUserId,
  comments = [],
  onOpenCoAuthor,
  isReadOnly = false,
}) => {
  const [dropSlotKey, setDropSlotKey] = useState<string | null>(null);
  const [dropContainerId, setDropContainerId] = useState<string | null>(null);
  const [dragOverPageTabId, setDragOverPageTabId] = useState<string | null>(null);
  const [popoverTarget, setPopoverTarget] = useState<InsertionPopoverTarget | null>(null);
  const [popoverSearch, setPopoverSearch] = useState('');

  const tokens = useMemo(
    () => resolveDesignTokens(document.design, canvasViewport),
    [document.design, canvasViewport]
  );
  const primaryColor = tokens.colors.primary;

  const pagesToRender: FormPage[] = useMemo(() => {
    if (viewAllPages) return document.pages;
    const found = document.pages.find((p) => p.id === activePageId);
    return found ? [found] : document.pages.slice(0, 1);
  }, [viewAllPages, document.pages, activePageId]);

  const popoverCategories = useMemo(
    () =>
      formComponentRegistry
        .listByCategory(popoverSearch)
        .map((group) => ({
          ...group,
          components: group.components.filter((def) => {
            if (def.specialAction) return false;
            if (!popoverTarget) return true;
            return canNestComponent(def.type, popoverTarget.parentId).allowed;
          }),
        }))
        .filter((group) => group.components.length > 0),
    [popoverSearch, popoverTarget, canNestComponent]
  );

  const readPayload = (e: React.DragEvent): StudioDragPayload | null => {
    return (
      activeDrag ||
      parseDragPayload(
        e.dataTransfer.getData(STUDIO_DND_MIME) || e.dataTransfer.getData('text/plain')
      )
    );
  };

  const handleDropAtSlot = (
    e: React.DragEvent,
    pageId: string,
    parentId: string | null,
    index: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDropSlotKey(null);
    setDropContainerId(null);
    if (isReadOnly) return;

    const payload = readPayload(e);
    if (!payload) return;

    const check = canNestComponent(getDraggedIdentifier(payload), parentId);
    if (!check.allowed) {
      onDragEndPayload();
      return;
    }

    if (payload.kind === 'new') {
      onAddComponent(payload.componentType, pageId, {
        parentId,
        insertAtIndex: index,
      });
    } else {
      onMoveComponent(payload.componentId, {
        pageId,
        parentId,
        index,
      });
    }
    onDragEndPayload();
  };

  const handleDropIntoContainer = (e: React.DragEvent, container: FormComponentNode) => {
    e.preventDefault();
    e.stopPropagation();
    setDropContainerId(null);
    setDropSlotKey(null);
    if (isReadOnly) return;

    const payload = readPayload(e);
    if (!payload) return;

    const check = canNestComponent(getDraggedIdentifier(payload), container.id);
    if (!check.allowed) {
      onDragEndPayload();
      return;
    }

    const childCount = container.children?.length || 0;
    if (payload.kind === 'new') {
      onAddComponent(payload.componentType, container.pageId, {
        parentId: container.id,
        insertAtIndex: childCount,
      });
    } else {
      onMoveComponent(payload.componentId, {
        pageId: container.pageId,
        parentId: container.id,
        index: childCount,
      });
    }
    onDragEndPayload();
  };

  // =========================================================================
  // Contextual Insertion Line + Quick Insert Popover
  // =========================================================================
  const renderInsertionSlot = (
    pageId: string,
    parentId: string | null,
    index: number,
    compact = false
  ) => {
    if (isReadOnly) return null;
    const slotKey = `${pageId}:${parentId || 'root'}:${index}`;
    const isDropActive = dropSlotKey === slotKey;
    const isPopoverOpen =
      popoverTarget?.pageId === pageId &&
      popoverTarget?.parentId === parentId &&
      popoverTarget?.index === index;

    const dragAllowed = activeDrag
      ? canNestComponent(getDraggedIdentifier(activeDrag), parentId).allowed
      : true;

    return (
      <div
        key={`slot-${slotKey}`}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = !dragAllowed
            ? 'none'
            : activeDrag?.kind === 'existing'
              ? 'move'
              : 'copy';
          if (dropSlotKey !== slotKey) setDropSlotKey(slotKey);
        }}
        onDragLeave={(e) => {
          e.stopPropagation();
          if (dropSlotKey === slotKey) setDropSlotKey(null);
        }}
        onDrop={(e) => handleDropAtSlot(e, pageId, parentId, index)}
        className={`relative group/slot transition-all ${
          activeDrag
            ? compact
              ? 'py-2'
              : 'py-2.5'
            : compact
              ? 'py-1'
              : 'py-1.5'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drop Indicator Line */}
        <div
          className={`w-full rounded-full transition-all flex items-center justify-center ${
            isDropActive
              ? dragAllowed
                ? 'h-8 bg-[#0F766E]/12 border-2 border-dashed border-[#0F766E] text-[#0F766E] text-[11px] font-semibold'
                : 'h-8 bg-rose-50 border-2 border-dashed border-rose-400 text-rose-700 text-[11px] font-semibold'
              : activeDrag && dragAllowed
                ? 'h-1.5 bg-[#0F766E]/25'
                : 'h-[2px] bg-transparent group-hover/slot:bg-[#0F766E]/35'
          }`}
        >
          {isDropActive && (
            <span>
              {dragAllowed ? 'Drop block here' : 'Cannot place block at this depth'}
            </span>
          )}
        </div>

        {/* Hover / Accessible "+" Quick Insert Button */}
        {!activeDrag && (
          <button
            type="button"
            onClick={() => {
              if (isPopoverOpen) {
                setPopoverTarget(null);
              } else {
                setPopoverSearch('');
                setPopoverTarget({ pageId, parentId, index });
              }
            }}
            aria-label="Insert block here"
            title="Insert block here"
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all flex items-center gap-1 border shadow-xs ${
              isPopoverOpen
                ? 'opacity-100 bg-[#0F766E] text-white border-[#0F766E]'
                : 'opacity-0 group-hover/slot:opacity-100 focus:opacity-100 bg-white text-[#0B0D0F] border-black/15 hover:border-[#0F766E] hover:text-[#0F766E]'
            }`}
          >
            <Plus size={11} weight="bold" />
            <span>Insert</span>
          </button>
        )}

        {/* Inline Quick-Insert Popover */}
        {isPopoverOpen && (
          <div className="mt-2 mx-auto max-w-sm rounded-xl bg-white border border-black/[0.12] shadow-xl p-3 space-y-2.5 z-20 relative">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <MagnifyingGlass
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5C6066]"
                />
                <input
                  type="text"
                  autoFocus
                  value={popoverSearch}
                  onChange={(e) => setPopoverSearch(e.target.value)}
                  placeholder="Quick insert block..."
                  className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-[#F7F6F3] text-xs text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                />
              </div>
              <button
                type="button"
                onClick={() => setPopoverTarget(null)}
                className="w-7 h-7 rounded-lg hover:bg-black/[0.06] text-[#5C6066] flex items-center justify-center"
                aria-label="Close insert menu"
              >
                <X size={13} weight="bold" />
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-2.5 pr-0.5">
              {popoverCategories.map((group) => (
                <div key={group.id} className="space-y-1">
                  <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block px-1">
                    {group.label}
                  </span>
                  <div className="grid grid-cols-2 gap-1">
                    {group.components.map((def) => {
                      const Icon = def.icon;
                      return (
                        <button
                          key={def.type}
                          type="button"
                          onClick={() => {
                            onAddComponent(def.type, pageId, {
                              parentId,
                              insertAtIndex: index,
                            });
                            setPopoverTarget(null);
                          }}
                          className="p-2 rounded-lg text-left hover:bg-[#F7F6F3] flex items-center gap-2 transition-colors"
                        >
                          <span className="w-6 h-6 rounded-md bg-[#F7F6F3] text-[#0F766E] flex items-center justify-center shrink-0">
                            <Icon size={13} weight="regular" />
                          </span>
                          <span className="text-[11px] font-medium text-[#0B0D0F] truncate">
                            {def.shortLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // =========================================================================
  // Recursive Component / Container Renderer
  // =========================================================================
  const renderComponentBlock = (
    node: FormComponentNode,
    siblingIndex: number,
    siblingCount: number,
    depth = 0
  ): React.ReactNode => {
    const isSelected = selection.kind === 'component' && selection.id === node.id;
    const def = formComponentRegistry.get(node.type);
    const EditorRenderer = def?.EditorRenderer;
    const isContainer = Boolean(def?.isContainer);
    const children = isContainer ? getContainerChildren(document, node.id) : [];
    const isBeingDragged =
      activeDrag?.kind === 'existing' && activeDrag.componentId === node.id;

    const activePeers = collaborators.filter(
      (c) => c.uid !== currentUserId && c.activeFieldId === node.id
    );
    const nodeCommentsCount = comments.filter(
      (c) => !c.resolved && c.fieldId === node.id
    ).length;

    const containerNestCheck =
      isContainer && activeDrag
        ? canNestComponent(getDraggedIdentifier(activeDrag), node.id)
        : null;
    const isContainerDropHover = isContainer && dropContainerId === node.id;

    // Responsive column layout inside containers (auto-collapses cleanly per Desktop/Tablet/Mobile viewport)
    const cols = resolveContainerColumns(node, canvasViewport);
    const containerGridClass =
      cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-2' : 'grid-cols-3';

    const gapClass =
      node.layout.gap === 'sm'
        ? 'gap-2.5'
        : node.layout.gap === 'lg'
        ? 'gap-5'
        : tokens.columnGapClass;

    const compTokens = resolveComponentTokens(node, document.design, canvasViewport);
    const appearanceClass = resolveComponentAppearanceClasses(node.appearance);

    const dragPayload: StudioDragPayload = {
      kind: 'existing',
      componentId: node.id,
    };

    const blockStyle: React.CSSProperties = {
      ...(isContainer ? compTokens.containerStyle : compTokens.wrapperStyle),
      ...(activePeers.length > 0
        ? { boxShadow: `0 0 0 2px ${activePeers[0].color}` }
        : {}),
    };

    return (
      <div
        key={node.id}
        onClick={(e) => {
          e.stopPropagation();
          setPopoverTarget(null);
          onSelectTarget({ kind: 'component', id: node.id });
        }}
        style={blockStyle}
        className={`group/block relative rounded-xl transition-all ${
          isBeingDragged ? 'opacity-40 scale-[0.99]' : ''
        } ${compTokens.isHidden ? 'opacity-45' : ''} ${
          isContainer ? 'p-4 border border-dashed' : 'p-4 border'
        } ${
          isSelected
            ? 'border-[#0F766E] ring-2 ring-[#0F766E]/20'
            : isContainer
              ? 'border-black/[0.15] hover:border-[#0F766E]/60'
              : 'border-black/[0.08] hover:border-black/20'
        }`}
      >
        {/* Live Collaborator Badges */}
        {activePeers.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            {activePeers.map((peer) => (
              <span
                key={peer.uid}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                style={{ backgroundColor: peer.color }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                <span>{peer.displayName}</span>
              </span>
            ))}
          </div>
        )}

        {/* Contextual Floating Action Bar (visible on selection or hover) */}
        <div
          onClick={(e) => e.stopPropagation()}
          className={`flex items-center justify-between gap-2 mb-2.5 pb-2 border-b border-black/[0.05] transition-opacity ${
            isSelected
              ? 'opacity-100'
              : 'opacity-80 group-hover/block:opacity-100'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {!isReadOnly && (
              <div
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData(STUDIO_DND_MIME, serializeDragPayload(dragPayload));
                  e.dataTransfer.setData('text/plain', serializeDragPayload(dragPayload));
                  onDragStartPayload(dragPayload);
                }}
                onDragEnd={(e) => {
                  e.stopPropagation();
                  setDropSlotKey(null);
                  setDropContainerId(null);
                  onDragEndPayload();
                }}
                className="w-6 h-6 rounded-md hover:bg-black/[0.06] text-[#5C6066] hover:text-[#0B0D0F] flex items-center justify-center cursor-grab active:cursor-grabbing shrink-0"
                title="Drag to reorder or move into a container"
                aria-label="Drag handle"
              >
                <DotsSixVertical size={14} weight="bold" />
              </div>
            )}

            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#5C6066] truncate">
              <RegisteredComponentIcon
                type={node.type}
                size={13}
                className="text-[#0F766E] shrink-0"
              />
              <span className="font-mono text-[10px] uppercase tracking-wider truncate">
                {def?.shortLabel || node.type}
              </span>
            </span>

            {isContainer && (
              <span className="text-[10px] font-mono text-[#0F766E]">
                · {cols} {cols === 1 ? 'col' : 'cols'}
              </span>
            )}

            {node.validation.required && (
              <span className="text-[10px] font-mono font-semibold text-rose-600">
                · Required
              </span>
            )}

            {compTokens.isHidden && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-mono text-[9px] font-semibold uppercase">
                <EyeSlash size={10} weight="bold" />
                <span>Hidden on {canvasViewport}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            {!isReadOnly && (
              <>
                {node.parentId && (
                  <button
                    type="button"
                    onClick={() => onMoveOutOfContainer(node.id)}
                    className="h-6 px-1.5 rounded-md hover:bg-black/[0.06] text-[#5C6066] hover:text-[#0B0D0F] text-[10px] font-semibold flex items-center gap-1 transition-colors"
                    title="Move block out of container"
                    aria-label="Move out of container"
                  >
                    <ArrowBendUpLeft size={12} weight="bold" />
                    <span className="hidden sm:inline">Out</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onMoveComponentByOffset(node.id, 'up')}
                  disabled={!node.parentId && siblingIndex === 0 && document.pages[0]?.id === node.pageId}
                  className="w-6 h-6 rounded-md hover:bg-black/[0.06] text-[#5C6066] hover:text-[#0B0D0F] disabled:opacity-25 flex items-center justify-center transition-colors"
                  title="Move up"
                  aria-label="Move block up"
                >
                  <ArrowUp size={13} weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={() => onMoveComponentByOffset(node.id, 'down')}
                  disabled={
                    !node.parentId &&
                    siblingIndex === siblingCount - 1 &&
                    document.pages[document.pages.length - 1]?.id === node.pageId
                  }
                  className="w-6 h-6 rounded-md hover:bg-black/[0.06] text-[#5C6066] hover:text-[#0B0D0F] disabled:opacity-25 flex items-center justify-center transition-colors"
                  title="Move down"
                  aria-label="Move block down"
                >
                  <ArrowDown size={13} weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={() => onDuplicateComponent(node.id)}
                  className="w-6 h-6 rounded-md hover:bg-black/[0.06] text-[#5C6066] hover:text-[#0B0D0F] flex items-center justify-center transition-colors"
                  title="Duplicate (Ctrl+D)"
                  aria-label="Duplicate block"
                >
                  <Copy size={13} weight="regular" />
                </button>
                <button
                  type="button"
                  onClick={() => onRequestDeleteComponent(node.id)}
                  className="w-6 h-6 rounded-md hover:bg-rose-50 text-[#5C6066] hover:text-rose-600 flex items-center justify-center transition-colors"
                  title="Delete"
                  aria-label="Delete block"
                >
                  <Trash size={13} weight="regular" />
                </button>
              </>
            )}

            {onOpenCoAuthor && (
              <button
                type="button"
                onClick={() => {
                  onSelectTarget({ kind: 'component', id: node.id });
                  onOpenCoAuthor(node.id);
                }}
                className={`h-6 px-1.5 rounded-md text-[10px] font-semibold flex items-center gap-1 transition-colors ${
                  nodeCommentsCount > 0
                    ? 'bg-[#0F766E]/10 text-[#0F766E]'
                    : 'hover:bg-black/[0.06] text-[#5C6066]'
                }`}
                title="Team comments"
              >
                <ChatCircleText size={13} weight="regular" />
                {nodeCommentsCount > 0 && <span>{nodeCommentsCount}</span>}
              </button>
            )}

            {onOpenMobileInspector && !isReadOnly && (
              <button
                type="button"
                onClick={() => onOpenMobileInspector(node.id)}
                className="lg:hidden w-6 h-6 rounded-md bg-[#F7F6F3] text-[#0F766E] flex items-center justify-center"
                aria-label="Customize block"
              >
                <SlidersHorizontal size={13} weight="bold" />
              </button>
            )}
          </div>
        </div>

        {/* Component WYSIWYG Body */}
        <div className={appearanceClass}>
          {EditorRenderer ? (
            <EditorRenderer
              node={node}
              onUpdate={(patch) => onUpdateComponent(node.id, patch)}
              isQuizMode={document.settings.isQuizMode}
              isReadOnly={isReadOnly}
              design={document.design}
              primaryColor={primaryColor}
              radiusClass={tokens.borderRadiusClass}
              viewport={canvasViewport}
            />
          ) : (
            <div className="p-3 rounded-lg bg-amber-50 text-xs text-amber-900">
              Unsupported component: <code className="font-mono">{node.type}</code>
            </div>
          )}
        </div>

        {/* Nested Layout Container Drop Zone & Children Grid */}
        {isContainer && (
          <div
            onDragOver={(e) => {
              if (isReadOnly) return;
              e.preventDefault();
              e.stopPropagation();
              const allowed = containerNestCheck ? containerNestCheck.allowed : true;
              e.dataTransfer.dropEffect = !allowed
                ? 'none'
                : activeDrag?.kind === 'existing'
                  ? 'move'
                  : 'copy';
              if (dropContainerId !== node.id) setDropContainerId(node.id);
            }}
            onDragLeave={(e) => {
              e.stopPropagation();
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              if (dropContainerId === node.id) setDropContainerId(null);
            }}
            onDrop={(e) => handleDropIntoContainer(e, node)}
            className={`mt-3 rounded-xl p-3 transition-all border ${
              isContainerDropHover
                ? containerNestCheck?.allowed === false
                  ? 'border-rose-400 bg-rose-50/70 ring-2 ring-rose-300/50'
                  : 'border-[#0F766E] bg-[#0F766E]/[0.06] ring-2 ring-[#0F766E]/25'
                : 'border-black/[0.06] bg-white/70'
            }`}
          >
            {/* Invalid Nesting Feedback Banner */}
            {isContainerDropHover && containerNestCheck?.allowed === false && (
              <div className="mb-2.5 px-3 py-2 rounded-lg bg-rose-100 text-rose-800 text-[11px] font-semibold flex items-center gap-2">
                <Prohibit size={14} weight="bold" className="shrink-0" />
                <span>{containerNestCheck.reason || 'Invalid nesting target.'}</span>
              </div>
            )}

            {children.length === 0 ? (
              <div className="py-5 px-3 text-center space-y-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#F7F6F3] text-[#0F766E] mx-auto flex items-center justify-center">
                  <Columns size={16} weight="regular" />
                </div>
                <p className="text-xs font-medium text-[#5C6066]">
                  {isContainerDropHover && containerNestCheck?.allowed !== false
                    ? 'Release to drop inside this container'
                    : 'Drag blocks into this layout container or add one directly'}
                </p>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPopoverSearch('');
                      setPopoverTarget({
                        pageId: node.pageId,
                        parentId: node.id,
                        index: 0,
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F7F6F3] hover:bg-[#0B0D0F] text-[#0B0D0F] hover:text-white text-[11px] font-semibold transition-colors"
                  >
                    <Plus size={12} weight="bold" />
                    <span>Add block inside</span>
                  </button>
                )}
              </div>
            ) : (
              <div className={`grid ${containerGridClass} ${gapClass}`}>
                {children.map((child, childIdx) => (
                  <div key={child.id} className="min-w-0">
                    {renderComponentBlock(child, childIdx, children.length, depth + 1)}
                  </div>
                ))}
              </div>
            )}

            {/* Container Popover & Bottom Insert Trigger */}
            {popoverTarget?.parentId === node.id && (
              <div className="mt-2">{renderInsertionSlot(node.pageId, node.id, children.length, true)}</div>
            )}

            {!isReadOnly && children.length > 0 && popoverTarget?.parentId !== node.id && (
              <div className="mt-2.5 pt-2 border-t border-black/[0.05] flex justify-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPopoverSearch('');
                    setPopoverTarget({
                      pageId: node.pageId,
                      parentId: node.id,
                      index: children.length,
                    });
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#5C6066] hover:text-[#0F766E] hover:bg-[#0F766E]/10 transition-colors"
                >
                  <Plus size={12} weight="bold" />
                  <span>Add block to container</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const formSurfaceWidthClass =
    canvasViewport === 'mobile'
      ? 'max-w-[390px]'
      : canvasViewport === 'tablet'
      ? 'max-w-[768px]'
      : tokens.containerMaxWidthClass || 'max-w-3xl';

  // =========================================================================
  // LIVE PREVIEW MODE: Hides all editor controls and renders the exact
  // respondent-facing FormDocumentRenderer interactively without saving data
  // =========================================================================
  if (isLivePreviewMode) {
    const activePageIdxZero = Math.max(
      0,
      document.pages.findIndex((p) => p.id === activePageId)
    );
    return (
      <div className="flex-1 w-full bg-[#E9E6E0] overflow-y-auto min-h-[calc(100dvh-3.5rem)] lg:h-[calc(100dvh-3.5rem)] flex flex-col">
        <div className="sticky top-0 z-20 bg-[#0B0D0F] text-[#F7F6F3] px-4 py-2 flex items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span className="font-semibold truncate">
              Interactive Live Preview ({canvasViewport})
            </span>
            <span className="hidden sm:inline text-white/60 text-[11px] truncate">
              — Test inputs, page flow &amp; validation. No responses are saved.
            </span>
          </div>
          {onExitLivePreview && (
            <button
              type="button"
              onClick={onExitLivePreview}
              className="px-3 py-1 rounded-lg bg-white text-[#0B0D0F] hover:bg-[#F7F6F3] font-semibold text-[11px] flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <PencilSimple size={12} weight="bold" />
              <span>Return to Editor</span>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex justify-center items-start">
          <div
            className={`w-full transition-all duration-300 overflow-hidden shadow-2xl border border-black/[0.12] ${
              canvasViewport === 'mobile'
                ? 'max-w-[390px] rounded-[2.25rem] ring-8 ring-[#0B0D0F]/90'
                : canvasViewport === 'tablet'
                ? 'max-w-[768px] rounded-2xl ring-4 ring-[#0B0D0F]/15'
                : 'max-w-5xl rounded-2xl'
            }`}
          >
            <FormDocumentRenderer
              source={document}
              isPreview={true}
              embedded={true}
              viewportOverride={canvasViewport}
              initialPageIndex={activePageIdxZero}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 w-full bg-[#F2F0EC] overflow-y-auto min-h-[calc(100dvh-3.5rem)] lg:h-[calc(100dvh-3.5rem)] flex flex-col"
      onClick={() => {
        setPopoverTarget(null);
        onSelectTarget({ kind: 'form' });
      }}
    >
      {/* Compact Page Tabs Bar */}
      <div
        className="sticky top-0 z-20 bg-[#F7F6F3]/95 backdrop-blur-md border-b border-black/[0.07] px-3 sm:px-5 py-2 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {document.pages.map((page) => {
            const isActive = !viewAllPages && activePageId === page.id;
            const count = getAllPageComponents(document, page.id).length;
            const isDragOver = dragOverPageTabId === page.id;
            return (
              <button
                key={page.id}
                type="button"
                onClick={() => onSelectPageById(page.id, true)}
                onDragOver={(e) => {
                  if (isReadOnly) return;
                  e.preventDefault();
                  if (dragOverPageTabId !== page.id) setDragOverPageTabId(page.id);
                }}
                onDragLeave={() => {
                  if (dragOverPageTabId === page.id) setDragOverPageTabId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverPageTabId(null);
                  if (isReadOnly) return;
                  const payload = readPayload(e);
                  if (payload) onDropPayloadOnPage(payload, page.id);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-all shrink-0 border ${
                  isDragOver
                    ? 'bg-[#0F766E] text-white border-[#0F766E] ring-2 ring-[#0F766E]/30'
                    : isActive
                      ? 'bg-white text-[#0B0D0F] border-black/15 shadow-xs font-semibold'
                      : 'bg-transparent text-[#5C6066] border-transparent hover:bg-white/70 hover:text-[#0B0D0F]'
                }`}
              >
                <span className="font-mono text-[10px] opacity-60">{page.index}</span>
                <span className="max-w-[120px] truncate">{page.title || `Page ${page.index}`}</span>
                <span className="font-mono text-[10px] opacity-50">({count})</span>
              </button>
            );
          })}

          {!isReadOnly && (
            <button
              type="button"
              onClick={onCreatePage}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#0F766E] hover:bg-[#0F766E]/10 flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
              title="Add a new page"
            >
              <FilePlus size={14} weight="bold" />
              <span>Add Page</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {document.pages.length > 1 && (
            <button
              type="button"
              onClick={onToggleViewAllPages}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                viewAllPages
                  ? 'bg-[#0B0D0F] text-white'
                  : 'bg-white border border-black/[0.08] text-[#5C6066] hover:text-[#0B0D0F]'
              }`}
            >
              {viewAllPages ? 'Single Page View' : 'All Pages'}
            </button>
          )}
        </div>
      </div>

      {/* Main Visual Canvas Area */}
      <div
        className={`relative flex-1 px-3 sm:px-6 lg:px-10 pt-6 pb-32 lg:pb-16 overflow-y-auto studio-surface ${tokens.fontFamilyClass}`}
        style={{
          ...tokens.backgroundStyle,
          ...(tokens.cssVariables as React.CSSProperties),
        }}
      >
        {tokens.backgroundImageUrl && (
          <>
            <img
              src={tokens.backgroundImageUrl}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className="pointer-events-none absolute inset-0 w-full h-full select-none"
              style={tokens.backgroundImageStyle}
            />
            {tokens.backgroundOverlayStyle && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={tokens.backgroundOverlayStyle}
              />
            )}
          </>
        )}

        <div
          className={`relative z-10 w-full transition-all duration-300 space-y-5 ${formSurfaceWidthClass} ${
            canvasViewport === 'mobile'
              ? 'mx-auto ring-8 ring-[#0B0D0F]/90 rounded-[2.25rem] bg-[#F7F6F3]/90 p-3.5 shadow-2xl'
              : canvasViewport === 'tablet'
              ? 'mx-auto ring-4 ring-[#0B0D0F]/15 rounded-2xl bg-white/30 backdrop-blur-xs p-3 shadow-xl'
              : tokens.pageAlignmentClass
          }`}
        >
          {/* Device Viewport Indicator */}
          {canvasViewport === 'mobile' && (
            <div className="w-24 h-1.5 rounded-full bg-black/20 mx-auto mb-1" />
          )}
          {canvasViewport === 'tablet' && (
            <div className="flex justify-center mb-1">
              <span className="px-2 py-0.5 rounded-md bg-black/10 text-[#0B0D0F] font-mono text-[10px] uppercase tracking-wider">
                Tablet · 768px
              </span>
            </div>
          )}

          {/* Read-Only Banner for Viewers */}
          {isReadOnly && (
            <div className="bg-amber-50/95 px-4 py-3 rounded-xl border border-amber-300/70 flex items-center gap-3 text-xs text-amber-950">
              <Eye size={16} weight="regular" className="text-amber-700 shrink-0" />
              <span>
                <strong>Viewer mode:</strong> You can inspect the form and leave comments in the Team panel.
              </span>
            </div>
          )}

          {/* Welcome Screen Visual Card (shown on Page 1 or All Pages) */}
          {(viewAllPages || pagesToRender[0]?.index === 1) && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onSelectTarget({ kind: 'welcome' });
              }}
              className={`p-5 sm:p-6 transition-all cursor-pointer border ${tokens.borderRadiusClass} ${
                selection.kind === 'welcome'
                  ? 'border-[#0F766E] ring-2 ring-[#0F766E]/20'
                  : 'border-black/[0.08] hover:border-black/20'
              }`}
              style={tokens.surfaceStyle}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-[#F7F6F3] text-[#0F766E] flex items-center justify-center">
                    <HandWaving size={15} weight="duotone" />
                  </span>
                  <span className="font-display font-semibold text-xs text-[#0B0D0F]">
                    Welcome Screen
                  </span>
                </div>
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateWelcome({ enabled: !document.welcomeScreen.enabled });
                  }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    document.welcomeScreen.enabled
                      ? 'bg-[#0F766E]/10 text-[#0F766E]'
                      : 'bg-black/[0.05] text-[#5C6066]'
                  }`}
                >
                  {document.welcomeScreen.enabled ? 'Enabled' : 'Hidden'}
                </button>
              </div>

              {document.welcomeScreen.enabled && (
                <div className="space-y-2.5 text-center py-2">
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={document.welcomeScreen.title}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onUpdateWelcome({ title: e.target.value })}
                    placeholder="Welcome headline..."
                    className="w-full text-center text-lg sm:text-xl font-display font-bold text-[#0B0D0F] bg-transparent hover:bg-black/[0.03] focus:bg-[#F7F6F3] rounded-lg px-3 py-1.5 focus:outline-none"
                  />
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={document.welcomeScreen.subtitle}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onUpdateWelcome({ subtitle: e.target.value })}
                    placeholder="Short intro or time estimate..."
                    className="w-full text-center text-xs sm:text-sm text-[#5C6066] bg-transparent hover:bg-black/[0.03] focus:bg-[#F7F6F3] rounded-lg px-3 py-1 focus:outline-none"
                  />
                  <div className="pt-1">
                    <span
                      className={`inline-flex items-center px-5 py-2 text-xs font-semibold text-white ${tokens.buttonClass}`}
                      style={{ backgroundColor: primaryColor }}
                    >
                      {document.welcomeScreen.buttonText || 'Start'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Render Each Active Page as a Respondent-Like Visual Form Sheet */}
          {pagesToRender.map((page) => {
            const topLevelNodes = getPageComponents(document, page.id);
            const isPageSelected = selection.kind === 'page' && selection.pageId === page.id;
            const totalPageBlocks = getAllPageComponents(document, page.id).length;

            return (
              <div
                key={page.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTarget({ kind: 'page', pageId: page.id });
                }}
                className={`${tokens.internalPaddingClass} transition-all ${tokens.borderRadiusClass} ${
                  isPageSelected
                    ? 'ring-2 ring-[#0F766E]/25'
                    : ''
                }`}
                style={{
                  ...tokens.surfaceStyle,
                  ...(isPageSelected ? { borderColor: '#0F766E' } : {}),
                }}
              >
                {/* Form Header (on Page 1) or Page Header */}
                <div className="pb-4 mb-4 border-b border-black/[0.08] space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#5C6066]">
                      Page {page.index} of {document.pages.length} · {page.title || `Page ${page.index}`}
                    </span>
                    <span className="font-mono text-[10px] text-[#5C6066]">
                      {totalPageBlocks} {totalPageBlocks === 1 ? 'block' : 'blocks'}
                    </span>
                  </div>

                  {page.index === 1 ? (
                    <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        disabled={isReadOnly}
                        value={document.title}
                        onFocus={() => onSelectTarget({ kind: 'form' })}
                        onChange={(e) => onUpdateTitle(e.target.value)}
                        placeholder="Untitled Form"
                        className="w-full text-xl sm:text-2xl font-display font-bold tracking-tight bg-transparent hover:bg-black/[0.03] focus:bg-[#F7F6F3] rounded-lg px-2 py-1 -mx-2 focus:outline-none"
                      />
                      <input
                        type="text"
                        disabled={isReadOnly}
                        value={document.description}
                        onFocus={() => onSelectTarget({ kind: 'form' })}
                        onChange={(e) => onUpdateDescription(e.target.value)}
                        placeholder="Add a short form description..."
                        className="w-full text-xs sm:text-sm opacity-75 bg-transparent hover:bg-black/[0.03] focus:bg-[#F7F6F3] rounded-lg px-2 py-1 -mx-2 focus:outline-none"
                      />
                    </div>
                  ) : (
                    <div>
                      <h2 className="text-lg sm:text-xl font-display font-bold tracking-tight">
                        {page.title || `Page ${page.index}`}
                      </h2>
                      {page.description && (
                        <p className="text-xs sm:text-sm opacity-70 mt-0.5">{page.description}</p>
                      )}
                    </div>
                  )}

                  {/* Respondent Progress Bar Live Preview */}
                  {document.settings.showProgressBar !== false && (
                    <div className="pt-1.5 space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono opacity-60">
                        <span>Progress Bar (Enabled)</span>
                        <span>
                          {Math.round((page.index / Math.max(1, document.pages.length)) * 100)}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-black/[0.08] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.round(
                              (page.index / Math.max(1, document.pages.length)) * 100
                            )}%`,
                            backgroundColor: primaryColor,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Page Body: Empty State OR Interactive Component Blocks */}
                {topLevelNodes.length === 0 ? (
                  <div
                    onDragOver={(e) => {
                      if (isReadOnly) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const key = `${page.id}:empty`;
                      if (dropSlotKey !== key) setDropSlotKey(key);
                    }}
                    onDragLeave={() => setDropSlotKey(null)}
                    onDrop={(e) => handleDropAtSlot(e, page.id, null, 0)}
                    onClick={(e) => e.stopPropagation()}
                    className={`rounded-2xl border-2 border-dashed p-8 sm:p-10 text-center space-y-4 transition-all ${
                      dropSlotKey === `${page.id}:empty`
                        ? 'border-[#0F766E] bg-[#0F766E]/[0.06]'
                        : 'border-black/[0.12] bg-[#FAF9F7]/70'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <p className="text-sm font-display font-semibold text-[#0B0D0F]">
                        {dropSlotKey === `${page.id}:empty`
                          ? 'Drop your block right here'
                          : 'Start building this page'}
                      </p>
                      <p className="text-xs text-[#5C6066] max-w-sm mx-auto leading-relaxed">
                        Drag any component from the left sidebar onto this canvas, or pick a starter block below.
                      </p>
                    </div>

                    {!isReadOnly && (
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        {STARTER_BLOCKS.map((type) => {
                          const def = formComponentRegistry.get(type);
                          if (!def) return null;
                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() => onAddComponent(type, page.id, { insertAtIndex: 0 })}
                              className="px-3 py-2 rounded-xl bg-white border border-black/[0.1] hover:border-[#0F766E] text-xs font-semibold text-[#0B0D0F] flex items-center gap-1.5 transition-all"
                            >
                              <RegisteredComponentIcon
                                type={type}
                                size={14}
                                className="text-[#0F766E]"
                              />
                              <span>{def.shortLabel}</span>
                            </button>
                          );
                        })}
                        {onOpenMobileAddDrawer && (
                          <button
                            type="button"
                            onClick={onOpenMobileAddDrawer}
                            className="lg:hidden px-3 py-2 rounded-xl bg-[#0B0D0F] text-white text-xs font-semibold flex items-center gap-1.5"
                          >
                            <Plus size={14} weight="bold" />
                            <span>Browse all blocks</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    {renderInsertionSlot(page.id, null, 0)}
                    {topLevelNodes.map((node, idx) => (
                      <React.Fragment key={node.id}>
                        {renderComponentBlock(node, idx, topLevelNodes.length, 0)}
                        {renderInsertionSlot(page.id, null, idx + 1)}
                      </React.Fragment>
                    ))}
                  </div>
                )}

                {/* Visual Submit / Next Button Footer Preview */}
                <div className="mt-5 pt-4 border-t border-black/[0.08] flex items-center justify-between gap-3">
                  <span className="text-[11px] font-mono opacity-65">
                    {page.index < document.pages.length ? 'Next Page button' : 'Submit button'}
                  </span>
                  <span className={tokens.buttonClassName} style={tokens.buttonStyle}>
                    {page.index < document.pages.length
                      ? 'Continue'
                      : document.settings.submitButtonText || 'Submit'}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Thank You Screen Visual Card (shown on last page or All Pages) */}
          {(viewAllPages ||
            pagesToRender[pagesToRender.length - 1]?.index === document.pages.length) && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onSelectTarget({ kind: 'thank_you' });
              }}
              className={`p-5 sm:p-6 transition-all cursor-pointer border ${tokens.borderRadiusClass} ${
                selection.kind === 'thank_you'
                  ? 'border-[#0F766E] ring-2 ring-[#0F766E]/20'
                  : 'border-black/[0.08] hover:border-black/20'
              }`}
              style={tokens.surfaceStyle}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-[#F7F6F3] text-[#0F766E] flex items-center justify-center">
                    <Confetti size={15} weight="duotone" />
                  </span>
                  <span className="font-display font-semibold text-xs text-[#0B0D0F]">
                    Thank-You Screen
                  </span>
                </div>
                <span className="text-[10px] font-mono text-[#5C6066]">Shown after submission</span>
              </div>

              <div className="space-y-2 text-center py-1" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={document.thankYouScreen.title}
                  onChange={(e) => onUpdateThankYou({ title: e.target.value })}
                  placeholder="Thank you!"
                  className="w-full text-center text-lg font-display font-bold text-[#0B0D0F] bg-transparent hover:bg-black/[0.03] focus:bg-[#F7F6F3] rounded-lg px-3 py-1 focus:outline-none"
                />
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={document.thankYouScreen.message}
                  onChange={(e) => onUpdateThankYou({ message: e.target.value })}
                  placeholder="Your response has been recorded."
                  className="w-full text-center text-xs text-[#5C6066] bg-transparent hover:bg-black/[0.03] focus:bg-[#F7F6F3] rounded-lg px-3 py-1 focus:outline-none"
                />
                <div className="pt-1 flex justify-center">
                  <button
                    type="button"
                    disabled={isReadOnly}
                    onClick={() =>
                      onUpdateThankYou({
                        showRestartButton: !document.thankYouScreen.showRestartButton,
                      })
                    }
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                      document.thankYouScreen.showRestartButton
                        ? 'bg-[#0F766E]/10 text-[#0F766E] font-semibold'
                        : 'bg-[#F7F6F3] text-[#5C6066]'
                    }`}
                  >
                    <Check size={12} weight="bold" />
                    <span>Allow submitting another response</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
