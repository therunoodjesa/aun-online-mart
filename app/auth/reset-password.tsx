import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as ExpoLinking from 'expo-linking';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authstore';
import { resolveAccountHome } from '../../lib/account-route';
import { friendlyError } from '../../lib/user-error';

function tokensFromUrl(url: string) {
  const hash = url.split('#')[1] ?? '';
  const values = new URLSearchParams(hash);
  return { accessToken: values.get('access_token'), refreshToken: values.get('refresh_token'), code: new URL(url).searchParams.get('code') };
}

export default function ResetPassword() {
  const router = useRouter();
  const fetchProfile = useAuthStore((state) => state.fetchProfile);
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const recover = async () => {
      const url = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : await ExpoLinking.getInitialURL();
      if (!url) { setLinkError('This reset link is incomplete. Request a new one from the log-in page.'); return; }
      const { accessToken, refreshToken, code } = tokensFromUrl(url);
      const result = code ? await supabase.auth.exchangeCodeForSession(code) : accessToken && refreshToken ? await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }) : { data: { session: null }, error: new Error('Missing recovery details') };
      if (result.error || !result.data.session) { setLinkError('This reset link has expired or has already been used. Request a new link and try again.'); return; }
      setReady(true);
    };
    void recover();
  }, []);

  const savePassword = async () => {
    if (password.length < 8) { setError('Use at least 8 characters for your new password.'); return; }
    if (password !== confirmPassword) { setError('The passwords do not match.'); return; }
    setSaving(true); setError('');
    const { data, error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError || !data.user) { setError(friendlyError(updateError, 'Your password could not be updated. Please request a new reset link.')); return; }
    await fetchProfile(data.user.id);
    router.replace(await resolveAccountHome(data.user));
  };

  if (linkError) return <View style={styles.screen}><StatusBar style="light" /><Ionicons name="alert-circle-outline" size={42} color="#FFB4A8" /><Text style={styles.title}>Link unavailable</Text><Text style={styles.message}>{linkError}</Text><TouchableOpacity onPress={() => router.replace('/(auth)/forgot-password')} style={styles.button}><Text style={styles.buttonText}>REQUEST A NEW LINK</Text></TouchableOpacity></View>;
  if (!ready) return <View style={styles.screen}><StatusBar style="light" /><ActivityIndicator size="large" color="#68ECCB" /><Text style={styles.message}>Checking your secure reset link…</Text></View>;
  return <View style={styles.screen}><StatusBar style="light" /><View style={styles.card}><View style={styles.icon}><Ionicons name="lock-closed-outline" size={30} color="#68ECCB" /></View><Text style={styles.title}>Choose a new password</Text><Text style={styles.message}>Make it at least 8 characters long.</Text><Text style={styles.label}>NEW PASSWORD</Text><View style={styles.inputWrap}><TextInput value={password} onChangeText={(value) => { setPassword(value); setError(''); }} secureTextEntry={!showPassword} autoComplete="new-password" style={styles.input} /><TouchableOpacity onPress={() => setShowPassword((value) => !value)}><Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#A0A0A0" /></TouchableOpacity></View><Text style={styles.label}>CONFIRM NEW PASSWORD</Text><View style={styles.inputWrap}><TextInput value={confirmPassword} onChangeText={(value) => { setConfirmPassword(value); setError(''); }} secureTextEntry={!showPassword} autoComplete="new-password" style={styles.input} /></View>{error ? <Text style={styles.error}>{error}</Text> : null}<TouchableOpacity disabled={saving} onPress={savePassword} style={[styles.button, saving && { opacity: .65 }]}>{saving ? <ActivityIndicator color="#01193D" /> : <Text style={styles.buttonText}>SAVE NEW PASSWORD</Text>}</TouchableOpacity></View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#01193D', padding: 30, alignItems: 'center', justifyContent: 'center', gap: 18 }, card: { width: '100%', maxWidth: 430 }, icon: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(104,236,203,0.12)', marginBottom: 8 }, title: { color: '#F8F3ED', fontSize: 25, fontWeight: '800', textAlign: 'center' }, message: { color: '#B8C4D4', fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 12 }, label: { color: '#A0A0A0', fontSize: 12, fontWeight: '700', letterSpacing: .5, marginTop: 13, marginBottom: 8 }, inputWrap: { height: 54, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(104,236,203,0.4)', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' }, input: { flex: 1, color: '#F8F3ED', fontSize: 16 }, error: { color: '#FFB4A8', fontSize: 13, marginTop: 10 }, button: { minHeight: 54, paddingHorizontal: 20, borderRadius: 8, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginTop: 28 }, buttonText: { color: '#01193D', fontSize: 14, fontWeight: '800' },
});
