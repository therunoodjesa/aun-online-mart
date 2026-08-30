export type SearchResultIcon =
  | 'storefront-outline'
  | 'restaurant-outline'
  | 'wine-outline'
  | 'sparkles-outline'
  | 'flower-outline'
  | 'phone-portrait-outline'
  | 'basket-outline'
  | 'bag-handle-outline';

type SearchIconSource = {
  type?: string | null;
  title?: string | null;
  subtitle?: string | null;
  category?: string | null;
  marketplaceCategory?: string | null;
};

const ICON_GROUPS: Array<{ icon: SearchResultIcon; terms: string[] }> = [
  { icon: 'wine-outline', terms: ['drink', 'drinks', 'beverage', 'beverages', 'juice', 'water', 'soda', 'wine'] },
  { icon: 'sparkles-outline', terms: ['beauty', 'hygiene', 'skincare', 'skin care', 'cosmetic', 'cosmetics', 'makeup', 'make-up'] },
  { icon: 'flower-outline', terms: ['fragrance', 'fragrances', 'perfume', 'perfumes', 'body mist', 'cologne'] },
  { icon: 'phone-portrait-outline', terms: ['electronic', 'electronics', 'gadget', 'gadgets', 'phone', 'phones', 'accessories', 'appliance', 'appliances'] },
  { icon: 'basket-outline', terms: ['grocery', 'groceries', 'provision', 'provisions', 'household', 'pantry'] },
  { icon: 'restaurant-outline', terms: ['meal', 'meals', 'food', 'snack', 'snacks', 'cake', 'cakes', 'baking', 'rice', 'swallow', 'soup', 'fast food', 'ice-cream', 'ice cream', 'dairy', 'cafeteria', 'restaurant'] },
];

const hasTerm = (value: string, term: string) => {
  if (term.includes(' ') || term.includes('-')) return value.includes(term);
  return new RegExp(`(^|[^a-z])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i').test(value);
};

export function searchResultIcon(result: SearchIconSource): SearchResultIcon {
  if (result.type === 'vendor') return 'storefront-outline';
  const searchable = [result.category, result.marketplaceCategory, result.subtitle, result.title]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ')
    .toLowerCase();

  return ICON_GROUPS.find((group) => group.terms.some((term) => hasTerm(searchable, term)))?.icon ?? 'bag-handle-outline';
}
