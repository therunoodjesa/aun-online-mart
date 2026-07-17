import { useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Dimensions, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const S = Platform.OS === 'web' ? 1 : width / 430;
const isDesktop = Platform.OS === 'web' && width >= 760;

const SECTIONS = [
  {
    num: '1',
    title: 'What we collect',
    body: 'When you create an account we collect your name, email address, phone number, and — for AUN students — your university email to verify student status.\n\nWhen you place orders we collect delivery addresses, order contents, payment method type, and order history.\n\nWe also collect device type, app version, and usage data to improve the app.',
  },
  {
    num: '2',
    title: 'How we use your data',
    body: 'We use your data to process orders and payments, send order status notifications, improve the app, detect fraud, and provide customer support. We may send promotional messages — you can opt out at any time in your notification settings.',
  },
  {
    num: '3',
    title: 'Who we share it with',
    body: 'We share necessary order details with vendors to fulfil your order. Payment data is handled by Paystack under their privacy policy. Notifications are sent via Expo Push Notifications. We may share aggregated, anonymised data with AUN administration for campus planning.\n\nWe do not share your data with advertisers.',
  },
  {
    num: '4',
    title: 'Data storage and security',
    body: 'Your data is stored on secure cloud infrastructure. We use encryption in transit and at rest. Access is restricted to the AOM team on a need-to-know basis. We retain your account data for as long as your account is active, and for up to 12 months after deletion.',
  },
  {
    num: '5',
    title: 'Cookies and tracking',
    body: 'The AOM mobile app does not use browser cookies. We use anonymous analytics to understand how the app is used. You can opt out of analytics in your profile settings under Privacy.',
  },
  {
    num: '6',
    title: 'Children',
    body: 'AOM is not intended for users under 13. If we become aware that a user under 13 has created an account, we will delete it promptly.',
  },
  {
    num: '7',
    title: 'Changes to this policy',
    body: 'We may update this policy from time to time. We will notify you via the app and email at least 7 days before significant changes take effect. Continued use of AOM after that date means you accept the updated policy.',
  },
];

const TOC = SECTIONS.map(s => s.title);

export default function PrivacyPolicy() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<number[]>([]);

  const scrollToSection = (index: number) => {
    const offset = sectionOffsets.current[index];
    if (offset !== undefined) {
      scrollRef.current?.scrollTo({ y: Math.max(0, offset - 8 * S), animated: true });
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Top bar */}
      <View style={[styles.topBar, isDesktop && styles.topBarDesktop]}>
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

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, isDesktop && styles.scrollDesktop]}
      >
        <View style={[styles.document, isDesktop && styles.documentDesktop]}>
        <View style={[styles.introGrid, isDesktop && styles.introGridDesktop]}>
        <View style={[styles.docHeader, isDesktop && styles.docHeaderDesktop]}>
          <View style={styles.docBadge}>
            <Ionicons name="shield-checkmark-outline" size={14 * S} color="#68ECCB" />
            <Text style={styles.docBadgeText}>Your privacy</Text>
          </View>
          <Text style={[styles.docTitle, isDesktop && styles.docTitleDesktop]}>Privacy policy</Text>
          <Text style={styles.docMeta}>Effective 1 September 2025 · Version 2.0</Text>
        </View>

        {/* Table of contents */}
        <View style={[styles.tocWrap, isDesktop && styles.tocWrapDesktop]}>
          <Text style={styles.tocLabel}>Contents</Text>
          {TOC.map((item, i) => (
            <TouchableOpacity
              key={item}
              style={styles.tocRow}
              onPress={() => scrollToSection(i)}
              accessibilityRole="button"
              accessibilityLabel={`Go to section ${i + 1}: ${item}`}
            >
              <Text style={styles.tocNum}>{i + 1}</Text>
              <Text style={styles.tocText}>{item}</Text>
              <Ionicons name="chevron-forward-outline" size={14 * S} color="#68ECCB" />
            </TouchableOpacity>
          ))}
        </View>
        </View>

        <View style={styles.divider} />

        {/* Sections */}
        {SECTIONS.map((section, i) => (
          <View
            key={section.num}
            onLayout={(event) => { sectionOffsets.current[i] = event.nativeEvent.layout.y; }}
          >
            <View style={styles.sectionHeader}>
              <View style={styles.sectionNum}>
                <Text style={styles.sectionNumText}>{section.num}</Text>
              </View>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
            <Text style={[styles.sectionBody, isDesktop && styles.sectionBodyDesktop]}>{section.body}</Text>
            {i < SECTIONS.length - 1 && <View style={styles.divider} />}
          </View>
        ))}

        {/* Contact */}
        <View style={styles.divider} />
        <View style={styles.contactCard}>
          <Ionicons name="mail-outline" size={20 * S} color="#68ECCB" />
          <View style={styles.contactText}>
            <Text style={styles.contactLabel}>Privacy questions</Text>
            <Text style={styles.contactValue}>aunonlinemart@gmail.com</Text>
          </View>
        </View>

        {/* Version strip */}
        <View style={styles.versionRow}>
          <Text style={styles.versionText}>v2.0 · Effective Sep 2025</Text>
          <TouchableOpacity
            style={styles.agreeBtn}
            onPress={() => router.back()}
          >
            <Ionicons name="checkmark-outline" size={14 * S} color="#01193D" />
            <Text style={styles.agreeBtnText}>I agree</Text>
          </TouchableOpacity>
        </View>

        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#01193D',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 30 * S,
    paddingTop: 52 * S,
    paddingBottom: 16 * S,
  },
  topBarDesktop: { width: '100%', maxWidth: 1080, alignSelf: 'center', paddingHorizontal: 32, paddingTop: 30, paddingBottom: 24 },
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
  scroll: {
    paddingHorizontal: 30 * S,
    paddingBottom: 48 * S,
  },
  scrollDesktop: { paddingHorizontal: 32, alignItems: 'center', paddingBottom: 64 },
  document: { width: '100%', maxWidth: 540 },
  documentDesktop: { maxWidth: 980 },
  introGrid: { width: '100%' },
  introGridDesktop: { flexDirection: 'row', gap: 52, alignItems: 'flex-start', marginBottom: 30 },

  // HEADER
  docHeader: { marginBottom: 24 * S },
  docHeaderDesktop: { flex: 1, marginBottom: 0, paddingTop: 12 },
  docBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6 * S,
    backgroundColor: 'rgba(104,236,203,0.1)',
    borderWidth: 0.5,
    borderColor: 'rgba(104,236,203,0.4)',
    borderRadius: 20,
    paddingHorizontal: 10 * S,
    paddingVertical: 4 * S,
    alignSelf: 'flex-start',
    marginBottom: 12 * S,
  },
  docBadgeText: {
    fontSize: 12 * S,
    fontWeight: '500',
    color: '#68ECCB',
  },
  docTitle: {
    fontSize: 24 * S,
    fontWeight: '600',
    color: '#F8F3ED',
    marginBottom: 4 * S,
  },
  docTitleDesktop: { fontSize: 42, lineHeight: 49, letterSpacing: -1 },
  docMeta: {
    fontSize: 13 * S,
    color: '#A0A0A0',
  },

  // TOC
  tocWrap: {
    backgroundColor: 'rgba(217,217,217,0.08)',
    borderWidth: 0.5,
    borderColor: 'rgba(104,236,203,0.2)',
    borderRadius: 8,
    padding: 16 * S,
    marginBottom: 24 * S,
  },
  tocWrapDesktop: { width: 360, marginBottom: 0, padding: 20 },
  tocLabel: {
    fontSize: 12 * S,
    fontWeight: '600',
    color: '#A0A0A0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12 * S,
  },
  tocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10 * S,
    paddingVertical: 7 * S,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  tocNum: {
    fontSize: 12 * S,
    fontWeight: '600',
    color: '#A0A0A0',
    width: 16 * S,
  },
  tocText: {
    flex: 1,
    fontSize: 13 * S,
    color: '#68ECCB',
    fontWeight: '400',
  },

  // SECTIONS
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10 * S,
    marginBottom: 10 * S,
  },
  sectionNum: {
    width: 24 * S,
    height: 24 * S,
    borderRadius: 6,
    backgroundColor: 'rgba(104,236,203,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2 * S,
    flexShrink: 0,
  },
  sectionNumText: {
    fontSize: 12 * S,
    fontWeight: '600',
    color: '#68ECCB',
  },
  sectionTitle: {
    flex: 1,
    fontSize: 18 * S,
    fontWeight: '600',
    color: '#F8F3ED',
    lineHeight: 24,
  },
  sectionBody: {
    fontSize: 15 * S,
    fontWeight: '400',
    color: '#A0A0A0',
    lineHeight: 22,
    marginBottom: 20 * S,
    paddingLeft: 34 * S,
  },
  sectionBodyDesktop: { maxWidth: 800, fontSize: 16, lineHeight: 25 },
  divider: {
    height: 0.5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginBottom: 20 * S,
  },

  // CONTACT
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12 * S,
    backgroundColor: 'rgba(217,217,217,0.08)',
    borderWidth: 0.5,
    borderColor: 'rgba(104,236,203,0.2)',
    borderRadius: 8,
    padding: 14 * S,
    marginBottom: 20 * S,
  },
  contactText: { flex: 1 },
  contactLabel: {
    fontSize: 12 * S,
    color: '#A0A0A0',
    marginBottom: 3 * S,
  },
  contactValue: {
    fontSize: 14 * S,
    fontWeight: '500',
    color: '#68ECCB',
  },

  // VERSION
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  versionText: {
    fontSize: 12 * S,
    color: '#A0A0A0',
  },
  agreeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5 * S,
    backgroundColor: '#68ECCB',
    borderRadius: 7,
    paddingHorizontal: 12 * S,
    paddingVertical: 7 * S,
  },
  agreeBtnText: {
    fontSize: 12 * S,
    fontWeight: '600',
    color: '#01193D',
  },
});
