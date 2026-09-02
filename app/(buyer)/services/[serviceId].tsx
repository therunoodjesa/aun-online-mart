import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCartStore } from '../../../store/cartstore';
import { supabase } from '../../../lib/supabase';
import { vendorCanAcceptOrders } from '../../../lib/vendor-availability';
import { FavouriteButton } from '../../../components/FavouriteButton';

const COLORS = { navy: '#01193D', cream: '#F8F3ED', mint: '#68ECCB', green: '#176E73', muted: '#818181', line: '#D5D5D5', pale: '#F8F8F8' } as const;
const money = (value: number) => `₦ ${value.toLocaleString('en-NG')}`;
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const sameDate = (a: Date, b: Date) => dateKey(a) === dateKey(b);
const addMonths = (date: Date, offset: number) => new Date(date.getFullYear(), date.getMonth() + offset, 1);
type ScheduleEntry = boolean | { enabled?: boolean; opensAt?: string; closesAt?: string };
type WeeklySchedule = Record<string, ScheduleEntry>;
const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = {
  Mon: { enabled: true, opensAt: '8:00 AM', closesAt: '6:00 PM' }, Tue: { enabled: true, opensAt: '8:00 AM', closesAt: '6:00 PM' }, Wed: { enabled: true, opensAt: '8:00 AM', closesAt: '6:00 PM' }, Thu: { enabled: true, opensAt: '9:00 AM', closesAt: '4:00 PM' }, Fri: { enabled: true, opensAt: '8:00 AM', closesAt: '3:00 PM' }, Sat: { enabled: false, opensAt: '8:00 AM', closesAt: '6:00 PM' }, Sun: { enabled: false, opensAt: '8:00 AM', closesAt: '6:00 PM' },
};
const DAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
type BookingChoice = { id: string; serviceId: string; name: string; duration: string; durationMinutes: number; price: number };
type Addon = { id: string; name: string; price: number };
type ServiceStore = { id: string; name: string; category: string; description: string; imageUrl: string | null; rating: number; duration: string; options: BookingChoice[]; location: string | null; instructions: string | null; importantMessage: string | null };

const minutesFromTime = (value?: string) => {
  const match = value?.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]); const minute = Number(match[2] ?? 0); const suffix = match[3]?.toUpperCase();
  if (hour > (suffix ? 12 : 23) || minute > 59) return null;
  if (suffix === 'AM') hour = hour === 12 ? 0 : hour;
  if (suffix === 'PM') hour = hour === 12 ? 12 : hour + 12;
  return hour * 60 + minute;
};
const timeLabel = (minutes: number) => {
  const total = ((minutes % 1440) + 1440) % 1440; const hour = Math.floor(total / 60); const minute = total % 60;
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
};
const scheduleForDay = (schedule: WeeklySchedule, day: Date) => schedule[DAY_KEYS[day.getDay()]] ?? DEFAULT_WEEKLY_SCHEDULE[DAY_KEYS[day.getDay()]];
const entryIsEnabled = (entry: ScheduleEntry) => typeof entry === 'boolean' ? entry : entry.enabled !== false;
const slotsForDay = (schedule: WeeklySchedule, day: Date, durationMinutes: number) => {
  const entry = scheduleForDay(schedule, day);
  if (!entryIsEnabled(entry)) return [];
  if (typeof entry === 'boolean') return [];
  const opens = minutesFromTime(entry.opensAt); const closes = minutesFromTime(entry.closesAt);
  if (opens === null || closes === null) return [];
  const end = closes > opens ? closes : closes + 1440;
  const slots: string[] = [];
  for (let start = opens; start + durationMinutes <= end; start += 30) slots.push(timeLabel(start));
  return slots;
};

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
  const { width: viewportWidth } = useWindowDimensions();
  const width = Math.min(viewportWidth, 430);
  const { addItem } = useCartStore();
  const [service, setService] = useState<ServiceStore | null>(null);
  const [addonsByService, setAddonsByService] = useState<Record<string, Addon[]>>({});
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [serviceAvailableDates, setServiceAvailableDates] = useState<string[] | null>(null);
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule>(DEFAULT_WEEKLY_SCHEDULE);
  const [loading, setLoading] = useState(true);
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedOption, setSelectedOption] = useState('');
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => { if (!serviceId) return; void (async () => {
    const { data: vendor } = await supabase.from('vendors').select('id, name, category, description, banner_url, location, pickup_location, pickup_instructions, important_message, is_approved, store_type').eq('id', serviceId).eq('is_approved', true).eq('store_type', 'service').maybeSingle();
    if (!vendor) { setLoading(false); return; }
    const [{ data: rows }, { data: schedule }] = await Promise.all([
      supabase.from('services').select('id, name, starting_price, image_url, duration_minutes').eq('vendor_id', vendor.id).eq('is_available', true).order('sort_order').order('name'),
      supabase.from('vendor_schedules').select('service_available_dates, weekly_schedule').eq('vendor_id', vendor.id).maybeSingle(),
    ]);
    const serviceRows = rows ?? [];
    if (!serviceRows.length) { setLoading(false); return; }
    const { data: optionRows } = await supabase.from('service_options').select('id, service_id, name, price, duration_minutes, option_type').in('service_id', serviceRows.map((row) => row.id)).eq('is_available', true).order('sort_order').order('name');
      const options: BookingChoice[] = serviceRows.flatMap((row) => {
        const choices = (optionRows ?? []).filter((option) => option.service_id === row.id && option.option_type !== 'addon');
        return choices.length ? choices.map((choice) => ({ id: choice.id, serviceId: row.id, name: choice.name, duration: `${choice.duration_minutes ?? row.duration_minutes ?? 60} minutes`, durationMinutes: Number(choice.duration_minutes ?? row.duration_minutes ?? 60), price: Number(choice.price) })) : [{ id: `${row.id}-standard`, serviceId: row.id, name: row.name, duration: `${row.duration_minutes ?? 60} minutes`, durationMinutes: Number(row.duration_minutes ?? 60), price: Number(row.starting_price ?? 0) }];
      });
    const nextAddons: Record<string, Addon[]> = {};
    (optionRows ?? []).filter((option) => option.option_type === 'addon').forEach((option) => { nextAddons[option.service_id] = [...(nextAddons[option.service_id] ?? []), { id: option.id, name: option.name, price: Number(option.price) }]; });
      setAddonsByService(nextAddons);
      setServiceAvailableDates(Array.isArray(schedule?.service_available_dates) ? schedule.service_available_dates.map(String) : []);
      if (schedule?.weekly_schedule && typeof schedule.weekly_schedule === 'object') setWeeklySchedule(schedule.weekly_schedule as WeeklySchedule);
    setVendorId(vendor.id);
    setService({ id: vendor.id, name: vendor.name ?? 'Service provider', category: vendor.category ?? 'Service', description: vendor.description ?? '', imageUrl: vendor.banner_url ?? serviceRows[0]?.image_url ?? null, rating: 4.9, duration: `${serviceRows[0]?.duration_minutes ?? 60} mins`, options, location: vendor.pickup_location ?? vendor.location ?? null, instructions: vendor.pickup_instructions ?? null, importantMessage: vendor.important_message ?? null });
    setSelectedOption(options[0]?.id ?? ''); setLoading(false);
  })(); }, [serviceId]);
  if (loading) return <View style={styles.loading}><Text style={styles.loadingText}>Loading service…</Text></View>;
  if (!service) return <View style={styles.loading}><Text style={styles.loadingText}>This service is no longer available.</Text><TouchableOpacity onPress={() => router.back()} style={styles.returnButton}><Text style={styles.returnText}>Back to services</Text></TouchableOpacity></View>;
  const chosen = service.options.find((option) => option.id === selectedOption) ?? service.options[0];
  const addons = addonsByService[chosen.serviceId] ?? [];
  const chosenAddons = addons.filter((addon) => selectedAddons.includes(addon.id));
  const bookingPrice = chosen.price + chosenAddons.reduce((sum, addon) => sum + addon.price, 0);
  const toggleAddon = (addonId: string) => setSelectedAddons((current) => current.includes(addonId) ? current.filter((id) => id !== addonId) : [...current, addonId]);
  const days = calendarDays(month);
  const isAvailable = (day: Date) => {
    if (day < new Date(today.getFullYear(), today.getMonth(), today.getDate())) return false;
    if (serviceAvailableDates?.length && !serviceAvailableDates.includes(dateKey(day))) return false;
    return entryIsEnabled(scheduleForDay(weeklySchedule, day));
  };
  const availableSlots = selectedDate ? slotsForDay(weeklySchedule, selectedDate, chosen.durationMinutes) : [];
  const proceed = async () => {
    if (!selectedDate || !selectedTime) return;
    if (vendorId && !(await vendorCanAcceptOrders(vendorId))) {
      Alert.alert('Provider unavailable', 'This provider is outside their published availability hours. Please choose another provider or return when they reopen.');
      return;
    }
    const addonKey = selectedAddons.slice().sort().join('-') || 'no-addons';
    const addonSummary = chosenAddons.length ? `Add-ons: ${chosenAddons.map((addon) => addon.name).join(', ')}` : '';
    addItem({ productId: `service:${chosen.serviceId}:${chosen.id}:${dateKey(selectedDate)}:${addonKey}`, name: chosen.name, category: `${service.name} · ${selectedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, price: bookingPrice, imageUrl: service.imageUrl, note: [addonSummary, note.trim()].filter(Boolean).join(' · ') || null });
    router.push('/(buyer)/cart');
  };

  return <View style={styles.screen}>
    <StatusBar style="dark" />
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.hero}>{service.imageUrl ? <Image source={{ uri: service.imageUrl }} style={styles.heroImage} /> : <View style={styles.heroFallback}><Ionicons name="color-palette-outline" size={80} color="#DE397B" /></View>}<TouchableOpacity style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={28} color={COLORS.navy} /></TouchableOpacity><FavouriteButton entityType="vendor" entityId={service.id} style={styles.heart} /></View>
      <View style={styles.details}><Text style={styles.name}>{service.name}</Text><Text style={styles.category}>{service.category}</Text>{service.description ? <Text style={styles.description}>{service.description}</Text> : null}<View style={styles.meta}><Ionicons name="star" size={27} color="#E2BD00" /><Text style={styles.rating}>{service.rating.toFixed(1)}</Text><Ionicons name="time" size={25} color={COLORS.navy} style={styles.timeIcon} /><Text style={styles.duration}>~ {service.duration}</Text></View>{service.importantMessage ? <View style={styles.notice}><Ionicons name="information-circle-outline" size={19} color={COLORS.green} /><Text style={styles.noticeText}>{service.importantMessage}</Text></View> : null}{service.location || service.instructions ? <View style={styles.locationCard}><Ionicons name="location-outline" size={20} color={COLORS.green} /><View style={{ flex: 1 }}><Text style={styles.locationTitle}>{service.location || 'Service location'}</Text>{service.instructions ? <Text style={styles.locationCopy}>{service.instructions}</Text> : null}</View></View> : null}</View>
      <View style={styles.divider} />
      <View style={styles.section}><Text style={styles.sectionTitle}>Choose your service</Text>{service.options.map((option) => { const selected = option.id === selectedOption; return <TouchableOpacity key={option.id} style={styles.option} onPress={() => { setSelectedOption(option.id); setSelectedAddons([]); }}><View style={styles.optionCopy}><Text style={styles.optionName}>{option.name}</Text><Text style={styles.optionDuration}>{option.duration}</Text></View><View style={styles.optionEnd}><Text style={styles.optionPrice}>{money(option.price)}</Text><View style={[styles.radio, selected && styles.radioSelected]}>{selected && <View style={styles.radioDot} />}</View></View></TouchableOpacity>; })}</View>
      {addons.length > 0 && <View style={styles.section}><Text style={styles.sectionTitle}>Add-ons</Text><Text style={styles.addonHint}>Choose any extras you would like with this booking.</Text>{addons.map((addon) => { const selected = selectedAddons.includes(addon.id); return <TouchableOpacity key={addon.id} style={styles.addon} onPress={() => toggleAddon(addon.id)}><View style={[styles.checkbox, selected && styles.checkboxSelected]}>{selected && <Ionicons name="checkmark" size={17} color={COLORS.cream} />}</View><Text style={styles.addonName}>{addon.name}</Text><Text style={styles.addonPrice}>+ {money(addon.price)}</Text></TouchableOpacity>; })}</View>}
      <View style={styles.calendarSection}><View style={styles.calendarTop}><Text style={styles.monthTitle}>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase()}</Text><View style={styles.arrows}><TouchableOpacity style={styles.arrow} onPress={() => setMonth((value) => addMonths(value, -1))}><Ionicons name="chevron-back" size={26} color={COLORS.cream} /></TouchableOpacity><TouchableOpacity style={styles.arrow} onPress={() => setMonth((value) => addMonths(value, 1))}><Ionicons name="chevron-forward" size={26} color={COLORS.cream} /></TouchableOpacity></View></View><View style={styles.week}>{['S', 'M', 'T', 'W', 'Th', 'F', 'Sa'].map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}</View><View style={styles.days}>{days.map((day, index) => { if (!day) return <View key={`blank-${index}`} style={[styles.day, { width: (width - 56) / 7 }]} />; const available = isAvailable(day); const selected = selectedDate && sameDate(day, selectedDate); return <TouchableOpacity key={day.toISOString()} disabled={!available} onPress={() => { setSelectedDate(day); setSelectedTime(null); }} style={[styles.day, { width: (width - 56) / 7 }, available && styles.availableDay, selected && styles.selectedDay]}><Text style={[styles.dayText, !available && styles.unavailableText, selected && styles.selectedText]}>{day.getDate()}</Text></TouchableOpacity>; })}</View><Text style={styles.availabilityHint}>Outlined days and appointment times reflect this provider’s published availability.</Text></View>
      <View style={styles.bookingExtras}>
        <Text style={styles.subsectionTitle}>AVAILABLE SLOTS</Text>
        <View style={styles.slots}>{availableSlots.map((slot) => { const selected = slot === selectedTime; return <TouchableOpacity key={slot} disabled={!selectedDate} onPress={() => setSelectedTime(slot)} style={[styles.slot, selected && styles.slotSelected]}><Text style={[styles.slotText, selected && styles.slotSelectedText]}>{slot}</Text></TouchableOpacity>; })}</View>{selectedDate && !availableSlots.length ? <Text style={styles.availabilityHint}>This service does not have bookable times on the selected date.</Text> : null}
        <View style={styles.noteSection}><Text style={styles.subsectionTitle}>SPECIAL INSTRUCTIONS</Text><View style={[styles.noteBox, { justifyContent: 'flex-start' }]}><Ionicons name="pencil" size={18} color={COLORS.cream} /><TextInput value={note} onChangeText={setNote} placeholder="Write any special note for the vendor" placeholderTextColor="rgba(248,243,237,0.75)" style={[styles.noteInput, { height: 52, paddingVertical: 0, textAlign: 'left', textAlignVertical: 'center', includeFontPadding: false }]} /></View></View>
        {selectedDate && selectedTime && <Text style={styles.bookingSummary}>{chosen.name}{chosenAddons.length ? ` + ${chosenAddons.map((addon) => addon.name).join(', ')}` : ''} · {selectedDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, {selectedTime} · {money(bookingPrice)}</Text>}
      </View>
    </ScrollView>
    <TouchableOpacity disabled={!selectedDate || !selectedTime} style={[styles.proceed, (!selectedDate || !selectedTime) && styles.proceedDisabled]} onPress={proceed}><Text style={styles.proceedText}>{selectedDate && selectedTime ? `PROCEED · ${money(bookingPrice)}` : 'SELECT DATE & TIME TO PROCEED'}</Text><Ionicons name="arrow-forward" size={21} color={COLORS.cream} /></TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, loading: { flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 24 }, loadingText: { color: COLORS.navy, fontSize: 18, fontWeight: '700', textAlign: 'center' }, returnButton: { marginTop: 18, backgroundColor: COLORS.navy, borderRadius: 9, paddingHorizontal: 18, paddingVertical: 13 }, returnText: { color: COLORS.cream, fontWeight: '800' }, content: { paddingBottom: 105 }, hero: { height: 265, position: 'relative', backgroundColor: '#FFF4F8' }, heroImage: { width: '100%', height: '100%', resizeMode: 'cover' }, heroFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF3F7' }, back: { position: 'absolute', top: 50, left: 20, width: 54, height: 54, borderRadius: 27, borderWidth: 3, borderColor: COLORS.navy, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.8)' }, heart: { position: 'absolute', top: 50, right: 20, width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(1,25,61,0.6)' }, details: { paddingHorizontal: 24, paddingTop: 25 }, name: { color: COLORS.navy, fontSize: 31, fontWeight: '700' }, category: { color: COLORS.green, fontSize: 15, fontWeight: '800', marginTop: 4 }, description: { color: COLORS.muted, fontSize: 17, lineHeight: 23, marginTop: 7 }, meta: { flexDirection: 'row', alignItems: 'center', marginTop: 14 }, rating: { color: COLORS.navy, fontSize: 18, fontWeight: '700', marginLeft: 7 }, timeIcon: { marginLeft: 29 }, duration: { color: COLORS.navy, fontSize: 18, fontWeight: '700', marginLeft: 8 }, notice: { marginTop: 16, padding: 12, borderRadius: 10, backgroundColor: '#E3F4EF', flexDirection: 'row', gap: 8 }, noticeText: { flex: 1, color: '#176E73', fontSize: 13, lineHeight: 18, fontWeight: '700' }, locationCard: { marginTop: 12, padding: 13, borderRadius: 10, borderWidth: 1, borderColor: '#C9E5DC', flexDirection: 'row', gap: 10 }, locationTitle: { color: COLORS.navy, fontSize: 15, fontWeight: '800' }, locationCopy: { color: COLORS.muted, fontSize: 13, lineHeight: 18, marginTop: 3 }, divider: { height: 1, backgroundColor: COLORS.line, marginHorizontal: 20, marginTop: 14 }, section: { paddingHorizontal: 24, paddingTop: 25 }, sectionTitle: { color: '#A0A0A0', fontSize: 22, fontWeight: '700', marginBottom: 13 }, option: { minHeight: 103, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: COLORS.line }, optionCopy: { flex: 1 }, optionName: { color: COLORS.navy, fontSize: 20, fontWeight: '500' }, optionDuration: { color: COLORS.muted, fontSize: 17, marginTop: 9 }, optionEnd: { alignItems: 'flex-end', gap: 12 }, optionPrice: { color: COLORS.navy, fontSize: 19 }, radio: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: '#5C5860', alignItems: 'center', justifyContent: 'center' }, radioSelected: { borderColor: COLORS.navy }, radioDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: COLORS.navy }, addonHint: { color: COLORS.muted, fontSize: 14, lineHeight: 20, marginTop: -4, marginBottom: 8 }, addon: { minHeight: 68, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.line, gap: 13 }, checkbox: { width: 28, height: 28, borderRadius: 7, borderWidth: 2, borderColor: '#7A7F87', alignItems: 'center', justifyContent: 'center' }, checkboxSelected: { borderColor: COLORS.green, backgroundColor: COLORS.green }, addonName: { flex: 1, color: COLORS.navy, fontSize: 18, fontWeight: '600' }, addonPrice: { color: COLORS.green, fontSize: 16, fontWeight: '700' }, calendarSection: { paddingHorizontal: 20, paddingTop: 28 }, calendarTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, monthTitle: { color: COLORS.navy, fontSize: 22, fontWeight: '800' }, arrows: { flexDirection: 'row', gap: 10 }, arrow: { height: 56, width: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.navy }, week: { flexDirection: 'row', marginTop: 24 }, weekday: { flex: 1, textAlign: 'center', color: COLORS.muted, fontSize: 15, fontWeight: '600' }, days: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 15, rowGap: 8 }, day: { height: 50, alignItems: 'center', justifyContent: 'center' }, availableDay: { borderWidth: 1, borderColor: '#B8B8B8', borderRadius: 13 }, selectedDay: { backgroundColor: COLORS.green, borderColor: COLORS.green }, dayText: { color: COLORS.muted, fontSize: 17, fontWeight: '600' }, unavailableText: { color: '#B3B3B3' }, selectedText: { color: COLORS.cream, fontWeight: '800' }, availabilityHint: { color: COLORS.muted, fontSize: 13, textAlign: 'center', marginTop: 16 }, bookingExtras: { paddingHorizontal: 20 }, subsectionTitle: { color: '#A0A0A0', fontSize: 17, fontWeight: '800', marginTop: 28, marginBottom: 12 }, slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, slot: { width: '48.9%', height: 43, borderWidth: 1, borderColor: '#9AA0A8', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, slotUnavailable: { borderColor: '#E5E2DF', backgroundColor: '#F8F5F2' }, slotSelected: { borderColor: COLORS.green, backgroundColor: '#E0F4EF' }, slotText: { color: COLORS.muted, fontSize: 16 }, slotUnavailableText: { color: '#999999', textDecorationLine: 'line-through' }, slotSelectedText: { color: COLORS.green, fontWeight: '700', textDecorationLine: 'none' }, noteSection: { borderTopWidth: 1, borderTopColor: '#E5E5E5', marginTop: 34 }, noteBox: { minHeight: 66, paddingHorizontal: 17, borderRadius: 5, backgroundColor: COLORS.navy, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 13 }, noteInput: { flex: 1, minHeight: 52, paddingVertical: 8, color: COLORS.cream, fontSize: 15, textAlign: 'center', textAlignVertical: 'center' }, bookingSummary: { color: COLORS.muted, fontSize: 15, marginTop: 20, lineHeight: 21 }, proceed: { position: 'absolute', left: 20, right: 20, bottom: 19, height: 58, borderRadius: 12, backgroundColor: COLORS.navy, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, proceedDisabled: { backgroundColor: '#8290A4' }, proceedText: { color: COLORS.cream, fontSize: 16, fontWeight: '800' },
});
