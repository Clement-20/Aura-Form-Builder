import React from 'react';

interface FooterProps {
  onNavigate: (view: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="border-t border-neutral-200 bg-white py-12 text-sm text-neutral-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded bg-neutral-900 text-white flex items-center justify-center font-display font-semibold text-xs">
                AF
              </span>
              <span className="font-display font-semibold text-neutral-900 text-base">AuraForm</span>
            </div>
            <p className="text-xs text-neutral-600 leading-relaxed max-w-xs">
              Every form is a designed experience. Conversational, stepped, and standard form architectures with visual styling and realtime analytics.
            </p>
          </div>

          <div>
            <p className="font-semibold text-xs text-neutral-900 mb-3 tracking-wide uppercase">Form Engine</p>
            <ul className="space-y-2 text-xs">
              <li>
                <button onClick={() => onNavigate('landing')} className="hover:text-neutral-900 transition-colors">
                  Conversational One-by-One
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('templates')} className="hover:text-neutral-900 transition-colors">
                  Multi-Page Stepped Wizards
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('templates')} className="hover:text-neutral-900 transition-colors">
                  Graded Quizzes & Scoring
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('templates')} className="hover:text-neutral-900 transition-colors">
                  Conditional Logic Branches
                </button>
              </li>
            </ul>
          </div>

          <div>
            <p className="font-semibold text-xs text-neutral-900 mb-3 tracking-wide uppercase">Developer & Integrations</p>
            <ul className="space-y-2 text-xs">
              <li>
                <span className="text-neutral-700">Gemini 3.8 Flash Assistant</span>
              </li>
              <li>
                <span className="text-neutral-700">Webhook Event Dispatcher</span>
              </li>
              <li>
                <span className="text-neutral-700">PostgreSQL / Supabase Ready</span>
              </li>
              <li>
                <span className="text-neutral-700">CSV & JSON Exporter</span>
              </li>
            </ul>
          </div>

          <div>
            <p className="font-semibold text-xs text-neutral-900 mb-3 tracking-wide uppercase">Workspace</p>
            <ul className="space-y-2 text-xs">
              <li>
                <button onClick={() => onNavigate('dashboard')} className="hover:text-neutral-900 transition-colors">
                  Form Management Console
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('pricing')} className="hover:text-neutral-900 transition-colors">
                  Tiers & Subscription Limits
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('landing')} className="hover:text-neutral-900 transition-colors">
                  Live Interactive Demo
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-6 border-t border-neutral-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
          <p>© {new Date().getFullYear()} AuraForm Studio. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <span>WCAG AA Conforming</span>
            <span aria-hidden="true">·</span>
            <span>Local & Cloud Persistence</span>
            <span aria-hidden="true">·</span>
            <span>TypeScript Strict Mode</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
