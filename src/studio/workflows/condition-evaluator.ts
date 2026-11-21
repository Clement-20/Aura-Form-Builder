/**
 * Workflow Condition Evaluator (Reuses Phase 2 Condition Operator Registry & Piping)
 *
 * Intentionally avoids building a competing rule engine:
 *  - All operator evaluation delegates directly to `conditionOperatorRegistry`
 *    from `src/studio/logic/registries.ts`.
 *  - Dynamic text templating delegates directly to `resolvePipedText`
 *    from `src/studio/engines/piping-engine.ts`.
 */

import type { LogicDataType } from '../logic/types';
import { conditionOperatorRegistry } from '../logic/registries';
import { resolvePipedText } from '../engines/piping-engine';
import type {
  WorkflowConditionClause,
  WorkflowConditionGroup,
  WorkflowSubmissionEventInput,
} from './types';

export interface WorkflowConditionEvalResult {
  matched: boolean;
  summary: string;
  clauseResults: Array<{
    clauseId: string;
    passed: boolean;
    description: string;
  }>;
}

function inferFieldDataType(fieldType?: string): LogicDataType {
  switch (fieldType) {
    case 'number':
    case 'rating':
    case 'scale':
      return 'number';
    case 'radio':
    case 'select':
    case 'checkbox':
      return 'selection';
    case 'yes_no':
      return 'boolean';
    case 'date':
      return 'date';
    default:
      return 'text';
  }
}

function resolveClauseActual(
  clause: WorkflowConditionClause,
  event: WorkflowSubmissionEventInput
): { actualValue: unknown; dataType: LogicDataType; label: string } {
  if (clause.sourceType === 'score') {
    return {
      actualValue: event.score ?? 0,
      dataType: 'number',
      label: 'Total Score',
    };
  }
  if (clause.sourceType === 'score_percent') {
    return {
      actualValue: event.scorePercent ?? 0,
      dataType: 'number',
      label: 'Score %',
    };
  }
  if (clause.sourceType === 'outcome') {
    return {
      actualValue: event.outcomeName || event.outcomeId || '',
      dataType: 'text',
      label: 'Outcome',
    };
  }
  if (clause.sourceType === 'variable') {
    const vars = event.variables || {};
    const val = vars[clause.sourceId];
    const dataType: LogicDataType =
      typeof val === 'number'
        ? 'number'
        : typeof val === 'boolean'
          ? 'boolean'
          : Array.isArray(val)
            ? 'selection'
            : 'text';
    return {
      actualValue: val,
      dataType,
      label: `Variable(${clause.sourceId})`,
    };
  }

  // Default: component / form field answer
  const catalogMatch = (event.fieldCatalog || []).find(
    (f) => f.id === clause.sourceId || f.label.toLowerCase() === clause.sourceId.toLowerCase()
  );
  const actualValue =
    event.answers[clause.sourceId] !== undefined
      ? event.answers[clause.sourceId]
      : catalogMatch
        ? event.answers[catalogMatch.id]
        : undefined;

  return {
    actualValue,
    dataType: inferFieldDataType(catalogMatch?.type),
    label: catalogMatch?.label || clause.sourceId || 'Field',
  };
}

/**
 * Deterministically evaluates a WorkflowConditionGroup (AND / OR nested groups)
 * using the Phase 2 conditionOperatorRegistry.
 */
export function evaluateWorkflowConditionGroup(
  group: WorkflowConditionGroup | undefined,
  event: WorkflowSubmissionEventInput
): WorkflowConditionEvalResult {
  if (!group || !Array.isArray(group.items) || group.items.length === 0) {
    return {
      matched: false,
      summary: 'No conditions configured (evaluated false).',
      clauseResults: [],
    };
  }

  const clauseResults: WorkflowConditionEvalResult['clauseResults'] = [];
  const childOutcomes: boolean[] = [];
  const childSummaries: string[] = [];

  for (const item of group.items) {
    if (item.kind === 'group') {
      const sub = evaluateWorkflowConditionGroup(item, event);
      childOutcomes.push(sub.matched);
      childSummaries.push(`(${sub.summary})`);
      clauseResults.push(...sub.clauseResults);
      continue;
    }

    const opDef = conditionOperatorRegistry.get(item.operator);
    const { actualValue, dataType, label } = resolveClauseActual(item, event);
    const passed = opDef
      ? opDef.evaluate(actualValue, item.value ?? '', item.secondaryValue, dataType)
      : false;

    const opLabel = opDef?.shortLabel || item.operator;
    const expectedText =
      opDef?.valueArity === 0
        ? ''
        : opDef?.valueArity === 2
          ? ` "${item.value}"–"${item.secondaryValue ?? ''}"`
          : ` "${item.value}"`;
    const actualDisplay =
      actualValue === undefined || actualValue === null
        ? 'empty'
        : Array.isArray(actualValue)
          ? actualValue.join(', ')
          : String(actualValue);

    const desc = `${label} (${actualDisplay}) ${opLabel}${expectedText} → ${passed ? 'true' : 'false'}`;
    childOutcomes.push(passed);
    childSummaries.push(desc);
    clauseResults.push({
      clauseId: item.id,
      passed,
      description: desc,
    });
  }

  const matched =
    group.combinator === 'OR'
      ? childOutcomes.some(Boolean)
      : childOutcomes.every(Boolean);

  return {
    matched,
    summary: `${group.combinator}: ${childSummaries.join(group.combinator === 'OR' ? ' OR ' : ' AND ')}`,
    clauseResults,
  };
}

/**
 * Resolves `{{field_id}}`, `{{field_slug}}`, `{{variable}}`, `{{score}}`,
 * `{{outcome}}`, and `{{form_title}}` placeholders using Phase 2's piping engine.
 */
export function resolveWorkflowTemplate(
  template: string | undefined | null,
  event: WorkflowSubmissionEventInput
): string {
  if (!template) return '';

  // Build friendly slug map for answers so {{first_name}} works even without a FormDocument
  const enrichedAnswers: Record<string, unknown> = { ...(event.answers || {}) };
  for (const field of event.fieldCatalog || []) {
    const slug = field.label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (slug && enrichedAnswers[slug] === undefined && event.answers[field.id] !== undefined) {
      enrichedAnswers[slug] = event.answers[field.id];
    }
  }

  const enrichedVariables: Record<string, unknown> = {
    ...(event.variables || {}),
    form_title: event.formTitle,
    form_id: event.formId,
    submission_id: event.submissionId,
    submitted_at: event.submittedAt,
    ...(typeof event.score === 'number' ? { score: event.score } : {}),
    ...(typeof event.maxScore === 'number' ? { max_score: event.maxScore } : {}),
    ...(typeof event.scorePercent === 'number' ? { score_percent: event.scorePercent } : {}),
    ...(event.outcomeName ? { outcome: event.outcomeName } : event.outcomeId ? { outcome: event.outcomeId } : {}),
  };

  return resolvePipedText(template, {
    answers: enrichedAnswers,
    variables: enrichedVariables,
    formattedVariables: event.formattedVariables,
  });
}
