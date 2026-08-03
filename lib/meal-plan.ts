export type MealPlanBalance = {
  plan_count?: number | null;
  meals_used_today?: number | null;
  last_used_on?: string | null;
};

export function watDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function remainingMealPlanCredits(account: MealPlanBalance | null | undefined, date = new Date()) {
  const planCount = Math.max(0, Number(account?.plan_count ?? 0));
  const usedToday = account?.last_used_on === watDateKey(date)
    ? Math.max(0, Number(account?.meals_used_today ?? 0))
    : 0;
  return Math.max(0, planCount - usedToday);
}

export function remainingMealPlanLabel(remaining: number) {
  if (remaining <= 0) return 'Meal plan credit used up today';
  return `${remaining} meal plan credit${remaining === 1 ? '' : 's'} remaining`;
}
