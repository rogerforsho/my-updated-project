import * as FileSystem from 'expo-file-system/legacy';

// Group chat messages written while offline wait here until the phone can send them.
// Text only, so one JSON file is enough (the attendance queue's two-copy write is for photos).
const OUTBOX_FILE = `${FileSystem.documentDirectory}cdm_ojt_chat_outbox.json`;

export interface ChatOutboxItem {
  client_id: string; // idempotency key sent to the server, so a retry is stored once
  user_id: string;   // another account on the same phone never sends this message
  content: string;
  created_at: string;
  rejected?: string; // the server refused it; kept so the student can see it and delete it
}

// Not cryptographic: the key only has to be unique per sender.
function newClientId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function readAll(): Promise<ChatOutboxItem[]> {
  try {
    if (!(await FileSystem.getInfoAsync(OUTBOX_FILE)).exists) return [];
    const saved = JSON.parse(await FileSystem.readAsStringAsync(OUTBOX_FILE));
    return Array.isArray(saved) ? saved.filter(i => i && typeof i.client_id === 'string' && typeof i.content === 'string' && typeof i.user_id === 'string') : [];
  } catch { return []; }
}

// One write at a time so two quick sends cannot overwrite each other.
let writeChain: Promise<unknown> = Promise.resolve();
function mutate<T>(change: (items: ChatOutboxItem[]) => { items: ChatOutboxItem[]; result: T }): Promise<T> {
  const run = async () => {
    const { items, result } = change(await readAll());
    await FileSystem.writeAsStringAsync(OUTBOX_FILE, JSON.stringify(items));
    return result;
  };
  const result = writeChain.then(run, run);
  writeChain = result.catch(() => undefined);
  return result;
}

export async function listChatOutbox(userId: string): Promise<ChatOutboxItem[]> {
  await writeChain;
  return (await readAll()).filter(i => i.user_id === userId);
}

export const enqueueChatMessage = (userId: string, content: string) =>
  mutate(items => {
    const item: ChatOutboxItem = { client_id: newClientId(), user_id: userId, content, created_at: new Date().toISOString() };
    return { items: [...items, item], result: item };
  });

export const removeChatOutboxItem = (clientId: string) =>
  mutate(items => ({ items: items.filter(i => i.client_id !== clientId), result: undefined }));

export const markChatOutboxRejected = (clientId: string, reason: string) =>
  mutate(items => ({ items: items.map(i => i.client_id === clientId ? { ...i, rejected: reason } : i), result: undefined }));
