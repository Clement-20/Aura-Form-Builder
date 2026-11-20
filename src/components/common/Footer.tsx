import React from 'react';
import { AuraLogo } from './AuraLogo';

interface FooterProps {
  onNavigate: (view: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="bg-[#0B0D0F] text-[#A2A8B0] border-t border-white/[0.08]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 pb-16 border-b border-white/[0.08]">
          {/* Brand Column */}
          <div className="md:col-span-5 space-y-5">
            <button
              onClick={() => onNavigate('landing')}
              className="flex items-center gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-lg"
            >
              <AuraLogo className="w-8 h-8" size={32} tone="light" />
              <span className="font-display font-semibold text-[#F7F6F3] text-lg tracking-tight">
                AuraForm
              </span>
            </button>
            <p className="text-sm text-[#8F969E] leading-relaxed max-w-sm">
              One versioned form schema and one shared renderer for conversational, multi-step, and standard experiences.
            </p>
          </div>

          {/* Column 2 */}
          <div className="md:col-span-2 space-y-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#F7F6F3]">
              Renderer
            </p>
            <ul className="space-y-3 text-sm">
              <li>
                <button
                  onClick={() => onNavigate('landing')}
                  className="link-underline hover:text-[#F7F6F3] transition-colors duration-300"
                >
                  Conversational Flow
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('templates')}
                  className="link-underline hover:text-[#F7F6F3] transition-colors duration-300"
                >
                  Multi-Step Wizards
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('templates')}
                  className="link-underline hover:text-[#F7F6F3] transition-colors duration-300"
                >
                  Graded Quizzes
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('templates')}
                  className="link-underline hover:text-[#F7F6F3] transition-colors duration-300"
                >
                  Conditional Branches
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3 */}
          <div className="md:col-span-3 space-y-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#F7F6F3]">
              Capabilities
            </p>
            <ul className="space-y-3 text-sm text-[#8F969E]">
              <li>Versioned FormSchema JSON</li>
              <li>Motion &amp; Reduced-Motion Engine</li>
              <li>Webhook Event Delivery</li>
              <li>CSV &amp; JSON Data Exports</li>
            </ul>
          </div>

          {/* Column 4 */}
          <div className="md:col-span-2 space-y-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#F7F6F3]">
              Workspace
            </p>
            <ul className="space-y-3 text-sm">
              <li>
                <button
                  onClick={() => onNavigate('dashboard')}
                  className="link-underline hover:text-[#F7F6F3] transition-colors duration-300"
                >
                  Open Console
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('pricing')}
                  className="link-underline hover:text-[#F7F6F3] transition-colors duration-300"
                >
                  Plans &amp; Scale
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('landing')}
                  className="link-underline hover:text-[#F7F6F3] transition-colors duration-300"
                >
                  Live Runner Demo
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Legal & Architecture Strip */}
        <div className="pt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#727880]">
          <p>© {new Date().getFullYear()} AuraForm Studio.</p>
          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
            <span>WCAG AA Contrast</span>
            <span aria-hidden="true">·</span>
            <span>Prefers-Reduced-Motion</span>
            <span aria-hidden="true">·</span>
            <span>Local &amp; PostgreSQL Storage</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
