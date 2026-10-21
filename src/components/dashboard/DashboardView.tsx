import React, { useState } from 'react';
import { FormSchema, FormCategory } from '../../types/form';
import { FormCard } from './FormCard';
import {
  Plus,
  Search,
  Sparkles,
  LayoutTemplate,
  Layers,
  BarChart2,
  Filter,
} from 'lucide-react';

interface DashboardViewProps {
  forms: FormSchema[];
  onSelectForm: (id: string, initialTab?: 'build' | 'theme' | 'logic' | 'settings' | 'share' | 'analytics') => void;
  onPreviewForm: (form: FormSchema) => void;
  onOpenCreateModal: () => void;
  onOpenAI: () => void;
  onDuplicateForm: (id: string) => void;
  onDeleteForm: (id: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  forms,
  onSelectForm,
  onPreviewForm,
  onOpenCreateModal,
  onOpenAI,
  onDuplicateForm,
  onDeleteForm,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all');

  // Summary Metrics
  const totalForms = forms.length;
  const totalSubmissions = forms.reduce((acc, f) => acc + (f.responsesCount || 0), 0);
  const publishedForms = forms.filter((f) => f.settings.isPublished).length;

  // Filtered Forms
  const filteredForms = forms.filter((form) => {
    // Search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = form.title.toLowerCase().includes(q);
      const matchDesc = form.description.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc) return false;
    }

    // Category filter
    if (filterCategory !== 'all' && form.category !== filterCategory) {
      return false;
    }

    // Status filter
    if (filterStatus === 'published' && !form.settings.isPublished) return false;
    if (filterStatus === 'draft' && form.settings.isPublished) return false;

    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Workspace Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">
            Form Experience Workspace
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">
            Build, test, publish, and inspect responses across all your interactive forms.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenAI}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Form Architect</span>
          </button>

          <button
            onClick={onOpenCreateModal}
            className="px-4 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Create Form</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-neutral-200/90 shadow-xs">
          <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block">
            Active Forms
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold font-mono text-neutral-900 tabular-nums">
              {totalForms}
            </span>
            <span className="text-xs text-neutral-500">
              ({publishedForms} published)
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-neutral-200/90 shadow-xs">
          <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block">
            Total Responses Ingested
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold font-mono text-neutral-900 tabular-nums">
              {totalSubmissions}
            </span>
            <span className="text-xs text-emerald-600 font-medium">real-time sync</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-neutral-200/90 shadow-xs">
          <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block">
            Avg Experience Completion
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold font-mono text-neutral-900 tabular-nums">
              78.4%
            </span>
            <span className="text-xs text-neutral-400">conversational flow</span>
          </div>
        </div>
      </div>

      {/* Search & Segmented Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search forms by title or topic..."
            className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-lg border-neutral-200 focus:outline-none focus:border-neutral-900"
          />
        </div>

        {/* Interactive Segmented Tabs (Buttons per constitution) */}
        <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg text-xs overflow-x-auto">
          {[
            { id: 'all', label: 'All Categories' },
            { id: 'registration', label: 'Registration' },
            { id: 'feedback', label: 'Feedback' },
            { id: 'quiz', label: 'Quizzes' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterCategory(tab.id)}
              className={`px-3 py-1.5 rounded-md font-medium transition-all whitespace-nowrap shrink-0 ${
                filterCategory === tab.id
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Forms Grid */}
      {filteredForms.length === 0 ? (
        <div className="p-16 bg-white rounded-2xl border border-neutral-200 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-neutral-100 text-neutral-500 mx-auto flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-neutral-900">No Forms Found</h3>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto mt-1">
              {searchQuery
                ? 'No forms match your search filter.'
                : 'Get started by creating your first form experience using a template or AI prompt.'}
            </p>
          </div>
          <button
            onClick={onOpenCreateModal}
            className="px-4 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Create Form</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredForms.map((form) => (
            <FormCard
              key={form.id}
              form={form}
              onEdit={(id) => onSelectForm(id, 'build')}
              onPreview={onPreviewForm}
              onShare={(f) => onSelectForm(f.id, 'share')}
              onAnalytics={(id) => onSelectForm(id, 'analytics')}
              onDuplicate={onDuplicateForm}
              onDelete={onDeleteForm}
            />
          ))}
        </div>
      )}
    </div>
  );
};
