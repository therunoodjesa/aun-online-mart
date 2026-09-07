import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, ImageBackground, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { applyVendorAvailability } from '../../../lib/vendor-availability';

const COLORS = { navy: '#01193D', cream: '#F8F3ED', mint: '#68ECCB', green: '#176E73', muted: '#738097', white: '#FFFFFF' } as const;
const FALLBACK_IMAGE = require('../../../assets/images/home/jollof-promo.png');
const SUPERMARKET_VENDOR_CATEGORIES = new Set(['supermarket', 'all products', 'baking stuff', 'beauty & hygiene', 'electronics', 'fragrances', 'groceries']);

type Vendor = {
  id: string;
  name: string;
  category: string | null;
  banner_url: string | null;
  average_prep_time: string | null;
  location: string | null;
  is_open: boolean | null;
  store_type: 'marketplace' | 'supermarket' | 'service' | null;
};

const isMarketplaceVendor = (vendor: Vendor) => vendor.store_type === 'marketplace'
  || (!vendor.store_type && !SUPERMARKET_VENDOR_CATEGORIES.has(vendor.category?.trim().toLowerCase() ?? ''));

export default function MarketplaceVendorsPage() {
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const width = Math.min(viewportWidth, 430);
  const cardWidth = (width - 44) / 2;
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('vendors')
        .select('id, name, category, banner_url, average_prep_time, location, is_open, store_type')
        .eq('is_approved', true)
        .order('name', { ascending: true });
      const resolved = await applyVendorAvailability((data ?? []) as Vendor[]);
      if (!active) return;
      setVendors(resolved.filter(isMarketplaceVendor));
      setLoading(false);
    };
    void load();
    const timer = setInterval(() => { void load(); }, 60_000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  const visibleVendors = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return vendors;
    return vendors.filter((vendor) => `${vendor.name} ${vendor.category ?? ''} ${vendor.location ?? ''}`.toLowerCase().includes(term));
  }, [query, vendors]);

  return <View style={styles.screen}>
    <StatusBar style="light" />
    <FlatList
      data={visibleVendors}
      keyExtractor={(item) => item.id}
      numColumns={2}
      columnWrapperStyle={visibleVendors.length ? styles.row : undefined}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={<View style={styles.header}>
        <View style={styles.headerRow}><TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back"><Ionicons name="arrow-back" size={22} color={COLORS.cream} /></TouchableOpacity><View style={styles.headerCopy}><Text style={styles.heading}>Explore marketplace vendors</Text><Text style={styles.subheading}>Discover every approved store, whether they are open now or opening later.</Text></View></View>
        <View style={styles.search}><Ionicons name="search-outline" size={21} color={COLORS.cream} /><TextInput value={query} onChangeText={setQuery} placeholder="Search stores or categories" placeholderTextColor="#B7C1D1" style={styles.searchInput} autoCapitalize="none" />{query ? <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Clear search"><Ionicons name="close-circle" size={18} color={COLORS.cream} /></TouchableOpacity> : null}</View>
      </View>}
      renderItem={({ item }) => <TouchableOpacity activeOpacity={0.88} style={[styles.card, { width: cardWidth }]} onPress={() => router.push({ pathname: '/(buyer)/marketplace/[vendorId]', params: { vendorId: item.id } })} accessibilityLabel={`Open ${item.name}`}>
        <ImageBackground source={item.banner_url ? { uri: item.banner_url } : FALLBACK_IMAGE} style={styles.image} imageStyle={styles.imageFile}>
          <View style={[styles.state, item.is_open === false && styles.closed]}><View style={styles.stateDot} /><Text style={styles.stateText}>{item.is_open === false ? 'CLOSED' : 'OPEN NOW'}</Text></View>
          <View style={styles.shade} />
        </ImageBackground>
        <View style={styles.copy}><Text numberOfLines={1} style={styles.name}>{item.name}</Text><Text numberOfLines={1} style={styles.category}>{item.category || 'Marketplace'}</Text><View style={styles.meta}><Ionicons name={item.is_open === false ? 'time-outline' : 'bicycle-outline'} size={14} color={COLORS.mint} /><Text numberOfLines={1} style={styles.metaText}>{item.is_open === false ? 'Currently closed' : item.average_prep_time || '30–60 mins'}</Text></View></View>
      </TouchableOpacity>}
      ListEmptyComponent={loading ? <ActivityIndicator style={styles.loading} size="large" color={COLORS.mint} /> : <View style={styles.empty}><Ionicons name="storefront-outline" size={40} color={COLORS.muted} /><Text style={styles.emptyTitle}>No marketplace stores found</Text><Text style={styles.emptyText}>{query ? 'Try a different store name or category.' : 'Approved marketplace vendors will appear here.'}</Text></View>}
    />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  list: { paddingBottom: 36 },
  header: { backgroundColor: COLORS.navy, paddingTop: 58, paddingHorizontal: 20, paddingBottom: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  back: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(248,243,237,0.5)', alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  heading: { color: COLORS.cream, fontSize: 26, lineHeight: 31, fontWeight: '800' },
  subheading: { marginTop: 5, color: '#B7C1D1', fontSize: 13, lineHeight: 18 },
  search: { height: 48, marginTop: 20, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 11, backgroundColor: 'rgba(248,243,237,0.14)', borderWidth: 1, borderColor: 'rgba(248,243,237,0.32)' },
  searchInput: { flex: 1, color: COLORS.cream, fontSize: 15 },
  row: { justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  card: { minHeight: 247, borderRadius: 20, overflow: 'hidden', backgroundColor: COLORS.navy },
  image: { height: 137, justifyContent: 'flex-end' },
  imageFile: { resizeMode: 'cover' },
  shade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(1,25,61,0.16)' },
  state: { position: 'absolute', zIndex: 1, top: 11, left: 10, minHeight: 26, paddingHorizontal: 8, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1D9E75' },
  closed: { backgroundColor: '#627086' },
  stateDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.cream },
  stateText: { color: COLORS.cream, fontSize: 9, fontWeight: '800' },
  copy: { flex: 1, padding: 12, justifyContent: 'space-between' },
  name: { color: COLORS.cream, fontSize: 15, fontWeight: '800' },
  category: { marginTop: 3, color: '#B7C1D1', fontSize: 12 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  metaText: { flex: 1, color: COLORS.mint, fontSize: 11, fontWeight: '700' },
  loading: { marginTop: 64 },
  empty: { alignItems: 'center', paddingHorizontal: 35, marginTop: 75 },
  emptyTitle: { color: COLORS.navy, marginTop: 12, fontSize: 19, fontWeight: '800' },
  emptyText: { color: COLORS.muted, textAlign: 'center', marginTop: 7, fontSize: 14, lineHeight: 20 },
});
