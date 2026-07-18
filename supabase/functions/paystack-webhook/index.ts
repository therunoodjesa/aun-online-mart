import { admin, corsHeaders, json } from '../_shared/paystack.ts';

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
type StoredLine = { product_id: string; product_name: string; unit_price: number; quantity: number; selected_options?: unknown[]; note?: string | null };
type StoredCart = { lines?: StoredLine[]; subtotal?: number; total?: number; deliveryFee?: number; rushHour?: { savings?: number } };

async function ensureOrderItems(db: ReturnType<typeof admin>, orderId: string, lines: StoredLine[]) {
  const { count, error: countError } = await db.from('order_items').select('id', { count: 'exact', head: true }).eq('order_id', orderId);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) return;
  const { error } = await db.from('order_items').insert(lines.map((line) => ({
    order_id: orderId, product_id: line.product_id, product_name: line.product_name,
    unit_price: line.unit_price, quantity: line.quantity, total_price: Number(line.unit_price) * Number(line.quantity),
    options: line.selected_options ?? [], notes: line.note ?? null,
  })));
  if (error) throw new Error(error.message);
}

async function finalisePaidIntent(db: ReturnType<typeof admin>, intent: { id: string; user_id: string; reference: string; order_id: string | null; fulfilment: string; delivery_address: string | null; delivery_slot: string | null; cart: StoredCart }, transactionId: number) {
  const lines = intent.cart?.lines ?? [];
  if (!lines.length) throw new Error('The paid transaction has no order items.');
  let orderId = intent.order_id;
  if (!orderId) {
    const { data: existing, error: existingError } = await db.from('orders').select('id').eq('payment_reference', intent.reference).maybeSingle();
    if (existingError) throw new Error(existingError.message);
    orderId = existing?.id ?? null;
  }
  if (!orderId) {
    const subtotal = Number(intent.cart.subtotal ?? lines.reduce((total, line) => total + Number(line.unit_price) * Number(line.quantity), 0));
    const total = Number(intent.cart.total ?? subtotal);
    const { data: order, error } = await db.from('orders').insert({
      order_number: `AOM-${String(Date.now()).slice(-7)}`,
      user_id: intent.user_id, status: 'pending', delivery_type: intent.fulfilment,
      payment_status: 'pending', payment_reference: intent.reference, amount_paid: total,
      subtotal, total, delivery_fee: Number(intent.cart.deliveryFee ?? 0), rush_hour_discount: Number(intent.cart.rushHour?.savings ?? 0), delivery_address: intent.delivery_address, delivery_slot: intent.delivery_slot,
    }).select('id').single();
    if (error || !order) {
      const { data: duplicate } = await db.from('orders').select('id').eq('payment_reference', intent.reference).maybeSingle();
      if (!duplicate) throw new Error(error?.message ?? 'Could not create the paid order.');
      orderId = duplicate.id;
    } else orderId = order.id;
  }
  await ensureOrderItems(db, orderId, lines);
  const { error: paidOrderError } = await db.from('orders').update({ payment_status: 'paid' }).eq('id', orderId).eq('payment_status', 'pending');
  if (paidOrderError) throw new Error(paidOrderError.message);
  const { count } = await db.from('order_updates').select('id', { count: 'exact', head: true }).eq('order_id', orderId);
  if (!(count ?? 0)) await db.from('order_updates').insert({ order_id: orderId, message: 'Order received and processing', update_type: 'system' });
  const { error: intentError } = await db.from('payment_intents').update({ status: 'paid', order_id: orderId, paystack_transaction_id: transactionId, paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', intent.id);
  if (intentError) throw new Error(intentError.message);
  return orderId;
}

async function startPaidOrderMessages(orderId: string) {
  const base = Deno.env.get('SUPABASE_URL');
  const secret = Deno.env.get('VENDOR_ALERT_INTERNAL_SECRET') ?? '';
  if (!base || !secret) return;
  const headers = { 'X-Internal-Secret': secret, 'Content-Type': 'application/json' };
  await Promise.allSettled([
    fetch(`${base}/functions/v1/vendor-order-alert`, { method: 'POST', headers, body: JSON.stringify({ order_id: orderId }) }),
    fetch(`${base}/functions/v1/buyer-order-receipt`, { method: 'POST', headers, body: JSON.stringify({ order_id: orderId }) }),
  ]);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const rawBody = await request.text();
    const secret = Deno.env.get('PAYSTACK_SECRET_KEY')!;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
    const signature = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
    if (signature !== request.headers.get('x-paystack-signature')) return json({ error: 'Invalid signature' }, 401);
    const event = JSON.parse(rawBody);
    if (event.event === 'charge.failed') {
      const reference = event.data?.reference;
      if (typeof reference === 'string') await admin().from('payment_intents').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('reference', reference).is('order_id', null);
      return json({ received: true });
    }
    if (event.event !== 'charge.success') return json({ received: true });
    const transaction = event.data;
    const db = admin();
    const { data: intent } = await db.from('payment_intents').select('*').eq('reference', transaction.reference).maybeSingle();
    const expectedAmount = Number(intent?.amount_kobo);
    const requestedAmount = Number(transaction.requested_amount ?? transaction.amount);
    const chargedAmount = Number(transaction.amount);
    const currency = String(transaction.currency ?? '').toUpperCase();
    // `amount` may include a Paystack fee passed to the customer. The invoice
    // is represented by requested_amount; never accept a partial charge.
    if (!intent || requestedAmount !== expectedAmount || chargedAmount < expectedAmount || currency !== 'NGN') return json({ received: true });
    const orderId = await finalisePaidIntent(db, intent as typeof intent & { user_id: string; fulfilment: string; delivery_address: string | null; delivery_slot: string | null; cart: StoredCart }, Number(transaction.id));
    await startPaidOrderMessages(orderId);
    return json({ received: true, order_id: orderId });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Webhook error' }, 400); }
});
