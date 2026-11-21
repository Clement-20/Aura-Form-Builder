import React from 'react';
import {
  ArrowLeft,
  Eye,
  Check,
  ShareNetwork,
  ChartBar,
  Palette,
  GitBranch,
  GearSix,
  Stack,
  Sparkle,
  ArrowCounterClockwise,
  ArrowClockwise,
  UsersThree,
  Desktop,
  DeviceTablet,
  DeviceMobile,
  Play,
  PencilSimple,
  CaretLeft,
  CaretRight,
  Code,
  PlugsConnected,
} from '@phosphor-icons/react';
import { FormSchema } from '../../types/form';
import { CollaboratorPresence } from '../../types/team';
import { CanvasViewport } from '../../studio';

interface EditorHeaderProps {
  form: FormSchema;
  onChangeTitle: (title: string) => void;
  activeTab:
    | 'build'
    | 'theme'
    | 'logic'
    | 'code'
    | 'integrations'
    | 'settings'
    | 'share'
    | 'analytics';
  setActiveTab: (
    tab:
      | 'build'
      | 'theme'
      | 'logic'
      | 'code'
      | 'integrations'
      | 'settings'
      | 'share'
      | 'analytics'
  ) => void;
  onOpenPreview: () => void;
  onOpenAIGenerator: () => void;
  onBackToDashboard: () => void;
  onTogglePublish: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  isSaving: boolean;
  canvasViewport?: CanvasViewport;
  onChangeViewport?: (viewport: CanvasViewport) => void;
  isLivePreviewMode?: boolean;
  onToggleLivePreview?: () => void;
  activePageIndex?: number;
  totalPages?: number;
  onSelectPageByNumber?: (pageNumber: number) => void;
  isTeamForm?: boolean;
  isReadOnly?: boolean;
  collaborators?: CollaboratorPresence[];
  openCommentsCount?: number;
  logicErrorCount?: number;
  onOpenCoAuthor?: () => void;
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
  canvasViewport = 'desktop',
  onChangeViewport,
  isLivePreviewMode = false,
  onToggleLivePreview,
  activePageIndex = 1,
  totalPages = 1,
  onSelectPageByNumber,
  isTeamForm = false,
  isReadOnly = false,
  collaborators = [],
  openCommentsCount = 0,
  logicErrorCount = 0,
  onOpenCoAuthor,
}) => {
  const TABS = [
    { id: 'build', label: 'Build', icon: Stack },
    { id: 'theme', label: 'Design', icon: Palette },
    { id: 'logic', label: `Rules (${form.logicRules.length})`, icon: GitBranch },
    { id: 'code', label: 'Code', icon: Code },
    { id: 'integrations', label: 'Integrations', icon: PlugsConnected },
    { id: 'settings', label: 'Settings', icon: GearSix },
    { id: 'share', label: 'Share', icon: ShareNetwork },
    { id: 'analytics', label: `Answers (${form.responsesCount || 0})`, icon: ChartBar },
  ] as const;

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b border-black/[0.08]">
      {/* Primary Top Toolbar */}
      <div className="px-3 sm:px-5 h-14 flex items-center justify-between gap-2 sm:gap-3">
        {/* Left: Back, Undo/Redo, Editable Title & Save Status */}
        <div className="flex items-center gap-2 min-w-0 flex-1 lg:flex-initial">
          <button
            type="button"
            onClick={onBackToDashboard}
            className="w-8 h-8 rounded-lg bg-[#F7F6F3] hover:bg-[#EAE7E1] border border-black/[0.07] text-[#0B0D0F] flex items-center justify-center transition-colors shrink-0"
            title="Back to My Forms"
            aria-label="Back to My Forms"
          >
            <ArrowLeft size={15} weight="bold" />
          </button>

          {!isReadOnly && (
            <div className="hidden sm:flex items-center gap-0.5 pr-2 border-r border-black/[0.08] shrink-0">
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                className="w-8 h-8 rounded-lg text-[#5C6066] hover:text-[#0B0D0F] hover:bg-black/[0.05] disabled:opacity-30 flex items-center justify-center transition-colors"
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
              >
                <ArrowCounterClockwise size={15} weight="regular" />
              </button>
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                className="w-8 h-8 rounded-lg text-[#5C6066] hover:text-[#0B0D0F] hover:bg-black/[0.05] disabled:opacity-30 flex items-center justify-center transition-colors"
                title="Redo (Ctrl+Shift+Z)"
                aria-label="Redo"
              >
                <ArrowClockwise size={15} weight="regular" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 min-w-0 flex-1">
            <input
              type="text"
              value={form.title}
              readOnly={isReadOnly}
              onChange={(e) => {
                if (!isReadOnly) onChangeTitle(e.target.value);
              }}
              className="w-full text-sm font-display font-semibold text-[#0B0D0F] bg-transparent hover:bg-[#F7F6F3] focus:bg-[#F7F6F3] focus:ring-2 focus:ring-[#0F766E] rounded-lg px-2.5 py-1 transition-all truncate focus:outline-none max-w-[140px] sm:max-w-[200px]"
              placeholder="Untitled Form"
              aria-label="Form title"
            />

            {isReadOnly ? (
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/[0.06] text-[#5C6066] font-mono text-[10px] uppercase shrink-0">
                <Eye size={11} weight="regular" />
                View only
              </span>
            ) : (
              <div className="hidden 2xl:flex items-center gap-1.5 shrink-0 font-mono text-[11px] whitespace-nowrap">
                {isSaving ? (
                  <span className="inline-flex items-center gap-1.5 text-amber-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    <span>{isTeamForm ? 'Syncing' : 'Saving'}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[#0F766E]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>{isTeamForm ? 'Synced' : 'Saved'}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center: Mode Tabs + Build Canvas Viewport & Page Controls */}
        <div className="hidden lg:flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-0.5 p-1 rounded-xl bg-[#F7F6F3] border border-black/[0.06]">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-white text-[#0B0D0F] shadow-xs font-semibold'
                      : 'text-[#5C6066] hover:text-[#0B0D0F]'
                  }`}
                >
                  <Icon size={14} weight={isActive ? 'duotone' : 'regular'} />
                  <span>{tab.label}</span>
                  {tab.id === 'logic' && logicErrorCount > 0 && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"
                      title={`${logicErrorCount} logic issue${logicErrorCount === 1 ? '' : 's'}`}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {activeTab === 'build' && onChangeViewport && (
            <div
              className="flex items-center gap-0.5 p-1 rounded-xl bg-[#F7F6F3] border border-black/[0.06]"
              role="group"
              aria-label="Canvas preview size"
            >
              <button
                type="button"
                onClick={() => onChangeViewport('desktop')}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                  canvasViewport === 'desktop'
                    ? 'bg-white text-[#0B0D0F] shadow-xs'
                    : 'text-[#5C6066] hover:text-[#0B0D0F]'
                }`}
                title="Desktop view"
                aria-label="Desktop view"
                aria-pressed={canvasViewport === 'desktop'}
              >
                <Desktop size={14} weight={canvasViewport === 'desktop' ? 'bold' : 'regular'} />
              </button>
              <button
                type="button"
                onClick={() => onChangeViewport('tablet')}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                  canvasViewport === 'tablet'
                    ? 'bg-white text-[#0B0D0F] shadow-xs'
                    : 'text-[#5C6066] hover:text-[#0B0D0F]'
                }`}
                title="Tablet view (768px)"
                aria-label="Tablet view"
                aria-pressed={canvasViewport === 'tablet'}
              >
                <DeviceTablet
                  size={14}
                  weight={canvasViewport === 'tablet' ? 'bold' : 'regular'}
                />
              </button>
              <button
                type="button"
                onClick={() => onChangeViewport('mobile')}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                  canvasViewport === 'mobile'
                    ? 'bg-white text-[#0B0D0F] shadow-xs'
                    : 'text-[#5C6066] hover:text-[#0B0D0F]'
                }`}
                title="Mobile view (390px)"
                aria-label="Mobile view"
                aria-pressed={canvasViewport === 'mobile'}
              >
                <DeviceMobile
                  size={14}
                  weight={canvasViewport === 'mobile' ? 'bold' : 'regular'}
                />
              </button>
            </div>
          )}

          {activeTab === 'build' && onToggleLivePreview && (
            <button
              type="button"
              onClick={onToggleLivePreview}
              aria-pressed={isLivePreviewMode}
              title={isLivePreviewMode ? 'Return to edit mode' : 'Interactive live preview on canvas'}
              className={`h-8 px-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all whitespace-nowrap shrink-0 ${
                isLivePreviewMode
                  ? 'bg-[#0F766E] text-white border-[#0F766E] shadow-xs'
                  : 'bg-[#F7F6F3] text-[#0B0D0F] border-black/[0.06] hover:bg-[#EAE7E1]'
              }`}
            >
              {isLivePreviewMode ? (
                <>
                  <PencilSimple size={13} weight="bold" />
                  <span>Edit Mode</span>
                </>
              ) : (
                <>
                  <Play size={13} weight="fill" className="text-[#0F766E]" />
                  <span>Live Preview</span>
                </>
              )}
            </button>
          )}

          {activeTab === 'build' && totalPages > 1 && onSelectPageByNumber && (
            <div className="hidden xl:flex items-center gap-1 px-1.5 py-1 rounded-xl bg-[#F7F6F3] border border-black/[0.06] text-[11px] font-mono text-[#0B0D0F]">
              <button
                type="button"
                disabled={activePageIndex <= 1}
                onClick={() => onSelectPageByNumber(activePageIndex - 1)}
                className="w-6 h-6 rounded-md hover:bg-white disabled:opacity-30 flex items-center justify-center transition-colors"
                title="Previous page"
                aria-label="Previous page"
              >
                <CaretLeft size={12} weight="bold" />
              </button>
              <span className="px-1 whitespace-nowrap">
                Pg {activePageIndex}/{totalPages}
              </span>
              <button
                type="button"
                disabled={activePageIndex >= totalPages}
                onClick={() => onSelectPageByNumber(activePageIndex + 1)}
                className="w-6 h-6 rounded-md hover:bg-white disabled:opacity-30 flex items-center justify-center transition-colors"
                title="Next page"
                aria-label="Next page"
              >
                <CaretRight size={12} weight="bold" />
              </button>
            </div>
          )}
        </div>

        {/* Right: Collaborators, AI Helper, Preview, Publish */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenCoAuthor && (
            <button
              type="button"
              onClick={onOpenCoAuthor}
              className={`h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 border whitespace-nowrap shrink-0 ${
                isTeamForm
                  ? 'bg-[#0F766E]/10 text-[#0F766E] border-[#0F766E]/25 hover:bg-[#0F766E]/15'
                  : 'bg-[#F7F6F3] text-[#0B0D0F] border-black/[0.08] hover:bg-[#EAE7E1]'
              }`}
              title={isTeamForm ? 'Live team & comments' : 'Share with a team to co-author'}
            >
              {isTeamForm && collaborators.length > 0 ? (
                <div className="flex items-center -space-x-1.5">
                  {collaborators.slice(0, 3).map((c) =>
                    c.photoURL ? (
                      <img
                        key={c.uid}
                        src={c.photoURL}
                        alt={c.displayName}
                        referrerPolicy="no-referrer"
                        className="w-4 h-4 rounded-full object-cover ring-1 ring-white"
                      />
                    ) : (
                      <span
                        key={c.uid}
                        className="w-4 h-4 rounded-full text-[9px] font-bold text-white ring-1 ring-white flex items-center justify-center"
                        style={{ backgroundColor: c.color }}
                      >
                        {c.displayName.charAt(0).toUpperCase()}
                      </span>
                    )
                  )}
                </div>
              ) : (
                <UsersThree size={14} weight="regular" className="text-[#0F766E]" />
              )}
              <span className="hidden md:inline">
                {isTeamForm ? `${collaborators.length} Live` : 'Team'}
              </span>
              {openCommentsCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-[#0F766E] text-white text-[10px] font-mono leading-none">
                  {openCommentsCount}
                </span>
              )}
            </button>
          )}

          {!isReadOnly && (
            <button
              type="button"
              onClick={onOpenAIGenerator}
              className="w-8 h-8 sm:w-auto sm:px-2.5 text-xs font-semibold text-[#0B0D0F] bg-[#F7F6F3] hover:bg-[#EAE7E1] border border-black/[0.08] rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
              title="Build or update questions with AI"
              aria-label="AI Helper"
            >
              <Sparkle size={14} weight="fill" className="text-[#0F766E]" />
              <span className="hidden xl:inline">AI</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenPreview}
            className="hidden sm:flex h-8 px-2.5 text-xs font-semibold text-[#0B0D0F] bg-[#F7F6F3] hover:bg-[#EAE7E1] border border-black/[0.08] rounded-lg transition-colors items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Eye size={14} weight="regular" />
            <span className="hidden md:inline">Preview</span>
          </button>

          {!isReadOnly && (
            <button
              type="button"
              onClick={onTogglePublish}
              className={`px-3.5 h-8 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 active:scale-[0.98] ${
                form.settings.isPublished
                  ? 'bg-[#0F766E] hover:bg-[#115E59] text-white'
                  : 'bg-[#0B0D0F] hover:bg-[#191D21] text-[#F7F6F3]'
              }`}
            >
              {form.settings.isPublished && <Check size={13} weight="bold" />}
              <span>{form.settings.isPublished ? 'Published' : 'Publish'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile Tab Strip + Quick Undo/Redo */}
      <div className="lg:hidden flex items-center gap-1.5 px-3 py-2 border-t border-black/[0.06] overflow-x-auto text-xs bg-[#FAF9F7] no-scrollbar">
        {!isReadOnly && (
          <div className="flex sm:hidden items-center gap-1 pr-2 mr-0.5 border-r border-black/[0.08] shrink-0">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="w-8 h-8 rounded-lg text-[#5C6066] hover:text-[#0B0D0F] bg-white border border-black/[0.06] disabled:opacity-30 flex items-center justify-center"
              aria-label="Undo"
            >
              <ArrowCounterClockwise size={14} weight="regular" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className="w-8 h-8 rounded-lg text-[#5C6066] hover:text-[#0B0D0F] bg-white border border-black/[0.06] disabled:opacity-30 flex items-center justify-center"
              aria-label="Redo"
            >
              <ArrowClockwise size={14} weight="regular" />
            </button>
          </div>
        )}

        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[34px] px-3 py-1 rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 shrink-0 ${
                isActive
                  ? 'bg-[#0B0D0F] text-[#F7F6F3] font-semibold'
                  : 'text-[#5C6066] bg-white border border-black/[0.06]'
              }`}
            >
              <Icon size={14} weight="regular" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
};
