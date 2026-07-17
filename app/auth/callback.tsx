import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authstore';

export default function GoogleAuthCallback() {
  const router = useRouter();
  const { code, error_description: errorDescription } = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const fetchProfile = useAuthStore((state) => state.fetchProfile);
  const [message, setMessage] = useState('Completing Google sign-in…');

  useEffect(() => {
    const finishSignIn = async () => {
      if (errorDescription) { setMessage(errorDescription); return; }
      if (!code) { setMessage('Google did not return a sign-in code. Please try again.'); return; }
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data.user) { setMessage(error?.message ?? 'Could not complete Google sign-in.'); return; }
      await fetchProfile(data.user.id);
      router.replace('/(buyer)/');
    };
    void finishSignIn();
  }, [code, errorDescription, fetchProfile, router]);

  const failed = message !== 'Completing Google sign-in…';
  return <View style={styles.screen}><StatusBar style="light" />{!failed && <ActivityIndicator size="large" color="#68ECCB" />}<Text style={styles.text}>{message}</Text>{failed && <TouchableOpacity onPress={() => router.replace('/(auth)/login')} style={styles.button}><Text style={styles.buttonText}>RETURN TO LOG IN</Text></TouchableOpacity>}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 18 },
  text: { color: '#F8F3ED', fontSize: 16, textAlign: 'center', lineHeight: 22 },
  button: { backgroundColor: '#68ECCB', paddingHorizontal: 18, paddingVertical: 13, borderRadius: 8 },
  buttonText: { color: '#01193D', fontWeight: '800', fontSize: 13 },
});
