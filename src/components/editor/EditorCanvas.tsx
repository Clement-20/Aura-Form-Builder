import React, { useState } from 'react';
import { FormSchema, FormField, FieldType, FormStep } from '../../types/form';
import { StepManagerBar } from './StepManagerBar';
import {
  GripVertical,
  Trash2,
  Copy,
  Plus,
  Check,
  Star,
  SlidersHorizontal,
  CircleDot,
  CheckSquare,
  ChevronDown,
  Info,
  Calendar,
  Hash,
  Type,
  AlignLeft,
  Mail,
  Phone,
  Link,
  Sparkles,
  Layers,
  ArrowRight,
  Split,
} from 'lucide-react';

interface EditorCanvasProps {
  form: FormSchema;
  steps: FormStep[];
  activeStepNumber: number;
  onSelectStep: (step: number) => void;
  onAddStep: () => void;
  onUpdateStep: (stepNumber: number, title: string, description?: string) => void;
  onDeleteStep: (stepNumber: number) => void;
  onReorderStep: (stepNumber: number, direction: 'left' | 'right') => void;
  viewAllSteps: boolean;
  onToggleViewAll: () => void;
  activeFieldId: string | null;
  onSelectField: (id: string) => void;
  onUpdateField: (field: FormField) => void;
  onDeleteField: (id: string) => void;
  onDuplicateField: (id: string) => void;
  onMoveField: (index: number, direction: 'up' | 'down') => void;
  onAddField: (type: FieldType, targetStep?: number) => void;
  onUpdateWelcome: (welcome: FormSchema['welcomeScreen']) => void;
  onUpdateThankYou: (thankYou: FormSchema['thankYouScreen']) => void;
}

export const EditorCanvas: React.FC<EditorCanvasProps> = ({
  form,
  steps,
  activeStepNumber,
  onSelectStep,
  onAddStep,
  onUpdateStep,
  onDeleteStep,
  onReorderStep,
  viewAllSteps,
  onToggleViewAll,
  activeFieldId,
  onSelectField,
  onUpdateField,
  onDeleteField,
  onDuplicateField,
  onMoveField,
  onAddField,
  onUpdateWelcome,
  onUpdateThankYou,
}) => {
  const handleAddOption = (field: FormField) => {
    const currentOptions = field.options || [];
    const newOption = `Option ${currentOptions.length + 1}`;
    onUpdateField({
      ...field,
      options: [...currentOptions, newOption],
    });
  };

  const handleUpdateOption = (field: FormField, optIdx: number, val: string) => {
    const currentOptions = [...(field.options || [])];
    currentOptions[optIdx] = val;
    onUpdateField({
      ...field,
      options: currentOptions,
    });
  };

  const handleDeleteOption = (field: FormField, optIdx: number) => {
    const currentOptions = (field.options || []).filter((_, i) => i !== optIdx);
    onUpdateField({
      ...field,
      options: currentOptions,
    });
  };

  const handleSetCorrectAnswer = (field: FormField, optVal: string) => {
    onUpdateField({
      ...field,
      correctAnswer: optVal,
    });
  };

  // Split / create new step after this question
  const handleSplitStepAfter = (fieldIdx: number) => {
    onAddStep();
    const newStepNumber = steps.length + 1;
    // Move subsequent fields to the new step
    const targetField = form.fields[fieldIdx];
    for (let i = fieldIdx + 1; i < form.fields.length; i++) {
      onUpdateField({
        ...form.fields[i],
        step: newStepNumber,
      });
    }
  };

  // Determine which fields to display based on viewAllSteps vs activeStepNumber
  const displayedFields = viewAllSteps
    ? form.fields
    : form.fields.filter((f) => (f.step || 1) === activeStepNumber);

  const activeStep = steps.find((s) => s.stepNumber === activeStepNumber);

  return (
    <main className="flex-1 bg-neutral-100/60 overflow-y-auto h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Multi-Step Navigation & Controls Bar */}
      <StepManagerBar
        steps={steps}
        activeStepNumber={activeStepNumber}
        onSelectStep={onSelectStep}
        onAddStep={onAddStep}
        onUpdateStep={onUpdateStep}
        onDeleteStep={onDeleteStep}
        onReorderStep={onReorderStep}
        viewAllSteps={viewAllSteps}
        onToggleViewAll={onToggleViewAll}
        fields={form.fields}
      />

      {/* Main Canvas Scroll Area */}
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Active Step Header Banner (when not in viewAllSteps) */}
          {!viewAllSteps && activeStep && (
            <div className="bg-white/80 backdrop-blur-xs p-4 rounded-xl border border-neutral-200/90 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-neutral-900 text-white font-mono text-xs flex items-center justify-center font-bold">
                    {activeStep.stepNumber}
                  </span>
                  <h3 className="font-bold text-sm text-neutral-900">{activeStep.title}</h3>
                </div>
                {activeStep.description && (
                  <p className="text-xs text-neutral-500 mt-1 pl-7">{activeStep.description}</p>
                )}
              </div>

              <span className="text-xs font-mono text-neutral-400">
                {displayedFields.length} question(s) on this page
              </span>
            </div>
          )}

          {/* Welcome Screen Card (Only on Step 1 or viewAll) */}
          {(viewAllSteps || activeStepNumber === 1) && (
            <div className="bg-white rounded-xl border border-neutral-200/80 p-5 shadow-xs transition-all hover:border-neutral-300">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Welcome Cover Experience
                  </span>
                  <span aria-hidden="true" className="text-neutral-300">·</span>
                  <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.welcomeScreen.enabled}
                      onChange={(e) =>
                        onUpdateWelcome({
                          ...form.welcomeScreen,
                          enabled: e.target.checked,
                        })
                      }
                      className="rounded text-neutral-900 focus:ring-neutral-900"
                    />
                    <span>Show cover screen before questions</span>
                  </label>
                </div>
              </div>

              {form.welcomeScreen.enabled && (
                <div className="space-y-3 pt-2">
                  <input
                    type="text"
                    value={form.welcomeScreen.title}
                    onChange={(e) =>
                      onUpdateWelcome({
                        ...form.welcomeScreen,
                        title: e.target.value,
                      })
                    }
                    placeholder="Welcome Screen Title..."
                    className="w-full text-base font-bold text-neutral-900 border-b border-neutral-200 pb-1.5 focus:outline-none focus:border-neutral-900"
                  />
                  <input
                    type="text"
                    value={form.welcomeScreen.subtitle}
                    onChange={(e) =>
                      onUpdateWelcome({
                        ...form.welcomeScreen,
                        subtitle: e.target.value,
                      })
                    }
                    placeholder="Brief intro or estimated completion time..."
                    className="w-full text-xs text-neutral-600 border-b border-neutral-100 pb-1 focus:outline-none focus:border-neutral-400"
                  />
                  <div className="pt-2 flex items-center gap-3">
                    <span className="text-xs text-neutral-500">CTA Button Text:</span>
                    <input
                      type="text"
                      value={form.welcomeScreen.buttonText}
                      onChange={(e) =>
                        onUpdateWelcome({
                          ...form.welcomeScreen,
                          buttonText: e.target.value,
                        })
                      }
                      className="px-2.5 py-1 text-xs border rounded-md border-neutral-200 focus:border-neutral-900"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Question Cards List */}
          {displayedFields.length === 0 ? (
            <div className="p-12 bg-white rounded-xl border border-neutral-200 text-center text-xs text-neutral-400 space-y-3">
              <p>No questions on this step yet.</p>
              <button
                type="button"
                onClick={() => onAddField('text', activeStepNumber)}
                className="px-3.5 py-1.5 bg-neutral-900 text-white rounded-lg font-semibold hover:bg-neutral-800 transition-colors inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Question to Step {activeStepNumber}</span>
              </button>
            </div>
          ) : (
            displayedFields.map((field, idx) => {
              const isSelected = activeFieldId === field.id;
              const globalIndex = form.fields.findIndex((f) => f.id === field.id);

              return (
                <div key={field.id} className="space-y-4">
                  <div
                    onClick={() => onSelectField(field.id)}
                    className={`bg-white rounded-xl border transition-all p-5 shadow-xs cursor-pointer ${
                      isSelected
                        ? 'border-neutral-900 ring-1 ring-neutral-900'
                        : 'border-neutral-200/80 hover:border-neutral-300'
                    }`}
                  >
                    {/* Question Card Top Bar */}
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded bg-neutral-100 text-neutral-700 font-mono text-xs flex items-center justify-center font-semibold">
                          {globalIndex + 1}
                        </span>
                        <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                          {field.type}
                        </span>

                        {/* Step Assignment Dropdown */}
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[11px] text-neutral-400">·</span>
                          <select
                            value={field.step || 1}
                            onChange={(e) =>
                              onUpdateField({
                                ...field,
                                step: parseInt(e.target.value, 10),
                              })
                            }
                            className="text-[11px] font-medium text-neutral-700 border border-neutral-200 rounded px-1.5 py-0.5 bg-neutral-50 hover:bg-white"
                            title="Reassign to step"
                          >
                            {steps.map((s) => (
                              <option key={s.stepNumber} value={s.stepNumber}>
                                Step {s.stepNumber}: {s.title}
                              </option>
                            ))}
                          </select>
                        </div>

                        {form.settings.isQuizMode && field.points && (
                          <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                            {field.points} pts
                          </span>
                        )}
                      </div>

                      {/* Card Controls */}
                      <div className="flex items-center gap-2">
                        <label
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 text-xs text-neutral-600 cursor-pointer mr-2"
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(field.required)}
                            onChange={(e) =>
                              onUpdateField({ ...field, required: e.target.checked })
                            }
                            className="rounded text-neutral-900"
                          />
                          <span>Required</span>
                        </label>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSplitStepAfter(globalIndex);
                          }}
                          className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded hover:bg-neutral-100 transition-colors"
                          title="Add Page Break / Split Step Here"
                        >
                          <Split className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDuplicateField(field.id);
                          }}
                          className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded hover:bg-neutral-100 transition-colors"
                          title="Duplicate Field"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteField(field.id);
                          }}
                          className="p-1.5 text-neutral-400 hover:text-rose-600 rounded hover:bg-neutral-100 transition-colors"
                          title="Delete Field"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Inline Editable Question Title */}
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) => onUpdateField({ ...field, label: e.target.value })}
                        placeholder="What question would you like to ask?"
                        className="w-full text-base font-semibold text-neutral-900 border-b border-transparent hover:border-neutral-200 focus:border-neutral-900 pb-1 focus:outline-none transition-colors"
                      />

                      <input
                        type="text"
                        value={field.helpText || ''}
                        onChange={(e) => onUpdateField({ ...field, helpText: e.target.value })}
                        placeholder="Optional description or guidance for the respondent..."
                        className="w-full text-xs text-neutral-500 border-b border-transparent hover:border-neutral-100 focus:border-neutral-300 pb-1 focus:outline-none transition-colors"
                      />

                      {/* Options Editor for Choice Fields */}
                      {(field.type === 'radio' ||
                        field.type === 'checkbox' ||
                        field.type === 'select') && (
                        <div className="pt-3 space-y-2">
                          <div className="flex items-center justify-between text-xs text-neutral-500">
                            <span>Options List</span>
                            {form.settings.isQuizMode && (
                              <span className="text-[11px] text-indigo-600 font-medium">
                                Click checkmark to designate correct answer
                              </span>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            {(field.options || []).map((opt, optIdx) => {
                              const isCorrect = String(field.correctAnswer) === String(opt);

                              return (
                                <div key={optIdx} className="flex items-center gap-2">
                                  {form.settings.isQuizMode && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSetCorrectAnswer(field, opt);
                                      }}
                                      className={`p-1 rounded text-xs transition-colors ${
                                        isCorrect
                                          ? 'bg-emerald-600 text-white'
                                          : 'text-neutral-400 hover:text-neutral-700 bg-neutral-100'
                                      }`}
                                      title="Mark as correct answer"
                                    >
                                      <Check className="w-3 h-3" />
                                    </button>
                                  )}

                                  <input
                                    type="text"
                                    value={opt}
                                    onChange={(e) =>
                                      handleUpdateOption(field, optIdx, e.target.value)
                                    }
                                    className="flex-1 px-3 py-1.5 text-xs border rounded-md border-neutral-200 focus:border-neutral-900 focus:outline-none"
                                  />

                                  {(field.options || []).length > 1 && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteOption(field, optIdx);
                                      }}
                                      className="p-1 text-neutral-400 hover:text-rose-500"
                                      title="Remove option"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddOption(field);
                            }}
                            className="text-xs font-semibold text-neutral-800 hover:text-neutral-950 flex items-center gap-1.5 pt-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Option</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Quick Add Question Toolbar */}
          <div className="pt-2 flex items-center justify-center gap-2">
            <button
              onClick={() => onAddField('text', activeStepNumber)}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Short Text</span>
            </button>
            <button
              onClick={() => onAddField('radio', activeStepNumber)}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Single Choice</span>
            </button>
            <button
              onClick={() => onAddField('rating', activeStepNumber)}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Star Rating</span>
            </button>
          </div>

          {/* Thank You Screen Card (On last step or viewAll) */}
          {(viewAllSteps || activeStepNumber === steps.length) && (
            <div className="bg-white rounded-xl border border-neutral-200/80 p-5 shadow-xs transition-all hover:border-neutral-300">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Completion & Thank You Experience
                </span>
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  value={form.thankYouScreen.title}
                  onChange={(e) =>
                    onUpdateThankYou({
                      ...form.thankYouScreen,
                      title: e.target.value,
                    })
                  }
                  placeholder="Thank You Title..."
                  className="w-full text-base font-bold text-neutral-900 border-b border-neutral-200 pb-1.5 focus:outline-none focus:border-neutral-900"
                />
                <input
                  type="text"
                  value={form.thankYouScreen.message}
                  onChange={(e) =>
                    onUpdateThankYou({
                      ...form.thankYouScreen,
                      message: e.target.value,
                    })
                  }
                  placeholder="Closing message displayed to respondent..."
                  className="w-full text-xs text-neutral-600 border-b border-neutral-100 pb-1 focus:outline-none focus:border-neutral-400"
                />
                <div className="flex items-center gap-4 pt-1">
                  <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.thankYouScreen.showRestartButton}
                      onChange={(e) =>
                        onUpdateThankYou({
                          ...form.thankYouScreen,
                          showRestartButton: e.target.checked,
                        })
                      }
                      className="rounded text-neutral-900"
                    />
                    <span>Allow respondent to submit another response</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
