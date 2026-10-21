import React, { useState, useEffect, useRef } from 'react';
import { FormSchema, FormField } from '../../types/form';
import confetti from 'canvas-confetti';
import { ArrowDown, ArrowUp, Check, CornerDownLeft, Sparkles, RefreshCw, Star } from 'lucide-react';

interface RunnerProps {
  form: FormSchema;
  onSubmit: (answers: Record<string, any>, durationSeconds: number, score?: number, maxScore?: number) => void;
  isInteractivePreview?: boolean;
}

export const ConversationalRunner: React.FC<RunnerProps> = ({
  form,
  onSubmit,
  isInteractivePreview = false,
}) => {
  const [hasStarted, setHasStarted] = useState(!form.welcomeScreen?.enabled);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [startTime] = useState<number>(Date.now());
  const [errorText, setErrorText] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

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

  const currentField: FormField | undefined = visibleFields[currentIndex];
  const progressPercent = visibleFields.length > 0 
    ? Math.round(((currentIndex + (isSubmitted ? 1 : 0)) / visibleFields.length) * 100) 
    : 100;

  // Auto focus input when question changes
  useEffect(() => {
    if (hasStarted && !isSubmitted && inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentIndex, hasStarted, isSubmitted]);

  // Handle keyboard shortcuts (Enter to next, Up/Down arrow, letter keys for choices)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!hasStarted || isSubmitted) return;

      // Enter advances to next
      if (e.key === 'Enter' && !e.shiftKey) {
        if (currentField?.type !== 'textarea') {
          e.preventDefault();
          handleNext();
        }
      }

      // Letter shortcuts for radio options (A, B, C...)
      if (
        currentField?.type === 'radio' &&
        currentField.options &&
        /^[a-zA-Z]$/.test(e.key) &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        const charCode = e.key.toUpperCase().charCodeAt(0) - 65; // A=0, B=1...
        if (charCode >= 0 && charCode < currentField.options.length) {
          e.preventDefault();
          handleSelectOption(currentField.options[charCode]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasStarted, isSubmitted, currentIndex, answers, currentField]);

  const handleSelectOption = (option: string) => {
    if (!currentField) return;

    if (currentField.type === 'checkbox') {
      const currentArr: string[] = answers[currentField.id] || [];
      const updated = currentArr.includes(option)
        ? currentArr.filter((item) => item !== option)
        : [...currentArr, option];
      setAnswers((prev) => ({ ...prev, [currentField.id]: updated }));
      setErrorText(null);
    } else {
      setAnswers((prev) => ({ ...prev, [currentField.id]: option }));
      setErrorText(null);
      // Automatically advance on single-choice after brief feedback delay
      setTimeout(() => {
        advanceOrSubmit({ ...answers, [currentField.id]: option });
      }, 240);
    }
  };

  const validateCurrent = (): boolean => {
    if (!currentField) return true;
    const val = answers[currentField.id];

    if (currentField.required) {
      if (val === undefined || val === null || val === '') {
        setErrorText('This question requires an answer before continuing.');
        return false;
      }
      if (Array.isArray(val) && val.length === 0) {
        setErrorText('Please select at least one option.');
        return false;
      }
    }

    if (currentField.type === 'email' && val) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(val))) {
        setErrorText('Please enter a valid email address.');
        return false;
      }
    }

    setErrorText(null);
    return true;
  };

  const advanceOrSubmit = (latestAnswers = answers) => {
    // Check if current question triggers jump_to_step
    if (currentField) {
      const jumpRule = form.logicRules.find(
        (r) => r.sourceFieldId === currentField.id && r.action === 'jump_to_step' && r.targetStep
      );
      if (jumpRule) {
        const srcVal = latestAnswers[currentField.id];
        let matches = false;
        if (jumpRule.condition === 'equals') {
          matches = String(srcVal ?? '').toLowerCase() === String(jumpRule.value).toLowerCase();
        } else if (jumpRule.condition === 'not_equals') {
          matches = String(srcVal ?? '').toLowerCase() !== String(jumpRule.value).toLowerCase();
        } else if (jumpRule.condition === 'contains') {
          matches = String(srcVal || '').toLowerCase().includes(jumpRule.value.toLowerCase());
        }
        if (matches && jumpRule.targetStep) {
          const targetIdx = visibleFields.findIndex((f) => (f.step || 1) >= jumpRule.targetStep!);
          if (targetIdx > currentIndex) {
            setCurrentIndex(targetIdx);
            setErrorText(null);
            return;
          }
        }
      }
    }

    if (currentIndex < visibleFields.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setErrorText(null);
    } else {
      submitForm(latestAnswers);
    }
  };

  const handleNext = () => {
    if (validateCurrent()) {
      advanceOrSubmit();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setErrorText(null);
    }
  };

  const submitForm = (finalAnswers = answers) => {
    setIsSubmitted(true);
    const duration = Math.max(5, Math.round((Date.now() - startTime) / 1000));

    let totalScore = 0;
    let maxScore = 0;

    if (form.settings.isQuizMode) {
      for (const field of form.fields) {
        if (field.points && field.correctAnswer) {
          maxScore += field.points;
          if (String(finalAnswers[field.id]) === String(field.correctAnswer)) {
            totalScore += field.points;
          }
        }
      }
    }

    // Trigger celebration confetti
    if (form.theme.enableConfetti !== false) {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: [form.theme.primaryColor || '#09090b', '#10b981', '#6366f1', '#f59e0b'],
        });
      } catch {
        // safe fallback if canvas is restricted
      }
    }

    onSubmit(finalAnswers, duration, form.settings.isQuizMode ? totalScore : undefined, form.settings.isQuizMode ? maxScore : undefined);
  };

  const handleRestart = () => {
    setAnswers({});
    setCurrentIndex(0);
    setIsSubmitted(false);
    setHasStarted(!form.welcomeScreen?.enabled);
    setErrorText(null);
  };

  // Font family helper
  const fontFamilyClass = {
    'DM Sans': 'font-sans',
    'Plus Jakarta Sans': 'font-display',
    'Outfit': 'font-display',
    'Playfair Display': 'font-serif',
    'JetBrains Mono': 'font-mono',
    'Inter': 'font-sans',
    'Bricolage Grotesque': 'font-display',
  }[form.theme.fontFamily] || 'font-sans';

  // Corner radius helper
  const roundedClass = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-xl',
    full: 'rounded-full',
  }[form.theme.borderRadius] || 'rounded-lg';

  // Background style helper
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

  // Button style helper
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

  // WELCOME SCREEN
  if (!hasStarted && form.welcomeScreen?.enabled) {
    return (
      <div
        className={`min-h-[520px] flex flex-col justify-center items-center text-center p-6 sm:p-12 ${fontFamilyClass}`}
        style={{
          ...getBackgroundStyleObj(),
          color: form.theme.textColor,
        }}
      >
        <div className="max-w-xl mx-auto space-y-6">
          {form.welcomeScreen.coverImage && (
            <div className="w-full h-44 sm:h-56 rounded-xl overflow-hidden mb-6 border border-neutral-200/50 shadow-sm">
              <img
                src={form.welcomeScreen.coverImage}
                alt={form.welcomeScreen.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="space-y-3">
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">
              {form.welcomeScreen.title}
            </h1>
            <p className="text-sm sm:text-base opacity-75 max-w-md mx-auto leading-relaxed">
              {form.welcomeScreen.subtitle}
            </p>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => setHasStarted(true)}
              style={{ backgroundColor: form.theme.primaryColor }}
              className={`px-6 py-3 text-sm font-semibold text-white hover:opacity-90 active:scale-98 transition-all flex items-center gap-2 ${getButtonClass()}`}
            >
              <span>{form.welcomeScreen.buttonText || 'Start Now'}</span>
              <CornerDownLeft className="w-4 h-4 opacity-75" />
            </button>
            <span className="text-xs opacity-60">
              Press <kbd className="px-1.5 py-0.5 rounded border border-current text-[10px]">Enter ↵</kbd> to begin
            </span>
          </div>
        </div>
      </div>
    );
  }

  // THANK YOU SCREEN
  if (isSubmitted) {
    let quizScore = 0;
    let quizMax = 0;
    if (form.settings.isQuizMode) {
      for (const field of form.fields) {
        if (field.points && field.correctAnswer) {
          quizMax += field.points;
          if (String(answers[field.id]) === String(field.correctAnswer)) {
            quizScore += field.points;
          }
        }
      }
    }

    return (
      <div
        className={`min-h-[500px] flex flex-col justify-center items-center text-center p-6 sm:p-12 ${fontFamilyClass}`}
        style={{
          ...getBackgroundStyleObj(),
          color: form.theme.textColor,
        }}
      >
        <div className="max-w-lg mx-auto space-y-6">
          <div
            className="w-16 h-16 rounded-full mx-auto flex items-center justify-center shadow-sm"
            style={{ backgroundColor: `${form.theme.primaryColor}15`, color: form.theme.primaryColor }}
          >
            <Check className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {form.thankYouScreen.title || 'Response Submitted'}
            </h2>
            <p className="text-sm sm:text-base opacity-75 leading-relaxed">
              {form.thankYouScreen.message || 'Thank you for taking the time to share your perspective.'}
            </p>
          </div>

          {form.settings.isQuizMode && (
            <div
              className={`p-5 rounded-xl border text-left space-y-3 ${roundedClass}`}
              style={{
                backgroundColor: form.theme.surfaceColor,
                borderColor: `${form.theme.primaryColor}30`,
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider font-semibold opacity-70">Quiz Results</span>
                <span className="text-lg font-bold tabular-nums">
                  {quizScore} / {quizMax} pts ({quizMax > 0 ? Math.round((quizScore / quizMax) * 100) : 100}%)
                </span>
              </div>
              <div className="w-full bg-neutral-200 h-2 rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${quizMax > 0 ? Math.round((quizScore / quizMax) * 100) : 100}%`,
                    backgroundColor: form.theme.primaryColor,
                  }}
                />
              </div>
            </div>
          )}

          <div className="pt-4 flex items-center justify-center gap-3">
            {form.thankYouScreen.showRestartButton && (
              <button
                onClick={handleRestart}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-neutral-300 hover:bg-neutral-100/50 transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Submit Another Response</span>
              </button>
            )}

            {form.thankYouScreen.redirectUrl && (
              <a
                href={form.thankYouScreen.redirectUrl}
                target="_blank"
                rel="noreferrer"
                style={{ backgroundColor: form.theme.primaryColor }}
                className={`px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 ${getButtonClass()}`}
              >
                Continue
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ACTIVE QUESTION RUNNER
  if (!currentField) {
    return (
      <div className="p-8 text-center text-sm text-neutral-500">
        No active questions found in this form.
      </div>
    );
  }

  return (
    <div
      className={`relative min-h-[560px] flex flex-col justify-between p-6 sm:p-12 ${fontFamilyClass}`}
      style={{
        ...getBackgroundStyleObj(),
        color: form.theme.textColor,
      }}
    >
      {/* Top Header & Progress */}
      <div className="w-full max-w-2xl mx-auto flex items-center justify-between gap-4 text-xs opacity-75 pb-4">
        <div className="flex items-center gap-2 font-medium">
          <span className="font-semibold" style={{ color: form.theme.primaryColor }}>
            {currentIndex + 1}
          </span>
          <span aria-hidden="true">/</span>
          <span>{visibleFields.length}</span>
          <span aria-hidden="true">·</span>
          <span>{form.title}</span>
        </div>

        <div className="flex items-center gap-2 w-32 sm:w-44">
          <div className="w-full h-1.5 rounded-full bg-neutral-200 overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${progressPercent}%`,
                backgroundColor: form.theme.primaryColor,
              }}
            />
          </div>
          <span className="tabular-nums font-mono text-[11px] shrink-0">{progressPercent}%</span>
        </div>
      </div>

      {/* Main Question Body */}
      <div key={currentField.id} className={`w-full max-w-2xl mx-auto my-auto py-8 space-y-6 ${getAnimationClass()}`}>
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span
              className="text-sm font-semibold opacity-60 font-mono"
              style={{ color: form.theme.primaryColor }}
            >
              {currentIndex + 1} →
            </span>
            <label className="text-xl sm:text-2xl font-bold tracking-tight block">
              {currentField.label}
              {currentField.required && (
                <span className="text-rose-500 ml-1" title="Required question">
                  *
                </span>
              )}
            </label>
          </div>

          {currentField.helpText && (
            <p className="text-xs sm:text-sm opacity-70 ml-6">{currentField.helpText}</p>
          )}
        </div>

        {/* Input Rendering based on Field Type */}
        <div className="ml-0 sm:ml-6 pt-2">
          {/* Text, Email, Phone, Number, URL */}
          {(currentField.type === 'text' ||
            currentField.type === 'email' ||
            currentField.type === 'phone' ||
            currentField.type === 'number' ||
            currentField.type === 'url' ||
            currentField.type === 'date') && (
            <div className="space-y-3">
              <input
                ref={inputRef as any}
                type={currentField.type === 'number' ? 'number' : currentField.type === 'date' ? 'date' : 'text'}
                value={answers[currentField.id] || ''}
                placeholder={currentField.placeholder || 'Type your answer here...'}
                onChange={(e) => {
                  setAnswers({ ...answers, [currentField.id]: e.target.value });
                  setErrorText(null);
                }}
                className={`w-full px-4 py-3 text-base sm:text-lg border-b-2 bg-transparent focus:outline-none transition-colors placeholder:text-neutral-400`}
                style={{
                  borderBottomColor: answers[currentField.id] ? form.theme.primaryColor : '#cbd5e1',
                }}
              />
            </div>
          )}

          {/* Textarea */}
          {currentField.type === 'textarea' && (
            <div className="space-y-3">
              <textarea
                ref={inputRef as any}
                rows={4}
                value={answers[currentField.id] || ''}
                placeholder={currentField.placeholder || 'Type your detailed answer...'}
                onChange={(e) => {
                  setAnswers({ ...answers, [currentField.id]: e.target.value });
                  setErrorText(null);
                }}
                className={`w-full p-4 text-base border rounded-xl bg-white/70 backdrop-blur-xs focus:outline-none focus:ring-2 transition-all placeholder:text-neutral-400 ${roundedClass}`}
                style={{
                  borderColor: '#cbd5e1',
                }}
              />
              <p className="text-[11px] opacity-60">Shift + Enter for line break. Enter to submit.</p>
            </div>
          )}

          {/* Radio / Multiple Choice */}
          {currentField.type === 'radio' && currentField.options && (
            <div className="space-y-2.5">
              {currentField.options.map((option, optIdx) => {
                const isSelected = answers[currentField.id] === option;
                const letterKey = String.fromCharCode(65 + optIdx); // A, B, C...

                return (
                  <button
                    key={optIdx}
                    type="button"
                    onClick={() => handleSelectOption(option)}
                    className={`w-full text-left p-3.5 sm:p-4 rounded-xl border transition-all flex items-center justify-between group ${roundedClass} ${
                      isSelected
                        ? 'border-neutral-900 bg-neutral-900/5 shadow-xs'
                        : 'border-neutral-200 hover:border-neutral-400 bg-white/60'
                    }`}
                    style={isSelected ? { borderColor: form.theme.primaryColor } : {}}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-6 h-6 rounded flex items-center justify-center font-mono text-xs font-semibold border transition-colors ${
                          isSelected
                            ? 'bg-neutral-900 text-white border-neutral-900'
                            : 'bg-neutral-100 text-neutral-600 border-neutral-200 group-hover:border-neutral-400'
                        }`}
                        style={isSelected ? { backgroundColor: form.theme.primaryColor, borderColor: form.theme.primaryColor } : {}}
                      >
                        {letterKey}
                      </span>
                      <span className="text-sm sm:text-base font-medium">{option}</span>
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 shrink-0" style={{ color: form.theme.primaryColor }} />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Checkboxes / Multi-select */}
          {currentField.type === 'checkbox' && currentField.options && (
            <div className="space-y-2.5">
              {currentField.options.map((option, optIdx) => {
                const selectedArr: string[] = answers[currentField.id] || [];
                const isSelected = selectedArr.includes(option);

                return (
                  <button
                    key={optIdx}
                    type="button"
                    onClick={() => handleSelectOption(option)}
                    className={`w-full text-left p-3.5 sm:p-4 rounded-xl border transition-all flex items-center justify-between group ${roundedClass} ${
                      isSelected
                        ? 'border-neutral-900 bg-neutral-900/5 shadow-xs'
                        : 'border-neutral-200 hover:border-neutral-400 bg-white/60'
                    }`}
                    style={isSelected ? { borderColor: form.theme.primaryColor } : {}}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                          isSelected
                            ? 'bg-neutral-900 text-white border-neutral-900'
                            : 'border-neutral-300 group-hover:border-neutral-400 bg-white'
                        }`}
                        style={isSelected ? { backgroundColor: form.theme.primaryColor, borderColor: form.theme.primaryColor } : {}}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                      <span className="text-sm sm:text-base font-medium">{option}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Select Dropdown */}
          {currentField.type === 'select' && currentField.options && (
            <div className="space-y-3">
              <select
                value={answers[currentField.id] || ''}
                onChange={(e) => {
                  setAnswers({ ...answers, [currentField.id]: e.target.value });
                  setErrorText(null);
                }}
                className={`w-full p-3.5 text-base border rounded-xl bg-white/80 focus:outline-none focus:ring-2 ${roundedClass}`}
              >
                <option value="" disabled>
                  {currentField.placeholder || 'Choose an option...'}
                </option>
                {currentField.options.map((opt, i) => (
                  <option key={i} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Rating (1 - 5 stars) */}
          {currentField.type === 'rating' && (
            <div className="flex items-center gap-2 pt-2">
              {[1, 2, 3, 4, 5].map((starVal) => {
                const currentRating = Number(answers[currentField.id] || 0);
                const isFilled = starVal <= currentRating;

                return (
                  <button
                    key={starVal}
                    type="button"
                    onClick={() => {
                      setAnswers({ ...answers, [currentField.id]: String(starVal) });
                      setErrorText(null);
                      setTimeout(() => advanceOrSubmit({ ...answers, [currentField.id]: String(starVal) }), 200);
                    }}
                    className="p-2 sm:p-3 rounded-lg hover:scale-110 active:scale-95 transition-all text-neutral-300 hover:text-amber-400"
                    style={isFilled ? { color: '#f59e0b' } : {}}
                  >
                    <Star className="w-8 h-8 sm:w-10 sm:h-10 fill-current" />
                  </button>
                );
              })}
            </div>
          )}

          {/* NPS Scale (0 - 10) */}
          {currentField.type === 'scale' && (
            <div className="space-y-3">
              <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5 sm:gap-2">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                  const isSelected = String(answers[currentField.id]) === String(num);

                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        setAnswers({ ...answers, [currentField.id]: String(num) });
                        setErrorText(null);
                        setTimeout(() => advanceOrSubmit({ ...answers, [currentField.id]: String(num) }), 220);
                      }}
                      className={`h-11 sm:h-13 rounded-lg border font-mono text-sm sm:text-base font-semibold transition-all ${
                        isSelected
                          ? 'text-white shadow-xs'
                          : 'border-neutral-200 hover:border-neutral-400 bg-white/70 text-neutral-800'
                      }`}
                      style={isSelected ? { backgroundColor: form.theme.primaryColor, borderColor: form.theme.primaryColor } : {}}
                    >
                      {num}
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-between text-[11px] opacity-60 font-medium px-1">
                <span>0 · Not at all likely</span>
                <span>10 · Extremely likely</span>
              </div>
            </div>
          )}

          {/* Statement Block */}
          {currentField.type === 'statement' && (
            <div className="p-4 rounded-xl bg-neutral-100/60 border border-neutral-200/80 text-sm opacity-80">
              Read carefully and proceed to the next section when ready.
            </div>
          )}

          {/* Error Message */}
          {errorText && (
            <p className="text-xs text-rose-600 font-medium pt-2 animate-shake">
              {errorText}
            </p>
          )}

          {/* Action Button: OK / Submit */}
          <div className="pt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={handleNext}
              style={{ backgroundColor: form.theme.primaryColor }}
              className={`px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:opacity-90 active:scale-98 transition-all flex items-center gap-2 ${getButtonClass()}`}
            >
              <span>{currentIndex === visibleFields.length - 1 ? (form.settings.submitButtonText || 'Submit') : 'OK'}</span>
              <CornerDownLeft className="w-3.5 h-3.5 opacity-80" />
            </button>

            <span className="text-[11px] opacity-60 hidden sm:inline">
              press <kbd className="px-1.5 py-0.5 rounded border border-current text-[10px]">Enter ↵</kbd>
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Navigation Arrows */}
      <div className="w-full max-w-2xl mx-auto flex items-center justify-between pt-4 border-t border-neutral-200/50">
        <span className="text-xs opacity-50 font-display">
          Powered by AuraForm Engine
        </span>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="p-1.5 rounded border border-neutral-300 disabled:opacity-30 hover:bg-neutral-100 transition-colors"
            title="Previous question"
            aria-label="Previous question"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            onClick={handleNext}
            disabled={currentIndex === visibleFields.length - 1}
            className="p-1.5 rounded border border-neutral-300 disabled:opacity-30 hover:bg-neutral-100 transition-colors"
            title="Next question"
            aria-label="Next question"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
