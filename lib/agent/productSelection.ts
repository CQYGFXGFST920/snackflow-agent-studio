export type PricedProduct = {
  id: string;
  price: number;
  rating: number;
};

export function parseBudget(text: string): number | null {
  const match = text.match(/(?:预算|不超过|控制在|最多|上限)\s*(?:为|是)?\s*[¥￥]?\s*(\d+(?:\.\d{1,2})?)/);
  return match ? Number(match[1]) : null;
}

export function parseRequestedCount(text: string, fallback = 3): number {
  const numeric = text.match(/(\d+)\s*(?:款|种|包|件)/);
  if (numeric) return Math.max(1, Math.min(10, Number(numeric[1])));
  const chinese = text.match(/([一二两三四五六七八九十])\s*(?:款|种|包|件)/)?.[1];
  const values: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  return chinese ? values[chinese] : fallback;
}

export function selectProductsWithinBudget<T extends PricedProduct>(
  candidates: T[],
  budget: number | null,
  requestedCount: number,
): T[] {
  const sorted = [...candidates].sort((a, b) => b.rating - a.rating || a.price - b.price);
  if (budget === null) return sorted.slice(0, requestedCount);

  let best: T[] = [];
  let bestRating = -1;
  let bestSubtotal = -1;
  const visit = (index: number, selected: T[], subtotal: number, rating: number) => {
    if (subtotal > budget || selected.length > requestedCount) return;
    if (
      selected.length > best.length ||
      (selected.length === best.length && rating > bestRating) ||
      (selected.length === best.length && rating === bestRating && subtotal > bestSubtotal)
    ) {
      best = [...selected];
      bestRating = rating;
      bestSubtotal = subtotal;
    }
    for (let cursor = index; cursor < sorted.length; cursor += 1) {
      visit(cursor + 1, [...selected, sorted[cursor]], subtotal + sorted[cursor].price, rating + sorted[cursor].rating);
    }
  };
  visit(0, [], 0, 0);
  return best;
}
