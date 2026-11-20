import React from 'react';
import {
  DotsThreeVertical,
  PencilSimple,
  Eye,
  ChartBar,
  Copy,
  Trash,
  ShareNetwork,
  Stack,
  ChatText,
  ListNumbers,
} from '@phosphor-icons/react';
import { FormSchema } from '../../types/form';

interface FormCardProps {
  form: FormSchema;
  onEdit: (id: string) => void;
  onPreview: (form: FormSchema) => void;
  onShare: (form: FormSchema) => void;
  onAnalytics: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export const FormCard: React.FC<FormCardProps> = ({
  form,
  onEdit,
  onPreview,
  onShare,
  onAnalytics,
  onDuplicate,
  onDelete,
}) => {
  const [menuOpen, setMenuOpen] = React.useState(false);

  const responses = form.responsesCount || 0;
  const layoutIcon = {
    conversational: <ChatText size={14} weight="light" className="text-[#5C6066]" />,
    stepped: <ListNumbers size={14} weight="light" className="text-[#5C6066]" />,
    standard: <Stack size={14} weight="light" className="text-[#5C6066]" />,
  }[form.layoutMode];

  return (
    <div className="bezel-outer transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 group relative">
      <div className="bezel-inner p-6 flex flex-col justify-between h-full">
        <div>
          {/* Unboxed Metadata Line */}
          <div className="flex items-center justify-between text-xs text-[#5C6066] mb-4">
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  form.settings.isPublished ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span className="font-medium text-[#0B0D0F]">
                {form.settings.isPublished ? 'Live' : 'Draft'}
              </span>
              <span aria-hidden="true" className="text-black/20">·</span>
              <span className="capitalize">{form.category || 'survey'}</span>
              <span aria-hidden="true" className="text-black/20">·</span>
              <span className="capitalize inline-flex items-center gap-1">
                {layoutIcon}
                <span>{form.layoutMode}</span>
              </span>
            </div>

            {/* Overflow Menu */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-8 h-8 rounded-full hover:bg-black/[0.05] text-[#5C6066] hover:text-[#0B0D0F] flex items-center justify-center transition-colors"
                title="More actions"
                aria-label="More actions"
              >
                <DotsThreeVertical size={16} weight="bold" />
              </button>

              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-9 w-40 bg-white rounded-2xl shadow-[0_18px_40px_-12px_rgba(11,13,15,0.18)] ring-1 ring-black/[0.08] py-1.5 z-30 text-xs text-[#0B0D0F]">
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onDuplicate(form.id);
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-[#F7F6F3] flex items-center gap-2.5 transition-colors"
                    >
                      <Copy size={14} weight="light" className="text-[#5C6066]" />
                      <span>Duplicate</span>
                    </button>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onShare(form);
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-[#F7F6F3] flex items-center gap-2.5 transition-colors"
                    >
                      <ShareNetwork size={14} weight="light" className="text-[#5C6066]" />
                      <span>Share &amp; QR</span>
                    </button>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onDelete(form.id);
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-rose-50 text-rose-600 flex items-center gap-2.5 border-t border-black/[0.06] mt-1 pt-2 transition-colors"
                    >
                      <Trash size={14} weight="light" />
                      <span>Delete</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Title & Description */}
          <button
            onClick={() => onEdit(form.id)}
            className="text-left w-full group/title space-y-1.5"
          >
            <h3 className="text-lg font-display font-semibold text-[#0B0D0F] group-hover/title:text-[#0F766E] transition-colors duration-300 tracking-tight line-clamp-1">
              {form.title}
            </h3>
            <p className="text-xs text-[#5C6066] line-clamp-2 leading-relaxed">
              {form.description || 'No description provided.'}
            </p>
          </button>
        </div>

        {/* Footer Metrics & Actions */}
        <div className="pt-5 mt-6 border-t border-black/[0.06] flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2.5 text-[#5C6066] font-mono text-[11px] tabular-nums">
            <span className="font-semibold text-[#0B0D0F]">{responses} responses</span>
            <span aria-hidden="true" className="text-black/20">·</span>
            <span>{form.fields.length}q</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onPreview(form)}
              className="w-8 h-8 rounded-full hover:bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F] flex items-center justify-center transition-colors"
              title="Preview Experience"
              aria-label="Preview Experience"
            >
              <Eye size={16} weight="light" />
            </button>
            <button
              onClick={() => onAnalytics(form.id)}
              className="w-8 h-8 rounded-full hover:bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F] flex items-center justify-center transition-colors"
              title="View Responses & Analytics"
              aria-label="View Responses and Analytics"
            >
              <ChartBar size={16} weight="light" />
            </button>
            <button
              onClick={() => onEdit(form.id)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#0B0D0F] hover:bg-[#191D21] text-[#F7F6F3] font-semibold transition-all duration-300 active:scale-[0.98]"
            >
              <PencilSimple size={13} weight="light" />
              <span>Edit</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
