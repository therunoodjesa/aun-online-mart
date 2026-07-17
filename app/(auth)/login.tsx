import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, Alert,
  KeyboardAvoidingView, Platform, Dimensions
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authstore';
import { beginGoogleSignIn } from '../../lib/google-auth';

const { width } = Dimensions.get('window');
const S = width / 430;

export default function Login() {
  const router = useRouter();
  const { fetchProfile } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loginError, setLoginError] = useState('');

  const handleLogin = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
    setEmailError(!cleanEmail ? 'Enter your email address.' : !isEmailValid ? 'Enter a valid email address.' : '');
    setPasswordError(!password ? 'Enter your password.' : '');
    setLoginError('');
    if (!isEmailValid || !password) return;
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    setLoading(false);
    if (error) {
      const invalidCredentials = /invalid login credentials|invalid credentials/i.test(error.message);
      const emailUnconfirmed = /email not confirmed|email verification/i.test(error.message);
      setLoginError(invalidCredentials ? 'That email or password is incorrect. Please try again.' : emailUnconfirmed ? 'Please confirm the verification email sent to this account, then log in again.' : error.message || 'We could not log you in right now. Please try again.');
      return;
    }
    if (data.user) {
      await fetchProfile(data.user.id);
      const { data: administrator } = await supabase.from('admin_users').select('user_id').eq('user_id', data.user.id).maybeSingle();
      if (administrator) { router.replace('/admin-portal'); return; }
      const { data: cafeteriaStaff } = await supabase.from('cafeteria_staff').select('user_id').eq('user_id', data.user.id).eq('is_active', true).maybeSingle();
      if (cafeteriaStaff) { router.replace('/cafeteria-portal'); return; }
      const { data: vendor } = await supabase
        .from('vendors')
        .select('id')
        .eq('owner_id', data.user.id)
        .maybeSingle();
      const isVendor = data.user.user_metadata?.role === 'vendor' || Boolean(vendor);
      router.replace(isVendor ? '/vendor-portal' : '/(buyer)/');
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try { await beginGoogleSignIn(); }
    catch (error) { Alert.alert('Google sign-in failed', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setGoogleLoading(false); }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <StatusBar style="light" />

        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back-outline" size={20 * S} color="#F8F3ED" />
            <Text style={styles.backText}>BACK</Text>
          </TouchableOpacity>
          <View style={styles.logoMark}>
            <Ionicons name="cart-outline" size={18 * S} color="#68ECCB" />
            <Text style={styles.logoText}>AOM</Text>
          </View>
        </View>

        {/* Heading */}
        <Text style={styles.title}>Welcome back :)</Text>
        <Text style={styles.subtitle}>Log in to your account</Text>

        {/* Email */}
        <Text style={styles.fieldLabel}>Email Address</Text>
        <View style={[styles.inputWrap, emailError && styles.inputWrapError]}>
          <Ionicons name="mail-outline" size={18 * S} color="#A0A0A0" />
          <TextInput
            style={styles.input}
            placeholder="your@email.com"
            placeholderTextColor="#A0A0A0"
            value={email}
            onChangeText={(value) => { setEmail(value); setEmailError(''); setLoginError(''); }}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>
        {!!emailError && <Text style={styles.fieldError}>{emailError}</Text>}

        {/* Password */}
        <Text style={styles.fieldLabel}>Password</Text>
        <View style={[styles.inputWrap, passwordError && styles.inputWrapError]}>
          <Ionicons name="lock-closed-outline" size={18 * S} color="#A0A0A0" />
          <TextInput
            style={styles.input}
            placeholder="Your password"
            placeholderTextColor="#A0A0A0"
            value={password}
            onChangeText={(value) => { setPassword(value); setPasswordError(''); setLoginError(''); }}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={18 * S}
              color="#A0A0A0"
            />
          </TouchableOpacity>
        </View>
        {!!passwordError && <Text style={styles.fieldError}>{passwordError}</Text>}
        {!!loginError && <View style={styles.loginError}><Ionicons name="alert-circle-outline" size={17 * S} color="#FFB4A8" /><Text style={styles.loginErrorText}>{loginError}</Text></View>}

        {/* Forgot password */}
        <TouchableOpacity style={styles.forgotRow}>
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Google */}
        <TouchableOpacity style={[styles.googleBtn, googleLoading && { opacity: 0.6 }]} onPress={handleGoogleLogin} disabled={googleLoading}>
          <Ionicons name="logo-google" size={18 * S} color="#F8F3ED" />
          <Text style={styles.googleText}>{googleLoading ? 'Opening Google…' : 'Continue with Google'}</Text>
        </TouchableOpacity>

        {/* Login button */}
        <TouchableOpacity
          style={[styles.submitBtn, loading && { opacity: 0.6 }]}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.submitText}>
            {loading ? 'Logging in...' : 'LOG IN'}
          </Text>
        </TouchableOpacity>

        {/* Footer */}
        <TouchableOpacity
          style={styles.footer}
          onPress={() => router.push('/(auth)/signup')}
        >
          <Text style={styles.footerText}>No account yet? </Text>
          <Text style={styles.footerLink}>Sign up for free</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#01193D',
  },
  content: {
    paddingHorizontal: 30 * S,
    paddingTop: 52 * S,
    paddingBottom: 48 * S,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 36 * S,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6 * S,
  },
  backText: {
    fontSize: 16 * S,
    fontWeight: '600',
    color: '#F8F3ED',
  },
  logoMark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5 * S,
  },
  logoText: {
    fontSize: 14 * S,
    fontWeight: '600',
    color: '#F8F3ED',
    letterSpacing: 1,
  },
  title: {
    fontSize: 24 * S,
    fontWeight: '600',
    color: '#F8F3ED',
    marginBottom: 6 * S,
  },
  subtitle: {
    fontSize: 16 * S,
    fontWeight: '400',
    color: '#A0A0A0',
    marginBottom: 28 * S,
  },
  fieldLabel: {
    fontSize: 12 * S,
    fontWeight: '600',
    color: '#A0A0A0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 7 * S,
    marginTop: 14 * S,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10 * S,
    backgroundColor: 'rgba(217,217,217,0.1)',
    borderWidth: 0.5,
    borderColor: 'rgba(104,236,203,0.4)',
    borderRadius: 8,
    paddingHorizontal: 14 * S,
    paddingVertical: 14 * S,
  },
  input: {
    flex: 1,
    fontSize: 16 * S,
    color: '#F8F3ED',
    fontWeight: '400',
  },
  inputWrapError: { borderColor: '#FF8B7B', borderWidth: 1 },
  fieldError: { color: '#FFB4A8', fontSize: 12 * S, marginTop: 6 * S },
  loginError: { marginTop: 12 * S, padding: 10 * S, borderRadius: 7, backgroundColor: 'rgba(197, 62, 45, 0.2)', flexDirection: 'row', alignItems: 'center', gap: 7 * S },
  loginErrorText: { flex: 1, color: '#FFDBD5', fontSize: 13 * S, lineHeight: 18 * S },
  forgotRow: {
    alignItems: 'flex-end',
    marginTop: 10 * S,
    marginBottom: 4 * S,
  },
  forgotText: {
    fontSize: 14 * S,
    color: '#68ECCB',
    fontWeight: '500',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10 * S,
    marginVertical: 20 * S,
  },
  dividerLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  dividerText: {
    fontSize: 14 * S,
    color: '#A0A0A0',
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10 * S,
    backgroundColor: 'rgba(217,217,217,0.1)',
    borderWidth: 0.5,
    borderColor: 'rgba(104,236,203,0.4)',
    borderRadius: 8,
    paddingVertical: 14 * S,
    marginBottom: 14 * S,
  },
  googleText: {
    fontSize: 16 * S,
    fontWeight: '500',
    color: '#F8F3ED',
  },
  submitBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 18 * S,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24 * S,
  },
  submitText: {
    fontSize: 20 * S,
    fontWeight: '800',
    color: '#01193D',
    letterSpacing: 0.5,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14 * S,
    color: '#A0A0A0',
  },
  footerLink: {
    fontSize: 14 * S,
    color: '#68ECCB',
    fontWeight: '600',
  },
});
