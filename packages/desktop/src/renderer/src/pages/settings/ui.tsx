// ============ Building blocks ============

export function Section({
  title,
  hint,
  children
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="bg-surface rounded-lg shadow-sm border border-border">
      <header className="px-5 py-3 border-b border-border">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="text-[11px] text-muted mt-0.5">{hint}</p>}
      </header>
      <div className="p-5 space-y-3">{children}</div>
    </section>
  );
}

export function Row({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="grid grid-cols-[200px_1fr] items-start gap-3">
      <div className="pt-2">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-[11px] text-muted mt-0.5">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
  disabled
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <div className={`flex items-start gap-3 ${disabled ? 'opacity-40' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-[11px] text-muted mt-0.5">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        className={`shrink-0 w-10 h-6 rounded-full transition relative ${
          value ? 'bg-accent' : 'bg-surface2 border border-border'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
            value ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  suffix
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}): JSX.Element {
  return (
    <div className="inline-flex items-center gap-2">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input w-24"
      />
      {suffix && <span className="text-xs text-muted">{suffix}</span>}
    </div>
  );
}
