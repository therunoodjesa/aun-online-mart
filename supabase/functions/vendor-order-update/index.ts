import { admin, corsHeaders, getUser, json } from '../_shared/paystack.ts';
import { captureServerEvent } from '../_shared/posthog.ts';

type VendorOrderStatus = 'accepted' | 'preparing' | 'ready' | 'cancelled';
type RejectReason = 'out_of_stock' | 'store_closed' | 'cannot_meet_request' | 'preparation_time' | 'other';
type RequestBody = { order_id?: string; status?: VendorOrderStatus; rejection?: { reason?: RejectReason; other_reason?: string; alternative_product_ids?: string[] } };

const updates: Record<Exclude<VendorOrderStatus, 'cancelled'>, { title: (vendor: string) => string; message: string; kind: 'order' | 'delivery' | 'booking' }> = {
  accepted: { title: (vendor) => `Order accepted at ${vendor}`, message: 'Your order has been accepted and will be prepared shortly.', kind: 'order' },
  preparing: { title: (vendor) => `${vendor} is preparing your order`, message: 'Your order is now being prepared.', kind: 'order' },
  ready: { title: () => 'Your order is ready', message: 'Your order is packed and ready.', kind: 'delivery' },
};

const bookingUpdates: Partial<Record<VendorOrderStatus, { title: (vendor: string) => string; message: string; kind: 'booking' }>> = {
  accepted: { title: (vendor) => `Booking accepted by ${vendor}`, message: 'Your booking has been accepted. Check your order details for the scheduled date and time.', kind: 'booking' },
  ready: { title: () => 'Booking session complete', message: 'Your service provider has marked this booking session as complete.', kind: 'booking' },
};

const rejectionCopy: Record<RejectReason, string> = {
  out_of_stock: 'An item you requested is out of stock.',
  store_closed: 'The store is unexpectedly unable to fulfil this order right now.',
  cannot_meet_request: 'The vendor cannot safely meet a request attached to this order.',
  preparation_time: 'The vendor cannot fulfil this order within the requested time.',
  other: 'The vendor is unable to fulfil this order.',
};

async function notifyBuyer(db: ReturnType<typeof admin>, order: { id: string; user_id: string }, title: string, message: string, kind: 'order' | 'delivery' | 'booking' = 'order') {
  const actionHref = `/(buyer)/order/${order.id}`;
  const { data: existing, error: existingError } = await db.from('notifications').select('id').eq('user_id', order.user_id).eq('action_href', actionHref).eq('message', message).maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return existing.id;
  const { data, error } = await db.from('notifications').insert({
    user_id: order.user_id, title, body: message, message, kind,
    action_label: 'TRACK ORDER', action_href: actionHref, is_read: false,
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
    const body = await request.json() as RequestBody;
    if (!body.order_id || !body.status || !['accepted', 'preparing', 'ready', 'cancelled'].includes(body.status)) return json({ error: 'Choose a valid order update.' }, 400);

    const db = admin();
    const { data: vendor, error: vendorError } = await db.from('vendors').select('id, name, store_type').eq('owner_id', user.id).maybeSingle();
    if (vendorError || !vendor) return json({ error: vendorError?.message ?? 'No vendor store is linked to this account.' }, 403);
    const { data: vendorLine, error: lineError } = await db.from('order_items').select('id, products!inner(vendor_id)').eq('order_id', body.order_id).eq('products.vendor_id', vendor.id).limit(1).maybeSingle();
    if (lineError || !vendorLine) return json({ error: lineError?.message ?? 'This order does not belong to your store.' }, 403);
    const { data: order, error: orderError } = await db.from('orders').select('id, user_id, status').eq('id', body.order_id).maybeSingle();
    if (orderError || !order) return json({ error: orderError?.message ?? 'Order not found.' }, 404);

    if (body.status === 'cancelled') {
      const rejection = body.rejection;
      const validReasons: RejectReason[] = ['out_of_stock', 'store_closed', 'cannot_meet_request', 'preparation_time', 'other'];
      if (!rejection?.reason || !validReasons.includes(rejection.reason)) return json({ error: 'Choose a reason for rejecting this order.' }, 400);
      const otherReason = rejection.other_reason?.trim().slice(0, 180) || null;
      if (rejection.reason === 'other' && !otherReason) return json({ error: 'Add a short explanation for the customer.' }, 400);

      let alternatives: { id: string; name: string; price: number; image_url: string | null; category: string | null }[] = [];
      if (rejection.reason === 'out_of_stock') {
        const requestedIds = [...new Set((rejection.alternative_product_ids ?? []).filter((id): id is string => typeof id === 'string'))].slice(0, 6);
        if (requestedIds.length) {
          const { data: products, error: productsError } = await db.from('products').select('id, name, price, image_url, category').eq('vendor_id', vendor.id).eq('status', 'available').in('id', requestedIds);
          if (productsError) throw new Error(productsError.message);
          alternatives = products ?? [];
        }
      }

      const waitingForChoice = alternatives.length > 0;
      const orderStatus = waitingForChoice ? 'replacement_requested' : 'cancelled';
      const reasonText = rejection.reason === 'other' ? otherReason! : rejectionCopy[rejection.reason];
      const message = vendor.store_type === 'service'
        ? `${vendor.name} declined this booking. AOM will process any required refund manually.`
        : waitingForChoice
        ? `${reasonText} ${vendor.name} has suggested alternatives for you to choose from.`
        : `${reasonText} Your order has been cancelled. AOM will process your refund manually.`;

      const { error: requestError } = await db.from('order_rejection_requests').upsert({
        order_id: order.id, vendor_id: vendor.id, reason: rejection.reason, other_reason: otherReason,
        alternative_products: alternatives, status: waitingForChoice ? 'pending_customer' : 'cancelled',
        selected_product_id: null, selected_product_name: null, responded_at: waitingForChoice ? null : new Date().toISOString(),
      }, { onConflict: 'order_id' });
      if (requestError) throw new Error(requestError.message);

      const { error: statusError } = await db.from('orders').update({ status: orderStatus }).eq('id', order.id);
      if (statusError) throw new Error(statusError.message);
      const { error: updateError } = await db.from('order_updates').insert({ order_id: order.id, vendor_id: vendor.id, message, update_type: 'vendor' });
      if (updateError) throw new Error(updateError.message);
      const notificationId = await notifyBuyer(db, order, vendor.store_type === 'service' ? `Booking rejected by ${vendor.name}` : waitingForChoice ? `Choose a replacement from ${vendor.name}` : `Order cancelled by ${vendor.name}`, message, vendor.store_type === 'service' ? 'booking' : 'order');
      await captureServerEvent(user.id, 'vendor_order_status_updated', {
        order_id: order.id,
        status: orderStatus,
        rejection_reason: rejection.reason,
        alternatives_count: alternatives.length,
      });
      return json({ status: orderStatus, notification_id: notificationId, alternatives: alternatives.length });
    }

    const copy = vendor.store_type === 'service' ? bookingUpdates[body.status] ?? updates[body.status] : updates[body.status];
    const changed = order.status !== body.status;
    if (changed) {
      const { error: statusError } = await db.from('orders').update({ status: body.status }).eq('id', order.id);
      if (statusError) throw new Error(statusError.message);
      const { error: updateError } = await db.from('order_updates').insert({ order_id: order.id, vendor_id: vendor.id, message: copy.message, update_type: 'vendor' });
      if (updateError) throw new Error(updateError.message);
    }
    const notificationId = await notifyBuyer(db, order, copy.title(vendor.name), copy.message, copy.kind);
    if (changed) await captureServerEvent(user.id, 'vendor_order_status_updated', { order_id: order.id, status: body.status });
    return json({ status: body.status, notification_id: notificationId, already_updated: !changed });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not update this order.' }, 400);
  }
});
