import React, { useState, useEffect } from 'react';
import { FormTheme, CustomThemePreset } from '../../types/form';
import {
  getCustomThemePresets,
  saveCustomThemePreset,
  deleteCustomThemePreset,
  setDefaultTheme,
} from '../../lib/storage';
import {
  Check,
  Sparkles,
  Sliders,
  Type,
  Palette,
  BookmarkPlus,
  Trash2,
  Bookmark,
  Layers,
  MousePointerClick,
  Monitor,
  Smartphone,
  Star,
  CheckSquare,
  Zap,
  Play,
} from 'lucide-react';

interface ThemeStudioProps {
  theme: FormTheme;
  onChangeTheme: (theme: FormTheme) => void;
  formTitle: string;
}

const BUILT_IN_PRESETS: {
  id: string;
  name: string;
  theme: FormTheme;
}[] = [
  {
    id: 'preset_minimal',
    name: 'Modern Minimalist',
    theme: {
      primaryColor: '#18181B',
      secondaryColor: '#71717A',
      backgroundColor: '#FAFAFA',
      surfaceColor: '#FFFFFF',
      textColor: '#09090B',
      borderRadius: 'lg',
      fontFamily: 'Plus Jakarta Sans',
      fontSizeScale: 'normal',
      backgroundStyle: 'solid',
      inputStyle: 'bordered',
      buttonStyle: 'solid',
      buttonRadius: 'md',
      buttonShadow: 'subtle',
    },
  },
  {
    id: 'preset_emerald',
    name: 'Emerald Studio',
    theme: {
      primaryColor: '#0F766E',
      secondaryColor: '#14B8A6',
      backgroundColor: '#F8FAFC',
      surfaceColor: '#FFFFFF',
      textColor: '#0F172A',
      borderRadius: 'lg',
      fontFamily: 'DM Sans',
      fontSizeScale: 'normal',
      backgroundStyle: 'subtle-grid',
      inputStyle: 'bordered',
      buttonStyle: 'solid',
      buttonRadius: 'lg',
      buttonShadow: 'subtle',
    },
  },
  {
    id: 'preset_obsidian',
    name: 'Obsidian Night',
    theme: {
      primaryColor: '#6366F1',
      secondaryColor: '#818CF8',
      backgroundColor: '#0F172A',
      surfaceColor: '#1E293B',
      textColor: '#F8FAFC',
      borderRadius: 'md',
      fontFamily: 'Plus Jakarta Sans',
      fontSizeScale: 'normal',
      backgroundStyle: 'mesh',
      inputStyle: 'bordered',
      buttonStyle: 'solid',
      buttonRadius: 'md',
      buttonShadow: 'elevated',
    },
  },
  {
    id: 'preset_indigo',
    name: 'Indigo High-Tech',
    theme: {
      primaryColor: '#4F46E5',
      secondaryColor: '#6366F1',
      backgroundColor: '#F5F3FF',
      surfaceColor: '#FFFFFF',
      textColor: '#1E1B4B',
      borderRadius: 'lg',
      fontFamily: 'Outfit',
      fontSizeScale: 'large',
      backgroundStyle: 'gradient',
      gradientDirection: 'to-bottom',
      inputStyle: 'bordered',
      buttonStyle: 'solid',
      buttonRadius: 'full',
      buttonShadow: 'elevated',
    },
  },
  {
    id: 'preset_travertine',
    name: 'Travertine Editorial',
    theme: {
      primaryColor: '#854D0E',
      secondaryColor: '#A16207',
      backgroundColor: '#FEFCE8',
      surfaceColor: '#FFFFFF',
      textColor: '#422006',
      borderRadius: 'sm',
      fontFamily: 'Playfair Display',
      fontSizeScale: 'normal',
      backgroundStyle: 'solid',
      inputStyle: 'underlined',
      buttonStyle: 'outline',
      buttonRadius: 'none',
      buttonShadow: 'none',
    },
  },
  {
    id: 'preset_nordic',
    name: 'Nordic Slate & Dots',
    theme: {
      primaryColor: '#334155',
      secondaryColor: '#64748B',
      backgroundColor: '#F1F5F9',
      surfaceColor: '#FFFFFF',
      textColor: '#0F172A',
      borderRadius: 'lg',
      fontFamily: 'Bricolage Grotesque',
      fontSizeScale: 'normal',
      backgroundStyle: 'dots',
      inputStyle: 'filled',
      buttonStyle: 'soft',
      buttonRadius: 'md',
      buttonShadow: 'none',
    },
  },
];

export const ThemeStudio: React.FC<ThemeStudioProps> = ({
  theme,
  onChangeTheme,
  formTitle,
}) => {
  const [customPresets, setCustomPresets] = useState<CustomThemePreset[]>([]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [saveNotification, setSaveNotification] = useState<string | null>(null);
  const [isTestingAnimation, setIsTestingAnimation] = useState(false);

  const triggerTestAnimation = () => {
    setIsTestingAnimation(true);
    setTimeout(() => setIsTestingAnimation(false), 600);
  };

  useEffect(() => {
    setCustomPresets(getCustomThemePresets());
  }, []);

  const handleSaveAsTemplate = () => {
    if (!newTemplateName.trim()) return;

    const newPreset: CustomThemePreset = {
      id: 'custom_tmpl_' + Math.random().toString(36).substring(2, 9),
      name: newTemplateName.trim(),
      theme: { ...theme },
      isCustom: true,
    };

    saveCustomThemePreset(newPreset);
    setCustomPresets(getCustomThemePresets());
    setNewTemplateName('');
    setSaveModalOpen(false);
    showNotice(`Saved "${newPreset.name}" to your custom templates library.`);
  };

  const handleSetAsDefault = () => {
    setDefaultTheme(theme);
    showNotice('This theme will be automatically applied to new forms!');
  };

  const handleDeleteCustomPreset = (id: string) => {
    deleteCustomThemePreset(id);
    setCustomPresets(getCustomThemePresets());
  };

  const showNotice = (msg: string) => {
    setSaveNotification(msg);
    setTimeout(() => setSaveNotification(null), 3000);
  };

  // Helper for button styles in preview
  const getButtonClasses = () => {
    const radiusClass = {
      none: 'rounded-none',
      sm: 'rounded-sm',
      md: 'rounded-md',
      lg: 'rounded-xl',
      full: 'rounded-full',
    }[theme.buttonRadius || 'md'];

    const shadowClass = {
      none: 'shadow-none',
      subtle: 'shadow-xs',
      elevated: 'shadow-md',
    }[theme.buttonShadow || 'subtle'];

    return `${radiusClass} ${shadowClass}`;
  };

  return (
    <div className="flex-1 overflow-y-auto h-[calc(100vh-3.5rem)] bg-neutral-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Theme Controls */}
        <div className="lg:col-span-7 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-neutral-900 tracking-tight flex items-center gap-2">
                <Palette className="w-5 h-5 text-neutral-800" />
                <span>Theme Customization Studio</span>
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Define visual design tokens, primary/secondary palettes, typography, button variants, and backgrounds.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSaveModalOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-neutral-300 hover:border-neutral-900 bg-white text-neutral-800 transition-colors flex items-center gap-1.5 shadow-2xs"
              >
                <BookmarkPlus className="w-3.5 h-3.5 text-indigo-600" />
                <span>Save as Template</span>
              </button>
              <button
                type="button"
                onClick={handleSetAsDefault}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white transition-colors shadow-2xs"
              >
                Set as Default
              </button>
            </div>
          </div>

          {saveNotification && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-medium flex items-center gap-2 animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>{saveNotification}</span>
            </div>
          )}

          {/* SECTION 1: THEME PRESETS & SAVED TEMPLATES */}
          <div className="bg-white p-5 rounded-2xl border border-neutral-200/90 shadow-xs space-y-4">
            <span className="text-[11px] font-semibold text-neutral-800 uppercase tracking-wider block">
              Curated Presets & Saved Templates
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {BUILT_IN_PRESETS.map((preset) => {
                const isActive =
                  theme.primaryColor === preset.theme.primaryColor &&
                  theme.backgroundColor === preset.theme.backgroundColor &&
                  theme.fontFamily === preset.theme.fontFamily;

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onChangeTheme({ ...preset.theme })}
                    className={`p-3 rounded-xl border text-left transition-all relative ${
                      isActive
                        ? 'border-neutral-900 ring-2 ring-neutral-900 bg-neutral-50/50 shadow-xs'
                        : 'border-neutral-200 hover:border-neutral-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <div
                        className="w-4 h-4 rounded-full border border-neutral-300 shadow-2xs"
                        style={{ backgroundColor: preset.theme.primaryColor }}
                      />
                      <div
                        className="w-4 h-4 rounded-full border border-neutral-300 shadow-2xs"
                        style={{ backgroundColor: preset.theme.secondaryColor || '#cbd5e1' }}
                      />
                      <div
                        className="w-4 h-4 rounded-full border border-neutral-300 shadow-2xs"
                        style={{ backgroundColor: preset.theme.backgroundColor }}
                      />
                    </div>
                    <span className="text-xs font-bold text-neutral-900 block truncate">
                      {preset.name}
                    </span>
                    <span className="text-[10px] text-neutral-400 block truncate mt-0.5">
                      {preset.theme.fontFamily}
                    </span>
                  </button>
                );
              })}

              {/* User Saved Custom Presets */}
              {customPresets.map((preset) => (
                <div
                  key={preset.id}
                  onClick={() => onChangeTheme({ ...preset.theme })}
                  className="p-3 rounded-xl border border-indigo-200 bg-indigo-50/30 hover:border-indigo-400 cursor-pointer text-left transition-all relative group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-4 h-4 rounded-full border"
                        style={{ backgroundColor: preset.theme.primaryColor }}
                      />
                      <div
                        className="w-4 h-4 rounded-full border"
                        style={{ backgroundColor: preset.theme.backgroundColor }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCustomPreset(preset.id);
                      }}
                      className="p-1 text-neutral-400 hover:text-rose-600 rounded"
                      title="Delete saved template"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-xs font-bold text-indigo-950 block truncate">
                    {preset.name}
                  </span>
                  <span className="text-[10px] text-indigo-600/80 font-medium block">
                    Custom Template
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION 2: COLOR PALETTES (PRIMARY & SECONDARY) */}
          <div className="bg-white p-5 rounded-2xl border border-neutral-200/90 shadow-xs space-y-4">
            <span className="text-[11px] font-semibold text-neutral-800 uppercase tracking-wider block">
              Color Tokens & Semantic Palettes
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Primary Color */}
              <div className="space-y-1.5">
                <label className="font-semibold text-neutral-700 flex items-center justify-between">
                  <span>Primary Brand Color</span>
                  <span className="text-[11px] font-mono opacity-60">Buttons, Active States</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={theme.primaryColor}
                    onChange={(e) => onChangeTheme({ ...theme, primaryColor: e.target.value })}
                    className="w-9 h-9 rounded-lg border border-neutral-200 cursor-pointer p-0.5 shrink-0"
                  />
                  <input
                    type="text"
                    value={theme.primaryColor}
                    onChange={(e) => onChangeTheme({ ...theme, primaryColor: e.target.value })}
                    className="flex-1 px-3 py-2 font-mono text-xs border rounded-lg border-neutral-200 uppercase focus:outline-none focus:border-neutral-900"
                  />
                </div>
              </div>

              {/* Secondary Color */}
              <div className="space-y-1.5">
                <label className="font-semibold text-neutral-700 flex items-center justify-between">
                  <span>Secondary / Accent Color</span>
                  <span className="text-[11px] font-mono opacity-60">Highlights, Subtles</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={theme.secondaryColor || '#64748b'}
                    onChange={(e) => onChangeTheme({ ...theme, secondaryColor: e.target.value })}
                    className="w-9 h-9 rounded-lg border border-neutral-200 cursor-pointer p-0.5 shrink-0"
                  />
                  <input
                    type="text"
                    value={theme.secondaryColor || '#64748b'}
                    onChange={(e) => onChangeTheme({ ...theme, secondaryColor: e.target.value })}
                    className="flex-1 px-3 py-2 font-mono text-xs border rounded-lg border-neutral-200 uppercase focus:outline-none focus:border-neutral-900"
                  />
                </div>
              </div>

              {/* Background Canvas */}
              <div className="space-y-1.5">
                <label className="font-semibold text-neutral-700">Canvas Background Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={theme.backgroundColor}
                    onChange={(e) => onChangeTheme({ ...theme, backgroundColor: e.target.value })}
                    className="w-9 h-9 rounded-lg border border-neutral-200 cursor-pointer p-0.5 shrink-0"
                  />
                  <input
                    type="text"
                    value={theme.backgroundColor}
                    onChange={(e) => onChangeTheme({ ...theme, backgroundColor: e.target.value })}
                    className="flex-1 px-3 py-2 font-mono text-xs border rounded-lg border-neutral-200 uppercase focus:outline-none focus:border-neutral-900"
                  />
                </div>
              </div>

              {/* Card Surface */}
              <div className="space-y-1.5">
                <label className="font-semibold text-neutral-700">Card & Surface Background</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={theme.surfaceColor}
                    onChange={(e) => onChangeTheme({ ...theme, surfaceColor: e.target.value })}
                    className="w-9 h-9 rounded-lg border border-neutral-200 cursor-pointer p-0.5 shrink-0"
                  />
                  <input
                    type="text"
                    value={theme.surfaceColor}
                    onChange={(e) => onChangeTheme({ ...theme, surfaceColor: e.target.value })}
                    className="flex-1 px-3 py-2 font-mono text-xs border rounded-lg border-neutral-200 uppercase focus:outline-none focus:border-neutral-900"
                  />
                </div>
              </div>

              {/* Text Primary */}
              <div className="space-y-1.5">
                <label className="font-semibold text-neutral-700">Primary Headline & Text Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={theme.textColor}
                    onChange={(e) => onChangeTheme({ ...theme, textColor: e.target.value })}
                    className="w-9 h-9 rounded-lg border border-neutral-200 cursor-pointer p-0.5 shrink-0"
                  />
                  <input
                    type="text"
                    value={theme.textColor}
                    onChange={(e) => onChangeTheme({ ...theme, textColor: e.target.value })}
                    className="flex-1 px-3 py-2 font-mono text-xs border rounded-lg border-neutral-200 uppercase focus:outline-none focus:border-neutral-900"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: TYPOGRAPHY SYSTEM */}
          <div className="bg-white p-5 rounded-2xl border border-neutral-200/90 shadow-xs space-y-4">
            <span className="text-[11px] font-semibold text-neutral-800 uppercase tracking-wider block">
              Typography System
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {(
                [
                  { name: 'Plus Jakarta Sans', category: 'Geometric Sans' },
                  { name: 'DM Sans', category: 'Clean Modern' },
                  { name: 'Outfit', category: 'Contemporary' },
                  { name: 'Playfair Display', category: 'Luxury Editorial' },
                  { name: 'JetBrains Mono', category: 'Technical Monospace' },
                  { name: 'Inter', category: 'Universal Neutral' },
                  { name: 'Bricolage Grotesque', category: 'Distinctive Punch' },
                ] as const
              ).map((font) => (
                <button
                  key={font.name}
                  type="button"
                  onClick={() => onChangeTheme({ ...theme, fontFamily: font.name as any })}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    theme.fontFamily === font.name
                      ? 'border-neutral-900 bg-neutral-900/5 font-semibold text-neutral-900 ring-1 ring-neutral-900'
                      : 'border-neutral-200 hover:border-neutral-300 bg-white text-neutral-700'
                  }`}
                >
                  <span className="text-sm block">{font.name}</span>
                  <span className="text-[10px] text-neutral-400 block mt-0.5">{font.category}</span>
                </button>
              ))}
            </div>

            {/* Font scale */}
            <div className="pt-2 flex items-center gap-4 text-xs">
              <span className="font-semibold text-neutral-600">Scale Preset:</span>
              {(['compact', 'normal', 'large'] as const).map((sc) => (
                <label key={sc} className="flex items-center gap-1.5 cursor-pointer capitalize">
                  <input
                    type="radio"
                    name="fontSizeScale"
                    checked={(theme.fontSizeScale || 'normal') === sc}
                    onChange={() => onChangeTheme({ ...theme, fontSizeScale: sc })}
                    className="text-neutral-900"
                  />
                  <span>{sc}</span>
                </label>
              ))}
            </div>
          </div>

          {/* SECTION 4: BUTTON STYLES & INTERACTION */}
          <div className="bg-white p-5 rounded-2xl border border-neutral-200/90 shadow-xs space-y-4 text-xs">
            <span className="text-[11px] font-semibold text-neutral-800 uppercase tracking-wider block">
              Button Aesthetics & Interaction
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Variant */}
              <div className="space-y-1.5">
                <label className="font-semibold text-neutral-700">Button Variant</label>
                <select
                  value={theme.buttonStyle || 'solid'}
                  onChange={(e) =>
                    onChangeTheme({ ...theme, buttonStyle: e.target.value as any })
                  }
                  className="w-full p-2 border rounded-lg border-neutral-200 bg-white font-medium"
                >
                  <option value="solid">Solid Filled</option>
                  <option value="soft">Soft Tinted</option>
                  <option value="outline">Outline Border</option>
                  <option value="minimal">Minimal Flat</option>
                </select>
              </div>

              {/* Radius */}
              <div className="space-y-1.5">
                <label className="font-semibold text-neutral-700">Button Corner Radius</label>
                <select
                  value={theme.buttonRadius || 'md'}
                  onChange={(e) =>
                    onChangeTheme({ ...theme, buttonRadius: e.target.value as any })
                  }
                  className="w-full p-2 border rounded-lg border-neutral-200 bg-white font-medium"
                >
                  <option value="none">Sharp (0px)</option>
                  <option value="sm">Subtle (4px)</option>
                  <option value="md">Balanced (8px)</option>
                  <option value="lg">Smooth (12px)</option>
                  <option value="full">Full Pill (9999px)</option>
                </select>
              </div>

              {/* Shadow */}
              <div className="space-y-1.5">
                <label className="font-semibold text-neutral-700">Button Shadow</label>
                <select
                  value={theme.buttonShadow || 'subtle'}
                  onChange={(e) =>
                    onChangeTheme({ ...theme, buttonShadow: e.target.value as any })
                  }
                  className="w-full p-2 border rounded-lg border-neutral-200 bg-white font-medium"
                >
                  <option value="none">None (Flat)</option>
                  <option value="subtle">Subtle Elevation (1px)</option>
                  <option value="elevated">Floating Elevation (4px)</option>
                </select>
              </div>
            </div>
          </div>

          {/* SECTION 5: BACKGROUND TEXTURES & INPUT ELEMENTS */}
          <div className="bg-white p-5 rounded-2xl border border-neutral-200/90 shadow-xs space-y-4 text-xs">
            <span className="text-[11px] font-semibold text-neutral-800 uppercase tracking-wider block">
              Background Elements & Input Styling
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Background Pattern */}
              <div className="space-y-1.5">
                <label className="font-semibold text-neutral-700">Background Treatment</label>
                <select
                  value={theme.backgroundStyle}
                  onChange={(e) =>
                    onChangeTheme({ ...theme, backgroundStyle: e.target.value as any })
                  }
                  className="w-full p-2 border rounded-lg border-neutral-200 bg-white font-medium"
                >
                  <option value="solid">Solid Clean Canvas</option>
                  <option value="subtle-grid">Technical Subtle Grid</option>
                  <option value="dots">Subtle Dot Matrix</option>
                  <option value="gradient">Soft Dual-Color Gradient</option>
                  <option value="mesh">Ambient Geometric Mesh</option>
                </select>
              </div>

              {/* Input Style */}
              <div className="space-y-1.5">
                <label className="font-semibold text-neutral-700">Form Inputs Appearance</label>
                <select
                  value={theme.inputStyle}
                  onChange={(e) =>
                    onChangeTheme({ ...theme, inputStyle: e.target.value as any })
                  }
                  className="w-full p-2 border rounded-lg border-neutral-200 bg-white font-medium"
                >
                  <option value="bordered">Bordered Outline (Clean Box)</option>
                  <option value="filled">Filled Tint (No Border)</option>
                  <option value="underlined">Underlined (Editorial Minimal)</option>
                </select>
              </div>
            </div>
          </div>

          {/* SECTION 6: ANIMATION & TRANSITION DYNAMICS */}
          <div className="bg-white p-5 rounded-2xl border border-neutral-200/90 shadow-xs space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>Animation, Video & Motion System</span>
              </span>
              <button
                type="button"
                onClick={triggerTestAnimation}
                className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 flex items-center gap-1 transition-colors"
              >
                <Play className="w-3 h-3 text-indigo-600 fill-current" />
                <span>Preview & Replay</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-neutral-700">Intro Animation</label>
                <select
                  value={theme.animationIntro || 'fade-in'}
                  onChange={(e) =>
                    onChangeTheme({ ...theme, animationIntro: e.target.value as any })
                  }
                  className="w-full p-2 border rounded-lg border-neutral-200 bg-white font-medium"
                >
                  <option value="fade-in">Fade In (Clean)</option>
                  <option value="slide-up">Slide Up (Elevation)</option>
                  <option value="zoom-in">Zoom In (Focus)</option>
                  <option value="none">None (Instant)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-neutral-700">Question Transition</label>
                <select
                  value={theme.animationPreset || 'slide-vertical'}
                  onChange={(e) =>
                    onChangeTheme({ ...theme, animationPreset: e.target.value as any })
                  }
                  className="w-full p-2 border rounded-lg border-neutral-200 bg-white font-medium"
                >
                  <option value="slide-vertical">Vertical Slide</option>
                  <option value="slide-horizontal">Horizontal Sweep</option>
                  <option value="fade-scale">Fade & Scale</option>
                  <option value="smooth-reveal">Smooth Dissolve</option>
                  <option value="none">Instant</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-neutral-700">Outro / Completion</label>
                <select
                  value={theme.animationOutro || 'confetti'}
                  onChange={(e) =>
                    onChangeTheme({ ...theme, animationOutro: e.target.value as any })
                  }
                  className="w-full p-2 border rounded-lg border-neutral-200 bg-white font-medium"
                >
                  <option value="confetti">Celebration Confetti</option>
                  <option value="zoom-out">Zoom Out Dissolve</option>
                  <option value="slide-down">Slide Down Exit</option>
                  <option value="none">Standard Complete</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="space-y-1">
                <label className="font-semibold text-neutral-700">Duration ({theme.animationDuration || 300}ms)</label>
                <input
                  type="range"
                  min={100}
                  max={800}
                  step={50}
                  value={theme.animationDuration || 300}
                  onChange={(e) =>
                    onChangeTheme({ ...theme, animationDuration: parseInt(e.target.value, 10) })
                  }
                  className="w-full accent-neutral-900"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-neutral-700">Easing Curve</label>
                <select
                  value={theme.animationEasing || 'ease-out'}
                  onChange={(e) =>
                    onChangeTheme({ ...theme, animationEasing: e.target.value as any })
                  }
                  className="w-full p-2 border rounded-lg border-neutral-200 bg-white font-medium"
                >
                  <option value="ease-out">Ease Out (Smooth Stop)</option>
                  <option value="ease-in-out">Ease In-Out (Symmetric)</option>
                  <option value="spring">Spring (Bouncy)</option>
                  <option value="ease">Standard Ease</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-neutral-700">Background Video URL (Optional)</label>
                <input
                  type="url"
                  value={theme.videoBackgroundUrl || ''}
                  onChange={(e) =>
                    onChangeTheme({ ...theme, videoBackgroundUrl: e.target.value })
                  }
                  placeholder="https://.../loop.mp4"
                  className="w-full px-2.5 py-1.5 border rounded-lg border-neutral-200 bg-white"
                />
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-neutral-100">
              <label className="flex items-center gap-2 font-medium text-neutral-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={theme.respectReducedMotion !== false}
                  onChange={(e) =>
                    onChangeTheme({ ...theme, respectReducedMotion: e.target.checked })
                  }
                  className="rounded text-neutral-900"
                />
                <span>Respect operating system reduced-motion preference (accessibility)</span>
              </label>

              <label className="flex items-center gap-2 font-medium text-neutral-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={theme.enableConfetti !== false}
                  onChange={(e) =>
                    onChangeTheme({ ...theme, enableConfetti: e.target.checked })
                  }
                  className="rounded text-neutral-900"
                />
                <span>Trigger celebration confetti blast on form completion</span>
              </label>
            </div>
          </div>
        </div>

        {/* Right Column: Real-Time Interactive Preview */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Live Token Rendering Preview
            </span>
            <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-neutral-200 text-xs">
              <button
                type="button"
                onClick={() => setPreviewDevice('desktop')}
                className={`p-1 rounded ${
                  previewDevice === 'desktop' ? 'bg-neutral-900 text-white' : 'text-neutral-500'
                }`}
                title="Desktop"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPreviewDevice('mobile')}
                className={`p-1 rounded ${
                  previewDevice === 'mobile' ? 'bg-neutral-900 text-white' : 'text-neutral-500'
                }`}
                title="Mobile"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Interactive Rendering Frame */}
          <div
            className={`p-6 sm:p-8 rounded-2xl border shadow-md transition-all space-y-6 ${
              previewDevice === 'mobile' ? 'max-w-[340px] mx-auto' : 'w-full'
            }`}
            style={{
              backgroundColor: theme.backgroundColor,
              borderColor: `${theme.primaryColor}30`,
              color: theme.textColor,
              fontFamily: theme.fontFamily,
            }}
          >
            {/* Header */}
            <div className="space-y-1 border-b pb-4" style={{ borderColor: `${theme.primaryColor}20` }}>
              <div className="flex items-center justify-between text-xs opacity-75">
                <span className="font-semibold uppercase tracking-wider">Step 1 of 3</span>
                <span className="font-mono tabular-nums">33% Complete</span>
              </div>
              <div className="w-full bg-neutral-200/80 h-1.5 rounded-full overflow-hidden mt-2">
                <div
                  className="h-full transition-all duration-300"
                  style={{ width: '33%', backgroundColor: theme.primaryColor }}
                />
              </div>
              <h3 className="text-xl font-bold tracking-tight pt-3">
                {formTitle || 'Sample Experience Form'}
              </h3>
              <p className="text-xs opacity-75">
                Every customization is rendered live with consistent design tokens.
              </p>
            </div>

            {/* Input Element */}
            <div className="space-y-1.5 text-xs">
              <label className="font-bold block">What is your primary focus?</label>
              {theme.inputStyle === 'underlined' ? (
                <input
                  type="text"
                  placeholder="Type answer here..."
                  className="w-full py-2 bg-transparent border-b-2 focus:outline-none text-xs"
                  style={{ borderBottomColor: theme.primaryColor }}
                />
              ) : theme.inputStyle === 'filled' ? (
                <input
                  type="text"
                  placeholder="Type answer here..."
                  className="w-full p-3 bg-neutral-200/50 rounded-lg focus:outline-none text-xs"
                />
              ) : (
                <input
                  type="text"
                  placeholder="Type answer here..."
                  className="w-full p-2.5 bg-white/80 border rounded-lg focus:outline-none text-xs"
                  style={{ borderColor: '#cbd5e1' }}
                />
              )}
            </div>

            {/* Choice Element */}
            <div className="space-y-2 text-xs">
              <label className="font-bold block">Select Preferred Breakout</label>
              <div className="space-y-1.5">
                {[
                  { label: 'Option A: Technical Architecture', active: true },
                  { label: 'Option B: Design Systems & Tokens', active: false },
                ].map((opt, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg border flex items-center justify-between transition-all"
                    style={{
                      backgroundColor: opt.active ? `${theme.primaryColor}12` : theme.surfaceColor,
                      borderColor: opt.active ? theme.primaryColor : '#e2e8f0',
                      borderRadius: theme.borderRadius === 'sm' ? 4 : theme.borderRadius === 'md' ? 8 : theme.borderRadius === 'lg' ? 12 : 24,
                    }}
                  >
                    <span className="font-medium">{opt.label}</span>
                    {opt.active && <Check className="w-4 h-4" style={{ color: theme.primaryColor }} />}
                  </div>
                ))}
              </div>
            </div>

            {/* Rating Stars */}
            <div className="space-y-1.5 text-xs">
              <label className="font-bold block">Experience Rating</label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className="w-5 h-5 fill-current"
                    style={{ color: s <= 4 ? '#f59e0b' : '#cbd5e1' }}
                  />
                ))}
              </div>
            </div>

            {/* Styled Button */}
            <button
              type="button"
              className={`w-full py-2.5 px-4 font-semibold text-xs transition-all flex items-center justify-center gap-2 ${getButtonClasses()}`}
              style={{
                backgroundColor:
                  theme.buttonStyle === 'outline'
                    ? 'transparent'
                    : theme.buttonStyle === 'soft'
                    ? `${theme.primaryColor}18`
                    : theme.primaryColor,
                color:
                  theme.buttonStyle === 'outline'
                    ? theme.primaryColor
                    : theme.buttonStyle === 'soft'
                    ? theme.primaryColor
                    : '#ffffff',
                border: theme.buttonStyle === 'outline' ? `1.5px solid ${theme.primaryColor}` : 'none',
              }}
            >
              <span>Continue to Next Section</span>
            </button>
          </div>
        </div>
      </div>

      {/* Save Template Modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 bg-neutral-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-neutral-200 p-6 space-y-4 text-xs">
            <h3 className="font-bold text-sm text-neutral-900">
              Save Custom Theme Template
            </h3>
            <p className="text-neutral-500 text-[11px] leading-relaxed">
              Name this theme preset to reuse its colors, font selections, and button tokens across any form.
            </p>

            <div className="space-y-1">
              <label className="font-medium text-neutral-700">Template Name</label>
              <input
                type="text"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="e.g. Acme Corporate Dark"
                className="w-full px-3 py-2 border rounded-lg border-neutral-200 focus:outline-none focus:border-neutral-900"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSaveModalOpen(false)}
                className="px-3 py-1.5 text-neutral-600 hover:bg-neutral-100 rounded-lg font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAsTemplate}
                disabled={!newTemplateName.trim()}
                className="px-4 py-1.5 bg-neutral-900 text-white rounded-lg font-semibold hover:bg-neutral-800 disabled:opacity-40 shadow-xs"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
