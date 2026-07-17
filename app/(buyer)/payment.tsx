import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ExpoLinking from 'expo-linking';
import { useCartStore } from '../../store/cartstore';
import { supabase } from '../../lib/supabase';
import { calculateCheckout } from '../../lib/checkout';

type Method = 'paystack' | 'transfer';
type PickupLocation = { id: string; name: string; pickup_location: string | null; pickup_instructions: string | null };
const PENDING_PAYMENT_REFERENCE = 'aom_pending_paystack_reference';
const money = (value: number) => `\u20A6${value.toLocaleString('en-NG')}`;

export default function PaymentPage() {
  const router = useRouter();
  const { address, slot, fulfilment, mealPlan, reference: returnedReference, trxref } = useLocalSearchParams<{ address?: string; slot?: string; fulfilment?: string; mealPlan?: string; reference?: string; trxref?: string }>();
  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clearCart);
  const [method, setMethod] = useState<Method>('paystack');
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [planCount, setPlanCount] = useState(0);
  const [paymentReference, setPaymentReference] = useState('');
  const [paying, setPaying] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [submittingTransfer, setSubmittingTransfer] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState('');
  const [returnedFromCheckout, setReturnedFromCheckout] = useState(false);
  const checkoutOpenedRef = useRef(false);
  const verificationInProgressRef = useRef(false);
  const callbackUrl = Platform.OS === 'web' && typeof window !== 'undefined'
    ? `${window.location.origin}/payment`
    : ExpoLinking.createURL('/payment');
  const isPickup = fulfilment === 'pickup';
  const checkout = useMemo(() => calculateCheckout(items, isPickup ? 'pickup' : 'dispatch', mealPlan === 'true', planCount), [items, isPickup, mealPlan, planCount]);
  const subtotal = checkout.subtotal;
  const deliveryFee = checkout.deliveryFee;
  const total = checkout.total;
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const goBack = () => router.canGoBack() ? router.back() : router.replace('/(buyer)/cart');
  const openTracking = () => {
    if (paying || verifying || submittingTransfer) return;
    if (method === 'transfer') { void submitBankTransfer(); return; }
    void startPaystackPayment();
  };
  const pickupTitle = pickupLocations.length === 1 ? (pickupLocations[0].pickup_location || pickupLocations[0].name) : pickupLocations.length > 1 ? 'Multiple vendor pickup locations' : 'Vendor pickup point';
  const pickupDetail = pickupLocations.length === 1 ? (pickupLocations[0].pickup_instructions || pickupLocations[0].name) : pickupLocations.length > 1 ? 'Collect each item from its listed vendor.' : 'Ready in approximately 15 minutes';

  useEffect(() => {
    const acceptReturnedReference = (reference?: string | string[]) => {
      const value = Array.isArray(reference) ? reference[0] : reference;
      if (!value) return;
      checkoutOpenedRef.current = false;
      setReturnedFromCheckout(true);
      setPaymentReference(value);
      void AsyncStorage.setItem(PENDING_PAYMENT_REFERENCE, value);
    };
    acceptReturnedReference(returnedReference ?? trxref);
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const parsed = ExpoLinking.parse(url);
      acceptReturnedReference(parsed.queryParams?.reference ?? parsed.queryParams?.trxref);
    });
    return () => subscription.remove();
  }, [returnedReference, trxref]);

  useEffect(() => {
    const loadMealPlan = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase.from('meal_plan_accounts').select('plan_count').eq('user_id', auth.user.id).maybeSingle();
      setPlanCount(Number(data?.plan_count ?? 0));
    };
    void loadMealPlan();
  }, []);

  useEffect(() => {
    const loadPickupLocations = async () => {
      if (!isPickup || items.length === 0) { setPickupLocations([]); return; }
      const productIds = [...new Set(items.map((item) => item.productId.split(':')[0]).filter((id) => id.length > 20))];
      if (!productIds.length) { setPickupLocations([]); return; }
      const { data: products } = await supabase.from('products').select('vendor_id').in('id', productIds);
      const vendorIds = [...new Set((products ?? []).map((item) => item.vendor_id).filter(Boolean))];
      if (!vendorIds.length) { setPickupLocations([]); return; }
      const { data: vendors } = await supabase.from('vendors').select('id, name, pickup_location, pickup_instructions').in('id', vendorIds);
      setPickupLocations((vendors ?? []) as PickupLocation[]);
    };
    void loadPickupLocations();
  }, [isPickup, items]);

  const startPaystackPayment = async () => {
    if (!items.length) return;
    // A Pay tap always begins a new checkout. Any prior reference is still
    // verified automatically on return, but must not trap the buyer here.
    setPaymentReference('');
    setReturnedFromCheckout(false);
    await AsyncStorage.removeItem(PENDING_PAYMENT_REFERENCE);
    setPaying(true); setPaymentMessage('');
    const { data, error } = await supabase.functions.invoke('paystack-initialize', { body: { items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })), fulfilment: isPickup ? 'pickup' : 'delivery', address: address ?? null, slot: slot ?? null, callback_url: callbackUrl } });
    setPaying(false);
    if (error || !data?.authorization_url) { setPaymentMessage(data?.error ?? error?.message ?? 'Could not start secure checkout.'); return; }
    checkoutOpenedRef.current = true;
    setPaymentReference(data.reference);
    await AsyncStorage.setItem(PENDING_PAYMENT_REFERENCE, data.reference);
    setPaymentMessage('Complete secure Paystack checkout. Your payment will be confirmed automatically when you return.');
    await Linking.openURL(data.authorization_url);
  };
  const submitBankTransfer = async () => {
    if (!items.length) return;
    setSubmittingTransfer(true);
    setPaymentMessage('');
    const { data, error } = await supabase.functions.invoke('bank-transfer-submit', {
      body: {
        items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        fulfilment: isPickup ? 'pickup' : 'delivery',
        address: address ?? null,
        slot: slot ?? null,
        confirmed: true,
      },
    });
    setSubmittingTransfer(false);
    if (error || data?.error || !data?.order_id) {
      setPaymentMessage(data?.error ?? error?.message ?? 'Could not submit your transfer for confirmation.');
      return;
    }
    await AsyncStorage.removeItem(PENDING_PAYMENT_REFERENCE);
    clearCart();
    router.replace({ pathname: '/(buyer)/order/[orderId]', params: { orderId: data.order_id, fulfilment: isPickup ? 'pickup' : 'delivery', address: address ?? '' } });
  };
  const verifyPaystackPayment = async () => {
    if (!paymentReference || verificationInProgressRef.current) return;
    verificationInProgressRef.current = true;
    setVerifying(true); setPaymentMessage('');
    const { data, error } = await supabase.functions.invoke('paystack-verify', { body: { reference: paymentReference } });
    setVerifying(false);
    verificationInProgressRef.current = false;
    if (error || data?.error) {
      let detail = data?.error ?? '';
      const context = (error as { context?: unknown } | null)?.context;
      if (!detail && context instanceof Response) {
        try { const body = await context.clone().json() as { error?: string }; detail = body.error ?? ''; } catch { /* keep the generic message */ }
      }
      setPaymentMessage(detail || error?.message || 'Could not verify payment. Please deploy the paystack-verify function and try again.');
      return;
    }
    if (data?.status !== 'paid' || !data?.order_id) { setPaymentMessage(data?.message ?? 'Your payment is still being confirmed. We will check again when you return to the app.'); return; }
    await AsyncStorage.removeItem(PENDING_PAYMENT_REFERENCE);
    clearCart();
    router.replace({ pathname: '/(buyer)/order/[orderId]', params: { orderId: data.order_id, fulfilment: isPickup ? 'pickup' : 'delivery', address: address ?? '' } });
  };

  useEffect(() => {
    if (!paymentReference || !items.length) return;
    const verifyWhenActive = (nextState: string) => {
      if (nextState === 'active' && checkoutOpenedRef.current) {
        setReturnedFromCheckout(true);
        void verifyPaystackPayment();
      }
    };
    const subscription = AppState.addEventListener('change', verifyWhenActive);
    let confirmationCheck: ReturnType<typeof setInterval> | undefined;
    if (returnedFromCheckout) {
      void verifyPaystackPayment();
      confirmationCheck = setInterval(() => void verifyPaystackPayment(), 5000);
    }
    return () => { subscription.remove(); if (confirmationCheck) clearInterval(confirmationCheck); };
  }, [paymentReference, returnedFromCheckout]);

  if (!items.length && !returnedFromCheckout) return <View style={styles.screen}>
    <StatusBar style="light" />
    <View style={styles.header}><TouchableOpacity style={styles.back} onPress={goBack}><Ionicons name="arrow-back-outline" size={23} color="#F8F3ED" /></TouchableOpacity><Text style={styles.headerTitle}>Payment</Text></View>
    <View style={styles.emptyState}><Ionicons name="cart-outline" size={45} color="#176E73" /><Text style={styles.emptyTitle}>Your cart is empty</Text><Text style={styles.emptyText}>Add items before continuing to secure payment.</Text><TouchableOpacity style={styles.emptyButton} onPress={() => router.replace('/(buyer)/cart')}><Text style={styles.emptyButtonText}>BACK TO CART</Text></TouchableOpacity></View>
  </View>;

  return <View style={styles.screen}>
    <StatusBar style="light" />
    <View style={styles.header}><TouchableOpacity style={styles.back} onPress={goBack}><Ionicons name="arrow-back-outline" size={23} color="#F8F3ED" /></TouchableOpacity><Text style={styles.headerTitle}>Payment</Text><View style={styles.steps}><View style={styles.stepDone}><Ionicons name="checkmark" size={18} color="#01193D" /></View><View style={styles.stepLine} /><View style={styles.stepDone}><Ionicons name="checkmark" size={18} color="#01193D" /></View><View style={styles.stepLine} /><View style={styles.stepDone}><Ionicons name="checkmark" size={18} color="#01193D" /></View><View style={styles.stepLine} /><View style={styles.stepCurrent}><Text style={styles.stepText}>4</Text></View></View></View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {paymentMessage ? <View style={styles.paymentNotice}><Text style={styles.paymentNoticeText}>{paymentMessage}</Text></View> : null}
      {checkout.serviceFee > 0 && <View style={{ borderRadius: 10, padding: 13, backgroundColor: '#E1F5EE', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ color: '#175E63', fontSize: 15, fontWeight: '700' }}>AOM service fee (10%)</Text><Text style={{ color: '#175E63', fontSize: 16, fontWeight: '800' }}>{money(checkout.serviceFee)}</Text></View>}
      <View style={styles.summary}><View style={styles.summaryRow}><Text style={styles.summaryLabel}>Subtotal ({itemCount} items)</Text><Text style={styles.summaryValue}>{money(subtotal)}</Text></View>{checkout.packagingFee > 0 && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Packaging ({checkout.mealCount} meal{checkout.mealCount === 1 ? '' : 's'})</Text><Text style={styles.summaryValue}>{money(checkout.packagingFee)}</Text></View>}<View style={styles.summaryRow}><Text style={styles.summaryLabel}>Delivery fee</Text><Text style={styles.summaryValue}>{isPickup ? 'Free' : money(deliveryFee)}</Text></View>{checkout.mealPlanCredit > 0 && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Meal-plan credit</Text><Text style={styles.discount}>- {money(checkout.mealPlanCredit)}</Text></View>}<View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.total}>{money(total)}</Text></View></View>
      <View style={styles.destination}><View style={styles.destinationIcon}><Ionicons name={isPickup ? 'walk-outline' : 'cube-outline'} size={23} color="#F8F3ED" /></View><View style={styles.destinationCopy}><Text style={styles.destinationLabel}>{isPickup ? 'PICKUP FROM' : 'DELIVERING TO'}</Text><Text style={styles.destinationTitle}>{isPickup ? pickupTitle : address || 'American University of Nigeria'}</Text><Text style={styles.destinationDetail}>{isPickup ? pickupDetail : slot || 'Choose a delivery slot'}</Text></View></View>
      <View style={styles.methods}><TouchableOpacity style={[styles.method, method === 'transfer' && styles.methodActive]} onPress={() => setMethod('transfer')}><Text style={[styles.methodText, method === 'transfer' && styles.methodTextActive]}>Bank transfer</Text></TouchableOpacity><TouchableOpacity style={[styles.method, method === 'paystack' && styles.methodActive]} onPress={() => setMethod('paystack')}><Text style={[styles.methodText, method === 'paystack' && styles.methodTextActive]}>Paystack</Text></TouchableOpacity></View>
      {method === 'paystack' ? <View style={styles.paymentCard}><View style={styles.paystackLogo}><View style={styles.logoBars}><View style={styles.logoBar} /><View style={styles.logoBar} /><View style={styles.logoBar} /></View><Text style={styles.paystackName}>Paystack</Text></View><Text style={styles.info}>You will be taken to Paystack's secure checkout to complete your payment. Card details are handled entirely by Paystack; we never see them.</Text><TouchableOpacity disabled={paying || verifying} style={[styles.payButton, (paying || verifying) && styles.payButtonDisabled]} onPress={openTracking}>{(paying || verifying) ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.payButtonText}>{`PAY ${money(total)}`}</Text>}</TouchableOpacity><View style={styles.secure}><Ionicons name="shield-checkmark-outline" size={15} color="#7E7E7E" /><Text style={styles.secureText}>Secured by Paystack - 256-bit SSL</Text></View></View> : <View style={styles.paymentCard}><View style={styles.transferStep}><View style={styles.number}><Text style={styles.numberText}>1</Text></View><View><Text style={styles.transferTitle}>Copy the account details below</Text><Text style={styles.transferDetail}>1894871594 - Kredi Money FMB</Text></View></View><View style={styles.transferStep}><View style={styles.number}><Text style={styles.numberText}>2</Text></View><View><Text style={styles.transferTitle}>Transfer exactly {money(total)}</Text><Text style={styles.transferDetail}>Amount must match exactly for confirmation</Text></View></View><View style={styles.transferStep}><View style={styles.number}><Text style={styles.numberText}>3</Text></View><View><Text style={styles.transferTitle}>Tap the confirmation button</Text><Text style={styles.transferDetail}>Your order will be recorded while the transfer awaits confirmation.</Text></View></View><TouchableOpacity disabled={submittingTransfer} style={[styles.payButton, submittingTransfer && styles.payButtonDisabled]} onPress={openTracking}>{submittingTransfer ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.payButtonText}>I HAVE COMPLETED THE TRANSFER</Text>}</TouchableOpacity></View>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F3ED' }, emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }, emptyTitle: { color: '#01193D', fontSize: 23, fontWeight: '800', marginTop: 15 }, emptyText: { color: '#697485', fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 8 }, emptyButton: { height: 50, borderRadius: 9, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, marginTop: 24 }, emptyButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' }, header: { height: 154, backgroundColor: '#01193D', paddingTop: 44, alignItems: 'center' }, back: { position: 'absolute', top: 44, left: 26, width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#F8F3ED', alignItems: 'center', justifyContent: 'center' }, headerTitle: { color: '#F8F3ED', fontSize: 23, fontWeight: '700', marginTop: 4 }, steps: { position: 'absolute', left: 26, right: 26, bottom: 16, flexDirection: 'row', alignItems: 'center' }, stepDone: { width: 39, height: 39, borderRadius: 20, backgroundColor: '#F8F3ED', alignItems: 'center', justifyContent: 'center' }, stepCurrent: { width: 39, height: 39, borderRadius: 20, backgroundColor: '#DA6B04', alignItems: 'center', justifyContent: 'center' }, stepText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' }, stepLine: { flex: 1, height: 2, marginHorizontal: 7, backgroundColor: '#F8F3ED' }, content: { flexGrow: 1, padding: 24, paddingBottom: 34, gap: 18 }, summary: { borderWidth: 1, borderColor: '#72ABB1', borderRadius: 13, backgroundColor: '#FFFFFF', padding: 17, gap: 5 }, summaryRow: { flexDirection: 'row', justifyContent: 'space-between' }, summaryLabel: { color: '#7E7E7E', fontSize: 15 }, summaryValue: { color: '#111111', fontSize: 15, fontWeight: '700' }, discount: { color: '#175E63', fontSize: 15, fontWeight: '700' }, totalRow: { marginTop: 9, paddingTop: 11, borderTopWidth: 1, borderTopColor: '#72ABB1', flexDirection: 'row', justifyContent: 'space-between' }, totalLabel: { color: '#111111', fontSize: 18, fontWeight: '800' }, total: { color: '#175E63', fontSize: 20, fontWeight: '800' }, destination: { minHeight: 88, borderWidth: 1, borderColor: '#72ABB1', borderRadius: 13, backgroundColor: '#FFFFFF', padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 }, destinationIcon: { width: 42, height: 42, borderRadius: 9, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center' }, destinationCopy: { flex: 1 }, destinationLabel: { color: '#7E7E7E', fontSize: 12, fontWeight: '800' }, destinationTitle: { color: '#111111', fontSize: 15, fontWeight: '700', marginTop: 3 }, destinationDetail: { color: '#7E7E7E', fontSize: 12, marginTop: 3 }, methods: { flexDirection: 'row', gap: 10 }, method: { flex: 1, height: 76, borderWidth: 1, borderColor: '#A0A0A0', borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E2E2E2' }, methodActive: { borderColor: '#207B68', backgroundColor: '#E1F5EE' }, methodText: { color: '#7E7E7E', fontSize: 16, fontWeight: '600' }, methodTextActive: { color: '#175E63', fontWeight: '800' }, paymentCard: { flex: 1, minHeight: 310, borderWidth: 2, borderColor: '#55C98B', borderRadius: 15, backgroundColor: '#FFFFFF', padding: 28, gap: 24, justifyContent: 'space-between' }, paystackLogo: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 16 }, logoBars: { gap: 3 }, logoBar: { width: 35, height: 7, borderRadius: 2, backgroundColor: '#0BA4D8' }, paystackName: { color: '#000000', fontSize: 30, fontWeight: '800' }, info: { color: '#6E6E6E', fontSize: 14, lineHeight: 20, marginTop: 10 }, payButton: { height: 58, borderRadius: 8, backgroundColor: '#55C98B', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }, payButtonDisabled: { opacity: 0.7 }, payButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', textAlign: 'center' }, secure: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: -13 }, secureText: { color: '#7E7E7E', fontSize: 11 }, transferStep: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, number: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center' }, numberText: { color: '#FFFFFF', fontWeight: '800' }, transferTitle: { color: '#111111', fontSize: 15, fontWeight: '800' }, transferDetail: { color: '#7E7E7E', fontSize: 13, maxWidth: 220 }, paymentNotice: { borderRadius: 10, padding: 13, backgroundColor: '#FFF1D6' }, paymentNoticeText: { color: '#805E15', fontSize: 14, lineHeight: 20, fontWeight: '600' },
});
