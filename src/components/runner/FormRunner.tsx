import React, { useMemo, useState } from 'react';
import { FormSchema, FormSubmission } from '../../types/form';
import { saveSubmission } from '../../lib/storage';
import {
  FormDocumentRenderer,
  FormSubmitMetadata,
  migrateLegacyFormToDocument,
  validateAndSanitizeSubmission,
  ViewportMode,
} from '../../studio';

interface FormRunnerProps {
  form: FormSchema;
  onSubmitted?: (submission: FormSubmission) => void;
  isInteractivePreview?: boolean;
  viewportOverride?: ViewportMode;
}

export const FormRunner: React.FC<FormRunnerProps> = ({
  form,
  onSubmitted,
  isInteractivePreview = false,
  viewportOverride,
}) => {
  const [, setLastSubmission] = useState<FormSubmission | null>(null);

  // Migrate and safely repair any legacy v1 or v2 form into a validated FormDocument
  const document = useMemo(() => migrateLegacyFormToDocument(form), [form]);

  const handleSubmit = async (
    answers: Record<string, any>,
    durationSeconds: number,
    score?: number,
    maxScore?: number,
    meta?: FormSubmitMetadata
  ) => {
    // Preview mode must NEVER persist real responses
    if (isInteractivePreview) return;

    const rawAnswers = meta?.rawAnswers ?? answers;
    let verifiedAnswers = answers;
    let verifiedVariables: Record<string, unknown> | undefined;
    let verifiedFormattedVariables: Record<string, string> | undefined;
    let verifiedScore = score;
    let verifiedMaxScore = maxScore;
    let verifiedScorePercent = meta?.scorePercent;
    let verifiedCategoryScores = meta?.categoryScores;
    let verifiedOutcomeId = meta?.outcomeId;
    let verifiedOutcomeName = meta?.outcomeName;

    try {
      const response = await fetch('/api/submissions/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form: document,
          answers: rawAnswers,
          endedEarly: meta?.endedEarly,
          endedOnPageId: meta?.endedOnPageId,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data?.valid && data.sanitizedAnswers) {
          verifiedAnswers = data.sanitizedAnswers;
          verifiedVariables = data.resolvedVariables;
          verifiedFormattedVariables = data.formattedVariables;
          verifiedScore = data.score;
          verifiedMaxScore = data.maxScore;
          verifiedScorePercent = data.scorePercent;
          verifiedCategoryScores = data.categoryScores;
          verifiedOutcomeId = data.outcomeId;
          verifiedOutcomeName = data.outcomeName;
        }
      } else if (response.status === 422) {
        // Server rejected invalid submission payload; do not persist tampered data
        return;
      }
    } catch {
      // Offline / static-host fallback: run the exact same deterministic validator locally
      const localResult = validateAndSanitizeSubmission(document, rawAnswers, {
        endedEarly: meta?.endedEarly,
        endedOnPageId: meta?.endedOnPageId,
      });
      if (!localResult.valid) return;
      verifiedAnswers = localResult.sanitizedAnswers;
      verifiedVariables = localResult.resolvedVariables;
      verifiedFormattedVariables = localResult.formattedVariables;
      verifiedScore = localResult.score;
      verifiedMaxScore = localResult.maxScore;
      verifiedScorePercent = localResult.scorePercent;
      verifiedCategoryScores = localResult.categoryScores;
      verifiedOutcomeId = localResult.outcomeId;
      verifiedOutcomeName = localResult.outcomeName;
    }

    const submission: FormSubmission = {
      id: 'sub_' + Math.random().toString(36).substring(2, 9),
      formId: document.id,
      submittedAt: new Date().toISOString(),
      answers: verifiedAnswers,
      resolvedVariables: verifiedVariables,
      formattedVariables: verifiedFormattedVariables,
      durationSeconds,
      isComplete: true,
      score: verifiedScore,
      maxScore: verifiedMaxScore,
      scorePercent: verifiedScorePercent,
      categoryScores: verifiedCategoryScores,
      outcomeId: verifiedOutcomeId,
      outcomeName: verifiedOutcomeName,
      deviceInfo: `${navigator.platform || 'Desktop'} · ${
        navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop'
      }`,
    };

    saveSubmission(submission);
    setLastSubmission(submission);
    if (onSubmitted) {
      onSubmitted(submission);
    }
  };

  // Unified Rendering Engine powers Standard, Stepped, and Conversational modes identically
  return (
    <FormDocumentRenderer
      source={document}
      onSubmit={handleSubmit}
      isPreview={isInteractivePreview}
      viewportOverride={viewportOverride}
    />
  );
};
