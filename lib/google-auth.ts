import * as Linking from 'expo-linking';
import { supabase } from './supabase';

export const googleRedirectUrl = Linking.createURL('auth/callback');

export async function beginGoogleSignIn() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: googleRedirectUrl,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data.url) throw new Error('Google sign-in could not be started.');
  await Linking.openURL(data.url);
}
