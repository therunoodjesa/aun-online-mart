import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, PanResponder, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { confirmAction } from '../../lib/confirm-action';
import { friendlyError } from '../../lib/user-error';
import { PortalInstallBanner } from '../../components/PortalInstallBanner';

type Vendor = { id: string; name: string; is_open: boolean | null; store_type?: 'marketplace' | 'supermarket' | 'service' | null; operating_location?: 'on_campus' | 'off_campus' | null; description?: string | null; banner_url?: string | null; category?: string | null; location?: string | null; pickup_location?: string | null; pickup_instructions?: string | null; important_message?: string | null; average_prep_time?: string | null };
type Product = { id: string; name: string; category: string | null; price: number; stock_quantity: number | null; sort_order: number | null; status: 'available' | 'sold_out' | 'hidden' };
type BookableService = { id: string; name: string; category: string | null; starting_price: number | null; duration_minutes: number | null; is_available: boolean; sort_order: number | null };
type Page = 'dashboard' | 'inventory' | 'orders' | 'analytics' | 'availability' | 'payouts' | 'settings';
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
type DaySchedule = { enabled: boolean; opensAt: string; closesAt: string };
type WeeklySchedule = Record<string, DaySchedule>;
const defaultSchedule: WeeklySchedule = {
  Mon: { enabled: true, opensAt: '8:00 AM', closesAt: '6:00 PM' },
  Tue: { enabled: true, opensAt: '8:00 AM', closesAt: '6:00 PM' },
  Wed: { enabled: true, opensAt: '8:00 AM', closesAt: '6:00 PM' },
  Thu: { enabled: true, opensAt: '8:00 AM', closesAt: '6:00 PM' },
  Fri: { enabled: true, opensAt: '8:00 AM', closesAt: '3:00 PM' },
  Sat: { enabled: false, opensAt: '8:00 AM', closesAt: '6:00 PM' },
  Sun: { enabled: false, opensAt: '8:00 AM', closesAt: '6:00 PM' },
};
const normaliseSchedule = (value: unknown): WeeklySchedule => {
  if (!value || typeof value !== 'object') return defaultSchedule;
  const raw = value as Record<string, unknown>;
  return Object.fromEntries(days.map((day) => {
    const entry = raw[day]; const fallback = defaultSchedule[day];
    if (typeof entry === 'boolean') return [day, { ...fallback, enabled: entry }];
    if (entry && typeof entry === 'object') {
      const data = entry as Partial<DaySchedule>;
      return [day, { enabled: Boolean(data.enabled), opensAt: typeof data.opensAt === 'string' ? data.opensAt : fallback.opensAt, closesAt: typeof data.closesAt === 'string' ? data.closesAt : fallback.closesAt }];
    }
    return [day, fallback];
  })) as WeeklySchedule;
};
const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const watDateKey = (date = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const watEndOfDayIso = () => new Date(`${watDateKey()}T22:59:59.999Z`).toISOString();
const currentMonthDates = () => { const now = new Date(); const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(); return Array.from({ length: lastDay }, (_, index) => new Date(now.getFullYear(), now.getMonth(), index + 1)); };

export default function VendorPortal() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<BookableService[]>([]);
  const [page, setPage] = useState<Page>('inventory');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | Product['status']>('all');
  const [loading, setLoading] = useState(true);
  const [portalError, setPortalError] = useState('');
  const [schedule, setSchedule] = useState<WeeklySchedule>(defaultSchedule);
  const [serviceAvailableDates, setServiceAvailableDates] = useState<string[]>([]);
  const [newOrderCount, setNewOrderCount] = useState(0);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const load = async () => {
    setLoading(true); setPortalError('');
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) { setPortalError(friendlyError(authError, 'Your session has expired. Sign in again to manage your store.')); setLoading(false); return; }
    const { data: vendorRow, error: vendorError } = await supabase.from('vendors').select('id, name, is_open, store_type, operating_location, description, banner_url, category, location, pickup_location, pickup_instructions, important_message, average_prep_time').eq('owner_id', auth.user.id).maybeSingle();
    if (vendorError) { setPortalError(friendlyError(vendorError, 'We could not open your store. Refresh once. If it still does not open, sign out and back in.')); setLoading(false); return; }
    if (vendorRow) {
      setVendor(vendorRow as Vendor);
      const [{ data, error: productError }, { data: serviceRows, error: serviceError }, { data: savedSchedule, error: scheduleError }] = await Promise.all([
        supabase.from('products').select('id, name, category, price, stock_quantity, sort_order, status').eq('vendor_id', vendorRow.id).order('sort_order').order('name'),
        supabase.from('services').select('id, name, category, starting_price, duration_minutes, is_available, sort_order').eq('vendor_id', vendorRow.id).order('sort_order').order('name'),
        supabase.from('vendor_schedules').select('weekly_schedule, service_available_dates, pause_until, closed_for_day, force_open_until').eq('vendor_id', vendorRow.id).maybeSingle(),
      ]);
      const catalogueError = productError ?? serviceError ?? scheduleError;
      if (catalogueError) setPortalError(friendlyError(catalogueError, 'Your store opened, but some catalogue details did not load. Refresh the page before making changes.'));
      setProducts((data ?? []) as Product[]);
      setServices((serviceRows ?? []) as BookableService[]);
      if (savedSchedule?.weekly_schedule) setSchedule(normaliseSchedule(savedSchedule.weekly_schedule));
      setServiceAvailableDates(Array.isArray(savedSchedule?.service_available_dates) ? savedSchedule.service_available_dates.map(String) : []);
    }
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    let active = true;
    const refreshOrderNotice = async () => { const orders = await loadVendorOrders(); if (active) setNewOrderCount(orders.filter((order) => order.status === 'pending' || order.status === 'replacement_selected').length); };
    void refreshOrderNotice();
    return () => { active = false; };
  }, []);
  const counts = useMemo(() => ({ all: products.length, available: products.filter((p) => p.status === 'available').length, sold_out: products.filter((p) => p.status === 'sold_out').length, hidden: products.filter((p) => p.status === 'hidden').length }), [products]);
  const rows = useMemo(() => products.filter((p) => (filter === 'all' || p.status === filter) && p.name.toLowerCase().includes(search.toLowerCase())), [products, filter, search]);
  const setOpen = async (is_open: boolean) => {
    if (!vendor) return;
    setVendor({ ...vendor, is_open });
    const [{ error }, { error: scheduleError }] = await Promise.all([
      supabase.from('vendors').update({ is_open }).eq('id', vendor.id),
      supabase.from('vendor_schedules').upsert({
        vendor_id: vendor.id,
        weekly_schedule: schedule,
        service_available_dates: serviceAvailableDates,
        pause_until: null,
        closed_for_day: null,
        force_open_until: is_open ? watEndOfDayIso() : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'vendor_id' }),
    ]);
    if (error || scheduleError) { void load(); Alert.alert('Store not updated', friendlyError(error ?? scheduleError, 'Check your connection and try changing the store status again.')); }
  };
  const setStatus = async (product: Product, status: Product['status']) => { setProducts((items) => items.map((item) => item.id === product.id ? { ...item, status } : item)); const { error } = await supabase.from('products').update({ status }).eq('id', product.id); if (error) { void load(); Alert.alert('Item not updated', friendlyError(error, 'Refresh the inventory and try changing this item again.')); } };
  const setStock = async (product: Product, change: number) => {
    const current = Number(product.stock_quantity ?? 0);
    const stock_quantity = Math.max(0, current + change);
    const status: Product['status'] = product.status === 'hidden' ? 'hidden' : stock_quantity === 0 ? 'sold_out' : product.status === 'sold_out' ? 'available' : product.status;
    setProducts((items) => items.map((item) => item.id === product.id ? { ...item, stock_quantity, status } : item));
    const { error } = await supabase.from('products').update({ stock_quantity, status }).eq('id', product.id);
    if (error) { void load(); Alert.alert('Stock not updated', friendlyError(error, 'Refresh the inventory, enter the stock again, and retry.')); }
  };
  const setStockValue = async (product: Product, rawValue: string) => {
    if (!rawValue.trim()) return;
    const stock_quantity = Math.max(0, Math.floor(Number(rawValue)));
    if (!Number.isFinite(stock_quantity)) { Alert.alert('Enter a valid stock number', 'Use a whole number such as 12.'); return; }
    const status: Product['status'] = product.status === 'hidden' ? 'hidden' : stock_quantity === 0 ? 'sold_out' : product.status === 'sold_out' ? 'available' : product.status;
    setProducts((items) => items.map((item) => item.id === product.id ? { ...item, stock_quantity, status } : item));
    const { error } = await supabase.from('products').update({ stock_quantity, status }).eq('id', product.id);
    if (error) { void load(); Alert.alert('Stock not updated', friendlyError(error, 'Refresh the inventory, enter a whole number, and retry.')); }
  };
  const moveProduct = async (product: Product, direction: -1 | 1) => {
    const ordered = [...products].sort((a, b) => Number(a.sort_order ?? Number.MAX_SAFE_INTEGER) - Number(b.sort_order ?? Number.MAX_SAFE_INTEGER));
    const index = ordered.findIndex((item) => item.id === product.id);
    const neighbour = ordered[index + direction];
    if (index < 0 || !neighbour) return;
    const productOrder = product.sort_order ?? index + 1;
    const neighbourOrder = neighbour.sort_order ?? index + direction + 1;
    setProducts((items) => items.map((item) => item.id === product.id ? { ...item, sort_order: neighbourOrder } : item.id === neighbour.id ? { ...item, sort_order: productOrder } : item));
    const [{ error: firstError }, { error: secondError }] = await Promise.all([
      supabase.from('products').update({ sort_order: neighbourOrder }).eq('id', product.id),
      supabase.from('products').update({ sort_order: productOrder }).eq('id', neighbour.id),
    ]);
    if (firstError || secondError) { void load(); Alert.alert('Placement not changed', friendlyError(firstError ?? secondError, 'Refresh the inventory and move the item again.')); }
  };
  const saveSchedule = async () => {
    if (!vendor) return;
    setSavingSchedule(true);
    const { error } = await supabase.from('vendor_schedules').upsert({ vendor_id: vendor.id, weekly_schedule: schedule, service_available_dates: vendor.store_type === 'service' ? serviceAvailableDates : [], pause_until: null, closed_for_day: null, force_open_until: null, updated_at: new Date().toISOString() }, { onConflict: 'vendor_id' });
    setSavingSchedule(false);
    if (error) { Alert.alert('Schedule not saved', friendlyError(error, 'Check each opening and closing time, then try again.')); return; }
    Alert.alert('Schedule saved', 'Your weekly availability has been updated.');
  };
  const pauseStore = async () => {
    if (!vendor) return;
    const pauseUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { error } = await supabase.from('vendor_schedules').upsert({ vendor_id: vendor.id, weekly_schedule: schedule, service_available_dates: serviceAvailableDates, pause_until: pauseUntil, closed_for_day: null, force_open_until: null, updated_at: new Date().toISOString() }, { onConflict: 'vendor_id' });
    if (error) { Alert.alert('Store not paused', friendlyError(error, 'Check your connection and try pausing the store again.')); return; }
    Alert.alert('Store paused', 'Your store is paused for 30 minutes. Reopen it at any time with “Open store now”.');
  };
  const closeForToday = async () => {
    if (!vendor) return;
    const { error } = await supabase.from('vendor_schedules').upsert({ vendor_id: vendor.id, weekly_schedule: schedule, service_available_dates: serviceAvailableDates, pause_until: null, closed_for_day: watDateKey(), force_open_until: null, updated_at: new Date().toISOString() }, { onConflict: 'vendor_id' });
    if (error) { Alert.alert('Store not closed', friendlyError(error, 'Check your connection and try closing the store again.')); return; }
    Alert.alert('Store closed for today', 'Customers cannot place new orders until you reopen the store.');
  };
  const markAllSoldOut = () => confirmAction({
    title: 'Mark all available items sold out?',
    message: 'Customers will no longer be able to add your available items to their cart.',
    confirmLabel: 'Mark sold out',
    destructive: true,
    onConfirm: async () => {
      const { data, error } = await supabase.functions.invoke('vendor-availability', { body: { action: 'mark_all_sold_out' } });
      if (error || data?.error) { Alert.alert('Items not updated', friendlyError(data?.error ?? error, 'Check your connection and try marking the items sold out again.')); return; }
      setProducts((items) => items.map((item) => item.status === 'available' ? { ...item, status: 'sold_out' } : item));
      Alert.alert('Items updated', `${data.updated ?? 0} item${data.updated === 1 ? '' : 's'} marked sold out.`);
    },
  });
  const logOut = () => confirmAction({
    title: 'Log out of vendor portal?',
    message: 'You will need to sign in again to manage this store.',
    confirmLabel: 'Log out',
    destructive: true,
    onConfirm: async () => { const { error } = await supabase.auth.signOut(); if (error) { Alert.alert('Still signed in', friendlyError(error, 'Check your connection and try logging out again.')); return; } router.replace('/(auth)/login'); },
  });
  return <View style={styles.screen}><StatusBar style="light" /><View style={[styles.top, compact && styles.topMobile]}><View style={[styles.brand, compact && { flex: 1, minWidth: 0, gap: 8 }]}><Ionicons name="storefront-outline" size={22} color="#68ECCB" /><View style={{ flexShrink: 1 }}><Text numberOfLines={1} style={styles.storeName}>{vendor?.name ?? 'Your store'}</Text><Text style={styles.portal}>Vendor portal</Text></View></View><View style={[styles.topRight, compact && { gap: 6 }]}><View style={[styles.storeState, compact && { height: 38, paddingHorizontal: 9 }]}><View style={[styles.dot, !vendor?.is_open && styles.dotClosed]} /><Text style={[styles.topText, compact && { fontSize: 12 }]}>Store {vendor?.is_open ? 'open' : 'closed'}</Text></View><View style={[styles.avatar, compact && { width: 36, height: 36, borderRadius: 18 }]}><Text style={styles.avatarText}>{(vendor?.name ?? 'VS').slice(0, 2).toUpperCase()}</Text></View></View></View><View style={[styles.main, compact && styles.mainMobile]}><Sidebar page={page} setPage={setPage} newOrderCount={newOrderCount} compact={compact} /><ScrollView style={styles.workspace} contentContainerStyle={[styles.workspaceContent, compact && styles.workspaceContentMobile]} showsVerticalScrollIndicator><PortalInstallBanner />{loading ? <View style={styles.center}><ActivityIndicator size="large" color="#25B68A" /></View> : portalError && !vendor ? <View style={styles.center}><Ionicons name="alert-circle-outline" size={44} color="#9A5B16" /><Text style={styles.emptyTitle}>Your store could not open</Text><Text style={styles.emptyCopy}>{portalError}</Text><TouchableOpacity onPress={() => void load()} style={styles.returnButton}><Text style={styles.returnText}>TRY AGAIN</Text></TouchableOpacity></View> : !vendor ? <VendorApplication /> : <>{portalError ? <View style={styles.applicationFeedback}><Ionicons name="alert-circle-outline" size={18} color="#9A5B16" /><Text style={styles.applicationFeedbackText}>{portalError}</Text></View> : null}{page === 'dashboard' ? <Dashboard vendor={vendor} products={products} onOrders={() => setPage('orders')} /> : page === 'orders' ? <Orders vendor={vendor} /> : page === 'analytics' ? <Analytics /> : page === 'inventory' ? vendor.store_type === 'service' ? <ServiceCatalogue vendor={vendor} services={services} onChanged={load} setOpen={setOpen} /> : <Inventory compact={compact} vendor={vendor} rows={rows} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} counts={counts} setOpen={setOpen} setStatus={setStatus} setStock={setStock} setStockValue={setStockValue} moveProduct={moveProduct} /> : page === 'availability' ? <Availability vendor={vendor} schedule={schedule} setSchedule={setSchedule} serviceAvailableDates={serviceAvailableDates} setServiceAvailableDates={setServiceAvailableDates} setOpen={setOpen} onSave={saveSchedule} saving={savingSchedule} onPause={pauseStore} onCloseForToday={closeForToday} onMarkAllSoldOut={markAllSoldOut} /> : page === 'payouts' ? <Payouts vendor={vendor} /> : page === 'settings' ? <Settings vendor={vendor} onSaved={(details) => setVendor({ ...vendor, ...details })} onLogOut={logOut} /> : <ComingSoon page={page} />}</>}</ScrollView></View></View>;
}

function Sidebar({ page, setPage, newOrderCount, compact }: { page: Page; setPage: (page: Page) => void; newOrderCount: number; compact?: boolean }) {
  const items: { id: Page; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
    { id: 'dashboard', icon: 'grid-outline', label: 'Dashboard' },
    { id: 'inventory', icon: 'restaurant-outline', label: 'Inventory' },
    { id: 'orders', icon: 'receipt-outline', label: 'Orders' },
    { id: 'analytics', icon: 'bar-chart-outline', label: 'Analytics' },
    { id: 'availability', icon: 'time-outline', label: 'Availability' },
    { id: 'payouts', icon: 'card-outline', label: 'Payouts' },
    { id: 'settings', icon: 'settings-outline', label: 'Settings' },
  ];
  if (compact) return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mobileNavBar} contentContainerStyle={styles.mobileNavContent}>{items.map((item) => <TouchableOpacity key={item.id} style={[styles.mobileNav, page === item.id && styles.mobileNavActive]} onPress={() => setPage(item.id)}><Ionicons name={item.icon} size={18} color={page === item.id ? '#176E73' : '#607080'} /><Text style={[styles.mobileNavText, page === item.id && styles.navTextActive]}>{item.label}</Text>{item.id === 'orders' && newOrderCount > 0 ? <View style={styles.mobileOrdersDot} /> : null}</TouchableOpacity>)}</ScrollView>;
  return <View style={styles.sidebar}><Text style={styles.menu}>MENU</Text>{items.map((item) => <TouchableOpacity key={item.id} style={[styles.nav, page === item.id && styles.navActive]} onPress={() => setPage(item.id)}><Ionicons name={item.icon} size={19} color={page === item.id ? '#176E73' : '#7D7D7D'} /><Text style={[styles.navText, page === item.id && styles.navTextActive]}>{item.label}</Text>{item.id === 'orders' && newOrderCount > 0 ? <View style={styles.ordersDot} /> : null}</TouchableOpacity>)}</View>;
}
function Inventory({ compact, vendor, rows, search, setSearch, filter, setFilter, counts, setOpen, setStatus, setStock, setStockValue, moveProduct }: { compact?: boolean; vendor: Vendor; rows: Product[]; search: string; setSearch: (value: string) => void; filter: 'all' | Product['status']; setFilter: (value: 'all' | Product['status']) => void; counts: Record<'all' | Product['status'], number>; setOpen: (value: boolean) => void; setStatus: (item: Product, value: Product['status']) => void; setStock: (item: Product, change: number) => void; setStockValue: (item: Product, value: string) => void; moveProduct: (item: Product, direction: -1 | 1) => void }) {
  const tabs: { id: 'all' | Product['status']; label: string }[] = [{ id: 'all', label: 'All items' }, { id: 'available', label: 'Available' }, { id: 'sold_out', label: 'Sold out' }, { id: 'hidden', label: 'Hidden' }];
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'placement' | 'name' | 'price_low' | 'price_high' | 'stock_low'>('placement');
  const sortedRows = useMemo(() => [...rows].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'price_low') return Number(a.price) - Number(b.price);
    if (sortBy === 'price_high') return Number(b.price) - Number(a.price);
    if (sortBy === 'stock_low') return Number(a.stock_quantity ?? Number.MAX_SAFE_INTEGER) - Number(b.stock_quantity ?? Number.MAX_SAFE_INTEGER);
    return Number(a.sort_order ?? Number.MAX_SAFE_INTEGER) - Number(b.sort_order ?? Number.MAX_SAFE_INTEGER);
  }), [rows, sortBy]);
  return <>
    <Head title="Inventory" subtitle="Manage your menu items, prices, stock status, and customer-facing placement." actions />
    <StoreNotice vendor={vendor} setOpen={setOpen} />
    <View style={[styles.tabs, compact && styles.tabsMobile]}>{tabs.map((tab) => <TouchableOpacity key={tab.id} onPress={() => setFilter(tab.id)} style={[styles.tab, filter === tab.id && styles.tabActive]}><Text style={[styles.tabText, filter === tab.id && styles.tabTextActive]}>{tab.label}</Text><Text style={styles.count}>{counts[tab.id]}</Text></TouchableOpacity>)}</View>
    <View style={styles.tools}><View style={[styles.search, compact && styles.searchMobile]}><Ionicons name="search-outline" size={18} color="#7D7D7D" /><TextInput value={search} onChangeText={setSearch} placeholder="Search menu items..." placeholderTextColor="#999999" style={styles.searchInput} /></View>{compact ? null : <View style={{ flex: 1 }} />}<Button icon="options-outline" label="Filter" onPress={() => { setFilterOpen((open) => !open); setSortOpen(false); }} /><Button icon="swap-vertical-outline" label="Sort" onPress={() => { setSortOpen((open) => !open); setFilterOpen(false); }} /></View>
    {filterOpen ? <View style={{ borderWidth: 1, borderColor: '#DCE5EA', borderRadius: 10, backgroundColor: '#F8FAFB', padding: 12, marginBottom: 14 }}><Text style={{ color: '#526273', fontSize: 12, fontWeight: '800', marginBottom: 8 }}>Filter by status</Text><View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{tabs.map((option) => <TouchableOpacity key={option.id} onPress={() => { setFilter(option.id); setFilterOpen(false); }} style={{ borderWidth: 1, borderColor: filter === option.id ? '#25B68A' : '#D3DCE5', backgroundColor: filter === option.id ? '#E1F6F0' : '#FFFFFF', borderRadius: 16, paddingHorizontal: 11, paddingVertical: 7 }}><Text style={{ color: filter === option.id ? '#176E73' : '#647181', fontSize: 13, fontWeight: '700' }}>{option.label}</Text></TouchableOpacity>)}</View></View> : null}
    {sortOpen ? <View style={{ borderWidth: 1, borderColor: '#DCE5EA', borderRadius: 10, backgroundColor: '#F8FAFB', padding: 12, marginBottom: 14 }}><Text style={{ color: '#526273', fontSize: 12, fontWeight: '800', marginBottom: 8 }}>Sort inventory</Text><View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{([{ id: 'placement', label: 'Your placement' }, { id: 'name', label: 'Name A–Z' }, { id: 'price_low', label: 'Price low–high' }, { id: 'price_high', label: 'Price high–low' }, { id: 'stock_low', label: 'Low stock first' }] as const).map((option) => <TouchableOpacity key={option.id} onPress={() => { setSortBy(option.id); setSortOpen(false); }} style={{ borderWidth: 1, borderColor: sortBy === option.id ? '#25B68A' : '#D3DCE5', backgroundColor: sortBy === option.id ? '#E1F6F0' : '#FFFFFF', borderRadius: 16, paddingHorizontal: 11, paddingVertical: 7 }}><Text style={{ color: sortBy === option.id ? '#176E73' : '#647181', fontSize: 13, fontWeight: '700' }}>{option.label}</Text></TouchableOpacity>)}</View></View> : null}
    {compact ? <View style={mobileInventoryStyles.list}>{sortedRows.map((item) => <InventoryMobileCard key={item.id} item={item} setStatus={setStatus} setStock={setStock} setStockValue={setStockValue} moveProduct={moveProduct} />)}{!sortedRows.length ? <Text style={styles.none}>No menu items match this view.</Text> : null}</View> : <><View style={styles.headerRow}><View style={inventoryStyles.itemLeadColumn} /><Text style={[styles.column, inventoryStyles.itemColumn]}>ITEM</Text><Text style={styles.column}>PRICE</Text><Text style={[styles.column, inventoryStyles.statusColumn]}>STATUS</Text><Text style={[styles.column, inventoryStyles.stockColumn]}>STOCK</Text><Text style={[styles.column, inventoryStyles.actionsColumn]}>ACTIONS</Text></View>
    <FlatList
      data={sortedRows}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <View style={styles.row}>
        <PlacementHandle item={item} onMove={moveProduct} />
        <View style={styles.itemIcon}><Ionicons name="restaurant-outline" size={20} color="#68ECCB" /></View>
        <View style={inventoryStyles.itemColumn}><Text style={styles.itemName}>{item.name}</Text><Text style={styles.itemSub}>{item.category ?? 'Menu item'}</Text></View>
        <Text style={styles.price}>{'₦' + item.price.toLocaleString('en-NG')}</Text>
        <View style={inventoryStyles.statusColumn}><View style={[styles.status, item.status === 'sold_out' && styles.sold, item.status === 'hidden' && styles.hidden]}><View style={styles.statusDot} /><Text style={styles.statusText}>{item.status === 'available' ? 'Available' : item.status === 'sold_out' ? 'Sold out' : 'Hidden'}</Text></View></View>
        <View style={inventoryStyles.stockColumn}>
          <View style={styles.stockControl}>
            <TouchableOpacity disabled={Number(item.stock_quantity ?? 0) <= 0} onPress={() => setStock(item, -1)} style={[styles.stockButton, Number(item.stock_quantity ?? 0) <= 0 && styles.stockButtonDisabled]}><Ionicons name="remove" size={15} color="#176E73" /></TouchableOpacity>
            <TextInput key={`${item.id}-${item.stock_quantity ?? 'empty'}`} defaultValue={item.stock_quantity === null ? '' : String(item.stock_quantity)} onEndEditing={(event) => setStockValue(item, event.nativeEvent.text)} keyboardType="number-pad" placeholder="Set stock" placeholderTextColor="#8796A3" style={inventoryStyles.stockInput} />
            <TouchableOpacity onPress={() => setStock(item, 1)} style={styles.stockButton}><Ionicons name="add" size={15} color="#176E73" /></TouchableOpacity>
          </View>
        </View>
        <View style={inventoryStyles.actions}>
          <EditProductButton productId={item.id} />
          <TouchableOpacity onPress={() => item.status === 'available' ? setStatus(item, 'sold_out') : Number(item.stock_quantity ?? 0) > 0 ? setStatus(item, 'available') : Alert.alert('Add stock first', 'Use the plus button to add stock before making this item available.')} style={styles.iconButton}><Ionicons name={item.status === 'available' ? 'close-outline' : 'checkmark-outline'} size={19} color="#176E73" /></TouchableOpacity>
          <TouchableOpacity onPress={() => setStatus(item, item.status === 'hidden' ? (Number(item.stock_quantity ?? 0) === 0 ? 'sold_out' : 'available') : 'hidden')} style={styles.iconButton}><Ionicons name={item.status === 'hidden' ? 'eye-outline' : 'eye-off-outline'} size={18} color="#526273" /></TouchableOpacity>
        </View>
      </View>}
      ListEmptyComponent={<Text style={styles.none}>No menu items match this view.</Text>}
    />
    </>}
  </>;
}

function InventoryMobileCard({ item, setStatus, setStock, setStockValue, moveProduct }: { item: Product; setStatus: (item: Product, value: Product['status']) => void; setStock: (item: Product, change: number) => void; setStockValue: (item: Product, value: string) => void; moveProduct: (item: Product, direction: -1 | 1) => void }) {
  const statusLabel = item.status === 'available' ? 'Available' : item.status === 'sold_out' ? 'Sold out' : 'Hidden';
  return <View style={mobileInventoryStyles.card}><View style={mobileInventoryStyles.top}><PlacementHandle item={item} onMove={moveProduct} /><View style={styles.itemIcon}><Ionicons name="restaurant-outline" size={20} color="#68ECCB" /></View><View style={{ flex: 1 }}><Text style={styles.itemName}>{item.name}</Text><Text style={styles.itemSub}>{item.category ?? 'Menu item'}</Text></View><Text style={mobileInventoryStyles.price}>{'₦' + item.price.toLocaleString('en-NG')}</Text></View><View style={mobileInventoryStyles.controls}><View style={[styles.status, item.status === 'sold_out' && styles.sold, item.status === 'hidden' && styles.hidden]}><View style={styles.statusDot} /><Text style={styles.statusText}>{statusLabel}</Text></View><View style={styles.stockControl}><TouchableOpacity disabled={Number(item.stock_quantity ?? 0) <= 0} onPress={() => setStock(item, -1)} style={[styles.stockButton, Number(item.stock_quantity ?? 0) <= 0 && styles.stockButtonDisabled]}><Ionicons name="remove" size={15} color="#176E73" /></TouchableOpacity><TextInput key={`${item.id}-${item.stock_quantity ?? 'empty'}`} defaultValue={item.stock_quantity === null ? '' : String(item.stock_quantity)} onEndEditing={(event) => setStockValue(item, event.nativeEvent.text)} keyboardType="number-pad" placeholder="Stock" placeholderTextColor="#8796A3" style={inventoryStyles.stockInput} /><TouchableOpacity onPress={() => setStock(item, 1)} style={styles.stockButton}><Ionicons name="add" size={15} color="#176E73" /></TouchableOpacity></View><EditProductButton productId={item.id} /><TouchableOpacity onPress={() => item.status === 'available' ? setStatus(item, 'sold_out') : Number(item.stock_quantity ?? 0) > 0 ? setStatus(item, 'available') : Alert.alert('Add stock first', 'Use the plus button to add stock before making this item available.')} style={styles.iconButton}><Ionicons name={item.status === 'available' ? 'close-outline' : 'checkmark-outline'} size={19} color="#176E73" /></TouchableOpacity><TouchableOpacity onPress={() => setStatus(item, item.status === 'hidden' ? (Number(item.stock_quantity ?? 0) === 0 ? 'sold_out' : 'available') : 'hidden')} style={styles.iconButton}><Ionicons name={item.status === 'hidden' ? 'eye-outline' : 'eye-off-outline'} size={18} color="#526273" /></TouchableOpacity></View></View>;
}
function Availability({ vendor, schedule, setSchedule, serviceAvailableDates, setServiceAvailableDates, setOpen, onSave, saving, onPause, onCloseForToday, onMarkAllSoldOut }: { vendor: Vendor; schedule: WeeklySchedule; setSchedule: (data: WeeklySchedule) => void; serviceAvailableDates: string[]; setServiceAvailableDates: (dates: string[]) => void; setOpen: (value: boolean) => void; onSave: () => void; saving: boolean; onPause: () => void; onCloseForToday: () => void; onMarkAllSoldOut: () => void }) {
  const updateDay = (day: string, change: Partial<DaySchedule>) => setSchedule({ ...schedule, [day]: { ...schedule[day], ...change } });
  const copyMonday = () => setSchedule(Object.fromEntries(days.map((day) => [day, { ...schedule.Mon }])) as WeeklySchedule);
  const isService = vendor.store_type === 'service';
  return <><Head title="Availability" subtitle={isService ? "Set weekly hours and the exact dates clients can book you." : "Set your weekly hours and control when you accept orders."} save onSave={onSave} saving={saving} /><StoreNotice vendor={vendor} setOpen={setOpen} /><View style={styles.schedule}><View style={styles.scheduleHead}><View><Text style={styles.scheduleTitle}>Weekly schedule</Text><Text style={styles.scheduleSub}>Choose each day and enter the opening and closing times that work for you.</Text></View><Button icon="copy-outline" label="Copy Mon to all" onPress={copyMonday} /></View>{days.map((day) => <View key={day} style={styles.dayRow}><Text style={styles.day}>{day}</Text><Switch value={schedule[day].enabled} onValueChange={(enabled) => updateDay(day, { enabled })} trackColor={{ false: '#D8DCE1', true: '#9AE4D1' }} thumbColor="#FFFFFF" />{schedule[day].enabled ? <View style={styles.hours}><TextInput value={schedule[day].opensAt} onChangeText={(opensAt) => updateDay(day, { opensAt })} placeholder="8:00 AM" placeholderTextColor="#98A0A9" style={styles.timeInput} /><Text style={styles.to}>to</Text><TextInput value={schedule[day].closesAt} onChangeText={(closesAt) => updateDay(day, { closesAt })} placeholder="6:00 PM" placeholderTextColor="#98A0A9" style={styles.timeInput} /></View> : <Text style={styles.closed}>Closed — no orders accepted</Text>}</View>)}</View>{isService ? <ServiceDateAvailability dates={serviceAvailableDates} onChange={setServiceAvailableDates} /> : null}<Text style={styles.quickLabel}>QUICK ACTIONS</Text><View style={styles.quickGrid}><Quick icon="play-circle-outline" label="Open store now" onPress={() => { void setOpen(true); }} /><Quick icon="pause-circle-outline" label="Pause for 30 min" onPress={() => { void onPause(); }} /><Quick icon="close-circle-outline" label="Close for today" onPress={() => { void onCloseForToday(); }} /><Quick icon="alert-circle-outline" label="Mark all items sold out" onPress={onMarkAllSoldOut} /></View></>;
}

function ServiceDateAvailability({ dates, onChange }: { dates: string[]; onChange: (dates: string[]) => void }) {
  const today = localDateKey(new Date());
  const monthDates = currentMonthDates();
  const toggle = (key: string) => onChange(dates.includes(key) ? dates.filter((date) => date !== key) : [...dates, key].sort());
  return <View style={styles.schedule}><View style={styles.scheduleHead}><View><Text style={styles.scheduleTitle}>This month’s service dates</Text><Text style={styles.scheduleSub}>Optional: choose only the dates clients may book. Leave this empty to use your weekly hours for every date.</Text></View>{dates.length ? <TouchableOpacity onPress={() => onChange([])}><Text style={{ color: '#176E73', fontWeight: '800' }}>Clear dates</Text></TouchableOpacity> : null}</View><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{monthDates.map((date) => { const key = localDateKey(date); const selected = dates.includes(key); const past = key < today; return <TouchableOpacity key={key} disabled={past} onPress={() => toggle(key)} style={{ width: 52, height: 50, borderRadius: 12, borderWidth: 1, borderColor: selected ? '#20B990' : '#D8DCE1', backgroundColor: selected ? '#DFF5EE' : '#FFFFFF', alignItems: 'center', justifyContent: 'center', opacity: past ? .42 : 1 }}><Text style={{ color: selected ? '#176E73' : '#52606D', fontWeight: '800' }}>{date.getDate()}</Text><Text style={{ color: selected ? '#176E73' : '#7D8792', fontSize: 10 }}>{date.toLocaleDateString('en-NG', { weekday: 'short' }).slice(0, 2)}</Text></TouchableOpacity>; })}</View><Text style={[styles.scheduleSub, { marginTop: 14 }]}>{dates.length ? `${dates.length} date${dates.length === 1 ? '' : 's'} selected for client bookings.` : 'No dates selected — clients can book on any day enabled in your weekly schedule.'}</Text></View>;
}
function Head({ title, subtitle, actions, save, onSave, saving }: { title: string; subtitle: string; actions?: boolean; save?: boolean; onSave?: () => void; saving?: boolean }) { const router = useRouter(); return <View style={styles.head}><View><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View>{actions ? <View style={styles.headButtons}><Button icon="download-outline" label="Import" /><Button icon="add" label="Add item" onPress={() => router.push('/vendor-portal/item/new')} /></View> : save ? <Button icon="save-outline" label={saving ? 'Saving…' : 'Save schedule'} onPress={onSave} /> : null}</View>; }
function StoreNotice({ vendor, setOpen }: { vendor: Vendor; setOpen: (value: boolean) => void }) { return <View style={[styles.notice, !vendor.is_open && styles.noticeClosed]}><Ionicons name="storefront-outline" size={23} color="#176E73" /><View style={{ flex: 1 }}><Text style={styles.noticeTitle}>Store is {vendor.is_open ? 'accepting' : 'not accepting'} orders</Text><Text style={styles.noticeText}>{vendor.is_open ? 'Students can browse and order from your menu right now.' : 'Toggle to reopen instantly.'}</Text></View><Text style={styles.openText}>{vendor.is_open ? 'Open' : 'Closed'}</Text><Switch value={Boolean(vendor.is_open)} onValueChange={setOpen} trackColor={{ false: '#D9C180', true: '#9AE4D1' }} thumbColor="#FFFFFF" /></View>; }
function PlacementHandle({ item, onMove }: { item: Product; onMove: (item: Product, direction: -1 | 1) => void }) {
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 3,
    onPanResponderRelease: (_, gesture) => { if (Math.abs(gesture.dy) > 20) onMove(item, gesture.dy > 0 ? 1 : -1); },
  }), [item, onMove]);
  return <View {...responder.panHandlers} style={inventoryStyles.placementHandle} accessibilityLabel={`Drag ${item.name} to change its placement`}><View style={inventoryStyles.handleLong} /><View style={inventoryStyles.handleShort} /></View>;
}

function Button({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress?: () => void }) { return <TouchableOpacity onPress={onPress} style={styles.button}><Ionicons name={icon} size={18} color="#242424" /><Text style={styles.buttonText}>{label}</Text></TouchableOpacity>; }
function Quick({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) { return <TouchableOpacity onPress={onPress} style={styles.quick}><Ionicons name={icon} size={28} color="#176E73" /><View><Text style={styles.quickTitle}>{label}</Text><Text style={styles.quickSub}>Manage availability instantly</Text></View></TouchableOpacity>; }
function Empty() { return <View style={styles.center}><Ionicons name="storefront-outline" size={45} color="#176E73" /><Text style={styles.emptyTitle}>Your store is being set up</Text><Text style={styles.emptyCopy}>Ask the AOM team to link your vendor account before you manage your catalogue.</Text></View>; }
function ServiceCatalogue({ vendor, services, onChanged, setOpen }: { vendor: Vendor; services: BookableService[]; onChanged: () => Promise<void>; setOpen: (value: boolean) => void }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const visible = useMemo(() => services.filter((service) => `${service.name} ${service.category ?? ''}`.toLowerCase().includes(search.toLowerCase())), [services, search]);
  const toggle = async (service: BookableService) => { const { error } = await supabase.from('services').update({ is_available: !service.is_available, updated_at: new Date().toISOString() }).eq('id', service.id); if (error) { Alert.alert('Service not updated', friendlyError(error, 'Refresh the catalogue and try changing the service again.')); return; } await onChanged(); };
  return <><View style={styles.head}><View><Text style={styles.title}>Service catalogue</Text><Text style={styles.subtitle}>Manage the services customers can book, their prices, durations, and booking choices.</Text></View><View style={styles.headButtons}><Button icon="add" label="Add service" onPress={() => router.push('/vendor-portal/service/new')} /></View></View><StoreNotice vendor={vendor} setOpen={setOpen} /><View style={styles.tools}><View style={styles.search}><Ionicons name="search-outline" size={18} color="#7D7D7D" /><TextInput value={search} onChangeText={setSearch} placeholder="Search services..." placeholderTextColor="#999999" style={styles.searchInput} /></View></View>{visible.map((service) => <View key={service.id} style={styles.row}><View style={[styles.itemIcon, { marginLeft: 12 }]}><Ionicons name="sparkles-outline" size={20} color="#68ECCB" /></View><View style={{ flex: 1 }}><Text style={styles.itemName}>{service.name}</Text><Text style={styles.itemSub}>{service.category ?? 'Service'} · {service.duration_minutes ?? 60} mins</Text></View><Text style={styles.price}>{'₦' + Number(service.starting_price ?? 0).toLocaleString('en-NG')}</Text><View style={{ minWidth: 120, alignItems: 'center' }}><View style={[styles.status, !service.is_available && styles.hidden]}><View style={styles.statusDot} /><Text style={styles.statusText}>{service.is_available ? 'Available' : 'Hidden'}</Text></View></View><View style={{ width: 116, flexDirection: 'row', gap: 8, justifyContent: 'center' }}><TouchableOpacity onPress={() => router.push(`/vendor-portal/service/${service.id}`)} style={styles.iconButton} accessibilityLabel="Edit service"><Ionicons name="create-outline" size={18} color="#176E73" /></TouchableOpacity><TouchableOpacity onPress={() => void toggle(service)} style={styles.iconButton} accessibilityLabel={service.is_available ? 'Hide service' : 'Show service'}><Ionicons name={service.is_available ? 'eye-off-outline' : 'eye-outline'} size={18} color="#526273" /></TouchableOpacity></View></View>)}{!visible.length ? <View style={styles.center}><Ionicons name="sparkles-outline" size={45} color="#176E73" /><Text style={styles.emptyTitle}>No services yet</Text><Text style={styles.emptyCopy}>Add your first bookable service. It will appear under Services in the buyer app as soon as you save it.</Text><TouchableOpacity onPress={() => router.push('/vendor-portal/service/new')} style={[styles.button, { marginTop: 18 }]}><Ionicons name="add" size={18} color="#242424" /><Text style={styles.buttonText}>Add first service</Text></TouchableOpacity></View> : null}</>;
}

type VendorOrder = { id: string; order_number: string; status: string; delivery_type: string | null; created_at: string; items: { product_name: string; quantity: number; unit_price: number; notes?: string | null; isReplacement?: boolean }[]; replacement?: { status: string; selected_product_name: string | null; selected_subtotal: number | null; refund_amount: number | null } };
type RejectionReason = 'out_of_stock' | 'store_closed' | 'cannot_meet_request' | 'preparation_time' | 'other';
type ReplacementProduct = { id: string; name: string; price: number; category: string | null; image_url: string | null };
type PayoutRequest = { id: string; amount: number; order_ids: string[]; status: 'requested' | 'processing' | 'paid' | 'rejected'; requested_at: string; processed_at: string | null; reference: string | null };

async function loadVendorOrders(): Promise<VendorOrder[]> {
  const { data: lines } = await supabase.from('order_items').select('order_id, product_name, quantity, unit_price, notes');
  const ids = [...new Set((lines ?? []).map((line) => line.order_id))];
  if (!ids.length) return [];
  const [{ data: orders }, { data: replacements }] = await Promise.all([
    supabase.from('orders').select('id, order_number, status, delivery_type, created_at').in('id', ids).eq('payment_status', 'paid').order('created_at', { ascending: false }),
    supabase.from('order_rejection_requests').select('order_id, status, selected_product_name, selected_subtotal, refund_amount').in('order_id', ids),
  ]);
  const replacementsByOrder = new Map((replacements ?? []).map((request) => [request.order_id, { status: request.status, selected_product_name: request.selected_product_name, selected_subtotal: request.selected_subtotal, refund_amount: request.refund_amount }]));
  return (orders ?? []).map((order) => {
    const replacement = replacementsByOrder.get(order.id);
    const items: VendorOrder['items'] = (lines ?? []).filter((line) => line.order_id === order.id);
    if (replacement?.status === 'replacement_selected' && replacement.selected_product_name) {
      items.push({ product_name: `Customer chose: ${replacement.selected_product_name}${Number(replacement.refund_amount ?? 0) > 0 ? ` (AOM refund: ₦${Number(replacement.refund_amount).toLocaleString('en-NG')})` : ''}`, quantity: 1, unit_price: Number(replacement.selected_subtotal ?? 0), isReplacement: true });
    }
    return { ...order, items, replacement };
  }) as VendorOrder[];
}

function Dashboard({ vendor, products, onOrders }: { vendor: Vendor; products: Product[]; onOrders: () => void }) {
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  useEffect(() => { void loadVendorOrders().then(setOrders); }, []);
  const pending = orders.filter((order) => order.status === 'pending').length;
  const sales = orders.reduce((total, order) => total + order.items.reduce((sum, item) => sum + (item.isReplacement ? 0 : item.unit_price * item.quantity), 0), 0);
  return <View style={styles.portalPage}><Head title={`Good day, ${vendor.name}`} subtitle="Your store summary is up to date." /><View style={styles.metricRow}><Metric label="New orders" value={String(pending)} /><Metric label="Available items" value={String(products.filter((item) => item.status === 'available').length)} /><Metric label="Order value" value={`₦${sales.toLocaleString('en-NG')}`} /></View><View style={styles.dashboardSection}><View style={styles.sectionTop}><Text style={styles.sectionTitle}>Incoming orders</Text><TouchableOpacity onPress={onOrders}><Text style={styles.link}>View all</Text></TouchableOpacity></View>{orders.length ? orders.slice(0, 3).map((order) => <OrderPreview key={order.id} order={order} />) : <EmptyOrders />}</View></View>;
}

function Orders({ vendor }: { vendor: Vendor }) {
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectionOrder, setRejectionOrder] = useState<VendorOrder | null>(null);
  const [rejectionReason, setRejectionReason] = useState<RejectionReason>('out_of_stock');
  const [otherReason, setOtherReason] = useState('');
  const [alternatives, setAlternatives] = useState<ReplacementProduct[]>([]);
  const [selectedAlternativeIds, setSelectedAlternativeIds] = useState<string[]>([]);
  const [submittingRejection, setSubmittingRejection] = useState(false);
  const [actionNotice, setActionNotice] = useState('');
  const load = async (showLoading = false) => { if (showLoading) setLoading(true); setOrders(await loadVendorOrders()); if (showLoading) setLoading(false); };
  useEffect(() => { void load(true); }, [vendor.id]);
  useEffect(() => {
    const refresh = () => { void load(false); };
    const channel = supabase.channel(`vendor-replacement-orders-${vendor.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_rejection_requests', filter: `vendor_id=eq.${vendor.id}` }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [vendor.id]);
  useEffect(() => {
    if (!actionNotice) return;
    Alert.alert('Replacement options sent', actionNotice);
    setActionNotice('');
  }, [actionNotice]);
  const advance = async (order: VendorOrder, status: 'accepted' | 'preparing' | 'ready') => {
    const { data, error } = await supabase.functions.invoke('vendor-order-update', { body: { order_id: order.id, status } });
    if (error || data?.error) Alert.alert('Order not updated', friendlyError(data?.error ?? error, 'Refresh the order and try changing its status again.'));
    else void load();
  };
  const openRejection = async (order: VendorOrder) => {
    setRejectionOrder(order); setRejectionReason('out_of_stock'); setOtherReason(''); setSelectedAlternativeIds([]);
    const { data, error } = await supabase.from('products').select('id, name, price, category, image_url').eq('vendor_id', vendor.id).eq('status', 'available').order('name').limit(12);
    if (error) { Alert.alert('Alternatives unavailable', friendlyError(error, 'Refresh the orders page and try choosing replacement items again.')); setAlternatives([]); return; }
    setAlternatives((data ?? []) as ReplacementProduct[]);
  };
  const toggleAlternative = (id: string) => setSelectedAlternativeIds((selected) => selected.includes(id) ? selected.filter((value) => value !== id) : selected.length >= 6 ? selected : [...selected, id]);
  const submitRejection = async () => {
    if (!rejectionOrder) return;
    if (rejectionReason === 'other' && !otherReason.trim()) { Alert.alert('Add a reason', 'Write a short explanation for the customer.'); return; }
    setSubmittingRejection(true);
    const { data, error } = await supabase.functions.invoke('vendor-order-update', { body: {
      order_id: rejectionOrder.id, status: 'cancelled', rejection: { reason: rejectionReason, other_reason: otherReason, alternative_product_ids: selectedAlternativeIds },
    } });
    setSubmittingRejection(false);
    if (error || data?.error) { Alert.alert('Response not sent', friendlyError(data?.error ?? error, 'Refresh the order and send the rejection or replacement choices again.')); return; }
    const sentReplacementOptions = Number(data.alternatives ?? 0) > 0;
    setActionNotice(sentReplacementOptions ? 'Replacement options sent. The customer has been notified and this order will update here when they choose.' : 'Order cancelled. The customer has been told that AOM will process their refund manually.');
    setRejectionOrder(null); void load();
  };
  const rejectBooking = async (order: VendorOrder) => {
    const { data, error } = await supabase.functions.invoke('vendor-order-update', { body: {
      order_id: order.id,
      status: 'cancelled',
      rejection: { reason: 'other', other_reason: 'The service provider declined this booking.', alternative_product_ids: [] },
    } });
    if (error || data?.error) Alert.alert('Booking response not sent', friendlyError(data?.error ?? error, 'Refresh the booking and try again.'));
    else { Alert.alert('Booking rejected', 'The customer has been notified.'); void load(); }
  };
  if (vendor.store_type === 'service') return <View style={styles.portalPage}><Head title="Bookings" subtitle={`Manage ${vendor.name} booking requests and completed sessions.`} />{loading ? <ActivityIndicator size="large" color="#25B68A" /> : orders.length ? <FlatList data={orders} keyExtractor={(order) => order.id} renderItem={({ item }) => <View style={styles.orderCard}><View style={styles.sectionTop}><View><Text style={styles.orderNumber}>Booking #{item.order_number}</Text><Text style={styles.orderMeta}>{item.items.map((line) => line.product_name).join(', ')}</Text></View><OrderStatus status={item.status} /></View>{item.items.map((line) => <Text key={line.product_name} style={styles.orderItem}>{line.quantity}× {line.product_name} · ₦{(line.unit_price * line.quantity).toLocaleString('en-NG')}</Text>)}<View style={styles.orderActions}>{item.status === 'pending' ? <><Action label="Booking rejected" secondary onPress={() => void rejectBooking(item)} /><Action label="Booking accepted" onPress={() => advance(item, 'accepted')} /></> : item.status === 'accepted' ? <Action label="Booking session complete" onPress={() => advance(item, 'ready')} /> : <Text style={styles.orderMeta}>{['ready', 'delivered'].includes(item.status) ? 'Booking session complete.' : `Booking is ${item.status.replaceAll('_', ' ')}.`}</Text>}</View></View>} /> : <View style={styles.emptyOrders}><Ionicons name="calendar-outline" size={34} color="#176E73" /><Text style={styles.emptyOrdersTitle}>No bookings yet</Text><Text style={styles.emptyOrdersCopy}>New bookings for {vendor.name} will appear here.</Text></View>}</View>;
  const rejectionReasons: { id: RejectionReason; label: string; note: string }[] = [
    { id: 'out_of_stock', label: 'Requested item is out of stock', note: 'Offer items from your available menu.' },
    { id: 'store_closed', label: 'Store cannot fulfil this order now', note: 'For an unexpected closure or issue.' },
    { id: 'cannot_meet_request', label: 'Cannot meet the order request', note: 'For dietary, customisation, or similar requests.' },
    { id: 'preparation_time', label: 'Cannot meet the requested time', note: 'For timing or capacity constraints.' },
    { id: 'other', label: 'Other reason', note: 'Add a short explanation below.' },
  ];
  return <View style={styles.portalPage}><Head title="Orders" subtitle="Accept, prepare and update your customers." />{loading ? <ActivityIndicator size="large" color="#25B68A" /> : orders.length ? <FlatList data={orders} keyExtractor={(order) => order.id} renderItem={({ item }) => <View style={styles.orderCard}><View style={styles.sectionTop}><View><Text style={styles.orderNumber}>#{item.order_number}</Text><Text style={styles.orderMeta}>{item.delivery_type === 'pickup' ? 'Pickup' : 'Room delivery'}</Text></View><OrderStatus status={item.status} /></View>{item.items.map((line, index) => <View key={`${line.product_name}-${index}`}><Text style={styles.orderItem}>{line.quantity}× {line.product_name} · ₦{(line.unit_price * line.quantity).toLocaleString('en-NG')}</Text>{line.notes?.trim() ? <Text style={styles.orderNote}>Special instruction: {line.notes.trim()}</Text> : null}</View>)}<View style={styles.orderActions}>{item.status === 'pending' ? <><Action label="Reject" secondary onPress={() => void openRejection(item)} /><Action label="Accept order" onPress={() => advance(item, 'accepted')} /></> : item.status === 'replacement_selected' ? <Action label="Confirm replacement" onPress={() => advance(item, 'accepted')} /> : item.status === 'accepted' ? <Action label="Start preparing" onPress={() => advance(item, 'preparing')} /> : item.status === 'preparing' ? <Action label="Mark ready" onPress={() => advance(item, 'ready')} /> : <Text style={styles.orderMeta}>Order is {item.status.replaceAll('_', ' ')}.</Text>}</View>{rejectionOrder?.id === item.id ? <View style={styles.rejectionPanel}><View style={styles.rejectionHeader}><View><Text style={styles.rejectionTitle}>Reject order #{item.order_number}</Text><Text style={styles.rejectionHelp}>Tell the customer why. For stock issues, you can suggest up to six replacements.</Text></View><TouchableOpacity onPress={() => setRejectionOrder(null)} hitSlop={8}><Ionicons name="close" size={22} color="#526273" /></TouchableOpacity></View><Text style={styles.rejectionLabel}>REASON</Text>{rejectionReasons.map((reason) => <TouchableOpacity key={reason.id} onPress={() => setRejectionReason(reason.id)} style={[styles.reasonRow, rejectionReason === reason.id && styles.reasonRowActive]}><View style={[styles.radio, rejectionReason === reason.id && styles.radioActive]}>{rejectionReason === reason.id ? <View style={styles.radioDot} /> : null}</View><View style={{ flex: 1 }}><Text style={styles.reasonText}>{reason.label}</Text><Text style={styles.reasonNote}>{reason.note}</Text></View></TouchableOpacity>)}{rejectionReason === 'out_of_stock' ? <View style={styles.alternativeSection}><Text style={styles.rejectionLabel}>SUGGEST REPLACEMENTS (OPTIONAL)</Text>{alternatives.length ? <View style={styles.alternativePills}>{alternatives.map((product) => <TouchableOpacity key={product.id} onPress={() => toggleAlternative(product.id)} style={[styles.alternativePill, selectedAlternativeIds.includes(product.id) && styles.alternativePillActive]}><Ionicons name={selectedAlternativeIds.includes(product.id) ? 'checkmark-circle' : 'add-circle-outline'} size={16} color={selectedAlternativeIds.includes(product.id) ? '#176E73' : '#7B8794'} /><Text style={[styles.alternativePillText, selectedAlternativeIds.includes(product.id) && styles.alternativePillTextActive]}>{product.name} · ₦{Number(product.price).toLocaleString('en-NG')}</Text></TouchableOpacity>)}</View> : <Text style={styles.noAlternatives}>There are no available items to suggest. This order will be cancelled and marked for a manual refund.</Text>}</View> : null}{rejectionReason === 'other' ? <TextInput value={otherReason} onChangeText={setOtherReason} maxLength={180} multiline placeholder="Briefly explain the issue to the customer..." placeholderTextColor="#8B96A3" style={styles.otherReasonInput} /> : null}<View style={styles.rejectionActions}><Action label="Keep order" secondary onPress={() => setRejectionOrder(null)} /><TouchableOpacity disabled={submittingRejection} onPress={() => void submitRejection()} style={[styles.rejectConfirm, submittingRejection && styles.rejectConfirmDisabled]}>{submittingRejection ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.rejectConfirmText}>{rejectionReason === 'out_of_stock' && selectedAlternativeIds.length ? 'Send replacement options' : 'Reject order'}</Text>}</TouchableOpacity></View></View> : null}</View>} /> : <EmptyOrders />}</View>;
}

function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function OrderPreview({ order }: { order: VendorOrder }) { return <View style={styles.preview}><View><Text style={styles.orderNumber}>#{order.order_number}</Text><Text style={styles.orderMeta}>{order.items.map((line) => `${line.quantity}× ${line.product_name}`).join(', ')}</Text></View><OrderStatus status={order.status} /></View>; }
function OrderStatus({ status, replacementName }: { status: string; replacementName?: string | null }) { const label = status === 'replacement_selected' ? `customer chose ${replacementName ?? 'replacement'}` : status.replaceAll('_', ' '); return <View style={[styles.orderStatus, status === 'pending' && styles.pendingStatus]}><Text style={styles.orderStatusText}>{label}</Text></View>; }
function Action({ label, onPress, secondary }: { label: string; onPress: () => void; secondary?: boolean }) { return <TouchableOpacity onPress={onPress} style={[styles.action, secondary && styles.actionSecondary]}><Text style={[styles.actionText, secondary && styles.actionTextSecondary]}>{label}</Text></TouchableOpacity>; }
function EmptyOrders() { return <View style={styles.emptyOrders}><Ionicons name="receipt-outline" size={34} color="#176E73" /><Text style={styles.emptyOrdersTitle}>No orders yet</Text><Text style={styles.emptyOrdersCopy}>New Sholly’s orders will appear here.</Text></View>; }

function Payouts({ vendor }: { vendor: Vendor }) {
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [requests, setRequests] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const load = async () => {
    setLoading(true);
    const [orderRows, requestRows] = await Promise.all([
      loadVendorOrders(),
      supabase.from('vendor_payout_requests').select('id, amount, order_ids, status, requested_at, processed_at, reference').eq('vendor_id', vendor.id).order('requested_at', { ascending: false }),
    ]);
    setOrders(orderRows);
    setRequests((requestRows.data ?? []) as PayoutRequest[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [vendor.id]);
  const completed = orders.filter((order) => ['ready', 'out_for_delivery', 'delivered'].includes(order.status));
  const includedOrderIds = new Set(requests.filter((request) => ['requested', 'processing', 'paid'].includes(request.status)).flatMap((request) => request.order_ids ?? []));
  const eligibleCompleted = completed.filter((order) => !includedOrderIds.has(order.id));
  const available = eligibleCompleted.reduce((total, order) => total + order.items.reduce((sum, line) => sum + (line.isReplacement ? 0 : line.unit_price * line.quantity), 0), 0);
  const pending = orders.filter((order) => ['pending', 'accepted', 'preparing'].includes(order.status)).reduce((total, order) => total + order.items.reduce((sum, line) => sum + (line.isReplacement ? 0 : line.unit_price * line.quantity), 0), 0);
  const activeRequest = requests.find((request) => ['requested', 'processing'].includes(request.status));
  const paidOut = requests.filter((request) => request.status === 'paid').reduce((total, request) => total + Number(request.amount), 0);
  const requestPayout = async () => {
    setRequesting(true);
    const { data, error } = await supabase.functions.invoke('vendor-payout-request');
    setRequesting(false);
    if (error || data?.error) { Alert.alert('Payout request not sent', friendlyError(data?.error ?? error, 'Confirm that eligible completed orders are available, then try again.')); return; }
    Alert.alert('Payout requested', `Your request for ₦${Number(data.payout.amount).toLocaleString('en-NG')} is now awaiting AOM review.`);
    void load();
  };
  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#25B68A" /></View>;
  return <View style={styles.portalPage}><Head title="Payouts" subtitle="Track your eligible sales and request settlement from AOM." />
    <View style={styles.payoutHero}><View><Text style={styles.payoutEyebrow}>AVAILABLE FOR PAYOUT</Text><Text style={styles.payoutAmount}>₦{available.toLocaleString('en-NG')}</Text><Text style={styles.payoutNote}>{activeRequest ? 'A settlement request is already being reviewed.' : 'Completed customer orders are ready for settlement.'}</Text></View><TouchableOpacity disabled={!available || Boolean(activeRequest) || requesting} onPress={() => void requestPayout()} style={[styles.payoutButton, (!available || activeRequest || requesting) && styles.payoutButtonDisabled]}>{requesting ? <ActivityIndicator color="#01193D" /> : <><Ionicons name="cash-outline" size={20} color="#01193D" /><Text style={styles.payoutButtonText}>{activeRequest ? 'Request pending' : 'Request payout'}</Text></>}</TouchableOpacity></View>
    <View style={styles.payoutMetrics}><PayoutMetric label="Eligible sales" value={`₦${available.toLocaleString('en-NG')}`} hint={`${eligibleCompleted.length} completed order${eligibleCompleted.length === 1 ? '' : 's'}`} /><PayoutMetric label="Still processing" value={`₦${pending.toLocaleString('en-NG')}`} hint="Released when orders are completed" /><PayoutMetric label="Paid out" value={`₦${paidOut.toLocaleString('en-NG')}`} hint="Settlements completed by AOM" /></View>
    <View style={styles.payoutInfo}><Ionicons name="information-circle-outline" size={22} color="#176E73" /><Text style={styles.payoutInfoText}>AOM’s 10% service fee is charged to customers, so it is not deducted from your product sales. Delivery fees are also kept separate from store settlements.</Text></View>
    <View style={styles.payoutPanel}><View style={styles.sectionTop}><View><Text style={styles.sectionTitle}>Payout history</Text><Text style={styles.payoutPanelSub}>Requests and completed settlements for your store.</Text></View></View>{requests.length ? requests.map((request) => <View key={request.id} style={styles.payoutRow}><View style={styles.payoutRowIcon}><Ionicons name={request.status === 'paid' ? 'checkmark-circle-outline' : request.status === 'rejected' ? 'close-circle-outline' : 'time-outline'} size={21} color={request.status === 'paid' ? '#176E73' : request.status === 'rejected' ? '#B64A4A' : '#8A6415'} /></View><View style={{ flex: 1 }}><Text style={styles.payoutRowTitle}>{request.status === 'paid' ? 'Settlement completed' : request.status === 'processing' ? 'Settlement processing' : request.status === 'rejected' ? 'Request needs attention' : 'Payout requested'}</Text><Text style={styles.payoutRowMeta}>{new Date(request.requested_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}{request.reference ? ` · ${request.reference}` : ''}</Text></View><View style={styles.payoutRowRight}><Text style={styles.payoutRowAmount}>₦{Number(request.amount).toLocaleString('en-NG')}</Text><Text style={[styles.payoutStatus, request.status === 'paid' && styles.payoutStatusPaid, request.status === 'rejected' && styles.payoutStatusRejected]}>{request.status}</Text></View></View>) : <View style={styles.payoutEmpty}><Ionicons name="wallet-outline" size={35} color="#176E73" /><Text style={styles.emptyOrdersTitle}>No payout requests yet</Text><Text style={styles.emptyOrdersCopy}>Complete an order, then request settlement here.</Text></View>}</View>
  </View>;
}

function PayoutMetric({ label, value, hint }: { label: string; value: string; hint: string }) { return <View style={styles.payoutMetric}><Text style={styles.payoutMetricValue}>{value}</Text><Text style={styles.payoutMetricLabel}>{label}</Text><Text style={styles.payoutMetricHint}>{hint}</Text></View>; }
function Settings({ vendor, onSaved, onLogOut }: { vendor: Vendor; onSaved: (details: Partial<Vendor>) => void; onLogOut: () => void }) {
  const [name, setName] = useState(vendor.name);
  const [category, setCategory] = useState(vendor.category ?? '');
  const [description, setDescription] = useState(vendor.description ?? '');
  const [bannerUrl, setBannerUrl] = useState(vendor.banner_url ?? '');
  const [location, setLocation] = useState(vendor.location ?? '');
  const [pickupLocation, setPickupLocation] = useState(vendor.pickup_location ?? '');
  const [pickupInstructions, setPickupInstructions] = useState(vendor.pickup_instructions ?? '');
  const [prepTime, setPrepTime] = useState(vendor.average_prep_time ?? '30–60 mins');
  const [importantMessage, setImportantMessage] = useState(vendor.important_message ?? '');
  const [operatingLocation, setOperatingLocation] = useState<'on_campus' | 'off_campus' | null>(vendor.operating_location ?? null);
  const [saving, setSaving] = useState(false);
  const isService = vendor.store_type === 'service';
  const save = async () => {
    if (!name.trim()) { Alert.alert('Store name required', 'Add a name before saving your store profile.'); return; }
    if (category.trim().length < 2) { Alert.alert('Store category required', 'Add the category customers should see, such as Bakery, Native pot, or Groceries.'); return; }
    if (importantMessage.trim().length > 280) { Alert.alert('Message is too long', 'Important messages can be up to 280 characters.'); return; }
    const details = { name: name.trim(), category: category.trim(), operating_location: operatingLocation, description: description.trim() || null, banner_url: bannerUrl.trim() || null, location: location.trim() || null, pickup_location: pickupLocation.trim() || null, pickup_instructions: pickupInstructions.trim() || null, average_prep_time: prepTime.trim() || null, important_message: importantMessage.trim() || null };
    setSaving(true);
    const { error } = await supabase.from('vendors').update(details).eq('id', vendor.id);
    setSaving(false);
    if (error) { Alert.alert('Settings not saved', friendlyError(error, 'Review the required store details and try again.')); return; }
    onSaved(details);
    Alert.alert('Store settings saved', 'Your customer-facing store details are updated.');
  };
  if (!operatingLocation) return <View style={styles.settingsPage}><Head title="Settings" subtitle="Classify your operating location before updating the rest of your store." /><View style={[styles.settingsCard, { maxWidth: 620 }]}><View style={styles.settingsCardHead}><Ionicons name="location-outline" size={21} color="#176E73" /><View><Text style={styles.settingsCardTitle}>Where does your business operate?</Text><Text style={styles.settingsCardSub}>AOM uses this to apply the correct customer delivery rate.</Text></View></View><View style={styles.pills}>{(['on_campus', 'off_campus'] as const).map((value) => <TouchableOpacity key={value} onPress={() => { void (async () => { const { error } = await supabase.from('vendors').update({ operating_location: value }).eq('id', vendor.id); if (error) { Alert.alert('Location not saved', friendlyError(error, 'Choose On campus or Off campus again, then retry.')); return; } setOperatingLocation(value); onSaved({ operating_location: value }); })(); }} style={styles.pill}><Text style={styles.pillText}>{value === 'on_campus' ? 'On campus' : 'Off campus'}</Text></TouchableOpacity>)}</View></View></View>;
  return <View style={styles.settingsPage}><Head title="Settings" subtitle={isService ? "Update what clients see before booking your service." : "Update what customers see and how they collect orders from your store."} /><View style={styles.settingsGrid}><View style={styles.settingsCard}><View style={styles.settingsCardHead}><Ionicons name="storefront-outline" size={21} color="#176E73" /><View><Text style={styles.settingsCardTitle}>Storefront</Text><Text style={styles.settingsCardSub}>Your public store identity and browsing details.</Text></View></View><SettingsField label="Store name" value={name} onChangeText={setName} placeholder="Your store name" /><SettingsField label="Store category" value={category} onChangeText={setCategory} placeholder={isService ? "e.g. Beauty, Tech, Wellness" : "e.g. Native pot, Bakery, Groceries"} /><SettingsField label="Short description" value={description} onChangeText={setDescription} placeholder="Tell customers what your store offers" multiline /><SettingsField label="Banner image URL" value={bannerUrl} onChangeText={setBannerUrl} placeholder="https://..." autoCapitalize="none" /><SettingsField label="Store location" value={location} onChangeText={setLocation} placeholder={isService ? "e.g. Off campus, Jimeta" : "e.g. Block B, Shop 160"} /><SettingsField label="Average preparation time" value={prepTime} onChangeText={setPrepTime} placeholder="e.g. 30–60 mins" /></View><View style={styles.settingsCard}><View style={styles.settingsCardHead}><Ionicons name={isService ? "location-outline" : "bag-handle-outline"} size={21} color="#176E73" /><View><Text style={styles.settingsCardTitle}>{isService ? 'Service location and customer notice' : 'Pickup and customer notice'}</Text><Text style={styles.settingsCardSub}>{isService ? 'Shown to clients before they confirm a booking.' : 'Shown when a customer chooses collection from your store.'}</Text></View></View><SettingsField label={isService ? 'Service location' : 'Pickup location'} value={pickupLocation} onChangeText={setPickupLocation} placeholder={isService ? 'e.g. Off campus, Jimeta' : "e.g. Sholly's Restaurant counter"} /><SettingsField label={isService ? 'Service instructions' : 'Pickup instructions'} value={pickupInstructions} onChangeText={setPickupInstructions} placeholder="Where to go and what to bring" multiline /><SettingsField label="Important message (optional)" value={importantMessage} onChangeText={setImportantMessage} placeholder={isService ? 'Share an important notice with clients.' : 'e.g. We are closed on Sundays.'} multiline /><Text style={styles.messageCount}>{importantMessage.length}/280 characters</Text><View style={styles.settingsTip}><Ionicons name="eye-outline" size={20} color="#176E73" /><Text style={styles.settingsTipText}>{isService ? 'The important message appears on your service page whenever you add one.' : 'The important message appears on your store page whenever you add one.'}</Text></View></View></View><View style={styles.settingsActions}><TouchableOpacity onPress={onLogOut} style={styles.logoutSettings}><Ionicons name="log-out-outline" size={19} color="#B64A4A" /><Text style={styles.logoutSettingsText}>Log out</Text></TouchableOpacity><TouchableOpacity disabled={saving} onPress={() => void save()} style={[styles.saveSettings, saving && styles.saveSettingsDisabled]}>{saving ? <ActivityIndicator color="#01193D" /> : <><Ionicons name="save-outline" size={19} color="#01193D" /><Text style={styles.saveSettingsText}>Save store settings</Text></>}</TouchableOpacity></View></View>;
}
function SettingsField({ label, multiline, ...props }: { label: string; multiline?: boolean } & React.ComponentProps<typeof TextInput>) { return <View style={styles.settingsField}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...props} multiline={multiline} placeholderTextColor="#99A0AA" style={[styles.settingsInput, multiline && styles.settingsTextArea]} /></View>; }
function ComingSoon({ page }: { page: Page }) { return <View style={styles.center}><Ionicons name="construct-outline" size={44} color="#176E73" /><Text style={styles.emptyTitle}>{page[0].toUpperCase() + page.slice(1)} is next</Text><Text style={styles.emptyCopy}>We are building this section after the order workflow.</Text></View>; }

function Analytics() {
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [range, setRange] = useState<7 | 30 | 'all'>(7);
  const [loading, setLoading] = useState(true);
  const [storeName, setStoreName] = useState('Your store');
  const [isService, setIsService] = useState(false);
  useEffect(() => { void (async () => {
    const { data: auth } = await supabase.auth.getUser();
    const { data: vendor } = await supabase.from('vendors').select('name, store_type').eq('owner_id', auth.user?.id ?? '').maybeSingle();
    if (vendor) { setStoreName(vendor.name || 'Your store'); setIsService(vendor.store_type === 'service'); }
    setOrders(await loadVendorOrders()); setLoading(false);
  })(); }, []);
  const cutoff = range === 'all' ? 0 : Date.now() - range * 24 * 60 * 60 * 1000;
  const scoped = orders.filter((order) => !cutoff || new Date(order.created_at).getTime() >= cutoff);
  const paidOrders = scoped.filter((order) => !['cancelled', 'rejected'].includes(order.status));
  const revenue = paidOrders.reduce((total, order) => total + order.items.reduce((sum, item) => sum + (item.isReplacement ? 0 : item.unit_price * item.quantity), 0), 0);
  const average = paidOrders.length ? Math.round(revenue / paidOrders.length) : 0;
  const productSales = paidOrders.flatMap((order) => order.items).filter((item) => !item.isReplacement).reduce<Record<string, { units: number; revenue: number }>>((result, item) => { const current = result[item.product_name] ?? { units: 0, revenue: 0 }; current.units += item.quantity; current.revenue += item.unit_price * item.quantity; result[item.product_name] = current; return result; }, {});
  const topProducts = Object.entries(productSales).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);
  const fulfilled = paidOrders.filter((order) => ['ready', 'out_for_delivery', 'delivered'].includes(order.status)).length;
  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#25B68A" /></View>;
  const accepted = scoped.filter((order) => ['accepted', 'preparing'].includes(order.status)).length;
  const cancelled = scoped.filter((order) => ['cancelled', 'rejected'].includes(order.status)).length;
  return <View style={styles.portalPage}><Head title="Analytics" subtitle={`A clear view of ${storeName}’s ${isService ? 'bookings and sales' : 'orders and sales'}.`} /><View style={styles.rangeRow}>{([7, 30, 'all'] as const).map((value) => <TouchableOpacity key={String(value)} onPress={() => setRange(value)} style={[styles.rangeButton, range === value && styles.rangeButtonActive]}><Text style={[styles.rangeText, range === value && styles.rangeTextActive]}>{value === 'all' ? 'All time' : `Last ${value} days`}</Text></TouchableOpacity>)}</View><View style={styles.analyticsMetrics}><AnalyticsMetric label={isService ? 'Booking value' : 'Order value'} value={`₦${revenue.toLocaleString('en-NG')}`} hint="Excludes cancelled requests" /><AnalyticsMetric label={isService ? 'Bookings received' : 'Orders received'} value={String(scoped.length)} hint={`${fulfilled} completed`} /><AnalyticsMetric label={isService ? 'Average booking' : 'Average order'} value={`₦${average.toLocaleString('en-NG')}`} hint="Across accepted requests" /></View><View style={styles.analyticsGrid}><View style={styles.analyticsCard}><Text style={styles.sectionTitle}>{isService ? 'Booking status' : 'Order status'}</Text><StatusLine label="Waiting for action" value={scoped.filter((order) => order.status === 'pending').length} colour="#F0A22E" total={scoped.length} /><StatusLine label={isService ? 'Booking accepted' : 'Being prepared'} value={accepted} colour="#176E73" total={scoped.length} /><StatusLine label={isService ? 'Session complete' : 'Ready / completed'} value={fulfilled} colour="#25B68A" total={scoped.length} /><StatusLine label={isService ? 'Booking rejected' : 'Cancelled'} value={cancelled} colour="#C86D6D" total={scoped.length} /></View><View style={styles.analyticsCard}><Text style={styles.sectionTitle}>{isService ? 'Top services' : 'Top products'}</Text>{topProducts.length ? topProducts.map(([product, stats], index) => <View key={product} style={styles.productRank}><View style={styles.rank}><Text style={styles.rankText}>{index + 1}</Text></View><View style={{ flex: 1 }}><Text style={styles.rankName}>{product}</Text><Text style={styles.rankSub}>{stats.units} {isService ? 'booking' : 'item'}{stats.units === 1 ? '' : 's'}</Text></View><Text style={styles.rankValue}>₦{stats.revenue.toLocaleString('en-NG')}</Text></View>) : <Text style={styles.analyticsEmpty}>{isService ? 'Your most-booked services will appear after clients make bookings.' : 'Your best sellers will appear after customers place orders.'}</Text>}</View></View><View style={styles.analyticsNote}><Ionicons name="information-circle-outline" size={21} color="#176E73" /><Text style={styles.analyticsNoteText}>Sales shown here are customer purchase values. AOM service fees and future payouts are tracked separately.</Text></View></View>;
}

function AnalyticsMetric({ label, value, hint }: { label: string; value: string; hint: string }) { return <View style={styles.analyticsMetric}><Text style={styles.analyticsValue}>{value}</Text><Text style={styles.analyticsLabel}>{label}</Text><Text style={styles.analyticsHint}>{hint}</Text></View>; }
function StatusLine({ label, value, colour, total }: { label: string; value: number; colour: string; total: number }) { return <View style={styles.statusLine}><View style={styles.statusLineTop}><View style={styles.statusLabelWrap}><View style={[styles.statusSwatch, { backgroundColor: colour }]} /><Text style={styles.statusLabel}>{label}</Text></View><Text style={styles.statusValue}>{value}</Text></View><View style={styles.statusTrack}><View style={[styles.statusFill, { backgroundColor: colour, width: `${total ? Math.max(6, Math.round((value / total) * 100)) : 0}%` }]} /></View></View>; }

function VendorApplication() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [storeName, setStoreName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [storeType, setStoreType] = useState<'marketplace' | 'supermarket' | 'service'>('marketplace');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [pickupLocation, setPickupLocation] = useState('');
  const [operatingLocation, setOperatingLocation] = useState<'on_campus' | 'off_campus' | null>(null);
  useEffect(() => { const load = async () => { const { data: auth } = await supabase.auth.getUser(); if (!auth.user) { setLoading(false); return; } setContactName(String(auth.user.user_metadata?.full_name ?? '')); setPhone(String(auth.user.user_metadata?.phone ?? '')); const { data } = await supabase.from('vendor_applications').select('store_name, contact_name, phone, store_type, operating_location, category, description, address, pickup_location, status').eq('user_id', auth.user.id).maybeSingle(); if (data) { setStoreName(data.store_name); setContactName(data.contact_name); setPhone(data.phone); setStoreType(data.store_type as 'marketplace' | 'supermarket' | 'service'); setOperatingLocation(data.operating_location as 'on_campus' | 'off_campus' | null); setCategory(data.category ?? ''); setDescription(data.description ?? ''); setAddress(data.address ?? ''); setPickupLocation(data.pickup_location ?? ''); setSubmitted(data.status === 'pending' || data.status === 'approved'); } setLoading(false); }; void load(); }, []);
  const submit = async () => {
    setFeedback('');
    if (!storeName.trim() || !contactName.trim() || !phone.trim() || category.trim().length < 2 || !operatingLocation) {
      setFeedback('Add the store name, contact name, phone number, customer-facing category, and operating location.');
      return;
    }
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setFeedback('Your session has expired. Please sign in and submit again.'); return; }
    setSaving(true);
    const { error } = await supabase.from('vendor_applications').upsert({
      user_id: auth.user.id,
      store_name: storeName.trim(),
      contact_name: contactName.trim(),
      phone: phone.trim(),
      store_type: storeType,
      operating_location: operatingLocation,
      category: category.trim(),
      description: description.trim() || null,
      address: address.trim() || null,
      pickup_location: pickupLocation.trim() || null,
      status: 'pending',
      reviewer_note: null,
      reviewed_at: null,
    }, { onConflict: 'user_id' });
    setSaving(false);
    if (error) {
      setFeedback(friendlyError(error, 'We could not submit the application. Review every required field, then try again.'));
      return;
    }
    setSubmitted(true);
  };
  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#25B68A" /></View>;
  if (submitted) return <View style={styles.applicationWrap}><View style={styles.applicationIcon}><Ionicons name="time-outline" size={32} color="#176E73" /></View><Text style={styles.applicationTitle}>Your store is under review</Text><Text style={styles.applicationCopy}>We have received your vendor application. Once AOM approves it, your store will be created and linked to this account automatically.</Text><View style={styles.applicationTip}><Ionicons name="desktop-outline" size={20} color="#176E73" /><Text style={styles.applicationTipText}>We will notify you when your desktop workspace is ready.</Text></View></View>;
  return <View style={styles.applicationForm}><Text style={styles.title}>Set up your vendor application</Text><Text style={styles.subtitle}>Tell AOM about your store. Approval automatically opens your own vendor workspace — no manual account linking needed.</Text><View style={styles.applicationCard}><Text style={styles.sectionTitle}>Store details</Text><ApplicationField label="Store name" value={storeName} onChangeText={(value) => { setStoreName(value); setFeedback(''); }} placeholder="e.g. Sholly’s Restaurant" /><ApplicationField label="Your full name" value={contactName} onChangeText={(value) => { setContactName(value); setFeedback(''); }} placeholder="Store contact" /><ApplicationField label="Phone number" value={phone} onChangeText={(value) => { setPhone(value); setFeedback(''); }} placeholder="0800 000 0000" keyboardType="phone-pad" /><Text style={styles.fieldLabel}>What does your store offer?</Text><View style={styles.pills}>{(['marketplace', 'supermarket', 'service'] as const).map((type) => <TouchableOpacity key={type} onPress={() => { setStoreType(type); setFeedback(''); }} style={[styles.pill, storeType === type && styles.pillActive]}><Text style={[styles.pillText, storeType === type && styles.pillTextActive]}>{type}</Text></TouchableOpacity>)}</View><Text style={styles.fieldLabel}>Where does your business operate?</Text><Text style={styles.applicationLocationHint}>Required for the correct customer delivery rate.</Text><View style={styles.pills}>{(['on_campus', 'off_campus'] as const).map((value) => <TouchableOpacity key={value} onPress={() => { setOperatingLocation(value); setFeedback(''); }} style={[styles.pill, operatingLocation === value && styles.pillActive]}><Text style={[styles.pillText, operatingLocation === value && styles.pillTextActive]}>{value === 'on_campus' ? 'On campus' : 'Off campus'}</Text></TouchableOpacity>)}</View><ApplicationField label="Store category" value={category} onChangeText={(value) => { setCategory(value); setFeedback(''); }} placeholder="e.g. Bakery, Native pot, Groceries" /><ApplicationField label="Short description (optional)" value={description} onChangeText={setDescription} placeholder="What should customers know?" multiline /><ApplicationField label="Store address (optional)" value={address} onChangeText={setAddress} placeholder="Building, avenue, or location" /><ApplicationField label="Pickup location (optional)" value={pickupLocation} onChangeText={setPickupLocation} placeholder="Where customers collect pickup orders" />{feedback ? <View style={styles.applicationFeedback}><Ionicons name="alert-circle-outline" size={18} color="#9A5B16" /><Text style={styles.applicationFeedbackText}>{feedback}</Text></View> : null}<TouchableOpacity onPress={submit} disabled={saving} style={[styles.submitApplication, saving && { opacity: 0.65 }]}>{saving ? <><ActivityIndicator size="small" color="#01193D" /><Text style={styles.submitApplicationText}>Submitting…</Text></> : <><Ionicons name="send-outline" size={18} color="#01193D" /><Text style={styles.submitApplicationText}>Submit for review</Text></>}</TouchableOpacity></View></View>;
}

function ApplicationField({ label, multiline, ...props }: { label: string; multiline?: boolean } & React.ComponentProps<typeof TextInput>) { return <View style={styles.applicationField}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...props} multiline={multiline} placeholderTextColor="#99A0AA" style={[styles.applicationInput, multiline && styles.applicationTextArea]} /></View>; }

function EditProductButton({ productId }: { productId: string }) {
  const router = useRouter();
  return <TouchableOpacity onPress={() => router.push(`/vendor-portal/item/${productId}`)} style={styles.iconButton} accessibilityLabel="Edit product"><Ionicons name="create-outline" size={18} color="#176E73" /></TouchableOpacity>;
}

const inventoryStyles = StyleSheet.create({
  placementColumn: { width: 34 },
  itemLeadColumn: { width: 103 },
  placementHandle: { width: 34, height: 48, alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'grab' as any },
  handleLong: { width: 18, height: 2, borderRadius: 1, backgroundColor: '#176E73' },
  handleShort: { width: 12, height: 2, borderRadius: 1, backgroundColor: '#176E73' },
  itemColumn: { flex: 2.1 },
  statusColumn: { flex: 1.1, alignItems: 'center', justifyContent: 'center', textAlign: 'center' },
  stockColumn: { flex: 1.15, alignItems: 'center', justifyContent: 'center', textAlign: 'center' },
  actionsColumn: { flex: 1.2, textAlign: 'center' },
  actions: { flex: 1.2, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  stockInput: { width: 48, color: '#176E73', textAlign: 'center', fontSize: 11, fontWeight: '800', paddingVertical: 4, paddingHorizontal: 0 },
});

const mobileInventoryStyles = StyleSheet.create({
  list: { gap: 12 },
  card: { borderWidth: 1, borderColor: '#E0E5EA', borderRadius: 13, padding: 12, backgroundColor: '#FFFFFF' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  price: { color: '#01193D', fontSize: 15, fontWeight: '800' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginTop: 12, paddingTop: 11, borderTopWidth: 1, borderColor: '#EEF1F4' },
});

const styles = StyleSheet.create({
  orderNote: { color: '#176E73', fontSize: 13, lineHeight: 18, marginTop: 3, fontStyle: 'italic' },
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, mobile: { flex: 1, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center', padding: 34 }, mobileTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', marginTop: 18 }, mobileText: { color: '#D9E5F0', textAlign: 'center', fontSize: 16, lineHeight: 24, marginTop: 12 }, top: { height: 76, backgroundColor: '#01193D', paddingHorizontal: 28, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, brand: { flexDirection: 'row', alignItems: 'center', gap: 13 }, storeName: { color: '#F8F3ED', fontSize: 19, fontWeight: '800' }, portal: { color: '#8796AE', fontSize: 16, fontWeight: '600' }, topRight: { flexDirection: 'row', alignItems: 'center', gap: 16 }, storeState: { height: 48, paddingHorizontal: 15, borderRadius: 12, borderWidth: 1, borderColor: '#19366A', flexDirection: 'row', alignItems: 'center', gap: 8 }, dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#20B487' }, dotClosed: { backgroundColor: '#8796AE' }, topText: { color: '#F8F3ED', fontSize: 15, fontWeight: '700' }, avatar: { width: 43, height: 43, borderRadius: 22, backgroundColor: '#435479', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#FFFFFF', fontWeight: '800' }, main: { flex: 1, flexDirection: 'row' }, sidebar: { width: 270, borderRightWidth: 1, borderColor: '#D8DDE3', paddingTop: 20 }, menu: { color: '#777777', fontSize: 14, fontWeight: '800', marginHorizontal: 24, marginBottom: 10 }, nav: { height: 47, paddingHorizontal: 25, flexDirection: 'row', alignItems: 'center', gap: 16, borderRightWidth: 3, borderRightColor: 'transparent' }, navActive: { backgroundColor: '#E2F5F0', borderRightColor: '#25B68A' }, navText: { color: '#747474', fontSize: 16, fontWeight: '600' }, navTextActive: { color: '#176E73', fontWeight: '800' }, ordersDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#F08A16', marginLeft: 'auto', marginRight: 8 }, workspace: { flex: 1, padding: 34 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: '#01193D', fontSize: 23, fontWeight: '800', marginTop: 14 }, emptyCopy: { color: '#697485', fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 8, maxWidth: 390 }, head: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 24 }, title: { color: '#222222', fontSize: 26, fontWeight: '800' }, subtitle: { color: '#7C7C7C', fontSize: 16, marginTop: 5 }, headButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, button: { minHeight: 48, borderRadius: 11, borderWidth: 1, borderColor: '#C9CED5', paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, buttonText: { color: '#242424', fontSize: 15, fontWeight: '700' }, notice: { minHeight: 78, borderRadius: 14, borderWidth: 1.5, borderColor: '#25B68A', backgroundColor: '#E1F6F0', paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24 }, noticeClosed: { backgroundColor: '#FFE4A9', borderColor: '#F1A000' }, noticeTitle: { color: '#176E73', fontSize: 17, fontWeight: '800' }, noticeText: { color: '#176E73', fontSize: 14, marginTop: 3 }, openText: { color: '#176E73', fontSize: 15, fontWeight: '700' }, tabs: { flexDirection: 'row', gap: 30, borderBottomWidth: 1, borderBottomColor: '#DEE1E5' }, tabsMobile: { flexWrap: 'wrap', gap: 12, paddingBottom: 2 }, tab: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 13, borderBottomWidth: 3, borderBottomColor: 'transparent' }, tabActive: { borderBottomColor: '#25B68A' }, tabText: { color: '#888888', fontSize: 16 }, tabTextActive: { color: '#176E73', fontWeight: '800' }, count: { color: '#808080', borderWidth: 1, borderColor: '#D5D8DC', borderRadius: 10, paddingHorizontal: 7, fontSize: 13 }, tools: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginVertical: 20 }, search: { width: 245, height: 44, borderWidth: 1, borderColor: '#D8DDE3', borderRadius: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, searchMobile: { width: '100%' }, searchInput: { flex: 1, height: '100%', color: '#222222', fontSize: 15 }, headerRow: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 10 }, column: { flex: 1, color: '#888888', fontSize: 13, fontWeight: '800' }, row: { minHeight: 75, borderTopWidth: 1, borderColor: '#E3E6E9', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12 }, itemIcon: { width: 45, height: 45, borderRadius: 10, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center' }, itemName: { color: '#292929', fontSize: 16, fontWeight: '800' }, itemSub: { color: '#8A8A8A', fontSize: 13, marginTop: 3 }, price: { flex: 1, color: '#242424', fontSize: 15, fontWeight: '700' }, status: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E1F6F0', borderRadius: 16, paddingVertical: 7, paddingHorizontal: 11, maxWidth: 110 }, sold: { backgroundColor: '#FFE0E0' }, hidden: { backgroundColor: '#F2F2F2' }, statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#20B487' }, statusText: { color: '#176E73', fontSize: 13, fontWeight: '800' }, actions: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center' }, stockControl: { width: 110, minHeight: 38, borderRadius: 9, borderWidth: 1, borderColor: '#BFD8D0', paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 2 }, stockButton: { width: 24, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E1F6F0' }, stockButtonDisabled: { opacity: 0.4 }, stockValue: { minWidth: 42, color: '#176E73', textAlign: 'center', fontSize: 12, fontWeight: '800' }, iconButton: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: '#CDD2D8', alignItems: 'center', justifyContent: 'center' }, none: { color: '#8A8A8A', textAlign: 'center', marginTop: 38, fontSize: 15 }, schedule: { borderWidth: 1, borderColor: '#E0E4E8', borderRadius: 15, overflow: 'hidden' }, scheduleHead: { padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderColor: '#E0E4E8' }, scheduleTitle: { color: '#242424', fontSize: 19, fontWeight: '800' }, scheduleSub: { color: '#7C7C7C', fontSize: 14, marginTop: 4 }, dayRow: { minHeight: 56, borderBottomWidth: 1, borderColor: '#E5E8EB', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 16 }, day: { width: 42, color: '#343434', fontSize: 16, fontWeight: '700' }, hours: { flexDirection: 'row', alignItems: 'center', gap: 10 }, time: { color: '#555555', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7, backgroundColor: '#F6F7F8', borderWidth: 1, borderColor: '#E1E3E6' }, timeInput: { width: 94, color: '#555555', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7, backgroundColor: '#F6F7F8', borderWidth: 1, borderColor: '#E1E3E6', fontSize: 14 }, to: { color: '#777777' }, closed: { color: '#8A8A8A', fontSize: 15 }, quickLabel: { color: '#888888', fontSize: 13, fontWeight: '800', marginTop: 24, marginBottom: 12 }, quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, quick: { width: '48%', minHeight: 82, borderRadius: 13, borderWidth: 1, borderColor: '#E0E4E8', padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13 }, quickTitle: { color: '#343434', fontSize: 16, fontWeight: '800' }, quickSub: { color: '#8A8A8A', fontSize: 13, marginTop: 3 },
  rejectionPanel: { marginTop: 18, padding: 18, borderRadius: 13, borderWidth: 1, borderColor: '#F0C879', backgroundColor: '#FFF9ED' }, rejectionHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, marginBottom: 15 }, rejectionTitle: { color: '#592F00', fontSize: 16, fontWeight: '800' }, rejectionHelp: { color: '#7A633E', fontSize: 13, lineHeight: 18, marginTop: 4, maxWidth: 550 }, rejectionLabel: { color: '#7A633E', fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8, marginTop: 5 }, reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 58, paddingHorizontal: 11, paddingVertical: 9, borderWidth: 1, borderColor: '#E2D9C7', borderRadius: 9, backgroundColor: '#FFFFFF', marginTop: 7 }, reasonRowActive: { borderColor: '#D89116', backgroundColor: '#FFF5DE' }, radio: { width: 19, height: 19, borderRadius: 10, borderWidth: 1.5, borderColor: '#9A9A9A', alignItems: 'center', justifyContent: 'center' }, radioActive: { borderColor: '#D06D00' }, radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#D06D00' }, reasonText: { color: '#263340', fontSize: 14, fontWeight: '800' }, reasonNote: { color: '#7B8794', fontSize: 12, lineHeight: 16, marginTop: 2 }, alternativeSection: { marginTop: 11 }, alternativePills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, alternativePill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#D0D8DF', borderRadius: 18, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#FFFFFF' }, alternativePillActive: { borderColor: '#25B68A', backgroundColor: '#E1F6F0' }, alternativePillText: { color: '#526273', fontSize: 12, fontWeight: '700' }, alternativePillTextActive: { color: '#176E73' }, noAlternatives: { color: '#7A633E', fontSize: 13, lineHeight: 18, padding: 10, borderRadius: 8, backgroundColor: '#FFF2D5' }, otherReasonInput: { minHeight: 74, marginTop: 12, borderWidth: 1, borderColor: '#D5DDE4', borderRadius: 9, backgroundColor: '#FFFFFF', padding: 11, color: '#263340', fontSize: 14, textAlignVertical: 'top' }, rejectionActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 }, rejectConfirm: { minHeight: 42, paddingHorizontal: 16, borderRadius: 9, backgroundColor: '#B54A36', alignItems: 'center', justifyContent: 'center' }, rejectConfirmDisabled: { opacity: 0.65 }, rejectConfirmText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
}) as any;

Object.assign(styles, {
  topMobile: { height: 68, paddingHorizontal: 15 }, mainMobile: { flexDirection: 'column' }, workspaceContentMobile: { padding: 16, paddingBottom: 36 }, mobileNavBar: { flexGrow: 0, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderColor: '#D8DDE3' }, mobileNavContent: { paddingHorizontal: 10, gap: 8, alignItems: 'center' }, mobileNav: { minHeight: 52, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 3, borderBottomColor: 'transparent' }, mobileNavActive: { borderBottomColor: '#25B68A' }, mobileNavText: { color: '#607080', fontSize: 12, fontWeight: '700' }, mobileOrdersDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#F08A16', marginLeft: 1 },
  portalPage: { flex: 1 }, workspaceContent: { flexGrow: 1, padding: 34 }, sectionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18 }, sectionTitle: { color: '#01193D', fontSize: 19, fontWeight: '800' }, link: { color: '#176E73', fontSize: 14, fontWeight: '800' },
  orderCard: { borderWidth: 1, borderColor: '#E0E4E8', borderRadius: 15, padding: 20, marginBottom: 14 }, orderNumber: { color: '#01193D', fontSize: 16, fontWeight: '800' }, orderMeta: { color: '#7C7C7C', fontSize: 13, marginTop: 4 }, orderStatus: { borderRadius: 16, backgroundColor: '#E1F6F0', paddingHorizontal: 11, paddingVertical: 7 }, pendingStatus: { backgroundColor: '#FFF1D6' }, orderStatusText: { color: '#176E73', fontSize: 12, fontWeight: '800', textTransform: 'capitalize' }, orderItem: { color: '#334155', fontSize: 15, marginTop: 12 }, orderActions: { flexDirection: 'row', gap: 10, marginTop: 18 }, action: { minHeight: 42, paddingHorizontal: 16, borderRadius: 9, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center' }, actionSecondary: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D0D6DC' }, actionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' }, actionTextSecondary: { color: '#526273' }, emptyOrders: { alignItems: 'center', paddingVertical: 45 }, emptyOrdersTitle: { color: '#01193D', fontSize: 18, fontWeight: '800', marginTop: 12 }, emptyOrdersCopy: { color: '#7C7C7C', fontSize: 14, marginTop: 6 },
  metricRow: { flexDirection: 'row', gap: 14, marginBottom: 26 }, metric: { flex: 1, minHeight: 118, borderRadius: 15, backgroundColor: '#E8F5F2', padding: 18, justifyContent: 'space-between' }, metricValue: { color: '#01193D', fontSize: 26, fontWeight: '800' }, metricLabel: { color: '#176E73', fontSize: 14, fontWeight: '700' }, dashboardSection: { borderWidth: 1, borderColor: '#E0E4E8', borderRadius: 15, padding: 20, marginBottom: 18 }, preview: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderColor: '#E4E7EB', paddingVertical: 16, marginTop: 14 },
  settingsPage: { flex: 1, paddingBottom: 32 }, settingsGrid: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' }, settingsCard: { flex: 1, borderWidth: 1, borderColor: '#E0E5EA', borderRadius: 15, padding: 22, backgroundColor: '#FFFFFF' }, settingsCardHead: { flexDirection: 'row', gap: 11, marginBottom: 20 }, settingsCardTitle: { color: '#01193D', fontSize: 18, fontWeight: '800' }, settingsCardSub: { color: '#7B8794', fontSize: 13, marginTop: 3 }, settingsField: { marginBottom: 15 }, settingsInput: { minHeight: 46, borderWidth: 1, borderColor: '#CFD7E0', borderRadius: 9, paddingHorizontal: 12, color: '#192431', fontSize: 15 }, settingsTextArea: { minHeight: 78, paddingTop: 12, textAlignVertical: 'top' }, settingsActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }, logoutSettings: { minHeight: 52, borderRadius: 11, borderWidth: 1, borderColor: '#E8B5B0', backgroundColor: '#FFF7F6', paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, logoutSettingsText: { color: '#B64A4A', fontSize: 15, fontWeight: '800' }, saveSettings: { minHeight: 52, borderRadius: 11, backgroundColor: '#68ECCB', paddingHorizontal: 21, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, saveSettingsText: { color: '#01193D', fontSize: 15, fontWeight: '800' },
  returnButton: { minHeight: 50, marginTop: 20, borderRadius: 10, backgroundColor: '#01193D', paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' }, returnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  applicationWrap: { flex: 1, maxWidth: 500, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', paddingVertical: 90 }, applicationIcon: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#E1F6F0', alignItems: 'center', justifyContent: 'center' }, applicationTitle: { color: '#01193D', fontSize: 25, fontWeight: '800', marginTop: 20 }, applicationCopy: { color: '#697485', fontSize: 16, lineHeight: 24, textAlign: 'center', marginTop: 10 }, applicationTip: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 24, padding: 16, backgroundColor: '#E1F6F0', borderRadius: 12 }, applicationTipText: { flex: 1, color: '#176E73', fontSize: 14, lineHeight: 20 }, applicationForm: { flex: 1, maxWidth: 760, alignSelf: 'center', width: '100%', paddingVertical: 22 }, applicationCard: { marginTop: 24, backgroundColor: '#FFFFFF', borderRadius: 15, borderWidth: 1, borderColor: '#E0E5EA', padding: 25 }, applicationField: { marginBottom: 16 }, applicationInput: { height: 46, borderWidth: 1, borderColor: '#CFD7E0', borderRadius: 9, paddingHorizontal: 12, color: '#192431', fontSize: 15 }, applicationTextArea: { height: 80, paddingTop: 12, textAlignVertical: 'top' }, applicationLocationHint: { color: '#748191', fontSize: 13, marginTop: -3, marginBottom: 10 }, applicationFeedback: { minHeight: 44, marginBottom: 12, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 9, backgroundColor: '#FFF1D6', borderWidth: 1, borderColor: '#F3C76A', flexDirection: 'row', alignItems: 'center', gap: 8 }, applicationFeedbackText: { flex: 1, color: '#805E15', fontSize: 13, lineHeight: 18, fontWeight: '700' }, submitApplication: { minHeight: 52, borderRadius: 10, backgroundColor: '#68ECCB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 18 }, submitApplicationText: { color: '#01193D', fontSize: 15, fontWeight: '800' }, fieldLabel: { color: '#485666', fontSize: 13, fontWeight: '800', marginBottom: 7 }, pills: { flexDirection: 'row', gap: 9, flexWrap: 'wrap', marginBottom: 18 }, pill: { borderRadius: 20, borderWidth: 1, borderColor: '#C9D1DA', paddingHorizontal: 13, paddingVertical: 8 }, pillActive: { borderColor: '#25B68A', backgroundColor: '#E1F6F0' }, pillText: { color: '#617081', textTransform: 'capitalize', fontSize: 14, fontWeight: '700' }, pillTextActive: { color: '#176E73' },
  payoutHero: { minHeight: 170, borderRadius: 18, backgroundColor: '#01193D', padding: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }, payoutEyebrow: { color: '#8FEAD3', fontSize: 12, fontWeight: '800', letterSpacing: 0.7 }, payoutAmount: { color: '#FFFFFF', fontSize: 36, fontWeight: '800', marginTop: 8 }, payoutNote: { color: '#C9D7EA', fontSize: 14, marginTop: 6 }, payoutButton: { minHeight: 52, borderRadius: 11, paddingHorizontal: 19, backgroundColor: '#68ECCB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, payoutButtonDisabled: { backgroundColor: '#AAB6C7' }, payoutButtonText: { color: '#01193D', fontSize: 15, fontWeight: '800' }, payoutMetrics: { flexDirection: 'row', gap: 14, marginBottom: 18 }, payoutMetric: { flex: 1, minHeight: 120, borderRadius: 15, borderWidth: 1, borderColor: '#E0E5EA', padding: 18, backgroundColor: '#FFFFFF', justifyContent: 'space-between' }, payoutMetricValue: { color: '#01193D', fontSize: 24, fontWeight: '800' }, payoutMetricLabel: { color: '#176E73', fontSize: 14, fontWeight: '800' }, payoutMetricHint: { color: '#7B8794', fontSize: 12, lineHeight: 17 }, payoutInfo: { padding: 16, borderRadius: 12, backgroundColor: '#E1F6F0', flexDirection: 'row', gap: 11, marginBottom: 18 }, payoutInfoText: { flex: 1, color: '#176E73', fontSize: 13, lineHeight: 19 }, payoutPanel: { borderRadius: 15, borderWidth: 1, borderColor: '#E0E5EA', padding: 20, backgroundColor: '#FFFFFF', marginBottom: 28 }, payoutPanelSub: { color: '#7B8794', fontSize: 13, marginTop: 4 }, payoutRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderColor: '#EDF0F3', marginTop: 15, paddingTop: 15 }, payoutRowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F0F6F7', alignItems: 'center', justifyContent: 'center' }, payoutRowTitle: { color: '#1F2937', fontSize: 15, fontWeight: '800' }, payoutRowMeta: { color: '#7B8794', fontSize: 12, marginTop: 4 }, payoutRowRight: { alignItems: 'flex-end' }, payoutRowAmount: { color: '#01193D', fontSize: 15, fontWeight: '800' }, payoutStatus: { color: '#8A6415', fontSize: 11, textTransform: 'capitalize', fontWeight: '800', marginTop: 4 }, payoutStatusPaid: { color: '#176E73' }, payoutStatusRejected: { color: '#B64A4A' }, payoutEmpty: { alignItems: 'center', paddingVertical: 45 },
  rangeRow: { flexDirection: 'row', gap: 10, marginBottom: 22 }, rangeButton: { borderWidth: 1, borderColor: '#D4DAE0', borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10 }, rangeButtonActive: { backgroundColor: '#01193D', borderColor: '#01193D' }, rangeText: { color: '#647181', fontSize: 14, fontWeight: '700' }, rangeTextActive: { color: '#FFFFFF' }, analyticsMetrics: { flexDirection: 'row', gap: 14, marginBottom: 20 }, analyticsMetric: { flex: 1, minHeight: 132, backgroundColor: '#FFFFFF', borderRadius: 15, borderWidth: 1, borderColor: '#E0E5EA', padding: 20, justifyContent: 'space-between' }, analyticsValue: { color: '#01193D', fontSize: 25, fontWeight: '800' }, analyticsLabel: { color: '#176E73', fontSize: 15, fontWeight: '800' }, analyticsHint: { color: '#7B8794', fontSize: 12, marginTop: 3 }, analyticsGrid: { flexDirection: 'row', gap: 18 }, analyticsCard: { flex: 1, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E5EA', padding: 21 }, statusLine: { marginTop: 19 }, statusLineTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }, statusLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 }, statusSwatch: { width: 9, height: 9, borderRadius: 5 }, statusLabel: { color: '#526273', fontSize: 14, fontWeight: '600' }, statusValue: { color: '#01193D', fontSize: 15, fontWeight: '800' }, statusTrack: { height: 7, borderRadius: 5, backgroundColor: '#EDF0F3', overflow: 'hidden' }, statusFill: { height: '100%', borderRadius: 5 }, productRank: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 13, borderBottomWidth: 1, borderColor: '#EDF0F3' }, rank: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#E1F6F0', alignItems: 'center', justifyContent: 'center' }, rankText: { color: '#176E73', fontSize: 13, fontWeight: '800' }, rankName: { color: '#1F2937', fontSize: 14, fontWeight: '800' }, rankSub: { color: '#7B8794', fontSize: 12, marginTop: 2 }, rankValue: { color: '#176E73', fontSize: 14, fontWeight: '800' }, analyticsEmpty: { color: '#7B8794', fontSize: 14, marginTop: 24, lineHeight: 20 }, analyticsNote: { borderRadius: 12, padding: 16, flexDirection: 'row', gap: 11, backgroundColor: '#E1F6F0', marginTop: 20 }, analyticsNoteText: { flex: 1, color: '#176E73', fontSize: 13, lineHeight: 19 },
});
