import React from 'react';
import { ArrowLeft, Lock } from '@phosphor-icons/react';
import { FormSchema } from '../../types/form';
import { FormRunner } from './FormRunner';

interface PublicFormViewProps {
  form: FormSchema | null;
  onBackToApp: () => void;
}

export const PublicFormView: React.FC<PublicFormViewProps> = ({ form, onBackToApp }) => {
  if (!form) {
    return (
      <div className="min-h-[100dvh] bg-[#F7F6F3] flex items-center justify-center p-4">
        <div className="bezel-outer max-w-md w-full">
          <div className="bezel-inner p-9 text-center space-y-5">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Lock size={22} weight="light" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-display font-semibold text-[#0B0D0F]">
                Form Unavailable
              </h2>
              <p className="text-xs text-[#5C6066] leading-relaxed">
                This form could not be found or has been removed by its creator.
              </p>
            </div>
            <button
              onClick={onBackToApp}
              className="px-5 py-2.5 bg-[#0B0D0F] text-[#F7F6F3] rounded-full text-xs font-semibold hover:bg-[#191D21] transition-colors"
            >
              Return to Workspace
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isClosed =
    form.settings.closeAfterSubmissions &&
    (form.responsesCount || 0) >= form.settings.closeAfterSubmissions;

  if (isClosed) {
    return (
      <div className="min-h-[100dvh] bg-[#F7F6F3] flex items-center justify-center p-4">
        <div className="bezel-outer max-w-md w-full">
          <div className="bezel-inner p-9 text-center space-y-5">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto">
              <Lock size={22} weight="light" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-display font-semibold text-[#0B0D0F]">
                Submissions Closed
              </h2>
              <p className="text-xs text-[#5C6066] leading-relaxed">
                {form.settings.closedMessage ||
                  'This form has reached its target submission quota and is no longer accepting new responses.'}
              </p>
            </div>
            <button
              onClick={onBackToApp}
              className="px-5 py-2.5 bg-[#0B0D0F] text-[#F7F6F3] rounded-full text-xs font-semibold hover:bg-[#191D21] transition-colors"
            >
              Return to AuraForm
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-[100dvh] flex flex-col justify-between"
      style={{
        backgroundColor: form.theme.backgroundColor,
      }}
    >
      {/* Floating Minimal Top Nav */}
      <header className="p-4 sm:p-6 flex items-center justify-between text-xs opacity-75 hover:opacity-100 transition-opacity">
        <button
          onClick={onBackToApp}
          className="px-4 py-2 rounded-full bg-black/[0.06] hover:bg-black/[0.11] transition-colors flex items-center gap-2 font-medium"
        >
          <ArrowLeft size={14} weight="light" />
          <span>Workspace</span>
        </button>

        <span className="text-[11px] font-mono tracking-wider uppercase opacity-75">
          AuraForm Live Runner
        </span>
      </header>

      {/* Shared FormRunner */}
      <main className="flex-1 flex flex-col justify-center">
        <FormRunner form={form} />
      </main>

      {/* Minimal Footer */}
      <footer className="p-4 text-center text-[11px] opacity-45 font-mono">
        Shared Schema Validation · AuraForm Engine
      </footer>
    </div>
  );
};
