import { admin, corsHeaders, getUser, json } from '../_shared/paystack.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const user = await getUser(request);
    if (!user) return json({ error: 'Please sign in to request a payout.' }, 401);
    const db = admin();
    const { data: vendor, error: vendorError } = await db.from('vendors').select('id').eq('owner_id', user.id).maybeSingle();
    if (vendorError || !vendor) return json({ error: vendorError?.message ?? 'No vendor store is linked to this account.' }, 403);

    const { data: active, error: activeError } = await db.from('vendor_payout_requests').select('id').eq('vendor_id', vendor.id).in('status', ['requested', 'processing']).maybeSingle();
    if (activeError) throw new Error(activeError.message);
    if (active) return json({ error: 'You already have a payout request being reviewed.' }, 409);

    const { data: products, error: productError } = await db.from('products').select('id').eq('vendor_id', vendor.id);
    if (productError) throw new Error(productError.message);
    const productIds = (products ?? []).map((product) => product.id);
    if (!productIds.length) return json({ error: 'Add products before requesting a payout.' }, 400);

    const { data: lines, error: lineError } = await db.from('order_items').select('order_id, product_id, quantity, unit_price').in('product_id', productIds);
    if (lineError) throw new Error(lineError.message);
    const orderIds = [...new Set((lines ?? []).map((line) => line.order_id))];
    if (!orderIds.length) return json({ error: 'No completed orders are available for payout yet.' }, 400);
    const { data: orders, error: orderError } = await db.from('orders').select('id, status').in('id', orderIds).eq('payment_status', 'paid').in('status', ['ready', 'out_for_delivery', 'delivered']);
    if (orderError) throw new Error(orderError.message);

    const { data: prior, error: priorError } = await db.from('vendor_payout_requests').select('order_ids').eq('vendor_id', vendor.id).in('status', ['requested', 'processing', 'paid']);
    if (priorError) throw new Error(priorError.message);
    const alreadyRequested = new Set((prior ?? []).flatMap((payout) => payout.order_ids ?? []));
    const eligibleIds = (orders ?? []).map((order) => order.id).filter((id) => !alreadyRequested.has(id));
    const eligibleSet = new Set(eligibleIds);
    const amount = (lines ?? []).filter((line) => eligibleSet.has(line.order_id)).reduce((total, line) => total + Number(line.unit_price) * Number(line.quantity), 0);
    if (!eligibleIds.length || amount <= 0) return json({ error: 'There are no new completed orders available for payout.' }, 400);

    const { data: payout, error: payoutError } = await db.from('vendor_payout_requests').insert({ vendor_id: vendor.id, amount, order_ids: eligibleIds }).select('id, amount, status').single();
    if (payoutError || !payout) throw new Error(payoutError?.message ?? 'Could not create your payout request.');
    return json({ payout });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not request a payout.' }, 400);
  }
});
