import React from 'react';
import { AuraLogo } from './AuraLogo';
import { UserAccount } from '../../types/form';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  user: UserAccount;
  onOpenAccount: () => void;
  onOpenCreate: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  user,
  onOpenAccount,
  onOpenCreate,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-neutral-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <button
          onClick={() => onNavigate('landing')}
          className="text-lg font-bold tracking-tight text-neutral-900 whitespace-nowrap shrink-0 hover:opacity-85 transition-opacity flex items-center gap-2.5 group"
        >
          <AuraLogo className="w-8 h-8 transition-transform group-hover:scale-105" size={32} />
          <span className="font-display">AuraForm</span>
        </button>

        {/* Zone 2: 4-5 clean single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-neutral-600">
          <button
            onClick={() => onNavigate('landing')}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
              currentView === 'landing' ? 'text-neutral-900 font-semibold' : 'hover:text-neutral-900'
            }`}
          >
            Capabilities
          </button>
          <button
            onClick={() => onNavigate('templates')}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
              currentView === 'templates' ? 'text-neutral-900 font-semibold' : 'hover:text-neutral-900'
            }`}
          >
            Templates
          </button>
          <button
            onClick={() => onNavigate('dashboard')}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
              currentView === 'dashboard' ? 'text-neutral-900 font-semibold' : 'hover:text-neutral-900'
            }`}
          >
            My Workspace
          </button>
          <button
            onClick={() => onNavigate('pricing')}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
              currentView === 'pricing' ? 'text-neutral-900 font-semibold' : 'hover:text-neutral-900'
            }`}
          >
            Plans
          </button>
        </nav>

        {/* Zone 3: Primary Action & Profile */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onOpenCreate}
            className="px-4 py-2 text-xs font-semibold text-white bg-neutral-900 rounded-lg hover:bg-neutral-800 transition-colors whitespace-nowrap shrink-0 shadow-xs"
          >
            Create Form
          </button>

          <button
            onClick={onOpenAccount}
            className="flex items-center gap-2 p-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors"
            title="Account & Plan Settings"
            aria-label="Account Settings"
          >
            <img
              src={user.avatarUrl || '/src/assets/images/avatar_demo_creator_1792599916553.jpg'}
              alt={user.name}
              referrerPolicy="no-referrer"
              className="w-7 h-7 rounded-md object-cover bg-neutral-200"
            />
            <span className="hidden sm:inline text-xs font-medium text-neutral-700 capitalize">
              {user.plan}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
