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

test('changing the PIN keeps the fingerprint choice and the old PIN stops working', async () => {
  const { pin } = fixture();
  await pin.setPin('student-a', '8052');
  await pin.setBiometrics('student-a', true);
  await pin.changePin('student-a', '7391');
  assert.equal((await pin.getPin('student-a')).biometrics, true);
  assert.equal(await pin.verifyPin('student-a', '8052'), 'wrong');
  assert.equal(await pin.verifyPin('student-a', '7391'), 'ok');
  await assert.rejects(pin.changePin('student-b', '7391'));
  assert.throws(() => pin.changePin('student-a', '1234'));
});

test('unlocked flag is a plain true/false the app and the sign-in screen share', () => {
  const { pin } = fixture();
  assert.equal(pin.isUnlocked(), false);
  pin.setUnlocked(true);
  assert.equal(pin.isUnlocked(), true);
  pin.setUnlocked(false);
  assert.equal(pin.isUnlocked(), false);
});

const read = file => fs.readFileSync(path.join(__dirname, '../apps/mobile', file), 'utf8');

test('Sign Out is a real sign-out that keeps the PIN; only forgetDevice wipes it', () => {
  const auth = read('src/services/auth.ts');
  const signOut = auth.slice(auth.indexOf('export async function signOut'), auth.indexOf('export async function changeUserPassword'));
  assert.ok(signOut.includes('if (options.forgetDevice) await clearPin()'));
  assert.ok(signOut.includes('if (options.forgetDevice) await SecureStore.deleteItemAsync'));
  const profile = read('src/screens/profile/ProfileScreen.tsx');
  const handler = profile.slice(profile.indexOf('function handleSignOut'), profile.indexOf('async function toggleBiometrics'));
  assert.ok(handler.includes('await signOut()'));
  assert.doesNotMatch(handler, /forgetDevice|lockApp/);
  const app = read('App.tsx');
  assert.ok(app.includes('await signOut({ forgetDevice: true })'));
});

test('PIN pad has its own keypad (no phone keyboard), four dots and all ten digits', () => {
  const pad = read('src/components/PinPad.tsx');
  assert.doesNotMatch(pad, /TextInput/);
  assert.ok(pad.includes('const PIN_LENGTH = 4'));
  assert.ok(pad.includes("const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']"));
  assert.ok(pad.includes("press('0')"));
  const profile = read('src/screens/profile/ProfileScreen.tsx');
  assert.doesNotMatch(profile, /Current PIN|Confirm new PIN/);
});

test('the PIN is created once, and a password sign-in does not ask for it again', () => {
  const app = read('App.tsx');
  assert.ok(app.includes("!hasPin ? 'setup' : isUnlocked() ? 'open' : 'unlock'"));
  const signIn = read('src/screens/auth/SignInScreen.tsx');
  assert.ok(signIn.indexOf('setUnlocked(true)') < signIn.indexOf('await signIn('));
});

test('the app asks for the PIN again when the student returns after a short grace period', () => {
  const app = fs.readFileSync(path.join(__dirname, '../apps/mobile/App.tsx'), 'utf8');
  assert.match(app, /const LOCK_AFTER_MS = 15_000/);
  assert.match(app, /AppState\.addEventListener\('change'/);
  assert.match(app, /state === 'background'/);
  assert.match(app, /appState\.remove\(\)/);
});
