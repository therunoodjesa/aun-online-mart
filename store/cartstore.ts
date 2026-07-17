import { create } from 'zustand';

export type CartItem = {
  productId: string;
  name: string;
  category?: string | null;
  price: number;
  imageUrl?: string | null;
  mealPlanEligible?: boolean;
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
  removeItem: (productId) => set((state) => ({ items: state.items.filter((item) => item.productId !== productId) })),
  clearCart: () => set({ items: [] }),
}));
