import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/user-error';
import { confirmAction } from '../../lib/confirm-action';

type Role = 'manager' | 'kitchen' | 'cashier' | 'server';
type Section = 'overview' | 'menu' | 'orders' | 'dispatch' | 'report' | 'settings';
type Category = 'snacks' | 'lunch' | 'dinner';
type Status = 'available' | 'sold_out' | 'hidden';
type Staff = { role: Role; is_active: boolean };
type Product = {
  id: string;
  name: string;
  description: string | null;
  category: Category;
  categories: Category[] | null;
  sort_order: number | null;
  price: number;
  status: Status;
  meal_plan_eligible: boolean;
  image_url: string | null;
  stock_quantity: number | null;
};
type ChoiceDraft = { group: string; name: string; price: string };
type Settings = {
  id: boolean;
  is_accepting_orders: boolean;
  snacks_open: boolean;
  lunch_open: boolean;
  dinner_open: boolean;
  customer_notice: string | null;
};
type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  total: number | null;
  delivery_address: string | null;
  delivery_instructions: string | null;
  delivery_slot: string | null;
  delivery_type: string | null;
  rider_id: string | null;
  rider_name: string | null;
  rider_phone: string | null;
  rider_assigned_at: string | null;
  dispatch_status: string | null;
  customer_name: string;
  customer_phone: string | null;
  created_at: string;
};
type OrderItem = {
  id: string;
  order_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  options: unknown;
  notes: string | null;
  meal_plan_credit: number;
  packaging_fee: number;
};
type CafeteriaOrder = OrderRow & { items: OrderItem[] };
type WalkingAgent = {
  rider_id: string;
  full_name: string;
  phone: string;
  current_zone: string | null;
  campus_zones: string[];
  max_orders_per_run: number;
  active_orders: number;
  runs_today: number;
  schedule_added: boolean;
  recommendation_score: number;
};
type Rider = { id: string; full_name: string; phone: string; accepts_calls: boolean; accepts_whatsapp: boolean; coverage_area: string | null; availability: string; walking_status: string; campus_zones: string[]; max_orders_per_run: number; cafeteria_note: string | null };
type RiderSchedule = { id: string; rider_id: string; day_of_week: number; starts_at: string; ends_at: string; is_active: boolean };

const periods: Category[] = ['snacks', 'lunch', 'dinner'];
const roleNames: Record<Role, string> = {
  manager: 'Cafeteria manager',
  kitchen: 'Kitchen team',
  cashier: 'Cashier',
  server: 'Serving team',
};
const defaultSettings: Settings = {
  id: true,
  is_accepting_orders: true,
  snacks_open: true,
  lunch_open: true,
  dinner_open: true,
  customer_notice: null,
};
const money = (value: number | null | undefined) => `₦${Number(value ?? 0).toLocaleString('en-NG')}`;
const dateTime = (value: string) => new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(new Date(value));
const categoriesFor = (product: Pick<Product, 'category' | 'categories'>) => product.categories?.length ? product.categories : [product.category];
const optionText = (value: unknown) => {
  if (!Array.isArray(value)) return '';
  return value.map((entry) => {
    if (typeof entry === 'string') return entry;
    if (!entry || typeof entry !== 'object') return '';
    const row = entry as Record<string, unknown>;
    return String(row.name ?? row.label ?? '').trim();
  }).filter(Boolean).join(', ');
};

export default function CafeteriaPortalWorkspace() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [section, setSection] = useState<Section>('overview');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<CafeteriaOrder[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [workingId, setWorkingId] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const isManager = staff?.role === 'manager';

  const loadOrders = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_cafeteria_operations_orders');
    if (error) {
      setFeedback(`Orders could not load: ${error.message}`);
      return;
    }
    const orderRows = Array.isArray(data) ? data as CafeteriaOrder[] : [];
    setOrders(orderRows.map((order) => ({
      ...order,
      delivery_address: [order.delivery_address, order.delivery_instructions].filter(Boolean).join(' · ') || null,
      items: Array.isArray(order.items) ? order.items : [],
    })));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setLoading(false); return; }
    const [{ data: access }, { data: productRows }, { data: settingRow }] = await Promise.all([
      supabase.from('cafeteria_staff').select('role, is_active').eq('user_id', auth.user.id).maybeSingle(),
      supabase.from('cafeteria_products').select('id, name, description, category, categories, sort_order, price, status, meal_plan_eligible, image_url, stock_quantity').order('sort_order').order('name'),
      supabase.from('cafeteria_settings').select('*').eq('id', true).maybeSingle(),
    ]);
    setStaff(access?.is_active ? access as Staff : null);
    setProducts((productRows ?? []) as Product[]);
    setSettings(settingRow ? settingRow as Settings : defaultSettings);
    if (access?.is_active) await loadOrders();
    setLoading(false);
  }, [loadOrders]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!staff) return;
    const channel = supabase.channel('cafeteria-operations-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cafeteria_order_items' }, () => void loadOrders())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => void loadOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cafeteria_settings' }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, loadOrders, staff]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  if (width < 760) return <DesktopPrompt />;
  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#68ECCB" /></View>;
  if (!staff) return <AccessPrompt onReturn={() => router.replace('/(buyer)/')} />;

  return <View style={styles.screen}>
    <StatusBar style="light" />
    <View style={styles.topbar}>
      <View style={styles.brand}><Ionicons name="restaurant-outline" size={25} color="#68ECCB" /><Text style={styles.brandName}>AUN Cafeteria</Text><Text style={styles.brandPortal}>Operations portal</Text></View>
      <View style={styles.topActions}><View style={styles.acceptingPill}><View style={[styles.liveDot, !settings.is_accepting_orders && styles.closedDot]} /><Text style={styles.acceptingText}>{settings.is_accepting_orders ? 'Accepting orders' : 'Orders paused'}</Text></View><View style={styles.rolePill}><Ionicons name="shield-checkmark-outline" size={18} color="#68ECCB" /><Text style={styles.roleText}>{roleNames[staff.role]}</Text></View></View>
    </View>
    <View style={styles.body}>
      <View style={styles.sidebar}>
        <Text style={styles.menuLabel}>CAFETERIA</Text>
        <Nav section={section} id="overview" label="Overview" icon="grid-outline" onPress={setSection} />
        <Nav section={section} id="menu" label="Menu & availability" icon="restaurant-outline" onPress={setSection} />
        <Nav section={section} id="orders" label="Order board" icon="receipt-outline" badge={orders.filter((order) => !['delivered', 'cancelled'].includes(order.status)).length} onPress={setSection} />
        <Nav section={section} id="dispatch" label="Walking dispatch" icon="walk-outline" badge={orders.filter((order) => order.delivery_type !== 'pickup' && ['accepted', 'preparing', 'ready'].includes(order.status) && !order.rider_id).length} onPress={setSection} />
        <Nav section={section} id="report" label="Daily report" icon="bar-chart-outline" onPress={setSection} />
        <Nav section={section} id="settings" label="Settings" icon="settings-outline" onPress={setSection} />
        <View style={styles.sidebarInfo}><Ionicons name="information-circle-outline" size={20} color="#176E73" /><Text style={styles.sidebarInfoText}>AOM manages cafeteria settlement and packaging. This workspace has no vendor payout section.</Text></View>
        <TouchableOpacity style={styles.logout} onPress={() => void signOut()}><Ionicons name="log-out-outline" size={19} color="#B44646" /><Text style={styles.logoutText}>Log out</Text></TouchableOpacity>
      </View>
      <ScrollView style={styles.workspace} contentContainerStyle={styles.workspaceContent} showsVerticalScrollIndicator>
        {feedback ? <Feedback text={feedback} onClose={() => setFeedback('')} /> : null}
        {section === 'overview' ? <Overview products={products} orders={orders} settings={settings} setSection={setSection} /> : null}
        {section === 'menu' ? <Menu products={products} canManage={isManager} onEdit={(product) => { setWorkingId(product?.id ?? 'new'); setEditorOpen(true); }} onChanged={(message) => { setFeedback(message); void load(); }} /> : null}
        {section === 'orders' ? <OrderBoard orders={orders} role={staff.role} workingId={workingId} onUpdate={async (order, status) => {
          setWorkingId(order.id);
          const { error } = await supabase.rpc('update_cafeteria_order_status', { p_order_id: order.id, p_status: status });
          setWorkingId('');
          if (error) Alert.alert('Order not updated', friendlyError(error, 'Refresh the order board and try the next available action.'));
          else {
            const event = status === 'ready' && order.delivery_type === 'pickup' ? 'ready_for_pickup' : status === 'out_for_delivery' ? 'on_its_way' : status === 'delivered' ? 'delivered' : null;
            if (event) void supabase.functions.invoke('order-status-email', { body: { order_id: order.id, event } });
            setFeedback(`Order #${order.order_number} is now ${status.replaceAll('_', ' ')}. The customer was notified.`); await loadOrders();
          }
        }} /> : null}
        {section === 'dispatch' ? <WalkingDispatch orders={orders} role={staff.role} onChanged={async (message) => { setFeedback(message); await loadOrders(); }} /> : null}
        {section === 'report' ? <Report orders={orders} products={products} /> : null}
        {section === 'settings' ? <AvailabilitySettings value={settings} canManage={isManager} onSaved={(next) => { setSettings(next); setFeedback('Cafeteria availability and customer notice have been saved.'); }} /> : null}
      </ScrollView>
    </View>
    <ProductEditor visible={editorOpen} productId={workingId === 'new' ? null : workingId} products={products} onClose={() => setEditorOpen(false)} onSaved={() => { setEditorOpen(false); setFeedback(workingId === 'new' ? 'Cafeteria item added.' : 'Cafeteria item updated.'); void load(); }} />
  </View>;
}

function Overview({ products, orders, settings, setSection }: { products: Product[]; orders: CafeteriaOrder[]; settings: Settings; setSection: (section: Section) => void }) {
  const active = orders.filter((order) => !['delivered', 'cancelled'].includes(order.status));
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const todayOrders = orders.filter((order) => new Date(order.created_at).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }) === today);
  return <>
    <PageHead title="Cafeteria overview" subtitle="A live view of menu readiness, incoming orders, and today’s activity." />
    <View style={styles.metricGrid}>
      <Metric icon="receipt-outline" label="Active orders" value={String(active.length)} tone="navy" />
      <Metric icon="checkmark-circle-outline" label="Available items" value={String(products.filter((item) => item.status === 'available').length)} tone="green" />
      <Metric icon="cash-outline" label="Today's order value" value={money(todayOrders.reduce((sum, order) => sum + Number(order.total ?? 0), 0))} tone="gold" />
      <Metric icon="people-outline" label="Orders today" value={String(todayOrders.length)} tone="blue" />
    </View>
    <View style={styles.twoColumn}>
      <View style={styles.panel}><PanelHead title="Latest cafeteria orders" action="Open order board" onPress={() => setSection('orders')} />{active.slice(0, 5).map((order) => <View key={order.id} style={styles.previewRow}><View><Text style={styles.rowTitle}>#{order.order_number} · {order.customer_name}</Text><Text style={styles.customerContact}>{order.customer_phone || 'Phone number not provided'}</Text><Text style={styles.muted}>{order.items.map((item) => `${item.quantity}× ${item.product_name}`).join(', ')}</Text></View><StatusPill status={order.status} /></View>)}{!active.length ? <Empty icon="receipt-outline" title="No active orders" copy="New paid cafeteria orders will appear here immediately." /> : null}</View>
      <View style={styles.panel}><Text style={styles.panelTitle}>Service availability</Text><View style={[styles.noticeBox, !settings.is_accepting_orders && styles.warningBox]}><Ionicons name={settings.is_accepting_orders ? 'checkmark-circle-outline' : 'pause-circle-outline'} size={24} color={settings.is_accepting_orders ? '#176E73' : '#8A5A00'} /><View style={{ flex: 1 }}><Text style={styles.noticeTitle}>{settings.is_accepting_orders ? 'Orders are open' : 'Orders are paused'}</Text><Text style={styles.noticeCopy}>{settings.customer_notice || 'No customer notice has been added.'}</Text></View></View>{periods.map((period) => <View key={period} style={styles.periodRow}><Text style={styles.periodName}>{period}</Text><Text style={[styles.periodState, settings[`${period}_open` as keyof Settings] ? styles.openText : styles.closedText]}>{settings[`${period}_open` as keyof Settings] ? 'Open' : 'Closed'}</Text></View>)}<TouchableOpacity style={styles.secondaryButton} onPress={() => setSection('settings')}><Text style={styles.secondaryButtonText}>Manage availability</Text></TouchableOpacity></View>
    </View>
  </>;
}

function Menu({ products, canManage, onEdit, onChanged }: { products: Product[]; canManage: boolean; onEdit: (product?: Product) => void; onChanged: (message: string) => void }) {
  const [tab, setTab] = useState<'all' | Category>('all');
  const visible = useMemo(() => products.filter((product) => tab === 'all' || categoriesFor(product).includes(tab)).sort((a, b) => Number(a.sort_order ?? 99999) - Number(b.sort_order ?? 99999)), [products, tab]);
  const update = async (id: string, payload: Partial<Product>, message: string) => {
    const { error } = await supabase.from('cafeteria_products').update(payload).eq('id', id);
    if (error) Alert.alert('Item not updated', friendlyError(error, 'Check your cafeteria access and try again.')); else onChanged(message);
  };
  const move = async (item: Product, direction: -1 | 1) => {
    const index = visible.findIndex((product) => product.id === item.id);
    const neighbour = visible[index + direction];
    if (!neighbour) return;
    const first = item.sort_order ?? index + 1;
    const second = neighbour.sort_order ?? index + direction + 1;
    const [{ error: a }, { error: b }] = await Promise.all([
      supabase.from('cafeteria_products').update({ sort_order: second }).eq('id', item.id),
      supabase.from('cafeteria_products').update({ sort_order: first }).eq('id', neighbour.id),
    ]);
    if (a || b) Alert.alert('Placement not changed', friendlyError(a ?? b, 'Refresh and try moving the item again.')); else onChanged(`${item.name} placement updated.`);
  };
  const remove = (item: Product) => confirmAction({ title: `Delete ${item.name}?`, message: 'This permanently removes the item and its choices. Hide it instead if it may return later.', confirmLabel: 'Delete item', destructive: true, onConfirm: async () => {
    const { error } = await supabase.from('cafeteria_products').delete().eq('id', item.id);
    if (error) Alert.alert('Item not deleted', friendlyError(error, 'Hide the item if it is already attached to an order.')); else onChanged(`${item.name} was deleted.`);
  }});
  return <>
    <PageHead title="Menu & availability" subtitle="Manage items, stock, service periods, customer choices, and buyer-facing placement." action={canManage ? 'Add item' : undefined} onAction={() => onEdit()} />
    <View style={styles.summaryRow}><MiniMetric label="Available" value={products.filter((item) => item.status === 'available').length} /><MiniMetric label="Sold out" value={products.filter((item) => item.status === 'sold_out').length} /><MiniMetric label="Hidden" value={products.filter((item) => item.status === 'hidden').length} /></View>
    <View style={styles.tabs}>{(['all', ...periods] as const).map((value) => <TouchableOpacity key={value} onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.tabActive]}><Text style={[styles.tabText, tab === value && styles.tabTextActive]}>{value === 'all' ? 'All items' : value[0].toUpperCase() + value.slice(1)}</Text></TouchableOpacity>)}</View>
    <View style={styles.table}><View style={styles.tableHead}><Text style={[styles.column, { flex: 2.2 }]}>ITEM</Text><Text style={styles.column}>PERIOD</Text><Text style={styles.column}>PRICE</Text><Text style={styles.column}>STOCK</Text><Text style={styles.column}>STATUS</Text>{canManage ? <Text style={[styles.column, { flex: 1.6 }]}>ACTIONS</Text> : null}</View>{visible.map((item) => <View key={item.id} style={styles.tableRow}><View style={[styles.productCell, { flex: 2.2 }]}>{item.image_url ? <Image source={{ uri: item.image_url }} style={styles.productImage} /> : <View style={styles.productFallback}><Ionicons name="restaurant-outline" size={20} color="#68ECCB" /></View>}<View style={{ flex: 1 }}><Text style={styles.rowTitle}>{item.name}</Text><Text style={styles.muted}>{item.meal_plan_eligible ? 'Meal-plan eligible' : 'Cash/card item'}</Text></View></View><Text style={styles.tableText}>{categoriesFor(item).join(' + ')}</Text><Text style={styles.amount}>{money(item.price)}</Text><TextInput editable={canManage} defaultValue={item.stock_quantity == null ? '' : String(item.stock_quantity)} placeholder="Unlimited" placeholderTextColor="#98A2AE" keyboardType="numeric" onEndEditing={(event) => { const raw = event.nativeEvent.text.trim(); void update(item.id, { stock_quantity: raw ? Math.max(0, Number(raw) || 0) : null }, `${item.name} stock saved.`); }} style={styles.stockInput} /><View style={{ flex: 1 }}><StatusPill status={item.status} /></View>{canManage ? <View style={[styles.rowActions, { flex: 1.6 }]}><TouchableOpacity style={styles.iconButton} onPress={() => void move(item, -1)}><Ionicons name="arrow-up" size={17} color="#176E73" /></TouchableOpacity><TouchableOpacity style={styles.iconButton} onPress={() => void move(item, 1)}><Ionicons name="arrow-down" size={17} color="#176E73" /></TouchableOpacity><TouchableOpacity style={styles.iconButton} onPress={() => onEdit(item)}><Ionicons name="pencil-outline" size={17} color="#176E73" /></TouchableOpacity><TouchableOpacity style={styles.iconButton} onPress={() => void update(item.id, { status: item.status === 'available' ? 'sold_out' : 'available' }, `${item.name} is now ${item.status === 'available' ? 'sold out' : 'available'}.`)}><Ionicons name={item.status === 'available' ? 'close-outline' : 'checkmark-outline'} size={18} color="#176E73" /></TouchableOpacity><TouchableOpacity style={styles.iconButton} onPress={() => void update(item.id, { status: item.status === 'hidden' ? 'available' : 'hidden' }, `${item.name} visibility updated.`)}><Ionicons name={item.status === 'hidden' ? 'eye-outline' : 'eye-off-outline'} size={17} color="#176E73" /></TouchableOpacity><TouchableOpacity style={[styles.iconButton, styles.deleteButton]} onPress={() => remove(item)}><Ionicons name="trash-outline" size={17} color="#B44646" /></TouchableOpacity></View> : null}</View>)}{!visible.length ? <Empty icon="restaurant-outline" title="No items here yet" copy="Add the first product for this service period." /> : null}</View>
  </>;
}

function OrderBoard({ orders, role, workingId, onUpdate }: { orders: CafeteriaOrder[]; role: Role; workingId: string; onUpdate: (order: CafeteriaOrder, status: string) => Promise<void> }) {
  const [filter, setFilter] = useState<'active' | 'complete' | 'all'>('active');
  const visible = orders.filter((order) => filter === 'all' || (filter === 'complete' ? ['delivered', 'cancelled'].includes(order.status) : !['delivered', 'cancelled'].includes(order.status)));
  return <>
    <PageHead title="Cafeteria order board" subtitle="Paid cafeteria requests appear here in real time. Each role only sees actions they are permitted to complete." />
    <View style={styles.tabs}>{(['active', 'complete', 'all'] as const).map((value) => <TouchableOpacity key={value} onPress={() => setFilter(value)} style={[styles.tab, filter === value && styles.tabActive]}><Text style={[styles.tabText, filter === value && styles.tabTextActive]}>{value[0].toUpperCase() + value.slice(1)}</Text></TouchableOpacity>)}</View>
    <View style={styles.orderGrid}>
      {visible.map((order) => (
        <View key={order.id} style={styles.orderCard}>
          <View style={styles.orderTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.orderNumber}>Order #{order.order_number}</Text>
              <Text style={styles.customerName}>{order.customer_name}</Text>
              <Text style={styles.customerContact}>{order.customer_phone || 'Phone number not provided'}</Text>
              <Text style={styles.muted}>{dateTime(order.created_at)}</Text>
            </View>
            <StatusPill status={order.status} />
          </View>
          <View style={styles.orderMetaRow}>
            <Ionicons name={order.delivery_type === 'pickup' ? 'storefront-outline' : 'location-outline'} size={18} color="#176E73" />
            <Text style={styles.orderMeta}>{order.delivery_type === 'pickup' ? 'Customer pickup' : order.delivery_address || 'Delivery location pending'}{order.delivery_slot ? ` · ${order.delivery_slot}` : ''}</Text>
          </View>
          {order.items.map((item) => (
            <View key={item.id} style={styles.lineItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineTitle}>{item.quantity}× {item.product_name}</Text>
                {optionText(item.options) ? <Text style={styles.muted}>{optionText(item.options)}</Text> : null}
                {item.notes ? <Text style={styles.itemNote}>Note: {item.notes}</Text> : null}
              </View>
              <Text style={styles.amount}>{money(item.unit_price * item.quantity)}</Text>
            </View>
          ))}
          <View style={styles.orderFoot}>
            <Text style={styles.orderTotal}>{money(order.total)}</Text>
            <OrderActions order={order} role={role} busy={workingId === order.id} onUpdate={onUpdate} />
          </View>
        </View>
      ))}
    </View>
    {!visible.length ? <View style={styles.panel}><Empty icon="receipt-outline" title="No orders in this view" copy="New paid cafeteria orders update this board automatically." /></View> : null}
  </>;
}

function OrderActions({ order, role, busy, onUpdate }: { order: CafeteriaOrder; role: Role; busy: boolean; onUpdate: (order: CafeteriaOrder, status: string) => Promise<void> }) {
  const status = order.status;
  const permitted = (next: string) => role === 'manager' || (role === 'kitchen' && ['accepted', 'preparing', 'ready'].includes(next)) || (role === 'cashier' && ['accepted', 'cancelled'].includes(next)) || (role === 'server' && ['ready', 'out_for_delivery', 'delivered'].includes(next));
  let next: { status: string; label: string } | null = null;
  if (['pending', 'awaiting_confirmation', 'paid'].includes(status)) next = { status: 'accepted', label: 'Accept order' };
  else if (status === 'accepted') next = { status: 'preparing', label: 'Start preparing' };
  else if (status === 'preparing') next = { status: 'ready', label: 'Mark ready' };
  else if (status === 'ready') next = order.delivery_type === 'pickup' ? { status: 'delivered', label: 'Collected' } : order.rider_id ? { status: 'out_for_delivery', label: 'Dispatched' } : null;
  else if (status === 'out_for_delivery') next = { status: 'delivered', label: 'Delivered' };
  return <View style={styles.orderActions}>{next && permitted(next.status) ? <TouchableOpacity disabled={busy} style={styles.primarySmall} onPress={() => void onUpdate(order, next!.status)}>{busy ? <ActivityIndicator size="small" color="#01193D" /> : <Text style={styles.primarySmallText}>{next.label}</Text>}</TouchableOpacity> : <Text style={styles.muted}>{['delivered', 'cancelled'].includes(status) ? 'Closed' : status === 'ready' && order.delivery_type !== 'pickup' && !order.rider_id ? 'Assign an agent in Walking dispatch' : 'Waiting for authorised staff'}</Text>}{!['delivered', 'cancelled'].includes(status) && permitted('cancelled') ? <TouchableOpacity disabled={busy} style={styles.cancelSmall} onPress={() => confirmAction({ title: `Cancel order #${order.order_number}?`, message: 'The buyer will be notified and AOM will handle any refund.', confirmLabel: 'Cancel order', destructive: true, onConfirm: () => onUpdate(order, 'cancelled') })}><Text style={styles.cancelSmallText}>Cancel</Text></TouchableOpacity> : null}</View>;
}

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function WalkingDispatch({ orders, role, onChanged }: { orders: CafeteriaOrder[]; role: Role; onChanged: (message: string) => Promise<void> }) {
  const canDispatch = role === 'manager' || role === 'server';
  const [recommendations, setRecommendations] = useState<Record<string, WalkingAgent[]>>({});
  const [loadingOrder, setLoadingOrder] = useState('');
  const [riders, setRiders] = useState<Rider[]>([]);
  const [schedules, setSchedules] = useState<RiderSchedule[]>([]);
  const [scheduleRider, setScheduleRider] = useState('');
  const [scheduleDay, setScheduleDay] = useState(1);
  const [scheduleStart, setScheduleStart] = useState('09:00');
  const [scheduleEnd, setScheduleEnd] = useState('12:00');
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [agentFormOpen, setAgentFormOpen] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [agentCoverage, setAgentCoverage] = useState('All AUN campus locations');
  const [agentCapacity, setAgentCapacity] = useState('4');
  const [agentNote, setAgentNote] = useState('');
  const [agentCalls, setAgentCalls] = useState(true);
  const [agentWhatsapp, setAgentWhatsapp] = useState(true);
  const [savingAgent, setSavingAgent] = useState(false);
  const deliveryOrders = orders.filter((order) => order.delivery_type !== 'pickup' && !['delivered', 'cancelled'].includes(order.status));

  const loadDirectory = useCallback(async () => {
    if (!canDispatch) return;
    const [{ data: riderRows, error: riderError }, { data: scheduleRows, error: scheduleError }] = await Promise.all([
      supabase.from('delivery_riders').select('id, full_name, phone, accepts_calls, accepts_whatsapp, coverage_area, availability, walking_status, campus_zones, max_orders_per_run, cafeteria_note').eq('is_cafeteria_agent', true).eq('availability', 'active').order('full_name'),
      supabase.from('delivery_rider_schedules').select('id, rider_id, day_of_week, starts_at, ends_at, is_active').eq('is_active', true).order('day_of_week').order('starts_at'),
    ]);
    if (riderError || scheduleError) {
      Alert.alert('Agent schedules unavailable', friendlyError(riderError ?? scheduleError, 'Apply the walking-dispatch database update, then refresh this page.'));
      return;
    }
    const nextRiders = (riderRows ?? []) as Rider[];
    setRiders(nextRiders);
    setSchedules((scheduleRows ?? []) as RiderSchedule[]);
    setScheduleRider((current) => current || nextRiders[0]?.id || '');
  }, [canDispatch]);

  useEffect(() => { void loadDirectory(); }, [loadDirectory]);

  const resetAgentForm = () => {
    setAgentName(''); setAgentPhone(''); setAgentCoverage('All AUN campus locations');
    setAgentCapacity('4'); setAgentNote(''); setAgentCalls(true); setAgentWhatsapp(true);
  };

  const registerAgent = async () => {
    const capacity = Number(agentCapacity);
    if (agentName.trim().length < 2 || agentPhone.trim().length < 7 || !Number.isInteger(capacity) || capacity < 1 || capacity > 12) {
      Alert.alert('Check the agent details', 'Enter the agent’s full name, a valid phone number, and a run capacity between 1 and 12 orders.');
      return;
    }
    setSavingAgent(true);
    const { data: auth } = await supabase.auth.getUser();
    const savedName = agentName.trim();
    const { error } = await supabase.from('delivery_riders').insert({
      full_name: savedName, phone: agentPhone.trim(), accepts_calls: agentCalls,
      accepts_whatsapp: agentWhatsapp, coverage_area: agentCoverage.trim() || null,
      availability: 'active', walking_status: 'available', campus_zones: [],
      max_orders_per_run: capacity, note: agentNote.trim() || null,
      cafeteria_note: agentNote.trim() || null, is_cafeteria_agent: true,
      hired_by: auth.user?.id ?? null, hired_at: new Date().toISOString(),
    });
    setSavingAgent(false);
    if (error) {
      Alert.alert('Agent not registered', friendlyError(error, error.code === '23505' ? 'That phone number is already registered. Review the roster or use another number.' : 'Check the details and your manager access, then try again.'));
      return;
    }
    resetAgentForm(); setAgentFormOpen(false);
    await loadDirectory();
    await onChanged(`${savedName} was added to the cafeteria delivery roster.`);
  };

  const updateAgent = async (rider: Rider, payload: Record<string, unknown>, message: string) => {
    const { error } = await supabase.from('delivery_riders').update(payload).eq('id', rider.id).eq('is_cafeteria_agent', true);
    if (error) Alert.alert('Agent not updated', friendlyError(error, 'Only a cafeteria manager can change the hired-agent roster.'));
    else { await loadDirectory(); await onChanged(message); }
  };

  const findAgents = async (order: CafeteriaOrder) => {
    setLoadingOrder(order.id);
    const { data, error } = await supabase.rpc('recommend_cafeteria_walking_agents', { p_order_id: order.id, p_pickup_at: new Date().toISOString() });
    setLoadingOrder('');
    if (error) { Alert.alert('Recommendations unavailable', friendlyError(error, 'Check the order and agent schedules, then try again.')); return; }
    setRecommendations((current) => ({ ...current, [order.id]: (data ?? []) as WalkingAgent[] }));
  };

  const assign = async (order: CafeteriaOrder, agent: WalkingAgent) => {
    setLoadingOrder(order.id);
    const { error } = await supabase.rpc('assign_cafeteria_walking_agent', { p_order_id: order.id, p_rider_id: agent.rider_id, p_pickup_at: new Date().toISOString() });
    setLoadingOrder('');
    if (error) { Alert.alert('Agent not assigned', friendlyError(error, 'Refresh the recommendations and choose another available agent.')); return; }
    setRecommendations((current) => ({ ...current, [order.id]: [] }));
    await onChanged(`${agent.full_name} was assigned to order #${order.order_number}. The customer was notified.`);
  };

  const updateDelivery = async (order: CafeteriaOrder, status: 'out_for_delivery' | 'delivered') => {
    setLoadingOrder(order.id);
    const { error } = await supabase.rpc('update_cafeteria_order_status', { p_order_id: order.id, p_status: status });
    setLoadingOrder('');
    if (error) { Alert.alert('Delivery not updated', friendlyError(error, 'Refresh and try the delivery update again.')); return; }
    void supabase.functions.invoke('order-status-email', { body: { order_id: order.id, event: status === 'out_for_delivery' ? 'on_its_way' : 'delivered' } });
    await onChanged(status === 'out_for_delivery' ? `Order #${order.order_number} was collected. The customer was notified.` : `Order #${order.order_number} was marked delivered.`);
    await loadDirectory();
  };

  const addSchedule = async () => {
    if (!scheduleRider || !/^\d{2}:\d{2}$/.test(scheduleStart) || !/^\d{2}:\d{2}$/.test(scheduleEnd) || scheduleStart >= scheduleEnd) {
      Alert.alert('Check the free period', 'Choose an agent and enter a valid start and end time, such as 09:00 to 12:00.');
      return;
    }
    setSavingSchedule(true);
    const { error } = await supabase.from('delivery_rider_schedules').insert({ rider_id: scheduleRider, day_of_week: scheduleDay, starts_at: scheduleStart, ends_at: scheduleEnd, is_active: true });
    setSavingSchedule(false);
    if (error) { Alert.alert('Schedule not saved', friendlyError(error, 'This shift may already exist. Review the day and times.')); return; }
    await loadDirectory();
  };

  const removeSchedule = async (schedule: RiderSchedule) => {
    const { error } = await supabase.from('delivery_rider_schedules').delete().eq('id', schedule.id);
    if (error) Alert.alert('Schedule not removed', friendlyError(error, 'Only a cafeteria manager can change schedules.'));
    else await loadDirectory();
  };

  return <>
    <PageHead title="Walking dispatch" subtitle="Register hired delivery agents, manage their schedules, and match them with paid cafeteria deliveries." />
    {!canDispatch ? <View style={styles.readOnly}><Ionicons name="lock-closed-outline" size={20} color="#805E15" /><Text style={styles.readOnlyText}>Only cafeteria managers and serving staff can assign delivery agents.</Text></View> : null}
    <View style={styles.safety}><Ionicons name="walk-outline" size={22} color="#176E73" /><Text style={[styles.safetyText, { color: '#176E73' }]}>Only agents manually registered by the cafeteria manager appear here. Recommendations favour the lightest workload and matching campus coverage.</Text></View>
    {role === 'manager' ? <AgentRosterPanel riders={riders} formOpen={agentFormOpen} setFormOpen={setAgentFormOpen} name={agentName} setName={setAgentName} phone={agentPhone} setPhone={setAgentPhone} coverage={agentCoverage} setCoverage={setAgentCoverage} capacity={agentCapacity} setCapacity={setAgentCapacity} note={agentNote} setNote={setAgentNote} calls={agentCalls} setCalls={setAgentCalls} whatsapp={agentWhatsapp} setWhatsapp={setAgentWhatsapp} saving={savingAgent} onSave={registerAgent} onUpdate={updateAgent} /> : null}
    <Text style={styles.panelTitle}>Delivery queue</Text>
    <View style={styles.dispatchGrid}>{deliveryOrders.map((order) => {
      const suggested = recommendations[order.id] ?? [];
      return (
        <View key={order.id} style={styles.walkCard}>
          <View style={styles.orderTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.orderNumber}>Order #{order.order_number}</Text>
              <Text style={styles.customerName}>{order.customer_name}</Text>
              <Text style={styles.customerContact}>{order.customer_phone || 'Phone number not provided'}</Text>
              <Text style={styles.muted}>{order.delivery_address || 'Campus destination pending'}{order.delivery_slot ? ` · ${order.delivery_slot}` : ''}</Text>
            </View>
            <StatusPill status={order.dispatch_status ?? order.status} />
          </View>
          <Text style={styles.walkItems}>{order.items.map((item) => `${item.quantity}× ${item.product_name}`).join(', ')}</Text>
          {order.rider_id ? (
            <View style={styles.assignedAgent}>
              <View style={styles.walkIcon}><Ionicons name="walk" size={21} color="#176E73" /></View>
              <View style={{ flex: 1 }}><Text style={styles.riderName}>{order.rider_name}</Text><Text style={styles.muted}>Cafeteria delivery agent · {order.rider_phone}</Text></View>
              {order.rider_phone ? <TouchableOpacity onPress={() => void Linking.openURL(`tel:${order.rider_phone}`)} style={styles.iconButton}><Ionicons name="call-outline" size={17} color="#176E73" /></TouchableOpacity> : null}
              {order.status === 'ready' ? <TouchableOpacity disabled={loadingOrder === order.id} onPress={() => void updateDelivery(order, 'out_for_delivery')} style={styles.primarySmall}><Text style={styles.primarySmallText}>Collected</Text></TouchableOpacity> : null}
              {order.status === 'out_for_delivery' ? <TouchableOpacity disabled={loadingOrder === order.id} onPress={() => void updateDelivery(order, 'delivered')} style={styles.primarySmall}><Text style={styles.primarySmallText}>Delivered</Text></TouchableOpacity> : null}
            </View>
          ) : (
            <>
              {canDispatch && ['accepted', 'preparing', 'ready'].includes(order.status) ? <TouchableOpacity disabled={loadingOrder === order.id} onPress={() => void findAgents(order)} style={styles.secondaryButton}>{loadingOrder === order.id ? <ActivityIndicator color="#176E73" /> : <Text style={styles.secondaryButtonText}>{suggested.length ? 'Refresh recommendations' : 'Recommend free agents'}</Text>}</TouchableOpacity> : <Text style={styles.muted}>Accept this order before assigning an agent.</Text>}
              {suggested.length ? <View style={styles.recommendations}>{suggested.map((agent, index) => <View key={agent.rider_id} style={[styles.agentSuggestion, index === 0 && styles.bestSuggestion]}><View style={styles.suggestionRank}><Text style={styles.suggestionRankText}>{index + 1}</Text></View><View style={{ flex: 1 }}><Text style={styles.riderName}>{agent.full_name}</Text><Text style={styles.muted}>{agent.active_orders} active · {agent.runs_today} runs today · capacity {agent.max_orders_per_run}{agent.current_zone ? ` · near ${agent.current_zone}` : ''}</Text>{!agent.schedule_added ? <Text style={styles.scheduleWarning}>No weekly schedule yet—confirm by phone.</Text> : null}</View><TouchableOpacity disabled={loadingOrder === order.id} onPress={() => void assign(order, agent)} style={styles.primarySmall}><Text style={styles.primarySmallText}>Assign</Text></TouchableOpacity></View>)}</View> : recommendations[order.id] ? <Text style={styles.scheduleWarning}>No hired agent is free for this time. Check schedules or contact an agent manually.</Text> : null}
            </>
          )}
        </View>
      );
    })}</View>
    {!deliveryOrders.length ? <View style={styles.panel}><Empty icon="walk-outline" title="No cafeteria deliveries waiting" copy="Accepted campus delivery orders will appear here for assignment." /></View> : null}
    <View style={styles.schedulePanel}>
      <View><Text style={styles.panelTitle}>Agent availability schedules</Text><Text style={styles.subtitle}>Times use West Africa Time. A schedule can contain several available periods per day.</Text></View>
      {role === 'manager' ? <>
        <Text style={styles.fieldLabel}>Choose agent</Text>
        <View style={styles.riderChoices}>{riders.map((rider) => <TouchableOpacity key={rider.id} onPress={() => setScheduleRider(rider.id)} style={[styles.riderChoice, scheduleRider === rider.id && styles.riderChoiceActive]}><Ionicons name="person-outline" size={16} color="#176E73" /><Text style={styles.riderChoiceText}>{rider.full_name}</Text></TouchableOpacity>)}</View>
        <Text style={styles.fieldLabel}>Day</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayChoices}>{dayNames.map((day, index) => <TouchableOpacity key={day} onPress={() => setScheduleDay(index)} style={[styles.dayChoice, scheduleDay === index && styles.dayChoiceActive]}><Text style={[styles.dayChoiceText, scheduleDay === index && styles.dayChoiceTextActive]}>{day.slice(0, 3)}</Text></TouchableOpacity>)}</ScrollView>
        <View style={styles.scheduleForm}><Field label="Available from" value={scheduleStart} onChangeText={setScheduleStart} placeholder="09:00" half /><Field label="Available until" value={scheduleEnd} onChangeText={setScheduleEnd} placeholder="12:00" half /><TouchableOpacity disabled={savingSchedule} onPress={() => void addSchedule()} style={styles.saveSettings}>{savingSchedule ? <ActivityIndicator color="#01193D" /> : <><Ionicons name="add" size={18} color="#01193D" /><Text style={styles.saveSettingsText}>Add period</Text></>}</TouchableOpacity></View>
      </> : null}
      <View style={styles.scheduleList}>{riders.map((rider) => { const shifts = schedules.filter((schedule) => schedule.rider_id === rider.id); return <View key={rider.id} style={styles.scheduleRider}><View style={styles.scheduleRiderHead}><View><Text style={styles.riderName}>{rider.full_name}</Text><Text style={styles.muted}>{rider.walking_status.replaceAll('_', ' ')} · maximum {rider.max_orders_per_run} orders</Text></View><Text style={styles.shiftCount}>{shifts.length} period{shifts.length === 1 ? '' : 's'}</Text></View><View style={styles.shiftWrap}>{shifts.map((shift) => <View key={shift.id} style={styles.shiftPill}><Text style={styles.shiftText}>{dayNames[shift.day_of_week].slice(0, 3)} {shift.starts_at.slice(0, 5)}–{shift.ends_at.slice(0, 5)}</Text>{role === 'manager' ? <TouchableOpacity onPress={() => void removeSchedule(shift)}><Ionicons name="close" size={15} color="#8D4A4A" /></TouchableOpacity> : null}</View>)}</View>{!shifts.length ? <Text style={styles.scheduleWarning}>No schedule entered. The agent can still be shown with a confirmation warning.</Text> : null}</View>; })}</View>
    </View>
  </>;
}

function AgentRosterPanel({ riders, formOpen, setFormOpen, name, setName, phone, setPhone, coverage, setCoverage, capacity, setCapacity, note, setNote, calls, setCalls, whatsapp, setWhatsapp, saving, onSave, onUpdate }: {
  riders: Rider[]; formOpen: boolean; setFormOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  name: string; setName: (value: string) => void; phone: string; setPhone: (value: string) => void;
  coverage: string; setCoverage: (value: string) => void; capacity: string; setCapacity: (value: string) => void;
  note: string; setNote: (value: string) => void; calls: boolean; setCalls: (value: boolean | ((current: boolean) => boolean)) => void;
  whatsapp: boolean; setWhatsapp: (value: boolean | ((current: boolean) => boolean)) => void; saving: boolean;
  onSave: () => Promise<void>; onUpdate: (rider: Rider, payload: Record<string, unknown>, message: string) => Promise<void>;
}) {
  return <View style={styles.schedulePanel}>
    <View style={styles.panelHead}><View><Text style={styles.panelTitle}>Hired delivery agents</Text><Text style={styles.subtitle}>Build and maintain the cafeteria’s own roster as agents are hired.</Text></View><TouchableOpacity style={styles.primarySmall} onPress={() => setFormOpen((current) => !current)}><Ionicons name={formOpen ? 'close' : 'person-add-outline'} size={17} color="#01193D" /><Text style={styles.primarySmallText}>{formOpen ? 'Close' : 'Register agent'}</Text></TouchableOpacity></View>
    {formOpen ? <View style={styles.agentForm}><View style={styles.fieldPair}><Field label="Full name" value={name} onChangeText={setName} placeholder="e.g. Amina Bello" half /><Field label="Phone number" value={phone} onChangeText={setPhone} placeholder="080…" keyboardType="phone-pad" half /></View><View style={styles.fieldPair}><Field label="Coverage" value={coverage} onChangeText={setCoverage} placeholder="e.g. All AUN dorms" half /><Field label="Maximum orders per run" value={capacity} onChangeText={setCapacity} placeholder="4" keyboardType="numeric" half /></View><Field label="Manager note (optional)" value={note} onChangeText={setNote} placeholder="Availability, emergency contact, or other private note" /><View style={styles.contactChoices}><TouchableOpacity onPress={() => setCalls((current) => !current)} style={[styles.choicePill, calls && styles.choicePillActive]}><Ionicons name={calls ? 'checkmark-circle' : 'ellipse-outline'} size={16} color="#176E73" /><Text style={styles.choicePillText}>Accepts calls</Text></TouchableOpacity><TouchableOpacity onPress={() => setWhatsapp((current) => !current)} style={[styles.choicePill, whatsapp && styles.choicePillActive]}><Ionicons name={whatsapp ? 'checkmark-circle' : 'ellipse-outline'} size={16} color="#176E73" /><Text style={styles.choicePillText}>Accepts WhatsApp</Text></TouchableOpacity></View><TouchableOpacity disabled={saving} onPress={() => void onSave()} style={styles.saveSettings}>{saving ? <ActivityIndicator color="#01193D" /> : <><Ionicons name="save-outline" size={18} color="#01193D" /><Text style={styles.saveSettingsText}>Save agent</Text></>}</TouchableOpacity></View> : null}
    <View style={styles.agentRoster}>{riders.map((rider) => <View key={rider.id} style={styles.rosterRow}><View style={styles.walkIcon}><Ionicons name="person-outline" size={20} color="#176E73" /></View><View style={{ flex: 1 }}><Text style={styles.riderName}>{rider.full_name}</Text><Text style={styles.muted}>{rider.phone}{rider.coverage_area ? ` · ${rider.coverage_area}` : ''} · capacity {rider.max_orders_per_run}</Text></View><View style={styles.rosterActions}><TouchableOpacity onPress={() => void onUpdate(rider, { walking_status: rider.walking_status === 'available' ? 'off_duty' : 'available' }, `${rider.full_name} is now ${rider.walking_status === 'available' ? 'off duty' : 'available'}.`)} style={[styles.agentState, rider.walking_status === 'available' && styles.agentStateActive]}><Text style={[styles.agentStateText, rider.walking_status === 'available' && styles.agentStateTextActive]}>{rider.walking_status.replaceAll('_', ' ')}</Text></TouchableOpacity><TouchableOpacity onPress={() => confirmAction({ title: `Remove ${rider.full_name} from the active roster?`, message: 'Their past deliveries will remain in order history.', confirmLabel: 'Deactivate agent', destructive: true, onConfirm: () => onUpdate(rider, { availability: 'unavailable', walking_status: 'off_duty' }, `${rider.full_name} was removed from the active roster.`) })} style={[styles.iconButton, styles.deleteButton]}><Ionicons name="person-remove-outline" size={17} color="#B44646" /></TouchableOpacity></View></View>)}{!riders.length ? <Empty icon="people-outline" title="No agents registered" copy="Use Register agent when the cafeteria hires its first delivery agent." /> : null}</View>
  </View>;
}

function Report({ orders, products }: { orders: CafeteriaOrder[]; products: Product[] }) {
  const [range, setRange] = useState<1 | 7 | 30>(1);
  const start = Date.now() - range * 24 * 60 * 60 * 1000;
  const rows = orders.filter((order) => new Date(order.created_at).getTime() >= start && order.status !== 'cancelled');
  const productTotals = new Map<string, number>();
  rows.flatMap((order) => order.items).forEach((item) => productTotals.set(item.product_name, (productTotals.get(item.product_name) ?? 0) + item.quantity));
  const top = [...productTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const mealCredit = rows.flatMap((order) => order.items).reduce((sum, item) => sum + Number(item.meal_plan_credit ?? 0), 0);
  const packaging = rows.flatMap((order) => order.items).reduce((sum, item) => sum + Number(item.packaging_fee ?? 0), 0);
  return <>
    <PageHead title="Cafeteria report" subtitle="Operational totals for AOM and cafeteria management. This is not a vendor payout statement." />
    <View style={styles.rangeButtons}>{([1, 7, 30] as const).map((value) => <TouchableOpacity key={value} onPress={() => setRange(value)} style={[styles.rangeButton, range === value && styles.rangeButtonActive]}><Text style={[styles.rangeText, range === value && styles.rangeTextActive]}>{value === 1 ? 'Today' : `Last ${value} days`}</Text></TouchableOpacity>)}</View>
    <View style={styles.metricGrid}><Metric icon="cash-outline" label="Gross order value" value={money(rows.reduce((sum, order) => sum + Number(order.total ?? 0), 0))} tone="navy" /><Metric icon="receipt-outline" label="Orders" value={String(rows.length)} tone="green" /><Metric icon="card-outline" label="Meal-plan credit" value={money(mealCredit)} tone="blue" /><Metric icon="cube-outline" label="Packaging recorded" value={money(packaging)} tone="gold" /></View>
    <View style={styles.twoColumn}><View style={styles.panel}><Text style={styles.panelTitle}>Most ordered items</Text>{top.map(([name, quantity], index) => <View key={name} style={styles.rankedRow}><Text style={styles.rank}>{index + 1}</Text><Text style={[styles.rowTitle, { flex: 1 }]}>{name}</Text><Text style={styles.amount}>{quantity} sold</Text></View>)}{!top.length ? <Empty icon="bar-chart-outline" title="No sales in this period" copy="Completed cafeteria purchases will build this report." /> : null}</View><View style={styles.panel}><Text style={styles.panelTitle}>Menu health</Text><InfoRow label="Catalogue items" value={String(products.length)} /><InfoRow label="Available" value={String(products.filter((item) => item.status === 'available').length)} /><InfoRow label="Sold out" value={String(products.filter((item) => item.status === 'sold_out').length)} /><InfoRow label="Hidden" value={String(products.filter((item) => item.status === 'hidden').length)} /><InfoRow label="Meal-plan eligible" value={String(products.filter((item) => item.meal_plan_eligible).length)} /></View></View>
  </>;
}

function AvailabilitySettings({ value, canManage, onSaved }: { value: Settings; canManage: boolean; onSaved: (value: Settings) => void }) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(value), [value]);
  const persist = async (next: Settings) => {
    setSaving(true);
    const { data, error } = await supabase.rpc('update_cafeteria_settings', {
      p_is_accepting_orders: next.is_accepting_orders,
      p_snacks_open: next.snacks_open,
      p_lunch_open: next.lunch_open,
      p_dinner_open: next.dinner_open,
      p_customer_notice: next.customer_notice?.trim() || null,
    });
    setSaving(false);
    if (error) {
      setDraft(value);
      Alert.alert('Availability not changed', friendlyError(error, 'Check that you are signed in as the cafeteria manager, then try again.'));
      return;
    }
    const saved = data as Settings;
    setDraft(saved);
    onSaved(saved);
  };
  const toggle = (key: keyof Settings) => {
    if (saving || !canManage) return;
    const next = { ...draft, [key]: !draft[key] } as Settings;
    setDraft(next);
    void persist(next);
  };
  const save = () => void persist(draft);
  return <>
    <PageHead title="Availability & customer notice" subtitle="Pause cafeteria checkout, open or close individual service periods, and publish an operational notice." />
    {!canManage ? <View style={styles.readOnly}><Ionicons name="lock-closed-outline" size={20} color="#805E15" /><Text style={styles.readOnlyText}>These settings are read-only for your role. A cafeteria manager can make changes.</Text></View> : null}
    <View style={styles.settingsPanel}><ToggleRow label="Accept cafeteria orders" copy="Saves immediately. Turn this off to pause the entire cafeteria without hiding menu items." value={draft.is_accepting_orders} disabled={!canManage || saving} onPress={() => toggle('is_accepting_orders')} />{periods.map((period) => <ToggleRow key={period} label={`${period[0].toUpperCase() + period.slice(1)} service`} copy="Saves immediately. Customers can browse and order products tagged for this period." value={Boolean(draft[`${period}_open` as keyof Settings])} disabled={!canManage || saving} onPress={() => toggle(`${period}_open` as keyof Settings)} />)}<Text style={styles.fieldLabel}>Important customer notice</Text><TextInput editable={canManage && !saving} value={draft.customer_notice ?? ''} onChangeText={(customer_notice) => setDraft((current) => ({ ...current, customer_notice }))} multiline maxLength={280} placeholder="e.g. Lunch service begins at 12:30 today." placeholderTextColor="#98A2AE" style={styles.noticeInput} />{canManage ? <TouchableOpacity disabled={saving} style={styles.saveSettings} onPress={save}>{saving ? <ActivityIndicator color="#01193D" /> : <><Ionicons name="save-outline" size={19} color="#01193D" /><Text style={styles.saveSettingsText}>Save customer notice</Text></>}</TouchableOpacity> : null}</View>
  </>;
}

function ProductEditor({ visible, productId, products, onClose, onSaved }: { visible: boolean; productId: string | null; products: Product[]; onClose: () => void; onSaved: () => void }) {
  const product = products.find((item) => item.id === productId);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [categories, setCategories] = useState<Category[]>(['lunch']);
  const [mealEligible, setMealEligible] = useState(true);
  const [imageUrl, setImageUrl] = useState('');
  const [choices, setChoices] = useState<ChoiceDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setName(product?.name ?? ''); setDescription(product?.description ?? ''); setPrice(product ? String(product.price) : ''); setStock(product?.stock_quantity == null ? '' : String(product.stock_quantity)); setCategories(product ? categoriesFor(product) : ['lunch']); setMealEligible(product?.meal_plan_eligible ?? true); setImageUrl(product?.image_url ?? ''); setChoices([]);
    if (product) void supabase.from('cafeteria_product_options').select('option_group, name, price_modifier').eq('product_id', product.id).order('created_at').then(({ data }) => setChoices((data ?? []).map((row) => ({ group: String(row.option_group), name: String(row.name), price: String(row.price_modifier ?? 0) }))));
  }, [product, visible]);
  const chooseImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Photo access needed', 'Allow photo access, or paste a public image URL.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.82 });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    try {
      const asset = result.assets[0];
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Your session expired. Sign in and retry.');
      const extension = asset.fileName?.split('.').pop() || asset.mimeType?.split('/').pop() || 'jpg';
      const path = `cafeteria/${auth.user.id}/${Date.now()}.${extension.replace(/[^a-zA-Z0-9]/g, '')}`;
      const response = await fetch(asset.uri);
      const { error } = await supabase.storage.from('product-images').upload(path, await response.arrayBuffer(), { contentType: asset.mimeType ?? 'image/jpeg' });
      if (error) throw error;
      setImageUrl(supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl);
    } catch (error) { Alert.alert('Image not uploaded', friendlyError(error instanceof Error ? error : null, 'Choose a JPG or PNG, or paste an image URL.')); } finally { setUploading(false); }
  };
  const save = async () => {
    const parsedPrice = Number(price);
    if (!name.trim() || !price.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0 || !categories.length) { Alert.alert('Complete the item', 'Add a name, a valid price (₦0 is allowed), and at least one service period.'); return; }
    if (choices.some((choice) => choice.name.trim() && !choice.group.trim())) { Alert.alert('Name every choice group', 'Examples include Protein, Side, Size, or Flavour.'); return; }
    setSaving(true);
    const payload = { name: name.trim(), description: description.trim() || null, price: parsedPrice, stock_quantity: stock.trim() ? Math.max(0, Number(stock) || 0) : null, category: categories[0], categories, meal_plan_eligible: mealEligible, image_url: imageUrl.trim() || null };
    const { data: saved, error } = productId ? await supabase.from('cafeteria_products').update(payload).eq('id', productId).select('id').single() : await supabase.from('cafeteria_products').insert({ ...payload, status: 'available', sort_order: Math.max(0, ...products.map((item) => Number(item.sort_order ?? 0))) + 1 }).select('id').single();
    if (error || !saved) { setSaving(false); Alert.alert('Item not saved', friendlyError(error, 'Review the item and try again.')); return; }
    if (productId) await supabase.from('cafeteria_product_options').delete().eq('product_id', saved.id);
    const valid = choices.filter((choice) => choice.group.trim() && choice.name.trim());
    if (valid.length) {
      const { error: choiceError } = await supabase.from('cafeteria_product_options').insert(valid.map((choice) => ({ product_id: saved.id, option_group: choice.group.trim(), name: choice.name.trim(), price_modifier: Number(choice.price) || 0, is_available: true, selection_mode: 'single' })));
      if (choiceError) { setSaving(false); Alert.alert('Item saved, choices need attention', friendlyError(choiceError, 'Open the item and save its choices again.')); return; }
    }
    setSaving(false); onSaved();
  };
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}><View style={styles.modalBackdrop}><ScrollView style={styles.modal} contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}><Text style={styles.modalTitle}>{productId ? 'Edit cafeteria item' : 'Add cafeteria item'}</Text><Field label="Item name" value={name} onChangeText={setName} placeholder="e.g. Jollof rice" /><Field label="Description (optional)" value={description} onChangeText={setDescription} placeholder="What the customer should know" multiline large /><View style={styles.fieldPair}><Field label="Price (NGN — ₦0 allowed for included add-ons)" value={price} onChangeText={setPrice} placeholder="1800" keyboardType="numeric" half /><Field label="Stock (blank = unlimited)" value={stock} onChangeText={setStock} placeholder="Unlimited" keyboardType="numeric" half /></View><Text style={styles.fieldLabel}>Product image</Text><TouchableOpacity style={styles.upload} onPress={() => void chooseImage()} disabled={uploading}>{uploading ? <ActivityIndicator color="#176E73" /> : <><Ionicons name="image-outline" size={19} color="#176E73" /><Text style={styles.uploadText}>{imageUrl ? 'Replace uploaded image' : 'Upload from device'}</Text></>}</TouchableOpacity><Field label="Or paste an image URL" value={imageUrl} onChangeText={setImageUrl} placeholder="https://..." />{imageUrl ? <Image source={{ uri: imageUrl }} style={styles.editorPreview} /> : null}<Text style={styles.fieldLabel}>Show item in</Text><View style={styles.choicePills}>{periods.map((period) => <TouchableOpacity key={period} onPress={() => setCategories((current) => current.includes(period) ? current.filter((value) => value !== period) : [...current, period])} style={[styles.choicePill, categories.includes(period) && styles.choicePillActive]}><Ionicons name={categories.includes(period) ? 'checkmark-circle' : 'ellipse-outline'} size={16} color="#176E73" /><Text style={styles.choicePillText}>{period}</Text></TouchableOpacity>)}</View><TouchableOpacity style={[styles.eligible, mealEligible && styles.eligibleActive]} onPress={() => setMealEligible((current) => !current)}><Ionicons name={mealEligible ? 'checkmark-circle' : 'ellipse-outline'} size={19} color="#176E73" /><Text style={styles.eligibleText}>Eligible for meal-plan credit</Text></TouchableOpacity><Text style={[styles.fieldLabel, { marginTop: 18 }]}>Customer choices</Text><Text style={styles.help}>Use separate groups such as Protein and Side. Customers can choose one option from each group.</Text>{choices.map((choice, index) => <View key={`${index}-${choice.name}`} style={styles.choiceEditorRow}><TextInput value={choice.group} onChangeText={(group) => setChoices((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, group } : row))} placeholder="Group" placeholderTextColor="#98A2AE" style={styles.choiceInput} /><TextInput value={choice.name} onChangeText={(name) => setChoices((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, name } : row))} placeholder="Option name" placeholderTextColor="#98A2AE" style={[styles.choiceInput, { flex: 1.25 }]} /><TextInput value={choice.price} onChangeText={(price) => setChoices((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, price } : row))} placeholder="Extra ₦" placeholderTextColor="#98A2AE" keyboardType="numeric" style={[styles.choiceInput, { maxWidth: 92 }]} /><TouchableOpacity style={styles.removeChoice} onPress={() => setChoices((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}><Ionicons name="trash-outline" size={17} color="#B44646" /></TouchableOpacity></View>)}<TouchableOpacity style={styles.addChoice} onPress={() => setChoices((rows) => [...rows, { group: rows.at(-1)?.group ?? '', name: '', price: '0' }])}><Ionicons name="add-circle-outline" size={18} color="#176E73" /><Text style={styles.addChoiceText}>Add radio choice</Text></TouchableOpacity><View style={styles.modalActions}><TouchableOpacity style={styles.cancelButton} onPress={onClose}><Text style={styles.cancelButtonText}>Cancel</Text></TouchableOpacity><TouchableOpacity disabled={saving || uploading} style={styles.saveButton} onPress={() => void save()}>{saving ? <ActivityIndicator color="#01193D" /> : <Text style={styles.saveButtonText}>Save item</Text>}</TouchableOpacity></View></ScrollView></View></Modal>;
}

function Nav({ section, id, label, icon, badge, onPress }: { section: Section; id: Section; label: string; icon: keyof typeof Ionicons.glyphMap; badge?: number; onPress: (id: Section) => void }) { const active = section === id; return <TouchableOpacity onPress={() => onPress(id)} style={[styles.nav, active && styles.navActive]}><Ionicons name={icon} size={20} color={active ? '#176E73' : '#7B8794'} /><Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text>{badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : null}</TouchableOpacity>; }
function PageHead({ title, subtitle, action, onAction }: { title: string; subtitle: string; action?: string; onAction?: () => void }) { return <View style={styles.pageHead}><View><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View>{action ? <TouchableOpacity style={styles.primaryButton} onPress={onAction}><Ionicons name="add" size={20} color="#01193D" /><Text style={styles.primaryButtonText}>{action}</Text></TouchableOpacity> : null}</View>; }
function PanelHead({ title, action, onPress }: { title: string; action: string; onPress: () => void }) { return <View style={styles.panelHead}><Text style={styles.panelTitle}>{title}</Text><TouchableOpacity onPress={onPress}><Text style={styles.link}>{action}</Text></TouchableOpacity></View>; }
function Metric({ icon, label, value, tone }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; tone: 'navy' | 'green' | 'gold' | 'blue' }) { return <View style={styles.metric}><View style={[styles.metricIcon, styles[`tone_${tone}`]]}><Ionicons name={icon} size={21} color={tone === 'navy' ? '#FFFFFF' : '#176E73'} /></View><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function MiniMetric({ label, value }: { label: string; value: number }) { return <View style={styles.miniMetric}><Text style={styles.miniValue}>{value}</Text><Text style={styles.muted}>{label}</Text></View>; }
function StatusPill({ status }: { status: string }) { const closed = ['cancelled', 'sold_out', 'hidden'].includes(status); return <View style={[styles.statusPill, closed && styles.statusPillClosed]}><View style={[styles.liveDot, closed && styles.closedDot]} /><Text style={[styles.statusText, closed && styles.statusTextClosed]}>{status.replaceAll('_', ' ')}</Text></View>; }
function Feedback({ text, onClose }: { text: string; onClose: () => void }) { return <View style={styles.feedback}><Ionicons name="checkmark-circle-outline" size={20} color="#176E73" /><Text style={styles.feedbackText}>{text}</Text><TouchableOpacity onPress={onClose}><Ionicons name="close" size={19} color="#176E73" /></TouchableOpacity></View>; }
function Empty({ icon, title, copy }: { icon: keyof typeof Ionicons.glyphMap; title: string; copy: string }) { return <View style={styles.empty}><Ionicons name={icon} size={31} color="#176E73" /><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyCopy}>{copy}</Text></View>; }
function InfoRow({ label, value }: { label: string; value: string }) { return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>; }
function ToggleRow({ label, copy, value, disabled, onPress }: { label: string; copy: string; value: boolean; disabled: boolean; onPress: () => void }) { return <View style={styles.toggleRow}><View style={{ flex: 1 }}><Text style={styles.toggleLabel}>{label}</Text><Text style={styles.toggleCopy}>{copy}</Text></View><TouchableOpacity disabled={disabled} onPress={onPress} style={[styles.toggle, value && styles.toggleOn, disabled && { opacity: 0.55 }]}><View style={[styles.toggleKnob, value && styles.toggleKnobOn]} /></TouchableOpacity></View>; }
function Field({ label, large, half, ...props }: { label: string; large?: boolean; half?: boolean; [key: string]: any }) { return <View style={[styles.field, half && { flex: 1 }]}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...props} placeholderTextColor="#98A2AE" style={[styles.input, large && styles.largeInput]} /></View>; }
function DesktopPrompt() { return <View style={styles.center}><Ionicons name="desktop-outline" size={47} color="#68ECCB" /><Text style={styles.accessTitle}>Continue on desktop</Text><Text style={styles.accessCopy}>The cafeteria operations workspace needs a wider screen for live orders, menu controls, and reporting.</Text></View>; }
function AccessPrompt({ onReturn }: { onReturn: () => void }) { return <View style={styles.center}><Ionicons name="lock-closed-outline" size={43} color="#68ECCB" /><Text style={styles.accessTitle}>Cafeteria access is not linked yet</Text><Text style={styles.accessCopy}>Ask an AOM administrator to add this account to cafeteria staff and choose its role.</Text><TouchableOpacity onPress={onReturn} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Return to AOM</Text></TouchableOpacity></View>; }

const styles = StyleSheet.create({
  agentForm: { borderTopWidth: 1, borderTopColor: '#E7EBEF', paddingTop: 15, marginBottom: 18 },
  contactChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  agentRoster: { gap: 8, marginTop: 14 },
  rosterRow: { minHeight: 66, borderTopWidth: 1, borderTopColor: '#E7EBEF', paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rosterActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  agentState: { minHeight: 32, borderRadius: 16, borderWidth: 1, borderColor: '#CFD7DF', paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  agentStateActive: { borderColor: '#25B68A', backgroundColor: '#E1F6F0' },
  agentStateText: { color: '#647181', fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  agentStateTextActive: { color: '#176E73' },
  customerName: { color: '#1D2937', fontSize: 14, fontWeight: '800', marginTop: 4 },
  customerContact: { color: '#176E73', fontSize: 12, fontWeight: '700', marginTop: 2 },
  screen: { flex: 1, backgroundColor: '#FFF' }, center: { flex: 1, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center', padding: 32 }, accessTitle: { color: '#FFF', fontSize: 25, fontWeight: '800', marginTop: 16 }, accessCopy: { color: '#C9D7EA', fontSize: 16, lineHeight: 23, textAlign: 'center', maxWidth: 480, marginTop: 8, marginBottom: 24 },
  topbar: { height: 78, backgroundColor: '#01193D', paddingHorizontal: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brand: { flexDirection: 'row', alignItems: 'center', gap: 12 }, brandName: { color: '#F8F3ED', fontSize: 21, fontWeight: '800' }, brandPortal: { color: '#8FA1BB', fontSize: 16, fontWeight: '600' }, topActions: { flexDirection: 'row', alignItems: 'center', gap: 12 }, acceptingPill: { height: 44, borderRadius: 11, borderWidth: 1, borderColor: '#214A80', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }, acceptingText: { color: '#F8F3ED', fontSize: 14, fontWeight: '800' }, liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#25B68A' }, closedDot: { backgroundColor: '#E4A129' }, rolePill: { height: 44, borderRadius: 11, backgroundColor: '#17365F', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }, roleText: { color: '#F8F3ED', fontSize: 14, fontWeight: '800' },
  body: { flex: 1, flexDirection: 'row' }, sidebar: { width: 270, borderRightWidth: 1, borderRightColor: '#D9DFE5', paddingTop: 22 }, menuLabel: { color: '#7B8794', fontSize: 13, fontWeight: '800', marginHorizontal: 25, marginBottom: 12 }, nav: { minHeight: 53, paddingHorizontal: 25, gap: 15, flexDirection: 'row', alignItems: 'center', borderRightWidth: 3, borderRightColor: 'transparent' }, navActive: { backgroundColor: '#E2F5F0', borderRightColor: '#25B68A' }, navText: { color: '#647181', fontSize: 16, fontWeight: '600', flex: 1 }, navTextActive: { color: '#176E73', fontWeight: '800' }, badge: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: '#E87500', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }, badgeText: { color: '#FFF', fontSize: 11, fontWeight: '800' }, sidebarInfo: { margin: 24, padding: 14, borderRadius: 11, backgroundColor: '#E1F6F0', flexDirection: 'row', gap: 9 }, sidebarInfoText: { flex: 1, color: '#176E73', fontSize: 12, lineHeight: 17 }, logout: { marginTop: 'auto', minHeight: 52, paddingHorizontal: 25, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: '#E1E5E9' }, logoutText: { color: '#B44646', fontSize: 15, fontWeight: '800' },
  workspace: { flex: 1 }, workspaceContent: { padding: 38, paddingBottom: 70 }, feedback: { minHeight: 49, paddingHorizontal: 15, borderRadius: 10, backgroundColor: '#E1F6F0', flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 }, feedbackText: { flex: 1, color: '#176E73', fontSize: 14, fontWeight: '700' }, pageHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 27 }, title: { color: '#1A1E24', fontSize: 30, fontWeight: '800' }, subtitle: { color: '#74808E', fontSize: 16, lineHeight: 23, marginTop: 6, maxWidth: 680 }, primaryButton: { minHeight: 48, borderRadius: 11, backgroundColor: '#68ECCB', paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, primaryButtonText: { color: '#01193D', fontSize: 15, fontWeight: '800' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 23 }, metric: { flexGrow: 1, flexBasis: 210, minHeight: 140, borderWidth: 1, borderColor: '#DFE5EA', borderRadius: 15, padding: 18 }, metricIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 17 }, tone_navy: { backgroundColor: '#01193D' }, tone_green: { backgroundColor: '#DDF6EE' }, tone_gold: { backgroundColor: '#FFF0D1' }, tone_blue: { backgroundColor: '#E0ECFA' }, metricValue: { color: '#01193D', fontSize: 27, fontWeight: '800' }, metricLabel: { color: '#176E73', fontSize: 13, fontWeight: '800', marginTop: 4 }, twoColumn: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' }, panel: { flex: 1, borderWidth: 1, borderColor: '#DFE5EA', borderRadius: 15, padding: 20, minHeight: 240 }, panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 }, panelTitle: { color: '#01193D', fontSize: 19, fontWeight: '800', marginBottom: 13 }, link: { color: '#176E73', fontSize: 13, fontWeight: '800' }, previewRow: { minHeight: 65, borderTopWidth: 1, borderTopColor: '#E7EBEF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, noticeBox: { padding: 14, borderRadius: 11, backgroundColor: '#E1F6F0', flexDirection: 'row', gap: 10, marginBottom: 13 }, warningBox: { backgroundColor: '#FFF0D1' }, noticeTitle: { color: '#176E73', fontSize: 14, fontWeight: '800' }, noticeCopy: { color: '#586776', fontSize: 12, lineHeight: 17, marginTop: 3 }, periodRow: { minHeight: 44, borderBottomWidth: 1, borderBottomColor: '#E7EBEF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, periodName: { color: '#263342', textTransform: 'capitalize', fontSize: 14, fontWeight: '700' }, periodState: { fontSize: 13, fontWeight: '800' }, openText: { color: '#176E73' }, closedText: { color: '#B44646' }, secondaryButton: { marginTop: 15, minHeight: 43, borderWidth: 1, borderColor: '#25B68A', borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, secondaryButtonText: { color: '#176E73', fontSize: 13, fontWeight: '800' },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 18 }, miniMetric: { minWidth: 150, minHeight: 77, borderWidth: 1, borderColor: '#DFE5EA', borderRadius: 12, padding: 14 }, miniValue: { color: '#01193D', fontSize: 23, fontWeight: '800' }, tabs: { flexDirection: 'row', gap: 26, borderBottomWidth: 1, borderBottomColor: '#DFE5EA', marginBottom: 15 }, tab: { paddingBottom: 12, borderBottomWidth: 3, borderBottomColor: 'transparent' }, tabActive: { borderBottomColor: '#25B68A' }, tabText: { color: '#74808E', fontSize: 15, fontWeight: '600' }, tabTextActive: { color: '#176E73', fontWeight: '800' }, table: { borderWidth: 1, borderColor: '#DFE5EA', borderRadius: 14, overflow: 'hidden' }, tableHead: { minHeight: 48, backgroundColor: '#F7F9FA', paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 12 }, column: { flex: 1, color: '#74808E', fontSize: 12, fontWeight: '800' }, tableRow: { minHeight: 79, borderTopWidth: 1, borderTopColor: '#E7EBEF', paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 12 }, productCell: { flexDirection: 'row', alignItems: 'center', gap: 11 }, productImage: { width: 46, height: 46, borderRadius: 9, backgroundColor: '#EEF1F4' }, productFallback: { width: 46, height: 46, borderRadius: 9, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center' }, rowTitle: { color: '#1D2937', fontSize: 14, fontWeight: '800' }, muted: { color: '#7B8794', fontSize: 12, lineHeight: 17, marginTop: 2 }, tableText: { flex: 1, color: '#576675', fontSize: 13, textTransform: 'capitalize' }, amount: { flex: 1, color: '#01193D', fontSize: 14, fontWeight: '800' }, stockInput: { flex: 1, maxWidth: 92, height: 38, borderWidth: 1, borderColor: '#C9D3DC', borderRadius: 8, color: '#1D2937', fontSize: 13, textAlign: 'center', paddingHorizontal: 6 }, statusPill: { alignSelf: 'flex-start', minHeight: 31, maxWidth: 130, borderRadius: 16, backgroundColor: '#DFF5EE', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }, statusPillClosed: { backgroundColor: '#F2E4E4' }, statusText: { color: '#176E73', fontSize: 11, fontWeight: '800', textTransform: 'capitalize' }, statusTextClosed: { color: '#994646' }, rowActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 5 }, iconButton: { width: 33, height: 33, borderRadius: 8, borderWidth: 1, borderColor: '#CFD7DF', alignItems: 'center', justifyContent: 'center' }, deleteButton: { borderColor: '#EAC8C8' },
  orderGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 15 }, orderCard: { flexGrow: 1, flexBasis: 420, maxWidth: 590, borderWidth: 1, borderColor: '#DFE5EA', borderRadius: 15, padding: 18 }, orderTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }, orderNumber: { color: '#01193D', fontSize: 17, fontWeight: '800' }, orderMetaRow: { minHeight: 42, borderRadius: 9, backgroundColor: '#F3F7F8', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9 }, orderMeta: { color: '#4F6070', fontSize: 12, flex: 1 }, lineItem: { minHeight: 58, borderBottomWidth: 1, borderBottomColor: '#E7EBEF', flexDirection: 'row', alignItems: 'center', gap: 10 }, lineTitle: { color: '#273443', fontSize: 13, fontWeight: '800' }, itemNote: { color: '#805E15', fontSize: 11, marginTop: 3 }, orderFoot: { minHeight: 56, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }, orderTotal: { color: '#176E73', fontSize: 19, fontWeight: '800' }, orderActions: { flexDirection: 'row', alignItems: 'center', gap: 7 }, primarySmall: { minHeight: 38, paddingHorizontal: 13, borderRadius: 8, backgroundColor: '#68ECCB', alignItems: 'center', justifyContent: 'center' }, primarySmallText: { color: '#01193D', fontSize: 12, fontWeight: '800' }, cancelSmall: { minHeight: 38, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E2BABA', alignItems: 'center', justifyContent: 'center' }, cancelSmallText: { color: '#A14444', fontSize: 12, fontWeight: '800' },
  safety: { minHeight: 58, borderRadius: 11, backgroundColor: '#E1F6F0', paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 }, safetyText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '700' }, dispatchGrid: { gap: 14, marginBottom: 28 }, walkCard: { borderWidth: 1, borderColor: '#DFE5EA', borderRadius: 15, padding: 18, backgroundColor: '#FFF' }, walkItems: { color: '#526273', fontSize: 13, lineHeight: 19, marginBottom: 10 }, assignedAgent: { minHeight: 62, borderRadius: 11, backgroundColor: '#E1F6F0', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }, walkIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#C8EEE4', alignItems: 'center', justifyContent: 'center' }, riderName: { color: '#01193D', fontSize: 14, fontWeight: '800' }, recommendations: { gap: 8, marginTop: 12 }, agentSuggestion: { minHeight: 66, borderWidth: 1, borderColor: '#D9E0E6', borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }, bestSuggestion: { borderColor: '#25B68A', backgroundColor: '#F3FCF9' }, suggestionRank: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center' }, suggestionRankText: { color: '#FFF', fontSize: 12, fontWeight: '800' }, scheduleWarning: { color: '#8A5A00', fontSize: 11, lineHeight: 16, marginTop: 3 }, schedulePanel: { borderWidth: 1, borderColor: '#DFE5EA', borderRadius: 15, padding: 20, marginTop: 10 }, riderChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 13 }, riderChoice: { minHeight: 38, paddingHorizontal: 11, borderRadius: 19, borderWidth: 1, borderColor: '#CFD7DF', flexDirection: 'row', alignItems: 'center', gap: 6 }, riderChoiceActive: { borderColor: '#25B68A', backgroundColor: '#E1F6F0' }, riderChoiceText: { color: '#176E73', fontSize: 12, fontWeight: '800' }, dayChoices: { gap: 7, paddingBottom: 12 }, dayChoice: { minWidth: 52, height: 37, borderWidth: 1, borderColor: '#CFD7DF', borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, dayChoiceActive: { backgroundColor: '#01193D', borderColor: '#01193D' }, dayChoiceText: { color: '#647181', fontSize: 12, fontWeight: '800' }, dayChoiceTextActive: { color: '#FFF' }, scheduleForm: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, maxWidth: 620 }, scheduleList: { gap: 10, marginTop: 22 }, scheduleRider: { borderTopWidth: 1, borderTopColor: '#E7EBEF', paddingTop: 13 }, scheduleRiderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }, shiftCount: { color: '#176E73', fontSize: 11, fontWeight: '800' }, shiftWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 }, shiftPill: { minHeight: 32, borderRadius: 16, backgroundColor: '#F0F4F6', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 }, shiftText: { color: '#526273', fontSize: 11, fontWeight: '700' },
  rangeButtons: { flexDirection: 'row', gap: 9, marginBottom: 20 }, rangeButton: { minHeight: 43, paddingHorizontal: 16, borderRadius: 9, borderWidth: 1, borderColor: '#CFD7DF', alignItems: 'center', justifyContent: 'center' }, rangeButtonActive: { backgroundColor: '#01193D', borderColor: '#01193D' }, rangeText: { color: '#647181', fontSize: 13, fontWeight: '800' }, rangeTextActive: { color: '#FFF' }, rankedRow: { minHeight: 49, borderTopWidth: 1, borderTopColor: '#E7EBEF', flexDirection: 'row', alignItems: 'center', gap: 10 }, rank: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E1F6F0', color: '#176E73', fontSize: 12, fontWeight: '800', textAlign: 'center', lineHeight: 28 }, infoRow: { minHeight: 45, borderBottomWidth: 1, borderBottomColor: '#E7EBEF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, infoLabel: { color: '#5A6877', fontSize: 13 }, infoValue: { color: '#01193D', fontSize: 14, fontWeight: '800' },
  readOnly: { minHeight: 50, borderRadius: 10, backgroundColor: '#FFF0D1', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 15 }, readOnlyText: { color: '#805E15', fontSize: 13, fontWeight: '700' }, settingsPanel: { maxWidth: 780, borderWidth: 1, borderColor: '#DFE5EA', borderRadius: 15, padding: 20 }, toggleRow: { minHeight: 78, borderBottomWidth: 1, borderBottomColor: '#E7EBEF', flexDirection: 'row', alignItems: 'center', gap: 20 }, toggleLabel: { color: '#1D2937', fontSize: 15, fontWeight: '800' }, toggleCopy: { color: '#7B8794', fontSize: 12, lineHeight: 17, marginTop: 3 }, toggle: { width: 48, height: 27, borderRadius: 14, backgroundColor: '#CED5DC', padding: 3, justifyContent: 'center' }, toggleOn: { backgroundColor: '#68ECCB' }, toggleKnob: { width: 21, height: 21, borderRadius: 11, backgroundColor: '#FFF' }, toggleKnobOn: { alignSelf: 'flex-end', backgroundColor: '#176E73' }, noticeInput: { minHeight: 104, borderWidth: 1, borderColor: '#CFD7DF', borderRadius: 9, padding: 12, textAlignVertical: 'top', color: '#1D2937', fontSize: 14, marginTop: 8 }, saveSettings: { minHeight: 47, alignSelf: 'flex-end', marginTop: 16, borderRadius: 9, backgroundColor: '#68ECCB', paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 8 }, saveSettingsText: { color: '#01193D', fontSize: 13, fontWeight: '800' },
  empty: { padding: 32, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: '#01193D', fontSize: 16, fontWeight: '800', marginTop: 8 }, emptyCopy: { color: '#7B8794', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 3 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(1,25,61,0.46)', alignItems: 'center', justifyContent: 'center', padding: 24 }, modal: { width: '100%', maxWidth: 650, maxHeight: '90%', borderRadius: 16, backgroundColor: '#FFF' }, modalContent: { padding: 24 }, modalTitle: { color: '#01193D', fontSize: 23, fontWeight: '800', marginBottom: 20 }, field: { marginBottom: 15 }, fieldPair: { flexDirection: 'row', gap: 12 }, fieldLabel: { color: '#4F5F70', fontSize: 13, fontWeight: '800', marginBottom: 7, marginTop: 5 }, input: { minHeight: 46, borderWidth: 1, borderColor: '#CFD7DF', borderRadius: 9, paddingHorizontal: 12, color: '#1D2937', fontSize: 14 }, largeInput: { minHeight: 82, textAlignVertical: 'top', paddingTop: 11 }, upload: { minHeight: 45, borderWidth: 1, borderColor: '#25B68A', borderRadius: 9, backgroundColor: '#E1F6F0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 9 }, uploadText: { color: '#176E73', fontSize: 13, fontWeight: '800' }, editorPreview: { width: '100%', height: 150, borderRadius: 10, backgroundColor: '#EEF1F4', resizeMode: 'cover', marginBottom: 15 }, choicePills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 13 }, choicePill: { minHeight: 38, paddingHorizontal: 12, borderWidth: 1, borderColor: '#CFD7DF', borderRadius: 19, flexDirection: 'row', alignItems: 'center', gap: 6 }, choicePillActive: { borderColor: '#25B68A', backgroundColor: '#E1F6F0' }, choicePillText: { color: '#176E73', fontSize: 12, fontWeight: '800', textTransform: 'capitalize' }, eligible: { minHeight: 44, borderRadius: 9, backgroundColor: '#F2F5F7', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, eligibleActive: { backgroundColor: '#E1F6F0' }, eligibleText: { color: '#176E73', fontSize: 13, fontWeight: '800' }, help: { color: '#7B8794', fontSize: 12, lineHeight: 17, marginBottom: 8 }, choiceEditorRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 }, choiceInput: { flex: 1, minHeight: 43, borderWidth: 1, borderColor: '#CFD7DF', borderRadius: 8, paddingHorizontal: 10, color: '#1D2937', fontSize: 13 }, removeChoice: { width: 40, height: 43, borderWidth: 1, borderColor: '#E7C4C4', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, addChoice: { minHeight: 42, borderWidth: 1, borderColor: '#25B68A', borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 10 }, addChoiceText: { color: '#176E73', fontSize: 13, fontWeight: '800' }, modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 22 }, cancelButton: { minHeight: 45, borderWidth: 1, borderColor: '#CFD7DF', borderRadius: 9, paddingHorizontal: 17, alignItems: 'center', justifyContent: 'center' }, cancelButtonText: { color: '#647181', fontSize: 13, fontWeight: '800' }, saveButton: { minHeight: 45, borderRadius: 9, backgroundColor: '#68ECCB', paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' }, saveButtonText: { color: '#01193D', fontSize: 13, fontWeight: '800' },
});
