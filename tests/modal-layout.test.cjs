const test = require('node:test');
const assert = require('node:assert/strict');
const { html } = require('./app-harness.cjs');

const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];

// Structural regression only: real outside-wheel behavior and native close paths
// still require browser QA. :modal releases the lock on every native close path.
for (const element of ['html', 'body']) {
  test(`${element} locks background scrolling only while a native modal is active`, () => {
    const selector = `${element}:has(dialog:modal)`;
    const rule = rules.find(([, selectors]) => selectors.split(',').some(value => value.trim() === selector));
    assert.ok(rule, `${selector} must follow the native modal state`);
    assert.match(rule[2], /(?:^|;)\s*overflow\s*:\s*hidden\s*(?:;|$)/,
      'both scroll axes must stay locked behind the dialog');
  });
}


test('phone informational footer is hidden and build metadata is last in Help', () => {
  const mobile = css.match(/@media \(max-width: 620px\) \{([\s\S]*?)@media \(prefers-reduced-motion/)[1];
  assert.match(mobile, /footer\s*\{\s*display:\s*none;?\s*\}/);
  assert.match(mobile, /\.primary-action\s*\{\s*position:\s*sticky;/);
  const help = html.match(/<dialog\b[^>]*id="helpDialog"[\s\S]*?<\/dialog>/)[0];
  assert.match(help, /data-i18n="helpShortcut"[\s\S]*class="build-meta"[\s\S]*id="buildVersion"[\s\S]*id="builtAt"[^>]*>[^<]*<\/span><\/span>\s*<\/div>/);
  assert.doesNotMatch(html.match(/<footer>[\s\S]*?<\/footer>/)[0], /build-meta|id="builtAt"|id="buildVersion"/);
  for (const id of ['buildVersion','builtAt']) assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
});
