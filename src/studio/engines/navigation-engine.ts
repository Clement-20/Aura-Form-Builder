/**
 * FlexStore Form Studio — Dynamic Navigation & Progress Engine (Phase 2, Step 2)
 *
 * Pure, deterministic navigation engine shared by:
 *  - FormDocumentRenderer (Live Preview, PreviewModal, and Published Forms)
 *  - Automated journey tests
 *
 * Handles:
 *  - Stepped (multi-page) branching, page hiding, page skipping, and early completion
 *  - Conversational (one-question-at-a-time) dynamic question traversal & skip-to-question
 *  - Multi-condition & multi-page branching (fires at the latest referenced source page/question)
 *  - Runtime circular-navigation loop guard (using visited history set)
 *  - Honest dynamic progress indicator that avoids misleading % on branched forms
 */

import { FormComponentNode, FormDocument, BreakpointKey } from '../document/types';
import {
  defaultLogicEngine,
  ILogicEngine,
  LogicEvaluationResult,
  NavigationDirective,
} from './logic-engine';
import { normalizeLogicRule } from '../logic/migration';
import { AnyLogicRule } from '../logic/types';

export const CONTAINER_COMPONENT_TYPES = new Set<string>([
  'section',
  'container',
  'two_column',
  'three_column',
  'image_text',
]);

export const SPECIAL_SCREEN_TYPES = new Set<string>([
  'welcome_screen',
  'thank_you_screen',
  'progress_indicator',
]);

export const CONTENT_ONLY_TYPES = new Set<string>([
  'heading',
  'paragraph',
  'rich_text',
  'image',
  'video',
  'divider',
  'spacer',
  'statement',
]);

export function isContainerComponent(node: FormComponentNode): boolean {
  return CONTAINER_COMPONENT_TYPES.has(node.type);
}

export function isInteractiveQuestionComponent(node: FormComponentNode): boolean {
  return (
    !CONTAINER_COMPONENT_TYPES.has(node.type) &&
    !SPECIAL_SCREEN_TYPES.has(node.type) &&
    !CONTENT_ONLY_TYPES.has(node.type)
  );
}

/**
 * Returns all component IDs on a page in exact visual depth-first order.
 */
export function getOrderedPageComponentIds(document: FormDocument, pageId: string): string[] {
  const page = document.pages.find((p) => p.id === pageId);
  if (!page) return [];
  const result: string[] = [];
  const visited = new Set<string>();

  const walk = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const node = document.components[id];
    if (!node) return;
    result.push(id);
    for (const childId of node.children || []) {
      walk(childId);
    }
  };

  for (const rootId of page.componentIds || []) {
    walk(rootId);
  }
  return result;
}

/**
 * Returns all component IDs across the entire form in exact visual document order.
 */
export function getOrderedDocumentComponentIds(document: FormDocument): string[] {
  const ids: string[] = [];
  for (const page of document.pages) {
    ids.push(...getOrderedPageComponentIds(document, page.id));
  }
  return ids;
}

/**
 * True when a page exists, is visible (not hidden by `hide_page` / unshown `show_page`),
 * and is not marked skipped by `skip_pages`.
 */
export function isPageNavigable(
  document: FormDocument,
  pageId: string,
  logicResult: LogicEvaluationResult
): boolean {
  const exists = document.pages.some((p) => p.id === pageId);
  if (!exists) return false;
  return logicResult.visiblePageIds.has(pageId) && !logicResult.skippedPageIds.has(pageId);
}

/**
 * Returns pages that are currently navigable (visible and not skipped) in document order.
 */
export function getVisiblePages(document: FormDocument, logicResult: LogicEvaluationResult) {
  return document.pages.filter(
    (p) => logicResult.visiblePageIds.has(p.id) && !logicResult.skippedPageIds.has(p.id)
  );
}

/**
 * Returns all visible, non-container, non-special-screen nodes across navigable pages
 * in exact visual document order (used by conversational one-question-at-a-time mode).
 */
export function getVisibleConversationalNodes(
  document: FormDocument,
  logicResult: LogicEvaluationResult,
  viewportOverride?: BreakpointKey
): FormComponentNode[] {
  const nodes: FormComponentNode[] = [];
  for (const page of getVisiblePages(document, logicResult)) {
    const orderedIds = getOrderedPageComponentIds(document, page.id);
    for (const id of orderedIds) {
      const node = document.components[id];
      if (!node) continue;
      if (CONTAINER_COMPONENT_TYPES.has(node.type) || SPECIAL_SCREEN_TYPES.has(node.type)) {
        continue;
      }
      if (!logicResult.visibleComponentIds.has(node.id)) continue;
      if (viewportOverride && node.layout.responsive?.[viewportOverride]?.hidden) continue;
      nodes.push(node);
    }
  }
  return nodes;
}

export type SteppedNextResolution =
  | {
      kind: 'page';
      pageId: string;
      focusComponentId?: string;
      loopPrevented?: boolean;
      logicResult: LogicEvaluationResult;
    }
  | {
      kind: 'end_form';
      title?: string;
      message?: string;
      redirectUrl?: string;
      logicResult: LogicEvaluationResult;
    }
  | {
      kind: 'submit';
      loopPrevented?: boolean;
      logicResult: LogicEvaluationResult;
    };

export type ConversationalNextResolution =
  | {
      kind: 'component';
      componentId: string;
      loopPrevented?: boolean;
      logicResult: LogicEvaluationResult;
    }
  | {
      kind: 'end_form';
      title?: string;
      message?: string;
      redirectUrl?: string;
      logicResult: LogicEvaluationResult;
    }
  | {
      kind: 'submit';
      loopPrevented?: boolean;
      logicResult: LogicEvaluationResult;
    };

/**
 * Resolves the next destination when leaving `currentPageId` in Stepped (multi-page) mode.
 *
 * Guarantees:
 *  - Page-scoped matching: a rule triggered by answers on Page 1 fires when leaving Page 1,
 *    and does NOT trap the user on Page 2 when clicking Next on Page 2.
 *  - Multi-page condition matching: a rule referencing Page 1 AND Page 2 fires when leaving Page 2.
 *  - Skips hidden and `skip_pages` pages automatically.
 *  - Prevents runtime circular loops by refusing to jump to a page already in `visitedPageIds`.
 */
export function resolveSteppedNext(
  document: FormDocument,
  currentPageId: string,
  answers: Record<string, unknown>,
  visitedPageIds: Iterable<string>,
  logicEngine: ILogicEngine = defaultLogicEngine
): SteppedNextResolution {
  const visitedSet = new Set<string>(visitedPageIds);
  visitedSet.add(currentPageId);

  const logicResult = logicEngine.evaluate(document, {
    answers,
    currentPageId,
    trigger: 'on_page_leave',
    includeDebugTrace: false,
  });

  // Match directives scoped to currentPageId first, then global (variable-only) directives
  const pageScopedDirective = logicResult.navigationDirectives.find(
    (d) => d.triggerPageId === currentPageId
  );
  const globalDirective = logicResult.navigationDirectives.find(
    (d) => !d.triggerPageId && d.targetPageId !== currentPageId
  );
  const directive: NavigationDirective | undefined = pageScopedDirective || globalDirective;

  let loopPrevented = false;

  if (directive) {
    if (directive.actionType === 'end_form') {
      return {
        kind: 'end_form',
        title: directive.endFormTitle,
        message: directive.endFormMessage,
        redirectUrl: directive.redirectUrl,
        logicResult,
      };
    }

    if (directive.actionType === 'navigate_to_page' && directive.targetPageId) {
      if (directive.targetPageId === currentPageId || visitedSet.has(directive.targetPageId)) {
        loopPrevented = true;
      } else if (isPageNavigable(document, directive.targetPageId, logicResult)) {
        return {
          kind: 'page',
          pageId: directive.targetPageId,
          logicResult,
        };
      }
    }

    if (directive.actionType === 'skip_to_question' && directive.targetComponentId) {
      const targetNode = document.components[directive.targetComponentId];
      if (targetNode) {
        const targetPageId = targetNode.pageId;
        if (targetPageId === currentPageId) {
          // Same-page skip already occurred visually; advance to next sequential page
        } else if (visitedSet.has(targetPageId)) {
          loopPrevented = true;
        } else if (isPageNavigable(document, targetPageId, logicResult)) {
          return {
            kind: 'page',
            pageId: targetPageId,
            focusComponentId: logicResult.visibleComponentIds.has(targetNode.id)
              ? targetNode.id
              : undefined,
            logicResult,
          };
        }
      }
    }
  }

  // Sequential fallback: find next navigable, unvisited page after currentPageId
  const currentIdx = document.pages.findIndex((p) => p.id === currentPageId);
  for (let i = currentIdx + 1; i < document.pages.length; i += 1) {
    const candidate = document.pages[i];
    if (isPageNavigable(document, candidate.id, logicResult) && !visitedSet.has(candidate.id)) {
      return {
        kind: 'page',
        pageId: candidate.id,
        loopPrevented: loopPrevented || undefined,
        logicResult,
      };
    }
  }

  return {
    kind: 'submit',
    loopPrevented: loopPrevented || undefined,
    logicResult,
  };
}

/**
 * Resolves the next destination when leaving `currentComponentId` in Conversational
 * (one-question-at-a-time) mode.
 */
export function resolveConversationalNext(
  document: FormDocument,
  currentComponentId: string,
  answers: Record<string, unknown>,
  visitedComponentIds: Iterable<string>,
  logicEngine: ILogicEngine = defaultLogicEngine,
  viewportOverride?: BreakpointKey
): ConversationalNextResolution {
  const visitedSet = new Set<string>(visitedComponentIds);
  visitedSet.add(currentComponentId);

  const currentNode = document.components[currentComponentId];
  const currentPageId = currentNode?.pageId;

  const logicResult = logicEngine.evaluate(document, {
    answers,
    currentPageId,
    trigger: 'on_change',
    includeDebugTrace: false,
  });

  const allDocIds = getOrderedDocumentComponentIds(document);
  const docOrderIndex = new Map<string, number>();
  allDocIds.forEach((id, idx) => docOrderIndex.set(id, idx));

  const visibleNodes = getVisibleConversationalNodes(document, logicResult, viewportOverride);
  const currentOrder = docOrderIndex.get(currentComponentId) ?? -1;

  // Determine whether currentComponentId is the latest visible question on its page
  const remainingVisibleOnCurrentPage = visibleNodes.some(
    (n) => n.pageId === currentPageId && (docOrderIndex.get(n.id) ?? -1) > currentOrder
  );

  // Find a directive whose latest referenced component is currentComponentId,
  // OR if leaving currentPageId (last visible question on that page), a page-triggered or global directive.
  const findMatchingDirective = (): NavigationDirective | undefined => {
    for (const d of logicResult.navigationDirectives) {
      if (d.sourceComponentIds.length > 0) {
        let latestCompId: string | undefined;
        let latestOrder = -1;
        for (const cid of d.sourceComponentIds) {
          const ord = docOrderIndex.get(cid) ?? -1;
          if (ord > latestOrder) {
            latestOrder = ord;
            latestCompId = cid;
          }
        }
        if (latestCompId === currentComponentId) {
          return d;
        }
        // If leaving the page and the latest source was an earlier question on the same page
        // that wasn't the current one, check page trigger on exit only if not already passed
        if (!remainingVisibleOnCurrentPage && d.triggerPageId === currentPageId) {
          // Ensure we didn't already visit the target
          if (d.actionType === 'end_form') return d;
          if (d.targetComponentId && !visitedSet.has(d.targetComponentId)) return d;
          if (d.targetPageId && d.targetPageId !== currentPageId) return d;
        }
      } else if (!remainingVisibleOnCurrentPage) {
        return d;
      }
    }
    return undefined;
  };

  const directive = findMatchingDirective();
  let loopPrevented = false;

  if (directive) {
    if (directive.actionType === 'end_form') {
      return {
        kind: 'end_form',
        title: directive.endFormTitle,
        message: directive.endFormMessage,
        redirectUrl: directive.redirectUrl,
        logicResult,
      };
    }

    if (directive.actionType === 'skip_to_question' && directive.targetComponentId) {
      if (
        directive.targetComponentId === currentComponentId ||
        visitedSet.has(directive.targetComponentId)
      ) {
        loopPrevented = true;
      } else {
        const directTarget = visibleNodes.find((n) => n.id === directive.targetComponentId);
        if (directTarget) {
          return {
            kind: 'component',
            componentId: directTarget.id,
            logicResult,
          };
        }
        // If the target question itself is hidden, jump to the first visible question after it
        const targetOrder = docOrderIndex.get(directive.targetComponentId) ?? -1;
        const afterTarget = visibleNodes.find(
          (n) => (docOrderIndex.get(n.id) ?? -1) > targetOrder && !visitedSet.has(n.id)
        );
        if (afterTarget) {
          return {
            kind: 'component',
            componentId: afterTarget.id,
            logicResult,
          };
        }
      }
    }

    if (directive.actionType === 'navigate_to_page' && directive.targetPageId) {
      if (isPageNavigable(document, directive.targetPageId, logicResult)) {
        const firstOnTargetPage = visibleNodes.find((n) => n.pageId === directive.targetPageId);
        if (firstOnTargetPage) {
          if (
            firstOnTargetPage.id === currentComponentId ||
            visitedSet.has(firstOnTargetPage.id)
          ) {
            loopPrevented = true;
          } else {
            return {
              kind: 'component',
              componentId: firstOnTargetPage.id,
              logicResult,
            };
          }
        }
      }
    }
  }

  // Sequential fallback: next visible, unvisited question after currentOrder
  const nextVisible = visibleNodes.find(
    (n) => (docOrderIndex.get(n.id) ?? -1) > currentOrder && !visitedSet.has(n.id)
  );
  if (nextVisible) {
    return {
      kind: 'component',
      componentId: nextVisible.id,
      loopPrevented: loopPrevented || undefined,
      logicResult,
    };
  }

  return {
    kind: 'submit',
    loopPrevented: loopPrevented || undefined,
    logicResult,
  };
}

// ============================================================================
// Dynamic Branching Detection & Honest Progress Calculation
// ============================================================================

const PAGE_BRANCHING_ACTIONS = new Set([
  'navigate_to_page',
  'skip_pages',
  'skip_to_question',
  'end_form',
  'show_page',
  'hide_page',
]);

const VISIBILITY_AND_BRANCHING_ACTIONS = new Set([
  ...PAGE_BRANCHING_ACTIONS,
  'show_component',
  'hide_component',
]);

export function hasDynamicPageBranching(document: FormDocument): boolean {
  const rules = (document.logic.rules || []).map((r, idx) =>
    normalizeLogicRule(r as AnyLogicRule, document, idx)
  );
  return rules.some(
    (r) =>
      r.enabled &&
      [...(r.actions || []), ...(r.elseActions || [])].some((a) =>
        PAGE_BRANCHING_ACTIONS.has(a.type)
      )
  );
}

export function hasDynamicQuestionFlow(document: FormDocument): boolean {
  const rules = (document.logic.rules || []).map((r, idx) =>
    normalizeLogicRule(r as AnyLogicRule, document, idx)
  );
  return rules.some(
    (r) =>
      r.enabled &&
      [...(r.actions || []), ...(r.elseActions || [])].some((a) =>
        VISIBILITY_AND_BRANCHING_ACTIONS.has(a.type)
      )
  );
}

export interface DynamicProgressState {
  isDynamicBranching: boolean;
  /** Primary short label (e.g. "Step 2 of 4" or "Step 2 · Dynamic path") */
  label: string;
  /** Secondary right-hand indicator (e.g. "50%" for linear, or "2 steps ahead" / "Final step" for dynamic) */
  detailLabel: string;
  /** Visual bar fill 0..100 */
  barPercent: number;
  /** Numeric percent ONLY when the form path is linear & exact; undefined for branched forms */
  exactPercent?: number;
}

export function computeSteppedProgress(
  document: FormDocument,
  currentPageId: string,
  visitedStepCount: number,
  logicResult: LogicEvaluationResult
): DynamicProgressState {
  const visiblePages = getVisiblePages(document, logicResult);
  const currentIdx = Math.max(
    0,
    visiblePages.findIndex((p) => p.id === currentPageId)
  );
  const isDynamic = hasDynamicPageBranching(document);

  if (!isDynamic) {
    const total = Math.max(1, visiblePages.length);
    const stepNum = Math.min(total, currentIdx + 1);
    const pct = Math.round((stepNum / total) * 100);
    return {
      isDynamicBranching: false,
      label: `Step ${stepNum} of ${total}`,
      detailLabel: `${pct}%`,
      barPercent: pct,
      exactPercent: pct,
    };
  }

  // Dynamic branching form: never show a misleading static "% complete"
  const stepNum = Math.max(1, visitedStepCount);
  const hasActiveEndOnPage = logicResult.navigationDirectives.some(
    (d) =>
      d.actionType === 'end_form' && (!d.triggerPageId || d.triggerPageId === currentPageId)
  );
  const remainingPages = hasActiveEndOnPage
    ? 0
    : Math.max(0, visiblePages.length - (currentIdx + 1));

  if (hasActiveEndOnPage || remainingPages === 0) {
    return {
      isDynamicBranching: true,
      label: `Step ${stepNum} · Dynamic path`,
      detailLabel: 'Final step',
      barPercent: 95,
    };
  }

  const boundedBar = Math.min(88, Math.max(15, Math.round((stepNum / (stepNum + remainingPages)) * 100)));
  return {
    isDynamicBranching: true,
    label: `Step ${stepNum} · Dynamic path`,
    detailLabel: `${remainingPages} ${remainingPages === 1 ? 'step' : 'steps'} ahead`,
    barPercent: boundedBar,
  };
}

export function computeConversationalProgress(
  document: FormDocument,
  currentComponentId: string,
  visitedQuestionCount: number,
  logicResult: LogicEvaluationResult,
  viewportOverride?: BreakpointKey
): DynamicProgressState {
  const visibleNodes = getVisibleConversationalNodes(document, logicResult, viewportOverride);
  const currentIdx = Math.max(
    0,
    visibleNodes.findIndex((n) => n.id === currentComponentId)
  );
  const isDynamic = hasDynamicQuestionFlow(document);

  if (!isDynamic) {
    const total = Math.max(1, visibleNodes.length);
    const qNum = Math.min(total, currentIdx + 1);
    const pct = Math.round((qNum / total) * 100);
    return {
      isDynamicBranching: false,
      label: `Question ${qNum} of ${total}`,
      detailLabel: `${pct}%`,
      barPercent: pct,
      exactPercent: pct,
    };
  }

  const qNum = Math.max(1, visitedQuestionCount);
  const hasActiveEnd = logicResult.navigationDirectives.some(
    (d) =>
      d.actionType === 'end_form' &&
      (d.sourceComponentIds.includes(currentComponentId) || d.sourceComponentIds.length === 0)
  );
  const remaining = hasActiveEnd ? 0 : Math.max(0, visibleNodes.length - (currentIdx + 1));

  if (hasActiveEnd || remaining === 0) {
    return {
      isDynamicBranching: true,
      label: `Question ${qNum} · Dynamic path`,
      detailLabel: 'Final question',
      barPercent: 95,
    };
  }

  const boundedBar = Math.min(88, Math.max(12, Math.round((qNum / (qNum + remaining)) * 100)));
  return {
    isDynamicBranching: true,
    label: `Question ${qNum} · Dynamic path`,
    detailLabel: `${remaining} remaining`,
    barPercent: boundedBar,
  };
}
