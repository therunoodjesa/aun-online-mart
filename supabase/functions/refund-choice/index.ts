import { admin, corsHeaders, getUser, json } from '../_shared/paystack.ts';

type RefundChoice = {
  order_id?: string;
  destination?: 'aom_credit' | 'bank_transfer';
  bank_name?: string;
  account_name?: string;
  account_number?: string;
};

const clean = (value: unknown, limit: number) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const user = await getUser(request);
    if (!user) return json({ error: 'Please sign in again before choosing a refund.' }, 401);
    const body = await request.json() as RefundChoice;
    if (!body.order_id || !['aom_credit', 'bank_transfer'].includes(body.destination ?? '')) return json({ error: 'Choose AOM Credit or bank refund.' }, 400);
    const db = admin();
    const { data: order, error: orderError } = await db.from('orders')
      .select('id, order_number, total, payment_status, status, user_id')
      .eq('id', body.order_id).eq('user_id', user.id).maybeSingle();
    if (orderError) throw new Error(orderError.message);
    if (!order) return json({ error: 'This refund is not available in this account.' }, 404);
    if (order.status !== 'cancelled' || order.payment_status !== 'paid') return json({ error: 'A refund can be selected after a paid order is cancelled.' }, 400);
    const amount = Math.round(Number(order.total ?? 0) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'This order does not have a refundable payment balance.' }, 400);

    const bankName = clean(body.bank_name, 100);
    const accountName = clean(body.account_name, 120);
    const accountNumber = clean(body.account_number, 24).replace(/\s/g, '');
    if (body.destination === 'bank_transfer' && (!bankName || !accountName || !/^\d{10}$/.test(accountNumber))) {
      return json({ error: 'Enter the bank name, account name, and a valid 10-digit account number.' }, 400);
    }

    const status = body.destination === 'aom_credit' ? 'credited' : 'pending_bank_transfer';
    const { error: requestError } = await db.from('order_refund_requests').insert({
      order_id: order.id, user_id: user.id, amount, destination: body.destination, status,
      bank_name: body.destination === 'bank_transfer' ? bankName : null,
      account_name: body.destination === 'bank_transfer' ? accountName : null,
      account_number: body.destination === 'bank_transfer' ? accountNumber : null,
    });
    if (requestError) {
      if (requestError.code === '23505') return json({ error: 'You have already chosen a refund method for this order.' }, 409);
      throw new Error(requestError.message);
    }

    if (body.destination === 'aom_credit') {
      const { error: creditError } = await db.from('aom_wallet_transactions').insert({
        user_id: user.id, amount, kind: 'refund_credit', order_id: order.id,
        description: `Refund for cancelled order ${order.order_number}`,
      });
      if (creditError) throw new Error(creditError.message);
      await db.from('order_updates').insert({ order_id: order.id, message: `₦${amount.toLocaleString('en-NG')} was added to your AOM Credit.`, update_type: 'system' });
      await db.from('notifications').insert({ user_id: user.id, title: 'Refund added to AOM Credit', body: `₦${amount.toLocaleString('en-NG')} is ready to use on your next AOM order.`, message: 'Your refund has been added to AOM Credit.', kind: 'order', action_label: 'VIEW AOM CREDIT', action_href: '/(buyer)/wallet' });
      return json({ status: 'credited', amount });
    }

    await db.from('order_updates').insert({ order_id: order.id, message: `Bank refund requested for ₦${amount.toLocaleString('en-NG')}. AOM will process it manually.`, update_type: 'system' });
    await db.from('notifications').insert({ user_id: user.id, title: 'Bank refund requested', body: `Your ₦${amount.toLocaleString('en-NG')} refund request has been sent to AOM.`, message: 'We will process your bank refund manually.', kind: 'order', action_label: 'VIEW ORDER', action_href: `/(buyer)/order/${order.id}` });
    return json({ status: 'pending_bank_transfer', amount });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not save your refund choice.' }, 400);
  }
});
