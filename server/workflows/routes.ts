/**
 * Authenticated Express Router for Visual Workflow Automation Builder
 *
 * Reuses `/server/integrations/auth.ts` for Firebase RS256 ID tokens and
 * server-signed workspace session tokens, enforcing strict `ownerId` isolation
 * on every management, test, activation, and cancellation route.
 */

import express, { type Request, type Response, type Router } from 'express';
import { authenticateRequest } from '../integrations/auth';
import {
  type CreateWorkflowInput,
  type UpdateWorkflowInput,
  WorkflowEngineError,
  type WorkflowExecutionEngine,
} from './engine';

function isValidFormId(formId: string): boolean {
  return typeof formId === 'string' && /^[a-zA-Z0-9_-]{2,128}$/.test(formId);
}

function handleError(res: Response, err: unknown): void {
  if (err instanceof WorkflowEngineError) {
    res.status(err.statusCode).json({
      error: err.message,
      ...(err.validation ? { validation: err.validation } : {}),
    });
    return;
  }
  console.error('Workflows API unexpected error:', err);
  res.status(500).json({ error: 'Internal error while processing workflow request.' });
}

export function createWorkflowsRouter(engine: WorkflowExecutionEngine): Router {
  const router = express.Router();

  // GET /api/workflows/forms/:formId
  router.get('/forms/:formId', async (req: Request, res: Response) => {
    try {
      const caller = await authenticateRequest(req);
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required to view workflows.' });
      }
      const { formId } = req.params;
      if (!isValidFormId(formId)) {
        return res.status(400).json({ error: 'Invalid formId.' });
      }
      return res.json(engine.listFormState(formId, caller.ownerId));
    } catch (err) {
      handleError(res, err);
    }
  });

  // POST /api/workflows/forms/:formId
  router.post('/forms/:formId', async (req: Request, res: Response) => {
    try {
      const caller = await authenticateRequest(req);
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required to create workflows.' });
      }
      const { formId } = req.params;
      if (!isValidFormId(formId)) {
        return res.status(400).json({ error: 'Invalid formId.' });
      }
      const input = req.body as CreateWorkflowInput;
      const result = engine.createWorkflow(formId, caller.ownerId, input);
      return res.status(201).json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  // PATCH /api/workflows/forms/:formId/:workflowId
  router.patch('/forms/:formId/:workflowId', async (req: Request, res: Response) => {
    try {
      const caller = await authenticateRequest(req);
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required to update workflows.' });
      }
      const { formId, workflowId } = req.params;
      if (!isValidFormId(formId)) {
        return res.status(400).json({ error: 'Invalid formId.' });
      }
      const patch = req.body as UpdateWorkflowInput;
      const result = engine.updateWorkflow(formId, caller.ownerId, workflowId, patch);
      return res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  // POST /api/workflows/forms/:formId/:workflowId/activate
  router.post('/forms/:formId/:workflowId/activate', async (req: Request, res: Response) => {
    try {
      const caller = await authenticateRequest(req);
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required to activate workflows.' });
      }
      const { formId, workflowId } = req.params;
      if (!isValidFormId(formId)) {
        return res.status(400).json({ error: 'Invalid formId.' });
      }
      const result = await engine.activateWorkflow(formId, caller.ownerId, workflowId);
      return res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  // POST /api/workflows/forms/:formId/:workflowId/deactivate
  router.post('/forms/:formId/:workflowId/deactivate', async (req: Request, res: Response) => {
    try {
      const caller = await authenticateRequest(req);
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required to deactivate workflows.' });
      }
      const { formId, workflowId } = req.params;
      if (!isValidFormId(formId)) {
        return res.status(400).json({ error: 'Invalid formId.' });
      }
      const workflow = engine.deactivateWorkflow(formId, caller.ownerId, workflowId);
      return res.json({ workflow });
    } catch (err) {
      handleError(res, err);
    }
  });

  // DELETE /api/workflows/forms/:formId/:workflowId
  router.delete('/forms/:formId/:workflowId', async (req: Request, res: Response) => {
    try {
      const caller = await authenticateRequest(req);
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required to delete workflows.' });
      }
      const { formId, workflowId } = req.params;
      if (!isValidFormId(formId)) {
        return res.status(400).json({ error: 'Invalid formId.' });
      }
      engine.deleteWorkflow(formId, caller.ownerId, workflowId);
      return res.json({ deleted: true });
    } catch (err) {
      handleError(res, err);
    }
  });

  // POST /api/workflows/forms/:formId/:workflowId/test
  router.post('/forms/:formId/:workflowId/test', async (req: Request, res: Response) => {
    try {
      const caller = await authenticateRequest(req);
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required to test workflows.' });
      }
      const { formId, workflowId } = req.params;
      if (!isValidFormId(formId)) {
        return res.status(400).json({ error: 'Invalid formId.' });
      }
      const run = await engine.runWorkflowTest(formId, caller.ownerId, workflowId, req.body || {});
      return res.json({ run });
    } catch (err) {
      handleError(res, err);
    }
  });

  // POST /api/workflows/forms/:formId/runs/:runId/cancel
  router.post('/forms/:formId/runs/:runId/cancel', async (req: Request, res: Response) => {
    try {
      const caller = await authenticateRequest(req);
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required to cancel runs.' });
      }
      const { formId, runId } = req.params;
      if (!isValidFormId(formId)) {
        return res.status(400).json({ error: 'Invalid formId.' });
      }
      const run = engine.cancelRun(formId, caller.ownerId, runId);
      return res.json({ run });
    } catch (err) {
      handleError(res, err);
    }
  });

  // PATCH /api/workflows/forms/:formId/tasks/:taskId
  router.patch('/forms/:formId/tasks/:taskId', async (req: Request, res: Response) => {
    try {
      const caller = await authenticateRequest(req);
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required to update tasks.' });
      }
      const { formId, taskId } = req.params;
      if (!isValidFormId(formId)) {
        return res.status(400).json({ error: 'Invalid formId.' });
      }
      const task = engine.toggleTaskCompleted(
        formId,
        caller.ownerId,
        taskId,
        Boolean(req.body?.completed)
      );
      return res.json({ task });
    } catch (err) {
      handleError(res, err);
    }
  });

  return router;
}
