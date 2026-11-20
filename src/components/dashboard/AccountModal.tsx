import React, { useState } from 'react';
import { X, Check, Database, SignIn, SignOut } from '@phosphor-icons/react';
import { UserAccount, PlanTier } from '../../types/form';
import { updateUserPlan, saveCurrentUser } from '../../lib/storage';
import { useFirebase } from '../../contexts/FirebaseContext';

interface AccountModalProps {
  user: UserAccount;
  isOpen: boolean;
  onClose: () => void;
  onUserUpdated: (user: UserAccount) => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  user,
  isOpen,
  onClose,
  onUserUpdated,
}) => {
  const { firebaseUser, authBusy, signInWithGoogle, signOutUser, memberships } = useFirebase();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [currentPlan, setCurrentPlan] = useState<PlanTier>(user.plan);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: UserAccount = {
      ...user,
      name,
      email,
      plan: currentPlan,
    };
    saveCurrentUser(updated);
    onUserUpdated(updated);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleSelectPlan = (plan: PlanTier) => {
    setCurrentPlan(plan);
    const updated = updateUserPlan(plan);
    onUserUpdated(updated);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B0D0F]/60 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl p-1.5 rounded-[2rem] bg-white/25 ring-1 ring-white/30 shadow-[0_32px_80px_-20px_rgba(11,13,15,0.45)] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-[calc(2rem-6px)] bg-[#F7F6F3] text-[#0B0D0F] overflow-hidden flex flex-col max-h-full">
          {/* Header */}
          <div className="px-7 py-6 bg-white border-b border-black/[0.06] flex items-center justify-between shrink-0">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#0F766E]">
                Workspace Account
              </p>
              <h3 className="text-lg font-display font-semibold text-[#0B0D0F] mt-0.5">
                Profile, cloud teaming &amp; plan
              </h3>
            </div>
            <button
              onClick={onClose}
              aria-label="Close account settings"
              className="w-9 h-9 rounded-full bg-black/[0.04] hover:bg-black/[0.08] text-[#5C6066] hover:text-[#0B0D0F] flex items-center justify-center transition-colors"
            >
              <X size={16} weight="light" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="p-6 sm:p-7 space-y-6 overflow-y-auto text-xs">
            {/* Cloud Account & Live Co-Authoring Auth */}
            <div className="p-5 rounded-2xl bg-white ring-1 ring-black/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <img
                  src={
                    firebaseUser?.photoURL ||
                    user.avatarUrl ||
                    '/src/assets/images/avatar_demo_creator_1792599916553.jpg'
                  }
                  alt={firebaseUser?.displayName || user.name}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-2xl object-cover bg-neutral-100 ring-1 ring-black/[0.08] shrink-0"
                />
                <div className="space-y-0.5">
                  <p className="font-display font-semibold text-[#0B0D0F] text-sm">
                    {firebaseUser ? firebaseUser.displayName || 'Google Account' : 'Guest Mode (Local)'}
                  </p>
                  <p className="text-[#5C6066] font-mono text-[11px]">
                    {firebaseUser
                      ? `${firebaseUser.email} · ${memberships.length} ${memberships.length === 1 ? 'team' : 'teams'}`
                      : 'Sign in with Google to co-author live with teammates'}
                  </p>
                </div>
              </div>

              {firebaseUser ? (
                <button
                  type="button"
                  onClick={signOutUser}
                  disabled={authBusy}
                  className="px-4 py-2.5 rounded-full bg-[#F7F6F3] hover:bg-rose-50 text-[#0B0D0F] hover:text-rose-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors shrink-0"
                >
                  <SignOut size={14} weight="light" />
                  <span>Sign Out</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={signInWithGoogle}
                  disabled={authBusy}
                  className="px-5 py-2.5 rounded-full bg-[#0B0D0F] hover:bg-[#191D21] text-[#F7F6F3] text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors shrink-0"
                >
                  <SignIn size={14} weight="light" />
                  <span>{authBusy ? 'Connecting...' : 'Sign in with Google'}</span>
                </button>
              )}
            </div>

            {/* Profile Form */}
            <form
              onSubmit={handleSaveProfile}
              className="p-5 rounded-2xl bg-white ring-1 ring-black/[0.06] space-y-5"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-medium text-[#0B0D0F] block">Display Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F7F6F3] ring-1 ring-black/[0.08] focus:outline-none focus:ring-2 focus:ring-[#0B0D0F] focus:bg-white transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-medium text-[#0B0D0F] block">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F7F6F3] ring-1 ring-black/[0.08] focus:outline-none focus:ring-2 focus:ring-[#0B0D0F] focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                {savedSuccess ? (
                  <span className="text-[#0F766E] font-semibold inline-flex items-center gap-1.5">
                    <Check size={14} weight="light" />
                    <span>Profile saved</span>
                  </span>
                ) : (
                  <span />
                )}
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-full bg-[#0B0D0F] text-[#F7F6F3] font-semibold hover:bg-[#191D21] transition-colors active:scale-[0.98]"
                >
                  Save Details
                </button>
              </div>
            </form>

            {/* Persistence Engine */}
            <div className="p-5 rounded-2xl bg-white ring-1 ring-black/[0.06] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0D0F] font-semibold inline-flex items-center gap-2">
                  <Database size={15} weight="light" className="text-[#0F766E]" />
                  <span>Sync Engine</span>
                </span>
                <span className="text-[11px] font-mono text-[#0F766E]">
                  {firebaseUser ? 'Firebase Real-Time Cloud Sync' : 'Local-First Storage'}
                </span>
              </div>
              <p className="text-[#5C6066] leading-relaxed text-[12px]">
                {firebaseUser
                  ? 'Connected to Cloud Firestore for live multi-user co-authoring, collaborator presence, role-based team workspaces, and question comments.'
                  : 'Personal forms save instantly in your browser. Sign in with Google above whenever you want to create or join a live team workspace.'}
              </p>
            </div>

            {/* Subscription Plans */}
            <div className="space-y-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#5C6066] block">
                Workspace Plan
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(
                  [
                    {
                      id: 'free',
                      title: 'Starter',
                      price: '$0',
                      bullets: ['3 Active Forms', '100 Responses / mo', 'Standard Themes'],
                    },
                    {
                      id: 'pro',
                      title: 'Pro Studio',
                      price: '$29/mo',
                      bullets: ['Unlimited Forms', '5,000 Responses / mo', 'AI Form Architect'],
                    },
                    {
                      id: 'enterprise',
                      title: 'Enterprise',
                      price: '$99/mo',
                      bullets: ['Unlimited Responses', 'Custom Domains', 'PostgreSQL Sync'],
                    },
                  ] as const
                ).map((tier) => {
                  const selected = currentPlan === tier.id;
                  return (
                    <button
                      type="button"
                      key={tier.id}
                      onClick={() => handleSelectPlan(tier.id)}
                      className={`p-4 rounded-2xl text-left transition-all duration-300 ${
                        selected
                          ? 'bg-[#0B0D0F] text-[#F7F6F3] ring-1 ring-[#0B0D0F]'
                          : 'bg-white text-[#0B0D0F] ring-1 ring-black/[0.07] hover:ring-black/25'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-display font-semibold text-sm">{tier.title}</span>
                        {selected && <Check size={14} weight="light" className="text-emerald-400" />}
                      </div>
                      <p className="text-lg font-mono font-semibold mt-1">{tier.price}</p>
                      <ul
                        className={`space-y-1 mt-3 text-[11px] ${
                          selected ? 'text-[#A2A8B0]' : 'text-[#5C6066]'
                        }`}
                      >
                        {tier.bullets.map((b) => (
                          <li key={b}>· {b}</li>
                        ))}
                      </ul>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-7 py-4 bg-white border-t border-black/[0.06] flex justify-end shrink-0">
            <button
              onClick={onClose}
              className="px-6 py-2.5 text-xs font-semibold text-[#F7F6F3] bg-[#0B0D0F] hover:bg-[#191D21] rounded-full transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
