import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Palette, Smile, Flag, Tag as TagIcon, FileText, CheckCircle2, Circle } from 'lucide-react';
import type { MindMapNode, MindMapPriority } from '@swit/shared';
import { useMindMap } from '../../lib/mindmap/store';
import { DEFAULT_BRANCH_COLORS } from '../../lib/mindmap/doc';

// Боковой инспектор выбранного узла: цвет ветки, эмодзи, приоритет, статус,
// теги и заметка. Подписан на doc/selectedId, действия — через getState().

const EMOJI: string[] = [
  '💡', '🎯', '🚀', '✅', '⚠️', '🔥', '⭐', '📌',
  '📝', '📅', '💰', '📈', '🧩', '❓', '❤️', '🐛',
  '🔧', '🌟', '📊', '🎨', '🏆', '⏰', '🔑', '📍'
];

const PRIORITIES: { value: MindMapPriority; label: string; color: string }[] = [
  { value: 'high', label: 'Высокий', color: '#DC2626' },
  { value: 'medium', label: 'Средний', color: '#EA580C' },
  { value: 'low', label: 'Низкий', color: '#0891B2' }
];

export default function Inspector({ onClose }: { onClose: () => void }): JSX.Element {
  const doc = useMindMap((s) => s.doc);
  const selectedId = useMindMap((s) => s.selectedId);

  const node: MindMapNode | undefined = useMemo(
    () => (doc && selectedId ? doc.nodes.find((n) => n.id === selectedId) : undefined),
    [doc, selectedId]
  );

  // Локальный черновик заметки — коммитим в стор по blur, чтобы не плодить
  // историю undo на каждое нажатие клавиши.
  const [noteDraft, setNoteDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setNoteDraft(node?.note ?? '');
    setTagDraft('');
  }, [node?.id, node?.note]);

  if (!doc || !node) {
    return (
      <aside className="mind-inspector grid place-items-center text-center px-6">
        <div className="text-muted text-sm">
          <Palette className="mx-auto mb-2 opacity-50" size={22} />
          Выберите узел, чтобы настроить
          <br />
          цвет, эмодзи, приоритет и заметку.
        </div>
      </aside>
    );
  }

  const isRoot = node.id === doc.rootId;
  const set = useMindMap.getState();
  const branchColor = node.color ?? null;

  const commitNote = (): void => {
    const v = noteDraft.trim();
    if ((node.note ?? '') !== v) set.patchNode(node.id, { note: v || null });
  };

  const addTagFromDraft = (): void => {
    const v = tagDraft.trim();
    if (v) set.addTag(node.id, v);
    setTagDraft('');
  };

  return (
    <aside className="mind-inspector">
      <header className="mind-inspector__head">
        <span className="text-xs uppercase tracking-wide text-muted">Узел</span>
        <button className="mind-inspector__close" onClick={onClose} title="Закрыть панель">
          <X size={15} />
        </button>
      </header>

      <div className="mind-inspector__title" title={node.text}>
        {node.emoji ? <span className="mr-1">{node.emoji}</span> : null}
        {node.text || 'Без названия'}
      </div>

      {/* Цвет ветки */}
      <Section icon={<Palette size={13} />} label="Цвет ветки">
        <div className="mind-swatches">
          {DEFAULT_BRANCH_COLORS.map((c) => (
            <button
              key={c}
              className={['mind-swatch', branchColor === c ? 'mind-swatch--on' : ''].join(' ')}
              style={{ background: c }}
              title={c}
              onClick={() => set.patchNode(node.id, { color: c })}
            />
          ))}
          <button
            className={['mind-swatch mind-swatch--reset', !branchColor ? 'mind-swatch--on' : ''].join(' ')}
            title="Наследовать от ветки"
            onClick={() => set.patchNode(node.id, { color: null })}
          >
            <X size={12} />
          </button>
        </div>
      </Section>

      {/* Эмодзи */}
      <Section icon={<Smile size={13} />} label="Эмодзи">
        <div className="mind-emoji-grid">
          {EMOJI.map((e) => (
            <button
              key={e}
              className={['mind-emoji', node.emoji === e ? 'mind-emoji--on' : ''].join(' ')}
              onClick={() => set.patchNode(node.id, { emoji: node.emoji === e ? null : e })}
            >
              {e}
            </button>
          ))}
        </div>
      </Section>

      {!isRoot && (
        <>
          {/* Приоритет */}
          <Section icon={<Flag size={13} />} label="Приоритет">
            <div className="mind-prio-row">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  className={['mind-prio', node.priority === p.value ? 'mind-prio--on' : ''].join(' ')}
                  style={
                    node.priority === p.value
                      ? { background: `${p.color}1a`, color: p.color, borderColor: `${p.color}66` }
                      : undefined
                  }
                  onClick={() =>
                    set.patchNode(node.id, { priority: node.priority === p.value ? null : p.value })
                  }
                >
                  <Flag size={12} style={{ color: p.color }} /> {p.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Статус */}
          <Section icon={<CheckCircle2 size={13} />} label="Статус">
            <button
              className={['mind-done-toggle', node.done ? 'mind-done-toggle--on' : ''].join(' ')}
              onClick={() => set.patchNode(node.id, { done: !node.done })}
            >
              {node.done ? <CheckCircle2 size={15} /> : <Circle size={15} />}
              {node.done ? 'Выполнено' : 'Отметить выполненным'}
            </button>
          </Section>
        </>
      )}

      {/* Теги */}
      <Section icon={<TagIcon size={13} />} label="Теги">
        <div className="mind-tags">
          {(node.tags ?? []).map((t) => (
            <span key={t} className="mind-tag">
              {t}
              <button onClick={() => set.removeTag(node.id, t)} title="Убрать тег">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
        <input
          className="mind-input"
          placeholder="Добавить тег + Enter"
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTagFromDraft();
            }
          }}
          onBlur={addTagFromDraft}
        />
      </Section>

      {/* Заметка */}
      <Section icon={<FileText size={13} />} label="Заметка">
        <textarea
          ref={noteRef}
          className="mind-input mind-note"
          placeholder="Подробности, ссылки, контекст…"
          value={noteDraft}
          rows={5}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={commitNote}
        />
      </Section>
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
    <section className="mind-inspector__section">
      <div className="mind-inspector__label">
        {icon} {label}
      </div>
      {children}
    </section>
  );
}
