import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authstore';
import { useCartStore } from '../../store/cartstore';

const COLORS = { navy: '#01193D', mint: '#68ECCB', cream: '#F8F3ED', green: '#005B3B', muted: '#A0A0A0', white: '#FFFFFF', surface: '#FDFBFA' } as const;
const PROMO_IMAGE = require('../../assets/images/home/jollof-promo.png');
type Icon = keyof typeof Ionicons.glyphMap;
type Section = 'marketplace' | 'supermarket';
const SUPERMARKET_VENDOR_CATEGORIES = new Set(['supermarket', 'all products', 'baking stuff', 'beauty & hygiene', 'electronics', 'fragrances', 'groceries']);
const isSupermarketVendor = (category?: string | null) => SUPERMARKET_VENDOR_CATEGORIES.has(category?.trim().toLowerCase() ?? '');

const CATEGORIES = [
  { label: 'Meals', image: require('../../assets/images/home/category-meals.png') },
  { label: 'Cakes', image: require('../../assets/images/home/cakes.png') },
  { label: 'Fast food', image: require('../../assets/images/home/fastfood.png') },
  { label: 'Ice-cream', image: require('../../assets/images/home/category-ice-cream.png') },
  { label: 'Dairy', image: require('../../assets/images/home/dairy.png') },
];
const PRODUCTS: { id: string; name: string; vendor: string; price: number; icon: Icon }[] = [
  { id: 'shawarma', name: 'Chicken shawarma', vendor: 'Btee treats & farms', price: 4500, icon: 'fast-food-outline' },
  { id: 'lotus', name: 'Lotus & Oreo', vendor: 'Cravins Ice-cream', price: 1300, icon: 'ice-cream-outline' },
  { id: 'jollof', name: 'Jollof rice', vendor: "Sholly's Restaurant", price: 2100, icon: 'restaurant-outline' },
  { id: 'alfredo', name: 'Chicken Alfredo', vendor: 'Uptown Restaurant', price: 9700, icon: 'pizza-outline' },
];
const SUPERMARKET: { label: string; image: number; slug: string }[] = [
  { label: 'All products', image: require('../../assets/images/home/all-products.png'), slug: 'all-products' }, { label: 'Baking stuff', image: require('../../assets/images/home/bakingstuff.png'), slug: 'baking-stuff' }, { label: 'Beauty & Hygiene', image: require('../../assets/images/home/skincare.png'), slug: 'beauty-hygiene' }, { label: 'Electronics', image: require('../../assets/images/home/electronics.png'), slug: 'electronics' }, { label: 'Fragrances', image: require('../../assets/images/home/category-fragrances.png'), slug: 'fragrances' }, { label: 'Groceries', image: require('../../assets/images/home/groceries.png'), slug: 'groceries' },
];
type HomeVendor = { id: string; name: string; category?: string | null; average_prep_time?: string | null; banner_url?: string | null; is_open?: boolean | null };
type SearchResult = { id: string; type: 'vendor' | 'product' | 'cafeteria-product'; title: string; subtitle: string; vendorId?: string; marketplaceCategory?: string | null; category?: string | null };
const FALLBACK_VENDORS: HomeVendor[] = [
  { id: 'shollys', name: "Sholly's Restaurant", category: 'Native pot', average_prep_time: '50–80 mins' },
];

const firstName = (name: unknown) => {
  const value = typeof name === 'string' && name.trim() ? name.trim().split(/\s+/)[0] : 'there';
  return value.length > 9 ? `${value.slice(0, 8)}…` : value;
};
const watGreeting = () => {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Lagos' }).format(new Date()));
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'Sweet dreams';
};
const money = (amount: number) => `₦ ${amount.toLocaleString('en-NG')}`;

function SectionTitle({ title }: { title: string }) {
  return <View style={styles.sectionTitleRow}><Text style={styles.sectionTitle}>{title}</Text><TouchableOpacity><Text style={styles.seeAll}>See all</Text></TouchableOpacity></View>;
}

function SupermarketStores({ vendors, width, onPress }: { vendors: HomeVendor[]; width: number; onPress: (vendorId: string) => void }) {
  if (!vendors.length) return null;
  return <View style={styles.supermarketStores}><SectionTitle title="Supermarket stores" /><FlatList horizontal data={vendors} showsHorizontalScrollIndicator={false} keyExtractor={(item) => item.id} contentContainerStyle={styles.horizontalList} renderItem={({ item }) => { const content = <><View style={styles.supermarketVendorShade} /><View style={[styles.supermarketOpen, item.is_open === false && styles.supermarketClosed]}><View style={styles.supermarketOpenDot} /><Text style={styles.supermarketOpenText}>{item.is_open === false ? 'CLOSED' : 'OPEN'}</Text></View><View style={styles.supermarketVendorCopy}><Text numberOfLines={1} style={styles.supermarketVendorName}>{item.name}</Text><Text numberOfLines={1} style={styles.supermarketVendorMeta}>{item.category || 'Supermarket'}</Text></View></>; return <TouchableOpacity activeOpacity={0.88} style={[styles.supermarketVendorCard, { width }]} onPress={() => onPress(item.id)}>{item.banner_url ? <ImageBackground source={{ uri: item.banner_url }} style={styles.supermarketVendorImage} imageStyle={styles.supermarketVendorImageFile}>{content}</ImageBackground> : <View style={[styles.supermarketVendorImage, styles.supermarketVendorEmpty]}><Ionicons name="storefront-outline" size={34} color={COLORS.mint} />{content}</View>}</TouchableOpacity>; }} /> </View>;
}

function LegacyProductCard({ item, width, quantity, change }: { item: typeof PRODUCTS[number]; width: number; quantity: number; change: (amount: number) => void }) {
  return <View style={[styles.productCard, { width }]}><View style={styles.productImage}><Ionicons name={item.icon} size={62} color="rgba(0,91,59,0.55)" /></View><View style={styles.productInfo}><Text numberOfLines={1} style={styles.productName}>{item.name}</Text><Text numberOfLines={1} style={styles.productVendor}>{item.vendor}</Text><View style={styles.productFooter}><View style={styles.quantity}><TouchableOpacity onPress={() => change(-1)} style={styles.quantityButton}><Text style={styles.quantitySign}>−</Text></TouchableOpacity><Text style={styles.quantityValue}>{quantity}</Text><TouchableOpacity onPress={() => change(1)} style={styles.quantityButton}><Text style={styles.quantitySign}>+</Text></TouchableOpacity></View><View style={styles.productPurchase}><Text style={styles.price}>{money(item.price)}</Text><TouchableOpacity onPress={() => change(1)} accessibilityLabel={`Add ${item.name} to cart`}><Ionicons name="cart-outline" size={22} color={COLORS.cream} /></TouchableOpacity></View></View></View></View>;
}

function ProductCard({ item, width, quantity, change, addToCart }: { item: typeof PRODUCTS[number]; width: number; quantity: number; change: (amount: number) => void; addToCart: () => void }) {
  return (
    <View style={[styles.productCard, styles.productCardBorderless, { width }]}>
      <View style={styles.productImage}><Ionicons name={item.icon} size={62} color="rgba(0,91,59,0.55)" /></View>
      <View style={[styles.productInfo, styles.productInfoPanel]}>
        <View style={styles.productTitleRow}>
          <Text numberOfLines={1} style={[styles.productName, styles.productNameInRow]}>{item.name}</Text>
          <Text style={styles.price}>{money(item.price)}</Text>
        </View>
        <Text numberOfLines={1} style={styles.productVendor}>{item.vendor}</Text>
        <View style={styles.productFooter}>
          <View style={styles.quantity}>
            <TouchableOpacity onPress={() => change(-1)} style={styles.quantityButton}><Text style={styles.quantitySign}>−</Text></TouchableOpacity>
            <Text style={styles.quantityValue}>{quantity}</Text>
            <TouchableOpacity onPress={() => change(1)} style={styles.quantityButton}><Text style={styles.quantitySign}>+</Text></TouchableOpacity>
          </View>
          <TouchableOpacity onPress={addToCart} accessibilityLabel={`Add ${item.name} to cart`}><Ionicons name="cart-outline" size={22} color={COLORS.cream} /></TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function BuyerHome() {
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const width = Math.min(viewportWidth, 430);
  const profile = useAuthStore((state) => state.profile);
  const [section, setSection] = useState<Section>('marketplace');
  const [activeCategory, setActiveCategory] = useState('Meals');
  const [name, setName] = useState(() => firstName(profile?.full_name));
  const [timeGreeting, setTimeGreeting] = useState(watGreeting);
  const [vendors, setVendors] = useState<HomeVendor[]>(FALLBACK_VENDORS);
  const [supermarketVendors, setSupermarketVendors] = useState<HomeVendor[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const { items: cartItems, addItem, changeQuantity: changeCartQuantity } = useCartStore();
  const cardWidth = Math.min(200, Math.max(170, width * 0.47));
  // Keep enough of the next card in view to make the vendor rail's horizontal
  // scroll discoverable, without shrinking the product cards below it.
  const vendorCardWidth = Math.min(182, Math.max(156, width * 0.41));
  const supermarketVendorWidth = Math.min(176, Math.max(150, width * 0.4));
  const isSupermarket = section === 'supermarket';
  const cartCount = useMemo(() => cartItems.reduce((total, item) => total + item.quantity, 0), [cartItems]);

  useEffect(() => {
    if (profile?.full_name) { setName(firstName(profile.full_name)); return; }
    void supabase.auth.getUser().then(({ data }) => setName(firstName(data.user?.user_metadata?.full_name)));
  }, [profile?.full_name]);

  useEffect(() => {
    const updateGreeting = () => setTimeGreeting(watGreeting());
    updateGreeting();
    const timer = setInterval(updateGreeting, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const loadVendors = async () => {
      const { data } = await supabase.from('vendors').select('id, name, category, average_prep_time, banner_url, is_open').eq('is_approved', true).limit(24);
      const marketplaceVendors = (data ?? []).filter((vendor) => !isSupermarketVendor(vendor.category));
      const supermarketRows = (data ?? []).filter((vendor) => isSupermarketVendor(vendor.category));
      if (marketplaceVendors.length) setVendors(marketplaceVendors as HomeVendor[]);
      setSupermarketVendors(supermarketRows as HomeVendor[]);
    };
    void loadVendors();
  }, []);

  useEffect(() => {
    const term = searchQuery.trim();
    if (term.length < 2) { setSearchResults([]); setSearching(false); return; }
    let active = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      const [{ data: vendorData }, { data: productData }, { data: cafeteriaData }] = await Promise.all([
        supabase.from('vendors').select('id, name, category').ilike('name', `%${term}%`).eq('is_approved', true).limit(4),
        supabase.from('products').select('id, name, vendor_id, category, marketplace_category, price').ilike('name', `%${term}%`).eq('status', 'available').limit(6),
        supabase.from('cafeteria_products').select('id, name, category, price').ilike('name', `%${term}%`).eq('status', 'available').limit(6),
      ]);
      if (!active) return;
      const vendorResults: SearchResult[] = (vendorData ?? []).map((vendor) => ({ id: vendor.id, type: 'vendor', title: vendor.name, subtitle: vendor.category ?? 'Marketplace vendor' }));
      const productResults: SearchResult[] = (productData ?? []).map((product) => ({ id: product.id, type: 'product', title: product.name, subtitle: `${product.category ?? 'Product'} · ${money(product.price ?? 0)}`, vendorId: product.vendor_id, marketplaceCategory: product.marketplace_category, category: product.category }));
      const cafeteriaResults: SearchResult[] = (cafeteriaData ?? []).map((product) => ({ id: product.id, type: 'cafeteria-product', title: product.name, subtitle: `Cafeteria · ${product.category ?? 'Meal'} · ${money(product.price ?? 0)}`, category: product.category }));
      setSearchResults([...vendorResults, ...productResults, ...cafeteriaResults]);
      setSearching(false);
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [searchQuery]);

  const updateQuantity = (id: string, amount: number) => {
    setQuantities((current) => ({ ...current, [id]: Math.max(0, (current[id] ?? 0) + amount) }));
    const product = PRODUCTS.find((item) => item.id === id);
    if (!product) return;
    if (amount > 0) addItem({ productId: product.id, name: product.name, category: product.vendor, price: product.price });
    else changeCartQuantity(id, amount);
  };

  const addProductToCart = (id: string) => {
    const product = PRODUCTS.find((item) => item.id === id);
    if (!product) return;
    addItem({ productId: product.id, name: product.name, category: product.vendor, price: product.price });
  };

  const openSearchResult = (result: SearchResult) => {
    setSearchQuery('');
    setSearchResults([]);
    if (result.type === 'vendor') router.push({ pathname: '/(buyer)/marketplace/[vendorId]', params: { vendorId: result.id } });
    else if (result.type === 'cafeteria-product') router.push({ pathname: '/(buyer)/cafeteria', params: { category: result.category ?? 'snacks' } });
    else if (result.marketplaceCategory && result.vendorId) router.push({ pathname: '/(buyer)/marketplace/[vendorId]/[productId]', params: { vendorId: result.vendorId, productId: result.id } });
    else router.push({ pathname: '/(buyer)/supermarket/[category]', params: { category: (result.category ?? 'all-products').toLowerCase().replace(/\s*&\s*/g, '-').replace(/\s+/g, '-') } });
  };

  return <View style={styles.screen}>
    <StatusBar style="light" />
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerTop}><Text numberOfLines={1} style={styles.headerGreeting}>{isSupermarket ? 'Supermarket section' : `${timeGreeting}, ${name}`}</Text><View style={styles.headerActions}><TouchableOpacity style={styles.roundAction} onPress={() => router.push('/(buyer)/notifications')} accessibilityLabel="Open notifications"><Ionicons name="notifications-outline" size={23} color={COLORS.cream} /><View style={styles.badge} /></TouchableOpacity><TouchableOpacity style={styles.roundAction} onPress={() => router.push('/(buyer)/cart')} accessibilityRole="button" accessibilityLabel="Open cart"><Ionicons name="cart-outline" size={23} color={COLORS.cream} />{cartCount > 0 && <View style={styles.cartCount}><Text style={styles.cartCountText}>{cartCount}</Text></View>}</TouchableOpacity></View></View>
        <Text style={styles.headerQuestion}>{isSupermarket ? 'Shop anything' : 'What would you like?'}</Text>
        <View style={styles.search}><Ionicons name="search-outline" size={22} color={COLORS.cream} /><TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Search food, vendors, groceries..." placeholderTextColor={COLORS.muted} style={styles.searchInput} autoCapitalize="none" returnKeyType="search" />{searchQuery.length > 0 && <TouchableOpacity onPress={() => setSearchQuery('')}><Ionicons name="close-circle" size={19} color={COLORS.cream} /></TouchableOpacity>}</View>
        {searchQuery.trim().length >= 2 && <View style={styles.searchResults}>{searching ? <View style={styles.searchState}><ActivityIndicator size="small" color={COLORS.mint} /><Text style={styles.searchStateText}>Searching marketplace…</Text></View> : searchResults.length ? searchResults.map((result) => <TouchableOpacity key={`${result.type}-${result.id}`} style={styles.searchResult} onPress={() => openSearchResult(result)}><View style={styles.searchResultIcon}><Ionicons name={result.type === 'vendor' ? 'storefront-outline' : 'restaurant-outline'} size={20} color={COLORS.navy} /></View><View style={styles.searchResultCopy}><Text numberOfLines={1} style={styles.searchResultTitle}>{result.title}</Text><Text numberOfLines={1} style={styles.searchResultSubtitle}>{result.subtitle}</Text></View><Ionicons name="chevron-forward" size={18} color={COLORS.muted} /></TouchableOpacity>) : <View style={styles.searchState}><Text style={styles.searchStateText}>No matching vendors or items found.</Text></View>}</View>}
      </View>
      <View style={styles.switcher}><TouchableOpacity style={styles.switcherItem} onPress={() => setSection('marketplace')}><Ionicons name="restaurant-outline" size={23} color={COLORS.navy} /><Text style={[styles.switcherText, !isSupermarket && styles.switcherTextActive]}>Marketplace</Text></TouchableOpacity><TouchableOpacity style={styles.switcherItem} onPress={() => setSection('supermarket')}><Ionicons name="storefront-outline" size={23} color={COLORS.navy} /><Text style={[styles.switcherText, isSupermarket && styles.switcherTextActive]}>Supermarket</Text></TouchableOpacity><View style={styles.switchTrack}><View style={[styles.switchFill, isSupermarket && styles.switchFillSupermarket]} /></View></View>
      {isSupermarket ? <View><SupermarketStores vendors={supermarketVendors} width={supermarketVendorWidth} onPress={(vendorId) => router.push({ pathname: '/(buyer)/marketplace/[vendorId]', params: { vendorId } })} /><View style={styles.supermarketGrid}>{SUPERMARKET.map((item) => <TouchableOpacity key={item.label} style={styles.supermarketTileWrap} activeOpacity={0.88} onPress={() => router.push({ pathname: '/(buyer)/supermarket/[category]', params: { category: item.slug } })}><ImageBackground source={item.image} imageStyle={styles.tileImage} style={styles.supermarketTile}><View style={styles.tileShade} /><Text style={styles.tileLabel}>{item.label}</Text></ImageBackground></TouchableOpacity>)}</View> </View> : <View style={styles.body}>
        <View style={styles.status}><View style={styles.statusDot} /><Text style={styles.statusText}>Accepting orders</Text></View><Text style={styles.subheading}>From all your favourite vendors, with love.</Text>
        <FlatList horizontal data={CATEGORIES} showsHorizontalScrollIndicator={false} keyExtractor={(item) => item.label} contentContainerStyle={styles.categories} renderItem={({ item }) => { const active = item.label === activeCategory; return <Pressable onPress={() => { setActiveCategory(item.label); router.push({ pathname: '/(buyer)/marketplace/category/[category]', params: { category: item.label.toLowerCase().replace(' ', '-') } }); }} style={styles.categoryWrap}><View style={[styles.categoryIcon, active && styles.categoryIconActive]}><Image source={item.image} style={styles.categoryImage} /></View><Text style={[styles.categoryText, active && styles.categoryTextActive]}>{item.label}</Text></Pressable>; }} />
        <ImageBackground source={PROMO_IMAGE} imageStyle={styles.promoImage} style={styles.promo}><View style={styles.promoOverlay} /><Text style={styles.promoEyebrow}>TODAY'S PICK</Text><Text style={styles.promoTitle}>Sholly's jollof is extra smoky today.</Text><TouchableOpacity style={styles.orderButton}><Text style={styles.orderButtonText}>ORDER NOW</Text></TouchableOpacity></ImageBackground>
        <SectionTitle title="Vendors open now" />
        <FlatList horizontal data={vendors} showsHorizontalScrollIndicator={false} keyExtractor={(item) => item.id} contentContainerStyle={styles.horizontalList} renderItem={({ item }) => <TouchableOpacity activeOpacity={0.85} style={[styles.vendorCard, { width: vendorCardWidth }]} onPress={() => router.push({ pathname: '/(buyer)/marketplace/[vendorId]', params: { vendorId: item.id } })}><ImageBackground source={item.banner_url ? { uri: item.banner_url } : PROMO_IMAGE} style={styles.vendorImage} imageStyle={styles.vendorImageFile}><View style={styles.open}><Text style={styles.openText}>{item.is_open === false ? 'CLOSED' : 'OPEN'}</Text></View></ImageBackground><View style={styles.vendorInfo}><Text numberOfLines={1} style={styles.vendorName}>{item.name}</Text><Text numberOfLines={1} style={styles.vendorCuisine}>{item.category ?? 'Marketplace'}</Text><Text style={styles.deliveryTime}>{item.average_prep_time ?? '30–60 mins'}</Text></View></TouchableOpacity>} />
        <SectionTitle title="Best sellers" /><FlatList horizontal data={PRODUCTS} showsHorizontalScrollIndicator={false} keyExtractor={(item) => item.id} contentContainerStyle={[styles.horizontalList, styles.products]} renderItem={({ item }) => <ProductCard item={item} width={cardWidth} quantity={quantities[item.id] ?? 0} change={(amount) => updateQuantity(item.id, amount)} addToCart={() => addProductToCart(item.id)} />} />
      </View>}
    </ScrollView>
    <View style={styles.footer}>{[['home-outline', 'Home'], ['restaurant-outline', 'Cafeteria'], ['sparkles-outline', 'Services'], ['person-outline', 'Profile']].map(([icon, label]) => { const isActive = label === 'Home'; return <TouchableOpacity key={label} style={styles.footerItem} onPress={() => label === 'Cafeteria' ? router.push('/(buyer)/cafeteria') : label === 'Services' ? router.push('/(buyer)/services') : label === 'Profile' ? router.push('/(buyer)/profile') : undefined}><Ionicons name={icon as Icon} size={29} color={isActive ? COLORS.mint : COLORS.cream} /><Text style={[styles.footerText, isActive && styles.footerTextActive]}>{label}</Text></TouchableOpacity>; })}</View>
  </View>;
}

const styles = StyleSheet.create({
  searchResults: { marginTop: 8, borderRadius: 12, overflow: 'hidden', backgroundColor: COLORS.white, borderWidth: 1, borderColor: 'rgba(104,236,203,0.55)', elevation: 8, shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  searchResult: { minHeight: 62, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(1,25,61,0.08)' },
  searchResultIcon: { width: 35, height: 35, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E1F5EE' },
  searchResultCopy: { flex: 1 },
  searchResultTitle: { color: COLORS.navy, fontSize: 15, fontWeight: '800' },
  searchResultSubtitle: { color: '#68758A', fontSize: 12, marginTop: 2 },
  searchState: { minHeight: 60, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  searchStateText: { color: COLORS.navy, fontSize: 13, fontWeight: '600' },
  screen: { flex: 1, backgroundColor: COLORS.white }, content: { paddingBottom: 112 },
  header: { zIndex: 10, backgroundColor: COLORS.navy, paddingTop: 48, paddingHorizontal: 20, paddingBottom: 17 }, headerTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }, headerGreeting: { flex: 1, marginRight: 12, color: COLORS.cream, fontSize: 24, lineHeight: 30, fontWeight: '700' }, headerQuestion: { color: COLORS.cream, fontSize: 16, fontWeight: '500', marginTop: 3, marginBottom: 3 }, headerActions: { flexDirection: 'row', gap: 7 }, roundAction: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(184,198,219,0.2)', alignItems: 'center', justifyContent: 'center' }, badge: { position: 'absolute', top: 2, right: 2, width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.mint }, cartCount: { position: 'absolute', top: -4, right: -4, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: COLORS.mint, alignItems: 'center', justifyContent: 'center' }, cartCountText: { color: COLORS.navy, fontSize: 10, fontWeight: '800' }, search: { height: 47, borderWidth: 1, borderColor: 'rgba(1,25,61,0.65)', backgroundColor: 'rgba(248,243,237,0.45)', borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13 }, searchInput: { flex: 1, color: COLORS.cream, fontSize: 16 },
  switcher: { height: 65, backgroundColor: COLORS.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', position: 'relative' }, switcherItem: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }, switcherText: { color: COLORS.navy, fontSize: 18 }, switcherTextActive: { fontWeight: '700' }, switchTrack: { position: 'absolute', bottom: 0, left: 13, right: 13, height: 5, borderRadius: 3, backgroundColor: '#D9D9D9' }, switchFill: { position: 'absolute', left: 0, width: '50%', height: 5, borderRadius: 3, backgroundColor: COLORS.navy }, switchFillSupermarket: { left: '50%' },
  body: { paddingTop: 12 }, status: { alignSelf: 'flex-start', marginLeft: 16, height: 41, paddingHorizontal: 14, borderRadius: 21, borderWidth: 1, borderColor: COLORS.muted, backgroundColor: '#E1F5EE', flexDirection: 'row', alignItems: 'center', gap: 11 }, statusDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#02BD7C' }, statusText: { color: COLORS.green, fontSize: 19, fontWeight: '500' }, subheading: { color: COLORS.navy, fontSize: 17, marginHorizontal: 20, marginTop: 17, marginBottom: 12 }, categories: { gap: 19, paddingHorizontal: 20 }, categoryWrap: { width: 65, alignItems: 'center', gap: 5 }, categoryIcon: { width: 65, height: 65, borderRadius: 8, backgroundColor: COLORS.cream, borderWidth: 2, borderColor: COLORS.muted, alignItems: 'center', justifyContent: 'center' }, categoryIconActive: { backgroundColor: '#E1F5EE', borderColor: COLORS.green }, categoryText: { color: 'rgba(1,25,61,0.6)', fontSize: 14, fontWeight: '600', textAlign: 'center' }, categoryTextActive: { color: COLORS.navy },
  categoryImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  promo: { height: 145, marginHorizontal: 20, marginTop: 22, padding: 14, overflow: 'hidden', borderRadius: 15 }, promoImage: { borderRadius: 15 }, promoOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(1,25,61,0.77)' }, promoEyebrow: { color: COLORS.mint, fontSize: 17, marginBottom: 3 }, promoTitle: { color: COLORS.cream, fontSize: 17, lineHeight: 21, fontWeight: '600', width: 250 }, orderButton: { marginTop: 8, width: 145, height: 38, borderRadius: 8, backgroundColor: COLORS.cream, alignItems: 'center', justifyContent: 'center' }, orderButtonText: { color: COLORS.navy, fontSize: 16, fontWeight: '600' },
  sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 20, marginTop: 20, marginBottom: 8 }, sectionTitle: { color: COLORS.navy, fontSize: 20, fontWeight: '500' }, seeAll: { color: COLORS.green, fontSize: 18, fontWeight: '500' }, horizontalList: { paddingLeft: 20, paddingRight: 12, gap: 8 }, vendorCard: { height: 220, overflow: 'hidden', borderRadius: 20, backgroundColor: COLORS.navy }, vendorImage: { height: 125, justifyContent: 'flex-start' }, vendorImageFile: { borderTopLeftRadius: 20, borderTopRightRadius: 20 }, open: { width: 70, height: 30, marginTop: 15, marginLeft: 13, borderRadius: 4, backgroundColor: '#1D9E75', alignItems: 'center', justifyContent: 'center' }, openText: { color: COLORS.cream, fontSize: 12, fontWeight: '600' }, vendorInfo: { flex: 1, padding: 13 }, vendorName: { color: COLORS.cream, fontSize: 14, fontWeight: '600' }, vendorCuisine: { color: COLORS.muted, fontSize: 12, marginTop: 3 }, deliveryTime: { marginTop: 'auto', color: COLORS.cream, fontSize: 12, fontWeight: '600' },
  products: { paddingBottom: 6 }, productCard: { height: 220, overflow: 'hidden', borderRadius: 20, backgroundColor: COLORS.navy }, productImage: { height: 135, backgroundColor: COLORS.cream, alignItems: 'center', justifyContent: 'center' }, productInfo: { flex: 1, paddingHorizontal: 13, paddingTop: 7 }, productName: { color: COLORS.cream, fontSize: 13, fontWeight: '700' }, productVendor: { color: COLORS.muted, fontSize: 11, marginTop: 2 }, productFooter: { marginTop: 'auto', marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, quantity: { width: 65, height: 25, borderRadius: 13, borderWidth: 1, borderColor: COLORS.muted, backgroundColor: COLORS.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }, quantityButton: { width: 18, height: 18, borderRadius: 9, borderWidth: 0.5, borderColor: COLORS.muted, alignItems: 'center', justifyContent: 'center' }, quantitySign: { color: COLORS.muted, fontSize: 13, fontWeight: '700' }, quantityValue: { color: COLORS.navy, fontSize: 11, fontWeight: '700' }, productPurchase: { flexDirection: 'row', alignItems: 'center', gap: 7 }, price: { color: COLORS.cream, fontSize: 12, fontWeight: '700' },
  productTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }, productNameInRow: { flex: 1 }, productCardBorderless: { backgroundColor: COLORS.white }, productInfoPanel: { backgroundColor: COLORS.navy, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  supermarketGrid: { padding: 12, paddingTop: 22, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }, supermarketTileWrap: { width: '48.5%', marginBottom: 10 }, supermarketTile: { width: '100%', height: 220, overflow: 'hidden', borderRadius: 20, justifyContent: 'flex-end', padding: 17 }, tileImage: { width: '100%', height: '100%', borderRadius: 20, resizeMode: 'cover' }, tileShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(1,25,61,0.25)' }, tileLabel: { color: COLORS.white, fontSize: 20, fontWeight: '700', textAlign: 'left', textShadowColor: 'rgba(1,25,61,0.8)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  supermarketStores: { paddingBottom: 6 }, supermarketVendorCard: { height: 156, overflow: 'hidden', borderRadius: 18, backgroundColor: COLORS.navy }, supermarketVendorImage: { flex: 1, justifyContent: 'flex-end' }, supermarketVendorEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#12315D' }, supermarketVendorImageFile: { borderRadius: 18, resizeMode: 'cover' }, supermarketVendorShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(1,25,61,0.48)' }, supermarketOpen: { position: 'absolute', top: 10, left: 10, minHeight: 24, borderRadius: 12, paddingHorizontal: 9, backgroundColor: '#1D9E75', flexDirection: 'row', alignItems: 'center', gap: 5 }, supermarketClosed: { backgroundColor: '#657080' }, supermarketOpenDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.cream }, supermarketOpenText: { color: COLORS.cream, fontSize: 10, fontWeight: '800' }, supermarketVendorCopy: { padding: 13 }, supermarketVendorName: { color: COLORS.cream, fontSize: 16, fontWeight: '800' }, supermarketVendorMeta: { color: '#D8E3EF', fontSize: 12, marginTop: 3 },
  footer: { position: 'absolute', bottom: 13, left: 0, right: 0, height: 90, borderRadius: 45, backgroundColor: COLORS.navy, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 15 }, footerItem: { width: 75, alignItems: 'center', gap: 3 }, footerText: { color: COLORS.cream, fontSize: 12, fontWeight: '600' }, footerTextActive: { color: COLORS.mint },
});
