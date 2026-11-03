const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function renderNavigation(section, pathname) {
  const filename = path.resolve(__dirname, '../apps/web/src/components/coordinator/CoordinatorSectionNav.tsx');
  const exports = {};
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  vm.runInNewContext(output, { exports, require(name) {
    if (name === 'next/navigation') return { usePathname: () => pathname };
    if (name === 'next/link') return ({ children, ...props }) => React.createElement('a', props, children);
    return require(name);
  } });
  return renderToStaticMarkup(React.createElement(exports.default, { section }));
}

test('Partners tabs reach company, branch and request workflows and identify the current page', () => {
  const html = renderNavigation('partners', '/coordinator/branches');
  for (const href of ['companies', 'branches', 'company-requests']) {
    assert.ok(html.includes(`href="/coordinator/${href}"`));
  }
  assert.match(html, /href="\/coordinator\/branches" aria-current="page"/);
  assert.ok(!html.includes('/map'));
});

test('Evaluations tabs preserve both results and the appeal workflow', () => {
  const html = renderNavigation('evaluations', '/coordinator/evaluations');
  assert.match(html, /href="\/coordinator\/supervisor-evaluations"/);
  assert.match(html, /href="\/coordinator\/evaluations" aria-current="page"/);
});
