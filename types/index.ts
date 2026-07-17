export type UserRole = 'buyer' | 'vendor' | 'admin';

export type MarketplaceCategory =
  | 'meals'
  | 'cakes'
  | 'fast-food'
  | 'ice-cream'
  | 'dairy';

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: UserRole;
  is_aun_student: boolean;
  student_id?: string;
  avatar_url?: string;
  created_at: string;
};

export type Vendor = {
  id: string;
  owner_id: string;
  name: string;
  description?: string;
  category: 'food' | 'supermarket' | 'bakes' | 'drinks' | 'beauty' | 'other';
  location?: string;
  logo_url?: string;
  is_open: boolean;
  is_approved: boolean;
  commission_rate: number;
  average_prep_time?: string;
  important_message?: string;
  pickup_location?: string;
  pickup_instructions?: string;
};

export type Product = {
  id: string;
  vendor_id: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  marketplace_category?: MarketplaceCategory;
  marketplace_subcategory?: string;
  image_url?: string;
  status: 'available' | 'sold_out' | 'hidden';
  is_meal_plan_eligible: boolean;
};

export type ProductOption = {
  id: string;
  product_id: string;
  option_group: string;
  name: string;
  price_modifier: number;
  is_available: boolean;
};

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type Order = {
  id: string;
  order_number: string;
  buyer_id: string;
  vendor_id: string;
  status: OrderStatus;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  total: number;
  commission_amount: number;
  vendor_payout: number;
  payment_method: 'card' | 'transfer' | 'meal_plan' | 'cash';
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  delivery_type: 'delivery' | 'pickup';
  notes?: string;
  created_at: string;
};

export type CartItem = {
  product: Product;
  quantity: number;
  selectedOptions: Record<string, { name: string; qty: number; priceModifier: number }[]>;
  notes?: string;
};
