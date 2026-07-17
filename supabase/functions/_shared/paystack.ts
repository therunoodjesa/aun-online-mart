import { createClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

export const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

export async function getUser(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data } = await client.auth.getUser();
  return data.user ?? null;
}

export async function paystack(path: string, init?: RequestInit) {
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!secret) throw new Error('Paystack is not configured.');
  const response = await fetch(`https://api.paystack.co${path}`, { ...init, headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const body = await response.json();
  if (!response.ok || !body.status) throw new Error(body.message ?? 'Paystack could not process this request.');
  return body.data;
}

export type CheckoutLine = { product_id: string; product_name: string; unit_price: number; quantity: number; selected_options: unknown[]; note: string | null };

export async function priceCart(rawItems: { productId: string; quantity: number }[], fulfilment: 'delivery' | 'pickup' = 'delivery') {
  const normalised = rawItems.map((item) => ({ ...item, productId: String(item.productId) })).filter((item) => item.quantity > 0 && item.quantity <= 25);
  if (!normalised.length) throw new Error('Your cart is empty.');
  if (normalised.some((item) => item.productId.startsWith('cafeteria:'))) throw new Error('Cafeteria checkout is being connected separately. Please remove cafeteria items to pay for this order.');
  const ids = [...new Set(normalised.map((item) => item.productId.slice(0, 36)))];
  const db = admin();
  const { data: products } = await db.from('products').select('id, name, price, status').in('id', ids).eq('status', 'available');
  if (!products || products.length !== ids.length) throw new Error('One or more items are no longer available. Please refresh your cart.');
  const { data: options } = await db.from('product_options').select('id, name, price_modifier, is_available').in('product_id', ids).eq('is_available', true);
  const byId = new Map(products.map((product) => [product.id, product]));
  const optionsById = new Map((options ?? []).map((option) => [option.id, option]));
  const lines: CheckoutLine[] = normalised.map((item) => {
    const productId = item.productId.slice(0, 36);
    const product = byId.get(productId)!;
    const optionKey = item.productId.slice(37).split(':')[0] ?? '';
    const matches = [...optionKey.matchAll(/([0-9a-f]{8}-[0-9a-f-]{27,36})-(\d+)/gi)];
    const selected = matches.flatMap((match) => { const option = optionsById.get(match[1]); const quantity = Number(match[2]); return option && quantity > 0 ? [{ id: option.id, name: option.name, quantity, price_modifier: Number(option.price_modifier) }] : []; });
    if (!matches.length && /^[0-9a-f-]{36}$/i.test(optionKey)) { const option = optionsById.get(optionKey); if (option) selected.push({ id: option.id, name: option.name, quantity: 1, price_modifier: Number(option.price_modifier) }); }
    const unitPrice = Number(product.price) + selected.reduce((total, option) => total + option.price_modifier * option.quantity, 0);
    return { product_id: product.id, product_name: product.name, unit_price: unitPrice, quantity: Math.floor(item.quantity), selected_options: selected, note: null };
  });
  const subtotal = lines.reduce((total, line) => total + line.unit_price * line.quantity, 0);
  const serviceFee = Math.round(subtotal * 0.1);
  const deliveryFee = fulfilment === 'pickup' ? 0 : 2500;
  return { lines, subtotal, serviceFee, deliveryFee, total: subtotal + serviceFee + deliveryFee };
}
