// Экспорт продаж агентства в .xlsx (SheetJS). Колонки повторяют таблицу продаж.
import * as XLSX from 'xlsx';
import { SHIFT_LABELS } from '@swit/shared';
import type { AgencySale, AgencyShift, AgencyShiftRow } from '@swit/shared';

const KIND_LABEL: Record<string, string> = {
  message: 'Сообщение',
  tip: 'Чай',
  post: 'Пост',
  subscription: 'Подписка',
  other: 'Другое'
};

function mskTime(iso: string): string {
  try {
    const d = new Date(new Date(iso).getTime() + 3 * 3600_000);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return '';
  }
}

interface ExportOpts {
  modelName: (id: string) => string;
  chatterName: (id: string | null) => string;
  fileName?: string;
}

/** Собирает .xlsx из продаж и сразу скачивает файл. */
export function exportSalesToXlsx(sales: AgencySale[], opts: ExportOpts): void {
  const rows = sales.map((s) => ({
    Дата: s.local_date,
    'Время (МСК)': mskTime(s.occurred_at),
    Модель: opts.modelName(s.model_id),
    Фанат: s.fan_name ?? '',
    Тип: KIND_LABEL[s.kind] ?? s.kind,
    Сумма: s.amount,
    Fee: s.fee,
    NET: s.net,
    Смена: s.shift ? SHIFT_LABELS[s.shift as AgencyShift] : '—',
    Чаттер: opts.chatterName(s.chatter_id),
    'В ЗП': s.counts_for_payout ? 'Да' : 'Нет',
    'Причина исключения': s.excluded_reason ?? ''
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 12 }, { wch: 11 }, { wch: 10 }, { wch: 26 }, { wch: 12 }, { wch: 10 },
    { wch: 9 }, { wch: 10 }, { wch: 14 }, { wch: 22 }, { wch: 7 }, { wch: 26 }
  ];
  ws['!autofilter'] = { ref: `A1:L${rows.length + 1}` };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Продажи');
  XLSX.writeFile(wb, opts.fileName ?? 'Продажи.xlsx');
}

/** Отчёт по сменам за период в .xlsx. */
export function exportShiftsToXlsx(rows: AgencyShiftRow[], fileName?: string): void {
  const data = rows.map((r) => ({
    Дата: r.date,
    Смена: r.shift ? SHIFT_LABELS[r.shift] : '—',
    Чаттер: r.chatter_name,
    Модель: r.model_name,
    Продаж: r.manual && r.count === 0 ? '' : r.count,
    NET: r.net,
    'Выплата чаттеру': r.payout,
    Фикс: r.is_fixed ? 'Да' : '',
    Заметка: r.note ?? ''
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 8 }, { wch: 10 }, { wch: 15 }, { wch: 7 }, { wch: 30 }
  ];
  ws['!autofilter'] = { ref: `A1:I${data.length + 1}` };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Смены');
  XLSX.writeFile(wb, fileName ?? 'Смены.xlsx');
}
