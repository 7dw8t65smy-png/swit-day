import { useEffect, useMemo, useState } from 'react';
import { X, ClipboardPaste, Check, Plus, Link2 } from 'lucide-react';
import { parseOnlyMonsterSales } from '@swit/shared';
import type { ParsedSale } from '@swit/shared';
import { api } from '../../api';
import { useAgencyStore } from '../../lib/agency';
import { useAuth } from '../../lib/auth';
import { pushToast } from '../../hooks/useToasts';

const KIND_LABEL: Record<string, string> = {
  message: 'Сообщение',
  tip: 'Чай',
  post: 'Пост',
  subscription: 'Подписка',
  other: 'Другое'
};

const CREATE = '__create__';
const CHATTER_PLACEHOLDERS = new Set(['', 'хз', 'хуз', '?', '-', '—', 'none']);

export default function SalesImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const agencyId = useAgencyStore((s) => s.selectedId);
  const models = useAgencyStore((s) => s.models);
  const reloadEntities = useAgencyStore((s) => s.reloadEntities);

  const [modelId, setModelId] = useState(models[0]?.id ?? '');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  // Решение по каждой распознанной модели: CREATE (создать) или id существующей.
  const [resolve, setResolve] = useState<Record<string, string>>({});

  const parsed: ParsedSale[] = useMemo(() => (text.trim() ? parseOnlyMonsterSales(text) : []), [text]);

  const modelByNameLower = useMemo(
    () => new Map(models.map((m) => [m.name.trim().toLowerCase(), m.id])),
    [models]
  );

  // Уникальные имена моделей из вставки + строки без модели.
  const distinctModels = useMemo(
    () => Array.from(new Set(parsed.map((p) => (p.model_name ?? '').trim()).filter(Boolean))),
    [parsed]
  );
  const hasRowsWithoutModel = parsed.some((p) => !(p.model_name ?? '').trim());

  // Инициализируем решение для новых имён, сохраняя выбор пользователя.
  useEffect(() => {
    setResolve((prev) => {
      const next = { ...prev };
      for (const nm of distinctModels) {
        const key = nm.toLowerCase();
        if (next[key] === undefined) next[key] = modelByNameLower.get(key) ?? CREATE;
      }
      return next;
    });
  }, [distinctModels, modelByNameLower]);

  useEffect(() => {
    if (!modelId && models[0]) setModelId(models[0].id);
  }, [models, modelId]);

  function chatterLabel(p: ParsedSale): string {
    const cn = (p.chatter_name ?? '').trim();
    if (!cn || CHATTER_PLACEHOLDERS.has(cn.toLowerCase())) return '— не определён —';
    return cn;
  }
  function modelLabel(p: ParsedSale): string {
    const nm = (p.model_name ?? '').trim();
    if (nm) return nm;
    return models.find((m) => m.id === modelId)?.name ?? '— выберите —';
  }

  const needDefaultPicker = hasRowsWithoutModel || distinctModels.length === 0;
  const canImport = parsed.length > 0 && (!needDefaultPicker || !!modelId) && !busy;

  async function doImport(): Promise<void> {
    if (!agencyId || parsed.length === 0) return;
    const model_map: Record<string, string> = {};
    const create_models: string[] = [];
    for (const nm of distinctModels) {
      const r = resolve[nm.toLowerCase()];
      if (r === CREATE) create_models.push(nm);
      else if (r) model_map[nm] = r;
    }
    setBusy(true);
    try {
      const res = await api.importAgencySales({
        agency_id: agencyId,
        default_model_id: needDefaultPicker ? modelId || null : null,
        model_map,
        create_models,
        create_chatters: true,
        sales: parsed
      });
      const extra: string[] = [];
      if (res.created_models) extra.push(`моделей: +${res.created_models}`);
      if (res.created_chatters) extra.push(`чаттеров: +${res.created_chatters}`);
      if (res.skipped) extra.push(`пропущено: ${res.skipped}`);
      pushToast({
        kind: 'info',
        message: `Импортировано: ${res.inserted}${extra.length ? ` (${extra.join(', ')})` : ''}`
      });
      await reloadEntities();
      useAuth.getState().bumpData();
      onDone();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
      <div
        className="bg-bg rounded-2xl border border-border w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-2 font-semibold text-ink">
            <ClipboardPaste size={17} className="text-accent" /> Вставить продажи из OnlyMonster
          </div>
          <button onClick={onClose} className="text-faint hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          <p className="text-[12px] text-muted mb-3">
            Вставьте строки таблицы (с моделью и чаттером) или текст из OnlyMonster. Модель и чаттер
            из строк подставятся сами; «хз»/пусто → «не определён».
          </p>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={`Например (из таблицы):\nEva\t\tJun 8, 2026 8:08 pm\t$17.00\t$3.40\t$13.60\tPayment for message from mommys boy\tМаксим`}
            className="w-full p-3 rounded-lg border border-border bg-surface text-sm font-mono resize-none focus:outline-none focus:border-accent transition-colors"
          />

          {/* Разбор моделей из вставки */}
          {distinctModels.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <div className="text-[11px] uppercase text-muted">Модели из вставки</div>
              {distinctModels.map((nm) => {
                const key = nm.toLowerCase();
                const matched = modelByNameLower.get(key);
                const val = resolve[key] ?? matched ?? CREATE;
                return (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    <span className="text-ink font-medium min-w-[90px] truncate">{nm}</span>
                    {matched ? (
                      <span className="flex items-center gap-1 text-emerald-500 text-xs">
                        <Check size={13} /> существующая
                      </span>
                    ) : (
                      <>
                        <Link2 size={13} className="text-faint" />
                        <select
                          value={val}
                          onChange={(e) => setResolve((p) => ({ ...p, [key]: e.target.value }))}
                          className="h-8 px-2 rounded-md border border-border bg-surface text-xs focus:outline-none focus:border-accent"
                        >
                          <option value={CREATE}>➕ Создать «{nm}»</option>
                          {models.map((m) => (
                            <option key={m.id} value={m.id}>→ {m.name}</option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Модель по умолчанию для строк без модели */}
          {needDefaultPicker && (
            <div className="mt-3 flex items-center gap-2">
              <label className="text-sm text-muted">
                {distinctModels.length === 0 ? 'Модель:' : 'Строки без модели →'}
              </label>
              {models.length === 0 ? (
                <span className="text-xs text-amber-500">Сначала добавьте модель на вкладке «Модели».</span>
              ) : (
                <select
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  className="h-9 px-2.5 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {parsed.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-muted mb-1.5">
                Распознано продаж: <b className="text-ink">{parsed.length}</b>
              </div>
              <div className="border border-border rounded-lg overflow-hidden max-h-[34vh] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-surface2 text-muted sticky top-0">
                    <tr>
                      <th className="text-left font-medium px-2 py-2">Модель</th>
                      <th className="text-left font-medium px-2 py-2">Дата/время</th>
                      <th className="text-right font-medium px-2 py-2">Сумма</th>
                      <th className="text-right font-medium px-2 py-2">NET</th>
                      <th className="text-left font-medium px-2 py-2">Тип</th>
                      <th className="text-left font-medium px-2 py-2">Фанат</th>
                      <th className="text-left font-medium px-2 py-2">Чаттер</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((p, i) => {
                      const ch = chatterLabel(p);
                      const undet = ch.startsWith('—');
                      return (
                        <tr key={i} className="border-t border-border hover:bg-surface2/50 transition-colors">
                          <td className="px-2 py-1.5 text-ink whitespace-nowrap">{modelLabel(p)}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">{p.raw_datetime}</td>
                          <td className="px-2 py-1.5 text-right timer-font">${p.amount.toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-right timer-font text-emerald-500">${p.net.toFixed(2)}</td>
                          <td className="px-2 py-1.5">{KIND_LABEL[p.kind]}</td>
                          <td className="px-2 py-1.5 truncate max-w-[120px]">{p.fan_name ?? '—'}</td>
                          <td className={`px-2 py-1.5 ${undet ? 'text-amber-500' : 'text-ink'}`}>{ch}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {text.trim() && parsed.length === 0 && (
            <div className="mt-2 text-xs text-amber-500">
              Не удалось распознать ни одной продажи. Проверьте формат вставки.
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onClose} className="px-3 h-9 rounded-md text-sm text-muted hover:text-ink transition-colors">
            Отмена
          </button>
          <button
            onClick={() => void doImport()}
            disabled={!canImport}
            className="bg-accent text-white px-4 h-9 rounded-md text-sm flex items-center gap-1.5 disabled:opacity-50 hover:brightness-110 transition active:scale-[0.98]"
          >
            <Plus size={15} /> Импортировать {parsed.length > 0 ? `(${parsed.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
