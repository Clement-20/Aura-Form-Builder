/**
 * FlexStore / AuraForm Studio — Editor Engine
 *
 * Manages editing interactions, contextual selection (component, page, form,
 * welcome screen, thank-you screen), canvas viewport mode (desktop/mobile),
 * active page state, undo/redo history, remote co-authoring reconciliation,
 * and delegates all state transitions to the immutable Document Engine.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  FormLayoutMode,
  FormSchema,
  FormSettings,
  FormThankYouScreen,
  FormTheme,
  FormWelcomeScreen,
} from '../../types/form';
import {
  CrossFieldValidationRule,
  FormComponentNode,
  FormComponentType,
  FormDesignConfig,
  FormDocument,
  FormOutcomeConfig,
  FormPage,
  FormScoringConfig,
  FormVariableDefinition,
} from '../document/types';
import { AnyLogicRule, LogicValidationReport } from '../logic/types';
import { validateFormLogic } from './logic-engine';
import { renameVariableInDocument } from './piping-engine';
import {
  migrateLegacyFormToDocument,
  serializeDocumentToLegacyForm,
} from '../document/migration';
import {
  canRedoHistory,
  canUndoHistory,
  createHistory,
  HistoryState,
  pushHistory,
  redoHistory,
  replaceHistoryPresent,
  undoHistory,
} from './history-engine';
import {
  addComponent,
  AddComponentOptions,
  canNestComponent,
  createPage,
  deletePage,
  duplicateComponent,
  duplicatePage,
  getOrderedComponents,
  getPageByIndex,
  moveComponent,
  moveComponentByOffset,
  MoveComponentDestination,
  moveComponentToPage,
  NestingValidationResult,
  removeComponent,
  reorderComponent,
  reorderPage,
  resetComponentAppearance,
  resetDesignToDefault,
  splitPageAfterComponent,
  updateComponent,
  updateCrossFieldValidations,
  updateDesign,
  updateFormMeta,
  updateGlobalSettings,
  updateLogicRules,
  updateOutcomesConfig,
  updatePage,
  updateScoringConfig,
  updateThankYouScreen,
  updateVariables,
  updateWelcomeScreen,
} from './document-engine';
import { ComponentRegistry } from '../registry/ComponentRegistry';
import { formComponentRegistry } from '../registry/builtin-components';
import { ComponentNodePatch } from '../registry/types';

export interface ActivityNote {
  action: string;
  summary: string;
}

export type CanvasViewport = 'desktop' | 'tablet' | 'mobile';

export type SelectionTarget =
  | { kind: 'component'; id: string }
  | { kind: 'page'; pageId: string }
  | { kind: 'form' }
  | { kind: 'welcome' }
  | { kind: 'thank_you' };

export interface UseFormStudioOptions {
  readOnly?: boolean;
  maxHistory?: number;
  registry?: ComponentRegistry;
  onLocalMutation?: (nextDoc: FormDocument, activityNote?: ActivityNote) => void;
}

export interface FormStudioController {
  document: FormDocument;
  /** Backward-compatible v1 projection for persistence & existing sub-tabs */
  legacyForm: FormSchema;
  orderedComponents: FormComponentNode[];
  pages: FormPage[];
  activePageId: string;
  activePageIndex: number; // 1-based
  viewAllPages: boolean;
  canvasViewport: CanvasViewport;
  isLivePreviewMode: boolean;
  selection: SelectionTarget;
  selectedComponentId: string | null;
  selectedComponent: FormComponentNode | null;
  selectedPage: FormPage | null;
  canUndo: boolean;
  canRedo: boolean;
  logicValidation: LogicValidationReport;

  // Selection, viewport & navigation
  selectTarget: (target: SelectionTarget) => void;
  selectComponent: (id: string | null) => void;
  selectPageById: (pageId: string, inspectPage?: boolean) => void;
  selectPageByNumber: (pageNumber: number) => void;
  setViewAllPages: (value: boolean) => void;
  toggleViewAllPages: () => void;
  setCanvasViewport: (viewport: CanvasViewport) => void;
  setIsLivePreviewMode: (value: boolean) => void;
  toggleLivePreviewMode: () => void;

  // History
  undo: () => void;
  redo: () => void;

  // Nesting validation
  canNestComponent: (
    componentIdOrType: string,
    targetParentId: string | null
  ) => NestingValidationResult;

  // Component operations
  addComponent: (
    type: FormComponentType,
    targetPageId?: string,
    options?: AddComponentOptions
  ) => string | null;
  insertComponentFromLibrary: (
    type: FormComponentType,
    targetPageId?: string,
    options?: AddComponentOptions
  ) => string | null;
  removeComponent: (componentId: string) => void;
  duplicateComponent: (componentId: string) => string | null;
  updateComponent: (componentId: string, patch: ComponentNodePatch) => void;
  resetComponentAppearance: (componentId: string) => void;
  moveComponent: (componentId: string, destination: MoveComponentDestination) => void;
  reorderComponent: (componentId: string, targetIndex: number, targetPageId?: string) => void;
  moveComponentByOffset: (componentId: string, direction: 'up' | 'down') => void;
  moveComponentToPage: (componentId: string, targetPageId: string, targetIndex?: number) => void;

  // Page operations
  createPage: (options?: { title?: string; description?: string }) => string | null;
  duplicatePage: (pageId: string) => string | null;
  updatePage: (
    pageId: string,
    patch: Partial<Pick<FormPage, 'title' | 'description' | 'appearance' | 'layout'>>
  ) => void;
  deletePage: (pageId: string, options?: { deleteComponents?: boolean }) => void;
  reorderPage: (pageId: string, direction: 'left' | 'right') => void;
  splitPageAfterComponent: (componentId: string) => string | null;

  // Global form operations
  updateTitle: (title: string) => void;
  updateDescription: (description: string) => void;
  updateLayoutMode: (mode: FormLayoutMode) => void;
  updateGlobalSettings: (patch: Partial<FormSettings>, note?: ActivityNote) => void;
  updateDesign: (patch: Partial<FormDesignConfig | FormTheme>, note?: ActivityNote) => void;
  resetDesignToDefault: () => void;
  updateWelcomeScreen: (patch: Partial<FormWelcomeScreen>) => void;
  updateThankYouScreen: (patch: Partial<FormThankYouScreen>) => void;
  updateLogicRules: (rules: AnyLogicRule[]) => void;
  updateCrossFieldValidations: (rules: CrossFieldValidationRule[]) => void;
  updateScoringConfig: (scoring: FormScoringConfig) => void;
  updateOutcomesConfig: (outcomes: FormOutcomeConfig) => void;
  updateVariables: (variables: FormVariableDefinition[]) => void;
  renameVariable: (variableId: string, nextName: string) => { error?: string };

  // Sync / external replacement
  applyRemoteFormSnapshot: (remoteForm: FormSchema | FormDocument) => void;
  replaceDocument: (nextForm: FormSchema | FormDocument, note?: ActivityNote) => void;
}

export function useFormStudio(
  initialForm: FormSchema | FormDocument,
  options: UseFormStudioOptions = {}
): FormStudioController {
  const {
    readOnly = false,
    maxHistory = 40,
    registry = formComponentRegistry,
    onLocalMutation,
  } = options;

  const [history, setHistory] = useState<HistoryState<FormDocument>>(() =>
    createHistory(migrateLegacyFormToDocument(initialForm), maxHistory)
  );

  const document = history.present;

  const [activePageId, setActivePageId] = useState<string>(
    () => document.pages[0]?.id || 'step_1'
  );
  const [viewAllPages, setViewAllPages] = useState<boolean>(false);
  const [canvasViewport, setCanvasViewport] = useState<CanvasViewport>('desktop');
  const [isLivePreviewMode, setIsLivePreviewMode] = useState<boolean>(false);
  const [selection, setSelection] = useState<SelectionTarget>(() => {
    const first = getOrderedComponents(document)[0];
    return first ? { kind: 'component', id: first.id } : { kind: 'form' };
  });

  // Resolve active page safely even if a page was deleted or updated remotely
  const resolvedActivePage = useMemo(() => {
    return document.pages.find((p) => p.id === activePageId) || document.pages[0];
  }, [document.pages, activePageId]);

  const activePageIndex = resolvedActivePage ? resolvedActivePage.index : 1;

  const orderedComponents = useMemo(() => getOrderedComponents(document), [document]);
  const legacyForm = useMemo(() => serializeDocumentToLegacyForm(document), [document]);
  const logicValidation = useMemo(() => validateFormLogic(document), [document]);

  // Normalize selection if selected component or page no longer exists
  const resolvedSelection: SelectionTarget = useMemo(() => {
    if (selection.kind === 'component' && !document.components[selection.id]) {
      return { kind: 'form' };
    }
    if (selection.kind === 'page' && !document.pages.some((p) => p.id === selection.pageId)) {
      return resolvedActivePage ? { kind: 'page', pageId: resolvedActivePage.id } : { kind: 'form' };
    }
    return selection;
  }, [selection, document.components, document.pages, resolvedActivePage]);

  const selectedComponentId =
    resolvedSelection.kind === 'component' ? resolvedSelection.id : null;

  const selectedComponent = useMemo(
    () => (selectedComponentId ? document.components[selectedComponentId] || null : null),
    [document.components, selectedComponentId]
  );

  const selectedPage = useMemo(() => {
    if (resolvedSelection.kind === 'page') {
      return document.pages.find((p) => p.id === resolvedSelection.pageId) || null;
    }
    return null;
  }, [resolvedSelection, document.pages]);

  const selectTarget = useCallback((target: SelectionTarget) => {
    setSelection(target);
    if (target.kind === 'page') {
      setActivePageId(target.pageId);
    }
  }, []);

  const selectComponent = useCallback((id: string | null) => {
    if (id) {
      setSelection({ kind: 'component', id });
    } else {
      setSelection({ kind: 'form' });
    }
  }, []);

  const commit = useCallback(
    (updater: (current: FormDocument) => FormDocument, note?: ActivityNote) => {
      if (readOnly) return;
      setHistory((prev) => {
        const nextDoc = updater(prev.present);
        if (Object.is(nextDoc, prev.present)) return prev;
        if (onLocalMutation) onLocalMutation(nextDoc, note);
        return pushHistory(prev, nextDoc);
      });
    },
    [readOnly, onLocalMutation]
  );

  const handleUndo = useCallback(() => {
    if (readOnly) return;
    setHistory((prev) => {
      if (!canUndoHistory(prev)) return prev;
      const next = undoHistory(prev);
      if (onLocalMutation) onLocalMutation(next.present);
      return next;
    });
  }, [readOnly, onLocalMutation]);

  const handleRedo = useCallback(() => {
    if (readOnly) return;
    setHistory((prev) => {
      if (!canRedoHistory(prev)) return prev;
      const next = redoHistory(prev);
      if (onLocalMutation) onLocalMutation(next.present);
      return next;
    });
  }, [readOnly, onLocalMutation]);

  const handleCanNestComponent = useCallback(
    (componentIdOrType: string, targetParentId: string | null): NestingValidationResult => {
      return canNestComponent(document, componentIdOrType, targetParentId, registry);
    },
    [document, registry]
  );

  const handleAddComponent = useCallback(
    (
      type: FormComponentType,
      targetPageId?: string,
      addOptions?: AddComponentOptions
    ): string | null => {
      if (readOnly) return null;
      const def = registry.get(type);

      // Handle special screen blocks (Welcome / Thank-You)
      if (def?.specialAction === 'welcome') {
        commit((cur) => updateWelcomeScreen(cur, { enabled: true }), {
          action: 'welcome_enabled',
          summary: 'Enabled Welcome Screen',
        });
        setSelection({ kind: 'welcome' });
        return null;
      }
      if (def?.specialAction === 'thank_you') {
        setSelection({ kind: 'thank_you' });
        return null;
      }

      const pageId =
        targetPageId || (!viewAllPages ? resolvedActivePage?.id : document.pages[0]?.id);
      let createdId: string | null = null;

      setHistory((prev) => {
        const result = addComponent(prev.present, type, pageId, addOptions, registry);
        createdId = result.componentId;
        if (onLocalMutation) {
          onLocalMutation(result.doc, {
            action: 'field_added',
            summary: `Added ${def?.displayName || type}`,
          });
        }
        return pushHistory(prev, result.doc);
      });

      if (createdId) {
        setSelection({ kind: 'component', id: createdId });
      }
      return createdId;
    },
    [
      readOnly,
      viewAllPages,
      resolvedActivePage?.id,
      document.pages,
      registry,
      commit,
      onLocalMutation,
    ]
  );

  /**
   * Smart insertion from the left sidebar or keyboard:
   * - If Welcome / Thank-You special block: enables/selects that screen.
   * - If explicit parentId or insertAtIndex is passed: uses it directly.
   * - If a layout container is currently selected and nesting is valid: inserts inside it.
   * - If a component is selected: inserts right after it in the same parent/page.
   * - Otherwise appends to the active page.
   */
  const handleInsertComponentFromLibrary = useCallback(
    (
      type: FormComponentType,
      targetPageId?: string,
      addOptions?: AddComponentOptions
    ): string | null => {
      if (readOnly) return null;
      const def = registry.get(type);
      if (def?.specialAction === 'welcome' || def?.specialAction === 'thank_you') {
        return handleAddComponent(type, targetPageId, addOptions);
      }

      if (addOptions?.parentId !== undefined || addOptions?.insertAtIndex !== undefined) {
        return handleAddComponent(type, targetPageId, addOptions);
      }

      if (selectedComponent) {
        // Insert into selected container if valid
        if (
          registry.isContainer(selectedComponent.type) &&
          canNestComponent(document, type, selectedComponent.id, registry).allowed
        ) {
          return handleAddComponent(type, selectedComponent.pageId, {
            parentId: selectedComponent.id,
          });
        }

        // Insert right after selected component within its container or page
        if (selectedComponent.parentId) {
          const parent = document.components[selectedComponent.parentId];
          const idx = parent?.children?.indexOf(selectedComponent.id) ?? -1;
          if (
            parent &&
            idx >= 0 &&
            canNestComponent(document, type, parent.id, registry).allowed
          ) {
            return handleAddComponent(type, selectedComponent.pageId, {
              parentId: parent.id,
              insertAtIndex: idx + 1,
            });
          }
        } else {
          const page = document.pages.find((p) => p.id === selectedComponent.pageId);
          const idx = page?.componentIds.indexOf(selectedComponent.id) ?? -1;
          if (page && idx >= 0) {
            return handleAddComponent(type, page.id, {
              insertAtIndex: idx + 1,
            });
          }
        }
      }

      return handleAddComponent(type, targetPageId, addOptions);
    },
    [readOnly, registry, handleAddComponent, selectedComponent, document]
  );

  const handleRemoveComponent = useCallback(
    (componentId: string) => {
      if (readOnly) return;
      const label = document.components[componentId]?.content.label || 'a block';
      commit((cur) => removeComponent(cur, componentId), {
        action: 'field_deleted',
        summary: `Removed "${label}"`,
      });
      setSelection((prev) =>
        prev.kind === 'component' && prev.id === componentId ? { kind: 'form' } : prev
      );
    },
    [readOnly, document.components, commit]
  );

  const handleDuplicateComponent = useCallback(
    (componentId: string): string | null => {
      if (readOnly) return null;
      let createdId: string | null = null;
      const label = document.components[componentId]?.content.label || 'block';

      setHistory((prev) => {
        const result = duplicateComponent(prev.present, componentId);
        createdId = result.componentId;
        if (!result.componentId) return prev;
        if (onLocalMutation) {
          onLocalMutation(result.doc, {
            action: 'field_duplicated',
            summary: `Duplicated "${label}"`,
          });
        }
        return pushHistory(prev, result.doc);
      });

      if (createdId) setSelection({ kind: 'component', id: createdId });
      return createdId;
    },
    [readOnly, document.components, onLocalMutation]
  );

  const handleUpdateComponent = useCallback(
    (componentId: string, patch: ComponentNodePatch) => {
      commit((cur) => updateComponent(cur, componentId, patch, registry));
    },
    [commit, registry]
  );

  const handleResetComponentAppearance = useCallback(
    (componentId: string) => {
      commit((cur) => resetComponentAppearance(cur, componentId), {
        action: 'style_reset',
        summary: 'Reset component styling to theme defaults',
      });
    },
    [commit]
  );

  const handleMoveComponent = useCallback(
    (componentId: string, destination: MoveComponentDestination) => {
      commit((cur) => moveComponent(cur, componentId, destination, registry));
    },
    [commit, registry]
  );

  const handleReorderComponent = useCallback(
    (componentId: string, targetIndex: number, targetPageId?: string) => {
      commit((cur) => reorderComponent(cur, componentId, targetIndex, targetPageId));
    },
    [commit]
  );

  const handleMoveComponentByOffset = useCallback(
    (componentId: string, direction: 'up' | 'down') => {
      commit((cur) => moveComponentByOffset(cur, componentId, direction));
    },
    [commit]
  );

  const handleMoveComponentToPage = useCallback(
    (componentId: string, targetPageId: string, targetIndex?: number) => {
      commit((cur) => moveComponentToPage(cur, componentId, targetPageId, targetIndex));
    },
    [commit]
  );

  const handleCreatePage = useCallback(
    (pageOpts?: { title?: string; description?: string }): string | null => {
      if (readOnly) return null;
      let createdPageId: string | null = null;
      setHistory((prev) => {
        const result = createPage(prev.present, pageOpts);
        createdPageId = result.pageId;
        if (onLocalMutation) {
          onLocalMutation(result.doc, {
            action: 'page_added',
            summary: `Added Page ${result.doc.pages.length}`,
          });
        }
        return pushHistory(prev, result.doc);
      });

      if (createdPageId) {
        setActivePageId(createdPageId);
        setViewAllPages(false);
        setSelection({ kind: 'page', pageId: createdPageId });
      }
      return createdPageId;
    },
    [readOnly, onLocalMutation]
  );

  const handleDuplicatePage = useCallback(
    (pageId: string): string | null => {
      if (readOnly) return null;
      let createdPageId: string | null = null;
      const sourceTitle = document.pages.find((p) => p.id === pageId)?.title || 'Page';
      setHistory((prev) => {
        const result = duplicatePage(prev.present, pageId);
        createdPageId = result.pageId;
        if (!result.pageId) return prev;
        if (onLocalMutation) {
          onLocalMutation(result.doc, {
            action: 'page_duplicated',
            summary: `Duplicated "${sourceTitle}"`,
          });
        }
        return pushHistory(prev, result.doc);
      });

      if (createdPageId) {
        setActivePageId(createdPageId);
        setViewAllPages(false);
        setSelection({ kind: 'page', pageId: createdPageId });
      }
      return createdPageId;
    },
    [readOnly, document.pages, onLocalMutation]
  );

  const handleUpdatePage = useCallback(
    (
      pageId: string,
      patch: Partial<Pick<FormPage, 'title' | 'description' | 'appearance' | 'layout'>>
    ) => {
      commit((cur) => updatePage(cur, pageId, patch));
    },
    [commit]
  );

  const handleDeletePage = useCallback(
    (pageId: string, deleteOpts?: { deleteComponents?: boolean }) => {
      if (readOnly) return;
      const targetIdx = document.pages.findIndex((p) => p.id === pageId);
      const fallback = document.pages[Math.max(0, targetIdx - 1)] || document.pages[0];
      commit((cur) => deletePage(cur, pageId, deleteOpts), {
        action: 'page_deleted',
        summary: `Removed Page ${targetIdx + 1}`,
      });
      if (fallback && fallback.id !== pageId) {
        setActivePageId(fallback.id);
        setSelection({ kind: 'page', pageId: fallback.id });
      }
    },
    [readOnly, document.pages, commit]
  );

  const handleReorderPage = useCallback(
    (pageId: string, direction: 'left' | 'right') => {
      commit((cur) => reorderPage(cur, pageId, direction));
    },
    [commit]
  );

  const handleSplitPageAfterComponent = useCallback(
    (componentId: string): string | null => {
      if (readOnly) return null;
      let newPageId: string | null = null;
      setHistory((prev) => {
        const result = splitPageAfterComponent(prev.present, componentId);
        newPageId = result.pageId;
        if (!result.pageId) return prev;
        if (onLocalMutation) {
          onLocalMutation(result.doc, {
            action: 'page_added',
            summary: 'Split questions into a new page',
          });
        }
        return pushHistory(prev, result.doc);
      });
      if (newPageId) {
        setActivePageId(newPageId);
        setViewAllPages(false);
      }
      return newPageId;
    },
    [readOnly, onLocalMutation]
  );

  const handleUpdateTitle = useCallback(
    (title: string) => {
      commit((cur) => updateFormMeta(cur, { title }));
    },
    [commit]
  );

  const handleUpdateDescription = useCallback(
    (description: string) => {
      commit((cur) => updateFormMeta(cur, { description }));
    },
    [commit]
  );

  const handleUpdateLayoutMode = useCallback(
    (layoutMode: FormLayoutMode) => {
      commit((cur) => updateFormMeta(cur, { layoutMode }), {
        action: 'layout_changed',
        summary: `Switched layout style to ${layoutMode}`,
      });
    },
    [commit]
  );

  const handleUpdateGlobalSettings = useCallback(
    (patch: Partial<FormSettings>, note?: ActivityNote) => {
      commit((cur) => updateGlobalSettings(cur, patch), note);
    },
    [commit]
  );

  const handleUpdateDesign = useCallback(
    (patch: Partial<FormDesignConfig | FormTheme>, note?: ActivityNote) => {
      commit((cur) => updateDesign(cur, patch), note);
    },
    [commit]
  );

  const handleResetDesignToDefault = useCallback(() => {
    commit((cur) => resetDesignToDefault(cur), {
      action: 'theme_reset',
      summary: 'Reset form design to default FlexStore theme',
    });
  }, [commit]);

  const handleUpdateWelcomeScreen = useCallback(
    (patch: Partial<FormWelcomeScreen>) => {
      commit((cur) => updateWelcomeScreen(cur, patch));
    },
    [commit]
  );

  const handleUpdateThankYouScreen = useCallback(
    (patch: Partial<FormThankYouScreen>) => {
      commit((cur) => updateThankYouScreen(cur, patch));
    },
    [commit]
  );

  const handleUpdateLogicRules = useCallback(
    (rules: AnyLogicRule[]) => {
      commit((cur) => updateLogicRules(cur, rules), {
        action: 'logic_updated',
        summary: 'Updated conditional logic rules',
      });
    },
    [commit]
  );

  const handleUpdateCrossFieldValidations = useCallback(
    (rules: CrossFieldValidationRule[]) => {
      commit((cur) => updateCrossFieldValidations(cur, rules), {
        action: 'validation_updated',
        summary: 'Updated cross-field validation rules',
      });
    },
    [commit]
  );

  const handleUpdateScoringConfig = useCallback(
    (scoring: FormScoringConfig) => {
      commit((cur) => updateScoringConfig(cur, scoring), {
        action: 'scoring_updated',
        summary: 'Updated scoring configuration',
      });
    },
    [commit]
  );

  const handleUpdateOutcomesConfig = useCallback(
    (outcomes: FormOutcomeConfig) => {
      commit((cur) => updateOutcomesConfig(cur, outcomes), {
        action: 'outcomes_updated',
        summary: 'Updated personalised outcomes',
      });
    },
    [commit]
  );

  const handleUpdateVariables = useCallback(
    (variables: FormVariableDefinition[]) => {
      commit((cur) => updateVariables(cur, variables), {
        action: 'variables_updated',
        summary: 'Updated form variables',
      });
    },
    [commit]
  );

  const handleRenameVariable = useCallback(
    (variableId: string, nextName: string): { error?: string } => {
      if (readOnly) return { error: 'Form is read-only.' };
      const check = renameVariableInDocument(document, variableId, nextName);
      if (check.error) return { error: check.error };
      commit(
        (cur) => {
          const res = renameVariableInDocument(cur, variableId, nextName);
          return res.error ? cur : res.document;
        },
        {
          action: 'variable_renamed',
          summary: `Renamed variable to "${nextName.trim()}"`,
        }
      );
      return {};
    },
    [readOnly, document, commit]
  );

  const applyRemoteFormSnapshot = useCallback((remoteForm: FormSchema | FormDocument) => {
    const migrated = migrateLegacyFormToDocument(remoteForm);
    setHistory((prev) => replaceHistoryPresent(prev, migrated));
  }, []);

  const replaceDocument = useCallback(
    (nextForm: FormSchema | FormDocument, note?: ActivityNote) => {
      if (readOnly) return;
      const migrated = migrateLegacyFormToDocument(nextForm);
      setHistory((prev) => {
        if (onLocalMutation) onLocalMutation(migrated, note);
        return pushHistory(prev, migrated);
      });
      const firstComp = getOrderedComponents(migrated)[0];
      setSelection(firstComp ? { kind: 'component', id: firstComp.id } : { kind: 'form' });
      if (migrated.pages[0]) setActivePageId(migrated.pages[0].id);
    },
    [readOnly, onLocalMutation]
  );

  const selectPageByNumber = useCallback(
    (pageNumber: number) => {
      const target = getPageByIndex(document, pageNumber);
      if (target) {
        setActivePageId(target.id);
        setViewAllPages(false);
      }
    },
    [document]
  );

  return {
    document,
    legacyForm,
    orderedComponents,
    pages: document.pages,
    activePageId: resolvedActivePage?.id || 'step_1',
    activePageIndex,
    viewAllPages,
    canvasViewport,
    isLivePreviewMode,
    selection: resolvedSelection,
    selectedComponentId,
    selectedComponent,
    selectedPage,
    canUndo: canUndoHistory(history),
    canRedo: canRedoHistory(history),
    logicValidation,

    selectTarget,
    selectComponent,
    selectPageById: (pageId, inspectPage = false) => {
      setActivePageId(pageId);
      setViewAllPages(false);
      if (inspectPage) {
        setSelection({ kind: 'page', pageId });
      }
    },
    selectPageByNumber,
    setViewAllPages,
    toggleViewAllPages: () => setViewAllPages((v) => !v),
    setCanvasViewport,
    setIsLivePreviewMode,
    toggleLivePreviewMode: () => setIsLivePreviewMode((v) => !v),

    undo: handleUndo,
    redo: handleRedo,

    canNestComponent: handleCanNestComponent,

    addComponent: handleAddComponent,
    insertComponentFromLibrary: handleInsertComponentFromLibrary,
    removeComponent: handleRemoveComponent,
    duplicateComponent: handleDuplicateComponent,
    updateComponent: handleUpdateComponent,
    resetComponentAppearance: handleResetComponentAppearance,
    moveComponent: handleMoveComponent,
    reorderComponent: handleReorderComponent,
    moveComponentByOffset: handleMoveComponentByOffset,
    moveComponentToPage: handleMoveComponentToPage,

    createPage: handleCreatePage,
    duplicatePage: handleDuplicatePage,
    updatePage: handleUpdatePage,
    deletePage: handleDeletePage,
    reorderPage: handleReorderPage,
    splitPageAfterComponent: handleSplitPageAfterComponent,

    updateTitle: handleUpdateTitle,
    updateDescription: handleUpdateDescription,
    updateLayoutMode: handleUpdateLayoutMode,
    updateGlobalSettings: handleUpdateGlobalSettings,
    updateDesign: handleUpdateDesign,
    resetDesignToDefault: handleResetDesignToDefault,
    updateWelcomeScreen: handleUpdateWelcomeScreen,
    updateThankYouScreen: handleUpdateThankYouScreen,
    updateLogicRules: handleUpdateLogicRules,
    updateCrossFieldValidations: handleUpdateCrossFieldValidations,
    updateScoringConfig: handleUpdateScoringConfig,
    updateOutcomesConfig: handleUpdateOutcomesConfig,
    updateVariables: handleUpdateVariables,
    renameVariable: handleRenameVariable,

    applyRemoteFormSnapshot,
    replaceDocument,
  };
}
