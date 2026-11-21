/**
 * FlexStore / AuraForm Studio — Document Engine
 *
 * Pure, immutable state operations on FormDocument instances.
 * Never mutates input documents; every operation returns a new FormDocument
 * reference with updated timestamps and consistent page/component/container graphs.
 */

import { FormSettings, FormThankYouScreen, FormWelcomeScreen } from '../../types/form';
import {
  CrossFieldValidationRule,
  CUSTOM_CODE_SCHEMA_VERSION,
  FormComponentNode,
  FormComponentType,
  FormCustomCodeConfig,
  FormDesignConfig,
  FormDocument,
  FormOutcomeConfig,
  FormPage,
  FormScoringConfig,
  FormVariableDefinition,
  ReusableComponentDefinition,
  ReusableSlotOverride,
} from '../document/types';
import { ComponentRegistry, CreateNodeOverrides } from '../registry/ComponentRegistry';
import { formComponentRegistry } from '../registry/builtin-components';
import { ComponentNodePatch } from '../registry/types';
import { createDefaultDesign } from './theme-presets';
import { AnyLogicRule } from '../logic/types';
import { isSimpleSingleComponentRule, serializeStudioLogicRule } from '../logic/migration';
import {
  cloneReusableDefinition,
  coerceReusablePropValue,
  createReusableInstanceConfig,
  isSafeReusableUrl,
} from './reusable-component-engine';

/**
 * Maximum nesting depth for components inside layout containers.
 * Depth 0 = top-level on page
 * Depth 1 = direct child of a top-level container (e.g. a Two-Column inside a Section)
 * Depth 2 = leaf component inside a nested container (e.g. a Short Text inside a Two-Column inside a Section)
 */
export const MAX_CONTAINER_DEPTH = 2;

function touchMetadata(doc: FormDocument): FormDocument['metadata'] {
  return {
    ...doc.metadata,
    updatedAt: new Date().toISOString(),
  };
}

let idCounter = 0;
function makeStableId(prefix: string): string {
  idCounter = (idCounter + 1) % 10000;
  return `${prefix}_${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}${idCounter.toString(36)}`;
}

// ============================================================================
// Hierarchy & Nesting Guards
// ============================================================================

export function getComponentDepth(doc: FormDocument, componentId: string): number {
  let depth = 0;
  const visited = new Set<string>([componentId]);
  let current = doc.components[componentId];
  while (current?.parentId && !visited.has(current.parentId)) {
    visited.add(current.parentId);
    depth += 1;
    current = doc.components[current.parentId];
  }
  return depth;
}

export function isDescendant(
  doc: FormDocument,
  ancestorId: string,
  candidateId: string
): boolean {
  if (ancestorId === candidateId) return false;
  const visited = new Set<string>();
  const stack = [...(doc.components[ancestorId]?.children || [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === candidateId) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = doc.components[id];
    if (node?.children?.length) {
      stack.push(...node.children);
    }
  }
  return false;
}

function getSubtreeHeight(doc: FormDocument, componentId: string, visited = new Set<string>()): number {
  if (visited.has(componentId)) return 0;
  visited.add(componentId);
  const node = doc.components[componentId];
  if (!node?.children || node.children.length === 0) return 0;
  let maxChild = 0;
  for (const childId of node.children) {
    if (!doc.components[childId]) continue;
    const h = 1 + getSubtreeHeight(doc, childId, visited);
    if (h > maxChild) maxChild = h;
  }
  return maxChild;
}

function collectSubtreeIds(doc: FormDocument, rootId: string): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = doc.components[id];
    if (!node) continue;
    result.push(id);
    if (node.children?.length) {
      for (let i = node.children.length - 1; i >= 0; i -= 1) {
        stack.push(node.children[i]);
      }
    }
  }
  return result;
}

export interface NestingValidationResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Validates whether a component (existing ID or new component type) can be placed
 * inside `targetParentId` (`null` means page top-level).
 * Prevents self-nesting, cyclic nesting, nesting into non-containers, and exceeding MAX_CONTAINER_DEPTH.
 */
export function canNestComponent(
  doc: FormDocument,
  componentIdOrType: string,
  targetParentId: string | null,
  registry: ComponentRegistry = formComponentRegistry
): NestingValidationResult {
  if (targetParentId === null) {
    return { allowed: true };
  }

  const targetParent = doc.components[targetParentId];
  if (!targetParent) {
    return { allowed: false, reason: 'Target container no longer exists.' };
  }
  if (!registry.isContainer(targetParent.type)) {
    return { allowed: false, reason: 'Only layout containers can hold nested blocks.' };
  }

  const targetDepth = getComponentDepth(doc, targetParentId) + 1;
  const existingNode = doc.components[componentIdOrType];

  if (existingNode) {
    if (existingNode.id === targetParentId) {
      return { allowed: false, reason: 'Cannot move a container into itself.' };
    }
    if (isDescendant(doc, existingNode.id, targetParentId)) {
      return { allowed: false, reason: 'Cannot move a container inside one of its own children.' };
    }

    const subtreeHeight = getSubtreeHeight(doc, existingNode.id);
    const isDraggedContainer = registry.isContainer(existingNode.type);

    if (targetDepth + subtreeHeight > MAX_CONTAINER_DEPTH) {
      return {
        allowed: false,
        reason: `Maximum nesting depth (${MAX_CONTAINER_DEPTH}) reached.`,
      };
    }
    if (isDraggedContainer && targetDepth >= MAX_CONTAINER_DEPTH) {
      return {
        allowed: false,
        reason: 'Containers cannot be nested more than two levels deep.',
      };
    }
    return { allowed: true };
  }

  // Otherwise treat `componentIdOrType` as a FormComponentType being newly inserted
  const def = registry.get(componentIdOrType);
  if (def?.specialAction) {
    return { allowed: false, reason: 'Screen blocks cannot be placed inside containers.' };
  }
  if (targetDepth > MAX_CONTAINER_DEPTH) {
    return {
      allowed: false,
      reason: `Maximum nesting depth (${MAX_CONTAINER_DEPTH}) reached.`,
    };
  }
  if (registry.isContainer(componentIdOrType) && targetDepth >= MAX_CONTAINER_DEPTH) {
    return {
      allowed: false,
      reason: 'Containers cannot be nested more than two levels deep.',
    };
  }

  return { allowed: true };
}

// ============================================================================
// Selectors
// ============================================================================

export function getPageByIndex(doc: FormDocument, pageNumber: number): FormPage | undefined {
  return doc.pages[pageNumber - 1];
}

/**
 * Returns direct top-level components belonging to a page.
 */
export function getPageComponents(doc: FormDocument, pageId: string): FormComponentNode[] {
  const page = doc.pages.find((p) => p.id === pageId);
  if (!page) return [];
  return page.componentIds
    .map((id) => doc.components[id])
    .filter((node): node is FormComponentNode => Boolean(node));
}

/**
 * Returns direct child components of a layout container.
 */
export function getContainerChildren(doc: FormDocument, containerId: string): FormComponentNode[] {
  const container = doc.components[containerId];
  if (!container?.children?.length) return [];
  return container.children
    .map((id) => doc.components[id])
    .filter((node): node is FormComponentNode => Boolean(node));
}

function appendPreOrder(
  doc: FormDocument,
  ids: string[],
  out: FormComponentNode[],
  visited: Set<string>
): void {
  for (const id of ids) {
    if (visited.has(id)) continue;
    const node = doc.components[id];
    if (!node) continue;
    visited.add(id);
    out.push(node);
    if (node.children?.length) {
      appendPreOrder(doc, node.children, out, visited);
    }
  }
}

/**
 * Returns all components on a page in visual pre-order (including nested container children).
 */
export function getAllPageComponents(doc: FormDocument, pageId: string): FormComponentNode[] {
  const page = doc.pages.find((p) => p.id === pageId);
  if (!page) return [];
  const out: FormComponentNode[] = [];
  appendPreOrder(doc, page.componentIds, out, new Set<string>());
  return out;
}

/**
 * Returns all components across all pages in visual pre-order (including nested container children).
 */
export function getOrderedComponents(doc: FormDocument): FormComponentNode[] {
  const ordered: FormComponentNode[] = [];
  const visited = new Set<string>();
  for (const page of doc.pages) {
    appendPreOrder(doc, page.componentIds, ordered, visited);
  }
  return ordered;
}

export function getComponentGlobalIndex(doc: FormDocument, componentId: string): number {
  return getOrderedComponents(doc).findIndex((node) => node.id === componentId);
}

// ============================================================================
// Component Operations
// ============================================================================

export interface AddComponentOptions extends CreateNodeOverrides {
  insertAtIndex?: number;
}

export function addComponent(
  doc: FormDocument,
  type: FormComponentType,
  pageId?: string,
  options?: AddComponentOptions,
  registry: ComponentRegistry = formComponentRegistry
): { doc: FormDocument; componentId: string } {
  const requestedParentId = options?.parentId ?? null;
  let validParentId: string | null = null;
  let targetPage =
    (pageId ? doc.pages.find((p) => p.id === pageId) : undefined) || doc.pages[0];

  if (requestedParentId) {
    const check = canNestComponent(doc, type, requestedParentId, registry);
    const parentNode = doc.components[requestedParentId];
    if (check.allowed && parentNode) {
      validParentId = parentNode.id;
      const parentPage = doc.pages.find((p) => p.id === parentNode.pageId);
      if (parentPage) targetPage = parentPage;
    }
  }

  if (!targetPage) {
    throw new Error('Cannot add component: document has no pages.');
  }

  const node = registry.createComponentNode(type, targetPage.id, {
    ...options,
    parentId: validParentId,
  });

  if (validParentId) {
    const parentNode = doc.components[validParentId];
    const nextChildren = [...(parentNode.children || [])];
    if (
      typeof options?.insertAtIndex === 'number' &&
      options.insertAtIndex >= 0 &&
      options.insertAtIndex <= nextChildren.length
    ) {
      nextChildren.splice(options.insertAtIndex, 0, node.id);
    } else {
      nextChildren.push(node.id);
    }

    const nextDoc: FormDocument = {
      ...doc,
      components: {
        ...doc.components,
        [validParentId]: {
          ...parentNode,
          children: nextChildren,
        },
        [node.id]: node,
      },
      metadata: touchMetadata(doc),
    };
    return { doc: nextDoc, componentId: node.id };
  }

  const nextPages = doc.pages.map((page) => {
    if (page.id !== targetPage.id) return page;
    const nextIds = [...page.componentIds];
    if (
      typeof options?.insertAtIndex === 'number' &&
      options.insertAtIndex >= 0 &&
      options.insertAtIndex <= nextIds.length
    ) {
      nextIds.splice(options.insertAtIndex, 0, node.id);
    } else {
      nextIds.push(node.id);
    }
    return { ...page, componentIds: nextIds };
  });

  const nextDoc: FormDocument = {
    ...doc,
    pages: nextPages,
    components: {
      ...doc.components,
      [node.id]: node,
    },
    metadata: touchMetadata(doc),
  };

  return { doc: nextDoc, componentId: node.id };
}

export function removeComponent(doc: FormDocument, componentId: string): FormDocument {
  const target = doc.components[componentId];
  if (!target) return doc;

  // Recursively collect target + all nested descendants
  const toRemove = new Set<string>(collectSubtreeIds(doc, componentId));

  const nextComponents: Record<string, FormComponentNode> = {};
  for (const [id, node] of Object.entries(doc.components)) {
    if (toRemove.has(id)) continue;
    if (node.children?.some((cid) => toRemove.has(cid))) {
      nextComponents[id] = {
        ...node,
        children: node.children.filter((cid) => !toRemove.has(cid)),
      };
    } else {
      nextComponents[id] = node;
    }
  }

  const nextPages = doc.pages.map((page) => ({
    ...page,
    componentIds: page.componentIds.filter((id) => !toRemove.has(id)),
  }));

  const nextRules = doc.logic.rules.filter((rule) => {
    // Clean up simple 1-clause/1-action rules whose sole source or target was deleted;
    // preserve complex multi-condition or multi-action rules so the Logic Builder flags
    // missing references gracefully without destroying the user's workflow.
    if (!isSimpleSingleComponentRule(rule)) return true;
    return (
      !toRemove.has(rule.sourceFieldId) &&
      (!rule.targetFieldId || !toRemove.has(rule.targetFieldId))
    );
  });

  return {
    ...doc,
    pages: nextPages,
    components: nextComponents,
    logic: {
      ...doc.logic,
      rules: nextRules,
    },
    metadata: touchMetadata(doc),
  };
}

function cloneNodeTree(
  doc: FormDocument,
  sourceId: string,
  targetPageId: string,
  targetParentId: string | null,
  appendCopySuffix: boolean,
  outComponents: Record<string, FormComponentNode>
): string | null {
  const original = doc.components[sourceId];
  if (!original) return null;

  const newId = makeStableId('c');
  const clonedChildrenIds: string[] | undefined = original.children
    ? []
    : undefined;

  if (original.children && clonedChildrenIds) {
    for (const childId of original.children) {
      const clonedChildId = cloneNodeTree(
        doc,
        childId,
        targetPageId,
        newId,
        false,
        outComponents
      );
      if (clonedChildId) clonedChildrenIds.push(clonedChildId);
    }
  }

  outComponents[newId] = {
    ...original,
    id: newId,
    pageId: targetPageId,
    parentId: targetParentId,
    children: clonedChildrenIds,
    content: {
      ...original.content,
      label:
        appendCopySuffix && original.content.label
          ? `${original.content.label} (Copy)`
          : original.content.label,
      options: original.content.options ? [...original.content.options] : undefined,
    },
    appearance: { ...original.appearance },
    layout: {
      ...original.layout,
      responsive: original.layout.responsive ? { ...original.layout.responsive } : undefined,
    },
    behaviour: {
      ...original.behaviour,
      correctAnswer: Array.isArray(original.behaviour.correctAnswer)
        ? [...original.behaviour.correctAnswer]
        : original.behaviour.correctAnswer,
    },
    validation: {
      ...original.validation,
      allowedExtensions: original.validation.allowedExtensions
        ? [...original.validation.allowedExtensions]
        : undefined,
      allowedMimeTypes: original.validation.allowedMimeTypes
        ? [...original.validation.allowedMimeTypes]
        : undefined,
      customMessages: original.validation.customMessages
        ? { ...original.validation.customMessages }
        : undefined,
    },
    ...(original.reusableInstance
      ? {
          reusableInstance: JSON.parse(JSON.stringify(original.reusableInstance)),
        }
      : {}),
  };

  return newId;
}

export function duplicateComponent(
  doc: FormDocument,
  componentId: string
): { doc: FormDocument; componentId: string | null } {
  const original = doc.components[componentId];
  if (!original) return { doc, componentId: null };

  const clonedNodes: Record<string, FormComponentNode> = {};
  const newId = cloneNodeTree(
    doc,
    componentId,
    original.pageId,
    original.parentId ?? null,
    true,
    clonedNodes
  );
  if (!newId) return { doc, componentId: null };

  const nextComponents: Record<string, FormComponentNode> = {
    ...doc.components,
    ...clonedNodes,
  };

  // If nested inside a container, insert right after original inside parent.children
  if (original.parentId && nextComponents[original.parentId]) {
    const parent = nextComponents[original.parentId];
    const nextChildren = [...(parent.children || [])];
    const idx = nextChildren.indexOf(componentId);
    if (idx >= 0) {
      nextChildren.splice(idx + 1, 0, newId);
    } else {
      nextChildren.push(newId);
    }
    nextComponents[original.parentId] = {
      ...parent,
      children: nextChildren,
    };

    return {
      doc: {
        ...doc,
        components: nextComponents,
        metadata: touchMetadata(doc),
      },
      componentId: newId,
    };
  }

  // Top-level component on a page
  const nextPages = doc.pages.map((page) => {
    const idx = page.componentIds.indexOf(componentId);
    if (idx === -1) return page;
    const nextIds = [...page.componentIds];
    nextIds.splice(idx + 1, 0, newId);
    return { ...page, componentIds: nextIds };
  });

  return {
    doc: {
      ...doc,
      pages: nextPages,
      components: nextComponents,
      metadata: touchMetadata(doc),
    },
    componentId: newId,
  };
}

export function updateComponent(
  doc: FormDocument,
  componentId: string,
  patch: ComponentNodePatch,
  registry: ComponentRegistry = formComponentRegistry
): FormDocument {
  const existing = doc.components[componentId];
  if (!existing) return doc;

  let nextDoc = doc;

  // Handle cross-page move if pageId changed in patch
  if (patch.pageId && patch.pageId !== existing.pageId) {
    nextDoc = moveComponentToPage(nextDoc, componentId, patch.pageId);
  }

  const current = nextDoc.components[componentId];
  if (!current) return nextDoc;

  const nextType = patch.type ?? current.type;
  const targetDef = registry.get(nextType);

  const mergedContent = {
    ...current.content,
    ...(patch.content || {}),
  };

  // Seed default options when switching into a choice component that lacks options
  if (
    patch.type &&
    patch.type !== current.type &&
    targetDef?.defaultContent.options &&
    (!mergedContent.options || mergedContent.options.length === 0)
  ) {
    mergedContent.options = [...targetDef.defaultContent.options];
  }

  const updatedNode: FormComponentNode = {
    ...current,
    type: nextType,
    parentId: patch.parentId !== undefined ? patch.parentId : current.parentId,
    children: patch.children !== undefined ? [...patch.children] : current.children,
    content: mergedContent,
    appearance: {
      ...current.appearance,
      ...(patch.appearance || {}),
    },
    layout: {
      ...current.layout,
      ...(patch.layout || {}),
      responsive: patch.layout?.responsive
        ? {
            ...(current.layout.responsive || {}),
            ...(patch.layout.responsive.desktop
              ? {
                  desktop: {
                    ...(current.layout.responsive?.desktop || {}),
                    ...patch.layout.responsive.desktop,
                  },
                }
              : {}),
            ...(patch.layout.responsive.tablet
              ? {
                  tablet: {
                    ...(current.layout.responsive?.tablet || {}),
                    ...patch.layout.responsive.tablet,
                  },
                }
              : {}),
            ...(patch.layout.responsive.mobile
              ? {
                  mobile: {
                    ...(current.layout.responsive?.mobile || {}),
                    ...patch.layout.responsive.mobile,
                  },
                }
              : {}),
          }
        : current.layout.responsive,
    },
    behaviour: {
      ...current.behaviour,
      ...(patch.behaviour || {}),
    },
    validation: {
      ...current.validation,
      ...(patch.validation || {}),
    },
  };

  return {
    ...nextDoc,
    components: {
      ...nextDoc.components,
      [componentId]: updatedNode,
    },
    metadata: touchMetadata(nextDoc),
  };
}

export interface MoveComponentDestination {
  pageId?: string;
  parentId?: string | null;
  index?: number;
}

/**
 * Unified move operation supporting:
 * - Same-page top-level reordering
 * - Moving a block into a layout container
 * - Moving a block out of a layout container to top-level
 * - Reordering blocks within a container or moving between containers
 * - Moving a block (or container + its nested subtree) across pages
 *
 * Invalid nesting operations (cycles, non-container targets, depth > MAX_CONTAINER_DEPTH)
 * safely return the original document unchanged.
 */
export function moveComponent(
  doc: FormDocument,
  componentId: string,
  destination: MoveComponentDestination,
  registry: ComponentRegistry = formComponentRegistry
): FormDocument {
  const node = doc.components[componentId];
  if (!node) return doc;

  const targetParentId = destination.parentId === undefined ? null : destination.parentId;
  const check = canNestComponent(doc, componentId, targetParentId, registry);
  if (!check.allowed) return doc;

  const targetParent = targetParentId ? doc.components[targetParentId] : null;
  const destinationPageId = targetParent
    ? targetParent.pageId
    : destination.pageId || node.pageId;

  const destPageExists = doc.pages.some((p) => p.id === destinationPageId);
  if (!destPageExists) return doc;

  // 1. Detach componentId from its previous location (either old parent or old page)
  const nextComponents: Record<string, FormComponentNode> = { ...doc.components };
  if (node.parentId && nextComponents[node.parentId]) {
    const oldParent = nextComponents[node.parentId];
    nextComponents[node.parentId] = {
      ...oldParent,
      children: (oldParent.children || []).filter((id) => id !== componentId),
    };
  }

  let nextPages = doc.pages.map((page) => {
    if (!page.componentIds.includes(componentId)) return page;
    return {
      ...page,
      componentIds: page.componentIds.filter((id) => id !== componentId),
    };
  });

  // 2. Attach componentId into destination (container children OR page componentIds)
  if (targetParentId && nextComponents[targetParentId]) {
    const destParent = nextComponents[targetParentId];
    const nextChildren = (destParent.children || []).filter((id) => id !== componentId);
    const targetIdx =
      typeof destination.index === 'number'
        ? Math.max(0, Math.min(destination.index, nextChildren.length))
        : nextChildren.length;
    nextChildren.splice(targetIdx, 0, componentId);
    nextComponents[targetParentId] = {
      ...destParent,
      children: nextChildren,
    };
  } else {
    nextPages = nextPages.map((page) => {
      if (page.id !== destinationPageId) return page;
      const nextIds = [...page.componentIds];
      const targetIdx =
        typeof destination.index === 'number'
          ? Math.max(0, Math.min(destination.index, nextIds.length))
          : nextIds.length;
      nextIds.splice(targetIdx, 0, componentId);
      return { ...page, componentIds: nextIds };
    });
  }

  // 3. Update parentId on the moved node and recursively update pageId on its subtree
  const subtreeIds = collectSubtreeIds(doc, componentId);
  for (const id of subtreeIds) {
    const sub = nextComponents[id];
    if (!sub) continue;
    nextComponents[id] = {
      ...sub,
      pageId: destinationPageId,
      parentId: id === componentId ? targetParentId : sub.parentId,
    };
  }

  return {
    ...doc,
    pages: nextPages,
    components: nextComponents,
    metadata: touchMetadata(doc),
  };
}

export function reorderComponent(
  doc: FormDocument,
  componentId: string,
  targetIndex: number,
  targetPageId?: string
): FormDocument {
  return moveComponent(doc, componentId, {
    pageId: targetPageId,
    parentId: null,
    index: targetIndex,
  });
}

export function moveComponentToPage(
  doc: FormDocument,
  componentId: string,
  targetPageId: string,
  targetIndex?: number
): FormDocument {
  const targetPage = doc.pages.find((p) => p.id === targetPageId);
  if (!targetPage) return doc;
  const idx = targetIndex !== undefined ? targetIndex : targetPage.componentIds.length;
  return moveComponent(doc, componentId, {
    pageId: targetPageId,
    parentId: null,
    index: idx,
  });
}

/**
 * Moves a component up or down by 1 position within its container or page.
 * - Inside a container: moves up/down among siblings, or moves OUT of the container
 *   right before/after the parent when passing the container's edge.
 * - Top-level on a page: moves up/down within the page, or across page boundaries.
 */
export function moveComponentByOffset(
  doc: FormDocument,
  componentId: string,
  direction: 'up' | 'down'
): FormDocument {
  const node = doc.components[componentId];
  if (!node) return doc;

  // Nested inside a container
  if (node.parentId && doc.components[node.parentId]) {
    const parent = doc.components[node.parentId];
    const siblings = parent.children || [];
    const localIdx = siblings.indexOf(componentId);
    if (localIdx === -1) return doc;

    if (direction === 'up' && localIdx > 0) {
      return moveComponent(doc, componentId, {
        parentId: parent.id,
        index: localIdx - 1,
      });
    }
    if (direction === 'down' && localIdx < siblings.length - 1) {
      return moveComponent(doc, componentId, {
        parentId: parent.id,
        index: localIdx + 1,
      });
    }

    // Move out of container right before/after the parent
    const grandParentId = parent.parentId ?? null;
    if (grandParentId && doc.components[grandParentId]) {
      const grandSiblings = doc.components[grandParentId].children || [];
      const parentIdx = grandSiblings.indexOf(parent.id);
      if (parentIdx === -1) return doc;
      return moveComponent(doc, componentId, {
        parentId: grandParentId,
        index: direction === 'up' ? parentIdx : parentIdx + 1,
      });
    }

    const page = doc.pages.find((p) => p.id === parent.pageId);
    if (!page) return doc;
    const parentIdx = page.componentIds.indexOf(parent.id);
    if (parentIdx === -1) return doc;
    return moveComponent(doc, componentId, {
      pageId: page.id,
      parentId: null,
      index: direction === 'up' ? parentIdx : parentIdx + 1,
    });
  }

  // Top-level component
  const pageIdx = doc.pages.findIndex((p) => p.id === node.pageId);
  if (pageIdx === -1) return doc;

  const page = doc.pages[pageIdx];
  const localIdx = page.componentIds.indexOf(componentId);
  if (localIdx === -1) return doc;

  if (direction === 'up') {
    if (localIdx > 0) {
      return reorderComponent(doc, componentId, localIdx - 1, page.id);
    }
    if (pageIdx > 0) {
      const prevPage = doc.pages[pageIdx - 1];
      return moveComponentToPage(doc, componentId, prevPage.id, prevPage.componentIds.length);
    }
    return doc;
  }

  // direction === 'down'
  if (localIdx < page.componentIds.length - 1) {
    return reorderComponent(doc, componentId, localIdx + 1, page.id);
  }
  if (pageIdx < doc.pages.length - 1) {
    const nextPage = doc.pages[pageIdx + 1];
    return moveComponentToPage(doc, componentId, nextPage.id, 0);
  }
  return doc;
}

// ============================================================================
// Page Operations
// ============================================================================

export function createPage(
  doc: FormDocument,
  options?: { title?: string; description?: string; insertAtIndex?: number }
): { doc: FormDocument; pageId: string } {
  const pageId = makeStableId('page');
  const nextNumber = doc.pages.length + 1;
  const newPage: FormPage = {
    id: pageId,
    index: nextNumber,
    title: options?.title || `Page ${nextNumber}`,
    description: options?.description ?? `Questions for page ${nextNumber}`,
    componentIds: [],
  };

  const pages = [...doc.pages];
  if (
    typeof options?.insertAtIndex === 'number' &&
    options.insertAtIndex >= 0 &&
    options.insertAtIndex <= pages.length
  ) {
    pages.splice(options.insertAtIndex, 0, newPage);
  } else {
    pages.push(newPage);
  }

  const reindexed = pages.map((p, idx) => ({ ...p, index: idx + 1 }));

  return {
    doc: {
      ...doc,
      pages: reindexed,
      metadata: touchMetadata(doc),
    },
    pageId,
  };
}

export function duplicatePage(
  doc: FormDocument,
  pageId: string
): { doc: FormDocument; pageId: string | null } {
  const sourceIdx = doc.pages.findIndex((p) => p.id === pageId);
  if (sourceIdx === -1) return { doc, pageId: null };

  const sourcePage = doc.pages[sourceIdx];
  const newPageId = makeStableId('page');
  const clonedComponents: Record<string, FormComponentNode> = {};
  const newTopLevelIds: string[] = [];

  for (const compId of sourcePage.componentIds) {
    const clonedId = cloneNodeTree(doc, compId, newPageId, null, false, clonedComponents);
    if (clonedId) newTopLevelIds.push(clonedId);
  }

  const newPage: FormPage = {
    id: newPageId,
    index: sourceIdx + 2,
    title: `${sourcePage.title || `Page ${sourcePage.index}`} (Copy)`,
    description: sourcePage.description,
    appearance: sourcePage.appearance ? { ...sourcePage.appearance } : undefined,
    layout: sourcePage.layout ? { ...sourcePage.layout } : undefined,
    componentIds: newTopLevelIds,
  };

  const nextPages = [...doc.pages];
  nextPages.splice(sourceIdx + 1, 0, newPage);
  const reindexed = nextPages.map((p, idx) => ({ ...p, index: idx + 1 }));

  return {
    doc: {
      ...doc,
      pages: reindexed,
      components: {
        ...doc.components,
        ...clonedComponents,
      },
      metadata: touchMetadata(doc),
    },
    pageId: newPageId,
  };
}

export function updatePage(
  doc: FormDocument,
  pageId: string,
  patch: Partial<Pick<FormPage, 'title' | 'description' | 'appearance' | 'layout'>>
): FormDocument {
  const exists = doc.pages.some((p) => p.id === pageId);
  if (!exists) return doc;

  return {
    ...doc,
    pages: doc.pages.map((p) =>
      p.id === pageId
        ? {
            ...p,
            ...patch,
            appearance: patch.appearance ? { ...(p.appearance || {}), ...patch.appearance } : p.appearance,
            layout: patch.layout ? { ...(p.layout || {}), ...patch.layout } : p.layout,
          }
        : p
    ),
    metadata: touchMetadata(doc),
  };
}

export function deletePage(
  doc: FormDocument,
  pageId: string,
  options?: { deleteComponents?: boolean }
): FormDocument {
  if (doc.pages.length <= 1) return doc;
  const removeIdx = doc.pages.findIndex((p) => p.id === pageId);
  if (removeIdx === -1) return doc;

  const removedPage = doc.pages[removeIdx];
  const fallbackIdx = Math.max(0, removeIdx - 1);
  const remaining = doc.pages.filter((p) => p.id !== pageId);
  const recipientPage = remaining[fallbackIdx] || remaining[0];

  // Collect all top-level + nested component IDs on the removed page
  const allRemovedIds = new Set<string>();
  for (const cid of removedPage.componentIds) {
    for (const subId of collectSubtreeIds(doc, cid)) {
      allRemovedIds.add(subId);
    }
  }

  if (options?.deleteComponents) {
    const nextComponents: Record<string, FormComponentNode> = {};
    for (const [id, node] of Object.entries(doc.components)) {
      if (!allRemovedIds.has(id)) {
        nextComponents[id] = node;
      }
    }

    const nextRules = doc.logic.rules.filter((rule) => {
      if (!isSimpleSingleComponentRule(rule)) return true;
      return (
        !allRemovedIds.has(rule.sourceFieldId) &&
        (!rule.targetFieldId || !allRemovedIds.has(rule.targetFieldId))
      );
    });

    return {
      ...doc,
      pages: remaining.map((p, idx) => ({ ...p, index: idx + 1 })),
      components: nextComponents,
      logic: {
        ...doc.logic,
        rules: nextRules,
      },
      metadata: touchMetadata(doc),
    };
  }

  // Default safe behavior: relocate removed page's components (including nested children) to fallback page
  const nextComponents: Record<string, FormComponentNode> = { ...doc.components };
  for (const cid of allRemovedIds) {
    if (nextComponents[cid]) {
      nextComponents[cid] = { ...nextComponents[cid], pageId: recipientPage.id };
    }
  }

  const nextPages = remaining.map((p, idx) =>
    p.id === recipientPage.id
      ? {
          ...p,
          index: idx + 1,
          componentIds: [...p.componentIds, ...removedPage.componentIds],
        }
      : { ...p, index: idx + 1 }
  );

  return {
    ...doc,
    pages: nextPages,
    components: nextComponents,
    metadata: touchMetadata(doc),
  };
}

export function reorderPage(
  doc: FormDocument,
  pageId: string,
  direction: 'left' | 'right'
): FormDocument {
  const idx = doc.pages.findIndex((p) => p.id === pageId);
  if (idx === -1) return doc;
  const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= doc.pages.length) return doc;

  const nextPages = [...doc.pages];
  const temp = nextPages[idx];
  nextPages[idx] = nextPages[targetIdx];
  nextPages[targetIdx] = temp;

  return {
    ...doc,
    pages: nextPages.map((p, i) => ({ ...p, index: i + 1 })),
    metadata: touchMetadata(doc),
  };
}

/**
 * Splits a page right after `componentId`, moving subsequent top-level components on
 * that page (and their nested children) onto a newly inserted page.
 */
export function splitPageAfterComponent(
  doc: FormDocument,
  componentId: string
): { doc: FormDocument; pageId: string | null } {
  const node = doc.components[componentId];
  if (!node) return { doc, pageId: null };

  const pageIdx = doc.pages.findIndex((p) => p.id === node.pageId);
  if (pageIdx === -1) return { doc, pageId: null };

  const sourcePage = doc.pages[pageIdx];
  const compIdx = sourcePage.componentIds.indexOf(componentId);
  if (compIdx === -1) return { doc, pageId: null };

  const stayIds = sourcePage.componentIds.slice(0, compIdx + 1);
  const moveIds = sourcePage.componentIds.slice(compIdx + 1);

  const created = createPage(doc, { insertAtIndex: pageIdx + 1 });
  const newPageId = created.pageId;

  const nextComponents: Record<string, FormComponentNode> = { ...created.doc.components };
  for (const cid of moveIds) {
    for (const subId of collectSubtreeIds(created.doc, cid)) {
      if (nextComponents[subId]) {
        nextComponents[subId] = { ...nextComponents[subId], pageId: newPageId };
      }
    }
  }

  const nextPages = created.doc.pages.map((p) => {
    if (p.id === sourcePage.id) return { ...p, componentIds: stayIds };
    if (p.id === newPageId) return { ...p, componentIds: moveIds };
    return p;
  });

  return {
    doc: {
      ...created.doc,
      pages: nextPages,
      components: nextComponents,
      metadata: touchMetadata(created.doc),
    },
    pageId: newPageId,
  };
}

// ============================================================================
// Global Form Operations
// ============================================================================

export function updateFormMeta(
  doc: FormDocument,
  patch: Partial<Pick<FormDocument, 'title' | 'description' | 'category' | 'layoutMode'>>
): FormDocument {
  return {
    ...doc,
    ...patch,
    metadata: touchMetadata(doc),
  };
}

export function updateGlobalSettings(
  doc: FormDocument,
  patch: Partial<FormSettings>
): FormDocument {
  return {
    ...doc,
    settings: {
      ...doc.settings,
      ...patch,
    },
    metadata: touchMetadata(doc),
  };
}

export function resetComponentAppearance(
  doc: FormDocument,
  componentId: string
): FormDocument {
  const existing = doc.components[componentId];
  if (!existing) return doc;

  return {
    ...doc,
    components: {
      ...doc.components,
      [componentId]: {
        ...existing,
        appearance: {},
      },
    },
    metadata: touchMetadata(doc),
  };
}

export function updateDesign(
  doc: FormDocument,
  patch: Partial<FormDesignConfig>
): FormDocument {
  const mergedResponsive = patch.responsive
    ? {
        ...(doc.design.responsive || {}),
        ...patch.responsive,
        ...(patch.responsive.desktop
          ? {
              desktop: {
                ...(doc.design.responsive?.desktop || {}),
                ...patch.responsive.desktop,
              },
            }
          : {}),
        ...(patch.responsive.tablet
          ? {
              tablet: {
                ...(doc.design.responsive?.tablet || {}),
                ...patch.responsive.tablet,
              },
            }
          : {}),
        ...(patch.responsive.mobile
          ? {
              mobile: {
                ...(doc.design.responsive?.mobile || {}),
                ...patch.responsive.mobile,
              },
            }
          : {}),
      }
    : doc.design.responsive;

  return {
    ...doc,
    design: {
      ...doc.design,
      ...patch,
      responsive: mergedResponsive,
    },
    metadata: touchMetadata(doc),
  };
}

export function resetDesignToDefault(doc: FormDocument): FormDocument {
  return {
    ...doc,
    design: createDefaultDesign(),
    metadata: touchMetadata(doc),
  };
}

export function updateWelcomeScreen(
  doc: FormDocument,
  patch: Partial<FormWelcomeScreen>
): FormDocument {
  return {
    ...doc,
    welcomeScreen: {
      ...doc.welcomeScreen,
      ...patch,
    },
    metadata: touchMetadata(doc),
  };
}

export function updateThankYouScreen(
  doc: FormDocument,
  patch: Partial<FormThankYouScreen>
): FormDocument {
  return {
    ...doc,
    thankYouScreen: {
      ...doc.thankYouScreen,
      ...patch,
    },
    metadata: touchMetadata(doc),
  };
}

export function updateLogicRules(doc: FormDocument, rules: AnyLogicRule[]): FormDocument {
  return {
    ...doc,
    logic: {
      ...doc.logic,
      rules: rules.map((r, idx) => serializeStudioLogicRule(r, doc, idx)),
    },
    metadata: touchMetadata(doc),
  };
}

export function updateVariables(
  doc: FormDocument,
  variables: FormVariableDefinition[]
): FormDocument {
  return {
    ...doc,
    variables: variables.map((v) => ({ ...v })),
    metadata: touchMetadata(doc),
  };
}

export function updateCrossFieldValidations(
  doc: FormDocument,
  rules: CrossFieldValidationRule[]
): FormDocument {
  return {
    ...doc,
    logic: {
      ...doc.logic,
      crossFieldValidations: JSON.parse(JSON.stringify(rules)),
    },
    metadata: touchMetadata(doc),
  };
}

export function updateScoringConfig(
  doc: FormDocument,
  scoring: FormScoringConfig
): FormDocument {
  return {
    ...doc,
    scoring: JSON.parse(JSON.stringify(scoring)),
    metadata: touchMetadata(doc),
  };
}

export function updateOutcomesConfig(
  doc: FormDocument,
  outcomes: FormOutcomeConfig
): FormDocument {
  return {
    ...doc,
    outcomes: JSON.parse(JSON.stringify(outcomes)),
    metadata: touchMetadata(doc),
  };
}

export function updateCustomCode(
  doc: FormDocument,
  customCode: FormCustomCodeConfig
): FormDocument {
  const normalized: FormCustomCodeConfig = {
    schemaVersion: CUSTOM_CODE_SCHEMA_VERSION,
    css: {
      enabled: Boolean(customCode.css?.enabled),
      code: customCode.css?.code || '',
    },
    js: {
      enabled: Boolean(customCode.js?.enabled),
      code: customCode.js?.code || '',
      timeoutMs: customCode.js?.timeoutMs,
    },
    updatedAt: new Date().toISOString(),
  };
  return {
    ...doc,
    customCode: normalized,
    metadata: touchMetadata(doc),
  };
}

// ============================================================================
// Reusable Component Operations (Phase 3.2)
// ============================================================================

/**
 * Registers or updates a ReusableComponentDefinition inside `doc.componentDefinitions`.
 * Does NOT silently overwrite existing instances' pinned snapshots or local overrides.
 */
export function upsertReusableDefinitionInDoc(
  doc: FormDocument,
  definition: ReusableComponentDefinition
): FormDocument {
  return {
    ...doc,
    componentDefinitions: {
      ...(doc.componentDefinitions || {}),
      [definition.id]: cloneReusableDefinition(definition),
    },
    metadata: touchMetadata(doc),
  };
}

/**
 * Removes a ReusableComponentDefinition from `doc.componentDefinitions`.
 * Existing instances keep their `fallbackDefinition` snapshot so forms never crash.
 */
export function removeReusableDefinitionFromDoc(
  doc: FormDocument,
  definitionId: string
): FormDocument {
  if (!doc.componentDefinitions || !doc.componentDefinitions[definitionId]) return doc;
  const nextDefs = { ...doc.componentDefinitions };
  delete nextDefs[definitionId];
  return {
    ...doc,
    componentDefinitions: nextDefs,
    metadata: touchMetadata(doc),
  };
}

/**
 * Inserts a new `reusable_instance` node onto the requested page/container,
 * embedding the definition into `doc.componentDefinitions` and pinning an initial
 * snapshot on the instance for graceful offline/deletion resilience.
 */
export function insertReusableComponentInstance(
  doc: FormDocument,
  definition: ReusableComponentDefinition,
  pageId?: string,
  options?: AddComponentOptions,
  registry: ComponentRegistry = formComponentRegistry
): { doc: FormDocument; componentId: string } {
  const docWithDef = upsertReusableDefinitionInDoc(doc, definition);
  const { doc: docWithNode, componentId } = addComponent(
    docWithDef,
    'reusable_instance',
    pageId,
    {
      ...options,
      content: {
        label: definition.name,
        ...(options?.content || {}),
      },
      layout: {
        width: definition.rootLayout.width || 'full',
        ...(options?.layout || {}),
      },
    },
    registry
  );

  const inserted = docWithNode.components[componentId];
  if (!inserted) return { doc: docWithNode, componentId };

  const instanceConfig = createReusableInstanceConfig(definition);

  return {
    doc: {
      ...docWithNode,
      components: {
        ...docWithNode.components,
        [componentId]: {
          ...inserted,
          reusableInstance: instanceConfig,
        },
      },
      metadata: touchMetadata(docWithNode),
    },
    componentId,
  };
}

/**
 * Updates a single exposed typed property override on ONE reusable instance only.
 * Never modifies the master definition or sibling instances.
 */
export function updateReusableInstancePropOverride(
  doc: FormDocument,
  instanceId: string,
  propKey: string,
  rawValue: unknown,
  externalDefinitions?: Record<string, ReusableComponentDefinition>
): { doc: FormDocument; error?: string } {
  const node = doc.components[instanceId];
  if (!node || node.type !== 'reusable_instance' || !node.reusableInstance) {
    return { doc };
  }

  const def =
    node.reusableInstance.fallbackDefinition ||
    doc.componentDefinitions?.[node.reusableInstance.definitionId] ||
    externalDefinitions?.[node.reusableInstance.definitionId];

  const propDef = def?.props.find((p) => p.key === propKey);
  if (propDef) {
    const check = coerceReusablePropValue(propDef, rawValue);
    if (!check.valid) {
      return { doc, error: check.error };
    }
    rawValue = check.value;
  }

  const nextOverrides = {
    ...(node.reusableInstance.propOverrides || {}),
    [propKey]: rawValue as string | number | boolean,
  };

  return {
    doc: {
      ...doc,
      components: {
        ...doc.components,
        [instanceId]: {
          ...node,
          reusableInstance: {
            ...node.reusableInstance,
            propOverrides: nextOverrides,
          },
        },
      },
      metadata: touchMetadata(doc),
    },
  };
}

/**
 * Clears one exposed property override on a single instance (falling back to master default).
 */
export function clearReusableInstancePropOverride(
  doc: FormDocument,
  instanceId: string,
  propKey: string
): FormDocument {
  const node = doc.components[instanceId];
  if (!node || node.type !== 'reusable_instance' || !node.reusableInstance) return doc;
  if (!Object.prototype.hasOwnProperty.call(node.reusableInstance.propOverrides, propKey)) {
    return doc;
  }

  const nextOverrides = { ...node.reusableInstance.propOverrides };
  delete nextOverrides[propKey];

  return {
    ...doc,
    components: {
      ...doc.components,
      [instanceId]: {
        ...node,
        reusableInstance: {
          ...node.reusableInstance,
          propOverrides: nextOverrides,
        },
      },
    },
    metadata: touchMetadata(doc),
  };
}

/**
 * Applies a local per-slot content/styling/visibility override on ONE instance only.
 */
export function updateReusableInstanceSlotOverride(
  doc: FormDocument,
  instanceId: string,
  slotId: string,
  patch: ReusableSlotOverride
): FormDocument {
  const node = doc.components[instanceId];
  if (!node || node.type !== 'reusable_instance' || !node.reusableInstance) return doc;

  const existingSlotOverride = node.reusableInstance.slotOverrides?.[slotId] || {};
  const nextContent = patch.content
    ? { ...(existingSlotOverride.content || {}), ...patch.content }
    : existingSlotOverride.content;

  if (nextContent?.buttonUrl && !isSafeReusableUrl(nextContent.buttonUrl)) {
    delete nextContent.buttonUrl;
  }
  if (nextContent?.mediaUrl && !isSafeReusableUrl(nextContent.mediaUrl)) {
    delete nextContent.mediaUrl;
  }
  if (nextContent?.videoUrl && !isSafeReusableUrl(nextContent.videoUrl)) {
    delete nextContent.videoUrl;
  }

  const mergedSlotOverride: ReusableSlotOverride = {
    ...existingSlotOverride,
    ...patch,
    content: nextContent,
    appearance: patch.appearance
      ? { ...(existingSlotOverride.appearance || {}), ...patch.appearance }
      : existingSlotOverride.appearance,
    layout: patch.layout
      ? { ...(existingSlotOverride.layout || {}), ...patch.layout }
      : existingSlotOverride.layout,
    validation: patch.validation
      ? { ...(existingSlotOverride.validation || {}), ...patch.validation }
      : existingSlotOverride.validation,
  };

  return {
    ...doc,
    components: {
      ...doc.components,
      [instanceId]: {
        ...node,
        reusableInstance: {
          ...node.reusableInstance,
          slotOverrides: {
            ...(node.reusableInstance.slotOverrides || {}),
            [slotId]: mergedSlotOverride,
          },
        },
      },
    },
    metadata: touchMetadata(doc),
  };
}

/**
 * Resets either a single slot override or ALL local overrides on a reusable instance.
 */
export function resetReusableInstanceOverrides(
  doc: FormDocument,
  instanceId: string,
  slotId?: string
): FormDocument {
  const node = doc.components[instanceId];
  if (!node || node.type !== 'reusable_instance' || !node.reusableInstance) return doc;

  if (slotId) {
    const nextSlotOverrides = { ...(node.reusableInstance.slotOverrides || {}) };
    delete nextSlotOverrides[slotId];
    return {
      ...doc,
      components: {
        ...doc.components,
        [instanceId]: {
          ...node,
          reusableInstance: {
            ...node.reusableInstance,
            slotOverrides: nextSlotOverrides,
          },
        },
      },
      metadata: touchMetadata(doc),
    };
  }

  return {
    ...doc,
    components: {
      ...doc.components,
      [instanceId]: {
        ...node,
        appearance: {},
        reusableInstance: {
          ...node.reusableInstance,
          propOverrides: {},
          slotOverrides: {},
        },
      },
    },
    metadata: touchMetadata(doc),
  };
}

/**
 * Explicitly synchronises a single linked reusable instance to a newer master definition.
 * - When `preserveOverrides: true`, keeps all local prop & slot overrides for keys/slots
 *   that still exist in the updated definition while pulling in new/non-overridden structure & styling.
 * - When `preserveOverrides: false`, resets overrides cleanly to match the latest master definition.
 */
export function syncReusableInstance(
  doc: FormDocument,
  instanceId: string,
  latestDefinition: ReusableComponentDefinition,
  options: { preserveOverrides: boolean } = { preserveOverrides: true }
): FormDocument {
  const node = doc.components[instanceId];
  if (!node || node.type !== 'reusable_instance' || !node.reusableInstance) return doc;
  if (node.reusableInstance.definitionId !== latestDefinition.id) return doc;

  const validPropKeys = new Set(latestDefinition.props.map((p) => p.key));
  const validSlotIds = new Set(Object.keys(latestDefinition.slots));

  const nextPropOverrides: Record<string, string | number | boolean> = {};
  const nextSlotOverrides: Record<string, ReusableSlotOverride> = {};

  if (options.preserveOverrides) {
    for (const [key, val] of Object.entries(node.reusableInstance.propOverrides || {})) {
      if (validPropKeys.has(key)) {
        nextPropOverrides[key] = val;
      }
    }
    for (const [sid, override] of Object.entries(node.reusableInstance.slotOverrides || {})) {
      if (validSlotIds.has(sid)) {
        nextSlotOverrides[sid] = JSON.parse(JSON.stringify(override));
      }
    }
  }

  const nextDoc = upsertReusableDefinitionInDoc(doc, latestDefinition);

  return {
    ...nextDoc,
    components: {
      ...nextDoc.components,
      [instanceId]: {
        ...node,
        content: {
          ...node.content,
          label: latestDefinition.name,
        },
        reusableInstance: {
          ...node.reusableInstance,
          definitionVersion: latestDefinition.version,
          definitionNameSnapshot: latestDefinition.name,
          syncMode: 'linked',
          propOverrides: nextPropOverrides,
          slotOverrides: nextSlotOverrides,
          fallbackDefinition: cloneReusableDefinition(latestDefinition),
        },
      },
    },
    metadata: touchMetadata(nextDoc),
  };
}

/**
 * Explicitly updates all linked (non-detached) instances of a reusable definition in the document.
 * Preserves per-instance overrides by default so customised instances are never silently overwritten.
 */
export function syncAllReusableInstancesForDefinition(
  doc: FormDocument,
  latestDefinition: ReusableComponentDefinition,
  options: { preserveOverrides: boolean } = { preserveOverrides: true }
): FormDocument {
  let nextDoc = upsertReusableDefinitionInDoc(doc, latestDefinition);
  for (const node of Object.values(doc.components)) {
    if (
      node.type === 'reusable_instance' &&
      node.reusableInstance?.definitionId === latestDefinition.id &&
      node.reusableInstance.syncMode === 'linked'
    ) {
      nextDoc = syncReusableInstance(nextDoc, node.id, latestDefinition, options);
    }
  }
  return nextDoc;
}

/**
 * Detaches an instance from its master definition so future updates or library edits
 * will never offer or apply changes to this instance.
 */
export function detachReusableInstance(
  doc: FormDocument,
  instanceId: string,
  externalDefinitions?: Record<string, ReusableComponentDefinition>
): FormDocument {
  const node = doc.components[instanceId];
  if (!node || node.type !== 'reusable_instance' || !node.reusableInstance) return doc;

  const snapshot =
    node.reusableInstance.fallbackDefinition ||
    doc.componentDefinitions?.[node.reusableInstance.definitionId] ||
    externalDefinitions?.[node.reusableInstance.definitionId];

  return {
    ...doc,
    components: {
      ...doc.components,
      [instanceId]: {
        ...node,
        reusableInstance: {
          ...node.reusableInstance,
          syncMode: 'detached',
          fallbackDefinition: snapshot ? cloneReusableDefinition(snapshot) : undefined,
        },
      },
    },
    metadata: touchMetadata(doc),
  };
}

