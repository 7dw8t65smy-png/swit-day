import { useEffect, useMemo, useState } from 'react';
import {
  Wallet,
  BarChart3,
  Target,
  Tags,
  Plus,
  Trash2,
  Pencil,
  TrendingUp,
  TrendingDown,
  ArrowDown,
  ArrowUp,
  Search,
  Repeat,
  Zap,
  Bell,
  Archive,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  type LucideIcon
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { api } from '../api';
import { localDateKey } from '../lib/date';
import type {
  ExpenseCategory,
  PaymentMethod,
  RecurrencePeriod,
  RecurringTransaction,
  Transaction,
  TransactionKind
} from '@swit/shared';
import Modal from '../components/Modal';
import { confirmDelete } from '../lib/confirm';
import { useFmtMoney, useCurrency, fmtMoney } from '../lib/money';
import {
  DEFAULT_CATEGORIES,
  PAYMENT_METHODS,
  categoryById,
  paymentIcon,
  paymentLabel,
  presetRange,
  ymd,
  type PeriodPreset
} from '../lib/finance';

type Tab = 'transactions' | 'analytics' | 'budgets' | 'recurring' | 'categories';

const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: 'transactions', label: 'Транзакции', icon: Wallet },
  { key: 'analytics',    label: 'Аналитика',  icon: BarChart3 },
  { key: 'budgets',      label: 'Бюджеты',    icon: Target },
  { key: 'recurring',    label: 'Регулярные', icon: Repeat },
  { key: 'categories',   label: 'Категории',  icon: Tags }
];

// Module-level guard — prevents the default-category seed from running twice
// when React StrictMode double-invokes useEffect in dev. Survives re-renders,
// resets on app reload.
let seedAttempted = false;

/**
 * If the DB ended up with duplicates of the same (name, kind) — typically caused
 * by an earlier StrictMode double-seed — we silently merge them. Keep the oldest
 * (lowest created_at) and delete the rest. Transactions referencing the deleted
 * categories will have category_id NULLed by the FK constraint, which is fine
 * because the same-named survivor still exists for new transactions.
 */
async function dedupCategories(cats: ExpenseCategory[]): Promise<boolean> {
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

export default function Finance(): JSX.Element {
  const [tab, setTab] = useState<Tab>('transactions');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [period, setPeriod] = useState<PeriodPreset>('month');
  const [customFrom, setCustomFrom] = useState(ymd(new Date()));
  const [customTo, setCustomTo] = useState(ymd(new Date()));
  const fmtm = useFmtMoney();

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
          onCustom={(f, t) => { setCustomFrom(f); setCustomTo(t); }}
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
                {t.key === 'recurring' && recurring.filter((r) => !r.archived).length > 0 && (
                  <span className="text-[10px] bg-surface2 text-faint rounded-full px-1.5 py-0.5">
                    {recurring.filter((r) => !r.archived).length}
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
            <AnalyticsPane transactions={inRange} categories={categories} fmt={fmtm} />
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

// ============ Period switcher ============

function PeriodSwitcher({
  period,
  onChange,
  customFrom,
  customTo,
  onCustom
}: {
  period: PeriodPreset;
  onChange: (p: PeriodPreset) => void;
  customFrom: string;
  customTo: string;
  onCustom: (f: string, t: string) => void;
}): JSX.Element {
  const presets: { v: PeriodPreset; label: string }[] = [
    { v: 'today', label: 'Сегодня' },
    { v: 'week',  label: 'Неделя' },
    { v: 'month', label: 'Месяц' },
    { v: 'year',  label: 'Год' },
    { v: 'all',   label: 'Всё' },
    { v: 'custom',label: 'Период' }
  ];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <div className="flex gap-1 bg-surface2 rounded-md p-1">
        {presets.map((p) => (
          <button
            key={p.v}
            onClick={() => onChange(p.v)}
            className={`px-3 py-1 rounded text-sm transition ${
              period === p.v ? 'bg-surface shadow-sm font-medium' : 'text-muted hover:text-ink'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {period === 'custom' && (
        <div className="flex items-center gap-1.5 text-sm">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => onCustom(e.target.value, customTo)}
            className="h-8 px-2 rounded-md border border-border bg-surface text-xs"
          />
          <span className="text-muted">—</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => onCustom(customFrom, e.target.value)}
            className="h-8 px-2 rounded-md border border-border bg-surface text-xs"
          />
        </div>
      )}
    </div>
  );
}

/**
 * Карточка-метрика для шапки. Кроме самой суммы показывает дельту относительно
 * предыдущего отрезка такой же длины (вчера vs сегодня, прошлый месяц vs этот
 * и т.д.). `invertTrend=true` для дохода/остатка — там рост это хорошо, и
 * стрелка вверх должна быть зелёной.
 */
function SummaryCard({
  label,
  value,
  tone,
  prev,
  cur,
  compareLabel,
  hasPrev,
  invertTrend
}: {
  label: string;
  value: string;
  tone: 'red' | 'green';
  prev: number;
  cur: number;
  compareLabel: string;
  hasPrev: boolean;
  invertTrend?: boolean;
}): JSX.Element {
  const cls = tone === 'red' ? 'text-red-500' : 'text-green-600';
  let trendNode: JSX.Element | null = null;
  if (hasPrev) {
    const delta = cur - prev;
    const pct = prev !== 0 ? (delta / Math.abs(prev)) * 100 : (cur === 0 ? 0 : 100);
    // Знак "роста". Для расходов рост — это плохо (красный).
    // Для дохода/остатка — наоборот (invertTrend).
    const goodIfUp = !!invertTrend;
    const isUp = delta > 0;
    const isDown = delta < 0;
    const trendCls =
      delta === 0
        ? 'text-faint'
        : (isUp ? goodIfUp : !goodIfUp)
          ? 'text-green-600'
          : 'text-red-500';
    const Icon = delta === 0 ? Minus : isUp ? ArrowUpRight : ArrowDownRight;
    trendNode = (
      <div className={`text-[10px] flex items-center gap-0.5 mt-0.5 ${trendCls}`}>
        <Icon size={11} />
        <span className="font-medium">
          {delta === 0 ? '—' : `${isDown ? '−' : '+'}${Math.abs(pct).toFixed(0)}%`}
        </span>
        <span className="text-faint ml-0.5">{compareLabel}</span>
      </div>
    );
  }
  return (
    <div className="bg-surface2/40 rounded-md px-3 py-2 min-w-[140px]">
      <div className="text-[10px] uppercase tracking-wide text-faint">{label}</div>
      <div className={`text-lg font-semibold timer-font leading-tight ${cls}`}>{value}</div>
      {trendNode}
    </div>
  );
}

// ============ Transactions pane ============

function TransactionsPane({
  transactions,
  allTransactions,
  categories,
  range,
  onChanged,
  fmt
}: {
  transactions: Transaction[];
  allTransactions: Transaction[];
  categories: ExpenseCategory[];
  range: { from: string; to: string } | null;
  onChanged: () => Promise<void>;
  fmt: (v: number) => string;
}): JSX.Element {
  const [filterCat, setFilterCat] = useState<string>('');
  const [filterMethod, setFilterMethod] = useState<PaymentMethod | ''>('');
  const [filterKind, setFilterKind] = useState<TransactionKind | ''>('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [creating, setCreating] = useState(false);
  const [quick, setQuick] = useState('');

  const catMap = useMemo(() => categoryById(categories), [categories]);

  // Cmd/Ctrl + N — открыть форму создания.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        // Не перехватываем, если фокус в input/textarea — там Cmd+N не нужен.
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        e.preventDefault();
        setCreating(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (filterCat && t.category_id !== filterCat) return false;
      if (filterMethod && t.payment_method !== filterMethod) return false;
      if (filterKind && t.kind !== filterKind) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!t.description.toLowerCase().includes(q) && !(t.note ?? '').toLowerCase().includes(q))
          return false;
      }
      return true;
    });
  }, [transactions, filterCat, filterMethod, filterKind, search]);

  // Group by date for prettier rendering.
  const grouped = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const arr = m.get(t.date) ?? [];
      arr.push(t);
      m.set(t.date, arr);
    }
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  async function onDelete(id: string): Promise<void> {
    if (!confirmDelete('Удалить эту транзакцию?')) return;
    await api.deleteTransaction(id);
    await onChanged();
  }

  async function quickAdd(): Promise<void> {
    const parsed = parseQuickAdd(quick);
    if (!parsed) return;
    // Подбираем категорию по имени, если найдена.
    const cat = categories.find(
      (c) =>
        !c.archived &&
        c.kind === parsed.kind &&
        c.name.toLowerCase() === (parsed.categoryName ?? '').toLowerCase()
    );
    await api.createTransaction({
      amount: parsed.amount,
      kind: parsed.kind,
      category_id: cat?.id ?? null,
      payment_method: 'card',
      date: ymd(new Date()),
      description: parsed.description,
      note: null
    });
    setQuick('');
    await onChanged();
  }

  return (
    <div className="space-y-4">
      {/* Быстрое добавление. Парсит «Кофе 250», «+5000 Зарплата», «−1200 Такси». */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void quickAdd();
        }}
        className="flex items-center gap-2 bg-surface rounded-lg shadow-sm border border-border px-3 py-2"
      >
        <Zap size={14} className="text-accent shrink-0" />
        <input
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          placeholder="Быстро: «Кофе 250» · «+5000 Зарплата» · «обед 350 еда»"
          className="flex-1 bg-transparent border-0 outline-0 text-sm placeholder:text-faint"
        />
        {quick.trim() && (
          <button
            type="submit"
            className="bg-accent text-white px-3 h-8 rounded-md text-sm hover:bg-accent-hover flex items-center gap-1"
          >
            <Plus size={13} /> Добавить
          </button>
        )}
        <button
          type="button"
          onClick={() => setCreating(true)}
          title="Подробная форма (Cmd+N)"
          className="px-3 h-8 rounded-md text-sm border border-border hover:bg-surface2 flex items-center gap-1"
        >
          <Pencil size={12} /> Подробно
        </button>
      </form>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterKind}
            onChange={(e) => setFilterKind(e.target.value as TransactionKind | '')}
            className="h-9 px-2 rounded-md border border-border bg-surface text-sm"
          >
            <option value="">Все типы</option>
            <option value="expense">Расходы</option>
            <option value="income">Доходы</option>
          </select>
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="h-9 px-2 rounded-md border border-border bg-surface text-sm"
          >
            <option value="">Все категории</option>
            {categories.filter((c) => !c.archived).map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon ?? ''} {c.name}
              </option>
            ))}
          </select>
          <select
            value={filterMethod}
            onChange={(e) => setFilterMethod(e.target.value as PaymentMethod | '')}
            className="h-9 px-2 rounded-md border border-border bg-surface text-sm"
          >
            <option value="">Все способы</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.icon} {m.label}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск..."
              className="h-9 pl-8 pr-2 rounded-md border border-border bg-surface text-sm w-48"
            />
          </div>
          {(filterKind || filterCat || filterMethod || search) && (
            <button
              onClick={() => {
                setFilterKind('');
                setFilterCat('');
                setFilterMethod('');
                setSearch('');
              }}
              className="text-xs text-muted hover:text-ink underline"
            >
              Сбросить
            </button>
          )}
        </div>
        <div className="text-xs text-faint">
          {filtered.length} {pluralize(filtered.length, ['транзакция', 'транзакции', 'транзакций'])}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyTransactions onCreate={() => setCreating(true)} />
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, items]) => {
            const dayExp = items.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0);
            const dayInc = items.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0);
            return (
              <section key={date}>
                <div className="flex items-baseline justify-between mb-1.5 px-1">
                  <div className="text-xs uppercase tracking-wide text-muted">{formatDay(date)}</div>
                  <div className="text-[11px] text-faint">
                    {dayExp > 0 && <span className="text-red-500">−{fmt(dayExp)}</span>}
                    {dayExp > 0 && dayInc > 0 && <span> · </span>}
                    {dayInc > 0 && <span className="text-green-600">+{fmt(dayInc)}</span>}
                  </div>
                </div>
                <ul className="bg-surface rounded-lg shadow-sm border border-border divide-y divide-border overflow-hidden">
                  {items.map((t) => (
                    <TransactionRow
                      key={t.id}
                      t={t}
                      cat={t.category_id ? catMap.get(t.category_id) ?? null : null}
                      fmt={fmt}
                      onEdit={() => setEditing(t)}
                      onDelete={() => onDelete(t.id)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <TransactionFormModal
        open={creating || editing !== null}
        transaction={editing}
        categories={categories}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={async () => {
          setCreating(false);
          setEditing(null);
          await onChanged();
        }}
      />
    </div>
  );
}

function EmptyTransactions({ onCreate }: { onCreate: () => void }): JSX.Element {
  return (
    <div className="bg-surface rounded-lg shadow-sm p-12 text-center border border-border">
      <div className="text-4xl mb-3 opacity-40">💸</div>
      <div className="text-sm text-muted max-w-md mx-auto">
        В выбранном периоде нет транзакций. Добавь первую — кнопкой выше или Cmd+N.
      </div>
      <button
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-1.5 bg-accent text-white px-4 py-2 rounded-md text-sm hover:bg-accent-hover shadow-sm"
      >
        <Plus size={14} /> Добавить транзакцию
      </button>
    </div>
  );
}

function TransactionRow({
  t,
  cat,
  fmt,
  onEdit,
  onDelete
}: {
  t: Transaction;
  cat: ExpenseCategory | null;
  fmt: (v: number) => string;
  onEdit: () => void;
  onDelete: () => void;
}): JSX.Element {
  const color = cat?.color ?? (t.kind === 'income' ? '#059669' : '#94A3B8');
  const sign = t.kind === 'expense' ? '−' : '+';
  const amountCls = t.kind === 'expense' ? 'text-red-500' : 'text-green-600';
  return (
    <li className="group flex items-center gap-3 px-3 py-2.5 hover:bg-surface2/40 transition">
      <div
        className="w-9 h-9 rounded-md flex items-center justify-center text-lg shrink-0"
        style={{ background: color + '20' }}
      >
        {cat?.icon ?? (t.kind === 'income' ? '↩' : '·')}
      </div>
      <button
        onClick={onEdit}
        className="flex-1 min-w-0 text-left"
      >
        <div className="text-sm font-medium truncate">{t.description}</div>
        <div className="text-[11px] text-muted flex items-center gap-1.5">
          <span>{cat?.name ?? 'Без категории'}</span>
          <span>·</span>
          <span>
            {paymentIcon(t.payment_method)} {paymentLabel(t.payment_method)}
          </span>
          {t.note && <span className="text-faint truncate">· {t.note}</span>}
        </div>
      </button>
      <div className={`text-sm font-semibold timer-font shrink-0 ${amountCls}`}>
        {sign}{fmt(t.amount)}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
        <button
          onClick={onEdit}
          title="Изменить"
          className="text-faint hover:text-accent p-1"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={onDelete}
          title="Удалить"
          className="text-faint hover:text-red-500 p-1"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );
}

// ============ Transaction form ============

function TransactionFormModal({
  open,
  transaction,
  categories,
  onClose,
  onSaved
}: {
  open: boolean;
  transaction: Transaction | null;
  categories: ExpenseCategory[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}): JSX.Element {
  const currency = useCurrency();
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<TransactionKind>('expense');
  const [categoryId, setCategoryId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [date, setDate] = useState(ymd(new Date()));
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    if (transaction) {
      setAmount(String(transaction.amount));
      setKind(transaction.kind);
      setCategoryId(transaction.category_id ?? '');
      setPaymentMethod(transaction.payment_method);
      setDate(transaction.date);
      setDescription(transaction.description);
      setNote(transaction.note ?? '');
    } else {
      setAmount('');
      setKind('expense');
      setCategoryId('');
      setPaymentMethod('card');
      setDate(ymd(new Date()));
      setDescription('');
      setNote('');
    }
  }, [open, transaction]);

  const matchingCategories = categories.filter((c) => !c.archived && c.kind === kind);
  const amountNum = Number(amount.replace(',', '.'));
  const canSave = amountNum > 0 && description.trim() && date;

  async function save(): Promise<void> {
    if (!canSave) return;
    const payload = {
      amount: amountNum,
      kind,
      category_id: categoryId || null,
      payment_method: paymentMethod,
      date,
      description: description.trim(),
      note: note.trim() || null
    };
    if (transaction) {
      await api.updateTransaction(transaction.id, payload);
    } else {
      await api.createTransaction(payload);
    }
    await onSaved();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={transaction ? 'Транзакция' : 'Новая транзакция'}
      footer={
        <>
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border border-border">
            Отмена
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            className="px-4 py-1.5 rounded-md text-sm bg-accent text-white hover:bg-accent-hover disabled:opacity-40"
          >
            Сохранить
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(['expense', 'income'] as const).map((k) => (
            <button
              key={k}
              onClick={() => {
                setKind(k);
                setCategoryId(''); // reset category — different list for income/expense
              }}
              className={`px-3 py-2.5 rounded-md text-sm border flex items-center justify-center gap-2 transition ${
                kind === k
                  ? k === 'expense'
                    ? 'bg-red-50 border-red-300 text-red-700'
                    : 'bg-green-50 border-green-300 text-green-700'
                  : 'border-border hover:bg-surface2'
              }`}
            >
              {k === 'expense' ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
              {k === 'expense' ? 'Расход' : 'Доход'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
          <label className="text-xs uppercase text-muted pt-3">Сумма</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
              autoFocus
              placeholder="0"
              className="input flex-1 text-right text-lg font-semibold timer-font"
            />
            <span className="text-muted text-lg">
              {currency === 'USD' ? '$' : '₽'}
            </span>
          </div>

          <label className="text-xs uppercase text-muted pt-3">Описание</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Что купил / откуда пришло"
            className="input"
          />

          <label className="text-xs uppercase text-muted pt-3">Категория</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="input"
          >
            <option value="">Без категории</option>
            {matchingCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon ?? ''} {c.name}
              </option>
            ))}
          </select>

          <label className="text-xs uppercase text-muted pt-3">Способ оплаты</label>
          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setPaymentMethod(m.value)}
                className={`px-3 h-9 rounded-md text-sm border transition ${
                  paymentMethod === m.value
                    ? 'bg-accent text-white border-accent'
                    : 'border-border hover:bg-surface2'
                }`}
              >
                {m.icon} {m.label}
              </button>
            ))}
          </div>

          <label className="text-xs uppercase text-muted pt-3">Дата</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input w-44"
          />

          <label className="text-xs uppercase text-muted pt-3">Заметка</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Доп. информация"
            rows={2}
            className="input"
            style={{ height: 'auto', padding: '0.5rem 0.75rem' }}
          />
        </div>
      </div>
    </Modal>
  );
}

// ============ Analytics pane ============

function AnalyticsPane({
  transactions,
  categories,
  fmt
}: {
  transactions: Transaction[];
  categories: ExpenseCategory[];
  fmt: (v: number) => string;
}): JSX.Element {
  const catMap = useMemo(() => categoryById(categories), [categories]);

  const expense = transactions.filter((t) => t.kind === 'expense');
  const income = transactions.filter((t) => t.kind === 'income');
  const totalExpense = expense.reduce((s, t) => s + t.amount, 0);
  const totalIncome = income.reduce((s, t) => s + t.amount, 0);

  // Compute distinct days in range to calculate average
  const days = new Set(transactions.map((t) => t.date)).size;
  const avgPerDay = days > 0 ? totalExpense / days : 0;

  // Top categories by spend
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of expense) {
      const key = t.category_id ?? '__none__';
      m.set(key, (m.get(key) ?? 0) + t.amount);
    }
    return Array.from(m.entries())
      .map(([id, amount]) => ({
        id,
        amount,
        name: id === '__none__' ? 'Без категории' : (catMap.get(id)?.name ?? '?'),
        color: id === '__none__' ? '#94A3B8' : (catMap.get(id)?.color ?? '#94A3B8'),
        icon: id === '__none__' ? '·' : (catMap.get(id)?.icon ?? '·')
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [expense, catMap]);

  // By-day for line chart
  const byDay = useMemo(() => {
    const m = new Map<string, { date: string; expense: number; income: number }>();
    for (const t of transactions) {
      const e = m.get(t.date) ?? { date: t.date, expense: 0, income: 0 };
      if (t.kind === 'expense') e.expense += t.amount;
      else e.income += t.amount;
      m.set(t.date, e);
    }
    return Array.from(m.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [transactions]);

  // Top single transactions
  const biggest = useMemo(() => {
    return [...expense].sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [expense]);

  // By month for the bar chart (если период больше месяца)
  const byMonth = useMemo(() => {
    const m = new Map<string, { month: string; expense: number; income: number }>();
    for (const t of transactions) {
      const month = t.date.slice(0, 7);
      const e = m.get(month) ?? { month, expense: 0, income: 0 };
      if (t.kind === 'expense') e.expense += t.amount;
      else e.income += t.amount;
      m.set(month, e);
    }
    return Array.from(m.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [transactions]);

  if (transactions.length === 0) {
    return (
      <div className="bg-surface rounded-lg shadow-sm p-12 text-center border border-border">
        <div className="text-4xl mb-3 opacity-40">📊</div>
        <div className="text-sm text-muted">
          В выбранном периоде нет данных для аналитики.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Всего потрачено" value={fmt(totalExpense)} tone="red" icon={<TrendingDown size={14} />} />
        <KPI label="Всего получено" value={fmt(totalIncome)} tone="green" icon={<TrendingUp size={14} />} />
        <KPI label="Средний расход в день" value={fmt(avgPerDay)} />
        <KPI label="Транзакций" value={String(transactions.length)} />
      </div>

      {/* Line chart by day */}
      <section className="bg-surface rounded-lg shadow-sm p-4 border border-border">
        <h2 className="text-sm font-semibold mb-3">По дням</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={byDay}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
              <Tooltip
                formatter={(v: number) => fmt(v)}
                labelFormatter={(l: string) => formatDay(l)}
                contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }}
              />
              <Line type="monotone" dataKey="expense" stroke="#EF4444" strokeWidth={2} dot={false} name="Расход" />
              <Line type="monotone" dataKey="income" stroke="#10B981" strokeWidth={2} dot={false} name="Доход" />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Two-column: by-category pie + top categories list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <section className="bg-surface rounded-lg shadow-sm p-4 border border-border">
          <h2 className="text-sm font-semibold mb-3">Расходы по категориям</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byCat}
                  dataKey="amount"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {byCat.map((c) => (
                    <Cell key={c.id} fill={c.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => fmt(v)}
                  contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="bg-surface rounded-lg shadow-sm p-4 border border-border">
          <h2 className="text-sm font-semibold mb-3">Топ категорий</h2>
          <ul className="space-y-2">
            {byCat.slice(0, 6).map((c) => {
              const pct = totalExpense > 0 ? (c.amount / totalExpense) * 100 : 0;
              return (
                <li key={c.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span>{c.icon}</span>
                      <span>{c.name}</span>
                    </span>
                    <span className="text-muted">{fmt(c.amount)} · {pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 mt-1 rounded-full bg-surface2 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: c.color }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {/* By month (if period spans >1) */}
      {byMonth.length > 1 && (
        <section className="bg-surface rounded-lg shadow-sm p-4 border border-border">
          <h2 className="text-sm font-semibold mb-3">По месяцам</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byMonth}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                <Tooltip
                  formatter={(v: number) => fmt(v)}
                  contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }}
                />
                <Bar dataKey="expense" fill="#EF4444" name="Расход" />
                <Bar dataKey="income" fill="#10B981" name="Доход" />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Biggest transactions */}
      <section className="bg-surface rounded-lg shadow-sm p-4 border border-border">
        <h2 className="text-sm font-semibold mb-3">Самые крупные расходы</h2>
        {biggest.length === 0 ? (
          <div className="text-sm text-muted">Расходов в этом периоде нет.</div>
        ) : (
          <ul className="divide-y divide-border">
            {biggest.map((t) => {
              const cat = t.category_id ? catMap.get(t.category_id) : null;
              return (
                <li key={t.id} className="py-2 flex items-center gap-3">
                  <span className="text-lg">{cat?.icon ?? '·'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{t.description}</div>
                    <div className="text-[11px] text-muted">
                      {formatDay(t.date)} · {cat?.name ?? 'Без категории'}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-red-500 timer-font">−{fmt(t.amount)}</div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function KPI({
  label,
  value,
  tone,
  icon
}: {
  label: string;
  value: string;
  tone?: 'red' | 'green';
  icon?: React.ReactNode;
}): JSX.Element {
  const cls = tone === 'red' ? 'text-red-500' : tone === 'green' ? 'text-green-600' : 'text-ink';
  return (
    <div className="bg-surface rounded-lg shadow-sm p-4 border border-border">
      <div className="text-[10px] uppercase tracking-wide text-muted flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className={`text-xl font-semibold timer-font mt-1 ${cls}`}>{value}</div>
    </div>
  );
}

// ============ Budgets pane ============

function BudgetsPane({
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

// ============ Categories pane ============

function CategoriesPane({
  categories,
  onChanged,
  fmt: _fmt
}: {
  categories: ExpenseCategory[];
  onChanged: () => Promise<void>;
  fmt: (v: number) => string;
}): JSX.Element {
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [creating, setCreating] = useState<TransactionKind | null>(null);

  const expense = categories.filter((c) => c.kind === 'expense' && !c.archived);
  const income = categories.filter((c) => c.kind === 'income' && !c.archived);
  const archived = categories.filter((c) => c.archived);

  async function onDelete(c: ExpenseCategory): Promise<void> {
    if (!confirmDelete(`Удалить категорию «${c.name}»? Транзакции в ней останутся, но без категории.`)) return;
    await api.deleteExpenseCategory(c.id);
    await onChanged();
  }

  async function toggleArchive(c: ExpenseCategory): Promise<void> {
    await api.updateExpenseCategory(c.id, { archived: c.archived ? 0 : 1 });
    await onChanged();
  }

  return (
    <div className="space-y-4">
      <CategoryGroup
        title="Категории расходов"
        kind="expense"
        cats={expense}
        onEdit={setEditing}
        onCreate={() => setCreating('expense')}
        onDelete={onDelete}
        onArchive={toggleArchive}
      />
      <CategoryGroup
        title="Категории доходов"
        kind="income"
        cats={income}
        onEdit={setEditing}
        onCreate={() => setCreating('income')}
        onDelete={onDelete}
        onArchive={toggleArchive}
      />
      {archived.length > 0 && (
        <section>
          <h2 className="text-xs uppercase text-muted mb-2">В архиве · {archived.length}</h2>
          <div className="bg-surface rounded-lg shadow-sm border border-border divide-y divide-border">
            {archived.map((c) => (
              <div key={c.id} className="px-3 py-2 flex items-center gap-2 text-muted">
                <span className="text-lg">{c.icon ?? '·'}</span>
                <span className="text-sm flex-1">{c.name}</span>
                <button
                  onClick={() => toggleArchive(c)}
                  className="text-[11px] text-accent hover:underline"
                >
                  Вернуть
                </button>
                <button
                  onClick={() => onDelete(c)}
                  className="text-faint hover:text-red-500"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <CategoryFormModal
        open={editing !== null || creating !== null}
        category={editing}
        defaultKind={creating ?? 'expense'}
        onClose={() => { setEditing(null); setCreating(null); }}
        onSaved={async () => {
          setEditing(null);
          setCreating(null);
          await onChanged();
        }}
      />
    </div>
  );
}

function CategoryGroup({
  title,
  cats,
  onEdit,
  onCreate,
  onDelete,
  onArchive
}: {
  title: string;
  kind: TransactionKind;
  cats: ExpenseCategory[];
  onEdit: (c: ExpenseCategory) => void;
  onCreate: () => void;
  onDelete: (c: ExpenseCategory) => Promise<void>;
  onArchive: (c: ExpenseCategory) => Promise<void>;
}): JSX.Element {
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs uppercase text-muted">{title} · {cats.length}</h2>
        <button
          onClick={onCreate}
          className="text-sm text-accent hover:underline flex items-center gap-1"
        >
          <Plus size={13} /> Добавить
        </button>
      </div>
      <div className="bg-surface rounded-lg shadow-sm border border-border divide-y divide-border">
        {cats.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted text-center">Пусто</div>
        ) : (
          cats.map((c) => (
            <div key={c.id} className="px-3 py-2 flex items-center gap-3 group">
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center text-lg shrink-0"
                style={{ background: (c.color ?? '#94A3B8') + '20' }}
              >
                {c.icon ?? '·'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.name}</div>
                {c.monthly_limit && (
                  <div className="text-[11px] text-muted">
                    Лимит · {fmtMoney(c.monthly_limit, 'RUB')}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                <button onClick={() => onEdit(c)} className="text-faint hover:text-accent p-1">
                  <Pencil size={13} />
                </button>
                <button onClick={() => onArchive(c)} className="text-faint hover:text-amber-500 p-1" title="В архив">
                  <ArrowDown size={13} />
                </button>
                <button onClick={() => onDelete(c)} className="text-faint hover:text-red-500 p-1">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function CategoryFormModal({
  open,
  category,
  defaultKind,
  onClose,
  onSaved
}: {
  open: boolean;
  category: ExpenseCategory | null;
  defaultKind: TransactionKind;
  onClose: () => void;
  onSaved: () => Promise<void>;
}): JSX.Element {
  const ICONS = ['🍔','🚕','🏠','💳','💊','👕','💼','🎮','📦','💰','✨','☕','📱','🎓','🐾','🎁','✈️','⛽','🛒','📚'];
  const COLORS = ['#EA580C','#0284C7','#65A30D','#7C3AED','#DC2626','#DB2777','#475569','#D97706','#94A3B8','#059669','#0891B2','#2563EB'];
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [kind, setKind] = useState<TransactionKind>(defaultKind);
  const [limit, setLimit] = useState('');

  useEffect(() => {
    if (!open) return;
    if (category) {
      setName(category.name);
      setIcon(category.icon ?? ICONS[0]);
      setColor(category.color ?? COLORS[0]);
      setKind(category.kind);
      setLimit(category.monthly_limit ? String(category.monthly_limit) : '');
    } else {
      setName('');
      setIcon(ICONS[0]);
      setColor(COLORS[0]);
      setKind(defaultKind);
      setLimit('');
    }
  }, [open, category, defaultKind]);

  async function save(): Promise<void> {
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      icon,
      color,
      kind,
      monthly_limit: limit ? Number(limit.replace(',', '.')) : null
    };
    if (category) {
      await api.updateExpenseCategory(category.id, payload);
    } else {
      await api.createExpenseCategory(payload);
    }
    await onSaved();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={category ? 'Категория' : 'Новая категория'}
      footer={
        <>
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border border-border">
            Отмена
          </button>
          <button
            onClick={save}
            disabled={!name.trim()}
            className="px-4 py-1.5 rounded-md text-sm bg-accent text-white hover:bg-accent-hover disabled:opacity-40"
          >
            Сохранить
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(['expense', 'income'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`px-3 py-2 rounded-md text-sm border transition ${
                kind === k ? 'bg-accent text-white border-accent' : 'border-border hover:bg-surface2'
              }`}
            >
              {k === 'expense' ? 'Расход' : 'Доход'}
            </button>
          ))}
        </div>

        <Row label="Название">
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" autoFocus />
        </Row>

        <Row label="Иконка">
          <div className="flex flex-wrap gap-1.5">
            {ICONS.map((i) => (
              <button
                key={i}
                onClick={() => setIcon(i)}
                className={`w-9 h-9 rounded-md text-lg border transition ${
                  icon === i ? 'border-accent bg-accent-light' : 'border-border hover:bg-surface2'
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </Row>

        <Row label="Цвет">
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-md transition ${
                  color === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </Row>

        {kind === 'expense' && (
          <Row label="Лимит в месяц" hint="Можно оставить пустым.">
            <input
              type="text"
              inputMode="decimal"
              value={limit}
              onChange={(e) => setLimit(e.target.value.replace(/[^0-9.,]/g, ''))}
              placeholder="Не задан"
              className="input w-40"
            />
          </Row>
        )}
      </div>
    </Modal>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3">
      <div className="pt-2">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-[11px] text-muted mt-0.5">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ============ Recurring pane ============

const WEEKDAY_NAMES = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

function RecurringPane({
  recurring,
  categories,
  onChanged,
  fmt
}: {
  recurring: RecurringTransaction[];
  categories: ExpenseCategory[];
  onChanged: () => Promise<void>;
  fmt: (v: number) => string;
}): JSX.Element {
  const [editing, setEditing] = useState<RecurringTransaction | null>(null);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const catMap = useMemo(() => categoryById(categories), [categories]);

  const active = recurring.filter((r) => !r.archived);
  const archived = recurring.filter((r) => r.archived);
  const monthly = active.filter((r) => r.period === 'monthly');
  const weekly = active.filter((r) => r.period === 'weekly');

  // Прогноз: сколько обязательных трат/доходов в этом месяце.
  const monthlyForecast = useMemo(() => {
    let expense = 0;
    let income = 0;
    for (const r of active) {
      // Недельные в месяц считаем ~ 4.33 раза.
      const factor = r.period === 'weekly' ? 4.33 : 1;
      if (r.kind === 'expense') expense += r.amount * factor;
      else income += r.amount * factor;
    }
    return { expense, income };
  }, [active]);

  async function applyNow(r: RecurringTransaction): Promise<void> {
    await api.createTransaction({
      amount: r.amount,
      kind: r.kind,
      category_id: r.category_id,
      payment_method: r.payment_method,
      date: ymd(new Date()),
      description: r.description,
      note: 'Из регулярной транзакции',
      recurring_id: r.id
    });
    await onChanged();
  }

  async function toggleArchive(r: RecurringTransaction): Promise<void> {
    await api.updateRecurringTransaction(r.id, { archived: r.archived ? 0 : 1 });
    await onChanged();
  }

  async function onDelete(r: RecurringTransaction): Promise<void> {
    if (!confirmDelete(`Удалить шаблон «${r.description}»? История транзакций по нему сохранится.`)) return;
    await api.deleteRecurringTransaction(r.id);
    await onChanged();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold">Регулярные платежи</h2>
          <div className="text-sm text-muted mt-0.5">
            Шаблоны для повторяющихся доходов и расходов — подписки, аренда, зарплата.
          </div>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="bg-accent text-white px-3 h-9 rounded-md text-sm hover:bg-accent-hover flex items-center gap-1.5 shadow-sm"
        >
          <Plus size={14} /> Шаблон
        </button>
      </div>

      {active.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface rounded-lg border border-border p-3">
            <div className="text-[10px] uppercase text-faint">В месяц фиксированных трат</div>
            <div className="text-lg font-semibold timer-font text-red-500 mt-0.5">
              −{fmt(monthlyForecast.expense)}
            </div>
          </div>
          <div className="bg-surface rounded-lg border border-border p-3">
            <div className="text-[10px] uppercase text-faint">В месяц регулярного дохода</div>
            <div className="text-lg font-semibold timer-font text-green-600 mt-0.5">
              +{fmt(monthlyForecast.income)}
            </div>
          </div>
        </div>
      )}

      {monthly.length > 0 && (
        <RecurringGroup
          title="Ежемесячно"
          items={monthly}
          catMap={catMap}
          fmt={fmt}
          onEdit={setEditing}
          onApply={applyNow}
          onArchive={toggleArchive}
          onDelete={onDelete}
        />
      )}
      {weekly.length > 0 && (
        <RecurringGroup
          title="Еженедельно"
          items={weekly}
          catMap={catMap}
          fmt={fmt}
          onEdit={setEditing}
          onApply={applyNow}
          onArchive={toggleArchive}
          onDelete={onDelete}
        />
      )}

      {active.length === 0 && (
        <div className="bg-surface rounded-lg shadow-sm p-12 text-center border border-border">
          <div className="text-4xl mb-3 opacity-40">🔁</div>
          <div className="text-sm text-muted max-w-md mx-auto">
            Здесь будут шаблоны для подписок, аренды, зарплаты и других регулярных операций.
            Один клик «Применить» — и транзакция уже в журнале на сегодня.
          </div>
          <button
            onClick={() => setCreating(true)}
            className="mt-4 inline-flex items-center gap-1.5 bg-accent text-white px-4 py-2 rounded-md text-sm hover:bg-accent-hover shadow-sm"
          >
            <Plus size={14} /> Создать шаблон
          </button>
        </div>
      )}

      {archived.length > 0 && (
        <div>
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="text-xs uppercase text-muted hover:text-ink flex items-center gap-1"
          >
            <Archive size={12} /> В архиве · {archived.length}
            <span className="text-faint">{showArchived ? '↑' : '↓'}</span>
          </button>
          {showArchived && (
            <div className="bg-surface rounded-lg shadow-sm border border-border divide-y divide-border mt-2">
              {archived.map((r) => {
                const cat = r.category_id ? catMap.get(r.category_id) : null;
                return (
                  <div key={r.id} className="px-3 py-2 flex items-center gap-3 text-muted">
                    <span className="text-lg opacity-60">{cat?.icon ?? '·'}</span>
                    <span className="text-sm flex-1 truncate">{r.description}</span>
                    <span className="text-xs">{fmt(r.amount)}</span>
                    <button
                      onClick={() => toggleArchive(r)}
                      className="text-[11px] text-accent hover:underline"
                    >
                      Вернуть
                    </button>
                    <button
                      onClick={() => onDelete(r)}
                      className="text-faint hover:text-red-500"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <RecurringFormModal
        open={creating || editing !== null}
        item={editing}
        categories={categories}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={async () => {
          setCreating(false);
          setEditing(null);
          await onChanged();
        }}
      />
    </div>
  );
}

function RecurringGroup({
  title,
  items,
  catMap,
  fmt,
  onEdit,
  onApply,
  onArchive,
  onDelete
}: {
  title: string;
  items: RecurringTransaction[];
  catMap: Map<string, ExpenseCategory>;
  fmt: (v: number) => string;
  onEdit: (r: RecurringTransaction) => void;
  onApply: (r: RecurringTransaction) => Promise<void>;
  onArchive: (r: RecurringTransaction) => Promise<void>;
  onDelete: (r: RecurringTransaction) => Promise<void>;
}): JSX.Element {
  return (
    <section>
      <h3 className="text-xs uppercase text-muted mb-2">{title}</h3>
      <ul className="bg-surface rounded-lg shadow-sm border border-border divide-y divide-border">
        {items.map((r) => {
          const cat = r.category_id ? catMap.get(r.category_id) : null;
          const color = cat?.color ?? (r.kind === 'income' ? '#059669' : '#94A3B8');
          const next = nextDueDate(r);
          const amountCls = r.kind === 'expense' ? 'text-red-500' : 'text-green-600';
          const sign = r.kind === 'expense' ? '−' : '+';
          return (
            <li key={r.id} className="group flex items-center gap-3 px-3 py-2.5 hover:bg-surface2/40 transition">
              <div
                className="w-10 h-10 rounded-md flex items-center justify-center text-lg shrink-0"
                style={{ background: color + '20' }}
              >
                {cat?.icon ?? (r.kind === 'income' ? '↩' : '·')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.description}</div>
                <div className="text-[11px] text-muted flex items-center gap-1.5 flex-wrap">
                  <span>{cat?.name ?? 'Без категории'}</span>
                  <span>·</span>
                  <span>{paymentIcon(r.payment_method)} {paymentLabel(r.payment_method)}</span>
                  <span>·</span>
                  <span>{describeSchedule(r)}</span>
                  {next && (
                    <>
                      <span>·</span>
                      <span className="text-accent">Следующее: {formatDay(next)}</span>
                    </>
                  )}
                  {r.reminder_enabled ? (
                    <span title="Напоминание включено" className="text-amber-500 inline-flex items-center gap-0.5">
                      <Bell size={10} /> {r.remind_time ?? ''}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className={`text-sm font-semibold timer-font shrink-0 ${amountCls}`}>
                {sign}{fmt(r.amount)}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                <button
                  onClick={() => onApply(r)}
                  title="Применить сейчас (создать транзакцию на сегодня)"
                  className="text-faint hover:text-accent p-1"
                >
                  <Zap size={14} />
                </button>
                <button
                  onClick={() => onEdit(r)}
                  title="Изменить"
                  className="text-faint hover:text-accent p-1"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => onArchive(r)}
                  title="В архив"
                  className="text-faint hover:text-amber-500 p-1"
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  onClick={() => onDelete(r)}
                  title="Удалить"
                  className="text-faint hover:text-red-500 p-1"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RecurringFormModal({
  open,
  item,
  categories,
  onClose,
  onSaved
}: {
  open: boolean;
  item: RecurringTransaction | null;
  categories: ExpenseCategory[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}): JSX.Element {
  const currency = useCurrency();
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<TransactionKind>('expense');
  const [categoryId, setCategoryId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [description, setDescription] = useState('');
  const [period, setPeriod] = useState<RecurrencePeriod>('monthly');
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [dayOfWeek, setDayOfWeek] = useState<number>(1); // 1 = Пн
  const [reminderEnabled, setReminderEnabled] = useState<boolean>(true);
  const [remindTime, setRemindTime] = useState<string>('10:00');

  useEffect(() => {
    if (!open) return;
    if (item) {
      setAmount(String(item.amount));
      setKind(item.kind);
      setCategoryId(item.category_id ?? '');
      setPaymentMethod(item.payment_method);
      setDescription(item.description);
      setPeriod(item.period);
      setDayOfMonth(item.day_of_month ?? 1);
      setDayOfWeek(item.day_of_week ?? 1);
      setReminderEnabled(!!item.reminder_enabled);
      setRemindTime(item.remind_time ?? '10:00');
    } else {
      setAmount('');
      setKind('expense');
      setCategoryId('');
      setPaymentMethod('card');
      setDescription('');
      setPeriod('monthly');
      setDayOfMonth(new Date().getDate());
      setDayOfWeek(1);
      setReminderEnabled(true);
      setRemindTime('10:00');
    }
  }, [open, item]);

  const matchingCategories = categories.filter((c) => !c.archived && c.kind === kind);
  const amountNum = Number(amount.replace(',', '.'));
  const canSave = amountNum > 0 && description.trim();

  async function save(): Promise<void> {
    if (!canSave) return;
    const payload = {
      amount: amountNum,
      kind,
      category_id: categoryId || null,
      payment_method: paymentMethod,
      description: description.trim(),
      period,
      day_of_month: period === 'monthly' ? dayOfMonth : null,
      day_of_week: period === 'weekly' ? dayOfWeek : null,
      reminder_enabled: reminderEnabled ? 1 : 0,
      remind_time: reminderEnabled ? remindTime : null
    };
    if (item) {
      await api.updateRecurringTransaction(item.id, payload);
    } else {
      await api.createRecurringTransaction(payload);
    }
    await onSaved();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? 'Регулярная транзакция' : 'Новый регулярный платёж'}
      footer={
        <>
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border border-border">
            Отмена
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            className="px-4 py-1.5 rounded-md text-sm bg-accent text-white hover:bg-accent-hover disabled:opacity-40"
          >
            Сохранить
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(['expense', 'income'] as const).map((k) => (
            <button
              key={k}
              onClick={() => {
                setKind(k);
                setCategoryId('');
              }}
              className={`px-3 py-2.5 rounded-md text-sm border flex items-center justify-center gap-2 transition ${
                kind === k
                  ? k === 'expense'
                    ? 'bg-red-50 border-red-300 text-red-700'
                    : 'bg-green-50 border-green-300 text-green-700'
                  : 'border-border hover:bg-surface2'
              }`}
            >
              {k === 'expense' ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
              {k === 'expense' ? 'Расход' : 'Доход'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
          <label className="text-xs uppercase text-muted pt-3">Сумма</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
              autoFocus
              placeholder="0"
              className="input flex-1 text-right text-lg font-semibold timer-font"
            />
            <span className="text-muted text-lg">{currency === 'USD' ? '$' : '₽'}</span>
          </div>

          <label className="text-xs uppercase text-muted pt-3">Описание</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Netflix, аренда, зарплата..."
            className="input"
          />

          <label className="text-xs uppercase text-muted pt-3">Категория</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="input"
          >
            <option value="">Без категории</option>
            {matchingCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon ?? ''} {c.name}
              </option>
            ))}
          </select>

          <label className="text-xs uppercase text-muted pt-3">Способ оплаты</label>
          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setPaymentMethod(m.value)}
                className={`px-3 h-9 rounded-md text-sm border transition ${
                  paymentMethod === m.value
                    ? 'bg-accent text-white border-accent'
                    : 'border-border hover:bg-surface2'
                }`}
              >
                {m.icon} {m.label}
              </button>
            ))}
          </div>

          <label className="text-xs uppercase text-muted pt-3">Частота</label>
          <div className="space-y-2">
            <div className="flex gap-2">
              {(['monthly','weekly'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`flex-1 px-3 h-9 rounded-md text-sm border transition ${
                    period === p ? 'bg-accent text-white border-accent' : 'border-border hover:bg-surface2'
                  }`}
                >
                  {p === 'monthly' ? 'Ежемесячно' : 'Еженедельно'}
                </button>
              ))}
            </div>
            {period === 'monthly' ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">В</span>
                <select
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(parseInt(e.target.value, 10))}
                  className="input w-auto"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <span className="text-muted">число месяца</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_NAMES.map((name, idx) => {
                  const v = idx + 1; // 1..7
                  return (
                    <button
                      key={v}
                      onClick={() => setDayOfWeek(v)}
                      className={`w-10 h-9 rounded-md text-sm border transition ${
                        dayOfWeek === v
                          ? 'bg-accent text-white border-accent'
                          : 'border-border hover:bg-surface2'
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <label className="text-xs uppercase text-muted pt-3">Напоминание</label>
          <div className="space-y-2">
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={reminderEnabled}
                onChange={(e) => setReminderEnabled(e.target.checked)}
              />
              Напомнить в день списания
            </label>
            {reminderEnabled && (
              <input
                type="time"
                value={remindTime}
                onChange={(e) => setRemindTime(e.target.value)}
                className="input w-32"
              />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function describeSchedule(r: RecurringTransaction): string {
  if (r.period === 'monthly') {
    return `${r.day_of_month ?? 1}-го числа`;
  }
  const idx = (r.day_of_week ?? 1) - 1;
  return `по ${WEEKDAY_NAMES[idx]?.toLowerCase() ?? '?'}`;
}

/**
 * Когда регулярный платёж сработает в следующий раз. Возвращает YYYY-MM-DD или null,
 * если расчёт не имеет смысла (например, ежемесячный с day_of_month = null).
 */
function nextDueDate(r: RecurringTransaction): string | null {
  const now = new Date();
  if (r.period === 'monthly') {
    const dom = r.day_of_month ?? 1;
    const candidate = new Date(now.getFullYear(), now.getMonth(), dom);
    if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      candidate.setMonth(candidate.getMonth() + 1);
    }
    // Защита от 31 февраля и т.п. — сдвинется на 1 марта; ок.
    return ymd(candidate);
  }
  // weekly: 1..7 (Mon..Sun); JS getDay: 0=Sun..6=Sat → переводим.
  const targetDow = r.day_of_week ?? 1;
  const jsTarget = targetDow === 7 ? 0 : targetDow;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const delta = (jsTarget - today.getDay() + 7) % 7 || 7;
  const next = new Date(today);
  next.setDate(next.getDate() + delta);
  return ymd(next);
}

// ============ Utility ============

/**
 * Парсит строку быстрого добавления.
 * Примеры:
 *   «Кофе 250»            → expense, 250, описание = "Кофе"
 *   «+5000 Зарплата»      → income,  5000, описание = "Зарплата"
 *   «−1200 Такси»         → expense, 1200, описание = "Такси"
 *   «обед 350 еда»        → expense, 350,  описание = "обед", категория = "еда"
 * Возвращает null, если не нашли число.
 */
function parseQuickAdd(input: string): {
  amount: number;
  kind: TransactionKind;
  description: string;
  categoryName: string | null;
} | null {
  const s = input.trim();
  if (!s) return null;
  // Найти первое число
  const numMatch = s.match(/(?:^|\s)([+\-−]?\s*\d+(?:[.,]\d+)?)(?=\s|$)/);
  if (!numMatch) return null;
  const raw = numMatch[1].replace(/\s/g, '').replace(',', '.').replace('−', '-');
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  const isIncome = /^\+/.test(raw);
  const amount = Math.abs(num);
  const numIndex = numMatch.index! + (numMatch[0].length - numMatch[1].length);
  const before = s.slice(0, numIndex).trim();
  const after = s.slice(numIndex + numMatch[1].length).trim();
  // Описание — кусок без числа. Категория, если есть, — последнее слово после числа.
  let description = '';
  let categoryName: string | null = null;
  if (before && after) {
    description = before;
    categoryName = after;
  } else if (before) {
    description = before;
  } else {
    description = after;
  }
  if (!description) description = 'Транзакция';
  return {
    amount,
    kind: isIncome ? 'income' : 'expense',
    description,
    categoryName
  };
}

function pluralize(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

function formatDay(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date === ymd(today)) return 'Сегодня';
  if (date === ymd(yesterday)) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });
}
