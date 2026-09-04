import { admin, corsHeaders, getUser, json } from '../_shared/paystack.ts';
import { type OrderEmailEvent, previewOrderEmail, sendOrderEmail } from '../_shared/order-email.ts';

const validEvents: OrderEmailEvent[] = ['received', 'on_its_way', 'ready_for_pickup', 'delivered'];

async function canSendForOrder(userId: string, orderId: string) {
  const db = admin();
  const [{ data: administrator }, { data: staff }, { data: vendor }] = await Promise.all([
    db.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle(),
    db.from('cafeteria_staff').select('user_id').eq('user_id', userId).eq('is_active', true).maybeSingle(),
    db.from('vendors').select('id').eq('owner_id', userId).maybeSingle(),
  ]);
  if (administrator || staff) return true;
  if (!vendor) return false;
  const { data: line } = await db.from('order_items').select('id, products!inner(vendor_id)').eq('order_id', orderId).eq('products.vendor_id', vendor.id).maybeSingle();
  return Boolean(line);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const body = await request.json();
    const event = body.event as OrderEmailEvent;
    if (!validEvents.includes(event)) return json({ error: 'Choose a valid transactional email event.' }, 400);
    if (body.preview === true) return json(await previewOrderEmail(event));
    if (typeof body.order_id !== 'string') return json({ error: 'Order ID is required.' }, 400);
    const secret = Deno.env.get('ORDER_EMAIL_INTERNAL_SECRET') ?? Deno.env.get('VENDOR_ALERT_INTERNAL_SECRET');
    const internal = Boolean(secret && request.headers.get('X-Internal-Secret') === secret);
    if (!internal) {
      const user = await getUser(request);
      if (!user || !(await canSendForOrder(user.id, body.order_id))) return json({ error: 'You do not have permission to send an email for this order.' }, 403);
    }
    return json(await sendOrderEmail(body.order_id, event, body.retry === true));
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Could not send the order email.' }, 400); }
});
