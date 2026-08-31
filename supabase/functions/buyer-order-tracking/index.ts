import { admin, corsHeaders, getUser, json } from '../_shared/paystack.ts';

type TrackingRequest = { order_id?: string };

// Buyer tracking is served from a protected function instead of relying on a
// browser-side RLS query. This keeps a just-confirmed order visible even while
// the device is refreshing its Supabase session after checkout.
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const user = await getUser(request);
    if (!user) return json({ error: 'Please sign in again to view this order.' }, 401);
    const body = await request.json() as TrackingRequest;
    if (!body.order_id) return json({ error: 'This order link is incomplete.' }, 400);

    const db = admin();
    const { data: order, error: orderError } = await db
      .from('orders')
      .select('id, order_number, status, delivery_type, created_at')
      .eq('id', body.order_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (orderError) throw new Error(orderError.message);
    if (!order) return json({ error: 'This order is not available in this account.' }, 404);

    const [{ data: updates, error: updatesError }, { data: rejection, error: rejectionError }] = await Promise.all([
      db.from('order_updates').select('id, message, update_type, created_at').eq('order_id', order.id).order('created_at', { ascending: false }).limit(6),
      db.from('order_rejection_requests').select('id, reason, other_reason, alternative_products, selected_product_name, selected_products, replacement_budget, selected_subtotal, refund_amount, status').eq('order_id', order.id).maybeSingle(),
    ]);
    if (updatesError) throw new Error(updatesError.message);
    if (rejectionError) throw new Error(rejectionError.message);
    return json({ order, updates: updates ?? [], rejection: rejection ?? null });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not load this order.' }, 400);
  }
});
