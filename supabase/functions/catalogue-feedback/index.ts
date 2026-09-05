import { admin, corsHeaders, getUser, json } from '../_shared/paystack.ts';

type Body = { action: 'rate'; source: 'product' | 'cafeteria'; product_id: string; rating: number };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const user = await getUser(request);
    if (!user) return json({ error: 'Please sign in to rate an order.' }, 401);
    const body = await request.json() as Body;
    if (body.action !== 'rate' || !['product', 'cafeteria'].includes(body.source) || !body.product_id || !Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) return json({ error: 'Choose between one and five stars.' }, 400);
    const db = admin();
    const table = body.source === 'cafeteria' ? 'cafeteria_order_items' : 'order_items';
    const { data: purchased, error: purchaseError } = await db.from(table).select('order_id, orders!inner(user_id, payment_status)').eq('product_id', body.product_id).eq('orders.user_id', user.id).eq('orders.payment_status', 'paid').limit(1);
    if (purchaseError) throw new Error(purchaseError.message);
    if (!purchased?.length) return json({ error: 'You can rate this after purchasing it through AOM.' }, 403);
    const values = body.source === 'cafeteria' ? { user_id: user.id, cafeteria_product_id: body.product_id, rating: body.rating, updated_at: new Date().toISOString() } : { user_id: user.id, product_id: body.product_id, rating: body.rating, updated_at: new Date().toISOString() };
    const { error } = await db.from('product_ratings').upsert(values, { onConflict: body.source === 'cafeteria' ? 'user_id,cafeteria_product_id' : 'user_id,product_id' });
    if (error) throw new Error(error.message);
    return json({ status: 'saved' });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Could not save your rating.' }, 400); }
});
