import React, { useEffect, useMemo, useState } from 'react';
import {
  Palette,
  TextT,
  Layout,
  ImageSquare,
  SlidersHorizontal,
  Swatches,
  BookmarkSimple,
  Copy,
  Trash,
  ArrowCounterClockwise,
  Check,
  WarningCircle,
  ShieldCheck,
  Desktop,
  DeviceTablet,
  DeviceMobile,
  PaperPlaneTilt,
  X,
  Star,
} from '@phosphor-icons/react';
import { CustomThemePreset, FormSchema, FormTheme } from '../../types/form';
import {
  applyThemeToOtherForm,
  deleteCustomThemePreset,
  getCustomThemePresets,
  getStoredForms,
  saveCustomThemePreset,
  setDefaultTheme,
} from '../../lib/storage';
import {
  BUILT_IN_THEME_PRESETS,
  BreakpointKey,
  checkDesignContrast,
  DeviceDesignOverride,
  duplicateThemePreset,
  FormDesignConfig,
  FormDocument,
  FormDocumentRenderer,
  ViewportMode,
} from '../../studio';

interface ThemeStudioProps {
  document: FormDocument;
  onUpdateDesign: (patch: Partial<FormDesignConfig>) => void;
  onResetDesign: () => void;
  isReadOnly?: boolean;
}

type DesignTab = 'presets' | 'colours' | 'typography' | 'layout' | 'background' | 'borders';

const FONT_OPTIONS = [
  { name: 'Plus Jakarta Sans', category: 'Geometric Sans' },
  { name: 'DM Sans', category: 'Clean Modern' },
  { name: 'Outfit', category: 'Contemporary' },
  { name: 'Inter', category: 'Universal Neutral' },
  { name: 'Bricolage Grotesque', category: 'Distinctive Display' },
  { name: 'Playfair Display', category: 'Editorial Serif' },
  { name: 'JetBrains Mono', category: 'Technical Mono' },
] as const;

const BACKGROUND_IMAGE_PRESETS = [
  {
    label: 'Warm Studio',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1400&q=80',
  },
  {
    label: 'Architectural Stone',
    url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1400&q=80',
  },
  {
    label: 'Botanical Light',
    url: 'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=1400&q=80',
  },
  {
    label: 'Alpine Mist',
    url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1400&q=80',
  },
];

interface ColorFieldProps {
  label: string;
  hint?: string;
  value: string;
  fallback: string;
  disabled?: boolean;
  onChange: (hex: string) => void;
}

const ColorField: React.FC<ColorFieldProps> = ({
  label,
  hint,
  value,
  fallback,
  disabled,
  onChange,
}) => {
  const safeHex = /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] font-semibold text-[#0B0D0F] truncate">{label}</label>
        {hint && <span className="text-[10px] font-mono text-[#5C6066] shrink-0">{hint}</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          disabled={disabled}
          value={safeHex}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="w-8 h-8 rounded-lg border border-black/[0.12] cursor-pointer p-0.5 bg-white shrink-0 disabled:opacity-50"
        />
        <input
          type="text"
          disabled={disabled}
          value={value || ''}
          placeholder={fallback}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 px-2.5 py-1.5 font-mono text-[11px] uppercase rounded-lg bg-[#F7F6F3] focus:bg-white border border-black/[0.08] focus:border-[#0F766E] focus:outline-none disabled:opacity-50"
        />
      </div>
    </div>
  );
};

export const ThemeStudio: React.FC<ThemeStudioProps> = ({
  document,
  onUpdateDesign,
  onResetDesign,
  isReadOnly = false,
}) => {
  const design = document.design;
  const [activeSection, setActiveSection] = useState<DesignTab>('presets');
  const [previewDevice, setPreviewDevice] = useState<ViewportMode>('desktop');
  const [layoutDevice, setLayoutDevice] = useState<BreakpointKey>('desktop');
  const [customPresets, setCustomPresets] = useState<CustomThemePreset[]>([]);
  const [otherForms, setOtherForms] = useState<FormSchema[]>([]);

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [newThemeName, setNewThemeName] = useState('');
  const [newThemeDesc, setNewThemeDesc] = useState('');

  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [selectedTargetFormIds, setSelectedTargetFormIds] = useState<string[]>([]);

  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setCustomPresets(getCustomThemePresets());
  }, []);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3200);
  };

  const contrastChecks = useMemo(() => checkDesignContrast(design), [design]);
  const hasContrastWarning = contrastChecks.some((c) => !c.passesAA);

  const patchDesign = (patch: Partial<FormDesignConfig>) => {
    if (isReadOnly) return;
    onUpdateDesign(patch);
  };

  const patchDeviceOverride = (
    device: BreakpointKey,
    patch: Partial<DeviceDesignOverride>
  ) => {
    if (isReadOnly) return;
    const currentDevice = design.responsive?.[device] || {};
    onUpdateDesign({
      responsive: {
        ...design.responsive,
        [device]: { ...currentDevice, ...patch },
      },
    });
  };

  const clearDeviceOverrides = (device: BreakpointKey) => {
    if (isReadOnly) return;
    const nextResp = { ...(design.responsive || {}) };
    delete nextResp[device];
    onUpdateDesign({ responsive: nextResp });
    showNotice(`Cleared ${device} layout overrides.`);
  };

  const handleApplyPreset = (presetTheme: FormTheme, label: string) => {
    if (isReadOnly) return;
    onUpdateDesign({ ...presetTheme });
    showNotice(`Applied "${label}" theme. Customise any token freely.`);
  };

  const handleSaveCustomTheme = () => {
    if (!newThemeName.trim()) return;
    const preset: CustomThemePreset = {
      id: `custom_theme_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: newThemeName.trim(),
      description: newThemeDesc.trim() || 'Saved custom studio theme',
      theme: JSON.parse(JSON.stringify(design)) as FormTheme,
      isCustom: true,
      createdAt: new Date().toISOString(),
    };
    saveCustomThemePreset(preset);
    setCustomPresets(getCustomThemePresets());
    setNewThemeName('');
    setNewThemeDesc('');
    setSaveModalOpen(false);
    showNotice(`Saved "${preset.name}" to your theme library.`);
  };

  const handleDuplicatePreset = (preset: CustomThemePreset) => {
    const copy = duplicateThemePreset(preset);
    saveCustomThemePreset(copy);
    setCustomPresets(getCustomThemePresets());
    showNotice(`Duplicated "${preset.name}" as "${copy.name}".`);
  };

  const handleDeleteCustomPreset = (id: string) => {
    deleteCustomThemePreset(id);
    setCustomPresets(getCustomThemePresets());
    showNotice('Deleted custom theme preset.');
  };

  const handleOpenApplyModal = () => {
    const all = getStoredForms().filter((f) => f.id !== document.id);
    setOtherForms(all);
    setSelectedTargetFormIds([]);
    setApplyModalOpen(true);
  };

  const handleApplyToSelectedForms = () => {
    if (selectedTargetFormIds.length === 0) return;
    let appliedCount = 0;
    for (const id of selectedTargetFormIds) {
      if (applyThemeToOtherForm(id, design)) {
        appliedCount += 1;
      }
    }
    setApplyModalOpen(false);
    showNotice(
      `Applied this theme to ${appliedCount} ${appliedCount === 1 ? 'form' : 'forms'}.`
    );
  };

  const handleSetAsDefault = () => {
    setDefaultTheme(design);
    showNotice('Saved as the default theme for new forms.');
  };

  const handleResetToDefault = () => {
    if (isReadOnly) return;
    onResetDesign();
    showNotice('Reset form design to the FlexStore Alabaster default theme.');
  };

  const TABS: { id: DesignTab; label: string; icon: React.FC<any> }[] = [
    { id: 'presets', label: 'Presets', icon: Swatches },
    { id: 'colours', label: 'Colours', icon: Palette },
    { id: 'typography', label: 'Typography', icon: TextT },
    { id: 'layout', label: 'Layout', icon: Layout },
    { id: 'background', label: 'Background', icon: ImageSquare },
    { id: 'borders', label: 'Borders & Buttons', icon: SlidersHorizontal },
  ];

  const activeDeviceOverride = design.responsive?.[layoutDevice] || {};

  return (
    <div className="flex-1 w-full bg-[#F2F0EC] flex flex-col lg:flex-row min-h-[calc(100dvh-3.5rem)] lg:h-[calc(100dvh-3.5rem)] overflow-hidden">
      {/* LEFT PANEL: Comprehensive Global Design System Controls */}
      <div className="w-full lg:w-[460px] xl:w-[500px] bg-white border-r border-black/[0.08] flex flex-col shrink-0 lg:h-full overflow-hidden">
        {/* Panel Header */}
        <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-black/[0.07] space-y-3 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-display font-bold text-base text-[#0B0D0F] tracking-tight">
                Design System &amp; Theme Studio
              </h2>
              <p className="text-[11px] text-[#5C6066] mt-0.5">
                Every colour, font, spacing, background, and button token updates live.
              </p>
            </div>
            {!isReadOnly && (
              <button
                type="button"
                onClick={handleResetToDefault}
                className="px-2.5 py-1.5 rounded-lg bg-[#F7F6F3] hover:bg-[#EAE7E1] text-[11px] font-semibold text-[#5C6066] hover:text-[#0B0D0F] flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                title="Reset all global design tokens to default"
              >
                <ArrowCounterClockwise size={13} weight="bold" />
                <span>Reset</span>
              </button>
            )}
          </div>

          {/* Quick Theme Actions */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSaveModalOpen(true)}
              className="px-2.5 py-1.5 rounded-lg bg-[#0B0D0F] hover:bg-[#191D21] text-white text-[11px] font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <BookmarkSimple size={13} weight="fill" />
              <span>Save Theme</span>
            </button>
            <button
              type="button"
              onClick={handleOpenApplyModal}
              className="px-2.5 py-1.5 rounded-lg bg-[#F7F6F3] hover:bg-[#EAE7E1] border border-black/[0.08] text-[#0B0D0F] text-[11px] font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <PaperPlaneTilt size={13} weight="regular" className="text-[#0F766E]" />
              <span>Apply to Form</span>
            </button>
            <button
              type="button"
              onClick={handleSetAsDefault}
              className="px-2.5 py-1.5 rounded-lg bg-[#F7F6F3] hover:bg-[#EAE7E1] border border-black/[0.08] text-[#0B0D0F] text-[11px] font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <Star size={13} weight="regular" className="text-[#0F766E]" />
              <span>Set Default</span>
            </button>
          </div>

          {/* Notice Banner */}
          {notice && (
            <div className="px-3 py-2 rounded-xl bg-[#0F766E]/10 border border-[#0F766E]/25 text-[#0F766E] text-[11px] font-semibold flex items-center gap-2">
              <Check size={14} weight="bold" className="shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {/* Category Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-0.5">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSection(tab.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all ${
                    active
                      ? 'bg-[#0B0D0F] text-white'
                      : 'bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F]'
                  }`}
                >
                  <Icon size={13} weight={active ? 'fill' : 'regular'} />
                  <span>{tab.label}</span>
                  {tab.id === 'colours' && hasContrastWarning && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-amber-400"
                      title="Contrast warning"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Category Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 text-xs">
          {/* =============================================================== */}
          {/* 1. PRESETS TAB                                                  */}
          {/* =============================================================== */}
          {activeSection === 'presets' && (
            <div className="space-y-5">
              <div className="space-y-2.5">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
                  Curated Starting Presets
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {BUILT_IN_THEME_PRESETS.map((preset) => {
                    const isActive =
                      design.primaryColor === preset.theme.primaryColor &&
                      design.backgroundColor === preset.theme.backgroundColor &&
                      design.surfaceColor === preset.theme.surfaceColor &&
                      design.fontFamily === preset.theme.fontFamily;

                    return (
                      <div
                        key={preset.id}
                        className={`p-3 rounded-xl border transition-all flex flex-col justify-between gap-2.5 ${
                          isActive
                            ? 'border-[#0F766E] ring-2 ring-[#0F766E]/20 bg-[#FAF9F7]'
                            : 'border-black/[0.08] hover:border-black/20 bg-white'
                        }`}
                      >
                        <button
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => handleApplyPreset(preset.theme, preset.name)}
                          className="text-left space-y-2 disabled:opacity-60"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-4 h-4 rounded-full border border-black/15"
                                style={{ backgroundColor: preset.theme.backgroundColor }}
                                title="Page background"
                              />
                              <span
                                className="w-4 h-4 rounded-full border border-black/15"
                                style={{ backgroundColor: preset.theme.surfaceColor }}
                                title="Form surface"
                              />
                              <span
                                className="w-4 h-4 rounded-full border border-black/15"
                                style={{ backgroundColor: preset.theme.primaryColor }}
                                title="Primary colour"
                              />
                              <span
                                className="w-4 h-4 rounded-full border border-black/15"
                                style={{
                                  backgroundColor:
                                    preset.theme.buttonBackgroundColor || preset.theme.primaryColor,
                                }}
                                title="Button colour"
                              />
                            </div>
                            {isActive && (
                              <span className="text-[10px] font-mono font-semibold text-[#0F766E]">
                                Active
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="font-display font-semibold text-xs text-[#0B0D0F] truncate">
                              {preset.name}
                            </p>
                            <p className="text-[11px] text-[#5C6066] line-clamp-2 mt-0.5 leading-snug">
                              {preset.description}
                            </p>
                          </div>
                        </button>

                        <div className="flex items-center justify-between pt-2 border-t border-black/[0.06]">
                          <span className="text-[10px] font-mono text-[#5C6066] truncate">
                            {preset.theme.fontFamily}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDuplicatePreset(preset)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#F7F6F3] hover:bg-[#EAE7E1] text-[10px] font-semibold text-[#0B0D0F] whitespace-nowrap shrink-0 transition-colors"
                            title="Duplicate preset to your library"
                          >
                            <Copy size={11} weight="regular" />
                            <span>Duplicate</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Saved Custom Themes */}
              <div className="space-y-2.5 pt-3 border-t border-black/[0.07]">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066]">
                    Your Saved Themes ({customPresets.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setSaveModalOpen(true)}
                    className="text-[11px] font-semibold text-[#0F766E] hover:underline"
                  >
                    + Save current
                  </button>
                </div>

                {customPresets.length === 0 ? (
                  <div className="p-4 rounded-xl bg-[#F7F6F3] border border-dashed border-black/[0.12] text-center space-y-1">
                    <p className="font-semibold text-[#0B0D0F] text-xs">No saved custom themes yet</p>
                    <p className="text-[11px] text-[#5C6066]">
                      Customise any preset or duplicate one above to build your reusable brand library.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {customPresets.map((preset) => (
                      <div
                        key={preset.id}
                        className="p-3 rounded-xl border border-black/[0.08] hover:border-[#0F766E]/50 bg-white flex items-center justify-between gap-3 transition-all"
                      >
                        <button
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => handleApplyPreset(preset.theme, preset.name)}
                          className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center -space-x-1 shrink-0">
                            <span
                              className="w-5 h-5 rounded-full border border-black/15"
                              style={{ backgroundColor: preset.theme.backgroundColor }}
                            />
                            <span
                              className="w-5 h-5 rounded-full border border-black/15"
                              style={{ backgroundColor: preset.theme.primaryColor }}
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-xs text-[#0B0D0F] truncate">
                              {preset.name}
                            </p>
                            <p className="text-[10px] font-mono text-[#5C6066] truncate">
                              {preset.theme.fontFamily} · {preset.theme.backgroundStyle}
                            </p>
                          </div>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleDuplicatePreset(preset)}
                            className="w-7 h-7 rounded-lg hover:bg-black/[0.05] text-[#5C6066] hover:text-[#0B0D0F] flex items-center justify-center"
                            title="Duplicate theme"
                            aria-label="Duplicate theme"
                          >
                            <Copy size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomPreset(preset.id)}
                            className="w-7 h-7 rounded-lg hover:bg-rose-50 text-[#5C6066] hover:text-rose-600 flex items-center justify-center"
                            title="Delete saved theme"
                            aria-label="Delete saved theme"
                          >
                            <Trash size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* 2. COLOURS TAB + WCAG AA CONTRAST MONITOR                       */}
          {/* =============================================================== */}
          {activeSection === 'colours' && (
            <div className="space-y-5">
              {/* Accessibility Contrast Checker */}
              <div
                className={`p-3.5 rounded-xl border space-y-2 ${
                  hasContrastWarning
                    ? 'bg-amber-50/80 border-amber-300/70'
                    : 'bg-[#F0FDFA] border-[#0F766E]/25'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[11px] text-[#0B0D0F] flex items-center gap-1.5">
                    {hasContrastWarning ? (
                      <WarningCircle size={15} weight="fill" className="text-amber-600" />
                    ) : (
                      <ShieldCheck size={15} weight="fill" className="text-[#0F766E]" />
                    )}
                    <span>WCAG AA Contrast Check</span>
                  </span>
                  <span className="font-mono text-[10px] text-[#5C6066]">Target 4.5:1+</span>
                </div>
                <div className="space-y-1.5">
                  {contrastChecks.map((check) => (
                    <div
                      key={check.id}
                      className="flex items-center justify-between text-[11px] bg-white/80 px-2.5 py-1.5 rounded-lg border border-black/[0.06]"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-4 h-4 rounded border border-black/15 flex items-center justify-center text-[9px] font-bold shrink-0"
                          style={{
                            backgroundColor: check.background,
                            color: check.foreground,
                          }}
                        >
                          A
                        </span>
                        <span className="text-[#0B0D0F] font-medium truncate">{check.label}</span>
                      </div>
                      <span
                        className={`font-mono text-[10px] font-semibold shrink-0 ${
                          check.passesAA
                            ? 'text-[#0F766E]'
                            : check.passesAALarge
                            ? 'text-amber-700'
                            : 'text-rose-600'
                        }`}
                      >
                        {check.ratio}:1 · {check.passesAA ? 'AA Pass' : 'Low contrast'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Brand & Surface Colours */}
              <div className="space-y-3">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
                  Canvas &amp; Brand Palette
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ColorField
                    label="Page Background"
                    value={design.backgroundColor}
                    fallback="#F7F6F3"
                    disabled={isReadOnly}
                    onChange={(v) => patchDesign({ backgroundColor: v })}
                  />
                  <ColorField
                    label="Form Background"
                    value={design.surfaceColor}
                    fallback="#FFFFFF"
                    disabled={isReadOnly}
                    onChange={(v) => patchDesign({ surfaceColor: v })}
                  />
                  <ColorField
                    label="Primary Colour"
                    value={design.primaryColor}
                    fallback="#0F766E"
                    disabled={isReadOnly}
                    onChange={(v) => patchDesign({ primaryColor: v })}
                  />
                  <ColorField
                    label="Secondary Colour"
                    value={design.secondaryColor || '#5C6066'}
                    fallback="#5C6066"
                    disabled={isReadOnly}
                    onChange={(v) => patchDesign({ secondaryColor: v })}
                  />
                  <ColorField
                    label="Accent Colour"
                    value={design.accentColor || design.primaryColor}
                    fallback="#10B981"
                    disabled={isReadOnly}
                    onChange={(v) => patchDesign({ accentColor: v })}
                  />
                </div>
              </div>

              {/* Typography Colours */}
              <div className="space-y-3 pt-4 border-t border-black/[0.07]">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
                  Text &amp; Headings
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ColorField
                    label="Heading Colour"
                    value={design.headingColor || design.textColor}
                    fallback="#0B0D0F"
                    disabled={isReadOnly}
                    onChange={(v) => patchDesign({ headingColor: v })}
                  />
                  <ColorField
                    label="Body Text Colour"
                    value={design.textColor}
                    fallback="#0B0D0F"
                    disabled={isReadOnly}
                    onChange={(v) => patchDesign({ textColor: v })}
                  />
                </div>
              </div>

              {/* Input Colours */}
              <div className="space-y-3 pt-4 border-t border-black/[0.07]">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
                  Inputs
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ColorField
                    label="Input Background"
                    value={design.inputBackgroundColor || '#FAF9F7'}
                    fallback="#FAF9F7"
                    disabled={isReadOnly}
                    onChange={(v) => patchDesign({ inputBackgroundColor: v })}
                  />
                  <ColorField
                    label="Input Border"
                    value={design.inputBorderColor || '#D6D3CD'}
                    fallback="#D6D3CD"
                    disabled={isReadOnly}
                    onChange={(v) => patchDesign({ inputBorderColor: v })}
                  />
                  <ColorField
                    label="Input Text"
                    value={design.inputTextColor || design.textColor}
                    fallback="#0B0D0F"
                    disabled={isReadOnly}
                    onChange={(v) => patchDesign({ inputTextColor: v })}
                  />
                  <ColorField
                    label="Placeholder Colour"
                    value={design.inputPlaceholderColor || '#787C82'}
                    fallback="#787C82"
                    disabled={isReadOnly}
                    onChange={(v) => patchDesign({ inputPlaceholderColor: v })}
                  />
                </div>
              </div>

              {/* Button & Feedback Colours */}
              <div className="space-y-3 pt-4 border-t border-black/[0.07]">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
                  Buttons &amp; Validation States
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ColorField
                    label="Button Background"
                    value={design.buttonBackgroundColor || design.primaryColor}
                    fallback="#0B0D0F"
                    disabled={isReadOnly}
                    onChange={(v) => patchDesign({ buttonBackgroundColor: v })}
                  />
                  <ColorField
                    label="Button Text"
                    value={design.buttonTextColor || '#FFFFFF'}
                    fallback="#FFFFFF"
                    disabled={isReadOnly}
                    onChange={(v) => patchDesign({ buttonTextColor: v })}
                  />
                  <ColorField
                    label="Button Hover"
                    value={design.buttonHoverColor || design.buttonBackgroundColor || design.primaryColor}
                    fallback="#1F2429"
                    disabled={isReadOnly}
                    onChange={(v) => patchDesign({ buttonHoverColor: v })}
                  />
                  <ColorField
                    label="Button Active"
                    value={design.buttonActiveColor || '#000000'}
                    fallback="#000000"
                    disabled={isReadOnly}
                    onChange={(v) => patchDesign({ buttonActiveColor: v })}
                  />
                  <ColorField
                    label="Error State"
                    value={design.errorColor || '#DC2626'}
                    fallback="#DC2626"
                    disabled={isReadOnly}
                    onChange={(v) => patchDesign({ errorColor: v })}
                  />
                  <ColorField
                    label="Success State"
                    value={design.successColor || '#0F766E'}
                    fallback="#0F766E"
                    disabled={isReadOnly}
                    onChange={(v) => patchDesign({ successColor: v })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* 3. TYPOGRAPHY TAB                                               */}
          {/* =============================================================== */}
          {activeSection === 'typography' && (
            <div className="space-y-5">
              <div className="space-y-2">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
                  Font Family
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {FONT_OPTIONS.map((font) => {
                    const active = design.fontFamily === font.name;
                    return (
                      <button
                        key={font.name}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => patchDesign({ fontFamily: font.name })}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          active
                            ? 'border-[#0F766E] ring-2 ring-[#0F766E]/20 bg-[#FAF9F7]'
                            : 'border-black/[0.08] hover:border-black/20 bg-white'
                        }`}
                      >
                        <span
                          className="text-sm font-semibold text-[#0B0D0F] block"
                          style={{ fontFamily: font.name }}
                        >
                          {font.name}
                        </span>
                        <span className="text-[10px] text-[#5C6066] block mt-0.5">
                          {font.category}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-black/[0.07]">
                <div className="space-y-1.5">
                  <label className="font-semibold text-[#0B0D0F] block">Heading Size</label>
                  <div className="grid grid-cols-4 gap-1">
                    {(['sm', 'md', 'lg', 'xl'] as const).map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => patchDesign({ headingSize: sz })}
                        className={`py-1.5 rounded-lg font-mono text-[11px] uppercase font-semibold ${
                          (design.headingSize || 'lg') === sz
                            ? 'bg-[#0B0D0F] text-white'
                            : 'bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F]'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-[#0B0D0F] block">Body Text Size</label>
                  <div className="grid grid-cols-3 gap-1">
                    {(['sm', 'base', 'lg'] as const).map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => patchDesign({ bodySize: sz })}
                        className={`py-1.5 rounded-lg font-mono text-[11px] uppercase font-semibold ${
                          (design.bodySize || 'base') === sz
                            ? 'bg-[#0B0D0F] text-white'
                            : 'bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F]'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold text-[#0B0D0F] block">Font Weight</label>
                  <select
                    disabled={isReadOnly}
                    value={design.fontWeight || 'normal'}
                    onChange={(e) => patchDesign({ fontWeight: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg bg-[#F7F6F3] border border-black/[0.08] font-medium focus:bg-white focus:border-[#0F766E] focus:outline-none"
                  >
                    <option value="normal">Regular (400)</option>
                    <option value="medium">Medium (500)</option>
                    <option value="semibold">Semibold (600)</option>
                    <option value="bold">Bold (700)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-[#0B0D0F] block">Line Height</label>
                  <select
                    disabled={isReadOnly}
                    value={design.lineHeight || 'normal'}
                    onChange={(e) => patchDesign({ lineHeight: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg bg-[#F7F6F3] border border-black/[0.08] font-medium focus:bg-white focus:border-[#0F766E] focus:outline-none"
                  >
                    <option value="tight">Tight (1.25)</option>
                    <option value="normal">Normal (1.55)</option>
                    <option value="relaxed">Relaxed (1.80)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold text-[#0B0D0F] block">Letter Spacing</label>
                  <div className="grid grid-cols-3 gap-1">
                    {(['tight', 'normal', 'wide'] as const).map((ls) => (
                      <button
                        key={ls}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => patchDesign({ letterSpacing: ls })}
                        className={`py-1.5 rounded-lg text-[11px] capitalize font-semibold ${
                          (design.letterSpacing || 'normal') === ls
                            ? 'bg-[#0B0D0F] text-white'
                            : 'bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F]'
                        }`}
                      >
                        {ls}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-[#0B0D0F] block">Text Alignment</label>
                  <div className="grid grid-cols-3 gap-1">
                    {(['left', 'center', 'right'] as const).map((al) => (
                      <button
                        key={al}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => patchDesign({ textAlign: al })}
                        className={`py-1.5 rounded-lg text-[11px] capitalize font-semibold ${
                          (design.textAlign || 'left') === al
                            ? 'bg-[#0B0D0F] text-white'
                            : 'bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F]'
                        }`}
                      >
                        {al}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* 4. LAYOUT TAB + RESPONSIVE DEVICE OVERRIDES                     */}
          {/* =============================================================== */}
          {activeSection === 'layout' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold text-[#0B0D0F] block">Form Width</label>
                  <div className="grid grid-cols-4 gap-1">
                    {(['sm', 'md', 'lg', 'xl'] as const).map((w) => (
                      <button
                        key={w}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => patchDesign({ containerMaxWidth: w })}
                        className={`py-1.5 rounded-lg font-mono text-[11px] uppercase font-semibold ${
                          (design.containerMaxWidth || 'md') === w
                            ? 'bg-[#0B0D0F] text-white'
                            : 'bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F]'
                        }`}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-[#0B0D0F] block">Content Width</label>
                  <select
                    disabled={isReadOnly}
                    value={design.contentMaxWidth || 'standard'}
                    onChange={(e) => patchDesign({ contentMaxWidth: e.target.value as any })}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] font-medium focus:bg-white focus:border-[#0F766E] focus:outline-none"
                  >
                    <option value="narrow">Narrow (Reading focus)</option>
                    <option value="standard">Standard</option>
                    <option value="wide">Wide</option>
                    <option value="full">Full card width</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold text-[#0B0D0F] block">Page Alignment</label>
                  <div className="grid grid-cols-3 gap-1">
                    {(['left', 'center', 'right'] as const).map((al) => (
                      <button
                        key={al}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => patchDesign({ pageAlignment: al })}
                        className={`py-1.5 rounded-lg text-[11px] capitalize font-semibold ${
                          (design.pageAlignment || 'center') === al
                            ? 'bg-[#0B0D0F] text-white'
                            : 'bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F]'
                        }`}
                      >
                        {al}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-[#0B0D0F] block">Internal Padding</label>
                  <div className="grid grid-cols-4 gap-1">
                    {(['sm', 'md', 'lg', 'xl'] as const).map((pad) => (
                      <button
                        key={pad}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => patchDesign({ internalPadding: pad })}
                        className={`py-1.5 rounded-lg font-mono text-[11px] uppercase font-semibold ${
                          (design.internalPadding || 'lg') === pad
                            ? 'bg-[#0B0D0F] text-white'
                            : 'bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F]'
                        }`}
                      >
                        {pad}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="space-y-1.5">
                  <label className="font-semibold text-[#0B0D0F] block">Section Gap</label>
                  <select
                    disabled={isReadOnly}
                    value={design.sectionSpacing || 'md'}
                    onChange={(e) => patchDesign({ sectionSpacing: e.target.value as any })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] font-medium"
                  >
                    <option value="sm">Compact</option>
                    <option value="md">Balanced</option>
                    <option value="lg">Generous</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="font-semibold text-[#0B0D0F] block">Block Gap</label>
                  <select
                    disabled={isReadOnly}
                    value={design.componentSpacing || 'md'}
                    onChange={(e) => patchDesign({ componentSpacing: e.target.value as any })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] font-medium"
                  >
                    <option value="sm">Compact</option>
                    <option value="md">Balanced</option>
                    <option value="lg">Generous</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="font-semibold text-[#0B0D0F] block">Column Gap</label>
                  <select
                    disabled={isReadOnly}
                    value={design.columnGap || 'md'}
                    onChange={(e) => patchDesign({ columnGap: e.target.value as any })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] font-medium"
                  >
                    <option value="sm">Tight</option>
                    <option value="md">Normal</option>
                    <option value="lg">Wide</option>
                  </select>
                </div>
              </div>

              {/* Device-Specific Responsive Overrides */}
              <div className="pt-4 border-t border-black/[0.07] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066]">
                    Device-Specific Overrides
                  </span>
                  <div className="flex items-center gap-1 bg-[#F7F6F3] p-0.5 rounded-lg border border-black/[0.06]">
                    {(
                      [
                        { id: 'desktop', icon: Desktop, label: 'Desktop' },
                        { id: 'tablet', icon: DeviceTablet, label: 'Tablet' },
                        { id: 'mobile', icon: DeviceMobile, label: 'Mobile' },
                      ] as const
                    ).map((d) => {
                      const Icon = d.icon;
                      const active = layoutDevice === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            setLayoutDevice(d.id);
                            setPreviewDevice(d.id);
                          }}
                          className={`px-2 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 transition-all ${
                            active ? 'bg-white text-[#0B0D0F] shadow-2xs' : 'text-[#5C6066]'
                          }`}
                        >
                          <Icon size={12} weight={active ? 'bold' : 'regular'} />
                          <span>{d.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#FAF9F7] border border-black/[0.07] space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-[#0B0D0F] block">
                        Padding ({layoutDevice})
                      </label>
                      <select
                        disabled={isReadOnly}
                        value={activeDeviceOverride.internalPadding || ''}
                        onChange={(e) =>
                          patchDeviceOverride(layoutDevice, {
                            internalPadding: (e.target.value || undefined) as any,
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-black/[0.08]"
                      >
                        <option value="">Inherit global</option>
                        <option value="sm">Small</option>
                        <option value="md">Medium</option>
                        <option value="lg">Large</option>
                        <option value="xl">Extra large</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-[#0B0D0F] block">
                        Block Gap ({layoutDevice})
                      </label>
                      <select
                        disabled={isReadOnly}
                        value={activeDeviceOverride.componentSpacing || ''}
                        onChange={(e) =>
                          patchDeviceOverride(layoutDevice, {
                            componentSpacing: (e.target.value || undefined) as any,
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-black/[0.08]"
                      >
                        <option value="">Inherit global</option>
                        <option value="sm">Compact</option>
                        <option value="md">Balanced</option>
                        <option value="lg">Generous</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-[#0B0D0F] block">
                        Heading Size ({layoutDevice})
                      </label>
                      <select
                        disabled={isReadOnly}
                        value={activeDeviceOverride.headingSize || ''}
                        onChange={(e) =>
                          patchDeviceOverride(layoutDevice, {
                            headingSize: (e.target.value || undefined) as any,
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-black/[0.08]"
                      >
                        <option value="">Inherit global</option>
                        <option value="sm">SM</option>
                        <option value="md">MD</option>
                        <option value="lg">LG</option>
                        <option value="xl">XL</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-[#0B0D0F] block">
                        Alignment ({layoutDevice})
                      </label>
                      <select
                        disabled={isReadOnly}
                        value={activeDeviceOverride.textAlign || ''}
                        onChange={(e) =>
                          patchDeviceOverride(layoutDevice, {
                            textAlign: (e.target.value || undefined) as any,
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-black/[0.08]"
                      >
                        <option value="">Inherit global</option>
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                    </div>
                  </div>

                  {Object.keys(activeDeviceOverride).length > 0 && !isReadOnly && (
                    <button
                      type="button"
                      onClick={() => clearDeviceOverrides(layoutDevice)}
                      className="text-[11px] font-semibold text-rose-600 hover:underline"
                    >
                      Clear {layoutDevice} overrides
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* 5. BACKGROUND TAB (SOLID, GRADIENT, PATTERNS, IMAGE + OVERLAY)  */}
          {/* =============================================================== */}
          {activeSection === 'background' && (
            <div className="space-y-5">
              <div className="space-y-2">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
                  Background Style
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'solid', label: 'Solid' },
                      { id: 'gradient', label: 'Gradient' },
                      { id: 'image', label: 'Image' },
                      { id: 'subtle-grid', label: 'Grid' },
                      { id: 'dots', label: 'Dots' },
                      { id: 'mesh', label: 'Mesh' },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      disabled={isReadOnly}
                      onClick={() => patchDesign({ backgroundStyle: mode.id })}
                      className={`py-2 px-2.5 rounded-xl border text-xs font-semibold transition-all ${
                        design.backgroundStyle === mode.id
                          ? 'bg-[#0B0D0F] text-white border-[#0B0D0F]'
                          : 'bg-[#F7F6F3] text-[#5C6066] border-transparent hover:text-[#0B0D0F]'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {design.backgroundStyle === 'gradient' && (
                <div className="p-3.5 rounded-xl bg-[#FAF9F7] border border-black/[0.08] space-y-3">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
                    Gradient Stops &amp; Direction
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <ColorField
                      label="Start Colour"
                      value={design.gradientFrom || design.backgroundColor}
                      fallback="#F7F6F3"
                      disabled={isReadOnly}
                      onChange={(v) => patchDesign({ gradientFrom: v })}
                    />
                    <ColorField
                      label="End Colour"
                      value={design.gradientTo || '#E6F4F1'}
                      fallback="#E6F4F1"
                      disabled={isReadOnly}
                      onChange={(v) => patchDesign({ gradientTo: v })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#0B0D0F] block">
                      Direction
                    </label>
                    <select
                      disabled={isReadOnly}
                      value={design.gradientDirection || 'to-bottom'}
                      onChange={(e) => patchDesign({ gradientDirection: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.08] font-medium"
                    >
                      <option value="to-bottom">Top to Bottom</option>
                      <option value="to-right">Left to Right</option>
                      <option value="to-bottom-right">Diagonal (135°)</option>
                      <option value="radial">Radial Glow</option>
                    </select>
                  </div>
                </div>
              )}

              {design.backgroundStyle === 'image' && (
                <div className="p-3.5 rounded-xl bg-[#FAF9F7] border border-black/[0.08] space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#0B0D0F] block">
                      Background Image URL
                    </label>
                    <input
                      type="url"
                      disabled={isReadOnly}
                      value={design.backgroundImageUrl || ''}
                      onChange={(e) => patchDesign({ backgroundImageUrl: e.target.value })}
                      placeholder="https://images.unsplash.com/..."
                      className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none"
                    />
                  </div>

                  {/* Curated Quick Backdrop Swatches */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#5C6066] block">
                      Quick Backdrops
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {BACKGROUND_IMAGE_PRESETS.map((img) => (
                        <button
                          key={img.label}
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => patchDesign({ backgroundImageUrl: img.url })}
                          className={`px-2.5 py-1.5 rounded-lg border text-left text-[11px] font-medium transition-colors truncate ${
                            design.backgroundImageUrl === img.url
                              ? 'border-[#0F766E] bg-[#0F766E]/10 text-[#0F766E] font-semibold'
                              : 'border-black/[0.08] bg-white text-[#0B0D0F] hover:border-black/20'
                          }`}
                        >
                          {img.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-[#0B0D0F] block">
                        Position
                      </label>
                      <select
                        disabled={isReadOnly}
                        value={design.backgroundPosition || 'center'}
                        onChange={(e) => patchDesign({ backgroundPosition: e.target.value as any })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-black/[0.08]"
                      >
                        <option value="center">Center</option>
                        <option value="top">Top</option>
                        <option value="bottom">Bottom</option>
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-[#0B0D0F] block">
                        Sizing
                      </label>
                      <select
                        disabled={isReadOnly}
                        value={design.backgroundSize || 'cover'}
                        onChange={(e) => patchDesign({ backgroundSize: e.target.value as any })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-black/[0.08]"
                      >
                        <option value="cover">Cover (Fill frame)</option>
                        <option value="contain">Contain (Fit inside)</option>
                        <option value="auto">Auto (Original)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <ColorField
                      label="Overlay Tint"
                      value={design.backgroundOverlayColor || '#0B0D0F'}
                      fallback="#0B0D0F"
                      disabled={isReadOnly}
                      onChange={(v) => patchDesign({ backgroundOverlayColor: v })}
                    />
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-[#0B0D0F]">
                          Overlay Opacity
                        </label>
                        <span className="font-mono text-[10px] text-[#5C6066]">
                          {Math.round((design.backgroundOverlayOpacity ?? 0.35) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={85}
                        step={5}
                        disabled={isReadOnly}
                        value={Math.round((design.backgroundOverlayOpacity ?? 0.35) * 100)}
                        onChange={(e) =>
                          patchDesign({
                            backgroundOverlayOpacity: Number(e.target.value) / 100,
                          })
                        }
                        className="w-full accent-[#0F766E] mt-2"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Accessibility Motion & Celebration */}
              <div className="pt-4 border-t border-black/[0.07] space-y-2.5">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
                  Motion &amp; Accessibility
                </span>
                <label className="flex items-center gap-2.5 cursor-pointer text-[#0B0D0F] font-medium">
                  <input
                    type="checkbox"
                    disabled={isReadOnly}
                    checked={design.respectReducedMotion !== false}
                    onChange={(e) => patchDesign({ respectReducedMotion: e.target.checked })}
                    className="rounded accent-[#0F766E]"
                  />
                  <span>Respect OS reduced-motion preference</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer text-[#0B0D0F] font-medium">
                  <input
                    type="checkbox"
                    disabled={isReadOnly}
                    checked={design.enableConfetti !== false}
                    onChange={(e) => patchDesign({ enableConfetti: e.target.checked })}
                    className="rounded accent-[#0F766E]"
                  />
                  <span>Celebration confetti on form completion</span>
                </label>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* 6. BORDERS, EFFECTS, INPUTS & BUTTONS TAB                       */}
          {/* =============================================================== */}
          {activeSection === 'borders' && (
            <div className="space-y-5">
              {/* Form Container Borders & Shadow */}
              <div className="space-y-3">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
                  Container Borders &amp; Effects
                </span>
                <ColorField
                  label="Border Colour"
                  value={design.borderColor || '#E5E2DC'}
                  fallback="#E5E2DC"
                  disabled={isReadOnly}
                  onChange={(v) => patchDesign({ borderColor: v })}
                />

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-semibold text-[#0B0D0F] block">Border Width</label>
                    <div className="grid grid-cols-3 gap-1">
                      {(['0', '1', '2'] as const).map((bw) => (
                        <button
                          key={bw}
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => patchDesign({ borderWidth: bw })}
                          className={`py-1.5 rounded-lg font-mono text-[11px] font-semibold ${
                            (design.borderWidth ?? '1') === bw
                              ? 'bg-[#0B0D0F] text-white'
                              : 'bg-[#F7F6F3] text-[#5C6066]'
                          }`}
                        >
                          {bw}px
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-[#0B0D0F] block">Shadow Depth</label>
                    <div className="grid grid-cols-4 gap-1">
                      {(['none', 'sm', 'md', 'lg'] as const).map((sh) => (
                        <button
                          key={sh}
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => patchDesign({ cardShadow: sh })}
                          className={`py-1.5 rounded-lg font-mono text-[10px] uppercase font-semibold ${
                            (design.cardShadow || 'sm') === sh
                              ? 'bg-[#0B0D0F] text-white'
                              : 'bg-[#F7F6F3] text-[#5C6066]'
                          }`}
                        >
                          {sh}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-semibold text-[#0B0D0F] block">Corner Radius</label>
                    <select
                      disabled={isReadOnly}
                      value={design.borderRadius || 'lg'}
                      onChange={(e) => patchDesign({ borderRadius: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-lg bg-[#F7F6F3] border border-black/[0.08] font-medium"
                    >
                      <option value="none">Sharp (0px)</option>
                      <option value="sm">Subtle (4px)</option>
                      <option value="md">Balanced (8px)</option>
                      <option value="lg">Rounded (14px)</option>
                      <option value="full">Soft Pill (24px)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-[#0B0D0F] block">Container Style</label>
                    <select
                      disabled={isReadOnly}
                      value={design.containerStyle || 'elevated'}
                      onChange={(e) => patchDesign({ containerStyle: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-lg bg-[#F7F6F3] border border-black/[0.08] font-medium"
                    >
                      <option value="elevated">Elevated Card</option>
                      <option value="outlined">Crisp Outlined</option>
                      <option value="soft">Soft Tinted</option>
                      <option value="flat">Flat Surface</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Input Styling */}
              <div className="space-y-2.5 pt-4 border-t border-black/[0.07]">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
                  Input Styling
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'bordered', label: 'Bordered' },
                      { id: 'filled', label: 'Filled' },
                      { id: 'underlined', label: 'Underlined' },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      disabled={isReadOnly}
                      onClick={() => patchDesign({ inputStyle: st.id })}
                      className={`py-2 rounded-xl text-xs font-semibold transition-all ${
                        (design.inputStyle || 'bordered') === st.id
                          ? 'bg-[#0B0D0F] text-white'
                          : 'bg-[#F7F6F3] text-[#5C6066] hover:text-[#0B0D0F]'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Button Styling */}
              <div className="space-y-3 pt-4 border-t border-black/[0.07]">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
                  Button Styling
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-semibold text-[#0B0D0F] block">Variant</label>
                    <select
                      disabled={isReadOnly}
                      value={design.buttonStyle || 'solid'}
                      onChange={(e) => patchDesign({ buttonStyle: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-lg bg-[#F7F6F3] border border-black/[0.08] font-medium"
                    >
                      <option value="solid">Solid Filled</option>
                      <option value="soft">Soft Tinted</option>
                      <option value="outline">Outline Border</option>
                      <option value="minimal">Minimal Ghost</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-[#0B0D0F] block">Button Shape</label>
                    <select
                      disabled={isReadOnly}
                      value={design.buttonRadius || 'lg'}
                      onChange={(e) => patchDesign({ buttonRadius: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-lg bg-[#F7F6F3] border border-black/[0.08] font-medium"
                    >
                      <option value="none">Square (0px)</option>
                      <option value="sm">Subtle (4px)</option>
                      <option value="md">Rounded (8px)</option>
                      <option value="lg">Smooth (12px)</option>
                      <option value="full">Pill (Full)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-[#0B0D0F] block">Button Size</label>
                    <div className="grid grid-cols-3 gap-1">
                      {(['sm', 'md', 'lg'] as const).map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => patchDesign({ buttonPadding: sz })}
                          className={`py-1.5 rounded-lg font-mono text-[11px] uppercase font-semibold ${
                            (design.buttonPadding || 'md') === sz
                              ? 'bg-[#0B0D0F] text-white'
                              : 'bg-[#F7F6F3] text-[#5C6066]'
                          }`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-[#0B0D0F] block">Shadow</label>
                    <select
                      disabled={isReadOnly}
                      value={design.buttonShadow || 'subtle'}
                      onChange={(e) => patchDesign({ buttonShadow: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-lg bg-[#F7F6F3] border border-black/[0.08] font-medium"
                    >
                      <option value="none">Flat</option>
                      <option value="subtle">Subtle</option>
                      <option value="elevated">Elevated</option>
                    </select>
                  </div>
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer text-[#0B0D0F] font-medium pt-1">
                  <input
                    type="checkbox"
                    disabled={isReadOnly}
                    checked={Boolean(design.buttonFullWidth)}
                    onChange={(e) => patchDesign({ buttonFullWidth: e.target.checked })}
                    className="rounded accent-[#0F766E]"
                  />
                  <span>Stretch primary buttons to full width</span>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Real-Time Interactive Responsive Preview (Same FormDocumentRenderer as Published) */}
      <div className="flex-1 flex flex-col min-w-0 lg:h-full overflow-hidden">
        {/* Preview Top Bar */}
        <div className="px-4 sm:px-6 py-2.5 bg-[#F7F6F3] border-b border-black/[0.08] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0B0D0F] truncate">
              Live Interactive Form Preview
            </span>
          </div>

          <div
            className="flex items-center gap-0.5 p-1 rounded-xl bg-white border border-black/[0.08]"
            role="group"
            aria-label="Preview viewport device"
          >
            {(
              [
                { id: 'desktop', icon: Desktop, label: 'Desktop' },
                { id: 'tablet', icon: DeviceTablet, label: 'Tablet' },
                { id: 'mobile', icon: DeviceMobile, label: 'Mobile' },
              ] as const
            ).map((d) => {
              const Icon = d.icon;
              const active = previewDevice === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setPreviewDevice(d.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                    active ? 'bg-[#0B0D0F] text-white' : 'text-[#5C6066] hover:text-[#0B0D0F]'
                  }`}
                >
                  <Icon size={14} weight={active ? 'bold' : 'regular'} />
                  <span className="hidden sm:inline">{d.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Interactive Form Frame */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex justify-center items-start">
          <div
            className={`w-full transition-all duration-300 overflow-hidden shadow-xl border border-black/[0.1] ${
              previewDevice === 'mobile'
                ? 'max-w-[390px] rounded-[2rem] ring-8 ring-[#0B0D0F]/90'
                : previewDevice === 'tablet'
                ? 'max-w-[768px] rounded-2xl ring-4 ring-[#0B0D0F]/15'
                : 'max-w-full rounded-2xl'
            }`}
          >
            <FormDocumentRenderer
              source={document}
              isPreview={true}
              embedded={true}
              viewportOverride={previewDevice}
            />
          </div>
        </div>
      </div>

      {/* Save Custom Theme Modal */}
      {saveModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#0B0D0F]/55 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSaveModalOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-black/[0.1] p-5 space-y-4 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-sm text-[#0B0D0F]">
                Save Custom Theme
              </h3>
              <button
                type="button"
                onClick={() => setSaveModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-black/[0.06] flex items-center justify-center text-[#5C6066]"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
            <p className="text-[11px] text-[#5C6066] leading-relaxed">
              Save all current colours, typography, layout spacing, background, and button tokens to reuse across forms.
            </p>
            <div className="space-y-2.5">
              <div className="space-y-1">
                <label className="font-semibold text-[#0B0D0F] block">Theme Name</label>
                <input
                  type="text"
                  autoFocus
                  value={newThemeName}
                  onChange={(e) => setNewThemeName(e.target.value)}
                  placeholder="e.g. Studio Brand Light"
                  className="w-full px-3 py-2 rounded-lg bg-[#F7F6F3] focus:bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-[#0B0D0F] block">
                  Description <span className="font-normal text-[#5C6066]">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={newThemeDesc}
                  onChange={(e) => setNewThemeDesc(e.target.value)}
                  placeholder="Short note on when to use this theme..."
                  className="w-full px-3 py-2 rounded-lg bg-[#F7F6F3] focus:bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSaveModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-[#5C6066] hover:bg-black/[0.05] font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newThemeName.trim()}
                onClick={handleSaveCustomTheme}
                className="px-4 py-1.5 rounded-lg bg-[#0B0D0F] hover:bg-[#191D21] text-white font-semibold disabled:opacity-40"
              >
                Save Theme
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Apply Theme to Another Form Modal */}
      {applyModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#0B0D0F]/55 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setApplyModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-black/[0.1] p-5 space-y-4 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-sm text-[#0B0D0F]">
                Apply Current Theme to Another Form
              </h3>
              <button
                type="button"
                onClick={() => setApplyModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-black/[0.06] flex items-center justify-center text-[#5C6066]"
              >
                <X size={14} weight="bold" />
              </button>
            </div>

            {otherForms.length === 0 ? (
              <p className="text-[11px] text-[#5C6066] py-4 text-center">
                No other local forms found yet. Create another form from the dashboard to apply this theme to it.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {otherForms.map((f) => {
                  const checked = selectedTargetFormIds.includes(f.id);
                  return (
                    <label
                      key={f.id}
                      className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                        checked
                          ? 'border-[#0F766E] bg-[#0F766E]/[0.06]'
                          : 'border-black/[0.08] hover:bg-[#F7F6F3]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTargetFormIds((prev) => [...prev, f.id]);
                            } else {
                              setSelectedTargetFormIds((prev) =>
                                prev.filter((item) => item !== f.id)
                              );
                            }
                          }}
                          className="rounded accent-[#0F766E]"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-[#0B0D0F] truncate">
                            {f.title || 'Untitled Form'}
                          </p>
                          <p className="text-[10px] font-mono text-[#5C6066]">
                            {f.fields.length} blocks
                          </p>
                        </div>
                      </div>
                      <span
                        className="w-4 h-4 rounded-full border border-black/15 shrink-0"
                        style={{ backgroundColor: f.theme.primaryColor }}
                        title="Current theme colour"
                      />
                    </label>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setApplyModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-[#5C6066] hover:bg-black/[0.05] font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={selectedTargetFormIds.length === 0}
                onClick={handleApplyToSelectedForms}
                className="px-4 py-1.5 rounded-lg bg-[#0F766E] hover:bg-[#115E59] text-white font-semibold disabled:opacity-40"
              >
                Apply Theme ({selectedTargetFormIds.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
