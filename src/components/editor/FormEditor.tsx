import React, { useState, useEffect } from 'react';
import {
  FormSchema,
  FormField,
  FieldType,
  FormTheme,
  LogicRule,
  FormSettings,
  FormLayoutMode,
  FormStep,
} from '../../types/form';
import { EditorHeader } from './EditorHeader';
import { FieldsSidebar } from './FieldsSidebar';
import { EditorCanvas } from './EditorCanvas';
import { FieldInspector } from './FieldInspector';
import { ThemeStudio } from './ThemeStudio';
import { VisualLogicBuilder } from './VisualLogicBuilder';
import { SettingsTab } from './SettingsTab';
import { ShareTab } from './ShareTab';
import { AnalyticsTab } from './AnalyticsTab';
import { PreviewModal } from '../runner/PreviewModal';
import { AIGeneratorModal } from './AIGeneratorModal';
import { saveForm, ensureFormSteps } from '../../lib/storage';

interface FormEditorProps {
  initialForm: FormSchema;
  onBackToDashboard: () => void;
  onOpenPublicView: (slug: string) => void;
}

export const FormEditor: React.FC<FormEditorProps> = ({
  initialForm,
  onBackToDashboard,
  onOpenPublicView,
}) => {
  const [form, setForm] = useState<FormSchema>(initialForm);
  const [steps, setSteps] = useState<FormStep[]>(() => ensureFormSteps(initialForm));
  const [activeStepNumber, setActiveStepNumber] = useState<number>(1);
  const [viewAllSteps, setViewAllSteps] = useState<boolean>(false);

  // Undo / Redo history stack
  const [history, setHistory] = useState<{ form: FormSchema; steps: FormStep[] }[]>([
    { form: initialForm, steps: ensureFormSteps(initialForm) }
  ]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  const commitChange = (newForm: FormSchema, newSteps: FormStep[]) => {
    const updatedForm = { ...newForm, steps: newSteps };
    setForm(updatedForm);
    setSteps(newSteps);

    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ form: updatedForm, steps: newSteps });
    if (newHistory.length > 35) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      setForm(prev.form);
      setSteps(prev.steps);
      setHistoryIndex(historyIndex - 1);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      setForm(next.form);
      setSteps(next.steps);
      setHistoryIndex(historyIndex + 1);
    }
  };

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        handleRedo();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history]);

  const [activeFieldId, setActiveFieldId] = useState<string | null>(
    initialForm.fields[0]?.id || null
  );
  const [activeTab, setActiveTab] = useState<
    'build' | 'theme' | 'logic' | 'settings' | 'share' | 'analytics'
  >('build');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Auto-save form whenever changes occur
  useEffect(() => {
    setIsSaving(true);
    const timer = setTimeout(() => {
      saveForm({
        ...form,
        steps,
      });
      setIsSaving(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [form, steps]);

  // Actions for steps
  const handleAddStep = () => {
    const nextNumber = steps.length + 1;
    const newStep: FormStep = {
      id: `step_${nextNumber}_${Math.random().toString(36).substring(2, 6)}`,
      stepNumber: nextNumber,
      title: `Page ${nextNumber}`,
      description: `Questions for step ${nextNumber}`,
    };
    const updatedSteps = [...steps, newStep];
    commitChange(form, updatedSteps);
    setActiveStepNumber(nextNumber);
    setViewAllSteps(false);
  };

  const handleUpdateStep = (stepNumber: number, title: string, description?: string) => {
    const updated = steps.map((s) =>
      s.stepNumber === stepNumber ? { ...s, title, description } : s
    );
    commitChange(form, updated);
  };

  const handleDeleteStep = (stepNumber: number) => {
    if (steps.length <= 1) return;
    const targetStep = Math.max(1, stepNumber - 1);
    const updatedFields = form.fields.map((f) => {
      const cur = f.step || 1;
      if (cur === stepNumber) {
        return { ...f, step: targetStep };
      } else if (cur > stepNumber) {
        return { ...f, step: cur - 1 };
      }
      return f;
    });

    const remainingSteps = steps
      .filter((s) => s.stepNumber !== stepNumber)
      .map((s, idx) => ({ ...s, stepNumber: idx + 1 }));

    const updatedForm = { ...form, fields: updatedFields };
    commitChange(updatedForm, remainingSteps);
    setActiveStepNumber(Math.min(targetStep, remainingSteps.length));
  };

  const handleReorderStep = (stepNumber: number, direction: 'left' | 'right') => {
    const targetNumber = direction === 'left' ? stepNumber - 1 : stepNumber + 1;
    if (targetNumber < 1 || targetNumber > steps.length) return;

    const newSteps = [...steps];
    const idxA = newSteps.findIndex((s) => s.stepNumber === stepNumber);
    const idxB = newSteps.findIndex((s) => s.stepNumber === targetNumber);
    if (idxA === -1 || idxB === -1) return;

    const temp = newSteps[idxA];
    newSteps[idxA] = newSteps[idxB];
    newSteps[idxB] = temp;

    const renumberedSteps = newSteps.map((s, idx) => ({ ...s, stepNumber: idx + 1 }));

    const updatedFields = form.fields.map((f) => {
      const cur = f.step || 1;
      if (cur === stepNumber) return { ...f, step: targetNumber };
      if (cur === targetNumber) return { ...f, step: stepNumber };
      return f;
    });

    const updatedForm = { ...form, fields: updatedFields };
    commitChange(updatedForm, renumberedSteps);
    setActiveStepNumber(targetNumber);
  };

  // Actions for fields
  const handleAddField = (type: FieldType, targetStep?: number) => {
    const newFieldId = 'f_' + Math.random().toString(36).substring(2, 8);
    const defaultLabels: Record<FieldType, string> = {
      text: 'What is your full name?',
      textarea: 'Tell us more in detail...',
      email: 'What is your email address?',
      phone: 'What is your primary phone number?',
      url: 'What is your portfolio or website URL?',
      radio: 'Select the option that best fits:',
      checkbox: 'Select all that apply:',
      select: 'Choose from the dropdown list:',
      rating: 'How satisfied are you with our service?',
      scale: 'On a scale of 0 to 10, how likely are you to recommend us?',
      number: 'Enter a numeric amount:',
      date: 'Select the target date:',
      statement: 'Important note for delegates:',
    };

    const assignedStep = targetStep || (!viewAllSteps ? activeStepNumber : 1);

    const newField: FormField = {
      id: newFieldId,
      type,
      label: defaultLabels[type] || 'Untitled Question',
      required: false,
      step: assignedStep,
      options:
        type === 'radio' || type === 'checkbox' || type === 'select'
          ? ['Option 1', 'Option 2', 'Option 3']
          : undefined,
    };

    const updatedForm = {
      ...form,
      fields: [...form.fields, newField],
    };
    commitChange(updatedForm, steps);
    setActiveFieldId(newFieldId);
  };

  const handleUpdateField = (updatedField: FormField) => {
    const updatedForm = {
      ...form,
      fields: form.fields.map((f) => (f.id === updatedField.id ? updatedField : f)),
    };
    commitChange(updatedForm, steps);
  };

  const handleDeleteField = (id: string) => {
    const updatedForm = {
      ...form,
      fields: form.fields.filter((f) => f.id !== id),
      logicRules: form.logicRules.filter(
        (r) => r.sourceFieldId !== id && r.targetFieldId !== id
      ),
    };
    commitChange(updatedForm, steps);
    if (activeFieldId === id) {
      setActiveFieldId(null);
    }
  };

  const handleDuplicateField = (id: string) => {
    const target = form.fields.find((f) => f.id === id);
    if (!target) return;

    const newId = 'f_' + Math.random().toString(36).substring(2, 8);
    const cloned: FormField = {
      ...JSON.parse(JSON.stringify(target)),
      id: newId,
      label: `${target.label} (Copy)`,
    };

    const targetIdx = form.fields.findIndex((f) => f.id === id);
    const newFields = [...form.fields];
    newFields.splice(targetIdx + 1, 0, cloned);

    const updatedForm = { ...form, fields: newFields };
    commitChange(updatedForm, steps);
    setActiveFieldId(newId);
  };

  const handleMoveField = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= form.fields.length) return;

    const newFields = [...form.fields];
    const [moved] = newFields.splice(index, 1);
    newFields.splice(targetIdx, 0, moved);

    const updatedForm = { ...form, fields: newFields };
    commitChange(updatedForm, steps);
  };

  const handleTogglePublish = () => {
    const updatedForm = {
      ...form,
      settings: {
        ...form.settings,
        isPublished: !form.settings.isPublished,
      },
    };
    commitChange(updatedForm, steps);
  };

  const handleUpdateTitle = (title: string) => {
    const updatedForm = { ...form, title };
    commitChange(updatedForm, steps);
  };

  const handleExportSchema = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify({ ...form, steps }, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `${form.settings.slug || 'form'}-schema.json`);
    dlAnchor.click();
  };

  const activeField = form.fields.find((f) => f.id === activeFieldId) || null;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top Header */}
      <EditorHeader
        form={form}
        onChangeTitle={handleUpdateTitle}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenPreview={() => setIsPreviewOpen(true)}
        onOpenAIGenerator={() => setIsAIOpen(true)}
        onBackToDashboard={onBackToDashboard}
        onTogglePublish={handleTogglePublish}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
        isSaving={isSaving}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'build' && (
          <>
            <FieldsSidebar
              fields={form.fields}
              activeFieldId={activeFieldId}
              onSelectField={setActiveFieldId}
              onAddField={handleAddField}
              onDeleteField={handleDeleteField}
              onMoveField={handleMoveField}
              layoutMode={form.layoutMode}
              onChangeLayoutMode={(mode) => {
                const updated = { ...form, layoutMode: mode };
                commitChange(updated, steps);
              }}
            />

            <EditorCanvas
              form={form}
              steps={steps}
              activeStepNumber={activeStepNumber}
              onSelectStep={(num) => {
                setActiveStepNumber(num);
                setViewAllSteps(false);
              }}
              onAddStep={handleAddStep}
              onUpdateStep={handleUpdateStep}
              onDeleteStep={handleDeleteStep}
              onReorderStep={handleReorderStep}
              viewAllSteps={viewAllSteps}
              onToggleViewAll={() => setViewAllSteps(!viewAllSteps)}
              activeFieldId={activeFieldId}
              onSelectField={setActiveFieldId}
              onUpdateField={handleUpdateField}
              onDeleteField={handleDeleteField}
              onDuplicateField={handleDuplicateField}
              onMoveField={handleMoveField}
              onAddField={handleAddField}
              onUpdateWelcome={(welcome) => {
                const updated = { ...form, welcomeScreen: welcome };
                commitChange(updated, steps);
              }}
              onUpdateThankYou={(thankYou) => {
                const updated = { ...form, thankYouScreen: thankYou };
                commitChange(updated, steps);
              }}
            />

            <FieldInspector
              field={activeField}
              onUpdateField={handleUpdateField}
              onDeleteField={handleDeleteField}
              onDuplicateField={handleDuplicateField}
              isQuizMode={form.settings.isQuizMode}
              layoutMode={form.layoutMode}
            />
          </>
        )}

        {activeTab === 'theme' && (
          <ThemeStudio
            theme={form.theme}
            onChangeTheme={(newTheme: FormTheme) => {
              const updated = { ...form, theme: newTheme };
              commitChange(updated, steps);
            }}
            formTitle={form.title}
          />
        )}

        {activeTab === 'logic' && (
          <VisualLogicBuilder
            form={form}
            onUpdateRules={(newRules: LogicRule[]) => {
              const updated = { ...form, logicRules: newRules };
              commitChange(updated, steps);
            }}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            form={form}
            onUpdateSettings={(newSettings: FormSettings) => {
              const updated = { ...form, settings: newSettings };
              commitChange(updated, steps);
            }}
            onExportSchema={handleExportSchema}
          />
        )}

        {activeTab === 'share' && (
          <ShareTab
            form={form}
            onOpenPublicView={() => onOpenPublicView(form.settings.slug)}
          />
        )}

        {activeTab === 'analytics' && <AnalyticsTab form={form} onRefreshData={() => {}} />}
      </div>

      {/* Preview Modal */}
      <PreviewModal
        form={form}
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
      />

      {/* AI Generator Modal */}
      <AIGeneratorModal
        isOpen={isAIOpen}
        onClose={() => setIsAIOpen(false)}
        onFormGenerated={(generated: FormSchema) => {
          const newSteps = ensureFormSteps(generated);
          commitChange(generated, newSteps);
          setActiveFieldId(generated.fields[0]?.id || null);
        }}
      />
    </div>
  );
};
