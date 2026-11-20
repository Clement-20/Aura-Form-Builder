import React, { useState, useEffect } from 'react';
import { ArrowUpRight, UsersThree, SignIn } from '@phosphor-icons/react';
import { AuraLogo } from './AuraLogo';
import { UserAccount } from '../../types/form';
import { useFirebase } from '../../contexts/FirebaseContext';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  user: UserAccount;
  onOpenAccount: () => void;
  onOpenCreate: () => void;
  onOpenTeams: () => void;
}

const NAV_LINKS = [
  { id: 'landing', label: 'Architecture' },
  { id: 'templates', label: 'Templates' },
  { id: 'dashboard', label: 'Workspace' },
  { id: 'pricing', label: 'Plans' },
];

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  user,
  onOpenAccount,
  onOpenCreate,
  onOpenTeams,
}) => {
  const { firebaseUser, memberships, activeTeam } = useFirebase();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleLinkClick = (id: string) => {
    setMobileMenuOpen(false);
    onNavigate(id);
  };

  const displayName = firebaseUser?.displayName || user.name;
  const displayAvatar =
    firebaseUser?.photoURL ||
    user.avatarUrl ||
    '/src/assets/images/avatar_demo_creator_1792599916553.jpg';

  return (
    <>
      {/* Accessible Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2.5 focus:rounded-full focus:bg-[#0B0D0F] focus:text-[#F7F6F3] focus:text-xs focus:font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        Skip to content
      </a>

      {/* Fluid Island Detached Navbar */}
      <header className="sticky top-4 z-40 px-4 sm:px-6 pointer-events-none">
        <div className="max-w-5xl mx-auto pointer-events-auto">
          <div className="p-1.5 rounded-full bg-white/80 backdrop-blur-2xl ring-1 ring-black/[0.07] shadow-[0_12px_36px_-12px_rgba(11,13,15,0.10)] flex items-center justify-between gap-3 sm:gap-4 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]">
            {/* Zone 1: Brand Wordmark */}
            <button
              onClick={() => handleLinkClick('landing')}
              className="pl-2 pr-3 py-1 rounded-full flex items-center gap-2.5 text-[#0B0D0F] whitespace-nowrap shrink-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B0D0F]"
              aria-label="AuraForm Home"
            >
              <AuraLogo className="w-8 h-8" size={32} />
              <span className="font-display font-semibold tracking-tight text-[15px]">
                AuraForm
              </span>
            </button>

            {/* Zone 2: Clean Typography Links with Draw Underline */}
            <nav
              aria-label="Primary"
              className="hidden md:flex items-center gap-6 text-[13px] font-medium text-[#5C6066]"
            >
              {NAV_LINKS.map((link) => {
                const isActive = currentView === link.id;
                return (
                  <button
                    key={link.id}
                    onClick={() => handleLinkClick(link.id)}
                    data-active={isActive ? 'true' : 'false'}
                    className={`link-underline py-1.5 whitespace-nowrap shrink-0 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B0D0F] rounded-sm ${
                      isActive
                        ? 'text-[#0B0D0F] font-semibold'
                        : 'hover:text-[#0B0D0F]'
                    }`}
                  >
                    {link.label}
                  </button>
                );
              })}
            </nav>

            {/* Zone 3: Teams + Account + Button-in-Button CTA + Mobile Morph Trigger */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                onClick={onOpenTeams}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0F766E]/10 hover:bg-[#0F766E]/15 text-[#0F766E] text-[12px] font-semibold transition-all whitespace-nowrap"
                title="Team Workspaces & Live Co-Authoring"
              >
                <UsersThree size={15} weight="light" />
                <span>
                  {activeTeam
                    ? activeTeam.name
                    : memberships.length > 0
                    ? `Teams (${memberships.length})`
                    : 'Teams'}
                </span>
              </button>

              <button
                onClick={onOpenAccount}
                className="hidden sm:inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full bg-black/[0.035] hover:bg-black/[0.06] ring-1 ring-black/[0.05] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B0D0F]"
                title="Account & Plan Settings"
                aria-label="Account Settings"
              >
                <img
                  src={displayAvatar}
                  alt={displayName}
                  referrerPolicy="no-referrer"
                  className="w-6 h-6 rounded-full object-cover bg-neutral-200"
                />
                <span className="text-[12px] font-medium text-[#0B0D0F] max-w-[90px] truncate">
                  {firebaseUser ? displayName.split(' ')[0] : user.plan}
                </span>
              </button>

              {/* Button-in-Button Primary CTA */}
              <button
                onClick={onOpenCreate}
                className="group inline-flex items-center gap-2 pl-3.5 sm:pl-4 pr-1.5 py-1.5 rounded-full bg-[#0B0D0F] text-[#F7F6F3] text-[12px] font-semibold whitespace-nowrap shrink-0 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[#191D21] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0B0D0F]"
              >
                <span>Build a Form</span>
                <span className="w-7 h-7 rounded-full bg-white/[0.13] flex items-center justify-center transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:scale-105">
                  <ArrowUpRight size={14} weight="light" />
                </span>
              </button>

              {/* Mobile Hamburger Morph Button */}
              <button
                onClick={() => setMobileMenuOpen((v) => !v)}
                aria-expanded={mobileMenuOpen}
                aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                className="md:hidden w-10 h-10 rounded-full bg-black/[0.04] hover:bg-black/[0.08] flex items-center justify-center relative transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B0D0F]"
              >
                <span
                  className={`absolute w-4 h-[1.5px] bg-[#0B0D0F] rounded-full transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                    mobileMenuOpen ? 'rotate-45 translate-y-0' : '-translate-y-1.5'
                  }`}
                />
                <span
                  className={`absolute w-4 h-[1.5px] bg-[#0B0D0F] rounded-full transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                    mobileMenuOpen ? '-rotate-45 translate-y-0' : 'translate-y-1.5'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Full-Screen Glass Modal Expansion for Mobile */}
      <div
        aria-hidden={!mobileMenuOpen}
        className={`fixed inset-0 z-30 md:hidden bg-[#F7F6F3]/95 backdrop-blur-3xl transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] flex flex-col justify-between px-6 pt-28 pb-10 ${
          mobileMenuOpen
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
      >
        <nav className="space-y-4">
          {NAV_LINKS.map((link, idx) => (
            <div key={link.id} className="overflow-hidden">
              <button
                onClick={() => handleLinkClick(link.id)}
                style={{ transitionDelay: mobileMenuOpen ? `${80 + idx * 60}ms` : '0ms' }}
                className={`block w-full text-left text-4xl font-display font-semibold tracking-tight text-[#0B0D0F] py-2 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                  mobileMenuOpen
                    ? 'translate-y-0 opacity-100'
                    : 'translate-y-12 opacity-0'
                }`}
              >
                {link.label}
              </button>
            </div>
          ))}
        </nav>

        <div
          style={{ transitionDelay: mobileMenuOpen ? '340ms' : '0ms' }}
          className={`space-y-3 pt-8 border-t border-black/[0.08] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            mobileMenuOpen ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              onOpenTeams();
            }}
            className="w-full py-3.5 px-5 rounded-full bg-[#0F766E]/10 text-[#0F766E] text-sm font-semibold flex items-center justify-between"
          >
            <span className="flex items-center gap-2.5">
              <UsersThree size={18} weight="light" />
              <span>Teams &amp; Co-Authoring</span>
            </span>
            <span className="text-xs font-mono">
              {firebaseUser ? `${memberships.length} active` : 'Sign in'}
            </span>
          </button>

          <button
            onClick={() => {
              setMobileMenuOpen(false);
              onOpenAccount();
            }}
            className="w-full py-3.5 px-5 rounded-full bg-black/[0.05] text-[#0B0D0F] text-sm font-medium flex items-center justify-between"
          >
            <span className="flex items-center gap-3">
              <img
                src={displayAvatar}
                alt={displayName}
                referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-full object-cover"
              />
              <span>{displayName}</span>
            </span>
            <span className="text-xs font-mono uppercase tracking-wider text-[#5C6066] inline-flex items-center gap-1">
              {!firebaseUser && <SignIn size={12} weight="light" />}
              {firebaseUser ? 'Signed in' : user.plan}
            </span>
          </button>

          <button
            onClick={() => {
              setMobileMenuOpen(false);
              onOpenCreate();
            }}
            className="w-full py-3.5 px-6 rounded-full bg-[#0B0D0F] text-[#F7F6F3] text-sm font-semibold flex items-center justify-center gap-2"
          >
            <span>Build a Form</span>
            <ArrowUpRight size={16} weight="light" />
          </button>
        </div>
      </div>
    </>
  );
};
