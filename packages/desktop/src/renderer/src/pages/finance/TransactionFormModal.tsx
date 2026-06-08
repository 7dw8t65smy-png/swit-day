import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { api } from '../../api';
import type { ExpenseCategory, PaymentMethod, Transaction, TransactionKind } from '@swit/shared';
import Modal from '../../components/Modal';
import { useCurrency } from '../../lib/money';
import { PAYMENT_METHODS, ymd } from '../../lib/finance';

export default function TransactionFormModal({
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
