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

export type CheckoutLine = {
  source: 'marketplace' | 'cafeteria';
  product_id: string | null;
  cafeteria_product_id: string | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  selected_options: unknown[];
  note: string | null;
  meal_plan_credit: number;
  packaging_fee: number;
};
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

export async function priceCart(rawItems: RawCheckoutItem[], fulfilment: 'delivery' | 'pickup' = 'delivery', deliverySlot: string | null = null, userId: string | null = null, useMealPlan = false) {
  const normalised = rawItems.map((item) => ({ ...item, productId: String(item.productId) })).filter((item) => item.quantity > 0 && item.quantity <= 25);
  if (!normalised.length) throw new Error('Your cart is empty.');
  if (normalised.some((item) => item.productId.startsWith('service:'))) throw new Error('Service bookings must be checked out separately from products.');
  const marketplaceItems = normalised.filter((item) => !item.productId.startsWith('cafeteria:'));
  const cafeteriaItems = normalised.filter((item) => item.productId.startsWith('cafeteria:'));
  const ids = [...new Set(marketplaceItems.map((item) => item.productId.slice(0, 36)))];
  const cafeteriaIds = [...new Set(cafeteriaItems.map((item) => item.productId.slice('cafeteria:'.length, 'cafeteria:'.length + 36)))];
  const db = admin();
  const [{ data: products }, { data: cafeteriaProducts }, { data: cafeteriaSettings }] = await Promise.all([
    ids.length ? db.from('products').select('id, vendor_id, name, price, status, stock_quantity, marketplace_category').in('id', ids).eq('status', 'available') : Promise.resolve({ data: [] }),
    cafeteriaIds.length ? db.from('cafeteria_products').select('id, name, price, status, stock_quantity, category, categories, meal_plan_eligible').in('id', cafeteriaIds).eq('status', 'available') : Promise.resolve({ data: [] }),
    cafeteriaIds.length ? db.from('cafeteria_settings').select('is_accepting_orders, snacks_open, lunch_open, dinner_open').eq('id', true).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!products || products.length !== ids.length || !cafeteriaProducts || cafeteriaProducts.length !== cafeteriaIds.length) throw new Error('One or more items are no longer available. Please refresh your cart.');
  if (cafeteriaIds.length && cafeteriaSettings?.is_accepting_orders === false) throw new Error('Cafeteria ordering is temporarily paused. Please remove those items or try again later.');
  for (const product of cafeteriaProducts ?? []) {
    const categories = Array.isArray(product.categories) && product.categories.length ? product.categories : [product.category];
    if (!categories.some((category: string) => cafeteriaSettings?.[`${category}_open`] !== false)) throw new Error(`${product.name} is outside its cafeteria ordering period right now.`);
  }
  const requestedByProduct = new Map<string, number>();
  for (const item of marketplaceItems) {
    const productId = item.productId.slice(0, 36);
    requestedByProduct.set(productId, (requestedByProduct.get(productId) ?? 0) + Math.floor(item.quantity));
  }
  const shortProduct = products.find((product) => product.stock_quantity !== null && Number(product.stock_quantity) < (requestedByProduct.get(product.id) ?? 0));
  if (shortProduct) throw new Error(`${shortProduct.name} does not have enough stock for this order. Please adjust your cart.`);
  const cafeteriaRequested = new Map<string, number>();
  for (const item of cafeteriaItems) {
    const productId = item.productId.slice('cafeteria:'.length, 'cafeteria:'.length + 36);
    cafeteriaRequested.set(productId, (cafeteriaRequested.get(productId) ?? 0) + Math.floor(item.quantity));
  }
  const shortCafeteriaProduct = cafeteriaProducts.find((product) => product.stock_quantity !== null && Number(product.stock_quantity) < (cafeteriaRequested.get(product.id) ?? 0));
  if (shortCafeteriaProduct) throw new Error(`${shortCafeteriaProduct.name} does not have enough stock for this order. Please adjust your cart.`);
  const [{ data: options }, { data: cafeteriaOptions }] = await Promise.all([
    ids.length ? db.from('product_options').select('id, product_id, name, price_modifier, is_available').in('product_id', ids).eq('is_available', true) : Promise.resolve({ data: [] }),
    cafeteriaIds.length ? db.from('cafeteria_product_options').select('id, product_id, option_group, name, price_modifier, is_available').in('product_id', cafeteriaIds).eq('is_available', true) : Promise.resolve({ data: [] }),
  ]);
  const byId = new Map(products.map((product) => [product.id, product]));
  const optionsById = new Map((options ?? []).map((option) => [option.id, option]));
  const regularLines: CheckoutLine[] = marketplaceItems.map((item) => {
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
    return { source: 'marketplace', product_id: product.id, cafeteria_product_id: null, product_name: product.name, unit_price: unitPrice, quantity: Math.floor(item.quantity), selected_options: selected, note: typeof item.note === 'string' && item.note.trim() ? item.note.trim().slice(0, 500) : null, meal_plan_credit: 0, packaging_fee: 0 };
  });
  const cafeteriaById = new Map(cafeteriaProducts.map((product) => [product.id, product]));
  const cafeteriaOptionsById = new Map((cafeteriaOptions ?? []).map((option) => [option.id, option]));
  const cafeteriaLines: (CheckoutLine & { meal_plan_eligible?: boolean; isMeal?: boolean })[] = cafeteriaItems.map((item) => {
    const productId = item.productId.slice('cafeteria:'.length, 'cafeteria:'.length + 36);
    const product = cafeteriaById.get(productId)!;
    const legacyId = item.productId.slice('cafeteria:'.length);
    const requestedOptions = Array.isArray(item.selectedOptions) && item.selectedOptions.length ? item.selectedOptions : legacyOptionSelections(legacyId);
    const selected: { id: string; group: string; name: string; quantity: number; price_modifier: number }[] = [];
    for (const selection of requestedOptions) {
      const option = cafeteriaOptionsById.get(String(selection.id));
      const quantity = Math.max(0, Math.floor(Number(selection.quantity ?? 1)));
      if (quantity <= 0) continue;
      if (!option || option.product_id !== product.id) throw new Error(`A selected option for ${product.name} is no longer available. Please reopen the item and choose again.`);
      selected.push({ id: option.id, group: option.option_group, name: option.name, quantity, price_modifier: Number(option.price_modifier) });
    }
    const unitPrice = Number(product.price) + selected.reduce((total, option) => total + option.price_modifier * option.quantity, 0);
    const categories = Array.isArray(product.categories) && product.categories.length ? product.categories : [product.category];
    const isMeal = categories.includes('lunch') || categories.includes('dinner');
    return { source: 'cafeteria', product_id: null, cafeteria_product_id: product.id, product_name: product.name, unit_price: unitPrice, quantity: Math.floor(item.quantity), selected_options: selected, note: typeof item.note === 'string' && item.note.trim() ? item.note.trim().slice(0, 500) : null, meal_plan_credit: 0, packaging_fee: 0, meal_plan_eligible: Boolean(product.meal_plan_eligible), isMeal };
  });
  // ₦800 cafeteria delivery already covers packaging for the first plate.
  // Charge ₦200 for every additional lunch/dinner plate, not every plate.
  let remainingPackagingFee = Math.max(0, cafeteriaLines.filter((line) => line.isMeal).reduce((total, line) => total + line.quantity, 0) - 1) * 200;
  for (const line of cafeteriaLines) {
    if (!line.isMeal || remainingPackagingFee <= 0) continue;
    const lineFee = Math.min(remainingPackagingFee, line.quantity * 200);
    line.packaging_fee = lineFee;
    remainingPackagingFee -= lineFee;
  }
  let remainingMealPlanCredit = 0;
  if (useMealPlan && userId && cafeteriaLines.length) {
    const { data: account } = await db.from('meal_plan_accounts').select('plan_count, meals_used_today, last_used_on').eq('user_id', userId).maybeSingle();
    if (account) {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
      const usedToday = account.last_used_on === today ? Number(account.meals_used_today ?? 0) : 0;
      remainingMealPlanCredit = Math.max(0, Number(account.plan_count ?? 0) - usedToday) * 1800;
    }
  }
  for (const line of cafeteriaLines) {
    if (!line.meal_plan_eligible || remainingMealPlanCredit <= 0) continue;
    const credit = Math.min(line.unit_price * line.quantity, remainingMealPlanCredit);
    line.meal_plan_credit = credit;
    remainingMealPlanCredit -= credit;
  }
  for (const line of cafeteriaLines) {
    delete line.meal_plan_eligible;
    delete line.isMeal;
  }
  const lines = [...regularLines, ...cafeteriaLines];
  const subtotal = lines.reduce((total, line) => total + line.unit_price * line.quantity, 0);
  const marketplaceSubtotal = regularLines.reduce((total, line) => total + line.unit_price * line.quantity, 0);
  const serviceFee = Math.round(marketplaceSubtotal * 0.1);
  const packagingFee = cafeteriaLines.reduce((total, line) => total + line.packaging_fee, 0);
  const mealPlanCredit = cafeteriaLines.reduce((total, line) => total + line.meal_plan_credit, 0);
  const vendorIds = [...new Set(products.map((product) => product.vendor_id).filter(Boolean))] as string[];
  const { data: vendorRows, error: vendorLocationError } = vendorIds.length
    ? await db.from('vendors').select('id, operating_location').in('id', vendorIds)
    : { data: [] as { id: string; operating_location: string | null }[], error: null };
  // Keep unclassified or legacy vendors on the existing rate. The campus rate
  // only applies when every product has a vendor and every represented vendor
  // is explicitly tagged as operating on campus.
  const allVendorsAreOnCampus = !vendorLocationError
    && vendorIds.length > 0
    && products.every((product) => Boolean(product.vendor_id))
    && vendorRows?.length === vendorIds.length
    && vendorRows.every((vendor) => vendor.operating_location === 'on_campus');
  const campusDeliveryActive = fulfilment === 'delivery' && allVendorsAreOnCampus;
  const campusDeliveryFee = 500;
  const marketplaceOnly = products.every((product) => Boolean(product.marketplace_category));
  const { data: activityRows } = marketplaceOnly && fulfilment === 'delivery'
    ? await db.rpc('get_marketplace_rush_hour_activity', { p_delivery_slot: deliverySlot })
    : { data: [] as { is_enabled: boolean; qualifying_orders: number; qualifying_threshold: number; standard_delivery_fee: number; rush_delivery_fee: number }[] };
  const activity = activityRows?.[0];
  const standardDeliveryFee = Number(activity?.standard_delivery_fee ?? 2500);
  const rushDeliveryFee = Number(activity?.rush_delivery_fee ?? 1000);
  const rushHourActive = !campusDeliveryActive && Boolean(activity?.is_enabled) && Number(activity?.qualifying_orders ?? 0) >= Number(activity?.qualifying_threshold ?? 5);
  const cafeteriaOnly = cafeteriaLines.length > 0 && regularLines.length === 0;
  const deliveryFee = fulfilment === 'pickup' ? 0 : cafeteriaOnly ? 800 : campusDeliveryActive ? campusDeliveryFee : rushHourActive ? rushDeliveryFee : standardDeliveryFee;
  const rushHour = { active: rushHourActive, qualifying_orders: Number(activity?.qualifying_orders ?? 0), threshold: Number(activity?.qualifying_threshold ?? 5), standard_delivery_fee: standardDeliveryFee, discounted_delivery_fee: rushDeliveryFee, savings: rushHourActive ? Math.max(0, standardDeliveryFee - rushDeliveryFee) : 0 };
  const campusDelivery = { active: campusDeliveryActive, fee: campusDeliveryFee, qualifying_vendor_count: campusDeliveryActive ? vendorIds.length : 0 };
  return { lines, subtotal, serviceFee, packagingFee, mealPlanCredit, deliveryFee, campusDelivery, rushHour, total: subtotal + serviceFee + packagingFee + deliveryFee - mealPlanCredit };
}
