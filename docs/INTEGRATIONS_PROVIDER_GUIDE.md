# FlexStore Form Studio — Integration Provider Extension Guide

This guide explains how the FlexStore Integrations & Webhooks framework is structured and how to add new integration providers without modifying the core form engine, submission pipeline, or execution queue.

---

## Architecture Overview

Provider-specific logic is isolated from the form studio engine and runner:

1. **Shared Client-Safe Contract** (`src/studio/integrations/types.ts`)
   - Defines `IntegrationProviderId`, `IntegrationEventType`, `FormIntegrationSummary`, `IntegrationDeliveryLog`, and `IntegrationEventPayload`.
   - Enforces the invariant that secrets never enter `FormDocument` or browser responses.
2. **Server Security Layer** (`server/integrations/security.ts`)
   - `validateOutboundUrl`: enforces HTTPS-only endpoints, blocks embedded credentials, blocks internal/localhost/cloud-metadata hostnames, checks IP literals, and resolves DNS to verify every IPv4/IPv6 record is publicly routable.
   - `safeFetchWithRedirectValidation`: enforces payload byte cap (256 KB), strict `AbortController` timeouts (1s–15s), and manual redirect re-validation (max 3 hops).
   - `signWebhookPayload` / `verifyWebhookSignature`: HMAC-SHA256 signing over `${timestamp}.${rawBody}` with constant-time verification and replay window protection.
   - `SlidingWindowRateLimiter` & `buildSanitizedEventPayload`: per-integration/per-form rate limiting and strict field allowlist filtering.
3. **Provider Registry** (`server/integrations/registry.ts`)
   - Central `IntegrationProviderRegistry` storing all `IntegrationProvider` implementations.
4. **Execution Engine & Async Queue** (`server/integrations/engine.ts`)
   - Handles connection lifecycle (`pending_verification` → `connected` only on verified 2xx test), secret rotation, disconnect credential wipe, non-blocking submission dispatch, idempotency deduplication, bounded exponential backoff retries, and manual delivery retries.
5. **Authenticated API Router** (`server/integrations/routes.ts`)
   - Mounts `/api/integrations/*` in `server.ts`, verifying caller authentication (Firebase ID token or server-signed workspace session) and enforcing owner isolation.

---

## Adding a New Provider (Step-by-Step)

### 1. Register the Provider ID
Add your new identifier to `IntegrationProviderId` in `src/studio/integrations/types.ts`:

```ts
export type IntegrationProviderId =
  | 'outbound_webhook'
  | 'slack_webhook'
  | 'external_api'
  | 'google_sheets'
  | 'google_drive'
  | 'email_service'
  | 'my_crm';
```

### 2. Implement `IntegrationProvider`
Create your provider in `server/integrations/registry.ts` (or in a dedicated file imported by `registry.ts`):

```ts
export const myCrmProvider: IntegrationProvider = {
  id: 'my_crm',

  getMetadata() {
    return {
      id: 'my_crm',
      name: 'My CRM Connector',
      shortName: 'My CRM',
      category: 'developer',
      description: 'Create or update CRM contacts when respondents submit a form.',
      authType: 'bearer_token',
      supportedEvents: ['form.submitted', 'response.completed', 'outcome.triggered'],
      availability: 'available', // Use 'requires_oauth' or 'requires_server_env' until credentials exist
      isConfiguredOnServer: true,
      setupInstructions: 'Provide your CRM webhook/API HTTPS URL and Bearer token.',
      supportsFieldSelection: true,
      supportsSecretRotation: false,
      supportsCustomHeaders: false,
      endpointPlaceholder: 'https://api.mycrm.com/v2/contacts',
    };
  },

  async validateConfig(input, securityOptions) {
    const errors: string[] = [];
    const check = await validateOutboundUrl(input.endpointUrl || '', {
      ...securityOptions,
      allowedHosts: ['api.mycrm.com'], // Restrict to official provider hosts when possible
    });
    if (!check.valid) errors.push(check.error || 'Invalid endpoint URL.');
    return { valid: errors.length === 0, errors };
  },

  buildRequest(ctx) {
    const body = JSON.stringify({
      source: 'flexstore',
      formId: ctx.payload.form.id,
      submissionId: ctx.payload.response.id,
      fields: ctx.payload.response.answers,
    });

    return {
      url: ctx.endpointUrl!,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...(ctx.authSecret ? { Authorization: `Bearer ${ctx.authSecret}` } : {}),
        'Idempotency-Key': ctx.idempotencyKey,
      },
      body,
      // Never include Authorization headers or raw secrets in requestPreview
      requestPreview: JSON.stringify(JSON.parse(body), null, 2),
      securityOptions: {
        allowedHosts: ['api.mycrm.com'],
      },
    };
  },

  evaluateResponse(status, snippet) {
    if (status >= 200 && status < 300) return { ok: true };
    return {
      ok: false,
      errorMessage: `My CRM returned HTTP ${status}.`,
      troubleshootingHint: 'Verify your CRM API token permissions and destination endpoint.',
    };
  },
};
```

### 3. Register in `createDefaultProviderRegistry()`
Add `myCrmProvider` to the array in `createDefaultProviderRegistry()` inside `server/integrations/registry.ts`.

### 4. Add an Icon in the UI
Map `'my_crm'` to a Phosphor icon in `PROVIDER_ICONS` inside `src/components/editor/IntegrationsStudio.tsx`. No other UI wiring is needed unless the provider requires custom input fields.

---

## Verifying Outbound Webhook Signatures (Receiver Example)

FlexStore signs every outbound webhook request using HMAC-SHA256 over `${timestamp}.${rawBody}`:

- Header: `X-FlexStore-Signature: t=<unix_seconds>,v1=<hex_hmac_sha256>`
- Additional headers: `X-FlexStore-Timestamp`, `X-FlexStore-Event`, `X-FlexStore-Delivery-Id`, `X-FlexStore-Idempotency-Key`

```ts
import crypto from 'node:crypto';

export function verifyFlexStoreWebhook(
  rawBody: string,
  signatureHeader: string,
  signingSecret: string,
  toleranceSeconds = 300
): boolean {
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((kv) => kv.trim().split('='))
  );
  const timestamp = Number(parts.t);
  const receivedHex = parts.v1;
  if (!timestamp || !receivedHex) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > toleranceSeconds) return false;

  const expectedHex = crypto
    .createHmac('sha256', signingSecret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');

  const a = Buffer.from(receivedHex, 'hex');
  const b = Buffer.from(expectedHex, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

## Security Requirements for New Providers

- Always validate destination URLs via `validateOutboundUrl(...)` and prefer an explicit `allowedHosts` list for SaaS providers.
- Never return raw API keys, OAuth tokens, or signing secrets in API responses, `requestPreview`, or `FormDocument`.
- Never mark an integration `connected` without a real verified provider handshake or HTTP 2xx test response.
- Always honor the creator's `includedFieldIds` selection (handled automatically by `buildSanitizedEventPayload`).
