import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';

type Transaction = { id: string; amount: number; kind: string; description: string; created_at: string; expires_at: string | null };
const money = (amount: number) => `₦${Number(amount).toLocaleString('en-NG')}`;
const label = (kind: string) => ({ refund_credit: 'Refund credit', goodwill_credit: 'AOM goodwill', promotion_credit: 'AOM promotion', order_payment: 'Used on an order', reversal: 'Credit reversal', expiry: 'Credit expired' }[kind] ?? 'AOM Credit');

export default function WalletPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { router.replace('/(auth)/login'); return; }
    const [{ data: account }, { data: history }] = await Promise.all([
      supabase.from('aom_wallet_accounts').select('balance').eq('user_id', auth.user.id).maybeSingle(),
      supabase.from('aom_wallet_transactions').select('id, amount, kind, description, created_at, expires_at').eq('user_id', auth.user.id).order('created_at', { ascending: false }).limit(50),
    ]);
    setBalance(Number(account?.balance ?? 0));
    setTransactions((history ?? []) as Transaction[]);
    setLoading(false);
  }, [router]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return <View style={styles.screen}><StatusBar style="light" /><View style={styles.header}><TouchableOpacity style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/(buyer)/profile')}><Ionicons name="arrow-back" size={23} color="#F8F3ED" /></TouchableOpacity><Text style={styles.title}>AOM Credit</Text><TouchableOpacity onPress={() => void load()}><Ionicons name="refresh" size={21} color="#68ECCB" /></TouchableOpacity></View><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.balanceCard}><View style={styles.balanceIcon}><Ionicons name="wallet" size={28} color="#01193D" /></View><Text style={styles.balanceLabel}>AVAILABLE AOM CREDIT</Text>{loading ? <ActivityIndicator color="#68ECCB" /> : <Text style={styles.balance}>{money(balance)}</Text>}<Text style={styles.balanceNote}>Use credit for a future AOM purchase when it fully covers your order.</Text></View>
    <View style={styles.info}><Ionicons name="information-circle-outline" size={20} color="#176E73" /><Text style={styles.infoText}>AOM Credit is store credit only. It cannot be withdrawn, transferred, or exchanged for cash.</Text></View>
    <Text style={styles.sectionTitle}>Credit history</Text>
    {!loading && !transactions.length ? <View style={styles.empty}><Ionicons name="receipt-outline" size={36} color="#176E73" /><Text style={styles.emptyTitle}>No AOM Credit yet</Text><Text style={styles.emptyText}>Refunds, promotions, and goodwill credits will appear here.</Text></View> : transactions.map((transaction) => <View key={transaction.id} style={styles.row}><View style={[styles.rowIcon, transaction.amount > 0 ? styles.rowCredit : styles.rowDebit]}><Ionicons name={transaction.amount > 0 ? 'add' : 'remove'} size={22} color={transaction.amount > 0 ? '#006D50' : '#A34444'} /></View><View style={styles.rowCopy}><Text style={styles.rowTitle}>{label(transaction.kind)}</Text><Text style={styles.rowDescription}>{transaction.description}</Text><Text style={styles.rowDate}>{new Date(transaction.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}{transaction.expires_at ? ` · Expires ${new Date(transaction.expires_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}` : ''}</Text></View><Text style={[styles.amount, transaction.amount > 0 ? styles.amountCredit : styles.amountDebit]}>{transaction.amount > 0 ? '+' : '−'}{money(Math.abs(Number(transaction.amount)))}</Text></View>)}
  </ScrollView></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, header: { height: 105, paddingTop: 43, paddingHorizontal: 22, backgroundColor: '#01193D', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, back: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#F8F3ED', alignItems: 'center', justifyContent: 'center' }, title: { color: '#F8F3ED', fontSize: 23, fontWeight: '800' }, content: { padding: 20, paddingBottom: 42 }, balanceCard: { backgroundColor: '#01193D', borderRadius: 20, padding: 22, minHeight: 205 }, balanceIcon: { width: 50, height: 50, borderRadius: 15, backgroundColor: '#68ECCB', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }, balanceLabel: { color: '#A9BCD6', fontSize: 12, fontWeight: '800', letterSpacing: .5 }, balance: { color: '#FFFFFF', fontSize: 38, fontWeight: '900', marginTop: 6 }, balanceNote: { color: '#D5E2EF', fontSize: 14, lineHeight: 20, marginTop: 10, maxWidth: 290 }, info: { marginTop: 16, padding: 14, gap: 10, flexDirection: 'row', borderRadius: 13, backgroundColor: '#E1F5EE' }, infoText: { flex: 1, color: '#176E73', fontSize: 13, lineHeight: 19, fontWeight: '600' }, sectionTitle: { color: '#01193D', fontSize: 21, fontWeight: '800', marginTop: 26, marginBottom: 12 }, empty: { borderRadius: 16, padding: 28, backgroundColor: '#F3F6FA', alignItems: 'center' }, emptyTitle: { color: '#01193D', fontSize: 17, fontWeight: '800', marginTop: 10 }, emptyText: { color: '#6D7C8D', fontSize: 14, textAlign: 'center', lineHeight: 20, marginTop: 5 }, row: { minHeight: 87, borderBottomWidth: 1, borderColor: '#E2E8EF', flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 13 }, rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, rowCredit: { backgroundColor: '#DDF5EC' }, rowDebit: { backgroundColor: '#FDE7E6' }, rowCopy: { flex: 1 }, rowTitle: { color: '#01193D', fontSize: 15, fontWeight: '800' }, rowDescription: { color: '#647181', fontSize: 12, marginTop: 2 }, rowDate: { color: '#8A96A3', fontSize: 11, marginTop: 4 }, amount: { fontSize: 14, fontWeight: '900' }, amountCredit: { color: '#006D50' }, amountDebit: { color: '#A34444' },
});
