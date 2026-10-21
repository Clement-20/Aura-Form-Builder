/**
 * AuraForm SaaS Form Builder - Main Application Controller
 */

import React, { useState, useEffect } from 'react';
import { FormSchema, UserAccount, FormField } from './types/form';
import {
  getStoredForms,
  saveForm,
  deleteForm as removeStoredForm,
  duplicateForm as cloneStoredForm,
  getCurrentUser,
  saveCurrentUser,
  getFormBySlug,
} from './lib/storage';
import { SAMPLE_FORMS } from './lib/sample-data';
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

export default function App() {
  const [currentView, setCurrentView] = useState<string>('landing');
  const [forms, setForms] = useState<FormSchema[]>([]);
  const [activeFormId, setActiveFormId] = useState<string | null>(null);
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
  const [previewForm, setPreviewForm] = useState<FormSchema | null>(null);
  const [publicFormSlug, setPublicFormSlug] = useState<string | null>(null);
  const [formIdToDelete, setFormIdToDelete] = useState<string | null>(null);

  // Initialize forms and check URL hash for public form link (#p=slug)
  useEffect(() => {
    const loadedForms = getStoredForms();
    setForms(loadedForms);

    const checkHashRoute = () => {
      const hash = window.location.hash;
      if (hash && hash.startsWith('#p=')) {
        const slug = hash.replace('#p=', '');
        setPublicFormSlug(slug);
        setCurrentView('public_runner');
      }
    };

    checkHashRoute();
    window.addEventListener('hashchange', checkHashRoute);
    return () => window.removeEventListener('hashchange', checkHashRoute);
  }, []);

  const refreshForms = () => {
    setForms(getStoredForms());
  };

  // Create Blank Form Action
  const handleCreateBlank = () => {
    const newId = 'form_' + Math.random().toString(36).substring(2, 9);
    const newForm: FormSchema = {
      id: newId,
      title: 'Untitled Form Experience',
      description: 'Describe the purpose of this form...',
      category: 'survey',
      layoutMode: 'conversational',
      theme: {
        primaryColor: '#18181b',
        backgroundColor: '#fafafa',
        surfaceColor: '#ffffff',
        textColor: '#09090b',
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
          placeholder: 'alex@example.com',
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

    saveForm(newForm);
    refreshForms();
    setActiveFormId(newId);
    setActiveEditorTab('build');
    setCurrentView('editor');
  };

  // Handle AI Form Generated
  const handleAIGenerated = (newForm: FormSchema) => {
    saveForm(newForm);
    refreshForms();
    setActiveFormId(newForm.id);
    setActiveEditorTab('build');
    setCurrentView('editor');
  };

  // Handle Template Clone
  const handleCloneTemplate = (template: FormSchema) => {
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

    saveForm(cloned);
    refreshForms();
    setActiveFormId(newId);
    setActiveEditorTab('build');
    setCurrentView('editor');
  };

  // Duplicate Form
  const handleDuplicateForm = (id: string) => {
    const dup = cloneStoredForm(id);
    if (dup) {
      refreshForms();
    }
  };

  // Delete Form
  const handleDeleteForm = (id: string) => {
    setFormIdToDelete(id);
  };

  // Select Form for editing
  const handleSelectForm = (
    id: string,
    initialTab: 'build' | 'theme' | 'logic' | 'settings' | 'share' | 'analytics' = 'build'
  ) => {
    setActiveFormId(id);
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
  };

  // Standalone Public View
  if (currentView === 'public_runner' && publicFormSlug) {
    const targetForm = getFormBySlug(publicFormSlug) || forms[0] || SAMPLE_FORMS[0];
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
  const activeForm = forms.find((f) => f.id === activeFormId) || null;

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col font-sans text-neutral-900">
      {/* Top Navigation Bar (Contract strictly enforced) */}
      {currentView !== 'editor' && (
        <Navbar
          currentView={currentView}
          onNavigate={handleNavigate}
          user={user}
          onOpenAccount={() => setIsAccountModalOpen(true)}
          onOpenCreate={() => setIsCreateModalOpen(true)}
        />
      )}

      {/* Main Routed View */}
      <div className="flex-1">
        {currentView === 'landing' && (
          <LandingPage
            onOpenCreate={() => setIsCreateModalOpen(true)}
            onOpenAI={() => setIsAIOpen(true)}
            onBrowseTemplates={() => setIsTemplatePickerOpen(true)}
            onSelectForm={(id) => handleSelectForm(id)}
            onPreviewForm={handleOpenPreview}
            onNavigate={handleNavigate}
          />
        )}

        {currentView === 'dashboard' && (
          <DashboardView
            forms={forms}
            onSelectForm={handleSelectForm}
            onPreviewForm={handleOpenPreview}
            onOpenCreateModal={() => setIsCreateModalOpen(true)}
            onOpenAI={() => setIsAIOpen(true)}
            onDuplicateForm={handleDuplicateForm}
            onDeleteForm={handleDeleteForm}
          />
        )}

        {currentView === 'editor' && activeForm && (
          <FormEditor
            key={activeForm.id}
            initialForm={activeForm}
            onBackToDashboard={() => {
              refreshForms();
              setCurrentView('dashboard');
            }}
            onOpenPublicView={handleOpenPublicView}
          />
        )}
      </div>

      {/* Footer (only on landing and dashboard) */}
      {currentView !== 'editor' && <Footer onNavigate={handleNavigate} />}

      {/* MODALS */}
      {/* 1. Create Form Path Selector */}
      <CreateFormModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateBlank={handleCreateBlank}
        onOpenAI={() => setIsAIOpen(true)}
        onBrowseTemplates={() => setIsTemplatePickerOpen(true)}
      />

      {/* 2. AI Form Architect Prompt Modal */}
      <AIGeneratorModal
        isOpen={isAIOpen}
        onClose={() => setIsAIOpen(false)}
        onFormGenerated={handleAIGenerated}
      />

      {/* 3. Template Picker Modal */}
      <TemplatePickerModal
        isOpen={isTemplatePickerOpen}
        onClose={() => setIsTemplatePickerOpen(false)}
        onSelectTemplate={handleCloneTemplate}
        onPreviewTemplate={handleOpenPreview}
      />

      {/* 4. User Account & Tier Switcher Modal */}
      <AccountModal
        user={user}
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        onUserUpdated={setUser}
      />

      {/* 5. Live Test Preview Modal */}
      {previewForm && (
        <PreviewModal
          form={previewForm}
          isOpen={isPreviewModalOpen}
          onClose={() => setIsPreviewModalOpen(false)}
        />
      )}
    </div>
  );
}

