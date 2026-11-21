/**
 * Frontend API Client for FlexStore Integrations & Webhooks
 *
 * Authentication handling:
 *  - Uses Firebase Auth ID Token (`firebaseUser.getIdToken()`) when signed in.
 *  - Falls back to a server-signed workspace session token stored strictly in
 *    JavaScript memory (NEVER written to localStorage/sessionStorage).
 *
 * Submission dispatch:
 *  - `dispatchFormSubmissionEvents()` is strictly non-blocking and swallows
 *    network errors so respondent form submissions never fail or hang.
 */

import type { User } from 'firebase/auth';
import type {
  CreateIntegrationInput,
  DispatchSubmissionEventInput,
  FormIntegrationSummary,
  IntegrationDeliveryLog,
  IntegrationProviderMetadata,
  UpdateIntegrationInput,
} from '../studio/integrations/types';

// Memory-only workspace session cache (never persisted to browser storage)
let memorySessionToken: string | null = null;
let memorySessionExpiresAtMs = 0;

export async function getStudioAuthHeader(firebaseUser?: User | null): Promise<Record<string, string>> {
  if (firebaseUser) {
    try {
      const idToken = await firebaseUser.getIdToken();
      if (idToken) {
        return { Authorization: `Bearer ${idToken}` };
      }
    } catch {
      // Fall through to workspace session if token refresh fails
    }
  }

  if (memorySessionToken && Date.now() < memorySessionExpiresAtMs - 60_000) {
    return { Authorization: `Bearer ${memorySessionToken}` };
  }

  const res = await fetch('/api/integrations/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error('Unable to initialize integration management session.');
  }
  const data = (await res.json()) as { token: string; ownerId: string; expiresAt: string };
  memorySessionToken = data.token;
  memorySessionExpiresAtMs = Date.parse(data.expiresAt) || Date.now() + 3600_000;
  return { Authorization: `Bearer ${memorySessionToken}` };
}

async function apiJson<T>(
  url: string,
  init: RequestInit,
  firebaseUser?: User | null
): Promise<T> {
  const auth = await getStudioAuthHeader(firebaseUser);
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...auth,
      ...(init.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data?.error === 'string'
        ? data.error
        : `Request failed with HTTP ${res.status}.`;
    throw new Error(msg);
  }
  return data as T;
}

export async function fetchFormIntegrations(
  formId: string,
  firebaseUser?: User | null
): Promise<{
  integrations: FormIntegrationSummary[];
  deliveries: IntegrationDeliveryLog[];
  providers: IntegrationProviderMetadata[];
}> {
  return apiJson(
    `/api/integrations/forms/${encodeURIComponent(formId)}`,
    { method: 'GET' },
    firebaseUser
  );
}

export async function createFormIntegration(
  formId: string,
  input: CreateIntegrationInput,
  firebaseUser?: User | null
): Promise<{
  integration: FormIntegrationSummary;
  signingSecretOnce?: string;
}> {
  return apiJson(
    `/api/integrations/forms/${encodeURIComponent(formId)}`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    firebaseUser
  );
}

export async function updateFormIntegration(
  formId: string,
  integrationId: string,
  patch: UpdateIntegrationInput,
  firebaseUser?: User | null
): Promise<{ integration: FormIntegrationSummary }> {
  return apiJson(
    `/api/integrations/forms/${encodeURIComponent(formId)}/${encodeURIComponent(integrationId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
    firebaseUser
  );
}

export async function testFormIntegration(
  formId: string,
  integrationId: string,
  context: {
    formTitle: string;
    formSlug?: string;
    fieldCatalog?: Array<{ id: string; label: string; type?: string }>;
  },
  firebaseUser?: User | null
): Promise<{
  ok: boolean;
  integration: FormIntegrationSummary;
  delivery: IntegrationDeliveryLog;
}> {
  return apiJson(
    `/api/integrations/forms/${encodeURIComponent(formId)}/${encodeURIComponent(integrationId)}/test`,
    {
      method: 'POST',
      body: JSON.stringify(context),
    },
    firebaseUser
  );
}

export async function rotateFormIntegrationSecret(
  formId: string,
  integrationId: string,
  firebaseUser?: User | null
): Promise<{
  integration: FormIntegrationSummary;
  signingSecretOnce: string;
}> {
  return apiJson(
    `/api/integrations/forms/${encodeURIComponent(formId)}/${encodeURIComponent(integrationId)}/rotate-secret`,
    { method: 'POST', body: JSON.stringify({}) },
    firebaseUser
  );
}

export async function disconnectFormIntegration(
  formId: string,
  integrationId: string,
  firebaseUser?: User | null
): Promise<{ integration: FormIntegrationSummary }> {
  return apiJson(
    `/api/integrations/forms/${encodeURIComponent(formId)}/${encodeURIComponent(integrationId)}/disconnect`,
    { method: 'POST', body: JSON.stringify({}) },
    firebaseUser
  );
}

export async function deleteFormIntegration(
  formId: string,
  integrationId: string,
  firebaseUser?: User | null
): Promise<{ deleted: boolean }> {
  return apiJson(
    `/api/integrations/forms/${encodeURIComponent(formId)}/${encodeURIComponent(integrationId)}`,
    { method: 'DELETE' },
    firebaseUser
  );
}

export async function previewFormIntegrationPayload(
  formId: string,
  integrationId: string,
  sampleInput: {
    formTitle: string;
    formSlug?: string;
    fieldCatalog: Array<{ id: string; label: string; type?: string }>;
  },
  firebaseUser?: User | null
): Promise<{
  providerFormat: string;
  payloadPreview: string;
  headersPreview: Record<string, string>;
}> {
  return apiJson(
    `/api/integrations/forms/${encodeURIComponent(formId)}/${encodeURIComponent(integrationId)}/preview-payload`,
    {
      method: 'POST',
      body: JSON.stringify(sampleInput),
    },
    firebaseUser
  );
}

export async function retryFormIntegrationDelivery(
  formId: string,
  deliveryId: string,
  firebaseUser?: User | null
): Promise<{ delivery: IntegrationDeliveryLog }> {
  return apiJson(
    `/api/integrations/forms/${encodeURIComponent(formId)}/deliveries/${encodeURIComponent(deliveryId)}/retry`,
    { method: 'POST', body: JSON.stringify({}) },
    firebaseUser
  );
}

/**
 * Non-blocking fire-and-forget dispatcher invoked by FormRunner after a response
 * is validated and persisted. Never throws or delays respondent confirmation.
 */
export function dispatchFormSubmissionEvents(input: DispatchSubmissionEventInput): void {
  try {
    void fetch('/api/integrations/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      keepalive: true,
    }).catch(() => {
      // Intentionally isolated: external integration unavailability must never affect submissions
    });
  } catch {
    // Intentionally isolated
  }
}
