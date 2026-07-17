import { corsHeaders, getUser, json, admin, paystack } from '../_shared/paystack.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(request);
    if (!user) return json({ error: 'Please sign in before verifying payment.' }, 401);
    const { reference } = await request.json();
    const db = admin();
    const { data: intent } = await db.from('payment_intents').select('*').eq('reference', reference).eq('user_id', user.id).single();
    if (!intent) return json({ error: 'Payment record not found.' }, 404);
    if (intent.status === 'paid' && intent.order_id) return json({ status: 'paid', order_id: intent.order_id });
    const transaction = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
    if (transaction.status !== 'success') { await db.from('payment_intents').update({ status: transaction.status ?? 'pending' }).eq('id', intent.id); return json({ status: transaction.status ?? 'pending', message: transaction.gateway_response ?? 'Payment is still being confirmed.' }); }
    const expectedAmount = Number(intent.amount_kobo);
    const chargedAmount = Number(transaction.amount);
    // Paystack can pass its processing fee to the customer. In that case
    // `amount` is higher than AOM's invoice while `requested_amount` remains
    // the amount AOM asked Paystack to collect.
    const requestedAmount = Number(transaction.requested_amount ?? transaction.amount);
    const currency = String(transaction.currency ?? '').toUpperCase();
    if (requestedAmount !== expectedAmount || chargedAmount < expectedAmount || currency !== 'NGN') {
      console.error('Paystack payment mismatch', { reference, expectedAmount, requestedAmount, chargedAmount, currency });
      return json({ error: `Payment could not be verified safely. AOM expected ₦${(expectedAmount / 100).toLocaleString('en-NG')}; Paystack requested ₦${(requestedAmount / 100).toLocaleString('en-NG')} and charged ₦${(chargedAmount / 100).toLocaleString('en-NG')} ${currency || 'with no currency code'}.` }, 400);
    }
    const cart = intent.cart as { lines: { product_id: string; product_name: string; unit_price: number; quantity: number; selected_options: unknown[]; note: string | null }[]; subtotal: number; total: number };
    const orderNumber = `AOM-${String(Date.now()).slice(-7)}`;
    const { data: order, error: orderError } = await db.from('orders').insert({ order_number: orderNumber, user_id: user.id, status: 'pending', delivery_type: intent.fulfilment, payment_status: 'pending', payment_reference: reference, amount_paid: cart.total, subtotal: cart.subtotal, total: cart.total, delivery_address: intent.delivery_address, delivery_slot: intent.delivery_slot }).select('id').single();
    if (orderError || !order) throw new Error(orderError?.message ?? 'Could not create your order.');
    const { error: itemError } = await db.from('order_items').insert(cart.lines.map((line) => ({ order_id: order.id, product_id: line.product_id, product_name: line.product_name, unit_price: line.unit_price, quantity: line.quantity, total_price: line.unit_price * line.quantity, options: line.selected_options, notes: line.note })));
    if (itemError) throw new Error(itemError.message);
    const { error: paidOrderError } = await db.from('orders').update({ payment_status: 'paid' }).eq('id', order.id).eq('payment_status', 'pending');
    if (paidOrderError) throw new Error(paidOrderError.message);
    await db.from('order_updates').insert({ order_id: order.id, message: 'Order received and processing', update_type: 'system' });
    await db.from('payment_intents').update({ status: 'paid', order_id: order.id, paystack_transaction_id: Number(transaction.id), paid_at: new Date().toISOString() }).eq('id', intent.id);
    // Alerts are intentionally best-effort: a mail-provider outage must never block a paid order.
    try {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/vendor-order-alert`, {
        method: 'POST',
        headers: { 'X-Internal-Secret': Deno.env.get('VENDOR_ALERT_INTERNAL_SECRET') ?? '', 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id }),
      });
    } catch (alertError) {
      console.error('Vendor order alert could not be started', alertError);
    }
    try {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/buyer-order-receipt`, {
        method: 'POST',
        headers: { 'X-Internal-Secret': Deno.env.get('VENDOR_ALERT_INTERNAL_SECRET') ?? '', 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id }),
      });
    } catch (receiptError) {
      console.error('Buyer receipt could not be started', receiptError);
    }
    return json({ status: 'paid', order_id: order.id });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Could not verify payment.' }, 400); }
});
