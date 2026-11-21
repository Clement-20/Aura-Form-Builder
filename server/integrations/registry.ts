/**
 * Central Integration Provider Registry
 *
 * Keeps provider-specific request formatting, validation, and error interpretation
 * cleanly decoupled from the core form engine and execution queue.
 *
 * Adding a new provider requires implementing `IntegrationProvider` and registering
 * it via `registry.register(provider)` — zero changes to the core engine or form runner.
 */

import type {
  CreateIntegrationInput,
  IntegrationEventPayload,
  IntegrationEventType,
  IntegrationProviderId,
  IntegrationProviderMetadata,
} from '../../src/studio/integrations/types';
import { SUBSCRIBABLE_INTEGRATION_EVENTS } from '../../src/studio/integrations/types';
import {
  type SecurityValidationOptions,
  signWebhookPayload,
  validateOutboundUrl,
} from './security';

export interface ProviderExecutionContext {
  integrationId: string;
  integrationName: string;
  endpointUrl?: string;
  httpMethod?: 'POST' | 'PUT';
  authHeaderName?: string;
  /** Server-only secret (never logged or returned to client). */
  authSecret?: string;
  /** Server-only HMAC signing secret (never logged or returned to client). */
  signingSecret?: string;
  recipientEmail?: string;
  eventType: IntegrationEventType;
  deliveryId: string;
  idempotencyKey: string;
  payload: IntegrationEventPayload;
}

export interface BuiltProviderRequest {
  url: string;
  method: 'POST' | 'PUT';
  headers: Record<string, string>;
  body: string;
  /** Safe preview string with zero secrets or authorization headers. */
  requestPreview: string;
  securityOptions?: SecurityValidationOptions;
}

export interface ProviderResponseEvaluation {
  ok: boolean;
  errorMessage?: string;
  troubleshootingHint?: string;
}

export interface IntegrationProvider {
  readonly id: IntegrationProviderId;
  getMetadata(): IntegrationProviderMetadata;
  validateConfig(
    input: Partial<CreateIntegrationInput>,
    securityOptions?: SecurityValidationOptions
  ): Promise<{ valid: boolean; errors: string[] }>;
  buildRequest(ctx: ProviderExecutionContext): BuiltProviderRequest;
  evaluateResponse(status: number, responseSnippet: string): ProviderResponseEvaluation;
}

const SAFE_HEADER_NAME_REGEX = /^[A-Za-z0-9-]{2,64}$/;
const DISALLOWED_CUSTOM_HEADERS = new Set([
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
  'upgrade',
  'cookie',
  'x-flexstore-signature',
  'x-flexstore-timestamp',
  'x-flexstore-delivery-id',
  'x-flexstore-event',
  'x-flexstore-idempotency-key',
]);

function defaultEvaluateHttpResponse(
  status: number,
  responseSnippet: string
): ProviderResponseEvaluation {
  if (status >= 200 && status < 300) {
    return { ok: true };
  }
  if (status === 401 || status === 403) {
    return {
      ok: false,
      errorMessage: `Endpoint rejected authentication (HTTP ${status}).`,
      troubleshootingHint:
        'Verify your signing secret, Bearer token, or API key configuration on the receiving server.',
    };
  }
  if (status === 404) {
    return {
      ok: false,
      errorMessage: 'Endpoint returned HTTP 404 Not Found.',
      troubleshootingHint: 'Double-check the destination URL path and ensure the route accepts POST/PUT requests.',
    };
  }
  if (status === 408 || status === 504) {
    return {
      ok: false,
      errorMessage: `Endpoint timed out (HTTP ${status}).`,
      troubleshootingHint:
        'Respond quickly with HTTP 200/202 and process heavy webhook work asynchronously.',
    };
  }
  if (status === 429) {
    return {
      ok: false,
      errorMessage: 'Endpoint rate-limited this request (HTTP 429).',
      troubleshootingHint: 'FlexStore will automatically back off and retry using the Retry-After header.',
    };
  }
  if (status >= 500) {
    return {
      ok: false,
      errorMessage: `Endpoint returned server error HTTP ${status}.`,
      troubleshootingHint:
        'Check your receiver server logs. FlexStore automatically retries transient 5xx failures.',
    };
  }
  return {
    ok: false,
    errorMessage: `Endpoint rejected request with HTTP ${status}${
      responseSnippet ? `: ${responseSnippet.slice(0, 140)}` : ''
    }.`,
    troubleshootingHint: 'Inspect the payload preview to ensure it matches your receiver schema.',
  };
}

// ============================================================================
// 1. Outbound Signed Webhook Provider (Full End-to-End Implementation)
// ============================================================================

export const outboundWebhookProvider: IntegrationProvider = {
  id: 'outbound_webhook',

  getMetadata(): IntegrationProviderMetadata {
    return {
      id: 'outbound_webhook',
      name: 'Outbound Webhook',
      shortName: 'Webhook',
      category: 'webhooks',
      description:
        'Send signed HTTPS JSON payloads to your backend, Zapier, Make, n8n, or custom automation endpoint with automatic retries and replay protection.',
      authType: 'hmac_secret',
      supportedEvents: [...SUBSCRIBABLE_INTEGRATION_EVENTS],
      availability: 'available',
      isConfiguredOnServer: true,
      setupInstructions:
        'Provide an HTTPS endpoint URL, choose events and included response fields, then verify the connection with a signed test event.',
      supportsFieldSelection: true,
      supportsSecretRotation: true,
      supportsCustomHeaders: false,
      endpointPlaceholder: 'https://api.yourdomain.com/webhooks/flexstore',
      endpointHelper: 'Must use HTTPS and resolve to a public internet address.',
    };
  },

  async validateConfig(input, securityOptions) {
    const errors: string[] = [];
    if (!input.endpointUrl) {
      errors.push('Endpoint URL is required.');
    } else {
      const check = await validateOutboundUrl(input.endpointUrl, securityOptions);
      if (!check.valid) {
        errors.push(check.error || 'Endpoint URL failed validation.');
      }
    }
    if (input.events && input.events.length === 0) {
      errors.push('Select at least one form event to subscribe to.');
    }
    return { valid: errors.length === 0, errors };
  },

  buildRequest(ctx) {
    if (!ctx.endpointUrl) {
      throw new Error('Webhook endpoint URL is not configured.');
    }
    if (!ctx.signingSecret) {
      throw new Error('Webhook signing secret is missing on server.');
    }

    const body = JSON.stringify(ctx.payload);
    const signed = signWebhookPayload(body, ctx.signingSecret);

    return {
      url: ctx.endpointUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'FlexStore-Form-Studio-Webhooks/1.0',
        'X-FlexStore-Event': ctx.eventType,
        'X-FlexStore-Delivery-Id': ctx.deliveryId,
        'X-FlexStore-Idempotency-Key': ctx.idempotencyKey,
        'X-FlexStore-Timestamp': String(signed.timestamp),
        'X-FlexStore-Signature': signed.headerValue,
      },
      body,
      requestPreview: JSON.stringify(ctx.payload, null, 2),
    };
  },

  evaluateResponse: defaultEvaluateHttpResponse,
};

// ============================================================================
// 2. Slack Incoming Webhook Provider (Real Block Kit Delivery)
// ============================================================================

export const slackWebhookProvider: IntegrationProvider = {
  id: 'slack_webhook',

  getMetadata(): IntegrationProviderMetadata {
    return {
      id: 'slack_webhook',
      name: 'Slack Incoming Webhook',
      shortName: 'Slack',
      category: 'messaging',
      description:
        'Post formatted submission summaries, selected answers, and personalised outcomes directly to a Slack channel via an Incoming Webhook.',
      authType: 'webhook_url',
      supportedEvents: [...SUBSCRIBABLE_INTEGRATION_EVENTS],
      availability: 'available',
      isConfiguredOnServer: true,
      setupInstructions:
        'Create an Incoming Webhook in your Slack workspace app settings and paste the https://hooks.slack.com/services/... URL below.',
      supportsFieldSelection: true,
      supportsSecretRotation: false,
      supportsCustomHeaders: false,
      endpointPlaceholder: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX',
      endpointHelper: 'Restricted to official https://hooks.slack.com/services/ webhook URLs.',
    };
  },

  async validateConfig(input, securityOptions) {
    const errors: string[] = [];
    if (!input.endpointUrl) {
      errors.push('Slack Incoming Webhook URL is required.');
    } else {
      const check = await validateOutboundUrl(input.endpointUrl, {
        ...securityOptions,
        allowedHosts: ['hooks.slack.com'],
        requiredPathPrefix: '/services/',
      });
      if (!check.valid) {
        errors.push(check.error || 'Slack webhook URL must be a valid https://hooks.slack.com/services/... URL.');
      }
    }
    if (input.events && input.events.length === 0) {
      errors.push('Select at least one form event to notify Slack.');
    }
    return { valid: errors.length === 0, errors };
  },

  buildRequest(ctx) {
    if (!ctx.endpointUrl) {
      throw new Error('Slack webhook URL is not configured.');
    }

    const answerEntries = Object.values(ctx.payload.response.answers).slice(0, 10);
    const eventHeading =
      ctx.eventType === 'webhook.test'
        ? `Connection test for *${ctx.payload.form.title}*`
        : ctx.eventType === 'outcome.triggered'
          ? `Outcome triggered on *${ctx.payload.form.title}*`
          : `New submission on *${ctx.payload.form.title}*`;

    const fieldBlocks = answerEntries.map((entry) => ({
      type: 'mrkdwn',
      text: `*${entry.label}*\n${
        Array.isArray(entry.value)
          ? entry.value.join(', ')
          : entry.value === null || entry.value === undefined
            ? '—'
            : String(entry.value)
      }`,
    }));

    const blocks: Array<Record<string, unknown>> = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: eventHeading,
        },
      },
    ];

    if (fieldBlocks.length > 0) {
      blocks.push({
        type: 'section',
        fields: fieldBlocks,
      });
    }

    if (ctx.payload.outcome || ctx.payload.scoring) {
      const summaryParts: string[] = [];
      if (ctx.payload.outcome?.name || ctx.payload.outcome?.id) {
        summaryParts.push(`*Outcome:* ${ctx.payload.outcome.name || ctx.payload.outcome.id}`);
      }
      if (typeof ctx.payload.scoring?.score === 'number') {
        const max =
          typeof ctx.payload.scoring.maxScore === 'number'
            ? ` / ${ctx.payload.scoring.maxScore}`
            : '';
        summaryParts.push(`*Score:* ${ctx.payload.scoring.score}${max}`);
      }
      if (summaryParts.length > 0) {
        blocks.push({
          type: 'context',
          elements: [{ type: 'mrkdwn', text: summaryParts.join('  ·  ') }],
        });
      }
    }

    const slackBody = {
      text: `${ctx.payload.form.title} — ${ctx.eventType}`,
      blocks,
    };
    const serialized = JSON.stringify(slackBody);

    return {
      url: ctx.endpointUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'FlexStore-Form-Studio-Integrations/1.0',
      },
      body: serialized,
      requestPreview: JSON.stringify(slackBody, null, 2),
      securityOptions: {
        allowedHosts: ['hooks.slack.com'],
        requiredPathPrefix: '/services/',
      },
    };
  },

  evaluateResponse(status, snippet) {
    if (status >= 200 && status < 300) {
      return { ok: true };
    }
    return {
      ok: false,
      errorMessage: `Slack returned HTTP ${status}${snippet ? ` (${snippet.slice(0, 100)})` : ''}.`,
      troubleshootingHint:
        'Check that the Slack Incoming Webhook is still active and has not been revoked in Slack.',
    };
  },
};

// ============================================================================
// 3. External REST API Connector (Server-Held Bearer / API Key Auth)
// ============================================================================

export const externalApiProvider: IntegrationProvider = {
  id: 'external_api',

  getMetadata(): IntegrationProviderMetadata {
    return {
      id: 'external_api',
      name: 'Custom REST API',
      shortName: 'REST API',
      category: 'developer',
      description:
        'Push structured form responses to any CRM, ERP, or internal HTTPS API using server-stored Bearer token or API key authentication.',
      authType: 'bearer_token',
      supportedEvents: [...SUBSCRIBABLE_INTEGRATION_EVENTS],
      availability: 'available',
      isConfiguredOnServer: true,
      setupInstructions:
        'Enter your HTTPS API endpoint and optional Bearer token or API key header. Credentials are stored strictly server-side and never sent to browsers.',
      supportsFieldSelection: true,
      supportsSecretRotation: true,
      supportsCustomHeaders: true,
      endpointPlaceholder: 'https://api.example.com/v1/leads',
      endpointHelper: 'Supports POST or PUT over HTTPS with server-side authentication headers.',
    };
  },

  async validateConfig(input, securityOptions) {
    const errors: string[] = [];
    if (!input.endpointUrl) {
      errors.push('API endpoint URL is required.');
    } else {
      const check = await validateOutboundUrl(input.endpointUrl, securityOptions);
      if (!check.valid) {
        errors.push(check.error || 'API endpoint URL failed validation.');
      }
    }
    if (input.httpMethod && input.httpMethod !== 'POST' && input.httpMethod !== 'PUT') {
      errors.push('HTTP method must be POST or PUT.');
    }
    if (input.authHeaderName) {
      const cleanName = input.authHeaderName.trim();
      if (!SAFE_HEADER_NAME_REGEX.test(cleanName)) {
        errors.push('Authentication header name contains invalid characters.');
      } else if (DISALLOWED_CUSTOM_HEADERS.has(cleanName.toLowerCase())) {
        errors.push(`Header "${cleanName}" is reserved and cannot be overridden.`);
      }
    }
    if (input.events && input.events.length === 0) {
      errors.push('Select at least one form event to trigger this API connector.');
    }
    return { valid: errors.length === 0, errors };
  },

  buildRequest(ctx) {
    if (!ctx.endpointUrl) {
      throw new Error('API endpoint URL is not configured.');
    }
    const body = JSON.stringify(ctx.payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': 'FlexStore-Form-Studio-API/1.0',
      'X-FlexStore-Event': ctx.eventType,
      'X-FlexStore-Delivery-Id': ctx.deliveryId,
      'X-FlexStore-Idempotency-Key': ctx.idempotencyKey,
    };

    if (ctx.signingSecret) {
      const signed = signWebhookPayload(body, ctx.signingSecret);
      headers['X-FlexStore-Timestamp'] = String(signed.timestamp);
      headers['X-FlexStore-Signature'] = signed.headerValue;
    }

    if (ctx.authSecret) {
      const headerName = (ctx.authHeaderName || 'Authorization').trim();
      if (
        SAFE_HEADER_NAME_REGEX.test(headerName) &&
        !DISALLOWED_CUSTOM_HEADERS.has(headerName.toLowerCase())
      ) {
        headers[headerName] =
          headerName.toLowerCase() === 'authorization' && !/^bearer\s+/i.test(ctx.authSecret)
            ? `Bearer ${ctx.authSecret}`
            : ctx.authSecret;
      }
    }

    return {
      url: ctx.endpointUrl,
      method: ctx.httpMethod === 'PUT' ? 'PUT' : 'POST',
      headers,
      body,
      requestPreview: JSON.stringify(ctx.payload, null, 2),
    };
  },

  evaluateResponse: defaultEvaluateHttpResponse,
};

// ============================================================================
// 4. Transactional Email Provider (Real Resend API when RESEND_API_KEY is set)
// ============================================================================

export const emailServiceProvider: IntegrationProvider = {
  id: 'email_service',

  getMetadata(): IntegrationProviderMetadata {
    const isConfigured = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
    return {
      id: 'email_service',
      name: 'Email Notifications (Resend)',
      shortName: 'Email',
      category: 'email',
      description:
        'Deliver clean submission notification emails to team recipients via server-side transactional email credentials.',
      authType: 'server_env',
      supportedEvents: [...SUBSCRIBABLE_INTEGRATION_EVENTS],
      availability: isConfigured ? 'available' : 'requires_server_env',
      isConfiguredOnServer: isConfigured,
      setupInstructions: isConfigured
        ? 'Server email credentials are configured. Enter a destination email address and send a test email to verify delivery.'
        : 'Configure RESEND_API_KEY and RESEND_FROM_EMAIL in server environment variables to enable live transactional email notifications.',
      supportsFieldSelection: true,
      supportsSecretRotation: false,
      supportsCustomHeaders: false,
    };
  },

  async validateConfig(input) {
    const errors: string[] = [];
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      errors.push(
        'Transactional email requires RESEND_API_KEY and RESEND_FROM_EMAIL configured on the server.'
      );
    }
    if (!input.recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.recipientEmail.trim())) {
      errors.push('A valid recipient email address is required.');
    }
    if (input.events && input.events.length === 0) {
      errors.push('Select at least one form event to send email notifications.');
    }
    return { valid: errors.length === 0, errors };
  },

  buildRequest(ctx) {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !fromEmail) {
      throw new Error('Server email credentials (RESEND_API_KEY / RESEND_FROM_EMAIL) are not configured.');
    }
    if (!ctx.recipientEmail) {
      throw new Error('Recipient email address is required.');
    }

    const answerLines = Object.values(ctx.payload.response.answers)
      .map((a) => `${a.label}: ${Array.isArray(a.value) ? a.value.join(', ') : String(a.value ?? '')}`)
      .join('\n');

    const emailBody = {
      from: fromEmail,
      to: [ctx.recipientEmail.trim()],
      subject:
        ctx.eventType === 'webhook.test'
          ? `[Test] FlexStore notification for ${ctx.payload.form.title}`
          : `New submission: ${ctx.payload.form.title}`,
      text: `Form: ${ctx.payload.form.title}\nEvent: ${ctx.eventType}\nResponse ID: ${ctx.payload.response.id}\n\n${answerLines || 'No fields selected.'}`,
    };

    return {
      url: 'https://api.resend.com/emails',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${apiKey}`,
        'Idempotency-Key': ctx.idempotencyKey,
      },
      body: JSON.stringify(emailBody),
      requestPreview: JSON.stringify(emailBody, null, 2),
      securityOptions: {
        allowedHosts: ['api.resend.com'],
      },
    };
  },

  evaluateResponse: defaultEvaluateHttpResponse,
};

// ============================================================================
// 5. Catalog Providers Requiring OAuth Credentials (Honest Setup Required)
// ============================================================================

export const googleSheetsProvider: IntegrationProvider = {
  id: 'google_sheets',

  getMetadata(): IntegrationProviderMetadata {
    return {
      id: 'google_sheets',
      name: 'Google Sheets',
      shortName: 'Sheets',
      category: 'spreadsheets',
      description:
        'Append validated form submissions as new rows in a spreadsheet with column-to-field mapping.',
      authType: 'oauth2',
      supportedEvents: ['form.submitted', 'response.completed'],
      availability: 'requires_oauth',
      isConfiguredOnServer: false,
      setupInstructions:
        'Requires Google Workspace OAuth credentials (spreadsheets scope). Not yet connected in this workspace — use Outbound Webhook with Make/Zapier or configure Google Workspace OAuth first.',
      supportsFieldSelection: true,
      supportsSecretRotation: false,
      supportsCustomHeaders: false,
    };
  },

  async validateConfig() {
    return {
      valid: false,
      errors: [
        'Google Sheets requires Google Workspace OAuth credentials before a live connection can be established.',
      ],
    };
  },

  buildRequest() {
    throw new Error('Google Sheets OAuth integration is not configured in this environment.');
  },

  evaluateResponse: defaultEvaluateHttpResponse,
};

export const googleDriveProvider: IntegrationProvider = {
  id: 'google_drive',

  getMetadata(): IntegrationProviderMetadata {
    return {
      id: 'google_drive',
      name: 'Google Drive (File Uploads)',
      shortName: 'Drive',
      category: 'storage',
      description:
        'Route respondent file_upload metadata and attachments into a dedicated Google Drive folder per form.',
      authType: 'oauth2',
      supportedEvents: ['form.submitted', 'response.completed'],
      availability: 'requires_oauth',
      isConfiguredOnServer: false,
      setupInstructions:
        'Integrates with FlexStore file_upload components once Google Workspace OAuth (drive.file scope) is configured for this workspace.',
      supportsFieldSelection: true,
      supportsSecretRotation: false,
      supportsCustomHeaders: false,
    };
  },

  async validateConfig() {
    return {
      valid: false,
      errors: [
        'Google Drive requires Google Workspace OAuth credentials before a live connection can be established.',
      ],
    };
  },

  buildRequest() {
    throw new Error('Google Drive OAuth integration is not configured in this environment.');
  },

  evaluateResponse: defaultEvaluateHttpResponse,
};

// ============================================================================
// Registry Implementation
// ============================================================================

export class IntegrationProviderRegistry {
  private readonly providers = new Map<IntegrationProviderId, IntegrationProvider>();

  constructor(initialProviders: IntegrationProvider[] = []) {
    for (const provider of initialProviders) {
      this.register(provider);
    }
  }

  register(provider: IntegrationProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(providerId: IntegrationProviderId): IntegrationProvider | undefined {
    return this.providers.get(providerId);
  }

  list(): IntegrationProvider[] {
    return Array.from(this.providers.values());
  }

  listMetadata(): IntegrationProviderMetadata[] {
    return this.list().map((p) => p.getMetadata());
  }
}

export function createDefaultProviderRegistry(): IntegrationProviderRegistry {
  return new IntegrationProviderRegistry([
    outboundWebhookProvider,
    slackWebhookProvider,
    externalApiProvider,
    emailServiceProvider,
    googleSheetsProvider,
    googleDriveProvider,
  ]);
}
