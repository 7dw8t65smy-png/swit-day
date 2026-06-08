import { useMemo, useState } from 'react';
import { Plus, Trash2, Pencil, ArrowDown, Zap, Bell, Archive } from 'lucide-react';
import { api } from '../../api';
import type { ExpenseCategory, RecurringTransaction } from '@swit/shared';
import { confirmDelete } from '../../lib/confirm';
import { categoryById, paymentIcon, paymentLabel, ymd } from '../../lib/finance';
import { describeSchedule, formatDay, nextDueDate } from './helpers';
import RecurringFormModal from './RecurringFormModal';

export default function RecurringPane({
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
