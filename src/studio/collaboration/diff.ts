/**
 * Deterministic Form Version Diff & Comparison Engine
 *
 * Compares any two saved FormSchema snapshots (or a conflicting local draft vs server draft)
 * to produce structured, human-readable change summaries without exposing respondent data.
 */

import type { FormField, FormSchema } from '../../types/form';
import type { FormVersionComparison, FormVersionDiffEntry } from './types';

function stableJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return '';
  }
}

function summarizeFieldChanges(prev: FormField, next: FormField): string[] {
  const diffs: string[] = [];
  if (prev.label !== next.label) {
    diffs.push(`label "${prev.label}" -> "${next.label}"`);
  }
  if (prev.type !== next.type) {
    diffs.push(`type ${prev.type} -> ${next.type}`);
  }
  if (Boolean(prev.required) !== Boolean(next.required)) {
    diffs.push(next.required ? 'marked required' : 'marked optional');
  }
  if ((prev.placeholder || '') !== (next.placeholder || '')) {
    diffs.push('placeholder updated');
  }
  if ((prev.helpText || '') !== (next.helpText || '')) {
    diffs.push('help text updated');
  }
  if (stableJson(prev.options) !== stableJson(next.options)) {
    diffs.push('options updated');
  }
  if ((prev.step || 1) !== (next.step || 1)) {
    diffs.push(`moved to step ${next.step || 1}`);
  }
  return diffs;
}

export function computeFormVersionDiff(
  fromForm: FormSchema,
  toForm: FormSchema,
  fromVersion: number,
  toVersion: number
): FormVersionComparison {
  const entries: FormVersionDiffEntry[] = [];

  if ((fromForm.title || '') !== (toForm.title || '')) {
    entries.push({
      category: 'meta',
      changeType: 'modified',
      label: 'Form title',
      detail: `"${fromForm.title || 'Untitled'}" -> "${toForm.title || 'Untitled'}"`,
    });
  }

  if ((fromForm.description || '') !== (toForm.description || '')) {
    entries.push({
      category: 'meta',
      changeType: 'modified',
      label: 'Form description',
      detail: 'Updated form description text',
    });
  }

  if (fromForm.layoutMode !== toForm.layoutMode) {
    entries.push({
      category: 'meta',
      changeType: 'modified',
      label: 'Layout mode',
      detail: `${fromForm.layoutMode} -> ${toForm.layoutMode}`,
    });
  }

  // Compare fields by stable ID
  const prevFields = Array.isArray(fromForm.fields) ? fromForm.fields : [];
  const nextFields = Array.isArray(toForm.fields) ? toForm.fields : [];
  const prevMap = new Map(prevFields.map((f) => [f.id, f]));
  const nextMap = new Map(nextFields.map((f) => [f.id, f]));

  for (const field of nextFields) {
    const prev = prevMap.get(field.id);
    if (!prev) {
      entries.push({
        category: 'field',
        changeType: 'added',
        targetId: field.id,
        label: field.label || 'Untitled question',
        detail: `Added ${field.type} question`,
      });
    } else {
      const changes = summarizeFieldChanges(prev, field);
      if (changes.length > 0) {
        entries.push({
          category: 'field',
          changeType: 'modified',
          targetId: field.id,
          label: field.label || prev.label || 'Untitled question',
          detail: changes.join(', '),
        });
      }
    }
  }

  for (const prev of prevFields) {
    if (!nextMap.has(prev.id)) {
      entries.push({
        category: 'field',
        changeType: 'removed',
        targetId: prev.id,
        label: prev.label || 'Untitled question',
        detail: `Removed ${prev.type} question`,
      });
    }
  }

  // Check field reordering if same IDs exist
  const commonPrev = prevFields.filter((f) => nextMap.has(f.id)).map((f) => f.id);
  const commonNext = nextFields.filter((f) => prevMap.has(f.id)).map((f) => f.id);
  if (commonPrev.length > 1 && stableJson(commonPrev) !== stableJson(commonNext)) {
    entries.push({
      category: 'field',
      changeType: 'modified',
      label: 'Question order',
      detail: 'Reordered questions across form',
    });
  }

  // Logic rules
  const prevRules = Array.isArray(fromForm.logicRules) ? fromForm.logicRules : [];
  const nextRules = Array.isArray(toForm.logicRules) ? toForm.logicRules : [];
  if (stableJson(prevRules) !== stableJson(nextRules)) {
    const delta = nextRules.length - prevRules.length;
    entries.push({
      category: 'logic',
      changeType: delta > 0 ? 'added' : delta < 0 ? 'removed' : 'modified',
      label: 'Conditional logic rules',
      detail:
        delta > 0
          ? `Added ${delta} rule${delta === 1 ? '' : 's'} (${nextRules.length} total)`
          : delta < 0
            ? `Removed ${Math.abs(delta)} rule${Math.abs(delta) === 1 ? '' : 's'} (${nextRules.length} total)`
            : `Updated conditional logic (${nextRules.length} rules)`,
    });
  }

  // Theme / design
  if (stableJson(fromForm.theme) !== stableJson(toForm.theme)) {
    entries.push({
      category: 'theme',
      changeType: 'modified',
      label: 'Theme & styling',
      detail: 'Updated form theme colors, typography, or surface styling',
    });
  }

  // Settings (excluding volatile timestamps)
  if (stableJson(fromForm.settings) !== stableJson(toForm.settings)) {
    entries.push({
      category: 'settings',
      changeType: 'modified',
      label: 'Form settings',
      detail: 'Updated form settings or studio configuration',
    });
  }

  const summary =
    entries.length === 0
      ? 'No structural differences detected'
      : entries.length === 1
        ? `${entries[0].label}: ${entries[0].detail}`
        : `${entries.length} changes (${entries
            .slice(0, 2)
            .map((e) => e.label)
            .join(', ')}${entries.length > 2 ? `, +${entries.length - 2} more` : ''})`;

  return {
    fromVersion,
    toVersion,
    summary,
    totalChanges: entries.length,
    entries,
  };
}
