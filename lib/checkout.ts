import type { CartItem } from '../store/cartstore';

export const CAFETERIA_PACKAGING_PER_MEAL = 200;
export const CAFETERIA_DELIVERY_FLAT_RATE = 800;
export const STANDARD_DELIVERY_FEE = 2500;
export const MEAL_PLAN_ALLOWANCE = 1800;
export const AOM_SERVICE_FEE_RATE = 0.1;

const isCafeteria = (item: CartItem) => item.category?.toLowerCase().startsWith('cafeteria') ?? false;
const isMeal = (item: CartItem) => isCafeteria(item) && !item.category?.toLowerCase().includes('snacks');

export function calculateCheckout(items: CartItem[], deliveryType: 'dispatch' | 'pickup', useMealPlan = false, planCount = 0) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cafeteriaItems = items.filter(isCafeteria);
  const standardItems = items.filter((item) => !isCafeteria(item));
  const standardSubtotal = standardItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const serviceFee = Math.round(standardSubtotal * AOM_SERVICE_FEE_RATE);
  const mealCount = cafeteriaItems.filter(isMeal).reduce((sum, item) => sum + item.quantity, 0);
  const eligibleSubtotal = cafeteriaItems.filter((item) => item.mealPlanEligible !== false).reduce((sum, item) => sum + item.price * item.quantity, 0);
  const mealPlanCredit = useMealPlan ? Math.min(eligibleSubtotal, Math.max(0, planCount) * MEAL_PLAN_ALLOWANCE) : 0;
  const packagingFee = mealCount * CAFETERIA_PACKAGING_PER_MEAL;
  const cafeteriaDeliveryFee = deliveryType === 'dispatch' && cafeteriaItems.length ? CAFETERIA_DELIVERY_FLAT_RATE : 0;
  const standardDeliveryFee = deliveryType === 'dispatch' && standardItems.length ? STANDARD_DELIVERY_FEE : 0;
  const deliveryFee = cafeteriaDeliveryFee + standardDeliveryFee;
  return { subtotal, standardSubtotal, serviceFee, mealCount, eligibleSubtotal, mealPlanCredit, packagingFee, deliveryFee, total: subtotal - mealPlanCredit + packagingFee + deliveryFee + serviceFee };
}
