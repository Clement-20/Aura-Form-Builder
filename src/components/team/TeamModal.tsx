import React, { useState, useEffect } from 'react';
import {
  X,
  UsersThree,
  Plus,
  Copy,
  Check,
  SignIn,
  Crown,
  PencilSimple,
  Eye,
  Trash,
  ArrowsClockwise,
  LinkSimple,
  SignOut,
  UserPlus,
  Sparkle,
} from '@phosphor-icons/react';
import { useFirebase } from '../../contexts/FirebaseContext';
import { TeamRole } from '../../types/team';

interface TeamModalProps {
  isOpen: boolean;
  initialMode?: 'manage' | 'create' | 'join';
  initialInviteCode?: string;
  onClose: () => void;
}

export const TeamModal: React.FC<TeamModalProps> = ({
  isOpen,
  initialMode = 'manage',
  initialInviteCode = '',
  onClose,
}) => {
  const {
    firebaseUser,
    authBusy,
    authError,
    signInWithGoogle,
    memberships,
    activeWorkspaceId,
    setActiveWorkspaceId,
    activeTeam,
    activeTeamRole,
    teamMembers,
    createTeam,
    joinTeam,
    changeMemberRole,
    kickMember,
    leaveActiveTeam,
    rotateInviteCode,
  } = useFirebase();

  const [mode, setMode] = useState<'manage' | 'create' | 'join'>(initialMode);
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');
  const [defaultInviteRole, setDefaultInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [joinCodeInput, setJoinCodeInput] = useState(initialInviteCode);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedType, setCopiedType] = useState<'code' | 'link' | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFeedback(null);
      if (initialInviteCode) {
        setJoinCodeInput(initialInviteCode);
        setMode('join');
      } else if (initialMode === 'manage' && activeWorkspaceId === 'personal' && memberships.length === 0) {
        setMode('create');
      } else {
        setMode(initialMode);
      }
    }
  }, [isOpen, initialMode, initialInviteCode, activeWorkspaceId, memberships.length]);

  if (!isOpen) return null;

  const extractInviteCode = (input: string) => {
    const trimmed = input.trim();
    const match = trimmed.match(/#join=([a-zA-Z0-9_-]+)/i);
    if (match) return match[1].toUpperCase();
    return trimmed.toUpperCase();
  };

  const inviteLink = activeTeam
    ? `${window.location.origin}${window.location.pathname}#join=${activeTeam.inviteCode}`
    : '';

  const handleCopy = (val: string, kind: 'code' | 'link') => {
    navigator.clipboard.writeText(val);
    setCopiedType(kind);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      await createTeam(teamName.trim(), teamDesc.trim(), defaultInviteRole);
      setTeamName('');
      setTeamDesc('');
      setFeedback({ type: 'success', text: 'Team created! Copy the invite link to bring teammates in.' });
      setMode('manage');
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Could not create team.' });
    } finally {
      setBusy(false);
    }
  };

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = extractInviteCode(joinCodeInput);
    if (!code) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await joinTeam(code);
      setJoinCodeInput('');
      setFeedback({
        type: 'success',
        text: res.alreadyMember
          ? `Switched to ${res.teamName}.`
          : `Joined ${res.teamName}! You can now co-author forms together.`,
      });
      setMode('manage');
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Invite code not found or expired.' });
    } finally {
      setBusy(false);
    }
  };

  const handleRotateInvite = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await rotateInviteCode(defaultInviteRole);
      setFeedback({ type: 'success', text: 'New invite link generated. Old links are now disabled.' });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Could not refresh invite code.' });
    } finally {
      setBusy(false);
    }
  };

  const roleBadge = (role: TeamRole) => {
    if (role === 'owner') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#0B0D0F] text-[#F7F6F3] text-[10px] font-mono uppercase tracking-wider">
          <Crown size={11} weight="fill" className="text-amber-400" />
          Owner
        </span>
      );
    }
    if (role === 'editor') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#0F766E]/10 text-[#0F766E] text-[10px] font-mono uppercase tracking-wider">
          <PencilSimple size={11} weight="bold" />
          Editor
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/[0.06] text-[#5C6066] text-[10px] font-mono uppercase tracking-wider">
        <Eye size={11} weight="bold" />
        Viewer
      </span>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B0D0F]/60 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-xl p-1.5 rounded-t-[2rem] sm:rounded-[2rem] bg-white/25 ring-1 ring-white/30 shadow-[0_32px_80px_-20px_rgba(11,13,15,0.45)] max-h-[92dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-t-[calc(2rem-6px)] sm:rounded-[calc(2rem-6px)] bg-[#F7F6F3] text-[#0B0D0F] overflow-hidden flex flex-col max-h-full">
          {/* Header */}
          <div className="px-5 sm:px-7 py-5 bg-white border-b border-black/[0.06] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#0F766E]/10 text-[#0F766E] flex items-center justify-center shrink-0">
                <UsersThree size={20} weight="light" />
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#0F766E]">
                  Teams &amp; Co-Authoring
                </p>
                <h3 className="text-base sm:text-lg font-display font-semibold text-[#0B0D0F]">
                  Build forms together in real time
                </h3>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close team modal"
              className="w-9 h-9 rounded-full bg-black/[0.04] hover:bg-black/[0.08] text-[#5C6066] flex items-center justify-center"
            >
              <X size={16} weight="light" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 sm:p-6 space-y-5 overflow-y-auto">
            {!firebaseUser ? (
              /* Step 0: Friendly Sign-in Prompt for Beginners */
              <div className="bg-white rounded-2xl p-6 ring-1 ring-black/[0.06] text-center space-y-5">
                <div className="w-14 h-14 rounded-2xl bg-[#F7F6F3] ring-1 ring-black/[0.06] text-[#0F766E] mx-auto flex items-center justify-center">
                  <Sparkle size={26} weight="light" />
                </div>
                <div className="space-y-2 max-w-sm mx-auto">
                  <h4 className="text-lg font-display font-semibold text-[#0B0D0F]">
                    Sign in to unlock live teaming
                  </h4>
                  <p className="text-xs text-[#5C6066] leading-relaxed">
                    Sign in with Google to create shared team workspaces, invite teammates with a link, see who is editing which question live, and leave comments together.
                  </p>
                </div>

                {authError && (
                  <p className="text-xs text-rose-600 bg-rose-50 px-3.5 py-2 rounded-xl">
                    {authError}
                  </p>
                )}

                <button
                  type="button"
                  onClick={signInWithGoogle}
                  disabled={authBusy}
                  className="w-full sm:w-auto min-h-[48px] px-7 py-3 rounded-full bg-[#0B0D0F] hover:bg-[#191D21] text-[#F7F6F3] text-xs font-semibold inline-flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <SignIn size={16} weight="light" />
                  <span>{authBusy ? 'Connecting...' : 'Continue with Google'}</span>
                </button>
              </div>
            ) : (
              <>
                {/* Mode Switcher */}
                <div className="grid grid-cols-3 gap-1 p-1 rounded-full bg-black/[0.05] text-xs">
                  <button
                    type="button"
                    onClick={() => setMode('manage')}
                    className={`min-h-[38px] rounded-full font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      mode === 'manage'
                        ? 'bg-white text-[#0B0D0F] shadow-xs'
                        : 'text-[#5C6066] hover:text-[#0B0D0F]'
                    }`}
                  >
                    <UsersThree size={14} weight="light" />
                    <span>My Teams</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('create')}
                    className={`min-h-[38px] rounded-full font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      mode === 'create'
                        ? 'bg-white text-[#0B0D0F] shadow-xs'
                        : 'text-[#5C6066] hover:text-[#0B0D0F]'
                    }`}
                  >
                    <Plus size={14} weight="light" />
                    <span>New Team</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('join')}
                    className={`min-h-[38px] rounded-full font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      mode === 'join'
                        ? 'bg-white text-[#0B0D0F] shadow-xs'
                        : 'text-[#5C6066] hover:text-[#0B0D0F]'
                    }`}
                  >
                    <UserPlus size={14} weight="light" />
                    <span>Join</span>
                  </button>
                </div>

                {/* Feedback banner */}
                {feedback && (
                  <div
                    className={`px-4 py-3 rounded-2xl text-xs font-medium ${
                      feedback.type === 'success'
                        ? 'bg-[#0F766E]/10 text-[#0F766E] ring-1 ring-[#0F766E]/20'
                        : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                    }`}
                  >
                    {feedback.text}
                  </div>
                )}

                {/* MODE: MANAGE TEAMS */}
                {mode === 'manage' && (
                  <div className="space-y-4">
                    {memberships.length === 0 ? (
                      <div className="bg-white rounded-2xl p-6 text-center space-y-3 ring-1 ring-black/[0.06]">
                        <p className="text-sm font-display font-semibold text-[#0B0D0F]">
                          No teams yet
                        </p>
                        <p className="text-xs text-[#5C6066]">
                          Create a team workspace or join one with an invite code.
                        </p>
                        <div className="flex items-center justify-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setMode('create')}
                            className="px-4 py-2.5 rounded-full bg-[#0B0D0F] text-[#F7F6F3] text-xs font-semibold"
                          >
                            Create Team
                          </button>
                          <button
                            type="button"
                            onClick={() => setMode('join')}
                            className="px-4 py-2.5 rounded-full bg-[#F7F6F3] text-[#0B0D0F] text-xs font-semibold ring-1 ring-black/[0.08]"
                          >
                            Enter Invite Code
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Team Selector Chips */}
                        <div className="space-y-2">
                          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#5C6066] block">
                            Select Active Team
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {memberships.map((m) => {
                              const active = activeWorkspaceId === m.teamId;
                              return (
                                <button
                                  key={m.teamId}
                                  type="button"
                                  onClick={() => setActiveWorkspaceId(m.teamId)}
                                  className={`px-3.5 py-2 rounded-full text-xs font-semibold transition-all flex items-center gap-2 ${
                                    active
                                      ? 'bg-[#0B0D0F] text-[#F7F6F3]'
                                      : 'bg-white text-[#0B0D0F] ring-1 ring-black/[0.08] hover:ring-black/25'
                                  }`}
                                >
                                  <span>{m.teamName}</span>
                                  <span
                                    className={`text-[10px] font-mono uppercase ${
                                      active ? 'text-emerald-400' : 'text-[#5C6066]'
                                    }`}
                                  >
                                    {m.role}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Active Team Details + Invite Box + Roster */}
                        {activeTeam && (
                          <>
                            {/* Shareable Invite Box */}
                            <div className="bg-white rounded-2xl p-4 sm:p-5 ring-1 ring-black/[0.06] space-y-3.5">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <h4 className="font-display font-semibold text-sm text-[#0B0D0F]">
                                    Invite teammates to {activeTeam.name}
                                  </h4>
                                  <p className="text-xs text-[#5C6066] mt-0.5">
                                    Share the code or link below. Teammates can edit forms with you live.
                                  </p>
                                </div>
                                {activeTeamRole === 'owner' && (
                                  <button
                                    type="button"
                                    onClick={handleRotateInvite}
                                    disabled={busy}
                                    className="w-8 h-8 rounded-full bg-[#F7F6F3] hover:bg-[#EFECE6] text-[#5C6066] hover:text-[#0B0D0F] flex items-center justify-center shrink-0"
                                    title="Generate new invite code"
                                    aria-label="Generate new invite code"
                                  >
                                    <ArrowsClockwise size={14} weight="light" />
                                  </button>
                                )}
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleCopy(activeTeam.inviteCode, 'code')}
                                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#F7F6F3] hover:bg-[#EFECE6] ring-1 ring-black/[0.06] flex items-center justify-between gap-2 text-xs transition-colors"
                                >
                                  <span className="font-mono font-semibold tracking-widest text-[#0B0D0F]">
                                    {activeTeam.inviteCode}
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-[#0F766E] font-semibold">
                                    {copiedType === 'code' ? (
                                      <>
                                        <Check size={14} weight="bold" />
                                        Copied
                                      </>
                                    ) : (
                                      <>
                                        <Copy size={14} weight="light" />
                                        Code
                                      </>
                                    )}
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleCopy(inviteLink, 'link')}
                                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0B0D0F] hover:bg-[#191D21] text-[#F7F6F3] flex items-center justify-center gap-2 text-xs font-semibold transition-colors"
                                >
                                  {copiedType === 'link' ? (
                                    <>
                                      <Check size={14} weight="bold" className="text-emerald-400" />
                                      <span>Invite Link Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <LinkSimple size={14} weight="light" />
                                      <span>Copy Invite Link</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Member Roster */}
                            <div className="bg-white rounded-2xl p-4 sm:p-5 ring-1 ring-black/[0.06] space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#5C6066]">
                                  Team Members ({teamMembers.length})
                                </span>
                                {activeTeamRole && activeTeamRole !== 'owner' && (
                                  <button
                                    type="button"
                                    onClick={leaveActiveTeam}
                                    className="text-[11px] font-semibold text-rose-600 hover:underline inline-flex items-center gap-1"
                                  >
                                    <SignOut size={12} weight="light" />
                                    Leave Team
                                  </button>
                                )}
                              </div>

                              <div className="space-y-2">
                                {teamMembers.map((member) => {
                                  const isSelf = member.uid === firebaseUser.uid;
                                  const canManage = activeTeamRole === 'owner' && !isSelf;
                                  return (
                                    <div
                                      key={member.uid}
                                      className="p-2.5 rounded-xl bg-[#F7F6F3] flex items-center justify-between gap-2.5"
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        {member.photoURL ? (
                                          <img
                                            src={member.photoURL}
                                            alt={member.displayName}
                                            referrerPolicy="no-referrer"
                                            className="w-8 h-8 rounded-full object-cover ring-2 shrink-0"
                                            style={{ borderColor: member.color }}
                                          />
                                        ) : (
                                          <div
                                            className="w-8 h-8 rounded-full text-white text-xs font-semibold flex items-center justify-center shrink-0"
                                            style={{ backgroundColor: member.color }}
                                          >
                                            {member.displayName.charAt(0).toUpperCase()}
                                          </div>
                                        )}
                                        <div className="min-w-0">
                                          <p className="text-xs font-semibold text-[#0B0D0F] truncate">
                                            {member.displayName} {isSelf && '(You)'}
                                          </p>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {canManage ? (
                                          <>
                                            <select
                                              value={member.role}
                                              onChange={(e) =>
                                                changeMemberRole(
                                                  member.uid,
                                                  e.target.value as 'editor' | 'viewer'
                                                )
                                              }
                                              aria-label={`Change role for ${member.displayName}`}
                                              className="px-2.5 py-1.5 rounded-full bg-white ring-1 ring-black/[0.08] text-[11px] font-semibold text-[#0B0D0F] focus:outline-none"
                                            >
                                              <option value="editor">Editor</option>
                                              <option value="viewer">Viewer</option>
                                            </select>
                                            <button
                                              type="button"
                                              onClick={() => kickMember(member.uid)}
                                              aria-label={`Remove ${member.displayName}`}
                                              className="w-7 h-7 rounded-full hover:bg-rose-50 text-[#5C6066] hover:text-rose-600 flex items-center justify-center"
                                            >
                                              <Trash size={14} weight="light" />
                                            </button>
                                          </>
                                        ) : (
                                          roleBadge(member.role)
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* MODE: CREATE TEAM */}
                {mode === 'create' && (
                  <form
                    onSubmit={handleCreateTeam}
                    className="bg-white rounded-2xl p-5 ring-1 ring-black/[0.06] space-y-4"
                  >
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-[#0B0D0F] block">
                        Team Name
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={100}
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        placeholder="e.g. Product Research, Event Crew, Marketing"
                        className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-[#F7F6F3] ring-1 ring-black/[0.08] focus:bg-white focus:ring-2 focus:ring-[#0B0D0F] focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-[#0B0D0F] block">
                        Short Description <span className="text-[#7B8088] font-normal">(optional)</span>
                      </label>
                      <input
                        type="text"
                        maxLength={300}
                        value={teamDesc}
                        onChange={(e) => setTeamDesc(e.target.value)}
                        placeholder="What kind of forms will this team build together?"
                        className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-[#F7F6F3] ring-1 ring-black/[0.08] focus:bg-white focus:ring-2 focus:ring-[#0B0D0F] focus:outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-[#0B0D0F] block">
                        Role for people who join with your invite link
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setDefaultInviteRole('editor')}
                          className={`p-3 rounded-xl text-left transition-all ${
                            defaultInviteRole === 'editor'
                              ? 'bg-[#0B0D0F] text-[#F7F6F3]'
                              : 'bg-[#F7F6F3] text-[#0B0D0F] ring-1 ring-black/[0.06]'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 text-xs font-semibold">
                            <PencilSimple size={14} weight="light" />
                            <span>Editor</span>
                          </div>
                          <p
                            className={`text-[11px] mt-1 ${
                              defaultInviteRole === 'editor' ? 'text-[#A2A8B0]' : 'text-[#5C6066]'
                            }`}
                          >
                            Can edit questions &amp; co-author live
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDefaultInviteRole('viewer')}
                          className={`p-3 rounded-xl text-left transition-all ${
                            defaultInviteRole === 'viewer'
                              ? 'bg-[#0B0D0F] text-[#F7F6F3]'
                              : 'bg-[#F7F6F3] text-[#0B0D0F] ring-1 ring-black/[0.06]'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 text-xs font-semibold">
                            <Eye size={14} weight="light" />
                            <span>Viewer</span>
                          </div>
                          <p
                            className={`text-[11px] mt-1 ${
                              defaultInviteRole === 'viewer' ? 'text-[#A2A8B0]' : 'text-[#5C6066]'
                            }`}
                          >
                            Can view forms &amp; leave comments
                          </p>
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={busy || !teamName.trim()}
                      className="w-full min-h-[46px] rounded-full bg-[#0B0D0F] hover:bg-[#191D21] text-[#F7F6F3] text-xs font-semibold transition-all disabled:opacity-50"
                    >
                      {busy ? 'Creating Team...' : 'Create Team Workspace'}
                    </button>
                  </form>
                )}

                {/* MODE: JOIN TEAM */}
                {mode === 'join' && (
                  <form
                    onSubmit={handleJoinTeam}
                    className="bg-white rounded-2xl p-5 ring-1 ring-black/[0.06] space-y-4"
                  >
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-[#0B0D0F] block">
                        Paste Team Invite Code or Link
                      </label>
                      <input
                        type="text"
                        required
                        value={joinCodeInput}
                        onChange={(e) => setJoinCodeInput(e.target.value)}
                        placeholder="e.g. A7K9P2QX or https://...#join=A7K9P2QX"
                        className="w-full px-3.5 py-3 text-xs font-mono rounded-xl bg-[#F7F6F3] ring-1 ring-black/[0.08] focus:bg-white focus:ring-2 focus:ring-[#0B0D0F] focus:outline-none"
                      />
                      <p className="text-[11px] text-[#5C6066]">
                        Ask your team owner to click &quot;Copy Invite Link&quot; or share their 8-character code.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={busy || !joinCodeInput.trim()}
                      className="w-full min-h-[46px] rounded-full bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold transition-all disabled:opacity-50"
                    >
                      {busy ? 'Joining Team...' : 'Join Team Workspace'}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
