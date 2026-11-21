/**
 * FlexStore Form Studio — Isolated Custom JavaScript Sandbox Runtime (Phase 3.1)
 *
 * Mounts an opaque-origin `<iframe sandbox="allow-scripts">` with strict CSP (`default-src 'none';
 * connect-src 'none'`), per-session channel token verification, event watchdog timeout, rate
 * limiting, and sanitized error reporting.
 *
 * Guarantees:
 *  - Zero access to cookies, localStorage, sessionStorage, Firebase auth tokens, or parent DOM.
 *  - Terminates and unmounts the sandbox immediately if a script hangs past `timeoutMs` or floods
 *    the message channel.
 *  - Never executes or mounts if `enabled` is false or static validation finds blocking issues.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildSandboxSrcDoc,
  DEFAULT_JS_TIMEOUT_MS,
  MAX_JS_TIMEOUT_MS,
  MAX_SANDBOX_MESSAGES_PER_SECOND,
  MIN_JS_TIMEOUT_MS,
  SANDBOX_IFRAME_ATTRS,
  sanitizeRuntimeErrorMessage,
  validateCustomJs,
  validateSandboxMessage,
} from './custom-js-engine';

export interface SandboxNotice {
  id: string;
  message: string;
  tone: 'info' | 'success' | 'warning';
}

export interface CustomScriptSandboxProps {
  enabled: boolean;
  code: string;
  timeoutMs?: number;
  /** Read-only snapshot of public visible answers (never contains tokens or private config) */
  answers: Record<string, unknown>;
  /** Set of visible, enabled interactive field IDs allowed for hint/value helpers */
  allowedFieldIds: string[];
  activePageId: string;
  activePageIndex: number;
  onNotice?: (notice: SandboxNotice) => void;
  onFieldHint?: (fieldId: string, text: string) => void;
  onSetFieldValue?: (fieldId: string, value: string | number | boolean) => void;
  onLog?: (message: string) => void;
  onError?: (errorMessage: string) => void;
}

function generateChannelToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `tok_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export const CustomScriptSandbox: React.FC<CustomScriptSandboxProps> = ({
  enabled,
  code,
  timeoutMs = DEFAULT_JS_TIMEOUT_MS,
  answers,
  allowedFieldIds,
  activePageId,
  activePageIndex,
  onNotice,
  onFieldHint,
  onSetFieldValue,
  onLog,
  onError,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [terminated, setTerminated] = useState(false);
  const [ready, setReady] = useState(false);

  const clampedTimeout = Math.max(
    MIN_JS_TIMEOUT_MS,
    Math.min(MAX_JS_TIMEOUT_MS, Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_JS_TIMEOUT_MS)
  );

  const staticCheck = useMemo(() => validateCustomJs(code), [code]);
  const shouldMount = enabled && Boolean(code.trim()) && staticCheck.valid && !terminated;

  // Fresh random channel token whenever the script source or enablement changes
  const channelToken = useMemo(() => generateChannelToken(), [code, enabled]);
  const srcDoc = useMemo(
    () => (shouldMount ? buildSandboxSrcDoc(code, channelToken) : ''),
    [shouldMount, code, channelToken]
  );

  const allowedSet = useMemo(() => new Set(allowedFieldIds), [allowedFieldIds]);
  const callbacksRef = useRef({ onNotice, onFieldHint, onSetFieldValue, onLog, onError });
  callbacksRef.current = { onNotice, onFieldHint, onSetFieldValue, onLog, onError };

  const prevAnswersRef = useRef<Record<string, unknown>>({});
  const prevPageIdRef = useRef<string>(activePageId);
  const pendingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const msgWindowRef = useRef<{ start: number; count: number }>({ start: Date.now(), count: 0 });
  const reqSeqRef = useRef(0);

  // Reset termination/ready state when code or enabled toggle changes
  useEffect(() => {
    setTerminated(false);
    setReady(false);
    for (const timer of pendingTimersRef.current.values()) clearTimeout(timer);
    pendingTimersRef.current.clear();
  }, [code, enabled]);

  // Listen for strictly verified postMessage calls from THIS iframe instance only
  useEffect(() => {
    if (!shouldMount) return;

    const handleMessage = (event: MessageEvent) => {
      const iframeWin = iframeRef.current?.contentWindow;
      if (!iframeWin || event.source !== iframeWin) return;

      // Rate-limit guard
      const now = Date.now();
      if (now - msgWindowRef.current.start > 1000) {
        msgWindowRef.current = { start: now, count: 0 };
      }
      msgWindowRef.current.count += 1;
      if (msgWindowRef.current.count > MAX_SANDBOX_MESSAGES_PER_SECOND) {
        setTerminated(true);
        callbacksRef.current.onError?.(
          'Custom script stopped: exceeded message rate limit.'
        );
        return;
      }

      const parsed = validateSandboxMessage(event.data, channelToken, allowedSet);
      if (!parsed) return;

      switch (parsed.type) {
        case 'ready':
          setReady(true);
          break;
        case 'ack': {
          const timer = pendingTimersRef.current.get(parsed.requestId);
          if (timer) {
            clearTimeout(timer);
            pendingTimersRef.current.delete(parsed.requestId);
          }
          break;
        }
        case 'notice':
          callbacksRef.current.onNotice?.({
            id: `sn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            message: parsed.message,
            tone: parsed.tone,
          });
          break;
        case 'hint':
          callbacksRef.current.onFieldHint?.(parsed.fieldId, parsed.text);
          break;
        case 'set_value':
          callbacksRef.current.onSetFieldValue?.(parsed.fieldId, parsed.value);
          break;
        case 'log':
          callbacksRef.current.onLog?.(parsed.message);
          break;
        case 'error':
          callbacksRef.current.onError?.(sanitizeRuntimeErrorMessage(parsed.message));
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      for (const timer of pendingTimersRef.current.values()) clearTimeout(timer);
      pendingTimersRef.current.clear();
    };
  }, [shouldMount, channelToken, allowedSet]);

  const dispatchEvent = (eventName: 'load' | 'change' | 'pageChange', payload: Record<string, unknown>) => {
    const iframeWin = iframeRef.current?.contentWindow;
    if (!iframeWin || !shouldMount || !ready) return;
    const requestId = `req_${++reqSeqRef.current}`;

    const timer = setTimeout(() => {
      pendingTimersRef.current.delete(requestId);
      setTerminated(true);
      callbacksRef.current.onError?.(
        `Custom script timed out after ${clampedTimeout}ms and was safely stopped.`
      );
    }, clampedTimeout);
    pendingTimersRef.current.set(requestId, timer);

    try {
      iframeWin.postMessage(
        {
          channelToken,
          type: 'dispatch',
          requestId,
          eventName,
          payload,
        },
        '*'
      );
    } catch {
      clearTimeout(timer);
      pendingTimersRef.current.delete(requestId);
    }
  };

  // Dispatch `load` once sandbox reports ready
  useEffect(() => {
    if (!ready || !shouldMount) return;
    const safeAnswers: Record<string, unknown> = {};
    for (const id of allowedFieldIds) {
      if (answers[id] !== undefined) safeAnswers[id] = answers[id];
    }
    dispatchEvent('load', {
      fieldCount: allowedFieldIds.length,
      pageId: activePageId,
      pageIndex: activePageIndex,
      answers: safeAnswers,
    });
    prevAnswersRef.current = { ...safeAnswers };
    prevPageIdRef.current = activePageId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, shouldMount]);

  // Dispatch `change` for changed visible fields
  useEffect(() => {
    if (!ready || !shouldMount) return;
    const safeAnswers: Record<string, unknown> = {};
    for (const id of allowedFieldIds) {
      if (answers[id] !== undefined) safeAnswers[id] = answers[id];
    }
    const prev = prevAnswersRef.current;
    for (const id of allowedFieldIds) {
      if (prev[id] !== safeAnswers[id]) {
        dispatchEvent('change', {
          fieldId: id,
          value: safeAnswers[id],
          answers: safeAnswers,
        });
      }
    }
    prevAnswersRef.current = { ...safeAnswers };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, ready, shouldMount]);

  // Dispatch `pageChange` when respondent navigates between pages
  useEffect(() => {
    if (!ready || !shouldMount) return;
    if (prevPageIdRef.current !== activePageId) {
      prevPageIdRef.current = activePageId;
      dispatchEvent('pageChange', {
        pageId: activePageId,
        pageIndex: activePageIndex,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageId, activePageIndex, ready, shouldMount]);

  if (!shouldMount) return null;

  return (
    <iframe
      ref={iframeRef}
      title="Isolated Form Script Sandbox"
      sandbox={SANDBOX_IFRAME_ATTRS}
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      aria-hidden="true"
      tabIndex={-1}
      className="hidden w-0 h-0 border-0 pointer-events-none"
    />
  );
};
