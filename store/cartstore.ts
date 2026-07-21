import { create } from 'zustand';
import { posthog } from '../lib/posthog';

export type CartItem = {
  productId: string;
  name: string;
  category?: string | null;
  price: number;
  imageUrl?: string | null;
  mealPlanEligible?: boolean;
  selectedOptions?: {
    id: string;
    name: string;
    quantity: number;
    priceModifier: number;
  }[];
  note?: string | null;
  quantity: number;
};

type CartStore = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  changeQuantity: (productId: string, amount: number) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
};

export const useCartStore = create<CartStore>((set) => ({
  items: [],
  addItem: (item) => set((state) => {
    const existing = state.items.find((cartItem) => cartItem.productId === item.productId);
    posthog.capture('product_added_to_cart', {
      product_id: item.productId,
      category: item.category ?? 'marketplace',
      unit_price: item.price,
      resulting_quantity: (existing?.quantity ?? 0) + 1,
    });
    return existing
      ? { items: state.items.map((cartItem) => cartItem.productId === item.productId ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem) }
      : { items: [...state.items, { ...item, quantity: 1 }] };
  }),
  changeQuantity: (productId, amount) => set((state) => ({
    items: state.items.flatMap((item) => {
      if (item.productId !== productId) return [item];
      const quantity = item.quantity + amount;
      return quantity > 0 ? [{ ...item, quantity }] : [];
    }),
  })),
  removeItem: (productId) => set((state) => {
    const item = state.items.find((cartItem) => cartItem.productId === productId);
    if (item) posthog.capture('product_removed_from_cart', { product_id: productId, quantity: item.quantity });
    return { items: state.items.filter((cartItem) => cartItem.productId !== productId) };
  }),
  clearCart: () => set({ items: [] }),
}));
