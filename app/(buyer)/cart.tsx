import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useCartStore } from '../../store/cartstore';
import { supabase } from '../../lib/supabase';
import { calculateCheckout } from '../../lib/checkout';
import { remainingMealPlanCredits, remainingMealPlanLabel } from '../../lib/meal-plan';
import { posthog } from '../../lib/posthog';

type ServerQuote = { subtotal: number; serviceFee: number; packagingFee: number; mealPlanCredit: number; deliveryFee: number; total: number; campusDelivery?: { active?: boolean } };

export default function CartPage() {
  const router = useRouter();
  const { items, changeQuantity, removeItem } = useCartStore();
  const [delivery, setDelivery] = useState<'dispatch' | 'pickup'>('dispatch');
  const [planCount, setPlanCount] = useState(0);
  const [hasMealPlanAccount, setHasMealPlanAccount] = useState(false);
  const [useMealPlan, setUseMealPlan] = useState(false);
  const [note, setNote] = useState('');
  const [promo, setPromo] = useState('');
  const [serverQuote, setServerQuote] = useState<ServerQuote | null>(null);
  const checkout = useMemo(() => calculateCheckout(items, delivery, useMealPlan, planCount), [items, delivery, useMealPlan, planCount]);
  const subtotal = serverQuote?.subtotal ?? checkout.subtotal;
  const deliveryFee = delivery === 'dispatch' ? serverQuote?.deliveryFee ?? checkout.deliveryFee : 0;
  const serviceFee = serverQuote?.serviceFee ?? checkout.serviceFee;
  const packagingFee = serverQuote?.packagingFee ?? checkout.packagingFee;
  const mealPlanCredit = serverQuote?.mealPlanCredit ?? checkout.mealPlanCredit;
  const total = serverQuote?.total ?? checkout.total;
  const cafeteriaEligible = checkout.eligibleSubtotal > 0;
  const hasCafeteria = items.some((item) => item.category?.toLowerCase().startsWith('cafeteria'));

  useEffect(() => {
    const loadMealPlan = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase.from('meal_plan_accounts').select('plan_count, meals_used_today, last_used_on').eq('user_id', auth.user.id).maybeSingle();
      setPlanCount(remainingMealPlanCredits(data));
      setHasMealPlanAccount(Boolean(data));
    };
    void loadMealPlan();
  }, []);

  useEffect(() => {
    if (hasCafeteria) setDelivery('dispatch');
  }, [hasCafeteria]);

  useEffect(() => {
    let active = true;
    const loadQuote = async () => {
      const canUseProductQuote = items.length > 0 && items.every((item) => !item.productId.startsWith('service:'));
      if (!canUseProductQuote) { if (active) setServerQuote(null); return; }
      const quoteItems = items.map((item) => ({ productId: item.productId, quantity: item.quantity, selectedOptions: item.selectedOptions?.map((option) => ({ id: option.id, quantity: option.quantity })), note: item.note ?? null }));
      const { data, error } = await supabase.functions.invoke('checkout-quote', { body: { items: quoteItems, fulfilment: delivery === 'pickup' ? 'pickup' : 'delivery', use_meal_plan: useMealPlan } });
      if (active) setServerQuote(!error && data?.pricing ? data.pricing as ServerQuote : null);
    };
    void loadQuote();
    return () => { active = false; };
  }, [items, delivery, useMealPlan]);

  return <View style={styles.screen}>
    <StatusBar style="light" />
    <View style={styles.header}><TouchableOpacity style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back-outline" size={23} color="#F8F3ED" /></TouchableOpacity><Text style={styles.headerTitle}>Cart</Text><View style={styles.steps}><View style={styles.stepDone}><Ionicons name="checkmark" size={18} color="#01193D" /></View><View style={styles.stepLine} /><View style={styles.step}><Text style={styles.stepText}>2</Text></View><View style={styles.stepLine} /><View style={styles.step}><Text style={styles.stepText}>3</Text></View><View style={styles.stepLine} /><View style={styles.step}><Text style={styles.stepText}>4</Text></View></View></View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {serverQuote?.campusDelivery?.active && delivery === 'dispatch' && <View style={{ marginBottom: 14, borderRadius: 8, padding: 12, backgroundColor: '#E1F5EE', flexDirection: 'row', alignItems: 'center', gap: 9 }}><Ionicons name="location-outline" size={19} color="#175E63" /><Text style={{ flex: 1, color: '#175E63', fontSize: 14, fontWeight: '700' }}>Campus delivery · flat ₦500</Text></View>}
      {serviceFee > 0 && <View style={{ marginBottom: 14, borderRadius: 8, padding: 12, backgroundColor: '#E1F5EE', flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: '#175E63', fontSize: 14, fontWeight: '700' }}>AOM service fee (10%)</Text><Text style={{ color: '#175E63', fontSize: 14, fontWeight: '800' }}>₦ {serviceFee.toLocaleString('en-NG')}</Text></View>}
      {items.length === 0 ? <View style={styles.empty}><Ionicons name="cart-outline" size={52} color="#A0A0A0" /><Text style={styles.emptyTitle}>Your cart is empty</Text><TouchableOpacity style={styles.browseButton} onPress={() => router.back()}><Text style={styles.browseText}>Browse marketplace</Text></TouchableOpacity></View> : <>
        {items.map((item, index) => <View key={item.productId} style={[styles.item, index < items.length - 1 && styles.itemDivider]}><View style={styles.itemImage}>{item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.itemImageFile} /> : <Ionicons name="restaurant-outline" size={34} color="#175E63" />}</View><View style={styles.itemCopy}><Text style={styles.itemName}>{item.name}</Text><Text style={styles.itemCategory}>{item.category || 'Marketplace'}</Text></View><View style={styles.itemActions}><TouchableOpacity onPress={() => removeItem(item.productId)}><Text style={styles.remove}>×</Text></TouchableOpacity><Text style={styles.itemPrice}>₦ {item.price.toLocaleString('en-NG')}</Text><View style={styles.quantity}><TouchableOpacity onPress={() => changeQuantity(item.productId, -1)}><Text style={styles.quantitySign}>−</Text></TouchableOpacity><Text style={styles.quantityValue}>{item.quantity}</Text><TouchableOpacity onPress={() => changeQuantity(item.productId, 1)}><Text style={styles.quantitySign}>+</Text></TouchableOpacity></View></View></View>)}
        <View style={styles.note}><Ionicons name="pencil" size={18} color="#7E7E7E" /><TextInput value={note} onChangeText={setNote} placeholder="Leave an optional note for the vendor(s)" placeholderTextColor="#7E7E7E" style={[styles.noteInput, { height: 48, paddingVertical: 0, textAlignVertical: 'center', includeFontPadding: false }]} /></View>
        <Text style={styles.sectionLabel}>DELIVERY OPTIONS</Text>
        <TouchableOpacity onPress={() => setDelivery('dispatch')} style={[styles.deliveryOption, delivery === 'dispatch' && styles.deliveryActive]}><View style={[styles.deliveryIcon, delivery === 'dispatch' && styles.deliveryIconActive]}><Ionicons name="bicycle-outline" size={25} color={delivery === 'dispatch' ? '#FFFFFF' : '#7E7E7E'} /></View><View><Text style={[styles.deliveryTitle, delivery === 'dispatch' && styles.deliveryTitleActive]}>{hasCafeteria ? 'Room delivery' : 'Dispatch delivery'}</Text><Text style={styles.deliveryDetail}>{hasCafeteria ? 'Est. 15–40 minutes' : 'Est. 45 minutes'}</Text></View><Text style={[styles.deliveryPrice, delivery === 'dispatch' && styles.deliveryPriceActive]}>₦ {(serverQuote?.deliveryFee ?? calculateCheckout(items, 'dispatch', useMealPlan, planCount).deliveryFee).toLocaleString('en-NG')}</Text></TouchableOpacity>
        {!hasCafeteria && <TouchableOpacity onPress={() => setDelivery('pickup')} style={[styles.deliveryOption, delivery === 'pickup' && styles.deliveryActive]}><View style={styles.deliveryIcon}><Ionicons name="walk-outline" size={25} color="#7E7E7E" /></View><View><Text style={styles.deliveryTitle}>Pickup</Text><Text style={styles.deliveryDetail}>Ready in ~15 minutes</Text></View><Text style={styles.deliveryPrice}>Free</Text></TouchableOpacity>}
        {cafeteriaEligible && <TouchableOpacity disabled={hasMealPlanAccount && planCount === 0} onPress={() => setUseMealPlan((value) => !value)} style={[styles.mealPlan, useMealPlan && styles.mealPlanActive]}><Ionicons name="card-outline" size={24} color={useMealPlan ? '#005B3B' : '#7E7E7E'} /><View style={styles.mealPlanCopy}><Text style={styles.mealPlanTitle}>Use meal plan</Text><Text style={styles.mealPlanDetail}>{hasMealPlanAccount ? `${remainingMealPlanLabel(planCount)}${planCount ? ` · up to ₦${(planCount * 1800).toLocaleString('en-NG')}` : ''}` : 'No meal plan available'}</Text></View><Ionicons name={useMealPlan ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={useMealPlan ? '#005B3B' : '#7E7E7E'} /></TouchableOpacity>}
        <View style={styles.promo}><TextInput value={promo} onChangeText={setPromo} placeholder="Enter promo code" placeholderTextColor="#7E7E7E" style={styles.promoInput} /><TouchableOpacity style={styles.apply}><Text style={styles.applyText}>Apply</Text></TouchableOpacity></View>
        {(packagingFee > 0 || mealPlanCredit > 0) && <View style={styles.cafeteriaBreakdown}>{packagingFee > 0 && <Text style={styles.breakdownText}>Packaging · ₦{packagingFee.toLocaleString('en-NG')} ({checkout.mealCount} meal{checkout.mealCount === 1 ? '' : 's'})</Text>}{useMealPlan && mealPlanCredit > 0 && <Text style={styles.credit}>Meal-plan credit applied · −₦{mealPlanCredit.toLocaleString('en-NG')}</Text>}</View>}
        <View style={styles.summary}><View style={styles.summaryRow}><Text style={styles.summaryText}>Items subtotal ({items.reduce((sum, item) => sum + item.quantity, 0)} items)</Text><Text style={styles.summaryText}>₦ {subtotal.toLocaleString('en-NG')}</Text></View>{packagingFee > 0 && <View style={styles.summaryRow}><Text style={styles.summaryText}>Packaging</Text><Text style={styles.summaryText}>₦ {packagingFee.toLocaleString('en-NG')}</Text></View>}{mealPlanCredit > 0 && <View style={styles.summaryRow}><Text style={styles.credit}>Meal-plan credit</Text><Text style={styles.credit}>−₦ {mealPlanCredit.toLocaleString('en-NG')}</Text></View>}<View style={styles.summaryRow}><Text style={styles.summaryText}>Delivery fee</Text><Text style={styles.summaryText}>₦ {deliveryFee.toLocaleString('en-NG')}</Text></View><View style={styles.totalRow}><Text style={styles.totalLabel}>AMOUNT TO PAY</Text><Text style={styles.total}>₦ {total.toLocaleString('en-NG')}</Text></View></View>
        <TouchableOpacity style={styles.proceed} onPress={() => { if (hasCafeteria && !hasMealPlanAccount) { router.push({ pathname: '/(buyer)/profile', params: { edit: 'true' } }); return; } posthog.capture('checkout_started', { item_count: items.reduce((sum, item) => sum + item.quantity, 0), total, fulfilment: delivery, uses_meal_plan: useMealPlan }); if (delivery === 'dispatch') router.push({ pathname: '/(buyer)/delivery', params: { mealPlan: useMealPlan ? 'true' : 'false' } }); else router.push({ pathname: '/(buyer)/payment', params: { fulfilment: 'pickup', mealPlan: useMealPlan ? 'true' : 'false' } }); }}><Text style={styles.proceedText}>{hasCafeteria && !hasMealPlanAccount ? 'COMPLETE PROFILE DETAILS' : delivery === 'dispatch' ? 'PROCEED TO DELIVERY' : 'PROCEED TO PAYMENT'}</Text></TouchableOpacity>
      </>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, header: { height: 152, backgroundColor: '#01193D', paddingTop: 44, alignItems: 'center' }, back: { position: 'absolute', top: 44, left: 26, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F8F3ED' }, headerTitle: { color: '#F8F3ED', fontSize: 24, fontWeight: '700', marginTop: 4 }, steps: { position: 'absolute', left: 26, right: 26, bottom: 16, flexDirection: 'row', alignItems: 'center' }, step: { width: 43, height: 43, borderRadius: 22, backgroundColor: '#DA6B04', alignItems: 'center', justifyContent: 'center' }, stepDone: { width: 43, height: 43, borderRadius: 22, backgroundColor: '#F8F3ED', alignItems: 'center', justifyContent: 'center' }, stepText: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' }, stepLine: { flex: 1, height: 2, marginHorizontal: 8, backgroundColor: '#F8F3ED' }, content: { padding: 20, paddingBottom: 42 }, item: { minHeight: 112, flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }, itemDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(126,126,126,0.3)' }, itemImage: { width: 90, height: 90, borderRadius: 45, overflow: 'hidden', borderWidth: 2, borderColor: '#01193D', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F3ED' }, itemImageFile: { width: '100%', height: '100%', resizeMode: 'cover' }, itemCopy: { flex: 1, marginLeft: 16 }, itemName: { color: '#01193D', fontSize: 15, fontWeight: '600' }, itemCategory: { color: '#7E7E7E', fontSize: 14, marginTop: 5 }, itemActions: { alignItems: 'flex-end', width: 82 }, remove: { color: 'rgba(126,126,126,0.55)', fontSize: 20, fontWeight: '700', marginBottom: 2 }, itemPrice: { color: '#175E63', fontSize: 16, fontWeight: '700' }, quantity: { width: 65, height: 25, borderWidth: 1, borderColor: '#A0A0A0', borderRadius: 13, marginTop: 4, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }, quantitySign: { color: '#01193D', fontWeight: '700', fontSize: 14 }, quantityValue: { color: '#01193D', fontWeight: '600', fontSize: 11 }, note: { height: 68, marginTop: 20, borderRadius: 5, backgroundColor: '#F8F3ED', flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18 }, noteInput: { flex: 1, color: '#01193D', fontSize: 14 }, sectionLabel: { color: '#A0A0A0', fontWeight: '600', fontSize: 16, marginTop: 18, marginBottom: 8 }, deliveryOption: { height: 80, borderWidth: 1, borderColor: '#7E7E7E', borderRadius: 5, marginBottom: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }, deliveryActive: { backgroundColor: '#E1F5EE', borderColor: '#005B3B' }, deliveryIcon: { width: 50, height: 50, borderRadius: 8, borderWidth: 1, borderColor: '#7E7E7E', alignItems: 'center', justifyContent: 'center' }, deliveryIconActive: { backgroundColor: '#175E63', borderColor: '#175E63' }, deliveryTitle: { color: '#111111', fontSize: 15, fontWeight: '600' }, deliveryTitleActive: { color: '#005B3B' }, deliveryDetail: { color: '#7E7E7E', fontSize: 12, marginTop: 2 }, deliveryPrice: { marginLeft: 'auto', color: '#7E7E7E', fontSize: 16, fontWeight: '600' }, deliveryPriceActive: { color: '#175E63', fontWeight: '700' }, mealPlan: { minHeight: 70, marginTop: 4, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#7E7E7E', flexDirection: 'row', alignItems: 'center', gap: 10 }, mealPlanActive: { borderColor: '#005B3B', backgroundColor: '#E1F5EE' }, mealPlanCopy: { flex: 1 }, mealPlanTitle: { color: '#111111', fontSize: 15, fontWeight: '700' }, mealPlanDetail: { color: '#7E7E7E', fontSize: 12, marginTop: 3 }, promo: { height: 50, marginTop: 4, borderWidth: 1, borderColor: 'rgba(0,0,0,0.39)', borderRadius: 7, backgroundColor: 'rgba(217,217,217,0.29)', padding: 7, flexDirection: 'row' }, promoInput: { flex: 1, paddingHorizontal: 12, color: '#01193D' }, apply: { width: 75, borderRadius: 7, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center' }, applyText: { color: '#FFFFFF', fontWeight: '600' }, cafeteriaBreakdown: { marginTop: 10, padding: 11, borderRadius: 7, backgroundColor: '#E1F5EE', gap: 4 }, breakdownText: { color: '#175E63', fontSize: 13, fontWeight: '700' }, credit: { color: '#005B3B', fontSize: 13, fontWeight: '800' }, summary: { borderWidth: 1, borderColor: '#01193D', borderRadius: 8, padding: 14, marginTop: 22, gap: 8 }, summaryRow: { flexDirection: 'row', justifyContent: 'space-between' }, summaryText: { color: '#7E7E7E', fontSize: 15 }, totalRow: { borderTopWidth: 1, borderTopColor: 'rgba(126,126,126,0.3)', marginTop: 5, paddingTop: 11, flexDirection: 'row', justifyContent: 'space-between' }, totalLabel: { color: '#000000', fontSize: 17, fontWeight: '700' }, total: { color: '#175E63', fontSize: 17, fontWeight: '700' }, proceed: { height: 50, borderRadius: 7, backgroundColor: '#01193D', marginTop: 20, alignItems: 'center', justifyContent: 'center' }, proceedText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' }, empty: { alignItems: 'center', paddingTop: 100, gap: 15 }, emptyTitle: { color: '#01193D', fontSize: 19, fontWeight: '700' }, browseButton: { backgroundColor: '#01193D', borderRadius: 7, paddingHorizontal: 18, paddingVertical: 12 }, browseText: { color: '#FFFFFF', fontWeight: '600' },
});
