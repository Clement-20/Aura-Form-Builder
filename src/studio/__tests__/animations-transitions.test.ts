/**
 * Automated Tests for FlexStore Form Studio — Phase 3.3: Form Animations & Transitions
 *
 * Covers:
 *   1. All supported animation presets (none, fade_in, fade_out, slide_in, slide_out,
 *      scale_in, scale_out, subtle_zoom, reveal, stagger) + progress transitions.
 *   2. Safe clamping of durations, delays, stagger intervals & legacy FormTheme fallback.
 *   3. All supported triggers (on_page_load, on_viewport_enter, on_conditional_show,
 *      on_page_change, and on_conditional_result via resultScreen).
 *   4. Per-component overrides (inherit, custom, disabled) and global motion disabling.
 *   5. Stepped page transitions (forward/backward direction reversal, exit & enter timings,
 *      answer preservation, and compatibility with conditional branching / skipped pages / end_form).
 *   6. Conversational one-question-at-a-time transitions + conditional navigation.
 *   7. Mobile responsiveness (tighter travel offsets & capped cumulative stagger delay).
 *   8. Reduced-motion accessibility compliance (instant fallback across all animated surfaces).
 *   9. Lossless persistence round-trip (FormDocument <-> FormSchema) and editor-to-published parity.
 *
 * Run with: npx tsx src/studio/__tests__/animations-transitions.test.ts
 */

import assert from 'node:assert/strict';
import { FormSchema } from '../../types/form';
import {
  addComponent,
  ANIMATION_DELAY_MAX,
  ANIMATION_DURATION_MAX,
  ANIMATION_DURATION_MIN,
  ANIMATION_PRESET_CATALOG,
  createPage,
  DEFAULT_FORM_MOTION_CONFIG,
  defaultLogicEngine,
  FormComponentNode,
  FormDesignConfig,
  FormMotionConfig,
  getPresetCssClass,
  hasComponentStyleOverrides,
  hasCustomComponentAnimation,
  MAX_STAGGER_DELAY_DESKTOP_MS,
  MAX_STAGGER_DELAY_MOBILE_MS,
  migrateLegacyFormToDocument,
  MOTION_SCHEMA_VERSION,
  normalizeFormMotionConfig,
  repairFormDocument,
  resolveComponentAnimation,
  resolveConversationalNext,
  resolvePageTransition,
  resolveProgressBarTransition,
  resolveResultScreenAnimation,
  resolveSteppedNext,
  serializeDocumentToLegacyForm,
  STAGGER_INTERVAL_MAX,
  updateComponent,
  updateDesign,
  updateLogicRules,
} from '../index';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(err);
  }
}

function makeBaseForm(layoutMode: FormSchema['layoutMode'] = 'stepped'): FormSchema {
  return {
    id: 'form_motion_test',
    title: 'Motion Studio Verification Form',
    description: 'Testing Phase 3.3 animations and page transitions',
    category: 'survey',
    layoutMode,
    theme: {
      primaryColor: '#0F766E',
      backgroundColor: '#F7F6F3',
      surfaceColor: '#FFFFFF',
      textColor: '#0B0D0F',
      fontFamily: 'Plus Jakarta Sans',
      borderRadius: 'md',
      backgroundStyle: 'solid',
      inputStyle: 'bordered',
    },
    welcomeScreen: {
      enabled: false,
      title: 'Welcome',
      subtitle: 'Let us begin',
      buttonText: 'Start',
    },
    thankYouScreen: {
      title: 'All done',
      message: 'Thanks for completing the form',
      showRestartButton: true,
    },
    fields: [],
    steps: [{ id: 'page_1', stepNumber: 1, title: 'Page 1', description: 'First step' }],
    logicRules: [],
    settings: {
      isPublished: true,
      slug: 'motion-test',
      showProgressBar: true,
      submitButtonText: 'Submit',
      allowMultipleSubmissions: true,
      isQuizMode: false,
      notifyOnSubmission: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    responsesCount: 0,
  };
}

console.log('\nFlexStore Form Studio — Phase 3.3: Animations & Transitions Tests\n');

// ---------------------------------------------------------------------------
// 1. Animation Preset Catalog & CSS Class Resolution
// ---------------------------------------------------------------------------
test('every preset in ANIMATION_PRESET_CATALOG resolves to expected GPU-composited class', () => {
  const expectedClasses: Record<string, string> = {
    none: '',
    fade_in: 'fs-anim-fade-in',
    fade_out: 'fs-anim-fade-out',
    slide_in: 'fs-anim-slide-in',
    slide_out: 'fs-anim-slide-out',
    scale_in: 'fs-anim-scale-in',
    scale_out: 'fs-anim-scale-out',
    subtle_zoom: 'fs-anim-subtle-zoom',
    reveal: 'fs-anim-reveal',
    stagger: 'fs-anim-slide-in',
  };

  assert.equal(ANIMATION_PRESET_CATALOG.length, Object.keys(expectedClasses).length);
  for (const preset of ANIMATION_PRESET_CATALOG) {
    assert.equal(
      getPresetCssClass(preset.id),
      expectedClasses[preset.id],
      `Preset ${preset.id} should map to ${expectedClasses[preset.id]}`
    );
  }
});

// ---------------------------------------------------------------------------
// 2. Normalization, Clamping & Legacy FormTheme Compatibility
// ---------------------------------------------------------------------------
test('normalizeFormMotionConfig clamps extreme values safely and maps legacy theme fields', () => {
  const clamped = normalizeFormMotionConfig({
    motion: {
      ...DEFAULT_FORM_MOTION_CONFIG,
      durationMs: 99999,
      delayMs: 5000,
      staggerIntervalMs: 999,
      pageTransition: {
        ...DEFAULT_FORM_MOTION_CONFIG.pageTransition,
        durationMs: 10,
      },
    },
  });

  assert.equal(clamped.schemaVersion, MOTION_SCHEMA_VERSION);
  assert.equal(clamped.durationMs, ANIMATION_DURATION_MAX);
  assert.equal(clamped.delayMs, ANIMATION_DELAY_MAX);
  assert.equal(clamped.staggerIntervalMs, STAGGER_INTERVAL_MAX);
  assert.equal(clamped.pageTransition.durationMs, ANIMATION_DURATION_MIN);

  // Legacy theme without `motion` block
  const legacySlide = normalizeFormMotionConfig({
    animationPreset: 'slide-vertical',
    transitionSpeed: 'snappy',
    animationEasing: 'spring',
    respectReducedMotion: true,
  });
  assert.equal(legacySlide.enabled, true);
  assert.equal(legacySlide.componentPreset, 'slide_in');
  assert.equal(legacySlide.durationMs, 180);
  assert.equal(legacySlide.easing, 'spring');

  const legacyDisabled = normalizeFormMotionConfig({
    animationPreset: 'none',
  });
  assert.equal(legacyDisabled.enabled, false);
  assert.equal(legacyDisabled.componentPreset, 'none');
});

// ---------------------------------------------------------------------------
// 3. Component Triggers & Staggered Entrance
// ---------------------------------------------------------------------------
test('resolves on_page_load, on_viewport_enter, on_conditional_show, and on_page_change triggers accurately', () => {
  let doc = migrateLegacyFormToDocument(makeBaseForm('standard'));
  const added = addComponent(doc, 'text', doc.pages[0].id);
  doc = added.doc;
  const node = doc.components[added.componentId];

  // A. on_page_load
  const pageLoadDesign: Partial<FormDesignConfig> = {
    motion: {
      ...DEFAULT_FORM_MOTION_CONFIG,
      componentPreset: 'fade_in',
      trigger: 'on_page_load',
      durationMs: 300,
    },
  };
  const resLoad = resolveComponentAnimation(node, pageLoadDesign, {
    indexInContainer: 0,
    viewport: 'desktop',
  });
  assert.equal(resLoad.active, true);
  assert.equal(resLoad.className, 'fs-anim-fade-in');
  assert.equal(resLoad.needsViewportObserver, false);
  assert.equal((resLoad.style as Record<string, string>)['--fs-anim-duration'], '300ms');

  // B. on_viewport_enter
  const viewportDesign: Partial<FormDesignConfig> = {
    motion: {
      ...DEFAULT_FORM_MOTION_CONFIG,
      componentPreset: 'reveal',
      trigger: 'on_viewport_enter',
      direction: 'up',
    },
  };
  const resViewport = resolveComponentAnimation(node, viewportDesign, {
    indexInContainer: 0,
    viewport: 'desktop',
  });
  assert.equal(resViewport.active, true);
  assert.equal(resViewport.className, 'fs-anim-reveal');
  assert.equal(resViewport.needsViewportObserver, true);
  assert.equal(
    (resViewport.style as Record<string, string>)['--fs-anim-clip-from'],
    'inset(100% 0 0 0)'
  );

  // C. on_conditional_show does NOT fire before reveal, DOES fire when justRevealedByLogic is true
  const condNode: FormComponentNode = {
    ...node,
    appearance: {
      ...node.appearance,
      animation: {
        mode: 'custom',
        preset: 'scale_in',
        trigger: 'on_conditional_show',
        durationMs: 240,
      },
    },
  };
  const beforeReveal = resolveComponentAnimation(condNode, pageLoadDesign, {
    indexInContainer: 0,
    justRevealedByLogic: false,
  });
  assert.equal(beforeReveal.active, false);

  const onReveal = resolveComponentAnimation(condNode, pageLoadDesign, {
    indexInContainer: 0,
    justRevealedByLogic: true,
  });
  assert.equal(onReveal.active, true);
  assert.equal(onReveal.className, 'fs-anim-scale-in');
  assert.equal(onReveal.trigger, 'on_conditional_show');

  // D. on_page_change stays quiet on tick 0, fires when pageTransitionTick > 0
  const pageChangeDesign: Partial<FormDesignConfig> = {
    motion: {
      ...DEFAULT_FORM_MOTION_CONFIG,
      componentPreset: 'subtle_zoom',
      trigger: 'on_page_change',
    },
  };
  const beforeNav = resolveComponentAnimation(node, pageChangeDesign, {
    indexInContainer: 0,
    pageTransitionTick: 0,
  });
  assert.equal(beforeNav.active, false);

  const afterNav = resolveComponentAnimation(node, pageChangeDesign, {
    indexInContainer: 0,
    pageTransitionTick: 1,
  });
  assert.equal(afterNav.active, true);
  assert.equal(afterNav.className, 'fs-anim-subtle-zoom');
});

// ---------------------------------------------------------------------------
// 4. Per-Component Overrides, Global Disable & Introspection
// ---------------------------------------------------------------------------
test('supports per-component custom override, per-component disable, and global disable', () => {
  let doc = migrateLegacyFormToDocument(makeBaseForm('standard'));
  const added = addComponent(doc, 'heading', doc.pages[0].id);
  doc = added.doc;
  const compId = added.componentId;

  // Inherit default
  assert.equal(hasCustomComponentAnimation(doc.components[compId]), false);
  assert.equal(hasComponentStyleOverrides(doc.components[compId]), false);

  // Custom override on single component
  doc = updateComponent(doc, compId, {
    appearance: {
      animation: {
        mode: 'custom',
        preset: 'reveal',
        direction: 'left',
        durationMs: 360,
        delayMs: 80,
        easing: 'spring',
        trigger: 'on_page_load',
      },
    },
  });
  assert.equal(hasCustomComponentAnimation(doc.components[compId]), true);
  assert.equal(hasComponentStyleOverrides(doc.components[compId]), true);

  const customRes = resolveComponentAnimation(doc.components[compId], doc.design, {
    indexInContainer: 0,
    viewport: 'desktop',
  });
  assert.equal(customRes.active, true);
  assert.equal(customRes.preset, 'reveal');
  assert.equal(customRes.effectiveDurationMs, 360);
  assert.equal(customRes.effectiveDelayMs, 80);

  // Per-component disable overrides global enabled
  doc = updateComponent(doc, compId, {
    appearance: {
      animation: { mode: 'disabled' },
    },
  });
  const disabledLocal = resolveComponentAnimation(doc.components[compId], doc.design, {
    indexInContainer: 0,
  });
  assert.equal(disabledLocal.active, false);
  assert.equal(disabledLocal.preset, 'none');

  // Global disable turns off even custom components
  doc = updateComponent(doc, compId, {
    appearance: {
      animation: { mode: 'custom', preset: 'slide_in', trigger: 'on_page_load' },
    },
  });
  doc = updateDesign(doc, {
    motion: {
      ...DEFAULT_FORM_MOTION_CONFIG,
      enabled: false,
    },
  });
  const disabledGlobal = resolveComponentAnimation(doc.components[compId], doc.design, {
    indexInContainer: 0,
  });
  assert.equal(disabledGlobal.active, false);
});

// ---------------------------------------------------------------------------
// 5. Staggered Entrance & Mobile Performance Caps
// ---------------------------------------------------------------------------
test('staggered entrance scales travel distance on mobile and caps cumulative stagger delay', () => {
  let doc = migrateLegacyFormToDocument(makeBaseForm('standard'));
  const added = addComponent(doc, 'text', doc.pages[0].id);
  doc = added.doc;
  const node = doc.components[added.componentId];

  const staggerDesign: Partial<FormDesignConfig> = {
    motion: {
      ...DEFAULT_FORM_MOTION_CONFIG,
      componentPreset: 'stagger',
      direction: 'up',
      delayMs: 20,
      staggerIntervalMs: 80,
      trigger: 'on_page_load',
    },
  };

  // Block 0 vs Block 2 on desktop
  const d0 = resolveComponentAnimation(node, staggerDesign, {
    indexInContainer: 0,
    viewport: 'desktop',
  });
  const d2 = resolveComponentAnimation(node, staggerDesign, {
    indexInContainer: 2,
    viewport: 'desktop',
  });
  assert.equal(d0.effectiveDelayMs, 20);
  assert.equal(d2.effectiveDelayMs, 180);
  assert.equal((d0.style as Record<string, string>)['--fs-anim-y'], '18px');

  // Block 20 on desktop caps stagger extra at MAX_STAGGER_DELAY_DESKTOP_MS
  const d20 = resolveComponentAnimation(node, staggerDesign, {
    indexInContainer: 20,
    viewport: 'desktop',
  });
  assert.equal(d20.effectiveDelayMs, 20 + MAX_STAGGER_DELAY_DESKTOP_MS);

  // Mobile uses shorter travel distance (12px) and tighter stagger cap
  const m20 = resolveComponentAnimation(node, staggerDesign, {
    indexInContainer: 20,
    viewport: 'mobile',
  });
  assert.equal((m20.style as Record<string, string>)['--fs-anim-y'], '12px');
  assert.equal(m20.effectiveDelayMs, 20 + MAX_STAGGER_DELAY_MOBILE_MS);
});

// ---------------------------------------------------------------------------
// 6. Page Transitions (Forward/Backward) & Conditional Branching Compatibility
// ---------------------------------------------------------------------------
test('stepped page transitions reverse direction on back navigation and preserve branching journeys', () => {
  let doc = migrateLegacyFormToDocument(makeBaseForm('stepped'));
  const p1 = doc.pages[0].id;
  const p2Res = createPage(doc, { title: 'Step 2: Details' });
  doc = p2Res.doc;
  const p2 = p2Res.pageId;
  const p3Res = createPage(doc, { title: 'Step 3: Summary' });
  doc = p3Res.doc;
  const p3 = p3Res.pageId;

  const q1Res = addComponent(doc, 'radio', p1);
  doc = q1Res.doc;
  const q1 = q1Res.componentId;
  doc = updateComponent(doc, q1, {
    content: { label: 'Skip details?', options: ['Yes', 'No'] },
  });

  const q2Res = addComponent(doc, 'text', p2);
  doc = q2Res.doc;
  const q3Res = addComponent(doc, 'text', p3);
  doc = q3Res.doc;

  // Rule: if q1 === 'Yes', navigate directly to p3 (skipping p2)
  doc = updateLogicRules(doc, [
    {
      schemaVersion: 2,
      id: 'rule_skip_p2',
      name: 'Jump to Summary',
      enabled: true,
      priority: 1,
      trigger: 'on_change',
      conditionGroup: {
        kind: 'group',
        id: 'cg_1',
        combinator: 'AND',
        items: [
          {
            kind: 'condition',
            id: 'c_1',
            sourceType: 'component',
            sourceId: q1,
            operator: 'equals',
            value: 'Yes',
          },
        ],
      },
      actions: [
        {
          id: 'a_1',
          type: 'navigate_to_page',
          targetPageId: p3,
        },
      ],
      execution: {
        elseBehavior: 'none',
      },
      sourceFieldId: q1,
      condition: 'equals',
      value: 'Yes',
      action: 'jump_to_step',
      targetStep: 3,
    },
  ]);

  doc = updateDesign(doc, {
    motion: {
      ...DEFAULT_FORM_MOTION_CONFIG,
      pageTransition: {
        enabled: true,
        enterPreset: 'slide_in',
        exitPreset: 'slide_out',
        durationMs: 260,
        easing: 'ease-out',
        direction: 'auto',
      },
    },
  });

  // Forward enter slides from positive X (right -> left); Backward enter reverses to negative X
  const fwdEnter = resolvePageTransition(doc.design, {
    phase: 'entering',
    navDirection: 'forward',
    viewport: 'desktop',
  });
  const backEnter = resolvePageTransition(doc.design, {
    phase: 'entering',
    navDirection: 'backward',
    viewport: 'desktop',
  });
  assert.equal(fwdEnter.active, true);
  assert.equal(fwdEnter.className, 'fs-anim-slide-in');
  assert.equal((fwdEnter.style as Record<string, string>)['--fs-anim-x'], '18px');
  assert.equal((backEnter.style as Record<string, string>)['--fs-anim-x'], '-18px');

  // Exit phase is faster than enter phase so transitions feel crisp
  const fwdExit = resolvePageTransition(doc.design, {
    phase: 'exiting',
    navDirection: 'forward',
    viewport: 'desktop',
  });
  assert.equal(fwdExit.active, true);
  assert.equal(fwdExit.className, 'fs-anim-slide-out');
  assert.ok(fwdExit.exitDurationMs < fwdEnter.enterDurationMs);

  // Conditional branching resolves accurately alongside page transitions
  const answers: Record<string, unknown> = { [q1]: 'Yes' };
  const nextStep = resolveSteppedNext(doc, p1, answers, [], defaultLogicEngine);
  assert.equal(nextStep.kind, 'page');
  if (nextStep.kind === 'page') {
    assert.equal(nextStep.pageId, p3);
  }
  // Answers remain completely preserved
  assert.equal(answers[q1], 'Yes');
});

// ---------------------------------------------------------------------------
// 7. Conversational 1-by-1 Mode Transitions & Branching
// ---------------------------------------------------------------------------
test('conversational one-question-at-a-time navigation works seamlessly with page transitions', () => {
  let doc = migrateLegacyFormToDocument(makeBaseForm('conversational'));
  const p1 = doc.pages[0].id;
  const q1 = addComponent(doc, 'text', p1);
  doc = q1.doc;
  const q2 = addComponent(doc, 'email', p1);
  doc = q2.doc;

  const next = resolveConversationalNext(
    doc,
    q1.componentId,
    { [q1.componentId]: 'Ada Lovelace' },
    [],
    defaultLogicEngine,
    'mobile'
  );
  assert.equal(next.kind, 'component');
  if (next.kind === 'component') {
    assert.equal(next.componentId, q2.componentId);
  }

  const mobileTransition = resolvePageTransition(doc.design, {
    phase: 'entering',
    navDirection: 'forward',
    viewport: 'mobile',
  });
  assert.equal(mobileTransition.active, true);
  assert.equal((mobileTransition.style as Record<string, string>)['--fs-anim-x'], '12px');
});

// ---------------------------------------------------------------------------
// 8. Result Screens, Progress Bar & Reduced Motion Accessibility
// ---------------------------------------------------------------------------
test('respects prefers-reduced-motion across components, page transitions, result screens, and progress bar', () => {
  let doc = migrateLegacyFormToDocument(makeBaseForm('stepped'));
  const added = addComponent(doc, 'text', doc.pages[0].id);
  doc = added.doc;
  const node = doc.components[added.componentId];

  // Active when reducedMotion is false
  const normalResult = resolveResultScreenAnimation(doc.design, { reducedMotion: false });
  assert.equal(normalResult.active, true);
  assert.equal(normalResult.className, 'fs-anim-scale-in');

  const normalProgress = resolveProgressBarTransition(doc.design, false);
  assert.equal(normalProgress.transitionProperty, 'width');
  assert.equal(normalProgress.transitionDuration, '340ms');

  // Instant when reducedMotion is true & respectReducedMotion is true (default)
  const reducedComp = resolveComponentAnimation(node, doc.design, {
    indexInContainer: 0,
    reducedMotion: true,
  });
  assert.equal(reducedComp.active, false);
  assert.equal(reducedComp.isDisabledByReducedMotion, true);

  const reducedPage = resolvePageTransition(doc.design, {
    phase: 'entering',
    navDirection: 'forward',
    reducedMotion: true,
  });
  assert.equal(reducedPage.active, false);
  assert.equal(reducedPage.enterDurationMs, 0);
  assert.equal(reducedPage.exitDurationMs, 0);

  const reducedResult = resolveResultScreenAnimation(doc.design, { reducedMotion: true });
  assert.equal(reducedResult.active, false);

  const reducedProgress = resolveProgressBarTransition(doc.design, true);
  assert.equal(reducedProgress.transition, 'none');

  // Progress bar style: none
  const noProgressDesign: Partial<FormDesignConfig> = {
    motion: {
      ...DEFAULT_FORM_MOTION_CONFIG,
      progressTransition: { style: 'none', durationMs: 300 },
    },
  };
  assert.equal(resolveProgressBarTransition(noProgressDesign, false).transition, 'none');
});

// ---------------------------------------------------------------------------
// 9. Lossless Persistence Round-Trip & Published-Form Parity
// ---------------------------------------------------------------------------
test('persists global motion config and per-component animation overrides losslessly across FormDocument <-> FormSchema', () => {
  let doc = migrateLegacyFormToDocument(makeBaseForm('stepped'));
  const p1 = doc.pages[0].id;
  const c1 = addComponent(doc, 'heading', p1);
  doc = c1.doc;
  const c2 = addComponent(doc, 'text', p1);
  doc = c2.doc;

  const customMotion: FormMotionConfig = {
    schemaVersion: MOTION_SCHEMA_VERSION,
    enabled: true,
    respectReducedMotion: true,
    componentPreset: 'stagger',
    durationMs: 340,
    delayMs: 40,
    direction: 'up',
    easing: 'spring',
    trigger: 'on_viewport_enter',
    staggerIntervalMs: 70,
    pageTransition: {
      enabled: true,
      enterPreset: 'reveal',
      exitPreset: 'scale_out',
      durationMs: 300,
      easing: 'ease-in-out',
      direction: 'right',
    },
    conditionalReveal: {
      enabled: true,
      preset: 'subtle_zoom',
      durationMs: 240,
      direction: 'down',
      easing: 'ease-out',
    },
    resultScreen: {
      enabled: true,
      preset: 'scale_in',
      durationMs: 380,
      direction: 'up',
      easing: 'spring',
    },
    progressTransition: {
      style: 'spring',
      durationMs: 420,
    },
  };

  doc = updateDesign(doc, { motion: customMotion });
  doc = updateComponent(doc, c1.componentId, {
    appearance: {
      animation: {
        mode: 'custom',
        preset: 'reveal',
        durationMs: 400,
        delayMs: 60,
        direction: 'left',
        easing: 'ease-out',
        trigger: 'on_page_load',
      },
    },
  });
  doc = updateComponent(doc, c2.componentId, {
    appearance: {
      animation: { mode: 'disabled' },
    },
  });

  // Serialize to published FormSchema -> reload into FormDocument -> repair
  const serialized = serializeDocumentToLegacyForm(doc);
  const reloaded = repairFormDocument(migrateLegacyFormToDocument(serialized));

  assert.deepEqual(reloaded.design.motion, customMotion);
  assert.deepEqual(
    reloaded.components[c1.componentId].appearance.animation,
    doc.components[c1.componentId].appearance.animation
  );
  assert.deepEqual(
    reloaded.components[c2.componentId].appearance.animation,
    doc.components[c2.componentId].appearance.animation
  );

  // Verify 100% identical resolved output between editor document & reloaded published document
  const editorResolved = resolveComponentAnimation(
    doc.components[c1.componentId],
    doc.design,
    { indexInContainer: 0, viewport: 'desktop' }
  );
  const publishedResolved = resolveComponentAnimation(
    reloaded.components[c1.componentId],
    reloaded.design,
    { indexInContainer: 0, viewport: 'desktop' }
  );
  assert.deepEqual(publishedResolved, editorResolved);

  const editorPage = resolvePageTransition(doc.design, {
    phase: 'entering',
    navDirection: 'forward',
    viewport: 'desktop',
  });
  const publishedPage = resolvePageTransition(reloaded.design, {
    phase: 'entering',
    navDirection: 'forward',
    viewport: 'desktop',
  });
  assert.deepEqual(publishedPage, editorPage);
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
