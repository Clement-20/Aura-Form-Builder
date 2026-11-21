/**
 * Runtime validation and safe recovery for FormDocument v2 instances.
 * Prevents corrupted, partial, or hand-edited documents from crashing the editor or runner.
 */

import {
  COMPONENT_LIBRARY_SCHEMA_VERSION,
  CUSTOM_CODE_SCHEMA_VERSION,
  DOCUMENT_SCHEMA_VERSION,
  FormComponentNode,
  FormCustomCodeConfig,
  FormDocument,
  FormPage,
  ReusableComponentDefinition,
} from './types';

export interface DocumentValidationError {
  code:
    | 'INVALID_ROOT'
    | 'MISSING_ID'
    | 'INVALID_SCHEMA_VERSION'
    | 'EMPTY_PAGES'
    | 'ORPHAN_COMPONENT_REF'
    | 'DUPLICATE_PAGE_ID'
    | 'INVALID_COMPONENT'
    | 'MISSING_REQUIRED_SECTION';
  path: string;
  message: string;
}

export interface DocumentValidationResult {
  valid: boolean;
  errors: DocumentValidationError[];
}

export function isRecord(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

export function validateFormDocument(input: unknown): DocumentValidationResult {
  const errors: DocumentValidationError[] = [];

  if (!isRecord(input)) {
    return {
      valid: false,
      errors: [{ code: 'INVALID_ROOT', path: '$', message: 'Document must be a JSON object.' }],
    };
  }

  if (typeof input.id !== 'string' || input.id.trim().length === 0) {
    errors.push({ code: 'MISSING_ID', path: '$.id', message: 'Document must have a non-empty string id.' });
  }

  if (input.schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
    errors.push({
      code: 'INVALID_SCHEMA_VERSION',
      path: '$.schemaVersion',
      message: `Expected schemaVersion ${DOCUMENT_SCHEMA_VERSION}, received ${String(input.schemaVersion)}.`,
    });
  }

  if (!isRecord(input.settings)) {
    errors.push({ code: 'MISSING_REQUIRED_SECTION', path: '$.settings', message: 'Missing form settings object.' });
  }

  if (!isRecord(input.design)) {
    errors.push({ code: 'MISSING_REQUIRED_SECTION', path: '$.design', message: 'Missing global design object.' });
  }

  if (!Array.isArray(input.pages) || input.pages.length === 0) {
    errors.push({ code: 'EMPTY_PAGES', path: '$.pages', message: 'Document must contain at least one page.' });
  }

  if (!isRecord(input.components)) {
    errors.push({
      code: 'MISSING_REQUIRED_SECTION',
      path: '$.components',
      message: 'Components map must be an object keyed by component ID.',
    });
  }

  if (Array.isArray(input.pages) && isRecord(input.components)) {
    const seenPageIds = new Set<string>();
    for (let i = 0; i < input.pages.length; i++) {
      const page = input.pages[i] as Partial<FormPage>;
      if (!isRecord(page) || typeof page.id !== 'string' || !page.id.trim()) {
        errors.push({
          code: 'INVALID_COMPONENT',
          path: `$.pages[${i}]`,
          message: 'Every page must have a valid string id.',
        });
        continue;
      }
      if (seenPageIds.has(page.id)) {
        errors.push({
          code: 'DUPLICATE_PAGE_ID',
          path: `$.pages[${i}].id`,
          message: `Duplicate page id "${page.id}".`,
        });
      }
      seenPageIds.add(page.id);

      if (!Array.isArray(page.componentIds)) {
        errors.push({
          code: 'INVALID_COMPONENT',
          path: `$.pages[${i}].componentIds`,
          message: 'Page componentIds must be an array.',
        });
        continue;
      }

      for (const compId of page.componentIds) {
        if (typeof compId !== 'string' || !(compId in input.components)) {
          errors.push({
            code: 'ORPHAN_COMPONENT_REF',
            path: `$.pages[${i}].componentIds`,
            message: `Page "${page.id}" references missing component "${String(compId)}".`,
          });
        }
      }
    }

    for (const [key, node] of Object.entries(input.components)) {
      if (!isRecord(node)) {
        errors.push({
          code: 'INVALID_COMPONENT',
          path: `$.components.${key}`,
          message: 'Component node must be an object.',
        });
        continue;
      }
      const c = node as Partial<FormComponentNode>;
      if (c.id !== key || typeof c.type !== 'string' || !c.type.trim()) {
        errors.push({
          code: 'INVALID_COMPONENT',
          path: `$.components.${key}`,
          message: `Component "${key}" must have matching id and non-empty type.`,
        });
      }
      if (!isRecord(c.content) || !isRecord(c.appearance) || !isRecord(c.layout) || !isRecord(c.behaviour) || !isRecord(c.validation)) {
        errors.push({
          code: 'INVALID_COMPONENT',
          path: `$.components.${key}`,
          message: `Component "${key}" is missing separated property facets (content/appearance/layout/behaviour/validation).`,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Safely repairs structural inconsistencies (missing pages, dangling componentIds,
 * orphan component nodes, missing facets) so the editor and runner never crash.
 */
export function repairFormDocument(doc: FormDocument): FormDocument {
  const safeId = doc.id && doc.id.trim() ? doc.id : `form_${Math.random().toString(36).slice(2, 9)}`;
  const rawPages = Array.isArray(doc.pages) && doc.pages.length > 0
    ? doc.pages
    : [{ id: 'step_1', index: 1, title: 'Page 1', description: '', componentIds: [] }];

  const rawComponents: Record<string, FormComponentNode> = isRecord(doc.components)
    ? { ...doc.components }
    : {};

  // Normalize pages with deduplicated IDs and sequential 1-based indices
  const seenPageIds = new Set<string>();
  const pages: FormPage[] = rawPages.map((p, idx) => {
    let pageId = typeof p.id === 'string' && p.id.trim() ? p.id : `step_${idx + 1}`;
    while (seenPageIds.has(pageId)) {
      pageId = `${pageId}_${idx + 1}`;
    }
    seenPageIds.add(pageId);

    const validCompIds = Array.isArray(p.componentIds)
      ? Array.from(new Set(p.componentIds.filter((cid) => typeof cid === 'string' && Boolean(rawComponents[cid]))))
      : [];

    return {
      ...p,
      id: pageId,
      index: idx + 1,
      title: typeof p.title === 'string' && p.title.trim() ? p.title : `Page ${idx + 1}`,
      componentIds: validCompIds,
    };
  });

  const validPageIdSet = new Set(pages.map((p) => p.id));
  const referencedInPages = new Set(pages.flatMap((p) => p.componentIds));
  const components: Record<string, FormComponentNode> = {};

  for (const [key, rawNode] of Object.entries(rawComponents)) {
    if (!isRecord(rawNode)) continue;
    const nodeId = typeof rawNode.id === 'string' && rawNode.id.trim() ? rawNode.id : key;
    const targetPageId = validPageIdSet.has(rawNode.pageId) ? rawNode.pageId : pages[0].id;
    const parentId =
      typeof rawNode.parentId === 'string' && rawNode.parentId !== nodeId && Boolean(rawComponents[rawNode.parentId])
        ? rawNode.parentId
        : null;

    components[nodeId] = {
      id: nodeId,
      type: typeof rawNode.type === 'string' && rawNode.type.trim() ? rawNode.type : 'text',
      pageId: targetPageId,
      parentId,
      children: Array.isArray(rawNode.children)
        ? Array.from(new Set(rawNode.children.filter((cid) => cid !== nodeId && Boolean(rawComponents[cid]))))
        : undefined,
      content: isRecord(rawNode.content)
        ? { ...rawNode.content, label: typeof rawNode.content.label === 'string' ? rawNode.content.label : '' }
        : { label: 'Untitled' },
      appearance: isRecord(rawNode.appearance) ? { ...rawNode.appearance } : {},
      layout: isRecord(rawNode.layout)
        ? { ...rawNode.layout, width: rawNode.layout.width || 'full' }
        : { width: 'full' },
      behaviour: isRecord(rawNode.behaviour) ? { ...rawNode.behaviour } : {},
      validation: isRecord(rawNode.validation) ? { ...rawNode.validation } : {},
      ...(isRecord(rawNode.reusableInstance)
        ? {
            reusableInstance: JSON.parse(JSON.stringify(rawNode.reusableInstance)),
          }
        : {}),
    };

    if (!parentId && !referencedInPages.has(nodeId)) {
      const targetPage = pages.find((p) => p.id === targetPageId) || pages[0];
      targetPage.componentIds.push(nodeId);
      referencedInPages.add(nodeId);
    }
  }

  // Ensure every component with a valid parentId is listed in that parent's children array
  // and not duplicated in page.componentIds
  for (const node of Object.values(components)) {
    if (node.parentId && components[node.parentId]) {
      const parent = components[node.parentId];
      const children = Array.isArray(parent.children) ? [...parent.children] : [];
      if (!children.includes(node.id)) {
        children.push(node.id);
        parent.children = children;
      }
      for (const page of pages) {
        page.componentIds = page.componentIds.filter((cid) => cid !== node.id);
      }
    }
  }

  return {
    ...doc,
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: safeId,
    title: typeof doc.title === 'string' ? doc.title : 'Untitled Form',
    description: typeof doc.description === 'string' ? doc.description : '',
    pages,
    components,
    logic: {
      rules: Array.isArray(doc.logic?.rules) ? doc.logic.rules : [],
      crossFieldValidations: Array.isArray(doc.logic?.crossFieldValidations)
        ? doc.logic.crossFieldValidations
        : [],
      extensions: isRecord(doc.logic?.extensions) ? doc.logic.extensions : {},
    },
    variables: Array.isArray(doc.variables) ? doc.variables : [],
    scoring: isRecord(doc.scoring) ? doc.scoring : undefined,
    outcomes: isRecord(doc.outcomes) ? doc.outcomes : undefined,
    customCode: isRecord(doc.customCode)
      ? ({
          schemaVersion: CUSTOM_CODE_SCHEMA_VERSION,
          css: {
            enabled: Boolean(isRecord(doc.customCode.css) && doc.customCode.css.enabled),
            code:
              isRecord(doc.customCode.css) && typeof doc.customCode.css.code === 'string'
                ? doc.customCode.css.code
                : '',
          },
          js: {
            enabled: Boolean(isRecord(doc.customCode.js) && doc.customCode.js.enabled),
            code:
              isRecord(doc.customCode.js) && typeof doc.customCode.js.code === 'string'
                ? doc.customCode.js.code
                : '',
            timeoutMs:
              isRecord(doc.customCode.js) && typeof doc.customCode.js.timeoutMs === 'number'
                ? doc.customCode.js.timeoutMs
                : undefined,
          },
          updatedAt:
            typeof doc.customCode.updatedAt === 'string' ? doc.customCode.updatedAt : undefined,
        } satisfies FormCustomCodeConfig)
      : undefined,
    componentDefinitions: isRecord(doc.componentDefinitions)
      ? Object.entries(doc.componentDefinitions).reduce<Record<string, ReusableComponentDefinition>>(
          (acc, [defId, defVal]) => {
            if (isRecord(defVal) && typeof defVal.id === 'string' && isRecord(defVal.slots)) {
              acc[defId] = {
                ...(JSON.parse(JSON.stringify(defVal)) as ReusableComponentDefinition),
                schemaVersion: COMPONENT_LIBRARY_SCHEMA_VERSION,
                version: typeof defVal.version === 'number' && defVal.version >= 1 ? defVal.version : 1,
              };
            }
            return acc;
          },
          {}
        )
      : undefined,
    integrations: isRecord(doc.integrations) ? doc.integrations : {},
    metadata: {
      createdAt: doc.metadata?.createdAt || new Date().toISOString(),
      updatedAt: doc.metadata?.updatedAt || new Date().toISOString(),
      responsesCount: typeof doc.metadata?.responsesCount === 'number' ? doc.metadata.responsesCount : 0,
      version: doc.metadata?.version,
      teamId: doc.metadata?.teamId,
      ownerId: doc.metadata?.ownerId,
      lastEditedBy: doc.metadata?.lastEditedBy,
      lastEditedByName: doc.metadata?.lastEditedByName,
    },
  };
}
