import React, { useState } from 'react';
import { FormSchema, FormField, FormStep, LogicRule } from '../../types/form';
import { ensureFormSteps } from '../../lib/storage';
import confetti from 'canvas-confetti';
import { Check, ArrowRight, ArrowLeft, RefreshCw, Star, FastForward } from 'lucide-react';

interface RunnerProps {
  form: FormSchema;
  onSubmit: (answers: Record<string, any>, durationSeconds: number, score?: number, maxScore?: number) => void;
}

export const SteppedRunner: React.FC<RunnerProps> = ({ form, onSubmit }) => {
  const steps: FormStep[] = ensureFormSteps(form);
  const [hasStarted, setHasStarted] = useState(!form.welcomeScreen?.enabled);
  const [currentStep, setCurrentStep] = useState(1);
  const [stepHistory, setStepHistory] = useState<number[]>([1]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [startTime] = useState<number>(Date.now());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const maxStep = Math.max(...steps.map((s) => s.stepNumber), 1);
  const activeStepObj = steps.find((s) => s.stepNumber === currentStep) || steps[0];

  // Filter fields on current step according to conditional logic
  const isFieldVisible = (field: FormField): boolean => {
    const rules = form.logicRules.filter((r) => r.targetFieldId === field.id);
    if (rules.length === 0) return true;

    for (const rule of rules) {
      const sourceVal = answers[rule.sourceFieldId];
      let matches = false;

      if (rule.condition === 'equals') {
        matches = String(sourceVal ?? '').toLowerCase() === String(rule.value).toLowerCase();
      } else if (rule.condition === 'not_equals') {
        matches = String(sourceVal ?? '').toLowerCase() !== String(rule.value).toLowerCase();
      } else if (rule.condition === 'contains') {
        if (Array.isArray(sourceVal)) {
          matches = sourceVal.includes(rule.value);
        } else {
          matches = String(sourceVal || '').toLowerCase().includes(rule.value.toLowerCase());
        }
      } else if (rule.condition === 'not_contains') {
        if (Array.isArray(sourceVal)) {
          matches = !sourceVal.includes(rule.value);
        } else {
          matches = !String(sourceVal || '').toLowerCase().includes(rule.value.toLowerCase());
        }
      } else if (rule.condition === 'greater_than') {
        matches = Number(sourceVal) > Number(rule.value);
      } else if (rule.condition === 'less_than') {
        matches = Number(sourceVal) < Number(rule.value);
      } else if (rule.condition === 'is_empty') {
        matches = sourceVal === undefined || sourceVal === null || sourceVal === '';
      } else if (rule.condition === 'is_not_empty') {
        matches = sourceVal !== undefined && sourceVal !== null && sourceVal !== '';
      }

      if (rule.action === 'show' && !matches) return false;
      if (rule.action === 'hide' && matches) return false;
    }

    return true;
  };

  const currentFields = form.fields
    .filter((f) => (f.step || 1) === currentStep)
    .filter(isFieldVisible);

  const handleSelectOption = (field: FormField, option: string) => {
    if (field.type === 'checkbox') {
      const currentArr: string[] = answers[field.id] || [];
      const updated = currentArr.includes(option)
        ? currentArr.filter((item) => item !== option)
        : [...currentArr, option];
      setAnswers((prev) => ({ ...prev, [field.id]: updated }));
      clearError(field.id);
    } else {
      setAnswers((prev) => ({ ...prev, [field.id]: option }));
      clearError(field.id);
    }
  };

  const clearError = (fieldId: string) => {
    if (errors[fieldId]) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[fieldId];
        return copy;
      });
    }
  };

  const validateStep = (): boolean => {
    const newErrors: Record<string, string> = {};

    for (const field of currentFields) {
      const val = answers[field.id];
      if (field.required) {
        if (val === undefined || val === null || val === '') {
          newErrors[field.id] = 'This field is required.';
        } else if (Array.isArray(val) && val.length === 0) {
          newErrors[field.id] = 'Please select at least one option.';
        }
      }
      if (field.type === 'email' && val) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(String(val))) {
          newErrors[field.id] = 'Please enter a valid email address.';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Determine next step, checking for jump_to_step logic rules
  const getNextStepNumber = (): number | null => {
    // Check if any rule triggered on current step dictates jump_to_step
    const stepRules = form.logicRules.filter(
      (r) => r.action === 'jump_to_step' && r.targetStep
    );

    for (const rule of stepRules) {
      const sourceVal = answers[rule.sourceFieldId];
      let matches = false;

      if (rule.condition === 'equals') {
        matches = String(sourceVal ?? '').toLowerCase() === String(rule.value).toLowerCase();
      } else if (rule.condition === 'not_equals') {
        matches = String(sourceVal ?? '').toLowerCase() !== String(rule.value).toLowerCase();
      } else if (rule.condition === 'contains') {
        if (Array.isArray(sourceVal)) {
          matches = sourceVal.includes(rule.value);
        } else {
          matches = String(sourceVal || '').toLowerCase().includes(rule.value.toLowerCase());
        }
      }

      if (matches && rule.targetStep && rule.targetStep > currentStep) {
        return rule.targetStep;
      }
    }

    return currentStep < maxStep ? currentStep + 1 : null;
  };

  const handleNext = () => {
    if (validateStep()) {
      const nextStepNum = getNextStepNumber();
      if (nextStepNum !== null && nextStepNum <= maxStep) {
        setCurrentStep(nextStepNum);
        setStepHistory((prev) => [...prev, nextStepNum]);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        submitForm();
      }
    }
  };

  const handlePrev = () => {
    if (stepHistory.length > 1) {
      const newHistory = [...stepHistory];
      newHistory.pop(); // remove current
      const prevStep = newHistory[newHistory.length - 1];
      setStepHistory(newHistory);
      setCurrentStep(prevStep);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const submitForm = () => {
    setIsSubmitted(true);
    const duration = Math.max(5, Math.round((Date.now() - startTime) / 1000));

    if (form.theme.enableConfetti !== false) {
      try {
        confetti({
          particleCount: 90,
          spread: 80,
          origin: { y: 0.6 },
          colors: [form.theme.primaryColor || '#18181b', '#10b981', '#3b82f6'],
        });
      } catch {
        // fallback
      }
    }

    onSubmit(answers, duration);
  };

  // Button styling helpers
  const getButtonClass = () => {
    const radiusClass = {
      none: 'rounded-none',
      sm: 'rounded-sm',
      md: 'rounded-md',
      lg: 'rounded-xl',
      full: 'rounded-full',
    }[form.theme.buttonRadius || 'md'];

    const shadowClass = {
      none: 'shadow-none',
      subtle: 'shadow-xs',
      elevated: 'shadow-md',
    }[form.theme.buttonShadow || 'subtle'];

    return `${radiusClass} ${shadowClass}`;
  };

  // Animation preset helper
  const getAnimationClass = () => {
    const preset = form.theme.animationPreset || 'slide-vertical';
    const speed = {
      snappy: 'duration-150',
      normal: 'duration-300',
      gentle: 'duration-500',
    }[form.theme.transitionSpeed || 'normal'];

    if (preset === 'slide-vertical') return `animate-in fade-in slide-in-from-bottom-4 ${speed}`;
    if (preset === 'slide-horizontal') return `animate-in fade-in slide-in-from-right-6 ${speed}`;
    if (preset === 'fade-scale') return `animate-in fade-in zoom-in-95 ${speed}`;
    if (preset === 'smooth-reveal') return `animate-in fade-in ${speed}`;
    return '';
  };

  // Background pattern styles
  const getBackgroundStyleObj = () => {
    const bg = form.theme.backgroundColor;
    if (form.theme.backgroundStyle === 'subtle-grid') {
      return {
        backgroundColor: bg,
        backgroundImage: `radial-gradient(rgba(0,0,0,0.08) 1px, transparent 1px)`,
        backgroundSize: '20px 20px',
      };
    }
    if (form.theme.backgroundStyle === 'dots') {
      return {
        backgroundColor: bg,
        backgroundImage: `radial-gradient(rgba(0,0,0,0.12) 1.5px, transparent 1.5px)`,
        backgroundSize: '16px 16px',
      };
    }
    if (form.theme.backgroundStyle === 'gradient') {
      return {
        background: `linear-gradient(180deg, ${bg} 0%, ${form.theme.primaryColor}15 100%)`,
      };
    }
    if (form.theme.backgroundStyle === 'mesh') {
      return {
        backgroundColor: bg,
        backgroundImage: `radial-gradient(at 0% 0%, ${form.theme.primaryColor}18 0px, transparent 50%), radial-gradient(at 100% 100%, ${form.theme.secondaryColor || '#6366f1'}15 0px, transparent 50%)`,
      };
    }
    return { backgroundColor: bg };
  };

  // Welcome Screen
  if (!hasStarted && form.welcomeScreen?.enabled) {
    return (
      <div
        className="min-h-[520px] flex flex-col justify-center items-center text-center p-6 sm:p-12"
        style={{ ...getBackgroundStyleObj(), color: form.theme.textColor, fontFamily: form.theme.fontFamily }}
      >
        <div className="max-w-xl mx-auto space-y-6">
          {form.welcomeScreen.coverImage && (
            <div className="w-full h-48 sm:h-64 rounded-xl overflow-hidden mb-6 border border-neutral-200 shadow-sm">
              <img
                src={form.welcomeScreen.coverImage}
                alt={form.welcomeScreen.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">{form.welcomeScreen.title}</h1>
          <p className="text-sm sm:text-base opacity-75 max-w-md mx-auto">{form.welcomeScreen.subtitle}</p>
          <button
            onClick={() => setHasStarted(true)}
            style={{ backgroundColor: form.theme.primaryColor }}
            className={`px-6 py-3 text-sm font-semibold text-white transition-all hover:opacity-90 ${getButtonClass()}`}
          >
            {form.welcomeScreen.buttonText || 'Begin Questionnaire'}
          </button>
        </div>
      </div>
    );
  }

  // Thank You Screen
  if (isSubmitted) {
    return (
      <div
        className="min-h-[480px] flex flex-col justify-center items-center text-center p-6 sm:p-12"
        style={{ ...getBackgroundStyleObj(), color: form.theme.textColor, fontFamily: form.theme.fontFamily }}
      >
        <div className="max-w-md mx-auto space-y-6">
          <div
            className="w-16 h-16 rounded-full mx-auto flex items-center justify-center"
            style={{ backgroundColor: `${form.theme.primaryColor}15`, color: form.theme.primaryColor }}
          >
            <Check className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold">{form.thankYouScreen.title || 'Submission Complete'}</h2>
          <p className="text-sm opacity-75 leading-relaxed">{form.thankYouScreen.message}</p>
          {form.thankYouScreen.showRestartButton && (
            <button
              onClick={() => {
                setAnswers({});
                setCurrentStep(1);
                setStepHistory([1]);
                setIsSubmitted(false);
                setHasStarted(!form.welcomeScreen?.enabled);
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-neutral-300 hover:bg-neutral-100 transition-colors inline-flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Submit Another Response</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const isFinalStep = currentStep === maxStep || getNextStepNumber() === null;

  return (
    <div
      className="min-h-full py-8 px-4 sm:px-6"
      style={{ ...getBackgroundStyleObj(), color: form.theme.textColor, fontFamily: form.theme.fontFamily }}
    >
      <div
        className="max-w-2xl mx-auto p-6 sm:p-10 rounded-2xl border border-neutral-200/80 shadow-xs"
        style={{ backgroundColor: form.theme.surfaceColor }}
      >
        {/* Step Wizard Header with Breadcrumb Progression */}
        <div className="mb-8 pb-6 border-b border-neutral-200/80 space-y-4">
          {/* Breadcrumb Steps Badges */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            {steps.map((st) => {
              const isPast = st.stepNumber < currentStep;
              const isCurrent = st.stepNumber === currentStep;

              return (
                <div
                  key={st.stepNumber}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all shrink-0 ${
                    isCurrent
                      ? 'border-neutral-900 bg-neutral-900 text-white font-semibold shadow-xs'
                      : isPast
                      ? 'border-neutral-200 bg-neutral-100 text-neutral-800 font-medium'
                      : 'border-neutral-200/60 text-neutral-400 bg-transparent'
                  }`}
                  style={isCurrent ? { backgroundColor: form.theme.primaryColor, borderColor: form.theme.primaryColor } : {}}
                >
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-mono">
                    {isPast ? <Check className="w-3 h-3 text-emerald-600" /> : st.stepNumber}
                  </span>
                  <span className="truncate max-w-[120px]">{st.title}</span>
                </div>
              );
            })}
          </div>

          {/* Progress Percentage Bar */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs opacity-75">
              <span className="font-semibold uppercase tracking-wider text-[11px]">
                {activeStepObj?.title || `Step ${currentStep}`}
              </span>
              <span className="font-mono tabular-nums text-[11px]">
                {Math.round((currentStep / maxStep) * 100)}% Complete
              </span>
            </div>

            <div className="w-full bg-neutral-100 h-1.5 rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${(currentStep / maxStep) * 100}%`,
                  backgroundColor: form.theme.primaryColor,
                }}
              />
            </div>
          </div>

          {/* Step Subtitle / Description */}
          {activeStepObj?.description && (
            <p className="text-xs text-neutral-500 pt-1 leading-relaxed">
              {activeStepObj.description}
            </p>
          )}
        </div>

        {/* Current Step Question Fields */}
        <div key={currentStep} className={`space-y-6 ${getAnimationClass()}`}>
          {currentFields.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-400 italic">
              No questions visible on this page due to conditional filtering. You may continue.
            </div>
          ) : (
            currentFields.map((field) => (
              <div key={field.id} className="space-y-2">
                <label className="block text-sm font-semibold">
                  {field.label}
                  {field.required && <span className="text-rose-500 ml-1">*</span>}
                </label>

                {field.helpText && <p className="text-xs opacity-70">{field.helpText}</p>}

                {/* Input Styles (bordered, filled, underlined) */}
                {(field.type === 'text' ||
                  field.type === 'email' ||
                  field.type === 'phone' ||
                  field.type === 'number' ||
                  field.type === 'url' ||
                  field.type === 'date') && (
                  <>
                    {form.theme.inputStyle === 'underlined' ? (
                      <input
                        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                        value={answers[field.id] || ''}
                        placeholder={field.placeholder || ''}
                        onChange={(e) => {
                          setAnswers({ ...answers, [field.id]: e.target.value });
                          clearError(field.id);
                        }}
                        className={`w-full py-2 bg-transparent border-b-2 text-sm focus:outline-none transition-colors ${
                          errors[field.id] ? 'border-rose-500' : ''
                        }`}
                        style={{ borderBottomColor: errors[field.id] ? undefined : answers[field.id] ? form.theme.primaryColor : '#cbd5e1' }}
                      />
                    ) : form.theme.inputStyle === 'filled' ? (
                      <input
                        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                        value={answers[field.id] || ''}
                        placeholder={field.placeholder || ''}
                        onChange={(e) => {
                          setAnswers({ ...answers, [field.id]: e.target.value });
                          clearError(field.id);
                        }}
                        className={`w-full p-3 bg-neutral-100 rounded-lg text-sm focus:outline-none focus:ring-2 ${
                          errors[field.id] ? 'ring-2 ring-rose-500' : ''
                        }`}
                      />
                    ) : (
                      <input
                        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                        value={answers[field.id] || ''}
                        placeholder={field.placeholder || ''}
                        onChange={(e) => {
                          setAnswers({ ...answers, [field.id]: e.target.value });
                          clearError(field.id);
                        }}
                        className={`w-full px-3.5 py-2.5 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 ${
                          errors[field.id] ? 'border-rose-500 ring-rose-200' : 'border-neutral-300'
                        }`}
                      />
                    )}
                  </>
                )}

                {field.type === 'textarea' && (
                  <textarea
                    rows={3}
                    value={answers[field.id] || ''}
                    placeholder={field.placeholder || ''}
                    onChange={(e) => {
                      setAnswers({ ...answers, [field.id]: e.target.value });
                      clearError(field.id);
                    }}
                    className={`w-full p-3 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 ${
                      errors[field.id] ? 'border-rose-500 ring-rose-200' : 'border-neutral-300'
                    }`}
                  />
                )}

                {field.type === 'radio' && field.options && (
                  <div className="space-y-2">
                    {field.options.map((opt, i) => (
                      <label
                        key={i}
                        onClick={() => handleSelectOption(field, opt)}
                        className={`flex items-center gap-3 p-3 rounded-lg border text-sm cursor-pointer transition-colors ${
                          answers[field.id] === opt
                            ? 'font-medium shadow-2xs'
                            : 'border-neutral-200 hover:bg-neutral-50'
                        }`}
                        style={
                          answers[field.id] === opt
                            ? {
                                borderColor: form.theme.primaryColor,
                                backgroundColor: `${form.theme.primaryColor}10`,
                              }
                            : {}
                        }
                      >
                        <input
                          type="radio"
                          name={field.id}
                          checked={answers[field.id] === opt}
                          onChange={() => {}}
                          className="text-neutral-900"
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                )}

                {field.type === 'checkbox' && field.options && (
                  <div className="space-y-2">
                    {field.options.map((opt, i) => {
                      const arr: string[] = answers[field.id] || [];
                      const checked = arr.includes(opt);
                      return (
                        <label
                          key={i}
                          onClick={() => handleSelectOption(field, opt)}
                          className={`flex items-center gap-3 p-3 rounded-lg border text-sm cursor-pointer transition-colors ${
                            checked ? 'font-medium shadow-2xs' : 'border-neutral-200 hover:bg-neutral-50'
                          }`}
                          style={
                            checked
                              ? {
                                  borderColor: form.theme.primaryColor,
                                  backgroundColor: `${form.theme.primaryColor}10`,
                                }
                              : {}
                          }
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {}}
                            className="rounded text-neutral-900"
                          />
                          <span>{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {field.type === 'select' && field.options && (
                  <select
                    value={answers[field.id] || ''}
                    onChange={(e) => {
                      setAnswers({ ...answers, [field.id]: e.target.value });
                      clearError(field.id);
                    }}
                    className="w-full p-2.5 text-sm border rounded-lg bg-white border-neutral-300"
                  >
                    <option value="" disabled>
                      {field.placeholder || 'Select an option...'}
                    </option>
                    {field.options.map((opt, i) => (
                      <option key={i} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}

                {field.type === 'rating' && (
                  <div className="flex items-center gap-2 pt-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => {
                          setAnswers({ ...answers, [field.id]: String(star) });
                          clearError(field.id);
                        }}
                        className="p-1.5 text-neutral-300 hover:text-amber-400"
                        style={star <= Number(answers[field.id] || 0) ? { color: '#f59e0b' } : {}}
                      >
                        <Star className="w-6 h-6 fill-current" />
                      </button>
                    ))}
                  </div>
                )}

                {errors[field.id] && (
                  <p className="text-xs text-rose-600 font-medium">{errors[field.id]}</p>
                )}
              </div>
            ))
          )}
        </div>

        {/* Step Navigation Controls */}
        <div className="mt-8 pt-6 border-t border-neutral-200/80 flex items-center justify-between">
          <button
            type="button"
            onClick={handlePrev}
            disabled={stepHistory.length <= 1 && currentStep === 1}
            className="px-4 py-2 text-xs font-semibold rounded-lg border border-neutral-300 disabled:opacity-30 hover:bg-neutral-50 transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>

          <button
            type="button"
            onClick={handleNext}
            style={{
              backgroundColor: form.theme.primaryColor,
              color: '#ffffff',
            }}
            className={`px-5 py-2.5 text-xs font-semibold transition-all flex items-center gap-1.5 hover:opacity-90 active:scale-98 ${getButtonClass()}`}
          >
            <span>
              {isFinalStep
                ? form.settings.submitButtonText || 'Complete Submission'
                : 'Continue'}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
