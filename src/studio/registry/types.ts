/**
 * FlexStore / AuraForm Studio — Component Registry Types
 *
 * Defines the contract every built-in or future plugin component implements
 * so the Editor, Inspector, Sidebar, and Rendering Engine stay decoupled from
 * hardcoded component implementations.
 */

import type React from 'react';
import {
  BreakpointKey,
  ComponentAppearanceProps,
  ComponentBehaviourProps,
  ComponentContentProps,
  ComponentLayoutProps,
  ComponentValidationProps,
  FormComponentNode,
  FormComponentType,
  FormDesignConfig,
  ReusableComponentDefinition,
} from '../document/types';

export type ComponentCategory = 'content' | 'fields' | 'layout' | 'other';

export type ComponentConfigOption =
  | 'label'
  | 'helpText'
  | 'placeholder'
  | 'options'
  | 'body'
  | 'headingLevel'
  | 'media'
  | 'video'
  | 'mediaPosition'
  | 'spacerSize'
  | 'fileUpload'
  | 'containerLayout'
  | 'required'
  | 'minMax'
  | 'width'
  | 'textAlign'
  | 'backgroundColor'
  | 'quizScoring'
  | 'customHtml'
  | 'buttonLink'
  | 'reusableInstance';

export interface ComponentNodePatch {
  type?: FormComponentType;
  pageId?: string;
  parentId?: string | null;
  children?: string[];
  content?: Partial<ComponentContentProps>;
  appearance?: Partial<ComponentAppearanceProps>;
  layout?: Partial<ComponentLayoutProps>;
  behaviour?: Partial<ComponentBehaviourProps>;
  validation?: Partial<ComponentValidationProps>;
}

export interface EditorComponentRenderProps {
  node: FormComponentNode;
  onUpdate: (patch: ComponentNodePatch) => void;
  isQuizMode: boolean;
  isReadOnly?: boolean;
  design?: FormDesignConfig;
  primaryColor?: string;
  radiusClass?: string;
  viewport?: BreakpointKey;
  /** Merged reusable component definitions (document + creator library) for rendering reusable instances */
  reusableDefinitions?: Record<string, ReusableComponentDefinition>;
}

export interface RespondentComponentRenderProps {
  node: FormComponentNode;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  required: boolean;
  disabled?: boolean;
  design: FormDesignConfig;
  primaryColor: string;
  radiusClass: string;
  viewport?: BreakpointKey;
  /** Optional rendered child elements for layout container nodes */
  renderedChildren?: React.ReactNode;
  /** Optional live progress percentage (0-100) for progress_indicator blocks */
  progressPercent?: number;
  /** Reusable component definitions embedded in the FormDocument */
  reusableDefinitions?: Record<string, ReusableComponentDefinition>;
  /** Answers map for internal form fields inside reusable component instances */
  nestedAnswers?: Record<string, unknown>;
  /** Validation errors map for internal form fields inside reusable component instances */
  nestedErrors?: Record<string, string>;
  /** Answer change callback for internal form fields inside reusable component instances */
  onNestedChange?: (fieldId: string, value: unknown) => void;
  /** Optional answer-piping transformer applied to internal nodes */
  pipeNode?: (node: FormComponentNode) => FormComponentNode;
}

export interface FormComponentDefinition {
  type: FormComponentType;
  displayName: string;
  shortLabel: string;
  hint: string;
  category: ComponentCategory;
  /** True for data-collecting input fields; false for visual/layout/special blocks */
  isQuestion: boolean;
  /** True for layout container components that can hold nested child components */
  isContainer?: boolean;
  /** When true, component is registered in the central registry but omitted from the generic built-in block palette */
  hiddenFromPalette?: boolean;
  /** Optional special behavior when clicked/dropped from sidebar (e.g., Welcome/Thank-You screen) */
  specialAction?: 'welcome' | 'thank_you';
  /** Search keywords to make sidebar filtering effortless */
  keywords?: string[];
  icon: React.ComponentType<{
    size?: number;
    weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
    className?: string;
  }>;
  defaultContent: ComponentContentProps;
  defaultAppearance: ComponentAppearanceProps;
  defaultLayout: ComponentLayoutProps;
  defaultBehaviour: ComponentBehaviourProps;
  defaultValidation: ComponentValidationProps;
  supportedOptions: ComponentConfigOption[];
  EditorRenderer: React.ComponentType<EditorComponentRenderProps>;
  RespondentRenderer: React.ComponentType<RespondentComponentRenderProps>;
}

export interface ComponentCategoryGroup {
  id: ComponentCategory;
  label: string;
  components: FormComponentDefinition[];
}
