/**
 * Server-Side Integration & Delivery Log Store
 *
 * Isolates all credentials (`signingSecret`, `previousSigningSecret`, `authSecret`)
 * strictly on the server. Client-facing summaries are produced exclusively via
 * `toPublicSummary()`, which strips every secret field and exposes only a masked hint.
 */

import type {
  FormIntegrationSummary,
  IntegrationConnectionStatus,
  IntegrationDeliveryLog,
  IntegrationEventType,
  IntegrationProviderId,
} from '../../src/studio/integrations/types';
import { maskSecret } from './security';

export interface StoredIntegrationRecord {
  id: string;
  formId: string;
  ownerId: string;
  providerId: IntegrationProviderId;
  name: string;
  enabled: boolean;
  status: IntegrationConnectionStatus;
  endpointUrl?: string;
  httpMethod?: 'POST' | 'PUT';
  authHeaderName?: string;
  /** SERVER-ONLY: never serialized to client responses or FormDocument. */
  authSecret?: string;
  /** SERVER-ONLY: HMAC-SHA256 signing secret. */
  signingSecret?: string;
  /** SERVER-ONLY: Retained briefly for verification audit on rotation if needed, wiped on disconnect. */
  previousSigningSecret?: string;
  secretVersion: number;
  recipientEmail?: string;
  events: IntegrationEventType[];
  includedFieldIds: string[];
  includeMetadata: boolean;
  includeScoreAndOutcome: boolean;
  timeoutMs: number;
  maxRetries: number;
  lastError?: string | null;
  lastHttpStatus?: number | null;
  lastVerifiedAt?: string | null;
  lastDeliveredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoredDeliveryExecutionData {
  log: IntegrationDeliveryLog;
  /** Stored so manual retries can re-execute the exact sanitized event payload without exposing secrets. */
  payloadJson: string;
}

const MAX_DELIVERY_LOGS_PER_FORM = 150;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function toPublicSummary(record: StoredIntegrationRecord): FormIntegrationSummary {
  return {
    id: record.id,
    formId: record.formId,
    providerId: record.providerId,
    name: record.name,
    enabled: record.enabled,
    status: record.status,
    ...(record.endpointUrl ? { endpointUrl: record.endpointUrl } : {}),
    ...(record.httpMethod ? { httpMethod: record.httpMethod } : {}),
    ...(record.authHeaderName ? { authHeaderName: record.authHeaderName } : {}),
    hasAuthSecret: Boolean(record.authSecret),
    ...(record.recipientEmail ? { recipientEmail: record.recipientEmail } : {}),
    events: [...record.events],
    includedFieldIds: [...record.includedFieldIds],
    includeMetadata: record.includeMetadata,
    includeScoreAndOutcome: record.includeScoreAndOutcome,
    ...(record.signingSecret ? { secretHint: maskSecret(record.signingSecret) } : {}),
    secretVersion: record.secretVersion,
    timeoutMs: record.timeoutMs,
    maxRetries: record.maxRetries,
    lastError: record.lastError ?? null,
    lastHttpStatus: record.lastHttpStatus ?? null,
    lastVerifiedAt: record.lastVerifiedAt ?? null,
    lastDeliveredAt: record.lastDeliveredAt ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class IntegrationStore {
  private readonly records = new Map<string, StoredIntegrationRecord>();
  private readonly deliveries = new Map<string, StoredDeliveryExecutionData>();
  private readonly formDeliveryOrder = new Map<string, string[]>();
  private readonly idempotencyKeys = new Map<string, { deliveryId: string; recordedAt: number }>();

  saveIntegration(record: StoredIntegrationRecord): StoredIntegrationRecord {
    this.records.set(record.id, { ...record });
    return record;
  }

  getIntegration(id: string): StoredIntegrationRecord | undefined {
    const found = this.records.get(id);
    return found ? { ...found } : undefined;
  }

  listIntegrationsByForm(formId: string, ownerId?: string): StoredIntegrationRecord[] {
    const list: StoredIntegrationRecord[] = [];
    for (const record of this.records.values()) {
      if (record.formId !== formId) continue;
      if (ownerId && record.ownerId !== ownerId) continue;
      list.push({ ...record });
    }
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  listEnabledIntegrationsForEvent(
    formId: string,
    eventType: IntegrationEventType
  ): StoredIntegrationRecord[] {
    const list: StoredIntegrationRecord[] = [];
    for (const record of this.records.values()) {
      if (record.formId !== formId) continue;
      if (!record.enabled) continue;
      if (record.status === 'disconnected' || record.status === 'setup_required') continue;
      if (!record.events.includes(eventType)) continue;
      list.push({ ...record });
    }
    return list;
  }

  deleteIntegration(id: string): boolean {
    return this.records.delete(id);
  }

  // ---- Idempotency Deduplication ----

  getDeliveryIdByIdempotencyKey(key: string, nowMs: number = Date.now()): string | null {
    const entry = this.idempotencyKeys.get(key);
    if (!entry) return null;
    if (nowMs - entry.recordedAt > IDEMPOTENCY_TTL_MS) {
      this.idempotencyKeys.delete(key);
      return null;
    }
    return entry.deliveryId;
  }

  recordIdempotencyKey(key: string, deliveryId: string, nowMs: number = Date.now()): void {
    this.idempotencyKeys.set(key, { deliveryId, recordedAt: nowMs });
    // Prune opportunistically if map grows large
    if (this.idempotencyKeys.size > 5_000) {
      for (const [k, v] of this.idempotencyKeys.entries()) {
        if (nowMs - v.recordedAt > IDEMPOTENCY_TTL_MS) {
          this.idempotencyKeys.delete(k);
        }
      }
    }
  }

  // ---- Delivery Logs ----

  saveDelivery(data: StoredDeliveryExecutionData): void {
    const { deliveryId, formId } = data.log;
    const isNew = !this.deliveries.has(deliveryId);
    this.deliveries.set(deliveryId, {
      log: { ...data.log },
      payloadJson: data.payloadJson,
    });

    if (isNew) {
      const order = this.formDeliveryOrder.get(formId) || [];
      order.unshift(deliveryId);
      while (order.length > MAX_DELIVERY_LOGS_PER_FORM) {
        const evictedId = order.pop();
        if (evictedId) {
          this.deliveries.delete(evictedId);
        }
      }
      this.formDeliveryOrder.set(formId, order);
    }
  }

  getDelivery(deliveryId: string): StoredDeliveryExecutionData | undefined {
    const item = this.deliveries.get(deliveryId);
    if (!item) return undefined;
    return {
      log: { ...item.log },
      payloadJson: item.payloadJson,
    };
  }

  listDeliveriesByForm(
    formId: string,
    allowedIntegrationIds?: Set<string>,
    limit = 60
  ): IntegrationDeliveryLog[] {
    const order = this.formDeliveryOrder.get(formId) || [];
    const results: IntegrationDeliveryLog[] = [];
    for (const id of order) {
      const item = this.deliveries.get(id);
      if (!item) continue;
      if (allowedIntegrationIds && !allowedIntegrationIds.has(item.log.integrationId)) {
        continue;
      }
      results.push({ ...item.log });
      if (results.length >= limit) break;
    }
    return results;
  }
}
