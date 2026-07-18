import { admin, corsHeaders, getUser, json } from '../_shared/paystack.ts';

type Alternative = { id: string; name: string; price: number; image_url?: string | null; category?: string | null };
type RequestBody = { request_id?: string; action?: 'select' | 'cancel'; product_ids?: string[] };

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
      .select('id, order_id, vendor_id, status, alternative_products, replacement_budget, orders!inner(id, user_id), vendors!inner(owner_id, name)')
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
    const selectedIds = [...new Set((body.product_ids ?? []).filter((id): id is string => typeof id === 'string'))];
    const selected = alternatives.filter((product) => selectedIds.includes(product.id));
    if (!selected.length || selected.length !== selectedIds.length) return json({ error: 'Choose one or more of the suggested alternatives.' }, 400);

    let replacementBudget = Number(replacement.replacement_budget ?? 0);
    if (replacementBudget <= 0) {
      const { data: originalItems, error: originalItemsError } = await db
        .from('order_items')
        .select('total_price, products!inner(vendor_id)')
        .eq('order_id', replacement.order_id)
        .eq('products.vendor_id', replacement.vendor_id);
      if (originalItemsError) throw new Error(originalItemsError.message);
      replacementBudget = (originalItems ?? []).reduce((sum, item) => sum + Number(item.total_price ?? 0), 0);
    }
    const selectedSubtotal = selected.reduce((sum, product) => sum + Number(product.price ?? 0), 0);
    if (selectedSubtotal > replacementBudget) {
      return json({ error: `Your replacement selection is ₦${selectedSubtotal.toLocaleString('en-NG')}, which is above the ₦${replacementBudget.toLocaleString('en-NG')} original item value.` }, 400);
    }
    const refundAmount = Math.max(0, replacementBudget - selectedSubtotal);
    const selectedNames = selected.map((product) => product.name).join(', ');

    const { error: requestError } = await db.from('order_rejection_requests').update({
      status: 'replacement_selected', selected_product_id: selected[0].id, selected_product_name: selectedNames,
      selected_products: selected, selected_subtotal: selectedSubtotal, replacement_budget: replacementBudget, refund_amount: refundAmount,
      responded_at: respondedAt,
    }).eq('id', replacement.id);
    if (requestError) throw new Error(requestError.message);
    const { error: orderError } = await db.from('orders').update({ status: 'replacement_selected' }).eq('id', replacement.order_id);
    if (orderError) throw new Error(orderError.message);
    const refundCopy = refundAmount > 0 ? ` AOM owes the customer a ₦${refundAmount.toLocaleString('en-NG')} refund.` : '';
    const message = `Customer selected ${selectedNames} as a replacement (₦${selectedSubtotal.toLocaleString('en-NG')}). Please confirm the replacement before preparing the order.${refundCopy}`;
    const { error: updateError } = await db.from('order_updates').insert({ order_id: replacement.order_id, vendor_id: replacement.vendor_id, message, update_type: 'system' });
    if (updateError) throw new Error(updateError.message);
    const vendor = Array.isArray(replacement.vendors) ? replacement.vendors[0] : replacement.vendors;
    if (vendor?.owner_id) {
      const { error: notificationError } = await db.from('notifications').insert({
        user_id: vendor.owner_id,
        title: `Customer chose replacement items`,
        body: message,
        message,
        kind: 'order',
        action_label: 'VIEW ORDER',
        action_href: '/vendor-portal',
        is_read: false,
      });
      if (notificationError) throw new Error(notificationError.message);
    }
    return json({ status: 'replacement_selected', selected_products: selected, selected_subtotal: selectedSubtotal, replacement_budget: replacementBudget, refund_amount: refundAmount });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not respond to the replacement request.' }, 400);
  }
});
