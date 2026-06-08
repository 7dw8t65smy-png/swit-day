import { useMemo } from 'react';
import {
  X,
  PaintBucket,
  Type as TypeIcon,
  Square,
  Minus,
  Plus,
  BringToFront,
  SendToBack
} from 'lucide-react';
import type { BoardElement } from '@swit/shared';
import { useBoard } from '../../lib/board/store';
import { STICKER_COLORS } from '../../lib/board/doc';

const FILLS = [...STICKER_COLORS, '#ffffff', '#0f172a'];
const TEXT_COLORS = ['#0f172a', '#ffffff', '#dc2626', '#ea580c', '#2563eb', '#059669', '#7c3aed'];
const BORDERS = ['#e2e8f0', '#94a3b8', '#2563eb', '#dc2626', '#059669', '#7c3aed'];
const FONT_MIN = 10;
const FONT_MAX = 72;

export default function BoardInspector({ onClose }: { onClose: () => void }): JSX.Element {
  const doc = useBoard((s) => s.doc);
  const selectedIds = useBoard((s) => s.selectedIds);

  const selected: BoardElement[] = useMemo(() => {
    if (!doc) return [];
    const set = new Set(selectedIds);
    return doc.elements.filter((e) => set.has(e.id));
  }, [doc, selectedIds]);

  if (selected.length === 0) {
    return (
      <aside className="board-inspector grid place-items-center text-center px-6">
        <div className="text-muted text-sm">
          <PaintBucket className="mx-auto mb-2 opacity-50" size={22} />
          Выберите элемент, чтобы настроить
          <br />
          цвет, рамку, шрифт и слой.
        </div>
      </aside>
    );
  }

  const set = useBoard.getState();
  const first = selected[0];
  const fontSize = first.style?.fontSize ?? 15;

  const bumpFont = (delta: number): void => {
    const next = Math.max(FONT_MIN, Math.min(FONT_MAX, fontSize + delta));
    set.styleSelected({ fontSize: next });
  };

  return (
    <aside className="board-inspector">
      <header className="board-inspector__head">
        <span className="text-xs uppercase tracking-wide text-muted">
          {selected.length > 1 ? `Выбрано: ${selected.length}` : 'Элемент'}
        </span>
        <button className="board-inspector__close" onClick={onClose} title="Закрыть панель">
          <X size={15} />
        </button>
      </header>

      <Section icon={<PaintBucket size={13} />} label="Фон">
        <div className="board-swatches">
          {FILLS.map((c) => (
            <button
              key={c}
              className={['board-swatch', first.style?.fill === c ? 'board-swatch--on' : ''].join(' ')}
              style={{ background: c }}
              title={c}
              onClick={() => set.styleSelected({ fill: c })}
            />
          ))}
          <button
            className={['board-swatch board-swatch--reset', !first.style?.fill ? 'board-swatch--on' : ''].join(' ')}
            title="Прозрачный"
            onClick={() => set.styleSelected({ fill: null })}
          >
            <X size={12} />
          </button>
        </div>
      </Section>

      <Section icon={<TypeIcon size={13} />} label="Текст">
        <div className="board-swatches">
          {TEXT_COLORS.map((c) => (
            <button
              key={c}
              className={['board-swatch', first.style?.color === c ? 'board-swatch--on' : ''].join(' ')}
              style={{ background: c }}
              title={c}
              onClick={() => set.styleSelected({ color: c })}
            />
          ))}
        </div>
        <div className="board-row mt-2">
          <span className="text-xs text-muted flex-1">Размер шрифта</span>
          <button className="board-step" onClick={() => bumpFont(-2)} title="Меньше">
            <Minus size={14} />
          </button>
          <span className="text-sm tabular-nums w-7 text-center">{fontSize}</span>
          <button className="board-step" onClick={() => bumpFont(2)} title="Больше">
            <Plus size={14} />
          </button>
        </div>
      </Section>

      <Section icon={<Square size={13} />} label="Рамка">
        <div className="board-swatches">
          {BORDERS.map((c) => (
            <button
              key={c}
              className={['board-swatch', first.style?.border === c ? 'board-swatch--on' : ''].join(' ')}
              style={{ background: c }}
              title={c}
              onClick={() => set.styleSelected({ border: c })}
            />
          ))}
          <button
            className={['board-swatch board-swatch--reset', !first.style?.border ? 'board-swatch--on' : ''].join(' ')}
            title="Без рамки"
            onClick={() => set.styleSelected({ border: null })}
          >
            <X size={12} />
          </button>
        </div>
      </Section>

      <Section icon={<BringToFront size={13} />} label="Слой">
        <div className="board-row">
          <button className="board-btn flex-1" onClick={() => set.bringToFront()}>
            <BringToFront size={14} /> Вперёд
          </button>
          <button className="board-btn flex-1" onClick={() => set.sendToBack()}>
            <SendToBack size={14} /> Назад
          </button>
        </div>
      </Section>

      {selected.length >= 2 && (
        <Section icon={<Square size={13} />} label="Выравнивание">
          <div className="board-align-grid">
            <button className="board-step" title="По левому краю" onClick={() => set.align('left')}>
              Слева
            </button>
            <button className="board-step" title="По центру (гор.)" onClick={() => set.align('centerX')}>
              Центр
            </button>
            <button className="board-step" title="По правому краю" onClick={() => set.align('right')}>
              Справа
            </button>
            <button className="board-step" title="По верху" onClick={() => set.align('top')}>
              Верх
            </button>
            <button className="board-step" title="По центру (верт.)" onClick={() => set.align('centerY')}>
              Сер.
            </button>
            <button className="board-step" title="По низу" onClick={() => set.align('bottom')}>
              Низ
            </button>
          </div>
          <div className="board-row mt-2">
            <button
              className="board-btn flex-1"
              title="Равные промежутки по горизонтали (нужно ≥3)"
              onClick={() => set.distribute('h')}
            >
              ↔ Распределить
            </button>
            <button
              className="board-btn flex-1"
              title="Равные промежутки по вертикали (нужно ≥3)"
              onClick={() => set.distribute('v')}
            >
              ↕
            </button>
          </div>
          <div className="board-row mt-2">
            <button className="board-btn flex-1" onClick={() => set.group()}>
              Сгруппировать
            </button>
            <button className="board-btn flex-1" onClick={() => set.ungroup()}>
              Разгруппир.
            </button>
          </div>
        </Section>
      )}
    </aside>
  );
}

function Section({
  icon,
  label,
  children
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="board-inspector__section">
      <div className="board-inspector__label">
        {icon} {label}
      </div>
      {children}
    </section>
  );
}
