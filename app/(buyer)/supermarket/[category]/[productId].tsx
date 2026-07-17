import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { useCartStore } from '../../../../store/cartstore';
import { FavouriteButton } from '../../../../components/FavouriteButton';
import { isFavourited } from '../../../../lib/favourites';
import { CartToast } from '../../../../components/CartToast';

const COLORS = { navy: '#01193D', mint: '#68ECCB', cream: '#F8F3ED', white: '#FFFFFF', muted: '#8793A5', line: '#D7DEE8' } as const;
const FALLBACK_IMAGE = require('../../../../assets/images/home/all-products.png');

type Product = { id: string; vendor_id: string | null; name: string; description: string | null; price: number; image_url: string | null; category: string | null; status: string };
type ProductOption = { id: string; option_group: string; name: string; price_modifier: number; is_available: boolean };

const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG')}`;
const colourValue = (name: string) => {
  if (name.startsWith('#')) return name;
  const named: Record<string, string> = { black: '#161616', white: '#FAF8F3', cream: '#F5EBDD', beige: '#D6B58C', brown: '#805333', blue: '#6E97CD', navy: '#01193D', green: '#00694D', red: '#C84D4D', pink: '#EA83A6', purple: '#765B9E', yellow: '#FFD34D', orange: '#E68031', grey: '#8C929B', gray: '#8C929B', silver: '#C8CCD2', gold: '#C6A25A' };
  return named[name.trim().toLowerCase()] ?? '#A8B2C1';
};

export default function SupermarketProductPage() {
  const router = useRouter();
  const { productId, category } = useLocalSearchParams<{ productId: string; category: string }>();
  const addItem = useCartStore((state) => state.addItem);
  const [product, setProduct] = useState<Product | null>(null);
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [recommended, setRecommended] = useState<Product[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [selectedColour, setSelectedColour] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [favourite, setFavourite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cartToast, setCartToast] = useState('');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!productId) return;
      setLoading(true);
      const { data } = await supabase.from('products').select('id, vendor_id, name, description, price, image_url, category, status').eq('id', productId).single();
      if (!data) { if (mounted) setLoading(false); return; }
      const item = data as Product;
      const [{ data: optionRows }, { data: relatedRows }] = await Promise.all([
        supabase.from('product_options').select('id, option_group, name, price_modifier, is_available').eq('product_id', item.id).eq('is_available', true),
        supabase.from('products').select('id, vendor_id, name, description, price, image_url, category, status').eq('status', 'available').is('marketplace_category', null).eq('category', item.category ?? '').neq('id', item.id).limit(6),
      ]);
      if (!mounted) return;
      const availableOptions = (optionRows ?? []) as ProductOption[];
      const colourOptions = availableOptions.filter((option) => /colou?r|shade|finish/i.test(option.option_group));
      setProduct(item);
      setOptions(availableOptions);
      setRecommended((relatedRows ?? []) as Product[]);
      setSelectedColour(colourOptions[0]?.id ?? null);
      setFavourite(await isFavourited('product', item.id).catch(() => false));
      setLoading(false);
    };
    void load();
    return () => { mounted = false; };
  }, [productId]);

  const colourOptions = useMemo(() => options.filter((option) => /colou?r|shade|finish/i.test(option.option_group)), [options]);
  const selectedOption = colourOptions.find((option) => option.id === selectedColour) ?? null;
  const unitPrice = (product?.price ?? 0) + (selectedOption?.price_modifier ?? 0);
  const total = unitPrice * quantity;
  const goBack = () => router.canGoBack() ? router.back() : router.replace({ pathname: '/(buyer)/supermarket/[category]', params: { category: category || 'all-products' } });
  const addToCart = () => {
    if (!product) return;
    const variant = selectedOption ? ` · ${selectedOption.name}` : '';
    for (let item = 0; item < quantity; item += 1) {
      addItem({ productId: `${product.id}:${selectedOption?.id ?? 'default'}:${note.trim() || 'no-note'}`, name: `${product.name}${variant}`, category: product.category, price: unitPrice, imageUrl: product.image_url });
    }
    setCartToast(`${product.name} added to cart`);
  };
  const openRecommendation = (item: Product) => router.push({ pathname: '/(buyer)/supermarket/[category]/[productId]', params: { category: category || 'all-products', productId: item.id } });

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.mint} /></View>;
  if (!product) return <View style={styles.loading}><Text style={styles.unavailable}>This product is unavailable.</Text><TouchableOpacity onPress={goBack}><Text style={styles.return}>Return to supermarket</Text></TouchableOpacity></View>;

  return <View style={styles.screen}>
    <StatusBar style="light" />
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Image source={product.image_url ? { uri: product.image_url } : FALLBACK_IMAGE} style={styles.heroImage} />
        <TouchableOpacity style={[styles.heroButton, styles.backButton]} onPress={goBack} accessibilityLabel="Go back"><Ionicons name="arrow-back-outline" size={28} color={COLORS.white} /></TouchableOpacity>
        <FavouriteButton entityType="product" entityId={product.id} style={[styles.heroButton, styles.heart]} />
      </View>
      <View style={styles.details}>
        <View style={styles.titleRow}><Text style={styles.name}>{product.name}</Text><Text style={styles.price}>{money(unitPrice)}</Text></View>
        <Text style={styles.category}>{product.category || 'Supermarket item'}</Text>
        {colourOptions.length > 0 && <View style={styles.colours}><View><Text style={styles.sectionTitle}>COLOUR</Text><Text style={styles.selectedColour}>{selectedOption?.name ?? 'Select a colour'}</Text></View><View style={styles.swatches}>{colourOptions.map((option) => <TouchableOpacity key={option.id} onPress={() => setSelectedColour(option.id)} style={[styles.swatch, { backgroundColor: colourValue(option.name) }, selectedColour === option.id && styles.swatchSelected]} accessibilityLabel={`Select ${option.name}`} />)}</View></View>}
        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>PRODUCT DETAILS</Text>
        {product.description?.trim() ? <Text style={styles.description}>{product.description}</Text> : null}
        <Text style={styles.sectionTitle}>SPECIAL INSTRUCTIONS</Text>
        <View style={styles.noteBox}><Ionicons name="pencil" size={19} color={COLORS.muted} /><TextInput value={note} onChangeText={setNote} placeholder="Write any special note for the vendor" placeholderTextColor="#80858E" style={styles.noteInput} /></View>
        {recommended.length > 0 && <><Text style={styles.recommendationTitle}>Customers also liked</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recommendations}>{recommended.map((item) => <TouchableOpacity key={item.id} style={styles.recommendation} onPress={() => openRecommendation(item)}><Image source={item.image_url ? { uri: item.image_url } : FALLBACK_IMAGE} style={styles.recommendationImage} /><Text numberOfLines={1} style={styles.recommendationName}>{item.name}</Text><Text style={styles.recommendationPrice}>{money(item.price)}</Text></TouchableOpacity>)}</ScrollView></>}
      </View>
    </ScrollView>
    <CartToast visible={Boolean(cartToast)} message={cartToast} onDismiss={() => setCartToast('')} />
    <View style={styles.bottomBar}><View style={styles.quantity}><TouchableOpacity onPress={() => setQuantity((value) => Math.max(1, value - 1))} style={styles.quantityButton}><Ionicons name="remove" size={18} color={COLORS.mint} /></TouchableOpacity><Text style={styles.quantityText}>{quantity}</Text><TouchableOpacity onPress={() => setQuantity((value) => value + 1)} style={styles.quantityButton}><Ionicons name="add" size={18} color={COLORS.mint} /></TouchableOpacity></View><TouchableOpacity onPress={addToCart} style={styles.addButton} disabled={product.status !== 'available'}><Text style={styles.addText}>{product.status === 'available' ? `Add to cart · ${money(total)}` : 'Sold out'}</Text><Ionicons name="cart" size={22} color={COLORS.white} /></TouchableOpacity></View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.navy, gap: 14 },
  unavailable: { color: COLORS.white, fontSize: 19, fontWeight: '700' }, return: { color: COLORS.mint, fontSize: 16, fontWeight: '700' }, content: { paddingBottom: 114 },
  hero: { height: 360, backgroundColor: '#E6EAF0', overflow: 'hidden', borderBottomLeftRadius: 30, borderBottomRightRadius: 30 }, heroImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  heroButton: { position: 'absolute', top: 54, width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(1,25,61,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.72)' }, backButton: { left: 20 }, heart: { right: 20, backgroundColor: 'rgba(1,25,61,0.5)', borderWidth: 0 },
  details: { padding: 20 }, titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }, name: { flex: 1, color: COLORS.navy, fontSize: 30, lineHeight: 36, fontWeight: '800' }, price: { color: COLORS.navy, fontSize: 21, fontWeight: '800', marginTop: 6 }, category: { color: '#68758A', fontSize: 15, marginTop: 7 },
  sectionTitle: { color: '#7B8490', fontSize: 14, fontWeight: '800', letterSpacing: 0.2, marginTop: 20, marginBottom: 9 }, colours: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, selectedColour: { color: COLORS.navy, fontSize: 16, fontWeight: '700', marginTop: 2 }, swatches: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, flex: 1 }, swatch: { width: 33, height: 33, borderRadius: 17, borderWidth: 2, borderColor: COLORS.white, elevation: 1 }, swatchSelected: { borderColor: COLORS.navy, borderWidth: 3, transform: [{ scale: 1.08 }] },
  divider: { height: 1, backgroundColor: COLORS.line, marginTop: 20 }, description: { color: '#283447', fontSize: 17, lineHeight: 25 }, noteBox: { height: 64, borderRadius: 10, backgroundColor: '#F7F4EF', paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 12 }, noteInput: { flex: 1, height: 52, paddingVertical: 0, color: COLORS.navy, fontSize: 15, textAlignVertical: 'center', includeFontPadding: false },
  recommendationTitle: { color: COLORS.navy, fontSize: 21, fontWeight: '800', marginTop: 30, marginBottom: 14 }, recommendations: { gap: 13, paddingRight: 20 }, recommendation: { width: 154, borderRadius: 14, overflow: 'hidden', backgroundColor: '#F2F4F7', paddingBottom: 11 }, recommendationImage: { width: '100%', height: 128, resizeMode: 'cover' }, recommendationName: { color: COLORS.navy, fontSize: 14, fontWeight: '700', marginHorizontal: 10, marginTop: 9 }, recommendationPrice: { color: '#176E73', fontSize: 13, fontWeight: '800', marginHorizontal: 10, marginTop: 4 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, minHeight: 88, paddingHorizontal: 20, paddingTop: 13, paddingBottom: 23, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: '#E2E6EC', flexDirection: 'row', alignItems: 'center', gap: 13 }, quantity: { height: 52, minWidth: 106, borderRadius: 26, backgroundColor: COLORS.navy, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, quantityButton: { width: 33, height: 33, borderRadius: 17, borderWidth: 1, borderColor: COLORS.mint, alignItems: 'center', justifyContent: 'center' }, quantityText: { color: COLORS.white, fontSize: 17, fontWeight: '800' }, addButton: { flex: 1, height: 54, borderRadius: 12, backgroundColor: COLORS.navy, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, addText: { color: COLORS.white, fontSize: 16, fontWeight: '800' },
});
