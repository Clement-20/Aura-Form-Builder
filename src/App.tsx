/**
 * AuraForm SaaS Form Builder - Main Application Controller
 */

import React, { useState, useEffect } from 'react';
import { Trash, X } from '@phosphor-icons/react';
import { FormSchema, UserAccount } from './types/form';
import {
  getStoredForms,
  saveForm,
  deleteForm as removeStoredForm,
  duplicateForm as cloneStoredForm,
  getCurrentUser,
  getFormBySlug,
} from './lib/storage';
import { SAMPLE_FORMS } from './lib/sample-data';
import { useFirebase } from './contexts/FirebaseContext';
import { Navbar } from './components/common/Navbar';
import { Footer } from './components/common/Footer';
import { LandingPage } from './components/marketing/LandingPage';
import { DashboardView } from './components/dashboard/DashboardView';
import { FormEditor } from './components/editor/FormEditor';
import { CreateFormModal } from './components/dashboard/CreateFormModal';
import { AIGeneratorModal } from './components/editor/AIGeneratorModal';
import { TemplatePickerModal } from './components/marketing/TemplatePickerModal';
import { AccountModal } from './components/dashboard/AccountModal';
import { PreviewModal } from './components/runner/PreviewModal';
import { PublicFormView } from './components/runner/PublicFormView';
import { TeamModal } from './components/team/TeamModal';

export default function App() {
  const {
    firebaseUser,
    activeWorkspaceId,
    setActiveWorkspaceId,
    activeTeam,
    activeTeamRole,
    teamForms,
    createSharedForm,
    deleteSharedForm,
  } = useFirebase();

  const [currentView, setCurrentView] = useState<string>('landing');
  const [localForms, setLocalForms] = useState<FormSchema[]>([]);
  const [activeFormId, setActiveFormId] = useState<string | null>(null);
  const [activeFormTeamId, setActiveFormTeamId] = useState<string | null>(null);
  const [activeEditorTab, setActiveEditorTab] = useState<
    'build' | 'theme' | 'logic' | 'settings' | 'share' | 'analytics'
  >('build');
  const [user, setUser] = useState<UserAccount>(getCurrentUser());

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [teamModalMode, setTeamModalMode] = useState<'manage' | 'create' | 'join'>('manage');
  const [pendingInviteCode, setPendingInviteCode] = useState('');
  const [previewForm, setPreviewForm] = useState<FormSchema | null>(null);
  const [publicFormSlug, setPublicFormSlug] = useState<string | null>(null);
  const [formIdToDelete, setFormIdToDelete] = useState<string | null>(null);

  const isTeamWorkspace = activeWorkspaceId !== 'personal' && Boolean(firebaseUser);
  const displayedForms: FormSchema[] = isTeamWorkspace ? teamForms : localForms;

  // Initialize forms and check URL hash for public form link (#p=slug) or team invite (#join=CODE)
  useEffect(() => {
    setLocalForms(getStoredForms());

    const checkHashRoute = () => {
      const hash = window.location.hash;
      if (hash && hash.startsWith('#p=')) {
        const slug = hash.replace('#p=', '');
        setPublicFormSlug(slug);
        setCurrentView('public_runner');
      } else if (hash && hash.startsWith('#join=')) {
        const code = hash.replace('#join=', '').trim();
        if (code) {
          setPendingInviteCode(code);
          setTeamModalMode('join');
          setIsTeamModalOpen(true);
          setCurrentView('dashboard');
          window.location.hash = '';
        }
      }
    };

    checkHashRoute();
    window.addEventListener('hashchange', checkHashRoute);
    return () => window.removeEventListener('hashchange', checkHashRoute);
  }, []);

  const refreshLocalForms = () => {
    setLocalForms(getStoredForms());
  };

  const openTeamModal = (mode: 'manage' | 'create' | 'join' = 'manage') => {
    setPendingInviteCode('');
    setTeamModalMode(mode);
    setIsTeamModalOpen(true);
  };

  const buildBlankSchema = (): FormSchema => {
    const newId = 'form_' + Math.random().toString(36).substring(2, 9);
    return {
      id: newId,
      title: 'Untitled Form',
      description: 'Describe the purpose of this form...',
      category: 'survey',
      layoutMode: 'conversational',
      theme: {
        primaryColor: '#0B0D0F',
        backgroundColor: '#F7F6F3',
        surfaceColor: '#FFFFFF',
        textColor: '#0B0D0F',
        borderRadius: 'lg',
        fontFamily: 'Plus Jakarta Sans',
        backgroundStyle: 'solid',
        inputStyle: 'bordered',
      },
      welcomeScreen: {
        enabled: true,
        title: 'Welcome',
        subtitle: 'Please take a moment to answer these questions.',
        buttonText: 'Begin',
      },
      thankYouScreen: {
        title: 'Response Recorded',
        message: 'Thank you for your valuable response.',
        showRestartButton: true,
      },
      fields: [
        {
          id: 'f_init_1',
          type: 'text',
          label: 'What is your full name?',
          placeholder: 'e.g. Alex Morgan',
          required: true,
          step: 1,
        },
        {
          id: 'f_init_2',
          type: 'email',
          label: 'What is your email address?',
          placeholder: 'alex@company.example',
          required: true,
          step: 1,
        },
      ],
      logicRules: [],
      settings: {
        isPublished: true,
        slug: 'form-' + Math.floor(Math.random() * 9000 + 1000),
        submitButtonText: 'Submit Answers',
        allowMultipleSubmissions: true,
        isQuizMode: false,
        notifyOnSubmission: false,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      responsesCount: 0,
    };
  };

  // Create Blank Form Action (saves to active Team or Personal local workspace)
  const handleCreateBlank = async () => {
    const base = buildBlankSchema();
    if (isTeamWorkspace && activeTeamRole !== 'viewer') {
      const created = await createSharedForm(base);
      if (created) {
        setActiveFormId(created.id);
        setActiveFormTeamId(created.teamId);
        setActiveEditorTab('build');
        setCurrentView('editor');
      }
      return;
    }

    saveForm(base);
    refreshLocalForms();
    setActiveFormId(base.id);
    setActiveFormTeamId(null);
    setActiveEditorTab('build');
    setCurrentView('editor');
  };

  // Handle AI Form Generated
  const handleAIGenerated = async (newForm: FormSchema) => {
    if (isTeamWorkspace && activeTeamRole !== 'viewer') {
      const created = await createSharedForm(newForm);
      if (created) {
        setActiveFormId(created.id);
        setActiveFormTeamId(created.teamId);
        setActiveEditorTab('build');
        setCurrentView('editor');
      }
      return;
    }

    saveForm(newForm);
    refreshLocalForms();
    setActiveFormId(newForm.id);
    setActiveFormTeamId(null);
    setActiveEditorTab('build');
    setCurrentView('editor');
  };

  // Handle Template Clone
  const handleCloneTemplate = async (template: FormSchema) => {
    const newId = 'form_' + Math.random().toString(36).substring(2, 9);
    const cloned: FormSchema = {
      ...JSON.parse(JSON.stringify(template)),
      id: newId,
      title: `${template.title}`,
      settings: {
        ...template.settings,
        slug: `${template.settings.slug}-${Math.floor(Math.random() * 900 + 100)}`,
        isPublished: true,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      responsesCount: 0,
    };

    if (isTeamWorkspace && activeTeamRole !== 'viewer') {
      const created = await createSharedForm(cloned);
      if (created) {
        setActiveFormId(created.id);
        setActiveFormTeamId(created.teamId);
        setActiveEditorTab('build');
        setCurrentView('editor');
      }
      return;
    }

    saveForm(cloned);
    refreshLocalForms();
    setActiveFormId(newId);
    setActiveFormTeamId(null);
    setActiveEditorTab('build');
    setCurrentView('editor');
  };

  // 1-Tap Share Personal Local Form to a Team Workspace for Live Co-Authoring
  const handleShareLocalFormToTeam = async (formToShare: FormSchema, targetTeamId: string) => {
    const created = await createSharedForm(formToShare, targetTeamId);
    if (created) {
      setActiveWorkspaceId(targetTeamId);
      setActiveFormId(created.id);
      setActiveFormTeamId(targetTeamId);
      setCurrentView('editor');
    }
  };

  // Duplicate Form
  const handleDuplicateForm = async (id: string) => {
    if (isTeamWorkspace && activeTeamRole !== 'viewer') {
      const target = teamForms.find((f) => f.id === id);
      if (!target) return;
      const cloned: FormSchema = {
        ...JSON.parse(JSON.stringify(target)),
        title: `${target.title} (Copy)`,
        settings: {
          ...target.settings,
          slug: `${target.settings.slug}-copy-${Math.floor(Math.random() * 900 + 100)}`,
        },
        responsesCount: 0,
      };
      await createSharedForm(cloned);
      return;
    }

    const dup = cloneStoredForm(id);
    if (dup) {
      refreshLocalForms();
    }
  };

  // Request Delete Form Confirmation
  const handleDeleteForm = (id: string) => {
    setFormIdToDelete(id);
  };

  const handleConfirmDelete = async () => {
    if (!formIdToDelete) return;
    if (isTeamWorkspace) {
      await deleteSharedForm(formIdToDelete);
    } else {
      removeStoredForm(formIdToDelete);
      refreshLocalForms();
    }
    if (activeFormId === formIdToDelete) {
      setActiveFormId(null);
      setActiveFormTeamId(null);
      setCurrentView('dashboard');
    }
    setFormIdToDelete(null);
  };

  // Select Form for editing
  const handleSelectForm = (
    id: string,
    initialTab: 'build' | 'theme' | 'logic' | 'settings' | 'share' | 'analytics' = 'build'
  ) => {
    setActiveFormId(id);
    setActiveFormTeamId(isTeamWorkspace ? activeWorkspaceId : null);
    setActiveEditorTab(initialTab);
    setCurrentView('editor');
  };

  // Preview Form Trigger
  const handleOpenPreview = (formToPreview: FormSchema) => {
    setPreviewForm(formToPreview);
    setIsPreviewModalOpen(true);
  };

  // Open Public Form Runner
  const handleOpenPublicView = (slug: string) => {
    window.location.hash = `#p=${slug}`;
    setPublicFormSlug(slug);
    setCurrentView('public_runner');
  };

  // Navigation controller
  const handleNavigate = (view: string) => {
    if (view === 'templates') {
      setIsTemplatePickerOpen(true);
      return;
    }
    if (view === 'pricing') {
      setCurrentView('landing');
      setTimeout(() => {
        document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      return;
    }
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Standalone Public View
  if (currentView === 'public_runner' && publicFormSlug) {
    const targetForm =
      teamForms.find((f) => f.settings.slug === publicFormSlug) ||
      getFormBySlug(publicFormSlug) ||
      displayedForms[0] ||
      SAMPLE_FORMS[0];
    return (
      <PublicFormView
        form={targetForm}
        onBackToApp={() => {
          window.location.hash = '';
          setCurrentView('dashboard');
        }}
      />
    );
  }

  // Active form for editor
  const activeForm =
    (activeFormTeamId
      ? teamForms.find((f) => f.id === activeFormId)
      : localForms.find((f) => f.id === activeFormId)) || null;
  const formPendingDelete = displayedForms.find((f) => f.id === formIdToDelete) || null;

  return (
    <div className="min-h-[100dvh] bg-[#F7F6F3] flex flex-col font-sans text-[#0B0D0F] relative">
      {/* Subtle Fixed Architectural Grain Overlay (GPU-safe, pointer-events-none) */}
      <div aria-hidden="true" className="vanguard-grain" />

      {/* Top Fluid Island Navigation Bar */}
      {currentView !== 'editor' && (
        <Navbar
          currentView={currentView}
          onNavigate={handleNavigate}
          user={user}
          onOpenAccount={() => setIsAccountModalOpen(true)}
          onOpenCreate={() => setIsCreateModalOpen(true)}
          onOpenTeams={() => openTeamModal('manage')}
        />
      )}

      {/* Main Routed View */}
      <main id="main-content" className="flex-1">
        {currentView === 'landing' && (
          <LandingPage
            onOpenCreate={() => setIsCreateModalOpen(true)}
            onCreateBlank={handleCreateBlank}
            onOpenAI={() => setIsAIOpen(true)}
            onBrowseTemplates={() => setIsTemplatePickerOpen(true)}
            onCloneTemplate={handleCloneTemplate}
            onPreviewForm={handleOpenPreview}
            onNavigate={handleNavigate}
          />
        )}

        {currentView === 'dashboard' && (
          <DashboardView
            forms={displayedForms}
            onSelectForm={handleSelectForm}
            onPreviewForm={handleOpenPreview}
            onOpenCreateModal={() => setIsCreateModalOpen(true)}
            onCreateBlank={handleCreateBlank}
            onOpenAI={() => setIsAIOpen(true)}
            onBrowseTemplates={() => setIsTemplatePickerOpen(true)}
            onDuplicateForm={handleDuplicateForm}
            onDeleteForm={handleDeleteForm}
            onOpenTeamModal={openTeamModal}
          />
        )}

        {currentView === 'editor' && activeForm && (
          <FormEditor
            key={`${activeFormTeamId || 'local'}_${activeForm.id}`}
            initialForm={activeForm}
            initialTab={activeEditorTab}
            teamId={activeFormTeamId}
            team={activeFormTeamId ? activeTeam : null}
            teamRole={activeFormTeamId ? activeTeamRole : null}
            onShareLocalFormToTeam={handleShareLocalFormToTeam}
            onOpenTeamModal={() => openTeamModal('manage')}
            onBackToDashboard={() => {
              refreshLocalForms();
              setCurrentView('dashboard');
            }}
            onOpenPublicView={handleOpenPublicView}
          />
        )}
      </main>

      {/* Footer (only on landing and dashboard) */}
      {currentView !== 'editor' && <Footer onNavigate={handleNavigate} />}

      {/* MODALS */}
      <CreateFormModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateBlank={handleCreateBlank}
        onOpenAI={() => setIsAIOpen(true)}
        onBrowseTemplates={() => setIsTemplatePickerOpen(true)}
      />

      <AIGeneratorModal
        isOpen={isAIOpen}
        onClose={() => setIsAIOpen(false)}
        onFormGenerated={handleAIGenerated}
      />

      <TemplatePickerModal
        isOpen={isTemplatePickerOpen}
        onClose={() => setIsTemplatePickerOpen(false)}
        onSelectTemplate={handleCloneTemplate}
        onPreviewTemplate={handleOpenPreview}
      />

      <AccountModal
        user={user}
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        onUserUpdated={setUser}
      />

      <TeamModal
        isOpen={isTeamModalOpen}
        initialMode={teamModalMode}
        initialInviteCode={pendingInviteCode}
        onClose={() => setIsTeamModalOpen(false)}
      />

      {previewForm && (
        <PreviewModal
          form={previewForm}
          isOpen={isPreviewModalOpen}
          onClose={() => setIsPreviewModalOpen(false)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {formPendingDelete && (
        <div
          className="fixed inset-0 z-50 bg-[#0B0D0F]/60 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setFormIdToDelete(null)}
        >
          <div
            className="w-full max-w-md p-1.5 rounded-[2rem] bg-white/25 ring-1 ring-white/30 shadow-[0_32px_80px_-20px_rgba(11,13,15,0.45)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-[calc(2rem-6px)] bg-white p-7 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash size={20} weight="light" />
                </div>
                <button
                  onClick={() => setFormIdToDelete(null)}
                  aria-label="Cancel deletion"
                  className="w-8 h-8 rounded-full bg-black/[0.04] hover:bg-black/[0.08] text-[#5C6066] flex items-center justify-center"
                >
                  <X size={15} weight="light" />
                </button>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-lg font-display font-semibold text-[#0B0D0F]">
                  Delete &quot;{formPendingDelete.title}&quot;?
                </h3>
                <p className="text-xs text-[#5C6066] leading-relaxed">
                  {isTeamWorkspace
                    ? 'This removes the shared form for everyone on your team permanently. This action cannot be undone.'
                    : 'This removes the form schema from your workspace permanently. This action cannot be undone.'}
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  onClick={() => setFormIdToDelete(null)}
                  className="px-4 py-2.5 rounded-full text-xs font-semibold text-[#5C6066] hover:text-[#0B0D0F] bg-[#F7F6F3] hover:bg-[#EFECE6] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="px-5 py-2.5 rounded-full text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors active:scale-[0.98]"
                >
                  Delete Form
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
