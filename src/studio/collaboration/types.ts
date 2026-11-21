/**
 * FlexStore Form Studio — Team Collaboration & Shared Workspaces Contract
 *
 * Shared types across frontend studio UI and backend authorization/collaboration engine.
 * Designed to extend the existing FlexStore account (Firebase Auth / workspace session)
 * and FormDocument architecture without introducing a separate account system.
 */

import type { FormSchema, PlanTier } from '../../types/form';
import type { ReusableComponentDefinition } from '../reusable/types';

export type WorkspaceType = 'personal' | 'organization';

export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'analyst' | 'viewer';

export const WORKSPACE_ROLES: readonly WorkspaceRole[] = [
  'owner',
  'admin',
  'editor',
  'analyst',
  'viewer',
] as const;

export type WorkspacePermission =
  | 'forms:view'
  | 'forms:edit'
  | 'forms:publish'
  | 'forms:delete'
  | 'responses:view'
  | 'responses:export'
  | 'integrations:manage'
  | 'workflows:manage'
  | 'members:manage'
  | 'workspace:settings'
  | 'workspace:transfer_ownership'
  | 'audit:view';

export const ALL_WORKSPACE_PERMISSIONS: readonly WorkspacePermission[] = [
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
  'workspace:transfer_ownership',
  'audit:view',
] as const;

export type RolePermissionMatrix = Record<WorkspaceRole, WorkspacePermission[]>;

export interface WorkspaceMember {
  userId: string;
  email: string;
  displayName: string;
  photoURL?: string;
  color: string;
  role: WorkspaceRole;
  joinedAt: string;
  invitedBy?: string;
}

export type WorkspaceInvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: Exclude<WorkspaceRole, 'owner'>;
  status: WorkspaceInvitationStatus;
  invitedBy: string;
  invitedByName: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  /** Returned only to authorized inviter on create/resend so they can copy the invite link. */
  inviteToken?: string;
  tokenHint: string;
}

export interface WorkspaceSettings {
  allowMemberInvitesByAdmin: boolean;
  defaultInviteExpiryHours: number;
  requireExplicitPublish: boolean;
  /** Optional per-workspace overrides to the default role permission matrix (Owner always retains full access). */
  rolePermissions: Partial<Record<Exclude<WorkspaceRole, 'owner'>, WorkspacePermission[]>>;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  description: string;
  type: WorkspaceType;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  formCount: number;
  sharedComponentCount: number;
  myRole: WorkspaceRole;
  myPermissions: WorkspacePermission[];
  settings: WorkspaceSettings;
}

export interface WorkspaceDetail extends WorkspaceSummary {
  members: WorkspaceMember[];
  invitations: WorkspaceInvitation[];
  sharedComponents: ReusableComponentDefinition[];
}

// ============================================================================
// Workspace Forms, Draft vs Published State, Versioning & Conflict Resolution
// ============================================================================

export type FormVersionKind = 'initial' | 'autosave' | 'manual' | 'publish' | 'restore';

export interface FormVersionSummary {
  versionNumber: number;
  kind: FormVersionKind;
  summary: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  isPublishedSnapshot: boolean;
  restoredFromVersion?: number | null;
  fieldCount: number;
  ruleCount: number;
}

export interface FormVersionSnapshot extends FormVersionSummary {
  form: FormSchema;
}

export interface WorkspaceFormRecord {
  id: string;
  workspaceId: string;
  /** Original creator UID — informational attribution only; ownership belongs to workspaceId. */
  createdBy: string;
  createdByName: string;
  lastEditedBy: string;
  lastEditedByName: string;
  createdAt: string;
  updatedAt: string;
  /** Current editable draft version number (monotonically increasing). */
  draftVersion: number;
  /** Current working draft schema. */
  draftForm: FormSchema;
  /** Published state is strictly decoupled from ongoing draft edits until explicitly published. */
  isPublished: boolean;
  publishedVersion: number | null;
  publishedAt: string | null;
  publishedBy: string | null;
  publishedByName: string | null;
  publishedForm: FormSchema | null;
  hasUnpublishedChanges: boolean;
}

export interface FormVersionDiffEntry {
  category: 'meta' | 'field' | 'logic' | 'theme' | 'settings';
  changeType: 'added' | 'removed' | 'modified';
  targetId?: string;
  label: string;
  detail: string;
}

export interface FormVersionComparison {
  fromVersion: number;
  toVersion: number;
  summary: string;
  totalChanges: number;
  entries: FormVersionDiffEntry[];
}

export interface FormSaveConflictPayload {
  code: 'VERSION_CONFLICT';
  message: string;
  expectedVersion: number;
  currentVersion: number;
  lastEditedBy: string;
  lastEditedByName: string;
  updatedAt: string;
  serverForm: FormSchema;
  diff: FormVersionComparison;
}

// ============================================================================
// Workspace Audit Logs (Strictly Non-Sensitive Metadata Only)
// ============================================================================

export type WorkspaceAuditAction =
  | 'workspace.created'
  | 'workspace.settings_updated'
  | 'workspace.ownership_transferred'
  | 'member.invited'
  | 'member.invitation_resent'
  | 'member.invitation_revoked'
  | 'member.joined'
  | 'member.role_changed'
  | 'member.removed'
  | 'form.created'
  | 'form.updated'
  | 'form.version_saved'
  | 'form.version_restored'
  | 'form.published'
  | 'form.unpublished'
  | 'form.deleted'
  | 'component.shared'
  | 'component.deleted'
  | 'responses.exported'
  | 'integration.changed'
  | 'workflow.activated'
  | 'workflow.deactivated';

export interface WorkspaceAuditLogEntry {
  id: string;
  workspaceId: string;
  action: WorkspaceAuditAction;
  actorId: string;
  actorName: string;
  actorEmail?: string;
  actorRole: WorkspaceRole;
  targetType: 'workspace' | 'member' | 'invitation' | 'form' | 'component' | 'responses' | 'integration' | 'workflow';
  targetId?: string;
  targetLabel?: string;
  summary: string;
  /** Strictly non-sensitive metadata (counts, role names, version numbers — NEVER respondent answers). */
  metadata?: Record<string, string | number | boolean>;
  createdAt: string;
}

export interface WorkspacePlanEntitlements {
  planTier: PlanTier;
  rolloutMode: 'open_access' | 'plan_enforced';
  maxWorkspaces: number | null;
  maxMembersPerWorkspace: number | null;
  auditLogsEnabled: boolean;
  versionHistoryRetentionCount: number;
}
