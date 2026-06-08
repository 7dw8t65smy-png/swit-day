import { useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
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
import type { ExpenseCategory, Transaction } from '@swit/shared';
import { categoryById } from '../../lib/finance';
import { formatDay } from './helpers';

export default function AnalyticsPane({
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
