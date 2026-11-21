/**
 * FlexStore / AuraForm Studio — Form Document Model (v2)
 *
 * Structured, extensible document schema separating:
 *  - Content properties
 *  - Appearance properties
 *  - Layout & responsive properties
 *  - Behaviour properties
 *  - Validation properties
 *  - Pages, sections/containers, global design, settings, logic, and variables
 */

import {
  FieldType,
  FormCategory,
  FormLayoutMode,
  FormSettings,
  FormTheme,
  FormThankYouScreen,
  FormWelcomeScreen,
  MOTION_SCHEMA_VERSION,
  type ComponentAnimationConfig,
  type FormMotionConfig,
  type AnimationPresetType,
  type AnimationDirection,
  type AnimationEasing,
  type AnimationTrigger,
  type ProgressTransitionStyle,
  type PageTransitionConfig,
  type ConditionalRevealAnimationConfig,
  type ResultScreenAnimationConfig,
  type ProgressTransitionConfig,
} from '../../types/form';
export { MOTION_SCHEMA_VERSION };
export type {
  ComponentAnimationConfig,
  FormMotionConfig,
  AnimationPresetType,
  AnimationDirection,
  AnimationEasing,
  AnimationTrigger,
  ProgressTransitionStyle,
  PageTransitionConfig,
  ConditionalRevealAnimationConfig,
  ResultScreenAnimationConfig,
  ProgressTransitionConfig,
};
import { AnyLogicRule, LogicConditionGroup } from '../logic/types';

export const DOCUMENT_SCHEMA_VERSION = 2 as const;

export type QuestionComponentType =
  | FieldType
  | 'yes_no'
  | 'time'
  | 'file_upload';

export type ContentComponentType =
  | 'heading'
  | 'paragraph'
  | 'rich_text'
  | 'custom_html'
  | 'image'
  | 'video'
  | 'button_link'
  | 'divider'
  | 'spacer';

export type LayoutComponentType =
  | 'section'
  | 'container'
  | 'two_column'
  | 'three_column'
  | 'image_text';

export type SpecialComponentType =
  | 'welcome_screen'
  | 'thank_you_screen'
  | 'progress_indicator'
  | 'reusable_instance';

export type VisualComponentType =
  | ContentComponentType
  | LayoutComponentType
  | SpecialComponentType;

/**
 * Open union so future custom/plugin components can be registered
 * without redesigning the document model.
 */
export type BuiltinComponentType = QuestionComponentType | VisualComponentType;
export type FormComponentType = BuiltinComponentType | (string & {});

export type ComponentWidth = 'full' | 'half' | 'third';
export type TextAlign = 'left' | 'center' | 'right';
export type SpacingToken = 'none' | 'sm' | 'md' | 'lg';
export type BreakpointKey = 'mobile' | 'tablet' | 'desktop';

export interface ResponsiveLayoutOverride {
  width?: ComponentWidth;
  hidden?: boolean;
  padding?: SpacingToken;
  textAlign?: TextAlign;
  columns?: 1 | 2 | 3;
}

export interface ComponentContentProps {
  label: string;
  placeholder?: string;
  helpText?: string;
  options?: string[];
  body?: string;
  headingLevel?: 1 | 2 | 3;
  mediaUrl?: string;
  mediaAlt?: string;
  mediaCaption?: string;
  mediaPosition?: 'left' | 'right';
  videoUrl?: string;
  spacerSize?: 'sm' | 'md' | 'lg';
  acceptedFileTypes?: string;
  maxFileSizeMb?: number;
  /** Raw authored HTML for `custom_html` blocks (always sanitized before rendering) */
  htmlContent?: string;
  /** When true, resolves plain-text {{field}} piping tokens inside sanitized custom HTML text nodes */
  htmlEnablePiping?: boolean;
  /** Safe target URL for `button_link` blocks (validated with isSafeHttpUrl / mailto:) */
  buttonUrl?: string;
  /** Visual variant for `button_link` blocks */
  buttonVariant?: 'primary' | 'secondary' | 'outline';
  /** Whether a `button_link` opens in a new tab with rel="noopener noreferrer" */
  buttonOpenInNewTab?: boolean;
}

export interface ComponentAppearanceProps {
  // Typography & General
  textAlign?: TextAlign;
  fontFamily?: FormTheme['fontFamily'];
  fontSize?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl';
  fontWeight?: 'normal' | 'medium' | 'semibold' | 'bold';
  lineHeight?: 'tight' | 'normal' | 'relaxed';
  letterSpacing?: 'tight' | 'normal' | 'wide';
  textColor?: string;
  accentColor?: string;
  spacingBottom?: 'none' | 'sm' | 'md' | 'lg';

  // Surface, Border & Shadow (Sections, Containers, Statements, Blocks)
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: '0' | '1' | '2';
  borderRadius?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  shadow?: 'none' | 'sm' | 'md' | 'lg';

  // Input Overrides
  inputBackgroundColor?: string;
  inputBorderColor?: string;
  inputTextColor?: string;
  inputPlaceholderColor?: string;
  inputFocusColor?: string;
  inputErrorColor?: string;
  inputRadius?: 'none' | 'sm' | 'md' | 'lg' | 'full';

  // Image Overrides
  imageWidth?: 'full' | '3/4' | '1/2' | 'auto';
  imageHeight?: 'auto' | 'sm' | 'md' | 'lg';
  aspectRatio?: 'auto' | '16/9' | '4/3' | '1/1' | '3/4';
  objectFit?: 'cover' | 'contain' | 'fill';
  objectPosition?: 'center' | 'top' | 'bottom' | 'left' | 'right';
  imageAlignment?: 'left' | 'center' | 'right';

  // Button Overrides (for interactive blocks / welcome / action controls)
  buttonBackgroundColor?: string;
  buttonTextColor?: string;
  buttonBorderColor?: string;
  buttonHoverColor?: string;
  buttonActiveColor?: string;
  buttonRadius?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  buttonPadding?: 'sm' | 'md' | 'lg';
  buttonFullWidth?: boolean;

  customClassName?: string;
  /** Optional component-scoped CSS declarations or rules (scoped to [data-fs-component="<id>"]) */
  customCss?: string;
  /** Allows temporarily disabling component-level custom CSS without losing it */
  customCssEnabled?: boolean;
  /** Optional per-component animation & transition overrides */
  animation?: ComponentAnimationConfig;
}

export interface ComponentLayoutProps {
  width: ComponentWidth;
  columns?: 1 | 2 | 3;
  gap?: SpacingToken;
  padding?: SpacingToken;
  margin?: SpacingToken;
  alignment?: TextAlign;
  responsive?: Partial<Record<BreakpointKey, ResponsiveLayoutOverride>>;
}

export interface ComponentBehaviourProps {
  defaultValue?: string | number | string[];
  readOnly?: boolean;
  hiddenByDefault?: boolean;
  points?: number;
  correctAnswer?: string | string[];
  autoAdvance?: boolean;
}

export type ValidationRuleKey =
  | 'required'
  | 'minLength'
  | 'maxLength'
  | 'exactLength'
  | 'pattern'
  | 'disallowedPattern'
  | 'email'
  | 'url'
  | 'number'
  | 'min'
  | 'max'
  | 'exactValue'
  | 'wholeNumberOnly'
  | 'maxDecimals'
  | 'date'
  | 'minDate'
  | 'maxDate'
  | 'pastDatesOnly'
  | 'futureDatesOnly'
  | 'allowedExtensions'
  | 'allowedMimeTypes'
  | 'maxFileSizeMb'
  | 'minFiles'
  | 'maxFiles'
  | 'minSelections'
  | 'maxSelections'
  | 'exactSelections'
  | 'invalidOption';

export interface UploadedFileMeta {
  name: string;
  /** Size in bytes */
  size: number;
  /** MIME type reported by browser/client (e.g. 'application/pdf') */
  type: string;
  lastModified?: number;
}

export interface ComponentValidationProps {
  required?: boolean;
  // Number constraints
  min?: number;
  max?: number;
  exactValue?: number;
  wholeNumberOnly?: boolean;
  maxDecimals?: number;
  // Text constraints
  minLength?: number;
  maxLength?: number;
  exactLength?: number;
  /** Allowed regex pattern (must match) */
  pattern?: string;
  /** Disallowed regex pattern (must NOT match) */
  disallowedPattern?: string;
  validateEmail?: boolean;
  validateUrl?: boolean;
  // Date constraints (ISO YYYY-MM-DD)
  minDate?: string;
  maxDate?: string;
  pastDatesOnly?: boolean;
  futureDatesOnly?: boolean;
  // File constraints
  allowedExtensions?: string[];
  allowedMimeTypes?: string[];
  maxFileSizeMb?: number;
  minFiles?: number;
  maxFiles?: number;
  // Selection constraints
  minSelections?: number;
  maxSelections?: number;
  exactSelections?: number;
  // Custom messages
  customErrorMessage?: string;
  customMessages?: Partial<Record<ValidationRuleKey, string>>;
}

/**
 * Core building block node inside a FormDocument.
 * Supports input questions, content blocks, and nestable layout containers.
 */
export interface FormComponentNode {
  id: string;
  type: FormComponentType;
  pageId: string;
  parentId?: string | null; // Non-null when nested inside a section/container/column layout
  children?: string[]; // Ordered child component IDs for container nodes
  content: ComponentContentProps;
  appearance: ComponentAppearanceProps;
  layout: ComponentLayoutProps;
  behaviour: ComponentBehaviourProps;
  validation: ComponentValidationProps;
  /** Present when type === 'reusable_instance': references a versioned ReusableComponentDefinition + local overrides */
  reusableInstance?: ReusableInstanceConfig;
}

export interface FormPage {
  id: string;
  index: number; // 1-based display index
  title: string;
  description?: string;
  componentIds: string[]; // Ordered top-level component IDs on this page
  appearance?: {
    backgroundColor?: string;
    surfaceColor?: string;
  };
  layout?: {
    maxWidth?: 'sm' | 'md' | 'lg' | 'full';
    gap?: SpacingToken;
  };
}

export interface DeviceDesignOverride {
  internalPadding?: 'sm' | 'md' | 'lg' | 'xl';
  componentSpacing?: 'sm' | 'md' | 'lg';
  headingSize?: 'sm' | 'md' | 'lg' | 'xl';
  bodySize?: 'sm' | 'base' | 'lg';
  textAlign?: TextAlign;
}

export interface FormDesignConfig extends FormTheme {
  spacingScale?: 'compact' | 'comfortable' | 'relaxed';
  containerMaxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  customCss?: string; // Reserved for future safe custom CSS support
  responsive?: {
    mobilePadding?: SpacingToken;
    desktopPadding?: SpacingToken;
    desktop?: DeviceDesignOverride;
    tablet?: DeviceDesignOverride;
    mobile?: DeviceDesignOverride;
  };
}

export type VariableValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'selection'
  | 'list';

export type VariableFormatStyle =
  | 'plain'
  | 'number'
  | 'currency'
  | 'percent'
  | 'date';

export interface VariableFormatConfig {
  style: VariableFormatStyle;
  /** Number of decimal places (0–6) for number / currency / percent */
  decimals?: number;
  /** Whether to include thousand separators (default true) */
  useGrouping?: boolean;
  /** ISO 4217 currency code (e.g. 'USD', 'EUR', 'GBP', 'NGN', 'CAD', 'AUD', 'JPY', 'INR') */
  currency?: string;
  /** BCP 47 locale tag (e.g. 'en-US', 'en-GB', 'de-DE', 'fr-FR', 'ja-JP') */
  locale?: string;
  /** Date format style for date variables */
  dateStyle?: 'short' | 'medium' | 'long';
}

export interface FormVariableDefinition {
  id: string;
  name: string;
  valueType: VariableValueType;
  initialValue?: string | number | boolean | string[];
  /** Allowed option labels for 'selection' or 'list' variables */
  options?: string[];
  /** Optional safe formula expression for live calculated variables */
  expression?: string;
  /** Optional display formatting rules (currency, number, percent, date) */
  format?: VariableFormatConfig;
  description?: string;
}

// ============================================================================
// Cross-Field Validation (Phase 2, Step 4)
// ============================================================================

export type CrossFieldOperator =
  | 'equals_field'
  | 'not_equals_field'
  | 'greater_than_field'
  | 'greater_or_equal_field'
  | 'less_than_field'
  | 'less_or_equal_field'
  | 'after_date_field'
  | 'before_date_field'
  | 'matches_expression';

export interface CrossFieldValidationRule {
  id: string;
  name: string;
  enabled: boolean;
  /** Component where the validation error is surfaced (defaults to sourceComponentId) */
  targetComponentId: string;
  /** Primary question being validated */
  sourceComponentId: string;
  operator: CrossFieldOperator;
  /** Secondary question compared against sourceComponentId (for *_field operators) */
  compareComponentId?: string;
  /** Safe formula expression evaluating to truthy (!== 0) when operator === 'matches_expression' */
  expression?: string;
  /** Case-sensitive comparison for text equality (default false) */
  caseSensitive?: boolean;
  /** Custom user-facing error message (supports {{piping}}) */
  errorMessage: string;
  /** Optional guard: only enforce this cross-field rule when this condition group passes */
  whenConditionGroup?: LogicConditionGroup;
}

// ============================================================================
// Multi-Category Scoring & Thresholds (Phase 2, Step 4)
// ============================================================================

export interface ScoreThreshold {
  id: string;
  label: string;
  /** Match by raw points (inclusive) */
  minScore?: number;
  maxScore?: number;
  /** Or match by percentage 0–100 (inclusive) */
  minPercent?: number;
  maxPercent?: number;
  description?: string;
}

export interface ScoringCategory {
  id: string;
  name: string;
  description?: string;
  color?: string;
  /** Optional explicit max score denominator (otherwise auto-calculated from question rules) */
  maxScoreOverride?: number;
  /** Optional calculated formula override for this category (e.g. "{{var_a}} * 2 + {{q1}}") */
  formulaExpression?: string;
  thresholds: ScoreThreshold[];
}

export type QuestionScoringMode =
  | 'option_points'
  | 'exact_match'
  | 'numeric_value'
  | 'range_points'
  | 'formula';

export interface NumericRangeScoreRule {
  id: string;
  min?: number;
  max?: number;
  points: number;
}

export interface QuestionScoringRule {
  id: string;
  componentId: string;
  enabled: boolean;
  /** Optional ScoringCategory.id — if omitted, contributes only to overall Total Score */
  categoryId?: string;
  /** If true and categoryId is set, score counts only toward that category, not total */
  excludeFromTotal?: boolean;
  /** Multiplier applied to earned & possible points (default 1) */
  weight: number;
  mode: QuestionScoringMode;
  /** Map of choice option string -> point value (for radio, select, checkbox, yes_no) */
  optionPoints?: Record<string, number>;
  /** For exact_match mode */
  correctAnswer?: string | string[];
  points?: number;
  /** For range_points mode (number / rating / scale) */
  rangePoints?: NumericRangeScoreRule[];
  /** For formula mode (uses safe calculation engine) */
  formulaExpression?: string;
  /** Optional explicit max points for this question (before weight) */
  maxPointsOverride?: number;
}

export interface FormScoringConfig {
  enabled: boolean;
  /** When true, private scoring weights & answer keys are stripped from public respondent configs */
  hidePrivateConfigFromRespondents?: boolean;
  categories: ScoringCategory[];
  rules: QuestionScoringRule[];
  totalThresholds: ScoreThreshold[];
}

// ============================================================================
// Outcomes & Personalised Result Screens (Phase 2, Step 4)
// ============================================================================

export type OutcomeConditionSource =
  | 'total_score'
  | 'total_percent'
  | 'category_score'
  | 'category_percent'
  | 'component'
  | 'variable'
  | 'logic_group';

export type OutcomeComparisonOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'less_than'
  | 'less_than_or_equal'
  | 'between'
  | 'contains';

export interface OutcomeCondition {
  id: string;
  source: OutcomeConditionSource;
  /** Category ID (for category_score/percent), Component ID (for component), or Variable name (for variable) */
  sourceId?: string;
  operator: OutcomeComparisonOperator;
  value: string;
  secondaryValue?: string;
  /** Full nested condition group when source === 'logic_group' */
  logicGroup?: LogicConditionGroup;
}

export interface OutcomeActionButton {
  id: string;
  label: string;
  url: string;
  style: 'primary' | 'secondary';
  openInNewTab?: boolean;
}

export interface OutcomeConditionalBlock {
  id: string;
  heading: string;
  body: string;
  conditionGroup: LogicConditionGroup;
}

export interface OutcomeResultScreen {
  heading: string;
  description: string;
  imageUrl?: string;
  imageAlt?: string;
  showScoreCard?: boolean;
  showCategoryBreakdown?: boolean;
  nextSteps?: string[];
  buttons?: OutcomeActionButton[];
  conditionalBlocks?: OutcomeConditionalBlock[];
  appearance?: {
    backgroundColor?: string;
    surfaceColor?: string;
    accentColor?: string;
    textColor?: string;
    textAlign?: TextAlign;
  };
}

export interface FormOutcomeDefinition {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  priority: number;
  matchMode: 'all' | 'any';
  conditions: OutcomeCondition[];
  resultScreen: OutcomeResultScreen;
}

export interface FormOutcomeConfig {
  enabled: boolean;
  /** Fallback outcome ID when no conditional outcome matches */
  defaultOutcomeId?: string;
  outcomes: FormOutcomeDefinition[];
}

export interface FormLogicSpec {
  rules: AnyLogicRule[];
  crossFieldValidations?: CrossFieldValidationRule[];
  /** Reserved extension bag for future multi-condition DAGs / branching workflows */
  extensions?: Record<string, unknown>;
}

// ============================================================================
// Advanced Customisation: Scoped CSS, Custom HTML & Sandboxed JS (Phase 3.1)
// ============================================================================

export const CUSTOM_CODE_SCHEMA_VERSION = 1 as const;

export interface CustomCssConfig {
  enabled: boolean;
  /** Form-level CSS authored by the creator (always scoped to this form instance) */
  code: string;
}

export interface CustomJsConfig {
  /** Strictly opt-in and disabled by default; executes only inside opaque-origin sandboxed iframe */
  enabled: boolean;
  /** Creator script using the minimal sandboxed `flexstore` API */
  code: string;
  /** Per-event execution watchdog timeout in milliseconds (clamped 50–1000ms) */
  timeoutMs?: number;
}

export interface FormCustomCodeConfig {
  schemaVersion: typeof CUSTOM_CODE_SCHEMA_VERSION;
  css: CustomCssConfig;
  js: CustomJsConfig;
  updatedAt?: string;
}

// ============================================================================
// Reusable Component System (Phase 3.2)
// ============================================================================

export const COMPONENT_LIBRARY_SCHEMA_VERSION = 1 as const;

export type ReusablePropType =
  | 'text'
  | 'textarea'
  | 'image_url'
  | 'button_label'
  | 'url'
  | 'color'
  | 'alignment'
  | 'spacing'
  | 'layout_columns'
  | 'visibility';

export type ReusablePropBindingTarget =
  | {
      scope: 'root';
      property:
        | 'backgroundColor'
        | 'borderColor'
        | 'textColor'
        | 'textAlign'
        | 'padding'
        | 'gap'
        | 'columns'
        | 'visible';
    }
  | {
      scope: 'slot';
      slotId: string;
      property:
        | 'label'
        | 'body'
        | 'helpText'
        | 'placeholder'
        | 'mediaUrl'
        | 'mediaAlt'
        | 'videoUrl'
        | 'buttonUrl'
        | 'textColor'
        | 'backgroundColor'
        | 'textAlign'
        | 'visible';
    };

export interface ReusablePropDefinition {
  id: string;
  key: string;
  label: string;
  description?: string;
  type: ReusablePropType;
  defaultValue: string | number | boolean;
  binding: ReusablePropBindingTarget;
}

export interface ReusableSlotNode {
  /** Stable slot identifier within the reusable definition (never changes across versions unless deleted) */
  slotId: string;
  type: FormComponentType;
  parentSlotId?: string | null;
  childrenSlotIds?: string[];
  content: ComponentContentProps;
  appearance: ComponentAppearanceProps;
  layout: ComponentLayoutProps;
  behaviour: ComponentBehaviourProps;
  validation: ComponentValidationProps;
}

export interface ReusableComponentDefinition {
  schemaVersion: typeof COMPONENT_LIBRARY_SCHEMA_VERSION;
  id: string;
  /** Monotonically increasing integer version (1, 2, 3...) bumped on every saved master edit */
  version: number;
  name: string;
  description: string;
  category: string;
  tags?: string[];
  ownerId?: string;
  rootLayout: ComponentLayoutProps;
  rootAppearance: ComponentAppearanceProps;
  hiddenByDefault?: boolean;
  /** Ordered top-level slot IDs */
  rootSlotIds: string[];
  /** All internal building blocks keyed by slotId */
  slots: Record<string, ReusableSlotNode>;
  /** Typed configurable properties exposed in the existing Component Inspector */
  props: ReusablePropDefinition[];
  createdAt: string;
  updatedAt: string;
}

export interface ReusableSlotOverride {
  content?: Partial<ComponentContentProps>;
  appearance?: Partial<ComponentAppearanceProps>;
  layout?: Partial<ComponentLayoutProps>;
  validation?: Partial<ComponentValidationProps>;
  hidden?: boolean;
}

export type ReusableInstanceSyncMode = 'linked' | 'detached';

export interface ReusableInstanceConfig {
  definitionId: string;
  /** The definition version this instance was created from or last synced to */
  definitionVersion: number;
  /** Last known display name so the UI stays legible even if the definition is deleted */
  definitionNameSnapshot: string;
  syncMode: ReusableInstanceSyncMode;
  /** Local overrides for exposed typed properties (keyed by ReusablePropDefinition.key) */
  propOverrides: Record<string, string | number | boolean>;
  /** Fine-grained per-slot local overrides (content/appearance/layout/validation/visibility) */
  slotOverrides: Record<string, ReusableSlotOverride>;
  /** Self-contained snapshot captured at creation/sync/detach so deleted definitions never break forms */
  fallbackDefinition?: ReusableComponentDefinition;
}

export interface FormDocumentMetadata {
  createdAt: string;
  updatedAt: string;
  responsesCount: number;
  version?: number;
  teamId?: string;
  ownerId?: string;
  lastEditedBy?: string;
  lastEditedByName?: string;
}

export interface FormDocument {
  schemaVersion: typeof DOCUMENT_SCHEMA_VERSION;
  id: string;
  title: string;
  description: string;
  category: FormCategory;
  layoutMode: FormLayoutMode;
  settings: FormSettings;
  design: FormDesignConfig;
  welcomeScreen: FormWelcomeScreen;
  thankYouScreen: FormThankYouScreen;
  pages: FormPage[];
  components: Record<string, FormComponentNode>;
  logic: FormLogicSpec;
  variables: FormVariableDefinition[];
  scoring?: FormScoringConfig;
  outcomes?: FormOutcomeConfig;
  /** Versioned advanced customisation configuration (scoped CSS & optional sandboxed JS) */
  customCode?: FormCustomCodeConfig;
  /** Versioned reusable component definitions referenced by instances in this form */
  componentDefinitions?: Record<string, ReusableComponentDefinition>;
  /** Reserved extension slot for future external integrations (webhooks, CRM, Slack, etc.) */
  integrations: Record<string, unknown>;
  metadata: FormDocumentMetadata;
}
