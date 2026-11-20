/**
 * Automated Verification Suite — FlexStore Form Studio (Phase 2, Step 1: Visual Logic Builder)
 *
 * Run with: npx tsx src/studio/__tests__/logic-engine.test.ts
 */

import assert from 'node:assert/strict';
import {
  DefaultLogicEngine,
  FormDocument,
  StudioLogicRule,
  addComponent,
  conditionOperatorRegistry,
  createEmptyLogicRule,
  createPage,
  duplicateStudioLogicRule,
  evaluateSafeExpression,
  logicActionRegistry,
  migrateLegacyFormToDocument,
  removeComponent,
  serializeDocumentToLegacyForm,
  updateLogicRules,
  updateVariables,
  validateExpressionSyntax,
  validateFormLogic,
} from '../index';
import { FormSchema } from '../../types/form';

let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => void) {
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

function createLogicTestDocument(): {
  doc: FormDocument;
  ids: {
    textId: string;
    numId: string;
    radioId: string;
    checkId: string;
    yesNoId: string;
    dateId: string;
    targetId: string;
    calcFieldId: string;
    page1Id: string;
    page2Id: string;
    page3Id: string;
  };
} {
  const baseLegacy: FormSchema = {
    id: 'logic_test_form',
    title: 'Logic Test Form',
    description: 'Automated Phase 2 logic test form',
    category: 'survey',
    layoutMode: 'stepped',
    theme: {
      primaryColor: '#0F766E',
      backgroundColor: '#F7F6F3',
      surfaceColor: '#FFFFFF',
      textColor: '#0B0D0F',
      fontFamily: 'DM Sans',
      borderRadius: 'md',
      inputStyle: 'bordered',
      backgroundStyle: 'solid',
    },
    welcomeScreen: {
      enabled: false,
      title: 'Welcome',
      subtitle: '',
      buttonText: 'Start',
    },
    thankYouScreen: {
      title: 'Thanks',
      message: 'Done',
      showRestartButton: false,
    },
    fields: [],
    steps: [{ id: 'page_1', stepNumber: 1, title: 'Step 1', description: '' }],
    logicRules: [],
    settings: {
      isPublished: false,
      slug: 'logic-test',
      submitButtonText: 'Submit',
      allowMultipleSubmissions: true,
      isQuizMode: false,
      notifyOnSubmission: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  let doc = migrateLegacyFormToDocument(baseLegacy);
  const page1Id = doc.pages[0].id;
  const p2 = createPage(doc, { title: 'Step 2' });
  doc = p2.doc;
  const page2Id = p2.pageId;
  const p3 = createPage(doc, { title: 'Step 3' });
  doc = p3.doc;
  const page3Id = p3.pageId;

  const rText = addComponent(doc, 'text', page1Id, { content: { label: 'Company Name' } });
  doc = rText.doc;
  const rNum = addComponent(doc, 'number', page1Id, { content: { label: 'Age' } });
  doc = rNum.doc;
  const rRadio = addComponent(doc, 'radio', page1Id, {
    content: { label: 'Plan Tier', options: ['Starter', 'Pro', 'Enterprise'] },
  });
  doc = rRadio.doc;
  const rCheck = addComponent(doc, 'checkbox', page1Id, {
    content: { label: 'Interests', options: ['API', 'SSO', 'Analytics'] },
  });
  doc = rCheck.doc;
  const rYesNo = addComponent(doc, 'yes_no', page1Id, { content: { label: 'Agree to NDA?' } });
  doc = rYesNo.doc;
  const rDate = addComponent(doc, 'date', page2Id, { content: { label: 'Target Launch Date' } });
  doc = rDate.doc;
  const rTarget = addComponent(doc, 'text', page2Id, {
    content: { label: 'Enterprise Contact' },
  });
  doc = rTarget.doc;
  const rCalc = addComponent(doc, 'number', page3Id, { content: { label: 'Estimated Quote' } });
  doc = rCalc.doc;

  doc = updateVariables(doc, [
    { id: 'v_tier', name: 'tier_score', valueType: 'number', initialValue: 0 },
    { id: 'v_label', name: 'segment', valueType: 'string', initialValue: 'standard' },
    { id: 'v_vip', name: 'is_vip', valueType: 'boolean', initialValue: false },
  ]);

  return {
    doc,
    ids: {
      textId: rText.componentId,
      numId: rNum.componentId,
      radioId: rRadio.componentId,
      checkId: rCheck.componentId,
      yesNoId: rYesNo.componentId,
      dateId: rDate.componentId,
      targetId: rTarget.componentId,
      calcFieldId: rCalc.componentId,
      page1Id,
      page2Id,
      page3Id,
    },
  };
}

function makeRule(
  overrides: Partial<StudioLogicRule> & {
    id: string;
    name: string;
    conditionGroup: StudioLogicRule['conditionGroup'];
    actions: StudioLogicRule['actions'];
  }
): StudioLogicRule {
  return {
    schemaVersion: 2,
    enabled: true,
    priority: 10,
    trigger: 'on_change',
    execution: { elseBehavior: 'revert', stopOnMatch: false },
    sourceFieldId: '',
    condition: 'equals',
    value: '',
    action: 'show',
    ...overrides,
  };
}

console.log('\nFlexStore Form Studio — Phase 2 Visual Logic Builder Tests\n');

const engine = new DefaultLogicEngine();

runTest('1. All 15 core actions are registered in LogicActionRegistry', () => {
  const expected = [
    'show_component',
    'hide_component',
    'show_page',
    'hide_page',
    'enable_component',
    'disable_component',
    'require_component',
    'optional_component',
    'navigate_to_page',
    'skip_pages',
    'skip_to_question',
    'end_form',
    'set_variable',
    'display_message',
    'set_calculated_value',
  ] as const;

  for (const type of expected) {
    assert.ok(logicActionRegistry.get(type), `Action ${type} must be registered`);
  }
  assert.equal(logicActionRegistry.listAll().length, 15);
});

runTest('2. Condition operators cover text, number, selection, boolean, and date types accurately', () => {
  const evalOp = (
    op: Parameters<typeof conditionOperatorRegistry.evaluateClause>[0]['operator'],
    actual: unknown,
    value: string,
    dataType: 'text' | 'number' | 'selection' | 'boolean' | 'date',
    secondaryValue?: string
  ) =>
    conditionOperatorRegistry.evaluateClause(
      {
        kind: 'condition',
        id: 'c1',
        sourceType: 'component',
        sourceId: 'x',
        operator: op,
        value,
        secondaryValue,
      },
      actual,
      dataType
    );

  // Text
  assert.equal(evalOp('equals', 'Acme Corp', 'acme corp', 'text'), true);
  assert.equal(evalOp('not_equals', 'Acme', 'Beta', 'text'), true);
  assert.equal(evalOp('contains', 'FlexStore Studio', 'store', 'text'), true);
  assert.equal(evalOp('not_contains', 'FlexStore Studio', 'legacy', 'text'), true);
  assert.equal(evalOp('starts_with', 'FlexStore', 'flex', 'text'), true);
  assert.equal(evalOp('ends_with', 'FlexStore', 'store', 'text'), true);
  assert.equal(evalOp('is_empty', '', '', 'text'), true);
  assert.equal(evalOp('is_not_empty', 'hello', '', 'text'), true);

  // Number
  assert.equal(evalOp('equals', '25', '25', 'number'), true);
  assert.equal(evalOp('greater_than', 21, '18', 'number'), true);
  assert.equal(evalOp('less_than', 12, '18', 'number'), true);
  assert.equal(evalOp('greater_than_or_equal', 18, '18', 'number'), true);
  assert.equal(evalOp('less_than_or_equal', 18, '18', 'number'), true);
  assert.equal(evalOp('is_between', 25, '18', 'number', '30'), true);
  assert.equal(evalOp('is_between', 35, '18', 'number', '30'), false);

  // Selection
  assert.equal(evalOp('is_selected', 'Enterprise', 'Enterprise', 'selection'), true);
  assert.equal(evalOp('is_not_selected', 'Starter', 'Enterprise', 'selection'), true);
  assert.equal(evalOp('contains_option', ['API', 'SSO'], 'SSO', 'selection'), true);
  assert.equal(evalOp('not_contains_option', ['API'], 'Analytics', 'selection'), true);

  // Boolean
  assert.equal(evalOp('is_true', 'Yes', '', 'boolean'), true);
  assert.equal(evalOp('is_false', 'No', '', 'boolean'), true);
  assert.equal(evalOp('is_true', true, '', 'boolean'), true);
  assert.equal(evalOp('is_false', false, '', 'boolean'), true);

  // Date
  assert.equal(evalOp('before', '2025-05-01', '2025-06-01', 'date'), true);
  assert.equal(evalOp('after', '2025-07-01', '2025-06-01', 'date'), true);
  assert.equal(evalOp('is_between', '2025-06-15', '2025-06-01', 'date', '2025-06-30'), true);
  assert.equal(evalOp('is_in_past', '2000-01-01', '', 'date'), true);
  assert.equal(evalOp('is_in_future', '2099-12-31', '', 'date'), true);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  assert.equal(evalOp('is_today', todayStr, '', 'date'), true);
});

runTest('3. Nested AND / OR condition groups evaluate accurately', () => {
  const { doc, ids } = createLogicTestDocument();
  // IF (Agree to NDA == Yes) AND (Age > 18 OR Plan == Enterprise) THEN Show Enterprise Contact
  const rule = makeRule({
    id: 'r_nested',
    name: 'Nested eligibility rule',
    conditionGroup: {
      kind: 'group',
      id: 'g_root',
      combinator: 'AND',
      items: [
        {
          kind: 'condition',
          id: 'c_nda',
          sourceType: 'component',
          sourceId: ids.yesNoId,
          operator: 'is_true',
          value: '',
        },
        {
          kind: 'group',
          id: 'g_or',
          combinator: 'OR',
          items: [
            {
              kind: 'condition',
              id: 'c_age',
              sourceType: 'component',
              sourceId: ids.numId,
              operator: 'greater_than',
              value: '18',
            },
            {
              kind: 'condition',
              id: 'c_plan',
              sourceType: 'component',
              sourceId: ids.radioId,
              operator: 'is_selected',
              value: 'Enterprise',
            },
          ],
        },
      ],
    },
    actions: [{ id: 'a1', type: 'show_component', targetComponentId: ids.targetId }],
  });

  const updatedDoc = updateLogicRules(doc, [rule]);

  // False when NDA is No even if Age = 25
  const res1 = engine.evaluate(updatedDoc, {
    answers: { [ids.yesNoId]: 'No', [ids.numId]: 25 },
  });
  assert.equal(res1.visibleComponentIds.has(ids.targetId), false);

  // True when NDA is Yes and Plan is Enterprise (even if Age = 16)
  const res2 = engine.evaluate(updatedDoc, {
    answers: { [ids.yesNoId]: 'Yes', [ids.numId]: 16, [ids.radioId]: 'Enterprise' },
  });
  assert.equal(res2.visibleComponentIds.has(ids.targetId), true);

  // True when NDA is Yes and Age = 25 (even if Plan is Starter)
  const res3 = engine.evaluate(updatedDoc, {
    answers: { [ids.yesNoId]: 'Yes', [ids.numId]: 25, [ids.radioId]: 'Starter' },
  });
  assert.equal(res3.visibleComponentIds.has(ids.targetId), true);
});

runTest('4. Visibility, enable/disable, require/optional, navigation, skip, end_form, variables, messages & calculated values execute cleanly', () => {
  const { doc, ids } = createLogicTestDocument();

  const rules: StudioLogicRule[] = [
    makeRule({
      id: 'r_calc',
      name: 'Calculate quote & tier variable',
      priority: 10,
      conditionGroup: {
        kind: 'group',
        id: 'g1',
        combinator: 'AND',
        items: [
          {
            kind: 'condition',
            id: 'c1',
            sourceType: 'component',
            sourceId: ids.numId,
            operator: 'greater_than_or_equal',
            value: '10',
          },
        ],
      },
      actions: [
        { id: 'a_var', type: 'set_variable', variableName: 'tier_score', value: '50' },
        {
          id: 'a_calc_field',
          type: 'set_calculated_value',
          targetComponentId: ids.calcFieldId,
          expression: `({{${ids.numId}}} * 2) + {{tier_score}}`,
        },
        { id: 'a_req', type: 'require_component', targetComponentId: ids.targetId },
        { id: 'a_dis', type: 'disable_component', targetComponentId: ids.textId },
        {
          id: 'a_msg',
          type: 'display_message',
          message: 'Score is {{tier_score}} for age {{' + ids.numId + '}}',
          messageTone: 'success',
          targetComponentId: ids.targetId,
        },
      ],
    }),
    makeRule({
      id: 'r_nav',
      name: 'Jump to page 3 on Enterprise',
      priority: 20,
      conditionGroup: {
        kind: 'group',
        id: 'g2',
        combinator: 'AND',
        items: [
          {
            kind: 'condition',
            id: 'c2',
            sourceType: 'component',
            sourceId: ids.radioId,
            operator: 'is_selected',
            value: 'Enterprise',
          },
        ],
      },
      actions: [{ id: 'a_page', type: 'navigate_to_page', targetPageId: ids.page3Id }],
    }),
    makeRule({
      id: 'r_end',
      name: 'End form early if NDA declined',
      priority: 5,
      conditionGroup: {
        kind: 'group',
        id: 'g3',
        combinator: 'AND',
        items: [
          {
            kind: 'condition',
            id: 'c3',
            sourceType: 'component',
            sourceId: ids.yesNoId,
            operator: 'is_false',
            value: '',
          },
        ],
      },
      actions: [
        {
          id: 'a_end',
          type: 'end_form',
          endFormTitle: 'NDA Required',
          endFormMessage: 'Please accept the NDA to continue.',
        },
      ],
    }),
  ];

  const updatedDoc = updateLogicRules(doc, rules);

  const res = engine.evaluate(updatedDoc, {
    answers: { [ids.numId]: 20, [ids.radioId]: 'Enterprise', [ids.yesNoId]: 'Yes' },
  });

  assert.equal(res.resolvedVariables.tier_score, 50);
  assert.equal(res.calculatedComponentValues[ids.calcFieldId], 90);
  assert.equal(res.requiredComponentIds.has(ids.targetId), true);
  assert.equal(res.disabledComponentIds.has(ids.textId), true);
  assert.equal(res.nextPageIdOverride, ids.page3Id);
  assert.equal(res.nextStepOverride, 3);
  assert.equal(res.endFormTriggered, false);
  assert.equal(res.messages.length, 1);
  assert.equal(res.messages[0].text, 'Score is 50 for age 20');
  // Respondent evaluation never exposes private debug trace
  assert.equal(res.trace.length, 0);

  // Early end form takes precedence (priority 5 < 20)
  const endRes = engine.evaluate(updatedDoc, {
    answers: { [ids.yesNoId]: 'No', [ids.radioId]: 'Enterprise' },
    includeDebugTrace: true,
  });
  assert.equal(endRes.endFormTriggered, true);
  assert.equal(endRes.endFormTitle, 'NDA Required');
  assert.ok(endRes.conflicts.length > 0, 'Navigation conflict between priority 5 and 20 should be recorded in debug mode');
});

runTest('5. Safe expression evaluator computes arithmetic without eval and rejects invalid syntax', () => {
  assert.equal(
    evaluateSafeExpression('round(({{a}} * 3 + {{b}}) / 2, 1)', { a: 5, b: 2 }, {}),
    8.5
  );
  assert.equal(evaluateSafeExpression('max({{a}}, 10) + min({{b}}, 4)', { a: 3, b: 9 }, {}), 14);
  assert.equal(validateExpressionSyntax('{{a}} * 2 + 5').valid, true);
  assert.equal(validateExpressionSyntax('alert(1)').valid, false);
  assert.equal(validateExpressionSyntax('({{a}} + 2').valid, false);
});

runTest('6. Infinite-loop protection bounds oscillating variable calculations safely', () => {
  const { doc } = createLogicTestDocument();
  const loopRule = makeRule({
    id: 'r_loop',
    name: 'Self-incrementing variable',
    conditionGroup: {
      kind: 'group',
      id: 'g_loop',
      combinator: 'AND',
      items: [
        {
          kind: 'condition',
          id: 'c_loop',
          sourceType: 'variable',
          sourceId: 'tier_score',
          operator: 'greater_than_or_equal',
          value: '0',
        },
      ],
    },
    actions: [
      {
        id: 'a_inc',
        type: 'set_calculated_value',
        variableName: 'tier_score',
        expression: '{{tier_score}} + 1',
      },
    ],
  });

  const updatedDoc = updateLogicRules(doc, [loopRule]);
  const res = engine.evaluate(updatedDoc, { answers: {}, includeDebugTrace: true });
  assert.equal(res.loopGuardTriggered, true);
  assert.equal(res.passesExecuted, 5);
});

runTest('7. Deterministic conflict resolution resolves show vs hide by execution priority', () => {
  const { doc, ids } = createLogicTestDocument();
  const showRule = makeRule({
    id: 'r_show',
    name: 'Show target',
    priority: 10,
    conditionGroup: {
      kind: 'group',
      id: 'gs',
      combinator: 'AND',
      items: [
        {
          kind: 'condition',
          id: 'cs',
          sourceType: 'component',
          sourceId: ids.yesNoId,
          operator: 'is_true',
          value: '',
        },
      ],
    },
    actions: [{ id: 'as', type: 'show_component', targetComponentId: ids.targetId }],
  });
  const hideRule = makeRule({
    id: 'r_hide',
    name: 'Hide target override',
    priority: 20,
    conditionGroup: {
      kind: 'group',
      id: 'gh',
      combinator: 'AND',
      items: [
        {
          kind: 'condition',
          id: 'ch',
          sourceType: 'component',
          sourceId: ids.yesNoId,
          operator: 'is_true',
          value: '',
        },
      ],
    },
    actions: [{ id: 'ah', type: 'hide_component', targetComponentId: ids.targetId }],
  });

  const updatedDoc = updateLogicRules(doc, [hideRule, showRule]); // Unsorted input order
  const res = engine.evaluate(updatedDoc, {
    answers: { [ids.yesNoId]: 'Yes' },
    includeDebugTrace: true,
  });

  // Priority 10 runs first (show), then priority 20 overrides (hide) deterministically
  assert.equal(res.visibleComponentIds.has(ids.targetId), false);
  assert.equal(res.conflicts.length, 1);
  assert.equal(res.conflicts[0].winningRuleId, 'r_hide');
});

runTest('8. Static validator detects missing references and circular page navigation loops', () => {
  const { doc, ids } = createLogicTestDocument();

  // Create Page 1 -> Page 2 and Page 2 -> Page 1 loop + a broken component reference
  const loop1 = makeRule({
    id: 'r_p1_to_p2',
    name: 'Jump P1 to P2',
    conditionGroup: {
      kind: 'group',
      id: 'g_p1',
      combinator: 'AND',
      items: [
        {
          kind: 'condition',
          id: 'c_p1',
          sourceType: 'component',
          sourceId: ids.radioId, // On Page 1
          operator: 'is_selected',
          value: 'Pro',
        },
      ],
    },
    actions: [{ id: 'a_p2', type: 'navigate_to_page', targetPageId: ids.page2Id }],
  });

  const loop2 = makeRule({
    id: 'r_p2_to_p1',
    name: 'Jump P2 back to P1',
    conditionGroup: {
      kind: 'group',
      id: 'g_p2',
      combinator: 'AND',
      items: [
        {
          kind: 'condition',
          id: 'c_p2',
          sourceType: 'component',
          sourceId: ids.dateId, // On Page 2
          operator: 'is_not_empty',
          value: '',
        },
      ],
    },
    actions: [{ id: 'a_p1', type: 'navigate_to_page', targetPageId: ids.page1Id }],
  });

  const broken = makeRule({
    id: 'r_broken',
    name: 'Broken ref rule',
    conditionGroup: {
      kind: 'group',
      id: 'g_br',
      combinator: 'AND',
      items: [
        {
          kind: 'condition',
          id: 'c_br',
          sourceType: 'component',
          sourceId: 'deleted_component_xyz',
          operator: 'equals',
          value: 'foo',
        },
      ],
    },
    actions: [{ id: 'a_br', type: 'show_component', targetComponentId: 'missing_target_999' }],
  });

  const updatedDoc = updateLogicRules(doc, [loop1, loop2, broken]);
  const report = validateFormLogic(updatedDoc);

  assert.equal(report.valid, false);
  assert.ok(report.circularPaths.length >= 1, 'Circular page loop must be detected');
  assert.ok(report.errors.some((e) => e.code === 'CIRCULAR_NAVIGATION'));
  assert.ok(report.errors.some((e) => e.code === 'MISSING_SOURCE_COMPONENT'));
  assert.ok(report.errors.some((e) => e.code === 'MISSING_TARGET_COMPONENT'));
});

runTest('9. Rule CRUD (create, duplicate, toggle enable/disable, delete) and lossless Firestore-safe persistence round-trip', () => {
  const { doc, ids } = createLogicTestDocument();
  const created = createEmptyLogicRule(doc, 0);
  const duplicated = duplicateStudioLogicRule(created, doc, 1);

  assert.notEqual(created.id, duplicated.id);
  assert.equal(duplicated.name, `${created.name} (Copy)`);

  // Disabled rule does not fire
  const disabledRule = makeRule({
    id: 'r_disabled',
    name: 'Disabled hide',
    enabled: false,
    conditionGroup: {
      kind: 'group',
      id: 'g_dis',
      combinator: 'AND',
      items: [
        {
          kind: 'condition',
          id: 'c_dis',
          sourceType: 'component',
          sourceId: ids.yesNoId,
          operator: 'is_true',
          value: '',
        },
      ],
    },
    actions: [{ id: 'a_dis', type: 'hide_component', targetComponentId: ids.targetId }],
  });

  const withRules = updateLogicRules(doc, [created, duplicated, disabledRule]);
  const evalDisabled = engine.evaluate(withRules, { answers: { [ids.yesNoId]: 'Yes' } });
  assert.equal(evalDisabled.visibleComponentIds.has(ids.targetId), true);

  // Round-trip through legacy FormSchema (LocalStorage & Firestore carrier)
  const serialized = serializeDocumentToLegacyForm(withRules);
  // Confirm zero unexpected top-level keys were added to FormSchema (Firestore rule compliance)
  assert.equal('variables' in serialized, false);
  assert.equal(serialized.logicRules.length, 3);

  const restored = migrateLegacyFormToDocument(serialized);
  assert.equal(restored.logic.rules.length, 3);
  assert.equal(restored.variables.length, 3);
  assert.equal(restored.variables[0].name, 'tier_score');

  const restoredDisabled = restored.logic.rules.find((r) => r.id === 'r_disabled') as StudioLogicRule;
  assert.equal(restoredDisabled.schemaVersion, 2);
  assert.equal(restoredDisabled.enabled, false);
});

runTest('10. Deleting a referenced question preserves complex multi-condition rules and flags missing references', () => {
  const { doc, ids } = createLogicTestDocument();
  const complexRule = makeRule({
    id: 'r_complex',
    name: 'Complex multi-condition rule',
    conditionGroup: {
      kind: 'group',
      id: 'g_c',
      combinator: 'AND',
      items: [
        {
          kind: 'condition',
          id: 'c_1',
          sourceType: 'component',
          sourceId: ids.numId,
          operator: 'greater_than',
          value: '18',
        },
        {
          kind: 'condition',
          id: 'c_2',
          sourceType: 'component',
          sourceId: ids.yesNoId,
          operator: 'is_true',
          value: '',
        },
      ],
    },
    actions: [{ id: 'a_c', type: 'show_component', targetComponentId: ids.targetId }],
  });

  const withComplex = updateLogicRules(doc, [complexRule]);
  const afterDelete = removeComponent(withComplex, ids.numId);

  assert.equal(afterDelete.logic.rules.length, 1, 'Complex rule is preserved rather than silently destroyed');
  const validation = validateFormLogic(afterDelete);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.code === 'MISSING_SOURCE_COMPONENT'));
});

console.log(`\nSummary: ${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
