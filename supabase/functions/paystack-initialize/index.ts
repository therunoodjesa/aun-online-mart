import { corsHeaders, getUser, json, admin, paystack, priceCart } from '../_shared/paystack.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(request);
    if (!user) return json({ error: 'Please sign in before paying.' }, 401);
    const body = await request.json();
    const fulfilment = body.fulfilment === 'pickup' ? 'pickup' : 'delivery';
    const priced = await priceCart(body.items ?? [], fulfilment);
    const reference = `aom_${crypto.randomUUID().replaceAll('-', '')}`;
    const db = admin();
    const { data: intent, error } = await db.from('payment_intents').insert({ user_id: user.id, reference, amount_kobo: Math.round(priced.total * 100), fulfilment, delivery_address: body.address ?? null, delivery_slot: body.slot ?? null, cart: { ...priced, fulfilment } }).select('id').single();
    if (error || !intent) throw new Error(error?.message ?? 'Could not prepare your payment.');
    const transaction = await paystack('/transaction/initialize', { method: 'POST', body: JSON.stringify({ email: user.email, amount: Math.round(priced.total * 100), currency: 'NGN', reference, callback_url: typeof body.callback_url === 'string' ? body.callback_url : undefined, channels: ['card', 'bank', 'bank_transfer'], metadata: JSON.stringify({ payment_intent_id: intent.id, user_id: user.id }) }) });
    return json({ reference, authorization_url: transaction.authorization_url, amount: priced.total });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Could not start payment.' }, 400); }
});
