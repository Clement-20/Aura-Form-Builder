import React, { useState } from 'react';
import { FormField, FieldType, FormLayoutMode } from '../../types/form';
import {
  Type,
  AlignLeft,
  Mail,
  Phone,
  Link,
  CheckSquare,
  CircleDot,
  ChevronDown,
  Star,
  SlidersHorizontal,
  Calendar,
  Hash,
  Info,
  Plus,
  Trash2,
  GripVertical,
  Layers,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

interface FieldsSidebarProps {
  fields: FormField[];
  activeFieldId: string | null;
  onSelectField: (id: string) => void;
  onAddField: (type: FieldType) => void;
  onDeleteField: (id: string) => void;
  onMoveField: (index: number, direction: 'up' | 'down') => void;
  layoutMode: FormLayoutMode;
  onChangeLayoutMode: (mode: FormLayoutMode) => void;
}

const FIELD_PALETTE: {
  category: string;
  items: { type: FieldType; label: string; icon: React.FC<{ className?: string }> }[];
}[] = [
  {
    category: 'Text & Narrative',
    items: [
      { type: 'text', label: 'Short Text', icon: Type },
      { type: 'textarea', label: 'Long Paragraph', icon: AlignLeft },
      { type: 'statement', label: 'Statement / Note', icon: Info },
    ],
  },
  {
    category: 'Contact Details',
    items: [
      { type: 'email', label: 'Email Address', icon: Mail },
      { type: 'phone', label: 'Phone Number', icon: Phone },
      { type: 'url', label: 'Website Link', icon: Link },
    ],
  },
  {
    category: 'Choices & Selections',
    items: [
      { type: 'radio', label: 'Single Choice', icon: CircleDot },
      { type: 'checkbox', label: 'Multiple Select', icon: CheckSquare },
      { type: 'select', label: 'Dropdown Menu', icon: ChevronDown },
    ],
  },
  {
    category: 'Ratings & Feedback',
    items: [
      { type: 'rating', label: 'Star Rating (1-5)', icon: Star },
      { type: 'scale', label: 'Opinion Scale (0-10)', icon: SlidersHorizontal },
    ],
  },
  {
    category: 'Data & Numbers',
    items: [
      { type: 'number', label: 'Numeric Value', icon: Hash },
      { type: 'date', label: 'Date Picker', icon: Calendar },
    ],
  },
];

export const FieldsSidebar: React.FC<FieldsSidebarProps> = ({
  fields,
  activeFieldId,
  onSelectField,
  onAddField,
  onDeleteField,
  onMoveField,
  layoutMode,
  onChangeLayoutMode,
}) => {
  const [showPalette, setShowPalette] = useState(false);

  return (
    <aside className="w-72 lg:w-80 border-r border-neutral-200 bg-white flex flex-col shrink-0 h-[calc(100vh-3.5rem)] overflow-y-auto">
      {/* Layout Mode Selector Bar */}
      <div className="p-3 border-b border-neutral-100 bg-neutral-50/50">
        <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block mb-1.5">
          Form Experience Flow
        </label>
        <div className="grid grid-cols-3 gap-1 bg-neutral-200/60 p-1 rounded-lg text-xs">
          <button
            onClick={() => onChangeLayoutMode('conversational')}
            className={`py-1 text-center font-medium rounded transition-all ${
              layoutMode === 'conversational'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            One-by-One
          </button>
          <button
            onClick={() => onChangeLayoutMode('stepped')}
            className={`py-1 text-center font-medium rounded transition-all ${
              layoutMode === 'stepped'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Stepped
          </button>
          <button
            onClick={() => onChangeLayoutMode('standard')}
            className={`py-1 text-center font-medium rounded transition-all ${
              layoutMode === 'standard'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Classic
          </button>
        </div>
      </div>

      {/* Add Question Button */}
      <div className="p-3 border-b border-neutral-100">
        <button
          onClick={() => setShowPalette(!showPalette)}
          className="w-full py-2 px-3 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>{showPalette ? 'Close Elements' : 'Add Question'}</span>
        </button>
      </div>

      {/* Field Elements Palette (Expandable drawer) */}
      {showPalette && (
        <div className="p-3 border-b border-neutral-200 bg-neutral-50/70 space-y-4 text-xs animate-in fade-in duration-200">
          {FIELD_PALETTE.map((cat, idx) => (
            <div key={idx} className="space-y-1.5">
              <span className="text-[10px] font-semibold uppercase text-neutral-400 tracking-wider">
                {cat.category}
              </span>
              <div className="grid grid-cols-1 gap-1">
                {cat.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.type}
                      onClick={() => {
                        onAddField(item.type);
                        setShowPalette(false);
                      }}
                      className="w-full text-left p-2 rounded-md hover:bg-white border border-transparent hover:border-neutral-200 text-neutral-700 hover:text-neutral-900 transition-all flex items-center gap-2.5 font-medium group"
                    >
                      <Icon className="w-4 h-4 text-neutral-500 group-hover:text-neutral-900" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Outline of Fields */}
      <div className="p-3 flex-1 overflow-y-auto space-y-1.5">
        <div className="flex items-center justify-between text-xs text-neutral-500 mb-2 px-1">
          <span className="font-semibold uppercase tracking-wider text-[11px]">
            Questions Outline ({fields.length})
          </span>
        </div>

        {fields.length === 0 ? (
          <div className="text-center py-8 text-neutral-400 text-xs">
            No questions yet. Click &quot;Add Question&quot; above to create your first element.
          </div>
        ) : (
          fields.map((field, idx) => {
            const isSelected = activeFieldId === field.id;

            return (
              <div
                key={field.id}
                onClick={() => onSelectField(field.id)}
                className={`group p-2.5 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'border-neutral-900 bg-neutral-900/5 font-semibold text-neutral-900'
                    : 'border-neutral-200/70 hover:border-neutral-300 bg-white text-neutral-700'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-neutral-400 font-mono text-[11px] shrink-0">
                    {idx + 1}.
                  </span>
                  <span className="truncate">{field.label || 'Untitled Question'}</span>
                  {field.required && <span className="text-rose-500">*</span>}
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveField(idx, 'up');
                    }}
                    disabled={idx === 0}
                    className="p-1 text-neutral-400 hover:text-neutral-900 disabled:opacity-20"
                    title="Move Up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveField(idx, 'down');
                    }}
                    disabled={idx === fields.length - 1}
                    className="p-1 text-neutral-400 hover:text-neutral-900 disabled:opacity-20"
                    title="Move Down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteField(field.id);
                    }}
                    className="p-1 text-neutral-400 hover:text-rose-600"
                    title="Delete Question"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
