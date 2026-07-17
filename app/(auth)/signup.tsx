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
import { beginGoogleSignIn } from '../../lib/google-auth';

const { width } = Dimensions.get('window');
const S = width / 430;

type Role = 'buyer' | 'vendor';

export default function Signup() {
  const router = useRouter();
  const [role, setRole] = useState<Role>('buyer');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const isAunEmail = email.endsWith('@aun.edu.ng');

  const handleSignup = async () => {
    if (!fullName || !email || !password) {
      Alert.alert('Missing fields', 'Please fill in all required fields.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Weak password', 'Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
          is_aun_student: isAunEmail,
          phone,
        },
      },
    });
    setLoading(false);
    if (error) {
      Alert.alert('Sign up failed', error.message);
      return;
    }
    router.replace(role === 'vendor' ? '/vendor-portal' : '/(buyer)/');
  };

  const handleGoogleSignup = async () => {
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
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>
          Join the fastest, trusted marketplace in Nigeria
        </Text>

        {/* AUN badge */}
        <View style={styles.aunBadge}>
          <Ionicons name="school-outline" size={16 * S} color="#68ECCB" />
          <Text style={styles.aunBadgeText}>
            AUN students get access to cafeteria ordering and meal plans.
          </Text>
        </View>

        {/* Role selector */}
        <Text style={styles.fieldLabel}>I am a</Text>
        <View style={styles.roleRow}>
          <TouchableOpacity
            style={[styles.roleCard, role === 'buyer' && styles.roleCardActive]}
            onPress={() => setRole('buyer')}
          >
            <Ionicons
              name="school-outline"
              size={24 * S}
              color={role === 'buyer' ? '#68ECCB' : '#A0A0A0'}
            />
            <Text style={[
              styles.roleText,
              role === 'buyer' && styles.roleTextActive
            ]}>
              Student / buyer
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.roleCard, role === 'vendor' && styles.roleCardActive]}
            onPress={() => setRole('vendor')}
          >
            <Ionicons
              name="storefront-outline"
              size={24 * S}
              color={role === 'vendor' ? '#68ECCB' : '#A0A0A0'}
            />
            <Text style={[
              styles.roleText,
              role === 'vendor' && styles.roleTextActive
            ]}>
              Vendor / seller
            </Text>
          </TouchableOpacity>
        </View>

        {/* Full name */}
        <Text style={styles.fieldLabel}>Full Name</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="person-outline" size={18 * S} color="#A0A0A0" />
          <TextInput
            style={styles.input}
            placeholder="Your full name"
            placeholderTextColor="#A0A0A0"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />
        </View>

        {/* Email */}
        <Text style={styles.fieldLabel}>Email Address</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="mail-outline" size={18 * S} color="#A0A0A0" />
          <TextInput
            style={styles.input}
            placeholder={role === 'buyer' ? 'yourname@aun.edu.ng' : 'your@email.com'}
            placeholderTextColor="#A0A0A0"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>
        {role === 'buyer' && email.length > 0 && (
          <Text style={[
            styles.emailHint,
            { color: isAunEmail ? '#68ECCB' : '#A0A0A0' }
          ]}>
            {isAunEmail
              ? '✓ AUN email — cafeteria access unlocked'
              : 'Use @aun.edu.ng to unlock student features'}
          </Text>
        )}

        {/* Phone */}
        <Text style={styles.fieldLabel}>Phone Number</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="call-outline" size={18 * S} color="#A0A0A0" />
          <TextInput
            style={styles.input}
            placeholder="+234 800 000 0000"
            placeholderTextColor="#A0A0A0"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </View>

        {/* Password */}
        <Text style={styles.fieldLabel}>Password</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="lock-closed-outline" size={18 * S} color="#A0A0A0" />
          <TextInput
            style={styles.input}
            placeholder="At least 8 characters"
            placeholderTextColor="#A0A0A0"
            value={password}
            onChangeText={setPassword}
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

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Google */}
        <TouchableOpacity style={[styles.googleBtn, googleLoading && { opacity: 0.6 }]} onPress={handleGoogleSignup} disabled={googleLoading}>
          <Ionicons name="logo-google" size={18 * S} color="#F8F3ED" />
          <Text style={styles.googleText}>{googleLoading ? 'Opening Google…' : 'Continue with Google'}</Text>
        </TouchableOpacity>

        {/* Sign up button */}
        <TouchableOpacity
          style={[styles.submitBtn, loading && { opacity: 0.6 }]}
          onPress={handleSignup}
          disabled={loading}
        >
          <Text style={styles.submitText}>
            {loading ? 'Creating account...' : 'SIGN UP'}
          </Text>
        </TouchableOpacity>

        {/* Terms */}
        <Text style={styles.terms}>
  By signing up you agree to our{' '}
  <Text
    style={styles.link}
    onPress={() => router.push('/(auth)/terms')}
  >
    Terms of service
  </Text>
  {' '}and{' '}
  <Text
    style={styles.link}
    onPress={() => router.push('/(auth)/privacy')}
  >
    Privacy policy
  </Text>.
</Text>

        {/* Footer */}
        <TouchableOpacity
          style={styles.footer}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.footerText}>Already have an account? </Text>
          <Text style={styles.footerLink}>Log in</Text>
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

  // TOP BAR
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28 * S,
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

  // HEADING
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
    marginBottom: 20 * S,
    lineHeight: 22,
  },

  // AUN BADGE
  aunBadge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8 * S,
    backgroundColor: 'rgba(104,236,203,0.1)',
    borderWidth: 0.5,
    borderColor: '#68ECCB',
    borderRadius: 8,
    padding: 10 * S,
    marginBottom: 20 * S,
  },
  aunBadgeText: {
    flex: 1,
    fontSize: 13 * S,
    color: '#68ECCB',
    lineHeight: 18,
  },

  // FIELD
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
  emailHint: {
    fontSize: 11 * S,
    marginTop: 5 * S,
  },

  // ROLE SELECTOR
  roleRow: {
    flexDirection: 'row',
    gap: 10 * S,
    marginBottom: 4 * S,
  },
  roleCard: {
    flex: 1,
    backgroundColor: 'rgba(217,217,217,0.1)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 14 * S,
    alignItems: 'center',
    gap: 7 * S,
  },
  roleCardActive: {
    borderColor: '#68ECCB',
    backgroundColor: 'rgba(104,236,203,0.08)',
  },
  roleText: {
    fontSize: 13 * S,
    fontWeight: '500',
    color: '#A0A0A0',
    textAlign: 'center',
  },
  roleTextActive: { color: '#68ECCB' },

  // DIVIDER
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10 * S,
    marginVertical: 18 * S,
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

  // GOOGLE
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

  // SUBMIT
  submitBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 18 * S,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14 * S,
  },
  submitText: {
    fontSize: 20 * S,
    fontWeight: '800',
    color: '#01193D',
    letterSpacing: 0.5,
  },

  // TERMS
  terms: {
    fontSize: 12 * S,
    color: '#A0A0A0',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20 * S,
  },
  link: { color: '#68ECCB', fontWeight: '500' },

  // FOOTER
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: { fontSize: 14 * S, color: '#A0A0A0' },
  footerLink: { fontSize: 14 * S, color: '#68ECCB', fontWeight: '600' },
});
