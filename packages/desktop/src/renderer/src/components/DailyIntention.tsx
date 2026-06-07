import { useEffect, useState } from 'react';
import { Target } from 'lucide-react';

export default function DailyIntention({ date }: { date: string }) {
  const key = `swit:intention:${date}`;
  const [text, setText] = useState('');

  useEffect(() => {
    setText(localStorage.getItem(key) ?? '');
  }, [key]);

  function save(v: string) {
    setText(v);
    if (v.trim()) localStorage.setItem(key, v);
    else localStorage.removeItem(key);
  }

  return (
    <section className="bg-surface rounded-lg shadow-sm p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-md bg-accent-light flex items-center justify-center shrink-0">
        <Target size={18} className="text-accent" />
      </div>
      <div className="flex-1">
        <div className="text-[11px] uppercase text-muted">Главное на сегодня</div>
        <input
          value={text}
          onChange={(e) => save(e.target.value)}
          placeholder="Что точно должен сделать сегодня?"
          className="w-full bg-transparent text-base font-medium focus:outline-none placeholder:text-faint placeholder:font-normal"
        />
      </div>
    </section>
  );
}
