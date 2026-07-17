import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, StyleSheet as NativeStyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { toggleFavourite, type FavouriteType } from '../../lib/favourites';
import { useCartStore } from '../../store/cartstore';

const COLORS = { navy: '#01193D', mint: '#68ECCB', cream: '#F8F3ED', white: '#FFFFFF', muted: '#8A93A1', soft: '#E7ECF3' } as const;
const StyleSheet = Object.assign(Object.create(NativeStyleSheet), { absoluteFillObject: NativeStyleSheet.absoluteFill }) as typeof NativeStyleSheet & { absoluteFillObject: typeof NativeStyleSheet.absoluteFill };
const FALLBACK_IMAGE = require('../../assets/images/home/all-products.png');
type Tab = 'items' | 'vendors';
type FavouriteRow = { id: string; entity_type: FavouriteType; entity_id: string; created_at: string };
type SavedItem = { id: string; entityType: FavouriteType; name: string; price: number; imageUrl: string | null; vendor: string; category: string | null; vendorId?: string | null; marketplaceCategory?: string | null };
type SavedVendor = { id: string; name: string; category: string | null; imageUrl: string | null; location: string | null; isOpen: boolean | null };

const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG')}`;

export default function FavouritesPage() {
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  const [tab, setTab] = useState<Tab>('items');
  const [items, setItems] = useState<SavedItem[]>([]);
  const [vendors, setVendors] = useState<SavedVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setLoading(false); return; }
    const { data: favouriteRows, error } = await supabase.from('favourites').select('id, entity_type, entity_id, created_at').eq('user_id', auth.user.id).order('created_at', { ascending: false });
    if (error) { setNotice('Your saved favourites will appear here once favourites are set up.'); setLoading(false); return; }
    const rows = (favouriteRows ?? []) as FavouriteRow[];
    const productIds = rows.filter((row) => row.entity_type === 'product').map((row) => row.entity_id);
    const cafeteriaIds = rows.filter((row) => row.entity_type === 'cafeteria_product').map((row) => row.entity_id);
    const vendorIds = rows.filter((row) => row.entity_type === 'vendor').map((row) => row.entity_id);
    const [{ data: products }, { data: cafeteriaProducts }, { data: vendorRows }] = await Promise.all([
      productIds.length ? supabase.from('products').select('id, vendor_id, name, price, image_url, category, marketplace_category, vendors(name)').in('id', productIds) : Promise.resolve({ data: [] }),
      cafeteriaIds.length ? supabase.from('cafeteria_products').select('id, name, price, image_url, category').in('id', cafeteriaIds) : Promise.resolve({ data: [] }),
      vendorIds.length ? supabase.from('vendors').select('id, name, category, banner_url, location, is_open').in('id', vendorIds) : Promise.resolve({ data: [] }),
    ]);
    const productMap = new Map<string, SavedItem>((products ?? []).map((item: any) => [item.id, { id: item.id, entityType: 'product' as const, name: item.name, price: item.price, imageUrl: item.image_url, vendor: item.vendors?.name ?? 'Marketplace', category: item.category, vendorId: item.vendor_id, marketplaceCategory: item.marketplace_category }]));
    const cafeteriaMap = new Map<string, SavedItem>((cafeteriaProducts ?? []).map((item: any) => [item.id, { id: item.id, entityType: 'cafeteria_product' as const, name: item.name, price: item.price, imageUrl: item.image_url, vendor: 'Cafeteria', category: item.category }]));
    setItems(rows.flatMap((row) => row.entity_type === 'product' ? [productMap.get(row.entity_id)] : row.entity_type === 'cafeteria_product' ? [cafeteriaMap.get(row.entity_id)] : []).filter(Boolean) as SavedItem[]);
    const vendorMap = new Map((vendorRows ?? []).map((item: any) => [item.id, { id: item.id, name: item.name, category: item.category, imageUrl: item.banner_url, location: item.location, isOpen: item.is_open }]));
    setVendors(rows.filter((row) => row.entity_type === 'vendor').flatMap((row) => [vendorMap.get(row.entity_id)]).filter(Boolean) as SavedVendor[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);
  const remove = async (type: FavouriteType, id: string) => { try { await toggleFavourite(type, id); void load(); } catch { Alert.alert('Could not update favourite', 'Please try again in a moment.'); } };
  const reorder = (item: SavedItem) => { addItem({ productId: item.id, name: item.name, category: item.vendor, price: item.price, imageUrl: item.imageUrl }); Alert.alert('Added to cart', `${item.name} is ready in your cart.`); };
  const openItem = (item: SavedItem) => item.entityType === 'cafeteria_product'
    ? router.push({ pathname: '/(buyer)/cafeteria/[productId]', params: { productId: item.id } })
    : item.marketplaceCategory && item.vendorId
      ? router.push({ pathname: '/(buyer)/marketplace/[vendorId]/[productId]', params: { vendorId: item.vendorId, productId: item.id } })
      : router.push({ pathname: '/(buyer)/supermarket/[category]/[productId]', params: { category: (item.category ?? 'all-products').toLowerCase().replace(/\s+/g, '-'), productId: item.id } });

  return <View style={styles.screen}>
    <StatusBar style="light" />
    <View style={styles.header}><TouchableOpacity style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/(buyer)/profile')}><Ionicons name="arrow-back" size={27} color={COLORS.cream} /></TouchableOpacity><Text style={styles.heading}>Your favourites</Text></View>
    <View style={styles.tabs}><TouchableOpacity style={styles.tab} onPress={() => setTab('items')}><Text style={[styles.tabText, tab === 'items' && styles.tabTextActive]}>Items</Text>{tab === 'items' && <View style={styles.activeLine} />}</TouchableOpacity><TouchableOpacity style={styles.tab} onPress={() => setTab('vendors')}><Text style={[styles.tabText, tab === 'vendors' && styles.tabTextActive]}>Vendors</Text>{tab === 'vendors' && <View style={styles.activeLine} />}</TouchableOpacity></View>
    {loading ? <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.mint} /></View> : tab === 'items' ? <FlatList data={items} keyExtractor={(item) => `${item.entityType}-${item.id}`} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false} ListHeaderComponent={<Text style={styles.sectionTitle}>SAVED ITEMS</Text>} renderItem={({ item }) => <TouchableOpacity activeOpacity={0.92} style={styles.itemCard} onPress={() => openItem(item)}><Image source={item.imageUrl ? { uri: item.imageUrl } : FALLBACK_IMAGE} style={styles.itemImage} /><View style={styles.itemCopy}><Text numberOfLines={1} style={styles.itemName}>{item.name}</Text><Text numberOfLines={1} style={styles.itemVendor}>{item.vendor}</Text><Text style={styles.itemPrice}>{money(item.price)}</Text></View><View style={styles.cardActions}><TouchableOpacity style={styles.heartButton} onPress={() => remove(item.entityType, item.id)}><Ionicons name="heart" size={19} color={COLORS.mint} /></TouchableOpacity><TouchableOpacity style={styles.reorder} onPress={() => reorder(item)}><Ionicons name="repeat" size={20} color={COLORS.mint} /></TouchableOpacity></View></TouchableOpacity>} ListEmptyComponent={<Empty text={notice || 'Tap the heart on an item to save it here.'} />} /> : <FlatList data={vendors} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false} ListHeaderComponent={<Text style={styles.sectionTitle}>SAVED VENDORS</Text>} renderItem={({ item }) => <TouchableOpacity style={styles.vendorCard} onPress={() => router.push({ pathname: '/(buyer)/marketplace/[vendorId]', params: { vendorId: item.id } })}><Image source={item.imageUrl ? { uri: item.imageUrl } : FALLBACK_IMAGE} style={styles.vendorImage} /><View style={styles.vendorShade} /><View style={styles.vendorCopy}><View style={[styles.openPill, !item.isOpen && styles.closedPill]}><View style={styles.openDot} /><Text style={styles.openText}>{item.isOpen ? 'OPEN' : 'CLOSED'}</Text></View><Text style={styles.vendorName}>{item.name}</Text><Text numberOfLines={1} style={styles.vendorMeta}>{item.category || item.location || 'Marketplace vendor'}</Text></View><TouchableOpacity style={styles.vendorHeart} onPress={() => remove('vendor', item.id)}><Ionicons name="heart" size={21} color={COLORS.mint} /></TouchableOpacity></TouchableOpacity>} ListEmptyComponent={<Empty text={notice || 'Tap the heart on a vendor page to save them here.'} />} />}
    <View style={styles.footer}>{[['home-outline', 'Home'], ['restaurant-outline', 'Cafeteria'], ['sparkles-outline', 'Services'], ['person-outline', 'Profile']].map(([icon, label]) => <TouchableOpacity key={label} style={styles.footerItem} onPress={() => label === 'Home' ? router.replace('/(buyer)') : label === 'Cafeteria' ? router.push('/(buyer)/cafeteria') : label === 'Services' ? router.push('/(buyer)/services') : router.push('/(buyer)/profile')}><Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={28} color={COLORS.cream} /><Text style={styles.footerText}>{label}</Text></TouchableOpacity>)}</View>
  </View>;
}

function Empty({ text }: { text: string }) { return <View style={styles.empty}><Ionicons name="heart-outline" size={38} color={COLORS.muted} /><Text style={styles.emptyTitle}>Nothing saved yet</Text><Text style={styles.emptyText}>{text}</Text></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F3ED' }, header: { height: 190, backgroundColor: COLORS.navy, paddingTop: 70, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 20 }, back: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: COLORS.cream, alignItems: 'center', justifyContent: 'center' }, heading: { color: COLORS.cream, fontSize: 34, fontWeight: '700' }, tabs: { height: 92, backgroundColor: COLORS.white, flexDirection: 'row', paddingHorizontal: 20 }, tab: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' }, tabText: { color: COLORS.navy, fontSize: 22, fontWeight: '500' }, tabTextActive: { fontWeight: '800' }, activeLine: { position: 'absolute', height: 5, borderRadius: 3, backgroundColor: COLORS.navy, bottom: 0, left: 6, right: 6 }, list: { padding: 20, paddingBottom: 122, gap: 14 }, sectionTitle: { color: '#96999D', fontSize: 20, fontWeight: '800', marginBottom: 2 }, itemCard: { minHeight: 122, borderRadius: 20, borderWidth: 1, borderColor: '#A1A4A8', backgroundColor: COLORS.white, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }, itemImage: { width: 86, height: 86, borderRadius: 18, resizeMode: 'cover' }, itemCopy: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' }, itemName: { color: COLORS.navy, fontSize: 19, fontWeight: '800' }, itemVendor: { color: '#999999', fontSize: 14, marginTop: 3 }, itemPrice: { color: '#17656A', fontSize: 17, fontWeight: '800', marginTop: 10 }, cardActions: { alignItems: 'center', gap: 9 }, heartButton: { width: 38, height: 32, alignItems: 'center', justifyContent: 'center' }, reorder: { width: 43, height: 43, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.navy }, vendorCard: { height: 176, borderRadius: 20, overflow: 'hidden', backgroundColor: COLORS.navy, justifyContent: 'flex-end' }, vendorImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', resizeMode: 'cover' }, vendorShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(1,25,61,0.5)' }, vendorCopy: { padding: 17 }, openPill: { alignSelf: 'flex-start', height: 27, paddingHorizontal: 10, borderRadius: 14, backgroundColor: '#1EA776', flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }, closedPill: { backgroundColor: '#7B8490' }, openDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.cream }, openText: { color: COLORS.cream, fontWeight: '800', fontSize: 11 }, vendorName: { color: COLORS.white, fontSize: 21, fontWeight: '800' }, vendorMeta: { color: COLORS.cream, fontSize: 14, marginTop: 4 }, vendorHeart: { position: 'absolute', right: 16, top: 15, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(1,25,61,0.58)', alignItems: 'center', justifyContent: 'center' }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center' }, empty: { alignItems: 'center', marginTop: 70, paddingHorizontal: 44 }, emptyTitle: { color: COLORS.navy, fontSize: 20, fontWeight: '800', marginTop: 12 }, emptyText: { color: COLORS.muted, fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: 7 }, footer: { position: 'absolute', bottom: 13, left: 0, right: 0, height: 90, borderRadius: 45, backgroundColor: COLORS.navy, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 14 }, footerItem: { width: 76, alignItems: 'center', gap: 3 }, footerText: { color: COLORS.cream, fontSize: 12, fontWeight: '600' },
});
