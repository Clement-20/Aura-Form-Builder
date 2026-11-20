import React, { useEffect } from 'react';
import { Warning, X } from '@phosphor-icons/react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  secondaryActionLabel?: string;
  tone?: 'danger' | 'neutral';
  onConfirm: () => void;
  onSecondaryAction?: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  secondaryActionLabel,
  tone = 'danger',
  onConfirm,
  onSecondaryAction,
  onCancel,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B0D0F]/55 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white border border-black/[0.08] shadow-2xl p-5 sm:p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                tone === 'danger'
                  ? 'bg-rose-50 text-rose-600'
                  : 'bg-[#0F766E]/10 text-[#0F766E]'
              }`}
            >
              <Warning size={20} weight="fill" />
            </div>
            <div className="space-y-1">
              <h3
                id="confirm-dialog-title"
                className="font-display font-semibold text-base text-[#0B0D0F]"
              >
                {title}
              </h3>
              <p className="text-xs text-[#5C6066] leading-relaxed">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close confirmation dialog"
            className="w-8 h-8 rounded-lg hover:bg-black/[0.05] text-[#5C6066] flex items-center justify-center shrink-0"
          >
            <X size={15} weight="bold" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-black/[0.06]">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-[#5C6066] hover:text-[#0B0D0F] hover:bg-black/[0.05] transition-colors"
          >
            {cancelLabel}
          </button>

          {secondaryActionLabel && onSecondaryAction && (
            <button
              type="button"
              onClick={onSecondaryAction}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-[#0B0D0F] bg-[#F7F6F3] hover:bg-[#EAE7E1] border border-black/[0.08] transition-colors"
            >
              {secondaryActionLabel}
            </button>
          )}

          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors ${
              tone === 'danger'
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-[#0B0D0F] hover:bg-[#191D21]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
