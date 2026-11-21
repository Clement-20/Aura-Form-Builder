/**
 * Automated Tests for FlexStore Form Studio — Phase 3.2: Reusable Component Builder
 *
 * Covers:
 *   1. Visual reusable component definition creation combining headings, paragraphs,
 *      images, dividers, button/link, layout containers, and form fields + typed exposed props.
 *   2. Saving to reusable library, search/category filtering, duplicate, rename, delete,
 *      and cross-form reuse (Form A -> Form B).
 *   3. Multiple instances across pages with unique stable IDs and deterministic internal slot IDs.
 *   4. Local instance overrides (propOverrides & slotOverrides) affecting ONLY the selected instance.
 *   5. Non-destructive versioning: master updates (v1 -> v2) never silently overwrite customised
 *      instances; explicit opt-in sync preserves overrides or resets to master cleanly.
 *   6. Detach instance isolating it permanently from future master updates.
 *   7. Graceful fallback when master definition is deleted (embedded snapshot + missing fallback safety).
 *   8. Security & validation integrity: internal fields enforce required/email/hidden-field sanitization
 *      through validateAndSanitizeSubmission; unsafe javascript:/data: URLs rejected.
 *   9. Responsive viewport resolution (desktop / tablet / mobile column collapse & device hiding).
 *  10. Lossless persistence round-trip (FormDocument <-> FormSchema) pruning unused definitions
 *      while keeping referenced reusable definitions & overrides intact alongside built-in blocks.
 *  11. Extracting an existing canvas block or container into a reusable component definition.
 *
 * Run with: npx tsx src/studio/__tests__/reusable-components.test.ts
 */

import assert from 'node:assert/strict';
import { FormSchema } from '../../types/form';
import {
  addComponent,
  buildReusableSlotNodeId,
  clearReusableInstancePropOverride,
  coerceReusablePropValue,
  collectReferencedDefinitions,
  COMPONENT_LIBRARY_SCHEMA_VERSION,
  createPage,
  createReusableComponentDefinition,
  DEFAULT_REUSABLE_CATEGORIES,
  detachReusableInstance,
  duplicateReusableComponentDefinition,
  extractDefinitionFromCanvasNode,
  filterReusableDefinitions,
  formComponentRegistry,
  getExpandedReusableQuestionNodes,
  insertReusableComponentInstance,
  isSafeReusableUrl,
  listInstanceIdsForDefinition,
  migrateLegacyFormToDocument,
  removeReusableDefinitionFromDoc,
  resetReusableInstanceOverrides,
  resolveReusableInstance,
  ReusableSlotNode,
  serializeDocumentToLegacyForm,
  syncAllReusableInstancesForDefinition,
  syncReusableInstance,
  updateReusableComponentDefinition,
  updateReusableInstancePropOverride,
  updateReusableInstanceSlotOverride,
  upsertReusableDefinitionInDoc,
  validateAndSanitizeSubmission,
  validateFormDocument,
} from '../index';

function createBaseForm(id: string, title: string): FormSchema {
  return {
    id,
    title,
    description: 'Test form for reusable component verification.',
    category: 'feedback',
    layoutMode: 'stepped',
    theme: {
      primaryColor: '#0F766E',
      backgroundColor: '#F7F6F3',
      surfaceColor: '#FFFFFF',
      textColor: '#0B0D0F',
      fontFamily: 'Plus Jakarta Sans',
      borderRadius: 'lg',
      backgroundStyle: 'solid',
      inputStyle: 'bordered',
      enableConfetti: false,
    },
    welcomeScreen: {
      enabled: false,
      title: 'Welcome',
      subtitle: '',
      buttonText: 'Start',
    },
    thankYouScreen: {
      title: 'Thank you',
      message: 'Submission received.',
      showRestartButton: false,
    },
    fields: [
      {
        id: 'f_intro',
        type: 'text',
        label: 'Your Name',
        required: false,
        step: 1,
      },
    ],
    steps: [{ id: 'step_1', stepNumber: 1, title: 'Step 1', description: '' }],
    logicRules: [],
    settings: {
      slug: id,
      isPublished: true,
      submitButtonText: 'Submit',
      allowMultipleSubmissions: true,
      isQuizMode: false,
      notifyOnSubmission: false,
      showProgressBar: true,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    responsesCount: 0,
  };
}

function buildCompositeLeadCardDefinition() {
  const slots: ReusableSlotNode[] = [
    {
      slotId: 'slot_heading',
      type: 'heading',
      parentSlotId: null,
      content: { label: 'Book a Product Demo', headingLevel: 2 },
      appearance: { textAlign: 'left', textColor: '#0B0D0F' },
      layout: { width: 'full' },
      behaviour: {},
      validation: { required: false },
    },
    {
      slotId: 'slot_para',
      type: 'paragraph',
      parentSlotId: null,
      content: { label: 'Summary', body: 'Speak with an engineer in 15 minutes.' },
      appearance: { textAlign: 'left' },
      layout: { width: 'full' },
      behaviour: {},
      validation: { required: false },
    },
    {
      slotId: 'slot_img',
      type: 'image',
      parentSlotId: null,
      content: {
        label: 'Banner Image',
        mediaUrl: 'https://images.example.com/demo-banner.png',
        mediaAlt: 'Demo preview',
      },
      appearance: {},
      layout: { width: 'full' },
      behaviour: {},
      validation: { required: false },
    },
    {
      slotId: 'slot_divider',
      type: 'divider',
      parentSlotId: null,
      content: { label: 'Divider' },
      appearance: {},
      layout: { width: 'full' },
      behaviour: {},
      validation: { required: false },
    },
    {
      slotId: 'slot_email',
      type: 'email',
      parentSlotId: null,
      content: { label: 'Work Email', placeholder: 'you@company.com' },
      appearance: {},
      layout: { width: 'full' },
      behaviour: {},
      validation: { required: true },
    },
    {
      slotId: 'slot_cta',
      type: 'button_link',
      parentSlotId: null,
      content: {
        label: 'View Pricing Guide',
        buttonUrl: 'https://example.com/pricing',
        buttonVariant: 'primary',
        buttonOpenInNewTab: true,
      },
      appearance: {},
      layout: { width: 'full' },
      behaviour: {},
      validation: { required: false },
    },
  ];

  return createReusableComponentDefinition({
    name: 'Lead Capture Card',
    description: 'Reusable composite card with heading, media, required work email, and CTA link.',
    category: DEFAULT_REUSABLE_CATEGORIES[1],
    ownerId: 'creator_1',
    rootLayout: {
      width: 'full',
      columns: 2,
      gap: 'md',
      padding: 'md',
      responsive: {
        tablet: { columns: 2 },
        mobile: { columns: 1 },
      },
    },
    rootAppearance: {
      backgroundColor: '#FFFFFF',
      borderColor: '#E5E7EB',
      borderWidth: '1',
      borderRadius: 'lg',
      textAlign: 'left',
    },
    slots,
    props: [
      {
        id: 'p_title',
        key: 'title',
        label: 'Card Heading',
        type: 'text',
        defaultValue: 'Book a Product Demo',
        binding: { scope: 'slot', slotId: 'slot_heading', property: 'label' },
      },
      {
        id: 'p_cta_label',
        key: 'ctaLabel',
        label: 'Button Label',
        type: 'button_label',
        defaultValue: 'View Pricing Guide',
        binding: { scope: 'slot', slotId: 'slot_cta', property: 'label' },
      },
      {
        id: 'p_cta_url',
        key: 'ctaUrl',
        label: 'Button URL',
        type: 'url',
        defaultValue: 'https://example.com/pricing',
        binding: { scope: 'slot', slotId: 'slot_cta', property: 'buttonUrl' },
      },
      {
        id: 'p_bg',
        key: 'surfaceBg',
        label: 'Card Background',
        type: 'color',
        defaultValue: '#FFFFFF',
        binding: { scope: 'root', property: 'backgroundColor' },
      },
      {
        id: 'p_cols',
        key: 'columns',
        label: 'Columns',
        type: 'layout_columns',
        defaultValue: 2,
        binding: { scope: 'root', property: 'columns' },
      },
      {
        id: 'p_show_img',
        key: 'showBanner',
        label: 'Show Banner Image',
        type: 'visibility',
        defaultValue: true,
        binding: { scope: 'slot', slotId: 'slot_img', property: 'visible' },
      },
    ],
  });
}

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(err);
  }
}

console.log('\nRunning FlexStore Form Studio — Phase 3.2 Reusable Component Builder Tests\n');

// ----------------------------------------------------------------------------
// 1. Registry Integration & Definition Creation
// ----------------------------------------------------------------------------
test('Registry registers button_link and hidden-from-palette reusable_instance without parallel system', () => {
  assert.equal(formComponentRegistry.has('button_link'), true);
  assert.equal(formComponentRegistry.has('reusable_instance'), true);
  // reusable_instance stays out of built-in block palette (saved components live in Saved tab)
  const paletteTypes = formComponentRegistry
    .listByCategory()
    .flatMap((g) => g.components.map((c) => c.type));
  assert.ok(paletteTypes.includes('button_link'));
  assert.ok(!paletteTypes.includes('reusable_instance'));
});

test('Creates versioned composite reusable component combining content, media, CTA, and form fields', () => {
  const def = buildCompositeLeadCardDefinition();
  assert.equal(def.schemaVersion, COMPONENT_LIBRARY_SCHEMA_VERSION);
  assert.equal(def.version, 1);
  assert.equal(def.rootSlotIds.length, 6);
  assert.equal(Object.keys(def.slots).length, 6);
  assert.equal(def.props.length, 6);
  assert.equal(def.ownerId, 'creator_1');
});

// ----------------------------------------------------------------------------
// 2. Multiple Instances Across Pages & Local Overrides Isolation
// ----------------------------------------------------------------------------
test('Inserts multiple instances across pages with unique IDs and isolated local overrides', () => {
  let doc = migrateLegacyFormToDocument(createBaseForm('form_a', 'Form A'));
  const page2Res = createPage(doc, { title: 'Step 2' });
  doc = page2Res.doc;

  const def = buildCompositeLeadCardDefinition();
  const inst1 = insertReusableComponentInstance(doc, def, doc.pages[0].id);
  doc = inst1.doc;
  const inst2 = insertReusableComponentInstance(doc, def, page2Res.pageId);
  doc = inst2.doc;

  assert.notEqual(inst1.componentId, inst2.componentId);
  assert.deepEqual(listInstanceIdsForDefinition(doc, def.id).sort(), [inst1.componentId, inst2.componentId].sort());

  // Override exposed prop + slot content on Instance 1 ONLY
  const overrideRes = updateReusableInstancePropOverride(
    doc,
    inst1.componentId,
    'title',
    'Enterprise Demo Request'
  );
  assert.equal(overrideRes.error, undefined);
  doc = overrideRes.doc;

  doc = updateReusableInstancePropOverride(doc, inst1.componentId, 'showBanner', false).doc;
  doc = updateReusableInstanceSlotOverride(doc, inst1.componentId, 'slot_para', {
    content: { body: 'Dedicated onboarding architect assigned.' },
  });

  const resolved1 = resolveReusableInstance(doc.components[inst1.componentId], doc.componentDefinitions);
  const resolved2 = resolveReusableInstance(doc.components[inst2.componentId], doc.componentDefinitions);

  // Instance 1 reflects local overrides
  const h1 = resolved1.nodesById[buildReusableSlotNodeId(inst1.componentId, 'slot_heading')];
  const p1 = resolved1.nodesById[buildReusableSlotNodeId(inst1.componentId, 'slot_para')];
  const img1 = resolved1.nodesById[buildReusableSlotNodeId(inst1.componentId, 'slot_img')];
  assert.equal(h1.content.label, 'Enterprise Demo Request');
  assert.equal(p1.content.body, 'Dedicated onboarding architect assigned.');
  assert.equal(img1, undefined, 'Hidden banner slot via visibility prop should be excluded');
  assert.equal(resolved1.hasLocalOverrides, true);

  // Instance 2 and master definition remain completely untouched
  const h2 = resolved2.nodesById[buildReusableSlotNodeId(inst2.componentId, 'slot_heading')];
  const p2 = resolved2.nodesById[buildReusableSlotNodeId(inst2.componentId, 'slot_para')];
  const img2 = resolved2.nodesById[buildReusableSlotNodeId(inst2.componentId, 'slot_img')];
  assert.equal(h2.content.label, 'Book a Product Demo');
  assert.equal(p2.content.body, 'Speak with an engineer in 15 minutes.');
  assert.ok(img2, 'Instance 2 banner image must still be visible');
  assert.equal(resolved2.hasLocalOverrides, false);
  assert.equal(def.slots['slot_heading'].content.label, 'Book a Product Demo');

  // Clear one prop override & reset all overrides cleanly
  doc = clearReusableInstancePropOverride(doc, inst1.componentId, 'title');
  const afterClear = resolveReusableInstance(doc.components[inst1.componentId], doc.componentDefinitions);
  assert.equal(
    afterClear.nodesById[buildReusableSlotNodeId(inst1.componentId, 'slot_heading')].content.label,
    'Book a Product Demo'
  );
  doc = resetReusableInstanceOverrides(doc, inst1.componentId);
  const afterReset = resolveReusableInstance(doc.components[inst1.componentId], doc.componentDefinitions);
  assert.equal(afterReset.hasLocalOverrides, false);
});

// ----------------------------------------------------------------------------
// 3. Non-Destructive Versioning, Explicit Opt-In Sync & Detach
// ----------------------------------------------------------------------------
test('Master edits (v1 -> v2) never silently overwrite customised instances; explicit sync preserves overrides', () => {
  let doc = migrateLegacyFormToDocument(createBaseForm('form_ver', 'Versioning Form'));
  const defV1 = buildCompositeLeadCardDefinition();

  const instA = insertReusableComponentInstance(doc, defV1, doc.pages[0].id);
  doc = instA.doc;
  const instB = insertReusableComponentInstance(doc, defV1, doc.pages[0].id);
  doc = instB.doc;

  // Customise Instance A's heading + detach Instance B
  doc = updateReusableInstancePropOverride(doc, instA.componentId, 'title', 'Custom Title A').doc;
  doc = detachReusableInstance(doc, instB.componentId);

  // Master definition updated to v2 (new default CTA label & updated paragraph body)
  const updatedSlots = Object.values(defV1.slots).map((s) =>
    s.slotId === 'slot_para'
      ? { ...s, content: { ...s.content, body: 'v2 Updated copy from master.' } }
      : s
  );
  const updatedSlotsMap = Object.fromEntries(updatedSlots.map((s) => [s.slotId, s]));
  const updatedProps = defV1.props.map((p) =>
    p.key === 'ctaLabel' ? { ...p, defaultValue: 'Start Free Trial' } : p
  );
  const defV2 = updateReusableComponentDefinition(defV1, {
    slots: updatedSlotsMap,
    props: updatedProps,
  });
  assert.equal(defV2.version, 2);

  // Save v2 into document definitions WITHOUT force-syncing instances
  doc = upsertReusableDefinitionInDoc(doc, defV2);

  // Instance A should report update_available and still render its pinned v1 snapshot (no silent overwrite)
  const beforeSyncA = resolveReusableInstance(doc.components[instA.componentId], doc.componentDefinitions);
  assert.equal(beforeSyncA.status, 'update_available');
  assert.equal(beforeSyncA.activeVersion, 1);
  assert.equal(beforeSyncA.latestVersion, 2);
  assert.equal(
    beforeSyncA.nodesById[buildReusableSlotNodeId(instA.componentId, 'slot_heading')].content.label,
    'Custom Title A'
  );
  assert.equal(
    beforeSyncA.nodesById[buildReusableSlotNodeId(instA.componentId, 'slot_para')].content.body,
    'Speak with an engineer in 15 minutes.'
  );

  // Explicit opt-in sync with preserveOverrides: true pulls v2 updates while preserving Custom Title A
  doc = syncReusableInstance(doc, instA.componentId, defV2, { preserveOverrides: true });
  const afterSyncA = resolveReusableInstance(doc.components[instA.componentId], doc.componentDefinitions);
  assert.equal(afterSyncA.status, 'up_to_date');
  assert.equal(afterSyncA.activeVersion, 2);
  assert.equal(
    afterSyncA.nodesById[buildReusableSlotNodeId(instA.componentId, 'slot_heading')].content.label,
    'Custom Title A',
    'Local title override must survive master v2 update'
  );
  assert.equal(
    afterSyncA.nodesById[buildReusableSlotNodeId(instA.componentId, 'slot_para')].content.body,
    'v2 Updated copy from master.',
    'Non-overridden paragraph must receive v2 master update'
  );
  assert.equal(
    afterSyncA.nodesById[buildReusableSlotNodeId(instA.componentId, 'slot_cta')].content.label,
    'Start Free Trial'
  );

  // Detached Instance B stays detached even after syncAllReusableInstancesForDefinition
  doc = syncAllReusableInstancesForDefinition(doc, defV2, { preserveOverrides: false });
  const resolvedB = resolveReusableInstance(doc.components[instB.componentId], doc.componentDefinitions);
  assert.equal(resolvedB.status, 'detached');
  assert.equal(resolvedB.activeVersion, 1);
  assert.equal(
    resolvedB.nodesById[buildReusableSlotNodeId(instB.componentId, 'slot_para')].content.body,
    'Speak with an engineer in 15 minutes.'
  );
});

// ----------------------------------------------------------------------------
// 4. Library Management (Duplicate, Rename, Filter/Search) & Graceful Deleted Fallback
// ----------------------------------------------------------------------------
test('Supports library duplicate, rename, search/category filtering, and graceful fallback when deleted', () => {
  const def1 = buildCompositeLeadCardDefinition();
  const def2 = duplicateReusableComponentDefinition(def1);
  assert.notEqual(def1.id, def2.id);
  assert.equal(def2.version, 1);
  assert.ok(def2.name.includes('Copy'));

  const renamed = updateReusableComponentDefinition(def2, { name: 'Pricing Banner' }, { bumpVersion: false });
  assert.equal(renamed.name, 'Pricing Banner');
  assert.equal(renamed.version, 1);

  const filteredBySearch = filterReusableDefinitions([def1, renamed], 'pricing', 'All');
  assert.equal(filteredBySearch.length, 1);
  assert.equal(filteredBySearch[0].id, renamed.id);

  const filteredByCat = filterReusableDefinitions([def1, renamed], '', DEFAULT_REUSABLE_CATEGORIES[1]);
  assert.equal(filteredByCat.length, 2);

  // Insert into Form, then delete the definition from the document & external map
  let doc = migrateLegacyFormToDocument(createBaseForm('form_del', 'Deletion Safety Form'));
  const inst = insertReusableComponentInstance(doc, def1, doc.pages[0].id);
  doc = inst.doc;
  doc = removeReusableDefinitionFromDoc(doc, def1.id);

  // Embedded fallback snapshot keeps rendering intact without crashing
  const resolvedWithSnapshot = resolveReusableInstance(doc.components[inst.componentId], doc.componentDefinitions);
  assert.equal(resolvedWithSnapshot.status, 'missing_definition');
  assert.ok(resolvedWithSnapshot.definition, 'Should fall back to embedded snapshot');
  assert.equal(resolvedWithSnapshot.rootNodeIds.length, 6);

  // Even if fallbackDefinition is completely stripped, resolution fails gracefully with empty nodes
  const strippedNode = {
    ...doc.components[inst.componentId],
    reusableInstance: {
      ...doc.components[inst.componentId].reusableInstance!,
      fallbackDefinition: undefined,
    },
  };
  const resolvedWithoutSnapshot = resolveReusableInstance(strippedNode, {});
  assert.equal(resolvedWithoutSnapshot.status, 'missing_definition');
  assert.equal(resolvedWithoutSnapshot.definition, null);
  assert.deepEqual(resolvedWithoutSnapshot.rootNodeIds, []);
});

// ----------------------------------------------------------------------------
// 5. Security & Submission Validation Integrity (Internal Fields & Unsafe URLs)
// ----------------------------------------------------------------------------
test('Enforces required/email validation on internal reusable fields and rejects unsafe URLs', () => {
  const def = buildCompositeLeadCardDefinition();

  // Security: unsafe URLs rejected by isSafeReusableUrl & coerceReusablePropValue
  assert.equal(isSafeReusableUrl('https://flexstore.example.com'), true);
  assert.equal(isSafeReusableUrl('mailto:team@example.com'), true);
  assert.equal(isSafeReusableUrl('#section-pricing'), true);
  assert.equal(isSafeReusableUrl('javascript:alert(1)'), false);
  assert.equal(isSafeReusableUrl('data:text/html,<script>alert(1)</script>'), false);

  const urlProp = def.props.find((p) => p.key === 'ctaUrl')!;
  const badUrlCoerce = coerceReusablePropValue(urlProp, 'javascript:alert(1)');
  assert.equal(badUrlCoerce.valid, false);
  assert.ok(badUrlCoerce.error);

  let doc = migrateLegacyFormToDocument(createBaseForm('form_val', 'Validation Form'));
  const inst = insertReusableComponentInstance(doc, def, doc.pages[0].id);
  doc = inst.doc;

  // Reject unsafe URL override on instance
  const unsafeOverride = updateReusableInstancePropOverride(
    doc,
    inst.componentId,
    'ctaUrl',
    'javascript:void(0)'
  );
  assert.ok(unsafeOverride.error);

  const emailFieldId = buildReusableSlotNodeId(inst.componentId, 'slot_email');
  const expanded = getExpandedReusableQuestionNodes(doc);
  assert.ok(expanded.some((q) => q.node.id === emailFieldId));

  // Missing required internal email must fail submission validation
  const missingResult = validateAndSanitizeSubmission(doc, { f_intro: 'Ada' });
  assert.equal(missingResult.valid, false);
  assert.ok(missingResult.errors[emailFieldId], 'Required internal email must block submission');

  // Malformed internal email must fail validation
  const invalidEmailResult = validateAndSanitizeSubmission(doc, {
    f_intro: 'Ada',
    [emailFieldId]: 'not-an-email',
  });
  assert.equal(invalidEmailResult.valid, false);
  assert.ok(invalidEmailResult.errors[emailFieldId]);

  // Valid internal email passes and is retained in sanitizedAnswers
  const validResult = validateAndSanitizeSubmission(doc, {
    f_intro: 'Ada',
    [emailFieldId]: 'ada@company.com',
  });
  assert.equal(validResult.valid, true, JSON.stringify(validResult.errors));
  assert.equal(validResult.sanitizedAnswers[emailFieldId], 'ada@company.com');
});

// ----------------------------------------------------------------------------
// 6. Responsive Resolution & Cross-Form Reuse + Lossless Round-Trip
// ----------------------------------------------------------------------------
test('Resolves responsive columns per viewport and persists losslessly across forms while pruning unused defs', () => {
  const def = buildCompositeLeadCardDefinition();
  const unusedDef = createReusableComponentDefinition({
    name: 'Unused Banner',
    description: 'Should be pruned on serialize',
    slots: [
      {
        slotId: 's_unused',
        type: 'paragraph',
        parentSlotId: null,
        content: { label: 'Unused', body: 'Hello' },
        appearance: {},
        layout: { width: 'full' },
        behaviour: {},
        validation: {},
      },
    ],
  });

  // Reuse same definition across Form A and Form B
  let docA = migrateLegacyFormToDocument(createBaseForm('form_cross_a', 'Cross Form A'));
  let docB = migrateLegacyFormToDocument(createBaseForm('form_cross_b', 'Cross Form B'));

  const instA = insertReusableComponentInstance(docA, def, docA.pages[0].id);
  docA = upsertReusableDefinitionInDoc(instA.doc, unusedDef);
  docA = updateReusableInstancePropOverride(docA, instA.componentId, 'title', 'Form A Heading').doc;

  const instB = insertReusableComponentInstance(docB, def, docB.pages[0].id);
  docB = updateReusableInstancePropOverride(instB.doc, instB.componentId, 'title', 'Form B Heading').doc;

  // Responsive check: desktop=2 cols, tablet=2 cols, mobile=1 col
  const desktopRes = resolveReusableInstance(docA.components[instA.componentId], docA.componentDefinitions, 'desktop');
  const tabletRes = resolveReusableInstance(docA.components[instA.componentId], docA.componentDefinitions, 'tablet');
  const mobileRes = resolveReusableInstance(docA.components[instA.componentId], docA.componentDefinitions, 'mobile');
  assert.equal(desktopRes.effectiveColumns, 2);
  assert.equal(tabletRes.effectiveColumns, 2);
  assert.equal(mobileRes.effectiveColumns, 1);

  // Referenced definition pruning
  const referenced = collectReferencedDefinitions(docA);
  assert.ok(referenced[def.id]);
  assert.equal(referenced[unusedDef.id], undefined, 'Unreferenced definitions must be pruned');

  // Lossless persistence round-trip (FormDocument -> Legacy FormSchema -> FormDocument)
  const serializedA = serializeDocumentToLegacyForm(docA);
  const serializedDefs = (serializedA.settings as any).studioComponentDefinitions;
  assert.ok(serializedDefs?.[def.id]);
  assert.equal(serializedDefs?.[unusedDef.id], undefined);

  const restoredA = migrateLegacyFormToDocument(serializedA);
  const validationA = validateFormDocument(restoredA);
  assert.equal(validationA.valid, true, JSON.stringify(validationA.errors));
  const restoredInstA = restoredA.components[instA.componentId];
  assert.equal(restoredInstA.type, 'reusable_instance');
  assert.equal(restoredInstA.reusableInstance?.propOverrides.title, 'Form A Heading');

  const resolvedRestoredA = resolveReusableInstance(restoredInstA, restoredA.componentDefinitions);
  assert.equal(
    resolvedRestoredA.nodesById[buildReusableSlotNodeId(instA.componentId, 'slot_heading')].content.label,
    'Form A Heading'
  );

  // Confirm Form B kept its own independent override
  const resolvedB = resolveReusableInstance(docB.components[instB.componentId], docB.componentDefinitions);
  assert.equal(
    resolvedB.nodesById[buildReusableSlotNodeId(instB.componentId, 'slot_heading')].content.label,
    'Form B Heading'
  );
});

// ----------------------------------------------------------------------------
// 7. Extracting Existing Canvas Blocks / Containers into Reusable Definitions
// ----------------------------------------------------------------------------
test('Extracts an existing canvas container and nested children into a reusable component definition', () => {
  let doc = migrateLegacyFormToDocument(createBaseForm('form_extract', 'Extraction Form'));
  const sec = addComponent(doc, 'two_column', doc.pages[0].id, {
    content: { label: 'Contact Info Section' },
  });
  doc = sec.doc;

  const h = addComponent(doc, 'heading', doc.pages[0].id, {
    parentId: sec.componentId,
    content: { label: 'Get in Touch' },
  });
  doc = h.doc;

  const em = addComponent(doc, 'email', doc.pages[0].id, {
    parentId: sec.componentId,
    content: { label: 'Your Email' },
    validation: { required: true },
  });
  doc = em.doc;

  const extracted = extractDefinitionFromCanvasNode(doc, sec.componentId, { ownerId: 'creator_9' });
  assert.ok(extracted);
  assert.equal(extracted.name, 'Contact Info Section');
  assert.equal(extracted.rootLayout.columns, 2);
  assert.equal(extracted.rootSlotIds.length, 2);
  assert.equal(extracted.ownerId, 'creator_9');
  assert.ok(extracted.props.length >= 1, 'Should auto-expose starter properties for extracted heading/text slots');
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
