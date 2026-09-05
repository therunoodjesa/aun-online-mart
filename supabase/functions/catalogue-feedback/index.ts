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
    const { data: lines, error: lineError } = await db.from(table).select('order_id').eq('product_id', body.product_id).limit(1000);
    if (lineError) throw new Error(lineError.message);
    const orderIds = [...new Set((lines ?? []).map((line) => line.order_id))];
    const { data: purchased, error: purchaseError } = orderIds.length ? await db.from('orders').select('id').in('id', orderIds).eq('user_id', user.id).eq('payment_status', 'paid').limit(1) : { data: [], error: null };
    if (purchaseError) throw new Error(purchaseError.message);
    if (!purchased?.length) return json({ error: 'You can rate this after purchasing it through AOM.' }, 403);
    const key = body.source === 'cafeteria' ? 'cafeteria_product_id' : 'product_id';
    const { data: existing, error: existingError } = await db.from('product_ratings').select('id').eq('user_id', user.id).eq(key, body.product_id).maybeSingle();
    if (existingError) throw new Error(existingError.message);
    const values = body.source === 'cafeteria' ? { user_id: user.id, cafeteria_product_id: body.product_id, rating: body.rating, updated_at: new Date().toISOString() } : { user_id: user.id, product_id: body.product_id, rating: body.rating, updated_at: new Date().toISOString() };
    const { error } = existing ? await db.from('product_ratings').update(values).eq('id', existing.id) : await db.from('product_ratings').insert(values);
    if (error) throw new Error(error.message);
    return json({ status: 'saved' });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Could not save your rating.' }, 400); }
});
