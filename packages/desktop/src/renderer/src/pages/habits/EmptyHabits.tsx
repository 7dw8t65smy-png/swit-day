import { Plus } from 'lucide-react';

export function EmptyHabits({ onCreate }: { onCreate: () => void }): JSX.Element {
  return (
    <div className="bg-surface rounded-lg shadow-sm p-12 text-center">
      <div className="text-4xl mb-3 opacity-40">🔁</div>
      <div className="text-sm text-muted max-w-md mx-auto">
        Сюда хорошо положить дела, которые повторяются: оплатить квартиру 5-го числа,
        отчёт по понедельникам, тренировка три раза в неделю. Календарь забивать не нужно —
        сами напомнят.
      </div>
      <button
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-1.5 bg-accent text-white px-4 py-2 rounded-md text-sm hover:bg-accent-hover shadow-sm"
      >
        <Plus size={14} /> Создать первую рутину
      </button>
    </div>
  );
}
