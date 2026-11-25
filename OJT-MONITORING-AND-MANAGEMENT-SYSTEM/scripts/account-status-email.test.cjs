const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'apps', 'web', 'src', 'lib', 'email', 'send-account-status.ts'),
  'utf8',
);
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function load(sent) {
  const module = { exports: {} };
  vm.runInNewContext(js, {
    module,
    exports: module.exports,
    console,
    require: () => ({ deliverEmail: async (message) => { sent.push(message); return { success: true }; } }),
  });
  return module.exports.sendAccountStatusEmail;
}

test('approved account email uses the CdM visual system', async () => {
  const sent = [];
  await load(sent)({ to: 'student@example.test', fullName: 'Ana Cruz', status: 'active' });

  assert.equal(sent.length, 1);
  assert.match(sent[0].html, /#092E1D/);
  assert.match(sent[0].html, /#F4F6F2/);
  assert.match(sent[0].html, /Account Approved/);
  assert.match(sent[0].html, /Sign In Via Mobile App/);
});

test('changes-needed email preserves escaped review feedback', async () => {
  const sent = [];
  await load(sent)({
    to: 'student@example.test',
    fullName: '<Ana>',
    status: 'rejected',
    reason: 'Use <strong>one</strong> file & retry',
  });

  assert.equal(sent.length, 1);
  assert.match(sent[0].html, /Changes Needed/);
  assert.match(sent[0].html, /Your registration needs changes\./);
  assert.match(sent[0].html, /&lt;Ana&gt;/);
  assert.match(sent[0].html, /Use &lt;strong&gt;one&lt;\/strong&gt; file &amp; retry/);
  assert.doesNotMatch(sent[0].html, /<strong>one<\/strong> file & retry/);
});
