import { supabase } from './supabase';

export type AvailabilityVendor = { id: string; is_open?: boolean | null };

type ScheduleEntry = boolean | {
  enabled?: boolean;
  opensAt?: string;
  closesAt?: string;
};

export type VendorSchedule = {
  vendor_id: string;
  weekly_schedule?: Record<string, ScheduleEntry> | null;
  pause_until?: string | null;
  closed_for_day?: string | null;
  force_open_until?: string | null;
};

const WAT = 'Africa/Lagos';
const DAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const watParts = (date: Date) => {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: WAT,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return {
    day: values.weekday,
    dateKey: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
};

const timeToMinutes = (value?: string) => {
  if (!value?.trim()) return null;
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const suffix = match[3]?.toUpperCase();
  if (minute > 59 || hour > (suffix ? 12 : 23)) return null;
  if (suffix === 'AM') hour = hour === 12 ? 0 : hour;
  if (suffix === 'PM') hour = hour === 12 ? 12 : hour + 12;
  return hour * 60 + minute;
};

const entryIsOpen = (entry: ScheduleEntry | undefined, minute: number, checkPreviousOvernight = false) => {
  if (typeof entry === 'boolean') return entry;
  if (!entry || entry.enabled === false) return false;
  const opens = timeToMinutes(entry.opensAt);
  const closes = timeToMinutes(entry.closesAt);
  if (opens === null || closes === null) return false;
  if (opens === closes) return true;
  if (opens < closes) return !checkPreviousOvernight && minute >= opens && minute < closes;
  return checkPreviousOvernight ? minute < closes : minute >= opens;
};

export const isVendorOpenNow = (vendor: AvailabilityVendor, schedule?: VendorSchedule | null, now = new Date()) => {
  if (vendor.is_open === false) return false;
  const current = watParts(now);
  if (!schedule) return true;
  if (schedule.force_open_until && new Date(schedule.force_open_until).getTime() > now.getTime()) return true;
  if (schedule.pause_until && new Date(schedule.pause_until).getTime() > now.getTime()) return false;
  if (schedule.closed_for_day === current.dateKey) return false;
  const weekly = schedule.weekly_schedule;
  if (!weekly || Object.keys(weekly).length === 0) return true;
  const todayIndex = DAY_ORDER.indexOf(current.day);
  const previousDay = DAY_ORDER[(todayIndex + DAY_ORDER.length - 1) % DAY_ORDER.length];
  return entryIsOpen(weekly[current.day], current.minutes) || entryIsOpen(weekly[previousDay], current.minutes, true);
};

export async function getVendorAvailabilityMap(vendors: AvailabilityVendor[]) {
  const ids = Array.from(new Set(vendors.map((vendor) => vendor.id).filter(Boolean)));
  const result = new Map(vendors.map((vendor) => [vendor.id, vendor.is_open !== false]));
  if (!ids.length) return result;
  const { data, error } = await supabase
    .from('vendor_schedules')
    .select('vendor_id, weekly_schedule, pause_until, closed_for_day, force_open_until')
    .in('vendor_id', ids);
  if (error) return result;
  const schedules = new Map(((data ?? []) as VendorSchedule[]).map((row) => [row.vendor_id, row]));
  vendors.forEach((vendor) => result.set(vendor.id, isVendorOpenNow(vendor, schedules.get(vendor.id))));
  return result;
}

export async function applyVendorAvailability<T extends AvailabilityVendor>(vendors: T[]) {
  const availability = await getVendorAvailabilityMap(vendors);
  return vendors.map((vendor) => ({ ...vendor, is_open: availability.get(vendor.id) ?? vendor.is_open !== false }));
}

export async function vendorCanAcceptOrders(vendorId: string, fallbackOpen = true) {
  const { data } = await supabase.from('vendors').select('id, is_open').eq('id', vendorId).maybeSingle();
  if (!data) return fallbackOpen;
  const availability = await getVendorAvailabilityMap([data]);
  return availability.get(vendorId) ?? fallbackOpen;
}
