import { useState } from 'react';

export function Group({
  icon,
  title,
  count,
  children,
  tone,
  muted,
  collapsed = false
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
  tone?: 'accent';
  muted?: boolean;
  collapsed?: boolean;
}): JSX.Element | null {
  const [open, setOpen] = useState(!collapsed);
  if (count === 0) return null;
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 mb-2 group ${
          muted ? 'opacity-70' : ''
        }`}
      >
        {icon}
        <span
          className={`text-xs uppercase tracking-wide ${
            tone === 'accent' ? 'text-accent font-semibold' : 'text-muted'
          }`}
        >
          {title}
        </span>
        <span className="text-xs text-faint">· {count}</span>
        <span className="ml-auto text-[10px] text-faint group-hover:text-muted transition">
          {open ? 'скрыть' : 'показать'}
        </span>
      </button>
      {open && <div className="space-y-1.5">{children}</div>}
    </section>
  );
}
