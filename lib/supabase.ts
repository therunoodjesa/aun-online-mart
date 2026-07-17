import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Expo only exposes variables prefixed with EXPO_PUBLIC_ to the app bundle.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? 'https://sfcwcwzzwmjcypnxvrfg.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmY3djd3p6d21qY3lwbnh2cmZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzMzAyMjcsImV4cCI6MjA5ODkwNjIyN30.m5SOxKAunvlF5Ag-XfjicMoYo_9gSMp0d_CABIBQiA8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
