import React, { useMemo, useState } from 'react';
import {
  X,
  Plus,
  Trash,
  ArrowUp,
  ArrowDown,
  Copy,
  Cube,
  Sliders,
  Palette,
  SquaresFour,
  Desktop,
  DeviceTablet,
  DeviceMobile,
  Check,
  Eye,
  EyeSlash,
  WarningCircle,
  Sparkle,
} from '@phosphor-icons/react';
import {
  ALLOWED_REUSABLE_BUILDING_BLOCKS,
  BreakpointKey,
  coerceReusablePropValue,
  createReusableComponentDefinition,
  createReusableInstanceConfig,
  DEFAULT_REUSABLE_CATEGORIES,
  DOCUMENT_SCHEMA_VERSION,
  FormComponentNode,
  FormComponentType,
  FormDocument,
  formComponentRegistry,
  FormDocumentRenderer,
  isSafeReusableUrl,
  makeReusableId,
  RegisteredComponentIcon,
  ReusableComponentDefinition,
  ReusablePropBindingTarget,
  ReusablePropDefinition,
  ReusablePropType,
  ReusableSlotNode,
  SpacingToken,
  TextAlign,
  updateReusableComponentDefinition,
} from '../../studio';

interface ReusableComponentBuilderModalProps {
  isOpen: boolean;
  /** Existing definition when editing; null/undefined when creating a new component */
  initialDefinition?: ReusableComponentDefinition | null;
  /** Current form document (used to inherit live design tokens in preview and show instance usage count) */
  document: FormDocument;
  /** Current creator ID for owner-scoped cross-form library */
  ownerId?: string;
  /** Number of linked instances on the current form referencing this definition */
  linkedInstanceCount?: number;
  onClose: () => void;
  onSave: (
    savedDefinition: ReusableComponentDefinition,
    options: { insertAfterSave?: boolean; syncLinkedInstances?: boolean }
  ) => void;
}

const PROP_TYPE_OPTIONS: { value: ReusablePropType; label: string }[] = [
  { value: 'text', label: 'Short Text' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'image_url', label: 'Image Source (URL)' },
  { value: 'button_label', label: 'Button Label' },
  { value: 'url', label: 'Link URL' },
  { value: 'color', label: 'Colour' },
  { value: 'alignment', label: 'Alignment' },
  { value: 'spacing', label: 'Spacing' },
  { value: 'layout_columns', label: 'Columns (1–3)' },
  { value: 'visibility', label: 'Visibility Toggle' },
];

const QUICK_ADD_GROUPS: { label: string; types: FormComponentType[] }[] = [
  {
    label: 'Content',
    types: ['heading', 'paragraph', 'rich_text', 'image', 'video', 'button_link', 'divider', 'spacer', 'custom_html'],
  },
  {
    label: 'Form Fields',
    types: ['text', 'textarea', 'email', 'phone', 'number', 'select', 'radio', 'checkbox', 'yes_no', 'date'],
  },
  {
    label: 'Layout',
    types: ['container', 'two_column', 'three_column', 'section', 'image_text'],
  },
];

function createDefaultSlotFromRegistry(type: FormComponentType): ReusableSlotNode {
  const def = formComponentRegistry.get(type);
  const slotId = makeReusableId('slot');
  return {
    slotId,
    type,
    parentSlotId: null,
    childrenSlotIds: def?.isContainer ? [] : undefined,
    content: def
      ? JSON.parse(JSON.stringify(def.defaultContent))
      : { label: 'Untitled Block' },
    appearance: def ? { ...def.defaultAppearance } : { textAlign: 'left' },
    layout: def ? { ...def.defaultLayout } : { width: 'full' },
    behaviour: def ? { ...def.defaultBehaviour } : {},
    validation: def ? { ...def.defaultValidation } : { required: false },
  };
}

function createStarterDefinition(ownerId?: string): ReusableComponentDefinition {
  const headingSlot = createDefaultSlotFromRegistry('heading');
  headingSlot.content.label = 'Featured Callout';
  headingSlot.content.helpText = 'Reusable content and fields built once, tailored per instance.';
  const paraSlot = createDefaultSlotFromRegistry('paragraph');
  paraSlot.content.body = 'Customise layout, colours, typography, and exposed properties on the left.';
  const btnSlot = createDefaultSlotFromRegistry('button_link');
  btnSlot.content.label = 'Learn More';
  btnSlot.content.buttonUrl = 'https://example.com';

  return createReusableComponentDefinition({
    name: 'Untitled Reusable Component',
    description: 'Reusable card combining heading, copy, and call-to-action button',
    category: DEFAULT_REUSABLE_CATEGORIES[0],
    ownerId,
    rootLayout: {
      width: 'full',
      columns: 1,
      gap: 'md',
      padding: 'md',
      margin: 'none',
      alignment: 'left',
    },
    rootAppearance: {
      backgroundColor: '#FFFFFF',
      borderColor: '#E5E7EB',
      borderWidth: '1',
      borderRadius: 'md',
      shadow: 'sm',
      textAlign: 'left',
    },
    slots: [headingSlot, paraSlot, btnSlot],
    props: [
      {
        id: makeReusableId('prop'),
        key: 'title',
        label: 'Headline',
        type: 'text',
        defaultValue: headingSlot.content.label,
        binding: { scope: 'slot', slotId: headingSlot.slotId, property: 'label' },
      },
      {
        id: makeReusableId('prop'),
        key: 'cta_label',
        label: 'Button Label',
        type: 'button_label',
        defaultValue: btnSlot.content.label,
        binding: { scope: 'slot', slotId: btnSlot.slotId, property: 'label' },
      },
      {
        id: makeReusableId('prop'),
        key: 'surface_bg',
        label: 'Card Background',
        type: 'color',
        defaultValue: '#FFFFFF',
        binding: { scope: 'root', property: 'backgroundColor' },
      },
    ],
  });
}

export const ReusableComponentBuilderModal: React.FC<ReusableComponentBuilderModalProps> = ({
  isOpen,
  initialDefinition,
  document,
  ownerId,
  linkedInstanceCount = 0,
  onClose,
  onSave,
}) => {
  const isEditing = Boolean(initialDefinition);

  const [draft, setDraft] = useState<ReusableComponentDefinition>(() =>
    initialDefinition
      ? JSON.parse(JSON.stringify(initialDefinition))
      : createStarterDefinition(ownerId)
  );
  const [activePane, setActivePane] = useState<'blocks' | 'design' | 'props'>('blocks');
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(
    () => draft.rootSlotIds[0] || null
  );
  const [previewViewport, setPreviewViewport] = useState<BreakpointKey>('desktop');
  const [respDevice, setRespDevice] = useState<BreakpointKey>('desktop');
  const [customCategoryMode, setCustomCategoryMode] = useState(
    () => !DEFAULT_REUSABLE_CATEGORIES.includes(draft.category as any)
  );
  const [syncLinkedAfterSave, setSyncLinkedAfterSave] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync draft when modal re-opens with a different initialDefinition
  React.useEffect(() => {
    if (!isOpen) return;
    const next = initialDefinition
      ? (JSON.parse(JSON.stringify(initialDefinition)) as ReusableComponentDefinition)
      : createStarterDefinition(ownerId);
    setDraft(next);
    setSelectedSlotId(next.rootSlotIds[0] || null);
    setActivePane('blocks');
    setCustomCategoryMode(!DEFAULT_REUSABLE_CATEGORIES.includes(next.category as any));
    setSyncLinkedAfterSave(false);
    setValidationError(null);
  }, [isOpen, initialDefinition, ownerId]);

  const orderedSlots = useMemo(
    () =>
      draft.rootSlotIds
        .map((sid) => draft.slots[sid])
        .filter((s): s is ReusableSlotNode => Boolean(s)),
    [draft.rootSlotIds, draft.slots]
  );

  const selectedSlot = selectedSlotId ? draft.slots[selectedSlotId] || null : null;

  // Build synthetic preview FormDocument inheriting current form's exact design tokens
  const previewDocument: FormDocument = useMemo(() => {
    const previewInstanceId = 'preview_reusable_inst';
    const instanceNode: FormComponentNode = {
      id: previewInstanceId,
      type: 'reusable_instance',
      pageId: 'preview_page',
      parentId: null,
      content: { label: draft.name },
      appearance: {},
      layout: { width: 'full' },
      behaviour: {},
      validation: { required: false },
      reusableInstance: createReusableInstanceConfig(draft),
    };

    return {
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      id: `${document.id}_rc_preview`,
      title: draft.name || 'Reusable Component Preview',
      description: draft.description || '',
      category: document.category,
      layoutMode: 'standard',
      settings: {
        ...document.settings,
        showProgressBar: false,
        submitButtonText: 'Preview Submit',
      },
      design: document.design,
      welcomeScreen: { enabled: false, title: '', subtitle: '', buttonText: 'Start' },
      thankYouScreen: {
        title: 'Preview Complete',
        message: 'Your component works as expected.',
        showRestartButton: false,
      },
      pages: [
        {
          id: 'preview_page',
          index: 1,
          title: 'Preview',
          componentIds: [previewInstanceId],
        },
      ],
      components: { [previewInstanceId]: instanceNode },
      logic: { rules: [], crossFieldValidations: [], extensions: {} },
      variables: [],
      componentDefinitions: { [draft.id]: draft },
      integrations: {},
      metadata: document.metadata,
    };
  }, [draft, document]);

  if (!isOpen) return null;

  const handleAddSlot = (type: FormComponentType) => {
    if (!ALLOWED_REUSABLE_BUILDING_BLOCKS.includes(type)) return;
    const slot = createDefaultSlotFromRegistry(type);
    setDraft((prev) => ({
      ...prev,
      rootSlotIds: [...prev.rootSlotIds, slot.slotId],
      slots: { ...prev.slots, [slot.slotId]: slot },
    }));
    setSelectedSlotId(slot.slotId);
  };

  const handleMoveSlot = (slotId: string, dir: 'up' | 'down') => {
    setDraft((prev) => {
      const idx = prev.rootSlotIds.indexOf(slotId);
      if (idx === -1) return prev;
      const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.rootSlotIds.length) return prev;
      const nextIds = [...prev.rootSlotIds];
      const temp = nextIds[idx];
      nextIds[idx] = nextIds[targetIdx];
      nextIds[targetIdx] = temp;
      return { ...prev, rootSlotIds: nextIds };
    });
  };

  const handleDuplicateSlot = (slotId: string) => {
    const src = draft.slots[slotId];
    if (!src) return;
    const newSlotId = makeReusableId('slot');
    const copy: ReusableSlotNode = {
      ...(JSON.parse(JSON.stringify(src)) as ReusableSlotNode),
      slotId: newSlotId,
      content: {
        ...src.content,
        label: src.content.label ? `${src.content.label} (Copy)` : src.content.label,
      },
    };
    setDraft((prev) => {
      const idx = prev.rootSlotIds.indexOf(slotId);
      const nextIds = [...prev.rootSlotIds];
      nextIds.splice(idx >= 0 ? idx + 1 : nextIds.length, 0, newSlotId);
      return {
        ...prev,
        rootSlotIds: nextIds,
        slots: { ...prev.slots, [newSlotId]: copy },
      };
    });
    setSelectedSlotId(newSlotId);
  };

  const handleDeleteSlot = (slotId: string) => {
    setDraft((prev) => {
      const nextSlots = { ...prev.slots };
      delete nextSlots[slotId];
      const nextRootIds = prev.rootSlotIds.filter((id) => id !== slotId);
      const nextProps = prev.props.filter(
        (p) => !(p.binding.scope === 'slot' && p.binding.slotId === slotId)
      );
      return {
        ...prev,
        rootSlotIds: nextRootIds,
        slots: nextSlots,
        props: nextProps,
      };
    });
    if (selectedSlotId === slotId) {
      setSelectedSlotId(draft.rootSlotIds.find((id) => id !== slotId) || null);
    }
  };

  const updateSlot = (slotId: string, updater: (slot: ReusableSlotNode) => ReusableSlotNode) => {
    setDraft((prev) => {
      const target = prev.slots[slotId];
      if (!target) return prev;
      return {
        ...prev,
        slots: {
          ...prev.slots,
          [slotId]: updater(target),
        },
      };
    });
  };

  const handleAddExposedProp = () => {
    const firstSlot = orderedSlots[0];
    const newProp: ReusablePropDefinition = {
      id: makeReusableId('prop'),
      key: `prop_${draft.props.length + 1}`,
      label: `Property ${draft.props.length + 1}`,
      type: 'text',
      defaultValue: firstSlot?.content.label || '',
      binding: firstSlot
        ? { scope: 'slot', slotId: firstSlot.slotId, property: 'label' }
        : { scope: 'root', property: 'backgroundColor' },
    };
    setDraft((prev) => ({ ...prev, props: [...prev.props, newProp] }));
  };

  const handleUpdateProp = (propId: string, patch: Partial<ReusablePropDefinition>) => {
    setDraft((prev) => ({
      ...prev,
      props: prev.props.map((p) => (p.id === propId ? { ...p, ...patch } : p)),
    }));
  };

  const handleDeleteProp = (propId: string) => {
    setDraft((prev) => ({
      ...prev,
      props: prev.props.filter((p) => p.id !== propId),
    }));
  };

  const handleCommitSave = (insertAfterSave = false) => {
    if (!draft.name.trim()) {
      setValidationError('Please enter a component name.');
      setActivePane('design');
      return;
    }
    if (draft.rootSlotIds.length === 0) {
      setValidationError('Add at least one building block before saving.');
      setActivePane('blocks');
      return;
    }

    // Validate prop keys uniqueness and safe URLs
    const seenKeys = new Set<string>();
    for (const p of draft.props) {
      const k = p.key.trim();
      if (!k) {
        setValidationError('Every exposed property must have a non-empty key.');
        setActivePane('props');
        return;
      }
      if (seenKeys.has(k)) {
        setValidationError(`Duplicate exposed property key "${k}". Keys must be unique.`);
        setActivePane('props');
        return;
      }
      seenKeys.add(k);
      const coerced = coerceReusablePropValue(p, p.defaultValue);
      if (!coerced.valid) {
        setValidationError(`Property "${p.label}": ${coerced.error}`);
        setActivePane('props');
        return;
      }
    }

    setValidationError(null);

    const finalized: ReusableComponentDefinition = isEditing && initialDefinition
      ? updateReusableComponentDefinition(initialDefinition, {
          name: draft.name,
          description: draft.description,
          category: draft.category,
          tags: draft.tags,
          rootLayout: draft.rootLayout,
          rootAppearance: draft.rootAppearance,
          hiddenByDefault: draft.hiddenByDefault,
          rootSlotIds: draft.rootSlotIds,
          slots: draft.slots,
          props: draft.props,
        })
      : {
          ...draft,
          name: draft.name.trim(),
          description: draft.description.trim(),
          category: draft.category.trim() || DEFAULT_REUSABLE_CATEGORIES[4],
          ownerId: ownerId || draft.ownerId,
          updatedAt: new Date().toISOString(),
        };

    onSave(finalized, {
      insertAfterSave,
      syncLinkedInstances: isEditing ? syncLinkedAfterSave : false,
    });
  };

  const rootResp = draft.rootLayout.responsive?.[respDevice] || {};

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B0D0F]/65 backdrop-blur-sm flex items-center justify-center p-2 sm:p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl h-[92dvh] bg-[#F7F6F3] rounded-2xl shadow-2xl border border-black/[0.1] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Header */}
        <div className="px-5 py-3.5 bg-white border-b border-black/[0.08] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#0F766E]/10 text-[#0F766E] flex items-center justify-center shrink-0">
              <Cube size={19} weight="duotone" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display font-bold text-base text-[#0B0D0F] truncate">
                  {isEditing ? `Edit Reusable Component` : 'Create Reusable Component'}
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-[#F7F6F3] border border-black/[0.08] font-mono text-[10px] font-semibold text-[#5C6066]">
                  {isEditing ? `v${draft.version} → v${draft.version + 1}` : 'v1'}
                </span>
              </div>
              <p className="text-[11px] text-[#5C6066] truncate">
                Combine headings, copy, media, buttons, layouts, and fields with typed inspector properties.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing && (
              <button
                type="button"
                onClick={() => handleCommitSave(true)}
                className="px-3.5 py-2 rounded-lg bg-[#0F766E] hover:bg-[#0D665F] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Sparkle size={14} weight="bold" />
                <span>Save &amp; Insert</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => handleCommitSave(false)}
              className="px-3.5 py-2 rounded-lg bg-[#0B0D0F] hover:bg-[#1E2228] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Check size={14} weight="bold" />
              <span>{isEditing ? `Save as v${draft.version + 1}` : 'Save to Library'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close builder"
              className="w-8 h-8 rounded-lg hover:bg-black/[0.06] text-[#5C6066] flex items-center justify-center"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>

        {/* Non-Destructive Editing Notice / Validation Banner */}
        {(validationError || (isEditing && linkedInstanceCount > 0)) && (
          <div className="px-5 py-2.5 bg-white border-b border-black/[0.06] flex flex-wrap items-center justify-between gap-2 shrink-0">
            {validationError ? (
              <div className="flex items-center gap-2 text-xs text-rose-700 font-medium">
                <WarningCircle size={15} weight="fill" className="shrink-0" />
                <span>{validationError}</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between w-full gap-2 text-xs">
                <span className="text-[#5C6066]">
                  <strong className="text-[#0B0D0F]">{linkedInstanceCount}</strong>{' '}
                  {linkedInstanceCount === 1 ? 'instance uses' : 'instances use'} this component on
                  the current form. Saving creates <strong className="text-[#0B0D0F]">v{draft.version + 1}</strong>{' '}
                  and never silently overwrites local customisations.
                </span>
                <label className="inline-flex items-center gap-2 text-[11px] font-semibold text-[#0B0D0F] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncLinkedAfterSave}
                    onChange={(e) => setSyncLinkedAfterSave(e.target.checked)}
                    className="accent-[#0F766E] w-3.5 h-3.5 rounded"
                  />
                  <span>Also update linked instances (keep local overrides)</span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* Two-Pane Body: Left Configurator + Right Live Responsive Preview */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
          {/* LEFT WORKBENCH */}
          <div className="lg:col-span-6 xl:col-span-5 bg-white border-r border-black/[0.08] flex flex-col min-h-0 overflow-hidden">
            {/* Sub-Tabs */}
            <div className="p-3 border-b border-black/[0.07] bg-[#FAF9F7] shrink-0">
              <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-black/[0.05]">
                <button
                  type="button"
                  onClick={() => setActivePane('blocks')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    activePane === 'blocks'
                      ? 'bg-white text-[#0B0D0F] shadow-xs'
                      : 'text-[#5C6066] hover:text-[#0B0D0F]'
                  }`}
                >
                  <SquaresFour size={14} weight={activePane === 'blocks' ? 'duotone' : 'regular'} />
                  <span>Blocks ({orderedSlots.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActivePane('design')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    activePane === 'design'
                      ? 'bg-white text-[#0B0D0F] shadow-xs'
                      : 'text-[#5C6066] hover:text-[#0B0D0F]'
                  }`}
                >
                  <Palette size={14} weight={activePane === 'design' ? 'duotone' : 'regular'} />
                  <span>Design</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActivePane('props')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    activePane === 'props'
                      ? 'bg-white text-[#0B0D0F] shadow-xs'
                      : 'text-[#5C6066] hover:text-[#0B0D0F]'
                  }`}
                >
                  <Sliders size={14} weight={activePane === 'props' ? 'duotone' : 'regular'} />
                  <span>Props ({draft.props.length})</span>
                </button>
              </div>
            </div>

            {/* Scrollable Pane Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
              {/* ============================================================
                  PANE 1: BUILDING BLOCKS ASSEMBLER
              ============================================================ */}
              {activePane === 'blocks' && (
                <>
                  {/* Name quick-input */}
                  <div className="space-y-1">
                    <label className="font-semibold text-[#0B0D0F] block">Component Name</label>
                    <input
                      type="text"
                      value={draft.name}
                      onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Contact Card, Pricing Callout, Policy Notice..."
                      className="w-full px-3 py-2 rounded-lg bg-[#FAF9F7] focus:bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none text-xs font-semibold text-[#0B0D0F]"
                    />
                  </div>

                  {/* Quick-Add Building Blocks */}
                  <div className="space-y-2.5">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
                      Add Building Block
                    </span>
                    <div className="space-y-2">
                      {QUICK_ADD_GROUPS.map((grp) => (
                        <div key={grp.label} className="space-y-1">
                          <span className="text-[10px] font-semibold text-[#5C6066]">
                            {grp.label}
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {grp.types.map((t) => {
                              const def = formComponentRegistry.get(t);
                              if (!def) return null;
                              return (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => handleAddSlot(t)}
                                  className="px-2 py-1 rounded-lg bg-[#FAF9F7] hover:bg-[#0F766E]/10 border border-black/[0.08] hover:border-[#0F766E] text-[11px] font-medium text-[#0B0D0F] flex items-center gap-1.5 transition-colors"
                                >
                                  <RegisteredComponentIcon
                                    type={t}
                                    size={12}
                                    className="text-[#0F766E]"
                                  />
                                  <span>{def.shortLabel}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Assembled Slots List */}
                  <div className="space-y-2">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
                      Internal Structure ({orderedSlots.length})
                    </span>

                    {orderedSlots.length === 0 ? (
                      <div className="p-5 rounded-xl border border-dashed border-black/[0.12] bg-[#FAF9F7] text-center text-[#5C6066]">
                        Add one or more building blocks above to compose your component.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {orderedSlots.map((slot, idx) => {
                          const def = formComponentRegistry.get(slot.type);
                          const isSel = selectedSlotId === slot.slotId;
                          return (
                            <div
                              key={slot.slotId}
                              onClick={() => setSelectedSlotId(slot.slotId)}
                              className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between gap-2 transition-all ${
                                isSel
                                  ? 'border-[#0F766E] bg-[#0F766E]/[0.05] ring-1 ring-[#0F766E]/25'
                                  : 'border-black/[0.08] bg-white hover:border-black/20'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-6 h-6 rounded-md bg-[#F7F6F3] text-[#0F766E] flex items-center justify-center shrink-0">
                                  <RegisteredComponentIcon type={slot.type} size={13} />
                                </span>
                                <div className="min-w-0">
                                  <span className="block text-xs font-semibold text-[#0B0D0F] truncate">
                                    {slot.content.label || def?.displayName || slot.type}
                                  </span>
                                  <span className="block font-mono text-[10px] text-[#5C6066]">
                                    {def?.shortLabel || slot.type}
                                    {slot.validation.required ? ' · Required' : ''}
                                  </span>
                                </div>
                              </div>
                              <div
                                className="flex items-center gap-0.5 shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => handleMoveSlot(slot.slotId, 'up')}
                                  className="w-6 h-6 rounded-md hover:bg-black/[0.06] text-[#5C6066] disabled:opacity-25 flex items-center justify-center"
                                  aria-label="Move block up"
                                >
                                  <ArrowUp size={12} weight="bold" />
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === orderedSlots.length - 1}
                                  onClick={() => handleMoveSlot(slot.slotId, 'down')}
                                  className="w-6 h-6 rounded-md hover:bg-black/[0.06] text-[#5C6066] disabled:opacity-25 flex items-center justify-center"
                                  aria-label="Move block down"
                                >
                                  <ArrowDown size={12} weight="bold" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDuplicateSlot(slot.slotId)}
                                  className="w-6 h-6 rounded-md hover:bg-black/[0.06] text-[#5C6066] flex items-center justify-center"
                                  aria-label="Duplicate block"
                                >
                                  <Copy size={12} weight="regular" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSlot(slot.slotId)}
                                  className="w-6 h-6 rounded-md hover:bg-rose-50 text-[#5C6066] hover:text-rose-600 flex items-center justify-center"
                                  aria-label="Remove block"
                                >
                                  <Trash size={12} weight="regular" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Selected Slot Configuration */}
                  {selectedSlot && (
                    <div className="p-3.5 rounded-xl bg-[#FAF9F7] border border-black/[0.08] space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0F766E]">
                          Edit Block · {formComponentRegistry.get(selectedSlot.type)?.displayName || selectedSlot.type}
                        </span>
                        <span className="font-mono text-[10px] text-[#5C6066]">
                          {selectedSlot.slotId}
                        </span>
                      </div>

                      {/* Label */}
                      <div className="space-y-1">
                        <label className="font-semibold text-[#0B0D0F] block">
                          Label / Title
                        </label>
                        <input
                          type="text"
                          value={selectedSlot.content.label}
                          onChange={(e) =>
                            updateSlot(selectedSlot.slotId, (s) => ({
                              ...s,
                              content: { ...s.content, label: e.target.value },
                            }))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none"
                        />
                      </div>

                      {/* Body copy for paragraph / rich_text / image_text */}
                      {['paragraph', 'rich_text', 'image_text', 'statement'].includes(selectedSlot.type) && (
                        <div className="space-y-1">
                          <label className="font-semibold text-[#0B0D0F] block">Body Copy</label>
                          <textarea
                            rows={3}
                            value={selectedSlot.content.body || ''}
                            onChange={(e) =>
                              updateSlot(selectedSlot.slotId, (s) => ({
                                ...s,
                                content: { ...s.content, body: e.target.value },
                              }))
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none"
                          />
                        </div>
                      )}

                      {/* Heading level */}
                      {selectedSlot.type === 'heading' && (
                        <div className="space-y-1">
                          <label className="font-semibold text-[#0B0D0F] block">Heading Size</label>
                          <div className="grid grid-cols-3 gap-1.5">
                            {([1, 2, 3] as const).map((lvl) => (
                              <button
                                key={lvl}
                                type="button"
                                onClick={() =>
                                  updateSlot(selectedSlot.slotId, (s) => ({
                                    ...s,
                                    content: { ...s.content, headingLevel: lvl },
                                  }))
                                }
                                className={`py-1 rounded-lg font-semibold ${
                                  (selectedSlot.content.headingLevel || 2) === lvl
                                    ? 'bg-[#0B0D0F] text-white'
                                    : 'bg-white border border-black/[0.08] text-[#5C6066]'
                                }`}
                              >
                                H{lvl}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Button/Link settings */}
                      {selectedSlot.type === 'button_link' && (
                        <div className="space-y-2.5">
                          <div className="space-y-1">
                            <label className="font-semibold text-[#0B0D0F] block">Target URL</label>
                            <input
                              type="url"
                              value={selectedSlot.content.buttonUrl || ''}
                              onChange={(e) =>
                                updateSlot(selectedSlot.slotId, (s) => ({
                                  ...s,
                                  content: { ...s.content, buttonUrl: e.target.value },
                                }))
                              }
                              placeholder="https://example.com"
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none"
                            />
                            {selectedSlot.content.buttonUrl &&
                              !isSafeReusableUrl(selectedSlot.content.buttonUrl) && (
                                <p className="text-[10px] text-rose-600 font-medium">
                                  Only https://, http://, or mailto: links are permitted.
                                </p>
                              )}
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            {(['primary', 'secondary', 'outline'] as const).map((variant) => (
                              <button
                                key={variant}
                                type="button"
                                onClick={() =>
                                  updateSlot(selectedSlot.slotId, (s) => ({
                                    ...s,
                                    content: { ...s.content, buttonVariant: variant },
                                  }))
                                }
                                className={`py-1 rounded-lg capitalize font-semibold ${
                                  (selectedSlot.content.buttonVariant || 'primary') === variant
                                    ? 'bg-[#0B0D0F] text-white'
                                    : 'bg-white border border-black/[0.08] text-[#5C6066]'
                                }`}
                              >
                                {variant}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Image / Video URLs */}
                      {['image', 'image_text'].includes(selectedSlot.type) && (
                        <div className="space-y-1">
                          <label className="font-semibold text-[#0B0D0F] block">Image URL</label>
                          <input
                            type="url"
                            value={selectedSlot.content.mediaUrl || ''}
                            onChange={(e) =>
                              updateSlot(selectedSlot.slotId, (s) => ({
                                ...s,
                                content: { ...s.content, mediaUrl: e.target.value },
                              }))
                            }
                            placeholder="https://images.unsplash.com/..."
                            className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none"
                          />
                        </div>
                      )}

                      {selectedSlot.type === 'video' && (
                        <div className="space-y-1">
                          <label className="font-semibold text-[#0B0D0F] block">Video URL</label>
                          <input
                            type="url"
                            value={selectedSlot.content.videoUrl || ''}
                            onChange={(e) =>
                              updateSlot(selectedSlot.slotId, (s) => ({
                                ...s,
                                content: { ...s.content, videoUrl: e.target.value },
                              }))
                            }
                            placeholder="https://www.youtube.com/watch?v=..."
                            className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none"
                          />
                        </div>
                      )}

                      {/* Form Field options & validation */}
                      {formComponentRegistry.get(selectedSlot.type)?.isQuestion && (
                        <div className="space-y-2.5 pt-1 border-t border-black/[0.07]">
                          <div className="space-y-1">
                            <label className="font-semibold text-[#0B0D0F] block">
                              Placeholder
                            </label>
                            <input
                              type="text"
                              value={selectedSlot.content.placeholder || ''}
                              onChange={(e) =>
                                updateSlot(selectedSlot.slotId, (s) => ({
                                  ...s,
                                  content: { ...s.content, placeholder: e.target.value },
                                }))
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none"
                            />
                          </div>

                          {['select', 'radio', 'checkbox'].includes(selectedSlot.type) && (
                            <div className="space-y-1">
                              <label className="font-semibold text-[#0B0D0F] block">
                                Options (one per line)
                              </label>
                              <textarea
                                rows={3}
                                value={(selectedSlot.content.options || []).join('\n')}
                                onChange={(e) =>
                                  updateSlot(selectedSlot.slotId, (s) => ({
                                    ...s,
                                    content: {
                                      ...s.content,
                                      options: e.target.value
                                        .split('\n')
                                        .map((line) => line.trim())
                                        .filter(Boolean),
                                    },
                                  }))
                                }
                                className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none"
                              />
                            </div>
                          )}

                          <label className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-white border border-black/[0.08] cursor-pointer">
                            <span className="font-semibold text-[#0B0D0F]">Required field</span>
                            <input
                              type="checkbox"
                              checked={Boolean(selectedSlot.validation.required)}
                              onChange={(e) =>
                                updateSlot(selectedSlot.slotId, (s) => ({
                                  ...s,
                                  validation: { ...s.validation, required: e.target.checked },
                                }))
                              }
                              className="accent-[#0F766E] w-3.5 h-3.5 rounded"
                            />
                          </label>
                        </div>
                      )}

                      {/* Slot Alignment & Text Colour */}
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-black/[0.07]">
                        <div className="space-y-1">
                          <label className="font-semibold text-[#0B0D0F] block">Alignment</label>
                          <div className="grid grid-cols-3 gap-1">
                            {(['left', 'center', 'right'] as TextAlign[]).map((align) => (
                              <button
                                key={align}
                                type="button"
                                onClick={() =>
                                  updateSlot(selectedSlot.slotId, (s) => ({
                                    ...s,
                                    appearance: { ...s.appearance, textAlign: align },
                                  }))
                                }
                                className={`py-1 rounded text-[10px] font-semibold capitalize ${
                                  (selectedSlot.appearance.textAlign || 'left') === align
                                    ? 'bg-[#0B0D0F] text-white'
                                    : 'bg-white border border-black/[0.08] text-[#5C6066]'
                                }`}
                              >
                                {align[0]}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="font-semibold text-[#0B0D0F] block">Text Colour</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={selectedSlot.appearance.textColor || '#0B0D0F'}
                              onChange={(e) =>
                                updateSlot(selectedSlot.slotId, (s) => ({
                                  ...s,
                                  appearance: { ...s.appearance, textColor: e.target.value },
                                }))
                              }
                              className="w-7 h-7 rounded border border-black/[0.1] cursor-pointer"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateSlot(selectedSlot.slotId, (s) => ({
                                  ...s,
                                  appearance: { ...s.appearance, textColor: undefined },
                                }))
                              }
                              className="text-[10px] text-[#5C6066] hover:text-[#0B0D0F] underline"
                            >
                              Inherit
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ============================================================
                  PANE 2: METADATA, LAYOUT, COLOURS, BORDERS & RESPONSIVE
              ============================================================ */}
              {activePane === 'design' && (
                <>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="font-semibold text-[#0B0D0F] block">Component Name</label>
                      <input
                        type="text"
                        value={draft.name}
                        onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg bg-[#FAF9F7] focus:bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none font-semibold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-[#0B0D0F] block">Description</label>
                      <textarea
                        rows={2}
                        value={draft.description}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, description: e.target.value }))
                        }
                        placeholder="Describe when to use this reusable component..."
                        className="w-full px-3 py-2 rounded-lg bg-[#FAF9F7] focus:bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="font-semibold text-[#0B0D0F] block">Category</label>
                        <button
                          type="button"
                          onClick={() => setCustomCategoryMode((v) => !v)}
                          className="text-[10px] font-semibold text-[#0F766E] hover:underline"
                        >
                          {customCategoryMode ? 'Use preset' : '+ Custom category'}
                        </button>
                      </div>
                      {customCategoryMode ? (
                        <input
                          type="text"
                          value={draft.category}
                          onChange={(e) =>
                            setDraft((prev) => ({ ...prev, category: e.target.value }))
                          }
                          placeholder="e.g. Legal Disclosures"
                          className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none"
                        />
                      ) : (
                        <select
                          value={draft.category}
                          onChange={(e) =>
                            setDraft((prev) => ({ ...prev, category: e.target.value }))
                          }
                          className="w-full px-3 py-2 rounded-lg bg-white border border-black/[0.1] focus:border-[#0F766E] focus:outline-none"
                        >
                          {DEFAULT_REUSABLE_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Layout Controls */}
                  <div className="pt-3 border-t border-black/[0.07] space-y-3">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
                      Layout &amp; Spacing
                    </span>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="font-semibold text-[#0B0D0F] block">Columns</label>
                        <div className="grid grid-cols-3 gap-1">
                          {([1, 2, 3] as const).map((cols) => (
                            <button
                              key={cols}
                              type="button"
                              onClick={() =>
                                setDraft((prev) => ({
                                  ...prev,
                                  rootLayout: { ...prev.rootLayout, columns: cols },
                                }))
                              }
                              className={`py-1.5 rounded-lg font-semibold ${
                                (draft.rootLayout.columns || 1) === cols
                                  ? 'bg-[#0B0D0F] text-white'
                                  : 'bg-[#F7F6F3] text-[#5C6066]'
                              }`}
                            >
                              {cols}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="font-semibold text-[#0B0D0F] block">Alignment</label>
                        <div className="grid grid-cols-3 gap-1">
                          {(['left', 'center', 'right'] as TextAlign[]).map((align) => (
                            <button
                              key={align}
                              type="button"
                              onClick={() =>
                                setDraft((prev) => ({
                                  ...prev,
                                  rootLayout: { ...prev.rootLayout, alignment: align },
                                  rootAppearance: { ...prev.rootAppearance, textAlign: align },
                                }))
                              }
                              className={`py-1.5 rounded-lg capitalize font-semibold ${
                                (draft.rootAppearance.textAlign || 'left') === align
                                  ? 'bg-[#0B0D0F] text-white'
                                  : 'bg-[#F7F6F3] text-[#5C6066]'
                              }`}
                            >
                              {align[0]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="font-semibold text-[#0B0D0F] block">Inner Padding</label>
                        <div className="grid grid-cols-4 gap-1">
                          {(['none', 'sm', 'md', 'lg'] as SpacingToken[]).map((sp) => (
                            <button
                              key={sp}
                              type="button"
                              onClick={() =>
                                setDraft((prev) => ({
                                  ...prev,
                                  rootLayout: { ...prev.rootLayout, padding: sp },
                                }))
                              }
                              className={`py-1 rounded text-[10px] font-semibold uppercase ${
                                (draft.rootLayout.padding || 'md') === sp
                                  ? 'bg-[#0B0D0F] text-white'
                                  : 'bg-[#F7F6F3] text-[#5C6066]'
                              }`}
                            >
                              {sp}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="font-semibold text-[#0B0D0F] block">Block Gap</label>
                        <div className="grid grid-cols-4 gap-1">
                          {(['none', 'sm', 'md', 'lg'] as SpacingToken[]).map((sp) => (
                            <button
                              key={sp}
                              type="button"
                              onClick={() =>
                                setDraft((prev) => ({
                                  ...prev,
                                  rootLayout: { ...prev.rootLayout, gap: sp },
                                }))
                              }
                              className={`py-1 rounded text-[10px] font-semibold uppercase ${
                                (draft.rootLayout.gap || 'md') === sp
                                  ? 'bg-[#0B0D0F] text-white'
                                  : 'bg-[#F7F6F3] text-[#5C6066]'
                              }`}
                            >
                              {sp}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Surface, Colours & Borders */}
                  <div className="pt-3 border-t border-black/[0.07] space-y-3">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066] block">
                      Surface, Colours &amp; Borders
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="font-semibold text-[#0B0D0F] block">Background</label>
                        <input
                          type="color"
                          value={draft.rootAppearance.backgroundColor || '#FFFFFF'}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              rootAppearance: {
                                ...prev.rootAppearance,
                                backgroundColor: e.target.value,
                              },
                            }))
                          }
                          className="w-full h-8 rounded-lg border border-black/[0.1] cursor-pointer"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="font-semibold text-[#0B0D0F] block">Border</label>
                        <input
                          type="color"
                          value={draft.rootAppearance.borderColor || '#E5E7EB'}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              rootAppearance: {
                                ...prev.rootAppearance,
                                borderColor: e.target.value,
                              },
                            }))
                          }
                          className="w-full h-8 rounded-lg border border-black/[0.1] cursor-pointer"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="font-semibold text-[#0B0D0F] block">Text</label>
                        <input
                          type="color"
                          value={draft.rootAppearance.textColor || '#0B0D0F'}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              rootAppearance: {
                                ...prev.rootAppearance,
                                textColor: e.target.value,
                              },
                            }))
                          }
                          className="w-full h-8 rounded-lg border border-black/[0.1] cursor-pointer"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="font-semibold text-[#0B0D0F] block">Border Width</label>
                        <select
                          value={draft.rootAppearance.borderWidth || '1'}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              rootAppearance: {
                                ...prev.rootAppearance,
                                borderWidth: e.target.value as '0' | '1' | '2',
                              },
                            }))
                          }
                          className="w-full px-2 py-1.5 rounded-lg bg-white border border-black/[0.1]"
                        >
                          <option value="0">None</option>
                          <option value="1">1px</option>
                          <option value="2">2px</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="font-semibold text-[#0B0D0F] block">Radius</label>
                        <select
                          value={draft.rootAppearance.borderRadius || 'md'}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              rootAppearance: {
                                ...prev.rootAppearance,
                                borderRadius: e.target.value as any,
                              },
                            }))
                          }
                          className="w-full px-2 py-1.5 rounded-lg bg-white border border-black/[0.1]"
                        >
                          <option value="none">Sharp</option>
                          <option value="sm">Small</option>
                          <option value="md">Medium</option>
                          <option value="lg">Large</option>
                          <option value="full">Extra</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="font-semibold text-[#0B0D0F] block">Shadow</label>
                        <select
                          value={draft.rootAppearance.shadow || 'none'}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              rootAppearance: {
                                ...prev.rootAppearance,
                                shadow: e.target.value as any,
                              },
                            }))
                          }
                          className="w-full px-2 py-1.5 rounded-lg bg-white border border-black/[0.1]"
                        >
                          <option value="none">None</option>
                          <option value="sm">Subtle</option>
                          <option value="md">Elevated</option>
                          <option value="lg">Deep</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Responsive Behaviour & Visibility */}
                  <div className="pt-3 border-t border-black/[0.07] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066]">
                        Responsive Behaviour
                      </span>
                      <div className="flex items-center gap-1 bg-[#F7F6F3] p-0.5 rounded-lg">
                        {(['desktop', 'tablet', 'mobile'] as BreakpointKey[]).map((bp) => (
                          <button
                            key={bp}
                            type="button"
                            onClick={() => {
                              setRespDevice(bp);
                              setPreviewViewport(bp);
                            }}
                            className={`px-2 py-1 rounded text-[10px] font-semibold capitalize ${
                              respDevice === bp
                                ? 'bg-white text-[#0B0D0F] shadow-xs'
                                : 'text-[#5C6066]'
                            }`}
                          >
                            {bp}
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#FAF9F7] border border-black/[0.07] cursor-pointer">
                      <span className="font-medium text-[#0B0D0F] flex items-center gap-1.5">
                        {rootResp.hidden ? <EyeSlash size={14} /> : <Eye size={14} />}
                        <span>Hide on {respDevice}</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={Boolean(rootResp.hidden)}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            rootLayout: {
                              ...prev.rootLayout,
                              responsive: {
                                ...(prev.rootLayout.responsive || {}),
                                [respDevice]: {
                                  ...(prev.rootLayout.responsive?.[respDevice] || {}),
                                  hidden: e.target.checked,
                                },
                              },
                            },
                          }))
                        }
                        className="accent-[#0F766E] w-3.5 h-3.5 rounded"
                      />
                    </label>

                    <label className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#FAF9F7] border border-black/[0.07] cursor-pointer">
                      <span className="font-medium text-[#0B0D0F]">
                        Hidden by default (reveal via Logic rules)
                      </span>
                      <input
                        type="checkbox"
                        checked={Boolean(draft.hiddenByDefault)}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            hiddenByDefault: e.target.checked,
                          }))
                        }
                        className="accent-[#0F766E] w-3.5 h-3.5 rounded"
                      />
                    </label>
                  </div>
                </>
              )}

              {/* ============================================================
                  PANE 3: EXPOSED TYPED PROPERTY SCHEMA
              ============================================================ */}
              {activePane === 'props' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold text-[#0B0D0F] block">
                        Configurable Inspector Properties
                      </span>
                      <p className="text-[11px] text-[#5C6066]">
                        Expose typed controls so each inserted instance can be customised locally.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddExposedProp}
                      className="px-2.5 py-1.5 rounded-lg bg-[#0F766E] hover:bg-[#0D665F] text-white text-[11px] font-semibold flex items-center gap-1 shrink-0"
                    >
                      <Plus size={12} weight="bold" />
                      <span>Expose Prop</span>
                    </button>
                  </div>

                  {draft.props.length === 0 ? (
                    <div className="p-5 rounded-xl border border-dashed border-black/[0.12] bg-[#FAF9F7] text-center space-y-2">
                      <p className="font-semibold text-[#0B0D0F]">No exposed properties yet</p>
                      <p className="text-[11px] text-[#5C6066]">
                        Expose headings, button labels, image URLs, colours, or visibility toggles to
                        make this component effortless to customise in the Inspector.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {draft.props.map((prop) => {
                        const targetValue =
                          prop.binding.scope === 'root'
                            ? `root:${prop.binding.property}`
                            : `slot:${prop.binding.slotId}:${prop.binding.property}`;

                        const handleBindingChange = (encoded: string) => {
                          const parts = encoded.split(':');
                          let nextBinding: ReusablePropBindingTarget;
                          if (parts[0] === 'root') {
                            nextBinding = {
                              scope: 'root',
                              property: parts[1] as any,
                            };
                          } else {
                            nextBinding = {
                              scope: 'slot',
                              slotId: parts[1],
                              property: parts[2] as any,
                            };
                          }
                          handleUpdateProp(prop.id, { binding: nextBinding });
                        };

                        return (
                          <div
                            key={prop.id}
                            className="p-3 rounded-xl bg-[#FAF9F7] border border-black/[0.08] space-y-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <input
                                type="text"
                                value={prop.label}
                                onChange={(e) =>
                                  handleUpdateProp(prop.id, { label: e.target.value })
                                }
                                placeholder="Property Label"
                                className="flex-1 px-2.5 py-1 rounded-md bg-white border border-black/[0.1] font-semibold text-[#0B0D0F]"
                              />
                              <button
                                type="button"
                                onClick={() => handleDeleteProp(prop.id)}
                                className="w-7 h-7 rounded-md hover:bg-rose-50 text-[#5C6066] hover:text-rose-600 flex items-center justify-center shrink-0"
                                aria-label="Remove property"
                              >
                                <Trash size={13} />
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-0.5">
                                <label className="text-[10px] font-mono text-[#5C6066]">Key</label>
                                <input
                                  type="text"
                                  value={prop.key}
                                  onChange={(e) =>
                                    handleUpdateProp(prop.id, {
                                      key: e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''),
                                    })
                                  }
                                  className="w-full px-2 py-1 rounded-md bg-white border border-black/[0.1] font-mono text-[11px]"
                                />
                              </div>
                              <div className="space-y-0.5">
                                <label className="text-[10px] font-mono text-[#5C6066]">Type</label>
                                <select
                                  value={prop.type}
                                  onChange={(e) => {
                                    const nextType = e.target.value as ReusablePropType;
                                    const nextDefault =
                                      nextType === 'visibility'
                                        ? true
                                        : nextType === 'layout_columns'
                                        ? 1
                                        : nextType === 'alignment'
                                        ? 'left'
                                        : nextType === 'spacing'
                                        ? 'md'
                                        : nextType === 'color'
                                        ? '#FFFFFF'
                                        : String(prop.defaultValue ?? '');
                                    handleUpdateProp(prop.id, {
                                      type: nextType,
                                      defaultValue: nextDefault,
                                    });
                                  }}
                                  className="w-full px-2 py-1 rounded-md bg-white border border-black/[0.1] text-[11px]"
                                >
                                  {PROP_TYPE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div className="space-y-0.5">
                              <label className="text-[10px] font-mono text-[#5C6066]">
                                Connected Target
                              </label>
                              <select
                                value={targetValue}
                                onChange={(e) => handleBindingChange(e.target.value)}
                                className="w-full px-2 py-1.5 rounded-md bg-white border border-black/[0.1] text-[11px]"
                              >
                                <optgroup label="Component Container">
                                  <option value="root:backgroundColor">Container Background Colour</option>
                                  <option value="root:borderColor">Container Border Colour</option>
                                  <option value="root:textColor">Container Text Colour</option>
                                  <option value="root:textAlign">Container Alignment</option>
                                  <option value="root:padding">Container Padding</option>
                                  <option value="root:gap">Container Spacing / Gap</option>
                                  <option value="root:columns">Container Columns</option>
                                  <option value="root:visible">Container Visibility</option>
                                </optgroup>
                                {orderedSlots.map((slot, idx) => {
                                  const slotTitle =
                                    slot.content.label ||
                                    formComponentRegistry.get(slot.type)?.shortLabel ||
                                    slot.type;
                                  return (
                                    <optgroup
                                      key={slot.slotId}
                                      label={`Block ${idx + 1}: ${slotTitle.slice(0, 26)}`}
                                    >
                                      <option value={`slot:${slot.slotId}:label`}>Title / Label</option>
                                      <option value={`slot:${slot.slotId}:body`}>Body Copy</option>
                                      <option value={`slot:${slot.slotId}:helpText`}>Helper Text</option>
                                      <option value={`slot:${slot.slotId}:mediaUrl`}>Image URL</option>
                                      <option value={`slot:${slot.slotId}:buttonUrl`}>Button Link URL</option>
                                      <option value={`slot:${slot.slotId}:textColor`}>Text Colour</option>
                                      <option value={`slot:${slot.slotId}:backgroundColor`}>Background Colour</option>
                                      <option value={`slot:${slot.slotId}:textAlign`}>Alignment</option>
                                      <option value={`slot:${slot.slotId}:visible`}>Visibility</option>
                                    </optgroup>
                                  );
                                })}
                              </select>
                            </div>

                            <div className="space-y-0.5">
                              <label className="text-[10px] font-mono text-[#5C6066]">
                                Default Value
                              </label>
                              {prop.type === 'visibility' ? (
                                <label className="flex items-center gap-2 text-[11px] font-medium">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(prop.defaultValue)}
                                    onChange={(e) =>
                                      handleUpdateProp(prop.id, { defaultValue: e.target.checked })
                                    }
                                    className="accent-[#0F766E]"
                                  />
                                  <span>Visible by default</span>
                                </label>
                              ) : prop.type === 'color' ? (
                                <input
                                  type="color"
                                  value={String(prop.defaultValue || '#FFFFFF')}
                                  onChange={(e) =>
                                    handleUpdateProp(prop.id, { defaultValue: e.target.value })
                                  }
                                  className="w-16 h-7 rounded border border-black/[0.1] cursor-pointer"
                                />
                              ) : prop.type === 'alignment' ? (
                                <select
                                  value={String(prop.defaultValue || 'left')}
                                  onChange={(e) =>
                                    handleUpdateProp(prop.id, { defaultValue: e.target.value })
                                  }
                                  className="w-full px-2 py-1 rounded-md bg-white border border-black/[0.1] text-[11px]"
                                >
                                  <option value="left">Left</option>
                                  <option value="center">Center</option>
                                  <option value="right">Right</option>
                                </select>
                              ) : prop.type === 'spacing' ? (
                                <select
                                  value={String(prop.defaultValue || 'md')}
                                  onChange={(e) =>
                                    handleUpdateProp(prop.id, { defaultValue: e.target.value })
                                  }
                                  className="w-full px-2 py-1 rounded-md bg-white border border-black/[0.1] text-[11px]"
                                >
                                  <option value="none">None</option>
                                  <option value="sm">Small</option>
                                  <option value="md">Medium</option>
                                  <option value="lg">Large</option>
                                </select>
                              ) : prop.type === 'layout_columns' ? (
                                <select
                                  value={Number(prop.defaultValue || 1)}
                                  onChange={(e) =>
                                    handleUpdateProp(prop.id, {
                                      defaultValue: Number(e.target.value),
                                    })
                                  }
                                  className="w-full px-2 py-1 rounded-md bg-white border border-black/[0.1] text-[11px]"
                                >
                                  <option value={1}>1 Column</option>
                                  <option value={2}>2 Columns</option>
                                  <option value={3}>3 Columns</option>
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  value={String(prop.defaultValue ?? '')}
                                  onChange={(e) =>
                                    handleUpdateProp(prop.id, { defaultValue: e.target.value })
                                  }
                                  className="w-full px-2 py-1 rounded-md bg-white border border-black/[0.1] text-[11px]"
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANE: LIVE RESPONSIVE PREVIEW */}
          <div className="lg:col-span-6 xl:col-span-7 bg-[#EDEBE6] flex flex-col min-h-0 overflow-hidden">
            <div className="px-4 py-2.5 bg-[#FAF9F7] border-b border-black/[0.07] flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6066]">
                  Live Interactive Preview
                </span>
              </div>
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-black/[0.06]">
                {(
                  [
                    { id: 'desktop', icon: Desktop, label: 'Desktop' },
                    { id: 'tablet', icon: DeviceTablet, label: 'Tablet' },
                    { id: 'mobile', icon: DeviceMobile, label: 'Mobile' },
                  ] as const
                ).map(({ id, icon: Icon, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPreviewViewport(id)}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-all ${
                      previewViewport === id
                        ? 'bg-white text-[#0B0D0F] shadow-xs'
                        : 'text-[#5C6066] hover:text-[#0B0D0F]'
                    }`}
                  >
                    <Icon size={13} />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex justify-center items-start">
              <div
                className={`w-full transition-all duration-300 overflow-hidden shadow-xl border border-black/[0.1] bg-white ${
                  previewViewport === 'mobile'
                    ? 'max-w-[375px] rounded-[2rem] ring-4 ring-[#0B0D0F]/80'
                    : previewViewport === 'tablet'
                    ? 'max-w-[680px] rounded-2xl'
                    : 'max-w-2xl rounded-2xl'
                }`}
              >
                <FormDocumentRenderer
                  source={previewDocument}
                  isPreview={true}
                  embedded={true}
                  viewportOverride={previewViewport}
                  scopeInstanceSuffix="rc_builder_preview"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
