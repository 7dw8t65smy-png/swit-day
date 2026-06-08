import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { api } from '../../api';
import type {
  ExpenseCategory,
  PaymentMethod,
  RecurrencePeriod,
  RecurringTransaction,
  TransactionKind
} from '@swit/shared';
import Modal from '../../components/Modal';
import { useCurrency } from '../../lib/money';
import { PAYMENT_METHODS } from '../../lib/finance';
import { WEEKDAY_NAMES } from './helpers';

export default function RecurringFormModal({
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
