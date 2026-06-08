import { api } from '../../api';
import type { ExpenseCategory } from '@swit/shared';

/**
 * If the DB ended up with duplicates of the same (name, kind) — typically caused
 * by an earlier StrictMode double-seed — we silently merge them. Keep the oldest
 * (lowest created_at) and delete the rest. Transactions referencing the deleted
 * categories will have category_id NULLed by the FK constraint, which is fine
 * because the same-named survivor still exists for new transactions.
 */
export async function dedupCategories(cats: ExpenseCategory[]): Promise<boolean> {
  const seen = new Map<string, ExpenseCategory>();
  const toDelete: string[] = [];
  for (const c of [...cats].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const key = `${c.kind}::${c.name.trim().toLowerCase()}`;
    if (seen.has(key)) {
      toDelete.push(c.id);
    } else {
      seen.set(key, c);
    }
  }
  if (toDelete.length === 0) return false;
  for (const id of toDelete) {
    await api.deleteExpenseCategory(id);
  }
  return true;
}
