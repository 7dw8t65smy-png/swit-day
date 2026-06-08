import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, CornerDownLeft } from 'lucide-react';
import { useMindMap } from '../../lib/mindmap/store';

// Поиск по узлам карты с переходом. ⌘F открывает, Esc закрывает,
// Enter — перейти к первому совпадению, клик — к выбранному.

const MAX_RESULTS = 12;

interface Match {
  id: string;
  text: string;
  emoji?: string | null;
}

export default function MapSearch({
  onJump,
  onClose
}: {
  onJump: (id: string) => void;
  onClose: () => void;
}): JSX.Element {
  const doc = useMindMap((s) => s.doc);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matches: Match[] = useMemo(() => {
    if (!doc) return [];
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: Match[] = [];
    for (const n of doc.nodes) {
      if (n.text.toLowerCase().includes(q)) {
        out.push({ id: n.id, text: n.text, emoji: n.emoji });
        if (out.length >= MAX_RESULTS) break;
      }
    }
    return out;
  }, [doc, query]);

  return (
    <div className="mind-search">
      <div className="mind-search__field">
        <Search size={15} className="text-muted" />
        <input
          ref={inputRef}
          className="mind-search__input"
          placeholder="Найти узел…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            } else if (e.key === 'Enter' && matches[0]) {
              e.preventDefault();
              onJump(matches[0].id);
            }
          }}
        />
        <button className="mind-search__close" onClick={onClose} title="Закрыть (Esc)">
          <X size={14} />
        </button>
      </div>

      {query.trim() ? (
        <div className="mind-search__results">
          {matches.length === 0 ? (
            <div className="mind-search__empty">Ничего не найдено</div>
          ) : (
            matches.map((m, i) => (
              <button key={m.id} className="mind-search__item" onClick={() => onJump(m.id)}>
                {m.emoji ? <span>{m.emoji}</span> : null}
                <span className="mind-search__text">{m.text || 'Без названия'}</span>
                {i === 0 ? <CornerDownLeft size={13} className="text-faint" /> : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
