// Парсер вставки продаж из OnlyMonster + хелперы смен.
//
// Формат вставки (одна продажа = строка с датой/суммами + следующая строка-описание):
//   Jun 14, 202611:08 pm\t$5.69\t$1.14\t$4.55
//   Post purchase by Matúš Galya
//
// Год и время часто слипаются («2026» + «11:08 pm») — парсер это учитывает.
// Суммы: gross / fee / net. Описание определяет тип и имя фаната.
import type { AgencyShift, AgencySaleKind, ParsedSale } from './types.js';

export const SHIFTS: AgencyShift[] = ['morning', 'day', 'evening', 'night'];

export const SHIFT_LABELS: Record<AgencyShift, string> = {
  morning: 'Утро 07–13',
  day: 'День 13–19',
  evening: 'Вечер 19–01',
  night: 'Ночь 01–07'
};

/** Часовой пояс смен — МСК (UTC+3) в минутах. */
export const MSK_OFFSET_MIN = 180;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

/** Смена по часу в МСК (0..23). Границы: 07/13/19/01. */
export function shiftFromMskHour(hour: number): AgencyShift {
  if (hour >= 7 && hour < 13) return 'morning';
  if (hour >= 13 && hour < 19) return 'day';
  if (hour >= 19 || hour < 1) return 'evening';
  return 'night'; // 1..6
}

/**
 * Переводит распознанное локальное время (в поясе аккаунта OnlyMonster) в:
 *  - occurredAtUtc — ISO в UTC,
 *  - mskDate — YYYY-MM-DD в МСК,
 *  - shift — смену в МСК.
 * sourceTzOffsetMin — смещение пояса OnlyMonster от UTC (UTC+5 = 300).
 */
export function toMskParts(
  p: Pick<ParsedSale, 'year' | 'month' | 'day' | 'hour' | 'minute'>,
  sourceTzOffsetMin: number
): { occurredAtUtc: string; mskDate: string; mskHour: number; shift: AgencyShift } {
  // Wall-clock OnlyMonster → момент в UTC.
  const utcMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - sourceTzOffsetMin * 60_000;
  // Тот же момент в МСК-стенке.
  const mskMs = utcMs + MSK_OFFSET_MIN * 60_000;
  const msk = new Date(mskMs);
  const mskDate = `${msk.getUTCFullYear()}-${pad(msk.getUTCMonth() + 1)}-${pad(msk.getUTCDate())}`;
  const mskHour = msk.getUTCHours();
  return {
    occurredAtUtc: new Date(utcMs).toISOString(),
    mskDate,
    mskHour,
    shift: shiftFromMskHour(mskHour)
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function to24h(hour12: number, ampm: string): number {
  const h = hour12 % 12;
  return ampm.toLowerCase() === 'pm' ? h + 12 : h;
}

// Строка с датой/временем (+ возможные суммы на той же строке).
// Группы: month, day, year, hour, minute, ampm.
const DATETIME_RE =
  /([A-Za-z]{3})\s+(\d{1,2}),?\s*(\d{4})\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])/;

// Денежные значения вида $1,234.56 / $5.69 / $20
const MONEY_RE = /\$\s*([\d,]+(?:\.\d+)?)/g;

function parseMoney(token: string): number {
  return parseFloat(token.replace(/,/g, '')) || 0;
}

function classify(desc: string): { kind: AgencySaleKind; fan: string | null } {
  const d = desc.trim();
  let m: RegExpMatchArray | null;
  if ((m = d.match(/payment for message from\s+(.+)/i))) return { kind: 'message', fan: clean(m[1]) };
  if ((m = d.match(/tip from\s+(.+)/i))) return { kind: 'tip', fan: clean(m[1]) };
  if ((m = d.match(/post purchase (?:by|from)\s+(.+)/i))) return { kind: 'post', fan: clean(m[1]) };
  if (/subscription/i.test(d)) {
    const f = d.match(/(?:from|by)\s+(.+)/i);
    return { kind: 'subscription', fan: f ? clean(f[1]) : null };
  }
  const f = d.match(/(?:from|by)\s+(.+)/i);
  return { kind: 'other', fan: f ? clean(f[1]) : null };
}

function clean(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

function isMoneyLine(line: string): boolean {
  return DATETIME_RE.test(line) && /\$/.test(line);
}

/**
 * Разбирает вставленный из OnlyMonster текст в массив продаж.
 * Каждая продажа: строка с датой/суммами + следующая непустая строка-описание.
 * Кривые блоки тихо пропускаются (превью на клиенте покажет распознанное).
 */
export function parseOnlyMonsterSales(text: string): ParsedSale[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const out: ParsedSale[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!isMoneyLine(line)) continue;

    const dt = line.match(DATETIME_RE);
    if (!dt) continue;
    const month = MONTHS[dt[1].toLowerCase()];
    if (!month) continue;
    const day = parseInt(dt[2], 10);
    const year = parseInt(dt[3], 10);
    const hour = to24h(parseInt(dt[4], 10), dt[6]);
    const minute = parseInt(dt[5], 10);

    const amounts: number[] = [];
    let mm: RegExpExecArray | null;
    MONEY_RE.lastIndex = 0;
    while ((mm = MONEY_RE.exec(line)) !== null) amounts.push(parseMoney(mm[1]));
    if (amounts.length === 0) continue;

    // 3 суммы: gross/fee/net. 2: gross/net. 1: gross=net.
    let amount: number;
    let fee: number;
    let net: number;
    if (amounts.length >= 3) {
      amount = amounts[0];
      fee = amounts[1];
      net = amounts[2];
    } else if (amounts.length === 2) {
      amount = amounts[0];
      net = amounts[1];
      fee = +(amount - net).toFixed(2);
    } else {
      amount = amounts[0];
      net = amounts[0];
      fee = 0;
    }

    // Описание — следующая непустая строка, если она не «денежная».
    let desc = '';
    if (i + 1 < lines.length && !isMoneyLine(lines[i + 1])) {
      desc = lines[i + 1];
      i++; // потребили строку описания
    }
    const parsed = classify(desc);

    const rawDt = `${dt[1]} ${day}, ${year} ${dt[4]}:${dt[5]} ${dt[6].toLowerCase()}`;
    out.push({
      raw_datetime: rawDt,
      year,
      month,
      day,
      hour,
      minute,
      amount,
      fee,
      net,
      kind: parsed.kind,
      fan_name: parsed.fan,
      raw_line: desc ? `${line} | ${desc}` : line
    });
  }
  return out;
}
