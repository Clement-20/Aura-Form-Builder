/**
 * FlexStore Form Studio — Integrations & Webhooks Shared Contract
 *
 * Client-safe types shared between the Form Studio frontend, FormDocument
 * persistence layer, and the server-side integration execution engine.
 *
 * SECURITY INVARIANT:
 *   This module intentionally omits raw secrets (`signingSecret`, `authSecret`,
 *   OAuth tokens). Only non-sensitive metadata (`secretHint`, `secretVersion`,
 *   `hasAuthSecret`) is ever stored in FormDocument or returned to browsers.
 */

export const INTEGRATIONS_SCHEMA_VERSION = 1;

/**
 * Events genuinely emitted by the FlexStore Form Studio lifecycle.
 * Only supported events are listed — no speculative or unimplemented events.
 */
export type IntegrationEventType =
  | 'form.submitted'
  | 'response.completed'
  | 'outcome.triggered'
  | 'webhook.test';

export const SUBSCRIBABLE_INTEGRATION_EVENTS: readonly IntegrationEventType[] = [
  'form.submitted',
  'response.completed',
  'outcome.triggered',
] as const;

export const INTEGRATION_EVENT_META: Record<
  IntegrationEventType,
  { label: string; description: string }
> = {
  'form.submitted': {
    label: 'Form submitted',
    description: 'Fires whenever a respondent submits a validated form response.',
  },
  'response.completed': {
    label: 'Response completed',
    description: 'Fires when a full response completes validation and persistence.',
  },
  'outcome.triggered': {
    label: 'Outcome triggered',
    description: 'Fires when scoring or logic assigns a personalised outcome screen.',
  },
  'webhook.test': {
    label: 'Test ping',
    description: 'Synthetic verification payload sent when testing a connection.',
  },
};

export type IntegrationProviderId =
  | 'outbound_webhook'
  | 'slack_webhook'
  | 'external_api'
  | 'google_sheets'
  | 'google_drive'
  | 'email_service';

export type IntegrationCategory =
  | 'webhooks'
  | 'messaging'
  | 'developer'
  | 'spreadsheets'
  | 'storage'
  | 'email';

export type IntegrationAuthType =
  | 'hmac_secret'
  | 'webhook_url'
  | 'bearer_token'
  | 'api_key'
  | 'oauth2'
  | 'server_env';

/**
 * Connection status lifecycle:
 * - `setup_required`: Provider requires OAuth / server environment configuration first.
 * - `pending_verification`: Configured, awaiting live verification test.
 * - `connected`: Verified via a real successful provider test / auth handshake.
 * - `error`: Last verification or delivery failed.
 * - `disconnected`: Explicitly disconnected and credentials wiped.
 */
export type IntegrationConnectionStatus =
  | 'setup_required'
  | 'pending_verification'
  | 'connected'
  | 'error'
  | 'disconnected';

export type IntegrationAvailability =
  | 'available'
  | 'requires_oauth'
  | 'requires_server_env';

export interface IntegrationProviderMetadata {
  id: IntegrationProviderId;
  name: string;
  shortName: string;
  category: IntegrationCategory;
  description: string;
  authType: IntegrationAuthType;
  supportedEvents: IntegrationEventType[];
  availability: IntegrationAvailability;
  isConfiguredOnServer: boolean;
  setupInstructions: string;
  supportsFieldSelection: boolean;
  supportsSecretRotation: boolean;
  supportsCustomHeaders: boolean;
  endpointPlaceholder?: string;
  endpointHelper?: string;
}

/**
 * Client-safe summary of a configured form integration.
 * Contains ZERO secrets — safe to display in UI and reference in FormDocument.integrations.
 */
export interface FormIntegrationSummary {
  id: string;
  formId: string;
  providerId: IntegrationProviderId;
  name: string;
  enabled: boolean;
  status: IntegrationConnectionStatus;
  endpointUrl?: string;
  httpMethod?: 'POST' | 'PUT';
  authHeaderName?: string;
  hasAuthSecret?: boolean;
  recipientEmail?: string;
  events: IntegrationEventType[];
  /**
   * Explicit allowlist of component/field IDs whose answers are included in outbound payloads.
   * Empty array = include all non-sensitive form answers; non-empty = strict allowlist only.
   */
  includedFieldIds: string[];
  includeMetadata: boolean;
  includeScoreAndOutcome: boolean;
  /** Masked hint of the server-side HMAC signing secret (e.g., "whsec_••••a1b2"). */
  secretHint?: string;
  secretVersion: number;
  timeoutMs: number;
  maxRetries: number;
  lastError?: string | null;
  lastHttpStatus?: number | null;
  lastVerifiedAt?: string | null;
  lastDeliveredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type IntegrationDeliveryStatus =
  | 'queued'
  | 'delivering'
  | 'succeeded'
  | 'retrying'
  | 'failed'
  | 'rate_limited';

export interface IntegrationDeliveryLog {
  deliveryId: string;
  idempotencyKey: string;
  integrationId: string;
  integrationName: string;
  formId: string;
  providerId: IntegrationProviderId;
  eventType: IntegrationEventType;
  status: IntegrationDeliveryStatus;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: string | null;
  httpStatus?: number | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  troubleshootingHint?: string | null;
  responseSnippet?: string | null;
  requestPreview?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

/**
 * Structured, sanitized outbound event payload sent to webhook / API providers.
 */
export interface IntegrationEventPayload {
  schemaVersion: number;
  event: IntegrationEventType;
  eventId: string;
  deliveryId: string;
  timestamp: string;
  form: {
    id: string;
    title: string;
    slug?: string;
  };
  response: {
    id: string;
    submittedAt: string;
    durationSeconds?: number;
    answers: Record<
      string,
      {
        fieldId: string;
        label: string;
        type?: string;
        value: unknown;
      }
    >;
  };
  scoring?: {
    score?: number;
    maxScore?: number;
    scorePercent?: number;
    categoryScores?: Record<string, unknown>;
  };
  outcome?: {
    id: string;
    name?: string;
  };
  metadata?: {
    deviceInfo?: string;
    isComplete?: boolean;
  };
}

export interface CreateIntegrationInput {
  providerId: IntegrationProviderId;
  name: string;
  endpointUrl?: string;
  httpMethod?: 'POST' | 'PUT';
  authHeaderName?: string;
  /** Sent once to server over HTTPS/API; stored server-side only and never returned. */
  authSecret?: string;
  recipientEmail?: string;
  events: IntegrationEventType[];
  includedFieldIds?: string[];
  includeMetadata?: boolean;
  includeScoreAndOutcome?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
  enabled?: boolean;
}

export interface UpdateIntegrationInput {
  name?: string;
  endpointUrl?: string;
  httpMethod?: 'POST' | 'PUT';
  authHeaderName?: string;
  authSecret?: string;
  clearAuthSecret?: boolean;
  recipientEmail?: string;
  events?: IntegrationEventType[];
  includedFieldIds?: string[];
  includeMetadata?: boolean;
  includeScoreAndOutcome?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
  enabled?: boolean;
}

export interface DispatchSubmissionEventInput {
  formId: string;
  formTitle: string;
  formSlug?: string;
  submissionId: string;
  submittedAt: string;
  durationSeconds?: number;
  answers: Record<string, unknown>;
  fieldCatalog: Array<{
    id: string;
    label: string;
    type?: string;
  }>;
  score?: number;
  maxScore?: number;
  scorePercent?: number;
  categoryScores?: Record<string, unknown>;
  outcomeId?: string;
  outcomeName?: string;
  deviceInfo?: string;
  isComplete?: boolean;
}

/**
 * Strips any accidental secret properties before persisting integration metadata
 * into FormDocument.integrations.
 */
export function sanitizeIntegrationMetadataForDocument(
  integrations: unknown
): Record<string, unknown> {
  if (!integrations || typeof integrations !== 'object' || Array.isArray(integrations)) {
    return {};
  }
  const FORBIDDEN_SECRET_KEYS = new Set([
    'signingSecret',
    'previousSigningSecret',
    'authSecret',
    'secret',
    'accessToken',
    'refreshToken',
    'apiKey',
    'password',
    'token',
  ]);

  const cleanObject = (obj: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (FORBIDDEN_SECRET_KEYS.has(key)) continue;
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        out[key] = cleanObject(val as Record<string, unknown>);
      } else if (Array.isArray(val)) {
        out[key] = val.map((item) =>
          item && typeof item === 'object' && !Array.isArray(item)
            ? cleanObject(item as Record<string, unknown>)
            : item
        );
      } else {
        out[key] = val;
      }
    }
    return out;
  };

  return cleanObject(integrations as Record<string, unknown>);
}
