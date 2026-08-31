import { admin, corsHeaders, getUser, json } from '../_shared/paystack.ts';

type ProductOption = { option_group?: string; name?: string; price_modifier?: number; is_available?: boolean; selection_mode?: 'single' | 'multiple' };
type ServiceOption = { name?: string; price?: number; duration_minutes?: number; is_available?: boolean };
type ProductPayload = { name?: string; description?: string | null; price?: number; stock_quantity?: number | null; category?: string | null; marketplace_category?: string | null; marketplace_subcategory?: string | null; image_url?: string | null; status?: 'available' | 'sold_out' | 'hidden' };
type ServicePayload = { name?: string; category?: string; description?: string | null; starting_price?: number; duration_minutes?: number; image_url?: string | null; is_available?: boolean };
type SaveRequest = { kind?: 'product' | 'service'; id?: string | null; product?: ProductPayload; service?: ServicePayload; placements?: { section?: 'marketplace' | 'supermarket'; category?: string }[]; options?: ProductOption[] | ServiceOption[]; addons?: ServiceOption[] };

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const number = (value: unknown) => Number(value);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const user = await getUser(request);
    if (!user) return json({ error: 'Your session has expired. Please sign in again, then return to your catalogue.' }, 401);
    const body = await request.json() as SaveRequest;
    if (body.kind !== 'product' && body.kind !== 'service') return json({ error: 'Choose whether you are saving a product or a service.' }, 400);
    const db = admin();
    const { data: vendor, error: vendorError } = await db.from('vendors').select('id, category, store_type, is_approved').eq('owner_id', user.id).maybeSingle();
    if (vendorError) throw new Error(vendorError.message);
    if (!vendor) return json({ error: 'This account is not linked to a vendor store yet. Ask AOM to link the account you are signed in with.' }, 403);
    if (!vendor.is_approved) return json({ error: 'Your store is still awaiting AOM approval. You can save items after the store is approved.' }, 403);

    if (body.kind === 'product') {
      if (vendor.store_type === 'service') return json({ error: 'This is a service store. Use Add service to create a bookable service instead.' }, 400);
      const item = body.product ?? {};
      const name = text(item.name);
      const price = number(item.price);
      const stock = item.stock_quantity === null || item.stock_quantity === undefined ? null : number(item.stock_quantity);
      if (name.length < 2) return json({ error: 'Enter a product name with at least two characters.' }, 400);
      if (!Number.isFinite(price) || price < 0) return json({ error: 'Enter a valid product price of zero or more.' }, 400);
      if (stock !== null && (!Number.isInteger(stock) || stock < 0)) return json({ error: 'Stock quantity must be a whole number that is zero or higher.' }, 400);
      const status = item.status === 'hidden' ? 'hidden' : stock === 0 || item.status === 'sold_out' ? 'sold_out' : 'available';
      const product = {
        name, description: text(item.description) || null, price, stock_quantity: stock,
        category: text(item.category) || text(vendor.category) || 'General',
        marketplace_category: text(item.marketplace_category) || null,
        marketplace_subcategory: text(item.marketplace_subcategory) || null,
        image_url: text(item.image_url) || null, status,
      };
      let productId = body.id ?? null;
      if (productId) {
        const { data, error } = await db.from('products').update(product).eq('id', productId).eq('vendor_id', vendor.id).select('id').maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return json({ error: 'This product does not belong to your store, or it was deleted. Refresh Inventory and try again.' }, 403);
      } else {
        const { data: previous, error: previousError } = await db.from('products').select('sort_order').eq('vendor_id', vendor.id).order('sort_order', { ascending: false }).limit(1).maybeSingle();
        if (previousError) throw new Error(previousError.message);
        const { data, error } = await db.from('products').insert({ ...product, vendor_id: vendor.id, sort_order: Number(previous?.sort_order ?? 0) + 1 }).select('id').single();
        if (error) throw new Error(error.message);
        productId = data.id;
      }
      const placements = (body.placements ?? []).filter((placement) => (placement.section === 'marketplace' || placement.section === 'supermarket') && text(placement.category)).slice(0, 2);
      const { error: clearPlacements } = await db.from('product_category_placements').delete().eq('product_id', productId);
      if (clearPlacements) throw new Error(clearPlacements.message);
      if (placements.length) {
        const { error } = await db.from('product_category_placements').insert(placements.map((placement) => ({ product_id: productId, section: placement.section!, category: text(placement.category) })));
        if (error) throw new Error(error.message);
      }
      const choices = (body.options as ProductOption[] ?? []).filter((option) => text(option.option_group) && text(option.name));
      const { error: clearChoices } = await db.from('product_options').delete().eq('product_id', productId);
      if (clearChoices) throw new Error(clearChoices.message);
      if (choices.length) {
        const { error } = await db.from('product_options').insert(choices.map((choice) => ({ product_id: productId, option_group: text(choice.option_group), name: text(choice.name), price_modifier: Number(choice.price_modifier ?? 0) || 0, is_available: choice.is_available !== false, selection_mode: choice.selection_mode === 'single' ? 'single' : 'multiple' })));
        if (error) throw new Error(error.message);
      }
      return json({ id: productId, message: `${name} was saved to your catalogue.` });
    }

    if (vendor.store_type !== 'service') return json({ error: 'This store is registered for products, not bookings. Ask AOM to change the store type before adding services.' }, 400);
    const service = body.service ?? {};
    const name = text(service.name), category = text(service.category), price = number(service.starting_price), duration = Math.max(1, Math.floor(number(service.duration_minutes) || 60));
    if (name.length < 2 || category.length < 2) return json({ error: 'Enter both a service name and a service category.' }, 400);
    if (!Number.isFinite(price) || price < 0) return json({ error: 'Enter a valid starting price of zero or more.' }, 400);
    const servicePayload = { name, category, description: text(service.description) || null, price, starting_price: price, duration_minutes: duration, image_url: text(service.image_url) || null, is_available: service.is_available !== false, updated_at: new Date().toISOString() };
    let serviceId = body.id ?? null;
    if (serviceId) {
      const { data, error } = await db.from('services').update(servicePayload).eq('id', serviceId).eq('vendor_id', vendor.id).select('id').maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return json({ error: 'This service does not belong to your store, or it was deleted. Refresh Inventory and try again.' }, 403);
    } else {
      const { data: previous, error: previousError } = await db.from('services').select('sort_order').eq('vendor_id', vendor.id).order('sort_order', { ascending: false }).limit(1).maybeSingle();
      if (previousError) throw new Error(previousError.message);
      const { data, error } = await db.from('services').insert({ ...servicePayload, vendor_id: vendor.id, sort_order: Number(previous?.sort_order ?? 0) + 1 }).select('id').single();
      if (error) throw new Error(error.message);
      serviceId = data.id;
    }
    const bookingOptions = (body.options as ServiceOption[] ?? []).filter((option) => text(option.name) && Number.isFinite(number(option.price)) && number(option.price) >= 0);
    const addons = (body.addons ?? []).filter((addon) => text(addon.name) && Number.isFinite(number(addon.price)) && number(addon.price) >= 0);
    const { error: clearOptions } = await db.from('service_options').delete().eq('service_id', serviceId);
    if (clearOptions) throw new Error(clearOptions.message);
    const entries = [
      ...bookingOptions.map((option, index) => ({ service_id: serviceId!, name: text(option.name), price: number(option.price), duration_minutes: Math.max(1, Math.floor(number(option.duration_minutes) || duration)), is_available: option.is_available !== false, sort_order: index + 1, option_type: 'booking' })),
      ...addons.map((addon, index) => ({ service_id: serviceId!, name: text(addon.name), price: number(addon.price), duration_minutes: null, is_available: addon.is_available !== false, sort_order: index + 1, option_type: 'addon' })),
    ];
    if (entries.length) {
      const { error } = await db.from('service_options').insert(entries);
      if (error) throw new Error(error.message);
    }
    return json({ id: serviceId, message: `${name} was saved to your service catalogue.` });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'We could not save that catalogue entry.' }, 400);
  }
});
