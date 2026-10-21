import React, { useState } from 'react';
import { UserAccount, PlanTier } from '../../types/form';
import { updateUserPlan, saveCurrentUser, isSupabaseConfigured } from '../../lib/storage';
import {
  X,
  Check,
  Shield,
  Database,
  HardDrive,
  CreditCard,
  User,
  Zap,
} from 'lucide-react';

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
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [currentPlan, setCurrentPlan] = useState<PlanTier>(user.plan);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const hasSupabase = isSupabaseConfigured();

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
    <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden text-neutral-800 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-neutral-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-bold text-neutral-900">Account & Subscription Workspace</h3>
            <p className="text-xs text-neutral-500 mt-0.5">Manage credentials, plan tiers, and database modes</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-6 overflow-y-auto text-xs">
          {/* User Profile Form */}
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <span className="font-semibold text-neutral-900 uppercase tracking-wider text-[11px] block">
              Creator Profile
            </span>

            <div className="flex items-center gap-4">
              <img
                src={user.avatarUrl || '/src/assets/images/avatar_demo_creator_1792599916553.jpg'}
                alt={user.name}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-xl object-cover bg-neutral-100 border border-neutral-200 shrink-0"
              />
              <div className="space-y-1">
                <p className="font-bold text-neutral-900 text-sm">{user.name}</p>
                <p className="text-neutral-500 font-mono text-[11px]">{user.email}</p>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <span className="text-neutral-900 font-semibold capitalize">{user.plan} Tier</span>
                  <span aria-hidden="true" className="text-neutral-300">·</span>
                  <span className="text-neutral-500">ID: {user.id}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="space-y-1">
                <label className="font-medium text-neutral-700">Display Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-lg border-neutral-200 focus:outline-none focus:border-neutral-900"
                />
              </div>
              <div className="space-y-1">
                <label className="font-medium text-neutral-700">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-lg border-neutral-200 focus:outline-none focus:border-neutral-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              {savedSuccess ? (
                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>Profile updated</span>
                </span>
              ) : (
                <span />
              )}
              <button
                type="submit"
                className="px-3.5 py-1.5 bg-neutral-900 text-white font-semibold rounded-lg hover:bg-neutral-800 transition-colors shadow-xs"
              >
                Save Details
              </button>
            </div>
          </form>

          {/* Database / Persistence Mode Indicator */}
          <div className="p-4 rounded-xl border border-neutral-200/80 bg-neutral-50/70 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-neutral-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-neutral-700" />
                <span>Persistence & Storage Engine</span>
              </span>
              <span className="text-[11px] font-mono font-medium text-neutral-600">
                {hasSupabase ? 'Supabase PostgreSQL' : 'Local-First Web Storage'}
              </span>
            </div>

            <p className="text-neutral-500 leading-relaxed text-[11px]">
              {hasSupabase
                ? 'Connected to configured Supabase project with Row Level Security.'
                : 'Operating in Local-First Development Mode. Your forms, questions, and responses persist reliably in browser storage (IndexedDB/LocalStorage). To connect a production cloud database, provide VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'}
            </p>
          </div>

          {/* Subscription Tiers */}
          <div className="space-y-3 pt-2">
            <span className="font-semibold text-neutral-900 uppercase tracking-wider text-[11px] block">
              Select Subscription Plan
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Free Tier */}
              <div
                onClick={() => handleSelectPlan('free')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  currentPlan === 'free'
                    ? 'border-neutral-900 bg-neutral-900/5 ring-1 ring-neutral-900'
                    : 'border-neutral-200 bg-white hover:border-neutral-300'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-neutral-900">Free Tier</span>
                  {currentPlan === 'free' && <Check className="w-3.5 h-3.5 text-neutral-900" />}
                </div>
                <p className="text-lg font-bold font-mono text-neutral-900">$0</p>
                <ul className="space-y-1.5 mt-3 text-[11px] text-neutral-500">
                  <li>· 3 Active Forms</li>
                  <li>· 100 Responses / month</li>
                  <li>· Standard Templates</li>
                </ul>
              </div>

              {/* Pro Tier */}
              <div
                onClick={() => handleSelectPlan('pro')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  currentPlan === 'pro'
                    ? 'border-neutral-900 bg-neutral-900/5 ring-1 ring-neutral-900'
                    : 'border-neutral-200 bg-white hover:border-neutral-300'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-neutral-900">Pro Studio</span>
                  {currentPlan === 'pro' && <Check className="w-3.5 h-3.5 text-neutral-900" />}
                </div>
                <p className="text-lg font-bold font-mono text-neutral-900">$29 <span className="text-xs font-normal text-neutral-400">/mo</span></p>
                <ul className="space-y-1.5 mt-3 text-[11px] text-neutral-600 font-medium">
                  <li>· Unlimited Forms</li>
                  <li>· 5,000 Responses / mo</li>
                  <li>· Gemini AI Form Builder</li>
                  <li>· Webhooks & CSV Export</li>
                </ul>
              </div>

              {/* Enterprise Tier */}
              <div
                onClick={() => handleSelectPlan('enterprise')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  currentPlan === 'enterprise'
                    ? 'border-neutral-900 bg-neutral-900/5 ring-1 ring-neutral-900'
                    : 'border-neutral-200 bg-white hover:border-neutral-300'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-neutral-900">Enterprise</span>
                  {currentPlan === 'enterprise' && <Check className="w-3.5 h-3.5 text-neutral-900" />}
                </div>
                <p className="text-lg font-bold font-mono text-neutral-900">$99 <span className="text-xs font-normal text-neutral-400">/mo</span></p>
                <ul className="space-y-1.5 mt-3 text-[11px] text-neutral-500">
                  <li>· Unlimited Responses</li>
                  <li>· Custom Domain Routing</li>
                  <li>· Priority 99.9% SLA</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-neutral-50 border-t border-neutral-100 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
