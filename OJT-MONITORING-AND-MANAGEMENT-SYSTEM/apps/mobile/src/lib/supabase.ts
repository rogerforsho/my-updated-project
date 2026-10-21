import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const appEnvironment = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
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
  }
);
