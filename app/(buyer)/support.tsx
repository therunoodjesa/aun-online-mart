import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';

type TicketStatus = 'open' | 'in_progress' | 'resolved';
type Ticket = { id: string; category: string; subject: string; message: string; status: TicketStatus; admin_reply: string | null; replied_at: string | null; created_at: string };
const topics = ['order', 'payment', 'delivery', 'account', 'vendor', 'general'];
const topicLabel = (value: string) => value === 'general' ? 'Other' : value[0].toUpperCase() + value.slice(1);

export default function SupportPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'new' | 'tickets'>('new');
  const [category, setCategory] = useState('order');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState('');

  const invoke = async (body: object) => {
    const { data, error } = await supabase.functions.invoke('support-tickets', { body });
    if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Support is unavailable right now.');
    return data;
  };
  const loadTickets = useCallback(async () => {
    setLoading(true);
    try { const data = await invoke({ action: 'list' }); setTickets((data.tickets ?? []) as Ticket[]); }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Could not load your support requests.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void loadTickets(); }, [loadTickets]));

  const submit = async () => {
    if (subject.trim().length < 3 || message.trim().length < 5) { setFeedback('Add a short subject and a little more detail so the AOM team can help.'); return; }
    setSending(true); setFeedback('');
    try {
      await invoke({ action: 'create', category, subject: subject.trim(), message: message.trim() });
      setSubject(''); setMessage(''); setTab('tickets'); setFeedback('Your support request was sent. We will reply here and notify you.');
      await loadTickets();
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Your request could not be sent. Please try again.'); }
    finally { setSending(false); }
  };

  return <View style={styles.screen}><StatusBar style="light" /><View style={styles.header}><TouchableOpacity style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/(buyer)/profile')}><Ionicons name="arrow-back-outline" size={23} color="#F8F3ED" /></TouchableOpacity><Text style={styles.title}>Support</Text><Text style={styles.subtitle}>Send a request and keep every reply in one place.</Text></View><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.tabs}><TouchableOpacity onPress={() => setTab('new')} style={[styles.tab, tab === 'new' && styles.tabActive]}><Text style={[styles.tabText, tab === 'new' && styles.tabTextActive]}>New request</Text></TouchableOpacity><TouchableOpacity onPress={() => { setTab('tickets'); void loadTickets(); }} style={[styles.tab, tab === 'tickets' && styles.tabActive]}><Text style={[styles.tabText, tab === 'tickets' && styles.tabTextActive]}>My tickets {tickets.length ? `(${tickets.length})` : ''}</Text></TouchableOpacity></View>
    {feedback ? <View style={styles.feedback}><Ionicons name="information-circle-outline" size={18} color="#176E73" /><Text style={styles.feedbackText}>{feedback}</Text></View> : null}
    {tab === 'new' ? <View style={styles.card}><Text style={styles.cardTitle}>How can we help?</Text><Text style={styles.copy}>Do not share card details or passwords. For an order, include its AOM number if you have it.</Text><Text style={styles.label}>TOPIC</Text><View style={styles.topics}>{topics.map((topic) => <TouchableOpacity key={topic} onPress={() => setCategory(topic)} style={[styles.topic, category === topic && styles.topicActive]}><Text style={[styles.topicText, category === topic && styles.topicTextActive]}>{topicLabel(topic)}</Text></TouchableOpacity>)}</View><TextInput value={subject} onChangeText={setSubject} placeholder="Short subject, e.g. Order AOM-1042" placeholderTextColor="#8490A0" style={styles.input} maxLength={120} /><TextInput value={message} onChangeText={setMessage} placeholder="Tell us what happened and what you need help with." placeholderTextColor="#8490A0" style={[styles.input, styles.message]} multiline textAlignVertical="top" maxLength={1200} /><Text style={styles.count}>{message.length}/1200</Text><TouchableOpacity disabled={sending} onPress={() => void submit()} style={[styles.submit, sending && { opacity: 0.6 }]}>{sending ? <ActivityIndicator color="#01193D" /> : <><Ionicons name="send-outline" size={18} color="#01193D" /><Text style={styles.submitText}>SEND TO AOM SUPPORT</Text></>}</TouchableOpacity></View> : <View style={styles.list}>{loading ? <ActivityIndicator color="#176E73" style={{ marginTop: 28 }} /> : null}{!loading && !tickets.length ? <View style={styles.empty}><Ionicons name="chatbubbles-outline" size={34} color="#8793A2" /><Text style={styles.emptyTitle}>No support tickets yet</Text><Text style={styles.copy}>When you need help, send a request here instead of waiting on WhatsApp.</Text></View> : null}{tickets.map((ticket) => <View key={ticket.id} style={styles.ticket}><View style={styles.ticketHead}><View><Text style={styles.ticketSubject}>{ticket.subject}</Text><Text style={styles.ticketMeta}>{topicLabel(ticket.category)} · {new Date(ticket.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</Text></View><View style={[styles.status, ticket.status === 'resolved' && styles.resolved, ticket.status === 'in_progress' && styles.progress]}><Text style={styles.statusText}>{ticket.status === 'in_progress' ? 'IN PROGRESS' : ticket.status.toUpperCase()}</Text></View></View><Text style={styles.ticketMessage}>{ticket.message}</Text>{ticket.admin_reply ? <View style={styles.reply}><Text style={styles.replyLabel}>AOM SUPPORT</Text><Text style={styles.replyText}>{ticket.admin_reply}</Text></View> : <Text style={styles.awaiting}>Awaiting an AOM support reply.</Text>}</View>)}</View>}
  </ScrollView></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F9FB' }, header: { backgroundColor: '#01193D', paddingTop: 54, paddingHorizontal: 24, paddingBottom: 24 }, back: { width: 40, height: 40, borderWidth: 1, borderColor: '#F8F3ED', borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }, title: { color: '#F8F3ED', fontSize: 28, fontWeight: '800' }, subtitle: { color: '#B8C8DB', fontSize: 14, lineHeight: 20, marginTop: 5 }, content: { padding: 20, paddingBottom: 44 }, tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 }, tab: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: '#D5DEE7', borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, tabActive: { backgroundColor: '#01193D', borderColor: '#01193D' }, tabText: { color: '#647181', fontWeight: '800', fontSize: 13 }, tabTextActive: { color: '#FFFFFF' }, card: { borderRadius: 14, borderWidth: 1, borderColor: '#E0E6EC', backgroundColor: '#FFFFFF', padding: 18 }, cardTitle: { color: '#01193D', fontSize: 20, fontWeight: '800' }, copy: { color: '#77828E', fontSize: 13, lineHeight: 19, marginTop: 6 }, label: { color: '#657283', fontSize: 11, letterSpacing: 0.4, fontWeight: '800', marginTop: 18, marginBottom: 8 }, topics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }, topic: { borderWidth: 1, borderColor: '#D2DCE5', borderRadius: 18, paddingHorizontal: 11, paddingVertical: 8 }, topicActive: { borderColor: '#25B68A', backgroundColor: '#E1F5EE' }, topicText: { color: '#526273', fontSize: 12, fontWeight: '700' }, topicTextActive: { color: '#176E73' }, input: { minHeight: 49, borderWidth: 1, borderColor: '#CDD7E1', borderRadius: 9, paddingHorizontal: 13, color: '#01193D', fontSize: 14, marginBottom: 10 }, message: { minHeight: 142, paddingTop: 12 }, count: { alignSelf: 'flex-end', color: '#8490A0', fontSize: 11, marginTop: -5 }, submit: { minHeight: 50, marginTop: 18, borderRadius: 9, backgroundColor: '#68ECCB', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }, submitText: { color: '#01193D', fontSize: 13, fontWeight: '900' }, feedback: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#E1F5EE', borderRadius: 10, padding: 12, marginBottom: 14 }, feedbackText: { flex: 1, color: '#176E73', fontSize: 13, fontWeight: '700', lineHeight: 18 }, list: { gap: 12 }, empty: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E0E6EC', alignItems: 'center', padding: 30, gap: 8 }, emptyTitle: { color: '#01193D', fontWeight: '800', fontSize: 17 }, ticket: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E0E6EC', padding: 16 }, ticketHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, ticketSubject: { flex: 1, color: '#01193D', fontSize: 16, fontWeight: '800' }, ticketMeta: { color: '#7B8794', fontSize: 12, marginTop: 4 }, status: { backgroundColor: '#FFF1D6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, alignSelf: 'flex-start' }, progress: { backgroundColor: '#E8EFF8' }, resolved: { backgroundColor: '#E1F5EE' }, statusText: { color: '#805E15', fontSize: 10, fontWeight: '900' }, ticketMessage: { color: '#526273', fontSize: 13, lineHeight: 19, marginTop: 14 }, reply: { marginTop: 14, padding: 12, backgroundColor: '#EAF6F2', borderRadius: 9 }, replyLabel: { color: '#176E73', fontSize: 10, fontWeight: '900', letterSpacing: 0.4 }, replyText: { color: '#17324A', fontSize: 13, lineHeight: 19, marginTop: 5 }, awaiting: { color: '#7B8794', fontSize: 12, fontStyle: 'italic', marginTop: 14 },
});
