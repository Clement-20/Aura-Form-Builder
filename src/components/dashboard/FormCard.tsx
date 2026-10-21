import React from 'react';
import { FormSchema } from '../../types/form';
import {
  MoreVertical,
  Edit3,
  Eye,
  BarChart2,
  Copy,
  Trash2,
  Share2,
  Clock,
  Layers,
  MessageSquare,
  ListOrdered,
} from 'lucide-react';

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
    conversational: <MessageSquare className="w-3.5 h-3.5 text-neutral-500" />,
    stepped: <ListOrdered className="w-3.5 h-3.5 text-neutral-500" />,
    standard: <Layers className="w-3.5 h-3.5 text-neutral-500" />,
  }[form.layoutMode];

  return (
    <div className="bg-white rounded-xl border border-neutral-200/90 hover:border-neutral-400/80 transition-all shadow-xs hover:shadow-sm p-5 flex flex-col justify-between group relative">
      <div>
        {/* Top Meta Line: Status & Category (No pill enclosures per constitution) */}
        <div className="flex items-center justify-between text-xs text-neutral-500 mb-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                form.settings.isPublished ? 'bg-emerald-600' : 'bg-amber-500'
              }`}
            />
            <span className="font-medium text-neutral-700 capitalize">
              {form.settings.isPublished ? 'Published' : 'Draft'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{form.category || 'survey'}</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize flex items-center gap-1">
              {layoutIcon}
              <span>{form.layoutMode}</span>
            </span>
          </div>

          {/* More menu button */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1 text-neutral-400 hover:text-neutral-700 rounded hover:bg-neutral-100"
              title="More actions"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-6 w-36 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-30 text-xs text-neutral-700">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onDuplicate(form.id);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-neutral-50 flex items-center gap-2"
                  >
                    <Copy className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Duplicate</span>
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onShare(form);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-neutral-50 flex items-center gap-2"
                  >
                    <Share2 className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Share & QR</span>
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete(form.id);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-rose-50 text-rose-600 flex items-center gap-2 border-t border-neutral-100 mt-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
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
          className="text-left w-full group/title"
        >
          <h3 className="text-base font-bold text-neutral-900 group-hover/title:text-neutral-600 transition-colors tracking-tight line-clamp-1">
            {form.title}
          </h3>
          <p className="text-xs text-neutral-500 mt-1 line-clamp-2 leading-relaxed">
            {form.description || 'No description provided.'}
          </p>
        </button>
      </div>

      {/* Card Footer: Metrics & Quick Action Buttons */}
      <div className="pt-5 mt-4 border-t border-neutral-100 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3 text-neutral-500 font-mono text-[11px] tabular-nums">
          <span className="font-semibold text-neutral-900">{responses} responses</span>
          <span aria-hidden="true">·</span>
          <span>{form.fields.length} questions</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onPreview(form)}
            className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-600 transition-colors"
            title="Preview Experience"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => onAnalytics(form.id)}
            className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-600 transition-colors"
            title="View Responses & Analytics"
          >
            <BarChart2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onEdit(form.id)}
            className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-md font-semibold transition-colors flex items-center gap-1 shadow-xs"
          >
            <Edit3 className="w-3 h-3" />
            <span>Edit</span>
          </button>
        </div>
      </div>
    </div>
  );
};
