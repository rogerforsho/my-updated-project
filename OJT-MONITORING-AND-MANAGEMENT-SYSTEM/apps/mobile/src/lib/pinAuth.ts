import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';

const KEY = 'cdm_ojt_quick_pin_v1';
type PinRecord = { userId: string; salt: string; hash: string; failures: number; biometrics: boolean };
let pending: Promise<unknown> = Promise.resolve();
function serialized<T>(action: () => Promise<T>): Promise<T> {
  const next = pending.then(action, action);
  pending = next.catch(() => {});
  return next;
}
async function read(): Promise<PinRecord | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as PinRecord;
    return record.userId && /^[a-f0-9]{32}$/.test(record.salt) && /^[a-f0-9]{64}$/.test(record.hash) && Number.isInteger(record.failures)
      ? record : null;
  } catch { return null; }
}
const save = (record: PinRecord) => SecureStore.setItemAsync(KEY, JSON.stringify(record));
const digest = (pin: string, salt: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);

export function validPin(pin: string): boolean {
  if (!/^\d{4}$/.test(pin) || /^(\d)\1{3}$/.test(pin)) return false;
  return !['0123', '1234', '2345', '3456', '4567', '5678', '6789', '9876', '8765', '7654', '6543', '5432', '4321', '3210'].includes(pin);
}

export async function getPin(userId: string): Promise<PinRecord | null> {
  await pending;
  const record = await read();
  return record?.userId === userId ? record : null;
}

export function setPin(userId: string, pin: string): Promise<void> {
  if (!validPin(pin)) throw new Error('Choose a less predictable 4-digit PIN.');
  return serialized(async () => {
    const salt = Array.from(await Crypto.getRandomBytesAsync(16), byte => byte.toString(16).padStart(2, '0')).join('');
    await save({ userId, salt, hash: await digest(pin, salt), failures: 0, biometrics: false });
  });
}

export function verifyPin(userId: string, pin: string): Promise<'ok' | 'wrong' | 'locked'> {
  return serialized(async () => {
    const record = await read();
    if (!record || record.userId !== userId) return 'locked';
    if (/^\d{4}$/.test(pin) && await digest(pin, record.salt) === record.hash) {
      await save({ ...record, failures: 0 });
      return 'ok';
    }
    if (record.failures >= 4) {
      await SecureStore.deleteItemAsync(KEY);
      return 'locked';
    }
    await save({ ...record, failures: record.failures + 1 });
    return 'wrong';
  });
}

export function clearPin(): Promise<void> { return serialized(() => SecureStore.deleteItemAsync(KEY)); }
export function setBiometrics(userId: string, enabled: boolean): Promise<void> {
  return serialized(async () => {
    const record = await read();
    if (!record || record.userId !== userId) throw new Error('PIN is unavailable.');
    await save({ ...record, biometrics: enabled });
  });
}
export async function biometricsAvailable(): Promise<boolean> {
  return await LocalAuthentication.hasHardwareAsync() && await LocalAuthentication.isEnrolledAsync();
}
export async function authenticateBiometrics(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock student account', disableDeviceFallback: true, biometricsSecurityLevel: 'strong' });
  return result.success;
}
