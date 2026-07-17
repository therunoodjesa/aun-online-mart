import { Dispatch, SetStateAction, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { useCartStore } from '../../../../store/cartstore';
import { FavouriteButton } from '../../../../components/FavouriteButton';
import { isFavourited } from '../../../../lib/favourites';
import { CartToast } from '../../../../components/CartToast';

type Product = { id: string; vendor_id: string; name: string; description: string | null; price: number; category: string | null; image_url: string | null; status: string };
type ProductOption = { id: string; option_group: string; name: string; price_modifier: number; is_available: boolean; selection_mode?: 'multiple' | 'single' };
type Choice = { id: string; name: string; price: number };
type QuantityMap = Record<string, number>;

const price = (amount: number) => `₦${amount.toLocaleString('en-NG')}`;

export default function MarketplaceProductPage() {
  const router = useRouter();
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const addItem = useCartStore((state) => state.addItem);
  const [product, setProduct] = useState<Product | null>(null);
  const [vendorName, setVendorName] = useState('Marketplace');
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [related, setRelated] = useState<Product[]>([]);
  const [optionQuantities, setOptionQuantities] = useState<QuantityMap>({});
  const [singleSelections, setSingleSelections] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [orderCount, setOrderCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [favourite, setFavourite] = useState(false);
  const [cartToast, setCartToast] = useState('');

  useEffect(() => {
    const loadProduct = async () => {
      if (!productId) return;
      setLoading(true);
      const { data } = await supabase.from('products').select('id, vendor_id, name, description, price, category, image_url, status').eq('id', productId).single();
      if (data) {
        const item = data as Product;
        setProduct(item);
        const [{ data: vendor }, { data: optionData }, { data: relatedRows }] = await Promise.all([
          supabase.from('vendors').select('name').eq('id', item.vendor_id).single(),
          supabase.from('product_options').select('id, option_group, name, price_modifier, is_available, selection_mode').eq('product_id', item.id),
          supabase.from('products').select('id, vendor_id, name, description, price, category, image_url, status').eq('vendor_id', item.vendor_id).eq('status', 'available').neq('id', item.id).limit(4),
        ]);
        if (vendor?.name) setVendorName(vendor.name);
        if (optionData) setOptions((optionData as ProductOption[]).filter((option) => option.is_available !== false));
        setRelated((relatedRows ?? []) as Product[]);
        setFavourite(await isFavourited('product', item.id).catch(() => false));
      }
      setLoading(false);
    };
    void loadProduct();
  }, [productId]);

  useEffect(() => {
    if (!productId) return;
    const loadOrderCount = async () => {
      const { data } = await supabase.rpc('get_product_order_count', { p_product_id: productId });
      setOrderCount(typeof data === 'number' ? data : 0);
    };
    void loadOrderCount();
    const channel = supabase.channel(`product-orders-${productId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `product_id=eq.${productId}` }, loadOrderCount)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadOrderCount)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [productId]);

  const optionGroups = useMemo(() => Array.from(options.reduce((groups, option) => { const group = option.option_group?.trim() || 'Options'; groups.set(group, [...(groups.get(group) ?? []), option]); return groups; }, new Map<string, ProductOption[]>()).entries()), [options]);
  const unitPrice = (product?.price ?? 0) + options.reduce((sum, option) => sum + (option.selection_mode === 'single' ? (singleSelections[option.option_group] === option.id ? option.price_modifier : 0) : option.price_modifier * (optionQuantities[option.id] ?? 0)), 0);
  const total = unitPrice * quantity;
  const goBack = () => router.canGoBack() ? router.back() : router.replace('/(buyer)/');
  const changeOptionQuantity = (setQuantities: Dispatch<SetStateAction<QuantityMap>>, id: string, amount: number) => setQuantities((current) => ({ ...current, [id]: Math.max(0, (current[id] ?? 0) + amount) }));

  const addToCart = () => {
    if (!product) return;
    const selectedChoices = options.filter((item) => item.selection_mode === 'single' ? singleSelections[item.option_group] === item.id : (optionQuantities[item.id] ?? 0) > 0);
    const selection = selectedChoices.map((item) => item.selection_mode === 'single' ? item.name : `${item.name} ×${optionQuantities[item.id]}`).join(' · ') || 'No extras';
    const selectionKey = options.map((item) => `${item.id}-${item.selection_mode === 'single' ? (singleSelections[item.option_group] === item.id ? 1 : 0) : (optionQuantities[item.id] ?? 0)}`).join(':');
    for (let count = 0; count < quantity; count += 1) {
      addItem({ productId: `${product.id}:${selectionKey}:${note.trim() || 'no-note'}`, name: `${product.name} · ${selection}`, category: vendorName, price: unitPrice, imageUrl: product.image_url });
    }
    setCartToast(`${product.name} added to cart`);
  };
  const openRelated = (item: Product) => router.push({ pathname: '/(buyer)/marketplace/[vendorId]/[productId]', params: { vendorId: item.vendor_id, productId: item.id } });
  const addRelated = (item: Product) => { addItem({ productId: item.id, name: item.name, category: vendorName, price: item.price, imageUrl: item.image_url }); setCartToast(`${item.name} added to cart`); };

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color="#68ECCB" /></View>;
  if (!product) return <View style={styles.loading}><Text style={styles.notFound}>This item is unavailable.</Text><TouchableOpacity onPress={goBack}><Text style={styles.return}>Return to marketplace</Text></TouchableOpacity></View>;

  return <View style={styles.screen}>
    <StatusBar style="light" />
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        {product.image_url ? <Image source={{ uri: product.image_url }} style={styles.heroImage} /> : <View style={styles.heroFallback}><Ionicons name="restaurant-outline" size={64} color="#68ECCB" /></View>}
        <View style={styles.heroShade} />
        <TouchableOpacity onPress={goBack} style={[styles.circleButton, styles.heroAction]} accessibilityLabel="Go back"><Ionicons name="arrow-back-outline" size={22} color="#F8F3ED" /></TouchableOpacity>
        <FavouriteButton entityType="product" entityId={product.id} style={[styles.heart, styles.heroAction]} />
      </View>

      <View style={styles.details}>
        <Text style={styles.title}>{product.name}</Text>
        <View style={styles.rating}><Ionicons name="star" size={18} color="#D7B300" /><Text style={styles.ratingNumber}>4.9</Text><Text style={styles.orders}>({orderCount} {orderCount === 1 ? 'order' : 'orders'})</Text></View>
        <Text style={styles.description}>{product.description || `A freshly prepared ${product.name.toLowerCase()} from ${vendorName}.`}</Text>

        {optionGroups.map(([group, choices]) => { const isSingleChoice = choices.some((choice) => choice.selection_mode === 'single'); return <View key={group}><Text style={styles.sectionLabel}>{isSingleChoice ? `CHOOSE ONE ${group.toUpperCase()}` : `CHOOSE ${group.toUpperCase()}`}</Text><View style={styles.optionList}>{choices.map((choice) => { const choiceQuantity = optionQuantities[choice.id] ?? 0; const selected = isSingleChoice ? singleSelections[group] === choice.id : choiceQuantity > 0; return <TouchableOpacity key={choice.id} disabled={!isSingleChoice} onPress={() => isSingleChoice && setSingleSelections((current) => ({ ...current, [group]: choice.id }))} style={[styles.optionRow, selected && styles.optionActive]}><Text style={styles.optionName}>{choice.name}</Text><View style={styles.optionRight}><Text style={styles.optionPrice}>{choice.price_modifier ? `+${price(choice.price_modifier)}` : 'Included'}</Text>{isSingleChoice ? <View style={[styles.radioChoice, selected && styles.radioChoiceActive]}>{selected && <View style={styles.radioChoiceDot} />}</View> : <View style={styles.optionCounter}><TouchableOpacity style={styles.optionCounterButton} onPress={() => changeOptionQuantity(setOptionQuantities, choice.id, -1)}><Ionicons name="remove" size={13} color="#00695A" /></TouchableOpacity><Text style={styles.optionCount}>{choiceQuantity}</Text><TouchableOpacity style={styles.optionCounterButton} onPress={() => changeOptionQuantity(setOptionQuantities, choice.id, 1)}><Ionicons name="add" size={13} color="#00695A" /></TouchableOpacity></View>}</View></TouchableOpacity>; })}</View></View>; })}

        <Text style={styles.sectionLabel}>SPECIAL INSTRUCTIONS</Text>
        <View style={styles.noteBox}><Ionicons name="pencil" size={17} color="#7E7E7E" /><TextInput value={note} onChangeText={setNote} placeholder="Write any special request for the vendor" placeholderTextColor="#7E7E7E" style={[styles.noteInput, { paddingVertical: 0, textAlignVertical: 'center', includeFontPadding: false }]} /></View>
        {related.length > 0 && <View style={styles.relatedSection}><Text style={styles.relatedTitle}>Customers also liked</Text><View style={styles.relatedGrid}>{related.map((item) => <View key={item.id} style={styles.relatedCard}><TouchableOpacity onPress={() => openRelated(item)}><Image source={item.image_url ? { uri: item.image_url } : undefined} style={styles.relatedImage} /><Text numberOfLines={1} style={styles.relatedName}>{item.name}</Text></TouchableOpacity><View style={styles.relatedFooter}><Text style={styles.relatedPrice}>{price(item.price)}</Text><TouchableOpacity onPress={() => addRelated(item)} style={styles.relatedCart} accessibilityLabel={`Add ${item.name} to cart`}><Ionicons name="cart" size={17} color="#F8F3ED" /></TouchableOpacity></View></View>)}</View></View>}
      </View>
    </ScrollView>
    <CartToast visible={Boolean(cartToast)} message={cartToast} onDismiss={() => setCartToast('')} />
    <View style={styles.bottomBar}><View style={styles.quantity}><TouchableOpacity style={styles.quantityButton} onPress={() => setQuantity((value) => Math.max(1, value - 1))}><Ionicons name="remove" size={17} color="#68ECCB" /></TouchableOpacity><Text style={styles.quantityText}>{quantity}</Text><TouchableOpacity style={styles.quantityButton} onPress={() => setQuantity((value) => value + 1)}><Ionicons name="add" size={17} color="#68ECCB" /></TouchableOpacity></View><TouchableOpacity style={styles.addButton} onPress={addToCart} disabled={product.status !== 'available'}><Ionicons name="cart" size={20} color="#F8F3ED" /><Text style={styles.addText}>{product.status === 'available' ? `Add to cart · ${price(total)}` : 'Sold out'}</Text></TouchableOpacity></View>
  </View>;
}

const styles = StyleSheet.create({
  heroAction: { width: 44, height: 44, borderRadius: 22 },
  optionCounter: { height: 25, minWidth: 72, borderWidth: 1, borderColor: '#A9B5C4', borderRadius: 13, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 3 },
  optionCounterButton: { width: 19, height: 19, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#68ECCB' },
  optionCount: { minWidth: 14, textAlign: 'center', color: '#01193D', fontSize: 12, fontWeight: '800' },
  radioChoice: { width: 21, height: 21, borderRadius: 11, borderWidth: 2, borderColor: '#9AA7B7', alignItems: 'center', justifyContent: 'center' },
  radioChoiceActive: { borderColor: '#00695A' },
  radioChoiceDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#00695A' },
  screen: { flex: 1, backgroundColor: '#F8F3ED' }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#F8F3ED' }, notFound: { color: '#01193D', fontSize: 18, fontWeight: '700' }, return: { color: '#00695A', fontSize: 15, fontWeight: '700' }, content: { paddingBottom: 120 }, hero: { height: 266, overflow: 'hidden', backgroundColor: '#01193D' }, heroImage: { width: '100%', height: '100%', resizeMode: 'cover' }, heroFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' }, heroShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(1,25,61,0.12)' }, circleButton: { position: 'absolute', top: 52, left: 18, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(1,25,61,0.58)', borderWidth: 1, borderColor: 'rgba(248,243,237,0.7)' }, heart: { position: 'absolute', top: 52, right: 18, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(1,25,61,0.58)' }, details: { paddingHorizontal: 20, paddingTop: 14 }, title: { color: '#01193D', fontSize: 26, fontWeight: '800' }, rating: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }, ratingNumber: { color: '#01193D', fontSize: 12, fontWeight: '800' }, orders: { color: '#7E7E7E', fontSize: 12 }, description: { color: '#151515', fontSize: 14, lineHeight: 19, marginTop: 12 }, sectionLabel: { color: '#8A8A8A', fontSize: 14, fontWeight: '700', marginTop: 18, marginBottom: 9 }, optionList: { gap: 7 }, optionRow: { minHeight: 45, paddingHorizontal: 11, borderRadius: 5, borderWidth: 1, borderColor: '#CDD5E0', backgroundColor: '#E5EAF1', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, optionActive: { borderColor: '#00695A', backgroundColor: '#D9E5EE' }, optionName: { color: '#01193D', fontSize: 14, fontWeight: '600' }, optionRight: { flexDirection: 'row', alignItems: 'center', gap: 9 }, optionPrice: { color: '#7E7E7E', fontSize: 12, fontWeight: '600' }, sides: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, side: { minHeight: 36, paddingHorizontal: 13, borderWidth: 1, borderColor: '#7E7E7E', borderRadius: 18, justifyContent: 'center' }, sideActive: { borderColor: '#00695A', backgroundColor: '#E4F6F1' }, sideText: { color: '#747474', fontSize: 14 }, sideTextActive: { color: '#00695A', fontWeight: '700' }, noteBox: { height: 58, borderRadius: 5, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, gap: 10 }, noteInput: { flex: 1, height: 44, paddingVertical: 0, color: '#01193D', fontSize: 13, lineHeight: 18, textAlignVertical: 'center', includeFontPadding: false }, relatedSection: { marginTop: 28 }, relatedTitle: { color: '#01193D', fontSize: 22, fontWeight: '800', marginBottom: 13 }, relatedGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }, relatedCard: { width: '48%', borderRadius: 14, overflow: 'hidden', backgroundColor: '#01193D' }, relatedImage: { width: '100%', height: 128, backgroundColor: '#DDE3EB', resizeMode: 'cover' }, relatedName: { color: '#F8F3ED', fontSize: 14, fontWeight: '700', marginHorizontal: 10, marginTop: 10 }, relatedFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', margin: 10, marginTop: 7 }, relatedPrice: { color: '#68ECCB', fontSize: 14, fontWeight: '800' }, relatedCart: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00695A' }, bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingVertical: 13, paddingBottom: 24, backgroundColor: '#F8F3ED', borderTopWidth: 1, borderTopColor: 'rgba(1,25,61,0.1)', flexDirection: 'row', alignItems: 'center', gap: 12 }, quantity: { height: 46, paddingHorizontal: 6, borderRadius: 23, backgroundColor: '#01193D', flexDirection: 'row', alignItems: 'center', gap: 9 }, quantityButton: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#68ECCB', alignItems: 'center', justifyContent: 'center' }, quantityText: { color: '#F8F3ED', minWidth: 12, textAlign: 'center', fontWeight: '700' }, addButton: { flex: 1, height: 52, borderRadius: 10, backgroundColor: '#01193D', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, addText: { color: '#F8F3ED', fontSize: 16, fontWeight: '700' },
});
