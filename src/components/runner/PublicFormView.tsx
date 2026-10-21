import React from 'react';
import { FormSchema } from '../../types/form';
import { FormRunner } from './FormRunner';
import { ArrowLeft, Lock } from 'lucide-react';

interface PublicFormViewProps {
  form: FormSchema | null;
  onBackToApp: () => void;
}

export const PublicFormView: React.FC<PublicFormViewProps> = ({ form, onBackToApp }) => {
  if (!form) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-neutral-200 text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-bold text-neutral-900">Form Unavailable</h2>
          <p className="text-xs text-neutral-500">
            This form could not be found or has been deleted by its creator.
          </p>
          <button
            onClick={onBackToApp}
            className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 transition-colors"
          >
            Return to Workspace
          </button>
        </div>
      </div>
    );
  }

  // Check if form is closed
  const isClosed =
    form.settings.closeAfterSubmissions &&
    (form.responsesCount || 0) >= form.settings.closeAfterSubmissions;

  if (isClosed) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-neutral-200 text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-bold text-neutral-900">Submissions Closed</h2>
          <p className="text-xs text-neutral-500">
            {form.settings.closedMessage ||
              'This form has reached its target submission quota and is no longer accepting new responses.'}
          </p>
          <button
            onClick={onBackToApp}
            className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 transition-colors"
          >
            Return to AuraForm
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col justify-between"
      style={{
        backgroundColor: form.theme.backgroundColor,
      }}
    >
      {/* Top Floating Mini-Nav */}
      <header className="p-4 flex items-center justify-between text-xs opacity-70 hover:opacity-100 transition-opacity">
        <button
          onClick={onBackToApp}
          className="px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10 transition-colors flex items-center gap-1.5 font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Workspace</span>
        </button>

        <span className="text-[11px] font-display font-medium">
          AuraForm Live Experience
        </span>
      </header>

      {/* Runner */}
      <main className="flex-1 flex flex-col justify-center">
        <FormRunner form={form} />
      </main>

      {/* Distraction-free Footer */}
      <footer className="p-4 text-center text-[11px] opacity-40 font-mono">
        Secured with End-to-End Field Validation · AuraForm Engine
      </footer>
    </div>
  );
};
