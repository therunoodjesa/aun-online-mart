import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';

const COLORS = { navy: '#01193D', cream: '#F8F3ED', mint: '#68ECCB', green: '#1D9E75', muted: '#8B96A8', pale: '#E7ECF3' } as const;
type ServiceRow = Record<string, unknown>;
type Service = { id: string; name: string; category: string; price: number; imageUrl: string | null; available: boolean; phone: string | null; providerName: string | null };
const money = (value: number) => `₦ ${Number(value || 0).toLocaleString('en-NG')}`;

const normalise = (row: ServiceRow): Service => ({
  id: String(row.id),
  name: String(row.name ?? row.title ?? row.provider_name ?? row.business_name ?? 'Service provider'),
  category: String(row.category ?? row.service_category ?? row.description ?? 'Service'),
  price: Number(row.starting_price ?? row.price ?? row.from_price ?? 0),
  imageUrl: typeof (row.image_url ?? row.cover_image_url ?? row.banner_url) === 'string' ? String(row.image_url ?? row.cover_image_url ?? row.banner_url) : null,
  available: row.is_available !== false && row.status !== 'unavailable' && row.status !== 'inactive',
  phone: typeof (row.phone ?? row.phone_number) === 'string' ? String(row.phone ?? row.phone_number) : null,
  providerName: typeof row.provider_name === 'string' ? row.provider_name : null,
});

export default function ServicesPage() {
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const width = Math.min(viewportWidth, 430);
  const [services, setServices] = useState<Service[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const cardWidth = (width - 42) / 2;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from('services').select('id, vendor_id, name, category, description, starting_price, image_url, is_available').eq('is_available', true).order('sort_order').order('name').limit(100);
      const rows = (data ?? []) as (ServiceRow & { vendor_id?: string | null })[];
      const vendorIds = [...new Set(rows.map((row) => row.vendor_id).filter(Boolean))] as string[];
      const { data: vendors } = vendorIds.length ? await supabase.from('vendors').select('id, name, is_approved, is_open').in('id', vendorIds).eq('is_approved', true) : { data: [] };
      const vendorsById = new Map((vendors ?? []).map((vendor) => [vendor.id, vendor]));
      const liveServices = rows.filter((row) => row.vendor_id ? vendorsById.get(String(row.vendor_id))?.is_open !== false : true).map((row) => ({ ...normalise(row), providerName: row.vendor_id ? vendorsById.get(String(row.vendor_id))?.name ?? null : null }));
      if (mounted) { setServices(liveServices); setLoading(false); }
    };
    void load();
    return () => { mounted = false; };
  }, []);

  const visibleServices = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? services.filter((service) => `${service.name} ${service.category}`.toLowerCase().includes(term)) : services;
  }, [query, services]);

  return <View style={styles.screen}>
    <StatusBar style="light" />
    <FlatList
      data={visibleServices}
      keyExtractor={(item) => item.id}
      numColumns={2}
      columnWrapperStyle={visibleServices.length ? styles.row : undefined}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={<View style={styles.header}>
        <View style={styles.headingRow}>
          <Text style={styles.heading}>Service bookings</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.action} onPress={() => router.push('/(buyer)/notifications')} accessibilityLabel="Open notifications"><Ionicons name="notifications-outline" size={23} color={COLORS.cream} /><View style={styles.dot} /></TouchableOpacity>
            <TouchableOpacity style={styles.action} onPress={() => router.push('/(buyer)/cart')} accessibilityLabel="Open cart"><Ionicons name="cart-outline" size={23} color={COLORS.cream} /></TouchableOpacity>
          </View>
        </View>
        <View style={styles.search}><Ionicons name="search-outline" size={22} color={COLORS.cream} /><TextInput value={query} onChangeText={setQuery} placeholder="Search services and providers..." placeholderTextColor={COLORS.muted} style={styles.searchInput} returnKeyType="search" />{query ? <TouchableOpacity onPress={() => setQuery('')}><Ionicons name="close-circle" size={18} color={COLORS.cream} /></TouchableOpacity> : null}</View>
      </View>}
      renderItem={({ item }) => <TouchableOpacity activeOpacity={0.88} style={[styles.card, { width: cardWidth }]} onPress={() => router.push({ pathname: '/(buyer)/services/[serviceId]', params: { serviceId: item.id } })}>
        <View style={styles.photoWrap}>{item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.photo} /> : <View style={styles.placeholder}><Ionicons name="sparkles-outline" size={42} color={COLORS.muted} /></View>}<View style={[styles.availability, !item.available && styles.unavailable]}><Text style={styles.availabilityText}>{item.available ? 'AVAILABLE' : 'UNAVAILABLE'}</Text></View></View>
        <View style={styles.cardInfo}><Text numberOfLines={1} style={styles.name}>{item.name}</Text><Text numberOfLines={2} style={styles.category}>{item.providerName ? `${item.providerName} · ${item.category}` : item.category}</Text><View style={styles.priceRow}><Text style={styles.price}>From {money(item.price)}</Text><Ionicons name="call" size={23} color={COLORS.cream} /></View></View>
      </TouchableOpacity>}
      ListEmptyComponent={loading ? <ActivityIndicator style={styles.loading} size="large" color={COLORS.mint} /> : <View style={styles.empty}><Ionicons name="sparkles-outline" size={38} color={COLORS.muted} /><Text style={styles.emptyTitle}>No services found</Text><Text style={styles.emptyText}>{query ? 'Try a different search.' : 'Service providers will appear here as soon as they are added.'}</Text></View>}
    />
    <View style={styles.footer}>{[['home-outline', 'Home'], ['restaurant-outline', 'Cafeteria'], ['sparkles-outline', 'Services'], ['person-outline', 'Profile']].map(([icon, label]) => { const active = label === 'Services'; return <TouchableOpacity key={label} style={styles.footerItem} onPress={() => label === 'Home' ? router.replace('/(buyer)') : label === 'Cafeteria' ? router.push('/(buyer)/cafeteria') : label === 'Profile' ? router.push('/(buyer)/profile') : undefined}><Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={29} color={active ? COLORS.mint : COLORS.cream} /><Text style={[styles.footerText, active && styles.footerTextActive]}>{label}</Text></TouchableOpacity>; })}</View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, list: { paddingBottom: 122 }, header: { backgroundColor: COLORS.navy, paddingTop: 64, paddingHorizontal: 20, paddingBottom: 18 }, headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, heading: { color: COLORS.cream, fontSize: 31, fontWeight: '700', flex: 1, marginRight: 12 }, headerActions: { flexDirection: 'row', gap: 7 }, action: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(184,198,219,0.2)', alignItems: 'center', justifyContent: 'center' }, dot: { position: 'absolute', top: 3, right: 3, width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.mint }, search: { height: 47, marginTop: 28, paddingHorizontal: 13, borderRadius: 10, backgroundColor: 'rgba(248,243,237,0.45)', borderWidth: 1, borderColor: 'rgba(1,25,61,0.65)', flexDirection: 'row', alignItems: 'center', gap: 9 }, searchInput: { flex: 1, color: COLORS.cream, fontSize: 15 }, row: { justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12, marginTop: 0 }, card: { height: 310, backgroundColor: COLORS.navy, overflow: 'hidden', borderRadius: 24 }, photoWrap: { height: 165, backgroundColor: '#FFFFFF', position: 'relative' }, photo: { height: '100%', width: '100%', resizeMode: 'cover' }, placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F6F8' }, availability: { position: 'absolute', top: 16, alignSelf: 'center', width: '68%', height: 38, borderRadius: 7, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center' }, unavailable: { backgroundColor: '#7A8698' }, availabilityText: { color: COLORS.cream, fontSize: 14, fontWeight: '800' }, cardInfo: { flex: 1, padding: 14, justifyContent: 'space-between' }, name: { color: COLORS.cream, fontSize: 17, fontWeight: '700' }, category: { color: '#B7BEC9', fontSize: 14, lineHeight: 19, marginTop: 3 }, priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, price: { color: COLORS.cream, fontSize: 16, fontWeight: '700' }, loading: { marginTop: 60 }, empty: { alignItems: 'center', paddingHorizontal: 35, marginTop: 75 }, emptyTitle: { color: COLORS.navy, fontSize: 19, fontWeight: '700', marginTop: 12 }, emptyText: { color: COLORS.muted, fontSize: 15, textAlign: 'center', marginTop: 7, lineHeight: 21 }, footer: { position: 'absolute', bottom: 13, left: 0, right: 0, height: 90, borderRadius: 45, backgroundColor: COLORS.navy, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 15 }, footerItem: { width: 75, alignItems: 'center', gap: 3 }, footerText: { color: COLORS.cream, fontSize: 12, fontWeight: '600' }, footerTextActive: { color: COLORS.mint },
});
