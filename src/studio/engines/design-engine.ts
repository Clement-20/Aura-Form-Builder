/**
 * FlexStore / AuraForm Studio — Central Design Engine
 *
 * Single source of truth for:
 *  - Global design tokens (Colours, Typography, Layout, Background + Overlay, Borders & Effects)
 *  - Component-level style inheritance & override resolution
 *  - Device-specific responsive layout & column collapse (Desktop / Tablet / Mobile)
 *  - WCAG 2.1 contrast ratio verification for accessibility
 *
 * Used identically by EditorCanvas, ThemeStudio, PreviewModal, and FormDocumentRenderer
 * so there is zero visual drift between editing, previewing, and published forms.
 */

import type React from 'react';
import {
  BreakpointKey,
  ComponentAppearanceProps,
  ComponentLayoutProps,
  FormComponentNode,
  FormDesignConfig,
  SpacingToken,
} from '../document/types';

export type ViewportMode = BreakpointKey; // 'desktop' | 'tablet' | 'mobile'

export interface ContrastCheckItem {
  id: 'body' | 'heading' | 'button';
  label: string;
  foreground: string;
  background: string;
  ratio: number;
  passesAA: boolean;
  passesAALarge: boolean;
}

export interface ResolvedDesignTokens {
  fontFamilyClass: string;
  fontFamilyValue: string;
  borderRadiusClass: string;
  borderRadiusPx: string;
  buttonClass: string;
  containerMaxWidthClass: string;
  contentMaxWidthClass: string;
  pageAlignmentClass: string;
  sectionGapClass: string;
  componentGapClass: string;
  columnGapClass: string;
  internalPaddingClass: string;
  headingSizeClass: string;
  bodySizeClass: string;
  fontWeightClass: string;
  lineHeightClass: string;
  letterSpacingClass: string;
  textAlignClass: string;
  cardShadowClass: string;
  backgroundStyle: React.CSSProperties;
  backgroundImageUrl?: string;
  backgroundImageStyle?: React.CSSProperties;
  backgroundOverlayStyle?: React.CSSProperties;
  surfaceStyle: React.CSSProperties;
  headingStyle: React.CSSProperties;
  bodyStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
  inputClassName: string;
  buttonStyle: React.CSSProperties;
  buttonClassName: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    heading: string;
    inputBg: string;
    inputBorder: string;
    inputText: string;
    inputPlaceholder: string;
    buttonBg: string;
    buttonText: string;
    buttonBorder: string;
    buttonHover: string;
    buttonActive: string;
    border: string;
    error: string;
    success: string;
  };
  cssVariables: Record<string, string>;
}

export interface ResolvedComponentTokens {
  hasOverrides: boolean;
  isHidden: boolean;
  effectiveAlign: 'left' | 'center' | 'right';
  wrapperClassName: string;
  wrapperStyle: React.CSSProperties;
  headingStyle: React.CSSProperties;
  bodyStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
  inputClassName: string;
  imageContainerClassName: string;
  imageStyle: React.CSSProperties;
  imageClassName: string;
  containerStyle: React.CSSProperties;
  containerClassName: string;
  buttonStyle: React.CSSProperties;
  buttonClassName: string;
  errorColor: string;
  accentColor: string;
}

// ============================================================================
// Token Lookup Tables
// ============================================================================

const FONT_FAMILY_CLASS_MAP: Record<string, string> = {
  'DM Sans': 'font-sans',
  'Plus Jakarta Sans': 'font-display',
  Outfit: 'font-display',
  'Playfair Display': 'font-serif',
  'JetBrains Mono': 'font-mono',
  Inter: 'font-sans',
  'Bricolage Grotesque': 'font-display',
};

export function getFontFamilyStack(fontFamily?: string): string {
  switch (fontFamily) {
    case 'DM Sans':
      return "'DM Sans', system-ui, -apple-system, sans-serif";
    case 'Plus Jakarta Sans':
      return "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
    case 'Outfit':
      return "'Outfit', system-ui, -apple-system, sans-serif";
    case 'Playfair Display':
      return "'Playfair Display', Georgia, serif";
    case 'JetBrains Mono':
      return "'JetBrains Mono', ui-monospace, monospace";
    case 'Bricolage Grotesque':
      return "'Bricolage Grotesque', system-ui, sans-serif";
    case 'Inter':
      return "'Inter', system-ui, -apple-system, sans-serif";
    default:
      return "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
  }
}

const RADIUS_CLASS_MAP: Record<string, string> = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-lg',
  lg: 'rounded-2xl',
  full: 'rounded-3xl',
};

const CONTROL_RADIUS_CLASS_MAP: Record<string, string> = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-xl',
  full: 'rounded-full',
};

const RADIUS_PX_MAP: Record<string, string> = {
  none: '0px',
  sm: '4px',
  md: '8px',
  lg: '14px',
  full: '9999px',
};

const CONTAINER_WIDTH_MAP: Record<string, string> = {
  sm: 'max-w-xl',
  md: 'max-w-2xl',
  lg: 'max-w-3xl',
  xl: 'max-w-4xl',
};

const CONTENT_WIDTH_MAP: Record<string, string> = {
  narrow: 'max-w-md',
  standard: 'max-w-xl',
  wide: 'max-w-3xl',
  full: 'max-w-none',
};

const GAP_MAP: Record<string, string> = {
  sm: 'gap-3.5',
  md: 'gap-6',
  lg: 'gap-9',
  compact: 'gap-3.5',
  comfortable: 'gap-6',
  relaxed: 'gap-9',
};

const COLUMN_GAP_MAP: Record<string, string> = {
  sm: 'gap-2.5',
  md: 'gap-4',
  lg: 'gap-6',
};

const INTERNAL_PADDING_MAP: Record<string, string> = {
  sm: 'p-4 sm:p-5',
  md: 'p-5 sm:p-7',
  lg: 'p-6 sm:p-9',
  xl: 'p-8 sm:p-12',
};

const MOBILE_PADDING_MAP: Record<string, string> = {
  sm: 'p-3.5',
  md: 'p-4',
  lg: 'p-5',
  xl: 'p-6',
};

const HEADING_SIZE_MAP: Record<string, string> = {
  sm: 'text-lg sm:text-xl',
  md: 'text-xl sm:text-2xl',
  lg: 'text-2xl sm:text-3xl',
  xl: 'text-3xl sm:text-4xl',
};

const BODY_SIZE_MAP: Record<string, string> = {
  sm: 'text-xs',
  base: 'text-sm',
  lg: 'text-base',
};

const FONT_SIZE_VALUE_MAP: Record<string, string> = {
  xs: '0.75rem',
  sm: '0.875rem',
  base: '0.9375rem',
  lg: '1.125rem',
  xl: '1.375rem',
  '2xl': '1.75rem',
  '3xl': '2.125rem',
};

const FONT_WEIGHT_CLASS_MAP: Record<string, string> = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

const FONT_WEIGHT_VALUE_MAP: Record<string, number> = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

const LINE_HEIGHT_CLASS_MAP: Record<string, string> = {
  tight: 'leading-tight',
  normal: 'leading-normal',
  relaxed: 'leading-relaxed',
};

const LINE_HEIGHT_VALUE_MAP: Record<string, number> = {
  tight: 1.25,
  normal: 1.55,
  relaxed: 1.8,
};

const LETTER_SPACING_CLASS_MAP: Record<string, string> = {
  tight: 'tracking-tight',
  normal: 'tracking-normal',
  wide: 'tracking-wide',
};

const LETTER_SPACING_VALUE_MAP: Record<string, string> = {
  tight: '-0.025em',
  normal: '0em',
  wide: '0.04em',
};

const SHADOW_CLASS_MAP: Record<string, string> = {
  none: 'shadow-none',
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-xl',
  subtle: 'shadow-xs',
  elevated: 'shadow-md',
};

const SHADOW_VALUE_MAP: Record<string, string> = {
  none: 'none',
  sm: '0 1px 3px rgba(11,13,15,0.06), 0 1px 2px rgba(11,13,15,0.04)',
  md: '0 8px 24px -6px rgba(11,13,15,0.10), 0 2px 6px rgba(11,13,15,0.05)',
  lg: '0 20px 44px -14px rgba(11,13,15,0.18), 0 4px 12px rgba(11,13,15,0.06)',
};

const PADDING_TOKEN_MAP: Record<SpacingToken, string> = {
  none: '0px',
  sm: '0.75rem',
  md: '1.125rem',
  lg: '1.5rem',
};

const PADDING_CLASS_MAP: Record<SpacingToken, string> = {
  none: '',
  sm: 'p-2.5',
  md: 'p-4',
  lg: 'p-6',
};

const SPACING_BOTTOM_MAP: Record<string, string> = {
  none: '0px',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.75rem',
};

const BUTTON_PADDING_MAP: Record<string, string> = {
  sm: 'px-4 py-2 text-xs',
  md: 'px-6 py-2.5 text-sm',
  lg: 'px-8 py-3.5 text-sm',
};

// ============================================================================
// WCAG 2.1 Colour & Contrast Accessibility Engine
// ============================================================================

function parseHexColor(hex: string): [number, number, number] | null {
  if (!hex || typeof hex !== 'string') return null;
  const cleaned = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(cleaned)) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return [r, g, b];
  }
  if (/^[0-9a-f]{6}$/i.test(cleaned)) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return [r, g, b];
  }
  return null;
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Returns the WCAG 2.1 contrast ratio (1.0 - 21.0) between two hex colours.
 */
export function getContrastRatio(hexA: string, hexB: string): number {
  const rgbA = parseHexColor(hexA);
  const rgbB = parseHexColor(hexB);
  if (!rgbA || !rgbB) return 7;
  const lumA = relativeLuminance(rgbA);
  const lumB = relativeLuminance(rgbB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

export function isColorDark(hex: string): boolean {
  const rgb = parseHexColor(hex);
  if (!rgb) return false;
  return relativeLuminance(rgb) < 0.32;
}

export function checkDesignContrast(design: FormDesignConfig): ContrastCheckItem[] {
  const surface = design.surfaceColor || '#FFFFFF';
  const bodyText = design.textColor || '#0B0D0F';
  const headingText = design.headingColor || bodyText;
  const buttonBg =
    design.buttonStyle === 'outline' || design.buttonStyle === 'minimal'
      ? surface
      : design.buttonBackgroundColor || design.primaryColor || '#0B0D0F';
  const buttonText =
    design.buttonStyle === 'outline' || design.buttonStyle === 'minimal' || design.buttonStyle === 'soft'
      ? design.buttonTextColor || design.primaryColor || '#0B0D0F'
      : design.buttonTextColor || '#FFFFFF';

  const bodyRatio = getContrastRatio(bodyText, surface);
  const headingRatio = getContrastRatio(headingText, surface);
  const buttonRatio = getContrastRatio(buttonText, buttonBg);

  return [
    {
      id: 'body',
      label: 'Body text on form',
      foreground: bodyText,
      background: surface,
      ratio: bodyRatio,
      passesAA: bodyRatio >= 4.5,
      passesAALarge: bodyRatio >= 3.0,
    },
    {
      id: 'heading',
      label: 'Headings on form',
      foreground: headingText,
      background: surface,
      ratio: headingRatio,
      passesAA: headingRatio >= 4.5,
      passesAALarge: headingRatio >= 3.0,
    },
    {
      id: 'button',
      label: 'Button label contrast',
      foreground: buttonText,
      background: buttonBg,
      ratio: buttonRatio,
      passesAA: buttonRatio >= 4.5,
      passesAALarge: buttonRatio >= 3.0,
    },
  ];
}

// ============================================================================
// Global Design Token Resolution
// ============================================================================

export function resolveDesignTokens(
  design: FormDesignConfig,
  viewport: ViewportMode = 'desktop'
): ResolvedDesignTokens {
  const deviceOverride = design.responsive?.[viewport];

  const primary = design.primaryColor || '#0F766E';
  const secondary = design.secondaryColor || '#5C6066';
  const accent = design.accentColor || primary;
  const bg = design.backgroundColor || '#F7F6F3';
  const surface = design.surfaceColor || '#FFFFFF';
  const text = design.textColor || '#0B0D0F';
  const heading = design.headingColor || text;
  const darkSurface = isColorDark(surface);
  const border = design.borderColor || (darkSurface ? 'rgba(255,255,255,0.12)' : '#E5E2DC');
  const inputBg =
    design.inputBackgroundColor ||
    (design.inputStyle === 'filled'
      ? darkSurface
        ? 'rgba(255,255,255,0.08)'
        : '#F2F0EC'
      : design.inputStyle === 'underlined'
      ? 'transparent'
      : darkSurface
      ? 'rgba(255,255,255,0.05)'
      : '#FAF9F7');
  const inputBorder =
    design.inputBorderColor || (darkSurface ? 'rgba(255,255,255,0.18)' : '#D6D3CD');
  const inputText = design.inputTextColor || text;
  const inputPlaceholder =
    design.inputPlaceholderColor || (darkSurface ? 'rgba(255,255,255,0.45)' : '#787C82');

  const buttonBg = design.buttonBackgroundColor || primary;
  const buttonText =
    design.buttonTextColor ||
    (isColorDark(buttonBg) ? '#FFFFFF' : '#0B0D0F');
  const buttonBorder = design.buttonBorderColor || buttonBg;
  const buttonHover = design.buttonHoverColor || buttonBg;
  const buttonActive = design.buttonActiveColor || buttonHover;
  const errorColor = design.errorColor || '#DC2626';
  const successColor = design.successColor || '#0F766E';

  const fontFamilyClass = FONT_FAMILY_CLASS_MAP[design.fontFamily] || 'font-sans';
  const fontFamilyValue = getFontFamilyStack(design.fontFamily);
  const borderRadiusClass = RADIUS_CLASS_MAP[design.borderRadius || 'lg'] || 'rounded-2xl';
  const controlRadiusClass = CONTROL_RADIUS_CLASS_MAP[design.borderRadius || 'lg'] || 'rounded-xl';
  const borderRadiusPx = RADIUS_PX_MAP[design.borderRadius || 'lg'] || '14px';

  // Typography (with device overrides)
  const headingSizeKey =
    deviceOverride?.headingSize ||
    design.headingSize ||
    (design.fontSizeScale === 'compact' ? 'md' : design.fontSizeScale === 'large' ? 'xl' : 'lg');
  const bodySizeKey =
    deviceOverride?.bodySize ||
    design.bodySize ||
    (design.fontSizeScale === 'compact' ? 'sm' : design.fontSizeScale === 'large' ? 'lg' : 'base');
  const textAlignKey = deviceOverride?.textAlign || design.textAlign || 'left';
  const fontWeightKey = design.fontWeight || 'normal';
  const lineHeightKey = design.lineHeight || 'normal';
  const letterSpacingKey = design.letterSpacing || 'normal';

  const headingSizeClass = HEADING_SIZE_MAP[headingSizeKey] || HEADING_SIZE_MAP.lg;
  const bodySizeClass = BODY_SIZE_MAP[bodySizeKey] || BODY_SIZE_MAP.base;
  const fontWeightClass = FONT_WEIGHT_CLASS_MAP[fontWeightKey] || 'font-normal';
  const lineHeightClass = LINE_HEIGHT_CLASS_MAP[lineHeightKey] || 'leading-normal';
  const letterSpacingClass = LETTER_SPACING_CLASS_MAP[letterSpacingKey] || 'tracking-normal';
  const textAlignClass =
    textAlignKey === 'center'
      ? 'text-center'
      : textAlignKey === 'right'
      ? 'text-right'
      : 'text-left';

  // Layout (with device overrides)
  const internalPaddingKey = deviceOverride?.internalPadding || design.internalPadding || 'lg';
  const internalPaddingClass =
    viewport === 'mobile'
      ? MOBILE_PADDING_MAP[internalPaddingKey] || MOBILE_PADDING_MAP.md
      : INTERNAL_PADDING_MAP[internalPaddingKey] || INTERNAL_PADDING_MAP.lg;

  const componentSpacingKey =
    deviceOverride?.componentSpacing || design.componentSpacing || design.spacingScale || 'comfortable';
  const sectionSpacingKey = design.sectionSpacing || design.spacingScale || 'comfortable';
  const sectionGapClass = GAP_MAP[sectionSpacingKey] || 'gap-6';
  const componentGapClass = GAP_MAP[componentSpacingKey] || 'gap-6';
  const columnGapClass = COLUMN_GAP_MAP[design.columnGap || 'md'] || 'gap-4';

  const containerMaxWidthClass =
    viewport === 'mobile'
      ? 'max-w-[390px]'
      : viewport === 'tablet'
      ? 'max-w-[740px]'
      : CONTAINER_WIDTH_MAP[design.containerMaxWidth || 'md'] || 'max-w-2xl';

  const contentMaxWidthClass = CONTENT_WIDTH_MAP[design.contentMaxWidth || 'full'] || 'max-w-none';

  const pageAlignmentClass =
    design.pageAlignment === 'left'
      ? 'mr-auto'
      : design.pageAlignment === 'right'
      ? 'ml-auto'
      : 'mx-auto';

  // Background & Overlay
  let backgroundStyle: React.CSSProperties = {
    backgroundColor: bg,
    fontFamily: fontFamilyValue,
  };
  let backgroundImageUrl: string | undefined;
  let backgroundImageStyle: React.CSSProperties | undefined;
  let backgroundOverlayStyle: React.CSSProperties | undefined;

  if (design.backgroundStyle === 'subtle-grid') {
    const dotColor = isColorDark(bg) ? 'rgba(255,255,255,0.10)' : 'rgba(11,13,15,0.08)';
    backgroundStyle = {
      backgroundColor: bg,
      backgroundImage: `radial-gradient(${dotColor} 1px, transparent 1px)`,
      backgroundSize: '20px 20px',
      fontFamily: fontFamilyValue,
    };
  } else if (design.backgroundStyle === 'dots') {
    const dotColor = isColorDark(bg) ? 'rgba(255,255,255,0.14)' : 'rgba(11,13,15,0.12)';
    backgroundStyle = {
      backgroundColor: bg,
      backgroundImage: `radial-gradient(${dotColor} 1.5px, transparent 1.5px)`,
      backgroundSize: '16px 16px',
      fontFamily: fontFamilyValue,
    };
  } else if (design.backgroundStyle === 'gradient') {
    const from = design.gradientFrom || bg;
    const to = design.gradientTo || `${primary}24`;
    const dir = design.gradientDirection || 'to-bottom';
    const gradientValue =
      dir === 'radial'
        ? `radial-gradient(circle at top center, ${from} 0%, ${to} 100%)`
        : dir === 'to-right'
        ? `linear-gradient(90deg, ${from} 0%, ${to} 100%)`
        : dir === 'to-bottom-right'
        ? `linear-gradient(135deg, ${from} 0%, ${to} 100%)`
        : `linear-gradient(180deg, ${from} 0%, ${to} 100%)`;
    backgroundStyle = {
      backgroundColor: bg,
      backgroundImage: gradientValue,
      fontFamily: fontFamilyValue,
    };
  } else if (design.backgroundStyle === 'mesh') {
    backgroundStyle = {
      backgroundColor: bg,
      backgroundImage: `radial-gradient(at 0% 0%, ${primary}22 0px, transparent 52%), radial-gradient(at 100% 100%, ${accent}1F 0px, transparent 52%)`,
      fontFamily: fontFamilyValue,
    };
  } else if (design.backgroundStyle === 'image' && design.backgroundImageUrl?.trim()) {
    backgroundImageUrl = design.backgroundImageUrl.trim();
    const objectPos = design.backgroundPosition || 'center';
    const fit = design.backgroundSize === 'contain' ? 'contain' : design.backgroundSize === 'auto' ? 'none' : 'cover';
    backgroundImageStyle = {
      objectFit: fit,
      objectPosition: objectPos,
    };
    const overlayOpacity =
      typeof design.backgroundOverlayOpacity === 'number'
        ? Math.max(0, Math.min(0.85, design.backgroundOverlayOpacity))
        : 0.35;
    if (overlayOpacity > 0) {
      backgroundOverlayStyle = {
        backgroundColor: design.backgroundOverlayColor || '#0B0D0F',
        opacity: overlayOpacity,
      };
    }
  }

  // Borders & Card Container Style
  const borderWidthNum = Number(design.borderWidth ?? '1');
  const containerStyleMode = design.containerStyle || 'elevated';
  const cardShadowKey =
    containerStyleMode === 'flat'
      ? 'none'
      : design.cardShadow || (containerStyleMode === 'elevated' ? 'sm' : 'none');
  const cardShadowClass = SHADOW_CLASS_MAP[cardShadowKey] || 'shadow-sm';

  const surfaceStyle: React.CSSProperties = {
    backgroundColor:
      containerStyleMode === 'soft'
        ? darkSurface
          ? 'rgba(255,255,255,0.06)'
          : '#FAF9F7'
        : surface,
    color: text,
    fontFamily: fontFamilyValue,
    borderColor: border,
    borderWidth: borderWidthNum > 0 ? `${borderWidthNum}px` : '0px',
    borderStyle: borderWidthNum > 0 ? 'solid' : 'none',
    boxShadow: SHADOW_VALUE_MAP[cardShadowKey] || 'none',
    lineHeight: LINE_HEIGHT_VALUE_MAP[lineHeightKey],
    letterSpacing: LETTER_SPACING_VALUE_MAP[letterSpacingKey],
    textAlign: textAlignKey,
  };

  // Input Global Style
  const inputMode = design.inputStyle || 'bordered';
  const inputStyle: React.CSSProperties = {
    backgroundColor: inputMode === 'underlined' ? 'transparent' : inputBg,
    color: inputText,
    borderColor: inputBorder,
    borderWidth: inputMode === 'underlined' ? '0px 0px 2px 0px' : inputMode === 'filled' ? '1px' : '1px',
    borderStyle: 'solid',
    borderRadius: inputMode === 'underlined' ? '0px' : undefined,
    fontFamily: fontFamilyValue,
  };
  const inputClassName = `studio-input w-full px-3.5 py-2.5 ${bodySizeClass} ${
    inputMode === 'underlined' ? 'rounded-none px-1' : controlRadiusClass
  }`;

  // Button Global Style
  const btnRadiusClass =
    CONTROL_RADIUS_CLASS_MAP[design.buttonRadius || design.borderRadius || 'lg'] || 'rounded-xl';
  const btnShadowClass = SHADOW_CLASS_MAP[design.buttonShadow || 'subtle'] || 'shadow-xs';
  const btnPaddingClass = BUTTON_PADDING_MAP[design.buttonPadding || 'md'] || BUTTON_PADDING_MAP.md;
  const btnVariant = design.buttonStyle || 'solid';

  let resolvedBtnBg = buttonBg;
  let resolvedBtnText = buttonText;
  let resolvedBtnBorder = `1px solid ${buttonBorder}`;

  if (btnVariant === 'outline') {
    resolvedBtnBg = 'transparent';
    resolvedBtnText = design.buttonTextColor || primary;
    resolvedBtnBorder = `1.5px solid ${design.buttonBorderColor || primary}`;
  } else if (btnVariant === 'soft') {
    resolvedBtnBg = `${buttonBg}18`;
    resolvedBtnText = design.buttonTextColor || primary;
    resolvedBtnBorder = '1px solid transparent';
  } else if (btnVariant === 'minimal') {
    resolvedBtnBg = 'transparent';
    resolvedBtnText = design.buttonTextColor || primary;
    resolvedBtnBorder = '1px solid transparent';
  }

  const buttonClass = `${btnRadiusClass} ${btnShadowClass}`;
  const buttonClassName = `studio-btn inline-flex items-center justify-center gap-2 font-semibold ${btnPaddingClass} ${btnRadiusClass} ${btnShadowClass} ${
    design.buttonFullWidth ? 'w-full' : ''
  }`;

  const buttonStyle: React.CSSProperties = {
    backgroundColor: resolvedBtnBg,
    color: resolvedBtnText,
    border: resolvedBtnBorder,
    fontFamily: fontFamilyValue,
    ['--studio-btn-bg' as string]: resolvedBtnBg,
    ['--studio-btn-hover' as string]:
      btnVariant === 'solid' ? buttonHover : `${buttonBg}26`,
    ['--studio-btn-active' as string]:
      btnVariant === 'solid' ? buttonActive : `${buttonBg}36`,
  };

  const headingStyle: React.CSSProperties = {
    color: heading,
    fontFamily: fontFamilyValue,
    letterSpacing: LETTER_SPACING_VALUE_MAP[letterSpacingKey],
    textAlign: textAlignKey,
  };

  const bodyStyle: React.CSSProperties = {
    color: text,
    fontFamily: fontFamilyValue,
    fontWeight: FONT_WEIGHT_VALUE_MAP[fontWeightKey],
    lineHeight: LINE_HEIGHT_VALUE_MAP[lineHeightKey],
    letterSpacing: LETTER_SPACING_VALUE_MAP[letterSpacingKey],
    textAlign: textAlignKey,
  };

  const cssVariables: Record<string, string> = {
    '--studio-primary': primary,
    '--studio-secondary': secondary,
    '--studio-accent': accent,
    '--studio-bg': bg,
    '--studio-surface': surface,
    '--studio-text': text,
    '--studio-heading': heading,
    '--studio-border': border,
    '--studio-input-bg': inputBg,
    '--studio-input-border': inputBorder,
    '--studio-input-text': inputText,
    '--studio-input-placeholder': inputPlaceholder,
    '--studio-input-focus': primary,
    '--studio-btn-bg': resolvedBtnBg,
    '--studio-btn-text': resolvedBtnText,
    '--studio-btn-hover': buttonHover,
    '--studio-btn-active': buttonActive,
    '--studio-error': errorColor,
    '--studio-success': successColor,
    '--studio-radius': borderRadiusPx,
  };

  return {
    fontFamilyClass,
    fontFamilyValue,
    borderRadiusClass,
    borderRadiusPx,
    buttonClass,
    containerMaxWidthClass,
    contentMaxWidthClass,
    pageAlignmentClass,
    sectionGapClass,
    componentGapClass,
    columnGapClass,
    internalPaddingClass,
    headingSizeClass,
    bodySizeClass,
    fontWeightClass,
    lineHeightClass,
    letterSpacingClass,
    textAlignClass,
    cardShadowClass,
    backgroundStyle,
    backgroundImageUrl,
    backgroundImageStyle,
    backgroundOverlayStyle,
    surfaceStyle,
    headingStyle,
    bodyStyle,
    inputStyle,
    inputClassName,
    buttonStyle,
    buttonClassName,
    colors: {
      primary,
      secondary,
      accent,
      background: bg,
      surface,
      text,
      heading,
      inputBg,
      inputBorder,
      inputText,
      inputPlaceholder,
      buttonBg,
      buttonText,
      buttonBorder,
      buttonHover,
      buttonActive,
      border,
      error: errorColor,
      success: successColor,
    },
    cssVariables,
  };
}

// ============================================================================
// Component-Level Styling & Override Resolution
// ============================================================================

const APPEARANCE_OVERRIDE_KEYS: (keyof ComponentAppearanceProps)[] = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textColor',
  'accentColor',
  'spacingBottom',
  'backgroundColor',
  'borderColor',
  'borderWidth',
  'borderRadius',
  'shadow',
  'inputBackgroundColor',
  'inputBorderColor',
  'inputTextColor',
  'inputPlaceholderColor',
  'inputFocusColor',
  'inputErrorColor',
  'inputRadius',
  'imageWidth',
  'imageHeight',
  'aspectRatio',
  'objectFit',
  'objectPosition',
  'imageAlignment',
  'buttonBackgroundColor',
  'buttonTextColor',
  'buttonBorderColor',
  'buttonHoverColor',
  'buttonActiveColor',
  'buttonRadius',
  'buttonPadding',
  'buttonFullWidth',
];

export function hasComponentStyleOverrides(node: FormComponentNode): boolean {
  const a = node.appearance || {};
  if (a.textAlign && a.textAlign !== 'left') return true;
  for (const key of APPEARANCE_OVERRIDE_KEYS) {
    if (a[key] !== undefined && a[key] !== '') return true;
  }
  return false;
}

export function resolveComponentTokens(
  node: FormComponentNode,
  design: FormDesignConfig,
  viewport: ViewportMode = 'desktop'
): ResolvedComponentTokens {
  const globalTokens = resolveDesignTokens(design, viewport);
  const a = node.appearance || {};
  const deviceLayout = node.layout.responsive?.[viewport];

  const isHidden = Boolean(deviceLayout?.hidden);
  const effectiveAlign =
    deviceLayout?.textAlign || a.textAlign || design.responsive?.[viewport]?.textAlign || design.textAlign || 'left';
  const effectivePadding = deviceLayout?.padding || node.layout.padding;
  const fontStack = a.fontFamily ? getFontFamilyStack(a.fontFamily) : globalTokens.fontFamilyValue;

  const wrapperStyle: React.CSSProperties = {
    fontFamily: fontStack,
    textAlign: effectiveAlign,
    marginBottom: a.spacingBottom ? SPACING_BOTTOM_MAP[a.spacingBottom] : undefined,
    padding: effectivePadding && effectivePadding !== 'none' ? PADDING_TOKEN_MAP[effectivePadding] : undefined,
    backgroundColor: a.backgroundColor || undefined,
    borderColor: a.borderColor || undefined,
    borderWidth: a.borderWidth ? `${a.borderWidth}px` : undefined,
    borderStyle: a.borderWidth && a.borderWidth !== '0' ? 'solid' : undefined,
    boxShadow: a.shadow ? SHADOW_VALUE_MAP[a.shadow] : undefined,
  };

  const wrapperRadiusClass = a.borderRadius ? RADIUS_CLASS_MAP[a.borderRadius] : '';
  const wrapperAlignClass =
    effectiveAlign === 'center'
      ? 'text-center'
      : effectiveAlign === 'right'
      ? 'text-right'
      : 'text-left';

  // Heading & Text style overrides
  const headingStyle: React.CSSProperties = {
    ...globalTokens.headingStyle,
    fontFamily: fontStack,
    color: a.textColor || globalTokens.colors.heading,
    fontSize: a.fontSize ? FONT_SIZE_VALUE_MAP[a.fontSize] : undefined,
    fontWeight: a.fontWeight ? FONT_WEIGHT_VALUE_MAP[a.fontWeight] : undefined,
    lineHeight: a.lineHeight ? LINE_HEIGHT_VALUE_MAP[a.lineHeight] : undefined,
    letterSpacing: a.letterSpacing ? LETTER_SPACING_VALUE_MAP[a.letterSpacing] : globalTokens.headingStyle.letterSpacing,
    textAlign: effectiveAlign,
  };

  const bodyStyle: React.CSSProperties = {
    ...globalTokens.bodyStyle,
    fontFamily: fontStack,
    color: a.textColor || globalTokens.colors.text,
    fontSize: a.fontSize ? FONT_SIZE_VALUE_MAP[a.fontSize] : undefined,
    fontWeight: a.fontWeight ? FONT_WEIGHT_VALUE_MAP[a.fontWeight] : globalTokens.bodyStyle.fontWeight,
    lineHeight: a.lineHeight ? LINE_HEIGHT_VALUE_MAP[a.lineHeight] : globalTokens.bodyStyle.lineHeight,
    letterSpacing: a.letterSpacing ? LETTER_SPACING_VALUE_MAP[a.letterSpacing] : globalTokens.bodyStyle.letterSpacing,
    textAlign: effectiveAlign,
  };

  // Input style overrides
  const effectiveInputError = a.inputErrorColor || globalTokens.colors.error;
  const effectiveInputFocus = a.inputFocusColor || a.accentColor || globalTokens.colors.primary;
  const effectiveInputPlaceholder = a.inputPlaceholderColor || globalTokens.colors.inputPlaceholder;
  const inputRadiusClass =
    design.inputStyle === 'underlined'
      ? 'rounded-none px-1'
      : CONTROL_RADIUS_CLASS_MAP[a.inputRadius || a.borderRadius || design.borderRadius || 'lg'] || 'rounded-xl';

  const inputStyle: React.CSSProperties = {
    ...globalTokens.inputStyle,
    fontFamily: fontStack,
    backgroundColor: a.inputBackgroundColor || globalTokens.inputStyle.backgroundColor,
    borderColor: a.inputBorderColor || globalTokens.inputStyle.borderColor,
    color: a.inputTextColor || globalTokens.inputStyle.color,
    ['--studio-input-focus' as string]: effectiveInputFocus,
    ['--studio-input-placeholder' as string]: effectiveInputPlaceholder,
    ['--studio-error' as string]: effectiveInputError,
  };

  const inputClassName = `studio-input w-full px-3.5 py-2.5 ${globalTokens.bodySizeClass} ${inputRadiusClass}`;

  // Image style overrides
  const imgWidthClass =
    a.imageWidth === '1/2'
      ? 'w-full sm:w-1/2'
      : a.imageWidth === '3/4'
      ? 'w-full sm:w-3/4'
      : a.imageWidth === 'auto'
      ? 'w-auto max-w-full'
      : 'w-full';

  const imgHeightClass =
    a.imageHeight === 'sm'
      ? 'h-40'
      : a.imageHeight === 'md'
      ? 'h-60'
      : a.imageHeight === 'lg'
      ? 'h-80'
      : '';

  const imgAspectStyle: React.CSSProperties =
    a.aspectRatio && a.aspectRatio !== 'auto'
      ? { aspectRatio: a.aspectRatio }
      : {};

  const imgAlignClass =
    a.imageAlignment === 'center'
      ? 'mx-auto'
      : a.imageAlignment === 'right'
      ? 'ml-auto'
      : 'mr-auto';

  const imgRadiusClass =
    RADIUS_CLASS_MAP[a.borderRadius || design.borderRadius || 'lg'] || 'rounded-xl';

  const imageStyle: React.CSSProperties = {
    ...imgAspectStyle,
    objectFit: a.objectFit || 'cover',
    objectPosition: a.objectPosition || 'center',
  };

  const imageClassName = `block max-w-full ${imgWidthClass} ${imgHeightClass} ${imgAlignClass} ${imgRadiusClass} ${
    !a.imageHeight && (!a.aspectRatio || a.aspectRatio === 'auto') ? 'max-h-80' : ''
  }`;

  // Container / Section style overrides
  const containerRadiusClass =
    RADIUS_CLASS_MAP[a.borderRadius || design.borderRadius || 'lg'] || 'rounded-xl';
  const containerBorderWidth = a.borderWidth !== undefined ? `${a.borderWidth}px` : '1px';
  const containerStyle: React.CSSProperties = {
    backgroundColor:
      a.backgroundColor ||
      (isColorDark(globalTokens.colors.surface) ? 'rgba(255,255,255,0.03)' : 'rgba(11,13,15,0.018)'),
    borderColor: a.borderColor || globalTokens.colors.border,
    borderWidth: containerBorderWidth,
    borderStyle: containerBorderWidth === '0px' ? 'none' : 'solid',
    boxShadow: a.shadow ? SHADOW_VALUE_MAP[a.shadow] : undefined,
    padding: effectivePadding && effectivePadding !== 'none' ? PADDING_TOKEN_MAP[effectivePadding] : undefined,
    fontFamily: fontStack,
    textAlign: effectiveAlign,
  };

  // Button style overrides
  const btnBg = a.buttonBackgroundColor || globalTokens.colors.buttonBg;
  const btnText = a.buttonTextColor || globalTokens.colors.buttonText;
  const btnBorder = a.buttonBorderColor || globalTokens.colors.buttonBorder;
  const btnHover = a.buttonHoverColor || globalTokens.colors.buttonHover;
  const btnActive = a.buttonActiveColor || globalTokens.colors.buttonActive;
  const btnRadiusClass =
    CONTROL_RADIUS_CLASS_MAP[a.buttonRadius || design.buttonRadius || design.borderRadius || 'lg'] ||
    'rounded-xl';
  const btnPaddingClass = BUTTON_PADDING_MAP[a.buttonPadding || design.buttonPadding || 'md'];
  const btnFullWidth = a.buttonFullWidth ?? design.buttonFullWidth ?? false;

  const buttonStyle: React.CSSProperties = {
    ...globalTokens.buttonStyle,
    backgroundColor: btnBg,
    color: btnText,
    border: `1px solid ${btnBorder}`,
    ['--studio-btn-bg' as string]: btnBg,
    ['--studio-btn-hover' as string]: btnHover,
    ['--studio-btn-active' as string]: btnActive,
  };

  const buttonClassName = `studio-btn inline-flex items-center justify-center gap-2 font-semibold ${btnPaddingClass} ${btnRadiusClass} ${
    btnFullWidth ? 'w-full' : ''
  }`;

  return {
    hasOverrides: hasComponentStyleOverrides(node),
    isHidden,
    effectiveAlign,
    wrapperClassName: [wrapperAlignClass, wrapperRadiusClass, a.customClassName || '']
      .filter(Boolean)
      .join(' '),
    wrapperStyle,
    headingStyle,
    bodyStyle,
    inputStyle,
    inputClassName,
    imageContainerClassName:
      a.imageAlignment === 'center'
        ? 'flex flex-col items-center'
        : a.imageAlignment === 'right'
        ? 'flex flex-col items-end'
        : 'flex flex-col items-start',
    imageStyle,
    imageClassName,
    containerStyle,
    containerClassName: `${containerRadiusClass} ${
      effectivePadding && effectivePadding !== 'none' ? '' : 'p-4 sm:p-5'
    }`,
    buttonStyle,
    buttonClassName,
    errorColor: effectiveInputError,
    accentColor: a.accentColor || globalTokens.colors.primary,
  };
}

// ============================================================================
// Responsive Grid & Column Helpers
// ============================================================================

/**
 * Resolves the effective number of columns for a layout container at a given viewport.
 * Automatically collapses multi-column containers cleanly on tablet/mobile unless overridden.
 */
export function resolveContainerColumns(
  node: FormComponentNode,
  viewport: ViewportMode = 'desktop'
): 1 | 2 | 3 {
  const baseCols =
    node.layout.columns ||
    (node.type === 'three_column' ? 3 : node.type === 'two_column' ? 2 : 1);

  const deviceOverride = node.layout.responsive?.[viewport]?.columns;
  if (deviceOverride) return deviceOverride;

  if (viewport === 'mobile') return 1;
  if (viewport === 'tablet' && baseCols === 3) return 2;
  return baseCols;
}

/**
 * Resolves a component's width & responsive grid column span classes
 * inside a 12-column responsive CSS grid.
 * When `viewportOverride` is provided (e.g. Editor Canvas or Preview Modal),
 * applies exact device spans & visibility so Desktop/Tablet/Mobile previews are 100% accurate.
 */
export function resolveComponentGridClass(
  layout: ComponentLayoutProps,
  viewportOverride?: ViewportMode
): string {
  if (viewportOverride) {
    const device = layout.responsive?.[viewportOverride];
    if (device?.hidden) return 'hidden';

    const effectiveWidth =
      device?.width || (viewportOverride === 'mobile' ? 'full' : layout.width || 'full');

    const spanClass =
      viewportOverride === 'mobile'
        ? effectiveWidth === 'half'
          ? 'col-span-6'
          : 'col-span-12'
        : effectiveWidth === 'third'
        ? viewportOverride === 'tablet'
          ? 'col-span-6'
          : 'col-span-4'
        : effectiveWidth === 'half'
        ? 'col-span-6'
        : 'col-span-12';

    const paddingClass = device?.padding
      ? PADDING_CLASS_MAP[device.padding]
      : layout.padding
      ? PADDING_CLASS_MAP[layout.padding]
      : '';

    return [spanClass, paddingClass].filter(Boolean).join(' ');
  }

  const baseWidth = layout.width || 'full';
  const tabletWidth = layout.responsive?.tablet?.width || baseWidth;
  const desktopWidth = layout.responsive?.desktop?.width || baseWidth;

  const tabletSpan =
    tabletWidth === 'third'
      ? 'sm:col-span-6'
      : tabletWidth === 'half'
      ? 'sm:col-span-6'
      : 'sm:col-span-12';

  const desktopSpan =
    desktopWidth === 'third'
      ? 'lg:col-span-4'
      : desktopWidth === 'half'
      ? 'lg:col-span-6'
      : 'lg:col-span-12';

  const mobileHidden = layout.responsive?.mobile?.hidden ? 'hidden sm:block' : '';
  const tabletHidden = layout.responsive?.tablet?.hidden ? 'sm:hidden lg:block' : '';
  const desktopHidden = layout.responsive?.desktop?.hidden ? 'lg:hidden' : '';
  const paddingClass = layout.padding ? PADDING_CLASS_MAP[layout.padding] : '';

  return ['col-span-12', tabletSpan, desktopSpan, mobileHidden, tabletHidden, desktopHidden, paddingClass]
    .filter(Boolean)
    .join(' ');
}

export function resolveComponentAppearanceClasses(appearance: ComponentAppearanceProps): string {
  const alignClass =
    appearance.textAlign === 'center'
      ? 'text-center'
      : appearance.textAlign === 'right'
      ? 'text-right'
      : 'text-left';

  const radiusClass = appearance.borderRadius ? RADIUS_CLASS_MAP[appearance.borderRadius] : '';

  return [alignClass, radiusClass, appearance.customClassName || ''].filter(Boolean).join(' ');
}
