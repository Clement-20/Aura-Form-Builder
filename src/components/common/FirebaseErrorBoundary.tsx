import React from 'react';
import { WarningCircle, ArrowClockwise } from '@phosphor-icons/react';

interface State {
  hasError: boolean;
  message: string;
}

export class FirebaseErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    let readable = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(error.message);
      if (parsed && parsed.error) {
        if (String(parsed.error).includes('Quota exceeded')) {
          readable =
            'Daily database quota has been reached. Quota resets tomorrow, or you can continue building in your local workspace.';
        } else if (String(parsed.error).includes('Missing or insufficient permissions')) {
          readable =
            'You do not have permission for this team action. Please verify your team role or sign in again.';
        } else {
          readable = parsed.error;
        }
      }
    } catch {
      // keep raw message
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error) {
    console.error('Application ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[100dvh] bg-[#F7F6F3] flex items-center justify-center p-4">
          <div className="w-full max-w-md p-1.5 rounded-[2rem] bg-black/[0.04] ring-1 ring-black/[0.08]">
            <div className="rounded-[calc(2rem-6px)] bg-white p-7 text-center space-y-5">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 mx-auto flex items-center justify-center">
                <WarningCircle size={24} weight="light" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg font-display font-semibold text-[#0B0D0F]">
                  Sync Interrupted
                </h2>
                <p className="text-xs text-[#5C6066] leading-relaxed">{this.state.message}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, message: '' });
                  window.location.reload();
                }}
                className="px-5 py-2.5 rounded-full bg-[#0B0D0F] text-[#F7F6F3] text-xs font-semibold inline-flex items-center gap-2 hover:bg-[#191D21] transition-colors"
              >
                <ArrowClockwise size={14} weight="light" />
                <span>Reload Workspace</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
