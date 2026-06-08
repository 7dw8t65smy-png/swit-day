import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, ArrowDown } from 'lucide-react';
import { api } from '../../api';
import type { ExpenseCategory, TransactionKind } from '@swit/shared';
import Modal from '../../components/Modal';
import { confirmDelete } from '../../lib/confirm';
import { fmtMoney } from '../../lib/money';

export default function CategoriesPane({
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
