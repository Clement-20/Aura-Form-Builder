/**
 * FlexStore Form Studio — Phase 2, Step 4 Automated Test Suite
 *
 * Verifies:
 *  1. Advanced field validation for Text (min/max/exact length, allowed & disallowed regex,
 *     ReDoS protection, email, safe http/https URL, custom error messages)
 *  2. Advanced field validation for Numbers (min, max, range, exact value, whole numbers only,
 *     decimal precision)
 *  3. Advanced field validation for Dates (strict calendar dates, min/max/range, past-only,
 *     future-only with deterministic clock)
 *  4. Advanced field validation for Files (extensions, MIME types & wildcards, max file size,
 *     min/max file count, filename traversal & dangerous executable blocking)
 *  5. Advanced field validation for Selections (min/max/exact selections, allowlist anti-tampering)
 *  6. Cross-field validation (confirm email match, end date after start date, capacity <= limit,
 *     formula expression rule, conditional guard, hidden/disabled fields never blocking submit)
 *  7. Configurable multi-category scoring (option points, multi-select sum, exact match,
 *     numeric value, range points, weighted questions, formula scoring, independent categories,
 *     category formula overrides, total & category thresholds)
 *  8. Outcome builder & personalised result screens (priority matching, total/category/answer/
 *     variable/nested-group conditions, default fallback, score & answer piping, conditional blocks,
 *     unsafe CTA & image URL stripping)
 *  9. Unified client/server submission validation & security (authoritative recalculation ignoring
 *     client tampering, pre-publish validation catching unsafe regex / broken cross-field / unsafe
 *     outcome URLs, respondent sanitization stripping private scoring config)
 * 10. FormDocument <-> Legacy FormSchema migration round-trip preserving all Phase 2 Step 4 configs
 *
 * Run with: npx tsx src/studio/__tests__/validation-scoring-outcomes.test.ts
 */

import assert from 'node:assert/strict';
import {
  CrossFieldValidationRule,
  DOCUMENT_SCHEMA_VERSION,
  FormComponentNode,
  FormDocument,
  FormOutcomeConfig,
  FormScoringConfig,
  LogicConditionGroup,
  StudioLogicRule,
  UploadedFileMeta,
  defaultLogicEngine,
  evaluateFormScoring,
  isSafeMediaUrl,
  isSafeRegexPattern,
  migrateLegacyFormToDocument,
  sanitizeFormDocumentForRespondent,
  serializeDocumentToLegacyForm,
  validateAndSanitizeSubmission,
  validateCrossFieldRules,
  validateFieldValue,
  validateFormLogic,
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
  type: FormComponentNode['type'],
  label: string,
  extra?: {
    pageId?: string;
    content?: Partial<FormComponentNode['content']>;
    validation?: Partial<FormComponentNode['validation']>;
    behaviour?: Partial<FormComponentNode['behaviour']>;
  }
): FormComponentNode {
  return {
    id,
    type,
    pageId: extra?.pageId || 'page_1',
    parentId: null,
    children: [],
    content: {
      label,
      ...(extra?.content || {}),
    },
    layout: { width: 'full', alignment: 'left' },
    appearance: {},
    validation: {
      required: false,
      ...(extra?.validation || {}),
    },
    behaviour: {
      hiddenByDefault: false,
      readOnly: false,
      ...(extra?.behaviour || {}),
    },
  };
}

function makeCondGroup(
  id: string,
  sourceId: string,
  operator: 'equals' | 'not_equals',
  value: string
): LogicConditionGroup {
  return {
    kind: 'group',
    id,
    combinator: 'AND',
    items: [
      {
        kind: 'condition',
        id: `${id}_c1`,
        sourceType: 'component',
        sourceId,
        operator,
        value,
      },
    ],
  };
}

function makeDoc(
  nodes: FormComponentNode[],
  extra?: {
    rules?: StudioLogicRule[];
    crossFieldValidations?: CrossFieldValidationRule[];
    scoring?: FormScoringConfig;
    outcomes?: FormOutcomeConfig;
    variables?: FormDocument['variables'];
  }
): FormDocument {
  const components: Record<string, FormComponentNode> = {};
  const pageIds = new Set<string>();
  for (const n of nodes) {
    components[n.id] = n;
    pageIds.add(n.pageId);
  }
  const orderedPageIds = pageIds.size > 0 ? Array.from(pageIds) : ['page_1'];
  const pages = orderedPageIds.map((pid, idx) => ({
    id: pid,
    index: idx + 1,
    title: `Page ${idx + 1}`,
    componentIds: nodes.filter((n) => n.pageId === pid).map((n) => n.id),
  }));

  const now = '2026-01-15T00:00:00.000Z';
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: 'form_p2s4_test',
    title: 'Phase 2 Step 4 Assessment',
    description: 'Testing validation, scoring and outcomes',
    category: 'survey',
    layoutMode: 'stepped',
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
    pages,
    components,
    variables: extra?.variables || [],
    logic: {
      rules: extra?.rules || [],
      crossFieldValidations: extra?.crossFieldValidations || [],
    },
    scoring: extra?.scoring,
    outcomes: extra?.outcomes,
    integrations: {},
    settings: {
      slug: 'phase-2-step-4-assessment',
      isPublished: true,
      notifyOnSubmission: false,
      allowMultipleSubmissions: true,
      showProgressBar: true,
      isQuizMode: false,
      submitButtonText: 'Submit',
      hiddenFieldPolicy: 'preserve_on_hide_omit_on_submit',
    },
    welcomeScreen: { enabled: false, title: 'Welcome', subtitle: '', buttonText: 'Start' },
    thankYouScreen: { title: 'Thanks', message: 'Submitted', showRestartButton: false },
    metadata: {
      ownerId: 'owner_test',
      createdAt: now,
      updatedAt: now,
      responsesCount: 0,
    },
  };
}

console.log('\nFlexStore Form Studio — Phase 2, Step 4 Tests\n');

// ============================================================================
// 1. Text Validation & ReDoS Security
// ============================================================================
console.log('1. Text Validation & ReDoS Protection');

test('validates minLength, maxLength, exactLength and custom error messages', () => {
  const codeNode = makeNode('q_code', 'text', 'Invite Code', {
    validation: {
      required: true,
      exactLength: 6,
      customErrorMessage: 'Invite code must be exactly 6 characters.',
    },
  });
  assert.equal(validateFieldValue(codeNode, 'ABC').valid, false);
  assert.equal(
    validateFieldValue(codeNode, 'ABC').error,
    'Invite code must be exactly 6 characters.'
  );
  assert.equal(validateFieldValue(codeNode, 'ABC123').valid, true);

  const bioNode = makeNode('q_bio', 'textarea', 'Bio', {
    validation: { minLength: 5, maxLength: 10 },
  });
  assert.equal(validateFieldValue(bioNode, 'Hi').valid, false);
  assert.equal(validateFieldValue(bioNode, 'Hello there!').valid, false);
  assert.equal(validateFieldValue(bioNode, 'Hello!').valid, true);
});

test('validates allowed pattern, disallowed pattern, and blocks ReDoS regexes', () => {
  assert.equal(isSafeRegexPattern('^[A-Z]{2}[0-9]{4}$').safe, true);
  assert.equal(isSafeRegexPattern('(a+)+$').safe, false);
  assert.equal(isSafeRegexPattern('(a|aa)+$').safe, false);
  assert.equal(isSafeRegexPattern('(a)\\1+').safe, false);

  const skuNode = makeNode('q_sku', 'text', 'SKU', {
    validation: {
      pattern: '^[A-Z]{2}-[0-9]{3}$',
      disallowedPattern: '^XX-',
    },
  });
  assert.equal(validateFieldValue(skuNode, 'AB-123').valid, true);
  assert.equal(validateFieldValue(skuNode, 'ab-123').valid, false);
  assert.equal(validateFieldValue(skuNode, 'XX-123').valid, false);
});

test('validates email and safe http/https URLs (rejecting javascript: and data:)', () => {
  const emailNode = makeNode('q_email', 'email', 'Email', { validation: { required: true } });
  assert.equal(validateFieldValue(emailNode, 'user@example.com').valid, true);
  assert.equal(validateFieldValue(emailNode, 'not-an-email').valid, false);

  const urlNode = makeNode('q_url', 'url', 'Website', { validation: { required: true } });
  assert.equal(validateFieldValue(urlNode, 'https://flexstore.app/docs').valid, true);
  assert.equal(validateFieldValue(urlNode, 'javascript:alert(1)').valid, false);
  assert.equal(validateFieldValue(urlNode, 'data:text/html,<script>1</script>').valid, false);

  const optUrlText = makeNode('q_text_url', 'text', 'Portfolio', {
    validation: { validateUrl: true },
  });
  assert.equal(validateFieldValue(optUrlText, '').valid, true);
  assert.equal(validateFieldValue(optUrlText, 'ftp://evil.example').valid, false);
  assert.equal(validateFieldValue(optUrlText, 'https://example.org').valid, true);
});

// ============================================================================
// 2. Number Validation
// ============================================================================
console.log('\n2. Number Validation');

test('validates min, max, exactValue, wholeNumberOnly, and maxDecimals', () => {
  const qtyNode = makeNode('q_qty', 'number', 'Seats', {
    validation: { min: 1, max: 50, wholeNumberOnly: true },
  });
  assert.equal(validateFieldValue(qtyNode, 0).valid, false);
  assert.equal(validateFieldValue(qtyNode, 51).valid, false);
  assert.equal(validateFieldValue(qtyNode, 4.5).valid, false);
  assert.equal(validateFieldValue(qtyNode, 12).valid, true);

  const priceNode = makeNode('q_price', 'number', 'Price', {
    validation: { min: 0, maxDecimals: 2 },
  });
  assert.equal(validateFieldValue(priceNode, '19.99').valid, true);
  assert.equal(validateFieldValue(priceNode, '19.999').valid, false);

  const pinNode = makeNode('q_pin', 'number', 'Verification Sum', {
    validation: { exactValue: 42 },
  });
  assert.equal(validateFieldValue(pinNode, 41).valid, false);
  assert.equal(validateFieldValue(pinNode, 42).valid, true);
});

// ============================================================================
// 3. Date Validation
// ============================================================================
console.log('\n3. Date Validation');

test('rejects impossible calendar dates and enforces min/max/past/future bounds', () => {
  const fixedNow = new Date('2026-06-15T12:00:00.000Z');

  const eventDate = makeNode('q_event', 'date', 'Event Date', {
    validation: { minDate: '2026-06-01', maxDate: '2026-06-30' },
  });
  assert.equal(validateFieldValue(eventDate, '2026-02-30', { now: fixedNow }).valid, false);
  assert.equal(validateFieldValue(eventDate, '2026-05-31', { now: fixedNow }).valid, false);
  assert.equal(validateFieldValue(eventDate, '2026-07-01', { now: fixedNow }).valid, false);
  assert.equal(validateFieldValue(eventDate, '2026-06-20', { now: fixedNow }).valid, true);

  const dobNode = makeNode('q_dob', 'date', 'Date of Birth', {
    validation: { pastDatesOnly: true },
  });
  assert.equal(validateFieldValue(dobNode, '2026-06-14', { now: fixedNow }).valid, true);
  assert.equal(validateFieldValue(dobNode, '2026-06-15', { now: fixedNow }).valid, false);
  assert.equal(validateFieldValue(dobNode, '2026-06-20', { now: fixedNow }).valid, false);

  const bookingNode = makeNode('q_book', 'date', 'Booking Date', {
    validation: { futureDatesOnly: true },
  });
  assert.equal(validateFieldValue(bookingNode, '2026-06-16', { now: fixedNow }).valid, true);
  assert.equal(validateFieldValue(bookingNode, '2026-06-15', { now: fixedNow }).valid, false);
});

// ============================================================================
// 4. File Validation & Upload Security
// ============================================================================
console.log('\n4. File Validation & Security');

test('validates file extensions, MIME wildcards, size, count, and blocks unsafe files', () => {
  const fileNode = makeNode('q_docs', 'file_upload', 'Attachments', {
    validation: {
      required: true,
      allowedExtensions: ['.pdf', '.png'],
      allowedMimeTypes: ['application/pdf', 'image/*'],
      maxFileSizeMb: 2,
      minFiles: 1,
      maxFiles: 2,
    },
  });

  const validPdf: UploadedFileMeta = {
    name: 'proposal.pdf',
    size: 512_000,
    type: 'application/pdf',
  };
  const validPng: UploadedFileMeta = {
    name: 'diagram.png',
    size: 800_000,
    type: 'image/png',
  };
  const tooLarge: UploadedFileMeta = {
    name: 'huge.pdf',
    size: 5 * 1024 * 1024,
    type: 'application/pdf',
  };
  const wrongExt: UploadedFileMeta = {
    name: 'notes.txt',
    size: 1000,
    type: 'text/plain',
  };
  const traversalFile: UploadedFileMeta = {
    name: '../../etc/passwd.pdf',
    size: 1000,
    type: 'application/pdf',
  };
  const dangerousExe: UploadedFileMeta = {
    name: 'payload.exe',
    size: 1000,
    type: 'application/octet-stream',
  };

  assert.equal(validateFieldValue(fileNode, [validPdf, validPng]).valid, true);
  assert.equal(validateFieldValue(fileNode, [validPdf, validPng, validPdf]).valid, false);
  assert.equal(validateFieldValue(fileNode, [tooLarge]).valid, false);
  assert.equal(validateFieldValue(fileNode, [wrongExt]).valid, false);
  assert.equal(validateFieldValue(fileNode, [traversalFile]).valid, false);
  assert.equal(validateFieldValue(fileNode, [dangerousExe]).valid, false);
});

// ============================================================================
// 5. Selection Validation & Anti-Tampering
// ============================================================================
console.log('\n5. Selection Validation');

test('validates minSelections, maxSelections, exactSelections, and rejects unlisted options', () => {
  const topicsNode = makeNode('q_topics', 'checkbox', 'Topics', {
    content: { options: ['Design', 'Engineering', 'Product', 'Marketing'] },
    validation: { minSelections: 2, maxSelections: 3 },
  });
  assert.equal(validateFieldValue(topicsNode, ['Design']).valid, false);
  assert.equal(validateFieldValue(topicsNode, ['Design', 'Product']).valid, true);
  assert.equal(
    validateFieldValue(topicsNode, ['Design', 'Engineering', 'Product', 'Marketing']).valid,
    false
  );
  // Tampered option not in allowed options list
  assert.equal(validateFieldValue(topicsNode, ['Design', 'InjectedOption']).valid, false);

  const exactNode = makeNode('q_top2', 'checkbox', 'Top 2 Priorities', {
    content: { options: ['Speed', 'Quality', 'Cost'] },
    validation: { exactSelections: 2 },
  });
  assert.equal(validateFieldValue(exactNode, ['Speed']).valid, false);
  assert.equal(validateFieldValue(exactNode, ['Speed', 'Quality']).valid, true);
});

// ============================================================================
// 6. Cross-Field Validation
// ============================================================================
console.log('\n6. Cross-Field Validation');

test('enforces email match, date ordering, capacity limits, formula checks, and conditional guards', () => {
  const email = makeNode('q_email', 'email', 'Email', { validation: { required: true } });
  const confirmEmail = makeNode('q_confirm', 'email', 'Confirm Email', {
    validation: { required: true },
  });
  const startDate = makeNode('q_start', 'date', 'Start Date');
  const endDate = makeNode('q_end', 'date', 'End Date');
  const participants = makeNode('q_people', 'number', 'Participants');
  const capacity = makeNode('q_cap', 'number', 'Venue Capacity');
  const vipToggle = makeNode('q_vip', 'yes_no', 'Requires VIP Table?');
  const vipCount = makeNode('q_vip_count', 'number', 'VIP Seats');

  const crossRules: CrossFieldValidationRule[] = [
    {
      id: 'cf_email',
      name: 'Confirm email matches',
      enabled: true,
      sourceComponentId: 'q_confirm',
      targetComponentId: 'q_confirm',
      operator: 'equals_field',
      compareComponentId: 'q_email',
      errorMessage: 'Confirmation email must match your email address.',
    },
    {
      id: 'cf_dates',
      name: 'End date after start date',
      enabled: true,
      sourceComponentId: 'q_end',
      targetComponentId: 'q_end',
      operator: 'after_date_field',
      compareComponentId: 'q_start',
      errorMessage: 'End date must be after start date.',
    },
    {
      id: 'cf_capacity',
      name: 'Participants within capacity',
      enabled: true,
      sourceComponentId: 'q_people',
      targetComponentId: 'q_people',
      operator: 'less_or_equal_field',
      compareComponentId: 'q_cap',
      errorMessage: 'Participants cannot exceed venue capacity.',
    },
    {
      id: 'cf_vip_formula',
      name: 'VIP seats at most half of participants when VIP requested',
      enabled: true,
      sourceComponentId: 'q_vip_count',
      targetComponentId: 'q_vip_count',
      operator: 'matches_expression',
      expression: '{{q_vip_count}} <= {{q_people}} / 2',
      errorMessage: 'VIP seats cannot exceed 50% of participants.',
      whenConditionGroup: makeCondGroup('cg_vip', 'q_vip', 'equals', 'Yes'),
    },
  ];

  const doc = makeDoc(
    [email, confirmEmail, startDate, endDate, participants, capacity, vipToggle, vipCount],
    { crossFieldValidations: crossRules }
  );

  // Failing submission across all 4 rules
  const failRes = validateAndSanitizeSubmission(doc, {
    q_email: 'alice@example.com',
    q_confirm: 'bob@example.com',
    q_start: '2026-08-10',
    q_end: '2026-08-05',
    q_people: 100,
    q_cap: 50,
    q_vip: 'Yes',
    q_vip_count: 80,
  });
  assert.equal(failRes.valid, false);
  assert.ok(failRes.crossFieldErrors.q_confirm);
  assert.ok(failRes.crossFieldErrors.q_end);
  assert.ok(failRes.crossFieldErrors.q_people);
  assert.ok(failRes.crossFieldErrors.q_vip_count);

  // Guard disables cf_vip_formula when q_vip === 'No'
  const passRes = validateAndSanitizeSubmission(doc, {
    q_email: 'alice@example.com',
    q_confirm: 'alice@example.com',
    q_start: '2026-08-10',
    q_end: '2026-08-12',
    q_people: 40,
    q_cap: 50,
    q_vip: 'No',
    q_vip_count: 999,
  });
  assert.equal(passRes.valid, true);
  assert.deepEqual(passRes.crossFieldErrors, {});
});

test('hidden fields never trigger field or cross-field errors', () => {
  const toggle = makeNode('q_toggle', 'yes_no', 'Add Secondary Contact?');
  const email = makeNode('q_email', 'email', 'Primary Email', { validation: { required: true } });
  const secondEmail = makeNode('q_second', 'email', 'Confirm Primary Email', {
    validation: { required: true },
  });

  const hideRule: StudioLogicRule = {
    schemaVersion: 2,
    id: 'r_hide',
    name: 'Hide confirm when No',
    enabled: true,
    priority: 0,
    trigger: 'on_change',
    conditionGroup: makeCondGroup('g1', 'q_toggle', 'equals', 'No'),
    actions: [{ id: 'a1', type: 'hide_component', targetComponentId: 'q_second' }],
    execution: { stopOnMatch: false, elseBehavior: 'none' },
    sourceFieldId: 'q_toggle',
    condition: 'equals',
    value: 'No',
    action: 'hide',
    targetFieldId: 'q_second',
  };

  const doc = makeDoc([toggle, email, secondEmail], {
    rules: [hideRule],
    crossFieldValidations: [
      {
        id: 'cf1',
        name: 'Must match',
        enabled: true,
        sourceComponentId: 'q_second',
        targetComponentId: 'q_second',
        operator: 'equals_field',
        compareComponentId: 'q_email',
        errorMessage: 'Must match',
      },
    ],
  });

  const res = validateAndSanitizeSubmission(doc, {
    q_toggle: 'No',
    q_email: 'a@b.com',
    q_second: 'mismatched',
  });
  assert.equal(res.valid, true);
  assert.equal(res.sanitizedAnswers.q_second, undefined);
});

// ============================================================================
// 7. Configurable Multi-Category Scoring
// ============================================================================
console.log('\n7. Multi-Category Scoring Engine');

test('computes weighted option, multi-select, exact match, numeric, range & formula scores across categories', () => {
  const qRole = makeNode('q_role', 'radio', 'Experience Level', {
    content: { options: ['Junior', 'Mid', 'Senior'] },
  });
  const qSkills = makeNode('q_skills', 'checkbox', 'Skills', {
    content: { options: ['TypeScript', 'Security', 'Architecture'] },
  });
  const qKeyword = makeNode('q_kw', 'text', 'Protocol Name');
  const qYears = makeNode('q_years', 'number', 'Years Experience');
  const qRating = makeNode('q_rating', 'rating', 'Confidence');

  const scoring: FormScoringConfig = {
    enabled: true,
    hidePrivateConfigFromRespondents: true,
    categories: [
      {
        id: 'cat_tech',
        name: 'Technical',
        color: '#0F766E',
        thresholds: [
          { id: 't1', label: 'Foundational', minScore: 0, maxScore: 25 },
          { id: 't2', label: 'Advanced', minScore: 26 },
        ],
      },
      {
        id: 'cat_lead',
        name: 'Leadership',
        color: '#2563EB',
        thresholds: [
          { id: 'l1', label: 'Emerging', minScore: 0, maxScore: 14 },
          { id: 'l2', label: 'Strong', minScore: 15 },
        ],
      },
    ],
    rules: [
      {
        id: 'sr_role',
        componentId: 'q_role',
        enabled: true,
        mode: 'option_points',
        categoryId: 'cat_lead',
        weight: 2,
        optionPoints: { Junior: 2, Mid: 5, Senior: 10 },
      },
      {
        id: 'sr_skills',
        componentId: 'q_skills',
        enabled: true,
        mode: 'option_points',
        categoryId: 'cat_tech',
        weight: 1,
        optionPoints: { TypeScript: 10, Security: 10, Architecture: 10 },
      },
      {
        id: 'sr_kw',
        componentId: 'q_kw',
        enabled: true,
        mode: 'exact_match',
        categoryId: 'cat_tech',
        weight: 1,
        correctAnswer: 'HTTPS',
        points: 10,
      },
      {
        id: 'sr_years',
        componentId: 'q_years',
        enabled: true,
        mode: 'range_points',
        categoryId: 'cat_lead',
        weight: 1,
        rangePoints: [
          { id: 'rg1', min: 0, max: 2, points: 2 },
          { id: 'rg2', min: 3, max: 6, points: 5 },
          { id: 'rg3', min: 7, points: 10 },
        ],
      },
      {
        id: 'sr_rating',
        componentId: 'q_rating',
        enabled: true,
        mode: 'numeric_value',
        categoryId: 'cat_tech',
        weight: 2,
        maxPointsOverride: 5,
      },
    ],
    totalThresholds: [
      { id: 'tt_low', label: 'Starter', minScore: 0, maxScore: 39 },
      { id: 'tt_mid', label: 'Proficient', minScore: 40, maxScore: 69 },
      { id: 'tt_high', label: 'Expert', minScore: 70 },
    ],
  };

  const doc = makeDoc([qRole, qSkills, qKeyword, qYears, qRating], { scoring });
  const visible = new Set(Object.keys(doc.components));
  const res = evaluateFormScoring(
    doc,
    {
      q_role: 'Senior', // 10 * weight 2 = 20 (max 20) [Leadership]
      q_skills: ['TypeScript', 'Security'], // 20 (max 30) [Technical]
      q_kw: 'https', // case-insensitive exact match -> 10 (max 10) [Technical]
      q_years: 8, // range 7+ -> 10 (max 10) [Leadership]
      q_rating: 4, // 4 * weight 2 = 8 (max 5*2=10) [Technical]
    },
    {},
    visible
  );

  assert.equal(res.enabled, true);
  assert.equal(res.totalScore, 68);
  assert.equal(res.maxScore, 80);
  assert.equal(res.percent, 85);
  assert.equal(res.totalThreshold?.label, 'Proficient');

  const tech = res.categories.find((c) => c.categoryId === 'cat_tech');
  const lead = res.categories.find((c) => c.categoryId === 'cat_lead');
  assert.equal(tech?.score, 38);
  assert.equal(tech?.maxScore, 50);
  assert.equal(tech?.threshold?.label, 'Advanced');
  assert.equal(lead?.score, 30);
  assert.equal(lead?.maxScore, 30);
  assert.equal(lead?.percent, 100);
  assert.equal(lead?.threshold?.label, 'Strong');
});

test('supports formula-based question scoring and category formula overrides without eval', () => {
  const qA = makeNode('q_a', 'number', 'Metric A');
  const qB = makeNode('q_b', 'number', 'Metric B');
  const doc = makeDoc([qA, qB], {
    scoring: {
      enabled: true,
      categories: [
        {
          id: 'cat_idx',
          name: 'Composite Index',
          formulaExpression: 'round(({{q_a}} * 2 + {{q_b}}) / 3, 1)',
          thresholds: [],
        },
      ],
      rules: [
        {
          id: 'sr_f',
          componentId: 'q_a',
          enabled: true,
          weight: 1,
          mode: 'formula',
          formulaExpression: 'min(100, {{q_a}} * 10)',
          maxPointsOverride: 100,
        },
      ],
      totalThresholds: [],
    },
  });

  const visible = new Set(Object.keys(doc.components));
  const res = evaluateFormScoring(doc, { q_a: 6, q_b: 9 }, {}, visible);
  assert.equal(res.questionBreakdowns[0]?.weightedPoints, 60);
  const idx = res.categories.find((c) => c.categoryId === 'cat_idx');
  assert.equal(idx?.score, 7);
  assert.equal(res.totalScore, 67);
});

// ============================================================================
// 8. Outcome Builder & Personalised Result Screens
// ============================================================================
console.log('\n8. Outcome Builder & Personalised Result Screens');

test('resolves prioritised outcomes, pipes score/answer tokens, evaluates conditional blocks, and sanitizes URLs', () => {
  const qName = makeNode('q_name', 'text', 'Full Name');
  const qScore = makeNode('q_score', 'number', 'Score Input');
  const qTrack = makeNode('q_track', 'radio', 'Preferred Track', {
    content: { options: ['Enterprise', 'Startup'] },
  });

  const scoring: FormScoringConfig = {
    enabled: true,
    categories: [{ id: 'cat_fit', name: 'Readiness', thresholds: [] }],
    rules: [
      {
        id: 'sr1',
        componentId: 'q_score',
        enabled: true,
        weight: 1,
        mode: 'numeric_value',
        categoryId: 'cat_fit',
        maxPointsOverride: 100,
      },
    ],
    totalThresholds: [
      { id: 'b1', label: 'Ready', minScore: 80 },
      { id: 'b2', label: 'Developing', minScore: 0, maxScore: 79 },
    ],
  };

  const outcomes: FormOutcomeConfig = {
    enabled: true,
    defaultOutcomeId: 'out_default',
    outcomes: [
      {
        id: 'out_enterprise_high',
        name: 'Enterprise Fast-Track',
        enabled: true,
        priority: 0,
        matchMode: 'all',
        conditions: [
          {
            id: 'oc1',
            source: 'total_score',
            operator: 'greater_than_or_equal',
            value: '80',
          },
          {
            id: 'oc2',
            source: 'component',
            sourceId: 'q_track',
            operator: 'equals',
            value: 'Enterprise',
          },
        ],
        resultScreen: {
          heading: 'Welcome {{q_name}}, you qualified for {{outcome_name}}!',
          description:
            'Total score: {{total_score}}/{{max_score}} ({{score_percent}}%, Band: {{score_band}}).',
          imageUrl: 'javascript:alert(1)', // Must be stripped!
          showScoreCard: true,
          showCategoryBreakdown: true,
          nextSteps: ['Book your architecture briefing', 'Invite your team'],
          buttons: [
            {
              id: 'b_safe',
              label: 'Book Demo',
              url: 'https://flexstore.app/demo',
              style: 'primary',
            },
            {
              id: 'b_evil',
              label: 'Evil Link',
              url: 'javascript:void(0)',
              style: 'secondary',
            },
          ],
          conditionalBlocks: [
            {
              id: 'cb1',
              heading: 'Enterprise SLA Bonus',
              body: 'Dedicated onboarding unlocked for {{q_name}}.',
              conditionGroup: makeCondGroup('cbg1', 'q_track', 'equals', 'Enterprise'),
            },
            {
              id: 'cb2',
              heading: 'Startup Grant',
              body: 'Should NOT appear for Enterprise.',
              conditionGroup: makeCondGroup('cbg2', 'q_track', 'equals', 'Startup'),
            },
          ],
        },
      },
      {
        id: 'out_default',
        name: 'Standard Guidance',
        enabled: true,
        priority: 1,
        matchMode: 'all',
        conditions: [],
        resultScreen: {
          heading: 'Thanks {{q_name}}',
          description: 'Your score was {{total_score}}.',
          showScoreCard: true,
          showCategoryBreakdown: false,
          nextSteps: [],
          buttons: [],
        },
      },
    ],
  };

  const doc = makeDoc([qName, qScore, qTrack], { scoring, outcomes });

  // Match priority-0 Enterprise Fast-Track
  const highRes = validateAndSanitizeSubmission(doc, {
    q_name: 'Jordan',
    q_score: 92,
    q_track: 'Enterprise',
  });
  assert.equal(highRes.valid, true);
  assert.equal(highRes.outcomeId, 'out_enterprise_high');
  assert.equal(highRes.selectedOutcome?.isDefaultFallback, false);
  assert.equal(
    highRes.selectedOutcome?.heading,
    'Welcome Jordan, you qualified for Enterprise Fast-Track!'
  );
  assert.equal(
    highRes.selectedOutcome?.description,
    'Total score: 92/100 (92%, Band: Ready).'
  );
  // Unsafe image and CTA URLs must be stripped
  assert.equal(highRes.selectedOutcome?.imageUrl, undefined);
  assert.equal(highRes.selectedOutcome?.buttons.length, 1);
  assert.equal(highRes.selectedOutcome?.buttons[0].label, 'Book Demo');
  // Conditional block filtering
  assert.equal(highRes.selectedOutcome?.conditionalBlocks.length, 1);
  assert.equal(highRes.selectedOutcome?.conditionalBlocks[0].heading, 'Enterprise SLA Bonus');
  assert.equal(
    highRes.selectedOutcome?.conditionalBlocks[0].body,
    'Dedicated onboarding unlocked for Jordan.'
  );

  // Fallback resolution when conditions don't match
  const lowRes = validateAndSanitizeSubmission(doc, {
    q_name: 'Sam',
    q_score: 40,
    q_track: 'Startup',
  });
  assert.equal(lowRes.outcomeId, 'out_default');
  assert.equal(lowRes.selectedOutcome?.isDefaultFallback, true);
  assert.equal(lowRes.selectedOutcome?.heading, 'Thanks Sam');
  assert.equal(lowRes.selectedOutcome?.description, 'Your score was 40.');
});

// ============================================================================
// 9. Pre-Publish Validation, Privacy Sanitization & Security
// ============================================================================
console.log('\n9. Security, Privacy & Pre-Publish Diagnostics');

test('validateFormLogic flags unsafe regex, broken cross-field rules, and unsafe outcome URLs', () => {
  const q1 = makeNode('q1', 'text', 'Code', {
    validation: { pattern: '(a+)+$' },
  });
  const doc = makeDoc([q1], {
    crossFieldValidations: [
      {
        id: 'cf_bad',
        name: 'Broken Ref',
        enabled: true,
        sourceComponentId: 'q1',
        targetComponentId: 'q1',
        operator: 'equals_field',
        compareComponentId: 'deleted_field',
        errorMessage: 'Mismatch',
      },
    ],
    outcomes: {
      enabled: true,
      outcomes: [
        {
          id: 'o1',
          name: 'Unsafe Outcome',
          enabled: true,
          priority: 0,
          matchMode: 'all',
          conditions: [],
          resultScreen: {
            heading: 'Result',
            description: 'Desc',
            imageUrl: 'javascript:alert(1)',
            showScoreCard: false,
            showCategoryBreakdown: false,
            nextSteps: [],
            buttons: [
              { id: 'b1', label: 'Click', url: 'javascript:alert(2)', style: 'primary' },
            ],
          },
        },
      ],
    },
  });

  const report = validateFormLogic(doc);
  assert.equal(report.valid, false);
  const codes = new Set(report.errors.map((e) => e.code));
  assert.ok(codes.has('INVALID_REGEX_PATTERN'));
  assert.ok(codes.has('INVALID_CROSS_FIELD_RULE'));
  assert.ok(codes.has('INVALID_OUTCOME_URL'));
  assert.equal(isSafeMediaUrl('https://cdn.example.com/hero.png'), true);
  assert.equal(isSafeMediaUrl('javascript:alert(1)'), false);
});

test('sanitizeFormDocumentForRespondent strips private scoring weights, answer keys & outcome rules', () => {
  const q1 = makeNode('q1', 'radio', 'Answer', {
    content: { options: ['A', 'B'] },
    behaviour: { correctAnswer: 'A', points: 10 },
  });
  const doc = makeDoc([q1], {
    scoring: {
      enabled: true,
      hidePrivateConfigFromRespondents: true,
      categories: [{ id: 'c1', name: 'General', thresholds: [] }],
      rules: [
        {
          id: 'sr1',
          componentId: 'q1',
          enabled: true,
          weight: 1,
          mode: 'option_points',
          optionPoints: { A: 10, B: 0 },
        },
      ],
      totalThresholds: [{ id: 't1', label: 'Pass', minScore: 5 }],
    },
    outcomes: {
      enabled: true,
      outcomes: [
        {
          id: 'o1',
          name: 'Passed',
          enabled: true,
          priority: 0,
          matchMode: 'all',
          conditions: [
            { id: 'oc1', source: 'total_score', operator: 'greater_than_or_equal', value: '5' },
          ],
          resultScreen: {
            heading: 'Great job',
            description: 'Passed',
            showScoreCard: true,
            showCategoryBreakdown: false,
            nextSteps: [],
            buttons: [],
          },
        },
      ],
    },
  });

  const sanitized = sanitizeFormDocumentForRespondent(doc);
  assert.equal(sanitized.scoring?.rules.length, 0);
  assert.equal(sanitized.outcomes?.outcomes.length, 0);
  assert.equal(sanitized.components.q1.behaviour.correctAnswer, undefined);
  // Original creator document remains untouched
  assert.equal(doc.scoring?.rules.length, 1);
  assert.equal(doc.outcomes?.outcomes.length, 1);
});

// ============================================================================
// 10. Persistence Migration Round-Trip
// ============================================================================
console.log('\n10. Persistence & Migration Round-Trip');

test('preserves expanded field validation, cross-field rules, scoring, and outcomes across legacy serialization', () => {
  const qEmail = makeNode('q_email', 'email', 'Email', {
    validation: { required: true, maxLength: 120, customErrorMessage: 'Valid work email required.' },
  });
  const qConfirm = makeNode('q_confirm', 'email', 'Confirm Email', {
    validation: { required: true },
  });
  const qFile = makeNode('q_file', 'file_upload', 'Resume', {
    validation: {
      allowedExtensions: ['.pdf', '.docx'],
      allowedMimeTypes: ['application/pdf'],
      maxFileSizeMb: 5,
      minFiles: 1,
      maxFiles: 2,
    },
  });

  const original = makeDoc([qEmail, qConfirm, qFile], {
    crossFieldValidations: [
      {
        id: 'cf_roundtrip',
        name: 'Emails match',
        enabled: true,
        sourceComponentId: 'q_confirm',
        targetComponentId: 'q_confirm',
        operator: 'equals_field',
        compareComponentId: 'q_email',
        errorMessage: 'Emails must match',
      },
    ],
    scoring: {
      enabled: true,
      hidePrivateConfigFromRespondents: true,
      categories: [{ id: 'cat_1', name: 'Readiness', color: '#0F766E', thresholds: [] }],
      rules: [
        {
          id: 'sr_1',
          componentId: 'q_email',
          enabled: true,
          weight: 1,
          mode: 'exact_match',
          categoryId: 'cat_1',
          correctAnswer: 'ceo@acme.com',
          points: 25,
        },
      ],
      totalThresholds: [{ id: 'th_1', label: 'VIP', minScore: 20 }],
    },
    outcomes: {
      enabled: true,
      defaultOutcomeId: 'out_1',
      outcomes: [
        {
          id: 'out_1',
          name: 'VIP Track',
          enabled: true,
          priority: 0,
          matchMode: 'all',
          conditions: [
            { id: 'oc_1', source: 'total_score', operator: 'greater_than_or_equal', value: '20' },
          ],
          resultScreen: {
            heading: 'Welcome VIP',
            description: 'Score {{total_score}}',
            showScoreCard: true,
            showCategoryBreakdown: true,
            nextSteps: ['Schedule call'],
            buttons: [
              { id: 'btn_1', label: 'Continue', url: 'https://flexstore.app', style: 'primary' },
            ],
          },
        },
      ],
    },
  });

  const legacy = serializeDocumentToLegacyForm(original);
  const restored = migrateLegacyFormToDocument(legacy);

  assert.equal(restored.components.q_email.validation.maxLength, 120);
  assert.deepEqual(restored.components.q_file.validation.allowedExtensions, ['.pdf', '.docx']);
  assert.equal(restored.components.q_file.validation.maxFileSizeMb, 5);
  assert.equal(restored.components.q_file.validation.maxFiles, 2);
  assert.equal(restored.logic.crossFieldValidations?.length, 1);
  assert.equal(restored.logic.crossFieldValidations?.[0].id, 'cf_roundtrip');
  assert.equal(restored.scoring?.enabled, true);
  assert.equal(restored.scoring?.categories.length, 1);
  assert.equal(restored.scoring?.rules.length, 1);
  assert.equal(restored.outcomes?.enabled, true);
  assert.equal(restored.outcomes?.defaultOutcomeId, 'out_1');
  assert.equal(
    restored.outcomes?.outcomes[0].resultScreen.buttons?.[0]?.url,
    'https://flexstore.app'
  );

  // Verify standalone validateCrossFieldRules & defaultLogicEngine work on restored doc
  const sampleAns = { q_email: 'a@b.com', q_confirm: 'c@d.com' };
  const evalRes = defaultLogicEngine.evaluate(restored, { answers: sampleAns });
  const cfErrs = validateCrossFieldRules(
    restored,
    sampleAns,
    {
      visibleComponentIds: evalRes.visibleComponentIds,
      disabledComponentIds: evalRes.disabledComponentIds,
    },
    {
      document: restored,
      answers: sampleAns,
      variables: evalRes.resolvedVariables,
      formattedVariables: evalRes.formattedVariables,
    }
  );
  assert.equal(cfErrs.q_confirm, 'Emails must match');
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
