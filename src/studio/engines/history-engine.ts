/**
 * Immutable History Engine (Undo / Redo Stack)
 *
 * Pure functional history state manager with bounded stack depth and
 * remote-sync reconciliation (allows applying remote collaborator snapshots
 * without discarding or corrupting local undo history).
 */

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
  maxEntries: number;
}

export function createHistory<T>(initialPresent: T, maxEntries = 40): HistoryState<T> {
  return {
    past: [],
    present: initialPresent,
    future: [],
    maxEntries: Math.max(1, maxEntries),
  };
}

export function pushHistory<T>(history: HistoryState<T>, nextPresent: T): HistoryState<T> {
  if (Object.is(history.present, nextPresent)) {
    return history;
  }
  const nextPast = [...history.past, history.present];
  if (nextPast.length > history.maxEntries) {
    nextPast.shift();
  }
  return {
    past: nextPast,
    present: nextPresent,
    future: [],
    maxEntries: history.maxEntries,
  };
}

export function undoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1];
  const nextPast = history.past.slice(0, -1);
  return {
    past: nextPast,
    present: previous,
    future: [history.present, ...history.future],
    maxEntries: history.maxEntries,
  };
}

export function redoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  if (history.future.length === 0) return history;
  const next = history.future[0];
  const nextFuture = history.future.slice(1);
  return {
    past: [...history.past, history.present],
    present: next,
    future: nextFuture,
    maxEntries: history.maxEntries,
  };
}

/**
 * Replaces present state without pushing onto past (used for incoming
 * remote co-authoring snapshots so local undo history stays clean).
 */
export function replaceHistoryPresent<T>(history: HistoryState<T>, nextPresent: T): HistoryState<T> {
  return {
    ...history,
    present: nextPresent,
  };
}

export function canUndoHistory<T>(history: HistoryState<T>): boolean {
  return history.past.length > 0;
}

export function canRedoHistory<T>(history: HistoryState<T>): boolean {
  return history.future.length > 0;
}
