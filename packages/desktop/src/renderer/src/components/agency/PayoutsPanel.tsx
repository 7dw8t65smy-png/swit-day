import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import type { AgencyPayoutSummary } from '@swit/shared';
import { api } from '../../api';
import { useAgencyStore } from '../../lib/agency';
import { useRealtimeRefetch } from '../../hooks/useRealtimeRefetch';
import { pushToast } from '../../hooks/useToasts';

function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const fCls = 'h-9 px-2 rounded-md border border-border bg-surface text-xs';

export default function PayoutsPanel() {
  const agencyId = useAgencyStore((s) => s.selectedId);
  const chatters = useAgencyStore((s) => s.chatters);

  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState<AgencyPayoutSummary | null>(null);

  const load = useCallback(async () => {
    if (!agencyId) return;
    const res = await api.agencyPayouts({ agency_id: agencyId, from, to });
    setData(res);
  }, [agencyId, from, to]);

  useEffect(() => {
    void load();
  }, [load]);
  useRealtimeRefetch(() => void load());

  const colorOf = (id: string): string => chatters.find((c) => c.id === id)?.color ?? '#888';

  // Матрица «дата × чаттер».
  const matrix = useMemo(() => {
    if (!data) return null;
    const dates = Array.from(new Set(data.by_date.map((d) => d.local_date))).sort();
    const chatterIds = data.rows.map((r) => r.chatter_id);
    const cell = new Map<string, number>();
    for (const d of data.by_date) {
      if (d.chatter_id) cell.set(`${d.local_date}|${d.chatter_id}`, d.net);
    }
    return { dates, chatterIds, get: (date: string, cid: string) => cell.get(`${date}|${cid}`) ?? 0 };
  }, [data]);

  function copyPayouts(): void {
    if (!data) return;
    const lines = data.rows.map(
      (r) => `${r.chatter_name}\t${r.payout.toFixed(2)} USDT\t${r.trc20 ?? '— нет TRC20 —'}`
    );
    void navigator.clipboard.writeText(lines.join('\n'));
    pushToast({ kind: 'info', message: 'Список к выплате скопирован' });
  }

  if (!agencyId) return null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <label className="text-sm text-muted">Период:</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={fCls} />
        <span className="text-muted">—</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={fCls} />
        <span className="flex-1" />
        {data && data.rows.length > 0 && (
          <button onClick={copyPayouts} className="text-sm text-accent hover:underline flex items-center gap-1.5">
            <Copy size={14} /> Скопировать к выплате
          </button>
        )}
      </div>

      {!data || data.rows.length === 0 ? (
        <div className="text-sm text-faint border border-dashed border-border rounded-lg py-10 text-center">
          За выбранный период нет начислений.
        </div>
      ) : (
        <>
          {/* Итоги по чаттерам */}
          <div className="grid gap-3 mb-5 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {data.rows.map((r) => (
              <div key={r.chatter_id} className="rounded-xl border border-border bg-surface p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: colorOf(r.chatter_id) }} />
                  <span className="font-medium text-ink truncate">{r.chatter_name}</span>
                  <span className="ml-auto text-[11px] text-muted">{r.percent}%</span>
                </div>
                <div className="text-2xl font-semibold text-ink timer-font">${r.payout.toFixed(2)}</div>
                <div className="text-[11px] text-muted mt-0.5">
                  NET ${r.net_total.toFixed(2)} · продаж {r.sales_count}
                </div>
                {r.trc20 && (
                  <div className="text-[10px] text-faint font-mono truncate mt-1" title={r.trc20}>
                    {r.trc20}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-6 mb-5 text-sm">
            <div>
              <span className="text-muted">NET за период: </span>
              <b className="text-ink timer-font">${data.net_total.toFixed(2)}</b>
            </div>
            <div>
              <span className="text-muted">К выплате всего: </span>
              <b className="text-accent timer-font">${data.payout_total.toFixed(2)}</b>
            </div>
          </div>

          {/* Матрица дата × чаттер (NET) */}
          {matrix && matrix.dates.length > 0 && (
            <div>
              <div className="text-xs uppercase text-muted mb-1.5">Матрица NET по дням</div>
              <div className="border border-border rounded-lg overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-surface2 text-muted">
                    <tr>
                      <th className="text-left font-medium px-2 py-2 sticky left-0 bg-surface2">Дата</th>
                      {data.rows.map((r) => (
                        <th key={r.chatter_id} className="text-right font-medium px-2 py-2 whitespace-nowrap">
                          {r.chatter_name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.dates.map((date) => (
                      <tr key={date} className="border-t border-border">
                        <td className="px-2 py-1.5 text-ink whitespace-nowrap sticky left-0 bg-bg">{date}</td>
                        {matrix.chatterIds.map((cid) => {
                          const v = matrix.get(date, cid);
                          return (
                            <td key={cid} className={`px-2 py-1.5 text-right timer-font ${v ? 'text-ink' : 'text-faint'}`}>
                              {v ? `$${v.toFixed(2)}` : '·'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
