import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { Wallet } from 'lucide-react';
import { api } from '../api';
import type { ExpenseCategory, RecurringTransaction, Transaction } from '@swit/shared';
import { useFmtMoney } from '../lib/money';
import { DEFAULT_CATEGORIES, presetRange, ymd, type PeriodPreset } from '../lib/finance';
import { TABS, type Tab } from './finance/helpers';
import { dedupCategories } from './finance/data';
import PeriodSwitcher from './finance/PeriodSwitcher';
import SummaryCard from './finance/SummaryCard';
import TransactionsPane from './finance/TransactionsPane';
import BudgetsPane from './finance/BudgetsPane';
import RecurringPane from './finance/RecurringPane';
import CategoriesPane from './finance/CategoriesPane';

// recharts (~800kB) живёт только в AnalyticsPane. Грузим вкладку аналитики
// лениво, чтобы дефолтная вкладка «Транзакции» не тянула чарты при входе.
const AnalyticsPane = lazy(() => import('./finance/AnalyticsPane'));

// Module-level guard — prevents the default-category seed from running twice
// when React StrictMode double-invokes useEffect in dev. Survives re-renders,
// resets on app reload.
let seedAttempted = false;

export default function Finance(): JSX.Element {
  const [tab, setTab] = useState<Tab>('transactions');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [period, setPeriod] = useState<PeriodPreset>('month');
  const [customFrom, setCustomFrom] = useState(ymd(new Date()));
  const [customTo, setCustomTo] = useState(ymd(new Date()));
  const fmtm = useFmtMoney();
  const activeRecurringCount = useMemo(
    () => recurring.filter((r) => !r.archived).length,
    [recurring]
  );

  useEffect(() => {
    void reload();
  }, []);

  async function reload(): Promise<void> {
    const [tx, cats, rec] = await Promise.all([
      api.listTransactions({ limit: 2000 }),
      api.listExpenseCategories(),
      api.listRecurringTransactions()
    ]);
    setTransactions(tx);
    setRecurring(rec);

    // Seed default categories on first run so the app isn't empty.
    // Module-level gate ensures we don't double-seed under StrictMode.
    if (cats.length === 0 && !seedAttempted) {
      seedAttempted = true;
      for (const c of DEFAULT_CATEGORIES) {
        await api.createExpenseCategory(c);
      }
      const fresh = await api.listExpenseCategories();
      setCategories(fresh);
      return;
    }

    // Clean up duplicates from any earlier double-seed. Runs at most once
    // per session and only when duplicates actually exist.
    const cleaned = await dedupCategories(cats);
    if (cleaned) {
      const fresh = await api.listExpenseCategories();
      setCategories(fresh);
    } else {
      setCategories(cats);
    }
  }

  // Resolve effective date range from preset.
  const range = useMemo((): { from: string; to: string } | null => {
    if (period === 'all') return null;
    if (period === 'custom') return { from: customFrom, to: customTo };
    return presetRange(period);
  }, [period, customFrom, customTo]);

  // Previous range of the same length — для сравнения с предыдущим периодом.
  const prevRange = useMemo((): { from: string; to: string } | null => {
    if (!range) return null;
    const fromD = new Date(range.from + 'T00:00:00');
    const toD = new Date(range.to + 'T00:00:00');
    const days = Math.round((toD.getTime() - fromD.getTime()) / 86_400_000) + 1;
    const prevToD = new Date(fromD);
    prevToD.setDate(prevToD.getDate() - 1);
    const prevFromD = new Date(prevToD);
    prevFromD.setDate(prevFromD.getDate() - days + 1);
    return { from: ymd(prevFromD), to: ymd(prevToD) };
  }, [range]);

  // Filter once for the whole page.
  const inRange = useMemo(() => {
    if (!range) return transactions;
    return transactions.filter((t) => t.date >= range.from && t.date <= range.to);
  }, [transactions, range]);

  const prevInRange = useMemo(() => {
    if (!prevRange) return [];
    return transactions.filter((t) => t.date >= prevRange.from && t.date <= prevRange.to);
  }, [transactions, prevRange]);

  const totals = useMemo(() => {
    let expense = 0;
    let income = 0;
    for (const t of inRange) {
      if (t.kind === 'expense') expense += t.amount;
      else income += t.amount;
    }
    return { expense, income, net: income - expense };
  }, [inRange]);

  const prevTotals = useMemo(() => {
    let expense = 0;
    let income = 0;
    for (const t of prevInRange) {
      if (t.kind === 'expense') expense += t.amount;
      else income += t.amount;
    }
    return { expense, income, net: income - expense };
  }, [prevInRange]);

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 pt-6 pb-0 border-b border-border bg-surface">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Wallet size={22} className="text-accent" /> Расходы
            </h1>
            <div className="text-sm text-muted mt-0.5">
              Куда уходят деньги — учёт, аналитика, бюджеты
            </div>
          </div>
          <div className="flex items-stretch gap-2">
            <SummaryCard
              label="Расход"
              value={fmtm(totals.expense)}
              tone="red"
              prev={prevTotals.expense}
              cur={totals.expense}
              compareLabel="к прошлому периоду"
              hasPrev={!!prevRange}
            />
            <SummaryCard
              label="Доход"
              value={fmtm(totals.income)}
              tone="green"
              prev={prevTotals.income}
              cur={totals.income}
              compareLabel="к прошлому периоду"
              hasPrev={!!prevRange}
              invertTrend
            />
            <SummaryCard
              label="Остаток"
              value={fmtm(totals.net)}
              tone={totals.net >= 0 ? 'green' : 'red'}
              prev={prevTotals.net}
              cur={totals.net}
              compareLabel="к прошлому периоду"
              hasPrev={!!prevRange}
              invertTrend
            />
          </div>
        </div>

        <PeriodSwitcher
          period={period}
          onChange={setPeriod}
          customFrom={customFrom}
          customTo={customTo}
          onCustom={(f, t) => {
            setCustomFrom(f);
            setCustomTo(t);
          }}
        />

        <nav className="mt-4 -mb-px flex gap-0 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition shrink-0 ${
                  active
                    ? 'border-accent text-accent font-medium'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                <Icon size={14} />
                {t.label}
                {t.key === 'recurring' && activeRecurringCount > 0 && (
                  <span className="text-[10px] bg-surface2 text-faint rounded-full px-1.5 py-0.5">
                    {activeRecurringCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 overflow-y-auto bg-bg">
        <div className="p-6 max-w-[1200px]">
          {tab === 'transactions' && (
            <TransactionsPane
              transactions={inRange}
              allTransactions={transactions}
              categories={categories}
              range={range}
              onChanged={reload}
              fmt={fmtm}
            />
          )}
          {tab === 'analytics' && (
            <Suspense
              fallback={
                <div className="py-16 grid place-items-center text-muted text-sm">Загрузка…</div>
              }
            >
              <AnalyticsPane transactions={inRange} categories={categories} fmt={fmtm} />
            </Suspense>
          )}
          {tab === 'budgets' && (
            <BudgetsPane
              transactions={transactions}
              categories={categories}
              onChanged={reload}
              fmt={fmtm}
            />
          )}
          {tab === 'recurring' && (
            <RecurringPane
              recurring={recurring}
              categories={categories}
              onChanged={reload}
              fmt={fmtm}
            />
          )}
          {tab === 'categories' && (
            <CategoriesPane categories={categories} onChanged={reload} fmt={fmtm} />
          )}
        </div>
      </main>
    </div>
  );
}
