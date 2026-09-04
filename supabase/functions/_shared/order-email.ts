import { admin } from './paystack.ts';

export type OrderEmailEvent = 'received' | 'on_its_way' | 'ready_for_pickup' | 'delivered';

const supportEmail = 'aunonlinemart@gmail.com';
const supportPhone = '+234 907 930 6580';
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] ?? character));
const money = (value: number) => `₦${Math.round(Number(value ?? 0)).toLocaleString('en-NG')}`;
const eventCopy: Record<OrderEmailEvent, { label: string; subject: (order: string) => string; headline: string; message: (name: string) => string }> = {
  received: { label: 'ORDER RECEIVED', subject: (order) => `We've received your order! 🛍️ | Order #${order}`, headline: 'Your AUN Online Mart order has been received.', message: (name) => `Hi ${name},<br><br>Thank you for shopping with AUN Online Mart! We've received your order and it is now being processed. We'll keep you updated as it moves through each stage.` },
  on_its_way: { label: 'ON ITS WAY', subject: (order) => `Your order is on its way! 🛵 | Order #${order}`, headline: 'Your AUN Online Mart order is on its way.', message: (name) => `Hi ${name},<br><br>Good news! Your order has been prepared and is now on its way to you. Please keep your phone nearby in case the delivery agent needs to reach you.` },
  ready_for_pickup: { label: 'READY FOR PICKUP', subject: (order) => `Your order is ready for pickup! 📦 | Order #${order}`, headline: 'Your AUN Online Mart order is ready for pickup.', message: (name) => `Hi ${name},<br><br>Your order has been prepared and is ready for pickup! Please head to the location below to collect your packaged order.` },
  delivered: { label: 'DELIVERED', subject: (order) => `Delivered! Enjoy your order 💙 | Order #${order}`, headline: 'Your AUN Online Mart order has been delivered.', message: (name) => `Hi ${name},<br><br>Your order has been successfully delivered! 🎉 We hope you love everything you ordered, and thank you for choosing AUN Online Mart.<br><br>If anything is wrong with your order, please contact AOM support and we will help.` },
};

type EmailOrder = { id: string; user_id: string | null; order_number: string; payment_status: string; subtotal: number | null; total: number | null; amount_paid: number | null; delivery_fee: number | null; rush_hour_discount: number | null; delivery_type: string | null; delivery_address: string | null; delivery_instructions: string | null; delivery_slot: string | null; created_at: string };
type Line = { product_name: string; unit_price: number; quantity: number; total_price?: number | null };

async function orderEmailData(orderId: string) {
  const db = admin();
  const { data: order, error: orderError } = await db.from('orders').select('id, user_id, order_number, payment_status, subtotal, total, amount_paid, delivery_fee, rush_hour_discount, delivery_type, delivery_address, delivery_instructions, delivery_slot, created_at').eq('id', orderId).single();
  if (orderError || !order) throw new Error(orderError?.message ?? 'Order not found.');
  if (order.payment_status !== 'paid') throw new Error('Only confirmed, paid orders can receive transactional emails.');
  const [{ data: authUser }, { data: profile }, { data: productItems, error: productError }, { data: cafeteriaItems, error: cafeteriaError }] = await Promise.all([
    order.user_id ? db.auth.admin.getUserById(order.user_id) : Promise.resolve({ data: { user: null } }),
    order.user_id ? db.from('profiles').select('full_name, phone').eq('id', order.user_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from('order_items').select('product_id, product_name, unit_price, quantity, total_price').eq('order_id', order.id),
    db.from('cafeteria_order_items').select('product_name, unit_price, quantity').eq('order_id', order.id),
  ]);
  if (productError) throw new Error(productError.message);
  if (cafeteriaError) throw new Error(cafeteriaError.message);
  const productIds = [...new Set((productItems ?? []).map((line) => line.product_id).filter(Boolean))];
  const { data: products, error: productsError } = productIds.length ? await db.from('products').select('id, vendor_id').in('id', productIds) : { data: [], error: null };
  if (productsError) throw new Error(productsError.message);
  const vendorIds = [...new Set((products ?? []).map((product) => product.vendor_id).filter(Boolean))];
  const { data: vendors, error: vendorError } = vendorIds.length ? await db.from('vendors').select('id, name, pickup_location').in('id', vendorIds) : { data: [], error: null };
  if (vendorError) throw new Error(vendorError.message);
  const vendorById = new Map((vendors ?? []).map((vendor) => [vendor.id, vendor]));
  const productById = new Map((products ?? []).map((product) => [product.id, product]));
  const pickedVendors = [...new Map((productItems ?? []).map((line) => {
    const product = line.product_id ? productById.get(line.product_id) : null;
    const vendor = product ? vendorById.get(product.vendor_id) : null;
    return [vendor?.id ?? 'unknown', vendor];
  })).values()].filter(Boolean);
  const recipient = authUser.user?.email;
  if (!recipient) throw new Error('Customer email is not available for this order.');
  return {
    db, order: order as EmailOrder, recipient, fullName: profile?.full_name?.trim() || authUser.user?.user_metadata?.full_name || 'Customer', phone: profile?.phone ?? null,
    lines: [...(productItems ?? []), ...(cafeteriaItems ?? []).map((line) => ({ ...line, total_price: Number(line.unit_price) * Number(line.quantity) }))] as Line[],
    vendors: pickedVendors as { id: string; name: string; pickup_location: string | null }[],
    hasCafeteria: Boolean(cafeteriaItems?.length),
  };
}

export function renderOrderEmail(event: OrderEmailEvent, data: Awaited<ReturnType<typeof orderEmailData>>) {
  const copy = eventCopy[event];
  const firstName = String(data.fullName).trim().split(/\s+/)[0] || 'there';
  const total = Number(data.order.total ?? data.order.amount_paid ?? 0);
  const subtotal = Number(data.order.subtotal ?? data.lines.reduce((sum, line) => sum + Number(line.total_price ?? Number(line.unit_price) * Number(line.quantity)), 0));
  const deliveryFee = Number(data.order.delivery_fee ?? 0);
  const otherFees = Math.max(0, total - subtotal - deliveryFee);
  const pickup = data.order.delivery_type === 'pickup';
  const primaryVendor = data.vendors[0];
  const location = pickup
    ? primaryVendor?.pickup_location || (data.hasCafeteria ? 'AUN Cafeteria' : null)
    : data.order.delivery_address;
  const timing = data.order.delivery_slot;
  const locationLabel = pickup ? 'PICKUP INFORMATION' : 'DELIVERY INFORMATION';
  const locationDetails = [location, !pickup && data.order.delivery_instructions, timing].filter(Boolean).map((entry) => escapeHtml(entry)).join('<br>');
  const vendorDetails = pickup && primaryVendor ? `<div style="font-size:12px;color:#66809E;font-weight:800;text-transform:uppercase;margin-top:14px">STORE</div><div style="margin-top:4px;font-size:15px;font-weight:800;color:#01193D">${escapeHtml(primaryVendor.name)}</div>` : '';
  const lines = data.lines.map((line) => `<tr><td style="padding:13px 0;border-bottom:1px solid #DCE5F1;color:#01193D"><strong>${escapeHtml(line.product_name)}</strong><br><span style="font-size:12px;color:#66809E">x${Number(line.quantity)} · ${money(Number(line.unit_price))}</span></td><td style="padding:13px 0;border-bottom:1px solid #DCE5F1;text-align:right;font-weight:800;color:#01193D">${money(Number(line.total_price ?? Number(line.unit_price) * Number(line.quantity)))}</td></tr>`).join('');
  const summary = `<div style="margin-top:18px;padding-top:14px;border-top:1px solid #DCE5F1"><div style="display:flex;justify-content:space-between;margin-bottom:8px;color:#506B87;font-size:14px"><span>Subtotal</span><span>${money(subtotal)}</span></div>${data.order.rush_hour_discount ? `<div style="display:flex;justify-content:space-between;margin-bottom:8px;color:#176E73;font-size:14px"><span>Delivery saving</span><span>−${money(Number(data.order.rush_hour_discount))}</span></div>` : ''}${deliveryFee ? `<div style="display:flex;justify-content:space-between;margin-bottom:8px;color:#506B87;font-size:14px"><span>Delivery fee</span><span>${money(deliveryFee)}</span></div>` : ''}${otherFees ? `<div style="display:flex;justify-content:space-between;margin-bottom:10px;color:#506B87;font-size:14px"><span>Service & packaging</span><span>${money(otherFees)}</span></div>` : ''}<div style="display:flex;justify-content:space-between;color:#01193D;font-size:20px;font-weight:800"><span>TOTAL</span><span>${money(total)}</span></div></div>`;
  const html = `<!doctype html><html><body style="margin:0;background:#E8EFF8;font-family:Arial,sans-serif;color:#01193D"><div style="max-width:620px;margin:28px auto;padding:0 14px"><section style="overflow:hidden;border-radius:24px;background:#01193D;box-shadow:0 14px 34px rgba(1,25,61,.2)"><header style="padding:30px 32px 26px;color:#F8F3ED"><div style="font-size:18px;font-weight:900;letter-spacing:.3px">AUN <span style="color:#68ECCB">ONLINE MART</span></div><div style="display:inline-block;margin-top:20px;padding:7px 11px;border-radius:999px;background:#68ECCB;color:#01193D;font-size:11px;font-weight:800;letter-spacing:.7px">${copy.label}</div><h1 style="margin:16px 0 7px;font-size:28px;line-height:34px">${copy.headline}</h1><p style="margin:0;color:#C8D8ED;font-size:14px">Order #${escapeHtml(data.order.order_number)}</p></header><main style="margin:0 12px 12px;padding:26px 20px;background:#FFFFFF;border-radius:18px"><div style="color:#31465C;font-size:15px;line-height:23px">${copy.message(escapeHtml(firstName))}</div><div style="margin:21px 0;padding:16px;border-radius:13px;background:#E9F8F3"><div style="font-size:12px;color:#176E73;font-weight:800;text-transform:uppercase">${locationLabel}</div><div style="margin-top:6px;font-size:14px;line-height:21px;color:#23445A">${locationDetails || 'Details will be shared as soon as they are available.'}</div>${vendorDetails}</div><h2 style="margin:23px 0 5px;font-size:17px">Order summary</h2><table style="width:100%;border-collapse:collapse">${lines}</table>${summary}<div style="margin-top:24px;padding-top:18px;border-top:1px solid #DCE5F1;color:#66809E;font-size:12px;line-height:19px"><strong style="color:#01193D">AUN Online Mart</strong><br>Shop. Sell. Deliver. Repeat.<br><a href="mailto:${supportEmail}" style="color:#176E73">${supportEmail}</a> · ${supportPhone}<br><br>If you have any questions or experience an issue with your order, please contact us.</div></main></section></div></body></html>`;
  const text = `${copy.headline}\n\nHi ${firstName},\n\n${copy.message(firstName).replaceAll('<br>', '\n')}\n\nOrder #${data.order.order_number}\n${pickup ? `Pickup: ${location || 'Details to follow'}` : `Delivery: ${location || 'Details to follow'}`}${timing ? `\nTime: ${timing}` : ''}\n\n${data.lines.map((line) => `x${line.quantity} ${line.product_name} — ${money(Number(line.total_price ?? Number(line.unit_price) * Number(line.quantity)))}`).join('\n')}\n\nSubtotal: ${money(subtotal)}\n${deliveryFee ? `Delivery fee: ${money(deliveryFee)}\n` : ''}TOTAL: ${money(total)}\n\nAUN Online Mart · ${supportEmail} · ${supportPhone}`;
  return { subject: copy.subject(data.order.order_number), html, text };
}

export async function sendOrderEmail(orderId: string, event: OrderEmailEvent, retry = false) {
  const data = await orderEmailData(orderId);
  const { db } = data;
  const { data: existing, error: existingError } = await db.from('order_email_events').select('id, status').eq('order_id', orderId).eq('event_type', event).maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing?.status === 'sent') return { status: 'already_sent' };
  if (existing && !retry) return { status: existing.status === 'failed' ? 'failed_needs_retry' : 'already_processing' };
  const now = new Date().toISOString();
  const { data: log, error: logError } = existing
    ? await db.from('order_email_events').update({ status: 'sending', recipient: data.recipient, error_message: null, updated_at: now }).eq('id', existing.id).select('id').single()
    : await db.from('order_email_events').insert({ order_id: orderId, event_type: event, recipient: data.recipient, status: 'sending', updated_at: now }).select('id').single();
  if (logError || !log) throw new Error(logError?.message ?? 'Could not create the email event log.');
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) {
    await db.from('order_email_events').update({ status: 'failed', error_message: 'RESEND_API_KEY is not configured.', updated_at: new Date().toISOString() }).eq('id', log.id);
    return { status: 'failed_not_configured' };
  }
  const email = renderOrderEmail(event, data);
  try {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: Deno.env.get('EMAIL_FROM') ?? Deno.env.get('ORDER_ALERT_FROM') ?? 'AUN Online Mart <onboarding@resend.dev>', to: [data.recipient], ...(Deno.env.get('EMAIL_REPLY_TO') ?? Deno.env.get('ORDER_ALERT_REPLY_TO') ? { reply_to: Deno.env.get('EMAIL_REPLY_TO') ?? Deno.env.get('ORDER_ALERT_REPLY_TO') } : {}), ...email }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.message ?? 'Resend rejected the email.');
    await db.from('order_email_events').update({ status: 'sent', provider_message_id: body?.id ?? null, sent_at: new Date().toISOString(), error_message: null, updated_at: new Date().toISOString() }).eq('id', log.id);
    return { status: 'sent', provider_message_id: body?.id ?? null };
  } catch (error) {
    await db.from('order_email_events').update({ status: 'failed', error_message: error instanceof Error ? error.message : 'Email delivery failed.', updated_at: new Date().toISOString() }).eq('id', log.id);
    return { status: 'failed' };
  }
}

export async function previewOrderEmail(event: OrderEmailEvent) {
  const sample = { order: { order_number: 'AOM-1042', total: 7350, amount_paid: 7350, subtotal: 5600, delivery_fee: 500, rush_hour_discount: 0, delivery_type: event === 'ready_for_pickup' ? 'pickup' : 'delivery', delivery_address: 'Rosaria Volpi Girls · Room B214', delivery_instructions: null, delivery_slot: '4:00 PM – 6:00 PM' }, fullName: 'Runo Odjesa', lines: [{ product_name: 'Jollof rice', unit_price: 2200, quantity: 2, total_price: 4400 }, { product_name: 'Moi-moi', unit_price: 400, quantity: 3, total_price: 1200 }], vendors: [{ id: 'sample', name: "Sholly's Restaurant", pickup_location: 'AUN Campus Market' }], hasCafeteria: false } as unknown as Awaited<ReturnType<typeof orderEmailData>>;
  return renderOrderEmail(event, sample);
}
