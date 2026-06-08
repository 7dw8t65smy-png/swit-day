import type { PeriodPreset } from '../../lib/finance';

export default function PeriodSwitcher({
  period,
  onChange,
  customFrom,
  customTo,
  onCustom
}: {
  period: PeriodPreset;
  onChange: (p: PeriodPreset) => void;
  customFrom: string;
  customTo: string;
  onCustom: (f: string, t: string) => void;
}): JSX.Element {
  const presets: { v: PeriodPreset; label: string }[] = [
    { v: 'today', label: 'Сегодня' },
    { v: 'week',  label: 'Неделя' },
    { v: 'month', label: 'Месяц' },
    { v: 'year',  label: 'Год' },
    { v: 'all',   label: 'Всё' },
    { v: 'custom',label: 'Период' }
  ];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <div className="flex gap-1 bg-surface2 rounded-md p-1">
        {presets.map((p) => (
          <button
            key={p.v}
            onClick={() => onChange(p.v)}
            className={`px-3 py-1 rounded text-sm transition ${
              period === p.v ? 'bg-surface shadow-sm font-medium' : 'text-muted hover:text-ink'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {period === 'custom' && (
        <div className="flex items-center gap-1.5 text-sm">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => onCustom(e.target.value, customTo)}
            className="h-8 px-2 rounded-md border border-border bg-surface text-xs"
          />
          <span className="text-muted">—</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => onCustom(customFrom, e.target.value)}
            className="h-8 px-2 rounded-md border border-border bg-surface text-xs"
          />
        </div>
      )}
    </div>
  );
}
