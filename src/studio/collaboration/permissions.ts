/**
 * Configurable Role-Based Access Control (RBAC) Matrix for FlexStore Workspaces
 *
 * Shared between UI (capability hints) and backend (strict server-side enforcement).
 * Backend routes ALWAYS re-verify permissions against server-side workspace state.
 */

import type { PlanTier } from '../../types/form';
import {
  ALL_WORKSPACE_PERMISSIONS,
  type RolePermissionMatrix,
  type WorkspacePermission,
  type WorkspacePlanEntitlements,
  type WorkspaceRole,
  type WorkspaceSettings,
} from './types';

export const DEFAULT_ROLE_PERMISSIONS: RolePermissionMatrix = {
  owner: [...ALL_WORKSPACE_PERMISSIONS],
  admin: [
    'forms:view',
    'forms:edit',
    'forms:publish',
    'forms:delete',
    'responses:view',
    'responses:export',
    'integrations:manage',
    'workflows:manage',
    'members:manage',
    'workspace:settings',
    'audit:view',
  ],
  editor: [
    'forms:view',
    'forms:edit',
    'forms:publish',
    'responses:view',
    'integrations:manage',
    'workflows:manage',
  ],
  analyst: [
    'forms:view',
    'responses:view',
    'responses:export',
    'audit:view',
  ],
  viewer: [
    'forms:view',
  ],
};

export const WORKSPACE_ROLE_META: Record<
  WorkspaceRole,
  {
    label: string;
    shortLabel: string;
    description: string;
    rank: number;
  }
> = {
  owner: {
    label: 'Owner',
    shortLabel: 'Owner',
    description: 'Full workspace control including ownership transfer, settings, roles, publishing, and audit logs.',
    rank: 0,
  },
  admin: {
    label: 'Administrator',
    shortLabel: 'Admin',
    description: 'Manages members, invitations, settings, forms, integrations, workflows, responses, and audit logs.',
    rank: 1,
  },
  editor: {
    label: 'Editor',
    shortLabel: 'Editor',
    description: 'Creates, edits, versions, and publishes forms, integrations, and workflows. Cannot export responses or manage members.',
    rank: 2,
  },
  analyst: {
    label: 'Analyst',
    shortLabel: 'Analyst',
    description: 'Read-only access to forms with full response viewing, exporting, and audit log visibility.',
    rank: 3,
  },
  viewer: {
    label: 'Viewer',
    shortLabel: 'Viewer',
    description: 'Read-only access to workspace forms and comments. Cannot edit, publish, or export responses.',
    rank: 4,
  },
};

export const WORKSPACE_PERMISSION_META: Record<
  WorkspacePermission,
  { label: string; group: 'Forms' | 'Responses' | 'Automation' | 'Administration' }
> = {
  'forms:view': { label: 'View forms', group: 'Forms' },
  'forms:edit': { label: 'Edit forms & versions', group: 'Forms' },
  'forms:publish': { label: 'Publish & unpublish forms', group: 'Forms' },
  'forms:delete': { label: 'Delete workspace forms', group: 'Forms' },
  'responses:view': { label: 'View responses & analytics', group: 'Responses' },
  'responses:export': { label: 'Export response CSV/JSON', group: 'Responses' },
  'integrations:manage': { label: 'Manage integrations & webhooks', group: 'Automation' },
  'workflows:manage': { label: 'Manage & activate workflows', group: 'Automation' },
  'members:manage': { label: 'Invite, update & remove members', group: 'Administration' },
  'workspace:settings': { label: 'Update workspace settings', group: 'Administration' },
  'workspace:transfer_ownership': { label: 'Transfer workspace ownership', group: 'Administration' },
  'audit:view': { label: 'View workspace audit logs', group: 'Administration' },
};

export function createDefaultWorkspaceSettings(): WorkspaceSettings {
  return {
    allowMemberInvitesByAdmin: true,
    defaultInviteExpiryHours: 72,
    requireExplicitPublish: true,
    rolePermissions: {},
  };
}

/**
 * Resolves effective permissions for a role inside a workspace.
 * Security invariant:
 *  - `owner` ALWAYS retains all permissions (cannot accidentally lock themselves out).
 *  - Non-owner roles can NEVER be granted `workspace:transfer_ownership`.
 */
export function resolveRolePermissions(
  role: WorkspaceRole,
  settings?: Partial<WorkspaceSettings>
): WorkspacePermission[] {
  if (role === 'owner') {
    return [...ALL_WORKSPACE_PERMISSIONS];
  }

  const customList = settings?.rolePermissions?.[role];
  const base = Array.isArray(customList) ? customList : DEFAULT_ROLE_PERMISSIONS[role];
  const validSet = new Set<WorkspacePermission>();

  for (const perm of base) {
    if (
      ALL_WORKSPACE_PERMISSIONS.includes(perm) &&
      perm !== 'workspace:transfer_ownership'
    ) {
      validSet.add(perm);
    }
  }

  // Admin invite toggle guard
  if (role === 'admin' && settings?.allowMemberInvitesByAdmin === false) {
    validSet.delete('members:manage');
  }

  // Every workspace member can view forms
  validSet.add('forms:view');
  return Array.from(validSet);
}

export function hasWorkspacePermission(
  role: WorkspaceRole | null | undefined,
  permission: WorkspacePermission,
  settings?: Partial<WorkspaceSettings>
): boolean {
  if (!role) return false;
  return resolveRolePermissions(role, settings).includes(permission);
}

/**
 * Determines whether an actor can manage (change role / remove) a target member.
 * Prevents privilege escalation and protects the workspace owner.
 */
export function canManageMember(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole,
  requestedNewRole?: WorkspaceRole,
  settings?: Partial<WorkspaceSettings>
): { allowed: boolean; reason?: string } {
  if (!hasWorkspacePermission(actorRole, 'members:manage', settings)) {
    return { allowed: false, reason: 'Your role does not have permission to manage workspace members.' };
  }
  if (targetRole === 'owner') {
    return { allowed: false, reason: 'Workspace owner cannot be modified or removed; transfer ownership first.' };
  }
  if (requestedNewRole === 'owner') {
    return { allowed: false, reason: 'Use ownership transfer to assign the Owner role.' };
  }
  if (actorRole === 'admin' && (targetRole === 'admin' || requestedNewRole === 'admin')) {
    return { allowed: false, reason: 'Only the workspace Owner can promote, demote, or remove Administrators.' };
  }
  return { allowed: true };
}

/**
 * Central collaboration plan entitlements — currently open access during rollout
 * while keeping commercial tier hooks cleanly integrated with FlexStore's PlanTier.
 */
export function getWorkspacePlanEntitlements(planTier: PlanTier = 'free'): WorkspacePlanEntitlements {
  return {
    planTier,
    rolloutMode: 'open_access',
    maxWorkspaces: null,
    maxMembersPerWorkspace: null,
    auditLogsEnabled: true,
    versionHistoryRetentionCount: 100,
  };
}
