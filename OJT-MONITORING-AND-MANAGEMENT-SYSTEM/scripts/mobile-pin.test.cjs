const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createHash, randomBytes } = require('node:crypto');

function fixture() {
  const values = new Map();
  const source = fs.readFileSync(path.join(__dirname, '../apps/mobile/src/lib/pinAuth.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const crypto = {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: async (_algorithm, value) => createHash('sha256').update(value).digest('hex'),
    getRandomBytesAsync: async count => randomBytes(count),
  };
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (name === 'expo-secure-store') return {
      getItemAsync: async key => values.get(key) ?? null,
      setItemAsync: async (key, value) => { values.set(key, value); },
      deleteItemAsync: async key => { values.delete(key); },
    };
    if (name === 'expo-crypto') return crypto;
    if (name === 'expo-local-authentication') return { hasHardwareAsync: async () => false, isEnrolledAsync: async () => false };
    throw Error(name);
  } });
  return { pin: module.exports, values };
}

test('PIN is salted, scoped to the student, and locks after five failures', async () => {
  const { pin, values } = fixture();
  for (const weak of ['0000', '1234', '4321', '12a4', '123']) assert.equal(pin.validPin(weak), false);
  assert.equal(pin.validPin('8052'), true);
  await pin.setPin('student-a', '8052');
  const stored = [...values.values()][0];
  assert.equal(stored.includes('8052'), false);
  assert.equal(await pin.getPin('student-b'), null);
  assert.equal(await pin.verifyPin('student-a', '8052'), 'ok');
  for (let attempt = 0; attempt < 4; attempt++) assert.equal(await pin.verifyPin('student-a', '1111'), 'wrong');
  assert.equal(await pin.verifyPin('student-a', '1111'), 'locked');
  assert.equal(await pin.getPin('student-a'), null);
});

test('correct PIN resets failed attempts', async () => {
  const { pin } = fixture();
  await pin.setPin('student-a', '8052');
  for (let i = 0; i < 4; i++) assert.equal(await pin.verifyPin('student-a', '1111'), 'wrong');
  assert.equal(await pin.verifyPin('student-a', '8052'), 'ok');
  assert.equal(await pin.verifyPin('student-a', '1111'), 'wrong');
});

test('Profile Sign Out locks to the PIN screen instead of wiping the PIN', async () => {
  const { pin } = fixture();
  let locks = 0;
  const off = pin.onLock(() => { locks++; });
  pin.lockApp();
  off();
  pin.lockApp();
  assert.equal(locks, 1);
  const profile = fs.readFileSync(path.join(__dirname, '../apps/mobile/src/screens/profile/ProfileScreen.tsx'), 'utf8');
  const handler = profile.slice(profile.indexOf('function handleSignOut'), profile.indexOf('async function handlePinChange'));
  assert.match(handler, /onPress: lockApp/);
  assert.doesNotMatch(handler, /signOut\(/);
});

test('the app asks for the PIN again when the student returns after a short grace period', () => {
  const app = fs.readFileSync(path.join(__dirname, '../apps/mobile/App.tsx'), 'utf8');
  assert.match(app, /const LOCK_AFTER_MS = 15_000/);
  assert.match(app, /AppState\.addEventListener\('change'/);
  assert.match(app, /state === 'background'/);
  assert.match(app, /appState\.remove\(\)/);
});
