/**
 * Co-Authoring & Teaming type definitions for AuraForm
 */

export type TeamRole = 'owner' | 'admin' | 'editor' | 'analyst' | 'viewer';

export interface UserTeamMembership {
  teamId: string;
  teamName: string;
  role: TeamRole;
  userId: string;
  joinedAt: string;
}

export interface TeamWorkspace {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  inviteCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  uid: string;
  teamId: string;
  displayName: string;
  photoURL?: string;
  color: string;
  role: TeamRole;
  inviteCode?: string;
  joinedAt: string;
}

export interface TeamInvite {
  inviteCode: string;
  teamId: string;
  teamName: string;
  defaultRole: 'editor' | 'viewer';
  createdBy: string;
  active: boolean;
  createdAt: string;
}

export interface CollaboratorPresence {
  uid: string;
  teamId: string;
  formId: string;
  displayName: string;
  photoURL?: string;
  color: string;
  role: TeamRole;
  activeFieldId: string;
  activeTab: 'build' | 'theme' | 'logic' | 'settings' | 'share' | 'analytics';
  lastSeenAtMs: number;
}

export interface FormComment {
  id: string;
  teamId: string;
  formId: string;
  fieldId: string; // empty string = general form comment
  authorId: string;
  authorName: string;
  authorPhotoURL?: string;
  authorColor: string;
  text: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FormActivityItem {
  id: string;
  teamId: string;
  formId: string;
  authorId: string;
  authorName: string;
  authorColor: string;
  action: string;
  summary: string;
  createdAt: string;
}
