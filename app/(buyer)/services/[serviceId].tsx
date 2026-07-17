import { useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCartStore } from '../../../store/cartstore';
import { FALLBACK_SERVICE, type BookingService } from '../../../lib/service-fallback';

const COLORS = { navy: '#01193D', cream: '#F8F3ED', mint: '#68ECCB', green: '#176E73', muted: '#818181', line: '#D5D5D5', pale: '#F8F8F8' } as const;
const money = (value: number) => `₦ ${value.toLocaleString('en-NG')}`;
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const sameDate = (a: Date, b: Date) => dateKey(a) === dateKey(b);
const addMonths = (date: Date, offset: number) => new Date(date.getFullYear(), date.getMonth() + offset, 1);
const TIME_SLOTS = [
  { value: '9:00 AM', available: false }, { value: '10:00 AM', available: true },
  { value: '1:00 PM', available: false }, { value: '3:00 PM', available: true },
  { value: '6:00 PM', available: false }, { value: '7:00 PM', available: false },
];

function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const blanks: (Date | null)[] = Array.from({ length: first.getDay() }, () => null);
  const dates: Date[] = Array.from({ length: last.getDate() }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1));
  return blanks.concat(dates);
}

export default function ServiceBookingPage() {
  const router = useRouter();
  const { serviceId } = useLocalSearchParams<{ serviceId: string }>();
  const { width } = useWindowDimensions();
  const { addItem } = useCartStore();
  const service: BookingService = FALLBACK_SERVICE; // Live service catalogue fields can be connected here as providers add service options.
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedOption, setSelectedOption] = useState(service.options[0].id);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const chosen = service.options.find((option) => option.id === selectedOption) ?? service.options[0];
  const days = calendarDays(month);
  const isAvailable = (day: Date) => day >= new Date(today.getFullYear(), today.getMonth(), today.getDate()) && day.getDay() !== 0 && day.getDay() !== 6;
  const proceed = () => {
    if (!selectedDate || !selectedTime) return;
    addItem({ productId: `service:${serviceId}:${chosen.id}:${dateKey(selectedDate)}`, name: chosen.name, category: `${service.name} · ${selectedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, price: chosen.price, imageUrl: service.imageUrl });
    router.push('/(buyer)/cart');
  };

  return <View style={styles.screen}>
    <StatusBar style="dark" />
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.hero}>{service.imageUrl ? <Image source={{ uri: service.imageUrl }} style={styles.heroImage} /> : <View style={styles.heroFallback}><Ionicons name="color-palette-outline" size={80} color="#DE397B" /></View>}<TouchableOpacity style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={28} color={COLORS.navy} /></TouchableOpacity><TouchableOpacity style={styles.heart}><Ionicons name="heart-outline" size={28} color={COLORS.mint} /></TouchableOpacity></View>
      <View style={styles.details}><Text style={styles.name}>{service.name}</Text><Text style={styles.description}>{service.description}</Text><View style={styles.meta}><Ionicons name="star" size={27} color="#E2BD00" /><Text style={styles.rating}>{service.rating.toFixed(1)}</Text><Ionicons name="time" size={25} color={COLORS.navy} style={styles.timeIcon} /><Text style={styles.duration}>~ {service.duration}</Text></View></View>
      <View style={styles.divider} />
      <View style={styles.section}><Text style={styles.sectionTitle}>Service catalogue</Text>{service.options.map((option) => { const selected = option.id === selectedOption; return <TouchableOpacity key={option.id} style={styles.option} onPress={() => setSelectedOption(option.id)}><View style={styles.optionCopy}><Text style={styles.optionName}>{option.name}</Text><Text style={styles.optionDuration}>{option.duration}</Text></View><View style={styles.optionEnd}><Text style={styles.optionPrice}>{money(option.price)}</Text><View style={[styles.radio, selected && styles.radioSelected]}>{selected && <View style={styles.radioDot} />}</View></View></TouchableOpacity>; })}</View>
      <View style={styles.calendarSection}><View style={styles.calendarTop}><Text style={styles.monthTitle}>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase()}</Text><View style={styles.arrows}><TouchableOpacity style={styles.arrow} onPress={() => setMonth((value) => addMonths(value, -1))}><Ionicons name="chevron-back" size={26} color={COLORS.cream} /></TouchableOpacity><TouchableOpacity style={styles.arrow} onPress={() => setMonth((value) => addMonths(value, 1))}><Ionicons name="chevron-forward" size={26} color={COLORS.cream} /></TouchableOpacity></View></View><View style={styles.week}>{['S', 'M', 'T', 'W', 'Th', 'F', 'Sa'].map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}</View><View style={styles.days}>{days.map((day, index) => { if (!day) return <View key={`blank-${index}`} style={[styles.day, { width: (width - 56) / 7 }]} />; const available = isAvailable(day); const selected = selectedDate && sameDate(day, selectedDate); return <TouchableOpacity key={day.toISOString()} disabled={!available} onPress={() => setSelectedDate(day)} style={[styles.day, { width: (width - 56) / 7 }, available && styles.availableDay, selected && styles.selectedDay]}><Text style={[styles.dayText, !available && styles.unavailableText, selected && styles.selectedText]}>{day.getDate()}</Text></TouchableOpacity>; })}</View><Text style={styles.availabilityHint}>Outlined days are available for booking. Select one to continue.</Text></View>
      <View style={styles.bookingExtras}>
        <Text style={styles.subsectionTitle}>AVAILABLE SLOTS</Text>
        <View style={styles.slots}>{TIME_SLOTS.map((slot) => { const selected = slot.value === selectedTime; return <TouchableOpacity key={slot.value} disabled={!slot.available || !selectedDate} onPress={() => setSelectedTime(slot.value)} style={[styles.slot, (!slot.available || !selectedDate) && styles.slotUnavailable, selected && styles.slotSelected]}><Text style={[styles.slotText, (!slot.available || !selectedDate) && styles.slotUnavailableText, selected && styles.slotSelectedText]}>{slot.value}</Text></TouchableOpacity>; })}</View>
        <View style={styles.noteSection}><Text style={styles.subsectionTitle}>SPECIAL INSTRUCTIONS</Text><View style={[styles.noteBox, { justifyContent: 'flex-start' }]}><Ionicons name="pencil" size={18} color={COLORS.cream} /><TextInput value={note} onChangeText={setNote} placeholder="Write any special note for the vendor" placeholderTextColor="rgba(248,243,237,0.75)" style={[styles.noteInput, { height: 52, paddingVertical: 0, textAlign: 'left', textAlignVertical: 'center', includeFontPadding: false }]} /></View></View>
        {selectedDate && selectedTime && <Text style={styles.bookingSummary}>{chosen.name} · {selectedDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, {selectedTime} · {money(chosen.price)}</Text>}
      </View>
    </ScrollView>
    <TouchableOpacity disabled={!selectedDate || !selectedTime} style={[styles.proceed, (!selectedDate || !selectedTime) && styles.proceedDisabled]} onPress={proceed}><Text style={styles.proceedText}>{selectedDate && selectedTime ? `PROCEED · ${money(chosen.price)}` : 'SELECT DATE & TIME TO PROCEED'}</Text><Ionicons name="arrow-forward" size={21} color={COLORS.cream} /></TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, content: { paddingBottom: 105 }, hero: { height: 265, position: 'relative', backgroundColor: '#FFF4F8' }, heroImage: { width: '100%', height: '100%', resizeMode: 'cover' }, heroFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF3F7' }, back: { position: 'absolute', top: 50, left: 20, width: 54, height: 54, borderRadius: 27, borderWidth: 3, borderColor: COLORS.navy, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.8)' }, heart: { position: 'absolute', top: 50, right: 20, width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(1,25,61,0.6)' }, details: { paddingHorizontal: 24, paddingTop: 25 }, name: { color: COLORS.navy, fontSize: 31, fontWeight: '700' }, description: { color: COLORS.muted, fontSize: 20, marginTop: 5 }, meta: { flexDirection: 'row', alignItems: 'center', marginTop: 14 }, rating: { color: COLORS.navy, fontSize: 18, fontWeight: '700', marginLeft: 7 }, timeIcon: { marginLeft: 29 }, duration: { color: COLORS.navy, fontSize: 18, fontWeight: '700', marginLeft: 8 }, divider: { height: 1, backgroundColor: COLORS.line, marginHorizontal: 20, marginTop: 14 }, section: { paddingHorizontal: 24, paddingTop: 25 }, sectionTitle: { color: '#A0A0A0', fontSize: 22, fontWeight: '700', marginBottom: 13 }, option: { minHeight: 103, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: COLORS.line }, optionCopy: { flex: 1 }, optionName: { color: COLORS.navy, fontSize: 20, fontWeight: '500' }, optionDuration: { color: COLORS.muted, fontSize: 17, marginTop: 9 }, optionEnd: { alignItems: 'flex-end', gap: 12 }, optionPrice: { color: COLORS.navy, fontSize: 19 }, radio: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: '#5C5860', alignItems: 'center', justifyContent: 'center' }, radioSelected: { borderColor: COLORS.navy }, radioDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: COLORS.navy }, calendarSection: { paddingHorizontal: 20, paddingTop: 28 }, calendarTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, monthTitle: { color: COLORS.navy, fontSize: 22, fontWeight: '800' }, arrows: { flexDirection: 'row', gap: 10 }, arrow: { height: 56, width: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.navy }, week: { flexDirection: 'row', marginTop: 24 }, weekday: { flex: 1, textAlign: 'center', color: COLORS.muted, fontSize: 15, fontWeight: '600' }, days: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 15, rowGap: 8 }, day: { height: 50, alignItems: 'center', justifyContent: 'center' }, availableDay: { borderWidth: 1, borderColor: '#B8B8B8', borderRadius: 13 }, selectedDay: { backgroundColor: COLORS.green, borderColor: COLORS.green }, dayText: { color: COLORS.muted, fontSize: 17, fontWeight: '600' }, unavailableText: { color: '#B3B3B3' }, selectedText: { color: COLORS.cream, fontWeight: '800' }, availabilityHint: { color: COLORS.muted, fontSize: 13, textAlign: 'center', marginTop: 16 }, bookingExtras: { paddingHorizontal: 20 }, subsectionTitle: { color: '#A0A0A0', fontSize: 17, fontWeight: '800', marginTop: 28, marginBottom: 12 }, slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, slot: { width: '48.9%', height: 43, borderWidth: 1, borderColor: '#9AA0A8', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, slotUnavailable: { borderColor: '#E5E2DF', backgroundColor: '#F8F5F2' }, slotSelected: { borderColor: COLORS.green, backgroundColor: '#E0F4EF' }, slotText: { color: COLORS.muted, fontSize: 16 }, slotUnavailableText: { color: '#999999', textDecorationLine: 'line-through' }, slotSelectedText: { color: COLORS.green, fontWeight: '700', textDecorationLine: 'none' }, noteSection: { borderTopWidth: 1, borderTopColor: '#E5E5E5', marginTop: 34 }, noteBox: { minHeight: 66, paddingHorizontal: 17, borderRadius: 5, backgroundColor: COLORS.navy, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 13 }, noteInput: { flex: 1, minHeight: 52, paddingVertical: 8, color: COLORS.cream, fontSize: 15, textAlign: 'center', textAlignVertical: 'center' }, bookingSummary: { color: COLORS.muted, fontSize: 15, marginTop: 20, lineHeight: 21 }, proceed: { position: 'absolute', left: 20, right: 20, bottom: 19, height: 58, borderRadius: 12, backgroundColor: COLORS.navy, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, proceedDisabled: { backgroundColor: '#8290A4' }, proceedText: { color: COLORS.cream, fontSize: 16, fontWeight: '800' },
});
