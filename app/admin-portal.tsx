import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { PortalInstallBanner } from '../components/PortalInstallBanner';

type Transfer = { id: string; reference: string; amount_kobo: number; delivery_address: string | null; fulfilment: string; created_at: string; customer: { full_name: string | null; phone: string | null } | null; order: { order_number: string; delivery_slot: string | null } | null };
type Application = { id: string; store_name: string; contact_name: string; phone: string; store_type: string; operating_location: 'on_campus' | 'off_campus' | null; category: string; address: string | null; pickup_location: string | null; created_at: string };
type Payout = { id: string; vendor_id: string; amount: number; status: 'requested' | 'processing'; requested_at: string; processed_at: string | null; reference: string | null; note: string | null; vendor: { id: string; name: string } | null };
type DispatchOrder = { id: string; order_number: string; status: 'ready' | 'out_for_delivery'; delivery_type: string | null; delivery_address: string | null; delivery_slot: string | null; rider_name: string | null; rider_phone: string | null; dispatch_status: 'assigned' | 'picked_up' | null; created_at: string };
type Rider = { id: string; full_name: string; phone: string; accepts_calls: boolean; accepts_whatsapp: boolean; coverage_area: string | null; availability: 'active' };
type OrderVendor = { id: string; name: string; pickup_location: string | null; contact: { contact_name: string; phone: string } | null };
type AdminOrder = { id: string; order_number: string; status: string; payment_status: string; delivery_type: string | null; delivery_address: string | null; delivery_slot: string | null; total: number | null; amount_paid: number | null; created_at: string; item_summary: string; vendors: OrderVendor[] };
type HomePromo = { heading: string; message: string; background_image_url: string | null; background_color: string; cta_label: string; cta_href: string; updated_at?: string };
type DashboardData = { metrics: { pending_transfers: number; pending_vendor_applications: number; paid_orders: number; pending_payouts: number; dispatch_queue: number; gross_sales: number; sales_last_30_days: number; average_order_value: number; partner_vendors: number; top_vendors: { id: string; name: string; sales: number; orders: number }[] }; pending_transfers: Transfer[]; pending_vendor_applications: Application[]; pending_payouts: Payout[]; dispatch_queue: DispatchOrder[]; delivery_riders: Rider[]; orders: AdminOrder[]; home_promo: HomePromo | null };
type JourneyEvent = { event_name: string; route: string | null; properties: Record<string, unknown>; created_at: string };
type JourneySession = { session_id: string; customer_name: string; current_route: string | null; last_event_name: string | null; last_event_at: string; started_at: string; events: JourneyEvent[] };
type JourneyFeed = { sessions: JourneySession[]; summary: { unique_visitors: number; most_visited_page: string | null; most_visited_page_views: number; average_session_seconds: number; paid_orders: number } };
type Page = 'overview' | 'orders' | 'transfers' | 'vendors' | 'payouts' | 'dispatch' | 'home' | 'activity' | 'support';

const money = (kobo: number) => `₦${(Number(kobo) / 100).toLocaleString('en-NG')}`;
const date = (value: string) => new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });

export default function AdminPortal() {
  const { width } = useWindowDimensions();
  const compact = width < 860;
  const router = useRouter();
  const [page, setPage] = useState<Page>('overview');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [workingId, setWorkingId] = useState('');
  const [transferToConfirm, setTransferToConfirm] = useState<Transfer | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [journey, setJourney] = useState<JourneyFeed | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(false);

  const invoke = async (body: object) => {
    const { data: result, error } = await supabase.functions.invoke('admin-portal', { body });
    if (!error && !result?.error) return result;
    let detail = result?.error ?? error?.message ?? 'Admin action failed.';
    const context = (error as { context?: unknown } | null)?.context;
    if (context instanceof Response) {
      try { detail = (await context.clone().json() as { error?: string }).error ?? detail; } catch { /* keep provider message */ }
    }
    throw new Error(detail);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace('/(auth)/login'); return; }
      const result = await invoke({ action: 'dashboard' }) as DashboardData;
      setData(result);
      setForbidden(false);
    } catch (error) {
      setForbidden(true);
      setFeedback(error instanceof Error ? error.message : 'Could not open the administrator portal.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadJourney = useCallback(async () => {
    setJourneyLoading(true);
    try { setJourney(await invoke({ action: 'activity_feed' }) as JourneyFeed); }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Could not load live customer activity.'); }
    finally { setJourneyLoading(false); }
  }, []);

  useEffect(() => {
    if (page !== 'activity') return;
    void loadJourney();
    const interval = setInterval(() => void loadJourney(), 15000);
    const channel = supabase.channel('admin-customer-activity').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'customer_journey_events' }, () => void loadJourney()).subscribe();
    return () => { clearInterval(interval); void supabase.removeChannel(channel); };
  }, [page, loadJourney]);

  const confirmTransfer = async (transfer: Transfer) => {
    setWorkingId(transfer.id);
    try { await invoke({ action: 'confirm_transfer', intent_id: transfer.id }); setFeedback('Transfer confirmed. The order is now live for the vendor.'); setTransferToConfirm(null); await load(); }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Could not confirm that transfer.'); }
    finally { setWorkingId(''); }
  };
  const cancelTransfer = async (transfer: Transfer) => {
    setWorkingId(transfer.id);
    try { await invoke({ action: 'cancel_transfer', intent_id: transfer.id }); setFeedback(`Transfer check cancelled. ${transfer.order?.order_number ?? 'The order'} was not released to vendors.`); await load(); }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Could not cancel that transfer check.'); }
    finally { setWorkingId(''); }
  };

  const reviewApplication = async (application: Application, decision: 'approved' | 'rejected') => {
    setWorkingId(application.id);
    try {
      await invoke({ action: 'review_vendor', application_id: application.id, decision });
      setFeedback(decision === 'approved' ? `${application.store_name} is approved and their vendor workspace is linked.` : `${application.store_name} was declined.`);
      await load();
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Could not review this application.'); }
    finally { setWorkingId(''); }
  };

  const updatePayout = async (payout: Payout, status: 'processing' | 'paid' | 'rejected') => {
    setWorkingId(payout.id);
    try {
      const result = await invoke({ action: 'update_payout', payout_id: payout.id, status });
      const label = status === 'paid' ? `Payout marked paid${result.reference ? ` · ${result.reference}` : ''}.` : status === 'processing' ? 'Payout moved to processing.' : 'Payout request rejected.';
      setFeedback(label);
      await load();
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Could not update that payout.'); }
    finally { setWorkingId(''); }
  };
  const updateDispatch = async (order: DispatchOrder, action: 'assign' | 'picked_up' | 'delivered', rider?: { name: string; phone: string }) => {
    setWorkingId(order.id);
    try {
      await invoke(action === 'assign' ? { action: 'assign_dispatch', order_id: order.id, rider_name: rider?.name ?? '', rider_phone: rider?.phone ?? '' } : { action: 'update_dispatch', order_id: order.id, status: action });
      setFeedback(action === 'assign' ? `Rider assigned to #${order.order_number}.` : action === 'picked_up' ? `#${order.order_number} is now out for delivery.` : `#${order.order_number} is marked delivered.`);
      await load();
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Could not update dispatch.'); }
    finally { setWorkingId(''); }
  };
  const saveHomePromo = async (promotion: HomePromo) => {
    setWorkingId('home-promo');
    try {
      const result = await invoke({ action: 'update_home_promo', promotion });
      setData((current) => current ? { ...current, home_promo: result.home_promo as HomePromo } : current);
      setFeedback('Today’s Pick has been updated on the buyer home page.');
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Could not update Today’s Pick.'); }
    finally { setWorkingId(''); }
  };

  if (loading) return <View style={styles.loading}><StatusBar style="light" /><ActivityIndicator size="large" color="#68ECCB" /><Text style={styles.loadingText}>Opening administrator workspace…</Text></View>;
  if (forbidden) return <View style={styles.loading}><StatusBar style="light" /><Ionicons name="lock-closed-outline" size={52} color="#68ECCB" /><Text style={styles.mobileTitle}>Administrator access required</Text><Text style={styles.mobileText}>{feedback || 'Ask an existing AOM administrator to grant this account access.'}</Text><TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(buyer)/')}><Text style={styles.backButtonText}>GO TO APP</Text></TouchableOpacity></View>;

  const transfers = data?.pending_transfers ?? [];
  const applications = data?.pending_vendor_applications ?? [];
  const payouts = data?.pending_payouts ?? [];
  const dispatchQueue = data?.dispatch_queue ?? [];
  const deliveryRiders = data?.delivery_riders ?? [];
  const orders = data?.orders ?? [];
  if (compact) return <AdminMobile page={page} setPage={setPage} data={data!} feedback={feedback} setFeedback={setFeedback} transferToConfirm={transferToConfirm} setTransferToConfirm={setTransferToConfirm} workingId={workingId} confirmTransfer={confirmTransfer} cancelTransfer={cancelTransfer} reviewApplication={reviewApplication} updatePayout={updatePayout} updateDispatch={updateDispatch} load={load} journey={journey} journeyLoading={journeyLoading} />;
  if (page === 'orders') return <View style={styles.screen}><StatusBar style="light" /><View style={styles.topbar}><View style={styles.brand}><View style={styles.brandIcon}><Ionicons name="shield-checkmark-outline" size={23} color="#68ECCB" /></View><Text style={styles.brandName}>AUN Online Mart</Text><Text style={styles.brandPortal}>Admin portal</Text></View><TouchableOpacity style={styles.refresh} onPress={() => void load()}><Ionicons name="refresh-outline" size={19} color="#F8F3ED" /><Text style={styles.refreshText}>Refresh</Text></TouchableOpacity></View><View style={styles.body}><View style={styles.sidebar}><Text style={styles.menu}>WORKSPACE</Text><Navigation page={page} setPage={setPage} id="overview" icon="grid-outline" label="Overview" /><Navigation page={page} setPage={setPage} id="activity" icon="pulse-outline" label="Live activity" /><Navigation page={page} setPage={setPage} id="support" icon="chatbubbles-outline" label="Support inbox" /><Navigation page={page} setPage={setPage} id="dispatch" icon="bicycle-outline" label="Dispatch desk" badge={dispatchQueue.length} /><Navigation page={page} setPage={setPage} id="transfers" icon="card-outline" label="Transfer checks" badge={transfers.length} /><Navigation page={page} setPage={setPage} id="payouts" icon="wallet-outline" label="Payout approvals" badge={payouts.length} /><Navigation page={page} setPage={setPage} id="vendors" icon="storefront-outline" label="Vendor applications" badge={applications.length} /><View style={styles.sidebarFoot}><Ionicons name="lock-closed-outline" size={17} color="#176E73" /><Text style={styles.sidebarFootText}>Administrator-only actions are logged.</Text></View></View><ScrollView style={styles.workspace} contentContainerStyle={styles.workspaceContent} showsVerticalScrollIndicator><PortalInstallBanner /><Orders orders={orders} /></ScrollView></View></View>;
  return <View style={styles.screen}><StatusBar style="light" /><View style={styles.topbar}><View style={styles.brand}><View style={styles.brandIcon}><Ionicons name="shield-checkmark-outline" size={23} color="#68ECCB" /></View><Text style={styles.brandName}>AUN Online Mart</Text><Text style={styles.brandPortal}>Admin portal</Text></View><TouchableOpacity style={styles.refresh} onPress={() => void load()}><Ionicons name="refresh-outline" size={19} color="#F8F3ED" /><Text style={styles.refreshText}>Refresh</Text></TouchableOpacity></View><View style={styles.body}><View style={styles.sidebar}><Text style={styles.menu}>WORKSPACE</Text><Navigation page={page} setPage={setPage} id="overview" icon="grid-outline" label="Overview" /><Navigation page={page} setPage={setPage} id="activity" icon="pulse-outline" label="Live activity" /><Navigation page={page} setPage={setPage} id="support" icon="chatbubbles-outline" label="Support inbox" /><Navigation page={page} setPage={setPage} id="dispatch" icon="bicycle-outline" label="Dispatch desk" badge={dispatchQueue.length} /><Navigation page={page} setPage={setPage} id="transfers" icon="card-outline" label="Transfer checks" badge={transfers.length} /><Navigation page={page} setPage={setPage} id="payouts" icon="wallet-outline" label="Payout approvals" badge={payouts.length} /><Navigation page={page} setPage={setPage} id="vendors" icon="storefront-outline" label="Vendor applications" badge={applications.length} /><View style={styles.sidebarFoot}><Ionicons name="lock-closed-outline" size={17} color="#176E73" /><Text style={styles.sidebarFootText}>Administrator-only actions are logged.</Text></View></View><ScrollView style={styles.workspace} contentContainerStyle={styles.workspaceContent} showsVerticalScrollIndicator><PortalInstallBanner />{feedback ? <View style={styles.feedback}><Ionicons name="information-circle-outline" size={19} color="#176E73" /><Text style={styles.feedbackText}>{feedback}</Text><TouchableOpacity onPress={() => setFeedback('')}><Ionicons name="close-outline" size={18} color="#176E73" /></TouchableOpacity></View> : null}{transferToConfirm ? <View style={styles.confirmPanel}><View style={styles.confirmIcon}><Ionicons name="alert-outline" size={22} color="#805E15" /></View><View style={styles.confirmCopy}><Text style={styles.confirmTitle}>Confirm this bank transfer?</Text><Text style={styles.confirmTextBody}>{transferToConfirm.order?.order_number ?? 'Pending order'} · {money(transferToConfirm.amount_kobo)}. This releases the order to its vendor and starts their alert email.</Text></View><TouchableOpacity onPress={() => setTransferToConfirm(null)} style={styles.cancelConfirm}><Text style={styles.cancelConfirmText}>Cancel</Text></TouchableOpacity><TouchableOpacity disabled={workingId === transferToConfirm.id} onPress={() => void confirmTransfer(transferToConfirm)} style={[styles.finalConfirmButton, workingId === transferToConfirm.id && { opacity: 0.6 }]}>{workingId === transferToConfirm.id ? <ActivityIndicator color="#01193D" /> : <Text style={styles.finalConfirmText}>Confirm payment</Text>}</TouchableOpacity></View> : null}{page === 'overview' ? <Overview metrics={data!.metrics} transfers={transfers} applications={applications} payouts={payouts} setPage={setPage} /> : null}{page === 'activity' ? <ActivityFeed feed={journey} loading={journeyLoading} /> : null}{page === 'support' ? <SupportInbox /> : null}{page === 'dispatch' ? <Dispatch orders={dispatchQueue} riders={deliveryRiders} workingId={workingId} onUpdate={updateDispatch} /> : null}{page === 'transfers' ? <Transfers transfers={transfers} workingId={workingId} onConfirm={setTransferToConfirm} onCancel={cancelTransfer} /> : null}{page === 'payouts' ? <Payouts payouts={payouts} workingId={workingId} onUpdate={updatePayout} /> : null}{page === 'vendors' ? <Applications applications={applications} workingId={workingId} onReview={reviewApplication} /> : null}</ScrollView></View></View>;
}

function AdminMobile({ page, setPage, data, feedback, setFeedback, transferToConfirm, setTransferToConfirm, workingId, confirmTransfer, cancelTransfer, reviewApplication, updatePayout, updateDispatch, load, journey, journeyLoading }: {
  page: Page; setPage: (page: Page) => void; data: DashboardData; feedback: string; setFeedback: (value: string) => void; transferToConfirm: Transfer | null; setTransferToConfirm: (value: Transfer | null) => void; workingId: string; confirmTransfer: (transfer: Transfer) => Promise<void>; cancelTransfer: (transfer: Transfer) => Promise<void>; reviewApplication: (application: Application, decision: 'approved' | 'rejected') => Promise<void>; updatePayout: (payout: Payout, status: 'processing' | 'paid' | 'rejected') => Promise<void>; updateDispatch: (order: DispatchOrder, action: 'assign' | 'picked_up' | 'delivered', rider?: { name: string; phone: string }) => Promise<void>; load: () => Promise<void>; journey: JourneyFeed | null; journeyLoading: boolean;
}) {
  const navigation: { id: Page; label: string; icon: keyof typeof Ionicons.glyphMap; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: 'grid-outline' }, { id: 'orders', label: 'Orders', icon: 'receipt-outline' },
    { id: 'dispatch', label: 'Dispatch', icon: 'bicycle-outline', badge: data.dispatch_queue.length }, { id: 'transfers', label: 'Transfers', icon: 'card-outline', badge: data.pending_transfers.length },
    { id: 'payouts', label: 'Payouts', icon: 'wallet-outline', badge: data.pending_payouts.length }, { id: 'vendors', label: 'Vendors', icon: 'storefront-outline', badge: data.pending_vendor_applications.length }, { id: 'activity', label: 'Activity', icon: 'pulse-outline' }, { id: 'support', label: 'Support', icon: 'chatbubbles-outline' },
  ];
  return <View style={styles.screen}><StatusBar style="light" /><View style={styles.mobileTopbar}><View style={styles.brand}><View style={styles.brandIcon}><Ionicons name="shield-checkmark-outline" size={20} color="#68ECCB" /></View><View><Text style={styles.mobileBrandName}>AUN Online Mart</Text><Text style={styles.mobileBrandPortal}>Admin portal</Text></View></View><TouchableOpacity style={styles.mobileRefresh} onPress={() => void load()}><Ionicons name="refresh-outline" size={19} color="#F8F3ED" /></TouchableOpacity></View><ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mobileAdminNav} contentContainerStyle={styles.mobileAdminNavContent}>{navigation.map((item) => <TouchableOpacity key={item.id} onPress={() => setPage(item.id)} style={[styles.mobileAdminNavItem, page === item.id && styles.mobileAdminNavItemActive]}><Ionicons name={item.icon} size={17} color={page === item.id ? '#176E73' : '#647181'} /><Text style={[styles.mobileAdminNavText, page === item.id && styles.mobileAdminNavTextActive]}>{item.label}</Text>{item.badge ? <View style={styles.mobileAdminBadge}><Text style={styles.mobileAdminBadgeText}>{item.badge}</Text></View> : null}</TouchableOpacity>)}</ScrollView><ScrollView style={styles.workspace} contentContainerStyle={styles.mobileWorkspaceContent} showsVerticalScrollIndicator><PortalInstallBanner />{feedback ? <View style={styles.feedback}><Ionicons name="information-circle-outline" size={19} color="#176E73" /><Text style={styles.feedbackText}>{feedback}</Text><TouchableOpacity onPress={() => setFeedback('')}><Ionicons name="close-outline" size={18} color="#176E73" /></TouchableOpacity></View> : null}{transferToConfirm ? <View style={styles.mobileConfirmPanel}><Text style={styles.confirmTitle}>Confirm this bank transfer?</Text><Text style={styles.confirmTextBody}>{transferToConfirm.order?.order_number ?? 'Pending order'} · {money(transferToConfirm.amount_kobo)} will be released to the vendor.</Text><View style={styles.mobileConfirmActions}><TouchableOpacity onPress={() => setTransferToConfirm(null)} style={styles.cancelConfirm}><Text style={styles.cancelConfirmText}>Cancel</Text></TouchableOpacity><TouchableOpacity disabled={workingId === transferToConfirm.id} onPress={() => void confirmTransfer(transferToConfirm)} style={styles.finalConfirmButton}>{workingId === transferToConfirm.id ? <ActivityIndicator color="#01193D" /> : <Text style={styles.finalConfirmText}>Confirm payment</Text>}</TouchableOpacity></View></View> : null}{page === 'overview' ? <Overview metrics={data.metrics} transfers={data.pending_transfers} applications={data.pending_vendor_applications} payouts={data.pending_payouts} setPage={setPage} /> : null}{page === 'orders' ? <Orders orders={data.orders} /> : null}{page === 'activity' ? <ActivityFeed feed={journey} loading={journeyLoading} /> : null}{page === 'support' ? <SupportInbox /> : null}{page === 'dispatch' ? <Dispatch orders={data.dispatch_queue} riders={data.delivery_riders} workingId={workingId} onUpdate={updateDispatch} /> : null}{page === 'transfers' ? <Transfers transfers={data.pending_transfers} workingId={workingId} onConfirm={setTransferToConfirm} onCancel={cancelTransfer} /> : null}{page === 'payouts' ? <Payouts payouts={data.pending_payouts} workingId={workingId} onUpdate={updatePayout} /> : null}{page === 'vendors' ? <Applications applications={data.pending_vendor_applications} workingId={workingId} onReview={reviewApplication} /> : null}</ScrollView></View>;
}

function Navigation({ page, setPage, id, icon, label, badge }: { page: Page; setPage: (page: Page) => void; id: Page; icon: keyof typeof Ionicons.glyphMap; label: string; badge?: number }) {
  const active = page === id;
  const item = <TouchableOpacity style={[styles.nav, active && styles.navActive]} onPress={() => setPage(id)}><Ionicons name={icon} size={20} color={active ? '#176E73' : '#77828E'} /><Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text>{badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : null}</TouchableOpacity>;
  if (id !== 'overview') return item;
  const ordersActive = page === 'orders';
  return <>{item}<TouchableOpacity style={[styles.nav, ordersActive && styles.navActive]} onPress={() => setPage('orders')}><Ionicons name="receipt-outline" size={20} color={ordersActive ? '#176E73' : '#77828E'} /><Text style={[styles.navText, ordersActive && styles.navTextActive]}>All orders</Text></TouchableOpacity></>;
}
function Overview({ metrics, transfers, applications, payouts, setPage }: { metrics: DashboardData['metrics']; transfers: Transfer[]; applications: Application[]; payouts: Payout[]; setPage: (page: Page) => void }) {
  const topVendors = metrics.top_vendors ?? [];
  return <>
    <View style={styles.heading}>
      <View>
        <Text style={styles.title}>AOM operations</Text>
        <Text style={styles.subtitle}>Your live marketplace snapshot, followed by the actions that need attention.</Text>
      </View>
    </View>

    <View style={styles.insightGrid}>
      <InsightMetric icon="cash-outline" label="Paid sales" value={money(metrics.gross_sales * 100)} note="All successful customer payments" colour="#176E73" />
      <InsightMetric icon="trending-up-outline" label="Sales in the last 30 days" value={money(metrics.sales_last_30_days * 100)} note="Rolling 30-day performance" colour="#25B68A" />
      <InsightMetric icon="receipt-outline" label="Average order value" value={money(metrics.average_order_value * 100)} note={metrics.paid_orders + " paid order" + (metrics.paid_orders === 1 ? "" : "s") + " overall"} colour="#365B95" />
      <InsightMetric icon="storefront-outline" label="Partner vendors" value={String(metrics.partner_vendors)} note="Stores on the AOM platform" colour="#F4A62A" />
    </View>

    <View style={styles.topVendorPanel}>
      <PanelHeader title="Top vendors by sales" action="View all orders" onPress={() => setPage('orders')} />
      <Text style={styles.panelCopy}>Ranked from the value of paid product orders. This helps the team spot strong stores and vendors who may need support.</Text>
      {topVendors.length ? <View style={styles.vendorRankGrid}>{topVendors.map((vendor, index) => <View key={vendor.id} style={styles.vendorRank}><View style={styles.rankNumber}><Text style={styles.rankNumberText}>{index + 1}</Text></View><View style={styles.rankCopy}><Text style={styles.rankName} numberOfLines={1}>{vendor.name}</Text><Text style={styles.rankMeta}>{vendor.orders} paid order{vendor.orders === 1 ? '' : 's'}</Text></View><Text style={styles.rankSales}>₦{Number(vendor.sales).toLocaleString('en-NG')}</Text></View>)}</View> : <Empty text="Top-vendor sales will appear after paid product orders are recorded." />}
    </View>

    <View style={styles.metricRow}>
      <Metric icon="time-outline" label="Transfers to confirm" value={metrics.pending_transfers} colour="#F4A62A" />
      <Metric icon="wallet-outline" label="Payouts to review" value={metrics.pending_payouts} colour="#176E73" />
      <Metric icon="storefront-outline" label="Vendor applications" value={metrics.pending_vendor_applications} colour="#365B95" />
      <Metric icon="checkmark-done-outline" label="Paid orders" value={metrics.paid_orders} colour="#25B68A" />
    </View>

    <View style={styles.overviewGrid}>
      <View style={styles.panel}>
        <PanelHeader title="Awaiting transfer confirmation" action="View queue" onPress={() => setPage('transfers')} />
        <Text style={styles.panelCopy}>Only confirm after the exact amount appears in the AOM account.</Text>
        {transfers.slice(0, 3).map((transfer) => <View style={styles.previewRow} key={transfer.id}><View><Text style={styles.previewTitle}>{transfer.order?.order_number ?? 'Pending order'}</Text><Text style={styles.previewSub}>{transfer.delivery_address || 'Delivery address not provided'}</Text></View><Text style={styles.previewAmount}>{money(transfer.amount_kobo)}</Text></View>)}
        {!transfers.length ? <Empty text="No transfers await confirmation." /> : null}
      </View>
      <View style={styles.panel}>
        <PanelHeader title="Payout approvals" action="Review payouts" onPress={() => setPage('payouts')} />
        <Text style={styles.panelCopy}>Review completed-order settlements before sending vendor payments.</Text>
        {payouts.slice(0, 3).map((payout) => <View style={styles.previewRow} key={payout.id}><View><Text style={styles.previewTitle}>{payout.vendor?.name ?? 'Vendor'}</Text><Text style={styles.previewSub}>{payout.status === 'processing' ? 'Settlement processing' : 'Requested settlement'}</Text></View><Text style={styles.previewAmount}>₦{Number(payout.amount).toLocaleString('en-NG')}</Text></View>)}
        {!payouts.length ? <Empty text="No payouts need review." /> : null}
      </View>
      <View style={styles.panel}>
        <PanelHeader title="Vendor applications" action="Review applications" onPress={() => setPage('vendors')} />
        <Text style={styles.panelCopy}>Approving an application automatically links the vendor’s workspace.</Text>
        {applications.slice(0, 3).map((application) => <View style={styles.previewRow} key={application.id}><View><Text style={styles.previewTitle}>{application.store_name}</Text><Text style={styles.previewSub}>{application.store_type} - {application.contact_name}</Text></View><Text style={styles.previewDate}>{date(application.created_at).split(',')[0]}</Text></View>)}
        {!applications.length ? <Empty text="No vendor applications await review." /> : null}
      </View>
    </View>
  </>;
}

function journeyMessage(event: JourneyEvent) {
  const product = typeof event.properties?.product_name === 'string' ? event.properties.product_name : null;
  if (event.event_name === 'product_viewed') return product ? `Viewed ${product}` : 'Viewed a product';
  if (event.event_name === 'checkout_started') return 'Reached cart / checkout';
  if (event.event_name === 'payment_started') return 'Started payment';
  if (event.event_name === 'screen_viewed') return `Viewed ${event.route?.replace('/(buyer)/', '').replaceAll('/', ' › ') || 'a screen'}`;
  return event.event_name.replaceAll('_', ' ');
}

function journeyPageLabel(route: string | null) {
  if (!route || route === '/(buyer)' || route === '/(buyer)/') return 'Home';
  const label = route.replace('/(buyer)/', '').replace(/^\//, '').replaceAll('-', ' ').replaceAll('/', ' › ');
  return label ? label.replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Home';
}

function durationLabel(seconds: number) {
  if (!seconds) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function ActivityFeed({ feed, loading }: { feed: JourneyFeed | null; loading: boolean }) {
  const sessions = feed?.sessions ?? [];
  const summary = feed?.summary;
  return <>
    <View style={styles.heading}>
      <View>
        <Text style={styles.title}>Live customer activity</Text>
        <Text style={styles.subtitle}>Recent buyer and visitor journeys. This refreshes automatically while you are here.</Text>
      </View>
    </View>
    {summary ? <View style={styles.activitySummary}>
      <InsightMetric icon="people-outline" label="Unique visitors" value={String(summary.unique_visitors)} note="Tracked visitor sessions" colour="#68ECCB" />
      <InsightMetric icon="eye-outline" label="Most visited page" value={journeyPageLabel(summary.most_visited_page)} note={summary.most_visited_page_views ? `${summary.most_visited_page_views} page views` : 'No page views yet'} colour="#8FB5FF" />
      <InsightMetric icon="time-outline" label="Average session" value={durationLabel(summary.average_session_seconds)} note="From first to last tracked step" colour="#F3C76A" />
      <InsightMetric icon="receipt-outline" label="Paid orders" value={String(summary.paid_orders)} note="Successful customer orders" colour="#FFB6A6" />
    </View> : null}
    <View style={styles.activityNotice}><Ionicons name="eye-outline" size={20} color="#176E73" /><Text style={styles.activityNoticeText}>We track browsing steps, carts and checkout progress—not addresses, notes, payment details, or search text.</Text></View>
    {loading && !feed ? <ActivityIndicator color="#176E73" style={{ marginVertical: 28 }} /> : null}
    {!loading && !sessions.length ? <View style={styles.activityEmpty}><Ionicons name="pulse-outline" size={32} color="#8A98A8" /><Text style={styles.emptyText}>Activity will appear when customers begin using the buyer app.</Text></View> : null}
    <View style={styles.activityList}>{sessions.map((session) => {
      const active = Date.now() - new Date(session.last_event_at).getTime() < 2 * 60 * 1000;
      const latest = session.events[0];
      return <View key={session.session_id} style={styles.activityCard}>
        <View style={styles.activityTop}><View style={styles.activityIdentity}><View style={[styles.activityAvatar, active && styles.activityAvatarActive]}><Ionicons name={session.customer_name.startsWith('Visitor ') ? 'person-outline' : 'person'} size={17} color={active ? '#176E73' : '#647181'} /></View><View><Text style={styles.activityName}>{session.customer_name}</Text><Text style={styles.activityMeta}>{active ? 'Active now' : `Last seen ${date(session.last_event_at)}`}</Text></View></View><View style={[styles.activityState, active ? styles.activityStateActive : styles.activityStateIdle]}><View style={[styles.activityStateDot, active && styles.activityStateDotActive]} /><Text style={[styles.activityStateText, active && styles.activityStateTextActive]}>{active ? 'LIVE' : 'LEFT'}</Text></View></View>
        <View style={styles.activityLatest}><Text style={styles.activityLatestLabel}>LAST KNOWN STEP</Text><Text style={styles.activityLatestText}>{latest ? journeyMessage(latest) : (session.last_event_name ?? 'Opened the app')}</Text></View>
        <View style={styles.activityTrail}>{session.events.slice(0, 5).map((event) => <View key={`${event.created_at}-${event.event_name}`} style={styles.activityTrailRow}><View style={styles.activityTrailDot} /><Text style={styles.activityTrailText} numberOfLines={1}>{journeyMessage(event)}</Text><Text style={styles.activityTrailTime}>{new Date(event.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}</Text></View>)}</View>
      </View>;
    })}</View>
  </>;
}

type SupportTicket = {
  id: string; category: string; subject: string; message: string; status: 'open' | 'in_progress' | 'resolved'; admin_reply: string | null; created_at: string; updated_at: string;
  customer?: { full_name?: string | null; phone?: string | null; email?: string | null } | null;
};

function SupportInbox() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const loadTickets = useCallback(async () => {
    setLoading(true); setError('');
    const { data, error: invokeError } = await supabase.functions.invoke('support-tickets', { body: { action: 'list' } });
    if (invokeError || data?.error) setError(data?.error || 'Support tickets could not be loaded. Please refresh and try again.');
    else setTickets(Array.isArray(data?.tickets) ? data.tickets : []);
    setLoading(false);
  }, []);

  useEffect(() => { void loadTickets(); }, [loadTickets]);

  const updateTicket = async (ticket: SupportTicket, status: SupportTicket['status']) => {
    setWorkingId(ticket.id); setError('');
    const { data, error: invokeError } = await supabase.functions.invoke('support-tickets', { body: { action: 'update', ticket_id: ticket.id, status, admin_reply: drafts[ticket.id] ?? ticket.admin_reply ?? '' } });
    if (invokeError || data?.error) setError(data?.error || 'That ticket could not be updated. Please try again.');
    else { setDrafts((current) => ({ ...current, [ticket.id]: '' })); await loadTickets(); }
    setWorkingId(null);
  };

  const openCount = tickets.filter((ticket) => ticket.status !== 'resolved').length;
  return <>
    <View style={styles.heading}><View><Text style={styles.title}>Support inbox</Text><Text style={styles.subtitle}>Customer questions submitted from the buyer app. Reply here so the customer gets an in-app update.</Text></View><TouchableOpacity style={styles.refresh} onPress={() => void loadTickets()}><Ionicons name="refresh-outline" size={18} color="#F8F3ED" /><Text style={styles.refreshText}>Refresh</Text></TouchableOpacity></View>
    <View style={styles.activityNotice}><Ionicons name="chatbubbles-outline" size={20} color="#176E73" /><Text style={styles.activityNoticeText}>{openCount ? `${openCount} ticket${openCount === 1 ? '' : 's'} still need attention.` : 'All support tickets are currently resolved.'}</Text></View>
    {error ? <View style={styles.feedback}><Ionicons name="alert-circle-outline" size={19} color="#B44535" /><Text style={styles.feedbackText}>{error}</Text></View> : null}
    {loading ? <ActivityIndicator color="#176E73" style={{ marginVertical: 36 }} /> : null}
    {!loading && !tickets.length ? <View style={styles.activityEmpty}><Ionicons name="chatbubble-ellipses-outline" size={32} color="#8A98A8" /><Text style={styles.emptyText}>New customer questions will appear here.</Text></View> : null}
    <View style={{ gap: 14 }}>{tickets.map((ticket) => {
      const reply = drafts[ticket.id] ?? ticket.admin_reply ?? '';
      const customerName = ticket.customer?.full_name?.trim() || ticket.customer?.email || 'Customer';
      return <View key={ticket.id} style={[styles.panel, { gap: 12, borderLeftWidth: 4, borderLeftColor: ticket.status === 'resolved' ? '#68ECCB' : ticket.status === 'in_progress' ? '#F4A62A' : '#365B95' }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}><View style={{ flex: 1 }}><Text style={styles.previewTitle}>{ticket.subject}</Text><Text style={styles.previewSub}>{customerName}{ticket.customer?.phone ? ` · ${ticket.customer.phone}` : ''}</Text><Text style={[styles.previewSub, { marginTop: 4 }]}>{ticket.category.replace('_', ' ')} · {date(ticket.created_at)}</Text></View><View style={[styles.activityState, ticket.status === 'resolved' ? styles.activityStateActive : styles.activityStateIdle]}><Text style={[styles.activityStateText, ticket.status === 'resolved' && styles.activityStateTextActive]}>{ticket.status === 'in_progress' ? 'IN PROGRESS' : ticket.status.toUpperCase()}</Text></View></View>
        <Text style={styles.panelCopy}>{ticket.message}</Text>
        <TextInput value={reply} onChangeText={(value) => setDrafts((current) => ({ ...current, [ticket.id]: value }))} placeholder="Write a helpful reply for the customer…" placeholderTextColor="#8A98A8" multiline style={{ minHeight: 78, borderWidth: 1, borderColor: '#D9E2EA', borderRadius: 12, padding: 12, color: '#01193D', textAlignVertical: 'top' }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}><TouchableOpacity disabled={workingId === ticket.id} onPress={() => void updateTicket(ticket, 'in_progress')} style={{ minHeight: 38, borderRadius: 8, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF3DA' }}><Text style={{ color: '#805E15', fontSize: 12, fontWeight: '800' }}>In progress</Text></TouchableOpacity><TouchableOpacity disabled={workingId === ticket.id} onPress={() => void updateTicket(ticket, 'resolved')} style={{ minHeight: 38, borderRadius: 8, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DDF7EF' }}>{workingId === ticket.id ? <ActivityIndicator color="#176E73" /> : <Text style={{ color: '#176E73', fontSize: 12, fontWeight: '800' }}>{reply || ticket.admin_reply ? 'Send & resolve' : 'Resolve'}</Text>}</TouchableOpacity></View>
      </View>;
    })}</View>
  </>;
}
function InsightMetric({ icon, label, value, note, colour }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; note: string; colour: string }) {
  return <View style={styles.insightMetric}><View style={styles.insightTop}><View style={[styles.metricIcon, { backgroundColor: colour + '22' }]}><Ionicons name={icon} size={21} color={colour} /></View><Text style={styles.insightLabel}>{label}</Text></View><Text style={styles.insightValue}>{value}</Text><Text style={styles.insightNote}>{note}</Text></View>;
}
function Metric({ icon, label, value, colour }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number; colour: string }) { return <View style={styles.metric}><View style={[styles.metricIcon, { backgroundColor: `${colour}22` }]}><Ionicons name={icon} size={22} color={colour} /></View><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function HomePromotionEditor() {
  const [promo, setPromo] = useState<HomePromo>({ heading: "TODAY'S PICK", message: "Sholly's jollof is extra smoky today.", background_image_url: null, background_color: '#01193D', cta_label: 'ORDER NOW', cta_href: '/(buyer)/marketplace/category/meals' });
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [feedback, setFeedback] = useState('');
  useEffect(() => { const load = async () => { const { data } = await supabase.from('home_promotions').select('heading, message, background_image_url, background_color, cta_label, cta_href').eq('id', true).maybeSingle(); if (data) setPromo(data as HomePromo); setLoading(false); }; void load(); }, []);
  const update = (patch: Partial<HomePromo>) => setPromo((current) => ({ ...current, ...patch }));
  const save = async () => { setSaving(true); setFeedback(''); const { data, error } = await supabase.functions.invoke('admin-portal', { body: { action: 'update_home_promo', promotion: promo } }); setSaving(false); if (error || data?.error) { setFeedback(data?.error ?? error?.message ?? 'Could not update Today’s Pick.'); return; } if (data?.home_promo) setPromo(data.home_promo as HomePromo); setFeedback('Today’s Pick is live on the buyer home page.'); };
  if (loading) return <ActivityIndicator color="#176E73" style={{ marginVertical: 24 }} />;
  return <View style={{ marginTop: 16, paddingTop: 18, borderTopWidth: 1, borderTopColor: '#E5EBEF' }}><Text style={{ color: '#01193D', fontSize: 17, fontWeight: '800' }}>Today’s Pick</Text><Text style={{ color: '#7B8794', fontSize: 13, lineHeight: 18, marginTop: 5, marginBottom: 14 }}>Edit the buyer home-page message, image, colour and button destination.</Text><View style={{ flexDirection: 'row', gap: 12 }}><View style={{ flex: 1 }}><PromoField label="Heading" value={promo.heading} onChangeText={(heading) => update({ heading })} /></View><View style={{ width: 150 }}><PromoField label="Button label" value={promo.cta_label} onChangeText={(cta_label) => update({ cta_label })} /></View></View><PromoField label="Message" value={promo.message} onChangeText={(message) => update({ message })} multiline /><View style={{ flexDirection: 'row', gap: 12 }}><View style={{ flex: 1 }}><PromoField label="Background image URL" value={promo.background_image_url ?? ''} onChangeText={(background_image_url) => update({ background_image_url: background_image_url || null })} autoCapitalize="none" /></View><View style={{ width: 150 }}><PromoField label="Background colour" value={promo.background_color} onChangeText={(background_color) => update({ background_color })} autoCapitalize="none" /></View></View><PromoField label="Button destination" value={promo.cta_href} onChangeText={(cta_href) => update({ cta_href })} autoCapitalize="none" /><Text style={{ color: '#7B8794', fontSize: 12, marginTop: -5, marginBottom: 12 }}>Use an app path such as /(buyer)/marketplace/category/meals, or a full https:// link.</Text>{feedback ? <Text style={{ color: feedback.includes('live') ? '#176E73' : '#B34A4A', fontSize: 13, fontWeight: '700', marginBottom: 10 }}>{feedback}</Text> : null}<TouchableOpacity disabled={saving} onPress={() => void save()} style={{ alignSelf: 'flex-end', minHeight: 42, borderRadius: 8, backgroundColor: '#68ECCB', paddingHorizontal: 16, justifyContent: 'center' }}>{saving ? <ActivityIndicator color="#01193D" /> : <Text style={{ color: '#01193D', fontSize: 13, fontWeight: '800' }}>Save Today’s Pick</Text>}</TouchableOpacity></View>;
}
function PromoField({ label, multiline, onChangeText, ...props }: { label: string; multiline?: boolean; onChangeText: (value: string) => void; [key: string]: any }) { return <View style={{ marginBottom: 12 }}><Text style={{ color: '#526273', fontSize: 12, fontWeight: '800', marginBottom: 6 }}>{label}</Text><TextInput {...props} onChangeText={onChangeText} multiline={multiline} placeholderTextColor="#98A2AE" style={{ minHeight: multiline ? 74 : 42, borderWidth: 1, borderColor: '#CFD7E0', borderRadius: 8, paddingHorizontal: 11, paddingVertical: multiline ? 9 : 0, color: '#1F2937', fontSize: 14, textAlignVertical: multiline ? 'top' : 'center' }} /></View>; }
function PanelHeader({ title, action, onPress }: { title: string; action: string; onPress: () => void }) { return <><View style={styles.panelHead}><Text style={styles.panelTitle}>{title}</Text><TouchableOpacity onPress={onPress}><Text style={styles.panelAction}>{action}</Text></TouchableOpacity></View>{title === 'Top vendors by sales' ? <HomePromotionEditor /> : null}</>; }
function Empty({ text }: { text: string }) { return <View style={styles.empty}><Ionicons name="checkmark-circle-outline" size={28} color="#25B68A" /><Text style={styles.emptyText}>{text}</Text></View>; }
function Transfers({ transfers, workingId, onConfirm, onCancel }: { transfers: Transfer[]; workingId: string; onConfirm: (transfer: Transfer) => void; onCancel: (transfer: Transfer) => Promise<void> }) {
  return <><View style={styles.heading}><View><Text style={styles.title}>Transfer checks</Text><Text style={styles.subtitle}>Confirm a transfer only after matching the amount and reference in your bank account.</Text></View></View><View style={styles.safety}><Ionicons name="shield-checkmark-outline" size={22} color="#8A5A00" /><Text style={styles.safetyText}>Confirming a transfer releases the order to vendors and emails the relevant store(s).</Text></View><View style={styles.table}><View style={styles.tableHead}><Text style={[styles.column, { flex: 1.35 }]}>ORDER</Text><Text style={[styles.column, { flex: 1.3 }]}>CUSTOMER LOCATION</Text><Text style={styles.column}>AMOUNT</Text><Text style={styles.column}>SUBMITTED</Text><Text style={[styles.column, { flex: 1.55 }]}>ACTION</Text></View>{transfers.map((transfer) => { const phone = transfer.customer?.phone?.trim(); return <View style={styles.tableRow} key={transfer.id}><View style={{ flex: 1.35 }}><Text style={styles.rowTitle}>{transfer.order?.order_number ?? 'Pending order'}</Text><Text style={{ color: '#34465A', fontSize: 13, fontWeight: '700', marginTop: 5 }}>{transfer.customer?.full_name?.trim() || 'Customer name unavailable'}</Text>{phone ? <TouchableOpacity onPress={() => void Linking.openURL(`tel:${phone}`)}><Text style={{ color: '#176E73', fontSize: 12, fontWeight: '800', marginTop: 3, textDecorationLine: 'underline' }}>{phone}</Text></TouchableOpacity> : <Text style={styles.rowSub}>Phone not provided</Text>}<Text style={styles.rowSub}>{transfer.fulfilment === 'pickup' ? 'Customer pickup' : 'Room delivery'}</Text></View><Text style={[styles.rowText, { flex: 1.3 }]} numberOfLines={2}>{transfer.delivery_address || '—'}</Text><Text style={[styles.rowAmount, { flex: 1 }]}>{money(transfer.amount_kobo)}</Text><Text style={[styles.rowText, { flex: 1 }]}>{date(transfer.created_at)}</Text><View style={{ flex: 1.55, gap: 7 }}><TouchableOpacity disabled={workingId === transfer.id} onPress={() => onConfirm(transfer)} style={[styles.confirmButton, workingId === transfer.id && { opacity: 0.6 }]}>{workingId === transfer.id ? <ActivityIndicator size="small" color="#01193D" /> : <><Ionicons name="checkmark-circle-outline" size={18} color="#01193D" /><Text style={styles.confirmText}>Confirm</Text></>}</TouchableOpacity><TouchableOpacity disabled={workingId === transfer.id} onPress={() => void onCancel(transfer)} style={[{ height: 34, borderRadius: 8, borderWidth: 1, borderColor: '#E6B9B1', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, backgroundColor: '#FFF8F7' }, workingId === transfer.id && { opacity: 0.6 }]}><Text style={{ color: '#B34A4A', fontSize: 11, fontWeight: '800' }}>No payment received</Text></TouchableOpacity></View></View>; })}{!transfers.length ? <Empty text="No bank transfers are waiting for confirmation." /> : null}</View></>;
}
function Payouts({ payouts, workingId, onUpdate }: { payouts: Payout[]; workingId: string; onUpdate: (payout: Payout, status: 'processing' | 'paid' | 'rejected') => void }) { return <><View style={styles.heading}><View><Text style={styles.title}>Payout approvals</Text><Text style={styles.subtitle}>Move verified vendor settlement requests through payment securely.</Text></View></View><View style={styles.safety}><Ionicons name="shield-checkmark-outline" size={22} color="#176E73" /><Text style={[styles.safetyText, { color: '#176E73' }]}>Only mark a payout paid after the bank transfer is complete. The generated settlement reference will appear in the vendor portal.</Text></View><View style={styles.table}><View style={styles.tableHead}><Text style={[styles.column, { flex: 1.5 }]}>VENDOR</Text><Text style={[styles.column, { flex: 1 }]}>AMOUNT</Text><Text style={styles.column}>REQUESTED</Text><Text style={styles.column}>STATUS</Text><Text style={[styles.column, { flex: 1.7 }]}>ACTION</Text></View>{payouts.map((payout) => <View style={styles.tableRow} key={payout.id}><View style={{ flex: 1.5 }}><Text style={styles.rowTitle}>{payout.vendor?.name ?? 'Vendor'}</Text><Text style={styles.rowSub}>{payout.status === 'processing' ? 'Ready for bank confirmation' : 'Awaiting initial review'}</Text></View><Text style={[styles.rowAmount, { flex: 1 }]}>₦{Number(payout.amount).toLocaleString('en-NG')}</Text><Text style={[styles.rowText, { flex: 1 }]}>{date(payout.requested_at).split(',')[0]}</Text><Text style={[styles.payoutState, { flex: 1 }, payout.status === 'processing' && styles.payoutStateProcessing]}>{payout.status}</Text><View style={[styles.payoutActions, { flex: 1.7 }]}>{payout.status === 'requested' ? <><TouchableOpacity disabled={workingId === payout.id} onPress={() => void onUpdate(payout, 'rejected')} style={styles.payoutReject}><Text style={styles.payoutRejectText}>Reject</Text></TouchableOpacity><TouchableOpacity disabled={workingId === payout.id} onPress={() => void onUpdate(payout, 'processing')} style={styles.payoutProcess}><Text style={styles.payoutProcessText}>Start processing</Text></TouchableOpacity></> : <><TouchableOpacity disabled={workingId === payout.id} onPress={() => void onUpdate(payout, 'rejected')} style={styles.payoutReject}><Text style={styles.payoutRejectText}>Reject</Text></TouchableOpacity><TouchableOpacity disabled={workingId === payout.id} onPress={() => void onUpdate(payout, 'paid')} style={styles.confirmButton}>{workingId === payout.id ? <ActivityIndicator size="small" color="#01193D" /> : <><Ionicons name="checkmark-circle-outline" size={17} color="#01193D" /><Text style={styles.confirmText}>Mark paid</Text></>}</TouchableOpacity></>}</View></View>)}{!payouts.length ? <Empty text="No vendor payouts are waiting for review." /> : null}</View></>; }
function Applications({ applications, workingId, onReview }: { applications: Application[]; workingId: string; onReview: (application: Application, decision: 'approved' | 'rejected') => void }) { return <><View style={styles.heading}><View><Text style={styles.title}>Vendor applications</Text><Text style={styles.subtitle}>Approve trusted vendors to automatically create and link their desktop workspace.</Text></View></View><View style={styles.applicationGrid}>{applications.map((application) => <View style={styles.applicationCard} key={application.id}><View style={styles.applicationTop}><View style={styles.storeMark}><Ionicons name="storefront-outline" size={22} color="#176E73" /></View><View style={{ flex: 1 }}><Text style={styles.applicationName}>{application.store_name}</Text><Text style={styles.applicationType}>{application.store_type} · {application.category}</Text></View><Text style={styles.previewDate}>{date(application.created_at).split(',')[0]}</Text></View><View style={styles.applicationDetails}><Detail icon="person-outline" text={application.contact_name} /><Detail icon="call-outline" text={application.phone} /><Detail icon="pricetag-outline" text={application.category} /><Detail icon="business-outline" text={application.operating_location === 'on_campus' ? 'Operates on campus' : application.operating_location === 'off_campus' ? 'Operates off campus' : 'Operating location not classified'} /><Detail icon="location-outline" text={application.pickup_location || application.address || 'Location not provided'} /></View><View style={styles.applicationActions}><TouchableOpacity disabled={workingId === application.id} onPress={() => void onReview(application, 'rejected')} style={styles.rejectButton}><Text style={styles.rejectText}>Decline</Text></TouchableOpacity><TouchableOpacity disabled={workingId === application.id || !application.operating_location} onPress={() => void onReview(application, 'approved')} style={[styles.approveButton, (workingId === application.id || !application.operating_location) && { opacity: 0.45 }]}>{workingId === application.id ? <ActivityIndicator color="#01193D" /> : <><Ionicons name="checkmark-outline" size={18} color="#01193D" /><Text style={styles.approveText}>{application.operating_location ? 'Approve & link' : 'Classify first'}</Text></>}</TouchableOpacity></View></View>)}{!applications.length ? <View style={styles.fullEmpty}><Empty text="No vendor applications await review." /></View> : null}</View></>; }
function Detail({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) { return <View style={styles.detail}><Ionicons name={icon} size={16} color="#77828E" /><Text style={styles.detailText}>{text}</Text></View>; }

function Dispatch({ orders, riders: directory, workingId, onUpdate }: { orders: DispatchOrder[]; riders: Rider[]; workingId: string; onUpdate: (order: DispatchOrder, action: 'assign' | 'picked_up' | 'delivered', rider?: { name: string; phone: string }) => void }) {
  const [riders, setRiders] = useState<Record<string, { name: string; phone: string }>>({});
  return <><View style={styles.heading}><Text style={styles.title}>Dispatch desk</Text><Text style={styles.subtitle}>Choose an active rider, then keep the buyer’s tracking up to date.</Text></View><View style={styles.safety}><Ionicons name="people-outline" size={22} color="#176E73" /><Text style={[styles.safetyText, { color: '#176E73' }]}>Only paid, vendor-ready orders appear here. Buyer updates are sent when you assign, mark picked up, or deliver.</Text></View>{orders.map((order) => { const rider = riders[order.id] ?? { name: order.rider_name ?? '', phone: order.rider_phone ?? '' }; const setRider = (change: Partial<typeof rider>) => setRiders((current) => ({ ...current, [order.id]: { ...rider, ...change } })); return <View key={order.id} style={styles.dispatchCard}><View style={styles.dispatchTop}><View><Text style={styles.rowTitle}>#{order.order_number}</Text><Text style={styles.rowSub}>{order.delivery_type === 'pickup' ? 'Customer pickup' : `${order.delivery_address || 'Delivery location pending'}${order.delivery_slot ? ` · ${order.delivery_slot}` : ''}`}</Text></View><Text style={styles.dispatchStatus}>{order.dispatch_status ?? 'ready'}</Text></View>{order.delivery_type === 'pickup' ? <Text style={styles.dispatchNote}>Customer will collect this order directly from the vendor.</Text> : !order.rider_name ? <View style={styles.dispatchAssign}><Text style={styles.riderLabel}>Choose from active riders</Text>{directory.length ? <View style={styles.riderChoices}>{directory.map((savedRider) => <TouchableOpacity key={savedRider.id} onPress={() => setRider({ name: savedRider.full_name, phone: savedRider.phone })} style={[styles.riderChoice, rider.phone === savedRider.phone && styles.riderChoiceActive]}><Ionicons name="bicycle-outline" size={16} color="#176E73" /><Text style={styles.riderChoiceText}>{savedRider.full_name}</Text></TouchableOpacity>)}</View> : <Text style={styles.riderDirectoryEmpty}>No active riders are stored yet. Add one below.</Text>}<View style={styles.dispatchForm}><TextInput value={rider.name} onChangeText={(name) => setRider({ name })} style={styles.riderInput} placeholder="Rider name" placeholderTextColor="#8A96A4" /><TextInput value={rider.phone} onChangeText={(phone) => setRider({ phone })} style={styles.riderInput} placeholder="Rider phone" keyboardType="phone-pad" placeholderTextColor="#8A96A4" /><TouchableOpacity disabled={workingId === order.id} onPress={() => void onUpdate(order, 'assign', rider)} style={styles.confirmButton}>{workingId === order.id ? <ActivityIndicator size="small" color="#01193D" /> : <Text style={styles.confirmText}>Assign rider</Text>}</TouchableOpacity></View></View> : <View style={styles.dispatchForm}><View style={{ flex: 1 }}><Text style={styles.riderName}>{order.rider_name}</Text><Text style={styles.rowSub}>{order.rider_phone}</Text></View><TouchableOpacity onPress={() => void Linking.openURL(`tel:${order.rider_phone}`)} style={styles.contactButton}><Ionicons name="call-outline" size={18} color="#176E73" /></TouchableOpacity><TouchableOpacity onPress={() => void Linking.openURL(`https://wa.me/${String(order.rider_phone).replace(/\D/g, '')}`)} style={styles.contactButton}><Ionicons name="logo-whatsapp" size={18} color="#176E73" /></TouchableOpacity><TouchableOpacity disabled={workingId === order.id} onPress={() => void onUpdate(order, order.dispatch_status === 'assigned' ? 'picked_up' : 'delivered')} style={styles.confirmButton}>{workingId === order.id ? <ActivityIndicator size="small" color="#01193D" /> : <Text style={styles.confirmText}>{order.dispatch_status === 'assigned' ? 'Picked up' : 'Delivered'}</Text>}</TouchableOpacity></View>}</View>; })}{!orders.length ? <View style={styles.table}><Empty text="No paid orders are waiting for manual dispatch." /></View> : null}</>;
}

function Orders({ orders }: { orders: AdminOrder[] }) {
  return <><View style={styles.heading}><Text style={styles.title}>All orders</Text><Text style={styles.subtitle}>Every AOM order, with the stores responsible for fulfilling it and their follow-up details.</Text></View><View style={styles.safety}><Ionicons name="call-outline" size={22} color="#176E73" /><Text style={[styles.safetyText, { color: '#176E73' }]}>Use the vendor call and WhatsApp buttons when a store has not acknowledged an order in time.</Text></View><View style={styles.orderList}>{orders.map((order) => <View key={order.id} style={styles.orderCard}><View style={styles.orderTop}><View><Text style={styles.rowTitle}>#{order.order_number}</Text><Text style={styles.rowSub}>{date(order.created_at)} · {order.delivery_type === 'pickup' ? 'Customer pickup' : order.delivery_address || 'Delivery address pending'}</Text></View><View style={styles.orderStates}><Text style={styles.orderStatus}>{order.status.replaceAll('_', ' ')}</Text><Text style={styles.paymentStatus}>{order.payment_status}</Text></View></View><Text style={styles.orderItems} numberOfLines={2}>{order.item_summary}</Text><View style={styles.vendorDetails}>{order.vendors.map((vendor) => <View key={vendor.id} style={styles.vendorDetail}><View style={styles.vendorDetailIcon}><Ionicons name="storefront-outline" size={18} color="#176E73" /></View><View style={{ flex: 1 }}><Text style={styles.vendorDetailName}>{vendor.name}</Text><Text style={styles.vendorDetailText}>{vendor.contact ? `${vendor.contact.contact_name} · ${vendor.contact.phone}` : vendor.pickup_location || 'AOM-managed fulfilment'}</Text></View>{vendor.contact?.phone ? <><TouchableOpacity onPress={() => void Linking.openURL(`tel:${vendor.contact?.phone}`)} style={styles.contactButton}><Ionicons name="call-outline" size={18} color="#176E73" /></TouchableOpacity><TouchableOpacity onPress={() => void Linking.openURL(`https://wa.me/${String(vendor.contact?.phone).replace(/\D/g, '')}`)} style={styles.contactButton}><Ionicons name="logo-whatsapp" size={18} color="#176E73" /></TouchableOpacity></> : null}</View>)}</View><View style={styles.orderFoot}><Text style={styles.orderLocation}>{order.delivery_slot || 'No delivery slot selected'}</Text><Text style={styles.orderTotal}>₦{Number(order.total ?? order.amount_paid ?? 0).toLocaleString('en-NG')}</Text></View></View>)}{!orders.length ? <View style={styles.table}><Empty text="No orders have been created yet." /></View> : null}</View></>;
}

const styles = StyleSheet.create({
  mobileTopbar: { minHeight: 68, backgroundColor: '#01193D', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, mobileBrandName: { color: '#F8F3ED', fontSize: 16, fontWeight: '800' }, mobileBrandPortal: { color: '#9BB1CE', fontSize: 12, marginTop: 1 }, mobileRefresh: { width: 40, height: 40, borderWidth: 1, borderColor: '#2A4A79', borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, mobileAdminNav: { flexGrow: 0, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E1E7ED' }, mobileAdminNavContent: { paddingHorizontal: 10, gap: 7, alignItems: 'center' }, mobileAdminNavItem: { minHeight: 52, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 3, borderBottomColor: 'transparent' }, mobileAdminNavItemActive: { borderBottomColor: '#25B68A' }, mobileAdminNavText: { color: '#647181', fontSize: 12, fontWeight: '700' }, mobileAdminNavTextActive: { color: '#176E73' }, mobileAdminBadge: { minWidth: 17, height: 17, borderRadius: 9, backgroundColor: '#68ECCB', alignItems: 'center', justifyContent: 'center' }, mobileAdminBadgeText: { color: '#01193D', fontSize: 10, fontWeight: '800' }, mobileWorkspaceContent: { padding: 16, paddingBottom: 36 }, mobileConfirmPanel: { backgroundColor: '#FFF1D6', borderWidth: 1, borderColor: '#F3C76A', borderRadius: 12, padding: 15, marginBottom: 18 }, mobileConfirmActions: { flexDirection: 'row', gap: 8, marginTop: 13, justifyContent: 'flex-end' },
  insightGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 18 },
  insightMetric: { flex: 1, minWidth: 145, minHeight: 164, borderRadius: 14, backgroundColor: '#01193D', padding: 19, justifyContent: 'space-between' },
  insightTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  insightLabel: { color: '#E9F0F8', fontSize: 13, fontWeight: '800', flex: 1 },
  insightValue: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', marginTop: 14 },
  insightNote: { color: '#B7C7DA', fontSize: 12, lineHeight: 17, marginTop: 8 },
  topVendorPanel: { borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8EE', padding: 21, marginBottom: 24 },
  vendorRankGrid: { flexDirection: 'row', gap: 12, marginTop: 6 },
  vendorRank: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: '#E6EDF1', borderRadius: 11, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#FBFCFD' },
  rankNumber: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E1F5EE' },
  rankNumberText: { color: '#176E73', fontSize: 13, fontWeight: '800' },
  rankCopy: { flex: 1, minWidth: 0 },
  rankName: { color: '#01193D', fontSize: 13, fontWeight: '800' },
  rankMeta: { color: '#7B8794', fontSize: 11, marginTop: 3 },
  rankSales: { color: '#176E73', fontSize: 13, fontWeight: '800' },
  orderList: { gap: 14 }, orderCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E6EC', borderRadius: 13, padding: 18 }, orderTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }, orderStates: { flexDirection: 'row', gap: 7, alignItems: 'center' }, orderStatus: { color: '#176E73', backgroundColor: '#E1F5EE', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: '800', textTransform: 'capitalize' }, paymentStatus: { color: '#365B95', backgroundColor: '#E7ECF3', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: '800', textTransform: 'capitalize' }, orderItems: { color: '#445468', fontSize: 13, lineHeight: 19, marginTop: 14 }, vendorDetails: { marginTop: 14, gap: 8 }, vendorDetail: { borderTopWidth: 1, borderTopColor: '#EDF1F4', paddingTop: 11, flexDirection: 'row', alignItems: 'center', gap: 9 }, vendorDetailIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#E1F5EE', alignItems: 'center', justifyContent: 'center' }, vendorDetailName: { color: '#01193D', fontSize: 14, fontWeight: '800' }, vendorDetailText: { color: '#657283', fontSize: 12, marginTop: 3 }, orderFoot: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#EDF1F4', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, orderLocation: { color: '#657283', fontSize: 12, flex: 1 }, orderTotal: { color: '#176E73', fontSize: 16, fontWeight: '800' },
  dispatchCard: { borderWidth: 1, borderColor: '#E0E6EC', borderRadius: 13, backgroundColor: '#FFFFFF', padding: 18, marginBottom: 14 }, dispatchTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 16 }, dispatchStatus: { color: '#176E73', backgroundColor: '#E1F5EE', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, fontWeight: '800', textTransform: 'capitalize' }, dispatchAssign: { gap: 10 }, riderLabel: { color: '#657283', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 }, riderChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, riderChoice: { minHeight: 38, paddingHorizontal: 11, borderRadius: 8, borderWidth: 1, borderColor: '#BFD8D0', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF' }, riderChoiceActive: { backgroundColor: '#E1F5EE', borderColor: '#25B68A' }, riderChoiceText: { color: '#176E73', fontSize: 13, fontWeight: '800' }, riderDirectoryEmpty: { color: '#7B8794', fontSize: 13 }, dispatchForm: { flexDirection: 'row', alignItems: 'center', gap: 9 }, riderInput: { flex: 1, height: 42, borderWidth: 1, borderColor: '#D6DEE6', borderRadius: 8, paddingHorizontal: 11, color: '#01193D', fontSize: 13 }, riderName: { color: '#01193D', fontSize: 14, fontWeight: '800' }, contactButton: { width: 40, height: 40, borderWidth: 1, borderColor: '#BFD8D0', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, dispatchNote: { color: '#657283', fontSize: 13, lineHeight: 19 },
  activityNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EAF6F2', borderRadius: 11, padding: 15, marginBottom: 20 },
  activitySummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 20 },
  activityNoticeText: { color: '#176E73', fontSize: 13, lineHeight: 19, fontWeight: '600', flex: 1 },
  activityEmpty: { minHeight: 150, justifyContent: 'center', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#E0E6EC', borderRadius: 14, backgroundColor: '#FFFFFF', padding: 24 },
  activityList: { gap: 14 },
  activityCard: { borderWidth: 1, borderColor: '#E0E6EC', borderRadius: 14, backgroundColor: '#FFFFFF', padding: 18 },
  activityTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  activityIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  activityAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EEF2F5', alignItems: 'center', justifyContent: 'center' },
  activityAvatarActive: { backgroundColor: '#E1F5EE' },
  activityName: { color: '#01193D', fontSize: 15, fontWeight: '800' },
  activityMeta: { color: '#77828E', fontSize: 12, marginTop: 3 },
  activityState: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, backgroundColor: '#F0F3F5', paddingHorizontal: 8, paddingVertical: 5 },
  activityStateIdle: { backgroundColor: '#F0F3F5' },
  activityStateActive: { backgroundColor: '#E1F5EE' },
  activityStateDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#8A98A8' },
  activityStateDotActive: { backgroundColor: '#25B68A' },
  activityStateText: { color: '#647181', fontSize: 10, fontWeight: '800' },
  activityStateTextActive: { color: '#176E73' },
  activityLatest: { marginTop: 16, backgroundColor: '#F7F9FB', borderRadius: 9, paddingHorizontal: 13, paddingVertical: 11 },
  activityLatestLabel: { color: '#7B8794', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  activityLatestText: { color: '#223047', fontSize: 14, fontWeight: '700', marginTop: 3 },
  activityTrail: { marginTop: 12, gap: 8 },
  activityTrailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activityTrailDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#BFD8D0' },
  activityTrailText: { color: '#647181', fontSize: 12, flex: 1 },
  activityTrailTime: { color: '#8A98A8', fontSize: 11 },
  payoutState: { alignSelf: 'center', color: '#8A6415', fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
  payoutStateProcessing: { color: '#176E73' },
  payoutActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  payoutProcess: { height: 39, borderRadius: 8, backgroundColor: '#01193D', paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  payoutProcessText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  payoutReject: { height: 39, borderRadius: 8, borderWidth: 1, borderColor: '#D7DEE5', paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  payoutRejectText: { color: '#7A5560', fontSize: 12, fontWeight: '800' },
  screen: { flex: 1, backgroundColor: '#F7F9FB' }, loading: { flex: 1, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }, loadingText: { color: '#C9D4E3', fontSize: 16 }, mobile: { flex: 1, backgroundColor: '#01193D', alignItems: 'center', justifyContent: 'center', padding: 42 }, mobileTitle: { color: '#F8F3ED', fontSize: 25, fontWeight: '800', textAlign: 'center', marginTop: 18 }, mobileText: { color: '#B3C0D2', fontSize: 16, lineHeight: 24, textAlign: 'center', marginTop: 10, maxWidth: 410 }, backButton: { marginTop: 25, borderRadius: 9, backgroundColor: '#68ECCB', paddingHorizontal: 20, paddingVertical: 14 }, backButtonText: { color: '#01193D', fontWeight: '800' }, topbar: { height: 92, backgroundColor: '#01193D', paddingHorizontal: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brand: { flexDirection: 'row', alignItems: 'center', gap: 12 }, brandIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#123263', alignItems: 'center', justifyContent: 'center' }, brandName: { color: '#F8F3ED', fontSize: 21, fontWeight: '800' }, brandPortal: { color: '#9BB1CE', fontSize: 16, fontWeight: '600' }, refresh: { height: 44, borderWidth: 1, borderColor: '#2A4A79', borderRadius: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }, refreshText: { color: '#F8F3ED', fontSize: 14, fontWeight: '800' }, body: { flex: 1, flexDirection: 'row' }, sidebar: { width: 268, backgroundColor: '#FFFFFF', borderRightWidth: 1, borderRightColor: '#E1E7ED', paddingTop: 28 }, menu: { color: '#7B8794', fontSize: 12, fontWeight: '800', letterSpacing: 0.5, paddingHorizontal: 26, marginBottom: 13 }, nav: { minHeight: 57, paddingHorizontal: 26, flexDirection: 'row', gap: 14, alignItems: 'center', borderLeftWidth: 4, borderLeftColor: 'transparent' }, navActive: { backgroundColor: '#E1F5EE', borderLeftColor: '#25B68A' }, navText: { color: '#667382', fontSize: 16, fontWeight: '700', flex: 1 }, navTextActive: { color: '#176E73' }, badge: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#68ECCB' }, badgeText: { color: '#01193D', fontSize: 12, fontWeight: '800' }, sidebarFoot: { margin: 24, marginTop: 'auto', backgroundColor: '#EAF6F2', borderRadius: 10, padding: 13, flexDirection: 'row', gap: 8, alignItems: 'flex-start' }, sidebarFootText: { flex: 1, color: '#176E73', fontSize: 12, lineHeight: 17, fontWeight: '600' }, workspace: { flex: 1 }, workspaceContent: { padding: 38, paddingBottom: 60 }, feedback: { backgroundColor: '#E1F5EE', borderWidth: 1, borderColor: '#81DABF', borderRadius: 10, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 22 }, feedbackText: { flex: 1, color: '#176E73', fontSize: 14, fontWeight: '700' }, confirmPanel: { backgroundColor: '#FFF1D6', borderWidth: 1, borderColor: '#F3C76A', borderRadius: 12, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22 }, confirmIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFE1A3', alignItems: 'center', justifyContent: 'center' }, confirmCopy: { flex: 1 }, confirmTitle: { color: '#805E15', fontSize: 15, fontWeight: '800' }, confirmTextBody: { color: '#805E15', fontSize: 13, lineHeight: 18, marginTop: 3 }, cancelConfirm: { height: 39, paddingHorizontal: 13, borderWidth: 1, borderColor: '#C9A75C', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, cancelConfirmText: { color: '#805E15', fontSize: 13, fontWeight: '800' }, finalConfirmButton: { height: 39, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#68ECCB', alignItems: 'center', justifyContent: 'center' }, finalConfirmText: { color: '#01193D', fontSize: 13, fontWeight: '800' }, heading: { marginBottom: 26 }, title: { color: '#111827', fontSize: 31, fontWeight: '800' }, subtitle: { color: '#748191', fontSize: 16, marginTop: 7 }, metricRow: { flexDirection: 'row', gap: 16, marginBottom: 24 }, metric: { flex: 1, minHeight: 150, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8EE', backgroundColor: '#FFFFFF', padding: 20, justifyContent: 'space-between' }, metricIcon: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, metricValue: { color: '#01193D', fontSize: 35, fontWeight: '800', marginTop: 14 }, metricLabel: { color: '#657283', fontSize: 14, fontWeight: '700' }, overviewGrid: { flexDirection: 'row', gap: 18 }, panel: { flex: 1, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8EE', padding: 21 }, panelHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }, panelTitle: { color: '#01193D', fontSize: 18, fontWeight: '800' }, panelAction: { color: '#176E73', fontSize: 13, fontWeight: '800' }, panelCopy: { color: '#7B8794', fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: 11 }, previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: '#EDF1F4', paddingVertical: 14 }, previewTitle: { color: '#223047', fontSize: 14, fontWeight: '800' }, previewSub: { color: '#7B8794', fontSize: 12, marginTop: 3 }, previewAmount: { color: '#176E73', fontSize: 15, fontWeight: '800' }, previewDate: { color: '#7B8794', fontSize: 12, fontWeight: '600' }, empty: { paddingVertical: 30, alignItems: 'center', gap: 8 }, emptyText: { color: '#77828E', fontSize: 14, textAlign: 'center' }, safety: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 15, borderRadius: 11, backgroundColor: '#FFF1D6', borderWidth: 1, borderColor: '#F3C76A', marginBottom: 20 }, safetyText: { flex: 1, color: '#805E15', fontSize: 14, fontWeight: '700', lineHeight: 20 }, table: { borderWidth: 1, borderColor: '#E0E6EC', borderRadius: 13, backgroundColor: '#FFFFFF', overflow: 'hidden' }, tableHead: { minHeight: 55, backgroundColor: '#F4F7F9', paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 15 }, column: { flex: 1, color: '#7B8794', fontSize: 12, fontWeight: '800' }, tableRow: { paddingHorizontal: 18, paddingVertical: 15, minHeight: 76, borderTopWidth: 1, borderTopColor: '#E9EDF1', flexDirection: 'row', alignItems: 'center', gap: 15 }, rowTitle: { color: '#01193D', fontSize: 14, fontWeight: '800' }, rowSub: { color: '#7B8794', fontSize: 12, marginTop: 4 }, rowText: { color: '#556372', fontSize: 13, lineHeight: 18 }, rowAmount: { color: '#176E73', fontSize: 14, fontWeight: '800' }, confirmButton: { height: 39, borderRadius: 8, backgroundColor: '#68ECCB', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 10 }, confirmText: { color: '#01193D', fontSize: 13, fontWeight: '800' }, applicationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 17 }, applicationCard: { width: '48.5%', minHeight: 250, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E0E6EC', padding: 20, justifyContent: 'space-between' }, applicationTop: { flexDirection: 'row', alignItems: 'center', gap: 11 }, storeMark: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#E1F5EE', alignItems: 'center', justifyContent: 'center' }, applicationName: { color: '#01193D', fontSize: 17, fontWeight: '800' }, applicationType: { color: '#176E73', fontSize: 13, textTransform: 'capitalize', marginTop: 2, fontWeight: '700' }, applicationDetails: { gap: 9, marginVertical: 20 }, detail: { flexDirection: 'row', alignItems: 'center', gap: 8 }, detailText: { flex: 1, color: '#657283', fontSize: 13 }, applicationActions: { flexDirection: 'row', gap: 10 }, rejectButton: { flex: 0.75, height: 43, borderRadius: 8, borderWidth: 1, borderColor: '#D7DEE5', alignItems: 'center', justifyContent: 'center' }, rejectText: { color: '#677484', fontSize: 13, fontWeight: '800' }, approveButton: { flex: 1.45, height: 43, borderRadius: 8, backgroundColor: '#68ECCB', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }, approveText: { color: '#01193D', fontSize: 13, fontWeight: '800' }, fullEmpty: { width: '100%', borderWidth: 1, borderColor: '#E0E6EC', backgroundColor: '#FFFFFF', borderRadius: 14 },
});

// These overrides keep operational information readable on narrow portrait screens.
Object.assign(styles, {
  metricRow: { ...styles.metricRow, flexWrap: 'wrap' },
  metric: { ...styles.metric, minWidth: 145 },
  overviewGrid: { ...styles.overviewGrid, flexWrap: 'wrap' },
  panel: { ...styles.panel, minWidth: 270 },
  applicationCard: { ...styles.applicationCard, minWidth: 270 },
  dispatchForm: { ...styles.dispatchForm, flexWrap: 'wrap' },
  riderInput: { ...styles.riderInput, minWidth: 132 },
});
