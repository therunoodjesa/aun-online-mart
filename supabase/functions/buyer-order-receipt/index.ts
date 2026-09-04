import { corsHeaders, json } from '../_shared/paystack.ts';
import { sendOrderEmail } from '../_shared/order-email.ts';

// Kept as the existing payment-confirmation entrypoint. It now uses the
// reusable transactional email system and records the `received` event.
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const secret = Deno.env.get('ORDER_EMAIL_INTERNAL_SECRET') ?? Deno.env.get('VENDOR_ALERT_INTERNAL_SECRET');
  if (!secret || request.headers.get('X-Internal-Secret') !== secret) return json({ error: 'Unauthorized.' }, 401);
  try {
    const { order_id, retry } = await request.json();
    if (typeof order_id !== 'string') return json({ error: 'Order ID is required.' }, 400);
    return json(await sendOrderEmail(order_id, 'received', retry === true));
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Could not send order-received email.' }, 400); }
});
