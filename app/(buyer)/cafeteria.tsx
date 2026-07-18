import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useCartStore } from '../../store/cartstore';

const COLORS = { navy: '#01193D', cream: '#F8F3ED', mint: '#68ECCB', green: '#006D50', pale: '#E2F4EE', muted: '#A0A0A0' } as const;
type Category = 'snacks' | 'lunch' | 'dinner';
type Product = { id: string; name: string; description: string | null; category: Category; price: number; image_url: string | null; status: 'available' | 'sold_out' | 'hidden'; meal_plan_eligible: boolean };
const TABS: { id: Category; label: string; icon: keyof typeof Ionicons.glyphMap; note: string }[] = [
  { id: 'snacks', label: 'Snacks', icon: 'ice-cream-outline', note: 'Snacks are available around the clock. Some options may sell out before we can update the catalogue; an agent will contact you if a change is needed.' },
  { id: 'lunch', label: 'Lunch', icon: 'restaurant-outline', note: 'The ordering window for lunch closes by 2 pm daily. Availability can change as servings run out.' },
  { id: 'dinner', label: 'Dinner', icon: 'moon-outline', note: 'Dinner options are served from 5pm. Add your requests early to avoid missing your favourites.' },
];
const money = (price: number) => `₦ ${Number(price).toLocaleString('en-NG')}`;

export default function CafeteriaPage() {
  const router = useRouter();
  const { category: categoryParam } = useLocalSearchParams<{ category?: Category }>();
  const { width: viewportWidth } = useWindowDimensions();
  const width = Math.min(viewportWidth, 430);
  const [category, setCategory] = useState<Category>(categoryParam === 'lunch' || categoryParam === 'dinner' ? categoryParam : 'snacks');
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const { items, addItem, changeQuantity } = useCartStore();
  const cardWidth = (width - 30) / 2;
  const currentTab = TABS.find((tab) => tab.id === category) ?? TABS[0];

  useEffect(() => {
    if (categoryParam === 'snacks' || categoryParam === 'lunch' || categoryParam === 'dinner') setCategory(categoryParam);
  }, [categoryParam]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from('cafeteria_products').select('id, name, description, category, price, image_url, status, meal_plan_eligible').eq('category', category).neq('status', 'hidden').order('created_at', { ascending: false });
      if (active) { setProducts((data ?? []) as Product[]); setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [category]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? products.filter((item) => `${item.name} ${item.description ?? ''}`.toLowerCase().includes(term)) : products;
  }, [products, query]);
  const quantity = (id: string) => items.find((item) => item.productId === `cafeteria:${id}`)?.quantity ?? 0;
  const openProduct = (item: Product) => router.push({ pathname: '/(buyer)/cafeteria/[productId]', params: { productId: item.id } });
  const update = (item: Product, amount: number) => {
    if (item.status === 'sold_out') return;
    const productId = `cafeteria:${item.id}`;
    if (amount > 0) addItem({ productId, name: item.name, category: `Cafeteria · ${item.category}`, price: item.price, imageUrl: item.image_url, mealPlanEligible: item.meal_plan_eligible });
    else changeQuantity(productId, -1);
  };
  const addOrCustomise = async (item: Product) => {
    if (item.status === 'sold_out') return;
    const { data } = await supabase.from('cafeteria_product_options').select('id').eq('product_id', item.id).eq('is_available', true).limit(1);
    if (data?.length) { openProduct(item); return; }
    update(item, 1);
  };
  const cafeteriaItems = items.filter((item) => item.productId.startsWith('cafeteria:'));
  const total = cafeteriaItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const count = cafeteriaItems.reduce((sum, item) => sum + item.quantity, 0);

  return <View style={styles.screen}>
    <StatusBar style="light" />
    <FlatList
      data={visible}
      keyExtractor={(item) => item.id}
      numColumns={2}
      columnWrapperStyle={visible.length ? styles.row : undefined}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={<>
        <View style={styles.header}><View style={styles.headingRow}><View><Text style={styles.heading}>Cafeteria</Text><Text style={styles.subheading}>Right to your door</Text></View><View style={styles.headerActions}><TouchableOpacity style={styles.action} onPress={() => router.push('/(buyer)/notifications')}><Ionicons name="notifications-outline" size={23} color={COLORS.cream} /><View style={styles.dot} /></TouchableOpacity><TouchableOpacity style={styles.action} onPress={() => router.push('/(buyer)/cart')}><Ionicons name="cart-outline" size={23} color={COLORS.cream} /></TouchableOpacity></View></View><View style={styles.search}><Ionicons name="search-outline" size={22} color={COLORS.cream} /><TextInput value={query} onChangeText={setQuery} placeholder="Search cafeteria meals and snacks..." placeholderTextColor={COLORS.muted} style={styles.searchInput} /></View></View>
        <View style={styles.tabs}>{TABS.map((tab) => <TouchableOpacity key={tab.id} style={styles.tab} onPress={() => setCategory(tab.id)}><View style={styles.tabCopy}><Ionicons name={tab.icon} size={25} color={COLORS.navy} /><Text style={[styles.tabText, category === tab.id && styles.tabTextActive]}>{tab.label}</Text></View>{category === tab.id && <View style={styles.tabLine} />}</TouchableOpacity>)}</View>
        <View style={styles.note}><Text style={styles.noteText}>{currentTab.note}</Text></View>
      </>}
      renderItem={({ item }) => { const snack = item.category === 'snacks'; const cardContent = <><View style={styles.photoWrap}>{item.image_url ? <Image source={{ uri: item.image_url }} style={styles.photo} /> : <View style={styles.photoPlaceholder}><Ionicons name="fast-food-outline" size={38} color={COLORS.muted} /></View>}{item.status === 'sold_out' && <View style={styles.sold}><Text style={styles.soldText}>SOLD OUT</Text></View>}</View><View style={styles.cardInfo}><View style={styles.nameRow}><Text numberOfLines={1} style={styles.productName}>{item.name}</Text>{snack ? <TouchableOpacity onPress={() => void addOrCustomise(item)} disabled={item.status === 'sold_out'}><Ionicons name="cart-outline" size={21} color={COLORS.cream} /></TouchableOpacity> : <TouchableOpacity onPress={() => void addOrCustomise(item)} disabled={item.status === 'sold_out'}><Ionicons name="cart-outline" size={21} color={COLORS.cream} /></TouchableOpacity>}</View><View style={styles.purchaseRow}>{snack ? <View style={styles.stepper}><TouchableOpacity onPress={() => update(item, -1)} disabled={item.status === 'sold_out'}><Text style={styles.step}>−</Text></TouchableOpacity><Text style={styles.quantity}>{quantity(item.id)}</Text><TouchableOpacity onPress={() => void addOrCustomise(item)} disabled={item.status === 'sold_out'}><Text style={styles.step}>+</Text></TouchableOpacity></View> : <Text style={styles.customise}>Customise order</Text>}<Text style={styles.price}>{money(item.price)}</Text></View></View></>; return <View style={[styles.card, { width: cardWidth }]}>{cardContent}</View>; }}
      ListEmptyComponent={loading ? <ActivityIndicator style={styles.loading} size="large" color={COLORS.mint} /> : <Text style={styles.empty}>No {currentTab.label.toLowerCase()} available right now.</Text>}
    />
    {count > 0 && <TouchableOpacity style={styles.cartBar} onPress={() => router.push('/(buyer)/cart')}><View style={styles.count}><Text style={styles.countText}>{count}</Text></View><Text style={styles.cartLabel}>View cart</Text><Text style={styles.cartTotal}>{money(total)}</Text></TouchableOpacity>}
    <View style={styles.footer}>{[['home-outline', 'Home'], ['restaurant-outline', 'Cafeteria'], ['sparkles-outline', 'Services'], ['person-outline', 'Profile']].map(([icon, label]) => <TouchableOpacity key={label} style={styles.footerItem} onPress={() => label === 'Home' ? router.replace('/(buyer)') : label === 'Services' ? router.push('/(buyer)/services') : label === 'Profile' ? router.push('/(buyer)/profile') : undefined}><Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={29} color={label === 'Cafeteria' ? COLORS.mint : COLORS.cream} /><Text style={[styles.footerText, label === 'Cafeteria' && styles.footerTextActive]}>{label}</Text></TouchableOpacity>)}</View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, list: { paddingBottom: 150 }, header: { backgroundColor: COLORS.navy, paddingTop: 48, paddingHorizontal: 20, paddingBottom: 17 }, headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, heading: { color: COLORS.cream, fontSize: 30, fontWeight: '700' }, subheading: { color: COLORS.cream, fontSize: 20, marginTop: 1 }, headerActions: { flexDirection: 'row', gap: 7 }, action: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(184,198,219,0.2)', alignItems: 'center', justifyContent: 'center' }, dot: { position: 'absolute', top: 3, right: 3, width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.mint }, search: { height: 47, marginTop: 14, paddingHorizontal: 13, borderRadius: 10, backgroundColor: 'rgba(248,243,237,0.45)', borderWidth: 1, borderColor: 'rgba(1,25,61,0.65)', flexDirection: 'row', alignItems: 'center', gap: 9 }, searchInput: { flex: 1, color: COLORS.cream, fontSize: 15 },
  tabs: { height: 65, flexDirection: 'row', paddingHorizontal: 12 }, tab: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' }, tabCopy: { flexDirection: 'row', alignItems: 'center', gap: 7 }, tabText: { color: COLORS.navy, fontSize: 18, fontWeight: '500' }, tabTextActive: { fontWeight: '800' }, tabLine: { position: 'absolute', bottom: 0, height: 5, left: 5, right: 5, borderRadius: 3, backgroundColor: COLORS.navy }, note: { margin: 16, padding: 18, borderRadius: 28, borderWidth: 1, borderColor: COLORS.green, backgroundColor: COLORS.pale }, noteText: { color: COLORS.green, fontSize: 18, lineHeight: 24 }, row: { justifyContent: 'space-between', paddingHorizontal: 10, marginBottom: 12 }, card: { height: 245, overflow: 'hidden', borderRadius: 20, backgroundColor: COLORS.navy }, photoWrap: { height: 145 }, photo: { width: '100%', height: '100%', resizeMode: 'cover' }, photoPlaceholder: { flex: 1, backgroundColor: '#EDF1F5', alignItems: 'center', justifyContent: 'center' }, sold: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(1,25,61,0.36)' }, soldText: { backgroundColor: 'rgba(248,243,237,0.8)', color: COLORS.navy, fontSize: 13, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6 }, cardInfo: { flex: 1, padding: 14, justifyContent: 'space-between' }, nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, productName: { flex: 1, color: COLORS.cream, fontSize: 16, fontWeight: '700' }, purchaseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, stepper: { width: 75, height: 31, borderRadius: 16, backgroundColor: COLORS.cream, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, step: { color: COLORS.muted, fontSize: 20, fontWeight: '600' }, quantity: { color: COLORS.navy, fontSize: 14, fontWeight: '800' }, customise: { color: '#B7BEC9', fontSize: 12, fontWeight: '600' }, price: { color: COLORS.cream, fontSize: 16, fontWeight: '800' }, loading: { marginTop: 48 }, empty: { color: COLORS.muted, textAlign: 'center', marginTop: 48, fontSize: 16 },
  cartBar: { position: 'absolute', left: 20, right: 20, bottom: 91, height: 76, borderRadius: 18, backgroundColor: COLORS.navy, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }, count: { width: 45, height: 45, borderRadius: 23, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center' }, countText: { color: COLORS.cream, fontSize: 20, fontWeight: '800' }, cartLabel: { flex: 1, color: COLORS.cream, fontSize: 20, fontWeight: '700' }, cartTotal: { color: COLORS.mint, fontSize: 18, fontWeight: '800' }, footer: { position: 'absolute', bottom: 13, left: 0, right: 0, height: 90, borderRadius: 45, backgroundColor: COLORS.navy, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 15 }, footerItem: { width: 75, alignItems: 'center', gap: 3 }, footerText: { color: COLORS.cream, fontSize: 12, fontWeight: '600' }, footerTextActive: { color: COLORS.mint },
});
