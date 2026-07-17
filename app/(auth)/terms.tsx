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
    title: 'Who we are',
    body: 'AUN Online Mart (AOM) is a campus marketplace operated by a student team at American University of Nigeria, Yola. We connect students, residents, and vendors through a single platform for food ordering, grocery delivery, cafeteria meals, and personal services.',
  },
  {
    num: '2',
    title: 'Using AOM',
    body: 'By creating an account you confirm that you are at least 13 years old and that the information you provide is accurate. You are responsible for keeping your login credentials secure.\n\nAOM is available to AUN students, NLS Yola students, and residents of Adamawa State.',
    highlight: 'AUN students who register with an @aun.edu.ng email unlock cafeteria ordering and student meal plan features.',
    highlightIcon: 'school-outline' as const,
  },
  {
    num: '3',
    title: 'Orders and payments',
    body: 'Placing an order is an offer to purchase. The order is confirmed when a vendor accepts it. AOM processes payments via Paystack. Delivery fees of ₦0–₦80 apply per order.',
    highlight: 'Prices on AOM must match in-person prices. Vendors agree to price parity as a condition of listing.',
    highlightIcon: 'shield-checkmark-outline' as const,
  },
  {
    num: '4',
    title: 'Vendor terms',
    body: 'Vendors pay a 10% commission on each completed order. There is no monthly fee. Payouts are processed every Friday via Paystack.',
    warn: 'Inflating prices above in-person rates is a breach of the vendor agreement and may result in immediate removal from AOM.',
    warnIcon: 'alert-circle-outline' as const,
  },
  {
    num: '5',
    title: 'Refunds and cancellations',
    body: 'You may cancel an order before the vendor accepts it. After acceptance, cancellations are subject to vendor approval. Refunds for incorrect or undelivered orders are processed within 3–5 business days.',
  },
  {
    num: '6',
    title: 'Prohibited conduct',
    body: 'You must not place fraudulent orders, create fake accounts, abuse promotional credits, harass vendors or riders, or attempt to circumvent AOM\'s commission by transacting directly with vendors after discovery through the platform.',
  },
  {
    num: '7',
    title: 'Liability',
    body: 'AOM facilitates transactions between buyers and vendors. We are not liable for the quality, safety, or accuracy of vendor products. Our maximum liability for any claim is limited to the value of the order in dispute.',
  },
  {
    num: '8',
    title: 'Contact us',
    body: '',
  },
];

export default function TermsOfService() {
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
            <Ionicons name="document-text-outline" size={14 * S} color="#68ECCB" />
            <Text style={styles.docBadgeText}>AOM legal</Text>
          </View>
          <Text style={[styles.docTitle, isDesktop && styles.docTitleDesktop]}>Terms of service</Text>
          <Text style={styles.docMeta}>Effective 1 September 2025 · Version 2.0</Text>
        </View>

        {/* TOC */}
        <View style={[styles.tocWrap, isDesktop && styles.tocWrapDesktop]}>
          <Text style={styles.tocLabel}>Contents</Text>
          {SECTIONS.map((s, i) => (
            <TouchableOpacity
              key={s.num}
              style={styles.tocRow}
              onPress={() => scrollToSection(i)}
              accessibilityRole="button"
              accessibilityLabel={`Go to section ${i + 1}: ${s.title}`}
            >
              <Text style={styles.tocNum}>{i + 1}</Text>
              <Text style={styles.tocText}>{s.title}</Text>
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

            {section.body ? (
              <Text style={[styles.sectionBody, isDesktop && styles.sectionBodyDesktop]}>{section.body}</Text>
            ) : null}

            {section.highlight && (
              <View style={styles.highlightBox}>
                <Ionicons
                  name={section.highlightIcon!}
                  size={16 * S}
                  color="#68ECCB"
                />
                <Text style={styles.highlightText}>{section.highlight}</Text>
              </View>
            )}

            {section.warn && (
              <View style={styles.warnBox}>
                <Ionicons
                  name={section.warnIcon!}
                  size={16 * S}
                  color="#FAC775"
                />
                <Text style={styles.warnText}>{section.warn}</Text>
              </View>
            )}

            {section.num === '8' && (
              <>
                <View style={styles.contactCard}>
                  <Ionicons name="mail-outline" size={20 * S} color="#68ECCB" />
                  <View style={styles.contactText}>
                    <Text style={styles.contactLabel}>Email</Text>
                    <Text style={styles.contactValue}>aunonlinemart@gmail.com</Text>
                  </View>
                </View>
                <View style={styles.contactCard}>
                  <Ionicons name="logo-whatsapp" size={20 * S} color="#68ECCB" />
                  <View style={styles.contactText}>
                    <Text style={styles.contactLabel}>WhatsApp support</Text>
                    <Text style={styles.contactValue}>Available via Help and support in-app</Text>
                  </View>
                </View>
              </>
            )}

            {i < SECTIONS.length - 1 && <View style={styles.divider} />}
          </View>
        ))}

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
  container: { flex: 1, backgroundColor: '#01193D' },
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
  },
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
    color: '#A0A0A0',
    lineHeight: 22,
    marginBottom: 14 * S,
    paddingLeft: 34 * S,
  },
  sectionBodyDesktop: { maxWidth: 800, fontSize: 16, lineHeight: 25 },
  highlightBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8 * S,
    backgroundColor: 'rgba(104,236,203,0.08)',
    borderWidth: 0.5,
    borderColor: 'rgba(104,236,203,0.3)',
    borderRadius: 8,
    padding: 12 * S,
    marginBottom: 14 * S,
    marginLeft: 34 * S,
  },
  highlightText: {
    flex: 1,
    fontSize: 13 * S,
    color: '#68ECCB',
    lineHeight: 18,
  },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8 * S,
    backgroundColor: 'rgba(250,199,117,0.08)',
    borderWidth: 0.5,
    borderColor: 'rgba(250,199,117,0.3)',
    borderRadius: 8,
    padding: 12 * S,
    marginBottom: 14 * S,
    marginLeft: 34 * S,
  },
  warnText: {
    flex: 1,
    fontSize: 13 * S,
    color: '#FAC775',
    lineHeight: 18,
  },
  divider: {
    height: 0.5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginBottom: 20 * S,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12 * S,
    backgroundColor: 'rgba(217,217,217,0.08)',
    borderWidth: 0.5,
    borderColor: 'rgba(104,236,203,0.2)',
    borderRadius: 8,
    padding: 14 * S,
    marginBottom: 10 * S,
  },
  contactText: { flex: 1 },
  contactLabel: {
    fontSize: 12 * S,
    color: '#A0A0A0',
    marginBottom: 3 * S,
  },
  contactValue: {
    fontSize: 13 * S,
    fontWeight: '500',
    color: '#68ECCB',
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10 * S,
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
