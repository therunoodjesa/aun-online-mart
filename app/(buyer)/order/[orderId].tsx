import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';

type OrderRecord = { order_number: string; status: string; delivery_type: string; created_at: string };
type OrderUpdate = { id: string; message: string; update_type: 'system' | 'vendor'; created_at: string };
type TrackingUpdate = OrderUpdate & { pending?: boolean };
type ReplacementProduct = { id: string; name: string; price: number; image_url?: string | null; category?: string | null };
type RejectionRequest = { id: string; reason: string; other_reason: string | null; alternative_products: ReplacementProduct[]; selected_product_name: string | null; selected_products?: ReplacementProduct[]; replacement_budget?: number | null; selected_subtotal?: number | null; refund_amount?: number | null; status: 'pending_customer' | 'replacement_selected' | 'cancelled' | 'choosing' };

const DELIVERY_STEPS = [
  ['pending', 'Order received and processing'], ['accepted', 'Vendor has accepted your order'], ['preparing', 'Your order is being prepared'], ['ready', 'Your order is packed and ready'], ['out_for_delivery', 'Order has been handed to the rider'], ['delivered', 'Order delivered successfully'],
] as const;
const PICKUP_STEPS = [
  ['pending', 'Order received and processing'], ['accepted', 'Vendor has accepted your order'], ['preparing', 'Your order is being prepared'], ['ready', 'Your order is ready for collection'], ['delivered', 'Order collected successfully'],
] as const;
const STATUS_ORDER = ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered'];
export default function OrderDetailsPage() {
  const router = useRouter();
  const { orderId, fulfilment, address } = useLocalSearchParams<{ orderId: string; fulfilment?: string; address?: string }>();
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [customUpdates, setCustomUpdates] = useState<OrderUpdate[]>([]);
  const [rejectionRequest, setRejectionRequest] = useState<RejectionRequest | null>(null);
  const [selectedReplacementIds, setSelectedReplacementIds] = useState<string[]>([]);
  const [responding, setResponding] = useState(false);
  const [loading, setLoading] = useState(orderId !== 'preview');
  const isPickup = fulfilment === 'pickup' || order?.delivery_type === 'pickup';

  useEffect(() => {
    const loadOrder = async () => {
      if (!orderId || orderId === 'preview') { setLoading(false); return; }
      setLoading(true);
      const [{ data: orderData }, { data: updatesData }, { data: rejectionData }] = await Promise.all([
        supabase.from('orders').select('order_number, status, delivery_type, created_at').eq('id', orderId).single(),
        supabase.from('order_updates').select('id, message, update_type, created_at').eq('order_id', orderId).order('created_at', { ascending: false }).limit(3),
        supabase.from('order_rejection_requests').select('id, reason, other_reason, alternative_products, selected_product_name, selected_products, replacement_budget, selected_subtotal, refund_amount, status').eq('order_id', orderId).maybeSingle(),
      ]);
      if (orderData) setOrder(orderData as OrderRecord);
      setCustomUpdates((updatesData ?? []) as OrderUpdate[]);
      const nextRequest = (rejectionData ?? null) as RejectionRequest | null;
      setRejectionRequest(nextRequest?.status === 'pending_customer' ? { ...nextRequest, status: 'choosing' } : nextRequest);
      if (nextRequest?.status === 'pending_customer') setSelectedReplacementIds([]);
      setLoading(false);
    };
    void loadOrder();
    if (!orderId || orderId === 'preview') return;
    const channel = supabase.channel(`order-updates-${orderId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'order_updates', filter: `order_id=eq.${orderId}` }, loadOrder).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, loadOrder).on('postgres_changes', { event: '*', schema: 'public', table: 'order_rejection_requests', filter: `order_id=eq.${orderId}` }, loadOrder).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [orderId]);

  const updates = useMemo<TrackingUpdate[]>(() => {
    const status = order?.status ?? 'pending';
    const flow = isPickup ? PICKUP_STEPS : DELIVERY_STEPS;
    const stage = Math.max(0, STATUS_ORDER.indexOf(status));
    const generated = flow.filter(([key]) => STATUS_ORDER.indexOf(key) <= stage).map(([key, message], index) => ({ id: `system-${key}`, message, update_type: 'system' as const, created_at: new Date(Date.now() - index * 60000).toISOString() }));
    const recent: TrackingUpdate[] = [...customUpdates, ...generated].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3);
    while (recent.length < 3) recent.push({ id: `waiting-${recent.length}`, message: 'Waiting for an update from the vendor.', update_type: 'system', created_at: '', pending: true });
    return recent;
  }, [customUpdates, isPickup, order?.status]);

  const orderNumber = order?.order_number ?? 'Preview';
  const finalStatus = order?.status === 'delivered';
  const respondToReplacement = async (action: 'select' | 'cancel', productIds?: string[] | string) => {
    if (!rejectionRequest) return;
    const selectionIds = Array.isArray(productIds) ? productIds : productIds ? [productIds] : [];
    setResponding(true);
    if (action === 'select' && !selectionIds.length) { setResponding(false); Alert.alert('Choose replacement items', 'Select at least one option before continuing.'); return; }
    const { data, error } = await supabase.functions.invoke('buyer-order-replacement', { body: { request_id: rejectionRequest.id, action, product_ids: selectionIds } });
    setResponding(false);
    if (error || data?.error) { Alert.alert('Could not update order', data?.error ?? error?.message ?? 'Please try again.'); return; }
    if (action === 'select') {
      const selected = rejectionRequest.alternative_products.filter((product) => selectionIds.includes(product.id));
      const selectedNames = selected.map((product) => product.name).join(', ') || 'a replacement';
      const refundAmount = Number(data?.refund_amount ?? 0);
      const message = `You selected ${selectedNames}. The vendor has been notified.${refundAmount > 0 ? ` AOM will refund ₦${refundAmount.toLocaleString('en-NG')}.` : ''}`;
      setRejectionRequest((current) => current ? { ...current, status: 'replacement_selected', selected_product_name: selectedNames, selected_products: selected, selected_subtotal: data?.selected_subtotal ?? null, refund_amount: refundAmount } : current);
      setOrder((current) => current ? { ...current, status: 'replacement_selected' } : current);
      setCustomUpdates((current) => [{ id: `replacement-${Date.now()}`, message: `Customer selected ${selectedNames} as a replacement.${refundAmount > 0 ? ` Refund due: ₦${refundAmount.toLocaleString('en-NG')}.` : ''}`, update_type: 'system' as const, created_at: new Date().toISOString() }, ...current].slice(0, 3));
      Alert.alert('Replacement selected', message);
    } else {
      setRejectionRequest((current) => current ? { ...current, status: 'cancelled' } : current);
      setOrder((current) => current ? { ...current, status: 'cancelled' } : current);
      Alert.alert('Order cancelled', 'AOM will process your refund manually.');
    }
    void (async () => { const { data: refreshed } = await supabase.from('order_rejection_requests').select('id, reason, other_reason, alternative_products, selected_product_name, selected_products, replacement_budget, selected_subtotal, refund_amount, status').eq('id', rejectionRequest.id).maybeSingle(); setRejectionRequest((refreshed ?? null) as RejectionRequest | null); })();
  };
  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color="#68ECCB" /></View>;

  return <View style={styles.screen}><StatusBar style="light" /><View style={styles.page}>
    <View style={styles.hero}><Text accessibilityRole="header" style={styles.thankYou}>{finalStatus ? 'Order complete!' : 'Thank you!'}</Text><View style={styles.titleCard}><Text style={styles.title}>Order details & tracking</Text></View></View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.steps}><View style={styles.step}><Ionicons name="checkmark" size={16} color="#FFFFFF" /></View><View style={styles.stepLine} /><View style={styles.step}><Ionicons name="checkmark" size={16} color="#FFFFFF" /></View><View style={styles.stepLine} /><View style={styles.step}><Ionicons name="checkmark" size={16} color="#FFFFFF" /></View><View style={styles.stepLine} /><View style={styles.step}><Ionicons name="checkmark" size={16} color="#FFFFFF" /></View></View>
      <View style={styles.orderBanner}><Text style={styles.orderLabel}>Order Number</Text><View style={styles.orderNo}><Text style={styles.orderNoText}>{orderNumber}</Text></View></View>
      <View style={styles.meta}><View><Text style={styles.metaLabel}>{isPickup ? 'Pickup time' : 'Delivery time'}</Text><Text style={styles.metaLabel}>{isPickup ? 'Pickup location' : 'Dropoff location'}</Text></View><View style={styles.metaRight}><Text style={styles.metaValue}>{isPickup ? 'Ready in ~15 mins' : 'Estimated shortly'}</Text><Text style={styles.metaValue}>{isPickup ? 'Vendor pickup point' : address || 'American University of Nigeria'}</Text></View></View>
      {rejectionRequest?.status === 'choosing' ? <ReplacementChooser request={rejectionRequest} selectedIds={selectedReplacementIds} onToggle={(id) => setSelectedReplacementIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])} onConfirm={() => void respondToReplacement('select', selectedReplacementIds)} onCancel={() => void respondToReplacement('cancel')} responding={responding} /> : null}
      {rejectionRequest?.status === 'pending_customer' ? <View style={styles.replacementCard}><View style={styles.replacementTop}><Ionicons name="swap-horizontal-outline" size={22} color="#9A6200" /><Text style={styles.replacementTitle}>Choose a replacement</Text></View><Text style={styles.replacementCopy}>{rejectionRequest.reason === 'out_of_stock' ? 'An item in your order is out of stock. Pick another available item from this vendor, or cancel the order.' : rejectionRequest.other_reason || 'The vendor cannot fulfil this order.'}</Text>{rejectionRequest.alternative_products.map((product) => <TouchableOpacity key={product.id} disabled={responding} onPress={() => void respondToReplacement('select', product.id)} style={styles.replacementOption}><View style={{ flex: 1 }}><Text style={styles.replacementName}>{product.name}</Text><Text style={styles.replacementPrice}>₦{Number(product.price).toLocaleString('en-NG')}</Text></View><Ionicons name="arrow-forward-circle" size={25} color="#176E73" /></TouchableOpacity>)}<TouchableOpacity disabled={responding} onPress={() => void respondToReplacement('cancel')} style={styles.cancelReplacement}>{responding ? <ActivityIndicator color="#9D4538" /> : <Text style={styles.cancelReplacementText}>No thanks — cancel and refund manually</Text>}</TouchableOpacity></View> : null}
      {rejectionRequest?.status === 'replacement_selected' ? <View style={styles.replacementSelected}><Ionicons name="checkmark-circle" size={21} color="#176E73" /><Text style={styles.replacementSelectedText}>You selected {rejectionRequest.selected_product_name ?? 'a replacement'}. The vendor has been notified.</Text></View> : null}
      {rejectionRequest?.status === 'cancelled' ? <View style={styles.replacementCancelled}><Ionicons name="information-circle" size={21} color="#9D4538" /><Text style={styles.replacementCancelledText}>This order was cancelled. AOM will process your refund manually.</Text></View> : null}
      <View style={styles.timeline}>{updates.map((update, index) => <View key={update.id} style={[styles.updateLayer, { top: index * 72, zIndex: 3 - index }]}><View style={[styles.segment, index === 0 && styles.segmentLatest, index === 1 && styles.segmentMiddle, index === 2 && styles.segmentOldest]} /><View style={styles.updateCopy}><Text style={[styles.updateText, index === 0 && !update.pending && styles.updateTextLatest, update.pending && styles.updateTextPending]}>{update.message}</Text>{update.update_type === 'vendor' && <Text style={styles.vendorTag}>Vendor update</Text>}</View></View>)}</View>
      <TouchableOpacity style={styles.homeButton} onPress={() => router.replace('/(buyer)/')}><Text style={styles.homeText}>BACK TO HOME</Text></TouchableOpacity>
    </ScrollView>
  </View></View>;
}

function ReplacementChooser({ request, selectedIds, onToggle, onConfirm, onCancel, responding }: { request: RejectionRequest; selectedIds: string[]; onToggle: (id: string) => void; onConfirm: () => void; onCancel: () => void; responding: boolean }) {
  const selected = request.alternative_products.filter((product) => selectedIds.includes(product.id));
  const subtotal = selected.reduce((sum, product) => sum + Number(product.price), 0);
  const budget = Number(request.replacement_budget ?? 0);
  const overBudget = budget > 0 && subtotal > budget;
  const refund = Math.max(0, budget - subtotal);
  return <View style={styles.replacementCard}>
    <View style={styles.replacementTop}><Ionicons name="swap-horizontal-outline" size={22} color="#9A6200" /><Text style={styles.replacementTitle}>Choose replacement items</Text></View>
    <Text style={styles.replacementCopy}>{request.reason === 'out_of_stock' ? 'Select one or more suggested items. Their combined value must stay within your original item value.' : request.other_reason || 'Select one or more suggested items from this vendor.'}</Text>
    {budget > 0 ? <View style={replacementStyles.summary}><Text style={replacementStyles.summaryLabel}>Replacement budget</Text><Text style={replacementStyles.summaryValue}>₦{budget.toLocaleString('en-NG')}</Text><Text style={replacementStyles.summaryLabel}>Selected</Text><Text style={[replacementStyles.summaryValue, overBudget && replacementStyles.summaryOver]}>₦{subtotal.toLocaleString('en-NG')}</Text>{!overBudget && subtotal > 0 ? <Text style={replacementStyles.refund}>AOM refund: ₦{refund.toLocaleString('en-NG')}</Text> : null}</View> : null}
    {request.alternative_products.map((product) => { const chosen = selectedIds.includes(product.id); return <TouchableOpacity key={product.id} disabled={responding} onPress={() => onToggle(product.id)} style={[styles.replacementOption, chosen && replacementStyles.optionChosen]}><View style={{ flex: 1 }}><Text style={styles.replacementName}>{product.name}</Text><Text style={styles.replacementPrice}>₦{Number(product.price).toLocaleString('en-NG')}</Text></View><Ionicons name={chosen ? 'checkmark-circle' : 'add-circle-outline'} size={25} color={chosen ? '#176E73' : '#7B8794'} /></TouchableOpacity>; })}
    {overBudget ? <Text style={replacementStyles.overBudget}>Remove an item to stay within the original item value.</Text> : null}
    <TouchableOpacity disabled={responding || !selected.length || overBudget} onPress={onConfirm} style={[replacementStyles.confirm, (!selected.length || overBudget) && replacementStyles.confirmDisabled]}>{responding ? <ActivityIndicator color="#FFFFFF" /> : <Text style={replacementStyles.confirmText}>Confirm selected items</Text>}</TouchableOpacity>
    <TouchableOpacity disabled={responding} onPress={onCancel} style={styles.cancelReplacement}><Text style={styles.cancelReplacementText}>No thanks — cancel and refund manually</Text></TouchableOpacity>
  </View>;
}

const replacementStyles = StyleSheet.create({
  summary: { marginTop: 7, padding: 10, borderRadius: 10, backgroundColor: '#F2EEE6', flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  summaryLabel: { color: '#735F3E', fontSize: 12, fontWeight: '700' },
  summaryValue: { color: '#01193D', fontSize: 13, fontWeight: '800', marginRight: 8 },
  summaryOver: { color: '#9D4538' },
  refund: { width: '100%', color: '#176E73', fontSize: 12, fontWeight: '800', marginTop: 2 },
  optionChosen: { borderColor: '#176E73', backgroundColor: '#E1F6F0' },
  overBudget: { color: '#9D4538', fontSize: 12, fontWeight: '700', marginTop: 9 },
  confirm: { minHeight: 47, marginTop: 13, borderRadius: 9, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center' },
  confirmDisabled: { backgroundColor: '#A9B3C0' },
  confirmText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});

const legacyStyles = StyleSheet.create({
  heroOriginal: { height: 150, paddingTop: 40, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  titleCardOriginal: { position: 'absolute', zIndex: 2, left: 26, right: 26, bottom: -27, height: 54 },
  contentOriginal: { marginTop: 0, paddingTop: 10 },
  timelineOriginal: { marginTop: 27, paddingLeft: 0, gap: 0 },
  timelineSegment: { width: 42, height: 86, borderRadius: 21 },
  verticalLineOriginal: { left: 20, top: 62, height: 45, width: 3 },
  updateCardOriginal: { minHeight: 86, marginLeft: 20, borderRadius: 0, backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 0, justifyContent: 'center' },
  updateTextOriginal: { color: '#3B6B94', fontSize: 12, fontWeight: '600' },
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, loading: { flex: 1, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center' }, hero: { height: 230, backgroundColor: '#01193D', alignItems: 'center', paddingTop: 72, overflow: 'hidden' }, thankYou: { color: '#FFFFFF', fontSize: 23, fontWeight: '700' }, heroCurve: { position: 'absolute', width: '118%', height: 74, bottom: -37, borderRadius: 100, backgroundColor: '#FFFFFF' }, content: { paddingHorizontal: 26, paddingBottom: 40, marginTop: -32 }, titleCard: { height: 54, borderRadius: 28, backgroundColor: '#F8F3ED', alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: '#01193D', shadowOpacity: 0.08, shadowRadius: 8 }, title: { color: '#01193D', fontSize: 16, fontWeight: '800' }, steps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, paddingHorizontal: 10 }, stepWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' }, step: { width: 29, height: 29, borderRadius: 15, backgroundColor: '#DA6B04', alignItems: 'center', justifyContent: 'center' }, stepDone: { backgroundColor: '#01193D' }, stepText: { color: '#FFFFFF', fontWeight: '800' }, stepLine: { height: 1.5, flex: 1, marginHorizontal: 6, backgroundColor: '#01193D' }, orderBanner: { height: 64, marginTop: 20, borderRadius: 15, backgroundColor: '#E4EAF2', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 14, overflow: 'hidden' }, orderLabel: { color: '#111111', fontSize: 14, fontWeight: '800' }, orderNo: { alignSelf: 'stretch', minWidth: 72, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center' }, orderNoText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' }, meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }, metaLabel: { color: '#111111', fontSize: 11, fontWeight: '800', marginBottom: 7 }, metaRight: { alignItems: 'flex-end', maxWidth: '58%' }, metaValue: { color: '#7E7E7E', fontSize: 11, marginBottom: 7, textAlign: 'right' }, timeline: { marginTop: 23, paddingLeft: 5, gap: 12 }, updateRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center' }, dot: { width: 38, height: 52, borderRadius: 18, backgroundColor: '#C5D0DE', zIndex: 1 }, dotLatest: { backgroundColor: '#01193D' }, dotPending: { backgroundColor: '#EFF2F5' }, verticalLine: { position: 'absolute', left: 18, top: 46, height: 34, width: 3, backgroundColor: '#607A9C' }, verticalPending: { backgroundColor: '#E1E6EC' }, updateCard: { flex: 1, minHeight: 52, marginLeft: 14, borderRadius: 14, backgroundColor: '#EAF0F6', paddingHorizontal: 15, justifyContent: 'center' }, updateLatest: { backgroundColor: '#E4F6F1', borderWidth: 1, borderColor: '#68ECCB' }, updatePending: { backgroundColor: '#F7F8FA' }, updateText: { color: '#175E63', fontSize: 12, fontWeight: '700' }, updateTextLatest: { color: '#005B3B' }, updateTextPending: { color: '#A0A0A0', fontWeight: '500' }, vendorTag: { color: '#005B3B', fontSize: 10, marginTop: 3 }, homeButton: { height: 52, marginTop: 26, alignSelf: 'center', paddingHorizontal: 30, borderRadius: 8, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center' }, homeText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center' },
  page: { flex: 1, width: '100%', backgroundColor: '#FFFFFF' },
  loading: { flex: 1, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center' },
  hero: { alignSelf: 'stretch', width: '100%', height: 180, backgroundColor: '#01193D', borderBottomLeftRadius: 30, borderBottomRightRadius: 30, alignItems: 'center', paddingTop: 54, zIndex: 2, overflow: 'visible' },
  thankYou: { color: '#FFFFFF', fontSize: 32, lineHeight: 38, fontWeight: '800' },
  titleCard: { position: 'absolute', width: '86%', left: '7%', bottom: -27, height: 54, borderRadius: 28, backgroundColor: '#F8F3ED', alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#01193D', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  title: { color: '#003D6D', fontSize: 17, fontWeight: '800' },
  content: { flexGrow: 1, paddingHorizontal: 26, paddingTop: 49, paddingBottom: 28 },
  steps: { width: '86%', alignSelf: 'center', flexDirection: 'row', alignItems: 'center' },
  step: { width: 43, height: 43, borderRadius: 22, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center' },
  stepLine: { flex: 1, height: 2, backgroundColor: '#01193D', marginHorizontal: 8 },
  orderBanner: { height: 97, marginTop: 19, borderRadius: 25, overflow: 'hidden', backgroundColor: '#E7ECF3', flexDirection: 'row', alignItems: 'center', paddingLeft: 23, position: 'relative' },
  orderLabel: { width: 180, color: '#000000', fontSize: 20, lineHeight: 24, fontWeight: '800', textAlign: 'left' },
  orderNo: { position: 'absolute', top: 0, right: 0, width: 85, height: 97, backgroundColor: '#01193D', borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  orderNoText: { color: '#FFFFFF', fontSize: 15, lineHeight: 18, fontWeight: '600', textAlign: 'center' },
  meta: { marginTop: 14, flexDirection: 'row', justifyContent: 'space-between' },
  metaLabel: { color: '#111111', fontSize: 14, lineHeight: 18, fontWeight: '800', marginBottom: 10 },
  metaRight: { maxWidth: '57%', alignItems: 'flex-end' },
  metaValue: { color: '#777777', fontSize: 14, lineHeight: 18, marginBottom: 10, textAlign: 'right' },
  timeline: { height: 289, marginTop: 22, position: 'relative' },
  updateLayer: { position: 'absolute', left: 0, right: 0, height: 145 },
  segment: { width: 61, height: 145, borderRadius: 31, backgroundColor: '#B3B9C4', elevation: 4, shadowColor: '#01193D', shadowOpacity: 0.24, shadowRadius: 5, shadowOffset: { width: 0, height: 3 } },
  segmentLatest: { backgroundColor: '#01193D' },
  segmentMiddle: { backgroundColor: '#5B6A7D' },
  segmentOldest: { backgroundColor: '#B3B9C4' },
  updateCopy: { position: 'absolute', left: 82, right: 4, top: 53 },
  updateText: { color: '#3B6B94', fontSize: 15, lineHeight: 21, fontWeight: '600' },
  updateTextLatest: { color: '#0D4F85', fontWeight: '700' },
  updateTextPending: { color: '#92AFCA', fontWeight: '500' },
  vendorTag: { color: '#005B3B', fontSize: 12, lineHeight: 16, marginTop: 4 },
  homeButton: { width: 265, height: 70, marginTop: 20, alignSelf: 'center', borderRadius: 10, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center' },
  homeText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  replacementCard: { marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: '#E8C677', backgroundColor: '#FFF9ED', padding: 15 }, replacementTop: { flexDirection: 'row', alignItems: 'center', gap: 8 }, replacementTitle: { color: '#7A4C00', fontSize: 16, fontWeight: '800' }, replacementCopy: { color: '#735F3E', fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: 8 }, replacementOption: { minHeight: 56, marginTop: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE3E7', flexDirection: 'row', alignItems: 'center', gap: 10 }, replacementName: { color: '#01193D', fontSize: 14, fontWeight: '800' }, replacementPrice: { color: '#176E73', fontSize: 13, fontWeight: '700', marginTop: 2 }, cancelReplacement: { minHeight: 43, marginTop: 13, borderRadius: 9, borderWidth: 1, borderColor: '#D98A80', alignItems: 'center', justifyContent: 'center' }, cancelReplacementText: { color: '#9D4538', fontSize: 13, fontWeight: '800' }, replacementSelected: { marginTop: 8, padding: 13, borderRadius: 12, backgroundColor: '#E1F6F0', flexDirection: 'row', alignItems: 'center', gap: 9 }, replacementSelectedText: { flex: 1, color: '#176E73', fontSize: 13, fontWeight: '700', lineHeight: 18 }, replacementCancelled: { marginTop: 8, padding: 13, borderRadius: 12, backgroundColor: '#FFF0EE', flexDirection: 'row', alignItems: 'center', gap: 9 }, replacementCancelledText: { flex: 1, color: '#9D4538', fontSize: 13, fontWeight: '700', lineHeight: 18 },
});
