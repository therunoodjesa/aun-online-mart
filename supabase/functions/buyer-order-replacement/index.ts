import { admin, corsHeaders, getUser, json } from '../_shared/paystack.ts';

type Alternative = { id: string; name: string; price: number; image_url?: string | null; category?: string | null };
type RequestBody = { request_id?: string; action?: 'select' | 'cancel'; product_id?: string };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const user = await getUser(request);
    if (!user) return json({ error: 'Please sign in to update this order.' }, 401);
    const body = await request.json() as RequestBody;
    if (!body.request_id || !['select', 'cancel'].includes(body.action ?? '')) return json({ error: 'Choose a valid response.' }, 400);

    const db = admin();
    const { data: replacement, error: replacementError } = await db
      .from('order_rejection_requests')
      .select('id, order_id, vendor_id, status, alternative_products, orders!inner(id, user_id), vendors!inner(owner_id, name)')
      .eq('id', body.request_id)
      .maybeSingle();
    if (replacementError || !replacement) return json({ error: replacementError?.message ?? 'Replacement request not found.' }, 404);

    const order = Array.isArray(replacement.orders) ? replacement.orders[0] : replacement.orders;
    if (!order || order.user_id !== user.id) return json({ error: 'This replacement request is not for your account.' }, 403);
    if (replacement.status !== 'pending_customer') return json({ error: 'This replacement request has already been answered.' }, 409);

    const respondedAt = new Date().toISOString();
    if (body.action === 'cancel') {
      const { error: requestError } = await db.from('order_rejection_requests').update({ status: 'cancelled', responded_at: respondedAt }).eq('id', replacement.id);
      if (requestError) throw new Error(requestError.message);
      const { error: orderError } = await db.from('orders').update({ status: 'cancelled' }).eq('id', replacement.order_id);
      if (orderError) throw new Error(orderError.message);
      const message = 'Customer declined a replacement. Order cancelled; AOM will process the refund manually.';
      const { error: updateError } = await db.from('order_updates').insert({ order_id: replacement.order_id, vendor_id: replacement.vendor_id, message, update_type: 'system' });
      if (updateError) throw new Error(updateError.message);
      return json({ status: 'cancelled', message });
    }

    const alternatives = Array.isArray(replacement.alternative_products) ? replacement.alternative_products as Alternative[] : [];
    const selected = alternatives.find((product) => product.id === body.product_id);
    if (!selected) return json({ error: 'Choose one of the suggested alternatives.' }, 400);

    const { error: requestError } = await db.from('order_rejection_requests').update({
      status: 'replacement_selected', selected_product_id: selected.id, selected_product_name: selected.name, responded_at: respondedAt,
    }).eq('id', replacement.id);
    if (requestError) throw new Error(requestError.message);
    const { error: orderError } = await db.from('orders').update({ status: 'replacement_selected' }).eq('id', replacement.order_id);
    if (orderError) throw new Error(orderError.message);
    const message = `Customer selected ${selected.name} as a replacement. Please confirm the replacement with them before preparing the order.`;
    const { error: updateError } = await db.from('order_updates').insert({ order_id: replacement.order_id, vendor_id: replacement.vendor_id, message, update_type: 'system' });
    if (updateError) throw new Error(updateError.message);
    const vendor = Array.isArray(replacement.vendors) ? replacement.vendors[0] : replacement.vendors;
    if (vendor?.owner_id) {
      const { error: notificationError } = await db.from('notifications').insert({
        user_id: vendor.owner_id,
        title: `Customer chose ${selected.name}`,
        body: message,
        message,
        kind: 'order',
        action_label: 'VIEW ORDER',
        action_href: '/vendor-portal',
        is_read: false,
      });
      if (notificationError) throw new Error(notificationError.message);
    }
    return json({ status: 'replacement_selected', selected_product: selected });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not respond to the replacement request.' }, 400);
  }
});
