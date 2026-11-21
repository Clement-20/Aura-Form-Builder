/**
 * Central Workflow Entitlements & Platform Abuse-Protection Guardrails
 *
 * Explicitly separates two distinct concerns:
 *  1. Commercial Plan Entitlements (`getWorkflowPlanEntitlements`):
 *     Future-ready central hook keyed by `PlanTier`. During the current open
 *     rollout, all capabilities remain unlocked (`null` / `'all'`) for every user.
 *  2. Platform Safety & Abuse-Protection Limits (`PLATFORM_SAFETY_LIMITS`):
 *     Unconditional system-stability guardrails (max nodes, max loop steps,
 *     timeouts, and sliding-window rate limits) protecting the backend from
 *     runaway or abusive workflows regardless of commercial plan.
 */

import type { PlanTier } from '../../src/types/form';
import type {
  WorkflowPlanEntitlements,
  WorkflowPlatformSafetyLimits,
} from '../../src/studio/workflows/types';

export const PLATFORM_SAFETY_LIMITS: WorkflowPlatformSafetyLimits = {
  maxNodesPerWorkflow: 30,
  maxActionsPerWorkflow: 20,
  maxExecutionStepsPerRun: 50,
  maxRunTimeoutMs: 25_000,
  maxActionTimeoutMs: 10_000,
  maxRunsPerWorkflowPerMinute: 30,
  maxRunsPerFormPerMinute: 100,
};

/**
 * Central entitlement resolver for future plan-based workflow tiers.
 * Currently configured in `open_access` rollout mode so all users have full access.
 */
export function getWorkflowPlanEntitlements(
  planTier: PlanTier = 'free'
): WorkflowPlanEntitlements {
  return {
    planTier,
    rolloutMode: 'open_access',
    maxActiveWorkflows: null,
    maxMonthlyExecutions: null,
    maxActionsPerWorkflow: null,
    allowedIntegrationProviders: 'all',
  };
}

export interface EntitlementCheckResult {
  allowed: boolean;
  reason?: string;
}

export function checkWorkflowActivationEntitlement(
  entitlements: WorkflowPlanEntitlements,
  currentActiveWorkflowCount: number,
  actionCountInWorkflow: number
): EntitlementCheckResult {
  if (
    entitlements.maxActiveWorkflows !== null &&
    currentActiveWorkflowCount >= entitlements.maxActiveWorkflows
  ) {
    return {
      allowed: false,
      reason: `Active workflow limit (${entitlements.maxActiveWorkflows}) reached for plan "${entitlements.planTier}".`,
    };
  }
  if (
    entitlements.maxActionsPerWorkflow !== null &&
    actionCountInWorkflow > entitlements.maxActionsPerWorkflow
  ) {
    return {
      allowed: false,
      reason: `Action count (${actionCountInWorkflow}) exceeds plan limit (${entitlements.maxActionsPerWorkflow}).`,
    };
  }
  return { allowed: true };
}
