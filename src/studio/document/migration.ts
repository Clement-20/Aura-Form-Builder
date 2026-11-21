/**
 * Bidirectional Migration Layer: Legacy FormSchema (v1) <-> FormDocument (v2)
 *
 * Guarantees:
 *  - Existing LocalStorage & Firestore forms migrate transparently on read
 *  - Stable component IDs, page IDs, logic rules, settings, themes, and responsesCount are preserved
 *  - Zero database duplication: v2 extended facets persist inside serialized field metadata
 *    without violating strict Firestore security rule key allowlists
 */

import { FieldType, FormField, FormSchema, FormStep } from '../../types/form';
import { ensureFormSteps } from '../../lib/storage';
import {
  ComponentAppearanceProps,
  ComponentBehaviourProps,
  ComponentContentProps,
  ComponentLayoutProps,
  ComponentValidationProps,
  CrossFieldValidationRule,
  CUSTOM_CODE_SCHEMA_VERSION,
  DOCUMENT_SCHEMA_VERSION,
  FormComponentNode,
  FormComponentType,
  FormCustomCodeConfig,
  FormDocument,
  FormOutcomeConfig,
  FormPage,
  FormScoringConfig,
  FormVariableDefinition,
  ReusableComponentDefinition,
  ReusableInstanceConfig,
} from './types';
import { isRecord, repairFormDocument } from './validation';
import { normalizeLogicRule, serializeStudioLogicRule } from '../logic/migration';
import { AnyLogicRule } from '../logic/types';
import { collectReferencedDefinitions } from '../engines/reusable-component-engine';
import { sanitizeIntegrationMetadataForDocument } from '../integrations/types';

/**
 * Optional lossless sidecar stored inside a legacy FormField when serializing v2 -> v1.
 * Ignored safely by legacy code, restored completely on v1 -> v2 migration.
 */
interface SerializedStudioFieldMeta {
  componentType: FormComponentType;
  parentId?: string | null;
  children?: string[];
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
  htmlContent?: string;
  htmlEnablePiping?: boolean;
  buttonUrl?: string;
  buttonVariant?: 'primary' | 'secondary' | 'outline';
  buttonOpenInNewTab?: boolean;
  reusableInstance?: ReusableInstanceConfig;
  appearance: ComponentAppearanceProps;
  layout: ComponentLayoutProps;
  behaviour: ComponentBehaviourProps;
  validation: ComponentValidationProps;
}

type FieldWithStudioMeta = FormField & {
  studioMeta?: SerializedStudioFieldMeta;
};

const LEGACY_FIELD_TYPES = new Set<FieldType>([
  'text',
  'textarea',
  'email',
  'phone',
  'number',
  'select',
  'radio',
  'checkbox',
  'rating',
  'scale',
  'date',
  'url',
  'statement',
]);

function toLegacyFieldType(type: FormComponentType): FieldType {
  if (LEGACY_FIELD_TYPES.has(type as FieldType)) {
    return type as FieldType;
  }
  if (type === 'yes_no') return 'radio';
  if (type === 'time') return 'text';
  if (type === 'file_upload') return 'text';
  // Non-question visual & layout blocks project cleanly onto 'statement' for legacy runners
  return 'statement';
}

export function isFormDocument(input: unknown): input is FormDocument {
  return isRecord(input) && input.schemaVersion === DOCUMENT_SCHEMA_VERSION && isRecord(input.components);
}

/**
 * Migrates any existing v1 FormSchema (or already-migrated v2 FormDocument)
 * into a validated, repaired FormDocument v2 while preserving all stable IDs.
 */
export function migrateLegacyFormToDocument(input: FormSchema | FormDocument): FormDocument {
  if (isFormDocument(input)) {
    return repairFormDocument(input);
  }

  const legacy = input as FormSchema & {
    teamId?: string;
    ownerId?: string;
    lastEditedBy?: string;
    lastEditedByName?: string;
    version?: number;
  };

  const legacySteps = ensureFormSteps(legacy);
  const stepNumberToPageId = new Map<number, string>();

  const pages: FormPage[] = legacySteps.map((s, idx) => {
    const stepNum = s.stepNumber || idx + 1;
    const pageId = s.id || `step_${stepNum}`;
    stepNumberToPageId.set(stepNum, pageId);
    return {
      id: pageId,
      index: idx + 1,
      title: s.title || `Page ${idx + 1}`,
      description: s.description || '',
      componentIds: [],
    };
  });

  if (pages.length === 0) {
    pages.push({
      id: 'step_1',
      index: 1,
      title: 'Page 1',
      description: '',
      componentIds: [],
    });
    stepNumberToPageId.set(1, 'step_1');
  }

  const components: Record<string, FormComponentNode> = {};
  const fields = Array.isArray(legacy.fields) ? (legacy.fields as FieldWithStudioMeta[]) : [];

  for (const field of fields) {
    const stepNum = field.step || 1;
    const pageId = stepNumberToPageId.get(stepNum) || pages[0].id;
    const meta = field.studioMeta;

    const content: ComponentContentProps = {
      label: field.label ?? '',
      placeholder: field.placeholder,
      helpText: field.helpText,
      options: Array.isArray(field.options) ? [...field.options] : undefined,
      body: meta?.body,
      headingLevel: meta?.headingLevel,
      mediaUrl: meta?.mediaUrl,
      mediaAlt: meta?.mediaAlt,
      mediaCaption: meta?.mediaCaption,
      mediaPosition: meta?.mediaPosition,
      videoUrl: meta?.videoUrl,
      spacerSize: meta?.spacerSize,
      acceptedFileTypes: meta?.acceptedFileTypes,
      maxFileSizeMb: meta?.maxFileSizeMb,
      htmlContent: meta?.htmlContent,
      htmlEnablePiping: meta?.htmlEnablePiping,
      buttonUrl: meta?.buttonUrl,
      buttonVariant: meta?.buttonVariant,
      buttonOpenInNewTab: meta?.buttonOpenInNewTab,
    };

    const appearance: ComponentAppearanceProps = meta?.appearance
      ? { ...meta.appearance }
      : { textAlign: 'left' };

    const layout: ComponentLayoutProps = meta?.layout
      ? {
          ...meta.layout,
          width: meta.layout.width || 'full',
          responsive: meta.layout.responsive
            ? {
                ...(meta.layout.responsive.desktop
                  ? { desktop: { ...meta.layout.responsive.desktop } }
                  : {}),
                ...(meta.layout.responsive.tablet
                  ? { tablet: { ...meta.layout.responsive.tablet } }
                  : {}),
                ...(meta.layout.responsive.mobile
                  ? { mobile: { ...meta.layout.responsive.mobile } }
                  : {}),
              }
            : undefined,
        }
      : { width: 'full', padding: 'none', margin: 'none' };

    const behaviour: ComponentBehaviourProps = {
      ...(meta?.behaviour || {}),
      points: field.points ?? meta?.behaviour?.points,
      correctAnswer: field.correctAnswer ?? meta?.behaviour?.correctAnswer,
    };

    const validation: ComponentValidationProps = {
      ...(meta?.validation || {}),
      required: Boolean(field.required ?? meta?.validation?.required),
      min: field.min ?? meta?.validation?.min,
      max: field.max ?? meta?.validation?.max,
      allowedExtensions: Array.isArray(meta?.validation?.allowedExtensions)
        ? [...meta.validation.allowedExtensions]
        : undefined,
      allowedMimeTypes: Array.isArray(meta?.validation?.allowedMimeTypes)
        ? [...meta.validation.allowedMimeTypes]
        : undefined,
      customMessages: meta?.validation?.customMessages
        ? { ...meta.validation.customMessages }
        : undefined,
    };

    const componentType: FormComponentType = meta?.componentType || field.type;

    components[field.id] = {
      id: field.id,
      type: componentType,
      pageId,
      parentId: meta?.parentId ?? null,
      children: meta?.children ? [...meta.children] : undefined,
      content,
      appearance,
      layout,
      behaviour,
      validation,
      ...(meta?.reusableInstance
        ? { reusableInstance: JSON.parse(JSON.stringify(meta.reusableInstance)) }
        : {}),
    };

    if (!meta?.parentId) {
      const targetPage = pages.find((p) => p.id === pageId) || pages[0];
      targetPage.componentIds.push(field.id);
    }
  }

  const rawSettings = {
    ...(legacy.settings as FormSchema['settings'] & {
      studioVariables?: FormVariableDefinition[];
      studioCrossFieldValidations?: CrossFieldValidationRule[];
      studioScoring?: FormScoringConfig;
      studioOutcomes?: FormOutcomeConfig;
      studioCustomCode?: FormCustomCodeConfig;
      studioComponentDefinitions?: Record<string, ReusableComponentDefinition>;
    }),
  };
  const restoredVariables: FormVariableDefinition[] = Array.isArray(rawSettings.studioVariables)
    ? rawSettings.studioVariables.map((v) => ({
        ...v,
        initialValue: Array.isArray(v.initialValue) ? [...v.initialValue] : v.initialValue,
        options: Array.isArray(v.options) ? [...v.options] : undefined,
        format: v.format ? { ...v.format } : undefined,
      }))
    : [];
  const restoredCrossFieldValidations: CrossFieldValidationRule[] = Array.isArray(
    rawSettings.studioCrossFieldValidations
  )
    ? JSON.parse(JSON.stringify(rawSettings.studioCrossFieldValidations))
    : [];
  const restoredScoring: FormScoringConfig | undefined = rawSettings.studioScoring
    ? JSON.parse(JSON.stringify(rawSettings.studioScoring))
    : undefined;
  const restoredOutcomes: FormOutcomeConfig | undefined = rawSettings.studioOutcomes
    ? JSON.parse(JSON.stringify(rawSettings.studioOutcomes))
    : undefined;
  const restoredCustomCode: FormCustomCodeConfig | undefined = rawSettings.studioCustomCode
    ? {
        schemaVersion: CUSTOM_CODE_SCHEMA_VERSION,
        css: {
          enabled: Boolean(rawSettings.studioCustomCode.css?.enabled),
          code: rawSettings.studioCustomCode.css?.code || '',
        },
        js: {
          enabled: Boolean(rawSettings.studioCustomCode.js?.enabled),
          code: rawSettings.studioCustomCode.js?.code || '',
          timeoutMs: rawSettings.studioCustomCode.js?.timeoutMs,
        },
        updatedAt: rawSettings.studioCustomCode.updatedAt,
      }
    : undefined;
  const restoredComponentDefinitions: Record<string, ReusableComponentDefinition> | undefined =
    isRecord(rawSettings.studioComponentDefinitions)
      ? JSON.parse(JSON.stringify(rawSettings.studioComponentDefinitions))
      : undefined;

  delete rawSettings.studioVariables;
  delete rawSettings.studioCrossFieldValidations;
  delete rawSettings.studioScoring;
  delete rawSettings.studioOutcomes;
  delete rawSettings.studioCustomCode;
  delete rawSettings.studioComponentDefinitions;

  const doc: FormDocument = {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: legacy.id,
    title: legacy.title ?? 'Untitled Form',
    description: legacy.description ?? '',
    category: legacy.category ?? 'survey',
    layoutMode: legacy.layoutMode ?? 'conversational',
    settings: rawSettings,
    design: {
      ...legacy.theme,
      spacingScale: (legacy.theme as any)?.spacingScale || 'comfortable',
      containerMaxWidth: (legacy.theme as any)?.containerMaxWidth || 'md',
      responsive: (legacy.theme as any)?.responsive
        ? JSON.parse(JSON.stringify((legacy.theme as any).responsive))
        : undefined,
      motion: (legacy.theme as any)?.motion
        ? JSON.parse(JSON.stringify((legacy.theme as any).motion))
        : undefined,
    },
    welcomeScreen: { ...legacy.welcomeScreen },
    thankYouScreen: { ...legacy.thankYouScreen },
    pages,
    components,
    logic: {
      rules: [],
      crossFieldValidations: restoredCrossFieldValidations,
      extensions: {},
    },
    variables: restoredVariables,
    scoring: restoredScoring,
    outcomes: restoredOutcomes,
    customCode: restoredCustomCode,
    componentDefinitions: restoredComponentDefinitions,
    integrations: sanitizeIntegrationMetadataForDocument(
      (legacy.settings as unknown as Record<string, unknown> | undefined)?.studioIntegrations
    ),
    metadata: {
      createdAt: legacy.createdAt || new Date().toISOString(),
      updatedAt: legacy.updatedAt || new Date().toISOString(),
      responsesCount: typeof legacy.responsesCount === 'number' ? legacy.responsesCount : 0,
      version: legacy.version,
      teamId: legacy.teamId,
      ownerId: legacy.ownerId,
      lastEditedBy: legacy.lastEditedBy,
      lastEditedByName: legacy.lastEditedByName,
    },
  };

  if (Array.isArray(legacy.logicRules)) {
    doc.logic.rules = legacy.logicRules.map((r, idx) =>
      normalizeLogicRule(r as AnyLogicRule, doc, idx)
    );
  }

  return repairFormDocument(doc);
}

/**
 * Serializes a v2 FormDocument back into the compatible v1 FormSchema structure
 * for seamless persistence in LocalStorage, Cloud Firestore, and existing runners.
 */
export function serializeDocumentToLegacyForm(doc: FormDocument): FormSchema {
  const repaired = repairFormDocument(doc);
  const steps: FormStep[] = repaired.pages.map((p, idx) => ({
    id: p.id,
    stepNumber: idx + 1,
    title: p.title,
    description: p.description,
  }));

  const fields: FieldWithStudioMeta[] = [];
  const visited = new Set<string>();

  const appendNode = (nodeId: string, stepNumber: number) => {
    if (visited.has(nodeId)) return;
    const node = repaired.components[nodeId];
    if (!node) return;
    visited.add(nodeId);

    const legacyField: FieldWithStudioMeta = {
      id: node.id,
      type: toLegacyFieldType(node.type),
      label: node.content.label,
      placeholder: node.content.placeholder,
      helpText: node.content.helpText,
      required: Boolean(node.validation.required),
      options: node.content.options ? [...node.content.options] : undefined,
      step: stepNumber,
      min: node.validation.min,
      max: node.validation.max,
      points: node.behaviour.points,
      correctAnswer: node.behaviour.correctAnswer,
      studioMeta: {
        componentType: node.type,
        parentId: node.parentId ?? null,
        children: node.children ? [...node.children] : undefined,
        body: node.content.body,
        headingLevel: node.content.headingLevel,
        mediaUrl: node.content.mediaUrl,
        mediaAlt: node.content.mediaAlt,
        mediaCaption: node.content.mediaCaption,
        mediaPosition: node.content.mediaPosition,
        videoUrl: node.content.videoUrl,
        spacerSize: node.content.spacerSize,
        acceptedFileTypes: node.content.acceptedFileTypes,
        maxFileSizeMb: node.content.maxFileSizeMb,
        htmlContent: node.content.htmlContent,
        htmlEnablePiping: node.content.htmlEnablePiping,
        buttonUrl: node.content.buttonUrl,
        buttonVariant: node.content.buttonVariant,
        buttonOpenInNewTab: node.content.buttonOpenInNewTab,
        reusableInstance: node.reusableInstance
          ? JSON.parse(JSON.stringify(node.reusableInstance))
          : undefined,
        appearance: { ...node.appearance },
        layout: {
          ...node.layout,
          responsive: node.layout.responsive
            ? JSON.parse(JSON.stringify(node.layout.responsive))
            : undefined,
        },
        behaviour: { ...node.behaviour },
        validation: {
          ...node.validation,
          allowedExtensions: Array.isArray(node.validation.allowedExtensions)
            ? [...node.validation.allowedExtensions]
            : undefined,
          allowedMimeTypes: Array.isArray(node.validation.allowedMimeTypes)
            ? [...node.validation.allowedMimeTypes]
            : undefined,
          customMessages: node.validation.customMessages
            ? { ...node.validation.customMessages }
            : undefined,
        },
      },
    };

    fields.push(legacyField);

    if (Array.isArray(node.children)) {
      for (const childId of node.children) {
        appendNode(childId, stepNumber);
      }
    }
  };

  repaired.pages.forEach((page, idx) => {
    const stepNum = idx + 1;
    for (const compId of page.componentIds) {
      appendNode(compId, stepNum);
    }
  });

  const serializedSettings: FormSchema['settings'] & {
    studioVariables?: FormVariableDefinition[];
    studioCrossFieldValidations?: CrossFieldValidationRule[];
    studioScoring?: FormScoringConfig;
    studioOutcomes?: FormOutcomeConfig;
    studioCustomCode?: FormCustomCodeConfig;
    studioComponentDefinitions?: Record<string, ReusableComponentDefinition>;
    studioIntegrations?: Record<string, unknown>;
  } = { ...repaired.settings };

  if (repaired.variables && repaired.variables.length > 0) {
    serializedSettings.studioVariables = repaired.variables.map((v) => ({
      ...v,
      initialValue: Array.isArray(v.initialValue) ? [...v.initialValue] : v.initialValue,
      options: Array.isArray(v.options) ? [...v.options] : undefined,
      format: v.format ? { ...v.format } : undefined,
    }));
  }

  if (repaired.logic.crossFieldValidations && repaired.logic.crossFieldValidations.length > 0) {
    serializedSettings.studioCrossFieldValidations = JSON.parse(
      JSON.stringify(repaired.logic.crossFieldValidations)
    );
  }

  if (repaired.scoring) {
    serializedSettings.studioScoring = JSON.parse(JSON.stringify(repaired.scoring));
  }

  if (repaired.outcomes) {
    serializedSettings.studioOutcomes = JSON.parse(JSON.stringify(repaired.outcomes));
  }

  if (repaired.customCode) {
    serializedSettings.studioCustomCode = JSON.parse(JSON.stringify(repaired.customCode));
  }

  // Embed ONLY reusable component definitions referenced by instances in this form
  // to keep published forms self-contained while avoiding unused definition duplication.
  const referencedDefs = collectReferencedDefinitions(repaired);
  if (Object.keys(referencedDefs).length > 0) {
    serializedSettings.studioComponentDefinitions = referencedDefs;
  }

  const sanitizedIntegrations = sanitizeIntegrationMetadataForDocument(repaired.integrations);
  if (Object.keys(sanitizedIntegrations).length > 0) {
    serializedSettings.studioIntegrations = sanitizedIntegrations;
  } else {
    delete serializedSettings.studioIntegrations;
  }

  const legacyForm: FormSchema = {
    id: repaired.id,
    title: repaired.title,
    description: repaired.description,
    category: repaired.category,
    layoutMode: repaired.layoutMode,
    theme: {
      ...repaired.design,
      ...(repaired.design.responsive
        ? { responsive: JSON.parse(JSON.stringify(repaired.design.responsive)) }
        : {}),
      ...(repaired.design.motion
        ? { motion: JSON.parse(JSON.stringify(repaired.design.motion)) }
        : {}),
    } as FormSchema['theme'],
    welcomeScreen: { ...repaired.welcomeScreen },
    thankYouScreen: { ...repaired.thankYouScreen },
    fields,
    steps,
    logicRules: repaired.logic.rules.map((r, idx) =>
      serializeStudioLogicRule(r as AnyLogicRule, repaired, idx)
    ),
    settings: serializedSettings,
    createdAt: repaired.metadata.createdAt,
    updatedAt: repaired.metadata.updatedAt,
    responsesCount: repaired.metadata.responsesCount,
  };

  return legacyForm;
}
