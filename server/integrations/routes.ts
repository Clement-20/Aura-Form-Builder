/**
 * Express API Routes for FlexStore Integrations & Webhooks
 *
 * Authentication & Ownership:
 *  - Management routes require a valid `Authorization: Bearer <token>` header
 *    (verified Firebase ID token or server-signed workspace session token)
 *    and enforce `integration.ownerId === caller.ownerId`.
 *  - Public dispatch route (`POST /api/integrations/dispatch`) accepts ONLY
 *    submission event data for a `formId` and dispatches solely to server-registered,
 *    enabled integrations — callers can NEVER inject arbitrary destination URLs or secrets.
 */

import express, { type Request, type Response, type Router } from 'express';
import type {
  CreateIntegrationInput,
  DispatchSubmissionEventInput,
  UpdateIntegrationInput,
} from '../../src/studio/integrations/types';
import {
  authenticateRequest,
  mintWorkspaceSessionToken,
} from './auth';
import {
  IntegrationEngineError,
  type IntegrationExecutionEngine,
} from './engine';
import { SlidingWindowRateLimiter } from './security';

function isValidFormId(formId: string): boolean {
  return typeof formId === 'string' && /^[a-zA-Z0-9_-]{2,128}$/.test(formId);
}

function handleRouteError(res: Response, err: unknown): void {
  if (err instanceof IntegrationEngineError) {
    res.status(err.statusCode).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }
  console.error('Integrations API unexpected error:', err);
  res.status(500).json({ error: 'An internal error occurred while processing the integration request.' });
}

export function createIntegrationsRouter(engine: IntegrationExecutionEngine): Router {
  const router = express.Router();
  const sessionRateLimiter = new SlidingWindowRateLimiter(30, 60_000);
  const dispatchRateLimiter = new SlidingWindowRateLimiter(120, 60_000);

  // POST /api/integrations/session
  // Mints a server-signed memory-only workspace session token for local-first preview workspaces
  router.post('/session', (req: Request, res: Response) => {
    const clientKey = req.ip || 'local';
    const limit = sessionRateLimiter.consume(clientKey);
    if (!limit.allowed) {
      return res.status(429).json({
        error: 'Too many session requests. Please wait a moment and try again.',
      });
    }
    const requestedOwnerId =
      typeof req.body?.workspaceOwnerId === 'string' ? req.body.workspaceOwnerId : undefined;
    const session = mintWorkspaceSessionToken(requestedOwnerId);
    return res.json(session);
  });

  // GET /api/integrations/providers
  // Public catalog metadata (zero secrets)
  router.get('/providers', (_req: Request, res: Response) => {
    return res.json({
      providers: engine.listProviders(),
    });
  });

  // POST /api/integrations/dispatch
  // Non-blocking async submission dispatcher invoked after form submission succeeds.
  // Always returns 202 Accepted quickly so respondent submissions never stall.
  router.post('/dispatch', (req: Request, res: Response) => {
    try {
      const body = req.body as Partial<DispatchSubmissionEventInput> | undefined;
      if (!body || !isValidFormId(body.formId || '') || !body.submissionId) {
        return res.status(400).json({
          error: 'Valid formId and submissionId are required to dispatch integration events.',
        });
      }

      const rate = dispatchRateLimiter.consume(`dispatch:${body.formId}`);
      if (!rate.allowed) {
        return res.status(429).json({
          error: 'Dispatch rate limit exceeded for this form.',
        });
      }

      const result = engine.enqueueSubmissionEvents({
        formId: body.formId!,
        formTitle: typeof body.formTitle === 'string' ? body.formTitle.slice(0, 200) : 'Untitled Form',
        formSlug: typeof body.formSlug === 'string' ? body.formSlug.slice(0, 120) : undefined,
        submissionId: String(body.submissionId).slice(0, 128),
        submittedAt:
          typeof body.submittedAt === 'string' ? body.submittedAt : new Date().toISOString(),
        durationSeconds:
          typeof body.durationSeconds === 'number' ? body.durationSeconds : undefined,
        answers:
          body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)
            ? (body.answers as Record<string, unknown>)
            : {},
        fieldCatalog: Array.isArray(body.fieldCatalog) ? body.fieldCatalog.slice(0, 250) : [],
        score: typeof body.score === 'number' ? body.score : undefined,
        maxScore: typeof body.maxScore === 'number' ? body.maxScore : undefined,
        scorePercent: typeof body.scorePercent === 'number' ? body.scorePercent : undefined,
        categoryScores:
          body.categoryScores && typeof body.categoryScores === 'object'
            ? (body.categoryScores as Record<string, unknown>)
            : undefined,
        outcomeId: typeof body.outcomeId === 'string' ? body.outcomeId.slice(0, 128) : undefined,
        outcomeName:
          typeof body.outcomeName === 'string' ? body.outcomeName.slice(0, 200) : undefined,
        deviceInfo: typeof body.deviceInfo === 'string' ? body.deviceInfo.slice(0, 160) : undefined,
        isComplete: typeof body.isComplete === 'boolean' ? body.isComplete : true,
      });

      return res.status(202).json({
        accepted: true,
        ...result,
      });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // ---- Authenticated Form Creator Management Routes ----

  // GET /api/integrations/forms/:formId
  router.get('/forms/:formId', async (req: Request, res: Response) => {
    try {
      const caller = await authenticateRequest(req);
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required to view form integrations.' });
      }
      const { formId } = req.params;
      if (!isValidFormId(formId)) {
        return res.status(400).json({ error: 'Invalid formId.' });
      }
      const integrations = engine.listFormIntegrations(formId, caller.ownerId);
      const deliveries = engine.listFormDeliveries(formId, caller.ownerId);
      return res.json({
        integrations,
        deliveries,
        providers: engine.listProviders(),
      });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // POST /api/integrations/forms/:formId
  router.post('/forms/:formId', async (req: Request, res: Response) => {
    try {
      const caller = await authenticateRequest(req);
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required to create integrations.' });
      }
      const { formId } = req.params;
      if (!isValidFormId(formId)) {
        return res.status(400).json({ error: 'Invalid formId.' });
      }
      const input = req.body as CreateIntegrationInput;
      const result = await engine.createIntegration(formId, caller.ownerId, input);
      return res.status(201).json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // PATCH /api/integrations/forms/:formId/:integrationId
  router.patch('/forms/:formId/:integrationId', async (req: Request, res: Response) => {
    try {
      const caller = await authenticateRequest(req);
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required to update integrations.' });
      }
      const { formId, integrationId } = req.params;
      if (!isValidFormId(formId)) {
        return res.status(400).json({ error: 'Invalid formId.' });
      }
      const patch = req.body as UpdateIntegrationInput;
      const integration = await engine.updateIntegration(
        formId,
        caller.ownerId,
        integrationId,
        patch
      );
      return res.json({ integration });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // POST /api/integrations/forms/:formId/:integrationId/test
  router.post('/forms/:formId/:integrationId/test', async (req: Request, res: Response) => {
    try {
      const caller = await authenticateRequest(req);
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required to test integrations.' });
      }
      const { formId, integrationId } = req.params;
      if (!isValidFormId(formId)) {
        return res.status(400).json({ error: 'Invalid formId.' });
      }
      const result = await engine.testIntegration(formId, caller.ownerId, integrationId, {
        formTitle: typeof req.body?.formTitle === 'string' ? req.body.formTitle : 'Untitled Form',
        formSlug: typeof req.body?.formSlug === 'string' ? req.body.formSlug : undefined,
        fieldCatalog: Array.isArray(req.body?.fieldCatalog) ? req.body.fieldCatalog : [],
      });
      return res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // POST /api/integrations/forms/:formId/:integrationId/rotate-secret
  router.post(
    '/forms/:formId/:integrationId/rotate-secret',
    async (req: Request, res: Response) => {
      try {
        const caller = await authenticateRequest(req);
        if (!caller) {
          return res
            .status(401)
            .json({ error: 'Authentication required to rotate signing secrets.' });
        }
        const { formId, integrationId } = req.params;
        if (!isValidFormId(formId)) {
          return res.status(400).json({ error: 'Invalid formId.' });
        }
        const result = engine.rotateSecret(formId, caller.ownerId, integrationId);
        return res.json(result);
      } catch (err) {
        handleRouteError(res, err);
      }
    }
  );

  // POST /api/integrations/forms/:formId/:integrationId/disconnect
  router.post('/forms/:formId/:integrationId/disconnect', async (req: Request, res: Response) => {
    try {
      const caller = await authenticateRequest(req);
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required to disconnect integrations.' });
      }
      const { formId, integrationId } = req.params;
      if (!isValidFormId(formId)) {
        return res.status(400).json({ error: 'Invalid formId.' });
      }
      const integration = engine.disconnectIntegration(formId, caller.ownerId, integrationId);
      return res.json({ integration });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // DELETE /api/integrations/forms/:formId/:integrationId
  router.delete('/forms/:formId/:integrationId', async (req: Request, res: Response) => {
    try {
      const caller = await authenticateRequest(req);
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required to delete integrations.' });
      }
      const { formId, integrationId } = req.params;
      if (!isValidFormId(formId)) {
        return res.status(400).json({ error: 'Invalid formId.' });
      }
      engine.deleteIntegration(formId, caller.ownerId, integrationId);
      return res.json({ deleted: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // POST /api/integrations/forms/:formId/:integrationId/preview-payload
  router.post(
    '/forms/:formId/:integrationId/preview-payload',
    async (req: Request, res: Response) => {
      try {
        const caller = await authenticateRequest(req);
        if (!caller) {
          return res.status(401).json({ error: 'Authentication required to preview payloads.' });
        }
        const { formId, integrationId } = req.params;
        if (!isValidFormId(formId)) {
          return res.status(400).json({ error: 'Invalid formId.' });
        }
        const preview = engine.previewPayload(formId, caller.ownerId, integrationId, {
          formTitle: typeof req.body?.formTitle === 'string' ? req.body.formTitle : 'Untitled Form',
          formSlug: typeof req.body?.formSlug === 'string' ? req.body.formSlug : undefined,
          fieldCatalog: Array.isArray(req.body?.fieldCatalog) ? req.body.fieldCatalog : [],
          sampleAnswers:
            req.body?.sampleAnswers && typeof req.body.sampleAnswers === 'object'
              ? req.body.sampleAnswers
              : undefined,
        });
        return res.json(preview);
      } catch (err) {
        handleRouteError(res, err);
      }
    }
  );

  // POST /api/integrations/forms/:formId/deliveries/:deliveryId/retry
  router.post(
    '/forms/:formId/deliveries/:deliveryId/retry',
    async (req: Request, res: Response) => {
      try {
        const caller = await authenticateRequest(req);
        if (!caller) {
          return res.status(401).json({ error: 'Authentication required to retry deliveries.' });
        }
        const { formId, deliveryId } = req.params;
        if (!isValidFormId(formId)) {
          return res.status(400).json({ error: 'Invalid formId.' });
        }
        const delivery = await engine.retryDelivery(formId, caller.ownerId, deliveryId);
        return res.json({ delivery });
      } catch (err) {
        handleRouteError(res, err);
      }
    }
  );

  return router;
}
