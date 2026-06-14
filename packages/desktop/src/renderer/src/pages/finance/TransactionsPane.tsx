import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Pencil, Search, Zap } from 'lucide-react';
import { api } from '../../api';
import type { ExpenseCategory, PaymentMethod, Transaction, TransactionKind } from '@swit/shared';
import { confirmDelete } from '../../lib/confirm';
import { PAYMENT_METHODS, categoryById, paymentIcon, paymentLabel, ymd } from '../../lib/finance';
import { formatDay, parseQuickAdd, pluralize } from './helpers';
import TransactionFormModal from './TransactionFormModal';

export default function TransactionsPane({
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
