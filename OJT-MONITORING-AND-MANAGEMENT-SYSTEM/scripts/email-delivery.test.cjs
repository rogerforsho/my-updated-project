const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '..', 'apps', 'web', 'src', 'lib', 'email', 'deliver.ts'), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

function load(env, fetchImpl, sent = []) {
  const module = { exports: {} };
  const nodemailer = { createTransport: () => ({ sendMail: async (m) => sent.push(m) }) };
  vm.runInNewContext(js, {
    module, exports: module.exports, console: { error() {} }, AbortSignal,
    process: { env }, fetch: fetchImpl,
    require: () => ({ __esModule: true, default: nodemailer }),
  });
  return module.exports.deliverEmail;
}
const msg = { to: 'a@b.co', subject: 's', html: '<p>x</p>', category: 'c', idempotencyKey: 'k1' };

test('reports not configured when no provider is set', async () => {
  const result = await load({}, async () => assert.fail('no request expected'))(msg);
  assert.equal(result.success, false);
  assert.equal(result.error, 'Email delivery is not configured.');
});

test('uses Gmail SMTP when SMTP credentials are set', async () => {
  const sent = [];
  const result = await load({ SMTP_USER: 'u@g.co', SMTP_PASS: 'p' }, async () => assert.fail('no fetch'), sent)(msg);
  assert.equal(result.success, true);
  assert.equal(sent[0].to, 'a@b.co');
  assert.equal(sent[0].from, 'u@g.co');
});
