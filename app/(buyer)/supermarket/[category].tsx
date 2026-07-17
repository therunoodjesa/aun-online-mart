import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useCartStore } from '../../../store/cartstore';
import { CartToast } from '../../../components/CartToast';

const COLORS = { navy: '#01193D', mint: '#68ECCB', cream: '#F8F3ED', white: '#FFFFFF', muted: '#A0A0A0' } as const;
const ALL_PRODUCTS_IMAGE = require('../../../assets/images/home/all-products.png');
const BAKING_IMAGE = require('../../../assets/images/home/bakingstuff.png');
const SKINCARE_IMAGE = require('../../../assets/images/home/skincare.png');
const ELECTRONICS_IMAGE = require('../../../assets/images/home/electronics.png');
const FRAGRANCES_IMAGE = require('../../../assets/images/home/category-fragrances.png');
const GROCERIES_IMAGE = require('../../../assets/images/home/groceries.png');

type Product = {
  id: string;
  vendor_id: string | null;
  name: string;
  price: number;
  image_url: string | null;
  category: string | null;
  marketplace_category: string | null;
  status: 'available' | 'sold_out';
};
type SearchResult = { id: string; type: 'vendor' | 'marketplace-product' | 'supermarket-product' | 'cafeteria-product'; title: string; subtitle: string; vendorId?: string; category?: string | null };

type CategoryConfig = { title: string; databaseCategory?: string; banner: number };

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  'all-products': { title: 'All products', banner: ALL_PRODUCTS_IMAGE },
  'baking-stuff': { title: 'Baking stuff', databaseCategory: 'Baking stuff', banner: BAKING_IMAGE },
  'beauty-hygiene': { title: 'Beauty & Hygiene', databaseCategory: 'Beauty & Hygiene', banner: SKINCARE_IMAGE },
  electronics: { title: 'Electronics', databaseCategory: 'Electronics', banner: ELECTRONICS_IMAGE },
  fragrances: { title: 'Fragrances', databaseCategory: 'Fragrances', banner: FRAGRANCES_IMAGE },
  groceries: { title: 'Groceries', databaseCategory: 'Groceries', banner: GROCERIES_IMAGE },
};

const money = (amount: number) => `₦ ${Number(amount ?? 0).toLocaleString('en-NG')}`;

export default function SupermarketCategoryPage() {
  const router = useRouter();
  const { category } = useLocalSearchParams<{ category: string }>();
  const { width: viewportWidth } = useWindowDimensions();
  const width = Math.min(viewportWidth, 430);
  const key = (category ?? 'all-products').toLowerCase();
  const config = CATEGORY_CONFIG[key] ?? CATEGORY_CONFIG['all-products'];
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryImageUrl, setCategoryImageUrl] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cartToast, setCartToast] = useState('');
  const { addItem, changeQuantity, items } = useCartStore();
  const cardWidth = Math.max(154, (width - 30) / 2);

  useEffect(() => {
    let mounted = true;
    const loadProducts = async () => {
      setLoading(true);
      let request = supabase
        .from('products')
        .select('id, vendor_id, name, price, image_url, category, marketplace_category, status')
        .in('status', ['available', 'sold_out'])
        .is('marketplace_category', null)
        .order('created_at', { ascending: false });
      if (config.databaseCategory) request = request.eq('category', config.databaseCategory);
      const [{ data }, { data: placementRows }] = await Promise.all([
        request,
        config.databaseCategory
          ? supabase.from('product_category_placements').select('product_id').eq('section', 'supermarket').eq('category', key)
          : supabase.from('product_category_placements').select('product_id').eq('section', 'supermarket'),
      ]);
      const placementIds = (placementRows ?? []).map((placement) => placement.product_id);
      const { data: placedProducts } = placementIds.length
        ? await supabase.from('products').select('id, vendor_id, name, price, image_url, category, marketplace_category, status').in('id', placementIds).in('status', ['available', 'sold_out'])
        : { data: [] as Product[] };
      if (mounted) {
        setProducts(Array.from(new Map([...(data ?? []) as Product[], ...(placedProducts ?? []) as Product[]].map((product) => [product.id, product])).values()));
        setLoading(false);
      }
    };
    void loadProducts();
    return () => { mounted = false; };
  }, [config.databaseCategory]);

  useEffect(() => {
    let active = true;
    const loadCategoryImage = async () => {
      if (key === 'all-products') {
        if (active) setCategoryImageUrl(null);
        return;
      }
      const { data } = await supabase.from('supermarket_categories').select('image_url').eq('slug', key).maybeSingle();
      if (active) setCategoryImageUrl(data?.image_url ?? null);
    };
    void loadCategoryImage();
    return () => { active = false; };
  }, [key]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setSearchResults([]); setSearching(false); return; }
    let active = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      const [{ data: vendors }, { data: matches }, { data: cafeteriaItems }] = await Promise.all([
        supabase.from('vendors').select('id, name, category').ilike('name', `%${term}%`).eq('is_approved', true).limit(4),
        supabase.from('products').select('id, vendor_id, name, price, category, marketplace_category').ilike('name', `%${term}%`).eq('status', 'available').limit(8),
        supabase.from('cafeteria_products').select('id, name, category, price').ilike('name', `%${term}%`).eq('status', 'available').limit(6),
      ]);
      if (!active) return;
      setSearchResults([
        ...(vendors ?? []).map((vendor) => ({ id: vendor.id, type: 'vendor' as const, title: vendor.name, subtitle: vendor.category ?? 'Vendor' })),
        ...(matches ?? []).map((product) => ({ id: product.id, type: product.marketplace_category ? 'marketplace-product' as const : 'supermarket-product' as const, title: product.name, subtitle: `${product.category ?? 'Product'} · ${money(product.price ?? 0)}`, vendorId: product.vendor_id, category: product.category })),
        ...(cafeteriaItems ?? []).map((product) => ({ id: product.id, type: 'cafeteria-product' as const, title: product.name, subtitle: `Cafeteria · ${product.category ?? 'Meal'} · ${money(product.price ?? 0)}`, category: product.category })),
      ]);
      setSearching(false);
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);

  const visibleProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? products.filter((product) => `${product.name} ${product.category ?? ''}`.toLowerCase().includes(term)) : products;
  }, [products, query]);

  const quantity = (productId: string) => items.find((item) => item.productId === productId)?.quantity ?? 0;
  const updateQuantity = (product: Product, amount: number) => {
    if (product.status !== 'available') return;
    if (amount > 0) { addItem({ productId: product.id, name: product.name, category: product.category, price: product.price, imageUrl: product.image_url }); setCartToast(`${product.name} added to cart`); }
    else changeQuantity(product.id, -1);
  };
  const openSearchResult = (result: SearchResult) => {
    setQuery(''); setSearchResults([]);
    if (result.type === 'vendor') router.push({ pathname: '/(buyer)/marketplace/[vendorId]', params: { vendorId: result.id } });
    else if (result.type === 'cafeteria-product') router.push({ pathname: '/(buyer)/cafeteria', params: { category: result.category ?? 'snacks' } });
    else if (result.type === 'marketplace-product' && result.vendorId) router.push({ pathname: '/(buyer)/marketplace/[vendorId]/[productId]', params: { vendorId: result.vendorId, productId: result.id } });
    else router.push({ pathname: '/(buyer)/supermarket/[category]', params: { category: (result.category ?? 'all-products').toLowerCase().replace(/\s*&\s*/g, '-').replace(/\s+/g, '-') } });
  };
  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <FlatList
        data={visibleProducts}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={visibleProducts.length ? styles.row : undefined}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<>
          <View style={styles.header}>
            <View style={styles.topRow}>
              <TouchableOpacity style={styles.backButton} onPress={() => router.canGoBack() ? router.back() : router.replace('/(buyer)')} accessibilityLabel="Back"><Ionicons name="arrow-back-outline" size={20} color={COLORS.cream} /></TouchableOpacity>
              <Text style={styles.heading}>{config.title}</Text>
              <View style={styles.headerButtons}>
                <TouchableOpacity style={styles.headerButton} onPress={() => router.push('/(buyer)/notifications')} accessibilityLabel="Open notifications"><Ionicons name="notifications-outline" size={22} color={COLORS.cream} /><View style={styles.dot} /></TouchableOpacity>
                <TouchableOpacity style={styles.headerButton} onPress={() => router.push('/(buyer)/cart')} accessibilityLabel="Open cart"><Ionicons name="cart-outline" size={22} color={COLORS.cream} /></TouchableOpacity>
              </View>
            </View>
            <View style={styles.search}><Ionicons name="search-outline" size={20} color={COLORS.cream} /><TextInput value={query} onChangeText={setQuery} placeholder="Search food, vendors, groceries..." placeholderTextColor="rgba(248,243,237,0.58)" style={styles.searchInput} /></View>
            {query.trim().length >= 2 && <View style={styles.searchResults}>{searching ? <View style={styles.searchState}><ActivityIndicator size="small" color={COLORS.mint} /><Text style={styles.searchStateText}>Searching AUN Online Mart…</Text></View> : searchResults.length ? searchResults.map((result) => <TouchableOpacity key={`${result.type}-${result.id}`} style={styles.searchResult} onPress={() => openSearchResult(result)}><Ionicons name={result.type === 'vendor' ? 'storefront-outline' : 'bag-handle-outline'} size={19} color={COLORS.navy} /><View style={styles.resultCopy}><Text numberOfLines={1} style={styles.resultTitle}>{result.title}</Text><Text numberOfLines={1} style={styles.resultSubtitle}>{result.subtitle}</Text></View><Ionicons name="chevron-forward" size={18} color={COLORS.muted} /></TouchableOpacity>) : <View style={styles.searchState}><Text style={styles.searchStateText}>No matching products or vendors.</Text></View>}</View>}
          </View>
          <View style={styles.banner}>
            <Image source={categoryImageUrl ? { uri: categoryImageUrl } : config.banner} style={styles.bannerImage} resizeMode="cover" />
          </View>
          <Text style={styles.welcome}>Welcome to the AUN Online Mart supermarket! In this section, there are hundreds of products across baking ingredients, skincare, fragrances, groceries, etc. This feature saves you the trip to physical markets and shops, allowing you more leisure time. A service fee would be applied at checkout, according to your order weight and total time required for procurement and delivery.</Text>
        </>}
        renderItem={({ item }) => <TouchableOpacity activeOpacity={0.9} onPress={() => router.push({ pathname: '/(buyer)/supermarket/[category]/[productId]', params: { category: key, productId: item.id } })} style={[styles.card, { width: cardWidth }]}><View style={styles.photoWrap}>{item.image_url ? <Image source={{ uri: item.image_url }} style={styles.photo} /> : <View style={styles.photoPlaceholder}><Ionicons name="image-outline" size={30} color={COLORS.muted} /></View>}</View><View style={styles.cardInfo}><View style={styles.nameRow}><Text numberOfLines={2} style={styles.productName}>{item.name}</Text>{item.status === 'available' ? <TouchableOpacity onPress={() => updateQuantity(item, 1)} hitSlop={8} accessibilityLabel={'Add ' + item.name + ' to cart'}><Ionicons name="cart-outline" size={21} color={COLORS.cream} /></TouchableOpacity> : <Text style={styles.soldOutLabel}>Sold out</Text>}</View><View style={styles.purchaseRow}>{item.status === 'available' ? <View style={styles.stepper}><TouchableOpacity onPress={() => updateQuantity(item, -1)} style={styles.stepButton}><Text style={styles.stepText}>-</Text></TouchableOpacity><Text style={styles.quantity}>{quantity(item.id)}</Text><TouchableOpacity onPress={() => updateQuantity(item, 1)} style={styles.stepButton}><Text style={styles.stepText}>+</Text></TouchableOpacity></View> : <Text style={styles.outOfStock}>Out of stock</Text>}<Text style={styles.price}>{money(item.price)}</Text></View></View></TouchableOpacity>}
        ListEmptyComponent={loading ? <ActivityIndicator style={styles.loading} size="large" color={COLORS.mint} /> : <View style={styles.empty}><Ionicons name="basket-outline" size={34} color={COLORS.muted} /><Text style={styles.emptyText}>No {config.title.toLowerCase()} available yet.</Text></View>}
      />
      <CartToast visible={Boolean(cartToast)} message={cartToast} onDismiss={() => setCartToast('')} />
      <View style={styles.footer}>{[
        ['home-outline', 'Home', true], ['restaurant-outline', 'Cafeteria', false], ['sparkles-outline', 'Services', false], ['person-outline', 'Profile', false],
      ].map(([icon, label, active]) => <TouchableOpacity key={label as string} style={styles.footerItem} onPress={() => label === 'Home' ? router.replace('/(buyer)') : label === 'Cafeteria' ? router.push('/(buyer)/cafeteria') : label === 'Services' ? router.push('/(buyer)/services') : label === 'Profile' ? router.push('/(buyer)/profile') : undefined}><Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={28} color={active ? COLORS.mint : COLORS.cream} /><Text style={[styles.footerLabel, active && styles.footerLabelActive]}>{label}</Text></TouchableOpacity>)}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  list: { paddingBottom: 120 },
  header: { backgroundColor: COLORS.navy, paddingTop: 48, paddingHorizontal: 20, paddingBottom: 17 },
  topRow: { minHeight: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  backButton: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: COLORS.cream, alignItems: 'center', justifyContent: 'center' },
  heading: { flex: 1, color: COLORS.cream, fontSize: 20, fontWeight: '800' },
  headerButtons: { flexDirection: 'row', gap: 7 },
  headerButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(184,198,219,0.2)', alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 3, right: 3, width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.mint },
  search: { height: 47, marginTop: 9, paddingHorizontal: 13, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(1,25,61,0.65)', backgroundColor: 'rgba(248,243,237,0.45)', flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchInput: { flex: 1, color: COLORS.cream, fontSize: 15 },
  searchResults: { marginTop: 7, borderRadius: 12, overflow: 'hidden', backgroundColor: COLORS.white, elevation: 8 },
  searchResult: { minHeight: 56, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(1,25,61,0.08)' },
  resultCopy: { flex: 1 }, resultTitle: { color: COLORS.navy, fontSize: 14, fontWeight: '800' }, resultSubtitle: { color: '#68758A', fontSize: 11, marginTop: 2 },
  searchState: { minHeight: 55, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, searchStateText: { color: COLORS.navy, fontSize: 12, fontWeight: '600' },
  banner: { height: 220, marginHorizontal: 15, marginTop: 10, borderRadius: 15, overflow: 'hidden', justifyContent: 'flex-end' },
  bannerImage: { ...StyleSheet.absoluteFill, width: '100%', height: '100%', borderRadius: 20 },
  welcome: { color: COLORS.navy, fontSize: 16, lineHeight: 20, marginHorizontal: 12, marginTop: 12, marginBottom: 3 },
  row: { justifyContent: 'space-between', paddingHorizontal: 10, marginTop: 14, marginBottom: 12 },
  card: { height: 220, overflow: 'hidden', backgroundColor: COLORS.navy, borderRadius: 20 },
  photoWrap: { height: 135 },
  photo: { width: '100%', height: '100%', resizeMode: 'cover' }, photoPlaceholder: { flex: 1, backgroundColor: '#EDF1F5', alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1, paddingHorizontal: 13, paddingTop: 9, paddingBottom: 9, justifyContent: 'space-between' },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  productName: { flex: 1, color: COLORS.cream, fontSize: 12, fontWeight: '700', lineHeight: 15 },
  purchaseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepper: { width: 65, height: 25, borderRadius: 13, borderWidth: 1, borderColor: COLORS.muted, backgroundColor: COLORS.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  stepButton: { width: 15, height: 15, borderRadius: 8, borderWidth: 0.5, borderColor: COLORS.muted, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: COLORS.muted, fontSize: 12, fontWeight: '800', lineHeight: 14 },
  quantity: { color: COLORS.navy, fontSize: 10, fontWeight: '800' },
  soldOutLabel: { color: '#FFD9D9', fontSize: 11, fontWeight: '800' },
  outOfStock: { color: '#FFD9D9', fontSize: 11, fontWeight: '700' },
  price: { color: COLORS.cream, fontSize: 12, fontWeight: '800' },
  loading: { marginTop: 54 },
  empty: { alignItems: 'center', gap: 10, marginTop: 54 },
  emptyText: { color: COLORS.muted, fontSize: 15, fontWeight: '600' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 13, height: 90, borderRadius: 45, backgroundColor: COLORS.navy, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 14 },
  footerItem: { width: 76, alignItems: 'center', gap: 3 },
  footerLabel: { color: COLORS.cream, fontSize: 12, fontWeight: '600' },
  footerLabelActive: { color: COLORS.mint },
});
