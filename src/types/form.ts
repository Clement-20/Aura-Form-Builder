/**
 * Core type definitions for AuraForm SaaS Form Builder
 */

export type FormLayoutMode = 'standard' | 'conversational' | 'stepped';

export type FormCategory = 
  | 'survey' 
  | 'quiz' 
  | 'registration' 
  | 'lead-gen' 
  | 'feedback' 
  | 'application';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'phone'
  | 'number'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'rating'
  | 'scale'
  | 'date'
  | 'url'
  | 'statement';

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  options?: string[]; // For select, radio, checkbox
  step?: number; // 1-based page index for stepped layouts
  min?: number;
  max?: number;
  // Quiz specific attributes
  points?: number;
  correctAnswer?: string | string[];
}

export interface FormStep {
  id: string;
  stepNumber: number;
  title: string;
  description?: string;
}

export type LogicCondition =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'is_empty'
  | 'is_not_empty';

export type LogicAction = 'show' | 'hide' | 'jump_to_step' | 'require';

export interface LogicRule {
  id: string;
  title?: string;
  sourceFieldId: string;
  condition: LogicCondition;
  value: string;
  action: LogicAction;
  targetFieldId?: string;
  targetStep?: number;
}

export type AnimationPreset = 'slide-vertical' | 'slide-horizontal' | 'fade-scale' | 'smooth-reveal' | 'none';
export type TransitionSpeed = 'snappy' | 'normal' | 'gentle';

export interface FormTheme {
  // Colours
  primaryColor: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  headingColor?: string;
  inputBackgroundColor?: string;
  inputBorderColor?: string;
  inputTextColor?: string;
  inputPlaceholderColor?: string;
  buttonBackgroundColor?: string;
  buttonTextColor?: string;
  buttonBorderColor?: string;
  buttonHoverColor?: string;
  buttonActiveColor?: string;
  errorColor?: string;
  successColor?: string;

  // Typography
  fontFamily:
    | 'DM Sans'
    | 'Plus Jakarta Sans'
    | 'Outfit'
    | 'Playfair Display'
    | 'JetBrains Mono'
    | 'Inter'
    | 'Bricolage Grotesque';
  fontSizeScale?: 'compact' | 'normal' | 'large';
  headingSize?: 'sm' | 'md' | 'lg' | 'xl';
  bodySize?: 'sm' | 'base' | 'lg';
  fontWeight?: 'normal' | 'medium' | 'semibold' | 'bold';
  lineHeight?: 'tight' | 'normal' | 'relaxed';
  letterSpacing?: 'tight' | 'normal' | 'wide';
  textAlign?: 'left' | 'center' | 'right';

  // Layout
  containerMaxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  contentMaxWidth?: 'narrow' | 'standard' | 'wide' | 'full';
  pageAlignment?: 'left' | 'center' | 'right';
  spacingScale?: 'compact' | 'comfortable' | 'relaxed';
  sectionSpacing?: 'sm' | 'md' | 'lg';
  componentSpacing?: 'sm' | 'md' | 'lg';
  internalPadding?: 'sm' | 'md' | 'lg' | 'xl';
  columnGap?: 'sm' | 'md' | 'lg';

  // Background
  backgroundStyle: 'solid' | 'subtle-grid' | 'gradient' | 'mesh' | 'dots' | 'image';
  gradientFrom?: string;
  gradientTo?: string;
  gradientDirection?: 'to-bottom' | 'to-right' | 'to-bottom-right' | 'radial';
  backgroundImageUrl?: string;
  backgroundPosition?: 'center' | 'top' | 'bottom' | 'left' | 'right';
  backgroundSize?: 'cover' | 'contain' | 'auto';
  backgroundOverlayColor?: string;
  backgroundOverlayOpacity?: number; // 0 - 0.85

  // Borders & Effects
  borderColor?: string;
  borderWidth?: '0' | '1' | '2';
  borderRadius: 'none' | 'sm' | 'md' | 'lg' | 'full';
  cardShadow?: 'none' | 'sm' | 'md' | 'lg';
  containerStyle?: 'flat' | 'elevated' | 'outlined' | 'soft';
  inputStyle: 'bordered' | 'filled' | 'underlined';
  buttonStyle?: 'solid' | 'soft' | 'outline' | 'minimal';
  buttonRadius?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  buttonShadow?: 'none' | 'subtle' | 'elevated';
  buttonPadding?: 'sm' | 'md' | 'lg';
  buttonFullWidth?: boolean;

  // Motion & Completion
  animationPreset?: AnimationPreset;
  transitionSpeed?: TransitionSpeed;
  animationIntro?: 'fade-in' | 'slide-up' | 'zoom-in' | 'none';
  animationOutro?: 'fade-out' | 'zoom-out' | 'slide-down' | 'confetti' | 'none';
  animationDuration?: number; // ms
  animationDelay?: number; // ms
  animationEasing?: 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring';
  respectReducedMotion?: boolean;
  videoBackgroundUrl?: string;
  enableConfetti?: boolean;
  /** Structured Phase 3.3 animation and transition configuration */
  motion?: FormMotionConfig;
}

export const MOTION_SCHEMA_VERSION = 1 as const;

export type AnimationPresetType =
  | 'none'
  | 'fade_in'
  | 'fade_out'
  | 'slide_in'
  | 'slide_out'
  | 'scale_in'
  | 'scale_out'
  | 'subtle_zoom'
  | 'reveal'
  | 'stagger';

export type AnimationDirection = 'auto' | 'up' | 'down' | 'left' | 'right';

export type AnimationEasing = 'ease' | 'ease-out' | 'ease-in-out' | 'spring' | 'linear';

export type AnimationTrigger =
  | 'on_page_load'
  | 'on_viewport_enter'
  | 'on_conditional_show'
  | 'on_page_change'
  | 'on_conditional_result';

export type ProgressTransitionStyle = 'smooth' | 'spring' | 'linear' | 'none';

export interface ComponentAnimationConfig {
  /** 'inherit' follows form defaults; 'custom' uses local settings; 'disabled' turns off animation on this component */
  mode?: 'inherit' | 'custom' | 'disabled';
  preset?: AnimationPresetType;
  durationMs?: number;
  delayMs?: number;
  direction?: AnimationDirection;
  easing?: AnimationEasing;
  trigger?: Exclude<AnimationTrigger, 'on_conditional_result'>;
  staggerIntervalMs?: number;
}

export interface PageTransitionConfig {
  enabled: boolean;
  enterPreset: Exclude<AnimationPresetType, 'fade_out' | 'slide_out' | 'scale_out' | 'stagger'>;
  exitPreset: 'none' | 'fade_out' | 'slide_out' | 'scale_out';
  durationMs: number;
  easing: AnimationEasing;
  direction: AnimationDirection;
}

export interface ConditionalRevealAnimationConfig {
  enabled: boolean;
  preset: Exclude<AnimationPresetType, 'fade_out' | 'slide_out' | 'scale_out' | 'stagger'>;
  durationMs: number;
  direction: AnimationDirection;
  easing: AnimationEasing;
}

export interface ResultScreenAnimationConfig {
  enabled: boolean;
  preset: Exclude<AnimationPresetType, 'fade_out' | 'slide_out' | 'scale_out' | 'stagger'>;
  durationMs: number;
  direction: AnimationDirection;
  easing: AnimationEasing;
}

export interface ProgressTransitionConfig {
  style: ProgressTransitionStyle;
  durationMs: number;
}

export interface FormMotionConfig {
  schemaVersion: typeof MOTION_SCHEMA_VERSION;
  /** Master toggle to enable or disable all form animations globally */
  enabled: boolean;
  /** Honors OS prefers-reduced-motion: reduce (default true) */
  respectReducedMotion: boolean;
  /** Default entrance animation applied to form components */
  componentPreset: Exclude<AnimationPresetType, 'fade_out' | 'slide_out' | 'scale_out'>;
  durationMs: number;
  delayMs: number;
  direction: AnimationDirection;
  easing: AnimationEasing;
  trigger: Exclude<AnimationTrigger, 'on_conditional_result'>;
  staggerIntervalMs: number;
  /** Page-to-page (stepped) and question-to-question (conversational) transitions */
  pageTransition: PageTransitionConfig;
  /** Animation used when conditional logic reveals a hidden component or message */
  conditionalReveal: ConditionalRevealAnimationConfig;
  /** Animation used when outcome cards, thank-you screens, or conditional results appear */
  resultScreen: ResultScreenAnimationConfig;
  /** Progress bar fill transition style */
  progressTransition: ProgressTransitionConfig;
}

export interface CustomThemePreset {
  id: string;
  name: string;
  description?: string;
  theme: FormTheme;
  isCustom?: boolean;
  createdAt?: string;
}

export interface FormWelcomeScreen {
  enabled: boolean;
  title: string;
  subtitle: string;
  buttonText: string;
  coverImage?: string;
}

export interface FormThankYouScreen {
  title: string;
  message: string;
  showRestartButton: boolean;
  redirectUrl?: string | null;
  showScoreSummary?: boolean; // For quiz
}

export type HiddenFieldPolicy =
  | 'preserve_on_hide_omit_on_submit'
  | 'preserve_always'
  | 'clear_on_hide';

export interface FormSettings {
  isPublished: boolean;
  slug: string;
  submitButtonText: string;
  closeAfterSubmissions?: number | null;
  closeAtDate?: string | null;
  closedMessage?: string;
  allowMultipleSubmissions: boolean;
  isQuizMode: boolean;
  showProgressBar?: boolean;
  hiddenFieldPolicy?: HiddenFieldPolicy;
  webhookUrl?: string;
  notifyOnSubmission: boolean;
  creatorEmail?: string;
}

export interface FormSchema {
  id: string;
  title: string;
  description: string;
  category: FormCategory;
  layoutMode: FormLayoutMode;
  theme: FormTheme;
  welcomeScreen: FormWelcomeScreen;
  thankYouScreen: FormThankYouScreen;
  fields: FormField[];
  steps?: FormStep[];
  logicRules: LogicRule[];
  settings: FormSettings;
  createdAt: string;
  updatedAt: string;
  responsesCount?: number;
}

export interface FormSubmission {
  id: string;
  formId: string;
  submittedAt: string;
  answers: Record<string, any>;
  resolvedVariables?: Record<string, unknown>;
  formattedVariables?: Record<string, string>;
  durationSeconds: number;
  isComplete: boolean;
  score?: number;
  maxScore?: number;
  scorePercent?: number;
  categoryScores?: Record<
    string,
    {
      name: string;
      score: number;
      maxScore: number;
      percent: number;
      thresholdLabel?: string;
    }
  >;
  outcomeId?: string;
  outcomeName?: string;
  deviceInfo?: string;
}

export interface FormAnalytics {
  totalViews: number;
  totalStarts: number;
  totalSubmissions: number;
  completionRate: number; // 0 - 100
  averageDurationSeconds: number;
  dropOffPerField: Record<string, number>;
  dailySubmissions: { date: string; count: number }[];
}

export type PlanTier = 'free' | 'pro' | 'enterprise';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  plan: PlanTier;
  supabaseConnected: boolean;
}
