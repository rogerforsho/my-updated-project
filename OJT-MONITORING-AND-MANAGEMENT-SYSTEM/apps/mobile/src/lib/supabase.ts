import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { fetchWithTimeout } from './fetchWithTimeout';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const appEnvironment = process.env.EXPO_PUBLIC_APP_ENV ?? 'production';
const supabaseProjectRef = supabaseUrl
  ? new URL(supabaseUrl).hostname.split('.')[0]
  : undefined;
const productionProjectRef = 'jhslfwczxkdhexjgssjr';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Configure the Supabase URL and anon key for this mobile environment.');
}

if (appEnvironment !== 'production' && supabaseProjectRef === productionProjectRef) {
  throw new Error(
    `Refusing to connect a ${appEnvironment} mobile build to protected Supabase project ${supabaseProjectRef}.`,
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    // A stalled request must fail, not spin forever. Uploads get longer, matching UPLOAD_TIMEOUT_MS in storage.ts.
    global: {
      fetch: (url, init) => fetchWithTimeout(url, init, String(url).includes('/storage/v1/') ? 90000 : 30000),
    },
  }
);

// Pause token refresh while backgrounded (camera, location prompt) so a half-finished refresh is not left behind.
AppState.addEventListener('change', (state) => {
  if (state === 'active') void supabase.auth.startAutoRefresh();
  else void supabase.auth.stopAutoRefresh();
});
