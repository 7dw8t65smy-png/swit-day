import { useEffect, useRef, useState } from 'react';
import { Palette, Check } from 'lucide-react';
import { useMindMap } from '../../lib/mindmap/store';
import { THEMES, DEFAULT_THEME } from '../../lib/mindmap/themes';

// Выбор визуальной темы карты (палитра + фон). Тема — свойство всей карты.

export default function ThemeMenu(): JSX.Element {
  const current = useMindMap((s) => s.doc?.theme ?? DEFAULT_THEME);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        title="Тема карты"
        onClick={() => setOpen((v) => !v)}
        className={[
          'p-2 rounded-md transition-colors',
          open ? 'bg-accent/15 text-accent' : 'text-muted hover:text-ink hover:bg-surface2'
        ].join(' ')}
      >
        <Palette size={16} />
      </button>

      {open && (
        <div className="mind-theme-menu">
          {THEMES.map((t) => (
            <button
              key={t.key}
              className="mind-theme-item"
              onClick={() => {
                useMindMap.getState().setTheme(t.key);
                setOpen(false);
              }}
            >
              <span className="mind-theme-dots" aria-hidden>
                <span style={{ background: t.rootColor }} />
                {t.branchColors.slice(0, 4).map((c, i) => (
                  <span key={i} style={{ background: c }} />
                ))}
              </span>
              <span className="mind-theme-name">{t.label}</span>
              {current === t.key ? <Check size={14} className="text-accent" /> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
