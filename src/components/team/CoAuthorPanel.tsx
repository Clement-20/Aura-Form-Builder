import React, { useState } from 'react';
import {
  X,
  UsersThree,
  ChatCircleText,
  ClockCounterClockwise,
  PaperPlaneRight,
  Check,
  Trash,
  Copy,
  LinkSimple,
  ShareNetwork,
  SignIn,
  Eye,
  PencilSimple,
  Crown,
} from '@phosphor-icons/react';
import { FormField } from '../../types/form';
import {
  CollaboratorPresence,
  FormActivityItem,
  FormComment,
  TeamMember,
  TeamRole,
  TeamWorkspace,
} from '../../types/team';
import { useFirebase } from '../../contexts/FirebaseContext';

interface CoAuthorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isTeamForm: boolean;
  team: TeamWorkspace | null;
  role: TeamRole | null;
  teamMembers: TeamMember[];
  collaborators: CollaboratorPresence[];
  comments: FormComment[];
  activity: FormActivityItem[];
  fields: FormField[];
  activeFieldId: string | null;
  onSelectField: (fieldId: string) => void;
  onAddComment: (text: string, fieldId: string) => Promise<void>;
  onToggleResolveComment: (commentId: string, resolved: boolean) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onMoveToTeam?: (teamId: string) => Promise<void>;
  onOpenTeamModal: () => void;
}

export const CoAuthorPanel: React.FC<CoAuthorPanelProps> = ({
  isOpen,
  onClose,
  isTeamForm,
  team,
  role,
  teamMembers,
  collaborators,
  comments,
  activity,
  fields,
  activeFieldId,
  onSelectField,
  onAddComment,
  onToggleResolveComment,
  onDeleteComment,
  onMoveToTeam,
  onOpenTeamModal,
}) => {
  const { firebaseUser, memberships, signInWithGoogle, authBusy } = useFirebase();
  const [tab, setTab] = useState<'people' | 'comments' | 'activity'>('people');
  const [commentText, setCommentText] = useState('');
  const [pinToActiveField, setPinToActiveField] = useState(true);
  const [sending, setSending] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [movingTeamId, setMovingTeamId] = useState<string | null>(null);

  if (!isOpen) return null;

  const activeField = fields.find((f) => f.id === activeFieldId);
  const openCommentsCount = comments.filter((c) => !c.resolved).length;

  const handleCopyInviteLink = () => {
    if (!team) return;
    const url = `${window.location.origin}${window.location.pathname}#join=${team.inviteCode}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSending(true);
    try {
      await onAddComment(commentText.trim(), pinToActiveField && activeFieldId ? activeFieldId : '');
      setCommentText('');
    } finally {
      setSending(false);
    }
  };

  const handleMove = async (teamId: string) => {
    if (!onMoveToTeam) return;
    setMovingTeamId(teamId);
    try {
      await onMoveToTeam(teamId);
    } finally {
      setMovingTeamId(null);
    }
  };

  const formatTimeAgo = (iso: string) => {
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B0D0F]/50 backdrop-blur-sm flex items-end lg:items-stretch lg:justify-end"
      onClick={onClose}
    >
      <div
        className="w-full lg:w-[400px] bg-[#F7F6F3] rounded-t-[2rem] lg:rounded-none lg:rounded-l-[2rem] max-h-[88dvh] lg:max-h-full flex flex-col overflow-hidden shadow-2xl ring-1 ring-black/[0.08]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-white border-b border-black/[0.06] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0F766E]/10 text-[#0F766E] flex items-center justify-center">
              <UsersThree size={18} weight="light" />
            </div>
            <div>
              <h3 className="text-sm font-display font-semibold text-[#0B0D0F]">
                {isTeamForm && team ? team.name : 'Co-Authoring'}
              </h3>
              <p className="text-[11px] text-[#5C6066]">
                {isTeamForm
                  ? `${collaborators.length} online right now`
                  : 'Personal local draft'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close co-authoring panel"
            className="w-8 h-8 rounded-full bg-black/[0.04] hover:bg-black/[0.08] text-[#5C6066] flex items-center justify-center"
          >
            <X size={15} weight="light" />
          </button>
        </div>

        {/* Non-Team Form Prompt: 1-Tap Share to Team */}
        {!isTeamForm ? (
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            <div className="bg-white rounded-2xl p-5 ring-1 ring-black/[0.06] space-y-4">
              <div className="w-11 h-11 rounded-2xl bg-[#0F766E]/10 text-[#0F766E] flex items-center justify-center">
                <ShareNetwork size={22} weight="light" />
              </div>
              <div className="space-y-1.5">
                <h4 className="font-display font-semibold text-base text-[#0B0D0F]">
                  Co-author this form with a team
                </h4>
                <p className="text-xs text-[#5C6066] leading-relaxed">
                  Right now this form is saved only on your device. Share it into a Team Workspace to edit live with teammates, see active cursors, and discuss questions together.
                </p>
              </div>

              {!firebaseUser ? (
                <button
                  type="button"
                  onClick={signInWithGoogle}
                  disabled={authBusy}
                  className="w-full min-h-[44px] rounded-full bg-[#0B0D0F] text-[#F7F6F3] text-xs font-semibold flex items-center justify-center gap-2 hover:bg-[#191D21] transition-colors"
                >
                  <SignIn size={15} weight="light" />
                  <span>{authBusy ? 'Connecting...' : 'Sign in with Google'}</span>
                </button>
              ) : memberships.filter((m) => m.role !== 'viewer').length > 0 ? (
                <div className="space-y-2.5 pt-1">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#5C6066] block">
                    Share copy to a team workspace
                  </span>
                  {memberships
                    .filter((m) => m.role !== 'viewer')
                    .map((m) => (
                      <button
                        key={m.teamId}
                        type="button"
                        disabled={movingTeamId === m.teamId}
                        onClick={() => handleMove(m.teamId)}
                        className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#F7F6F3] hover:bg-[#0B0D0F] text-[#0B0D0F] hover:text-[#F7F6F3] text-xs font-semibold flex items-center justify-between transition-colors"
                      >
                        <span className="truncate">{m.teamName}</span>
                        <span className="text-[11px] font-mono">
                          {movingTeamId === m.teamId ? 'Sharing...' : 'Share Live ->'}
                        </span>
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={onOpenTeamModal}
                    className="w-full py-2 text-xs font-semibold text-[#0F766E] hover:underline"
                  >
                    + Create or join another team
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onOpenTeamModal}
                  className="w-full min-h-[44px] rounded-full bg-[#0F766E] text-white text-xs font-semibold flex items-center justify-center gap-2 hover:bg-[#115E59] transition-colors"
                >
                  <UsersThree size={16} weight="light" />
                  <span>Create or Join a Team First</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Team Form Live Collaboration Tabs */
          <>
            <div className="px-4 py-2.5 bg-white border-b border-black/[0.06] grid grid-cols-3 gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setTab('people')}
                className={`min-h-[36px] rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  tab === 'people'
                    ? 'bg-[#0B0D0F] text-[#F7F6F3]'
                    : 'text-[#5C6066] hover:bg-[#F7F6F3]'
                }`}
              >
                <UsersThree size={14} weight="light" />
                <span>Team ({teamMembers.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('comments')}
                className={`min-h-[36px] rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  tab === 'comments'
                    ? 'bg-[#0B0D0F] text-[#F7F6F3]'
                    : 'text-[#5C6066] hover:bg-[#F7F6F3]'
                }`}
              >
                <ChatCircleText size={14} weight="light" />
                <span>Notes ({openCommentsCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('activity')}
                className={`min-h-[36px] rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  tab === 'activity'
                    ? 'bg-[#0B0D0F] text-[#F7F6F3]'
                    : 'text-[#5C6066] hover:bg-[#F7F6F3]'
                }`}
              >
                <ClockCounterClockwise size={14} weight="light" />
                <span>Log</span>
              </button>
            </div>

            {/* Tab 1: People & Invite */}
            {tab === 'people' && (
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                {/* Invite Shortcut */}
                {team && (
                  <div className="bg-white rounded-2xl p-4 ring-1 ring-black/[0.06] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#5C6066]">
                        Invite Co-Authors
                      </span>
                      <button
                        type="button"
                        onClick={onOpenTeamModal}
                        className="text-[11px] font-semibold text-[#0F766E] hover:underline"
                      >
                        Manage Roles
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 px-3 py-2 rounded-xl bg-[#F7F6F3] font-mono text-xs font-semibold tracking-wider text-[#0B0D0F] flex items-center justify-between">
                        <span>{team.inviteCode}</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(team.inviteCode);
                          }}
                          className="text-[#5C6066] hover:text-[#0B0D0F]"
                          title="Copy invite code"
                        >
                          <Copy size={14} weight="light" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyInviteLink}
                        className="px-3.5 py-2 rounded-xl bg-[#0B0D0F] text-[#F7F6F3] text-xs font-semibold flex items-center gap-1.5 shrink-0"
                      >
                        {copiedLink ? (
                          <>
                            <Check size={13} weight="bold" className="text-emerald-400" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <LinkSimple size={13} weight="light" />
                            <span>Link</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Active Online Now */}
                <div className="space-y-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#0F766E] block px-1">
                    Active in this form ({collaborators.length})
                  </span>
                  <div className="space-y-2">
                    {collaborators.map((c) => {
                      const editingField = fields.find((f) => f.id === c.activeFieldId);
                      const isMe = c.uid === firebaseUser?.uid;
                      return (
                        <button
                          key={c.uid}
                          type="button"
                          onClick={() => {
                            if (c.activeFieldId) onSelectField(c.activeFieldId);
                          }}
                          className="w-full text-left p-3 rounded-2xl bg-white ring-1 ring-black/[0.06] hover:ring-black/15 flex items-center gap-3 transition-all"
                        >
                          <div className="relative shrink-0">
                            {c.photoURL ? (
                              <img
                                src={c.photoURL}
                                alt={c.displayName}
                                referrerPolicy="no-referrer"
                                className="w-9 h-9 rounded-full object-cover ring-2"
                                style={{ borderColor: c.color }}
                              />
                            ) : (
                              <div
                                className="w-9 h-9 rounded-full text-white text-xs font-semibold flex items-center justify-center"
                                style={{ backgroundColor: c.color }}
                              >
                                {c.displayName.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-[#0B0D0F] truncate">
                              {c.displayName} {isMe && '(You)'}
                            </p>
                            <p className="text-[11px] text-[#5C6066] truncate">
                              {editingField
                                ? `Editing: ${editingField.label || 'Untitled question'}`
                                : `Viewing ${c.activeTab} tab`}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Full Team Roster */}
                <div className="space-y-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#5C6066] block px-1">
                    All Team Members ({teamMembers.length})
                  </span>
                  <div className="space-y-1.5">
                    {teamMembers.map((m) => (
                      <div
                        key={m.uid}
                        className="px-3 py-2.5 rounded-xl bg-white/80 ring-1 ring-black/[0.05] flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-6 h-6 rounded-full text-white text-[10px] font-semibold flex items-center justify-center shrink-0"
                            style={{ backgroundColor: m.color }}
                          >
                            {m.displayName.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs font-medium text-[#0B0D0F] truncate">
                            {m.displayName}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono uppercase text-[#5C6066] inline-flex items-center gap-1 shrink-0">
                          {m.role === 'owner' && <Crown size={11} weight="fill" className="text-amber-500" />}
                          {m.role === 'editor' && <PencilSimple size={11} weight="light" className="text-[#0F766E]" />}
                          {m.role === 'viewer' && <Eye size={11} weight="light" />}
                          {m.role}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Live Comments */}
            {tab === 'comments' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 p-4 space-y-2.5 overflow-y-auto">
                  {comments.length === 0 ? (
                    <div className="py-12 text-center space-y-2">
                      <ChatCircleText size={28} weight="light" className="text-[#7B8088] mx-auto" />
                      <p className="text-xs font-semibold text-[#0B0D0F]">No notes yet</p>
                      <p className="text-[11px] text-[#5C6066] max-w-[240px] mx-auto">
                        Leave feedback for teammates on the form or pin a note directly to any question.
                      </p>
                    </div>
                  ) : (
                    comments.map((cmt) => {
                      const targetField = cmt.fieldId
                        ? fields.find((f) => f.id === cmt.fieldId)
                        : null;
                      const canResolve =
                        role === 'owner' || role === 'editor' || cmt.authorId === firebaseUser?.uid;
                      const canDelete = role === 'owner' || cmt.authorId === firebaseUser?.uid;

                      return (
                        <div
                          key={cmt.id}
                          className={`p-3.5 rounded-2xl bg-white ring-1 transition-all space-y-2 ${
                            cmt.resolved
                              ? 'opacity-60 ring-black/[0.04]'
                              : 'ring-black/[0.07]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className="w-6 h-6 rounded-full text-white text-[10px] font-semibold flex items-center justify-center shrink-0"
                                style={{ backgroundColor: cmt.authorColor }}
                              >
                                {cmt.authorName.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-[#0B0D0F] truncate">
                                  {cmt.authorName}
                                </p>
                                <p className="text-[10px] text-[#7B8088]">
                                  {formatTimeAgo(cmt.createdAt)}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {canResolve && (
                                <button
                                  type="button"
                                  onClick={() => onToggleResolveComment(cmt.id, !cmt.resolved)}
                                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                                    cmt.resolved
                                      ? 'bg-[#0F766E] text-white'
                                      : 'bg-[#F7F6F3] text-[#5C6066] hover:text-[#0F766E]'
                                  }`}
                                  title={cmt.resolved ? 'Reopen note' : 'Mark resolved'}
                                >
                                  <Check size={12} weight="bold" />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteComment(cmt.id)}
                                  className="w-7 h-7 rounded-full hover:bg-rose-50 text-[#5C6066] hover:text-rose-600 flex items-center justify-center"
                                  title="Delete note"
                                >
                                  <Trash size={12} weight="light" />
                                </button>
                              )}
                            </div>
                          </div>

                          {targetField && (
                            <button
                              type="button"
                              onClick={() => onSelectField(targetField.id)}
                              className="px-2.5 py-1 rounded-full bg-[#F7F6F3] text-[10px] font-medium text-[#0F766E] truncate max-w-full block hover:bg-[#EFECE6]"
                            >
                              On: {targetField.label || 'Untitled question'}
                            </button>
                          )}

                          <p className="text-xs text-[#272A2E] leading-relaxed whitespace-pre-wrap">
                            {cmt.text}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* New Comment Composer */}
                <form
                  onSubmit={handleSubmitComment}
                  className="p-3.5 bg-white border-t border-black/[0.06] space-y-2 shrink-0"
                >
                  {activeField && (
                    <label className="flex items-center gap-2 text-[11px] text-[#5C6066] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pinToActiveField}
                        onChange={(e) => setPinToActiveField(e.target.checked)}
                        className="accent-[#0F766E]"
                      />
                      <span className="truncate">
                        Pin to &quot;{activeField.label || 'Selected question'}&quot;
                      </span>
                    </label>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={1000}
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Write a note for your team..."
                      className="flex-1 px-3.5 py-2.5 text-xs rounded-full bg-[#F7F6F3] ring-1 ring-black/[0.08] focus:bg-white focus:ring-2 focus:ring-[#0B0D0F] focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={sending || !commentText.trim()}
                      aria-label="Send comment"
                      className="w-10 h-10 rounded-full bg-[#0B0D0F] hover:bg-[#191D21] text-[#F7F6F3] disabled:opacity-40 flex items-center justify-center shrink-0 transition-colors"
                    >
                      <PaperPlaneRight size={15} weight="fill" />
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Tab 3: Live Activity Feed */}
            {tab === 'activity' && (
              <div className="p-4 space-y-2.5 overflow-y-auto flex-1">
                {activity.length === 0 ? (
                  <div className="py-12 text-center space-y-2">
                    <ClockCounterClockwise
                      size={28}
                      weight="light"
                      className="text-[#7B8088] mx-auto"
                    />
                    <p className="text-xs font-semibold text-[#0B0D0F]">No activity yet</p>
                    <p className="text-[11px] text-[#5C6066]">
                      Changes made by you and your teammates appear here live.
                    </p>
                  </div>
                ) : (
                  activity.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-2xl bg-white ring-1 ring-black/[0.05] flex items-start gap-2.5"
                    >
                      <div
                        className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                        style={{ backgroundColor: item.authorColor }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-[#0B0D0F]">
                          <span className="font-semibold">{item.authorName}</span>{' '}
                          <span className="text-[#5C6066]">{item.summary}</span>
                        </p>
                        <p className="text-[10px] font-mono text-[#7B8088] mt-0.5">
                          {formatTimeAgo(item.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
