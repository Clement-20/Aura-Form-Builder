/**
 * Central Integration Execution Engine & Asynchronous Retry Queue
 *
 * Responsibilities:
 *  - Lifecycle management: create, configure, verify/test, rotate secret, disconnect, delete
 *  - Honest connection state: `connected` ONLY after verified live provider handshake
 *  - Non-blocking asynchronous event delivery so form submission never fails or stalls
 *  - Idempotency key deduplication preventing duplicate external deliveries
 *  - Per-integration and per-form rate limiting
 *  - Bounded exponential backoff retries (with Retry-After support on HTTP 429)
 *  - Manual retry of failed deliveries
 */

import crypto from 'node:crypto';
import type {
  CreateIntegrationInput,
  DispatchSubmissionEventInput,
  FormIntegrationSummary,
  IntegrationDeliveryLog,
  IntegrationEventPayload,
  IntegrationEventType,
  IntegrationProviderMetadata,
  UpdateIntegrationInput,
} from '../../src/studio/integrations/types';
import {
  INTEGRATIONS_SCHEMA_VERSION,
  SUBSCRIBABLE_INTEGRATION_EVENTS,
} from '../../src/studio/integrations/types';
import {
  createDefaultProviderRegistry,
  type IntegrationProviderRegistry,
} from './registry';
import {
  buildSanitizedEventPayload,
  DEFAULT_TIMEOUT_MS,
  type DnsLookupFn,
  type FetchLikeFn,
  generateSigningSecret,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  safeFetchWithRedirectValidation,
  type SecurityValidationOptions,
  SlidingWindowRateLimiter,
} from './security';
import {
  IntegrationStore,
  type StoredIntegrationRecord,
  toPublicSummary,
} from './store';

export interface IntegrationEngineOptions {
  registry?: IntegrationProviderRegistry;
  store?: IntegrationStore;
  /** Override base retry delay in ms (default 1000ms -> 2000ms -> 4000ms; tests can set 10ms). */
  baseRetryDelayMs?: number;
  /** Maximum deliveries per integration per rate-limit window (default 30/min). */
  rateLimitMaxPerIntegration?: number;
  /** Rate limit window in ms (default 60_000ms). */
  rateLimitWindowMs?: number;
  /** Optional custom fetch implementation (for tests). */
  fetchImpl?: FetchLikeFn;
  /** Optional custom DNS lookup (for tests). */
  dnsLookup?: DnsLookupFn;
  /** TEST-ONLY: allow ephemeral local 127.0.0.1 HTTP test receivers. */
  allowUnsafeLoopbackForTests?: boolean;
}

export class IntegrationEngineError extends Error {
  readonly statusCode: number;
  readonly details?: string[];

  constructor(message: string, statusCode = 400, details?: string[]) {
    super(message);
    this.name = 'IntegrationEngineError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

function clampTimeout(ms?: number): number {
  if (typeof ms !== 'number' || Number.isNaN(ms)) return DEFAULT_TIMEOUT_MS;
  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.round(ms)));
}

function clampRetries(retries?: number): number {
  if (typeof retries !== 'number' || Number.isNaN(retries)) return 3;
  return Math.max(0, Math.min(5, Math.round(retries)));
}

function sanitizeEvents(events?: IntegrationEventType[]): IntegrationEventType[] {
  if (!Array.isArray(events)) return ['form.submitted'];
  const allowed = new Set<IntegrationEventType>(SUBSCRIBABLE_INTEGRATION_EVENTS);
  const filtered = Array.from(new Set(events.filter((e) => allowed.has(e))));
  return filtered;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export class IntegrationExecutionEngine {
  readonly registry: IntegrationProviderRegistry;
  readonly store: IntegrationStore;
  private readonly integrationRateLimiter: SlidingWindowRateLimiter;
  private readonly formRateLimiter: SlidingWindowRateLimiter;
  private readonly baseRetryDelayMs: number;
  private readonly fetchImpl?: FetchLikeFn;
  private readonly dnsLookup?: DnsLookupFn;
  private readonly allowUnsafeLoopbackForTests: boolean;
  private readonly activeJobs = new Set<Promise<void>>();
  private readonly scheduledTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(options: IntegrationEngineOptions = {}) {
    this.registry = options.registry ?? createDefaultProviderRegistry();
    this.store = options.store ?? new IntegrationStore();
    this.baseRetryDelayMs = options.baseRetryDelayMs ?? 1_000;
    this.fetchImpl = options.fetchImpl;
    this.dnsLookup = options.dnsLookup;
    this.allowUnsafeLoopbackForTests = Boolean(options.allowUnsafeLoopbackForTests);

    const windowMs = options.rateLimitWindowMs ?? 60_000;
    const perIntegration = options.rateLimitMaxPerIntegration ?? 30;
    this.integrationRateLimiter = new SlidingWindowRateLimiter(perIntegration, windowMs);
    this.formRateLimiter = new SlidingWindowRateLimiter(perIntegration * 4, windowMs);
  }

  private getSecurityOptions(extra?: SecurityValidationOptions): SecurityValidationOptions {
    return {
      ...extra,
      allowUnsafeLoopbackForTests: this.allowUnsafeLoopbackForTests,
      dnsLookup: this.dnsLookup,
    };
  }

  listProviders(): IntegrationProviderMetadata[] {
    return this.registry.listMetadata();
  }

  listFormIntegrations(formId: string, ownerId: string): FormIntegrationSummary[] {
    return this.store.listIntegrationsByForm(formId, ownerId).map(toPublicSummary);
  }

  listFormDeliveries(formId: string, ownerId: string, limit = 60): IntegrationDeliveryLog[] {
    const ownedIds = new Set(
      this.store.listIntegrationsByForm(formId, ownerId).map((r) => r.id)
    );
    return this.store.listDeliveriesByForm(formId, ownedIds, limit);
  }

  private assertOwnedRecord(
    formId: string,
    ownerId: string,
    integrationId: string
  ): StoredIntegrationRecord {
    const record = this.store.getIntegration(integrationId);
    if (!record || record.formId !== formId) {
      throw new IntegrationEngineError('Integration not found.', 404);
    }
    if (record.ownerId !== ownerId) {
      throw new IntegrationEngineError(
        'You do not have permission to access or modify this integration.',
        403
      );
    }
    return record;
  }

  async createIntegration(
    formId: string,
    ownerId: string,
    input: CreateIntegrationInput
  ): Promise<{ integration: FormIntegrationSummary; signingSecretOnce?: string }> {
    const provider = this.registry.get(input.providerId);
    if (!provider) {
      throw new IntegrationEngineError(`Unsupported provider "${input.providerId}".`, 400);
    }

    const meta = provider.getMetadata();
    if (meta.availability !== 'available') {
      throw new IntegrationEngineError(
        meta.setupInstructions || `${meta.name} requires setup before it can be connected.`,
        400
      );
    }

    const name = typeof input.name === 'string' && input.name.trim()
      ? input.name.trim().slice(0, 100)
      : meta.name;

    const events = sanitizeEvents(input.events);
    const validation = await provider.validateConfig(
      { ...input, events },
      this.getSecurityOptions()
    );
    if (!validation.valid) {
      throw new IntegrationEngineError(
        validation.errors[0] || 'Invalid integration configuration.',
        400,
        validation.errors
      );
    }

    const now = new Date().toISOString();
    const signingSecret = meta.supportsSecretRotation ? generateSigningSecret() : undefined;

    const record: StoredIntegrationRecord = {
      id: `int_${crypto.randomBytes(8).toString('hex')}`,
      formId,
      ownerId,
      providerId: input.providerId,
      name,
      enabled: input.enabled ?? true,
      // Honest lifecycle: never mark `connected` until live test succeeds
      status: 'pending_verification',
      endpointUrl: input.endpointUrl?.trim(),
      httpMethod: input.httpMethod === 'PUT' ? 'PUT' : 'POST',
      authHeaderName: input.authHeaderName?.trim() || undefined,
      authSecret: input.authSecret?.trim() || undefined,
      signingSecret,
      secretVersion: signingSecret ? 1 : 0,
      recipientEmail: input.recipientEmail?.trim() || undefined,
      events,
      includedFieldIds: Array.isArray(input.includedFieldIds)
        ? Array.from(new Set(input.includedFieldIds.filter((x) => typeof x === 'string' && x.trim())))
        : [],
      includeMetadata: input.includeMetadata ?? true,
      includeScoreAndOutcome: input.includeScoreAndOutcome ?? true,
      timeoutMs: clampTimeout(input.timeoutMs),
      maxRetries: clampRetries(input.maxRetries),
      lastError: null,
      lastHttpStatus: null,
      lastVerifiedAt: null,
      lastDeliveredAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.store.saveIntegration(record);

    return {
      integration: toPublicSummary(record),
      // Plaintext signing secret returned ONCE on creation
      ...(signingSecret ? { signingSecretOnce: signingSecret } : {}),
    };
  }

  async updateIntegration(
    formId: string,
    ownerId: string,
    integrationId: string,
    patch: UpdateIntegrationInput
  ): Promise<FormIntegrationSummary> {
    const existing = this.assertOwnedRecord(formId, ownerId, integrationId);
    const provider = this.registry.get(existing.providerId);
    if (!provider) {
      throw new IntegrationEngineError('Provider is no longer registered.', 400);
    }

    const nextEndpoint =
      patch.endpointUrl !== undefined ? patch.endpointUrl.trim() : existing.endpointUrl;
    const nextMethod =
      patch.httpMethod !== undefined
        ? patch.httpMethod === 'PUT'
          ? 'PUT'
          : 'POST'
        : existing.httpMethod;
    const nextAuthHeader =
      patch.authHeaderName !== undefined
        ? patch.authHeaderName.trim() || undefined
        : existing.authHeaderName;
    const nextAuthSecret = patch.clearAuthSecret
      ? undefined
      : patch.authSecret !== undefined && patch.authSecret.trim()
        ? patch.authSecret.trim()
        : existing.authSecret;
    const nextRecipient =
      patch.recipientEmail !== undefined
        ? patch.recipientEmail.trim() || undefined
        : existing.recipientEmail;
    const nextEvents =
      patch.events !== undefined ? sanitizeEvents(patch.events) : existing.events;

    const endpointOrAuthChanged =
      nextEndpoint !== existing.endpointUrl ||
      nextAuthHeader !== existing.authHeaderName ||
      nextAuthSecret !== existing.authSecret ||
      nextRecipient !== existing.recipientEmail;

    if (
      patch.endpointUrl !== undefined ||
      patch.httpMethod !== undefined ||
      patch.authHeaderName !== undefined ||
      patch.recipientEmail !== undefined ||
      patch.events !== undefined
    ) {
      const validation = await provider.validateConfig(
        {
          providerId: existing.providerId,
          endpointUrl: nextEndpoint,
          httpMethod: nextMethod,
          authHeaderName: nextAuthHeader,
          recipientEmail: nextRecipient,
          events: nextEvents,
        },
        this.getSecurityOptions()
      );
      if (!validation.valid) {
        throw new IntegrationEngineError(
          validation.errors[0] || 'Invalid integration configuration.',
          400,
          validation.errors
        );
      }
    }

    const updated: StoredIntegrationRecord = {
      ...existing,
      name:
        typeof patch.name === 'string' && patch.name.trim()
          ? patch.name.trim().slice(0, 100)
          : existing.name,
      endpointUrl: nextEndpoint,
      httpMethod: nextMethod,
      authHeaderName: nextAuthHeader,
      authSecret: nextAuthSecret,
      recipientEmail: nextRecipient,
      events: nextEvents,
      includedFieldIds:
        patch.includedFieldIds !== undefined
          ? Array.from(
              new Set(patch.includedFieldIds.filter((x) => typeof x === 'string' && x.trim()))
            )
          : existing.includedFieldIds,
      includeMetadata:
        patch.includeMetadata !== undefined ? patch.includeMetadata : existing.includeMetadata,
      includeScoreAndOutcome:
        patch.includeScoreAndOutcome !== undefined
          ? patch.includeScoreAndOutcome
          : existing.includeScoreAndOutcome,
      timeoutMs:
        patch.timeoutMs !== undefined ? clampTimeout(patch.timeoutMs) : existing.timeoutMs,
      maxRetries:
        patch.maxRetries !== undefined ? clampRetries(patch.maxRetries) : existing.maxRetries,
      enabled: patch.enabled !== undefined ? patch.enabled : existing.enabled,
      // If destination or credentials changed, require fresh verification before `connected`
      status: endpointOrAuthChanged
        ? 'pending_verification'
        : existing.status === 'disconnected' && patch.enabled
          ? 'pending_verification'
          : existing.status,
      lastError: endpointOrAuthChanged ? null : existing.lastError,
      updatedAt: new Date().toISOString(),
    };

    // Re-issue signing secret if disconnected webhook is being re-configured
    if (!updated.signingSecret && provider.getMetadata().supportsSecretRotation) {
      updated.signingSecret = generateSigningSecret();
      updated.secretVersion = (updated.secretVersion || 0) + 1;
    }

    this.store.saveIntegration(updated);
    return toPublicSummary(updated);
  }

  rotateSecret(
    formId: string,
    ownerId: string,
    integrationId: string
  ): { integration: FormIntegrationSummary; signingSecretOnce: string } {
    const existing = this.assertOwnedRecord(formId, ownerId, integrationId);
    const provider = this.registry.get(existing.providerId);
    if (!provider || !provider.getMetadata().supportsSecretRotation) {
      throw new IntegrationEngineError(
        'This integration provider does not use a signing secret.',
        400
      );
    }

    const nextSecret = generateSigningSecret();
    const updated: StoredIntegrationRecord = {
      ...existing,
      previousSigningSecret: existing.signingSecret,
      signingSecret: nextSecret,
      secretVersion: (existing.secretVersion || 0) + 1,
      updatedAt: new Date().toISOString(),
    };

    this.store.saveIntegration(updated);
    return {
      integration: toPublicSummary(updated),
      signingSecretOnce: nextSecret,
    };
  }

  disconnectIntegration(
    formId: string,
    ownerId: string,
    integrationId: string
  ): FormIntegrationSummary {
    const existing = this.assertOwnedRecord(formId, ownerId, integrationId);
    const disconnected: StoredIntegrationRecord = {
      ...existing,
      enabled: false,
      status: 'disconnected',
      signingSecret: undefined,
      previousSigningSecret: undefined,
      authSecret: undefined,
      lastError: null,
      updatedAt: new Date().toISOString(),
    };
    this.store.saveIntegration(disconnected);
    return toPublicSummary(disconnected);
  }

  deleteIntegration(formId: string, ownerId: string, integrationId: string): void {
    this.assertOwnedRecord(formId, ownerId, integrationId);
    this.store.deleteIntegration(integrationId);
  }

  previewPayload(
    formId: string,
    ownerId: string,
    integrationId: string,
    sampleInput: {
      formTitle: string;
      formSlug?: string;
      fieldCatalog: Array<{ id: string; label: string; type?: string }>;
      sampleAnswers?: Record<string, unknown>;
    }
  ): {
    providerFormat: string;
    payloadPreview: string;
    headersPreview: Record<string, string>;
  } {
    const record = this.assertOwnedRecord(formId, ownerId, integrationId);
    const provider = this.registry.get(record.providerId);
    if (!provider) {
      throw new IntegrationEngineError('Provider not found.', 404);
    }

    const sampleAnswers: Record<string, unknown> = sampleInput.sampleAnswers ?? {};
    if (Object.keys(sampleAnswers).length === 0) {
      for (const field of sampleInput.fieldCatalog || []) {
        sampleAnswers[field.id] =
          field.type === 'email'
            ? 'alex.morgan@example.com'
            : field.type === 'number' || field.type === 'rating' || field.type === 'scale'
              ? 5
              : field.type === 'checkbox'
                ? ['Option A']
                : `Sample ${field.label || field.id}`;
      }
    }

    const previewEvent: IntegrationEventType = record.events[0] || 'form.submitted';
    const payload = buildSanitizedEventPayload(
      {
        formId,
        formTitle: sampleInput.formTitle || 'Untitled Form',
        formSlug: sampleInput.formSlug,
        submissionId: 'sub_preview_001',
        submittedAt: new Date().toISOString(),
        durationSeconds: 42,
        answers: sampleAnswers,
        fieldCatalog: sampleInput.fieldCatalog || [],
        score: 85,
        maxScore: 100,
        scorePercent: 85,
        outcomeId: 'outcome_qualified',
        outcomeName: 'Qualified Lead',
        deviceInfo: 'Desktop',
        isComplete: true,
      },
      toPublicSummary(record),
      previewEvent,
      'evt_preview_001',
      'dlv_preview_001'
    );

    const built = provider.buildRequest({
      integrationId: record.id,
      integrationName: record.name,
      endpointUrl: record.endpointUrl || 'https://api.example.com/webhook',
      httpMethod: record.httpMethod,
      authHeaderName: record.authHeaderName,
      // Never pass real authSecret into preview header output
      authSecret: record.authSecret ? '[REDACTED_SERVER_SECRET]' : undefined,
      signingSecret: record.signingSecret || 'whsec_preview_only',
      recipientEmail: record.recipientEmail,
      eventType: previewEvent,
      deliveryId: 'dlv_preview_001',
      idempotencyKey: `${record.id}:${previewEvent}:sub_preview_001`,
      payload,
    });

    // Redact any sensitive auth header values from preview headers
    const safeHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(built.headers)) {
      if (
        k.toLowerCase() === 'authorization' ||
        (record.authHeaderName && k.toLowerCase() === record.authHeaderName.toLowerCase())
      ) {
        safeHeaders[k] = '•••••••• (stored server-side)';
      } else {
        safeHeaders[k] = v;
      }
    }

    return {
      providerFormat: provider.getMetadata().shortName,
      payloadPreview: built.requestPreview,
      headersPreview: safeHeaders,
    };
  }

  /**
   * Sends a live verification test event to the configured provider endpoint.
   * ONLY transitions `status` to `'connected'` if the external provider responds with 2xx.
   */
  async testIntegration(
    formId: string,
    ownerId: string,
    integrationId: string,
    context: {
      formTitle: string;
      formSlug?: string;
      fieldCatalog?: Array<{ id: string; label: string; type?: string }>;
    }
  ): Promise<{
    ok: boolean;
    integration: FormIntegrationSummary;
    delivery: IntegrationDeliveryLog;
  }> {
    const record = this.assertOwnedRecord(formId, ownerId, integrationId);
    const provider = this.registry.get(record.providerId);
    if (!provider) {
      throw new IntegrationEngineError('Provider not found.', 404);
    }

    if (record.status === 'disconnected') {
      throw new IntegrationEngineError(
        'This integration is disconnected. Re-save your endpoint or credentials before testing.',
        400
      );
    }

    const rate = this.integrationRateLimiter.consume(`test:${record.id}`);
    if (!rate.allowed) {
      throw new IntegrationEngineError(
        `Too many test requests. Please wait ${Math.ceil(rate.retryAfterMs / 1000)}s before testing again.`,
        429
      );
    }

    const deliveryId = `dlv_test_${crypto.randomBytes(8).toString('hex')}`;
    const eventId = `evt_test_${crypto.randomBytes(6).toString('hex')}`;
    const idempotencyKey = `${record.id}:webhook.test:${deliveryId}`;

    const sampleAnswers: Record<string, unknown> = {};
    for (const field of (context.fieldCatalog || []).slice(0, 4)) {
      sampleAnswers[field.id] = `Test response (${field.label || field.id})`;
    }
    if (Object.keys(sampleAnswers).length === 0) {
      sampleAnswers.sample_field = 'FlexStore connection verification';
    }

    const payload = buildSanitizedEventPayload(
      {
        formId,
        formTitle: context.formTitle || 'FlexStore Form',
        formSlug: context.formSlug,
        submissionId: `sub_test_${crypto.randomBytes(4).toString('hex')}`,
        submittedAt: new Date().toISOString(),
        durationSeconds: 12,
        answers: sampleAnswers,
        fieldCatalog: context.fieldCatalog || [
          { id: 'sample_field', label: 'Sample Field', type: 'text' },
        ],
        deviceInfo: 'Connection Verification Test',
        isComplete: true,
      },
      toPublicSummary(record),
      'webhook.test',
      eventId,
      deliveryId
    );

    const log = await this.executeSingleDeliveryAttempt(record, payload, {
      deliveryId,
      idempotencyKey,
      eventType: 'webhook.test',
      attempt: 1,
      maxAttempts: 1,
      allowAutoRetry: false,
    });

    const now = new Date().toISOString();
    const updatedRecord: StoredIntegrationRecord = {
      ...record,
      status: log.status === 'succeeded' ? 'connected' : 'error',
      lastHttpStatus: log.httpStatus ?? null,
      lastError: log.status === 'succeeded' ? null : log.errorMessage ?? 'Connection test failed.',
      lastVerifiedAt: log.status === 'succeeded' ? now : record.lastVerifiedAt,
      lastDeliveredAt: log.status === 'succeeded' ? now : record.lastDeliveredAt,
      updatedAt: now,
    };
    this.store.saveIntegration(updatedRecord);

    return {
      ok: log.status === 'succeeded',
      integration: toPublicSummary(updatedRecord),
      delivery: log,
    };
  }

  /**
   * Non-blocking asynchronous event dispatcher triggered after a form submission succeeds.
   * Immediately queues matching deliveries and returns so form submission never fails or blocks.
   */
  enqueueSubmissionEvents(input: DispatchSubmissionEventInput): {
    queuedDeliveryIds: string[];
    skippedDuplicates: number;
    rateLimited: number;
  } {
    const eventsToEmit: IntegrationEventType[] = ['form.submitted'];
    if (input.isComplete !== false) {
      eventsToEmit.push('response.completed');
    }
    if (input.outcomeId) {
      eventsToEmit.push('outcome.triggered');
    }

    const queuedDeliveryIds: string[] = [];
    let skippedDuplicates = 0;
    let rateLimited = 0;

    for (const eventType of eventsToEmit) {
      const matchingIntegrations = this.store.listEnabledIntegrationsForEvent(
        input.formId,
        eventType
      );

      for (const record of matchingIntegrations) {
        const idempotencyKey = `${record.id}:${eventType}:${input.submissionId}`;
        if (this.store.getDeliveryIdByIdempotencyKey(idempotencyKey)) {
          skippedDuplicates += 1;
          continue;
        }

        const deliveryId = `dlv_${crypto.randomBytes(8).toString('hex')}`;
        const eventId = `evt_${crypto.randomBytes(6).toString('hex')}`;
        const now = new Date().toISOString();

        const payload = buildSanitizedEventPayload(
          input,
          toPublicSummary(record),
          eventType,
          eventId,
          deliveryId
        );

        // Enforce per-form and per-integration rate limits
        const formLimit = this.formRateLimiter.consume(`form:${input.formId}`);
        const intLimit = this.integrationRateLimiter.consume(`int:${record.id}`);

        if (!formLimit.allowed || !intLimit.allowed) {
          rateLimited += 1;
          const retryMs = Math.max(formLimit.retryAfterMs, intLimit.retryAfterMs);
          this.store.saveDelivery({
            log: {
              deliveryId,
              idempotencyKey,
              integrationId: record.id,
              integrationName: record.name,
              formId: record.formId,
              providerId: record.providerId,
              eventType,
              status: 'rate_limited',
              attempts: 0,
              maxAttempts: record.maxRetries + 1,
              nextRetryAt: new Date(Date.now() + retryMs).toISOString(),
              httpStatus: 429,
              durationMs: 0,
              errorMessage: 'Outbound integration rate limit exceeded.',
              troubleshootingHint:
                'Delivery was paused to protect destination endpoints. Use Retry Now once volume subsides.',
              requestPreview: JSON.stringify(payload, null, 2),
              createdAt: now,
              updatedAt: now,
              completedAt: now,
            },
            payloadJson: JSON.stringify(payload),
          });
          continue;
        }

        this.store.recordIdempotencyKey(idempotencyKey, deliveryId);

        const initialLog: IntegrationDeliveryLog = {
          deliveryId,
          idempotencyKey,
          integrationId: record.id,
          integrationName: record.name,
          formId: record.formId,
          providerId: record.providerId,
          eventType,
          status: 'queued',
          attempts: 0,
          maxAttempts: record.maxRetries + 1,
          nextRetryAt: null,
          httpStatus: null,
          durationMs: null,
          errorMessage: null,
          troubleshootingHint: null,
          responseSnippet: null,
          requestPreview: JSON.stringify(payload, null, 2),
          createdAt: now,
          updatedAt: now,
          completedAt: null,
        };

        this.store.saveDelivery({
          log: initialLog,
          payloadJson: JSON.stringify(payload),
        });

        queuedDeliveryIds.push(deliveryId);

        // Schedule execution asynchronously on the next microtask/tick so caller returns immediately
        this.scheduleAsyncJob(async () => {
          await this.executeWithRetries(record.id, payload, {
            deliveryId,
            idempotencyKey,
            eventType,
            startingAttempt: 1,
            maxAttempts: record.maxRetries + 1,
          });
        });
      }
    }

    return { queuedDeliveryIds, skippedDuplicates, rateLimited };
  }

  /**
   * Manually retries a failed or rate-limited delivery for an owned integration.
   */
  async retryDelivery(
    formId: string,
    ownerId: string,
    deliveryId: string
  ): Promise<IntegrationDeliveryLog> {
    const stored = this.store.getDelivery(deliveryId);
    if (!stored || stored.log.formId !== formId) {
      throw new IntegrationEngineError('Delivery record not found.', 404);
    }

    const record = this.assertOwnedRecord(formId, ownerId, stored.log.integrationId);
    if (record.status === 'disconnected') {
      throw new IntegrationEngineError(
        'Cannot retry delivery for a disconnected integration.',
        400
      );
    }

    let payload: IntegrationEventPayload;
    try {
      payload = JSON.parse(stored.payloadJson) as IntegrationEventPayload;
    } catch {
      throw new IntegrationEngineError('Stored delivery payload is invalid.', 500);
    }

    const nextAttempt = stored.log.attempts + 1;
    return this.executeSingleDeliveryAttempt(record, payload, {
      deliveryId: stored.log.deliveryId,
      idempotencyKey: stored.log.idempotencyKey,
      eventType: stored.log.eventType,
      attempt: nextAttempt,
      maxAttempts: Math.max(stored.log.maxAttempts, nextAttempt),
      allowAutoRetry: false,
    });
  }

  private scheduleAsyncJob(task: () => Promise<void>): void {
    const wrapped = (async () => {
      try {
        await task();
      } catch {
        // Isolated: async integration failures never crash the server process
      }
    })();

    this.activeJobs.add(wrapped);
    wrapped.finally(() => {
      this.activeJobs.delete(wrapped);
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.scheduledTimers.delete(timer);
        resolve();
      }, ms);
      this.scheduledTimers.add(timer);
    });
  }

  private async executeWithRetries(
    integrationId: string,
    payload: IntegrationEventPayload,
    opts: {
      deliveryId: string;
      idempotencyKey: string;
      eventType: IntegrationEventType;
      startingAttempt: number;
      maxAttempts: number;
    }
  ): Promise<void> {
    let attempt = opts.startingAttempt;

    while (attempt <= opts.maxAttempts) {
      const latestRecord = this.store.getIntegration(integrationId);
      if (!latestRecord || !latestRecord.enabled || latestRecord.status === 'disconnected') {
        return;
      }

      const result = await this.executeSingleDeliveryAttempt(latestRecord, payload, {
        deliveryId: opts.deliveryId,
        idempotencyKey: opts.idempotencyKey,
        eventType: opts.eventType,
        attempt,
        maxAttempts: opts.maxAttempts,
        allowAutoRetry: attempt < opts.maxAttempts,
      });

      if (result.status === 'succeeded' || result.status === 'failed') {
        // Update integration last delivery diagnostics
        const current = this.store.getIntegration(integrationId);
        if (current) {
          this.store.saveIntegration({
            ...current,
            lastHttpStatus: result.httpStatus ?? null,
            lastError: result.status === 'succeeded' ? null : result.errorMessage ?? null,
            lastDeliveredAt:
              result.status === 'succeeded' ? new Date().toISOString() : current.lastDeliveredAt,
            updatedAt: new Date().toISOString(),
          });
        }
        return;
      }

      // result.status === 'retrying'
      const waitMs = result.nextRetryAt
        ? Math.max(10, Date.parse(result.nextRetryAt) - Date.now())
        : this.computeBackoffMs(attempt);

      await this.delay(waitMs);
      attempt += 1;
    }
  }

  private computeBackoffMs(attempt: number, retryAfterMs?: number): number {
    if (typeof retryAfterMs === 'number' && retryAfterMs > 0) {
      return Math.min(retryAfterMs, 60_000);
    }
    const exponential = this.baseRetryDelayMs * Math.pow(2, Math.max(0, attempt - 1));
    const jitter = Math.floor(Math.random() * Math.max(5, Math.floor(exponential * 0.2)));
    return Math.min(exponential + jitter, 30_000);
  }

  private async executeSingleDeliveryAttempt(
    record: StoredIntegrationRecord,
    payload: IntegrationEventPayload,
    opts: {
      deliveryId: string;
      idempotencyKey: string;
      eventType: IntegrationEventType;
      attempt: number;
      maxAttempts: number;
      allowAutoRetry: boolean;
    }
  ): Promise<IntegrationDeliveryLog> {
    const provider = this.registry.get(record.providerId);
    const existingStored = this.store.getDelivery(opts.deliveryId);
    const createdAt = existingStored?.log.createdAt || new Date().toISOString();

    const saveState = (patch: Partial<IntegrationDeliveryLog>): IntegrationDeliveryLog => {
      const now = new Date().toISOString();
      const log: IntegrationDeliveryLog = {
        deliveryId: opts.deliveryId,
        idempotencyKey: opts.idempotencyKey,
        integrationId: record.id,
        integrationName: record.name,
        formId: record.formId,
        providerId: record.providerId,
        eventType: opts.eventType,
        status: 'delivering',
        attempts: opts.attempt,
        maxAttempts: opts.maxAttempts,
        nextRetryAt: null,
        httpStatus: null,
        durationMs: null,
        errorMessage: null,
        troubleshootingHint: null,
        responseSnippet: null,
        requestPreview: existingStored?.log.requestPreview || JSON.stringify(payload, null, 2),
        createdAt,
        updatedAt: now,
        completedAt: null,
        ...patch,
      };
      this.store.saveDelivery({
        log,
        payloadJson: JSON.stringify(payload),
      });
      return log;
    };

    if (!provider) {
      return saveState({
        status: 'failed',
        errorMessage: `Provider "${record.providerId}" is not available.`,
        completedAt: new Date().toISOString(),
      });
    }

    let built;
    try {
      built = provider.buildRequest({
        integrationId: record.id,
        integrationName: record.name,
        endpointUrl: record.endpointUrl,
        httpMethod: record.httpMethod,
        authHeaderName: record.authHeaderName,
        authSecret: record.authSecret,
        signingSecret: record.signingSecret,
        recipientEmail: record.recipientEmail,
        eventType: opts.eventType,
        deliveryId: opts.deliveryId,
        idempotencyKey: opts.idempotencyKey,
        payload,
      });
    } catch (err: unknown) {
      return saveState({
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Failed to build provider request.',
        completedAt: new Date().toISOString(),
      });
    }

    saveState({
      status: 'delivering',
      requestPreview: built.requestPreview,
    });

    const startedAt = Date.now();
    try {
      const fetchRes = await safeFetchWithRedirectValidation(
        built.url,
        {
          method: built.method,
          headers: built.headers,
          body: built.body,
        },
        {
          ...this.getSecurityOptions(built.securityOptions),
          timeoutMs: record.timeoutMs,
          fetchImpl: this.fetchImpl,
        }
      );

      const evaluation = provider.evaluateResponse(fetchRes.status, fetchRes.responseSnippet);
      if (evaluation.ok) {
        return saveState({
          status: 'succeeded',
          httpStatus: fetchRes.status,
          durationMs: fetchRes.durationMs,
          responseSnippet: fetchRes.responseSnippet || null,
          requestPreview: built.requestPreview,
          completedAt: new Date().toISOString(),
        });
      }

      const shouldRetry = opts.allowAutoRetry && isRetryableStatus(fetchRes.status);
      if (shouldRetry) {
        const waitMs = this.computeBackoffMs(opts.attempt, fetchRes.retryAfterMs);
        return saveState({
          status: 'retrying',
          httpStatus: fetchRes.status,
          durationMs: fetchRes.durationMs,
          responseSnippet: fetchRes.responseSnippet || null,
          errorMessage: evaluation.errorMessage || `HTTP ${fetchRes.status}`,
          troubleshootingHint: evaluation.troubleshootingHint || null,
          nextRetryAt: new Date(Date.now() + waitMs).toISOString(),
          requestPreview: built.requestPreview,
        });
      }

      return saveState({
        status: 'failed',
        httpStatus: fetchRes.status,
        durationMs: fetchRes.durationMs,
        responseSnippet: fetchRes.responseSnippet || null,
        errorMessage: evaluation.errorMessage || `HTTP ${fetchRes.status}`,
        troubleshootingHint: evaluation.troubleshootingHint || null,
        requestPreview: built.requestPreview,
        completedAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Outbound delivery failed.';
      const durationMs = Math.max(1, Date.now() - startedAt);
      const isPermanentSecurityOrSizeError =
        errMsg.includes('exceeds maximum limit') ||
        errMsg.includes('Only HTTPS') ||
        errMsg.includes('private, loopback, or reserved') ||
        errMsg.includes('blocked') ||
        errMsg.includes('Too many redirects') ||
        errMsg.includes('embedded credentials');

      const shouldRetry = opts.allowAutoRetry && !isPermanentSecurityOrSizeError;
      if (shouldRetry) {
        const waitMs = this.computeBackoffMs(opts.attempt);
        return saveState({
          status: 'retrying',
          durationMs,
          errorMessage: errMsg,
          troubleshootingHint:
            'Temporary network or timeout failure — FlexStore will retry automatically with backoff.',
          nextRetryAt: new Date(Date.now() + waitMs).toISOString(),
          requestPreview: built.requestPreview,
        });
      }

      return saveState({
        status: 'failed',
        durationMs,
        errorMessage: errMsg,
        troubleshootingHint: isPermanentSecurityOrSizeError
          ? 'Verify the destination URL is a public HTTPS endpoint and payload size stays under 256 KB.'
          : 'Check endpoint reachability, TLS certificate, and response timeout.',
        requestPreview: built.requestPreview,
        completedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Waits for all queued asynchronous deliveries and retry timers to settle.
   * Used in automated tests for deterministic assertions.
   */
  async waitForIdle(timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this.activeJobs.size > 0 && Date.now() < deadline) {
      await Promise.all(Array.from(this.activeJobs));
    }
  }

  /**
   * Cancels any pending retry timers (useful for clean shutdown in tests).
   */
  dispose(): void {
    for (const timer of this.scheduledTimers) {
      clearTimeout(timer);
    }
    this.scheduledTimers.clear();
  }
}

export function createIntegrationEngine(
  options?: IntegrationEngineOptions
): IntegrationExecutionEngine {
  return new IntegrationExecutionEngine(options);
}

export const INTEGRATION_ENGINE_SCHEMA_VERSION = INTEGRATIONS_SCHEMA_VERSION;
