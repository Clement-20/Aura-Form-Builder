/**
 * FlexStore / AuraForm Studio — Central Component Registry
 *
 * Manages registration, lookup, search, categorization, and factory instantiation
 * of all form components. Adding a new component type requires only registering
 * a FormComponentDefinition—no modifications to core editor or runner logic.
 */

import {
  ComponentAppearanceProps,
  ComponentBehaviourProps,
  ComponentContentProps,
  ComponentLayoutProps,
  ComponentValidationProps,
  FormComponentNode,
  FormComponentType,
} from '../document/types';
import {
  ComponentCategory,
  ComponentCategoryGroup,
  FormComponentDefinition,
} from './types';

const CATEGORY_ORDER: { id: ComponentCategory; label: string }[] = [
  { id: 'content', label: 'Content' },
  { id: 'fields', label: 'Form Fields' },
  { id: 'layout', label: 'Layout' },
  { id: 'other', label: 'Other' },
];

export interface CreateNodeOverrides {
  id?: string;
  parentId?: string | null;
  content?: Partial<ComponentContentProps>;
  appearance?: Partial<ComponentAppearanceProps>;
  layout?: Partial<ComponentLayoutProps>;
  behaviour?: Partial<ComponentBehaviourProps>;
  validation?: Partial<ComponentValidationProps>;
}

export class ComponentRegistry {
  private readonly definitions = new Map<FormComponentType, FormComponentDefinition>();

  register(definition: FormComponentDefinition): this {
    this.definitions.set(definition.type, definition);
    return this;
  }

  registerMany(definitions: FormComponentDefinition[]): this {
    for (const def of definitions) {
      this.register(def);
    }
    return this;
  }

  unregister(type: FormComponentType): boolean {
    return this.definitions.delete(type);
  }

  get(type: FormComponentType): FormComponentDefinition | undefined {
    return this.definitions.get(type);
  }

  has(type: FormComponentType): boolean {
    return this.definitions.has(type);
  }

  isContainer(type: FormComponentType): boolean {
    return Boolean(this.definitions.get(type)?.isContainer);
  }

  list(): FormComponentDefinition[] {
    return Array.from(this.definitions.values());
  }

  listInsertable(): FormComponentDefinition[] {
    return this.list().filter((def) => !def.specialAction && !def.hiddenFromPalette);
  }

  listByCategory(searchQuery = ''): ComponentCategoryGroup[] {
    const q = searchQuery.trim().toLowerCase();
    const all = this.list().filter((def) => {
      if (def.hiddenFromPalette) return false;
      if (!q) return true;
      return (
        def.displayName.toLowerCase().includes(q) ||
        def.shortLabel.toLowerCase().includes(q) ||
        def.hint.toLowerCase().includes(q) ||
        def.type.toLowerCase().includes(q) ||
        (def.keywords || []).some((kw) => kw.toLowerCase().includes(q))
      );
    });

    return CATEGORY_ORDER.map(({ id, label }) => ({
      id,
      label,
      components: all.filter((def) => def.category === id),
    })).filter((group) => group.components.length > 0);
  }

  /**
   * Instantiates a fresh, immutable FormComponentNode with a stable unique ID
   * populated from the registered component's defaults plus optional overrides.
   */
  createComponentNode(
    type: FormComponentType,
    pageId: string,
    overrides?: CreateNodeOverrides
  ): FormComponentNode {
    const def = this.definitions.get(type);
    const id =
      overrides?.id ||
      `c_${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 7)}`;

    const defaultContent: ComponentContentProps = def
      ? {
          ...def.defaultContent,
          options: def.defaultContent.options ? [...def.defaultContent.options] : undefined,
        }
      : { label: 'Untitled Block' };

    const defaultAppearance: ComponentAppearanceProps = def
      ? { ...def.defaultAppearance }
      : { textAlign: 'left' };

    const defaultLayout: ComponentLayoutProps = def
      ? { ...def.defaultLayout }
      : { width: 'full', padding: 'none', margin: 'none' };

    const defaultBehaviour: ComponentBehaviourProps = def ? { ...def.defaultBehaviour } : {};

    const defaultValidation: ComponentValidationProps = def
      ? { ...def.defaultValidation }
      : { required: false };

    return {
      id,
      type,
      pageId,
      parentId: overrides?.parentId ?? null,
      children: def?.isContainer ? [] : undefined,
      content: {
        ...defaultContent,
        ...(overrides?.content || {}),
      },
      appearance: {
        ...defaultAppearance,
        ...(overrides?.appearance || {}),
      },
      layout: {
        ...defaultLayout,
        ...(overrides?.layout || {}),
      },
      behaviour: {
        ...defaultBehaviour,
        ...(overrides?.behaviour || {}),
      },
      validation: {
        ...defaultValidation,
        ...(overrides?.validation || {}),
      },
    };
  }

  /**
   * Creates an isolated clone of this registry (useful in tests or plugin sandboxes).
   */
  clone(): ComponentRegistry {
    const next = new ComponentRegistry();
    next.registerMany(this.list());
    return next;
  }
}
