import { useEffect, useRef, useState } from 'react';
import { Flame, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import type { TaskPriority, TaskDifficulty } from '@swit/shared';
import { PRIORITIES, PRIORITY_LABEL, PRIORITY_COLOR } from '../../lib/priority';
import { DIFFICULTIES, DIFFICULTY_LABEL } from '../../lib/difficulty';

// --- Compact pickers for the "new task" inline form ---
// Replace native <select> (ugly OS chevron, cryptic ·/🟡 icons) with custom
// 32px buttons that pop a small menu. Icons are semantic: priority = flag/arrow
// in priority color, difficulty = signal-bars (1/2/3) in green/amber/red.

function PriorityGlyph({ priority }: { priority: TaskPriority }): JSX.Element {
  const color = PRIORITY_COLOR[priority];
  if (priority === 'urgent') return <Flame size={14} style={{ color }} />;
  if (priority === 'high') return <ArrowUp size={14} style={{ color }} strokeWidth={2.5} />;
  if (priority === 'low') return <ArrowDown size={14} style={{ color }} strokeWidth={2.5} />;
  // normal — neutral muted dash, so the button doesn't look "empty"
  return <Minus size={14} className="text-faint" strokeWidth={2.5} />;
}

const DIFFICULTY_TONE: Record<'easy' | 'medium' | 'hard', { bars: number; cls: string }> = {
  easy:   { bars: 1, cls: 'bg-green-500' },
  medium: { bars: 2, cls: 'bg-amber-500' },
  hard:   { bars: 3, cls: 'bg-red-500' }
};

function DifficultyGlyph({ difficulty }: { difficulty: TaskDifficulty }): JSX.Element {
  const tone = DIFFICULTY_TONE[difficulty];
  return (
    <div className="flex items-end gap-[2px] h-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`w-[3px] rounded-sm ${i < tone.bars ? tone.cls : 'bg-border'}`}
          style={{ height: 4 + i * 3 }}
        />
      ))}
    </div>
  );
}

/**
 * Lightweight click-outside popover used by Priority/Difficulty pickers.
 * Anchored to its trigger button, opens upward (mb-1, bottom-full) because the
 * form lives at the bottom of the column and there isn't room below.
 */
function usePopover(): {
  open: boolean;
  setOpen: (v: boolean) => void;
  ref: React.RefObject<HTMLDivElement>;
} {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);
  return { open, setOpen, ref };
}

export function PriorityPicker({
  value,
  onChange
}: {
  value: TaskPriority;
  onChange: (v: TaskPriority) => void;
}): JSX.Element {
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={`Приоритет: ${PRIORITY_LABEL[value]}`}
        aria-label={`Приоритет: ${PRIORITY_LABEL[value]}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-8 h-8 rounded-md bg-surface border flex items-center justify-center transition hover:border-accent ${
          open ? 'border-accent ring-2 ring-accent/30' : 'border-border'
        }`}
      >
        <PriorityGlyph priority={value} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute bottom-full right-0 mb-1.5 z-20 bg-surface rounded-md shadow-lg border border-border py-1 min-w-[150px]"
        >
          <div className="px-2.5 py-1 text-[10px] uppercase tracking-wide text-faint">
            Приоритет
          </div>
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              role="option"
              aria-selected={value === p}
              onClick={() => {
                onChange(p);
                setOpen(false);
              }}
              className={`w-full px-2.5 py-1.5 text-xs flex items-center gap-2.5 hover:bg-surface2 transition ${
                value === p ? 'bg-accent-light text-ink font-medium' : ''
              }`}
            >
              <PriorityGlyph priority={p} />
              <span className="flex-1 text-left">{PRIORITY_LABEL[p]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DifficultyPicker({
  value,
  onChange
}: {
  value: TaskDifficulty;
  onChange: (v: TaskDifficulty) => void;
}): JSX.Element {
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={`Сложность: ${DIFFICULTY_LABEL[value]}`}
        aria-label={`Сложность: ${DIFFICULTY_LABEL[value]}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-8 h-8 rounded-md bg-surface border flex items-center justify-center transition hover:border-accent ${
          open ? 'border-accent ring-2 ring-accent/30' : 'border-border'
        }`}
      >
        <DifficultyGlyph difficulty={value} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute bottom-full right-0 mb-1.5 z-20 bg-surface rounded-md shadow-lg border border-border py-1 min-w-[140px]"
        >
          <div className="px-2.5 py-1 text-[10px] uppercase tracking-wide text-faint">
            Сложность
          </div>
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              role="option"
              aria-selected={value === d}
              onClick={() => {
                onChange(d);
                setOpen(false);
              }}
              className={`w-full px-2.5 py-1.5 text-xs flex items-center gap-2.5 hover:bg-surface2 transition ${
                value === d ? 'bg-accent-light text-ink font-medium' : ''
              }`}
            >
              <DifficultyGlyph difficulty={d} />
              <span className="flex-1 text-left">{DIFFICULTY_LABEL[d]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
