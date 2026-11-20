import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType, pickCollaboratorColor } from './firebase';
import { FormSchema } from '../types/form';
import {
  CollaboratorPresence,
  FormActivityItem,
  FormComment,
  TeamInvite,
  TeamMember,
  TeamRole,
  TeamWorkspace,
  UserTeamMembership,
} from '../types/team';
import { ensureFormSteps } from './storage';

// Recursively remove undefined keys so Firestore never rejects nested optional props
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    if (value instanceof Timestamp) return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

function clampString(val: string | undefined | null, max: number, fallback = ''): string {
  const s = (val ?? fallback).trim();
  return s.length > max ? s.slice(0, max) : s;
}

function toIsoString(val: unknown): string {
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

function toMillis(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'number') return val;
  return Date.now();
}

function generateValidId(prefix: string): string {
  const rand = Math.random().toString(36).substring(2, 10);
  const stamp = Date.now().toString(36);
  return `${prefix}_${stamp}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// =============================================================================
// User Profile Sync (Strictly Private Owner-Only Doc)
// =============================================================================

export async function syncUserProfile(firebaseUser: User, plan: 'free' | 'pro' | 'enterprise' = 'free') {
  const path = `users/${firebaseUser.uid}`;
  const ref = doc(db, 'users', firebaseUser.uid);
  const payload: Record<string, unknown> = {
    uid: firebaseUser.uid,
    displayName: clampString(firebaseUser.displayName || firebaseUser.email?.split('@')[0], 100, 'Collaborator'),
    email: clampString(firebaseUser.email, 200, 'user@example.com'),
    color: pickCollaboratorColor(firebaseUser.uid),
    plan,
    updatedAt: serverTimestamp(),
  };
  if (firebaseUser.photoURL) {
    payload.photoURL = clampString(firebaseUser.photoURL, 500);
  }
  try {
    await setDoc(ref, payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// =============================================================================
// Teams & Memberships
// =============================================================================

export function subscribeToUserTeams(
  uid: string,
  onData: (memberships: UserTeamMembership[]) => void
): Unsubscribe {
  const path = `users/${uid}/teamMemberships`;
  const q = query(collection(db, 'users', uid, 'teamMemberships'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list: UserTeamMembership[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          teamId: data.teamId,
          teamName: data.teamName,
          role: data.role as TeamRole,
          userId: data.userId,
          joinedAt: toIsoString(data.joinedAt),
        };
      });
      list.sort((a, b) => b.joinedAt.localeCompare(a.joinedAt));
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export function subscribeToTeam(
  teamId: string,
  onData: (team: TeamWorkspace | null) => void
): Unsubscribe {
  const path = `teams/${teamId}`;
  return onSnapshot(
    doc(db, 'teams', teamId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const d = snap.data();
      onData({
        id: d.id,
        name: d.name,
        description: d.description || '',
        ownerId: d.ownerId,
        inviteCode: d.inviteCode,
        createdAt: toIsoString(d.createdAt),
        updatedAt: toIsoString(d.updatedAt),
      });
    },
    (error) => handleFirestoreError(error, OperationType.GET, path)
  );
}

export function subscribeToTeamMembers(
  teamId: string,
  onData: (members: TeamMember[]) => void
): Unsubscribe {
  const path = `teams/${teamId}/members`;
  const q = query(collection(db, 'teams', teamId, 'members'), where('teamId', '==', teamId));
  return onSnapshot(
    q,
    (snap) => {
      const list: TeamMember[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: data.uid,
          teamId: data.teamId,
          displayName: data.displayName,
          photoURL: data.photoURL,
          color: data.color,
          role: data.role as TeamRole,
          inviteCode: data.inviteCode,
          joinedAt: toIsoString(data.joinedAt),
        };
      });
      const roleOrder: Record<TeamRole, number> = { owner: 0, editor: 1, viewer: 2 };
      list.sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function createTeamWorkspace(
  firebaseUser: User,
  name: string,
  description: string,
  defaultInviteRole: 'editor' | 'viewer' = 'editor'
): Promise<string> {
  const teamId = generateValidId('team');
  const inviteCode = generateInviteCode();
  const safeName = clampString(name, 100, 'My Team');
  const safeDesc = clampString(description, 300, '');
  const displayName = clampString(
    firebaseUser.displayName || firebaseUser.email?.split('@')[0],
    100,
    'Team Owner'
  );
  const color = pickCollaboratorColor(firebaseUser.uid);

  const batch = writeBatch(db);

  batch.set(doc(db, 'teams', teamId), {
    id: teamId,
    name: safeName,
    description: safeDesc,
    ownerId: firebaseUser.uid,
    inviteCode,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const memberPayload: Record<string, unknown> = {
    uid: firebaseUser.uid,
    teamId,
    displayName,
    color,
    role: 'owner',
    joinedAt: serverTimestamp(),
  };
  if (firebaseUser.photoURL) {
    memberPayload.photoURL = clampString(firebaseUser.photoURL, 500);
  }
  batch.set(doc(db, 'teams', teamId, 'members', firebaseUser.uid), memberPayload);

  batch.set(doc(db, 'users', firebaseUser.uid, 'teamMemberships', teamId), {
    teamId,
    teamName: safeName,
    role: 'owner',
    userId: firebaseUser.uid,
    joinedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'teamInvites', inviteCode), {
    inviteCode,
    teamId,
    teamName: safeName,
    defaultRole: defaultInviteRole,
    createdBy: firebaseUser.uid,
    active: true,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return teamId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `teams/${teamId}`);
  }
}

export async function lookupTeamInvite(rawCode: string): Promise<TeamInvite | null> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[a-zA-Z0-9_-]{6,32}$/.test(code)) return null;
  const path = `teamInvites/${code}`;
  try {
    const snap = await getDoc(doc(db, 'teamInvites', code));
    if (!snap.exists()) return null;
    const d = snap.data();
    if (!d.active) return null;
    return {
      inviteCode: d.inviteCode,
      teamId: d.teamId,
      teamName: d.teamName,
      defaultRole: d.defaultRole,
      createdBy: d.createdBy,
      active: d.active,
      createdAt: toIsoString(d.createdAt),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function joinTeamWithCode(
  firebaseUser: User,
  rawCode: string
): Promise<{ teamId: string; teamName: string; role: TeamRole; alreadyMember: boolean }> {
  const invite = await lookupTeamInvite(rawCode);
  if (!invite) {
    throw new Error('Invite code not found or no longer active.');
  }

  // Check if already a member
  const membershipRef = doc(db, 'users', firebaseUser.uid, 'teamMemberships', invite.teamId);
  try {
    const existingMembership = await getDoc(membershipRef);
    if (existingMembership.exists()) {
      const data = existingMembership.data();
      return {
        teamId: invite.teamId,
        teamName: data.teamName || invite.teamName,
        role: data.role as TeamRole,
        alreadyMember: true,
      };
    }
  } catch {
    // proceed to join
  }

  const displayName = clampString(
    firebaseUser.displayName || firebaseUser.email?.split('@')[0],
    100,
    'Collaborator'
  );
  const color = pickCollaboratorColor(firebaseUser.uid);

  const batch = writeBatch(db);

  const memberPayload: Record<string, unknown> = {
    uid: firebaseUser.uid,
    teamId: invite.teamId,
    displayName,
    color,
    role: invite.defaultRole,
    inviteCode: invite.inviteCode,
    joinedAt: serverTimestamp(),
  };
  if (firebaseUser.photoURL) {
    memberPayload.photoURL = clampString(firebaseUser.photoURL, 500);
  }
  batch.set(doc(db, 'teams', invite.teamId, 'members', firebaseUser.uid), memberPayload);

  batch.set(membershipRef, {
    teamId: invite.teamId,
    teamName: invite.teamName,
    role: invite.defaultRole,
    userId: firebaseUser.uid,
    joinedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return {
      teamId: invite.teamId,
      teamName: invite.teamName,
      role: invite.defaultRole,
      alreadyMember: false,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `teams/${invite.teamId}/members/${firebaseUser.uid}`);
  }
}

export async function updateTeamMemberRole(
  teamId: string,
  memberUid: string,
  role: 'editor' | 'viewer'
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'teams', teamId, 'members', memberUid), { role });
  batch.update(doc(db, 'users', memberUid, 'teamMemberships', teamId), { role });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `teams/${teamId}/members/${memberUid}`);
  }
}

export async function removeTeamMember(teamId: string, memberUid: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'teams', teamId, 'members', memberUid));
  batch.delete(doc(db, 'users', memberUid, 'teamMemberships', teamId));
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `teams/${teamId}/members/${memberUid}`);
  }
}

export async function updateTeamInviteRole(
  inviteCode: string,
  defaultRole: 'editor' | 'viewer'
): Promise<void> {
  const path = `teamInvites/${inviteCode}`;
  try {
    await updateDoc(doc(db, 'teamInvites', inviteCode), { defaultRole });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function regenerateTeamInvite(
  firebaseUser: User,
  team: TeamWorkspace,
  defaultRole: 'editor' | 'viewer' = 'editor'
): Promise<string> {
  const newCode = generateInviteCode();
  const batch = writeBatch(db);

  // Deactivate old invite code
  batch.delete(doc(db, 'teamInvites', team.inviteCode));

  // Create new invite code
  batch.set(doc(db, 'teamInvites', newCode), {
    inviteCode: newCode,
    teamId: team.id,
    teamName: clampString(team.name, 100, 'Team'),
    defaultRole,
    createdBy: firebaseUser.uid,
    active: true,
    createdAt: serverTimestamp(),
  });

  // Update team pointer
  batch.update(doc(db, 'teams', team.id), {
    inviteCode: newCode,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return newCode;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `teams/${team.id}`);
  }
}

// =============================================================================
// Shared Team Forms (Real-Time Co-Authoring)
// =============================================================================

export interface TeamFormMeta {
  teamId: string;
  ownerId: string;
  lastEditedBy: string;
  lastEditedByName: string;
  version: number;
}

export type SharedFormDoc = FormSchema & TeamFormMeta;

function docToSharedForm(data: Record<string, any>): SharedFormDoc {
  return {
    id: data.id,
    teamId: data.teamId,
    ownerId: data.ownerId,
    title: data.title ?? 'Untitled Form',
    description: data.description ?? '',
    category: data.category ?? 'survey',
    layoutMode: data.layoutMode ?? 'conversational',
    theme: data.theme,
    welcomeScreen: data.welcomeScreen,
    thankYouScreen: data.thankYouScreen,
    fields: Array.isArray(data.fields) ? data.fields : [],
    steps: Array.isArray(data.steps) ? data.steps : [],
    logicRules: Array.isArray(data.logicRules) ? data.logicRules : [],
    settings: data.settings,
    responsesCount: typeof data.responsesCount === 'number' ? data.responsesCount : 0,
    lastEditedBy: data.lastEditedBy ?? '',
    lastEditedByName: data.lastEditedByName ?? 'Teammate',
    version: typeof data.version === 'number' ? data.version : 1,
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

export function subscribeToTeamForms(
  teamId: string,
  onData: (forms: SharedFormDoc[]) => void
): Unsubscribe {
  const path = `teams/${teamId}/forms`;
  const q = query(collection(db, 'teams', teamId, 'forms'), where('teamId', '==', teamId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => docToSharedForm(d.data()));
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export function subscribeToTeamForm(
  teamId: string,
  formId: string,
  onData: (form: SharedFormDoc | null) => void
): Unsubscribe {
  const path = `teams/${teamId}/forms/${formId}`;
  return onSnapshot(
    doc(db, 'teams', teamId, 'forms', formId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(docToSharedForm(snap.data()));
    },
    (error) => handleFirestoreError(error, OperationType.GET, path)
  );
}

export async function createTeamForm(
  teamId: string,
  firebaseUser: User,
  baseForm: FormSchema
): Promise<SharedFormDoc> {
  const formId = generateValidId('form');
  const path = `teams/${teamId}/forms/${formId}`;
  const editorName = clampString(
    firebaseUser.displayName || firebaseUser.email?.split('@')[0],
    100,
    'Collaborator'
  );
  const steps = ensureFormSteps(baseForm).slice(0, 30);
  const fields = (baseForm.fields || []).slice(0, 100);
  const logicRules = (baseForm.logicRules || []).slice(0, 100);

  const payload = stripUndefined({
    id: formId,
    teamId,
    ownerId: firebaseUser.uid,
    title: clampString(baseForm.title, 200, 'Untitled Team Form'),
    description: clampString(baseForm.description, 1000, ''),
    category: baseForm.category,
    layoutMode: baseForm.layoutMode,
    theme: baseForm.theme,
    welcomeScreen: baseForm.welcomeScreen,
    thankYouScreen: baseForm.thankYouScreen,
    fields,
    steps,
    logicRules,
    settings: baseForm.settings,
    responsesCount: typeof baseForm.responsesCount === 'number' ? baseForm.responsesCount : 0,
    lastEditedBy: firebaseUser.uid,
    lastEditedByName: editorName,
    version: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await setDoc(doc(db, 'teams', teamId, 'forms', formId), payload);
    // Append initial activity
    await logFormActivity(teamId, formId, firebaseUser, 'created', `Created "${payload.title}" in team workspace`);
    return {
      ...baseForm,
      id: formId,
      teamId,
      ownerId: firebaseUser.uid,
      steps,
      fields,
      logicRules,
      lastEditedBy: firebaseUser.uid,
      lastEditedByName: editorName,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateTeamForm(
  teamId: string,
  formId: string,
  firebaseUser: User,
  form: FormSchema,
  nextVersion: number
): Promise<void> {
  const path = `teams/${teamId}/forms/${formId}`;
  const editorName = clampString(
    firebaseUser.displayName || firebaseUser.email?.split('@')[0],
    100,
    'Collaborator'
  );
  const steps = ensureFormSteps(form).slice(0, 30);
  const fields = (form.fields || []).slice(0, 100);
  const logicRules = (form.logicRules || []).slice(0, 100);

  const updatePayload = stripUndefined({
    title: clampString(form.title, 200, ''),
    description: clampString(form.description, 1000, ''),
    category: form.category,
    layoutMode: form.layoutMode,
    theme: form.theme,
    welcomeScreen: form.welcomeScreen,
    thankYouScreen: form.thankYouScreen,
    fields,
    steps,
    logicRules,
    settings: form.settings,
    responsesCount: typeof form.responsesCount === 'number' ? form.responsesCount : 0,
    lastEditedBy: firebaseUser.uid,
    lastEditedByName: editorName,
    version: nextVersion,
    updatedAt: serverTimestamp(),
  });

  try {
    await updateDoc(doc(db, 'teams', teamId, 'forms', formId), updatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTeamForm(teamId: string, formId: string): Promise<void> {
  const path = `teams/${teamId}/forms/${formId}`;
  try {
    await deleteDoc(doc(db, 'teams', teamId, 'forms', formId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// =============================================================================
// Live Presence (Who is online & which question they are editing)
// =============================================================================

export async function publishFormPresence(
  teamId: string,
  formId: string,
  firebaseUser: User,
  role: TeamRole,
  activeFieldId: string | null,
  activeTab: 'build' | 'theme' | 'logic' | 'settings' | 'share' | 'analytics'
): Promise<void> {
  const path = `teams/${teamId}/forms/${formId}/presence/${firebaseUser.uid}`;
  const payload: Record<string, unknown> = {
    uid: firebaseUser.uid,
    teamId,
    formId,
    displayName: clampString(
      firebaseUser.displayName || firebaseUser.email?.split('@')[0],
      100,
      'Collaborator'
    ),
    color: pickCollaboratorColor(firebaseUser.uid),
    role,
    activeFieldId: clampString(activeFieldId || '', 128),
    activeTab,
    lastSeenAt: serverTimestamp(),
  };
  if (firebaseUser.photoURL) {
    payload.photoURL = clampString(firebaseUser.photoURL, 500);
  }

  try {
    await setDoc(doc(db, 'teams', teamId, 'forms', formId, 'presence', firebaseUser.uid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function clearFormPresence(
  teamId: string,
  formId: string,
  uid: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'teams', teamId, 'forms', formId, 'presence', uid));
  } catch {
    // Ignore cleanup errors on unmount/signout
  }
}

export function subscribeToFormPresence(
  teamId: string,
  formId: string,
  onData: (collaborators: CollaboratorPresence[]) => void
): Unsubscribe {
  const path = `teams/${teamId}/forms/${formId}/presence`;
  const q = query(
    collection(db, 'teams', teamId, 'forms', formId, 'presence'),
    where('teamId', '==', teamId),
    where('formId', '==', formId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const now = Date.now();
      const list: CollaboratorPresence[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            uid: data.uid,
            teamId: data.teamId,
            formId: data.formId,
            displayName: data.displayName,
            photoURL: data.photoURL,
            color: data.color,
            role: data.role as TeamRole,
            activeFieldId: data.activeFieldId || '',
            activeTab: data.activeTab || 'build',
            lastSeenAtMs: toMillis(data.lastSeenAt),
          };
        })
        // Keep collaborators seen within the last 90 seconds
        .filter((c) => now - c.lastSeenAtMs < 90_000);
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

// =============================================================================
// Live Comments & Co-Authoring Activity Feed
// =============================================================================

export function subscribeToFormComments(
  teamId: string,
  formId: string,
  onData: (comments: FormComment[]) => void
): Unsubscribe {
  const path = `teams/${teamId}/forms/${formId}/comments`;
  const q = query(
    collection(db, 'teams', teamId, 'forms', formId, 'comments'),
    where('teamId', '==', teamId),
    where('formId', '==', formId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: FormComment[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: data.id,
          teamId: data.teamId,
          formId: data.formId,
          fieldId: data.fieldId || '',
          authorId: data.authorId,
          authorName: data.authorName,
          authorPhotoURL: data.authorPhotoURL,
          authorColor: data.authorColor,
          text: data.text,
          resolved: Boolean(data.resolved),
          createdAt: toIsoString(data.createdAt),
          updatedAt: toIsoString(data.updatedAt),
        };
      });
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function addFormComment(
  teamId: string,
  formId: string,
  firebaseUser: User,
  text: string,
  fieldId = ''
): Promise<void> {
  const safeText = clampString(text, 1000);
  if (!safeText) return;
  const commentId = generateValidId('cmt');
  const path = `teams/${teamId}/forms/${formId}/comments/${commentId}`;
  const payload: Record<string, unknown> = {
    id: commentId,
    teamId,
    formId,
    fieldId: clampString(fieldId, 128),
    authorId: firebaseUser.uid,
    authorName: clampString(
      firebaseUser.displayName || firebaseUser.email?.split('@')[0],
      100,
      'Collaborator'
    ),
    authorColor: pickCollaboratorColor(firebaseUser.uid),
    text: safeText,
    resolved: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (firebaseUser.photoURL) {
    payload.authorPhotoURL = clampString(firebaseUser.photoURL, 500);
  }
  try {
    await setDoc(doc(db, 'teams', teamId, 'forms', formId, 'comments', commentId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function toggleResolveComment(
  teamId: string,
  formId: string,
  commentId: string,
  resolved: boolean
): Promise<void> {
  const path = `teams/${teamId}/forms/${formId}/comments/${commentId}`;
  try {
    await updateDoc(doc(db, 'teams', teamId, 'forms', formId, 'comments', commentId), {
      resolved,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteFormComment(
  teamId: string,
  formId: string,
  commentId: string
): Promise<void> {
  const path = `teams/${teamId}/forms/${formId}/comments/${commentId}`;
  try {
    await deleteDoc(doc(db, 'teams', teamId, 'forms', formId, 'comments', commentId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function logFormActivity(
  teamId: string,
  formId: string,
  firebaseUser: User,
  action: string,
  summary: string
): Promise<void> {
  const activityId = generateValidId('act');
  const path = `teams/${teamId}/forms/${formId}/activity/${activityId}`;
  try {
    await setDoc(doc(db, 'teams', teamId, 'forms', formId, 'activity', activityId), {
      id: activityId,
      teamId,
      formId,
      authorId: firebaseUser.uid,
      authorName: clampString(
        firebaseUser.displayName || firebaseUser.email?.split('@')[0],
        100,
        'Collaborator'
      ),
      authorColor: pickCollaboratorColor(firebaseUser.uid),
      action: clampString(action, 60, 'updated'),
      summary: clampString(summary, 240, 'Updated form'),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeToFormActivity(
  teamId: string,
  formId: string,
  onData: (items: FormActivityItem[]) => void
): Unsubscribe {
  const path = `teams/${teamId}/forms/${formId}/activity`;
  const q = query(
    collection(db, 'teams', teamId, 'forms', formId, 'activity'),
    where('teamId', '==', teamId),
    where('formId', '==', formId),
    limit(40)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: FormActivityItem[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: data.id,
          teamId: data.teamId,
          formId: data.formId,
          authorId: data.authorId,
          authorName: data.authorName,
          authorColor: data.authorColor,
          action: data.action,
          summary: data.summary,
          createdAt: toIsoString(data.createdAt),
        };
      });
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(list.slice(0, 30));
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}
