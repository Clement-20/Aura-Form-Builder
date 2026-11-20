import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus,
  Files,
  SlidersHorizontal,
  Eye,
  UsersThree,
} from '@phosphor-icons/react';
import {
  FormSchema,
  FormSettings,
} from '../../types/form';
import {
  CollaboratorPresence,
  FormActivityItem,
  FormComment,
  TeamRole,
  TeamWorkspace,
} from '../../types/team';
import { EditorHeader } from './EditorHeader';
import { FieldsSidebar } from './FieldsSidebar';
import { EditorCanvas } from './EditorCanvas';
import { FieldInspector } from './FieldInspector';
import { ConfirmDialog } from './ConfirmDialog';
import { ThemeStudio } from './ThemeStudio';
import { VisualLogicBuilder } from './VisualLogicBuilder';
import { SettingsTab } from './SettingsTab';
import { ShareTab } from './ShareTab';
import { AnalyticsTab } from './AnalyticsTab';
import { PreviewModal } from '../runner/PreviewModal';
import { AIGeneratorModal } from './AIGeneratorModal';
import { CoAuthorPanel } from '../team/CoAuthorPanel';
import { saveForm } from '../../lib/storage';
import { useFirebase } from '../../contexts/FirebaseContext';
import {
  addFormComment,
  clearFormPresence,
  deleteFormComment,
  logFormActivity,
  publishFormPresence,
  subscribeToFormActivity,
  subscribeToFormComments,
  subscribeToFormPresence,
  subscribeToTeamForm,
  toggleResolveComment,
  updateTeamForm,
} from '../../lib/team-service';
import {
  ActivityNote,
  getAllPageComponents,
  useFormStudio,
} from '../../studio';
import { StudioDragPayload } from './dnd-types';

interface FormEditorProps {
  initialForm: FormSchema;
  initialTab?: 'build' | 'theme' | 'logic' | 'settings' | 'share' | 'analytics';
  teamId?: string | null;
  team?: TeamWorkspace | null;
  teamRole?: TeamRole | null;
  onShareLocalFormToTeam?: (form: FormSchema, targetTeamId: string) => Promise<void>;
  onOpenTeamModal?: () => void;
  onBackToDashboard: () => void;
  onOpenPublicView: (slug: string) => void;
}

type PendingConfirmation =
  | { kind: 'delete_page'; pageId: string; pageTitle: string; blockCount: number }
  | { kind: 'delete_container'; componentId: string; label: string; childCount: number }
  | { kind: 'publish_logic_errors'; errorCount: number; firstErrorMessage: string };

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable
  );
}

export const FormEditor: React.FC<FormEditorProps> = ({
  initialForm,
  initialTab = 'build',
  teamId = null,
  team = null,
  teamRole = null,
  onShareLocalFormToTeam,
  onOpenTeamModal,
  onBackToDashboard,
  onOpenPublicView,
}) => {
  const { firebaseUser, teamMembers } = useFirebase();
  const isTeamForm = Boolean(teamId && firebaseUser);
  const isReadOnly = isTeamForm && teamRole === 'viewer';

  // Sync guards to prevent infinite echo loops in real-time co-authoring
  const isRemoteUpdateRef = useRef(false);
  const versionRef = useRef<number>((initialForm as any).version || 1);
  const hasLocalChangesRef = useRef(false);
  const pendingActivityRef = useRef<ActivityNote | null>(null);

  const handleLocalMutation = useCallback((_nextDoc: unknown, note?: ActivityNote) => {
    isRemoteUpdateRef.current = false;
    hasLocalChangesRef.current = true;
    if (note) {
      pendingActivityRef.current = note;
    }
  }, []);

  // Central Editor Engine backed by immutable Document Engine + History Engine
  const studio = useFormStudio(initialForm, {
    readOnly: isReadOnly,
    onLocalMutation: handleLocalMutation,
  });

  const { document: doc, legacyForm } = studio;

  // Shared active drag state so sidebar & canvas can validate drop targets synchronously
  const [activeDrag, setActiveDrag] = useState<StudioDragPayload | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmation | null>(null);

  // Mobile-first slide-up drawer state
  const [mobileSheet, setMobileSheet] = useState<'none' | 'components' | 'pages' | 'inspector'>('none');
  const [isCoAuthorOpen, setIsCoAuthorOpen] = useState(false);

  // Real-time Co-Authoring state
  const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
  const [comments, setComments] = useState<FormComment[]>([]);
  const [activity, setActivity] = useState<FormActivityItem[]>([]);
  const [remoteUpdateBanner, setRemoteUpdateBanner] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<
    'build' | 'theme' | 'logic' | 'settings' | 'share' | 'analytics'
  >(initialTab);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Confirmation-guarded delete handlers
  const handleRequestDeleteComponent = useCallback(
    (componentId: string) => {
      if (isReadOnly) return;
      const node = doc.components[componentId];
      if (!node) return;
      const childCount = node.children?.length || 0;
      if (childCount > 0) {
        setPendingConfirm({
          kind: 'delete_container',
          componentId,
          label: node.content.label || 'Layout Container',
          childCount,
        });
        return;
      }
      studio.removeComponent(componentId);
    },
    [isReadOnly, doc.components, studio]
  );

  const handleRequestDeletePage = useCallback(
    (pageId: string) => {
      if (isReadOnly || doc.pages.length <= 1) return;
      const page = doc.pages.find((p) => p.id === pageId);
      if (!page) return;
      const blockCount = getAllPageComponents(doc, pageId).length;
      if (blockCount > 0) {
        setPendingConfirm({
          kind: 'delete_page',
          pageId,
          pageTitle: page.title || `Page ${page.index}`,
          blockCount,
        });
        return;
      }
      studio.deletePage(pageId, { deleteComponents: true });
    },
    [isReadOnly, doc, studio]
  );

  const handleMoveOutOfContainer = useCallback(
    (componentId: string) => {
      if (isReadOnly) return;
      const node = doc.components[componentId];
      if (!node?.parentId) return;
      const parent = doc.components[node.parentId];
      if (!parent) return;

      const grandParentId = parent.parentId ?? null;
      if (grandParentId && doc.components[grandParentId]) {
        const siblings = doc.components[grandParentId].children || [];
        const pIdx = siblings.indexOf(parent.id);
        studio.moveComponent(componentId, {
          parentId: grandParentId,
          index: pIdx >= 0 ? pIdx + 1 : siblings.length,
        });
        return;
      }

      const page = doc.pages.find((p) => p.id === parent.pageId);
      const pIdx = page ? page.componentIds.indexOf(parent.id) : -1;
      studio.moveComponent(componentId, {
        pageId: parent.pageId,
        parentId: null,
        index: pIdx >= 0 ? pIdx + 1 : page?.componentIds.length ?? 0,
      });
    },
    [isReadOnly, doc.components, doc.pages, studio]
  );

  const handleDropPayloadOnPage = useCallback(
    (payload: StudioDragPayload, targetPageId: string) => {
      if (isReadOnly) return;
      if (payload.kind === 'new') {
        studio.addComponent(payload.componentType, targetPageId);
      } else {
        studio.moveComponentToPage(payload.componentId, targetPageId);
      }
      studio.selectPageById(targetPageId);
      setActiveDrag(null);
    },
    [isReadOnly, studio]
  );

  // Keyboard shortcuts: Undo, Redo, Duplicate, Delete, ArrowUp/ArrowDown selection, Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (pendingConfirm || isPreviewOpen || isAIOpen) return;

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Undo / Redo always work (unless typing inside an input/textarea)
      if (mod && key === 'z' && !isEditableElement(e.target)) {
        if (e.shiftKey) {
          studio.redo();
        } else {
          studio.undo();
        }
        e.preventDefault();
        return;
      }
      if (mod && key === 'y' && !isEditableElement(e.target)) {
        studio.redo();
        e.preventDefault();
        return;
      }

      // Skip canvas shortcuts while typing inside inputs
      if (isEditableElement(e.target)) return;
      if (activeTab !== 'build') return;

      if (key === 'escape') {
        studio.selectTarget({ kind: 'form' });
        return;
      }

      if (mod && key === 'd' && studio.selectedComponentId && !isReadOnly) {
        e.preventDefault();
        studio.duplicateComponent(studio.selectedComponentId);
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && studio.selectedComponentId && !isReadOnly) {
        e.preventDefault();
        handleRequestDeleteComponent(studio.selectedComponentId);
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const list = studio.viewAllPages
          ? studio.orderedComponents
          : getAllPageComponents(doc, studio.activePageId);
        if (list.length === 0) return;

        e.preventDefault();
        const currentIdx = studio.selectedComponentId
          ? list.findIndex((c) => c.id === studio.selectedComponentId)
          : -1;
        const nextIdx =
          e.key === 'ArrowDown'
            ? Math.min(list.length - 1, currentIdx + 1)
            : currentIdx <= 0
              ? 0
              : currentIdx - 1;
        const nextNode = list[nextIdx];
        if (nextNode) {
          studio.selectTarget({ kind: 'component', id: nextNode.id });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    pendingConfirm,
    isPreviewOpen,
    isAIOpen,
    activeTab,
    isReadOnly,
    doc,
    studio,
    handleRequestDeleteComponent,
  ]);

  // =========================================================================
  // Real-Time Co-Authoring Subscriptions (when editing a Team Form)
  // =========================================================================
  useEffect(() => {
    if (!isTeamForm || !teamId || !firebaseUser) return;

    const unsubForm = subscribeToTeamForm(teamId, initialForm.id, (remoteDoc) => {
      if (!remoteDoc) return;
      if (
        remoteDoc.lastEditedBy !== firebaseUser.uid &&
        remoteDoc.version > versionRef.current
      ) {
        isRemoteUpdateRef.current = true;
        versionRef.current = remoteDoc.version;
        studio.applyRemoteFormSnapshot(remoteDoc);
        setRemoteUpdateBanner(`Updated live by ${remoteDoc.lastEditedByName}`);
        setTimeout(() => setRemoteUpdateBanner(null), 2600);
      } else if (remoteDoc.version > versionRef.current) {
        versionRef.current = remoteDoc.version;
      }
    });

    const unsubPresence = subscribeToFormPresence(teamId, initialForm.id, setCollaborators);
    const unsubComments = subscribeToFormComments(teamId, initialForm.id, setComments);
    const unsubActivity = subscribeToFormActivity(teamId, initialForm.id, setActivity);

    return () => {
      unsubForm();
      unsubPresence();
      unsubComments();
      unsubActivity();
    };
  }, [isTeamForm, teamId, initialForm.id, firebaseUser, studio.applyRemoteFormSnapshot]);

  // Publish live presence immediately + heartbeat every 25s
  useEffect(() => {
    if (!isTeamForm || !teamId || !firebaseUser || !teamRole) return;

    const sendPresence = () => {
      publishFormPresence(
        teamId,
        initialForm.id,
        firebaseUser,
        teamRole,
        studio.selectedComponentId,
        activeTab
      ).catch(() => {});
    };

    sendPresence();
    const interval = setInterval(sendPresence, 25_000);
    return () => {
      clearInterval(interval);
    };
  }, [
    isTeamForm,
    teamId,
    initialForm.id,
    firebaseUser,
    teamRole,
    studio.selectedComponentId,
    activeTab,
  ]);

  // Clean up own presence document when leaving editor
  useEffect(() => {
    if (!isTeamForm || !teamId || !firebaseUser) return;
    const uid = firebaseUser.uid;
    return () => {
      clearFormPresence(teamId, initialForm.id, uid);
    };
  }, [isTeamForm, teamId, initialForm.id, firebaseUser]);

  // Auto-save form (LocalStorage for personal forms, Firestore for team forms)
  useEffect(() => {
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return;
    }
    if (isReadOnly) return;

    if (isTeamForm) {
      if (!hasLocalChangesRef.current || !teamId || !firebaseUser) return;
      setIsSaving(true);
      const timer = setTimeout(async () => {
        const nextVersion = versionRef.current + 1;
        versionRef.current = nextVersion;
        const note = pendingActivityRef.current;
        pendingActivityRef.current = null;
        hasLocalChangesRef.current = false;

        try {
          await updateTeamForm(teamId, legacyForm.id, firebaseUser, legacyForm, nextVersion);
          if (note) {
            await logFormActivity(teamId, legacyForm.id, firebaseUser, note.action, note.summary);
          }
        } finally {
          setIsSaving(false);
        }
      }, 450);

      return () => clearTimeout(timer);
    }

    // Personal Local Mode
    setIsSaving(true);
    const timer = setTimeout(() => {
      saveForm(legacyForm);
      setIsSaving(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [legacyForm, isTeamForm, teamId, firebaseUser, isReadOnly]);

  const handleTogglePublish = () => {
    const nextPublished = !doc.settings.isPublished;
    if (nextPublished && studio.logicValidation.errors.length > 0) {
      setPendingConfirm({
        kind: 'publish_logic_errors',
        errorCount: studio.logicValidation.errors.length,
        firstErrorMessage: studio.logicValidation.errors[0].message,
      });
      return;
    }
    studio.updateGlobalSettings(
      { isPublished: nextPublished },
      {
        action: nextPublished ? 'published' : 'unpublished',
        summary: nextPublished ? 'Published the form live' : 'Switched form to draft',
      }
    );
  };

  const handleExportSchema = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(doc, null, 2));
    const dlAnchor = window.document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `${doc.settings.slug || 'form'}-studio-document-v2.json`);
    dlAnchor.click();
  };

  const openCommentsCount = comments.filter((c) => !c.resolved).length;

  return (
    <div className="min-h-[100dvh] bg-[#F2F0EC] flex flex-col relative">
      {/* D. TOP TOOLBAR */}
      <EditorHeader
        form={legacyForm}
        onChangeTitle={studio.updateTitle}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenPreview={() => setIsPreviewOpen(true)}
        onOpenAIGenerator={() => setIsAIOpen(true)}
        onBackToDashboard={onBackToDashboard}
        onTogglePublish={handleTogglePublish}
        canUndo={studio.canUndo}
        canRedo={studio.canRedo}
        onUndo={studio.undo}
        onRedo={studio.redo}
        isSaving={isSaving}
        canvasViewport={studio.canvasViewport}
        onChangeViewport={studio.setCanvasViewport}
        isLivePreviewMode={studio.isLivePreviewMode}
        onToggleLivePreview={studio.toggleLivePreviewMode}
        activePageIndex={studio.activePageIndex}
        totalPages={studio.pages.length}
        onSelectPageByNumber={studio.selectPageByNumber}
        isTeamForm={isTeamForm}
        isReadOnly={isReadOnly}
        collaborators={collaborators}
        openCommentsCount={openCommentsCount}
        logicErrorCount={studio.logicValidation.errors.length}
        onOpenCoAuthor={() => setIsCoAuthorOpen(true)}
      />

      {/* Subtle Live Sync Toast when a teammate edits */}
      {remoteUpdateBanner && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-[#0B0D0F] text-[#F7F6F3] text-xs font-medium shadow-lg flex items-center gap-2 pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{remoteUpdateBanner}</span>
        </div>
      )}

      {/* Main Four-Zone Studio Body */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-x-hidden lg:overflow-hidden">
        {activeTab === 'build' && (
          <>
            {/* A. LEFT SIDEBAR — Components & Pages */}
            <FieldsSidebar
              document={doc}
              activePageId={studio.activePageId}
              activeComponentId={studio.selectedComponentId}
              viewAllPages={studio.viewAllPages}
              onToggleViewAllPages={studio.toggleViewAllPages}
              onSelectPage={(pageId) => studio.selectPageById(pageId, true)}
              onCreatePage={() => studio.createPage()}
              onDuplicatePage={(pageId) => studio.duplicatePage(pageId)}
              onRenamePage={(pageId, title) => studio.updatePage(pageId, { title })}
              onRequestDeletePage={handleRequestDeletePage}
              onReorderPage={studio.reorderPage}
              onSelectComponent={studio.selectComponent}
              onInsertComponent={(type) => studio.insertComponentFromLibrary(type)}
              onRequestDeleteComponent={handleRequestDeleteComponent}
              onMoveComponentByOffset={studio.moveComponentByOffset}
              onDropPayloadOnPage={handleDropPayloadOnPage}
              activeDrag={activeDrag}
              onDragStartPayload={setActiveDrag}
              onDragEndPayload={() => setActiveDrag(null)}
              layoutMode={doc.layoutMode}
              onChangeLayoutMode={studio.updateLayoutMode}
              isReadOnly={isReadOnly}
            />

            {/* B. CENTRE CANVAS — Visual Form Editing Area */}
            <EditorCanvas
              document={doc}
              activePageId={studio.activePageId}
              viewAllPages={studio.viewAllPages}
              canvasViewport={studio.canvasViewport}
              isLivePreviewMode={studio.isLivePreviewMode}
              onExitLivePreview={() => studio.setIsLivePreviewMode(false)}
              selection={studio.selection}
              onSelectTarget={studio.selectTarget}
              onSelectPageById={studio.selectPageById}
              onCreatePage={() => studio.createPage()}
              onToggleViewAllPages={studio.toggleViewAllPages}
              onUpdateTitle={studio.updateTitle}
              onUpdateDescription={studio.updateDescription}
              onUpdateComponent={studio.updateComponent}
              onRequestDeleteComponent={handleRequestDeleteComponent}
              onDuplicateComponent={studio.duplicateComponent}
              onMoveComponent={studio.moveComponent}
              onMoveComponentByOffset={studio.moveComponentByOffset}
              onMoveOutOfContainer={handleMoveOutOfContainer}
              onAddComponent={studio.addComponent}
              canNestComponent={studio.canNestComponent}
              activeDrag={activeDrag}
              onDragStartPayload={setActiveDrag}
              onDragEndPayload={() => setActiveDrag(null)}
              onDropPayloadOnPage={handleDropPayloadOnPage}
              onChangeLayoutMode={studio.updateLayoutMode}
              onOpenMobileAddDrawer={() => setMobileSheet('components')}
              onOpenMobileInspector={(id) => {
                studio.selectComponent(id);
                setMobileSheet('inspector');
              }}
              onUpdateWelcome={studio.updateWelcomeScreen}
              onUpdateThankYou={studio.updateThankYouScreen}
              collaborators={collaborators}
              currentUserId={firebaseUser?.uid}
              comments={comments}
              onOpenCoAuthor={(fieldId) => {
                if (fieldId) studio.selectComponent(fieldId);
                setIsCoAuthorOpen(true);
              }}
              isReadOnly={isReadOnly}
            />

            {/* C. RIGHT INSPECTOR — Contextual Properties Panel */}
            <FieldInspector
              document={doc}
              selection={studio.selection}
              selectedComponent={studio.selectedComponent}
              selectedPage={studio.selectedPage}
              pages={studio.pages}
              onSelectTarget={studio.selectTarget}
              onUpdateComponent={studio.updateComponent}
              onRequestDeleteComponent={handleRequestDeleteComponent}
              onDuplicateComponent={studio.duplicateComponent}
              onMoveToPage={(id, targetPageId) => studio.moveComponentToPage(id, targetPageId)}
              onMoveOutOfContainer={handleMoveOutOfContainer}
              onUpdatePage={studio.updatePage}
              onDuplicatePage={(pageId) => studio.duplicatePage(pageId)}
              onRequestDeletePage={handleRequestDeletePage}
              onUpdateTitle={studio.updateTitle}
              onUpdateDescription={studio.updateDescription}
              onUpdateLayoutMode={studio.updateLayoutMode}
              onUpdateGlobalSettings={studio.updateGlobalSettings}
              onUpdateDesign={studio.updateDesign}
              onUpdateWelcomeScreen={studio.updateWelcomeScreen}
              onUpdateThankYouScreen={studio.updateThankYouScreen}
              canvasViewport={studio.canvasViewport}
              onResetComponentAppearance={studio.resetComponentAppearance}
              isReadOnly={isReadOnly}
            />

            {/* Mobile-First Floating Thumb Dock (< lg screens only) */}
            <div className="lg:hidden fixed bottom-3 inset-x-3 z-30 pointer-events-none">
              <div className="max-w-md mx-auto pointer-events-auto p-1.5 rounded-full bg-[#0B0D0F]/95 backdrop-blur-xl ring-1 ring-white/15 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.6)] grid grid-cols-5 gap-1">
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => setMobileSheet('components')}
                  className="min-h-[46px] rounded-full bg-[#0F766E] text-white disabled:opacity-40 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold active:scale-[0.97] transition-transform"
                >
                  <Plus size={16} weight="bold" />
                  <span>Add</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileSheet('pages')}
                  className="min-h-[46px] rounded-full text-[#E6E8EB] hover:bg-white/10 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium active:scale-[0.97] transition-colors"
                >
                  <Files size={16} weight="regular" />
                  <span>Pages</span>
                </button>
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => setMobileSheet('inspector')}
                  className="min-h-[46px] rounded-full text-[#E6E8EB] hover:bg-white/10 disabled:opacity-40 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium active:scale-[0.97] transition-colors"
                >
                  <SlidersHorizontal size={16} weight="regular" />
                  <span>Inspect</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCoAuthorOpen(true)}
                  className="min-h-[46px] rounded-full text-[#E6E8EB] hover:bg-white/10 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium active:scale-[0.97] transition-colors relative"
                >
                  <UsersThree size={16} weight="regular" className="text-emerald-400" />
                  <span>Team</span>
                  {openCommentsCount > 0 && (
                    <span className="absolute top-1.5 right-2.5 w-2 h-2 rounded-full bg-emerald-400" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(true)}
                  className="min-h-[46px] rounded-full text-[#E6E8EB] hover:bg-white/10 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium active:scale-[0.97] transition-colors"
                >
                  <Eye size={16} weight="regular" />
                  <span>Preview</span>
                </button>
              </div>
            </div>

            {/* Mobile Slide-Up Drawers */}
            {mobileSheet !== 'none' && (
              <div
                className="lg:hidden fixed inset-0 z-50 bg-[#0B0D0F]/60 backdrop-blur-sm flex items-end"
                onClick={() => setMobileSheet('none')}
              >
                <div className="w-full" onClick={(e) => e.stopPropagation()}>
                  {(mobileSheet === 'components' || mobileSheet === 'pages') && (
                    <FieldsSidebar
                      key={mobileSheet}
                      document={doc}
                      activePageId={studio.activePageId}
                      activeComponentId={studio.selectedComponentId}
                      viewAllPages={studio.viewAllPages}
                      onToggleViewAllPages={studio.toggleViewAllPages}
                      onSelectPage={(pageId) => studio.selectPageById(pageId, true)}
                      onCreatePage={() => studio.createPage()}
                      onDuplicatePage={(pageId) => studio.duplicatePage(pageId)}
                      onRenamePage={(pageId, title) => studio.updatePage(pageId, { title })}
                      onRequestDeletePage={handleRequestDeletePage}
                      onReorderPage={studio.reorderPage}
                      onSelectComponent={studio.selectComponent}
                      onInsertComponent={(type) => studio.insertComponentFromLibrary(type)}
                      onRequestDeleteComponent={handleRequestDeleteComponent}
                      onMoveComponentByOffset={studio.moveComponentByOffset}
                      onDropPayloadOnPage={handleDropPayloadOnPage}
                      activeDrag={activeDrag}
                      onDragStartPayload={setActiveDrag}
                      onDragEndPayload={() => setActiveDrag(null)}
                      layoutMode={doc.layoutMode}
                      onChangeLayoutMode={studio.updateLayoutMode}
                      initialTab={mobileSheet}
                      isMobileDrawer={true}
                      onCloseMobile={() => setMobileSheet('none')}
                      isReadOnly={isReadOnly}
                    />
                  )}
                  {mobileSheet === 'inspector' && (
                    <FieldInspector
                      document={doc}
                      selection={studio.selection}
                      selectedComponent={studio.selectedComponent}
                      selectedPage={studio.selectedPage}
                      pages={studio.pages}
                      onSelectTarget={studio.selectTarget}
                      onUpdateComponent={studio.updateComponent}
                      onRequestDeleteComponent={handleRequestDeleteComponent}
                      onDuplicateComponent={studio.duplicateComponent}
                      onMoveToPage={(id, targetPageId) =>
                        studio.moveComponentToPage(id, targetPageId)
                      }
                      onMoveOutOfContainer={handleMoveOutOfContainer}
                      onUpdatePage={studio.updatePage}
                      onDuplicatePage={(pageId) => studio.duplicatePage(pageId)}
                      onRequestDeletePage={handleRequestDeletePage}
                      onUpdateTitle={studio.updateTitle}
                      onUpdateDescription={studio.updateDescription}
                      onUpdateLayoutMode={studio.updateLayoutMode}
                      onUpdateGlobalSettings={studio.updateGlobalSettings}
                      onUpdateDesign={studio.updateDesign}
                      onUpdateWelcomeScreen={studio.updateWelcomeScreen}
                      onUpdateThankYouScreen={studio.updateThankYouScreen}
                      canvasViewport={studio.canvasViewport}
                      onResetComponentAppearance={studio.resetComponentAppearance}
                      isMobileDrawer={true}
                      onCloseMobile={() => setMobileSheet('none')}
                      isReadOnly={isReadOnly}
                    />
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'theme' && (
          <ThemeStudio
            document={doc}
            onUpdateDesign={(patch) => {
              studio.updateDesign(patch, {
                action: 'theme_updated',
                summary: 'Updated form design & theme',
              });
            }}
            onResetDesign={studio.resetDesignToDefault}
            isReadOnly={isReadOnly}
          />
        )}

        {activeTab === 'logic' && (
          <VisualLogicBuilder
            document={doc}
            onUpdateRules={studio.updateLogicRules}
            onUpdateVariables={studio.updateVariables}
            onRenameVariable={studio.renameVariable}
            isReadOnly={isReadOnly}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            form={legacyForm}
            onUpdateSettings={(newSettings: FormSettings) => {
              studio.updateGlobalSettings(newSettings, {
                action: 'settings_updated',
                summary: 'Updated form settings',
              });
            }}
            onExportSchema={handleExportSchema}
          />
        )}

        {activeTab === 'share' && (
          <ShareTab
            form={legacyForm}
            onOpenPublicView={() => onOpenPublicView(doc.settings.slug)}
          />
        )}

        {activeTab === 'analytics' && <AnalyticsTab form={legacyForm} onRefreshData={() => {}} />}
      </div>

      {/* In-App Confirmation Modal for Deleting Non-Empty Pages/Containers & Pre-Publish Logic Checks */}
      <ConfirmDialog
        isOpen={Boolean(pendingConfirm)}
        title={
          pendingConfirm?.kind === 'delete_page'
            ? `Delete "${pendingConfirm.pageTitle}"?`
            : pendingConfirm?.kind === 'delete_container'
              ? `Delete "${pendingConfirm.label}"?`
              : pendingConfirm?.kind === 'publish_logic_errors'
                ? `Fix ${pendingConfirm.errorCount} logic ${
                    pendingConfirm.errorCount === 1 ? 'issue' : 'issues'
                  } before publishing?`
                : ''
        }
        description={
          pendingConfirm?.kind === 'delete_page'
            ? `This page contains ${pendingConfirm.blockCount} ${
                pendingConfirm.blockCount === 1 ? 'block' : 'blocks'
              }. You can delete the page and its blocks, or move its blocks onto the previous page. You can always press Undo to revert.`
            : pendingConfirm?.kind === 'delete_container'
              ? `This layout container holds ${pendingConfirm.childCount} nested ${
                  pendingConfirm.childCount === 1 ? 'block' : 'blocks'
                }. Deleting it will also remove all nested blocks inside. You can press Undo to revert.`
              : pendingConfirm?.kind === 'publish_logic_errors'
                ? `${pendingConfirm.firstErrorMessage} Open the Logic Builder to fix broken references or navigation loops before going live.`
                : ''
        }
        confirmLabel={
          pendingConfirm?.kind === 'delete_page'
            ? 'Delete Page & Blocks'
            : pendingConfirm?.kind === 'delete_container'
              ? 'Delete Container'
              : 'Review Logic Rules'
        }
        secondaryActionLabel={
          pendingConfirm?.kind === 'delete_page'
            ? 'Keep Blocks on Previous Page'
            : pendingConfirm?.kind === 'publish_logic_errors'
              ? 'Publish Anyway'
              : undefined
        }
        onSecondaryAction={
          pendingConfirm?.kind === 'delete_page'
            ? () => {
                studio.deletePage(pendingConfirm.pageId, { deleteComponents: false });
                setPendingConfirm(null);
              }
            : pendingConfirm?.kind === 'publish_logic_errors'
              ? () => {
                  studio.updateGlobalSettings(
                    { isPublished: true },
                    {
                      action: 'published',
                      summary: 'Published the form live',
                    }
                  );
                  setPendingConfirm(null);
                }
              : undefined
        }
        onConfirm={() => {
          if (!pendingConfirm) return;
          if (pendingConfirm.kind === 'delete_page') {
            studio.deletePage(pendingConfirm.pageId, { deleteComponents: true });
          } else if (pendingConfirm.kind === 'delete_container') {
            studio.removeComponent(pendingConfirm.componentId);
          } else if (pendingConfirm.kind === 'publish_logic_errors') {
            setActiveTab('logic');
          }
          setPendingConfirm(null);
        }}
        onCancel={() => setPendingConfirm(null)}
      />

      {/* Co-Authoring Panel (Live Collaborators, Comments, Activity, Share-to-Team) */}
      <CoAuthorPanel
        isOpen={isCoAuthorOpen}
        onClose={() => setIsCoAuthorOpen(false)}
        isTeamForm={isTeamForm}
        team={team}
        role={teamRole}
        teamMembers={teamMembers}
        collaborators={collaborators}
        comments={comments}
        activity={activity}
        fields={legacyForm.fields}
        activeFieldId={studio.selectedComponentId}
        onSelectField={(fieldId) => {
          studio.selectComponent(fieldId);
          setActiveTab('build');
        }}
        onAddComment={async (text, fieldId) => {
          if (!teamId || !firebaseUser) return;
          await addFormComment(teamId, doc.id, firebaseUser, text, fieldId);
        }}
        onToggleResolveComment={async (commentId, resolved) => {
          if (!teamId) return;
          await toggleResolveComment(teamId, doc.id, commentId, resolved);
        }}
        onDeleteComment={async (commentId) => {
          if (!teamId) return;
          await deleteFormComment(teamId, doc.id, commentId);
        }}
        onMoveToTeam={
          onShareLocalFormToTeam
            ? async (targetTeamId) => {
                await onShareLocalFormToTeam(legacyForm, targetTeamId);
                setIsCoAuthorOpen(false);
              }
            : undefined
        }
        onOpenTeamModal={() => {
          setIsCoAuthorOpen(false);
          if (onOpenTeamModal) onOpenTeamModal();
        }}
      />

      {/* Preview Modal */}
      <PreviewModal
        form={legacyForm}
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
      />

      {/* AI Generator Modal */}
      <AIGeneratorModal
        isOpen={isAIOpen}
        onClose={() => setIsAIOpen(false)}
        onFormGenerated={(generated: FormSchema) => {
          studio.replaceDocument(
            { ...generated, id: doc.id },
            { action: 'ai_updated', summary: 'Updated form questions with AI Helper' }
          );
        }}
      />
    </div>
  );
};
