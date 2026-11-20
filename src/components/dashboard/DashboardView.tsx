import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Plus,
  MagnifyingGlass,
  Sparkle,
  Stack,
  ArrowUpRight,
  Layout,
  UsersThree,
  UserPlus,
  Laptop,
  SignIn,
  LinkSimple,
  Check,
} from '@phosphor-icons/react';
import { FormSchema } from '../../types/form';
import { FormCard } from './FormCard';
import { useFirebase } from '../../contexts/FirebaseContext';

interface DashboardViewProps {
  forms: FormSchema[];
  onSelectForm: (
    id: string,
    initialTab?: 'build' | 'theme' | 'logic' | 'settings' | 'share' | 'analytics'
  ) => void;
  onPreviewForm: (form: FormSchema) => void;
  onOpenCreateModal: () => void;
  onCreateBlank: () => void;
  onOpenAI: () => void;
  onBrowseTemplates: () => void;
  onDuplicateForm: (id: string) => void;
  onDeleteForm: (id: string) => void;
  onOpenTeamModal: (mode?: 'manage' | 'create' | 'join') => void;
}

const VANGUARD_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

export const DashboardView: React.FC<DashboardViewProps> = ({
  forms,
  onSelectForm,
  onPreviewForm,
  onOpenCreateModal,
  onCreateBlank,
  onOpenAI,
  onBrowseTemplates,
  onDuplicateForm,
  onDeleteForm,
  onOpenTeamModal,
}) => {
  const prefersReduced = useReducedMotion();
  const {
    firebaseUser,
    signInWithGoogle,
    authBusy,
    memberships,
    activeWorkspaceId,
    setActiveWorkspaceId,
    activeTeam,
    activeTeamRole,
    teamMembers,
  } = useFirebase();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all');
  const [copiedInvite, setCopiedInvite] = useState(false);

  const isTeamWorkspace = activeWorkspaceId !== 'personal' && Boolean(activeTeam);
  const canCreateInWorkspace = !isTeamWorkspace || activeTeamRole !== 'viewer';

  // Strictly real computed workspace metrics (zero invented figures)
  const totalForms = forms.length;
  const totalSubmissions = forms.reduce((acc, f) => acc + (f.responsesCount || 0), 0);
  const publishedForms = forms.filter((f) => f.settings.isPublished).length;
  const totalQuestions = forms.reduce((acc, f) => acc + f.fields.length, 0);

  const filteredForms = forms.filter((form) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = form.title.toLowerCase().includes(q);
      const matchDesc = form.description.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc) return false;
    }
    if (filterCategory !== 'all' && form.category !== filterCategory) {
      return false;
    }
    if (filterStatus === 'published' && !form.settings.isPublished) return false;
    if (filterStatus === 'draft' && form.settings.isPublished) return false;
    return true;
  });

  const handleCopyInviteLink = () => {
    if (!activeTeam) return;
    const url = `${window.location.origin}${window.location.pathname}#join=${activeTeam.inviteCode}`;
    navigator.clipboard.writeText(url);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10 pb-24 space-y-7 sm:space-y-9">
      {/* Mobile-First Workspace & Team Switcher Bar */}
      <div className="bg-white p-2.5 sm:p-3 rounded-[1.5rem] ring-1 ring-black/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveWorkspaceId('personal')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all ${
              activeWorkspaceId === 'personal'
                ? 'bg-[#0B0D0F] text-[#F7F6F3]'
                : 'bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F]'
            }`}
          >
            <Laptop size={14} weight="light" />
            <span>Personal (Local)</span>
          </button>

          {memberships.map((m) => {
            const active = activeWorkspaceId === m.teamId;
            return (
              <button
                key={m.teamId}
                type="button"
                onClick={() => setActiveWorkspaceId(m.teamId)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all ${
                  active
                    ? 'bg-[#0F766E] text-white'
                    : 'bg-[#F7F6F3] text-[#0B0D0F] hover:bg-[#EFECE6]'
                }`}
              >
                <UsersThree size={14} weight="light" />
                <span>{m.teamName}</span>
                <span
                  className={`text-[10px] font-mono uppercase ${
                    active ? 'text-emerald-100' : 'text-[#5C6066]'
                  }`}
                >
                  {m.role}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!firebaseUser ? (
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={authBusy}
              className="w-full sm:w-auto min-h-[38px] px-4 py-1.5 rounded-full bg-[#0F766E]/10 hover:bg-[#0F766E]/15 text-[#0F766E] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <SignIn size={14} weight="light" />
              <span>{authBusy ? 'Connecting...' : 'Sign in for Teams'}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onOpenTeamModal('create')}
                className="flex-1 sm:flex-initial min-h-[38px] px-3.5 py-1.5 rounded-full bg-[#F7F6F3] hover:bg-[#EFECE6] text-[#0B0D0F] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus size={14} weight="light" className="text-[#0F766E]" />
                <span>New Team</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenTeamModal('join')}
                className="flex-1 sm:flex-initial min-h-[38px] px-3.5 py-1.5 rounded-full bg-[#F7F6F3] hover:bg-[#EFECE6] text-[#0B0D0F] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <UserPlus size={14} weight="light" className="text-[#0F766E]" />
                <span>Join</span>
              </button>
              {isTeamWorkspace && (
                <button
                  type="button"
                  onClick={() => onOpenTeamModal('manage')}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-full bg-[#0B0D0F] text-[#F7F6F3] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  <UsersThree size={14} weight="light" />
                  <span>Members ({teamMembers.length})</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Workspace Header */}
      <motion.div
        initial={prefersReduced ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: VANGUARD_EASE }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-5"
      >
        <div className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#0F766E]">
            {isTeamWorkspace && activeTeam
              ? `Live Team Workspace · ${activeTeamRole || 'member'}`
              : 'My Personal Workspace'}
          </p>
          <h1 className="text-3xl sm:text-5xl font-display font-semibold tracking-tight text-[#0B0D0F] leading-[1.06]">
            {isTeamWorkspace && activeTeam ? (
              <>
                {activeTeam.name}{' '}
                <span className="font-serif-editorial italic font-normal text-[#0F766E]">
                  forms.
                </span>
              </>
            ) : (
              <>
                Your{' '}
                <span className="font-serif-editorial italic font-normal text-[#0F766E]">
                  forms.
                </span>
              </>
            )}
          </h1>
          <p className="text-sm text-[#5C6066] max-w-lg">
            {isTeamWorkspace && activeTeam
              ? activeTeam.description ||
                'Every form here syncs live with your teammates. Open any form to co-author together in real time.'
              : 'Start a new form in one tap — blank, with AI, or from a template. Switch to a Team above to co-author live.'}
          </p>

          {/* Active Team Quick Invite Strip */}
          {isTeamWorkspace && activeTeam && (
            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <div className="flex items-center -space-x-2">
                {teamMembers.slice(0, 5).map((m) =>
                  m.photoURL ? (
                    <img
                      key={m.uid}
                      src={m.photoURL}
                      alt={m.displayName}
                      title={`${m.displayName} (${m.role})`}
                      referrerPolicy="no-referrer"
                      className="w-7 h-7 rounded-full object-cover ring-2 ring-[#F7F6F3]"
                    />
                  ) : (
                    <span
                      key={m.uid}
                      title={`${m.displayName} (${m.role})`}
                      className="w-7 h-7 rounded-full text-[10px] font-bold text-white ring-2 ring-[#F7F6F3] flex items-center justify-center"
                      style={{ backgroundColor: m.color }}
                    >
                      {m.displayName.charAt(0).toUpperCase()}
                    </span>
                  )
                )}
              </div>
              <button
                type="button"
                onClick={handleCopyInviteLink}
                className="px-3 py-1.5 rounded-full bg-white ring-1 ring-black/[0.08] hover:ring-[#0B0D0F] text-xs font-semibold text-[#0B0D0F] inline-flex items-center gap-1.5 transition-all"
              >
                {copiedInvite ? (
                  <>
                    <Check size={13} weight="bold" className="text-[#0F766E]" />
                    <span>Invite Link Copied</span>
                  </>
                ) : (
                  <>
                    <LinkSimple size={13} weight="light" className="text-[#0F766E]" />
                    <span>Invite Code: {activeTeam.inviteCode}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Mobile-First 3-Way Direct Starter Buttons */}
        {canCreateInWorkspace && (
          <div className="grid grid-cols-3 sm:flex items-center gap-2 sm:gap-3">
            <button
              onClick={onCreateBlank}
              className="min-h-[44px] px-3 sm:px-5 py-2.5 rounded-full bg-[#0B0D0F] hover:bg-[#191D21] text-[#F7F6F3] text-xs font-semibold transition-all inline-flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              <Plus size={15} weight="light" />
              <span>Blank</span>
            </button>

            <button
              onClick={onOpenAI}
              className="min-h-[44px] px-3 sm:px-5 py-2.5 rounded-full bg-white text-[#0B0D0F] text-xs font-semibold ring-1 ring-black/[0.08] hover:ring-[#0B0D0F] transition-all inline-flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              <Sparkle size={15} weight="light" className="text-[#0F766E]" />
              <span>Ask AI</span>
            </button>

            <button
              onClick={onBrowseTemplates}
              className="min-h-[44px] px-3 sm:px-5 py-2.5 rounded-full bg-white text-[#0B0D0F] text-xs font-semibold ring-1 ring-black/[0.08] hover:ring-[#0B0D0F] transition-all inline-flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              <Layout size={15} weight="light" className="text-[#0F766E]" />
              <span>Templates</span>
            </button>
          </div>
        )}
      </motion.div>

      {/* Double-Bezel Real Metrics Strip */}
      <motion.div
        initial={prefersReduced ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: prefersReduced ? 0 : 0.06, ease: VANGUARD_EASE }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-5"
      >
        <div className="bezel-outer">
          <div className="bezel-inner p-6">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#5C6066] block">
              {isTeamWorkspace ? 'Team Forms' : 'Workspace Forms'}
            </span>
            <div className="flex items-baseline gap-2.5 mt-3">
              <span className="text-3xl font-display font-semibold font-mono text-[#0B0D0F] tabular-nums">
                {totalForms}
              </span>
              <span className="text-xs text-[#5C6066] font-mono">
                {publishedForms} live
              </span>
            </div>
          </div>
        </div>

        <div className="bezel-outer">
          <div className="bezel-inner p-6">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#5C6066] block">
              Collected Responses
            </span>
            <div className="flex items-baseline gap-2.5 mt-3">
              <span className="text-3xl font-display font-semibold font-mono text-[#0B0D0F] tabular-nums">
                {totalSubmissions}
              </span>
              <span className="text-xs text-[#0F766E] font-mono">
                {isTeamWorkspace ? 'synced to cloud' : 'stored locally'}
              </span>
            </div>
          </div>
        </div>

        <div className="bezel-outer">
          <div className="bezel-inner p-6">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#5C6066] block">
              {isTeamWorkspace ? 'Co-Authors' : 'Authored Questions'}
            </span>
            <div className="flex items-baseline gap-2.5 mt-3">
              <span className="text-3xl font-display font-semibold font-mono text-[#0B0D0F] tabular-nums">
                {isTeamWorkspace ? teamMembers.length : totalQuestions}
              </span>
              <span className="text-xs text-[#5C6066] font-mono">
                {isTeamWorkspace
                  ? `active team ${teamMembers.length === 1 ? 'member' : 'members'}`
                  : `across ${totalForms} ${totalForms === 1 ? 'schema' : 'schemas'}`}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Search & Segmented Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlass
            size={15}
            weight="light"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-[#7B8088]"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search schemas by title or topic..."
            className="w-full pl-10 pr-4 py-2.5 text-xs rounded-full bg-white ring-1 ring-black/[0.08] focus:outline-none focus:ring-2 focus:ring-[#0B0D0F] transition-shadow"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <div className="inline-flex items-center gap-1 p-1 rounded-full bg-black/[0.045] text-xs">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'published', label: 'Live' },
                { id: 'draft', label: 'Drafts' },
              ] as const
            ).map((status) => (
              <button
                key={status.id}
                onClick={() => setFilterStatus(status.id)}
                className={`px-3.5 py-1.5 rounded-full font-medium transition-all duration-300 ${
                  filterStatus === status.id
                    ? 'bg-white text-[#0B0D0F] shadow-xs'
                    : 'text-[#5C6066] hover:text-[#0B0D0F]'
                }`}
              >
                {status.label}
              </button>
            ))}
          </div>

          {/* Category Filter */}
          <div className="inline-flex items-center gap-1 p-1 rounded-full bg-black/[0.045] text-xs overflow-x-auto">
            {[
              { id: 'all', label: 'All Categories' },
              { id: 'registration', label: 'Registration' },
              { id: 'feedback', label: 'Feedback' },
              { id: 'quiz', label: 'Quizzes' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterCategory(tab.id)}
                className={`px-3.5 py-1.5 rounded-full font-medium transition-all duration-300 whitespace-nowrap shrink-0 ${
                  filterCategory === tab.id
                    ? 'bg-white text-[#0B0D0F] shadow-xs'
                    : 'text-[#5C6066] hover:text-[#0B0D0F]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Forms Grid or Clean Zero-State */}
      {filteredForms.length === 0 ? (
        <div className="bezel-outer">
          <div className="bezel-inner px-6 py-20 text-center space-y-6">
            <div className="w-14 h-14 rounded-2xl bg-[#F7F6F3] ring-1 ring-black/[0.06] text-[#0F766E] mx-auto flex items-center justify-center">
              <Stack size={26} weight="light" />
            </div>

            <div className="space-y-2 max-w-md mx-auto">
              <h2 className="text-xl font-display font-semibold text-[#0B0D0F]">
                {searchQuery || filterCategory !== 'all' || filterStatus !== 'all'
                  ? 'No schemas match your filters'
                  : 'Your workspace is ready'}
              </h2>
              <p className="text-sm text-[#5C6066] leading-relaxed">
                {searchQuery || filterCategory !== 'all' || filterStatus !== 'all'
                  ? 'Try clearing your search or switching category tabs.'
                  : 'Start with a blank canvas, synthesize a schema with AI, or clone one of our tested blueprints.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={onOpenCreateModal}
                className="group inline-flex items-center gap-3 pl-5 pr-2 py-2 rounded-full bg-[#0B0D0F] hover:bg-[#191D21] text-[#F7F6F3] text-xs font-semibold transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
              >
                <span>Create First Form</span>
                <span className="w-7 h-7 rounded-full bg-white/[0.14] flex items-center justify-center transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                  <ArrowUpRight size={14} weight="light" />
                </span>
              </button>

              <button
                onClick={onBrowseTemplates}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[#F7F6F3] hover:bg-[#EFECE6] text-[#0B0D0F] text-xs font-semibold ring-1 ring-black/[0.06] transition-all duration-300"
              >
                <Layout size={15} weight="light" className="text-[#0F766E]" />
                <span>Browse Blueprints</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredForms.map((form) => (
            <FormCard
              key={form.id}
              form={form}
              onEdit={(id) => onSelectForm(id, 'build')}
              onPreview={onPreviewForm}
              onShare={(f) => onSelectForm(f.id, 'share')}
              onAnalytics={(id) => onSelectForm(id, 'analytics')}
              onDuplicate={onDuplicateForm}
              onDelete={onDeleteForm}
            />
          ))}
        </div>
      )}
    </div>
  );
};
