import { useMemo, useState } from 'react';
import { X, ClipboardPaste, Check } from 'lucide-react';
import { parseOnlyMonsterSales, toMskParts, SHIFT_LABELS } from '@swit/shared';
import type { ParsedSale } from '@swit/shared';
import { api } from '../../api';
import { useAgencyStore } from '../../lib/agency';
import { pushToast } from '../../hooks/useToasts';

const KIND_LABEL: Record<string, string> = {
  message: 'Сообщение',
  tip: 'Чай',
  post: 'Пост',
  subscription: 'Подписка',
  other: 'Другое'
};

export default function SalesImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const agencyId = useAgencyStore((s) => s.selectedId);
  const agencies = useAgencyStore((s) => s.agencies);
  const models = useAgencyStore((s) => s.models);
  const chatters = useAgencyStore((s) => s.chatters);
  const assignments = useAgencyStore((s) => s.assignments);

  const agency = agencies.find((a) => a.id === agencyId) ?? null;
  const [modelId, setModelId] = useState(models[0]?.id ?? '');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const parsed: ParsedSale[] = useMemo(
    () => (text.trim() ? parseOnlyMonsterSales(text) : []),
    [text]
  );

  const tz = agency?.source_tz_offset ?? 300;

  function previewRow(p: ParsedSale): { shift: string; chatter: string } {
    const parts = toMskParts(p, tz);
    const cid = assignments.find((a) => a.model_id === modelId && a.shift === parts.shift)?.chatter_id;
    const chatter = cid ? chatters.find((c) => c.id === cid)?.name ?? '—' : '— не определён —';
    return { shift: SHIFT_LABELS[parts.shift], chatter };
  }

  async function doImport(): Promise<void> {
    if (!agencyId || !modelId || parsed.length === 0) return;
    setBusy(true);
    try {
      const res = await api.importAgencySales({ agency_id: agencyId, model_id: modelId, sales: parsed });
      pushToast({
        kind: 'info',
        message: `Импортировано: ${res.inserted}${res.skipped ? `, пропущено дублей: ${res.skipped}` : ''}`
      });
      onDone();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-bg rounded-2xl border border-border w-full max-w-3xl max-h-[88vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2 font-semibold text-ink">
            <ClipboardPaste size={17} /> Вставить продажи из OnlyMonster
          </div>
          <button onClick={onClose} className="text-faint hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {models.length === 0 ? (
            <div className="text-sm text-faint py-6 text-center">
              Сначала добавьте модель на вкладке «Модели».
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-3">
                <label className="text-sm text-muted">Модель:</label>
                <select
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  className="h-9 px-2.5 rounded-md border border-border bg-surface text-sm"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-faint">
                  Часовой пояс аккаунта: UTC{tz >= 0 ? '+' : ''}
                  {tz / 60} · смены считаются в МСК
                </span>
              </div>

              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder={`Вставьте скопированный из OnlyMonster текст, например:\nJun 14, 2026 11:08 pm   $5.69   $1.14   $4.55\nPayment for message from Lyrec`}
                className="w-full p-3 rounded-lg border border-border bg-surface text-sm font-mono resize-none focus:outline-none focus:border-accent"
              />

              {parsed.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs text-muted mb-1.5">
                    Распознано продаж: <b className="text-ink">{parsed.length}</b>
                  </div>
                  <div className="border border-border rounded-lg overflow-hidden max-h-[34vh] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-surface2 text-muted sticky top-0">
                        <tr>
                          <th className="text-left font-medium px-2 py-1.5">Дата/время</th>
                          <th className="text-right font-medium px-2 py-1.5">Сумма</th>
                          <th className="text-right font-medium px-2 py-1.5">NET</th>
                          <th className="text-left font-medium px-2 py-1.5">Тип</th>
                          <th className="text-left font-medium px-2 py-1.5">Фанат</th>
                          <th className="text-left font-medium px-2 py-1.5">Смена</th>
                          <th className="text-left font-medium px-2 py-1.5">Чаттер</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.map((p, i) => {
                          const pr = previewRow(p);
                          const undet = pr.chatter.startsWith('—');
                          return (
                            <tr key={i} className="border-t border-border">
                              <td className="px-2 py-1.5 text-ink whitespace-nowrap">{p.raw_datetime}</td>
                              <td className="px-2 py-1.5 text-right timer-font">${p.amount.toFixed(2)}</td>
                              <td className="px-2 py-1.5 text-right timer-font">${p.net.toFixed(2)}</td>
                              <td className="px-2 py-1.5">{KIND_LABEL[p.kind]}</td>
                              <td className="px-2 py-1.5 truncate max-w-[120px]">{p.fan_name ?? '—'}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap">{pr.shift}</td>
                              <td className={`px-2 py-1.5 ${undet ? 'text-amber-600 dark:text-amber-400' : 'text-ink'}`}>
                                {pr.chatter}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {text.trim() && parsed.length === 0 && (
                <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  Не удалось распознать ни одной продажи. Проверьте формат вставки.
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onClose} className="px-3 h-9 rounded-md text-sm text-muted hover:text-ink">
            Отмена
          </button>
          <button
            onClick={() => void doImport()}
            disabled={busy || parsed.length === 0 || !modelId}
            className="bg-accent text-white px-4 h-9 rounded-md text-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <Check size={15} /> Импортировать {parsed.length > 0 ? `(${parsed.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
