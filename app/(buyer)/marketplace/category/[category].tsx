import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, ImageBackground, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../../lib/supabase';
import { useCartStore } from '../../../../store/cartstore';
import { CartToast } from '../../../../components/CartToast';

type CategoryProduct = { id: string; vendor_id: string; name: string; price: number; image_url: string | null; marketplace_subcategory: string | null; category: string | null; status: 'available' | 'sold_out' };
type CategoryConfig = { title: string; description: string; image: number; subcategories: string[] };

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  meals: { title: 'Meals', description: 'Freshly prepared meals from your favourite campus vendors.', image: require('../../../../assets/images/home/category-meals.png'), subcategories: ['Quick', 'Rice', 'Local', 'Grills'] },
  cakes: { title: 'Cakes', description: 'We love cake on both good days and bad days because they are simply perfect, decadent, indulgent, delicious, sweet....ok we think you get it.', image: require('../../../../assets/images/home/cakes.png'), subcategories: ['Quick', 'Cupcakes', 'Bentos', 'Birthdays'] },
  'fast-food': { title: 'Fast food', description: 'Quick, satisfying favourites made for busy days and late cravings.', image: require('../../../../assets/images/home/fastfood.png'), subcategories: ['Burgers', 'Shawarma', 'Snacks', 'Combos'] },
  'ice-cream': { title: 'Ice-cream', description: 'Cool down with sweet scoops, sundaes and frozen treats.', image: require('../../../../assets/images/home/category-ice-cream.png'), subcategories: ['Scoops', 'Sundaes', 'Milkshakes', 'Toppings'] },
  dairy: { title: 'Dairy', description: 'Everyday dairy essentials, chilled and ready when you need them.', image: require('../../../../assets/images/home/dairy.png'), subcategories: ['Milk', 'Yoghurt', 'Cheese', 'Cream'] },
  drinks: { title: 'Drinks', description: 'Refresh yourself with a variety of beverages.', image: require('../../../../assets/images/home/Sprite.png'), subcategories: ['Sodas', 'Juices', 'Mocktails', 'Teas'] },
};

export default function MarketplaceCategoryPage() {
  const router = useRouter();
  const { category } = useLocalSearchParams<{ category: string }>();
  const { width: viewportWidth } = useWindowDimensions();
  const width = Math.min(viewportWidth, 430);
  const key = (category ?? 'meals').toLowerCase();
  const config = CATEGORY_CONFIG[key] ?? CATEGORY_CONFIG.meals;
  const [products, setProducts] = useState<CategoryProduct[]>([]);
  const [activeSubcategory, setActiveSubcategory] = useState('All');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [cartToast, setCartToast] = useState('');
  const { addItem, changeQuantity } = useCartStore();
  const [loading, setLoading] = useState(true);
  const cardWidth = (width - 44) / 2;

  useEffect(() => {
    const loadProducts = async () => {
      setLoading(true);
      const fields = 'id, vendor_id, name, price, image_url, marketplace_subcategory, category, status';
      const [{ data, error }, { data: placementRows }] = await Promise.all([
        supabase.from('products').select(fields).eq('marketplace_category', key).in('status', ['available', 'sold_out']),
        supabase.from('product_category_placements').select('product_id').eq('section', 'marketplace').eq('category', key),
      ]);
      const placementIds = (placementRows ?? []).map((placement) => placement.product_id);
      const { data: placedProducts } = placementIds.length ? await supabase.from('products').select(fields).in('id', placementIds).in('status', ['available', 'sold_out']) : { data: [] as CategoryProduct[] };
      if (error) {
        const legacy = await supabase.from('products').select(fields).eq('category', config.title).in('status', ['available', 'sold_out']);
        setProducts(Array.from(new Map([...(legacy.data ?? []) as CategoryProduct[], ...(placedProducts ?? []) as CategoryProduct[]].map((product) => [product.id, product])).values()));
      } else setProducts(Array.from(new Map([...(data ?? []) as CategoryProduct[], ...(placedProducts ?? []) as CategoryProduct[]].map((product) => [product.id, product])).values()));
      setLoading(false);
    };
    void loadProducts();
  }, [config.title, key]);

  const filtered = useMemo(() => activeSubcategory === 'All' ? products : products.filter((product) => product.marketplace_subcategory === activeSubcategory), [activeSubcategory, products]);
  const updateQuantity = (product: CategoryProduct, amount: number) => {
    if (product.status !== 'available') return;
    setQuantities((current) => ({ ...current, [product.id]: Math.max(0, (current[product.id] ?? 0) + amount) }));
    if (amount > 0) { addItem({ productId: product.id, name: product.name, category: product.marketplace_subcategory ?? product.category, price: product.price, imageUrl: product.image_url }); setCartToast(`${product.name} added to cart`); }
    else changeQuantity(product.id, amount);
  };
  const openProduct = (product: CategoryProduct) => router.push({ pathname: '/(buyer)/marketplace/[vendorId]/[productId]', params: { vendorId: product.vendor_id, productId: product.id } });
  // Vendors set their own marketplace subcategories in the portal. The broad
  // category (for example, Cakes) stays consistent for discovery, while the
  // tabs reflect the actual catalogue currently available.
  const tabs = ['All', ...Array.from(new Set(products.map((product) => product.marketplace_subcategory?.trim()).filter((subcategory): subcategory is string => Boolean(subcategory))))];

  return <View style={styles.screen}>
    <StatusBar style="dark" />
    <FlatList data={filtered} keyExtractor={(item) => item.id} numColumns={2} columnWrapperStyle={[styles.productRow, { paddingHorizontal: 16, gap: 12, justifyContent: 'flex-start' }]} contentContainerStyle={styles.list}
      ListHeaderComponent={<><ImageBackground source={config.image} style={styles.hero} imageStyle={styles.heroImage}><View style={styles.heroShade} /><TouchableOpacity style={styles.backButton} onPress={() => router.back()}><Ionicons name="arrow-back-outline" size={22} color="#F8F3ED" /></TouchableOpacity></ImageBackground><View style={styles.details}><Text style={styles.title}>{config.title}</Text><Text style={styles.description}>{config.description}</Text><View style={styles.meta}><Ionicons name="star" size={19} color="#D8B804" /><Text style={styles.metaText}>4.9</Text><Ionicons name="time-outline" size={19} color="#01193D" /><Text style={styles.metaText}>50–80 mins</Text><Ionicons name="walk-outline" size={19} color="#01193D" /><Text style={styles.metaText}>Pickup</Text><Ionicons name="bicycle-outline" size={19} color="#01193D" /><Text style={styles.metaText}>Delivery</Text></View></View><FlatList horizontal data={tabs} keyExtractor={(item) => item} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} renderItem={({ item }) => <TouchableOpacity style={styles.tab} onPress={() => setActiveSubcategory(item)}><Text style={[styles.tabText, activeSubcategory === item && styles.tabTextActive]}>{item}</Text>{activeSubcategory === item && <View style={styles.tabLine} />}</TouchableOpacity>} /></>}
      renderItem={({ item }) => <View style={[styles.productCard, { width: cardWidth }]}><TouchableOpacity onPress={() => openProduct(item)} accessibilityLabel={`View ${item.name}`}><View style={styles.productPhoto}>{item.image_url ? <Image source={{ uri: item.image_url }} style={styles.productImage} /> : <Image source={config.image} style={styles.productImage} />}</View></TouchableOpacity><View style={styles.productBar}><View style={styles.productTitleRow}><TouchableOpacity style={styles.productNamePressable} onPress={() => openProduct(item)}><Text numberOfLines={1} style={styles.productName}>{item.name}</Text></TouchableOpacity>{item.status === 'available' ? <TouchableOpacity onPress={() => updateQuantity(item, 1)}><Ionicons name="cart-outline" size={20} color="#F8F3ED" /></TouchableOpacity> : <Text style={styles.soldOutText}>Sold out</Text>}</View><View style={styles.productBottom}>{item.status === 'available' ? <View style={styles.quantity}><TouchableOpacity onPress={() => updateQuantity(item, -1)}><Text style={styles.quantitySign}>-</Text></TouchableOpacity><Text style={styles.quantityValue}>{quantities[item.id] ?? 0}</Text><TouchableOpacity onPress={() => updateQuantity(item, 1)}><Text style={styles.quantitySign}>+</Text></TouchableOpacity></View> : <Text style={styles.stockNotice}>Out of stock</Text>}<Text style={styles.price}>₦ {item.price.toLocaleString('en-NG')}</Text></View></View></View>}
      ListEmptyComponent={loading ? <ActivityIndicator style={styles.loading} size="large" color="#68ECCB" /> : <Text style={styles.empty}>No {config.title.toLowerCase()} available yet.</Text>}
    />
    <CartToast visible={Boolean(cartToast)} message={cartToast} onDismiss={() => setCartToast('')} />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F3ED' }, list: { paddingBottom: 28 }, hero: { width: '100%', height: 300, overflow: 'hidden', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }, heroImage: { width: '100%', height: '100%', borderBottomLeftRadius: 24, borderBottomRightRadius: 24, resizeMode: 'cover' }, heroShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(1,25,61,0.08)' }, backButton: { position: 'absolute', top: 52, left: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(1,25,61,0.35)', alignItems: 'center', justifyContent: 'center' }, details: { paddingHorizontal: 20, paddingTop: 12 }, title: { color: '#01193D', fontSize: 28, fontWeight: '800', marginBottom: 8 }, description: { color: '#111111', fontSize: 15, lineHeight: 19 }, meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 14, marginBottom: 8 }, metaText: { color: '#01193D', fontSize: 12, fontWeight: '600', marginRight: 5 }, tabs: { height: 66, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: 'rgba(160,160,160,0.3)', alignItems: 'center' }, tab: { height: 66, paddingHorizontal: 13, justifyContent: 'center', position: 'relative' }, tabText: { color: '#01193D', fontSize: 16, fontWeight: '500' }, tabTextActive: { fontWeight: '700' }, tabLine: { height: 3, backgroundColor: '#01193D', borderRadius: 2, position: 'absolute', bottom: 0, left: 8, right: 8 }, productRow: { justifyContent: 'space-between', paddingHorizontal: 10, marginBottom: 10 }, productCard: { overflow: 'hidden', borderRadius: 14, backgroundColor: '#01193D' }, productPhoto: { width: '100%', aspectRatio: 1 }, productImage: { width: '100%', height: '100%', resizeMode: 'cover' }, productBar: { padding: 10, gap: 10 }, productTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, productNamePressable: { flex: 1 }, productName: { color: '#F8F3ED', fontSize: 12, fontWeight: '600' }, productBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, quantity: { height: 25, minWidth: 65, paddingHorizontal: 6, borderRadius: 13, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, quantitySign: { color: '#A0A0A0', fontSize: 15, fontWeight: '700' }, quantityValue: { color: '#01193D', fontSize: 11, fontWeight: '700' }, soldOutText: { color: '#FFD9D9', fontSize: 11, fontWeight: '800' }, stockNotice: { color: '#FFD9D9', fontSize: 11, fontWeight: '700' }, price: { color: '#F8F3ED', fontSize: 12, fontWeight: '700' }, loading: { marginTop: 48 }, empty: { color: '#A0A0A0', textAlign: 'center', marginTop: 48, fontSize: 15 },
});
