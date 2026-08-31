import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { applyVendorAvailability } from '../../lib/vendor-availability';
import { FavouriteButton } from '../../components/FavouriteButton';

const COLORS = { navy: '#01193D', cream: '#F8F3ED', mint: '#68ECCB', green: '#1D9E75', muted: '#8B96A8' } as const;
type ServiceRow = { id: string; vendor_id: string; name: string; starting_price: number | null; image_url: string | null; is_available: boolean };
type ServiceStore = { id: string; name: string; category: string; description: string | null; bannerUrl: string | null; fallbackImage: string | null; isOpen: boolean; serviceCount: number; fromPrice: number };
const money = (value: number) => `₦ ${Number(value || 0).toLocaleString('en-NG')}`;

export default function ServicesPage() {
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const width = Math.min(viewportWidth, 430);
  const [stores, setStores] = useState<ServiceStore[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const cardWidth = (width - 42) / 2;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const { data: vendorRows } = await supabase.from('vendors').select('id, name, category, description, banner_url, is_approved, is_open, store_type').eq('is_approved', true).eq('store_type', 'service').order('name').limit(100);
      const resolved = await applyVendorAvailability((vendorRows ?? []) as { id: string; name: string; is_open: boolean | null }[]);
      const vendorIds = resolved.map((vendor) => vendor.id);
      const { data: serviceRows } = vendorIds.length ? await supabase.from('services').select('id, vendor_id, name, starting_price, image_url, is_available').in('vendor_id', vendorIds).eq('is_available', true).order('sort_order').order('name') : { data: [] };
      if (!mounted) return;
      const byVendor = new Map<string, ServiceRow[]>();
      ((serviceRows ?? []) as ServiceRow[]).forEach((service) => byVendor.set(service.vendor_id, [...(byVendor.get(service.vendor_id) ?? []), service]));
      setStores(resolved.map((vendor: any) => {
        const services = byVendor.get(vendor.id) ?? [];
        return { id: vendor.id, name: vendor.name, category: vendor.category || 'Service provider', description: vendor.description ?? null, bannerUrl: vendor.banner_url ?? null, fallbackImage: services[0]?.image_url ?? null, isOpen: vendor.is_open !== false, serviceCount: services.length, fromPrice: Math.min(...services.map((service) => Number(service.starting_price ?? 0))) };
      }).filter((store) => store.serviceCount > 0));
      setLoading(false);
    };
    void load();
    const timer = setInterval(() => { void load(); }, 60_000);
    return () => { mounted = false; clearInterval(timer); };
  }, []);

  const visibleStores = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? stores.filter((store) => `${store.name} ${store.category} ${store.description ?? ''}`.toLowerCase().includes(term)) : stores;
  }, [query, stores]);

  return <View style={styles.screen}>
    <StatusBar style="light" />
    <FlatList data={visibleStores} keyExtractor={(item) => item.id} numColumns={2} columnWrapperStyle={visibleStores.length ? styles.row : undefined} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}
      ListHeaderComponent={<View style={styles.header}><View style={styles.headingRow}><Text style={styles.heading}>Service bookings</Text><View style={styles.headerActions}><TouchableOpacity style={styles.action} onPress={() => router.push('/(buyer)/notifications')}><Ionicons name="notifications-outline" size={23} color={COLORS.cream} /><View style={styles.dot} /></TouchableOpacity><TouchableOpacity style={styles.action} onPress={() => router.push('/(buyer)/cart')}><Ionicons name="cart-outline" size={23} color={COLORS.cream} /></TouchableOpacity></View></View><Text style={styles.subheading}>Choose a provider, then select the exact service and any extras you want.</Text><View style={styles.search}><Ionicons name="search-outline" size={22} color={COLORS.cream} /><TextInput value={query} onChangeText={setQuery} placeholder="Search providers..." placeholderTextColor={COLORS.muted} style={styles.searchInput} />{query ? <TouchableOpacity onPress={() => setQuery('')}><Ionicons name="close-circle" size={18} color={COLORS.cream} /></TouchableOpacity> : null}</View></View>}
      renderItem={({ item }) => <TouchableOpacity activeOpacity={0.88} style={[styles.card, { width: cardWidth }]} onPress={() => router.push({ pathname: '/(buyer)/services/[serviceId]', params: { serviceId: item.id } })}><View style={styles.photoWrap}>{item.bannerUrl || item.fallbackImage ? <Image source={{ uri: item.bannerUrl || item.fallbackImage! }} style={styles.photo} /> : <View style={styles.placeholder}><Ionicons name="sparkles-outline" size={42} color={COLORS.muted} /></View>}<View style={[styles.availability, !item.isOpen && styles.unavailable]}><Text style={styles.availabilityText}>{item.isOpen ? 'OPEN FOR BOOKINGS' : 'CURRENTLY CLOSED'}</Text></View><FavouriteButton entityType="vendor" entityId={item.id} style={styles.heart} /></View><View style={styles.cardInfo}><Text numberOfLines={1} style={styles.name}>{item.name}</Text><Text numberOfLines={1} style={styles.category}>{item.category}</Text><Text numberOfLines={2} style={styles.description}>{item.description || `${item.serviceCount} service ${item.serviceCount === 1 ? 'option' : 'options'} available`}</Text><View style={styles.priceRow}><Text style={styles.price}>From {money(item.fromPrice)}</Text><View style={styles.bookCue}><Text style={styles.bookCueText}>VIEW SERVICES</Text><Ionicons name="arrow-forward" size={16} color={COLORS.mint} /></View></View></View></TouchableOpacity>}
      ListEmptyComponent={loading ? <ActivityIndicator style={styles.loading} size="large" color={COLORS.mint} /> : <View style={styles.empty}><Ionicons name="sparkles-outline" size={38} color={COLORS.muted} /><Text style={styles.emptyTitle}>No service stores found</Text><Text style={styles.emptyText}>{query ? 'Try a different search.' : 'Approved providers will appear here once they publish their first service.'}</Text></View>} />
    <View style={styles.footer}>{[['home-outline', 'Home'], ['restaurant-outline', 'Cafeteria'], ['sparkles-outline', 'Services'], ['person-outline', 'Profile']].map(([icon, label]) => { const active = label === 'Services'; return <TouchableOpacity key={label} style={styles.footerItem} onPress={() => label === 'Home' ? router.replace('/(buyer)') : label === 'Cafeteria' ? router.push('/(buyer)/cafeteria') : label === 'Profile' ? router.push('/(buyer)/profile') : undefined}><Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={29} color={active ? COLORS.mint : COLORS.cream} /><Text style={[styles.footerText, active && styles.footerTextActive]}>{label}</Text></TouchableOpacity>; })}</View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, list: { paddingBottom: 122 }, header: { backgroundColor: COLORS.navy, paddingTop: 64, paddingHorizontal: 20, paddingBottom: 18 }, headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, heading: { color: COLORS.cream, fontSize: 31, fontWeight: '700', flex: 1, marginRight: 12 }, subheading: { color: '#B7C1D1', fontSize: 14, lineHeight: 20, marginTop: 8 }, headerActions: { flexDirection: 'row', gap: 7 }, action: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(184,198,219,0.2)', alignItems: 'center', justifyContent: 'center' }, dot: { position: 'absolute', top: 3, right: 3, width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.mint }, search: { height: 47, marginTop: 20, paddingHorizontal: 13, borderRadius: 10, backgroundColor: 'rgba(248,243,237,0.16)', borderWidth: 1, borderColor: 'rgba(248,243,237,0.32)', flexDirection: 'row', alignItems: 'center', gap: 9 }, searchInput: { flex: 1, color: COLORS.cream, fontSize: 15 }, row: { justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 }, card: { minHeight: 338, backgroundColor: COLORS.navy, overflow: 'hidden', borderRadius: 24 }, photoWrap: { height: 158, backgroundColor: '#FFFFFF', position: 'relative' }, photo: { height: '100%', width: '100%', resizeMode: 'cover' }, placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F6F8' }, availability: { position: 'absolute', top: 13, left: 12, minHeight: 29, paddingHorizontal: 9, borderRadius: 8, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center' }, unavailable: { backgroundColor: '#7A8698' }, availabilityText: { color: COLORS.cream, fontSize: 10, fontWeight: '800' }, heart: { position: 'absolute', top: 10, right: 10, width: 38, height: 38, borderRadius: 19 }, cardInfo: { flex: 1, padding: 13, justifyContent: 'space-between' }, name: { color: COLORS.cream, fontSize: 17, fontWeight: '700' }, category: { color: COLORS.mint, fontSize: 13, fontWeight: '700', marginTop: 3 }, description: { color: '#B7BEC9', fontSize: 12, lineHeight: 17, marginTop: 7 }, priceRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 5, marginTop: 10 }, price: { color: COLORS.cream, fontSize: 14, fontWeight: '700' }, bookCue: { flexDirection: 'row', alignItems: 'center', gap: 2, maxWidth: 84 }, bookCueText: { color: COLORS.mint, fontSize: 9, fontWeight: '800' }, loading: { marginTop: 60 }, empty: { alignItems: 'center', paddingHorizontal: 35, marginTop: 75 }, emptyTitle: { color: COLORS.navy, fontSize: 19, fontWeight: '700', marginTop: 12 }, emptyText: { color: COLORS.muted, fontSize: 15, textAlign: 'center', marginTop: 7, lineHeight: 21 }, footer: { position: 'absolute', bottom: 13, left: 0, right: 0, height: 90, borderRadius: 45, backgroundColor: COLORS.navy, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 15 }, footerItem: { width: 75, alignItems: 'center', gap: 3 }, footerText: { color: COLORS.cream, fontSize: 12, fontWeight: '600' }, footerTextActive: { color: COLORS.mint },
});
