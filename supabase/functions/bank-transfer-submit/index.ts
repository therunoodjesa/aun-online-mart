import { corsHeaders, getUser, json, admin, priceCart } from '../_shared/paystack.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(request);
    if (!user) return json({ error: 'Please sign in before submitting a transfer.' }, 401);
    const body = await request.json();
    if (body.confirmed !== true) return json({ error: 'Confirm that you completed the bank transfer.' }, 400);

    const fulfilment = body.fulfilment === 'pickup' ? 'pickup' : 'delivery';
    const priced = await priceCart(body.items ?? [], fulfilment);
    const reference = `aom_transfer_${crypto.randomUUID().replaceAll('-', '')}`;
    const orderNumber = `AOM-${String(Date.now()).slice(-7)}`;
    const db = admin();

    const { data: intent, error: intentError } = await db.from('payment_intents').insert({
      user_id: user.id, reference, amount_kobo: Math.round(priced.total * 100), status: 'pending',
      payment_channel: 'bank_transfer', fulfilment, delivery_address: body.address ?? null,
      delivery_slot: body.slot ?? null, cart: { ...priced, fulfilment },
    }).select('id').single();
    if (intentError || !intent) throw new Error(intentError?.message ?? 'Could not record your transfer.');

    const { data: order, error: orderError } = await db.from('orders').insert({
      order_number: orderNumber, user_id: user.id, status: 'pending', delivery_type: fulfilment,
      payment_status: 'pending', payment_reference: reference, amount_paid: 0,
      subtotal: priced.subtotal,
      total: priced.total,
      delivery_address: body.address ?? null, delivery_slot: body.slot ?? null,
    }).select('id').single();
    if (orderError || !order) throw new Error(orderError?.message ?? 'Could not create your pending order.');

    const { error: itemError } = await db.from('order_items').insert(priced.lines.map((line) => ({
      order_id: order.id, product_id: line.product_id, product_name: line.product_name,
      unit_price: line.unit_price, quantity: line.quantity, total_price: line.unit_price * line.quantity,
      options: line.selected_options, notes: line.note,
    })));
    if (itemError) throw new Error(itemError.message);
    await db.from('order_updates').insert({ order_id: order.id, message: 'Bank transfer submitted and awaiting payment confirmation', update_type: 'system' });
    await db.from('payment_intents').update({ order_id: order.id }).eq('id', intent.id);
    return json({ status: 'pending_confirmation', order_id: order.id, reference });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not submit your bank transfer.' }, 400);
  }
});
