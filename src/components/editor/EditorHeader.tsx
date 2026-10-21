import React from 'react';
import { FormSchema, FormLayoutMode } from '../../types/form';
import {
  ArrowLeft,
  Eye,
  Check,
  Share2,
  BarChart2,
  Palette,
  GitBranch,
  Settings,
  Layers,
  Sparkles,
  RotateCcw,
  RotateCw,
} from 'lucide-react';

interface EditorHeaderProps {
  form: FormSchema;
  onChangeTitle: (title: string) => void;
  activeTab: 'build' | 'theme' | 'logic' | 'settings' | 'share' | 'analytics';
  setActiveTab: (tab: 'build' | 'theme' | 'logic' | 'settings' | 'share' | 'analytics') => void;
  onOpenPreview: () => void;
  onOpenAIGenerator: () => void;
  onBackToDashboard: () => void;
  onTogglePublish: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  isSaving: boolean;
}

export const EditorHeader: React.FC<EditorHeaderProps> = ({
  form,
  onChangeTitle,
  activeTab,
  setActiveTab,
  onOpenPreview,
  onOpenAIGenerator,
  onBackToDashboard,
  onTogglePublish,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  isSaving,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-neutral-200">
      {/* Top Bar Row */}
      <div className="px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Left: Back, Undo/Redo & Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBackToDashboard}
            className="p-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-100 text-neutral-600 transition-colors shrink-0"
            title="Back to Workspace"
            aria-label="Back to Workspace"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Undo / Redo */}
          <div className="hidden sm:flex items-center gap-1 border-r border-neutral-200 pr-3">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="p-1.5 text-neutral-500 hover:text-neutral-900 disabled:opacity-30 disabled:hover:text-neutral-500 rounded hover:bg-neutral-100 transition-colors"
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className="p-1.5 text-neutral-500 hover:text-neutral-900 disabled:opacity-30 disabled:hover:text-neutral-500 rounded hover:bg-neutral-100 transition-colors"
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <input
              type="text"
              value={form.title}
              onChange={(e) => onChangeTitle(e.target.value)}
              className="text-sm sm:text-base font-bold text-neutral-900 bg-transparent hover:bg-neutral-100/70 focus:bg-white focus:ring-1 focus:ring-neutral-900 rounded px-2 py-1 transition-all truncate border border-transparent hover:border-neutral-200 focus:border-neutral-900"
              placeholder="Untitled Form"
            />
            <div className="hidden md:flex items-center gap-1.5 shrink-0 pl-1">
              {isSaving ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Saving...
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  All changes saved
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center: Tabs */}
        <div className="hidden lg:flex items-center gap-1 bg-neutral-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('build')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === 'build' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Build</span>
          </button>
          <button
            onClick={() => setActiveTab('theme')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === 'theme' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Design Studio</span>
          </button>
          <button
            onClick={() => setActiveTab('logic')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === 'logic' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Logic ({form.logicRules.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === 'settings' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
          <button
            onClick={() => setActiveTab('share')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === 'share' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Publish & Share</span>
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === 'analytics' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>Responses ({form.responsesCount || 0})</span>
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onOpenAIGenerator}
            className="px-2.5 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors flex items-center gap-1.5"
            title="Ask Gemini to assist with schema or fields"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden sm:inline">AI Assist</span>
          </button>

          <button
            onClick={onOpenPreview}
            className="px-3 py-1.5 text-xs font-medium text-neutral-700 border border-neutral-200 hover:bg-neutral-50 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Test</span>
          </button>

          <button
            onClick={onTogglePublish}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 shadow-xs ${
              form.settings.isPublished
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-neutral-900 hover:bg-neutral-800 text-white'
            }`}
          >
            {form.settings.isPublished && <Check className="w-3.5 h-3.5" />}
            <span>{form.settings.isPublished ? 'Published' : 'Publish'}</span>
          </button>
        </div>
      </div>

      {/* Mobile Tab Bar */}
      <div className="lg:hidden flex items-center gap-1 px-4 py-2 border-t border-neutral-100 overflow-x-auto text-xs bg-neutral-50">
        <button
          onClick={() => setActiveTab('build')}
          className={`px-2.5 py-1 rounded whitespace-nowrap ${activeTab === 'build' ? 'bg-white shadow-xs font-semibold' : 'text-neutral-600'}`}
        >
          Build
        </button>
        <button
          onClick={() => setActiveTab('theme')}
          className={`px-2.5 py-1 rounded whitespace-nowrap ${activeTab === 'theme' ? 'bg-white shadow-xs font-semibold' : 'text-neutral-600'}`}
        >
          Design
        </button>
        <button
          onClick={() => setActiveTab('logic')}
          className={`px-2.5 py-1 rounded whitespace-nowrap ${activeTab === 'logic' ? 'bg-white shadow-xs font-semibold' : 'text-neutral-600'}`}
        >
          Logic
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-2.5 py-1 rounded whitespace-nowrap ${activeTab === 'settings' ? 'bg-white shadow-xs font-semibold' : 'text-neutral-600'}`}
        >
          Settings
        </button>
        <button
          onClick={() => setActiveTab('share')}
          className={`px-2.5 py-1 rounded whitespace-nowrap ${activeTab === 'share' ? 'bg-white shadow-xs font-semibold' : 'text-neutral-600'}`}
        >
          Share
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-2.5 py-1 rounded whitespace-nowrap ${activeTab === 'analytics' ? 'bg-white shadow-xs font-semibold' : 'text-neutral-600'}`}
        >
          Responses
        </button>
      </div>
    </header>
  );
};
