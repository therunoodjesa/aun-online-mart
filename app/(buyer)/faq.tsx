import { useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

type Topic = 'delivery' | 'returns' | 'payment' | 'orders' | 'cafeteria';
type Faq = { id: string; question: string; answer: string; topic: Topic };

const FAQS: Faq[] = [
  { id: 'delivery-time', topic: 'delivery', question: 'How long does delivery take?', answer: 'Marketplace delivery times are set by the vendor and rider. Cafeteria room delivery is usually 15–40 minutes. You can follow each stage from your order updates.' },
  { id: 'track-order', topic: 'orders', question: 'How do I track my order?', answer: 'Open Notifications and select Track order, or use the order confirmation page. Your three latest vendor and rider updates will appear there.' },
  { id: 'cancel', topic: 'orders', question: 'Can I cancel an order?', answer: 'Request a cancellation before preparation begins. Contact support promptly with your order number; prepared or dispatched orders may no longer be cancellable.' },
  { id: 'refund', topic: 'returns', question: 'How do returns and refunds work?', answer: 'For a missing, incorrect, damaged, or poor-quality item, report the issue with your order number and a clear description. Our team will review it with the vendor and guide you through the resolution.' },
  { id: 'payment', topic: 'payment', question: 'What should I do if my card or transfer payment fails?', answer: 'Do not pay twice. Check whether an order was created and whether your bank shows a pending debit. If payment is still not confirmed after a few minutes, contact support with the amount, time, and payment reference.' },
  { id: 'meal-plan', topic: 'cafeteria', question: 'How does payment for cafeteria orders work?', answer: 'Eligible meals can use your active meal-plan credit once per day, up to the approved allowance. Packaging and delivery still apply. Add your student and meal-plan details in Profile before checkout if no plan is available.' },
  { id: 'sold-out', topic: 'cafeteria', question: 'Why is a cafeteria item sold out?', answer: 'Cafeteria staff mark an item sold out when stock runs out. It will return only when staff make it available again.' },
  { id: 'address', topic: 'delivery', question: 'Can I enter a dorm, room number, or custom delivery instructions?', answer: 'Yes. On the delivery page you can select a suggestion or type a dorm, room number, landmark, and any useful directions.' },
  { id: 'pickup', topic: 'orders', question: 'Where do I pick up an order?', answer: 'For pickup, the payment page displays the vendor’s pickup location. Collect after the vendor marks the order ready.' },
];

const HELP = [
  { topic: 'orders' as const, icon: 'cube-outline' as const, title: 'Track my order', subtitle: 'Real-time updates', colour: '#F2EEA9' },
  { topic: 'returns' as const, icon: 'card-outline' as const, title: 'Returns & refunds', subtitle: 'Request a refund', colour: '#B8EEF1' },
  { topic: 'payment' as const, icon: 'card-outline' as const, title: 'Payment issues', subtitle: 'Card and billing issues', colour: '#FFFFFF' },
  { topic: 'report' as const, icon: 'alert-outline' as const, title: 'Report a problem', subtitle: 'Wrong item, quality, etc.', colour: '#F5A0A8' },
];

export default function FaqPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<Topic | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const shown = useMemo(() => FAQS.filter((faq) => (!topic || faq.topic === topic) && (!query.trim() || `${faq.question} ${faq.answer}`.toLowerCase().includes(query.trim().toLowerCase()))), [query, topic]);
  const selectHelp = async (item: typeof HELP[number]) => {
    if (item.topic === 'report') { try { await Linking.openURL('https://wa.me/2349133646024?text=Hello%20AUN%20Online%20Mart%2C%20I%20need%20help%20with%20an%20order.'); } catch {} return; }
    setQuery(''); setTopic(item.topic); setExpanded(FAQS.find((faq) => faq.topic === item.topic)?.id ?? null);
  };
  const viewAll = () => { setQuery(''); setTopic(null); setExpanded(null); };

  return <View style={styles.screen}><StatusBar style="light" /><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><TouchableOpacity style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/(buyer)/profile')}><Ionicons name="arrow-back" size={28} color="#F8F3ED" /></TouchableOpacity><Text style={styles.heading}>FAQs</Text></View>
    <View style={styles.body}><Text style={styles.sectionHeading}>QUICK HELP</Text><View style={styles.quickGrid}>{HELP.map((item) => <TouchableOpacity key={item.title} onPress={() => void selectHelp(item)} style={styles.quickCard}><View style={[styles.quickIcon, { backgroundColor: item.colour }]}><Ionicons name={item.icon} size={29} color="#006F79" /></View><Text style={styles.quickTitle}>{item.title}</Text><Text style={styles.quickSub}>{item.subtitle}</Text><Ionicons name="arrow-forward" size={19} color="#176E73" style={styles.quickArrow} /></TouchableOpacity>)}</View>
      <View style={styles.faqHeading}><Text style={styles.sectionHeading}>FREQUENTLY ASKED</Text><TouchableOpacity onPress={viewAll}><Text style={styles.viewAll}>{topic || query ? 'View all' : 'Browse all'}</Text></TouchableOpacity></View><View style={styles.search}><Ionicons name="search-outline" size={20} color="#7D8794" /><TextInput value={query} onChangeText={(value) => { setQuery(value); setTopic(null); }} placeholder="Search for an answer" placeholderTextColor="#8B919A" style={styles.searchInput} /></View>
      {shown.map((faq) => <TouchableOpacity key={faq.id} style={[styles.faqCard, expanded === faq.id && styles.faqOpen]} onPress={() => setExpanded(expanded === faq.id ? null : faq.id)}><View style={styles.questionRow}><Text style={styles.question}>{faq.question}</Text><Ionicons name={expanded === faq.id ? 'chevron-up-circle' : 'chevron-down-circle'} size={29} color="#01193D" /></View>{expanded === faq.id && <Text style={styles.answer}>{faq.answer}</Text>}</TouchableOpacity>)}
      {shown.length === 0 && <View style={styles.empty}><Ionicons name="help-circle-outline" size={32} color="#176E73" /><Text style={styles.emptyTitle}>No answer found yet</Text><Text style={styles.emptyText}>Try another search, or message support for direct help.</Text><TouchableOpacity onPress={() => void selectHelp(HELP[3])} style={styles.supportButton}><Text style={styles.supportText}>MESSAGE SUPPORT</Text></TouchableOpacity></View>}
      <TouchableOpacity style={styles.bottomSupport} onPress={() => void selectHelp(HELP[3])}><Ionicons name="logo-whatsapp" size={21} color="#006D50" /><Text style={styles.bottomSupportText}>Still need help? Chat with support</Text></TouchableOpacity>
    </View>
  </ScrollView></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, content: { paddingBottom: 42 }, header: { height: 242, backgroundColor: '#01193D', paddingHorizontal: 38, flexDirection: 'row', alignItems: 'center', borderBottomLeftRadius: 42, borderBottomRightRadius: 42 }, back: { width: 58, height: 58, borderRadius: 29, borderWidth: 2.5, borderColor: '#F8F3ED', alignItems: 'center', justifyContent: 'center' }, heading: { flex: 1, color: '#F8F3ED', fontSize: 42, fontWeight: '800', textAlign: 'center', marginRight: 58 }, body: { paddingHorizontal: 28, paddingTop: 38 }, sectionHeading: { color: '#7D7D7D', fontSize: 19, fontWeight: '800' }, quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20, justifyContent: 'space-between' }, quickCard: { width: '48%', minHeight: 178, borderRadius: 28, borderWidth: 1.5, borderColor: '#176E73', backgroundColor: '#E7ECF3', padding: 18, overflow: 'hidden' }, quickIcon: { width: 55, height: 55, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, quickTitle: { color: '#000000', fontSize: 17, lineHeight: 21, fontWeight: '800', marginTop: 17 }, quickSub: { color: '#7D7D7D', fontSize: 14, lineHeight: 19, fontWeight: '600', marginTop: 6 }, quickArrow: { position: 'absolute', right: 16, bottom: 15 }, faqHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 42, marginBottom: 16 }, viewAll: { color: '#01193D', fontSize: 18, fontWeight: '800' }, search: { height: 52, borderRadius: 12, borderWidth: 1, borderColor: '#C7CDD5', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 13 }, searchInput: { flex: 1, color: '#01193D', fontSize: 15, height: '100%' }, faqCard: { borderRadius: 13, borderWidth: 1.2, borderColor: '#B7B7B7', backgroundColor: '#FFFFFF', paddingHorizontal: 18, paddingVertical: 20, marginBottom: 12 }, faqOpen: { borderColor: '#176E73', backgroundColor: '#F4FAF8' }, questionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, question: { flex: 1, color: '#000000', fontSize: 18, lineHeight: 24, fontWeight: '800' }, answer: { color: '#334052', fontSize: 15, lineHeight: 22, marginTop: 14 }, empty: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, backgroundColor: '#F1F5F9', borderRadius: 16 }, emptyTitle: { color: '#01193D', fontSize: 18, fontWeight: '800', marginTop: 8 }, emptyText: { color: '#647084', fontSize: 14, textAlign: 'center', lineHeight: 20, marginTop: 6 }, supportButton: { marginTop: 15, backgroundColor: '#01193D', borderRadius: 9, paddingHorizontal: 17, paddingVertical: 12 }, supportText: { color: '#F8F3ED', fontSize: 13, fontWeight: '800' }, bottomSupport: { marginTop: 26, minHeight: 56, borderRadius: 14, backgroundColor: '#E1F5EE', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }, bottomSupportText: { color: '#005B3B', fontSize: 15, fontWeight: '700' },
});
