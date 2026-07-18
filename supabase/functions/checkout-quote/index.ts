import { corsHeaders, getUser, json, priceCart } from '../_shared/paystack.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await getUser(request);
    if (!user) return json({ error: 'Please sign in to view your checkout price.' }, 401);
    const body = await request.json();
    const fulfilment = body.fulfilment === 'pickup' ? 'pickup' : 'delivery';
    const pricing = await priceCart(body.items ?? [], fulfilment, typeof body.slot === 'string' ? body.slot : null);
    return json({ pricing });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not calculate this checkout.' }, 400);
  }
});
