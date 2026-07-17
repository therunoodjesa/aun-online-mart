import { admin, json } from '../_shared/paystack.ts';

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] ?? character));
const naira = (value: number) => `&#8358;${Math.round(Number(value ?? 0)).toLocaleString('en-NG')}`;
const plainNaira = (value: number) => `NGN ${Math.round(Number(value ?? 0)).toLocaleString('en-NG')}`;
const supportEmail = 'aunonlinemart@gmail.com';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const secret = Deno.env.get('VENDOR_ALERT_INTERNAL_SECRET');
  if (!secret || request.headers.get('X-Internal-Secret') !== secret) return json({ error: 'Unauthorized.' }, 401);

  try {
    const { order_id } = await request.json();
    if (typeof order_id !== 'string') return json({ error: 'Order ID is required.' }, 400);
    const db = admin();
    const { data: order, error: orderError } = await db.from('orders')
      .select('id, user_id, order_number, payment_status, payment_reference, amount_paid, subtotal, total, delivery_type, delivery_address, delivery_slot, created_at')
      .eq('id', order_id).single();
    if (orderError || !order) throw new Error(orderError?.message ?? 'Order not found.');
    if (order.payment_status !== 'paid') return json({ status: 'skipped', reason: 'Order is not paid.' });

    const user = order.user_id ? await db.auth.admin.getUserById(order.user_id) : { data: { user: null } };
    const recipient = user.data.user?.email;
    if (!recipient) return json({ status: 'skipped', reason: 'Customer email is not available.' });
    const { data: existing } = await db.from('buyer_payment_receipts').select('id, status').eq('order_id', order.id).maybeSingle();
    if (existing?.status === 'sent') return json({ status: 'already_sent' });

    const { data: items, error: itemError } = await db.from('order_items').select('product_name, unit_price, quantity, total_price, options, notes').eq('order_id', order.id);
    if (itemError) throw new Error(itemError.message);
    const subtotal = Number(order.subtotal ?? (items ?? []).reduce((sum, item) => sum + Number(item.total_price ?? Number(item.unit_price) * Number(item.quantity)), 0));
    const total = Number(order.total ?? order.amount_paid ?? subtotal);
    const extras = Math.max(0, total - subtotal);
    const fulfilmentTitle = order.delivery_type === 'pickup' ? 'Customer pickup' : 'Room delivery';
    const fulfilmentDetail = order.delivery_type === 'pickup' ? 'Your order will be ready for collection at the vendor location.' : `${order.delivery_address || 'AUN delivery address'}${order.delivery_slot ? ` · ${order.delivery_slot}` : ''}`;
    const itemRows = (items ?? []).map((item) => `<tr><td style="padding:14px 0;border-bottom:1px solid #DCE5F1"><strong style="color:#01193D">${escapeHtml(item.product_name)}</strong><br><span style="font-size:12px;color:#66809E">${Number(item.quantity)} × ${naira(Number(item.unit_price))}</span></td><td style="padding:14px 0;border-bottom:1px solid #DCE5F1;text-align:right;font-weight:800;color:#01193D">${naira(Number(item.total_price ?? Number(item.unit_price) * Number(item.quantity)))}</td></tr>`).join('');
    const html = `<!doctype html><html><body style="margin:0;background:#E8EFF8;font-family:Arial,sans-serif;color:#01193D"><div style="max-width:620px;margin:30px auto;padding:0 14px"><section style="overflow:hidden;border-radius:24px;background:#01193D;box-shadow:0 14px 34px rgba(1,25,61,.22)"><header style="padding:30px 32px 26px;color:#F8F3ED"><div style="display:inline-block;padding:7px 11px;border-radius:999px;background:#68ECCB;color:#01193D;font-size:11px;font-weight:800;letter-spacing:.6px">PAYMENT SUCCESSFUL</div><h1 style="margin:18px 0 7px;font-size:29px;line-height:34px">Your receipt is ready</h1><p style="margin:0;color:#C8D8ED;font-size:15px;line-height:22px">Thank you for choosing AUN Online Mart.</p></header><main style="margin:0 12px 12px;padding:26px 20px;background:#fff;border-radius:18px"><div style="display:flex;justify-content:space-between;gap:16px;padding-bottom:20px;border-bottom:1px dashed #B8C8DB"><div><div style="font-size:12px;color:#66809E;font-weight:700;text-transform:uppercase">Order number</div><div style="margin-top:5px;font-size:19px;font-weight:800">${escapeHtml(order.order_number)}</div></div><div style="text-align:right"><div style="font-size:12px;color:#66809E;font-weight:700;text-transform:uppercase">Paid</div><div style="margin-top:5px;font-size:19px;font-weight:800;color:#176E73">${naira(total)}</div></div></div><div style="margin:20px 0;padding:16px;border-radius:13px;background:#E9F8F3"><div style="font-size:12px;color:#176E73;font-weight:800;text-transform:uppercase">${fulfilmentTitle}</div><div style="margin-top:5px;font-size:14px;line-height:20px;color:#23445A">${escapeHtml(fulfilmentDetail)}</div></div><h2 style="margin:22px 0 5px;font-size:17px">Order summary</h2><table style="width:100%;border-collapse:collapse">${itemRows}</table><div style="margin-top:19px;padding:15px 0;border-top:1px solid #DCE5F1"><div style="display:flex;justify-content:space-between;margin-bottom:8px;color:#506B87;font-size:14px"><span>Items subtotal</span><span>${naira(subtotal)}</span></div>${extras ? `<div style="display:flex;justify-content:space-between;margin-bottom:11px;color:#506B87;font-size:14px"><span>Delivery, service & packaging</span><span>${naira(extras)}</span></div>` : ''}<div style="display:flex;justify-content:space-between;color:#01193D;font-size:19px;font-weight:800"><span>Total paid</span><span>${naira(total)}</span></div></div><div style="margin-top:24px;padding-top:18px;border-top:1px solid #DCE5F1;color:#66809E;font-size:12px;line-height:18px">Payment reference: ${escapeHtml(order.payment_reference || 'Not available')}<br>Need help? Contact us at <a href="mailto:${supportEmail}" style="color:#176E73;font-weight:700">${supportEmail}</a>.</div></main></section><p style="text-align:center;color:#66809E;font-size:12px;margin:17px">AUN Online Mart · Powered by iRO TECH</p></div></body></html>`;
    const text = [`Payment successful`, `Order: ${order.order_number}`, `Total paid: ${plainNaira(total)}`, `Fulfilment: ${fulfilmentTitle}`, fulfilmentDetail, '', 'Items:', ...(items ?? []).map((item) => `${item.quantity} × ${item.product_name} — ${plainNaira(Number(item.total_price ?? Number(item.unit_price) * Number(item.quantity)))}`), '', `Payment reference: ${order.payment_reference || 'Not available'}`].join('\n');
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('ORDER_ALERT_FROM') ?? 'AUN Online Mart <onboarding@resend.dev>';
    const replyTo = Deno.env.get('ORDER_ALERT_REPLY_TO');
    if (!resendKey) { await db.from('buyer_payment_receipts').upsert({ order_id: order.id, recipient, status: 'failed', error_message: 'RESEND_API_KEY is not configured.', updated_at: new Date().toISOString() }, { onConflict: 'order_id' }); return json({ status: 'failed_not_configured' }); }
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [recipient], ...(replyTo ? { reply_to: replyTo } : {}), subject: `Receipt · ${order.order_number}`, html, text }) });
    const body = await response.json();
    if (!response.ok) { await db.from('buyer_payment_receipts').upsert({ order_id: order.id, recipient, status: 'failed', error_message: body?.message ?? 'Email provider rejected the receipt.', updated_at: new Date().toISOString() }, { onConflict: 'order_id' }); throw new Error(body?.message ?? 'Email provider rejected the receipt.'); }
    await db.from('buyer_payment_receipts').upsert({ order_id: order.id, recipient, status: 'sent', provider_message_id: body?.id ?? null, error_message: null, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'order_id' });
    return json({ status: 'sent' });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Could not send receipt.' }, 400); }
});
