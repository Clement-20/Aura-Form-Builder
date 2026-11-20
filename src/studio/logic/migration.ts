/**
 * FlexStore Form Studio — Logic Rule Migration & Factory Helpers
 *
 * Transparently upgrades legacy v1 flat LogicRule objects into v2 StudioLogicRule
 * structures and projects v2 rules back onto v1-compatible shapes for lossless
 * persistence in LocalStorage and Cloud Firestore.
 */

import { LogicAction, LogicCondition, LogicRule } from '../../types/form';
import { FormDocument } from '../document/types';
import { conditionOperatorRegistry, inferComponentDataType } from './registries';
import {
  AnyLogicRule,
  LogicActionConfig,
  LogicActionType,
  LogicConditionClause,
  LogicConditionGroup,
  LogicOperator,
  StudioLogicRule,
} from './types';

let logicIdSeq = 0;
export function createLogicId(prefix: string): string {
  logicIdSeq = (logicIdSeq + 1) % 10000;
  return `${prefix}_${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}${logicIdSeq.toString(36)}`;
}

export function isStudioLogicRule(rule: unknown): rule is StudioLogicRule {
  if (!rule || typeof rule !== 'object') return false;
  const candidate = rule as Partial<StudioLogicRule>;
  return (
    candidate.schemaVersion === 2 &&
    Boolean(candidate.conditionGroup) &&
    Array.isArray(candidate.actions)
  );
}

function mapLegacyActionToStudio(rule: LogicRule, doc?: FormDocument): LogicActionConfig {
  const id = createLogicId('act');
  switch (rule.action) {
    case 'show':
      return { id, type: 'show_component', targetComponentId: rule.targetFieldId || '' };
    case 'hide':
      return { id, type: 'hide_component', targetComponentId: rule.targetFieldId || '' };
    case 'require':
      return { id, type: 'require_component', targetComponentId: rule.targetFieldId || '' };
    case 'jump_to_step': {
      const targetPage =
        doc && typeof rule.targetStep === 'number'
          ? doc.pages[rule.targetStep - 1]
          : undefined;
      return {
        id,
        type: 'navigate_to_page',
        targetPageId: targetPage?.id || (rule.targetStep ? `step_${rule.targetStep}` : ''),
      };
    }
    default:
      return { id, type: 'show_component', targetComponentId: rule.targetFieldId || '' };
  }
}

function mapStudioOperatorToLegacy(op: LogicOperator): LogicCondition {
  switch (op) {
    case 'equals':
    case 'is_selected':
    case 'is_true':
      return 'equals';
    case 'not_equals':
    case 'is_not_selected':
    case 'is_false':
      return 'not_equals';
    case 'contains':
    case 'contains_option':
    case 'starts_with':
    case 'ends_with':
      return 'contains';
    case 'not_contains':
    case 'not_contains_option':
      return 'not_contains';
    case 'greater_than':
    case 'greater_than_or_equal':
    case 'after':
    case 'is_in_future':
      return 'greater_than';
    case 'less_than':
    case 'less_than_or_equal':
    case 'before':
    case 'is_in_past':
      return 'less_than';
    case 'is_empty':
      return 'is_empty';
    case 'is_not_empty':
      return 'is_not_empty';
    default:
      return 'equals';
  }
}

function mapStudioActionToLegacy(action?: LogicActionConfig, doc?: FormDocument): {
  action: LogicAction;
  targetFieldId?: string;
  targetStep?: number;
} {
  if (!action) return { action: 'show', targetFieldId: '' };
  switch (action.type) {
    case 'show_component':
      return { action: 'show', targetFieldId: action.targetComponentId || '' };
    case 'hide_component':
      return { action: 'hide', targetFieldId: action.targetComponentId || '' };
    case 'require_component':
      return { action: 'require', targetFieldId: action.targetComponentId || '' };
    case 'navigate_to_page': {
      const pageIdx = doc?.pages.findIndex((p) => p.id === action.targetPageId) ?? -1;
      return {
        action: 'jump_to_step',
        targetStep: pageIdx >= 0 ? pageIdx + 1 : 1,
      };
    }
    default:
      return { action: 'show', targetFieldId: action.targetComponentId || '' };
  }
}

function findFirstClause(group: LogicConditionGroup): LogicConditionClause | undefined {
  for (const item of group.items) {
    if (item.kind === 'condition') return item;
    const nested = findFirstClause(item);
    if (nested) return nested;
  }
  return undefined;
}

/**
 * Normalizes any v1 LogicRule or v2 StudioLogicRule into a guaranteed complete StudioLogicRule.
 */
export function normalizeLogicRule(
  rule: AnyLogicRule,
  doc?: FormDocument,
  fallbackIndex = 0
): StudioLogicRule {
  if (isStudioLogicRule(rule)) {
    return {
      ...rule,
      schemaVersion: 2,
      id: rule.id || createLogicId('rule'),
      name: rule.name || rule.title || `Rule ${fallbackIndex + 1}`,
      enabled: rule.enabled !== false,
      priority: typeof rule.priority === 'number' ? rule.priority : (fallbackIndex + 1) * 10,
      trigger: rule.trigger || 'on_change',
      conditionGroup: cloneConditionGroup(rule.conditionGroup),
      actions: rule.actions.map((a) => ({
        ...a,
        targetPageIds: Array.isArray(a.targetPageIds) ? [...a.targetPageIds] : undefined,
      })),
      elseActions: Array.isArray(rule.elseActions)
        ? rule.elseActions.map((a) => ({
            ...a,
            targetPageIds: Array.isArray(a.targetPageIds) ? [...a.targetPageIds] : undefined,
          }))
        : [],
      execution: {
        elseBehavior: rule.execution?.elseBehavior || 'revert',
        stopOnMatch: Boolean(rule.execution?.stopOnMatch),
      },
    };
  }

  const clause: LogicConditionClause = {
    kind: 'condition',
    id: createLogicId('cond'),
    sourceType: 'component',
    sourceId: rule.sourceFieldId || '',
    operator: (rule.condition as LogicOperator) || 'equals',
    value: rule.value ?? '',
  };

  const action = mapLegacyActionToStudio(rule, doc);

  return {
    ...rule,
    schemaVersion: 2,
    id: rule.id || createLogicId('rule'),
    name: rule.title || `Rule ${fallbackIndex + 1}`,
    enabled: true,
    priority: (fallbackIndex + 1) * 10,
    trigger: 'on_change',
    conditionGroup: {
      kind: 'group',
      id: createLogicId('grp'),
      combinator: 'AND',
      items: [clause],
    },
    actions: [action],
    elseActions: [],
    execution: {
      elseBehavior: 'revert',
      stopOnMatch: false,
    },
  };
}

/**
 * Projects a StudioLogicRule onto a v1-compatible LogicRule object that still carries
 * the full structured v2 payload losslessly for Firestore & LocalStorage persistence.
 */
export function serializeStudioLogicRule(
  rule: AnyLogicRule,
  doc?: FormDocument,
  index = 0
): StudioLogicRule {
  const normalized = normalizeLogicRule(rule, doc, index);
  const firstClause = findFirstClause(normalized.conditionGroup);
  const firstAction = normalized.actions[0];
  const legacyAction = mapStudioActionToLegacy(firstAction, doc);

  return {
    ...normalized,
    title: normalized.name,
    sourceFieldId: firstClause?.sourceId || '',
    condition: firstClause ? mapStudioOperatorToLegacy(firstClause.operator) : 'equals',
    value: firstClause?.value ?? '',
    action: legacyAction.action,
    targetFieldId: legacyAction.targetFieldId,
    targetStep: legacyAction.targetStep,
  };
}

export function cloneConditionGroup(group: LogicConditionGroup): LogicConditionGroup {
  return {
    kind: 'group',
    id: group.id || createLogicId('grp'),
    combinator: group.combinator === 'OR' ? 'OR' : 'AND',
    items: Array.isArray(group.items)
      ? group.items.map((item) =>
          item.kind === 'group' ? cloneConditionGroup(item) : { ...item }
        )
      : [],
  };
}

export function createEmptyConditionClause(doc: FormDocument): LogicConditionClause {
  const components = Object.values(doc.components);
  const firstQuestion = components.find((c) => !['section', 'container', 'two_column', 'three_column', 'image_text', 'divider', 'spacer', 'heading', 'paragraph', 'rich_text', 'image', 'video', 'progress_indicator'].includes(c.type)) || components[0];
  const dataType = inferComponentDataType(firstQuestion);
  const defaultOp = conditionOperatorRegistry.getDefaultOperator(dataType);
  const defaultVal =
    dataType === 'selection' && firstQuestion?.content.options?.[0]
      ? firstQuestion.content.options[0]
      : '';

  return {
    kind: 'condition',
    id: createLogicId('cond'),
    sourceType: 'component',
    sourceId: firstQuestion?.id || '',
    operator: defaultOp,
    value: defaultVal,
  };
}

export function createEmptyConditionGroup(
  doc: FormDocument,
  combinator: 'AND' | 'OR' = 'AND'
): LogicConditionGroup {
  return {
    kind: 'group',
    id: createLogicId('grp'),
    combinator,
    items: [createEmptyConditionClause(doc)],
  };
}

export function createEmptyAction(
  doc: FormDocument,
  type: LogicActionType = 'show_component'
): LogicActionConfig {
  const components = Object.values(doc.components);
  const secondComponent = components[1] || components[0];
  const secondPage = doc.pages[1] || doc.pages[0];
  const firstVar = doc.variables[0];

  switch (type) {
    case 'navigate_to_page':
    case 'show_page':
    case 'hide_page':
      return {
        id: createLogicId('act'),
        type,
        targetPageId: secondPage?.id || '',
      };
    case 'skip_pages':
      return {
        id: createLogicId('act'),
        type,
        targetPageIds: secondPage ? [secondPage.id] : [],
      };
    case 'end_form':
      return {
        id: createLogicId('act'),
        type,
        endFormTitle: 'Thank you for your response',
        endFormMessage: 'Based on your answers, no further questions are needed.',
        redirectUrl: '',
      };
    case 'set_variable':
      return {
        id: createLogicId('act'),
        type,
        variableName: firstVar?.name || '',
        value: '',
      };
    case 'set_calculated_value':
      return {
        id: createLogicId('act'),
        type,
        variableName: firstVar?.name || '',
        targetComponentId: firstVar ? undefined : secondComponent?.id || '',
        expression: '',
      };
    case 'display_message':
      return {
        id: createLogicId('act'),
        type,
        message: 'Please note this update based on your selection.',
        messageTone: 'info',
        targetComponentId: '',
      };
    default:
      return {
        id: createLogicId('act'),
        type,
        targetComponentId: secondComponent?.id || '',
      };
  }
}

export function createEmptyLogicRule(doc: FormDocument, existingCount: number): StudioLogicRule {
  const rule: StudioLogicRule = {
    schemaVersion: 2,
    id: createLogicId('rule'),
    name: `Rule ${existingCount + 1}`,
    enabled: true,
    priority: (existingCount + 1) * 10,
    trigger: 'on_change',
    conditionGroup: createEmptyConditionGroup(doc, 'AND'),
    actions: [createEmptyAction(doc, 'show_component')],
    execution: {
      elseBehavior: 'revert',
      stopOnMatch: false,
    },
    // Legacy projection filled cleanly via serializeStudioLogicRule
    sourceFieldId: '',
    condition: 'equals',
    value: '',
    action: 'show',
  };

  return serializeStudioLogicRule(rule, doc, existingCount);
}

export function duplicateStudioLogicRule(
  rule: StudioLogicRule,
  doc: FormDocument,
  nextIndex: number
): StudioLogicRule {
  const reIdGroup = (group: LogicConditionGroup): LogicConditionGroup => ({
    kind: 'group',
    id: createLogicId('grp'),
    combinator: group.combinator,
    items: group.items.map((item) =>
      item.kind === 'group'
        ? reIdGroup(item)
        : { ...item, id: createLogicId('cond') }
    ),
  });

  const copy: StudioLogicRule = {
    ...rule,
    id: createLogicId('rule'),
    name: `${rule.name} (Copy)`,
    priority: (nextIndex + 1) * 10,
    conditionGroup: reIdGroup(rule.conditionGroup),
    actions: rule.actions.map((a) => ({
      ...a,
      id: createLogicId('act'),
      targetPageIds: a.targetPageIds ? [...a.targetPageIds] : undefined,
    })),
    elseActions: (rule.elseActions || []).map((a) => ({
      ...a,
      id: createLogicId('act'),
      targetPageIds: a.targetPageIds ? [...a.targetPageIds] : undefined,
    })),
    execution: { ...rule.execution },
  };

  return serializeStudioLogicRule(copy, doc, nextIndex);
}

/**
 * Checks whether a rule is a simple 1-condition, 1-action legacy rule (no nested groups,
 * no extra actions, no elseActions). Used to preserve backward-compatible cleanup semantics
 * on single-clause rules while keeping complex Studio rules intact for validation warnings.
 */
export function isSimpleSingleComponentRule(rule: AnyLogicRule): boolean {
  if (!isStudioLogicRule(rule)) return true;
  return (
    rule.conditionGroup.items.length === 1 &&
    rule.conditionGroup.items[0].kind === 'condition' &&
    rule.actions.length === 1 &&
    (!rule.elseActions || rule.elseActions.length === 0)
  );
}
