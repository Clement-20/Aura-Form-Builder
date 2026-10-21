import React, { useState } from 'react';
import { FormSchema, FormField } from '../../types/form';
import confetti from 'canvas-confetti';
import { Check, RefreshCw, Star } from 'lucide-react';
import { AnimatedWrapper } from './AnimatedWrapper';

interface RunnerProps {
  form: FormSchema;
  onSubmit: (answers: Record<string, any>, durationSeconds: number, score?: number, maxScore?: number) => void;
}

export const StandardRunner: React.FC<RunnerProps> = ({ form, onSubmit }) => {
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [startTime] = useState<number>(Date.now());
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Filter fields based on conditional logic
  const visibleFields = form.fields.filter((field) => {
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
  });

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    for (const field of visibleFields) {
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

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      // scroll to first error
      const firstKey = Object.keys(newErrors)[0];
      const el = document.getElementById(`field_container_${firstKey}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setIsSubmitted(true);
    const duration = Math.max(5, Math.round((Date.now() - startTime) / 1000));

    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: [form.theme.primaryColor || '#18181b', '#10b981', '#3b82f6'],
      });
    } catch {
      // fallback
    }

    onSubmit(answers, duration);
  };

  const fontFamilyClass = {
    'DM Sans': 'font-sans',
    'Plus Jakarta Sans': 'font-display',
    'Outfit': 'font-display',
    'Playfair Display': 'font-serif',
    'JetBrains Mono': 'font-mono',
    'Inter': 'font-sans',
    'Bricolage Grotesque': 'font-display',
  }[form.theme.fontFamily] || 'font-sans';

  const roundedClass = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-xl',
    full: 'rounded-full',
  }[form.theme.borderRadius] || 'rounded-lg';

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

  if (isSubmitted) {
    return (
      <AnimatedWrapper theme={form.theme} animationType="outro" className="w-full min-h-screen flex items-center justify-center p-4">
        <div
          className={`max-w-xl mx-auto p-8 sm:p-12 my-6 rounded-2xl border border-neutral-200/80 shadow-xs text-center space-y-6 ${fontFamilyClass}`}
          style={{ backgroundColor: form.theme.surfaceColor, color: form.theme.textColor }}
        >
          <div
            className="w-16 h-16 rounded-full mx-auto flex items-center justify-center"
            style={{ backgroundColor: `${form.theme.primaryColor}15`, color: form.theme.primaryColor }}
          >
            <Check className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold">{form.thankYouScreen.title || 'Thank You!'}</h2>
          <p className="text-sm opacity-75 leading-relaxed">{form.thankYouScreen.message}</p>
          {form.thankYouScreen.showRestartButton && (
            <button
              onClick={() => {
                setAnswers({});
                setIsSubmitted(false);
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-neutral-300 hover:bg-neutral-100 transition-colors inline-flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Submit Another</span>
            </button>
          )}
        </div>
      </AnimatedWrapper>
    );
  }

  return (
    <div className={`w-full min-h-screen py-8 px-4 ${fontFamilyClass}`} style={getBackgroundStyleObj()}>
      <AnimatedWrapper theme={form.theme} animationType="intro">
        <form
          onSubmit={handleSubmit}
          className="max-w-2xl mx-auto p-6 sm:p-10 rounded-2xl border border-neutral-200/80 shadow-xs space-y-6"
          style={{ backgroundColor: form.theme.surfaceColor, color: form.theme.textColor }}
        >
      <div className="border-b border-neutral-200/80 pb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{form.title}</h1>
        {form.description && <p className="text-sm opacity-75 mt-2 leading-relaxed">{form.description}</p>}
      </div>

      <div className="space-y-6">
        {visibleFields.map((field) => (
          <div key={field.id} id={`field_container_${field.id}`} className="space-y-2">
            <label className="block text-sm font-semibold">
              {field.label}
              {field.required && <span className="text-rose-500 ml-1">*</span>}
            </label>

            {field.helpText && <p className="text-xs opacity-70">{field.helpText}</p>}

            {(field.type === 'text' || field.type === 'email' || field.type === 'phone' || field.type === 'number' || field.type === 'url' || field.type === 'date') && (
              <input
                type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                value={answers[field.id] || ''}
                placeholder={field.placeholder || ''}
                onChange={(e) => {
                  setAnswers({ ...answers, [field.id]: e.target.value });
                  clearError(field.id);
                }}
                className={`w-full px-3.5 py-2.5 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 ${roundedClass} ${
                  errors[field.id] ? 'border-rose-500 ring-rose-200' : 'border-neutral-300'
                }`}
              />
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
                className={`w-full p-3 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 ${roundedClass} ${
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
                      answers[field.id] === opt ? 'bg-neutral-900/5 border-neutral-900 font-medium' : 'border-neutral-200 hover:bg-neutral-50'
                    }`}
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
                        checked ? 'bg-neutral-900/5 border-neutral-900 font-medium' : 'border-neutral-200 hover:bg-neutral-50'
                      }`}
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
                className={`w-full p-2.5 text-sm border rounded-lg bg-white ${roundedClass}`}
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

            {field.type === 'scale' && (
              <div className="grid grid-cols-11 gap-1 pt-1">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => {
                      setAnswers({ ...answers, [field.id]: String(num) });
                      clearError(field.id);
                    }}
                    className={`h-9 rounded border font-mono text-xs font-semibold ${
                      String(answers[field.id]) === String(num)
                        ? 'bg-neutral-900 text-white border-neutral-900'
                        : 'border-neutral-200 bg-white hover:border-neutral-400'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            )}

            {errors[field.id] && <p className="text-xs text-rose-600 font-medium">{errors[field.id]}</p>}
          </div>
        ))}
      </div>

      <div className="pt-6 border-t border-neutral-200/80 flex items-center justify-between">
        <span className="text-xs opacity-50">Powered by AuraForm</span>
        <button
          type="submit"
          style={{ backgroundColor: form.theme.primaryColor }}
          className={`px-6 py-2.5 text-xs font-semibold text-white hover:opacity-90 transition-all ${getButtonClass()}`}
        >
          {form.settings.submitButtonText || 'Submit Form'}
        </button>
      </div>
    </form>
      </AnimatedWrapper>
    </div>
  );
};
