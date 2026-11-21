/**
 * Server-Side Webhook & Integration Security Primitives
 *
 * Enforces:
 *  - Strict HTTPS-only outbound URL validation (blocks credentials, localhost,
 *    private/reserved IPv4 & IPv6 ranges, IPv4-mapped IPv6, link-local / cloud metadata)
 *  - DNS resolution validation on EVERY resolved address prior to connection
 *  - Manual redirect validation (max 3 hops, every Location target re-validated)
 *  - Outbound payload byte cap (256 KB) & strict AbortController request timeout
 *  - HMAC-SHA256 timestamped payload signing & constant-time replay-safe verification
 *  - Per-integration & per-form sliding-window rate limiting
 *  - Outbound payload sanitization & strict field allowlist filtering
 */

import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import type {
  DispatchSubmissionEventInput,
  FormIntegrationSummary,
  IntegrationEventPayload,
  IntegrationEventType,
} from '../../src/studio/integrations/types';
import { INTEGRATIONS_SCHEMA_VERSION } from '../../src/studio/integrations/types';

export const MAX_OUTBOUND_PAYLOAD_BYTES = 262_144; // 256 KB
export const MAX_RESPONSE_SNIPPET_CHARS = 1_024;
export const DEFAULT_TIMEOUT_MS = 8_000;
export const MIN_TIMEOUT_MS = 1_000;
export const MAX_TIMEOUT_MS = 15_000;
export const MAX_REDIRECT_HOPS = 3;
export const DEFAULT_SIGNATURE_TOLERANCE_SEC = 300; // 5 minutes

export type DnsLookupFn = (
  hostname: string
) => Promise<Array<{ address: string; family: number }>>;

export type FetchLikeFn = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;

export interface SecurityValidationOptions {
  /**
   * TEST-ONLY escape hatch for running automated tests against an ephemeral local
   * http://127.0.0.1 test receiver. NEVER exposed to HTTP API inputs.
   */
  allowUnsafeLoopbackForTests?: boolean;
  /** Optional custom DNS resolver for deterministic testing. */
  dnsLookup?: DnsLookupFn;
  /** Optional host allowlist (e.g., ['hooks.slack.com'] for Slack). */
  allowedHosts?: string[];
  /** Optional path prefix requirement (e.g., '/services/' for Slack). */
  requiredPathPrefix?: string;
}

export interface UrlValidationResult {
  valid: boolean;
  normalizedUrl?: string;
  resolvedIps?: string[];
  error?: string;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
]);

const BLOCKED_HOSTNAME_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.localdomain',
  '.home.arpa',
];

const SENSITIVE_FIELD_KEY_PATTERN =
  /(password|passwd|pwd|secret|token|authorization|api[_-]?key|access[_-]?key|private[_-]?key|cookie|session[_-]?id|credential|bearer)/i;

function parseIpv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const num = Number(part);
    if (!Number.isInteger(num) || num < 0 || num > 255) return null;
    value = (value << 8) | num;
  }
  return value >>> 0;
}

function isIpv4InCidr(ipInt: number, network: string, prefixLen: number): boolean {
  const netInt = parseIpv4ToInt(network);
  if (netInt === null) return false;
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  return (ipInt & mask) === (netInt & mask);
}

/**
 * Expands a valid IPv6 address (including compressed `::` and dotted-quad tail)
 * into 8 x 16-bit unsigned integers.
 */
function expandIpv6ToHextets(rawIp: string): number[] | null {
  // Strip optional zone ID (e.g., fe80::1%eth0)
  const ip = rawIp.split('%')[0].toLowerCase();
  if (!ip) return null;

  // Handle dotted-quad IPv4 suffix (e.g. ::ffff:127.0.0.1)
  let normalized = ip;
  const lastColon = ip.lastIndexOf(':');
  if (lastColon !== -1 && ip.slice(lastColon + 1).includes('.')) {
    const v4Part = ip.slice(lastColon + 1);
    const v4Int = parseIpv4ToInt(v4Part);
    if (v4Int === null) return null;
    const hi = ((v4Int >>> 16) & 0xffff).toString(16);
    const lo = (v4Int & 0xffff).toString(16);
    normalized = `${ip.slice(0, lastColon)}:${hi}:${lo}`;
  }

  const doubleColonParts = normalized.split('::');
  if (doubleColonParts.length > 2) return null;

  const parseSegment = (seg: string): number[] | null => {
    if (!seg) return [];
    const groups = seg.split(':');
    const out: number[] = [];
    for (const g of groups) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };

  if (doubleColonParts.length === 1) {
    const all = parseSegment(doubleColonParts[0]);
    return all && all.length === 8 ? all : null;
  }

  const left = parseSegment(doubleColonParts[0]);
  const right = parseSegment(doubleColonParts[1]);
  if (!left || !right) return null;
  const missing = 8 - (left.length + right.length);
  if (missing < 1) return null;

  return [...left, ...new Array<number>(missing).fill(0), ...right];
}

/**
 * Returns true if the given IPv4 or IPv6 address is loopback, private,
 * link-local, CGNAT, multicast, unspecified, documentation, or cloud metadata.
 */
export function isPrivateOrReservedIp(rawIp: string): boolean {
  const cleaned = rawIp.trim().replace(/^\[|\]$/g, '');
  const version = net.isIP(cleaned.split('%')[0]);

  if (version === 4) {
    const ipInt = parseIpv4ToInt(cleaned);
    if (ipInt === null) return true;
    return (
      isIpv4InCidr(ipInt, '0.0.0.0', 8) || // Current network / unspecified
      isIpv4InCidr(ipInt, '10.0.0.0', 8) || // RFC1918 private
      isIpv4InCidr(ipInt, '100.64.0.0', 10) || // Carrier-grade NAT (RFC6598)
      isIpv4InCidr(ipInt, '127.0.0.0', 8) || // Loopback
      isIpv4InCidr(ipInt, '169.254.0.0', 16) || // Link-local & cloud metadata (169.254.169.254)
      isIpv4InCidr(ipInt, '172.16.0.0', 12) || // RFC1918 private
      isIpv4InCidr(ipInt, '192.0.0.0', 24) || // IETF protocol assignments
      isIpv4InCidr(ipInt, '192.0.2.0', 24) || // TEST-NET-1
      isIpv4InCidr(ipInt, '192.168.0.0', 16) || // RFC1918 private
      isIpv4InCidr(ipInt, '198.18.0.0', 15) || // Benchmarking
      isIpv4InCidr(ipInt, '198.51.100.0', 24) || // TEST-NET-2
      isIpv4InCidr(ipInt, '203.0.113.0', 24) || // TEST-NET-3
      isIpv4InCidr(ipInt, '224.0.0.0', 4) || // Multicast
      isIpv4InCidr(ipInt, '240.0.0.0', 4) // Reserved / Broadcast
    );
  }

  if (version === 6) {
    const hextets = expandIpv6ToHextets(cleaned);
    if (!hextets) return true;

    const allZero = hextets.every((h) => h === 0);
    if (allZero) return true; // :: unspecified

    const isLoopback =
      hextets.slice(0, 7).every((h) => h === 0) && hextets[7] === 1;
    if (isLoopback) return true; // ::1

    // IPv4-mapped IPv6 (::ffff:0:0/96) or IPv4-translated (::ffff:0:0:0/96)
    const isIpv4Mapped =
      hextets[0] === 0 &&
      hextets[1] === 0 &&
      hextets[2] === 0 &&
      hextets[3] === 0 &&
      hextets[4] === 0 &&
      hextets[5] === 0xffff;
    if (isIpv4Mapped) {
      const a = (hextets[6] >>> 8) & 0xff;
      const b = hextets[6] & 0xff;
      const c = (hextets[7] >>> 8) & 0xff;
      const d = hextets[7] & 0xff;
      return isPrivateOrReservedIp(`${a}.${b}.${c}.${d}`);
    }

    // 6to4 (2002::/16) embedding an IPv4 address in hextets[1] & hextets[2]
    if (hextets[0] === 0x2002) {
      const a = (hextets[1] >>> 8) & 0xff;
      const b = hextets[1] & 0xff;
      const c = (hextets[2] >>> 8) & 0xff;
      const d = hextets[2] & 0xff;
      if (isPrivateOrReservedIp(`${a}.${b}.${c}.${d}`)) return true;
    }

    // Unique Local Addresses (fc00::/7 -> 0xfc00..0xfdff)
    if ((hextets[0] & 0xfe00) === 0xfc00) return true;

    // Link-local unicast (fe80::/10 -> 0xfe80..0xfebf)
    if ((hextets[0] & 0xffc0) === 0xfe80) return true;

    // Deprecated site-local (fec0::/10)
    if ((hextets[0] & 0xffc0) === 0xfec0) return true;

    // Multicast (ff00::/8)
    if ((hextets[0] & 0xff00) === 0xff00) return true;

    // Documentation (2001:db8::/32)
    if (hextets[0] === 0x2001 && hextets[1] === 0x0db8) return true;

    return false;
  }

  // Anything that is not a valid IP is treated as unsafe
  return true;
}

/**
 * Validates an outbound destination URL against HTTPS enforcement, host allowlists,
 * blocked internal domains, IP literals, and live DNS resolution to private ranges.
 */
export async function validateOutboundUrl(
  rawUrl: string,
  options: SecurityValidationOptions = {}
): Promise<UrlValidationResult> {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { valid: false, error: 'Endpoint URL is required.' };
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length > 2_048) {
    return { valid: false, error: 'Endpoint URL exceeds maximum allowed length (2048 chars).' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Endpoint URL is not a valid URL.' };
  }

  // Reject embedded credentials (e.g. https://user:pass@example.com)
  if (parsed.username || parsed.password) {
    return { valid: false, error: 'Endpoint URL must not include embedded credentials.' };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname) {
    return { valid: false, error: 'Endpoint URL must contain a valid hostname.' };
  }

  // Test-only explicit loopback escape hatch (never reachable via HTTP API input)
  const isTestLoopback =
    Boolean(options.allowUnsafeLoopbackForTests) &&
    (hostname === '127.0.0.1' || hostname === '::1') &&
    (parsed.protocol === 'http:' || parsed.protocol === 'https:');

  if (!isTestLoopback) {
    if (parsed.protocol !== 'https:') {
      return {
        valid: false,
        error: 'Only HTTPS endpoints are permitted for outbound integrations.',
      };
    }

    if (
      BLOCKED_HOSTNAMES.has(hostname) ||
      BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
    ) {
      return {
        valid: false,
        error: 'Internal, localhost, and cloud metadata hostnames are blocked.',
      };
    }
  }

  // Provider-specific host allowlist (e.g., hooks.slack.com)
  if (options.allowedHosts && options.allowedHosts.length > 0 && !isTestLoopback) {
    const allowed = options.allowedHosts.map((h) => h.toLowerCase());
    if (!allowed.includes(hostname)) {
      return {
        valid: false,
        error: `Endpoint host must be one of: ${allowed.join(', ')}.`,
      };
    }
  }

  // Provider-specific path prefix requirement (e.g., /services/ for Slack)
  if (options.requiredPathPrefix && !parsed.pathname.startsWith(options.requiredPathPrefix)) {
    return {
      valid: false,
      error: `Endpoint path must start with "${options.requiredPathPrefix}".`,
    };
  }

  if (isTestLoopback) {
    return {
      valid: true,
      normalizedUrl: parsed.toString(),
      resolvedIps: [hostname],
    };
  }

  // Check if hostname is a literal IP address
  const literalVersion = net.isIP(hostname);
  if (literalVersion !== 0) {
    if (isPrivateOrReservedIp(hostname)) {
      return {
        valid: false,
        error: 'Endpoint resolves to a private, loopback, or reserved network address.',
      };
    }
    return {
      valid: true,
      normalizedUrl: parsed.toString(),
      resolvedIps: [hostname],
    };
  }

  // Resolve DNS and inspect EVERY returned IPv4/IPv6 record
  const lookupFn: DnsLookupFn =
    options.dnsLookup ??
    (async (host: string) => {
      const records = await dns.lookup(host, { all: true, verbatim: true });
      return records;
    });

  let records: Array<{ address: string; family: number }>;
  try {
    records = await lookupFn(hostname);
  } catch {
    return {
      valid: false,
      error: `Could not resolve hostname "${hostname}" via DNS.`,
    };
  }

  if (!Array.isArray(records) || records.length === 0) {
    return {
      valid: false,
      error: `Hostname "${hostname}" did not resolve to any network address.`,
    };
  }

  for (const record of records) {
    if (!record.address || isPrivateOrReservedIp(record.address)) {
      return {
        valid: false,
        error: 'Endpoint resolves to a private, loopback, or reserved network address.',
      };
    }
  }

  return {
    valid: true,
    normalizedUrl: parsed.toString(),
    resolvedIps: records.map((r) => r.address),
  };
}

export interface SafeFetchOptions extends SecurityValidationOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  maxPayloadBytes?: number;
  fetchImpl?: FetchLikeFn;
}

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  durationMs: number;
  responseSnippet: string;
  retryAfterMs?: number;
  finalUrl: string;
  redirectCount: number;
}

function parseRetryAfterHeader(headerVal: string | null): number | undefined {
  if (!headerVal) return undefined;
  const trimmed = headerVal.trim();
  if (/^\d+$/.test(trimmed)) {
    return Math.min(Number(trimmed) * 1000, 60_000);
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now();
    if (delta > 0) return Math.min(delta, 60_000);
  }
  return undefined;
}

/**
 * Executes an outbound HTTP request with:
 *  - Pre-flight URL & DNS validation
 *  - Payload size cap enforcement
 *  - Strict AbortController timeout
 *  - Manual redirect following with full re-validation of every redirect target
 *  - Capped response body reading
 */
export async function safeFetchWithRedirectValidation(
  initialUrl: string,
  init: {
    method: 'POST' | 'PUT';
    headers: Record<string, string>;
    body: string;
  },
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const maxPayload = options.maxPayloadBytes ?? MAX_OUTBOUND_PAYLOAD_BYTES;
  const payloadBytes = Buffer.byteLength(init.body, 'utf8');
  if (payloadBytes > maxPayload) {
    throw new Error(
      `Outbound payload (${payloadBytes} bytes) exceeds maximum limit of ${maxPayload} bytes.`
    );
  }

  const timeoutMs = Math.max(
    MIN_TIMEOUT_MS,
    Math.min(MAX_TIMEOUT_MS, Math.round(options.timeoutMs ?? DEFAULT_TIMEOUT_MS))
  );
  const maxRedirects = Math.min(MAX_REDIRECT_HOPS, options.maxRedirects ?? MAX_REDIRECT_HOPS);
  const fetchFn: FetchLikeFn = options.fetchImpl ?? ((url, reqInit) => fetch(url, reqInit));

  let currentUrl = initialUrl;
  let redirectCount = 0;
  const startedAt = Date.now();

  while (true) {
    const validation = await validateOutboundUrl(currentUrl, options);
    if (!validation.valid || !validation.normalizedUrl) {
      throw new Error(validation.error || 'Destination URL failed security validation.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetchFn(validation.normalizedUrl, {
        method: init.method,
        headers: init.headers,
        body: init.body,
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timer);
      const isAbort =
        err instanceof Error &&
        (err.name === 'AbortError' || err.message.toLowerCase().includes('abort'));
      if (isAbort) {
        throw new Error(`Request timed out after ${timeoutMs}ms.`);
      }
      throw new Error(
        err instanceof Error ? `Network error: ${err.message}` : 'Network request failed.'
      );
    } finally {
      clearTimeout(timer);
    }

    const isRedirect =
      response.status === 301 ||
      response.status === 302 ||
      response.status === 303 ||
      response.status === 307 ||
      response.status === 308;

    if (isRedirect) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`Received HTTP ${response.status} redirect without a Location header.`);
      }
      if (redirectCount >= maxRedirects) {
        throw new Error(`Too many redirects (maximum ${maxRedirects} hops allowed).`);
      }
      let nextUrl: string;
      try {
        nextUrl = new URL(location, validation.normalizedUrl).toString();
      } catch {
        throw new Error('Redirect target URL is malformed.');
      }
      redirectCount += 1;
      currentUrl = nextUrl;
      continue;
    }

    let snippet = '';
    try {
      const text = await response.text();
      snippet = text.slice(0, MAX_RESPONSE_SNIPPET_CHARS);
    } catch {
      snippet = '';
    }

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      durationMs: Math.max(1, Date.now() - startedAt),
      responseSnippet: snippet,
      retryAfterMs: parseRetryAfterHeader(response.headers.get('retry-after')),
      finalUrl: validation.normalizedUrl,
      redirectCount,
    };
  }
}

// ============================================================================
// HMAC-SHA256 Signing, Verification & Secret Management
// ============================================================================

export function generateSigningSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString('hex')}`;
}

export function maskSecret(secret: string | undefined | null): string | undefined {
  if (!secret) return undefined;
  const suffix = secret.slice(-4);
  if (secret.startsWith('whsec_')) {
    return `whsec_••••${suffix}`;
  }
  return `••••${suffix}`;
}

export interface SignedWebhookHeader {
  timestamp: number;
  signature: string;
  headerValue: string;
}

/**
 * Signs a webhook body using HMAC-SHA256 over `${timestamp}.${rawBody}`.
 * Header format: `t=<unix_seconds>,v1=<hex_hmac_sha256>`
 */
export function signWebhookPayload(
  rawBody: string,
  secret: string,
  timestampSec: number = Math.floor(Date.now() / 1000)
): SignedWebhookHeader {
  const signedContent = `${timestampSec}.${rawBody}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedContent, 'utf8')
    .digest('hex');
  return {
    timestamp: timestampSec,
    signature,
    headerValue: `t=${timestampSec},v1=${signature}`,
  };
}

/**
 * Verifies an `X-FlexStore-Signature` header using constant-time comparison
 * and enforces a replay tolerance window (default 300 seconds).
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  toleranceSec: number = DEFAULT_SIGNATURE_TOLERANCE_SEC,
  nowSec: number = Math.floor(Date.now() / 1000)
): { valid: boolean; reason?: string; timestamp?: number } {
  if (!signatureHeader || !secret) {
    return { valid: false, reason: 'Missing signature header or signing secret.' };
  }

  const parts = signatureHeader.split(',').map((p) => p.trim());
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (key === 't' && /^\d+$/.test(val)) {
      timestamp = Number(val);
    } else if (key === 'v1' && /^[0-9a-f]{64}$/i.test(val)) {
      signatures.push(val.toLowerCase());
    }
  }

  if (timestamp === null || signatures.length === 0) {
    return { valid: false, reason: 'Malformed signature header.' };
  }

  if (toleranceSec > 0 && Math.abs(nowSec - timestamp) > toleranceSec) {
    return {
      valid: false,
      reason: 'Signature timestamp is outside the allowed replay tolerance window.',
      timestamp,
    };
  }

  const expected = signWebhookPayload(rawBody, secret, timestamp).signature;
  const expectedBuf = Buffer.from(expected, 'hex');

  for (const candidate of signatures) {
    const candidateBuf = Buffer.from(candidate, 'hex');
    if (
      candidateBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(candidateBuf, expectedBuf)
    ) {
      return { valid: true, timestamp };
    }
  }

  return { valid: false, reason: 'Signature mismatch.', timestamp };
}

// ============================================================================
// Sliding-Window Rate Limiter
// ============================================================================

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, number[]>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = Math.max(1, maxRequests);
    this.windowMs = Math.max(100, windowMs);
  }

  consume(key: string, nowMs: number = Date.now()): {
    allowed: boolean;
    remaining: number;
    retryAfterMs: number;
  } {
    const cutoff = nowMs - this.windowMs;
    const existing = (this.buckets.get(key) || []).filter((ts) => ts > cutoff);

    if (existing.length >= this.maxRequests) {
      const oldest = existing[0] ?? nowMs;
      const retryAfterMs = Math.max(50, oldest + this.windowMs - nowMs);
      this.buckets.set(key, existing);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs,
      };
    }

    existing.push(nowMs);
    this.buckets.set(key, existing);
    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - existing.length),
      retryAfterMs: 0,
    };
  }

  reset(key?: string): void {
    if (key) {
      this.buckets.delete(key);
    } else {
      this.buckets.clear();
    }
  }
}

// ============================================================================
// Payload Sanitization & Field Filtering
// ============================================================================

function sanitizeAnswerValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    return value.length > 4_000 ? `${value.slice(0, 4_000)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeAnswerValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_FIELD_KEY_PATTERN.test(k)) continue;
      out[k] = sanitizeAnswerValue(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

/**
 * Builds a clean, strictly-filtered outbound IntegrationEventPayload.
 * - Honors `integration.includedFieldIds` allowlist when configured.
 * - Strips any keys matching sensitive credential/secret/token patterns.
 * - Includes metadata and scoring/outcome only when enabled by the creator.
 */
export function buildSanitizedEventPayload(
  input: DispatchSubmissionEventInput,
  integration: Pick<
    FormIntegrationSummary,
    'includedFieldIds' | 'includeMetadata' | 'includeScoreAndOutcome'
  >,
  eventType: IntegrationEventType,
  eventId: string,
  deliveryId: string
): IntegrationEventPayload {
  const catalogById = new Map(
    (input.fieldCatalog || []).map((f) => [f.id, f])
  );
  const allowlist =
    Array.isArray(integration.includedFieldIds) && integration.includedFieldIds.length > 0
      ? new Set(integration.includedFieldIds)
      : null;

  const filteredAnswers: IntegrationEventPayload['response']['answers'] = {};

  for (const [fieldId, rawVal] of Object.entries(input.answers || {})) {
    if (allowlist && !allowlist.has(fieldId)) continue;
    const meta = catalogById.get(fieldId);
    const label = meta?.label || fieldId;
    if (SENSITIVE_FIELD_KEY_PATTERN.test(fieldId) || SENSITIVE_FIELD_KEY_PATTERN.test(label)) {
      continue;
    }
    filteredAnswers[fieldId] = {
      fieldId,
      label,
      type: meta?.type,
      value: sanitizeAnswerValue(rawVal),
    };
  }

  const payload: IntegrationEventPayload = {
    schemaVersion: INTEGRATIONS_SCHEMA_VERSION,
    event: eventType,
    eventId,
    deliveryId,
    timestamp: new Date().toISOString(),
    form: {
      id: input.formId,
      title: input.formTitle,
      ...(input.formSlug ? { slug: input.formSlug } : {}),
    },
    response: {
      id: input.submissionId,
      submittedAt: input.submittedAt,
      ...(typeof input.durationSeconds === 'number'
        ? { durationSeconds: input.durationSeconds }
        : {}),
      answers: filteredAnswers,
    },
  };

  if (integration.includeScoreAndOutcome) {
    if (
      typeof input.score === 'number' ||
      typeof input.maxScore === 'number' ||
      typeof input.scorePercent === 'number'
    ) {
      payload.scoring = {
        ...(typeof input.score === 'number' ? { score: input.score } : {}),
        ...(typeof input.maxScore === 'number' ? { maxScore: input.maxScore } : {}),
        ...(typeof input.scorePercent === 'number' ? { scorePercent: input.scorePercent } : {}),
        ...(input.categoryScores ? { categoryScores: input.categoryScores } : {}),
      };
    }
    if (input.outcomeId) {
      payload.outcome = {
        id: input.outcomeId,
        ...(input.outcomeName ? { name: input.outcomeName } : {}),
      };
    }
  }

  if (integration.includeMetadata) {
    payload.metadata = {
      ...(input.deviceInfo ? { deviceInfo: input.deviceInfo } : {}),
      ...(typeof input.isComplete === 'boolean' ? { isComplete: input.isComplete } : {}),
    };
  }

  return payload;
}
