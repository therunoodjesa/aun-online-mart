import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useCartStore } from '../../../store/cartstore';
import { FavouriteButton } from '../../../components/FavouriteButton';
import { isFavourited } from '../../../lib/favourites';
import { CartToast } from '../../../components/CartToast';

const CAFETERIA_FALLBACK = require('../../../assets/images/home/jollof-promo.png');
type Product = { id: string; name: string; description: string | null; category: string; price: number; image_url: string | null; status: 'available' | 'sold_out' | 'hidden'; meal_plan_eligible: boolean };
type ProductOption = { id: string; option_group: string; name: string; price_modifier: number; is_available: boolean };
const price = (amount: number) => `₦${amount.toLocaleString('en-NG')}`;

export default function CafeteriaProductPage() {
  const router = useRouter();
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const addItem = useCartStore((state) => state.addItem);
  const [product, setProduct] = useState<Product | null>(null);
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [related, setRelated] = useState<Product[]>([]);
  const [proteinId, setProteinId] = useState<string | null>(null);
  const [sideId, setSideId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  const [favourite, setFavourite] = useState(false);
  const [cartToast, setCartToast] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!productId) return;
      setLoading(true);
      const { data } = await supabase.from('cafeteria_products').select('id, name, description, category, price, image_url, status, meal_plan_eligible').eq('id', productId).single();
      if (!active) return;
      setProduct((data as Product | null) ?? null);
      const { data: optionData } = await supabase.from('product_options').select('id, option_group, name, price_modifier, is_available').eq('product_id', productId).eq('is_available', true);
      const { data: relatedRows } = data ? await supabase.from('cafeteria_products').select('id, name, description, category, price, image_url, status, meal_plan_eligible').eq('category', (data as Product).category).eq('status', 'available').neq('id', productId).limit(4) : { data: [] };
      if (active) { setOptions((optionData ?? []) as ProductOption[]); setRelated((relatedRows ?? []) as Product[]); setFavourite(await isFavourited('cafeteria_product', productId).catch(() => false)); setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [productId]);

  const proteins = useMemo(() => options.filter((option) => /protein/i.test(option.option_group)), [options]);
  const sides = useMemo(() => options.filter((option) => /side/i.test(option.option_group)), [options]);
  const protein = proteins.find((option) => option.id === proteinId);
  const side = sides.find((option) => option.id === sideId);
  const unitPrice = (product?.price ?? 0) + (protein?.price_modifier ?? 0) + (side?.price_modifier ?? 0);
  const total = unitPrice * quantity;
  const goBack = () => router.canGoBack() ? router.back() : router.replace('/(buyer)/cafeteria');
  const addToCart = () => {
    if (!product) return;
    const choices = [protein?.name, side?.name].filter(Boolean).join(' · ') || 'No extras';
    const key = `${product.id}:${proteinId ?? 'none'}:${sideId ?? 'none'}:${note.trim() || 'no-note'}`;
    for (let index = 0; index < quantity; index += 1) addItem({ productId: `cafeteria:${key}`, name: `${product.name} · ${choices}`, category: `Cafeteria · ${product.category}`, price: unitPrice, imageUrl: product.image_url, mealPlanEligible: product.meal_plan_eligible });
    setCartToast(`${product.name} added to cart`);
  };
  const openRelated = (item: Product) => router.push({ pathname: '/(buyer)/cafeteria/[productId]', params: { productId: item.id } });
  const addRelated = (item: Product) => { addItem({ productId: `cafeteria:${item.id}`, name: item.name, category: `Cafeteria · ${item.category}`, price: item.price, imageUrl: item.image_url, mealPlanEligible: item.meal_plan_eligible }); setCartToast(`${item.name} added to cart`); };

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color="#68ECCB" /></View>;
  if (!product) return <View style={styles.loading}><Text style={styles.notFound}>This cafeteria item is unavailable.</Text><TouchableOpacity onPress={goBack}><Text style={styles.return}>Return to cafeteria</Text></TouchableOpacity></View>;

  return <View style={styles.screen}><StatusBar style="light" />
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}><Image source={product.image_url && !heroImageFailed ? { uri: product.image_url } : CAFETERIA_FALLBACK} onError={() => setHeroImageFailed(true)} style={styles.heroImage} /><View style={styles.heroShade} /><TouchableOpacity onPress={goBack} style={styles.back} accessibilityLabel="Go back"><Ionicons name="arrow-back-outline" size={24} color="#F8F3ED" /></TouchableOpacity><FavouriteButton entityType="cafeteria_product" entityId={product.id} style={styles.heart} /></View>
      <View style={styles.details}><Text style={styles.title}>{product.name}</Text><View style={styles.rating}><Ionicons name="star" size={18} color="#D7B300" /><Text style={styles.ratingNumber}>4.9</Text><Text style={styles.orders}>(0 orders)</Text></View><Text style={styles.description}>{product.description || `Freshly prepared ${product.name.toLowerCase()} from the cafeteria.`}</Text>
        {proteins.length > 0 && <><Text style={styles.sectionLabel}>CHOOSE PROTEIN</Text><View style={styles.optionList}>{proteins.map((choice) => { const selected = choice.id === proteinId; return <TouchableOpacity key={choice.id} style={[styles.optionRow, selected && styles.optionActive]} onPress={() => setProteinId(selected ? null : choice.id)}><Text style={styles.optionName}>{choice.name}</Text><View style={styles.optionRight}><Text style={styles.optionPrice}>{choice.price_modifier ? `+${price(choice.price_modifier)}` : 'Included'}</Text><View style={[styles.radio, selected && styles.radioActive]}>{selected && <Ionicons name="checkmark" size={13} color="#F8F3ED" />}</View></View></TouchableOpacity>; })}</View></>}
        {sides.length > 0 && <><Text style={styles.sectionLabel}>CHOOSE SIDE</Text><View style={styles.sides}>{sides.map((choice) => { const selected = choice.id === sideId; return <TouchableOpacity key={choice.id} style={[styles.side, selected && styles.sideActive]} onPress={() => setSideId(selected ? null : choice.id)}><Text style={[styles.sideText, selected && styles.sideTextActive]}>{choice.name}{choice.price_modifier ? ` +${price(choice.price_modifier)}` : ''}</Text></TouchableOpacity>; })}</View></>}
        {!proteins.length && !sides.length && <View style={styles.readyCard}><Ionicons name="restaurant-outline" size={22} color="#00695A" /><Text style={styles.readyText}>This item is ready to order. Adjust the quantity below and add it to your cart.</Text></View>}
        <Text style={styles.sectionLabel}>SPECIAL INSTRUCTIONS</Text><View style={styles.noteBox}><Ionicons name="pencil" size={19} color="#7E7E7E" /><TextInput value={note} onChangeText={setNote} placeholder="Write any special request for the cafeteria" placeholderTextColor="#7E7E7E" style={[styles.noteInput, { height: 54, paddingVertical: 0, textAlignVertical: 'center', includeFontPadding: false }]} /></View>
        {related.length > 0 && <View style={styles.relatedSection}><Text style={styles.relatedTitle}>Customers also liked</Text><View style={styles.relatedGrid}>{related.map((item) => <View key={item.id} style={styles.relatedCard}><TouchableOpacity onPress={() => openRelated(item)}><Image source={item.image_url ? { uri: item.image_url } : CAFETERIA_FALLBACK} style={styles.relatedImage} /><Text numberOfLines={1} style={styles.relatedName}>{item.name}</Text></TouchableOpacity><View style={styles.relatedFooter}><Text style={styles.relatedPrice}>{price(item.price)}</Text><TouchableOpacity onPress={() => addRelated(item)} style={styles.relatedCart} accessibilityLabel={`Add ${item.name} to cart`}><Ionicons name="cart" size={17} color="#F8F3ED" /></TouchableOpacity></View></View>)}</View></View>}
      </View>
    </ScrollView>
    <CartToast visible={Boolean(cartToast)} message={cartToast} onDismiss={() => setCartToast('')} />
    <View style={styles.bottomBar}><View style={styles.quantity}><TouchableOpacity style={styles.quantityButton} onPress={() => setQuantity((value) => Math.max(1, value - 1))}><Ionicons name="remove" size={17} color="#68ECCB" /></TouchableOpacity><Text style={styles.quantityText}>{quantity}</Text><TouchableOpacity style={styles.quantityButton} onPress={() => setQuantity((value) => value + 1)}><Ionicons name="add" size={17} color="#68ECCB" /></TouchableOpacity></View><TouchableOpacity style={styles.addButton} onPress={addToCart} disabled={product.status !== 'available'}><Ionicons name="cart" size={20} color="#F8F3ED" /><Text style={styles.addText}>{product.status === 'available' ? `Add to cart · ${price(total)}` : 'Sold out'}</Text></TouchableOpacity></View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F3ED' }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#F8F3ED' }, notFound: { color: '#01193D', fontSize: 18, fontWeight: '700' }, return: { color: '#00695A', fontSize: 15, fontWeight: '700' }, content: { paddingBottom: 120 }, hero: { height: 266, overflow: 'hidden', backgroundColor: '#01193D' }, heroImage: { width: '100%', height: '100%', resizeMode: 'cover' }, heroShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(1,25,61,0.12)' }, back: { position: 'absolute', top: 52, left: 18, width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(1,25,61,0.58)', borderWidth: 1, borderColor: 'rgba(248,243,237,0.7)' }, heart: { position: 'absolute', top: 52, right: 18, width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(1,25,61,0.58)' }, details: { paddingHorizontal: 20, paddingTop: 18 }, title: { color: '#01193D', fontSize: 30, fontWeight: '800' }, rating: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 }, ratingNumber: { color: '#01193D', fontSize: 14, fontWeight: '800' }, orders: { color: '#7E7E7E', fontSize: 14 }, description: { color: '#151515', fontSize: 17, lineHeight: 23, marginTop: 14 }, sectionLabel: { color: '#757575', fontSize: 15, fontWeight: '800', marginTop: 21, marginBottom: 10 }, optionList: { gap: 8 }, optionRow: { minHeight: 52, paddingHorizontal: 13, borderRadius: 6, borderWidth: 1, borderColor: '#CDD5E0', backgroundColor: '#E5EAF1', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, optionActive: { borderColor: '#00695A', backgroundColor: '#D9E5EE' }, optionName: { color: '#01193D', fontSize: 16, fontWeight: '600' }, optionRight: { flexDirection: 'row', alignItems: 'center', gap: 11 }, optionPrice: { color: '#6B6B6B', fontSize: 14, fontWeight: '600' }, radio: { width: 21, height: 21, borderRadius: 11, borderWidth: 1.5, borderColor: '#8E98A6', alignItems: 'center', justifyContent: 'center' }, radioActive: { backgroundColor: '#00695A', borderColor: '#00695A' }, sides: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, side: { minHeight: 40, paddingHorizontal: 14, borderWidth: 1, borderColor: '#7E7E7E', borderRadius: 20, justifyContent: 'center' }, sideActive: { borderColor: '#00695A', backgroundColor: '#E4F6F1' }, sideText: { color: '#747474', fontSize: 15 }, sideTextActive: { color: '#00695A', fontWeight: '700' }, readyCard: { marginTop: 20, borderRadius: 12, padding: 14, backgroundColor: '#E1F5EE', flexDirection: 'row', alignItems: 'center', gap: 10 }, readyText: { flex: 1, color: '#005B3B', fontSize: 15, lineHeight: 20, fontWeight: '600' }, noteBox: { minHeight: 68, borderRadius: 7, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 11 }, noteInput: { flex: 1, minHeight: 54, paddingVertical: 6, color: '#01193D', fontSize: 15, textAlignVertical: 'center' }, relatedSection: { marginTop: 30 }, relatedTitle: { color: '#01193D', fontSize: 22, fontWeight: '800', marginBottom: 13 }, relatedGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }, relatedCard: { width: '48%', borderRadius: 14, overflow: 'hidden', backgroundColor: '#01193D' }, relatedImage: { width: '100%', height: 132, backgroundColor: '#DDE3EB', resizeMode: 'cover' }, relatedName: { color: '#F8F3ED', fontSize: 14, fontWeight: '700', marginHorizontal: 10, marginTop: 10 }, relatedFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', margin: 10, marginTop: 7 }, relatedPrice: { color: '#68ECCB', fontSize: 14, fontWeight: '800' }, relatedCart: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00695A' }, bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingVertical: 13, paddingBottom: 24, backgroundColor: '#F8F3ED', borderTopWidth: 1, borderTopColor: 'rgba(1,25,61,0.1)', flexDirection: 'row', alignItems: 'center', gap: 12 }, quantity: { height: 48, paddingHorizontal: 6, borderRadius: 24, backgroundColor: '#01193D', flexDirection: 'row', alignItems: 'center', gap: 9 }, quantityButton: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: '#68ECCB', alignItems: 'center', justifyContent: 'center' }, quantityText: { color: '#F8F3ED', minWidth: 12, textAlign: 'center', fontSize: 16, fontWeight: '700' }, addButton: { flex: 1, height: 54, borderRadius: 10, backgroundColor: '#01193D', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, addText: { color: '#F8F3ED', fontSize: 17, fontWeight: '700' },
});
