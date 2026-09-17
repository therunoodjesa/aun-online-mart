import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as ExpoLinking from 'expo-linking';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/user-error';

const resetRedirect = Platform.OS === 'web' && typeof window !== 'undefined'
  ? `${window.location.origin}/auth/reset-password`
  : ExpoLinking.createURL('/auth/reset-password');

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const sendResetLink = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setError('Enter the email address you used for AOM.'); return; }
    setLoading(true); setError(''); setMessage('');
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: resetRedirect });
    setLoading(false);
    if (resetError) { setError(friendlyError(resetError, 'We could not send the reset link. Check your connection and try again.')); return; }
    setMessage('If an AOM account uses this email, a password-reset link is on its way. Check your inbox and spam folder.');
  };

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><StatusBar style="light" /><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <TouchableOpacity style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back-outline" size={21} color="#F8F3ED" /><Text style={styles.backText}>BACK TO LOG IN</Text></TouchableOpacity>
    <View style={styles.icon}><Ionicons name="key-outline" size={34} color="#68ECCB" /></View>
    <Text style={styles.title}>Reset your password</Text>
    <Text style={styles.subtitle}>Enter your AOM email and we’ll send a secure link to choose a new password.</Text>
    <Text style={styles.label}>EMAIL ADDRESS</Text>
    <View style={[styles.inputWrap, error && styles.inputError]}><Ionicons name="mail-outline" size={18} color="#A0A0A0" /><TextInput value={email} onChangeText={(value) => { setEmail(value); setError(''); setMessage(''); }} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="your@email.com" placeholderTextColor="#A0A0A0" style={styles.input} /></View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {message ? <View style={styles.success}><Ionicons name="mail-open-outline" size={20} color="#68ECCB" /><Text style={styles.successText}>{message}</Text></View> : null}
    <TouchableOpacity disabled={loading} onPress={sendResetLink} style={[styles.button, loading && styles.disabled]}>{loading ? <ActivityIndicator color="#01193D" /> : <Text style={styles.buttonText}>SEND RESET LINK</Text>}</TouchableOpacity>
    {message ? <TouchableOpacity disabled={loading} onPress={sendResetLink} style={styles.resend}><Text style={styles.resendText}>Send another link</Text></TouchableOpacity> : null}
  </ScrollView></KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#01193D' }, content: { flexGrow: 1, padding: 30, paddingTop: 52, paddingBottom: 46 }, back: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start' }, backText: { color: '#F8F3ED', fontSize: 14, fontWeight: '700' }, icon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(104,236,203,0.12)', marginTop: 58 }, title: { color: '#F8F3ED', fontSize: 27, fontWeight: '800', marginTop: 24 }, subtitle: { color: '#B8C4D4', fontSize: 16, lineHeight: 23, marginTop: 10, marginBottom: 30 }, label: { color: '#A0A0A0', fontSize: 12, fontWeight: '700', letterSpacing: .5, marginBottom: 8 }, inputWrap: { height: 54, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(104,236,203,0.4)', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, inputError: { borderColor: '#FF8B7B' }, input: { flex: 1, color: '#F8F3ED', fontSize: 16 }, error: { color: '#FFB4A8', fontSize: 13, marginTop: 8 }, success: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(104,236,203,0.12)', borderRadius: 9, padding: 14, marginTop: 18 }, successText: { flex: 1, color: '#D8FFF4', fontSize: 14, lineHeight: 20 }, button: { height: 56, borderRadius: 8, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginTop: 28 }, disabled: { opacity: .65 }, buttonText: { color: '#01193D', fontSize: 16, fontWeight: '800' }, resend: { alignSelf: 'center', padding: 16 }, resendText: { color: '#68ECCB', fontSize: 14, fontWeight: '700' },
});
