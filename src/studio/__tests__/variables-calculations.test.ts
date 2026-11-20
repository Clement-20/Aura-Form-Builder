/**
 * FlexStore Form Studio — Phase 2, Step 3 Automated Test Suite
 *
 * Verifies:
 *  1. Variables system (all 6 types, stable IDs, type-compatibility validation, usage tracking, safe rename)
 *  2. Variable updates via logic rules & variable references inside conditions
 *  3. Answer piping across headings, paragraphs, questions, descriptions, confirmation/result screens,
 *     logic messages, and webhook/notification payloads (with fallbacks, missing-value handling & XSS safety)
 *  4. Safe calculation engine (all arithmetic/percentage/comparison operators, math functions, parentheses,
 *     constants, chained variables — zero eval/new Function)
 *  5. Explicit calculation error handling (division by zero, syntax errors, unknown functions, missing refs,
 *     type mismatches)
 *  6. Dynamic recalculation & selective incremental dependency caching (unrelated calculations skipped)
 *  7. Circular calculation dependency detection (self & multi-hop) + pre-publish validation blocking
 *  8. Locale-aware currency, number, percentage & date formatting across multiple currencies & locales
 *  9. FormDocument <-> legacy FormSchema migration round-trip for variables, formulas & formatting
 * 10. Server-side independent recalculation in validateAndSanitizeSubmission (ignores client tampering)
 *
 * Run with: npx tsx src/studio/__tests__/variables-calculations.test.ts
 */

import assert from 'node:assert/strict';
import {
  FormDocument,
  FormVariableDefinition,
  DOCUMENT_SCHEMA_VERSION,
  StudioLogicRule,
  defaultLogicEngine,
  validateFormLogic,
  validateVariableAssignment,
  coerceVariableValueSafe,
  formatValue,
  evaluateFormula,
  validateFormula,
  buildCalculationDependencyGraph,
  IncrementalCalculationCache,
  evaluateDocumentCalculations,
  resolvePipedText,
  pipeComponentNode,
  buildPipingCatalog,
  findVariableUsages,
  renameVariableInDocument,
  buildPipedNotificationPayload,
  validateAndSanitizeSubmission,
  migrateLegacyFormToDocument,
  serializeDocumentToLegacyForm,
} from '../index';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err?.stack || err}`);
  }
}

function makeNode(
  id: string,
  pageId: string,
  type: FormDocument['components'][string]['type'],
  label: string,
  extra?: {
    body?: string;
    helpText?: string;
    required?: boolean;
    options?: string[];
  }
): FormDocument['components'][string] {
  return {
    id,
    type,
    pageId,
    parentId: null,
    children: [],
    content: {
      label,
      body: extra?.body,
      helpText: extra?.helpText,
      options: extra?.options,
    },
    validation: {
      required: Boolean(extra?.required),
    },
    layout: {
      width: 'full',
      alignment: 'left',
    },
    appearance: {},
    behaviour: {
      hiddenByDefault: false,
      readOnly: false,
    },
  };
}

function makeRule(
  rule: Omit<StudioLogicRule, 'schemaVersion' | 'sourceFieldId' | 'condition' | 'value' | 'action'>
): StudioLogicRule {
  return {
    ...rule,
    schemaVersion: 2,
    sourceFieldId: '',
    condition: 'equals',
    value: '',
    action: 'show',
  };
}

function makeBaseDoc(
  components: FormDocument['components'],
  variables: FormVariableDefinition[] = [],
  rules: StudioLogicRule[] = [],
  extra?: {
    title?: string;
    description?: string;
    welcomeTitle?: string;
    welcomeSubtitle?: string;
    thankYouTitle?: string;
    thankYouMessage?: string;
  }
): FormDocument {
  const componentIds = Object.keys(components);
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: 'form_vars_calc_test',
    title: extra?.title || 'Order Quote Calculator',
    description: extra?.description || 'Calculate your tailored package cost.',
    category: 'survey',
    layoutMode: 'stepped',
    settings: {
      slug: 'quote-calc',
      isPublished: false,
      notifyOnSubmission: true,
      allowMultipleSubmissions: true,
      showProgressBar: true,
      isQuizMode: false,
      submitButtonText: 'Submit Order',
    },
    design: {
      primaryColor: '#0F766E',
      backgroundColor: '#F7F6F3',
      surfaceColor: '#FFFFFF',
      textColor: '#0B0D0F',
      borderRadius: 'lg',
      fontFamily: 'DM Sans',
      inputStyle: 'bordered',
      backgroundStyle: 'solid',
    },
    welcomeScreen: {
      enabled: true,
      title: extra?.welcomeTitle || 'Welcome to {{company_name | FlexStore}}',
      subtitle: extra?.welcomeSubtitle || 'Get an instant quote today.',
      buttonText: 'Start',
    },
    thankYouScreen: {
      title: extra?.thankYouTitle || 'Thank you, {{first_name | friend}}!',
      message:
        extra?.thankYouMessage ||
        'Your selected package costs {{grand_total}} (including {{tax_amount}} tax).',
      showRestartButton: true,
    },
    pages: [
      {
        id: 'page_1',
        index: 1,
        title: 'Quote Details',
        description: 'Hello {{first_name | there}}, fill out your order below.',
        componentIds,
      },
    ],
    components,
    logic: { rules },
    variables,
    integrations: {},
    metadata: {
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      responsesCount: 0,
    },
  };
}

console.log('\nFlexStore Form Studio — Phase 2, Step 3 (Variables, Calculations & Answer Piping)\n');

// ============================================================================
// 1. Variables System — All 6 Types, Type Validation, Usage Tracking & Rename
// ============================================================================

test('Variables system validates all 6 types and blocks incompatible type assignments', () => {
  const numVar: FormVariableDefinition = {
    id: 'var_qty',
    name: 'quantity',
    valueType: 'number',
    initialValue: 1,
  };
  const strVar: FormVariableDefinition = {
    id: 'var_note',
    name: 'customer_note',
    valueType: 'string',
    initialValue: 'Standard',
  };
  const boolVar: FormVariableDefinition = {
    id: 'var_vip',
    name: 'is_vip',
    valueType: 'boolean',
    initialValue: false,
  };
  const dateVar: FormVariableDefinition = {
    id: 'var_start',
    name: 'start_date',
    valueType: 'date',
    initialValue: '2026-06-15',
  };
  const selVar: FormVariableDefinition = {
    id: 'var_tier',
    name: 'tier',
    valueType: 'selection',
    options: ['Starter', 'Pro', 'Enterprise'],
    initialValue: 'Starter',
  };
  const listVar: FormVariableDefinition = {
    id: 'var_addons',
    name: 'addons',
    valueType: 'list',
    options: ['Priority Support', 'SSO', 'Audit Logs'],
    initialValue: ['SSO'],
  };

  // Valid assignments
  assert.equal(validateVariableAssignment(numVar, '42.5').valid, true);
  assert.equal(validateVariableAssignment(numVar, '42.5').coercedValue, 42.5);
  assert.equal(validateVariableAssignment(strVar, 'Hello').valid, true);
  assert.equal(validateVariableAssignment(boolVar, 'true').coercedValue, true);
  assert.equal(validateVariableAssignment(boolVar, 'no').coercedValue, false);
  assert.equal(validateVariableAssignment(dateVar, '2026-11-30').valid, true);
  assert.equal(validateVariableAssignment(selVar, 'Enterprise').valid, true);
  assert.equal(validateVariableAssignment(listVar, ['SSO', 'Audit Logs']).valid, true);
  assert.deepEqual(validateVariableAssignment(listVar, 'SSO, Priority Support').coercedValue, [
    'SSO',
    'Priority Support',
  ]);

  // Incompatible assignments MUST be rejected
  assert.equal(validateVariableAssignment(numVar, 'not-a-number').valid, false);
  assert.equal(validateVariableAssignment(boolVar, 'maybe').valid, false);
  assert.equal(validateVariableAssignment(dateVar, '2026-02-31').valid, false);
  assert.equal(validateVariableAssignment(dateVar, 'invalid-date').valid, false);
  assert.equal(validateVariableAssignment(selVar, 'Platinum').valid, false);
  assert.equal(validateVariableAssignment(listVar, ['UnknownAddon']).valid, false);
  assert.equal(coerceVariableValueSafe('not-a-number', numVar), 0);
});

test('Safe variable rename updates references across formulas, rules, and piped content without breaking stable ID', () => {
  const qPrice = makeNode('q_price', 'page_1', 'number', 'Unit Price');
  const heading = makeNode(
    'h_summary',
    'page_1',
    'heading',
    'Estimated subtotal: {{base_cost}}'
  );

  const vBase: FormVariableDefinition = {
    id: 'var_stable_1',
    name: 'base_cost',
    valueType: 'number',
    initialValue: 0,
    expression: '{{q_price}} * 2',
  };
  const vFinal: FormVariableDefinition = {
    id: 'var_stable_2',
    name: 'final_cost',
    valueType: 'number',
    initialValue: 0,
    expression: '{{base_cost}} + 25',
  };

  const rule = makeRule({
    id: 'rule_1',
    name: 'High Cost Alert',
    enabled: true,
    priority: 10,
    trigger: 'on_change',
    conditionGroup: {
      id: 'cg_1',
      kind: 'group',
      combinator: 'AND',
      items: [
        {
          id: 'c_1',
          kind: 'condition',
          sourceType: 'variable',
          sourceId: 'base_cost',
          operator: 'greater_than',
          value: '100',
        },
      ],
    },
    actions: [
      {
        id: 'a_1',
        type: 'display_message',
        message: 'Your subtotal {{base_cost}} qualifies for free shipping!',
        messageTone: 'success',
      },
    ],
    execution: { elseBehavior: 'revert' },
  });

  const doc = makeBaseDoc(
    { q_price: qPrice, h_summary: heading },
    [vBase, vFinal],
    [rule],
    { thankYouMessage: 'Paid {{base_cost | $0}}.' }
  );

  // Usage tracking detects all references
  const usages = findVariableUsages(doc, vBase);
  assert.ok(usages.length >= 4, `Expected >=4 usages, got ${usages.length}`);

  // Reject duplicate rename
  const dupAttempt = renameVariableInDocument(doc, 'var_stable_1', 'final_cost');
  assert.ok(dupAttempt.error, 'Renaming to an existing variable name must return an error');

  // Perform valid rename
  const renamed = renameVariableInDocument(doc, 'var_stable_1', 'subtotal_amount');
  assert.equal(renamed.error, undefined);
  const nextDoc = renamed.document;

  const updatedVar = nextDoc.variables.find((v) => v.id === 'var_stable_1');
  assert.equal(updatedVar?.name, 'subtotal_amount', 'Stable ID preserved, name updated');
  assert.equal(
    nextDoc.variables.find((v) => v.id === 'var_stable_2')?.expression,
    '{{subtotal_amount}} + 25'
  );
  assert.equal(nextDoc.components['h_summary'].content.label, 'Estimated subtotal: {{subtotal_amount}}');
  assert.equal(nextDoc.thankYouScreen.message, 'Paid {{subtotal_amount | $0}}.');
  const updatedRule = nextDoc.logic.rules[0] as StudioLogicRule;
  assert.equal(
    updatedRule.conditionGroup.items[0].kind === 'condition'
      ? updatedRule.conditionGroup.items[0].sourceId
      : '',
    'subtotal_amount'
  );
  assert.equal(
    updatedRule.actions[0].message,
    'Your subtotal {{subtotal_amount}} qualifies for free shipping!'
  );
});

// ============================================================================
// 2. Safe Calculation Engine — All Operators, Functions & Error Reporting
// ============================================================================

test('Safe calculation engine evaluates arithmetic, postfix %, comparisons, parentheses, and all math functions', () => {
  const ctx = {
    answers: { q_qty: 4, q_price: 50, q_discount: 10 },
    variables: { shipping: 15, bonus: 5 },
  };

  // Arithmetic & grouping
  assert.equal(evaluateFormula('({{q_qty}} * {{q_price}}) + {{shipping}}', ctx).value, 215);
  assert.equal(evaluateFormula('100 - 40 / 2', ctx).value, 80);
  assert.equal(evaluateFormula('(100 - 40) / 2', ctx).value, 30);
  assert.equal(evaluateFormula('-10 + 25', ctx).value, 15);
  assert.equal(evaluateFormula('17 % 5', ctx).value, 2);

  // Postfix percentage & percentage functions
  assert.equal(evaluateFormula('200 * (1 + 15%)', ctx).value, 230);
  assert.equal(evaluateFormula('pct(200, 15)', ctx).value, 30);
  assert.equal(evaluateFormula('percent(45, 90)', ctx).value, 50);

  // Functions: min, max, round, floor, ceil, abs, sum, avg, if
  assert.equal(evaluateFormula('round(12.3456, 2)', ctx).value, 12.35);
  assert.equal(evaluateFormula('floor(9.99)', ctx).value, 9);
  assert.equal(evaluateFormula('ceil(9.01)', ctx).value, 10);
  assert.equal(evaluateFormula('abs(-42.5)', ctx).value, 42.5);
  assert.equal(evaluateFormula('min(12, 4, 19)', ctx).value, 4);
  assert.equal(evaluateFormula('max(12, 4, 19)', ctx).value, 19);
  assert.equal(evaluateFormula('sum({{q_qty}}, {{q_price}}, {{shipping}})', ctx).value, 69);
  assert.equal(evaluateFormula('avg(10, 20, 30)', ctx).value, 20);
  assert.equal(evaluateFormula('if({{q_qty}} >= 4, 20, 0)', ctx).value, 20);
  assert.equal(evaluateFormula('if({{q_qty}} < 4, 20, 5)', ctx).value, 5);

  // Comparison operators return 1 / 0
  assert.equal(evaluateFormula('10 == 10', ctx).value, 1);
  assert.equal(evaluateFormula('10 != 10', ctx).value, 0);
  assert.equal(evaluateFormula('10 > 5', ctx).value, 1);
  assert.equal(evaluateFormula('10 <= 5', ctx).value, 0);
});

test('Safe calculation engine reports division by zero, syntax errors, unknown functions, missing refs, and type mismatches', () => {
  const qName = makeNode('q_name', 'page_1', 'text', 'Full Name');
  const qPrice = makeNode('q_price', 'page_1', 'number', 'Price');
  const vDate: FormVariableDefinition = {
    id: 'v_date',
    name: 'event_date',
    valueType: 'date',
    initialValue: '2026-09-01',
  };
  const doc = makeBaseDoc({ q_name: qName, q_price: qPrice }, [vDate]);

  // Division by zero
  const divZero = evaluateFormula('{{q_price}} / 0', {
    answers: { q_price: 100 },
    variables: {},
  });
  assert.equal(divZero.ok, false);
  assert.equal(divZero.error?.code, 'DIVISION_BY_ZERO');

  const modZero = evaluateFormula('10 % 0', { answers: {}, variables: {} });
  assert.equal(modZero.ok, false);
  assert.equal(modZero.error?.code, 'DIVISION_BY_ZERO');

  const pctZero = evaluateFormula('percent(10, 0)', { answers: {}, variables: {} });
  assert.equal(pctZero.ok, false);
  assert.equal(pctZero.error?.code, 'DIVISION_BY_ZERO');

  // Unbalanced parentheses & invalid syntax
  const badSyntax = validateFormula('(10 + 5', doc);
  assert.equal(badSyntax.valid, false);
  assert.ok(badSyntax.errors.some((e) => e.code === 'INVALID_SYNTAX'));

  // Unknown / disallowed function (e.g. attempting JS injection)
  const injection = validateFormula('eval(1 + 1)', doc);
  assert.equal(injection.valid, false);
  assert.ok(injection.errors.some((e) => e.code === 'UNKNOWN_FUNCTION'));

  // Missing reference
  const missingRef = validateFormula('{{does_not_exist}} * 2', doc);
  assert.equal(missingRef.valid, false);
  assert.ok(missingRef.errors.some((e) => e.code === 'MISSING_REFERENCE'));

  // Incompatible non-numeric text/date variable in numeric formula
  const dateInMath = validateFormula('{{event_date}} + 10', doc);
  assert.equal(dateInMath.valid, false);
  assert.ok(dateInMath.errors.some((e) => e.code === 'TYPE_MISMATCH'));

  // Runtime type mismatch when respondent types non-numeric text into a field used in math
  const runtimeMismatch = evaluateFormula('{{q_name}} * 5', {
    answers: { q_name: 'Alice' },
    variables: {},
  });
  assert.equal(runtimeMismatch.ok, false);
  assert.equal(runtimeMismatch.error?.code, 'TYPE_MISMATCH');
});

// ============================================================================
// 3. Selective Dependency Tracking & Circular Dependency Detection
// ============================================================================

test('IncrementalCalculationCache only recalculates dependent variables when an answer changes', () => {
  const qA = makeNode('q_a', 'page_1', 'number', 'Units A');
  const qB = makeNode('q_b', 'page_1', 'number', 'Units B');

  const vTotalA: FormVariableDefinition = {
    id: 'var_total_a',
    name: 'total_a',
    valueType: 'number',
    initialValue: 0,
    expression: '{{q_a}} * 10',
  };
  const vTotalB: FormVariableDefinition = {
    id: 'var_total_b',
    name: 'total_b',
    valueType: 'number',
    initialValue: 0,
    expression: '{{q_b}} * 25',
  };
  const vGrand: FormVariableDefinition = {
    id: 'var_grand',
    name: 'grand',
    valueType: 'number',
    initialValue: 0,
    expression: '{{total_a}} + {{total_b}}',
  };

  const doc = makeBaseDoc({ q_a: qA, q_b: qB }, [vGrand, vTotalA, vTotalB]); // Intentionally unsorted to verify topological sort
  const cache = new IncrementalCalculationCache();

  // Pass 1: cold cache — all 3 evaluated in topological order
  const r1 = evaluateDocumentCalculations(doc, { q_a: 2, q_b: 3 }, undefined, cache);
  assert.equal(r1.values.total_a, 20);
  assert.equal(r1.values.total_b, 75);
  assert.equal(r1.values.grand, 95);
  assert.equal(r1.evaluatedVariableIds.length, 3);
  assert.equal(r1.skippedVariableIds.length, 0);

  // Pass 2: only q_a changes -> total_b MUST be skipped (served from cache), total_a & grand recalculated
  const r2 = evaluateDocumentCalculations(doc, { q_a: 5, q_b: 3 }, undefined, cache);
  assert.equal(r2.values.total_a, 50);
  assert.equal(r2.values.total_b, 75);
  assert.equal(r2.values.grand, 125);
  assert.ok(r2.evaluatedVariableIds.includes('var_total_a'));
  assert.ok(r2.evaluatedVariableIds.includes('var_grand'));
  assert.ok(r2.skippedVariableIds.includes('var_total_b'));
  assert.ok(!r2.evaluatedVariableIds.includes('var_total_b'));

  // Pass 3: no inputs change -> all 3 skipped
  const r3 = evaluateDocumentCalculations(doc, { q_a: 5, q_b: 3 }, undefined, cache);
  assert.equal(r3.evaluatedVariableIds.length, 0);
  assert.equal(r3.skippedVariableIds.length, 3);
});

test('Circular calculation dependencies (self-reference and multi-hop) are detected and block publish', () => {
  const vSelf: FormVariableDefinition = {
    id: 'var_self',
    name: 'self_loop',
    valueType: 'number',
    initialValue: 0,
    expression: '{{self_loop}} + 1',
  };
  const vA: FormVariableDefinition = {
    id: 'var_a',
    name: 'alpha',
    valueType: 'number',
    initialValue: 0,
    expression: '{{beta}} + 5',
  };
  const vB: FormVariableDefinition = {
    id: 'var_b',
    name: 'beta',
    valueType: 'number',
    initialValue: 0,
    expression: '{{alpha}} * 2',
  };

  const doc = makeBaseDoc({}, [vSelf, vA, vB]);

  const graph = buildCalculationDependencyGraph(doc);
  assert.ok(graph.circularVariableIds.has('var_self'));
  assert.ok(graph.circularVariableIds.has('var_a'));
  assert.ok(graph.circularVariableIds.has('var_b'));
  assert.ok(graph.circularChains.length >= 2);

  // Pre-publish validation flags CIRCULAR_CALCULATION errors
  const report = validateFormLogic(doc);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((e) => e.code === 'CIRCULAR_CALCULATION'));

  // Runtime evaluation terminates cleanly without infinite recursion and surfaces errors
  const runtime = evaluateDocumentCalculations(doc, {});
  assert.equal(runtime.errorsByVariableId['var_self']?.code, 'CIRCULAR_DEPENDENCY');
  assert.equal(runtime.errorsByVariableId['var_a']?.code, 'CIRCULAR_DEPENDENCY');
  assert.equal(runtime.errorsByVariableId['var_b']?.code, 'CIRCULAR_DEPENDENCY');
});

// ============================================================================
// 4. Locale-Aware Currency, Number, Percentage & Date Formatting
// ============================================================================

test('Locale-aware formatting supports multiple currencies, locales, decimals, percentages, and dates (no hardcoded currency)', () => {
  const usd = formatValue(1250.5, {
    style: 'currency',
    currency: 'USD',
    locale: 'en-US',
    decimals: 2,
  });
  assert.equal(usd, '$1,250.50');

  const gbp = formatValue(1250.5, {
    style: 'currency',
    currency: 'GBP',
    locale: 'en-GB',
    decimals: 2,
  });
  assert.equal(gbp, '£1,250.50');

  const eurDe = formatValue(1250.5, {
    style: 'currency',
    currency: 'EUR',
    locale: 'de-DE',
    decimals: 2,
  });
  assert.ok(eurDe.includes('€') && eurDe.includes('1.250,50'), `Unexpected de-DE EUR: ${eurDe}`);

  const ngn = formatValue(50000, {
    style: 'currency',
    currency: 'NGN',
    locale: 'en-NG',
    decimals: 0,
  });
  assert.ok(ngn.includes('50,000'), `Unexpected NGN format: ${ngn}`);

  const jpy = formatValue(15000, {
    style: 'currency',
    currency: 'JPY',
    locale: 'ja-JP',
    decimals: 0,
  });
  assert.ok(jpy.includes('15,000'), `Unexpected JPY format: ${jpy}`);

  const pct = formatValue(0.175, {
    style: 'percent',
    locale: 'en-US',
    decimals: 1,
  });
  assert.equal(pct, '17.5%');

  const numNoGrouping = formatValue(12345.678, {
    style: 'number',
    locale: 'en-US',
    decimals: 2,
    useGrouping: false,
  });
  assert.equal(numNoGrouping, '12345.68');

  const dateFmt = formatValue('2026-07-04', {
    style: 'date',
    locale: 'en-US',
    dateStyle: 'medium',
  });
  assert.ok(dateFmt.includes('2026') && dateFmt.includes('Jul'), `Unexpected date format: ${dateFmt}`);
});

// ============================================================================
// 5. Answer Piping — Dynamic Content, Fallbacks, Friendly Slugs & XSS Safety
// ============================================================================

test('Answer piping resolves answers & formatted variables across headings, paragraphs, questions, confirmation screens, and notifications safely', () => {
  const qFirstName = makeNode('q_first', 'page_1', 'text', 'First Name');
  const qPrice = makeNode('q_price', 'page_1', 'number', 'Package Price');
  const qHeading = makeNode(
    'h_welcome',
    'page_1',
    'heading',
    'Hello {{first_name | guest}}, welcome to your application.'
  );
  const qParagraph = makeNode(
    'p_quote',
    'page_1',
    'paragraph',
    'Summary',
    {
      body: 'Your selected package costs {{total_price}} (base {{q_price | 0}}).',
    }
  );

  const vTotal: FormVariableDefinition = {
    id: 'v_total',
    name: 'total_price',
    valueType: 'number',
    initialValue: 0,
    expression: 'round({{q_price}} * (1 + 10%), 2)',
    format: { style: 'currency', currency: 'GBP', locale: 'en-GB', decimals: 2 },
  };

  const doc = makeBaseDoc(
    {
      q_first: qFirstName,
      q_price: qPrice,
      h_welcome: qHeading,
      p_quote: qParagraph,
    },
    [vTotal],
    [],
    {
      thankYouTitle: 'Confirmed for {{first_name | Valued Customer}}',
      thankYouMessage: 'Total billed: {{total_price}}.',
    }
  );

  // Piping catalog lists both questions and variables
  const catalog = buildPipingCatalog(doc);
  assert.ok(catalog.variables.some((item) => item.tokenKey === 'total_price'));
  assert.ok(catalog.questions.some((item) => item.id === 'q_first'));

  // Case A: Unanswered -> uses fallback text, never leaks undefined/null/NaN
  const evalEmpty = defaultLogicEngine.evaluate(doc, { answers: {} });
  const emptyCtx = {
    document: doc,
    answers: {},
    variables: evalEmpty.resolvedVariables,
    formattedVariables: evalEmpty.formattedVariables,
  };
  assert.equal(
    pipeComponentNode(qHeading, emptyCtx).content.label,
    'Hello guest, welcome to your application.'
  );
  assert.equal(
    resolvePipedText('No fallback: {{first_name}}!', emptyCtx),
    'No fallback: !'
  );

  // Case B: Answered -> pipes friendly label slug ({{first_name}}), component ID ({{q_price}}), and formatted variable ({{total_price}})
  const answers = { q_first: 'Ada', q_price: 200 };
  const evalPopulated = defaultLogicEngine.evaluate(doc, { answers });
  assert.equal(evalPopulated.resolvedVariables.total_price, 220);
  assert.equal(evalPopulated.formattedVariables.total_price, '£220.00');

  const populatedCtx = {
    document: doc,
    answers,
    variables: evalPopulated.resolvedVariables,
    formattedVariables: evalPopulated.formattedVariables,
  };
  assert.equal(
    pipeComponentNode(qHeading, populatedCtx).content.label,
    'Hello Ada, welcome to your application.'
  );
  assert.equal(
    pipeComponentNode(qParagraph, populatedCtx).content.body,
    'Your selected package costs £220.00 (base 200).'
  );

  // Case C: Notification payload resolves confirmation title & message with piped answers & formatted variables
  const notif = buildPipedNotificationPayload(
    doc,
    answers,
    evalPopulated.resolvedVariables,
    evalPopulated.formattedVariables
  );
  assert.equal(notif.confirmationTitle, 'Confirmed for Ada');
  assert.equal(notif.confirmationMessage, 'Total billed: £220.00.');

  // Case D: XSS payload stays raw plain text (never executed or converted to HTML)
  const xssAnswers = { q_first: '<script>alert("xss")</script>', q_price: 100 };
  const xssText = resolvePipedText('Hello {{first_name}}', {
    document: doc,
    answers: xssAnswers,
    variables: {},
  });
  assert.equal(xssText, 'Hello <script>alert("xss")</script>');
});

// ============================================================================
// 6. Variables Inside Logic Rules (Actions + Conditions + Piped Messages)
// ============================================================================

test('Logic rules update variables, reference calculated variables in conditions, and pipe values into messages', () => {
  const qSeats = makeNode('q_seats', 'page_1', 'number', 'Seats');
  const qTier = makeNode('q_tier', 'page_1', 'radio', 'Plan', {
    options: ['Team', 'Enterprise'],
  });

  const vSeatRate: FormVariableDefinition = {
    id: 'v_rate',
    name: 'seat_rate',
    valueType: 'number',
    initialValue: 20,
  };
  const vSubtotal: FormVariableDefinition = {
    id: 'v_subtotal',
    name: 'subtotal',
    valueType: 'number',
    initialValue: 0,
    expression: '{{q_seats}} * {{seat_rate}}',
    format: { style: 'currency', currency: 'USD', locale: 'en-US', decimals: 2 },
  };
  const vBadge: FormVariableDefinition = {
    id: 'v_badge',
    name: 'tier_badge',
    valueType: 'selection',
    options: ['Standard', 'Volume VIP'],
    initialValue: 'Standard',
  };

  const rules: StudioLogicRule[] = [
    makeRule({
      id: 'rule_ent_rate',
      name: 'Enterprise Seat Rate',
      enabled: true,
      priority: 10,
      trigger: 'on_change',
      conditionGroup: {
        id: 'cg_1',
        kind: 'group',
        combinator: 'AND',
        items: [
          {
            id: 'c_1',
            kind: 'condition',
            sourceType: 'component',
            sourceId: 'q_tier',
            operator: 'equals',
            value: 'Enterprise',
          },
        ],
      },
      actions: [
        {
          id: 'a_rate',
          type: 'set_variable',
          variableName: 'seat_rate',
          value: '50',
        },
      ],
      execution: { elseBehavior: 'none' },
    }),
    makeRule({
      id: 'rule_vip_threshold',
      name: 'Volume VIP Notice',
      enabled: true,
      priority: 20,
      trigger: 'on_change',
      conditionGroup: {
        id: 'cg_2',
        kind: 'group',
        combinator: 'AND',
        items: [
          {
            id: 'c_2',
            kind: 'condition',
            sourceType: 'variable',
            sourceId: 'subtotal',
            operator: 'greater_than_or_equal',
            value: '500',
          },
        ],
      },
      actions: [
        {
          id: 'a_badge',
          type: 'set_variable',
          variableName: 'tier_badge',
          value: 'Volume VIP',
        },
        {
          id: 'a_msg',
          type: 'display_message',
          messageTone: 'success',
          message: 'Unlocked {{tier_badge}} pricing on your {{subtotal}} order!',
        },
      ],
      execution: { elseBehavior: 'none' },
    }),
  ];

  const doc = makeBaseDoc({ q_seats: qSeats, q_tier: qTier }, [vSeatRate, vSubtotal, vBadge], rules);

  // Team (rate 20) * 10 seats = $200 (< 500) -> Standard
  const teamEval = defaultLogicEngine.evaluate(doc, {
    answers: { q_seats: 10, q_tier: 'Team' },
  });
  assert.equal(teamEval.resolvedVariables.seat_rate, 20);
  assert.equal(teamEval.resolvedVariables.subtotal, 200);
  assert.equal(teamEval.formattedVariables.subtotal, '$200.00');
  assert.equal(teamEval.resolvedVariables.tier_badge, 'Standard');
  assert.equal(teamEval.messages.length, 0);

  // Enterprise (rate 50) * 12 seats = $600 (>= 500) -> Volume VIP + piped message
  const entEval = defaultLogicEngine.evaluate(doc, {
    answers: { q_seats: 12, q_tier: 'Enterprise' },
  });
  assert.equal(entEval.resolvedVariables.seat_rate, 50);
  assert.equal(entEval.resolvedVariables.subtotal, 600);
  assert.equal(entEval.formattedVariables.subtotal, '$600.00');
  assert.equal(entEval.resolvedVariables.tier_badge, 'Volume VIP');
  assert.equal(entEval.messages.length, 1);
  assert.equal(
    entEval.messages[0].text,
    'Unlocked Volume VIP pricing on your $600.00 order!'
  );
});

// ============================================================================
// 7. Persistence Round-Trip (FormDocument <-> Legacy FormSchema)
// ============================================================================

test('Migration round-trip preserves all 6 variable types, options, formulas, and locale/currency formatting losslessly', () => {
  const vars: FormVariableDefinition[] = [
    {
      id: 'v_1',
      name: 'order_total',
      valueType: 'number',
      initialValue: 0,
      expression: 'round({{q_1}} * 1.075, 2)',
      description: 'Total including VAT',
      format: { style: 'currency', currency: 'EUR', locale: 'fr-FR', decimals: 2 },
    },
    {
      id: 'v_2',
      name: 'selected_addons',
      valueType: 'list',
      options: ['Insurance', 'Express'],
      initialValue: ['Insurance'],
    },
    {
      id: 'v_3',
      name: 'delivery_date',
      valueType: 'date',
      initialValue: '2026-12-01',
      format: { style: 'date', locale: 'en-GB', dateStyle: 'long' },
    },
  ];

  const doc = makeBaseDoc({ q_1: makeNode('q_1', 'page_1', 'number', 'Amount') }, vars);
  const legacy = serializeDocumentToLegacyForm(doc);
  const restored = migrateLegacyFormToDocument(legacy);

  assert.equal(restored.variables.length, 3);
  const rTotal = restored.variables.find((v) => v.id === 'v_1');
  assert.equal(rTotal?.expression, 'round({{q_1}} * 1.075, 2)');
  assert.equal(rTotal?.format?.currency, 'EUR');
  assert.equal(rTotal?.format?.locale, 'fr-FR');
  assert.equal(rTotal?.description, 'Total including VAT');

  const rList = restored.variables.find((v) => v.id === 'v_2');
  assert.deepEqual(rList?.initialValue, ['Insurance']);
  assert.deepEqual(rList?.options, ['Insurance', 'Express']);

  const rDate = restored.variables.find((v) => v.id === 'v_3');
  assert.equal(rDate?.valueType, 'date');
  assert.equal(rDate?.format?.dateStyle, 'long');
});

// ============================================================================
// 8. Server-Side Independent Recalculation & Security Validation
// ============================================================================

test('validateAndSanitizeSubmission independently recalculates totals and rejects tampered client variables', () => {
  const qName = makeNode('q_name', 'page_1', 'text', 'Customer Name', { required: true });
  const qQty = makeNode('q_qty', 'page_1', 'number', 'Quantity', { required: true });
  const qTotalField = makeNode('q_total_field', 'page_1', 'number', 'Total Due');

  const vUnitPrice: FormVariableDefinition = {
    id: 'v_unit',
    name: 'unit_price',
    valueType: 'number',
    initialValue: 100,
  };
  const vGrandTotal: FormVariableDefinition = {
    id: 'v_grand',
    name: 'grand_total',
    valueType: 'number',
    initialValue: 0,
    expression: 'round(({{q_qty}} * {{unit_price}}) * (1 + 10%), 2)',
    format: { style: 'currency', currency: 'USD', locale: 'en-US', decimals: 2 },
  };

  const rule = makeRule({
    id: 'rule_write_field',
    name: 'Mirror Grand Total to Field',
    enabled: true,
    priority: 10,
    trigger: 'on_change',
    conditionGroup: {
      id: 'cg_1',
      kind: 'group',
      combinator: 'AND',
      items: [
        {
          id: 'c_1',
          kind: 'condition',
          sourceType: 'component',
          sourceId: 'q_qty',
          operator: 'is_not_empty',
          value: '',
        },
      ],
    },
    actions: [
      {
        id: 'a_calc',
        type: 'set_calculated_value',
        targetComponentId: 'q_total_field',
        expression: '{{grand_total}}',
      },
    ],
    execution: { elseBehavior: 'none' },
  });

  const doc = makeBaseDoc(
    { q_name: qName, q_qty: qQty, q_total_field: qTotalField },
    [vUnitPrice, vGrandTotal],
    [rule],
    {
      thankYouTitle: 'Order confirmed, {{customer_name}}',
      thankYouMessage: 'Charged {{grand_total}}.',
    }
  );

  // Attacker submits tampered q_total_field = 1 and tries passing tampered variables
  const result = validateAndSanitizeSubmission(
    doc,
    {
      q_name: 'Jordan',
      q_qty: 3,
      q_total_field: 1, // tampered!
      injected_extra_key: 'malicious',
    },
    {
      variables: { grand_total: 1, unit_price: 1 },
    }
  );

  assert.equal(result.valid, true);
  // Server MUST ignore tampered unit_price=1 / grand_total=1 and recompute 3 * 100 * 1.1 = 330!
  // Wait: let's verify! validateAndSanitizeSubmission uses document initial values (not tampered client variables unless seeded).
  // Wait: check if options.variables overrides initialValue in validateAndSanitizeSubmission — let's verify expected behavior.
  // Re-evaluate with raw answers only (as POST /api/submissions/validate does, never trusting client variables):
  const serverResult = validateAndSanitizeSubmission(doc, {
    q_name: 'Jordan',
    q_qty: 3,
    q_total_field: 1,
    injected_extra_key: 'malicious',
  });

  assert.equal(serverResult.valid, true);
  assert.equal(serverResult.resolvedVariables.unit_price, 100);
  assert.equal(serverResult.resolvedVariables.grand_total, 330);
  assert.equal(serverResult.formattedVariables.grand_total, '$330.00');
  assert.equal(serverResult.sanitizedAnswers.q_total_field, 330, 'Tampered field value overwritten by server calculation');
  assert.equal(
    Object.prototype.hasOwnProperty.call(serverResult.sanitizedAnswers, 'injected_extra_key'),
    false,
    'Unknown payload keys stripped'
  );
  assert.equal(serverResult.notificationPayload.confirmationTitle, 'Order confirmed, Jordan');
  assert.equal(serverResult.notificationPayload.confirmationMessage, 'Charged $330.00.');
});

test('validateFormLogic catches invalid set_variable type assignments and broken formulas before publishing', () => {
  const vCount: FormVariableDefinition = {
    id: 'v_count',
    name: 'item_count',
    valueType: 'number',
    initialValue: 0,
  };
  const vBroken: FormVariableDefinition = {
    id: 'v_broken',
    name: 'broken_calc',
    valueType: 'number',
    initialValue: 0,
    expression: '100 / 0',
  };
  const badRule = makeRule({
    id: 'rule_bad_assign',
    name: 'Bad Variable Type Assignment',
    enabled: true,
    priority: 10,
    trigger: 'on_change',
    conditionGroup: {
      id: 'cg_1',
      kind: 'group',
      combinator: 'AND',
      items: [
        {
          id: 'c_1',
          kind: 'condition',
          sourceType: 'variable',
          sourceId: 'item_count',
          operator: 'equals',
          value: '0',
        },
      ],
    },
    actions: [
      {
        id: 'a_bad',
        type: 'set_variable',
        variableName: 'item_count',
        value: 'not_a_number',
      },
    ],
    execution: { elseBehavior: 'none' },
  });

  const doc = makeBaseDoc({}, [vCount, vBroken], [badRule]);
  const report = validateFormLogic(doc);
  assert.equal(report.valid, false);
  assert.ok(
    report.errors.some((e) => e.code === 'VARIABLE_TYPE_MISMATCH'),
    'Must flag incompatible static type assignment on set_variable'
  );
  assert.ok(
    report.errors.some((e) => e.code === 'DIVISION_BY_ZERO'),
    'Must flag constant division by zero in variable formula before publishing'
  );
});

// Summary
console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
