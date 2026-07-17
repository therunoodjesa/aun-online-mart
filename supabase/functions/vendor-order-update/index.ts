import { admin, corsHeaders, getUser, json } from '../_shared/paystack.ts';

type VendorOrderStatus = 'accepted' | 'preparing' | 'ready' | 'cancelled';

const updates: Record<VendorOrderStatus, { title: (vendor: string) => string; message: string; kind: 'order' | 'delivery' }> = {
  accepted: { title: (vendor) => `Order accepted at ${vendor}`, message: 'Your order has been accepted and will be prepared shortly.', kind: 'order' },
  preparing: { title: (vendor) => `${vendor} is preparing your order`, message: 'Your order is now being prepared.', kind: 'order' },
  ready: { title: () => 'Your order is ready', message: 'Your order is packed and ready.', kind: 'delivery' },
  cancelled: { title: (vendor) => `Order update from ${vendor}`, message: 'The vendor could not accept this order.', kind: 'order' },
};

async function ensureNotification(db: ReturnType<typeof admin>, order: { id: string; user_id: string }, vendorName: string, status: VendorOrderStatus) {
  const copy = updates[status];
  const actionHref = `/(buyer)/order/${order.id}`;
  const { data: existing, error: existingError } = await db.from('notifications').select('id').eq('user_id', order.user_id).eq('action_href', actionHref).eq('message', copy.message).maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return existing.id;
  const { data, error } = await db.from('notifications').insert({
    user_id: order.user_id,
    title: copy.title(vendorName),
    body: copy.message,
    message: copy.message,
    kind: copy.kind,
    action_label: 'TRACK ORDER',
    action_href: actionHref,
    is_read: false,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const user = await getUser(request);
    if (!user) return json({ error: 'Please sign in to update this order.' }, 401);
    const body = await request.json() as { order_id?: string; status?: VendorOrderStatus };
    if (!body.order_id || !body.status || !updates[body.status]) return json({ error: 'Choose a valid order update.' }, 400);
    const db = admin();
    const { data: vendor, error: vendorError } = await db.from('vendors').select('id, name').eq('owner_id', user.id).maybeSingle();
    if (vendorError || !vendor) return json({ error: vendorError?.message ?? 'No vendor store is linked to this account.' }, 403);
    const { data: vendorLine, error: lineError } = await db.from('order_items').select('id, products!inner(vendor_id)').eq('order_id', body.order_id).eq('products.vendor_id', vendor.id).limit(1).maybeSingle();
    if (lineError || !vendorLine) return json({ error: lineError?.message ?? 'This order does not belong to your store.' }, 403);
    const { data: order, error: orderError } = await db.from('orders').select('id, user_id, status').eq('id', body.order_id).maybeSingle();
    if (orderError || !order) return json({ error: orderError?.message ?? 'Order not found.' }, 404);

    const changed = order.status !== body.status;
    if (changed) {
      const { error: statusError } = await db.from('orders').update({ status: body.status }).eq('id', order.id);
      if (statusError) throw new Error(statusError.message);
      const { error: updateError } = await db.from('order_updates').insert({ order_id: order.id, vendor_id: vendor.id, message: updates[body.status].message, update_type: 'vendor' });
      if (updateError) throw new Error(updateError.message);
    }
    const notificationId = await ensureNotification(db, order, vendor.name, body.status);
    return json({ status: body.status, notification_id: notificationId, already_updated: !changed });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not update this order.' }, 400);
  }
});
