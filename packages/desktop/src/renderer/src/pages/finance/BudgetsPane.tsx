import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { localDateKey } from '../../lib/date';
import type { ExpenseCategory, Transaction } from '@swit/shared';
import Modal from '../../components/Modal';
import { useCurrency } from '../../lib/money';

export default function BudgetsPane({
  transactions,
  categories,
  onChanged,
  fmt
}: {
  transactions: Transaction[];
  categories: ExpenseCategory[];
  onChanged: () => Promise<void>;
  fmt: (v: number) => string;
}): JSX.Element {
  // Always use current month for budget evaluation
  const monthKey = localDateKey().slice(0, 7);

  const spentByCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of transactions) {
      if (t.kind !== 'expense') continue;
      if (!t.date.startsWith(monthKey)) continue;
      const key = t.category_id ?? '__none__';
      m.set(key, (m.get(key) ?? 0) + t.amount);
    }
    return m;
  }, [transactions, monthKey]);

  const withBudget = categories.filter(
    (c) => c.kind === 'expense' && !c.archived && (c.monthly_limit ?? 0) > 0
  );
  const withoutBudget = categories.filter(
    (c) => c.kind === 'expense' && !c.archived && !(c.monthly_limit && c.monthly_limit > 0)
  );

  async function setLimit(c: ExpenseCategory, v: number | null): Promise<void> {
    await api.updateExpenseCategory(c.id, { monthly_limit: v });
    await onChanged();
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted">
        Бюджеты считаются по текущему месяцу: <b>{monthKey}</b>. Лимит — сколько ты готов тратить в категории.
      </div>

      {withBudget.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs uppercase text-muted">Категории с лимитом</h2>
          {withBudget.map((c) => {
            const spent = spentByCat.get(c.id) ?? 0;
            const limit = c.monthly_limit!;
            const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
            const tone = pct >= 100 ? 'red' : pct >= 80 ? 'amber' : 'green';
            const toneCls =
              tone === 'red' ? 'bg-red-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-green-500';
            return (
              <div key={c.id} className="bg-surface rounded-lg shadow-sm p-3 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{c.icon ?? '·'}</span>
                    <span className="text-sm font-medium">{c.name}</span>
                  </div>
                  <div className="text-sm">
                    <span className={tone === 'red' ? 'text-red-500 font-semibold' : ''}>
                      {fmt(spent)}
                    </span>
                    <span className="text-muted"> из {fmt(limit)}</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-surface2 overflow-hidden">
                  <div className={`h-full rounded-full ${toneCls} transition-all`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="text-[11px] text-faint">
                    {pct >= 100
                      ? `Превышение: ${fmt(spent - limit)}`
                      : `Осталось: ${fmt(limit - spent)} · ${pct.toFixed(0)}%`}
                  </div>
                  <BudgetEditButton
                    category={c}
                    current={limit}
                    onSet={(v) => setLimit(c, v)}
                  />
                </div>
              </div>
            );
          })}
        </section>
      )}

      {withoutBudget.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs uppercase text-muted">Без лимита</h2>
          <div className="bg-surface rounded-lg shadow-sm border border-border divide-y divide-border">
            {withoutBudget.map((c) => {
              const spent = spentByCat.get(c.id) ?? 0;
              return (
                <div key={c.id} className="px-3 py-2 flex items-center gap-2">
                  <span className="text-lg">{c.icon ?? '·'}</span>
                  <span className="text-sm flex-1">{c.name}</span>
                  <span className="text-xs text-muted">потрачено: {fmt(spent)}</span>
                  <BudgetEditButton
                    category={c}
                    current={null}
                    onSet={(v) => setLimit(c, v)}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function BudgetEditButton({
  category,
  current,
  onSet
}: {
  category: ExpenseCategory;
  current: number | null;
  onSet: (v: number | null) => Promise<void>;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>(current ? String(current) : '');
  const currency = useCurrency();

  useEffect(() => {
    if (open) setValue(current ? String(current) : '');
  }, [open, current]);

  async function save(): Promise<void> {
    const trimmed = value.trim();
    if (trimmed === '') {
      await onSet(null);
    } else {
      const n = Number(trimmed.replace(',', '.'));
      if (!Number.isFinite(n) || n < 0) return;
      await onSet(n);
    }
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] text-accent hover:underline"
      >
        {current ? 'Изменить' : '+ Лимит'}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Месячный лимит · ${category.name}`}
        footer={
          <>
            {current !== null && (
              <button
                onClick={async () => {
                  await onSet(null);
                  setOpen(false);
                }}
                className="px-3 py-1.5 rounded-md text-sm border border-border text-red-500 hover:bg-red-50 mr-auto"
              >
                Убрать лимит
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 rounded-md text-sm border border-border"
            >
              Отмена
            </button>
            <button
              onClick={save}
              className="px-4 py-1.5 rounded-md text-sm bg-accent text-white hover:bg-accent-hover"
            >
              Сохранить
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-sm text-muted">
            Сколько ты готов тратить в «{category.icon ?? ''} {category.name}» в месяц.
            Прогресс пересчитывается автоматически.
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^0-9.,]/g, ''))}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save();
              }}
              placeholder="0"
              className="input flex-1 text-right text-lg font-semibold timer-font"
            />
            <span className="text-muted text-lg">{currency === 'USD' ? '$' : '₽'}</span>
          </div>
        </div>
      </Modal>
    </>
  );
}
