import { useEffect, useState } from 'react';
import { Pin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Note } from '@swit/shared';
import { api } from '../api';

export default function PinnedNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const nav = useNavigate();

  useEffect(() => {
    api.listNotes().then((all) => {
      setNotes(all.filter((n) => n.pinned).slice(0, 5));
    });
  }, []);

  if (notes.length === 0) return null;

  return (
    <section className="bg-surface rounded-lg shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <Pin size={14} className="text-accent" fill="currentColor" />
        <div className="text-sm font-medium">Закреплённое</div>
      </div>
      <ul className="space-y-2">
        {notes.map((n) => (
          <li
            key={n.id}
            onClick={() => nav('/notes')}
            className="text-sm bg-surface2 rounded-md px-3 py-2 cursor-pointer hover:bg-surface line-clamp-3 whitespace-pre-wrap"
          >
            {n.content}
          </li>
        ))}
      </ul>
    </section>
  );
}
