import { admin, json } from '../_shared/paystack.ts';

type PurchasedOption = { name?: string; quantity?: number; price_modifier?: number };
type PurchasedItem = {
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  options: PurchasedOption[] | null;
  notes: string | null;
  products: { vendor_id: string } | null;
};

const naira = (amount: number) => `₦${Math.round(amount).toLocaleString('en-NG')}`;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] ?? character));

function lineDescription(item: PurchasedItem) {
  const options = (item.options ?? []).map((option) => `${option.quantity && option.quantity > 1 ? `${option.quantity}× ` : ''}${option.name ?? 'Option'}`).join(', ');
  const note = item.notes?.trim();
  return `${item.quantity}× ${item.product_name}${options ? ` (${options})` : ''}${note ? ` — Note: ${note}` : ''}`;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const expectedSecret = Deno.env.get('VENDOR_ALERT_INTERNAL_SECRET');
  if (!expectedSecret || request.headers.get('X-Internal-Secret') !== expectedSecret) return json({ error: 'Unauthorized.' }, 401);

  try {
    const { order_id } = await request.json();
    if (typeof order_id !== 'string') return json({ error: 'Order ID is required.' }, 400);

    const db = admin();
    const { data: order, error: orderError } = await db
      .from('orders')
      .select('id, order_number, delivery_type, delivery_address, delivery_slot, payment_status')
      .eq('id', order_id)
      .single();
    if (orderError || !order) throw new Error(orderError?.message ?? 'Order not found.');
    if (order.payment_status !== 'paid') return json({ status: 'skipped', reason: 'Order is not paid.' });

    const { data: rawItems, error: itemsError } = await db
      .from('order_items')
      .select('product_id, product_name, unit_price, quantity, options, notes, products!inner(vendor_id)')
      .eq('order_id', order.id);
    if (itemsError) throw new Error(itemsError.message);
    const items = (rawItems ?? []) as PurchasedItem[];
    const vendorIds = [...new Set(items.map((item) => item.products?.vendor_id).filter(Boolean) as string[])];
    if (!vendorIds.length) return json({ status: 'skipped', reason: 'No vendor items found.' });

    const { data: vendors, error: vendorsError } = await db
      .from('vendors')
      .select('id, name, owner_id, pickup_location')
      .in('id', vendorIds);
    if (vendorsError) throw new Error(vendorsError.message);

    const resendKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('ORDER_ALERT_FROM') ?? 'AUN Online Mart <onboarding@resend.dev>';
    const replyTo = Deno.env.get('ORDER_ALERT_REPLY_TO');
    const portalUrl = Deno.env.get('VENDOR_PORTAL_URL');
    const results: { vendor_id: string; status: string }[] = [];

    for (const vendor of vendors ?? []) {
      const { data: existing } = await db.from('vendor_order_alerts')
        .select('id, status')
        .eq('order_id', order.id)
        .eq('vendor_id', vendor.id)
        .eq('channel', 'email')
        .maybeSingle();
      if (existing?.status === 'sent') { results.push({ vendor_id: vendor.id, status: 'already_sent' }); continue; }

      const vendorItems = items.filter((item) => item.products?.vendor_id === vendor.id);
      const subtotal = vendorItems.reduce((total, item) => total + Number(item.unit_price) * item.quantity, 0);
      const fulfilment = order.delivery_type === 'pickup'
        ? `Customer pickup — the customer will collect from your pickup location${vendor.pickup_location ? ` (${vendor.pickup_location})` : ''}. No dispatch rider is required.`
        : vendorIds.length === 1
          ? 'Dispatch rider pickup — you are the only vendor on this pickup route.'
          : 'Dispatch rider pickup — this is a multi-vendor route, so the rider will also collect from other stores.';
      const location = order.delivery_type === 'pickup' ? 'Customer will pick up from your store.' : (order.delivery_address || 'Delivery address will be confirmed in the vendor portal.');
      const owner = vendor.owner_id ? await db.auth.admin.getUserById(vendor.owner_id) : { data: { user: null } };
      const recipient = owner.data.user?.email ?? null;
      const payload = { order_number: order.order_number, vendor_items: vendorItems, fulfilment, location };

      const saveAlert = async (status: 'sent' | 'failed' | 'skipped', extra: Record<string, unknown> = {}) => {
        await db.from('vendor_order_alerts').upsert({
          order_id: order.id, vendor_id: vendor.id, channel: 'email', recipient, status, payload,
          attempts: (existing?.status ? 1 : 0) + 1, updated_at: new Date().toISOString(), ...extra,
        }, { onConflict: 'order_id,vendor_id,channel' });
      };

      if (!recipient) { await saveAlert('skipped', { error_message: 'Vendor account has no email address.' }); results.push({ vendor_id: vendor.id, status: 'skipped_no_email' }); continue; }
      if (!resendKey) { await saveAlert('failed', { error_message: 'RESEND_API_KEY is not configured.' }); results.push({ vendor_id: vendor.id, status: 'failed_not_configured' }); continue; }

      const itemText = vendorItems.map(lineDescription);
      const plainText = [
        `New paid order ${order.order_number}`,
        '',
        `Items for ${vendor.name}:`,
        ...itemText.map((line) => `• ${line}`),
        `Vendor items subtotal: ${naira(subtotal)}`,
        '',
        `Fulfilment: ${fulfilment}`,
        `Customer location: ${location}`,
        order.delivery_slot ? `Requested slot: ${order.delivery_slot}` : '',
        portalUrl ? `Open your portal: ${portalUrl}` : '',
      ].filter(Boolean).join('\n');
      const itemHtml = itemText.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
      const html = `<main style="font-family:Arial,sans-serif;color:#01193D;max-width:620px;margin:auto"><h1 style="margin-bottom:4px">New paid order</h1><p style="margin-top:0;color:#52708f"><strong>${escapeHtml(order.order_number)}</strong> · ${escapeHtml(vendor.name)}</p><section style="background:#f3f7fb;border-radius:12px;padding:18px"><h2 style="font-size:18px;margin-top:0">Your items</h2><ul>${itemHtml}</ul><p><strong>Vendor items subtotal: ${naira(subtotal)}</strong></p></section><h2 style="font-size:18px">Fulfilment</h2><p>${escapeHtml(fulfilment)}</p><p><strong>Customer location:</strong> ${escapeHtml(location)}</p>${order.delivery_slot ? `<p><strong>Requested slot:</strong> ${escapeHtml(order.delivery_slot)}</p>` : ''}${portalUrl ? `<p><a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#01193D;color:#fff;text-decoration:none;padding:12px 16px;border-radius:8px">Open vendor portal</a></p>` : ''}</main>`;

      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [recipient], ...(replyTo ? { reply_to: replyTo } : {}), subject: `New paid order ${order.order_number}`, html, text: plainText }),
      });
      const resendBody = await resendResponse.json();
      if (!resendResponse.ok) {
        await saveAlert('failed', { error_message: resendBody?.message ?? 'Email provider rejected the request.' });
        results.push({ vendor_id: vendor.id, status: 'failed' });
        continue;
      }
      await saveAlert('sent', { provider_message_id: resendBody?.id ?? null, error_message: null, sent_at: new Date().toISOString() });
      results.push({ vendor_id: vendor.id, status: 'sent' });
    }
    return json({ status: 'complete', alerts: results });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not send vendor alerts.' }, 400);
  }
});
