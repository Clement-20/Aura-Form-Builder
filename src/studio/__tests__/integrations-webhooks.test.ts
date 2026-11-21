/**
 * Automated Test Suite — Integrations & Webhooks Framework
 *
 * Verifies:
 *  1. Authentication & cross-owner authorization isolation (401/403)
 *  2. Honest connection lifecycle (pending_verification -> connected ONLY after live test; disconnect wipes secrets)
 *  3. URL validation & internal network blocking (HTTP, credentials, localhost, private IPv4/IPv6, IPv4-mapped IPv6, DNS private resolution, redirect to internal IP)
 *  4. Provider-specific validation (Slack host/path enforcement, OAuth-required providers refuse fake connections)
 *  5. HMAC-SHA256 signed payloads, replay window protection, and secret rotation
 *  6. Field allowlist filtering & sensitive-key redaction (zero secret leakage)
 *  7. Bounded retries with exponential backoff (5xx retries -> succeeds; 4xx fails fast)
 *  8. Duplicate event idempotency deduplication
 *  9. Per-integration rate limiting
 * 10. Strict request timeout enforcement
 * 11. Outbound payload size cap enforcement
 * 12. Real end-to-end HTTP delivery & manual retry against an ephemeral local receiver
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  buildSanitizedEventPayload,
  isPrivateOrReservedIp,
  MAX_OUTBOUND_PAYLOAD_BYTES,
  safeFetchWithRedirectValidation,
  signWebhookPayload,
  validateOutboundUrl,
  verifyWebhookSignature,
} from '../../../server/integrations/security';
import {
  createIntegrationEngine,
  IntegrationEngineError,
} from '../../../server/integrations/engine';
import { createIntegrationsRouter } from '../../../server/integrations/routes';
import { mintWorkspaceSessionToken } from '../../../server/integrations/auth';
import { sanitizeIntegrationMetadataForDocument } from '../integrations/types';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error('   ', err);
    failed += 1;
  }
}

async function startEphemeralServer(
  handler: (req: http.IncomingMessage, body: string, res: http.ServerResponse) => void
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.from(c)));
    req.on('end', () => {
      handler(req, Buffer.concat(chunks).toString('utf8'), res);
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to bind ephemeral test server');
  }

  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function runAll() {
  console.log('\nIntegrations & Webhooks Test Suite');

  // --------------------------------------------------------------------------
  // 1. URL & Network Security Validation
  // --------------------------------------------------------------------------
  await test('blocks private, loopback, link-local, metadata, and IPv4-mapped IPv6 addresses', () => {
    const blockedIps = [
      '0.0.0.0',
      '127.0.0.1',
      '127.255.255.254',
      '10.0.0.1',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '::1',
      '::',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      '::ffff:169.254.169.254',
      '::ffff:7f00:1',
      '::ffff:a00:1',
    ];
    for (const ip of blockedIps) {
      assert.equal(isPrivateOrReservedIp(ip), true, `Expected ${ip} to be blocked`);
    }

    const publicIps = ['93.184.216.34', '8.8.8.8', '1.1.1.1', '2606:2800:220:1:248:1893:25c8:1946'];
    for (const ip of publicIps) {
      assert.equal(isPrivateOrReservedIp(ip), false, `Expected public IP ${ip} to be allowed`);
    }
  });

  await test('rejects non-HTTPS URLs, embedded credentials, localhost, and DNS resolving to private IP', async () => {
    const rHttp = await validateOutboundUrl('http://example.com/webhook');
    assert.equal(rHttp.valid, false);
    assert.match(rHttp.error || '', /HTTPS/i);

    const rCreds = await validateOutboundUrl('https://user:pass@example.com/webhook');
    assert.equal(rCreds.valid, false);
    assert.match(rCreds.error || '', /credentials/i);

    const rLocal = await validateOutboundUrl('https://localhost/hook');
    assert.equal(rLocal.valid, false);

    const rMeta = await validateOutboundUrl('https://metadata.google.internal/computeMetadata/v1/');
    assert.equal(rMeta.valid, false);

    const rInternalDns = await validateOutboundUrl('https://rebind.attacker.example/hook', {
      dnsLookup: async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.8', family: 4 }, // Mixed public + private MUST be rejected
      ],
    });
    assert.equal(rInternalDns.valid, false);
    assert.match(rInternalDns.error || '', /private|loopback|reserved/i);

    const rPublicDns = await validateOutboundUrl('https://hooks.public.example/receive', {
      dnsLookup: async () => [{ address: '93.184.216.34', family: 4 }],
    });
    assert.equal(rPublicDns.valid, true);
  });

  await test('blocks redirects targeting private or non-HTTPS destinations', async () => {
    await assert.rejects(
      () =>
        safeFetchWithRedirectValidation(
          'https://hooks.public.example/start',
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
          {
            dnsLookup: async () => [{ address: '93.184.216.34', family: 4 }],
            fetchImpl: async () =>
              new Response(null, {
                status: 302,
                headers: { Location: 'http://169.254.169.254/latest/meta-data/' },
              }),
          }
        ),
      /HTTPS|private|blocked/i
    );

    await assert.rejects(
      () =>
        safeFetchWithRedirectValidation(
          'https://hooks.public.example/start',
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
          {
            dnsLookup: async (host) =>
              host === 'internal.evil.example'
                ? [{ address: '192.168.1.50', family: 4 }]
                : [{ address: '93.184.216.34', family: 4 }],
            fetchImpl: async () =>
              new Response(null, {
                status: 307,
                headers: { Location: 'https://internal.evil.example/steal' },
              }),
          }
        ),
      /private|loopback|reserved/i
    );
  });

  // --------------------------------------------------------------------------
  // 2. Signed Payloads & Replay Protection
  // --------------------------------------------------------------------------
  await test('signs payloads with HMAC-SHA256 and detects tampering, wrong secret, and expired timestamps', () => {
    const secret = 'whsec_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const body = JSON.stringify({ event: 'form.submitted', response: { id: 'sub_1' } });
    const now = 1_750_000_000;

    const signed = signWebhookPayload(body, secret, now);
    assert.match(signed.headerValue, /^t=\d+,v1=[0-9a-f]{64}$/);

    // Valid within tolerance
    assert.equal(
      verifyWebhookSignature(body, signed.headerValue, secret, 300, now + 45).valid,
      true
    );

    // Tampered payload
    assert.equal(
      verifyWebhookSignature(body + ' ', signed.headerValue, secret, 300, now + 10).valid,
      false
    );

    // Wrong secret
    assert.equal(
      verifyWebhookSignature(body, signed.headerValue, 'whsec_wrong', 300, now + 10).valid,
      false
    );

    // Replay outside 5-minute window
    const expired = verifyWebhookSignature(body, signed.headerValue, secret, 300, now + 600);
    assert.equal(expired.valid, false);
    assert.match(expired.reason || '', /replay|tolerance/i);
  });

  // --------------------------------------------------------------------------
  // 3. Field Filtering & Secret Sanitization
  // --------------------------------------------------------------------------
  await test('filters payload answers strictly by includedFieldIds and redacts sensitive keys', () => {
    const payload = buildSanitizedEventPayload(
      {
        formId: 'form_1',
        formTitle: 'Onboarding',
        submissionId: 'sub_10',
        submittedAt: '2026-01-01T00:00:00.000Z',
        answers: {
          f_name: 'Maya Lin',
          f_email: 'maya@example.com',
          f_internal_notes: 'Do not share',
          f_api_token: 'super-secret-value',
        },
        fieldCatalog: [
          { id: 'f_name', label: 'Full Name', type: 'text' },
          { id: 'f_email', label: 'Email', type: 'email' },
          { id: 'f_internal_notes', label: 'Notes', type: 'textarea' },
          { id: 'f_api_token', label: 'API Token', type: 'text' },
        ],
        score: 90,
        maxScore: 100,
        outcomeId: 'out_high',
        outcomeName: 'Approved',
      },
      {
        includedFieldIds: ['f_name', 'f_api_token'],
        includeMetadata: false,
        includeScoreAndOutcome: true,
      },
      'form.submitted',
      'evt_1',
      'dlv_1'
    );

    assert.deepEqual(Object.keys(payload.response.answers), ['f_name']);
    assert.equal(payload.response.answers.f_name.value, 'Maya Lin');
    assert.equal(payload.metadata, undefined);
    assert.equal(payload.outcome?.id, 'out_high');
    assert.equal(payload.scoring?.score, 90);

    // Document metadata sanitizer must strip raw secret keys
    const cleaned = sanitizeIntegrationMetadataForDocument({
      webhook_1: {
        id: 'int_1',
        signingSecret: 'whsec_leak',
        authSecret: 'bearer_leak',
        secretHint: 'whsec_••••1234',
      },
    }) as Record<string, Record<string, unknown>>;
    assert.equal(cleaned.webhook_1.signingSecret, undefined);
    assert.equal(cleaned.webhook_1.authSecret, undefined);
    assert.equal(cleaned.webhook_1.secretHint, 'whsec_••••1234');
  });

  // --------------------------------------------------------------------------
  // 4. Provider Validation (Slack Host Restriction & Honest OAuth Providers)
  // --------------------------------------------------------------------------
  await test('enforces Slack official webhook URL host/path and rejects fake OAuth provider connections', async () => {
    const engine = createIntegrationEngine({
      dnsLookup: async () => [{ address: '54.230.1.1', family: 4 }],
    });

    await assert.rejects(
      () =>
        engine.createIntegration('form_slack', 'owner_a', {
          providerId: 'slack_webhook',
          name: 'Bad Slack Host',
          endpointUrl: 'https://evil.example.com/services/T1/B1/XXX',
          events: ['form.submitted'],
        }),
      (err: unknown) => err instanceof IntegrationEngineError && err.statusCode === 400
    );

    await assert.rejects(
      () =>
        engine.createIntegration('form_sheets', 'owner_a', {
          providerId: 'google_sheets',
          name: 'Fake Sheets',
          events: ['form.submitted'],
        }),
      (err: unknown) => err instanceof IntegrationEngineError && err.statusCode === 400
    );

    const validSlack = await engine.createIntegration('form_slack', 'owner_a', {
      providerId: 'slack_webhook',
      name: 'Team Alerts',
      endpointUrl: 'https://hooks.slack.com/services/T000/B000/SECRET123',
      events: ['form.submitted'],
    });
    assert.equal(validSlack.integration.status, 'pending_verification');
  });

  // --------------------------------------------------------------------------
  // 5. Real End-to-End Delivery, Signature Verification, Rotation & Disconnect
  // --------------------------------------------------------------------------
  await test('delivers real signed webhooks end-to-end, verifies signature, rotates secret, and clears credentials on disconnect', async () => {
    const received: Array<{ headers: http.IncomingHttpHeaders; body: string }> = [];
    const receiver = await startEphemeralServer((req, body, res) => {
      received.push({ headers: req.headers, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });

    const engine = createIntegrationEngine({
      allowUnsafeLoopbackForTests: true,
      baseRetryDelayMs: 15,
    });

    try {
      const created = await engine.createIntegration('form_live', 'owner_1', {
        providerId: 'outbound_webhook',
        name: 'Primary Webhook',
        endpointUrl: `${receiver.url}/webhook`,
        events: ['form.submitted', 'outcome.triggered'],
        includedFieldIds: ['q_email'],
      });

      assert.equal(created.integration.status, 'pending_verification');
      assert.ok(created.signingSecretOnce?.startsWith('whsec_'));
      // Client summary must NEVER expose raw signingSecret
      assert.equal('signingSecret' in created.integration, false);

      // Live test transitions status -> connected
      const testRes = await engine.testIntegration('form_live', 'owner_1', created.integration.id, {
        formTitle: 'Enterprise Demo',
        fieldCatalog: [{ id: 'q_email', label: 'Work Email', type: 'email' }],
      });
      assert.equal(testRes.ok, true);
      assert.equal(testRes.integration.status, 'connected');
      assert.equal(received.length, 1);

      const firstReq = received[0];
      const sigHeader = String(firstReq.headers['x-flexstore-signature'] || '');
      assert.equal(
        verifyWebhookSignature(firstReq.body, sigHeader, created.signingSecretOnce!).valid,
        true
      );
      assert.equal(firstReq.headers['x-flexstore-event'], 'webhook.test');

      // Rotate secret: new delivery must sign with new secret and FAIL with old secret
      const rotated = engine.rotateSecret('form_live', 'owner_1', created.integration.id);
      assert.notEqual(rotated.signingSecretOnce, created.signingSecretOnce);
      assert.equal(rotated.integration.secretVersion, 2);

      // Dispatch async submission event (includes outcome.triggered too)
      const dispatch = engine.enqueueSubmissionEvents({
        formId: 'form_live',
        formTitle: 'Enterprise Demo',
        submissionId: 'sub_abc',
        submittedAt: new Date().toISOString(),
        answers: { q_email: 'buyer@acme.com', q_unselected: 'hidden' },
        fieldCatalog: [
          { id: 'q_email', label: 'Work Email', type: 'email' },
          { id: 'q_unselected', label: 'Internal', type: 'text' },
        ],
        outcomeId: 'out_vip',
        outcomeName: 'VIP Lead',
      });
      assert.equal(dispatch.queuedDeliveryIds.length, 2);
      await engine.waitForIdle();

      assert.equal(received.length, 3);
      const latestReq = received[2];
      const latestSig = String(latestReq.headers['x-flexstore-signature'] || '');
      assert.equal(
        verifyWebhookSignature(latestReq.body, latestSig, rotated.signingSecretOnce).valid,
        true
      );
      assert.equal(
        verifyWebhookSignature(latestReq.body, latestSig, created.signingSecretOnce!).valid,
        false
      );
      const parsedBody = JSON.parse(latestReq.body);
      assert.deepEqual(Object.keys(parsedBody.response.answers), ['q_email']);

      // Duplicate submission with identical submissionId must be deduplicated
      const dupDispatch = engine.enqueueSubmissionEvents({
        formId: 'form_live',
        formTitle: 'Enterprise Demo',
        submissionId: 'sub_abc',
        submittedAt: new Date().toISOString(),
        answers: { q_email: 'buyer@acme.com' },
        fieldCatalog: [{ id: 'q_email', label: 'Work Email', type: 'email' }],
        outcomeId: 'out_vip',
        outcomeName: 'VIP Lead',
      });
      assert.equal(dupDispatch.queuedDeliveryIds.length, 0);
      assert.equal(dupDispatch.skippedDuplicates, 2);

      // Disconnect wipes credentials and prevents further execution
      const disconnected = engine.disconnectIntegration(
        'form_live',
        'owner_1',
        created.integration.id
      );
      assert.equal(disconnected.status, 'disconnected');
      assert.equal(disconnected.enabled, false);
      assert.equal(disconnected.secretHint, undefined);
    } finally {
      engine.dispose();
      await receiver.close();
    }
  });

  // --------------------------------------------------------------------------
  // 6. Retries, Fast-Fail on 4xx, Manual Retry, Rate Limits, Timeout & Size Cap
  // --------------------------------------------------------------------------
  await test('retries transient 5xx failures until success, fails fast on 400, and supports manual retry', async () => {
    let transientCalls = 0;
    let manualFailCalls = 0;
    const receiver = await startEphemeralServer((req, _body, res) => {
      if (req.url === '/flaky') {
        transientCalls += 1;
        if (transientCalls < 3) {
          res.writeHead(503);
          res.end('Service Temporarily Unavailable');
          return;
        }
        res.writeHead(200);
        res.end('ok');
        return;
      }
      if (req.url === '/bad-request') {
        manualFailCalls += 1;
        if (manualFailCalls === 1) {
          res.writeHead(400);
          res.end('Bad Schema');
          return;
        }
        res.writeHead(200);
        res.end('Fixed!');
        return;
      }
      res.writeHead(404);
      res.end();
    });

    const engine = createIntegrationEngine({
      allowUnsafeLoopbackForTests: true,
      baseRetryDelayMs: 15,
    });

    try {
      const flaky = await engine.createIntegration('form_retry', 'owner_r', {
        providerId: 'outbound_webhook',
        name: 'Flaky Receiver',
        endpointUrl: `${receiver.url}/flaky`,
        events: ['form.submitted'],
        maxRetries: 3,
      });

      const bad = await engine.createIntegration('form_retry', 'owner_r', {
        providerId: 'outbound_webhook',
        name: 'Strict Receiver',
        endpointUrl: `${receiver.url}/bad-request`,
        events: ['form.submitted'],
        maxRetries: 3,
      });

      engine.enqueueSubmissionEvents({
        formId: 'form_retry',
        formTitle: 'Retry Form',
        submissionId: 'sub_retry_1',
        submittedAt: new Date().toISOString(),
        answers: { q1: 'hello' },
        fieldCatalog: [{ id: 'q1', label: 'Q1', type: 'text' }],
      });

      await engine.waitForIdle();

      const logs = engine.listFormDeliveries('form_retry', 'owner_r');
      const flakyLog = logs.find((l) => l.integrationId === flaky.integration.id)!;
      const badLog = logs.find((l) => l.integrationId === bad.integration.id)!;

      assert.equal(flakyLog.status, 'succeeded');
      assert.equal(flakyLog.attempts, 3);
      assert.equal(transientCalls, 3);

      // HTTP 400 is non-retryable -> fails immediately on attempt 1
      assert.equal(badLog.status, 'failed');
      assert.equal(badLog.attempts, 1);
      assert.equal(badLog.httpStatus, 400);

      // Manual retry succeeds when receiver recovers
      const retried = await engine.retryDelivery('form_retry', 'owner_r', badLog.deliveryId);
      assert.equal(retried.status, 'succeeded');
      assert.equal(retried.attempts, 2);
      assert.equal(retried.httpStatus, 200);
    } finally {
      engine.dispose();
      await receiver.close();
    }
  });

  await test('enforces per-integration rate limit, strict timeout, and 256 KB payload size cap', async () => {
    const slowReceiver = await startEphemeralServer((req, _body, res) => {
      if (req.url === '/slow') {
        setTimeout(() => {
          if (!res.writableEnded) {
            res.writeHead(200);
            res.end('too late');
          }
        }, 2_500);
        return;
      }
      res.writeHead(200);
      res.end('ok');
    });

    const engine = createIntegrationEngine({
      allowUnsafeLoopbackForTests: true,
      rateLimitMaxPerIntegration: 2,
      rateLimitWindowMs: 60_000,
      baseRetryDelayMs: 10,
    });

    try {
      // Rate limit check
      await engine.createIntegration('form_rl', 'owner_rl', {
        providerId: 'outbound_webhook',
        name: 'Fast Hook',
        endpointUrl: `${slowReceiver.url}/fast`,
        events: ['form.submitted'],
      });

      const d1 = engine.enqueueSubmissionEvents({
        formId: 'form_rl',
        formTitle: 'RL',
        submissionId: 'sub_1',
        submittedAt: new Date().toISOString(),
        answers: {},
        fieldCatalog: [],
      });
      const d2 = engine.enqueueSubmissionEvents({
        formId: 'form_rl',
        formTitle: 'RL',
        submissionId: 'sub_2',
        submittedAt: new Date().toISOString(),
        answers: {},
        fieldCatalog: [],
      });
      const d3 = engine.enqueueSubmissionEvents({
        formId: 'form_rl',
        formTitle: 'RL',
        submissionId: 'sub_3',
        submittedAt: new Date().toISOString(),
        answers: {},
        fieldCatalog: [],
      });
      assert.equal(d1.queuedDeliveryIds.length, 1);
      assert.equal(d2.queuedDeliveryIds.length, 1);
      assert.equal(d3.rateLimited, 1);

      await engine.waitForIdle();

      // Timeout check (1000ms timeout against 2500ms server)
      const slowHook = await engine.createIntegration('form_timeout', 'owner_rl', {
        providerId: 'outbound_webhook',
        name: 'Slow Hook',
        endpointUrl: `${slowReceiver.url}/slow`,
        events: ['form.submitted'],
        timeoutMs: 1_000,
        maxRetries: 0,
      });

      const testTimeout = await engine.testIntegration(
        'form_timeout',
        'owner_rl',
        slowHook.integration.id,
        { formTitle: 'Timeout Form' }
      );
      assert.equal(testTimeout.ok, false);
      assert.equal(testTimeout.integration.status, 'error');
      assert.match(testTimeout.delivery.errorMessage || '', /timed out/i);

      // Payload size limit check (> 256 KB)
      const oversized = 'x'.repeat(MAX_OUTBOUND_PAYLOAD_BYTES + 128);
      await assert.rejects(
        () =>
          safeFetchWithRedirectValidation(
            `${slowReceiver.url}/fast`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: oversized },
            { allowUnsafeLoopbackForTests: true }
          ),
        /exceeds maximum limit/i
      );
    } finally {
      engine.dispose();
      await slowReceiver.close();
    }
  });

  // --------------------------------------------------------------------------
  // 7. HTTP Router Authentication & Cross-Owner Authorization Isolation
  // --------------------------------------------------------------------------
  await test('enforces Bearer auth (401) and strict cross-owner isolation (403) across API routes', async () => {
    const engine = createIntegrationEngine({
      allowUnsafeLoopbackForTests: true,
    });
    const app = express();
    app.use(express.json());
    app.use('/api/integrations', createIntegrationsRouter(engine));

    const apiServer = await new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
      const srv = app.listen(0, '127.0.0.1', () => {
        const addr = srv.address();
        if (!addr || typeof addr === 'string') throw new Error('bind failed');
        resolve({
          url: `http://127.0.0.1:${addr.port}`,
          close: () => new Promise<void>((res, rej) => srv.close((e) => (e ? rej(e) : res()))),
        });
      });
    });

    try {
      // Unauthenticated request -> 401
      const unauth = await fetch(`${apiServer.url}/api/integrations/forms/form_sec`);
      assert.equal(unauth.status, 401);

      // Owner A creates an integration
      const sessionA = mintWorkspaceSessionToken('ws_owner_alpha_001');
      const sessionB = mintWorkspaceSessionToken('ws_owner_bravo_002');

      const createRes = await fetch(`${apiServer.url}/api/integrations/forms/form_sec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionA.token}`,
        },
        body: JSON.stringify({
          providerId: 'outbound_webhook',
          name: 'Owner A Hook',
          endpointUrl: 'http://127.0.0.1:9/hook',
          events: ['form.submitted'],
        }),
      });
      assert.equal(createRes.status, 201);
      const createdJson = (await createRes.json()) as {
        integration: { id: string };
        signingSecretOnce?: string;
      };
      assert.ok(createdJson.integration.id);
      assert.ok(createdJson.signingSecretOnce);

      // Owner B sees 0 integrations for form_sec and gets 403 on direct access to Owner A's integration
      const listB = await fetch(`${apiServer.url}/api/integrations/forms/form_sec`, {
        headers: { Authorization: `Bearer ${sessionB.token}` },
      });
      assert.equal(listB.status, 200);
      const listBJson = (await listB.json()) as { integrations: unknown[] };
      assert.equal(listBJson.integrations.length, 0);

      const patchB = await fetch(
        `${apiServer.url}/api/integrations/forms/form_sec/${createdJson.integration.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionB.token}`,
          },
          body: JSON.stringify({ name: 'Hijacked' }),
        }
      );
      assert.equal(patchB.status, 403);

      const rotateB = await fetch(
        `${apiServer.url}/api/integrations/forms/form_sec/${createdJson.integration.id}/rotate-secret`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${sessionB.token}` },
        }
      );
      assert.equal(rotateB.status, 403);

      const deleteB = await fetch(
        `${apiServer.url}/api/integrations/forms/form_sec/${createdJson.integration.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${sessionB.token}` },
        }
      );
      assert.equal(deleteB.status, 403);
    } finally {
      engine.dispose();
      await apiServer.close();
    }
  });

  console.log(`\nIntegrations & Webhooks tests: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
