/**
 * FlexStore Form Studio — Reusable Component Engine (Phase 3.2)
 *
 * Pure TypeScript engine managing versioned Reusable Component Definitions,
 * typed exposed property schemas, non-destructive instance overrides, explicit
 * master->instance synchronization, graceful deleted-definition fallback,
 * responsive resolution, and unified internal-field expansion for validation.
 *
 * Zero React/DOM dependencies so server-side submission validation and client
 * rendering execute identically.
 */

import {
  BreakpointKey,
  COMPONENT_LIBRARY_SCHEMA_VERSION,
  ComponentAppearanceProps,
  ComponentLayoutProps,
  FormComponentNode,
  FormComponentType,
  FormDocument,
  ReusableComponentDefinition,
  ReusableInstanceConfig,
  ReusablePropDefinition,
  ReusablePropType,
  ReusableSlotNode,
  ReusableSlotOverride,
  SpacingToken,
  TextAlign,
} from '../document/types';
import { isSafeHttpUrl } from '../logic/registries';
import { isInteractiveQuestionComponent } from './navigation-engine';

export const DEFAULT_REUSABLE_CATEGORIES = [
  'Headers & Heroes',
  'Contact & Lead',
  'Callouts & Notices',
  'Pricing & CTA',
  'Custom Blocks',
] as const;

export const ALLOWED_REUSABLE_BUILDING_BLOCKS: FormComponentType[] = [
  // Content
  'heading',
  'paragraph',
  'rich_text',
  'custom_html',
  'image',
  'video',
  'button_link',
  'divider',
  'spacer',
  // Layout
  'container',
  'section',
  'two_column',
  'three_column',
  'image_text',
  // Form fields
  'text',
  'textarea',
  'email',
  'phone',
  'number',
  'select',
  'radio',
  'checkbox',
  'yes_no',
  'date',
  'time',
  'url',
  'rating',
  'scale',
  'file_upload',
];

let rcIdCounter = 0;
export function makeReusableId(prefix: 'rcdef' | 'slot' | 'prop'): string {
  rcIdCounter = (rcIdCounter + 1) % 100000;
  return `${prefix}_${Date.now().toString(36).slice(-5)}${Math.random()
    .toString(36)
    .slice(2, 6)}${rcIdCounter.toString(36)}`;
}

/**
 * Validates URLs for links, buttons, and media inside reusable components.
 * Allows https:, http:, mailto:, and safe relative anchors (#section) while blocking
 * javascript:, data:, vbscript:, etc.
 */
export function isSafeReusableUrl(raw: string | undefined): boolean {
  if (!raw || !raw.trim()) return true;
  const trimmed = raw.trim();
  if (trimmed.startsWith('#') && !trimmed.includes('javascript:')) return true;
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(trimmed)) return true;
  return isSafeHttpUrl(trimmed);
}

/**
 * Validates and coerces an override value against its typed property definition.
 * Rejects unsafe URLs and incompatible types cleanly.
 */
export function coerceReusablePropValue(
  prop: ReusablePropDefinition,
  rawValue: unknown
): { valid: boolean; value: string | number | boolean; error?: string } {
  switch (prop.type) {
    case 'text':
    case 'textarea':
    case 'button_label': {
      return { valid: true, value: rawValue === undefined || rawValue === null ? '' : String(rawValue) };
    }
    case 'url':
    case 'image_url': {
      const str = rawValue === undefined || rawValue === null ? '' : String(rawValue).trim();
      if (str && !isSafeReusableUrl(str)) {
        return {
          valid: false,
          value: String(prop.defaultValue ?? ''),
          error: 'Only safe http://, https://, or mailto: URLs are allowed.',
        };
      }
      return { valid: true, value: str };
    }
    case 'color': {
      const str = String(rawValue ?? '').trim();
      if (!str) return { valid: true, value: '' };
      if (!/^(#[0-9a-fA-F]{3,8}|rgba?\([^)]{1,40}\)|transparent)$/.test(str)) {
        return {
          valid: false,
          value: String(prop.defaultValue ?? ''),
          error: 'Enter a valid hex or rgb() colour.',
        };
      }
      return { valid: true, value: str };
    }
    case 'alignment': {
      const str = String(rawValue ?? 'left');
      if (str !== 'left' && str !== 'center' && str !== 'right') {
        return { valid: false, value: 'left', error: 'Alignment must be left, center, or right.' };
      }
      return { valid: true, value: str };
    }
    case 'spacing': {
      const str = String(rawValue ?? 'md');
      if (str !== 'none' && str !== 'sm' && str !== 'md' && str !== 'lg') {
        return { valid: false, value: 'md', error: 'Spacing must be none, sm, md, or lg.' };
      }
      return { valid: true, value: str };
    }
    case 'layout_columns': {
      const num = Number(rawValue);
      if (num !== 1 && num !== 2 && num !== 3) {
        return { valid: false, value: 1, error: 'Columns must be 1, 2, or 3.' };
      }
      return { valid: true, value: num };
    }
    case 'visibility': {
      return { valid: true, value: Boolean(rawValue) };
    }
    default:
      return { valid: true, value: String(rawValue ?? '') };
  }
}

export function cloneReusableDefinition(
  def: ReusableComponentDefinition
): ReusableComponentDefinition {
  return JSON.parse(JSON.stringify(def)) as ReusableComponentDefinition;
}

export interface CreateReusableDefinitionInput {
  id?: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  ownerId?: string;
  rootLayout?: Partial<ComponentLayoutProps>;
  rootAppearance?: Partial<ComponentAppearanceProps>;
  hiddenByDefault?: boolean;
  slots: ReusableSlotNode[];
  props?: ReusablePropDefinition[];
}

/**
 * Creates a clean, versioned (v1) ReusableComponentDefinition from an ordered list
 * of internal building blocks and optional exposed typed properties.
 */
export function createReusableComponentDefinition(
  input: CreateReusableDefinitionInput
): ReusableComponentDefinition {
  const now = new Date().toISOString();
  const id = input.id?.trim() || makeReusableId('rcdef');
  const slotsMap: Record<string, ReusableSlotNode> = {};
  const rootSlotIds: string[] = [];

  for (const rawSlot of input.slots) {
    // Disallow recursive reusable_instance nesting to prevent infinite recursion
    if (rawSlot.type === 'reusable_instance') continue;
    const slotId = rawSlot.slotId?.trim() || makeReusableId('slot');
    const safeContent = {
      ...rawSlot.content,
      buttonUrl:
        rawSlot.content.buttonUrl && isSafeReusableUrl(rawSlot.content.buttonUrl)
          ? rawSlot.content.buttonUrl
          : undefined,
      mediaUrl:
        rawSlot.content.mediaUrl && isSafeReusableUrl(rawSlot.content.mediaUrl)
          ? rawSlot.content.mediaUrl
          : undefined,
      videoUrl:
        rawSlot.content.videoUrl && isSafeReusableUrl(rawSlot.content.videoUrl)
          ? rawSlot.content.videoUrl
          : undefined,
    };

    slotsMap[slotId] = {
      slotId,
      type: rawSlot.type,
      parentSlotId: rawSlot.parentSlotId ?? null,
      childrenSlotIds: rawSlot.childrenSlotIds ? [...rawSlot.childrenSlotIds] : undefined,
      content: safeContent,
      appearance: { ...(rawSlot.appearance || {}) },
      layout: {
        ...(rawSlot.layout || {}),
        width: rawSlot.layout?.width || 'full',
      },
      behaviour: { ...(rawSlot.behaviour || {}) },
      validation: { ...(rawSlot.validation || {}) },
    };

    if (!rawSlot.parentSlotId) {
      rootSlotIds.push(slotId);
    }
  }

  // Ensure every parent slot lists its children accurately
  for (const slot of Object.values(slotsMap)) {
    if (slot.parentSlotId && slotsMap[slot.parentSlotId]) {
      const parent = slotsMap[slot.parentSlotId];
      const children = Array.isArray(parent.childrenSlotIds) ? [...parent.childrenSlotIds] : [];
      if (!children.includes(slot.slotId)) {
        children.push(slot.slotId);
        parent.childrenSlotIds = children;
      }
    }
  }

  const normalizedProps: ReusablePropDefinition[] = (input.props || []).map((p) => {
    const coerced = coerceReusablePropValue(p, p.defaultValue);
    return {
      ...p,
      id: p.id || makeReusableId('prop'),
      key: p.key.trim() || makeReusableId('prop'),
      label: p.label.trim() || p.key,
      defaultValue: coerced.value,
    };
  });

  return {
    schemaVersion: COMPONENT_LIBRARY_SCHEMA_VERSION,
    id,
    version: 1,
    name: input.name.trim() || 'Untitled Component',
    description: (input.description || '').trim(),
    category: (input.category || DEFAULT_REUSABLE_CATEGORIES[4]).trim(),
    tags: input.tags ? Array.from(new Set(input.tags.map((t) => t.trim()).filter(Boolean))) : [],
    ownerId: input.ownerId,
    rootLayout: {
      width: input.rootLayout?.width || 'full',
      columns: input.rootLayout?.columns || 1,
      gap: input.rootLayout?.gap || 'md',
      padding: input.rootLayout?.padding || 'md',
      margin: input.rootLayout?.margin || 'none',
      alignment: input.rootLayout?.alignment || 'left',
      responsive: input.rootLayout?.responsive
        ? JSON.parse(JSON.stringify(input.rootLayout.responsive))
        : undefined,
    },
    rootAppearance: {
      backgroundColor: '#FFFFFF',
      borderColor: '#E5E7EB',
      borderWidth: '1',
      borderRadius: 'md',
      shadow: 'none',
      textAlign: 'left',
      ...(input.rootAppearance || {}),
    },
    hiddenByDefault: Boolean(input.hiddenByDefault),
    rootSlotIds,
    slots: slotsMap,
    props: normalizedProps,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Updates an existing ReusableComponentDefinition and automatically bumps its
 * integer `version` so existing linked instances know an update is available
 * without silently overwriting their local customisations.
 */
export function updateReusableComponentDefinition(
  existing: ReusableComponentDefinition,
  patch: Partial<
    Pick<
      ReusableComponentDefinition,
      | 'name'
      | 'description'
      | 'category'
      | 'tags'
      | 'rootLayout'
      | 'rootAppearance'
      | 'hiddenByDefault'
      | 'rootSlotIds'
      | 'slots'
      | 'props'
    >
  >,
  options?: { bumpVersion?: boolean }
): ReusableComponentDefinition {
  const shouldBump = options?.bumpVersion !== false;
  const nextSlots = patch.slots
    ? JSON.parse(JSON.stringify(patch.slots))
    : JSON.parse(JSON.stringify(existing.slots));

  // Sanitize any slot URLs on save
  for (const slot of Object.values(nextSlots) as ReusableSlotNode[]) {
    if (slot.content?.buttonUrl && !isSafeReusableUrl(slot.content.buttonUrl)) {
      slot.content.buttonUrl = undefined;
    }
    if (slot.content?.mediaUrl && !isSafeReusableUrl(slot.content.mediaUrl)) {
      slot.content.mediaUrl = undefined;
    }
    if (slot.content?.videoUrl && !isSafeReusableUrl(slot.content.videoUrl)) {
      slot.content.videoUrl = undefined;
    }
  }

  const nextProps: ReusablePropDefinition[] = (patch.props ?? existing.props).map((p) => {
    const coerced = coerceReusablePropValue(p, p.defaultValue);
    return {
      ...p,
      defaultValue: coerced.value,
    };
  });

  return {
    ...existing,
    schemaVersion: COMPONENT_LIBRARY_SCHEMA_VERSION,
    version: shouldBump ? existing.version + 1 : existing.version,
    name: patch.name !== undefined ? patch.name.trim() || existing.name : existing.name,
    description:
      patch.description !== undefined ? patch.description.trim() : existing.description,
    category:
      patch.category !== undefined ? patch.category.trim() || existing.category : existing.category,
    tags: patch.tags !== undefined ? [...patch.tags] : existing.tags,
    rootLayout: patch.rootLayout
      ? {
          ...existing.rootLayout,
          ...patch.rootLayout,
          responsive: patch.rootLayout.responsive
            ? JSON.parse(JSON.stringify(patch.rootLayout.responsive))
            : existing.rootLayout.responsive,
        }
      : existing.rootLayout,
    rootAppearance: patch.rootAppearance
      ? { ...existing.rootAppearance, ...patch.rootAppearance }
      : existing.rootAppearance,
    hiddenByDefault:
      patch.hiddenByDefault !== undefined ? patch.hiddenByDefault : existing.hiddenByDefault,
    rootSlotIds: patch.rootSlotIds ? [...patch.rootSlotIds] : [...existing.rootSlotIds],
    slots: nextSlots,
    props: nextProps,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Duplicates a reusable component definition with a brand-new stable ID and version 1.
 */
export function duplicateReusableComponentDefinition(
  source: ReusableComponentDefinition,
  newName?: string
): ReusableComponentDefinition {
  const now = new Date().toISOString();
  const cloned = cloneReusableDefinition(source);
  return {
    ...cloned,
    id: makeReusableId('rcdef'),
    version: 1,
    name: newName?.trim() || `${source.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Converts any existing canvas block or layout container (including nested children)
 * directly into a ReusableComponentDefinition, automatically exposing sensible
 * starter properties (e.g., main heading, body text, image URL, button label/URL).
 */
export function extractDefinitionFromCanvasNode(
  doc: FormDocument,
  nodeId: string,
  meta: {
    name?: string;
    description?: string;
    category?: string;
    ownerId?: string;
  } = {}
): ReusableComponentDefinition | null {
  const root = doc.components[nodeId];
  if (!root || root.type === 'reusable_instance') return null;

  const isContainerRoot = Array.isArray(root.children) && root.children.length > 0;
  const slots: ReusableSlotNode[] = [];
  const autoProps: ReusablePropDefinition[] = [];
  const idToSlotId = new Map<string, string>();

  const collectNode = (
    comp: FormComponentNode,
    parentSlotId: string | null,
    indexHint: number
  ) => {
    if (comp.type === 'reusable_instance') return;
    const slotId = `slot_${indexHint}_${comp.type}`;
    idToSlotId.set(comp.id, slotId);

    const childSlotIds: string[] = [];
    if (Array.isArray(comp.children) && comp.children.length > 0) {
      comp.children.forEach((cid, idx) => {
        const child = doc.components[cid];
        if (!child || child.type === 'reusable_instance') return;
        const nextSlotId = `slot_${indexHint}_${idx}_${child.type}`;
        childSlotIds.push(nextSlotId);
      });
    }

    slots.push({
      slotId,
      type: comp.type,
      parentSlotId,
      childrenSlotIds: childSlotIds.length > 0 ? childSlotIds : undefined,
      content: JSON.parse(JSON.stringify(comp.content)),
      appearance: JSON.parse(JSON.stringify(comp.appearance)),
      layout: JSON.parse(JSON.stringify(comp.layout)),
      behaviour: JSON.parse(JSON.stringify(comp.behaviour)),
      validation: JSON.parse(JSON.stringify(comp.validation)),
    });

    // Auto-expose high-value starter props (up to 4) for immediate inspector customisability
    if (autoProps.length < 4) {
      if (comp.type === 'heading' || comp.type === 'statement') {
        autoProps.push({
          id: makeReusableId('prop'),
          key: `heading_${slots.length}`,
          label: 'Heading Text',
          type: 'text',
          defaultValue: comp.content.label || '',
          binding: { scope: 'slot', slotId, property: 'label' },
        });
      } else if (comp.type === 'paragraph' || comp.type === 'rich_text') {
        autoProps.push({
          id: makeReusableId('prop'),
          key: `body_${slots.length}`,
          label: 'Body Copy',
          type: 'textarea',
          defaultValue: comp.content.body || '',
          binding: { scope: 'slot', slotId, property: 'body' },
        });
      } else if (comp.type === 'image') {
        autoProps.push({
          id: makeReusableId('prop'),
          key: `image_${slots.length}`,
          label: 'Image URL',
          type: 'image_url',
          defaultValue: comp.content.mediaUrl || '',
          binding: { scope: 'slot', slotId, property: 'mediaUrl' },
        });
      } else if (comp.type === 'button_link') {
        autoProps.push({
          id: makeReusableId('prop'),
          key: `cta_label_${slots.length}`,
          label: 'Button Label',
          type: 'button_label',
          defaultValue: comp.content.label || 'Learn more',
          binding: { scope: 'slot', slotId, property: 'label' },
        });
        autoProps.push({
          id: makeReusableId('prop'),
          key: `cta_url_${slots.length}`,
          label: 'Button URL',
          type: 'url',
          defaultValue: comp.content.buttonUrl || '',
          binding: { scope: 'slot', slotId, property: 'buttonUrl' },
        });
      }
    }

    if (Array.isArray(comp.children) && comp.children.length > 0) {
      comp.children.forEach((cid, idx) => {
        const child = doc.components[cid];
        if (child) collectNode(child, slotId, indexHint * 10 + idx + 1);
      });
    }
  };

  if (isContainerRoot) {
    // Hoist container's own layout/appearance to root wrapper and extract its children as root slots
    root.children!.forEach((cid, idx) => {
      const child = doc.components[cid];
      if (child) collectNode(child, null, idx + 1);
    });
  } else {
    collectNode(root, null, 1);
  }

  return createReusableComponentDefinition({
    name: meta.name?.trim() || root.content.label || 'Saved Component',
    description:
      meta.description ??
      `Reusable ${isContainerRoot ? 'section' : root.type.replace(/_/g, ' ')} saved from canvas`,
    category: meta.category || DEFAULT_REUSABLE_CATEGORIES[4],
    ownerId: meta.ownerId || doc.metadata.ownerId,
    rootLayout: isContainerRoot
      ? {
          width: root.layout.width || 'full',
          columns:
            root.type === 'two_column'
              ? 2
              : root.type === 'three_column'
              ? 3
              : root.layout.columns || 1,
          gap: root.layout.gap || 'md',
          padding: root.layout.padding || 'md',
          margin: root.layout.margin || 'none',
          alignment: root.layout.alignment || 'left',
          responsive: root.layout.responsive,
        }
      : {
          width: root.layout.width || 'full',
          columns: 1,
          gap: 'md',
          padding: 'md',
        },
    rootAppearance: isContainerRoot
      ? { ...root.appearance }
      : {
          backgroundColor: root.appearance.backgroundColor || '#FFFFFF',
          borderColor: root.appearance.borderColor || '#E5E7EB',
          borderWidth: root.appearance.borderWidth || '1',
          borderRadius: root.appearance.borderRadius || 'md',
          textAlign: root.appearance.textAlign || 'left',
        },
    hiddenByDefault: root.behaviour.hiddenByDefault,
    slots,
    props: autoProps,
  });
}

/**
 * Builds deterministic answer/node IDs for internal slots of a reusable component instance.
 * Guarantees two instances of the same reusable component never collide in answers or validation.
 */
export function buildReusableSlotNodeId(instanceId: string, slotId: string): string {
  return `${instanceId}__${slotId}`;
}

export type ReusableInstanceStatus =
  | 'up_to_date'
  | 'update_available'
  | 'detached'
  | 'missing_definition';

export interface ResolvedReusableInstance {
  status: ReusableInstanceStatus;
  definition: ReusableComponentDefinition | null;
  latestDefinition: ReusableComponentDefinition | null;
  definitionName: string;
  activeVersion: number;
  latestVersion: number | null;
  hasLocalOverrides: boolean;
  isHidden: boolean;
  rootLayout: ComponentLayoutProps;
  rootAppearance: ComponentAppearanceProps;
  /** Resolved top-level internal node IDs (deterministic `${instanceId}__${slotId}`) */
  rootNodeIds: string[];
  /** Concrete FormComponentNode map for rendering & validation */
  nodesById: Record<string, FormComponentNode>;
  /** Effective values for all exposed properties after applying propOverrides */
  effectivePropValues: Record<string, string | number | boolean>;
  /** Effective grid columns for the active viewport */
  effectiveColumns: 1 | 2 | 3;
}

function getEffectiveDefinitionForInstance(
  config: ReusableInstanceConfig,
  definitionsMap?: Record<string, ReusableComponentDefinition>
): {
  activeDef: ReusableComponentDefinition | null;
  latestDef: ReusableComponentDefinition | null;
  status: ReusableInstanceStatus;
} {
  const latestDef = definitionsMap?.[config.definitionId] || null;

  if (config.syncMode === 'detached') {
    const active = config.fallbackDefinition || latestDef;
    return {
      activeDef: active,
      latestDef,
      status: active ? 'detached' : 'missing_definition',
    };
  }

  if (!latestDef) {
    return {
      activeDef: config.fallbackDefinition || null,
      latestDef: null,
      status: 'missing_definition',
    };
  }

  // Non-destructive versioning guarantee:
  // If the master definition has moved ahead (latestDef.version > config.definitionVersion)
  // AND the instance has a pinned snapshot (fallbackDefinition), continue rendering the
  // pinned snapshot until the creator explicitly clicks "Update Instance" — preventing
  // silent global overwrites of customised instances!
  if (latestDef.version > config.definitionVersion) {
    return {
      activeDef: config.fallbackDefinition || latestDef,
      latestDef,
      status: 'update_available',
    };
  }

  return {
    activeDef: latestDef,
    latestDef,
    status: 'up_to_date',
  };
}

/**
 * Resolves a `reusable_instance` node into concrete `FormComponentNode`s and effective
 * container layout/styling by applying:
 *   1. Active ReusableComponentDefinition defaults
 *   2. Typed `propOverrides` (validated & coerced)
 *   3. Per-slot `slotOverrides`
 *   4. Responsive viewport rules (`desktop` | `tablet` | `mobile`)
 */
export function resolveReusableInstance(
  instanceNode: FormComponentNode,
  definitionsMap?: Record<string, ReusableComponentDefinition>,
  viewport: BreakpointKey = 'desktop'
): ResolvedReusableInstance {
  const config = instanceNode.reusableInstance;
  if (!config) {
    return {
      status: 'missing_definition',
      definition: null,
      latestDefinition: null,
      definitionName: instanceNode.content.label || 'Reusable Component',
      activeVersion: 0,
      latestVersion: null,
      hasLocalOverrides: false,
      isHidden: false,
      rootLayout: { width: 'full', columns: 1, gap: 'md', padding: 'md' },
      rootAppearance: {},
      rootNodeIds: [],
      nodesById: {},
      effectivePropValues: {},
      effectiveColumns: 1,
    };
  }

  const { activeDef, latestDef, status } = getEffectiveDefinitionForInstance(
    config,
    definitionsMap
  );

  const hasLocalOverrides =
    Object.keys(config.propOverrides || {}).length > 0 ||
    Object.keys(config.slotOverrides || {}).length > 0;

  if (!activeDef) {
    return {
      status: 'missing_definition',
      definition: null,
      latestDefinition: null,
      definitionName: config.definitionNameSnapshot || 'Deleted Component',
      activeVersion: config.definitionVersion,
      latestVersion: null,
      hasLocalOverrides,
      isHidden: false,
      rootLayout: { width: 'full', columns: 1, gap: 'md', padding: 'md' },
      rootAppearance: {},
      rootNodeIds: [],
      nodesById: {},
      effectivePropValues: {},
      effectiveColumns: 1,
    };
  }

  const rootLayout: ComponentLayoutProps = {
    ...activeDef.rootLayout,
    ...(instanceNode.layout?.width ? { width: instanceNode.layout.width } : {}),
  };
  const rootAppearance: ComponentAppearanceProps = {
    ...activeDef.rootAppearance,
    ...(instanceNode.appearance || {}),
  };

  let rootHidden = Boolean(activeDef.hiddenByDefault || instanceNode.behaviour?.hiddenByDefault);
  const effectivePropValues: Record<string, string | number | boolean> = {};

  // Build mutable slot clones before applying prop bindings & slot overrides
  const workingSlots: Record<string, ReusableSlotNode> = {};
  const hiddenSlotIds = new Set<string>();
  for (const [slotId, slot] of Object.entries(activeDef.slots)) {
    workingSlots[slotId] = JSON.parse(JSON.stringify(slot)) as ReusableSlotNode;
    if (slot.behaviour?.hiddenByDefault) {
      hiddenSlotIds.add(slotId);
    }
  }

  // Step 1: Apply exposed typed properties (defaults overridden by instance propOverrides)
  for (const prop of activeDef.props || []) {
    const hasOverride = Object.prototype.hasOwnProperty.call(config.propOverrides || {}, prop.key);
    const rawVal = hasOverride ? config.propOverrides[prop.key] : prop.defaultValue;
    const coerced = coerceReusablePropValue(prop, rawVal);
    const val = coerced.value;
    effectivePropValues[prop.key] = val;

    const binding = prop.binding;
    if (binding.scope === 'root') {
      switch (binding.property) {
        case 'backgroundColor':
          if (typeof val === 'string') rootAppearance.backgroundColor = val;
          break;
        case 'borderColor':
          if (typeof val === 'string') rootAppearance.borderColor = val;
          break;
        case 'textColor':
          if (typeof val === 'string') rootAppearance.textColor = val;
          break;
        case 'textAlign':
          rootAppearance.textAlign = val as TextAlign;
          rootLayout.alignment = val as TextAlign;
          break;
        case 'padding':
          rootLayout.padding = val as SpacingToken;
          break;
        case 'gap':
          rootLayout.gap = val as SpacingToken;
          break;
        case 'columns':
          rootLayout.columns = Number(val) as 1 | 2 | 3;
          break;
        case 'visible':
          rootHidden = !Boolean(val);
          break;
      }
    } else if (binding.scope === 'slot') {
      const targetSlot = workingSlots[binding.slotId];
      if (!targetSlot) continue;
      switch (binding.property) {
        case 'label':
          targetSlot.content.label = String(val);
          break;
        case 'body':
          targetSlot.content.body = String(val);
          break;
        case 'helpText':
          targetSlot.content.helpText = String(val);
          break;
        case 'placeholder':
          targetSlot.content.placeholder = String(val);
          break;
        case 'mediaUrl':
          if (typeof val === 'string' && isSafeReusableUrl(val)) {
            targetSlot.content.mediaUrl = val;
          }
          break;
        case 'mediaAlt':
          targetSlot.content.mediaAlt = String(val);
          break;
        case 'videoUrl':
          if (typeof val === 'string' && isSafeReusableUrl(val)) {
            targetSlot.content.videoUrl = val;
          }
          break;
        case 'buttonUrl':
          if (typeof val === 'string' && isSafeReusableUrl(val)) {
            targetSlot.content.buttonUrl = val;
          }
          break;
        case 'textColor':
          if (typeof val === 'string') targetSlot.appearance.textColor = val;
          break;
        case 'backgroundColor':
          if (typeof val === 'string') targetSlot.appearance.backgroundColor = val;
          break;
        case 'textAlign':
          targetSlot.appearance.textAlign = val as TextAlign;
          break;
        case 'visible':
          if (!Boolean(val)) {
            hiddenSlotIds.add(binding.slotId);
          } else {
            hiddenSlotIds.delete(binding.slotId);
          }
          break;
      }
    }
  }

  // Step 2: Apply fine-grained per-slot local overrides
  for (const [slotId, override] of Object.entries(config.slotOverrides || {})) {
    const slot = workingSlots[slotId];
    if (!slot || !override) continue;
    if (override.hidden === true) {
      hiddenSlotIds.add(slotId);
    } else if (override.hidden === false) {
      hiddenSlotIds.delete(slotId);
    }
    if (override.content) {
      const safePatch = { ...override.content };
      if (safePatch.buttonUrl && !isSafeReusableUrl(safePatch.buttonUrl)) {
        delete safePatch.buttonUrl;
      }
      if (safePatch.mediaUrl && !isSafeReusableUrl(safePatch.mediaUrl)) {
        delete safePatch.mediaUrl;
      }
      if (safePatch.videoUrl && !isSafeReusableUrl(safePatch.videoUrl)) {
        delete safePatch.videoUrl;
      }
      slot.content = { ...slot.content, ...safePatch };
    }
    if (override.appearance) {
      slot.appearance = { ...slot.appearance, ...override.appearance };
    }
    if (override.layout) {
      slot.layout = { ...slot.layout, ...override.layout };
    }
    if (override.validation) {
      slot.validation = { ...slot.validation, ...override.validation };
    }
  }

  // Step 3: Apply responsive overrides for active viewport
  const responsiveRoot = rootLayout.responsive?.[viewport];
  if (responsiveRoot?.hidden) {
    rootHidden = true;
  }
  if (responsiveRoot?.padding) {
    rootLayout.padding = responsiveRoot.padding;
  }
  if (responsiveRoot?.textAlign) {
    rootAppearance.textAlign = responsiveRoot.textAlign;
  }

  const baseColumns = responsiveRoot?.columns || rootLayout.columns || 1;
  // Automatic mobile responsiveness: multi-column reusable blocks stack to 1 col on mobile unless explicitly overridden
  const effectiveColumns: 1 | 2 | 3 =
    viewport === 'mobile' && !responsiveRoot?.columns
      ? 1
      : viewport === 'tablet' && !responsiveRoot?.columns && baseColumns === 3
      ? 2
      : baseColumns;

  // Step 4: Materialize concrete FormComponentNodes with deterministic instance-scoped IDs
  const nodesById: Record<string, FormComponentNode> = {};
  for (const [slotId, slot] of Object.entries(workingSlots)) {
    if (hiddenSlotIds.has(slotId)) continue;
    if (slot.layout.responsive?.[viewport]?.hidden) continue;

    const concreteId = buildReusableSlotNodeId(instanceNode.id, slotId);
    const parentConcreteId = slot.parentSlotId
      ? buildReusableSlotNodeId(instanceNode.id, slot.parentSlotId)
      : null;

    const concreteChildIds = slot.childrenSlotIds
      ? slot.childrenSlotIds
          .filter((cid) => !hiddenSlotIds.has(cid) && Boolean(workingSlots[cid]))
          .map((cid) => buildReusableSlotNodeId(instanceNode.id, cid))
      : undefined;

    nodesById[concreteId] = {
      id: concreteId,
      type: slot.type,
      pageId: instanceNode.pageId,
      parentId: parentConcreteId,
      children: concreteChildIds,
      content: slot.content,
      appearance: slot.appearance,
      layout: slot.layout,
      behaviour: slot.behaviour,
      validation: slot.validation,
    };
  }

  const rootNodeIds = (activeDef.rootSlotIds || [])
    .filter((sid) => !hiddenSlotIds.has(sid))
    .map((sid) => buildReusableSlotNodeId(instanceNode.id, sid))
    .filter((id) => Boolean(nodesById[id]));

  return {
    status,
    definition: activeDef,
    latestDefinition: latestDef,
    definitionName: activeDef.name || config.definitionNameSnapshot,
    activeVersion: activeDef.version,
    latestVersion: latestDef ? latestDef.version : null,
    hasLocalOverrides,
    isHidden: rootHidden,
    rootLayout,
    rootAppearance,
    rootNodeIds,
    nodesById,
    effectivePropValues,
    effectiveColumns,
  };
}

/**
 * Returns all interactive question nodes living inside visible reusable component instances
 * across the document (or for a specific subset of visible component IDs).
 *
 * Ensures form fields embedded inside custom reusable components NEVER bypass
 * required checks, format validations, hidden-field policies, or submission sanitization.
 */
export function getExpandedReusableQuestionNodes(
  doc: FormDocument,
  options?: {
    visibleComponentIds?: Set<string>;
    disabledComponentIds?: Set<string>;
    viewport?: BreakpointKey;
    onlyForInstanceIds?: Set<string>;
  }
): Array<{ node: FormComponentNode; instanceId: string; disabled: boolean }> {
  const result: Array<{ node: FormComponentNode; instanceId: string; disabled: boolean }> = [];

  for (const comp of Object.values(doc.components)) {
    if (comp.type !== 'reusable_instance') continue;
    if (options?.onlyForInstanceIds && !options.onlyForInstanceIds.has(comp.id)) continue;
    if (options?.visibleComponentIds && !options.visibleComponentIds.has(comp.id)) continue;

    const resolved = resolveReusableInstance(
      comp,
      doc.componentDefinitions,
      options?.viewport || 'desktop'
    );
    if (resolved.isHidden) continue;

    const instanceDisabled = Boolean(options?.disabledComponentIds?.has(comp.id));

    for (const internalNode of Object.values(resolved.nodesById)) {
      if (!isInteractiveQuestionComponent(internalNode)) continue;
      result.push({
        node: internalNode,
        instanceId: comp.id,
        disabled: instanceDisabled || Boolean(internalNode.behaviour.readOnly),
      });
    }
  }

  return result;
}

/**
 * Collects all instance node IDs in a FormDocument referencing a given definition ID.
 */
export function listInstanceIdsForDefinition(
  doc: FormDocument,
  definitionId: string
): string[] {
  return Object.values(doc.components)
    .filter(
      (n) =>
        n.type === 'reusable_instance' && n.reusableInstance?.definitionId === definitionId
    )
    .map((n) => n.id);
}

/**
 * Returns a map containing ONLY the reusable component definitions actively referenced
 * by at least one `reusable_instance` node in the document.
 * Prevents unused definition bloat in published/persisted forms.
 */
export function collectReferencedDefinitions(
  doc: FormDocument
): Record<string, ReusableComponentDefinition> {
  const referenced: Record<string, ReusableComponentDefinition> = {};
  for (const comp of Object.values(doc.components)) {
    if (comp.type !== 'reusable_instance' || !comp.reusableInstance) continue;
    const defId = comp.reusableInstance.definitionId;
    const def = doc.componentDefinitions?.[defId];
    if (def) {
      referenced[defId] = cloneReusableDefinition(def);
    }
  }
  return referenced;
}

/**
 * Filters a list of reusable component definitions by search query and category.
 */
export function filterReusableDefinitions(
  definitions: ReusableComponentDefinition[],
  searchQuery = '',
  category = 'All'
): ReusableComponentDefinition[] {
  const q = searchQuery.trim().toLowerCase();
  const cat = category.trim();

  return definitions.filter((def) => {
    if (cat && cat !== 'All' && def.category !== cat) return false;
    if (!q) return true;
    return (
      def.name.toLowerCase().includes(q) ||
      def.description.toLowerCase().includes(q) ||
      def.category.toLowerCase().includes(q) ||
      (def.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  });
}

/**
 * Creates a clean ReusableInstanceConfig for inserting a definition onto a form canvas.
 */
export function createReusableInstanceConfig(
  definition: ReusableComponentDefinition
): ReusableInstanceConfig {
  return {
    definitionId: definition.id,
    definitionVersion: definition.version,
    definitionNameSnapshot: definition.name,
    syncMode: 'linked',
    propOverrides: {},
    slotOverrides: {},
    fallbackDefinition: cloneReusableDefinition(definition),
  };
}
