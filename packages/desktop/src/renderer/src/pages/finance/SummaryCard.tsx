import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

/**
 * Карточка-метрика для шапки. Кроме самой суммы показывает дельту относительно
 * предыдущего отрезка такой же длины (вчера vs сегодня, прошлый месяц vs этот
 * и т.д.). `invertTrend=true` для дохода/остатка — там рост это хорошо, и
 * стрелка вверх должна быть зелёной.
 */
export default function SummaryCard({
  label,
  value,
  tone,
  prev,
  cur,
  compareLabel,
  hasPrev,
  invertTrend
}: {
  label: string;
  value: string;
  tone: 'red' | 'green';
  prev: number;
  cur: number;
  compareLabel: string;
  hasPrev: boolean;
  invertTrend?: boolean;
}): JSX.Element {
  const cls = tone === 'red' ? 'text-red-500' : 'text-green-600';
  let trendNode: JSX.Element | null = null;
  if (hasPrev) {
    const delta = cur - prev;
    const pct = prev !== 0 ? (delta / Math.abs(prev)) * 100 : (cur === 0 ? 0 : 100);
    // Знак "роста". Для расходов рост — это плохо (красный).
    // Для дохода/остатка — наоборот (invertTrend).
    const goodIfUp = !!invertTrend;
    const isUp = delta > 0;
    const isDown = delta < 0;
    const trendCls =
      delta === 0
        ? 'text-faint'
        : (isUp ? goodIfUp : !goodIfUp)
          ? 'text-green-600'
          : 'text-red-500';
    const Icon = delta === 0 ? Minus : isUp ? ArrowUpRight : ArrowDownRight;
    trendNode = (
      <div className={`text-[10px] flex items-center gap-0.5 mt-0.5 ${trendCls}`}>
        <Icon size={11} />
        <span className="font-medium">
          {delta === 0 ? '—' : `${isDown ? '−' : '+'}${Math.abs(pct).toFixed(0)}%`}
        </span>
        <span className="text-faint ml-0.5">{compareLabel}</span>
      </div>
    );
  }
  return (
    <div className="bg-surface2/40 rounded-md px-3 py-2 min-w-[140px]">
      <div className="text-[10px] uppercase tracking-wide text-faint">{label}</div>
      <div className={`text-lg font-semibold timer-font leading-tight ${cls}`}>{value}</div>
      {trendNode}
    </div>
  );
}
