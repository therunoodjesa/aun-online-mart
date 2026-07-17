import { admin, corsHeaders, json } from '../_shared/paystack.ts';

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, '0')).join('');

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
    if (event.event !== 'charge.success') return json({ received: true });
    const transaction = event.data;
    const db = admin();
    const { data: intent } = await db.from('payment_intents').select('*').eq('reference', transaction.reference).maybeSingle();
    if (!intent || intent.order_id || Number(transaction.amount) !== Number(intent.amount_kobo) || transaction.currency !== 'NGN') return json({ received: true });
    // The app's verify endpoint creates the order after it sees this confirmed payment.
    // Marking it paid here makes confirmation reliable even when the customer closes checkout.
    await db.from('payment_intents').update({ status: 'paid', paystack_transaction_id: Number(transaction.id), paid_at: new Date().toISOString() }).eq('id', intent.id);
    return json({ received: true });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Webhook error' }, 400); }
});
