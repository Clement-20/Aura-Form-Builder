/**
 * Server-Side Authentication & Ownership Verification for Integrations API
 *
 * Supports two verified caller authentication modes:
 *  1. Firebase Auth ID Tokens (RS256 verified against Google's official public
 *     X.509 certificates for `securetoken@system.gserviceaccount.com`, checking
 *     `iss`, `aud`, `exp`, and `sub`).
 *  2. Server-Signed Workspace Session Tokens (HMAC-SHA256) minted by
 *     `POST /api/integrations/session` for local-first browser sessions where
 *     the user has not signed in to Firebase Auth. Tokens are kept strictly in
 *     client memory (never written to localStorage).
 *
 * Every management endpoint enforces `record.ownerId === caller.ownerId`.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request } from 'express';

export interface AuthenticatedCaller {
  ownerId: string;
  authMethod: 'firebase' | 'workspace_session';
}

const SESSION_TOKEN_PREFIX = 'fws1';
const SESSION_TTL_SEC = 12 * 60 * 60; // 12 hours
const FIREBASE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

// Ephemeral per-process HMAC secret unless explicitly configured via server env
const WORKSPACE_SESSION_SECRET =
  process.env.INTEGRATIONS_SESSION_SECRET || crypto.randomBytes(32).toString('hex');

let cachedFirebaseProjectId: string | null | undefined;
let cachedGoogleCerts: { certs: Record<string, string>; expiresAtMs: number } | null = null;

function getFirebaseProjectId(): string | null {
  if (cachedFirebaseProjectId !== undefined) {
    return cachedFirebaseProjectId;
  }
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (typeof parsed?.projectId === 'string' && parsed.projectId.trim()) {
        const projectId = parsed.projectId.trim();
        cachedFirebaseProjectId = projectId;
        return projectId;
      }
    }
  } catch {
    // Ignore missing/unreadable config in local-only environments
  }
  cachedFirebaseProjectId = null;
  return null;
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

/**
 * Mints a server-signed HMAC-SHA256 workspace session token for local-first mode.
 */
export function mintWorkspaceSessionToken(requestedOwnerId?: string): {
  token: string;
  ownerId: string;
  expiresAt: string;
} {
  const safeOwnerId =
    requestedOwnerId && /^ws_[a-zA-Z0-9_-]{8,48}$/.test(requestedOwnerId)
      ? requestedOwnerId
      : `ws_${crypto.randomBytes(12).toString('hex')}`;

  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  const payloadJson = JSON.stringify({ sub: safeOwnerId, exp });
  const payloadB64 = base64UrlEncode(payloadJson);
  const sig = crypto
    .createHmac('sha256', WORKSPACE_SESSION_SECRET)
    .update(`${SESSION_TOKEN_PREFIX}.${payloadB64}`, 'utf8')
    .digest();
  const sigB64 = base64UrlEncode(sig);

  return {
    token: `${SESSION_TOKEN_PREFIX}.${payloadB64}.${sigB64}`,
    ownerId: safeOwnerId,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export function verifyWorkspaceSessionToken(token: string): AuthenticatedCaller | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== SESSION_TOKEN_PREFIX) return null;

  const [, payloadB64, sigB64] = parts;
  const expectedSig = crypto
    .createHmac('sha256', WORKSPACE_SESSION_SECRET)
    .update(`${SESSION_TOKEN_PREFIX}.${payloadB64}`, 'utf8')
    .digest();

  let actualSig: Buffer;
  try {
    actualSig = base64UrlDecode(sigB64);
  } catch {
    return null;
  }

  if (
    actualSig.length !== expectedSig.length ||
    !crypto.timingSafeEqual(actualSig, expectedSig)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
    if (
      typeof parsed?.sub !== 'string' ||
      !parsed.sub ||
      typeof parsed?.exp !== 'number' ||
      parsed.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return {
      ownerId: parsed.sub,
      authMethod: 'workspace_session',
    };
  } catch {
    return null;
  }
}

async function fetchGoogleFirebaseCerts(): Promise<Record<string, string>> {
  if (cachedGoogleCerts && Date.now() < cachedGoogleCerts.expiresAtMs) {
    return cachedGoogleCerts.certs;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(FIREBASE_CERTS_URL, { signal: controller.signal });
    if (!res.ok) return {};
    const certs = (await res.json()) as Record<string, string>;
    const cacheControl = res.headers.get('cache-control') || '';
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
    const maxAgeSec = maxAgeMatch ? Math.min(Number(maxAgeMatch[1]), 3600) : 600;
    cachedGoogleCerts = {
      certs,
      expiresAtMs: Date.now() + maxAgeSec * 1000,
    };
    return certs;
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cryptographically verifies a Firebase Auth ID token (RS256) against Google's
 * official public certificates and validates `iss`, `aud`, `exp`, and `sub`.
 */
export async function verifyFirebaseIdToken(token: string): Promise<AuthenticatedCaller | null> {
  const projectId = getFirebaseProjectId();
  if (!projectId) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  let header: { alg?: string; kid?: string };
  let payload: {
    iss?: string;
    aud?: string;
    sub?: string;
    exp?: number;
    iat?: number;
  };

  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'));
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
  } catch {
    return null;
  }

  if (header.alg !== 'RS256' || !header.kid) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  if (
    payload.aud !== projectId ||
    payload.iss !== `https://securetoken.google.com/${projectId}` ||
    typeof payload.sub !== 'string' ||
    !payload.sub ||
    typeof payload.exp !== 'number' ||
    payload.exp <= nowSec
  ) {
    return null;
  }

  const certs = await fetchGoogleFirebaseCerts();
  const pem = certs[header.kid];
  if (!pem) return null;

  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`, 'utf8');
    const signature = base64UrlDecode(sigB64);
    if (!verifier.verify(pem, signature)) {
      return null;
    }
    return {
      ownerId: `fb_${payload.sub}`,
      authMethod: 'firebase',
    };
  } catch {
    return null;
  }
}

export async function authenticateBearerToken(token: string): Promise<AuthenticatedCaller | null> {
  if (!token || typeof token !== 'string') return null;
  const trimmed = token.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith(`${SESSION_TOKEN_PREFIX}.`)) {
    return verifyWorkspaceSessionToken(trimmed);
  }
  return verifyFirebaseIdToken(trimmed);
}

export async function authenticateRequest(req: Request): Promise<AuthenticatedCaller | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  return authenticateBearerToken(token);
}
