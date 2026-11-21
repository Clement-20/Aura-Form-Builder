/**
 * Automated Tests for FlexStore Form Studio — Phase 1 (Steps 1, 2 & 3)
 *
 * Covers document model, registry, search/categories, layout containers & nesting guards,
 * drag/move operations, recursive duplication/removal, page management, undo/redo history,
 * global design tokens, component-level styling overrides, theme presets, responsive
 * viewport resolution, WCAG contrast checks, logic engine, and lossless persistence round-trip.
 *
 * Run with: npx tsx src/studio/__tests__/studio-foundation.test.ts
 */

import assert from 'node:assert/strict';
import React from 'react';
import { FormSchema } from '../../types/form';
import {
  addComponent,
  BUILT_IN_THEME_PRESETS,
  canNestComponent,
  canRedoHistory,
  canUndoHistory,
  checkDesignContrast,
  createHistory,
  createPage,
  DEFAULT_STUDIO_DESIGN,
  defaultLogicEngine,
  deletePage,
  DOCUMENT_SCHEMA_VERSION,
  duplicateComponent,
  duplicatePage,
  duplicateThemePreset,
  formComponentRegistry,
  FormComponentDefinition,
  FormDocument,
  getAllPageComponents,
  getContainerChildren,
  getContrastRatio,
  getOrderedComponents,
  getPageComponents,
  hasComponentStyleOverrides,
  MAX_CONTAINER_DEPTH,
  migrateLegacyFormToDocument,
  moveComponent,
  moveComponentByOffset,
  moveComponentToPage,
  pushHistory,
  redoHistory,
  removeComponent,
  reorderComponent,
  reorderPage,
  repairFormDocument,
  replaceHistoryPresent,
  resetComponentAppearance,
  resetDesignToDefault,
  resolveComponentGridClass,
  resolveComponentTokens,
  resolveContainerColumns,
  resolveDesignTokens,
  serializeDocumentToLegacyForm,
  splitPageAfterComponent,
  undoHistory,
  updateComponent,
  updateDesign,
  updateFormMeta,
  updateGlobalSettings,
  updatePage,
  validateFormDocument,
} from '../index';

function createSampleLegacyForm(): FormSchema {
  return {
    id: 'form_legacy_123',
    title: 'Customer Feedback Survey',
    description: 'Help us improve your experience.',
    category: 'survey',
    layoutMode: 'stepped',
    theme: {
      primaryColor: '#0F766E',
      backgroundColor: '#F7F6F3',
      surfaceColor: '#FFFFFF',
      textColor: '#0B0D0F',
      fontFamily: 'Plus Jakarta Sans',
      borderRadius: 'lg',
      backgroundStyle: 'subtle-grid',
      inputStyle: 'bordered',
      enableConfetti: true,
    },
    welcomeScreen: {
      enabled: true,
      title: 'Welcome!',
      subtitle: 'Takes 2 minutes',
      buttonText: 'Start Survey',
    },
    thankYouScreen: {
      title: 'Thanks!',
      message: 'We received your response.',
      showRestartButton: true,
    },
    fields: [
      {
        id: 'f_name',
        type: 'text',
        label: 'Your Name',
        required: true,
        step: 1,
      },
      {
        id: 'f_rating',
        type: 'rating',
        label: 'Rate Us',
        required: true,
        step: 1,
        min: 1,
        max: 5,
      },
      {
        id: 'f_followup',
        type: 'textarea',
        label: 'What can we improve?',
        required: false,
        step: 2,
      },
    ],
    steps: [
      { id: 'step_1', stepNumber: 1, title: 'About You', description: 'Basic info' },
      { id: 'step_2', stepNumber: 2, title: 'Details', description: 'Follow-up' },
    ],
    logicRules: [
      {
        id: 'rule_1',
        sourceFieldId: 'f_rating',
        condition: 'less_than',
        value: '4',
        action: 'show',
        targetFieldId: 'f_followup',
      },
      {
        id: 'rule_2',
        sourceFieldId: 'f_rating',
        condition: 'equals',
        value: '1',
        action: 'require',
        targetFieldId: 'f_followup',
      },
    ],
    settings: {
      slug: 'customer-feedback',
      isPublished: true,
      submitButtonText: 'Submit Feedback',
      allowMultipleSubmissions: true,
      isQuizMode: false,
      notifyOnSubmission: false,
      showProgressBar: true,
    },
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-01-11T10:00:00.000Z',
    responsesCount: 42,
  };
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

console.log('\nRunning FlexStore Form Studio — Phase 1 (Steps 1, 2 & 3) Tests\n');

// ============================================================================
// 1. Migration & Backward Compatibility
// ============================================================================

test('Migrates legacy v1 FormSchema into valid v2 FormDocument preserving stable IDs', () => {
  const legacy = createSampleLegacyForm();
  const doc = migrateLegacyFormToDocument(legacy);

  assert.equal(doc.schemaVersion, DOCUMENT_SCHEMA_VERSION);
  assert.equal(doc.id, 'form_legacy_123');
  assert.equal(doc.pages.length, 2);
  assert.deepEqual(doc.pages[0].componentIds, ['f_name', 'f_rating']);
  assert.deepEqual(doc.pages[1].componentIds, ['f_followup']);
  assert.equal(doc.components['f_name'].validation.required, true);
  assert.equal(doc.metadata.responsesCount, 42);
  assert.equal(doc.logic.rules.length, 2);

  const validation = validateFormDocument(doc);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
});

test('Round-trips v2 FormDocument -> legacy FormSchema -> v2 FormDocument losslessly with nested containers and new block props', () => {
  let doc = migrateLegacyFormToDocument(createSampleLegacyForm());

  // Add a heading, a two-column container, a nested email inside the container, and a video + file_upload block
  const heading = addComponent(doc, 'heading', doc.pages[0].id, {
    content: { label: 'Section Intro', headingLevel: 1 },
    layout: { width: 'half' },
    appearance: { textAlign: 'center' },
  });
  doc = heading.doc;

  const twoCol = addComponent(doc, 'two_column', doc.pages[0].id, {
    content: { label: 'Contact Row' },
    layout: { columns: 2, gap: 'lg' },
  });
  doc = twoCol.doc;

  const nestedEmail = addComponent(doc, 'email', doc.pages[0].id, {
    parentId: twoCol.componentId,
    content: { label: 'Work Email' },
  });
  doc = nestedEmail.doc;

  const video = addComponent(doc, 'video', doc.pages[0].id, {
    content: { label: 'Product Walkthrough', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  });
  doc = video.doc;

  const upload = addComponent(doc, 'file_upload', doc.pages[0].id, {
    content: { label: 'Attach Resume', acceptedFileTypes: '.pdf,.docx', maxFileSizeMb: 15 },
  });
  doc = upload.doc;

  const serialized = serializeDocumentToLegacyForm(doc);
  assert.equal(serialized.id, doc.id);
  assert.equal(serialized.steps?.length, 2);
  assert.equal(serialized.responsesCount, 42);

  // Safe fallback types for legacy runners
  const serializedHeading = serialized.fields.find((f) => f.id === heading.componentId);
  assert.equal(serializedHeading?.type, 'statement');
  const serializedUpload = serialized.fields.find((f) => f.id === upload.componentId);
  assert.equal(serializedUpload?.type, 'text');

  // Re-migrate back to v2 and verify full hierarchy and extended prop fidelity
  const restored = migrateLegacyFormToDocument(serialized);
  assert.equal(restored.components[heading.componentId].type, 'heading');
  assert.equal(restored.components[heading.componentId].content.headingLevel, 1);
  assert.equal(restored.components[heading.componentId].layout.width, 'half');
  assert.equal(restored.components[heading.componentId].appearance.textAlign, 'center');

  const restoredTwoCol = restored.components[twoCol.componentId];
  assert.equal(restoredTwoCol.type, 'two_column');
  assert.equal(restoredTwoCol.layout.columns, 2);
  assert.equal(restoredTwoCol.layout.gap, 'lg');
  assert.deepEqual(restoredTwoCol.children, [nestedEmail.componentId]);

  const restoredNestedEmail = restored.components[nestedEmail.componentId];
  assert.equal(restoredNestedEmail.parentId, twoCol.componentId);
  assert.ok(!restored.pages[0].componentIds.includes(nestedEmail.componentId));

  assert.equal(
    restored.components[video.componentId].content.videoUrl,
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  );
  assert.equal(restored.components[upload.componentId].type, 'file_upload');
  assert.equal(restored.components[upload.componentId].content.acceptedFileTypes, '.pdf,.docx');
  assert.equal(restored.components[upload.componentId].content.maxFileSizeMb, 15);
});

// ============================================================================
// 2. Runtime Validation & Repair
// ============================================================================

test('validateFormDocument rejects invalid roots and structural defects', () => {
  assert.equal(validateFormDocument(null).valid, false);
  assert.equal(validateFormDocument('bad').valid, false);

  const doc = migrateLegacyFormToDocument(createSampleLegacyForm());
  const broken: any = {
    ...doc,
    schemaVersion: 99,
    pages: [
      { id: 'dup', index: 1, title: 'P1', componentIds: ['ghost_id'] },
      { id: 'dup', index: 2, title: 'P2', componentIds: [] },
    ],
  };

  const result = validateFormDocument(broken);
  assert.equal(result.valid, false);
  const codes = new Set(result.errors.map((e) => e.code));
  assert.ok(codes.has('INVALID_SCHEMA_VERSION'));
  assert.ok(codes.has('ORPHAN_COMPONENT_REF'));
  assert.ok(codes.has('DUPLICATE_PAGE_ID'));
});

test('repairFormDocument recovers corrupted documents while preserving valid nested containers', () => {
  let doc = migrateLegacyFormToDocument(createSampleLegacyForm());
  const sec = addComponent(doc, 'section', doc.pages[0].id);
  doc = sec.doc;
  const child = addComponent(doc, 'text', doc.pages[0].id, { parentId: sec.componentId });
  doc = child.doc;

  const corrupted: FormDocument = {
    ...doc,
    id: '',
    pages: [
      {
        id: 'p1',
        index: 99,
        title: '',
        componentIds: ['missing_node', 'f_name', 'f_name', sec.componentId],
      },
    ],
    components: {
      ...doc.components,
      orphan_block: {
        id: 'orphan_block',
        type: 'text',
        pageId: 'nonexistent_page',
        content: { label: 'Recovered Orphan' },
        appearance: {},
        layout: { width: 'full' },
        behaviour: {},
        validation: {},
      },
    },
  };

  const repaired = repairFormDocument(corrupted);
  const validation = validateFormDocument(repaired);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.ok(repaired.pages[0].componentIds.includes('f_name'));
  assert.ok(repaired.pages[0].componentIds.includes('orphan_block'));
  assert.ok(!repaired.pages[0].componentIds.includes('missing_node'));
  // Nested child stays inside its section and is NOT duplicated onto page top-level
  assert.ok(!repaired.pages[0].componentIds.includes(child.componentId));
  assert.deepEqual(repaired.components[sec.componentId].children, [child.componentId]);
});

// ============================================================================
// 3. Central Component Registry, Categories, Search & Extensibility
// ============================================================================

test('ComponentRegistry includes all 34 built-in components across 4 categories with live search', () => {
  const all = formComponentRegistry.list();
  assert.equal(all.length, 34);

  const groups = formComponentRegistry.listByCategory();
  assert.equal(groups.length, 4);
  assert.deepEqual(
    groups.map((g) => g.label),
    ['Content', 'Form Fields', 'Layout', 'Other']
  );

  // Spot check all required component types across categories
  for (const requiredType of [
    'heading',
    'paragraph',
    'rich_text',
    'custom_html',
    'button_link',
    'reusable_instance',
    'image',
    'video',
    'divider',
    'spacer',
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
    'file_upload',
    'url',
    'section',
    'container',
    'two_column',
    'three_column',
    'image_text',
    'welcome_screen',
    'thank_you_screen',
    'progress_indicator',
  ]) {
    assert.ok(formComponentRegistry.has(requiredType), `Missing component type: ${requiredType}`);
  }

  // Verify container flags
  assert.equal(formComponentRegistry.isContainer('section'), true);
  assert.equal(formComponentRegistry.isContainer('container'), true);
  assert.equal(formComponentRegistry.isContainer('two_column'), true);
  assert.equal(formComponentRegistry.isContainer('three_column'), true);
  assert.equal(formComponentRegistry.isContainer('text'), false);

  // Verify keyword search
  const columnResults = formComponentRegistry.listByCategory('column');
  const columnTypes = columnResults.flatMap((g) => g.components.map((c) => c.type));
  assert.ok(columnTypes.includes('two_column'));
  assert.ok(columnTypes.includes('three_column'));
});

test('ComponentRegistry allows registering a brand-new component type without modifying core engines', () => {
  const customRegistry = formComponentRegistry.clone();
  const DummyIcon: React.FC = () => null;
  const DummyRender: React.FC<any> = () => null;

  const signatureDef: FormComponentDefinition = {
    type: 'signature_pad',
    displayName: 'Signature Pad',
    shortLabel: 'Signature',
    hint: 'Capture electronic signatures',
    category: 'fields',
    isQuestion: true,
    icon: DummyIcon,
    defaultContent: { label: 'Sign here to confirm' },
    defaultAppearance: { textAlign: 'left' },
    defaultLayout: { width: 'full' },
    defaultBehaviour: {},
    defaultValidation: { required: true },
    supportedOptions: ['label', 'required', 'width'],
    EditorRenderer: DummyRender,
    RespondentRenderer: DummyRender,
  };

  customRegistry.register(signatureDef);
  assert.ok(customRegistry.has('signature_pad'));

  const doc = migrateLegacyFormToDocument(createSampleLegacyForm());
  const { doc: nextDoc, componentId } = addComponent(
    doc,
    'signature_pad',
    doc.pages[0].id,
    undefined,
    customRegistry
  );

  assert.equal(nextDoc.components[componentId].type, 'signature_pad');
  assert.equal(nextDoc.components[componentId].content.label, 'Sign here to confirm');
  assert.equal(nextDoc.components[componentId].validation.required, true);
});

// ============================================================================
// 4. Layout Containers, Nesting Guards & Drag/Move Operations
// ============================================================================

test('Layout containers support moving into/out of containers, cross-page moves, and reject invalid nesting', () => {
  let doc = migrateLegacyFormToDocument(createSampleLegacyForm());
  const page1Id = doc.pages[0].id;
  const page2Id = doc.pages[1].id;

  // Create Section (depth 0) -> Two-Column (depth 1) -> Short Text (depth 2)
  const secRes = addComponent(doc, 'section', page1Id, { content: { label: 'Outer Section' } });
  doc = secRes.doc;
  const secId = secRes.componentId;

  assert.equal(canNestComponent(doc, 'two_column', secId).allowed, true);
  const twoColRes = addComponent(doc, 'two_column', page1Id, { parentId: secId });
  doc = twoColRes.doc;
  const twoColId = twoColRes.componentId;

  // Nesting a leaf inside depth-1 two_column (target depth = 2 === MAX_CONTAINER_DEPTH) is ALLOWED
  assert.equal(canNestComponent(doc, 'email', twoColId).allowed, true);
  const emailRes = addComponent(doc, 'email', page1Id, { parentId: twoColId });
  doc = emailRes.doc;
  const emailId = emailRes.componentId;

  assert.equal(getContainerChildren(doc, secId).length, 1);
  assert.equal(getContainerChildren(doc, twoColId).length, 1);

  // INVALID 1: Nesting a container at depth 2 (inside two_column at depth 1) is REJECTED
  assert.equal(MAX_CONTAINER_DEPTH, 2);
  assert.equal(canNestComponent(doc, 'container', twoColId).allowed, false);

  // INVALID 2: Nesting into a non-container leaf field is REJECTED
  assert.equal(canNestComponent(doc, 'text', emailId).allowed, false);

  // INVALID 3: Self-nesting & descendant cycle nesting are REJECTED
  assert.equal(canNestComponent(doc, secId, secId).allowed, false);
  assert.equal(canNestComponent(doc, secId, twoColId).allowed, false);
  const unchanged = moveComponent(doc, secId, { parentId: twoColId });
  assert.equal(unchanged, doc, 'Cyclic move must safely no-op');

  // Move existing top-level f_name INTO two_column
  doc = moveComponent(doc, 'f_name', { parentId: twoColId, index: 0 });
  assert.ok(!doc.pages[0].componentIds.includes('f_name'));
  assert.deepEqual(doc.components[twoColId].children, ['f_name', emailId]);
  assert.equal(doc.components['f_name'].parentId, twoColId);

  // Move f_name OUT of two_column back to top-level of Page 1
  doc = moveComponent(doc, 'f_name', { pageId: page1Id, parentId: null, index: 0 });
  assert.equal(doc.pages[0].componentIds[0], 'f_name');
  assert.equal(doc.components['f_name'].parentId, null);
  assert.deepEqual(doc.components[twoColId].children, [emailId]);

  // Move entire Outer Section (with nested two_column & email) to Page 2
  doc = moveComponent(doc, secId, { pageId: page2Id, parentId: null });
  assert.ok(doc.pages[1].componentIds.includes(secId));
  assert.equal(doc.components[secId].pageId, page2Id);
  assert.equal(doc.components[twoColId].pageId, page2Id);
  assert.equal(doc.components[emailId].pageId, page2Id);

  // Recursive duplication of Outer Section clones all nested children with fresh IDs
  const dupSec = duplicateComponent(doc, secId);
  assert.ok(dupSec.componentId);
  doc = dupSec.doc;
  const clonedSec = doc.components[dupSec.componentId!];
  assert.equal(clonedSec.children?.length, 1);
  const clonedTwoColId = clonedSec.children![0];
  assert.notEqual(clonedTwoColId, twoColId);
  assert.equal(doc.components[clonedTwoColId].parentId, clonedSec.id);
  assert.equal(doc.components[clonedTwoColId].children?.length, 1);
  const clonedEmailId = doc.components[clonedTwoColId].children![0];
  assert.notEqual(clonedEmailId, emailId);
  assert.equal(doc.components[clonedEmailId].parentId, clonedTwoColId);

  // Recursive removal of cloned section cleans up all descendants
  doc = removeComponent(doc, clonedSec.id);
  assert.equal(doc.components[clonedSec.id], undefined);
  assert.equal(doc.components[clonedTwoColId], undefined);
  assert.equal(doc.components[clonedEmailId], undefined);
});

// ============================================================================
// 5. Immutable Document Engine Operations
// ============================================================================

test('DocumentEngine operations are strictly immutable and preserve input snapshots', () => {
  const original = migrateLegacyFormToDocument(createSampleLegacyForm());
  const snapshot = structuredClone(original);

  // Add component
  const added = addComponent(original, 'email', original.pages[0].id);
  assert.deepEqual(original, snapshot, 'addComponent mutated original document');
  assert.equal(getPageComponents(added.doc, added.doc.pages[0].id).length, 3);

  // Duplicate component
  const dup = duplicateComponent(added.doc, 'f_name');
  assert.ok(dup.componentId);
  assert.equal(dup.doc.pages[0].componentIds[1], dup.componentId);
  assert.equal(dup.doc.components[dup.componentId!].content.label, 'Your Name (Copy)');

  // Reorder & moveByOffset
  const movedDown = moveComponentByOffset(dup.doc, 'f_name', 'down');
  assert.equal(movedDown.pages[0].componentIds[1], 'f_name');

  const reordered = reorderComponent(movedDown, 'f_name', 0, movedDown.pages[0].id);
  assert.equal(reordered.pages[0].componentIds[0], 'f_name');

  // Move between pages
  const movedPage = moveComponentToPage(reordered, 'f_name', reordered.pages[1].id, 0);
  assert.ok(!movedPage.pages[0].componentIds.includes('f_name'));
  assert.equal(movedPage.pages[1].componentIds[0], 'f_name');
  assert.equal(movedPage.components['f_name'].pageId, movedPage.pages[1].id);

  // Update component (deep facet merge + choice options seeding on type change)
  const updated = updateComponent(movedPage, 'f_name', {
    type: 'radio',
    layout: { width: 'third' },
    appearance: { textAlign: 'right' },
    validation: { required: false },
  });
  assert.equal(updated.components['f_name'].type, 'radio');
  assert.equal(updated.components['f_name'].content.options?.length, 3);
  assert.equal(updated.components['f_name'].layout.width, 'third');
  assert.equal(updated.components['f_name'].appearance.textAlign, 'right');
  assert.equal(updated.components['f_name'].validation.required, false);

  // Remove component also cleans up dangling logic rules referencing it
  const removed = removeComponent(updated, 'f_rating');
  assert.equal(removed.components['f_rating'], undefined);
  assert.equal(removed.logic.rules.length, 0);

  // Global settings, metadata & design updates
  const metaUpdated = updateFormMeta(removed, { title: 'Renamed Studio Form', layoutMode: 'standard' });
  const settingsUpdated = updateGlobalSettings(metaUpdated, { isQuizMode: true, showProgressBar: false });
  const designUpdated = updateDesign(settingsUpdated, { spacingScale: 'relaxed' });
  assert.equal(designUpdated.title, 'Renamed Studio Form');
  assert.equal(designUpdated.settings.isQuizMode, true);
  assert.equal(designUpdated.settings.showProgressBar, false);
  assert.equal(designUpdated.design.spacingScale, 'relaxed');

  // Verify original was NEVER mutated across the entire chain
  assert.deepEqual(original, snapshot);
});

test('Page lifecycle operations: create, update, duplicate (with nested blocks), reorder, split, and delete', () => {
  let doc = migrateLegacyFormToDocument(createSampleLegacyForm());

  // Add a nested layout container onto Page 1 before duplicating Page 1
  const colRes = addComponent(doc, 'two_column', doc.pages[0].id);
  doc = colRes.doc;
  const childRes = addComponent(doc, 'phone', doc.pages[0].id, { parentId: colRes.componentId });
  doc = childRes.doc;

  // Duplicate Page 1 -> clones all top-level + nested blocks with new IDs
  const dupPageRes = duplicatePage(doc, doc.pages[0].id);
  assert.ok(dupPageRes.pageId);
  doc = dupPageRes.doc;
  assert.equal(doc.pages.length, 3);
  assert.equal(doc.pages[1].id, dupPageRes.pageId);
  assert.equal(doc.pages[1].title, 'About You (Copy)');
  assert.equal(getAllPageComponents(doc, dupPageRes.pageId!).length, 4);

  // Delete duplicated page WITH deleteComponents: true -> removes cloned blocks cleanly
  doc = deletePage(doc, dupPageRes.pageId!, { deleteComponents: true });
  assert.equal(doc.pages.length, 2);

  // Create Page 3
  const created = createPage(doc, { title: 'Summary' });
  doc = created.doc;
  assert.equal(doc.pages.length, 3);
  assert.equal(doc.pages[2].title, 'Summary');

  // Update page
  doc = updatePage(doc, created.pageId, { title: 'Final Review' });
  assert.equal(doc.pages[2].title, 'Final Review');

  // Reorder page left
  doc = reorderPage(doc, created.pageId, 'left');
  assert.equal(doc.pages[1].id, created.pageId);
  assert.equal(doc.pages[1].index, 2);

  // Split Page 1 after f_name (moves f_rating & two_column + its child onto new page)
  const split = splitPageAfterComponent(doc, 'f_name');
  assert.ok(split.pageId);
  doc = split.doc;
  assert.equal(doc.pages.length, 4);
  assert.deepEqual(doc.pages[0].componentIds, ['f_name']);
  assert.ok(doc.pages[1].componentIds.includes('f_rating'));
  assert.equal(doc.components[childRes.componentId].pageId, split.pageId);

  // Delete newly split page (default relocation) -> components relocate safely back to Page 1
  doc = deletePage(doc, split.pageId!);
  assert.equal(doc.pages.length, 3);
  assert.ok(doc.pages[0].componentIds.includes('f_rating'));
  assert.equal(doc.components[childRes.componentId].pageId, doc.pages[0].id);

  // Deleting down to 1 page blocks deleting the last remaining page
  doc = deletePage(doc, doc.pages[2].id);
  doc = deletePage(doc, doc.pages[1].id);
  assert.equal(doc.pages.length, 1);
  const blockedDelete = deletePage(doc, doc.pages[0].id);
  assert.equal(blockedDelete.pages.length, 1);
});

// ============================================================================
// 6. History Engine (Undo / Redo / Remote Sync Reconciliation)
// ============================================================================

test('HistoryEngine supports undo, redo, branch overwrite, maxEntries, and remote sync', () => {
  const doc0 = migrateLegacyFormToDocument(createSampleLegacyForm());
  let history = createHistory(doc0, 3);

  assert.equal(canUndoHistory(history), false);
  assert.equal(canRedoHistory(history), false);

  const doc1 = updateFormMeta(doc0, { title: 'Edit 1' });
  const doc2 = updateFormMeta(doc1, { title: 'Edit 2' });
  const doc3 = updateFormMeta(doc2, { title: 'Edit 3' });
  const doc4 = updateFormMeta(doc3, { title: 'Edit 4' });

  history = pushHistory(history, doc1);
  history = pushHistory(history, doc2);
  history = pushHistory(history, doc3);
  history = pushHistory(history, doc4);

  assert.equal(history.past.length, 3);
  assert.equal(history.present.title, 'Edit 4');

  history = undoHistory(history);
  assert.equal(history.present.title, 'Edit 3');
  history = undoHistory(history);
  assert.equal(history.present.title, 'Edit 2');
  assert.equal(canRedoHistory(history), true);

  history = redoHistory(history);
  assert.equal(history.present.title, 'Edit 3');

  const remoteDoc = updateFormMeta(history.present, { title: 'Remote Collaborator Edit' });
  history = replaceHistoryPresent(history, remoteDoc);
  assert.equal(history.present.title, 'Remote Collaborator Edit');
  assert.equal(canUndoHistory(history), true);

  const branchDoc = updateFormMeta(history.present, { title: 'New Branch' });
  history = pushHistory(history, branchDoc);
  assert.equal(canRedoHistory(history), false);
});

// ============================================================================
// 7. Design Engine & Logic Engine
// ============================================================================

test('DesignEngine resolves global design tokens, background images/overlays, and responsive grids', () => {
  const doc = migrateLegacyFormToDocument(createSampleLegacyForm());
  const tokens = resolveDesignTokens(doc.design, 'desktop');
  assert.equal(tokens.fontFamilyClass, 'font-display');
  assert.equal(tokens.borderRadiusClass, 'rounded-2xl');
  assert.equal(tokens.cssVariables['--studio-primary'], '#0F766E');

  // Background image + overlay opacity clamping
  const imgDoc = updateDesign(doc, {
    backgroundStyle: 'image',
    backgroundImageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe',
    backgroundPosition: 'top',
    backgroundSize: 'contain',
    backgroundOverlayColor: '#0B0D0F',
    backgroundOverlayOpacity: 0.45,
    pageAlignment: 'left',
    borderWidth: '2',
    cardShadow: 'lg',
  });
  const imgTokens = resolveDesignTokens(imgDoc.design, 'desktop');
  assert.equal(
    imgTokens.backgroundImageUrl,
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe'
  );
  assert.equal(imgTokens.backgroundImageStyle?.objectFit, 'contain');
  assert.equal(imgTokens.backgroundImageStyle?.objectPosition, 'top');
  assert.equal(imgTokens.backgroundOverlayStyle?.opacity, 0.45);
  assert.equal(imgTokens.pageAlignmentClass, 'mr-auto');
  assert.equal(imgTokens.surfaceStyle.borderWidth, '2px');

  // Responsive grid & explicit viewport overrides
  const halfGrid = resolveComponentGridClass({
    width: 'half',
    responsive: { mobile: { hidden: true } },
  });
  assert.ok(halfGrid.includes('sm:col-span-6'));
  assert.ok(halfGrid.includes('hidden sm:block'));
  assert.equal(
    resolveComponentGridClass(
      { width: 'half', responsive: { mobile: { hidden: true } } },
      'mobile'
    ),
    'hidden'
  );
  assert.ok(
    resolveComponentGridClass({ width: 'third' }, 'tablet').includes('col-span-6')
  );
  assert.ok(
    resolveComponentGridClass({ width: 'third' }, 'desktop').includes('col-span-4')
  );
});

test('DesignEngine WCAG 2.1 contrast checker flags low-contrast pairs and passes accessible themes', () => {
  assert.equal(getContrastRatio('#000000', '#FFFFFF'), 21);
  assert.equal(getContrastRatio('#FFFFFF', '#FFFFFF'), 1);

  const accessibleChecks = checkDesignContrast(DEFAULT_STUDIO_DESIGN);
  assert.equal(accessibleChecks.length, 3);
  for (const item of accessibleChecks) {
    assert.equal(item.passesAA, true, `Expected default theme to pass AA for ${item.id} (${item.ratio})`);
  }

  // Verify all built-in presets pass AA contrast on body & heading
  for (const preset of BUILT_IN_THEME_PRESETS) {
    const checks = checkDesignContrast(preset.theme);
    const bodyCheck = checks.find((c) => c.id === 'body')!;
    const headingCheck = checks.find((c) => c.id === 'heading')!;
    assert.ok(bodyCheck.passesAA, `Preset ${preset.name} body contrast too low: ${bodyCheck.ratio}`);
    assert.ok(headingCheck.passesAA, `Preset ${preset.name} heading contrast too low: ${headingCheck.ratio}`);
  }

  // Low contrast theme must be caught
  const badChecks = checkDesignContrast({
    ...DEFAULT_STUDIO_DESIGN,
    surfaceColor: '#FFFFFF',
    textColor: '#D4D4D8',
    buttonBackgroundColor: '#FEF08A',
    buttonTextColor: '#FFFFFF',
  });
  assert.equal(badChecks.find((c) => c.id === 'body')?.passesAA, false);
  assert.equal(badChecks.find((c) => c.id === 'button')?.passesAA, false);
});

test('Component-level styling overrides inherit global tokens, apply overrides, and reset cleanly to theme', () => {
  let doc = migrateLegacyFormToDocument(createSampleLegacyForm());
  const imgRes = addComponent(doc, 'image', doc.pages[0].id, {
    content: { label: 'Hero Banner', mediaUrl: 'https://example.com/banner.jpg' },
  });
  doc = imgRes.doc;

  // By default, components inherit global theme with no style overrides
  assert.equal(hasComponentStyleOverrides(doc.components['f_name']), false);
  const inheritedTokens = resolveComponentTokens(doc.components['f_name'], doc.design, 'desktop');
  assert.equal(inheritedTokens.hasOverrides, false);
  assert.equal(inheritedTokens.headingStyle.color, doc.design.textColor);

  // Apply component-level typography + input overrides on f_name
  doc = updateComponent(doc, 'f_name', {
    appearance: {
      fontFamily: 'Playfair Display',
      fontSize: 'xl',
      textColor: '#7C2D12',
      inputBackgroundColor: '#FFFBEB',
      inputBorderColor: '#D97706',
      inputFocusColor: '#B45309',
      inputRadius: 'full',
      backgroundColor: '#FEFCE8',
      shadow: 'md',
    },
  });
  assert.equal(hasComponentStyleOverrides(doc.components['f_name']), true);
  const overriddenTokens = resolveComponentTokens(doc.components['f_name'], doc.design, 'desktop');
  assert.equal(overriddenTokens.hasOverrides, true);
  assert.equal(overriddenTokens.headingStyle.color, '#7C2D12');
  assert.equal(overriddenTokens.inputStyle.backgroundColor, '#FFFBEB');
  assert.equal(overriddenTokens.inputStyle.borderColor, '#D97706');
  assert.ok(overriddenTokens.inputClassName.includes('rounded-full'));

  // Apply image overrides
  doc = updateComponent(doc, imgRes.componentId, {
    appearance: {
      imageWidth: '1/2',
      aspectRatio: '16/9',
      objectFit: 'contain',
      objectPosition: 'top',
      imageAlignment: 'center',
      borderRadius: 'full',
    },
  });
  const imgTokens = resolveComponentTokens(doc.components[imgRes.componentId], doc.design, 'desktop');
  assert.equal(imgTokens.imageStyle.aspectRatio, '16/9');
  assert.equal(imgTokens.imageStyle.objectFit, 'contain');
  assert.equal(imgTokens.imageStyle.objectPosition, 'top');
  assert.ok(imgTokens.imageClassName.includes('mx-auto'));

  // Reset to Theme clears all appearance overrides back to defaults
  doc = resetComponentAppearance(doc, 'f_name');
  assert.equal(hasComponentStyleOverrides(doc.components['f_name']), false);
  assert.equal(doc.components['f_name'].appearance.inputBackgroundColor, undefined);
  assert.equal(doc.components['f_name'].appearance.fontFamily, undefined);
});

test('Responsive container column collapse, per-device design overrides, theme presets, and lossless persistence', () => {
  let doc = migrateLegacyFormToDocument(createSampleLegacyForm());
  const threeCol = addComponent(doc, 'three_column', doc.pages[0].id);
  doc = threeCol.doc;

  // Automatic responsive collapse: 3 cols on desktop -> 2 on tablet -> 1 on mobile
  assert.equal(resolveContainerColumns(doc.components[threeCol.componentId], 'desktop'), 3);
  assert.equal(resolveContainerColumns(doc.components[threeCol.componentId], 'tablet'), 2);
  assert.equal(resolveContainerColumns(doc.components[threeCol.componentId], 'mobile'), 1);

  // Explicit per-device column override on mobile + global responsive design override
  doc = updateComponent(doc, threeCol.componentId, {
    layout: {
      responsive: {
        mobile: { columns: 2, padding: 'sm' },
        tablet: { hidden: true },
      },
    },
  });
  assert.equal(resolveContainerColumns(doc.components[threeCol.componentId], 'mobile'), 2);
  assert.equal(
    resolveComponentTokens(doc.components[threeCol.componentId], doc.design, 'tablet').isHidden,
    true
  );

  doc = updateDesign(doc, {
    primaryColor: '#2563EB',
    gradientFrom: '#EFF6FF',
    gradientTo: '#DBEAFE',
    backgroundStyle: 'gradient',
    responsive: {
      mobile: { internalPadding: 'sm', textAlign: 'center' },
    },
  });
  const mobileTokens = resolveDesignTokens(doc.design, 'mobile');
  assert.equal(mobileTokens.internalPaddingClass, 'p-3.5');
  assert.equal(mobileTokens.textAlignClass, 'text-center');

  // Theme preset duplication & reset to default
  assert.ok(BUILT_IN_THEME_PRESETS.length >= 6);
  const duplicated = duplicateThemePreset(BUILT_IN_THEME_PRESETS[2], 'My Dark Brand');
  assert.equal(duplicated.name, 'My Dark Brand');
  assert.equal(duplicated.isCustom, true);
  assert.equal(duplicated.theme.backgroundColor, BUILT_IN_THEME_PRESETS[2].theme.backgroundColor);

  // Lossless persistence round-trip preserves global design, responsive device rules & component overrides
  const serialized = serializeDocumentToLegacyForm(doc);
  const restored = migrateLegacyFormToDocument(serialized);
  assert.equal(restored.design.backgroundStyle, 'gradient');
  assert.equal(restored.design.gradientFrom, '#EFF6FF');
  assert.equal(restored.design.responsive?.mobile?.internalPadding, 'sm');
  assert.equal(restored.design.responsive?.mobile?.textAlign, 'center');
  assert.equal(
    restored.components[threeCol.componentId].layout.responsive?.mobile?.columns,
    2
  );
  assert.equal(
    restored.components[threeCol.componentId].layout.responsive?.tablet?.hidden,
    true
  );

  // Reset global design back to FlexStore default
  const resetDoc = resetDesignToDefault(restored);
  assert.equal(resetDoc.design.primaryColor, DEFAULT_STUDIO_DESIGN.primaryColor);
  assert.equal(resetDoc.design.backgroundStyle, DEFAULT_STUDIO_DESIGN.backgroundStyle);
  assert.equal(resetDoc.design.responsive, undefined);
});

test('DefaultLogicEngine evaluates show/hide/require rules and resolves variables', () => {
  const doc: FormDocument = {
    ...migrateLegacyFormToDocument(createSampleLegacyForm()),
    variables: [{ id: 'v1', name: 'tier', valueType: 'string', initialValue: 'pro' }],
  };

  const highRating = defaultLogicEngine.evaluate(doc, { answers: { f_rating: 5 } });
  assert.ok(highRating.visibleComponentIds.has('f_name'));
  assert.ok(!highRating.visibleComponentIds.has('f_followup'));
  assert.equal(highRating.resolvedVariables.tier, 'pro');

  const lowRating = defaultLogicEngine.evaluate(doc, { answers: { f_rating: 1 } });
  assert.ok(lowRating.visibleComponentIds.has('f_followup'));
  assert.ok(lowRating.requiredComponentIds.has('f_followup'));
});

console.log(`\nSummary: ${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
