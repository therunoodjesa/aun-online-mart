import { admin, corsHeaders, getUser, json } from '../_shared/paystack.ts';

type AdminRequest =
  | { action: 'dashboard' }
  | { action: 'confirm_transfer'; intent_id: string }
  | { action: 'review_vendor'; application_id: string; decision: 'approved' | 'rejected'; reviewer_note?: string }
  | { action: 'update_payout'; payout_id: string; status: 'processing' | 'paid' | 'rejected'; note?: string }
  | { action: 'assign_dispatch'; order_id: string; rider_name: string; rider_phone: string }
  | { action: 'update_dispatch'; order_id: string; status: 'picked_up' | 'delivered' };

async function requireAdmin(request: Request) {
  const user = await getUser(request);
  if (!user) throw new Error('Please sign in to use the admin portal.');
  const db = admin();
  const { data: administrator } = await db.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!administrator) throw new Error('This account does not have administrator access.');
  return { user, db };
}

async function dashboard(db: ReturnType<typeof admin>) {
  const [{ count: pendingTransferCount }, { count: pendingVendorCount }, { count: paidOrderCount }, { count: pendingPayoutCount }, { count: dispatchCount }, { data: intents, error: intentError }, { data: applications, error: applicationError }, { data: payoutRows, error: payoutError }, { data: dispatchRows, error: dispatchError }, { data: riderRows, error: riderError }, { data: allOrders, error: allOrdersError }, { data: salesOrders, error: salesOrdersError }, { count: vendorCount, error: vendorCountError }] = await Promise.all([
    db.from('payment_intents').select('*', { count: 'exact', head: true }).eq('payment_channel', 'bank_transfer').eq('status', 'pending'),
    db.from('vendor_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    db.from('orders').select('*', { count: 'exact', head: true }).eq('payment_status', 'paid'),
    db.from('vendor_payout_requests').select('*', { count: 'exact', head: true }).in('status', ['requested', 'processing']),
    db.from('orders').select('*', { count: 'exact', head: true }).eq('payment_status', 'paid').in('status', ['ready', 'out_for_delivery']),
    db.from('payment_intents').select('id, reference, amount_kobo, order_id, delivery_address, fulfilment, created_at').eq('payment_channel', 'bank_transfer').eq('status', 'pending').order('created_at', { ascending: false }).limit(25),
    db.from('vendor_applications').select('id, store_name, contact_name, phone, store_type, address, pickup_location, created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(25),
    db.from('vendor_payout_requests').select('id, vendor_id, amount, status, requested_at, processed_at, reference, note').in('status', ['requested', 'processing']).order('requested_at', { ascending: true }).limit(50),
    db.from('orders').select('id, order_number, status, delivery_type, delivery_address, delivery_slot, rider_name, rider_phone, rider_assigned_at, dispatch_status, created_at').eq('payment_status', 'paid').in('status', ['ready', 'out_for_delivery']).order('created_at', { ascending: true }).limit(50),
    db.from('delivery_riders').select('id, full_name, phone, accepts_calls, accepts_whatsapp, coverage_area, availability').eq('availability', 'active').order('full_name'),
    db.from('orders').select('id, order_number, status, payment_status, delivery_type, delivery_address, delivery_slot, total, amount_paid, created_at').order('created_at', { ascending: false }).limit(100),
    db.from('orders').select('id, total, created_at').eq('payment_status', 'paid').order('created_at', { ascending: false }).limit(1000),
    db.from('vendors').select('id', { count: 'exact', head: true }),
  ]);
  if (intentError) throw new Error(intentError.message);
  if (applicationError) throw new Error(applicationError.message);
  if (payoutError) throw new Error(payoutError.message);
  if (dispatchError) throw new Error(dispatchError.message);
  if (riderError) throw new Error(riderError.message);
  if (allOrdersError) throw new Error(allOrdersError.message);
  if (salesOrdersError) throw new Error(salesOrdersError.message);
  if (vendorCountError) throw new Error(vendorCountError.message);

  const orderIds = (intents ?? []).map((intent) => intent.order_id).filter(Boolean);
  const { data: orders, error: ordersError } = orderIds.length
    ? await db.from('orders').select('id, order_number, amount_paid, delivery_slot').in('id', orderIds)
    : { data: [], error: null };
  if (ordersError) throw new Error(ordersError.message);
  const orderById = new Map((orders ?? []).map((order) => [order.id, order]));
  const vendorIds = [...new Set((payoutRows ?? []).map((payout) => payout.vendor_id))];
  const { data: vendors, error: vendorsError } = vendorIds.length ? await db.from('vendors').select('id, name').in('id', vendorIds) : { data: [], error: null };
  if (vendorsError) throw new Error(vendorsError.message);
  const vendorById = new Map((vendors ?? []).map((vendor) => [vendor.id, vendor]));

  const allOrderIds = (allOrders ?? []).map((order) => order.id);
  const { data: orderItems, error: itemsError } = allOrderIds.length
    ? await db.from('order_items').select('order_id, product_id, product_name, quantity').in('order_id', allOrderIds)
    : { data: [], error: null };
  if (itemsError) throw new Error(itemsError.message);
  const productIds = [...new Set((orderItems ?? []).map((item) => item.product_id).filter(Boolean))];
  const { data: orderProducts, error: productsError } = productIds.length
    ? await db.from('products').select('id, vendor_id').in('id', productIds)
    : { data: [], error: null };
  if (productsError) throw new Error(productsError.message);
  const productVendorById = new Map((orderProducts ?? []).map((product) => [product.id, product.vendor_id]));
  const allVendorIds = [...new Set((orderProducts ?? []).map((product) => product.vendor_id).filter(Boolean))];
  const { data: orderVendors, error: orderVendorsError } = allVendorIds.length
    ? await db.from('vendors').select('id, name, owner_id, pickup_location').in('id', allVendorIds)
    : { data: [], error: null };
  if (orderVendorsError) throw new Error(orderVendorsError.message);
  const ownerIds = [...new Set((orderVendors ?? []).map((vendor) => vendor.owner_id).filter(Boolean))];
  const { data: vendorContacts, error: contactsError } = ownerIds.length
    ? await db.from('vendor_applications').select('user_id, contact_name, phone').in('user_id', ownerIds)
    : { data: [], error: null };
  if (contactsError) throw new Error(contactsError.message);
  const contactByOwnerId = new Map((vendorContacts ?? []).map((contact) => [contact.user_id, contact]));
  const fullVendorById = new Map((orderVendors ?? []).map((vendor) => [vendor.id, { ...vendor, contact: vendor.owner_id ? contactByOwnerId.get(vendor.owner_id) ?? null : null }]));
  const itemsByOrderId = new Map<string, typeof orderItems>();
  for (const item of orderItems ?? []) itemsByOrderId.set(item.order_id, [...(itemsByOrderId.get(item.order_id) ?? []), item]);
  const adminOrders = (allOrders ?? []).map((order) => {
    const items = itemsByOrderId.get(order.id) ?? [];
    const vendorIdsForOrder = [...new Set(items.map((item) => productVendorById.get(item.product_id)).filter(Boolean))] as string[];
    return {
      ...order,
      item_summary: items.map((item) => `${item.quantity}× ${item.product_name}`).join(', ') || 'Order items unavailable',
      vendors: vendorIdsForOrder.length
        ? vendorIdsForOrder.map((vendorId) => fullVendorById.get(vendorId)).filter(Boolean)
        : [{ id: 'cafeteria', name: 'AUN Cafeteria', pickup_location: 'University cafeteria', contact: null }],
    };
  });

  const salesOrderIds = (salesOrders ?? []).map((order) => order.id);
  const { data: salesItems, error: salesItemsError } = salesOrderIds.length
    ? await db.from('order_items').select('order_id, product_id, quantity, unit_price, total_price').in('order_id', salesOrderIds)
    : { data: [], error: null };
  if (salesItemsError) throw new Error(salesItemsError.message);
  const salesProductIds = [...new Set((salesItems ?? []).map((item) => item.product_id).filter(Boolean))];
  const { data: salesProducts, error: salesProductsError } = salesProductIds.length
    ? await db.from('products').select('id, vendor_id').in('id', salesProductIds)
    : { data: [], error: null };
  if (salesProductsError) throw new Error(salesProductsError.message);
  const salesProductVendorById = new Map((salesProducts ?? []).map((product) => [product.id, product.vendor_id]));
  const salesVendorIds = [...new Set((salesProducts ?? []).map((product) => product.vendor_id).filter(Boolean))];
  const { data: salesVendors, error: salesVendorsError } = salesVendorIds.length
    ? await db.from('vendors').select('id, name').in('id', salesVendorIds)
    : { data: [], error: null };
  if (salesVendorsError) throw new Error(salesVendorsError.message);
  const salesVendorNameById = new Map((salesVendors ?? []).map((vendor) => [vendor.id, vendor.name]));
  const vendorSales = new Map<string, { sales: number; orderIds: Set<string> }>();
  for (const item of salesItems ?? []) {
    const vendorId = salesProductVendorById.get(item.product_id);
    if (!vendorId) continue;
    const value = Number(item.total_price ?? Number(item.unit_price ?? 0) * Number(item.quantity ?? 1));
    const current = vendorSales.get(vendorId) ?? { sales: 0, orderIds: new Set<string>() };
    current.sales += value;
    current.orderIds.add(item.order_id);
    vendorSales.set(vendorId, current);
  }
  const grossSales = (salesOrders ?? []).reduce((sum, order) => sum + Number(order.total ?? 0), 0);
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const salesLast30Days = (salesOrders ?? []).filter((order) => new Date(order.created_at).getTime() >= thirtyDaysAgo).reduce((sum, order) => sum + Number(order.total ?? 0), 0);
  const topVendors = [...vendorSales.entries()]
    .map(([vendorId, value]) => ({ id: vendorId, name: salesVendorNameById.get(vendorId) ?? 'Vendor', sales: value.sales, orders: value.orderIds.size }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5);

  return {
    metrics: { pending_transfers: pendingTransferCount ?? 0, pending_vendor_applications: pendingVendorCount ?? 0, paid_orders: paidOrderCount ?? 0, pending_payouts: pendingPayoutCount ?? 0, dispatch_queue: dispatchCount ?? 0, gross_sales: grossSales, sales_last_30_days: salesLast30Days, average_order_value: (salesOrders ?? []).length ? Math.round(grossSales / (salesOrders ?? []).length) : 0, partner_vendors: vendorCount ?? 0, top_vendors: topVendors },
    pending_transfers: (intents ?? []).map((intent) => ({ ...intent, order: intent.order_id ? orderById.get(intent.order_id) ?? null : null })),
    pending_vendor_applications: applications ?? [],
    pending_payouts: (payoutRows ?? []).map((payout) => ({ ...payout, vendor: vendorById.get(payout.vendor_id) ?? null })),
    dispatch_queue: dispatchRows ?? [],
    delivery_riders: riderRows ?? [],
    orders: adminOrders,
  };
}

async function notifyDispatch(db: ReturnType<typeof admin>, order: { id: string; user_id: string | null; order_number: string }, title: string, body: string) {
  await db.from('order_updates').insert({ order_id: order.id, message: body, update_type: 'system' });
  if (!order.user_id) return;
  await db.from('notifications').insert({ user_id: order.user_id, title, body, message: body, kind: 'delivery', action_label: 'TRACK ORDER', action_href: `/(buyer)/order/${order.id}` });
}

async function assignDispatch(db: ReturnType<typeof admin>, orderId: string, riderName: string, riderPhone: string) {
  if (!riderName.trim() || !riderPhone.trim()) throw new Error('Add the rider’s name and phone number.');
  const { data: order, error } = await db.from('orders').select('id, order_number, user_id, status').eq('id', orderId).eq('payment_status', 'paid').maybeSingle();
  if (error || !order) throw new Error(error?.message ?? 'Order not found.');
  if (!['ready', 'out_for_delivery'].includes(order.status)) throw new Error('Only a vendor-ready order can be assigned to a rider.');
  const { error: updateError } = await db.from('orders').update({ rider_name: riderName.trim(), rider_phone: riderPhone.trim(), rider_assigned_at: new Date().toISOString(), dispatch_status: 'assigned' }).eq('id', order.id);
  if (updateError) throw new Error(updateError.message);
  await notifyDispatch(db, order, 'A rider has been assigned', `AOM has assigned ${riderName.trim()} to order #${order.order_number}. They will contact you if needed.`);
  return { status: 'assigned' };
}

async function updateDispatch(db: ReturnType<typeof admin>, orderId: string, status: 'picked_up' | 'delivered') {
  const { data: order, error } = await db.from('orders').select('id, order_number, user_id, rider_name, status').eq('id', orderId).eq('payment_status', 'paid').maybeSingle();
  if (error || !order) throw new Error(error?.message ?? 'Order not found.');
  if (!order.rider_name) throw new Error('Assign a rider before updating delivery.');
  const values = status === 'picked_up' ? { status: 'out_for_delivery', dispatch_status: 'picked_up' } : { status: 'delivered', dispatch_status: 'delivered' };
  const { error: updateError } = await db.from('orders').update(values).eq('id', order.id);
  if (updateError) throw new Error(updateError.message);
  const body = status === 'picked_up' ? `${order.rider_name} has picked up order #${order.order_number} and is on the way.` : `Order #${order.order_number} has been delivered. Enjoy!`;
  await notifyDispatch(db, order, status === 'picked_up' ? 'Your order is on the way' : 'Order delivered', body);
  return { status };
}

async function updatePayout(db: ReturnType<typeof admin>, payoutId: string, status: 'processing' | 'paid' | 'rejected', note?: string) {
  const { data: payout, error: payoutError } = await db.from('vendor_payout_requests').select('id, status').eq('id', payoutId).maybeSingle();
  if (payoutError || !payout) throw new Error(payoutError?.message ?? 'Payout request not found.');
  const allowed = payout.status === 'requested' ? ['processing', 'rejected'] : payout.status === 'processing' ? ['paid', 'rejected'] : [];
  if (!allowed.includes(status)) throw new Error('That payout status change is not allowed.');
  const values: Record<string, unknown> = { status, note: note?.trim() || null };
  if (status === 'paid') {
    values.processed_at = new Date().toISOString();
    values.reference = `AOM-PAYOUT-${payout.id.slice(0, 8).toUpperCase()}`;
  }
  const { error } = await db.from('vendor_payout_requests').update(values).eq('id', payout.id);
  if (error) throw new Error(error.message);
  return { status, reference: values.reference ?? null };
}

type StoredCartLine = { product_id: string; product_name: string; unit_price: number; quantity: number; selected_options?: unknown[]; note?: string | null };
type StoredCart = { lines?: StoredCartLine[]; subtotal?: number; total?: number };

async function ensureOrderItems(db: ReturnType<typeof admin>, orderId: string, lines: StoredCartLine[]) {
  const { count, error: countError } = await db.from('order_items').select('id', { count: 'exact', head: true }).eq('order_id', orderId);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) return;
  const { error: itemError } = await db.from('order_items').insert(lines.map((line) => ({
    order_id: orderId,
    product_id: line.product_id,
    product_name: line.product_name,
    unit_price: line.unit_price,
    quantity: line.quantity,
    total_price: Number(line.unit_price) * Number(line.quantity),
    options: line.selected_options ?? [],
    notes: line.note ?? null,
  })));
  if (itemError) throw new Error(itemError.message);
}

async function restoreLinkedOrder(db: ReturnType<typeof admin>, intent: { id: string; reference: string; order_id: string | null; user_id: string; fulfilment: string; delivery_address: string | null; delivery_slot: string | null; cart: StoredCart }) {
  const lines = intent.cart?.lines ?? [];
  if (!lines.length) throw new Error('This transfer has no saved order items and cannot be confirmed safely.');
  if (intent.order_id) {
    await ensureOrderItems(db, intent.order_id, lines);
    return intent.order_id;
  }
  const { data: existingOrder, error: existingOrderError } = await db.from('orders').select('id').eq('payment_reference', intent.reference).maybeSingle();
  if (existingOrderError) throw new Error(existingOrderError.message);
  if (existingOrder?.id) {
    await ensureOrderItems(db, existingOrder.id, lines);
    await db.from('payment_intents').update({ order_id: existingOrder.id, updated_at: new Date().toISOString() }).eq('id', intent.id);
    return existingOrder.id;
  }
  const subtotal = Number(intent.cart?.subtotal ?? lines.reduce((total, line) => total + Number(line.unit_price) * Number(line.quantity), 0));
  const total = Number(intent.cart?.total ?? subtotal);
  const { data: order, error: orderError } = await db.from('orders').insert({
    order_number: `AOM-${String(Date.now()).slice(-7)}`,
    user_id: intent.user_id,
    status: 'pending',
    delivery_type: intent.fulfilment,
    payment_status: 'pending',
    payment_reference: intent.reference,
    amount_paid: 0,
    subtotal,
    total,
    delivery_address: intent.delivery_address,
    delivery_slot: intent.delivery_slot,
  }).select('id').single();
  if (orderError || !order) throw new Error(orderError?.message ?? 'Could not restore this pending order.');
  await ensureOrderItems(db, order.id, lines);
  await db.from('order_updates').insert({ order_id: order.id, message: 'Bank transfer submitted and awaiting payment confirmation', update_type: 'system' });
  const { error: linkError } = await db.from('payment_intents').update({ order_id: order.id, updated_at: new Date().toISOString() }).eq('id', intent.id);
  if (linkError) throw new Error(linkError.message);
  return order.id;
}

async function confirmTransfer(db: ReturnType<typeof admin>, intentId: string) {
  const { data: intent, error: intentError } = await db.from('payment_intents')
    .select('id, reference, order_id, amount_kobo, status, payment_channel, user_id, fulfilment, delivery_address, delivery_slot, cart')
    .eq('id', intentId)
    .maybeSingle();
  if (intentError || !intent) throw new Error(intentError?.message ?? 'Transfer record not found.');
  if (intent.payment_channel !== 'bank_transfer') throw new Error('This payment is not a bank transfer.');
  intent.order_id = await restoreLinkedOrder(db, intent as typeof intent & { user_id: string; fulfilment: string; delivery_address: string | null; delivery_slot: string | null; cart: StoredCart });
  if (intent.status === 'paid') return { order_id: intent.order_id, already_confirmed: true };
  if (intent.status !== 'pending') throw new Error(`This transfer cannot be confirmed while it is ${intent.status}.`);

  const { error: orderError } = await db.from('orders').update({ payment_status: 'paid', amount_paid: Number(intent.amount_kobo) / 100 }).eq('id', intent.order_id);
  if (orderError) throw new Error(orderError.message);
  const { error: paymentError } = await db.from('payment_intents').update({ status: 'paid', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', intent.id).eq('status', 'pending');
  if (paymentError) throw new Error(paymentError.message);
  await db.from('order_updates').insert({ order_id: intent.order_id, message: 'Bank transfer confirmed — your order is now being processed', update_type: 'system' });

  // Best effort: confirmation must succeed even if an email provider is temporarily unavailable.
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/vendor-order-alert`, {
      method: 'POST',
      headers: { 'X-Internal-Secret': Deno.env.get('VENDOR_ALERT_INTERNAL_SECRET') ?? '', 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: intent.order_id }),
    });
  } catch (error) { console.error('Vendor email alert could not be started', error); }
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/buyer-order-receipt`, {
      method: 'POST',
      headers: { 'X-Internal-Secret': Deno.env.get('VENDOR_ALERT_INTERNAL_SECRET') ?? '', 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: intent.order_id }),
    });
  } catch (error) { console.error('Buyer receipt could not be started', error); }
  return { order_id: intent.order_id, already_confirmed: false };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const body = await request.json() as AdminRequest;
    const { db } = await requireAdmin(request);
    if (body.action === 'dashboard') return json(await dashboard(db));
    if (body.action === 'confirm_transfer') return json(await confirmTransfer(db, body.intent_id));
    if (body.action === 'update_payout') return json(await updatePayout(db, body.payout_id, body.status, body.note));
    if (body.action === 'assign_dispatch') return json(await assignDispatch(db, body.order_id, body.rider_name, body.rider_phone));
    if (body.action === 'update_dispatch') return json(await updateDispatch(db, body.order_id, body.status));
    if (body.action === 'review_vendor') {
      if (!['approved', 'rejected'].includes(body.decision)) return json({ error: 'Choose approve or reject.' }, 400);
      const { error } = await db.from('vendor_applications').update({ status: body.decision, reviewer_note: body.reviewer_note?.trim() || null, reviewed_at: new Date().toISOString() }).eq('id', body.application_id).eq('status', 'pending');
      if (error) throw new Error(error.message);
      return json({ status: body.decision });
    }
    return json({ error: 'Unknown admin action.' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Admin action failed.' }, 403);
  }
});
