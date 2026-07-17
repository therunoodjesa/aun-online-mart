import { admin, corsHeaders, getUser, json } from '../_shared/paystack.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const user = await getUser(request);
    if (!user) return json({ error: 'Please sign in to manage store availability.' }, 401);
    const body = await request.json();
    if (body?.action !== 'mark_all_sold_out') return json({ error: 'Unknown availability action.' }, 400);

    const db = admin();
    const { data: vendor, error: vendorError } = await db.from('vendors').select('id').eq('owner_id', user.id).maybeSingle();
    if (vendorError || !vendor) return json({ error: vendorError?.message ?? 'No vendor store is linked to this account.' }, 403);

    const { data: available, error: availableError } = await db.from('products').select('id').eq('vendor_id', vendor.id).eq('status', 'available');
    if (availableError) throw new Error(availableError.message);
    const productIds = (available ?? []).map((item) => item.id);
    if (!productIds.length) return json({ updated: 0 });

    const { error: updateError } = await db.from('products').update({ status: 'sold_out' }).in('id', productIds);
    if (updateError) throw new Error(updateError.message);
    return json({ updated: productIds.length });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not update item availability.' }, 400);
  }
});
