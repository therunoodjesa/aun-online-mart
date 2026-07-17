import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useCartStore } from '../../store/cartstore';
import { supabase } from '../../lib/supabase';
import { calculateCheckout } from '../../lib/checkout';

const WAT_TIME_ZONE = 'Africa/Lagos';

const watMinutesNow = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: WAT_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const value = (type: 'hour' | 'minute') => Number(parts.find((part) => part.type === type)?.value ?? '0');
  return value('hour') * 60 + value('minute');
};

const formatSlotHour = (hour: number) => {
  const normalized = hour % 24;
  return `${normalized % 12 || 12}:00 ${normalized >= 12 ? 'PM' : 'AM'}`;
};

const getWatDeliverySlots = (now = new Date()) => {
  const firstStart = Math.ceil(watMinutesNow(now) / 120) * 120;
  return Array.from({ length: 12 }, (_, index) => {
    const start = firstStart + index * 120;
    const dayOffset = Math.floor(start / 1440);
    const startHour = Math.floor((start % 1440) / 60);
    const dayLabel = dayOffset === 0 ? '' : dayOffset === 1 ? 'Tomorrow · ' : `In ${dayOffset} days · `;
    return `${dayLabel}${formatSlotHour(startHour)} – ${formatSlotHour(startHour + 2)}`;
  });
};

export default function DeliveryPage() {
  const router = useRouter();
  const { mealPlan } = useLocalSearchParams<{ mealPlan?: string }>();
  const { items } = useCartStore();
  const hasCafeteria = items.some((item) => item.category?.toLowerCase().startsWith('cafeteria'));
  const [clockTick, setClockTick] = useState(() => Date.now());
  const deliverySlots = useMemo(() => hasCafeteria ? ['15–40 minutes'] : getWatDeliverySlots(new Date(clockTick)), [clockTick, hasCafeteria]);
  const [slot, setSlot] = useState('');
  const [editingAddress, setEditingAddress] = useState(false);
  const [address, setAddress] = useState('');
  const [directions, setDirections] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [planCount, setPlanCount] = useState(0);
  const checkout = useMemo(() => calculateCheckout(items, 'dispatch', mealPlan === 'true', planCount), [items, mealPlan, planCount]);

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
    const timer = setInterval(() => setClockTick(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setSlot((currentSlot) => deliverySlots.includes(currentSlot) ? currentSlot : deliverySlots[0]);
  }, [deliverySlots]);

  return <View style={styles.screen}>
    <StatusBar style="light" />
    <View style={styles.header}><TouchableOpacity style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back-outline" size={23} color="#F8F3ED" /></TouchableOpacity><Text style={styles.headerTitle}>Delivery</Text><View style={styles.steps}><View style={styles.stepDone}><Ionicons name="checkmark" size={18} color="#01193D" /></View><View style={styles.stepLine} /><View style={styles.stepDone}><Ionicons name="checkmark" size={18} color="#01193D" /></View><View style={styles.stepLine} /><View style={styles.step}><Text style={styles.stepText}>3</Text></View><View style={styles.stepLine} /><View style={styles.step}><Text style={styles.stepText}>4</Text></View></View></View>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.map}><View style={styles.mapRoute} /><Ionicons name="location" size={36} color="#175E63" /></View>
      <View style={styles.panel}>
        <View style={styles.addressCard}>{editingAddress ? <View style={styles.addressEditor}><View style={styles.addressEditorHeader}><Text style={styles.cardLabel}>DELIVERY ADDRESS</Text><TouchableOpacity onPress={() => setEditingAddress(false)}><Text style={styles.edit}>Done</Text></TouchableOpacity></View><TextInput value={address} onChangeText={(value) => { setAddress(value); setShowSuggestions(true); }} onFocus={() => setShowSuggestions(true)} placeholder="Dorm, hall, or location" placeholderTextColor="#7E7E7E" style={styles.addressInput} />{showSuggestions && <View style={styles.suggestions}>{['Aisha Kande', 'Rosaria Volpi Girls', 'Dorm FF'].filter((suggestion) => suggestion.toLowerCase().includes(address.toLowerCase()) || !address).map((suggestion) => <TouchableOpacity key={suggestion} style={styles.suggestion} onPress={() => { setAddress(suggestion); setShowSuggestions(false); }}><Ionicons name="location-outline" size={16} color="#175E63" /><Text style={styles.suggestionText}>{suggestion}</Text></TouchableOpacity>)}</View>}<TextInput value={directions} onChangeText={setDirections} placeholder="Room number or further directions (optional)" placeholderTextColor="#7E7E7E" multiline style={[styles.addressInput, styles.directionsInput]} /></View> : <><View style={styles.addressIcon}><Ionicons name="home-outline" size={24} color="#F8F3ED" /></View><View style={styles.addressCopy}><Text style={styles.cardLabel}>DELIVERY ADDRESS</Text><Text style={styles.addressName}>{address || 'Add a location'}</Text><Text numberOfLines={1} style={styles.addressDetail}>{directions || 'Dorm name, room, or directions'}</Text></View><TouchableOpacity onPress={() => setEditingAddress(true)}><Text style={styles.edit}>Edit</Text></TouchableOpacity></>}</View>
        <View style={styles.slotCard}><View style={styles.addressIcon}><Ionicons name="cube-outline" size={24} color="#F8F3ED" /></View><View style={styles.slotCopy}><Text style={styles.cardLabel}>{hasCafeteria ? 'ROOM DELIVERY ETA' : 'DELIVERY SLOT'}</Text><FlatList horizontal data={deliverySlots} keyExtractor={(item) => item} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slots} renderItem={({ item }) => <TouchableOpacity disabled={hasCafeteria} onPress={() => setSlot(item)} style={[styles.slot, slot === item && styles.slotActive]}><Text style={styles.slotText}>{item}</Text></TouchableOpacity>} /></View></View>
        <View style={styles.itemsHeader}><Text style={styles.itemsHeading}>Cart items</Text><TouchableOpacity onPress={() => router.back()}><Text style={styles.edit}>Edit cart</Text></TouchableOpacity></View>
        <View style={styles.itemsCard}>{items.map((item, index) => <View key={item.productId} style={[styles.item, index < items.length - 1 && styles.itemDivider]}><View style={styles.itemImage}>{item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.itemImageFile} /> : <Ionicons name="restaurant-outline" size={28} color="#175E63" />}</View><Text numberOfLines={2} style={styles.itemName}>{item.name} ×{item.quantity}</Text><Text style={styles.itemPrice}>₦ {(item.price * item.quantity).toLocaleString('en-NG')}</Text></View>)}</View>
        <TouchableOpacity style={[styles.payment, !address.trim() && styles.paymentDisabled]} onPress={() => { if (!address.trim()) { setEditingAddress(true); setShowSuggestions(true); Alert.alert('Add a delivery address', 'Enter a dorm, hall, room, or another delivery location before proceeding.'); return; } router.push({ pathname: '/(buyer)/payment', params: { address, slot, fulfilment: 'delivery', mealPlan: mealPlan ?? 'false' } }); }}><Text style={styles.paymentText}>PROCEED TO PAYMENT · ₦ {checkout.total.toLocaleString('en-NG')}</Text></TouchableOpacity>
      </View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  paymentDisabled: { opacity: 0.45 }, screen: { flex: 1, backgroundColor: '#FFFFFF' }, header: { height: 152, paddingTop: 44, backgroundColor: '#01193D', alignItems: 'center' }, back: { position: 'absolute', top: 44, left: 26, width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#F8F3ED', alignItems: 'center', justifyContent: 'center' }, headerTitle: { marginTop: 4, color: '#F8F3ED', fontSize: 24, fontWeight: '700' }, steps: { position: 'absolute', left: 26, right: 26, bottom: 16, flexDirection: 'row', alignItems: 'center' }, step: { width: 43, height: 43, borderRadius: 22, backgroundColor: '#DA6B04', alignItems: 'center', justifyContent: 'center' }, stepDone: { width: 43, height: 43, borderRadius: 22, backgroundColor: '#F8F3ED', alignItems: 'center', justifyContent: 'center' }, stepText: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' }, stepLine: { flex: 1, height: 2, marginHorizontal: 8, backgroundColor: '#F8F3ED' }, content: { paddingBottom: 32 }, map: { height: 260, backgroundColor: '#D7F4F7', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, mapRoute: { position: 'absolute', width: 460, height: 150, borderWidth: 20, borderColor: 'rgba(23,94,99,0.17)', borderRadius: 130, transform: [{ rotate: '-14deg' }] }, panel: { marginTop: -225, marginHorizontal: 10 }, addressCard: { minHeight: 115, borderWidth: 1, borderColor: '#175E63', borderRadius: 15, padding: 14, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 12 }, addressIcon: { width: 40, height: 44, borderRadius: 8, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center' }, addressCopy: { flex: 1 }, addressEditor: { flex: 1 }, addressEditorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }, addressInput: { height: 42, borderWidth: 1, borderColor: 'rgba(23,94,99,0.45)', borderRadius: 7, paddingHorizontal: 10, color: '#01193D', fontSize: 14 }, directionsInput: { height: 58, marginTop: 8, paddingTop: 9, textAlignVertical: 'top' }, suggestions: { borderWidth: 1, borderTopWidth: 0, borderColor: 'rgba(23,94,99,0.25)', borderBottomLeftRadius: 7, borderBottomRightRadius: 7, backgroundColor: '#FFFFFF' }, suggestion: { paddingHorizontal: 10, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 7 }, suggestionText: { color: '#175E63', fontSize: 13, fontWeight: '600' }, cardLabel: { color: '#01193D', fontSize: 13, fontWeight: '800' }, addressName: { color: '#175E63', fontSize: 15, fontWeight: '700', marginTop: 3 }, addressDetail: { color: '#7E7E7E', fontSize: 13, marginTop: 2 }, edit: { color: '#D4920A', fontSize: 14, fontWeight: '800' }, slotCard: { minHeight: 115, marginTop: 16, borderWidth: 1, borderColor: '#175E63', borderRadius: 15, padding: 14, backgroundColor: '#FFFFFF', flexDirection: 'row', gap: 12 }, slotCopy: { flex: 1 }, slots: { gap: 7, paddingTop: 8 }, slot: { minWidth: 96, height: 42, paddingHorizontal: 8, borderRadius: 8, backgroundColor: '#D7F4F7', alignItems: 'center', justifyContent: 'center' }, slotActive: { backgroundColor: '#EFFCF4', borderWidth: 1, borderColor: '#175E63' }, slotText: { color: '#111111', fontSize: 12, fontWeight: '600' }, itemsHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, marginHorizontal: 6, marginBottom: 8 }, itemsHeading: { color: '#7E7E7E', fontSize: 15, fontWeight: '600' }, itemsCard: { borderWidth: 1, borderColor: '#A0A0A0', borderRadius: 15, backgroundColor: '#FFFFFF', paddingHorizontal: 12 }, item: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 12 }, itemDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(126,126,126,0.3)' }, itemImage: { width: 70, height: 70, borderRadius: 15, overflow: 'hidden', backgroundColor: '#F8F3ED', alignItems: 'center', justifyContent: 'center' }, itemImageFile: { width: '100%', height: '100%', resizeMode: 'cover' }, itemName: { flex: 1, color: '#111111', fontSize: 14, fontWeight: '600' }, itemPrice: { color: '#175E63', fontSize: 15, fontWeight: '700' }, payment: { height: 50, marginTop: 24, marginHorizontal: 8, borderRadius: 7, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center' }, paymentText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
