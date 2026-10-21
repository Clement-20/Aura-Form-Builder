import React, { useState } from 'react';
import { FormSchema, FormSubmission } from '../../types/form';
import { ConversationalRunner } from './ConversationalRunner';
import { SteppedRunner } from './SteppedRunner';
import { StandardRunner } from './StandardRunner';
import { saveSubmission } from '../../lib/storage';

interface FormRunnerProps {
  form: FormSchema;
  onSubmitted?: (submission: FormSubmission) => void;
  isInteractivePreview?: boolean;
}

export const FormRunner: React.FC<FormRunnerProps> = ({
  form,
  onSubmitted,
  isInteractivePreview = false,
}) => {
  const [lastSubmission, setLastSubmission] = useState<FormSubmission | null>(null);

  const handleSubmit = (
    answers: Record<string, any>,
    durationSeconds: number,
    score?: number,
    maxScore?: number
  ) => {
    const submission: FormSubmission = {
      id: 'sub_' + Math.random().toString(36).substring(2, 9),
      formId: form.id,
      submittedAt: new Date().toISOString(),
      answers,
      durationSeconds,
      isComplete: true,
      score,
      maxScore,
      deviceInfo: `${navigator.platform || 'Desktop'} · ${navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop'}`,
    };

    saveSubmission(submission);
    setLastSubmission(submission);
    if (onSubmitted) {
      onSubmitted(submission);
    }
  };

  // Select appropriate runner
  if (form.layoutMode === 'conversational') {
    return (
      <ConversationalRunner
        form={form}
        onSubmit={handleSubmit}
        isInteractivePreview={isInteractivePreview}
      />
    );
  }

  if (form.layoutMode === 'stepped') {
    return <SteppedRunner form={form} onSubmit={handleSubmit} />;
  }

  return <StandardRunner form={form} onSubmit={handleSubmit} />;
};
