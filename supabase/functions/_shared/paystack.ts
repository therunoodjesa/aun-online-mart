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
type RawCheckoutOption = { id: string; quantity?: number };
type RawCheckoutItem = { productId: string; quantity: number; selectedOptions?: RawCheckoutOption[]; note?: string | null };

const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

function legacyOptionSelections(productId: string): RawCheckoutOption[] {
  const suffix = productId.length > 36 ? productId.slice(37) : '';
  const quantityMatches = [...suffix.matchAll(new RegExp(`(${uuidPattern})-(\\d+)`, 'gi'))];
  if (quantityMatches.length) return quantityMatches.map((match) => ({ id: match[1], quantity: Number(match[2]) }));
  const bareOption = suffix.split(':').find((segment) => new RegExp(`^${uuidPattern}$`, 'i').test(segment));
  return bareOption ? [{ id: bareOption, quantity: 1 }] : [];
}

export async function priceCart(rawItems: RawCheckoutItem[], fulfilment: 'delivery' | 'pickup' = 'delivery', deliverySlot: string | null = null) {
  const normalised = rawItems.map((item) => ({ ...item, productId: String(item.productId) })).filter((item) => item.quantity > 0 && item.quantity <= 25);
  if (!normalised.length) throw new Error('Your cart is empty.');
  if (normalised.some((item) => item.productId.startsWith('cafeteria:'))) throw new Error('Cafeteria checkout is being connected separately. Please remove cafeteria items to pay for this order.');
  const ids = [...new Set(normalised.map((item) => item.productId.slice(0, 36)))];
  const db = admin();
  const { data: products } = await db.from('products').select('id, name, price, status, stock_quantity, marketplace_category').in('id', ids).eq('status', 'available');
  if (!products || products.length !== ids.length) throw new Error('One or more items are no longer available. Please refresh your cart.');
  const requestedByProduct = new Map<string, number>();
  for (const item of normalised) {
    const productId = item.productId.slice(0, 36);
    requestedByProduct.set(productId, (requestedByProduct.get(productId) ?? 0) + Math.floor(item.quantity));
  }
  const shortProduct = products.find((product) => product.stock_quantity !== null && Number(product.stock_quantity) < (requestedByProduct.get(product.id) ?? 0));
  if (shortProduct) throw new Error(`${shortProduct.name} does not have enough stock for this order. Please adjust your cart.`);
  const { data: options } = await db.from('product_options').select('id, product_id, name, price_modifier, is_available').in('product_id', ids).eq('is_available', true);
  const byId = new Map(products.map((product) => [product.id, product]));
  const optionsById = new Map((options ?? []).map((option) => [option.id, option]));
  const lines: CheckoutLine[] = normalised.map((item) => {
    const productId = item.productId.slice(0, 36);
    const product = byId.get(productId)!;
    const requestedOptions = Array.isArray(item.selectedOptions) ? item.selectedOptions : legacyOptionSelections(item.productId);
    const selected: { id: string; name: string; quantity: number; price_modifier: number }[] = [];
    for (const selection of requestedOptions) {
      const option = optionsById.get(String(selection.id));
      const quantity = Math.max(0, Math.floor(Number(selection.quantity ?? 1)));
      if (quantity <= 0) continue;
      if (!option || option.product_id !== product.id) throw new Error(`A selected option for ${product.name} is no longer available. Please reopen the item and choose again.`);
      selected.push({ id: option.id, name: option.name, quantity, price_modifier: Number(option.price_modifier) });
    }
    const unitPrice = Number(product.price) + selected.reduce((total, option) => total + option.price_modifier * option.quantity, 0);
    return { product_id: product.id, product_name: product.name, unit_price: unitPrice, quantity: Math.floor(item.quantity), selected_options: selected, note: typeof item.note === 'string' && item.note.trim() ? item.note.trim().slice(0, 500) : null };
  });
  const subtotal = lines.reduce((total, line) => total + line.unit_price * line.quantity, 0);
  const serviceFee = Math.round(subtotal * 0.1);
  const marketplaceOnly = products.every((product) => Boolean(product.marketplace_category));
  const { data: activityRows } = marketplaceOnly && fulfilment === 'delivery'
    ? await db.rpc('get_marketplace_rush_hour_activity', { p_delivery_slot: deliverySlot })
    : { data: [] as { is_enabled: boolean; qualifying_orders: number; qualifying_threshold: number; standard_delivery_fee: number; rush_delivery_fee: number }[] };
  const activity = activityRows?.[0];
  const standardDeliveryFee = Number(activity?.standard_delivery_fee ?? 2500);
  const rushDeliveryFee = Number(activity?.rush_delivery_fee ?? 1000);
  const rushHourActive = Boolean(activity?.is_enabled) && Number(activity?.qualifying_orders ?? 0) >= Number(activity?.qualifying_threshold ?? 5);
  const deliveryFee = fulfilment === 'pickup' ? 0 : rushHourActive ? rushDeliveryFee : standardDeliveryFee;
  const rushHour = { active: rushHourActive, qualifying_orders: Number(activity?.qualifying_orders ?? 0), threshold: Number(activity?.qualifying_threshold ?? 5), standard_delivery_fee: standardDeliveryFee, discounted_delivery_fee: rushDeliveryFee, savings: rushHourActive ? Math.max(0, standardDeliveryFee - rushDeliveryFee) : 0 };
  return { lines, subtotal, serviceFee, deliveryFee, rushHour, total: subtotal + serviceFee + deliveryFee };
}
