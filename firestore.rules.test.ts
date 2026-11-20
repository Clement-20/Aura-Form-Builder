/**
 * Phase 0 Security TDD Specification Tests for Firestore Security Rules
 *
 * Verifies the "Dirty Dozen" adversarial payloads defined in security_spec.md
 * against firestore.rules when run with the Firebase Rules Unit Testing emulator.
 *
 * Run with Firebase Emulator:
 *   firebase emulators:exec --only firestore "npx tsx firestore.rules.test.ts"
 */

export interface AdversarialPayloadCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  actor: { uid: string; emailVerified: boolean; role?: 'owner' | 'editor' | 'viewer' | 'outsider' };
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_PAYLOADS: AdversarialPayloadCase[] = [
  {
    id: 1,
    name: 'Shadow Field Injection on Team Create',
    operation: 'create',
    path: 'teams/team_shadow',
    actor: { uid: 'user_a', emailVerified: true },
    payload: {
      id: 'team_shadow',
      name: 'Shadow Team',
      description: 'Test',
      ownerId: 'user_a',
      inviteCode: 'JOIN1234',
      isVerified: true, // ghost field
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Self-Assigned Owner Escalation via Editor Invite',
    operation: 'create',
    path: 'teams/team_1/members/attacker_uid',
    actor: { uid: 'attacker_uid', emailVerified: true },
    payload: {
      uid: 'attacker_uid',
      teamId: 'team_1',
      displayName: 'Attacker',
      color: '#0F766E',
      role: 'owner', // invite only grants editor
      inviteCode: 'EDITORCODE1',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Unverified Email Write Attempt',
    operation: 'create',
    path: 'teams/team_unverified',
    actor: { uid: 'unverified_u', emailVerified: false },
    payload: {
      id: 'team_unverified',
      name: 'Unverified Team',
      description: '',
      ownerId: 'unverified_u',
      inviteCode: 'UNVER123',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Cross-User PII Read on /users/{userId}',
    operation: 'get',
    path: 'users/user_a',
    actor: { uid: 'user_b', emailVerified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Invite Code Collection Scraping',
    operation: 'list',
    path: 'teamInvites',
    actor: { uid: 'user_b', emailVerified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Viewer Form Mutation Attempt',
    operation: 'update',
    path: 'teams/team_1/forms/form_1',
    actor: { uid: 'viewer_uid', emailVerified: true, role: 'viewer' },
    payload: { title: 'Hijacked Title' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Revoked Member Form Read Attempt',
    operation: 'get',
    path: 'teams/team_1/forms/form_1',
    actor: { uid: 'revoked_uid', emailVerified: true, role: 'outsider' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Author Spoofing on Comment Create',
    operation: 'create',
    path: 'teams/team_1/forms/form_1/comments/c_spoof',
    actor: { uid: 'user_b', emailVerified: true, role: 'editor' },
    payload: {
      id: 'c_spoof',
      teamId: 'team_1',
      formId: 'form_1',
      fieldId: '',
      authorId: 'user_a', // spoofed authorId
      authorName: 'Victim',
      authorColor: '#0F766E',
      text: 'Spoofed comment',
      resolved: false,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Client Timestamp Forgery on Form Create',
    operation: 'create',
    path: 'teams/team_1/forms/form_forged',
    actor: { uid: 'user_a', emailVerified: true, role: 'owner' },
    payload: {
      id: 'form_forged',
      teamId: 'team_1',
      ownerId: 'user_a',
      createdAt: '2020-01-01T00:00:00.000Z', // forged client timestamp instead of serverTimestamp
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Immutable OwnerId Tampering on Form Update',
    operation: 'update',
    path: 'teams/team_1/forms/form_1',
    actor: { uid: 'editor_uid', emailVerified: true, role: 'editor' },
    payload: { ownerId: 'editor_uid' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Path ID Poisoning with Invalid Characters',
    operation: 'create',
    path: 'teams/bad$id..evil',
    actor: { uid: 'user_a', emailVerified: true },
    payload: { id: 'bad$id..evil', name: 'Poison' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Value Poisoning with Oversized Form Title (>200 chars)',
    operation: 'update',
    path: 'teams/team_1/forms/form_1',
    actor: { uid: 'editor_uid', emailVerified: true, role: 'editor' },
    payload: { title: 'A'.repeat(205) },
    expected: 'PERMISSION_DENIED',
  },
];
