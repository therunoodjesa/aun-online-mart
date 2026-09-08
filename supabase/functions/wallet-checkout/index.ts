import { admin, corsHeaders, getUser, json, priceCart } from '../_shared/paystack.ts';
import { captureServerEvent } from '../_shared/posthog.ts';

type StoredLine = {
  source?: 'marketplace' | 'cafeteria'; product_id: string | null; cafeteria_product_id?: string | null;
  product_name: string; unit_price: number; quantity: number; selected_options?: unknown[]; note?: string | null;
  meal_plan_credit?: number; packaging_fee?: number;
};

async function createOrderItems(db: ReturnType<typeof admin>, orderId: string, lines: StoredLine[]) {
  const marketplace = lines.filter((line) => line.source !== 'cafeteria' && line.product_id);
  const cafeteria = lines.filter((line) => line.source === 'cafeteria' && line.cafeteria_product_id);
  const { error: marketplaceError } = marketplace.length ? await db.from('order_items').insert(marketplace.map((line) => ({
    order_id: orderId, product_id: line.product_id, product_name: line.product_name, unit_price: line.unit_price,
    quantity: line.quantity, total_price: Number(line.unit_price) * Number(line.quantity), options: line.selected_options ?? [], notes: line.note ?? null,
  }))) : { error: null };
  if (marketplaceError) throw new Error(marketplaceError.message);
  const { error: cafeteriaError } = cafeteria.length ? await db.from('cafeteria_order_items').insert(cafeteria.map((line) => ({
    order_id: orderId, product_id: line.cafeteria_product_id, product_name: line.product_name, unit_price: line.unit_price,
    quantity: line.quantity, options: line.selected_options ?? [], notes: line.note ?? null,
    meal_plan_credit: Number(line.meal_plan_credit ?? 0), packaging_fee: Number(line.packaging_fee ?? 0),
  }))) : { error: null };
  if (cafeteriaError) throw new Error(cafeteriaError.message);
}

async function startMessages(orderId: string) {
  const url = Deno.env.get('SUPABASE_URL');
  const secret = Deno.env.get('VENDOR_ALERT_INTERNAL_SECRET') ?? '';
  if (!url || !secret) return;
  const headers = { 'X-Internal-Secret': secret, 'Content-Type': 'application/json' };
  await Promise.allSettled([
    fetch(`${url}/functions/v1/vendor-order-alert`, { method: 'POST', headers, body: JSON.stringify({ order_id: orderId }) }),
    fetch(`${url}/functions/v1/buyer-order-receipt`, { method: 'POST', headers, body: JSON.stringify({ order_id: orderId }) }),
  ]);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const user = await getUser(request);
    if (!user) return json({ error: 'Please sign in before using AOM Credit.' }, 401);
    const body = await request.json();
    const fulfilment = body.fulfilment === 'pickup' ? 'pickup' : 'delivery';
    const priced = await priceCart(body.items ?? [], fulfilment, typeof body.slot === 'string' ? body.slot : null, user.id, body.use_meal_plan === true);
    if (priced.total <= 0) throw new Error('This order does not need a payment.');
    const db = admin();
    const { data: account, error: accountError } = await db.from('aom_wallet_accounts').select('balance').eq('user_id', user.id).maybeSingle();
    if (accountError) throw new Error(accountError.message);
    if (Number(account?.balance ?? 0) < priced.total) throw new Error(`Your AOM Credit balance is ₦${Number(account?.balance ?? 0).toLocaleString('en-NG')}, which does not fully cover this ₦${priced.total.toLocaleString('en-NG')} order.`);

    const reference = `aom_credit_${crypto.randomUUID().replaceAll('-', '')}`;
    const { data: order, error: orderError } = await db.from('orders').insert({
      order_number: `AOM-${String(Date.now()).slice(-7)}`, user_id: user.id, status: 'pending', delivery_type: fulfilment,
      payment_status: 'pending', payment_reference: reference, amount_paid: priced.total, subtotal: priced.subtotal, total: priced.total,
      wallet_credit_applied: priced.total, delivery_fee: priced.deliveryFee, rush_hour_discount: priced.rushHour.savings,
      delivery_address: body.address ?? null, delivery_instructions: body.delivery_instructions ?? null, delivery_slot: body.slot ?? null,
    }).select('id, order_number').single();
    if (orderError || !order) throw new Error(orderError?.message ?? 'Could not create your AOM Credit order.');
    let debitApplied = false;
    try {
      await createOrderItems(db, order.id, priced.lines as StoredLine[]);
      const { error: debitError } = await db.from('aom_wallet_transactions').insert({
        user_id: user.id, amount: -priced.total, kind: 'order_payment', description: `Used on order ${order.order_number}`, order_id: order.id,
      });
      if (debitError) throw new Error(debitError.message);
      debitApplied = true;
      const { error: paidError } = await db.from('orders').update({ payment_status: 'paid' }).eq('id', order.id).eq('payment_status', 'pending');
      if (paidError) throw new Error(paidError.message);
      const { error: intentError } = await db.from('payment_intents').insert({
        // payment_intents requires a positive invoice amount. This records the
        // full order value; `wallet_credit_applied` shows its funding source.
        user_id: user.id, reference, amount_kobo: Math.round(priced.total * 100), status: 'paid', payment_channel: 'aom_credit', fulfilment,
        delivery_address: body.address ?? null, delivery_instructions: body.delivery_instructions ?? null, delivery_slot: body.slot ?? null,
        order_id: order.id, paid_at: new Date().toISOString(), cart: { ...priced, fulfilment, wallet_credit: priced.total },
      });
      if (intentError) throw new Error(intentError.message);
      await db.from('order_updates').insert({ order_id: order.id, message: 'Paid with AOM Credit — your order is now being processed', update_type: 'system' });
    } catch (error) {
      // The ledger is intentionally immutable. If anything after the debit
      // fails, append an equal reversal before exposing the failure to buyers.
      if (debitApplied) {
        const { error: reversalError } = await db.from('aom_wallet_transactions').insert({
          user_id: user.id, amount: priced.total, kind: 'reversal', description: `Reversal for an incomplete AOM Credit order ${order.order_number}`, order_id: order.id,
        });
        if (reversalError) console.error('Could not reverse incomplete wallet order', reversalError);
      }
      await db.from('orders').update({ status: 'cancelled', payment_status: 'failed' }).eq('id', order.id);
      throw error;
    }
    await captureServerEvent(user.id, 'wallet_credit_redeemed', { order_id: order.id, amount: priced.total, item_count: priced.lines.reduce((total, line) => total + line.quantity, 0) });
    await startMessages(order.id);
    return json({ status: 'paid', order_id: order.id, balance: Number(account?.balance ?? 0) - priced.total });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not use AOM Credit for this order.' }, 400);
  }
});
