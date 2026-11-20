# AuraForm Co-Authoring & Teaming — Security Specification

## 1. Data Invariants
1. **PII Isolation**: Private user records at `/users/{userId}` (containing `email`) are strictly readable and writable ONLY by the authenticated owner (`request.auth.uid == userId`). Team roster documents (`/teams/{teamId}/members/{memberId}`) never store emails.
2. **Master Gate Membership**: Every sub-resource under `/teams/{teamId}` (`members`, `forms`, `presence`, `comments`, `activity`) requires the caller to be a current member of `/teams/{teamId}/members/{uid}`. Revoking a member removes access immediately.
3. **No Self-Assigned Privilege Escalation**: A user joining a team via `/teamInvites/{inviteCode}` MUST present an active invite whose `teamId` matches `{teamId}` and whose `defaultRole` matches the requested `role` (`editor` or `viewer`). A joiner can NEVER self-assign `owner`.
4. **Role-Based Co-Authoring**:
   - `owner`: Full team management, role changes, member removal, invite regeneration, form CRUD, comments, presence.
   - `editor`: Create and collaboratively update shared team forms, post/resolve comments, publish presence & activity. Cannot change team roles or remove other members.
   - `viewer`: Read-only access to team forms; can post comments and publish presence, but CANNOT create, update, or delete shared forms.
5. **Temporal Integrity**: All `createdAt`, `updatedAt`, `joinedAt`, and `lastSeenAt` fields are strictly validated against `request.time`.
6. **Immutability**: `id`, `teamId`, `ownerId`, `authorId`, and `createdAt` cannot be modified on update.
7. **Zero Shadow Fields & Bounded Payloads**: Every entity enforces `hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` on update, `isValidId` on path variables, and `.size()` limits on every string and array.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Shadow Field Injection on Team Create**: Creating `/teams/t1` with an extra ghost field `isVerified: true`.
2. **Self-Assigned Owner Escalation**: Non-owner creating `/teams/t1/members/{attackerUid}` with `role: 'owner'` using an `editor` invite code.
3. **Unverified Email Write**: Authenticated user with `email_verified: false` attempting to create a team or edit a form.
4. **Cross-User PII Read**: Authenticated user B attempting `get` on `/users/{userA}` containing email PII.
5. **Invite Code Scraping**: Authenticated user attempting `list` on `/teamInvites`.
6. **Viewer Form Mutation**: Team member with `role: 'viewer'` attempting `update` on `/teams/t1/forms/f1`.
7. **Revoked Member Form Read**: Former member (removed from `/teams/t1/members`) attempting `get` on `/teams/t1/forms/f1`.
8. **Author Spoofing on Comment**: Team member creating a comment in `/teams/t1/forms/f1/comments/c1` with `authorId: 'victim_uid'`.
9. **Client Timestamp Forgery**: Creating a team form with `createdAt` set to a past timestamp instead of `request.time`.
10. **Immutable Owner Tampering**: Editor updating `/teams/t1/forms/f1` and attempting to change `ownerId` or `teamId`.
11. **Path ID Poisoning**: Creating `/teams/../../admin$evil` with invalid characters or >128 chars.
12. **Value Poisoning / Oversized Payload**: Updating a form title with a >200 character string or >100 fields array.
