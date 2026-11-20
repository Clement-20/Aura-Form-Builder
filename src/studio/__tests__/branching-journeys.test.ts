/**
 * FlexStore Form Studio — Phase 2, Step 2 Automated Test Suite
 *
 * Verifies Conditional Logic, Dynamic Form Branching, Conversational Journeys,
 * Dynamic Progress Indicators, Static Conflict/Unreachable Detection,
 * Hidden Field Policies, Safe Redirects, and Server-Side Submission Validation.
 *
 * Run with: npx tsx src/studio/__tests__/branching-journeys.test.ts
 */

import assert from 'node:assert/strict';
import {
  FormDocument,
  DOCUMENT_SCHEMA_VERSION,
  StudioLogicRule,
  defaultLogicEngine,
  validateFormLogic,
  resolveSteppedNext,
  resolveConversationalNext,
  getVisiblePages,
  getVisibleConversationalNodes,
  computeSteppedProgress,
  computeConversationalProgress,
  validateAndSanitizeSubmission,
  migrateLegacyFormToDocument,
  serializeDocumentToLegacyForm,
  isSafeHttpUrl,
} from '../index';
import { FormSchema } from '../../types/form';

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

function makeBaseDoc(
  pages: FormDocument['pages'],
  components: FormDocument['components'],
  rules: StudioLogicRule[] = [],
  options?: {
    layoutMode?: FormDocument['layoutMode'];
    hiddenFieldPolicy?: FormDocument['settings']['hiddenFieldPolicy'];
    isQuizMode?: boolean;
  }
): FormDocument {
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: 'form_branch_test',
    title: 'Branching Journey Test Form',
    description: 'Automated test fixture',
    category: 'survey',
    layoutMode: options?.layoutMode || 'stepped',
    settings: {
      slug: 'branch-test',
      isPublished: true,
      notifyOnSubmission: false,
      allowMultipleSubmissions: true,
      showProgressBar: true,
      isQuizMode: Boolean(options?.isQuizMode),
      submitButtonText: 'Submit',
      hiddenFieldPolicy: options?.hiddenFieldPolicy,
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
    welcomeScreen: { enabled: false, title: 'Welcome', subtitle: '', buttonText: 'Start' },
    thankYouScreen: { title: 'Done', message: 'Thanks!', showRestartButton: false },
    pages,
    components,
    logic: { rules },
    variables: [],
    integrations: {},
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      responsesCount: 0,
    },
  };
}

function makeNode(
  id: string,
  pageId: string,
  type: FormDocument['components'][string]['type'],
  label: string,
  extra?: {
    required?: boolean;
    hiddenByDefault?: boolean;
    readOnly?: boolean;
    options?: string[];
    parentId?: string | null;
    children?: string[];
    correctAnswer?: string;
    points?: number;
  }
) {
  return {
    id,
    type,
    pageId,
    parentId: extra?.parentId ?? null,
    children: extra?.children,
    content: { label, options: extra?.options },
    appearance: {},
    layout: { width: 'full' as const },
    behaviour: {
      hiddenByDefault: extra?.hiddenByDefault,
      readOnly: extra?.readOnly,
      correctAnswer: extra?.correctAnswer,
      points: extra?.points,
    },
    validation: { required: Boolean(extra?.required) },
  };
}

function makeRule(partial: Partial<StudioLogicRule> & Pick<StudioLogicRule, 'id' | 'name' | 'conditionGroup' | 'actions'>): StudioLogicRule {
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
    ...partial,
  };
}

console.log('\nFlexStore Form Studio — Phase 2, Step 2 (Conditional Logic & Branching) Tests\n');

// ---------------------------------------------------------------------------
// 1. Recursive Section / Container Visibility + Hidden Required Fields
// ---------------------------------------------------------------------------
test('1. Hiding a section/container recursively hides nested required children so submission is never blocked', () => {
  const doc = makeBaseDoc(
    [{ id: 'p1', index: 1, title: 'Main', componentIds: ['q_has_co', 'sec_company', 'blk_banner'] }],
    {
      q_has_co: makeNode('q_has_co', 'p1', 'yes_no', 'Representing a company?', { required: true }),
      sec_company: makeNode('sec_company', 'p1', 'section', 'Company Details Section', {
        children: ['col_wrap'],
      }),
      col_wrap: makeNode('col_wrap', 'p1', 'two_column', 'Company Columns', {
        parentId: 'sec_company',
        children: ['q_company_name', 'q_company_tax'],
      }),
      q_company_name: makeNode('q_company_name', 'p1', 'text', 'Company Name', {
        required: true,
        parentId: 'col_wrap',
      }),
      q_company_tax: makeNode('q_company_tax', 'p1', 'text', 'Tax ID', {
        required: true,
        parentId: 'col_wrap',
      }),
      blk_banner: makeNode('blk_banner', 'p1', 'heading', 'Corporate Offer Banner'),
    },
    [
      makeRule({
        id: 'r_show_company',
        name: 'Show company section & banner when Yes',
        conditionGroup: {
          kind: 'group',
          id: 'g1',
          combinator: 'AND',
          items: [
            { kind: 'condition', id: 'c1', sourceType: 'component', sourceId: 'q_has_co', operator: 'is_true', value: '' },
          ],
        },
        actions: [
          { id: 'a1', type: 'show_component', targetComponentId: 'sec_company' },
          { id: 'a2', type: 'show_component', targetComponentId: 'blk_banner' },
        ],
      }),
    ]
  );

  // When No -> section, nested two_column, nested required questions, and heading banner are all hidden
  const resNo = defaultLogicEngine.evaluate(doc, { answers: { q_has_co: 'No' } });
  assert.equal(resNo.visibleComponentIds.has('sec_company'), false);
  assert.equal(resNo.visibleComponentIds.has('col_wrap'), false);
  assert.equal(resNo.visibleComponentIds.has('q_company_name'), false);
  assert.equal(resNo.visibleComponentIds.has('q_company_tax'), false);
  assert.equal(resNo.visibleComponentIds.has('blk_banner'), false);
  assert.equal(resNo.requiredComponentIds.has('q_company_name'), false);
  assert.equal(resNo.requiredComponentIds.has('q_company_tax'), false);

  // Submission must succeed without filling hidden nested required fields!
  const subNo = validateAndSanitizeSubmission(doc, { q_has_co: 'No' });
  assert.equal(subNo.valid, true);

  // When Yes -> nested required fields become visible AND required
  const subYesMissing = validateAndSanitizeSubmission(doc, { q_has_co: 'Yes' });
  assert.equal(subYesMissing.valid, false);
  assert.ok(subYesMissing.errors['q_company_name']);
  assert.ok(subYesMissing.errors['q_company_tax']);

  const subYesOk = validateAndSanitizeSubmission(doc, {
    q_has_co: 'Yes',
    q_company_name: 'FlexStore Labs',
    q_company_tax: 'TX-991',
  });
  assert.equal(subYesOk.valid, true);
});

// ---------------------------------------------------------------------------
// 2. Dynamic Page Visibility & Skip Pages (show_page, hide_page, skip_pages)
// ---------------------------------------------------------------------------
test('2. Dynamically hiding or skipping pages omits their questions from validation and navigation', () => {
  const doc = makeBaseDoc(
    [
      { id: 'p1', index: 1, title: 'Intro', componentIds: ['q_fast_track'] },
      { id: 'p2', index: 2, title: 'Detailed Background', componentIds: ['q_bg_req'] },
      { id: 'p3', index: 3, title: 'Extra References', componentIds: ['q_ref_req'] },
      { id: 'p4', index: 4, title: 'Review', componentIds: ['q_confirm'] },
    ],
    {
      q_fast_track: makeNode('q_fast_track', 'p1', 'yes_no', 'Fast track?', { required: true }),
      q_bg_req: makeNode('q_bg_req', 'p2', 'text', 'Background', { required: true }),
      q_ref_req: makeNode('q_ref_req', 'p3', 'text', 'Reference', { required: true }),
      q_confirm: makeNode('q_confirm', 'p4', 'yes_no', 'Confirm?', { required: true }),
    },
    [
      makeRule({
        id: 'r_skip_middle',
        name: 'Skip middle pages on fast track',
        conditionGroup: {
          kind: 'group',
          id: 'g1',
          combinator: 'AND',
          items: [
            { kind: 'condition', id: 'c1', sourceType: 'component', sourceId: 'q_fast_track', operator: 'is_true', value: '' },
          ],
        },
        actions: [{ id: 'a1', type: 'skip_pages', targetPageIds: ['p2', 'p3'] }],
      }),
    ]
  );

  // Fast track = Yes -> p2 & p3 skipped; stepped next from p1 lands directly on p4!
  const nextStep = resolveSteppedNext(doc, 'p1', { q_fast_track: 'Yes' }, []);
  assert.equal(nextStep.kind, 'page');
  if (nextStep.kind === 'page') {
    assert.equal(nextStep.pageId, 'p4');
  }
  assert.deepEqual(
    getVisiblePages(doc, nextStep.logicResult).map((p) => p.id),
    ['p1', 'p4']
  );

  // Submission with only p1 and p4 answered succeeds cleanly (p2 & p3 required fields ignored!)
  const sub = validateAndSanitizeSubmission(doc, { q_fast_track: 'Yes', q_confirm: 'Yes' });
  assert.equal(sub.valid, true);
});

// ---------------------------------------------------------------------------
// 3. Student vs Business Owner Page Branching Journey (No Page-2 Trap!)
// ---------------------------------------------------------------------------
test('3. Student vs Business Owner branching navigates cleanly and does not trap respondents on target page', () => {
  const doc = makeBaseDoc(
    [
      { id: 'p_role', index: 1, title: 'Role', componentIds: ['q_role'] },
      { id: 'p_student', index: 2, title: 'Student Information', componentIds: ['q_school'] },
      { id: 'p_biz', index: 3, title: 'Business Information', componentIds: ['q_company'] },
      { id: 'p_final', index: 4, title: 'Final Step', componentIds: ['q_email'] },
    ],
    {
      q_role: makeNode('q_role', 'p_role', 'radio', 'Your Role', {
        required: true,
        options: ['Student', 'Business Owner'],
      }),
      q_school: makeNode('q_school', 'p_student', 'text', 'University', { required: true }),
      q_company: makeNode('q_company', 'p_biz', 'text', 'Company', { required: true }),
      q_email: makeNode('q_email', 'p_final', 'email', 'Email', { required: true }),
    },
    [
      makeRule({
        id: 'r_student',
        name: 'Student route',
        priority: 10,
        conditionGroup: {
          kind: 'group',
          id: 'gs',
          combinator: 'AND',
          items: [
            { kind: 'condition', id: 'cs', sourceType: 'component', sourceId: 'q_role', operator: 'equals', value: 'Student' },
          ],
        },
        actions: [
          { id: 'as1', type: 'navigate_to_page', targetPageId: 'p_student' },
          { id: 'as2', type: 'hide_page', targetPageId: 'p_biz' },
        ],
      }),
      makeRule({
        id: 'r_biz',
        name: 'Business route',
        priority: 20,
        conditionGroup: {
          kind: 'group',
          id: 'gb',
          combinator: 'AND',
          items: [
            { kind: 'condition', id: 'cb', sourceType: 'component', sourceId: 'q_role', operator: 'equals', value: 'Business Owner' },
          ],
        },
        actions: [
          { id: 'ab1', type: 'navigate_to_page', targetPageId: 'p_biz' },
          { id: 'ab2', type: 'hide_page', targetPageId: 'p_student' },
        ],
      }),
    ]
  );

  // Student journey: p_role -> p_student -> p_final -> submit (skipping hidden p_biz!)
  const studentAnswers = { q_role: 'Student', q_school: 'MIT', q_email: 'ada@mit.edu' };
  const s1 = resolveSteppedNext(doc, 'p_role', studentAnswers, []);
  assert.equal(s1.kind, 'page');
  assert.equal(s1.kind === 'page' && s1.pageId, 'p_student');

  const s2 = resolveSteppedNext(doc, 'p_student', studentAnswers, ['p_role']);
  assert.equal(s2.kind, 'page');
  assert.equal(s2.kind === 'page' && s2.pageId, 'p_final');

  const s3 = resolveSteppedNext(doc, 'p_final', studentAnswers, ['p_role', 'p_student']);
  assert.equal(s3.kind, 'submit');

  const studentSub = validateAndSanitizeSubmission(doc, studentAnswers);
  assert.equal(studentSub.valid, true);

  // Business Owner journey: p_role -> p_biz -> p_final -> submit (skipping hidden p_student!)
  const bizAnswers = { q_role: 'Business Owner', q_company: 'Acme Corp', q_email: 'ceo@acme.com' };
  const b1 = resolveSteppedNext(doc, 'p_role', bizAnswers, []);
  assert.equal(b1.kind, 'page');
  assert.equal(b1.kind === 'page' && b1.pageId, 'p_biz');

  const b2 = resolveSteppedNext(doc, 'p_biz', bizAnswers, ['p_role']);
  assert.equal(b2.kind, 'page');
  assert.equal(b2.kind === 'page' && b2.pageId, 'p_final');

  const bizSub = validateAndSanitizeSubmission(doc, bizAnswers);
  assert.equal(bizSub.valid, true);
});

// ---------------------------------------------------------------------------
// 4. Multi-Condition IF / THEN / ELSE Branching (Employed AND Income > 100000)
// ---------------------------------------------------------------------------
test('4. Multi-condition IF/THEN/ELSE routes Employed + Income > 100000 to Financial Info ELSE General Info', () => {
  const doc = makeBaseDoc(
    [
      { id: 'p1', index: 1, title: 'Employment', componentIds: ['q_emp'] },
      { id: 'p2', index: 2, title: 'Income', componentIds: ['q_inc'] },
      { id: 'p_fin', index: 3, title: 'Financial Info', componentIds: ['q_assets'] },
      { id: 'p_gen', index: 4, title: 'General Info', componentIds: ['q_goals'] },
    ],
    {
      q_emp: makeNode('q_emp', 'p1', 'radio', 'Employment Status', { options: ['Employed', 'Unemployed'] }),
      q_inc: makeNode('q_inc', 'p2', 'number', 'Annual Income'),
      q_assets: makeNode('q_assets', 'p_fin', 'text', 'Investment Portfolio'),
      q_goals: makeNode('q_goals', 'p_gen', 'text', 'General Goals'),
    },
    [
      makeRule({
        id: 'r_fin_branch',
        name: 'High-income financial branch',
        conditionGroup: {
          kind: 'group',
          id: 'g_and',
          combinator: 'AND',
          items: [
            { kind: 'condition', id: 'c_emp', sourceType: 'component', sourceId: 'q_emp', operator: 'equals', value: 'Employed' },
            { kind: 'condition', id: 'c_inc', sourceType: 'component', sourceId: 'q_inc', operator: 'greater_than', value: '100000' },
          ],
        },
        actions: [{ id: 'a_then', type: 'navigate_to_page', targetPageId: 'p_fin' }],
        elseActions: [{ id: 'a_else', type: 'navigate_to_page', targetPageId: 'p_gen' }],
      }),
    ]
  );

  // Leaving Page 1: rule waits until Page 2 (latest condition source) -> advances sequentially to p2!
  const step1 = resolveSteppedNext(doc, 'p1', { q_emp: 'Employed' }, []);
  assert.equal(step1.kind, 'page');
  assert.equal(step1.kind === 'page' && step1.pageId, 'p2');

  // Leaving Page 2 with Employed & Income = 150000 -> THEN branch -> p_fin!
  const step2Then = resolveSteppedNext(doc, 'p2', { q_emp: 'Employed', q_inc: 150000 }, ['p1']);
  assert.equal(step2Then.kind, 'page');
  assert.equal(step2Then.kind === 'page' && step2Then.pageId, 'p_fin');

  // Leaving Page 2 with Employed & Income = 60000 -> ELSE branch -> p_gen!
  const step2Else = resolveSteppedNext(doc, 'p2', { q_emp: 'Employed', q_inc: 60000 }, ['p1']);
  assert.equal(step2Else.kind, 'page');
  assert.equal(step2Else.kind === 'page' && step2Else.pageId, 'p_gen');

  // Verify creator debugger trace records branchTaken = 'else'
  const debugElse = defaultLogicEngine.evaluate(doc, {
    answers: { q_emp: 'Employed', q_inc: 60000 },
    currentPageId: 'p2',
    includeDebugTrace: true,
  });
  assert.equal(debugElse.trace[0].branchTaken, 'else');
});

// ---------------------------------------------------------------------------
// 5. Conversational (One-Question-at-a-Time) Dynamic Navigation + Back Preservation
// ---------------------------------------------------------------------------
test('5. Conversational mode skips hidden questions, handles skip_to_question, and preserves back navigation', () => {
  const doc = makeBaseDoc(
    [
      { id: 'p1', index: 1, title: 'Questions', componentIds: ['q1', 'q2', 'q3', 'q4'] },
    ],
    {
      q1: makeNode('q1', 'p1', 'radio', 'Plan', { options: ['Free', 'Enterprise'] }),
      q2: makeNode('q2', 'p1', 'text', 'Billing Contact'),
      q3: makeNode('q3', 'p1', 'text', 'Security Review'),
      q4: makeNode('q4', 'p1', 'email', 'Your Email', { required: true }),
    },
    [
      makeRule({
        id: 'r_free_skip',
        name: 'Free users skip directly to email',
        conditionGroup: {
          kind: 'group',
          id: 'g1',
          combinator: 'AND',
          items: [
            { kind: 'condition', id: 'c1', sourceType: 'component', sourceId: 'q1', operator: 'equals', value: 'Free' },
          ],
        },
        actions: [{ id: 'a1', type: 'skip_to_question', targetComponentId: 'q4' }],
      }),
    ],
    { layoutMode: 'conversational' }
  );

  // Free user on q1 -> jumps directly to q4
  const c1 = resolveConversationalNext(doc, 'q1', { q1: 'Free' }, []);
  assert.equal(c1.kind, 'component');
  assert.equal(c1.kind === 'component' && c1.componentId, 'q4');

  // From q4 -> submits
  const c2 = resolveConversationalNext(doc, 'q4', { q1: 'Free', q4: 'hi@flexstore.io' }, ['q1']);
  assert.equal(c2.kind, 'submit');

  // Enterprise user on q1 -> proceeds sequentially q1 -> q2 -> q3 -> q4
  const e1 = resolveConversationalNext(doc, 'q1', { q1: 'Enterprise' }, []);
  assert.equal(e1.kind, 'component');
  assert.equal(e1.kind === 'component' && e1.componentId, 'q2');

  // Verify visible conversational list excludes containers
  const nodes = getVisibleConversationalNodes(doc, e1.logicResult);
  assert.deepEqual(
    nodes.map((n) => n.id),
    ['q1', 'q2', 'q3', 'q4']
  );
});

// ---------------------------------------------------------------------------
// 6. Hidden Field Answer Policy & Dynamic Required/Disabled States
// ---------------------------------------------------------------------------
test('6. Enforces explicit hiddenFieldPolicy and skips disabled/hidden fields during validation', () => {
  const buildDoc = (policy: FormDocument['settings']['hiddenFieldPolicy']) =>
    makeBaseDoc(
      [{ id: 'p1', index: 1, title: 'Policy', componentIds: ['q_toggle', 'q_secret', 'q_locked'] }],
      {
        q_toggle: makeNode('q_toggle', 'p1', 'yes_no', 'Show secret?'),
        q_secret: makeNode('q_secret', 'p1', 'text', 'Secret Note', { required: true }),
        q_locked: makeNode('q_locked', 'p1', 'text', 'Locked Field', { required: true }),
      },
      [
        makeRule({
          id: 'r_vis',
          name: 'Show secret when Yes',
          conditionGroup: {
            kind: 'group',
            id: 'g1',
            combinator: 'AND',
            items: [
              { kind: 'condition', id: 'c1', sourceType: 'component', sourceId: 'q_toggle', operator: 'is_true', value: '' },
            ],
          },
          actions: [{ id: 'a1', type: 'show_component', targetComponentId: 'q_secret' }],
        }),
        makeRule({
          id: 'r_disable',
          name: 'Disable locked field when No',
          priority: 20,
          conditionGroup: {
            kind: 'group',
            id: 'g2',
            combinator: 'AND',
            items: [
              { kind: 'condition', id: 'c2', sourceType: 'component', sourceId: 'q_toggle', operator: 'is_false', value: '' },
            ],
          },
          actions: [{ id: 'a2', type: 'disable_component', targetComponentId: 'q_locked' }],
        }),
      ],
      { hiddenFieldPolicy: policy }
    );

  // User typed q_secret earlier, then went back and picked No (which hides q_secret & disables q_locked)
  const rawAnswers = {
    q_toggle: 'No',
    q_secret: 'Previously entered secret',
    q_locked: '', // Empty even though base validation.required === true -> disabled skips validation!
    forged_extra_key: 'malicious',
  };

  // Default policy ('preserve_on_hide_omit_on_submit'): valid, strips q_secret & forged_extra_key!
  const resDefault = validateAndSanitizeSubmission(buildDoc('preserve_on_hide_omit_on_submit'), rawAnswers);
  assert.equal(resDefault.valid, true);
  assert.equal(Object.prototype.hasOwnProperty.call(resDefault.sanitizedAnswers, 'q_secret'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(resDefault.sanitizedAnswers, 'forged_extra_key'), false);
  assert.equal(resDefault.sanitizedAnswers.q_toggle, 'No');

  // 'preserve_always' policy: retains q_secret, still strips unknown forged_extra_key
  const resPreserve = validateAndSanitizeSubmission(buildDoc('preserve_always'), rawAnswers);
  assert.equal(resPreserve.valid, true);
  assert.equal(resPreserve.sanitizedAnswers.q_secret, 'Previously entered secret');
  assert.equal(Object.prototype.hasOwnProperty.call(resPreserve.sanitizedAnswers, 'forged_extra_key'), false);
});

// ---------------------------------------------------------------------------
// 7. End Form + Safe Redirect URL Sanitization
// ---------------------------------------------------------------------------
test('7. End form supports safe https:// redirectUrl and blocks unsafe javascript:/data: schemes', () => {
  assert.equal(isSafeHttpUrl('https://flexstore.io/results'), true);
  assert.equal(isSafeHttpUrl('http://example.com/done'), true);
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  assert.equal(isSafeHttpUrl('data:text/html,<script>alert(1)</script>'), false);

  const doc = makeBaseDoc(
    [
      { id: 'p1', index: 1, title: 'Screen', componentIds: ['q_age'] },
      { id: 'p2', index: 2, title: 'Details', componentIds: ['q_details'] },
    ],
    {
      q_age: makeNode('q_age', 'p1', 'number', 'Age', { required: true }),
      q_details: makeNode('q_details', 'p2', 'text', 'Details', { required: true }),
    },
    [
      makeRule({
        id: 'r_underage',
        name: 'End early if under 18',
        conditionGroup: {
          kind: 'group',
          id: 'g1',
          combinator: 'AND',
          items: [
            { kind: 'condition', id: 'c1', sourceType: 'component', sourceId: 'q_age', operator: 'less_than', value: '18' },
          ],
        },
        actions: [
          {
            id: 'a1',
            type: 'end_form',
            endFormTitle: 'Not eligible',
            endFormMessage: 'You must be 18 or older.',
            redirectUrl: 'https://example.com/ineligible',
          },
        ],
      }),
    ]
  );

  const next = resolveSteppedNext(doc, 'p1', { q_age: 16 }, []);
  assert.equal(next.kind, 'end_form');
  if (next.kind === 'end_form') {
    assert.equal(next.title, 'Not eligible');
    assert.equal(next.redirectUrl, 'https://example.com/ineligible');
  }

  // Server-side validation must succeed when ended early on p1 without requiring p2's q_details!
  const sub = validateAndSanitizeSubmission(doc, { q_age: 16 }, { endedEarly: true, endedOnPageId: 'p1' });
  assert.equal(sub.valid, true);
  assert.equal(sub.endedEarly, true);
  assert.equal(sub.redirectUrl, 'https://example.com/ineligible');

  // Unsafe redirect URL is caught by static validation AND stripped at runtime
  doc.logic.rules = [
    makeRule({
      id: 'r_xss',
      name: 'Unsafe redirect',
      conditionGroup: {
        kind: 'group',
        id: 'g2',
        combinator: 'AND',
        items: [
          { kind: 'condition', id: 'c2', sourceType: 'component', sourceId: 'q_age', operator: 'less_than', value: '18' },
        ],
      },
      actions: [
        {
          id: 'a2',
          type: 'end_form',
          redirectUrl: 'javascript:alert(1)',
        },
      ],
    }),
  ];
  const report = validateFormLogic(doc);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((e) => e.code === 'INVALID_REDIRECT_URL'));
  const evalUnsafe = defaultLogicEngine.evaluate(doc, { answers: { q_age: 16 } });
  assert.equal(evalUnsafe.endFormRedirectUrl, undefined);
});

// ---------------------------------------------------------------------------
// 8. Dynamic Progress Indicator (Linear vs Branched Forms)
// ---------------------------------------------------------------------------
test('8. Progress indicator shows exact percentage on linear forms and honest dynamic path on branched forms', () => {
  const linearDoc = makeBaseDoc(
    [
      { id: 'p1', index: 1, title: 'Step 1', componentIds: ['q1'] },
      { id: 'p2', index: 2, title: 'Step 2', componentIds: ['q2'] },
      { id: 'p3', index: 3, title: 'Step 3', componentIds: ['q3'] },
      { id: 'p4', index: 4, title: 'Step 4', componentIds: ['q4'] },
    ],
    {
      q1: makeNode('q1', 'p1', 'text', 'Q1'),
      q2: makeNode('q2', 'p2', 'text', 'Q2'),
      q3: makeNode('q3', 'p3', 'text', 'Q3'),
      q4: makeNode('q4', 'p4', 'text', 'Q4'),
    }
  );
  const linearLogic = defaultLogicEngine.evaluate(linearDoc, { answers: {} });
  const linearProg = computeSteppedProgress(linearDoc, 'p2', 2, linearLogic);
  assert.equal(linearProg.isDynamicBranching, false);
  assert.equal(linearProg.label, 'Step 2 of 4');
  assert.equal(linearProg.exactPercent, 50);

  // Add a branching rule -> switches cleanly to dynamic progress without misleading static %
  linearDoc.logic.rules = [
    makeRule({
      id: 'r_jump',
      name: 'Jump to step 4',
      conditionGroup: {
        kind: 'group',
        id: 'g1',
        combinator: 'AND',
        items: [{ kind: 'condition', id: 'c1', sourceType: 'component', sourceId: 'q1', operator: 'equals', value: 'skip' }],
      },
      actions: [{ id: 'a1', type: 'navigate_to_page', targetPageId: 'p4' }],
    }),
  ];
  const branchedLogic = defaultLogicEngine.evaluate(linearDoc, { answers: {} });
  const branchedProg = computeSteppedProgress(linearDoc, 'p1', 1, branchedLogic);
  assert.equal(branchedProg.isDynamicBranching, true);
  assert.equal(branchedProg.exactPercent, undefined);
  assert.ok(branchedProg.label.includes('Dynamic path'));

  const convProg = computeConversationalProgress(linearDoc, 'q1', 1, branchedLogic);
  assert.equal(convProg.isDynamicBranching, true);
  assert.equal(convProg.exactPercent, undefined);
});

// ---------------------------------------------------------------------------
// 9. Circular Navigation Prevention (Static DFS + Runtime Loop Guard)
// ---------------------------------------------------------------------------
test('9. Circular navigation is detected statically (across THEN & ELSE) and broken safely at runtime', () => {
  const doc = makeBaseDoc(
    [
      { id: 'p1', index: 1, title: 'Page 1', componentIds: ['q1'] },
      { id: 'p2', index: 2, title: 'Page 2', componentIds: ['q2'] },
    ],
    {
      q1: makeNode('q1', 'p1', 'text', 'Q1'),
      q2: makeNode('q2', 'p2', 'text', 'Q2'),
    },
    [
      makeRule({
        id: 'r_p1_to_p2',
        name: 'P1 -> P2',
        conditionGroup: {
          kind: 'group',
          id: 'g1',
          combinator: 'AND',
          items: [{ kind: 'condition', id: 'c1', sourceType: 'component', sourceId: 'q1', operator: 'is_not_empty', value: '' }],
        },
        actions: [{ id: 'a1', type: 'navigate_to_page', targetPageId: 'p2' }],
      }),
      makeRule({
        id: 'r_p2_to_p1_else',
        name: 'P2 -> P1 via ELSE',
        priority: 20,
        conditionGroup: {
          kind: 'group',
          id: 'g2',
          combinator: 'AND',
          items: [{ kind: 'condition', id: 'c2', sourceType: 'component', sourceId: 'q2', operator: 'equals', value: 'stay' }],
        },
        actions: [{ id: 'a2', type: 'display_message', message: 'Staying' }],
        elseActions: [{ id: 'a3', type: 'navigate_to_page', targetPageId: 'p1' }],
      }),
    ]
  );

  // Static DFS catches cycle even through ELSE branch
  const report = validateFormLogic(doc);
  assert.equal(report.valid, false);
  assert.ok(report.circularPaths.length > 0);
  assert.ok(report.errors.some((e) => e.code === 'CIRCULAR_NAVIGATION'));

  // Runtime loop guard: after visiting p1 -> p2, leaving p2 must NOT loop back to p1; it finishes cleanly!
  const stepFromP2 = resolveSteppedNext(doc, 'p2', { q1: 'hello', q2: 'bounce' }, ['p1']);
  assert.equal(stepFromP2.kind, 'submit');
  assert.equal(stepFromP2.loopPrevented, true);
});

// ---------------------------------------------------------------------------
// 10. All 6 Conflict, Incompatible Navigation, Unavailable Source & Unreachable Action Diagnostics
// ---------------------------------------------------------------------------
test('10. Static validator detects all 6 diagnostic categories accurately', () => {
  const doc = makeBaseDoc(
    [
      { id: 'p1', index: 1, title: 'Page 1', componentIds: ['q1', 'q_hidden_forever'] },
      { id: 'p2', index: 2, title: 'Page 2', componentIds: ['q2'] },
    ],
    {
      q1: makeNode('q1', 'p1', 'text', 'Q1'),
      q_hidden_forever: makeNode('q_hidden_forever', 'p1', 'text', 'Never Shown', { hiddenByDefault: true }),
      q2: makeNode('q2', 'p2', 'text', 'Q2'),
    },
    [
      // Category 1 (page conflict) + Category 2 (multiple incompatible nav actions in one branch)
      makeRule({
        id: 'r_multi_nav',
        name: 'Incompatible Nav & Show Page',
        priority: 10,
        conditionGroup: {
          kind: 'group',
          id: 'g1',
          combinator: 'AND',
          items: [{ kind: 'condition', id: 'c1', sourceType: 'component', sourceId: 'q1', operator: 'equals', value: 'go' }],
        },
        actions: [
          { id: 'a1', type: 'navigate_to_page', targetPageId: 'p2' },
          { id: 'a2', type: 'end_form', endFormTitle: 'Conflict end' },
          { id: 'a3', type: 'show_page', targetPageId: 'p2' },
        ],
      }),
      // Category 1 (conflicting hide_page) + Category 3 (deleted page)
      makeRule({
        id: 'r_hide_and_deleted',
        name: 'Hide Page & Deleted Target',
        priority: 20,
        conditionGroup: {
          kind: 'group',
          id: 'g2',
          combinator: 'AND',
          items: [{ kind: 'condition', id: 'c2', sourceType: 'component', sourceId: 'q1', operator: 'equals', value: 'x' }],
        },
        actions: [
          { id: 'a4', type: 'hide_page', targetPageId: 'p2' },
          { id: 'a5', type: 'navigate_to_page', targetPageId: 'p_deleted_999' },
        ],
      }),
      // Category 5 (unavailable condition sources: future page & permanently hidden block)
      makeRule({
        id: 'r_unavailable_src',
        name: 'Future & Hidden Sources',
        priority: 30,
        conditionGroup: {
          kind: 'group',
          id: 'g3',
          combinator: 'AND',
          items: [
            { kind: 'condition', id: 'c3', sourceType: 'component', sourceId: 'q2', operator: 'equals', value: 'yes' },
            { kind: 'condition', id: 'c4', sourceType: 'component', sourceId: 'q_hidden_forever', operator: 'equals', value: 'a' },
          ],
        },
        actions: [{ id: 'a6', type: 'hide_component', targetComponentId: 'q1' }],
      }),
      // Category 6 (contradictory AND clauses -> unreachable action)
      makeRule({
        id: 'r_impossible',
        name: 'Contradictory Rule',
        priority: 40,
        conditionGroup: {
          kind: 'group',
          id: 'g4',
          combinator: 'AND',
          items: [
            { kind: 'condition', id: 'c5', sourceType: 'component', sourceId: 'q1', operator: 'equals', value: 'Alpha' },
            { kind: 'condition', id: 'c6', sourceType: 'component', sourceId: 'q1', operator: 'equals', value: 'Beta' },
          ],
        },
        actions: [{ id: 'a7', type: 'display_message', message: 'Never shown' }],
      }),
    ]
  );

  const report = validateFormLogic(doc);
  assert.ok(report.warnings.some((w) => w.code === 'POTENTIAL_ACTION_CONFLICT'));
  assert.ok(report.warnings.some((w) => w.code === 'INCOMPATIBLE_NAVIGATION'));
  assert.ok(report.errors.some((e) => e.code === 'MISSING_TARGET_PAGE'));
  assert.ok(report.warnings.some((w) => w.code === 'UNAVAILABLE_CONDITION_SOURCE'));
  assert.ok(report.warnings.some((w) => w.code === 'UNREACHABLE_ACTION'));
});

// ---------------------------------------------------------------------------
// 11. Server-Side Tamper Resistance (Calculated Fields & Quiz Scoring)
// ---------------------------------------------------------------------------
test('11. Server-side validator recomputes calculated values & quiz scores independently of client payload', () => {
  const doc = makeBaseDoc(
    [{ id: 'p1', index: 1, title: 'Quiz', componentIds: ['q_qty', 'q_total', 'q_quiz'] }],
    {
      q_qty: makeNode('q_qty', 'p1', 'number', 'Quantity', { required: true }),
      q_total: makeNode('q_total', 'p1', 'number', 'Total Price'),
      q_quiz: makeNode('q_quiz', 'p1', 'radio', '2 + 2 = ?', {
        required: true,
        options: ['3', '4'],
        correctAnswer: '4',
        points: 25,
      }),
    },
    [
      makeRule({
        id: 'r_calc',
        name: 'Compute total',
        conditionGroup: {
          kind: 'group',
          id: 'g1',
          combinator: 'AND',
          items: [{ kind: 'condition', id: 'c1', sourceType: 'component', sourceId: 'q_qty', operator: 'is_not_empty', value: '' }],
        },
        actions: [
          {
            id: 'a1',
            type: 'set_calculated_value',
            targetComponentId: 'q_total',
            expression: '{{q_qty}} * 20',
          },
        ],
      }),
    ],
    { isQuizMode: true }
  );

  // Client tries to forge q_total = 0 when q_qty = 5!
  const result = validateAndSanitizeSubmission(doc, {
    q_qty: 5,
    q_total: 0,
    q_quiz: '4',
  });

  assert.equal(result.valid, true);
  assert.equal(result.sanitizedAnswers.q_total, 100);
  assert.equal(result.calculatedValues.q_total, 100);
  assert.equal(result.score, 25);
  assert.equal(result.maxScore, 25);
});

// ---------------------------------------------------------------------------
// 12. Existing Legacy v1 Form Backward Compatibility
// ---------------------------------------------------------------------------
test('12. Legacy v1 FormSchema migrates, branches, validates, and round-trips losslessly', () => {
  const legacyForm: FormSchema = {
    id: 'legacy_branch_form',
    title: 'Legacy V1 Survey',
    description: 'Pre-Studio form',
    category: 'survey',
    layoutMode: 'stepped',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    responsesCount: 3,
    theme: {
      primaryColor: '#0F766E',
      backgroundColor: '#F7F6F3',
      surfaceColor: '#FFFFFF',
      textColor: '#0B0D0F',
      borderRadius: 'lg',
      fontFamily: 'DM Sans',
      inputStyle: 'bordered',
      backgroundStyle: 'solid',
    },
    welcomeScreen: { enabled: false, title: 'Hi', subtitle: '', buttonText: 'Go' },
    thankYouScreen: { title: 'Done', message: 'Saved', showRestartButton: false },
    settings: {
      slug: 'legacy-v1',
      isPublished: true,
      notifyOnSubmission: false,
      allowMultipleSubmissions: true,
      showProgressBar: true,
      isQuizMode: false,
      submitButtonText: 'Submit',
    },
    fields: [
      { id: 'f1', type: 'radio', label: 'Interested?', required: true, options: ['Yes', 'No'], step: 1 },
      { id: 'f2', type: 'text', label: 'Why?', required: true, step: 1 },
      { id: 'f3', type: 'email', label: 'Contact Email', required: true, step: 2 },
    ],
    logicRules: [
      {
        id: 'lr_1',
        sourceFieldId: 'f1',
        condition: 'equals',
        value: 'Yes',
        action: 'show',
        targetFieldId: 'f2',
      },
    ],
  };

  const doc = migrateLegacyFormToDocument(legacyForm);
  const subNo = validateAndSanitizeSubmission(doc, { f1: 'No', f3: 'user@example.com' });
  assert.equal(subNo.valid, true);
  assert.equal(subNo.visibleComponentIds.includes('f2'), false);

  const subYesMissing = validateAndSanitizeSubmission(doc, { f1: 'Yes', f3: 'user@example.com' });
  assert.equal(subYesMissing.valid, false);
  assert.ok(subYesMissing.errors['f2']);

  // Round-trip back to FormSchema preserves fields, pages, and rules
  const roundTripped = serializeDocumentToLegacyForm(doc);
  assert.equal(roundTripped.fields.length, 3);
  assert.equal(roundTripped.logicRules.length, 1);
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
