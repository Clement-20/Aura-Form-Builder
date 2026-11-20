/**
 * FlexStore Form Studio — Dynamic Answer Piping & Variable Reference Engine (Phase 2, Step 3)
 *
 * Pure TypeScript (zero React/DOM imports) supporting:
 *  - Dynamic answer & variable piping: `{{first_name}}` and `{{first_name | there}}`
 *  - Automatic lookup by variable name/ID, question ID, or friendly question label slug
 *  - Automatic formatting of variables using their configured `VariableFormatConfig`
 *    (currency, number, percentage, date — respecting creator-chosen currency & locale)
 *  - Strict plain-text rendering guarantees (never interprets piped values as HTML)
 *  - Usage tracking & safe variable renaming across the entire FormDocument
 *  - Notification / webhook payload piping
 */

import {
  FormComponentNode,
  FormDocument,
  FormVariableDefinition,
} from '../document/types';
import { AnyLogicRule, LogicConditionGroup, StudioLogicRule } from '../logic/types';
import { formatValue, VARIABLE_TYPE_META } from './calculation-engine';
import { getOrderedComponents } from './document-engine';

// Matches {{ key }} or {{ key | fallback text }}
export const PIPING_TOKEN_REGEX = /\{\{\s*([a-zA-Z0-9_\-.]+)(?:\s*\|\s*([^}]*?))?\s*\}\}/g;

export function toPipingSlug(label: string): string {
  return (label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function extractPipedTokens(text: string): string[] {
  const keys: string[] = [];
  if (!text) return keys;
  const regex = new RegExp(PIPING_TOKEN_REGEX.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (!keys.includes(match[1])) {
      keys.push(match[1]);
    }
  }
  return keys;
}

export interface PipingContext {
  document?: FormDocument;
  answers: Record<string, unknown>;
  variables: Record<string, unknown>;
  /** Optional pre-formatted variable strings (takes precedence for variables) */
  formattedVariables?: Record<string, string>;
}

function isEmptyPipedValue(val: unknown): boolean {
  if (val === undefined || val === null) return true;
  if (typeof val === 'string') return val.trim() === '';
  if (typeof val === 'number') return !Number.isFinite(val);
  if (Array.isArray(val)) return val.length === 0;
  return false;
}

function stringifyPlainValue(val: unknown): string {
  if (val === undefined || val === null) return '';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return '';
    return String(Math.round(val * 1_000_000) / 1_000_000);
  }
  if (Array.isArray(val)) {
    return val.map((item) => String(item)).join(', ');
  }
  return String(val);
}

/**
 * Resolves all `{{token}}` and `{{token | fallback}}` placeholders inside a string
 * into strictly plain text (safe for React text nodes; never parsed as HTML).
 *
 * Resolution priority:
 *  1. Variable matched by exact `name` or `id` (formatted via `VariableFormatConfig`)
 *  2. Component answer matched by exact component `id`
 *  3. Component answer matched by friendly label slug (e.g. `first_name` -> "First Name")
 *  4. Direct key lookup in `context.variables` or `context.answers`
 *  5. Configured fallback text (`{{key | fallback}}`) or empty string `""`
 */
export function resolvePipedText(
  template: string | undefined | null,
  context: PipingContext
): string {
  if (!template) return '';
  if (!template.includes('{{')) return template;

  const { document, answers = {}, variables = {}, formattedVariables } = context;

  return template.replace(
    new RegExp(PIPING_TOKEN_REGEX.source, 'g'),
    (_fullMatch, rawKey: string, rawFallback?: string) => {
      const key = rawKey.trim();
      const fallback = rawFallback !== undefined ? rawFallback.trim() : '';

      // 1. Variable lookup by name or ID
      const varDef = document?.variables?.find((v) => v.name === key || v.id === key);
      if (varDef) {
        const rawVarVal = Object.prototype.hasOwnProperty.call(variables, varDef.name)
          ? variables[varDef.name]
          : varDef.initialValue;
        if (isEmptyPipedValue(rawVarVal)) {
          return fallback;
        }
        if (
          formattedVariables &&
          Object.prototype.hasOwnProperty.call(formattedVariables, varDef.name) &&
          formattedVariables[varDef.name] !== ''
        ) {
          return formattedVariables[varDef.name];
        }
        return formatValue(rawVarVal, varDef.format);
      }

      // Direct variable key even without document metadata
      if (Object.prototype.hasOwnProperty.call(variables, key)) {
        const rawVarVal = variables[key];
        if (isEmptyPipedValue(rawVarVal)) return fallback;
        if (formattedVariables && formattedVariables[key]) return formattedVariables[key];
        return stringifyPlainValue(rawVarVal);
      }

      // 2. Component lookup by exact ID
      if (Object.prototype.hasOwnProperty.call(answers, key)) {
        const ans = answers[key];
        return isEmptyPipedValue(ans) ? fallback : stringifyPlainValue(ans);
      }

      // 3. Component lookup by friendly label slug (e.g. {{first_name}} -> "First Name")
      if (document) {
        const lowerKey = key.toLowerCase();
        const matchedComp = Object.values(document.components).find(
          (c) => toPipingSlug(c.content.label) === lowerKey
        );
        if (matchedComp) {
          const ans = answers[matchedComp.id];
          return isEmptyPipedValue(ans) ? fallback : stringifyPlainValue(ans);
        }
      }

      return fallback;
    }
  );
}

/**
 * Produces a shallow-cloned component node whose display text slots (`label`, `body`,
 * `helpText`, `placeholder`, `mediaCaption`) have been safely piped into plain text.
 */
export function pipeComponentNode(
  node: FormComponentNode,
  context: PipingContext
): FormComponentNode {
  const c = node.content;
  const needsPiping =
    (c.label && c.label.includes('{{')) ||
    (c.body && c.body.includes('{{')) ||
    (c.helpText && c.helpText.includes('{{')) ||
    (c.placeholder && c.placeholder.includes('{{')) ||
    (c.mediaCaption && c.mediaCaption.includes('{{'));

  if (!needsPiping) return node;

  return {
    ...node,
    content: {
      ...c,
      label: resolvePipedText(c.label, context),
      body: c.body !== undefined ? resolvePipedText(c.body, context) : undefined,
      helpText: c.helpText !== undefined ? resolvePipedText(c.helpText, context) : undefined,
      placeholder:
        c.placeholder !== undefined ? resolvePipedText(c.placeholder, context) : undefined,
      mediaCaption:
        c.mediaCaption !== undefined ? resolvePipedText(c.mediaCaption, context) : undefined,
    },
  };
}

// ============================================================================
// Accessible Piping Catalog (For Insert Answer / Variable Picker)
// ============================================================================

export interface PipingCatalogItem {
  kind: 'question' | 'variable';
  id: string;
  tokenKey: string;
  label: string;
  typeBadge: string;
  pageTitle?: string;
}

export function buildPipingCatalog(
  document: FormDocument,
  isQuestionFn?: (node: FormComponentNode) => boolean
): { questions: PipingCatalogItem[]; variables: PipingCatalogItem[] } {
  const ordered = getOrderedComponents(document);
  const pageTitleById = new Map(document.pages.map((p) => [p.id, p.title || `Page ${p.index}`]));

  const nonQuestionTypes = new Set([
    'heading',
    'paragraph',
    'rich_text',
    'image',
    'video',
    'divider',
    'spacer',
    'section',
    'container',
    'two_column',
    'three_column',
    'image_text',
    'welcome_screen',
    'thank_you_screen',
    'progress_indicator',
    'statement',
  ]);

  const questions: PipingCatalogItem[] = [];
  for (const node of ordered) {
    const isQ = isQuestionFn ? isQuestionFn(node) : !nonQuestionTypes.has(node.type);
    if (!isQ) continue;
    questions.push({
      kind: 'question',
      id: node.id,
      tokenKey: node.id,
      label: node.content.label || `Untitled ${node.type}`,
      typeBadge: node.type.replace(/_/g, ' '),
      pageTitle: pageTitleById.get(node.pageId),
    });
  }

  const variables: PipingCatalogItem[] = (document.variables || []).map((v) => ({
    kind: 'variable',
    id: v.id,
    tokenKey: v.name,
    label: v.name,
    typeBadge: VARIABLE_TYPE_META[v.valueType]?.shortLabel || v.valueType,
  }));

  return { questions, variables };
}

// ============================================================================
// Variable Usage Tracking & Safe Renaming
// ============================================================================

export interface VariableUsageLocation {
  kind: 'condition' | 'action' | 'formula' | 'piping';
  description: string;
}

function collectConditionVarUsages(
  group: LogicConditionGroup,
  variable: FormVariableDefinition,
  ruleName: string,
  out: VariableUsageLocation[]
): void {
  for (const item of group.items || []) {
    if (item.kind === 'group') {
      collectConditionVarUsages(item, variable, ruleName, out);
    } else if (
      item.sourceType === 'variable' &&
      (item.sourceId === variable.name || item.sourceId === variable.id)
    ) {
      out.push({
        kind: 'condition',
        description: `Condition in rule "${ruleName}"`,
      });
    }
  }
}

function textMentionsVariable(text: string | undefined, variable: FormVariableDefinition): boolean {
  if (!text || !text.includes('{{')) return false;
  const tokens = extractPipedTokens(text);
  return tokens.includes(variable.name) || tokens.includes(variable.id);
}

/**
 * Finds every place a variable is referenced across the entire FormDocument
 * (logic conditions, logic actions, other variable formulas, and piped text).
 */
export function findVariableUsages(
  document: FormDocument,
  variable: FormVariableDefinition
): VariableUsageLocation[] {
  const usages: VariableUsageLocation[] = [];

  // 1. Other variables' formulas
  for (const other of document.variables || []) {
    if (other.id === variable.id) continue;
    if (textMentionsVariable(other.expression, variable)) {
      usages.push({
        kind: 'formula',
        description: `Formula in variable "${other.name}"`,
      });
    }
  }

  // 2. Logic rules (conditions + THEN/ELSE actions)
  for (const rawRule of document.logic.rules || []) {
    const rule = rawRule as StudioLogicRule;
    const ruleName = rule.name || 'Untitled Rule';
    if (rule.conditionGroup) {
      collectConditionVarUsages(rule.conditionGroup, variable, ruleName, usages);
    }
    const allActions = [...(rule.actions || []), ...(rule.elseActions || [])];
    for (const action of allActions) {
      if (action.variableName === variable.name || action.variableName === variable.id) {
        usages.push({
          kind: 'action',
          description: `Action (${action.type}) in rule "${ruleName}"`,
        });
      }
      if (textMentionsVariable(action.expression, variable)) {
        usages.push({
          kind: 'formula',
          description: `Calculated formula in rule "${ruleName}"`,
        });
      }
      if (
        textMentionsVariable(action.message, variable) ||
        textMentionsVariable(action.endFormTitle, variable) ||
        textMentionsVariable(action.endFormMessage, variable) ||
        textMentionsVariable(action.value, variable)
      ) {
        usages.push({
          kind: 'piping',
          description: `Dynamic text in rule "${ruleName}"`,
        });
      }
    }
  }

  // 3. Form-level, page-level, screen-level, and component-level piped text
  if (textMentionsVariable(document.title, variable) || textMentionsVariable(document.description, variable)) {
    usages.push({ kind: 'piping', description: 'Form title or description' });
  }
  if (
    textMentionsVariable(document.welcomeScreen.title, variable) ||
    textMentionsVariable(document.welcomeScreen.subtitle, variable)
  ) {
    usages.push({ kind: 'piping', description: 'Welcome screen copy' });
  }
  if (
    textMentionsVariable(document.thankYouScreen.title, variable) ||
    textMentionsVariable(document.thankYouScreen.message, variable)
  ) {
    usages.push({ kind: 'piping', description: 'Thank-you / result screen copy' });
  }
  for (const page of document.pages || []) {
    if (textMentionsVariable(page.title, variable) || textMentionsVariable(page.description, variable)) {
      usages.push({ kind: 'piping', description: `Page "${page.title || `Page ${page.index}`}"` });
    }
  }
  for (const comp of Object.values(document.components || {})) {
    if (
      textMentionsVariable(comp.content.label, variable) ||
      textMentionsVariable(comp.content.body, variable) ||
      textMentionsVariable(comp.content.helpText, variable) ||
      textMentionsVariable(comp.content.placeholder, variable)
    ) {
      usages.push({
        kind: 'piping',
        description: `Block "${comp.content.label || comp.type}"`,
      });
    }
  }

  return usages;
}

function replaceTokenInString(
  text: string | undefined,
  oldName: string,
  newName: string
): string | undefined {
  if (text === undefined || !text.includes('{{')) return text;
  return text.replace(
    new RegExp(PIPING_TOKEN_REGEX.source, 'g'),
    (fullMatch, rawKey: string, rawFallback?: string) => {
      if (rawKey.trim() !== oldName) return fullMatch;
      return rawFallback !== undefined
        ? `{{${newName} | ${rawFallback.trim()}}}`
        : `{{${newName}}}`;
    }
  );
}

function renameVarInConditionGroup(
  group: LogicConditionGroup,
  oldName: string,
  newName: string
): LogicConditionGroup {
  return {
    ...group,
    items: (group.items || []).map((item) => {
      if (item.kind === 'group') {
        return renameVarInConditionGroup(item, oldName, newName);
      }
      if (item.sourceType === 'variable' && item.sourceId === oldName) {
        return { ...item, sourceId: newName };
      }
      return item;
    }),
  };
}

/**
 * Safely renames a variable by ID and propagates the new name to every reference in
 * variable formulas, logic rule conditions/actions, and piped text across the FormDocument.
 */
export function renameVariableInDocument(
  document: FormDocument,
  variableId: string,
  nextRawName: string
): { document: FormDocument; error?: string } {
  const cleanName = nextRawName.trim().replace(/[^a-zA-Z0-9_]/g, '_');
  if (!cleanName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(cleanName)) {
    return {
      document,
      error: 'Variable names must start with a letter or underscore and use only letters, numbers, and underscores.',
    };
  }

  const target = document.variables.find((v) => v.id === variableId);
  if (!target) {
    return { document, error: 'Variable not found.' };
  }

  if (target.name === cleanName) {
    return { document };
  }

  const duplicate = document.variables.some(
    (v) => v.id !== variableId && v.name.toLowerCase() === cleanName.toLowerCase()
  );
  if (duplicate) {
    return { document, error: `A variable named "${cleanName}" already exists.` };
  }

  const oldName = target.name;

  const nextVariables: FormVariableDefinition[] = document.variables.map((v) => ({
    ...v,
    name: v.id === variableId ? cleanName : v.name,
    expression: replaceTokenInString(v.expression, oldName, cleanName),
  }));

  const nextRules: AnyLogicRule[] = (document.logic.rules || []).map((rawRule) => {
    const rule = rawRule as StudioLogicRule;
    if (rule.schemaVersion !== 2) return rawRule;

    const mapActions = (actions?: StudioLogicRule['actions']) =>
      actions?.map((a) => ({
        ...a,
        variableName: a.variableName === oldName ? cleanName : a.variableName,
        value: replaceTokenInString(a.value, oldName, cleanName),
        expression: replaceTokenInString(a.expression, oldName, cleanName),
        message: replaceTokenInString(a.message, oldName, cleanName),
        endFormTitle: replaceTokenInString(a.endFormTitle, oldName, cleanName),
        endFormMessage: replaceTokenInString(a.endFormMessage, oldName, cleanName),
      }));

    return {
      ...rule,
      conditionGroup: renameVarInConditionGroup(rule.conditionGroup, oldName, cleanName),
      actions: mapActions(rule.actions) || [],
      elseActions: mapActions(rule.elseActions),
    };
  });

  const nextComponents: Record<string, FormComponentNode> = {};
  for (const [id, comp] of Object.entries(document.components)) {
    nextComponents[id] = {
      ...comp,
      content: {
        ...comp.content,
        label: replaceTokenInString(comp.content.label, oldName, cleanName) ?? comp.content.label,
        body: replaceTokenInString(comp.content.body, oldName, cleanName),
        helpText: replaceTokenInString(comp.content.helpText, oldName, cleanName),
        placeholder: replaceTokenInString(comp.content.placeholder, oldName, cleanName),
        mediaCaption: replaceTokenInString(comp.content.mediaCaption, oldName, cleanName),
      },
    };
  }

  const nextDocument: FormDocument = {
    ...document,
    title: replaceTokenInString(document.title, oldName, cleanName) ?? document.title,
    description:
      replaceTokenInString(document.description, oldName, cleanName) ?? document.description,
    welcomeScreen: {
      ...document.welcomeScreen,
      title:
        replaceTokenInString(document.welcomeScreen.title, oldName, cleanName) ??
        document.welcomeScreen.title,
      subtitle:
        replaceTokenInString(document.welcomeScreen.subtitle, oldName, cleanName) ??
        document.welcomeScreen.subtitle,
    },
    thankYouScreen: {
      ...document.thankYouScreen,
      title:
        replaceTokenInString(document.thankYouScreen.title, oldName, cleanName) ??
        document.thankYouScreen.title,
      message:
        replaceTokenInString(document.thankYouScreen.message, oldName, cleanName) ??
        document.thankYouScreen.message,
    },
    pages: document.pages.map((p) => ({
      ...p,
      title: replaceTokenInString(p.title, oldName, cleanName) ?? p.title,
      description: replaceTokenInString(p.description, oldName, cleanName),
    })),
    components: nextComponents,
    variables: nextVariables,
    logic: {
      ...document.logic,
      rules: nextRules,
    },
  };

  return { document: nextDocument };
}

// ============================================================================
// Notification / Webhook Plain-Text Payload Builder
// ============================================================================

export interface PipedNotificationPayload {
  formId: string;
  formTitle: string;
  confirmationTitle: string;
  confirmationMessage: string;
  answers: Record<string, unknown>;
  resolvedVariables: Record<string, unknown>;
  formattedVariables: Record<string, string>;
}

export function buildPipedNotificationPayload(
  document: FormDocument,
  answers: Record<string, unknown>,
  resolvedVariables: Record<string, unknown>,
  formattedVariables: Record<string, string>
): PipedNotificationPayload {
  const ctx: PipingContext = {
    document,
    answers,
    variables: resolvedVariables,
    formattedVariables,
  };
  return {
    formId: document.id,
    formTitle: resolvePipedText(document.title, ctx),
    confirmationTitle: resolvePipedText(document.thankYouScreen.title, ctx),
    confirmationMessage: resolvePipedText(document.thankYouScreen.message, ctx),
    answers,
    resolvedVariables,
    formattedVariables,
  };
}
