import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

export function CatalogueRating({ source, productId }: { source: 'product' | 'cafeteria'; productId: string }) {
  const [stats, setStats] = useState({ order_count: 0, average_rating: 0, rating_count: 0 });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const load = async () => { const { data } = await supabase.rpc(source === 'cafeteria' ? 'cafeteria_catalogue_stats' : 'product_catalogue_stats', { p_product_id: productId }); const row = Array.isArray(data) ? data[0] : data; if (row) setStats({ order_count: Number(row.order_count ?? 0), average_rating: Number(row.average_rating ?? 0), rating_count: Number(row.rating_count ?? 0) }); };
  useEffect(() => { void load(); const channel = supabase.channel(`catalogue-${source}-${productId}`).on('postgres_changes', { event: '*', schema: 'public', table: source === 'cafeteria' ? 'cafeteria_order_items' : 'order_items', filter: `product_id=eq.${productId}` }, load).on('postgres_changes', { event: '*', schema: 'public', table: 'product_ratings' }, load).subscribe(); return () => { void supabase.removeChannel(channel); }; }, [productId, source]);
  const rate = async (rating: number) => { setSaving(true); setNotice(''); const { data, error } = await supabase.functions.invoke('catalogue-feedback', { body: { action: 'rate', source, product_id: productId, rating } }); setSaving(false); if (error || data?.error) setNotice(data?.error ?? 'Could not save your rating.'); else { setNotice('Thanks for your rating!'); await load(); } };
  return <View style={styles.wrap}><View style={styles.summary}><Ionicons name="star" size={17} color="#D7B300" /><Text style={styles.value}>{stats.rating_count ? stats.average_rating.toFixed(1) : 'New'}</Text><Text style={styles.meta}>({stats.rating_count ? `${stats.rating_count} rating${stats.rating_count === 1 ? '' : 's'}` : 'No ratings yet'} · {stats.order_count} {stats.order_count === 1 ? 'order' : 'orders'})</Text></View><View style={styles.rate}>{[1, 2, 3, 4, 5].map((star) => <TouchableOpacity disabled={saving} key={star} onPress={() => void rate(star)}><Ionicons name="star-outline" size={20} color="#D7B300" /></TouchableOpacity>)}{saving ? <ActivityIndicator size="small" color="#176E73" /> : null}</View>{notice ? <Text style={styles.notice}>{notice}</Text> : null}</View>;
}
const styles = StyleSheet.create({ wrap: { marginTop: 6 }, summary: { flexDirection: 'row', alignItems: 'center', gap: 5 }, value: { color: '#01193D', fontSize: 14, fontWeight: '800' }, meta: { color: '#7E7E7E', fontSize: 12 }, rate: { flexDirection: 'row', gap: 4, marginTop: 9, alignItems: 'center' }, notice: { color: '#176E73', fontSize: 11, fontWeight: '700', marginTop: 5 } });
