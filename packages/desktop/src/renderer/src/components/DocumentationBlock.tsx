import { useEffect, useState } from 'react';
import { FileText, Edit3, Save, X } from 'lucide-react';

interface Props {
  value: string | null;
  readOnly?: boolean;
  label?: string;
  placeholder?: string;
  onSave?: (v: string | null) => Promise<void>;
}

export default function DocumentationBlock({
  value,
  readOnly,
  label = 'Документация',
  placeholder = 'Опиши контекст, регламенты, важные детали...\n\nПоддерживается **markdown-разметка**, переносы строк, списки:\n\n- пункт 1\n- пункт 2\n\n### Подзаголовок\n\nСсылки: https://example.com',
  onSave
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  async function save() {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(draft.trim() ? draft : null);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(value ?? '');
    setEditing(false);
  }

  if (readOnly) {
    if (!value || !value.trim()) return null;
    return (
      <section className="bg-surface rounded-lg shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={14} className="text-muted" />
          <div className="text-sm font-medium">{label}</div>
          <span className="text-[10px] text-faint ml-auto">снапшот на момент запуска</span>
        </div>
        <div className="prose-doc">{renderMarkdown(value)}</div>
      </section>
    );
  }

  return (
    <section className="bg-surface rounded-lg shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <FileText size={14} className="text-muted" />
        <div className="text-sm font-medium">{label}</div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="ml-auto text-xs text-accent hover:text-accent-hover flex items-center gap-1"
          >
            <Edit3 size={12} /> {value ? 'Редактировать' : 'Добавить'}
          </button>
        )}
      </div>

      {editing ? (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            rows={14}
            placeholder={placeholder}
            className="w-full p-3 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent resize-y font-mono"
          />
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={cancel}
              disabled={saving}
              className="px-3 py-1.5 rounded-md text-sm border border-border flex items-center gap-1"
            >
              <X size={12} /> Отмена
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-1.5 rounded-md text-sm bg-accent text-white hover:bg-accent-hover flex items-center gap-1 disabled:opacity-50"
            >
              <Save size={12} /> {saving ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </div>
        </>
      ) : value && value.trim() ? (
        <div className="prose-doc">{renderMarkdown(value)}</div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="w-full text-sm text-muted py-8 border border-dashed border-border rounded-md hover:bg-surface2 hover:text-accent transition"
        >
          + Добавить документацию
        </button>
      )}
    </section>
  );
}

/**
 * Minimal markdown renderer — headings (##, ###), bullets, bold, links.
 * Avoids pulling a full lib; good enough for in-app docs.
 */
function renderMarkdown(src: string): React.ReactNode {
  const lines = src.split('\n');
  const out: React.ReactNode[] = [];
  let listBuf: string[] = [];
  let key = 0;

  function flushList() {
    if (listBuf.length === 0) return;
    out.push(
      <ul key={key++} className="list-disc pl-5 my-2 space-y-1">
        {listBuf.map((l, i) => (
          <li key={i}>{renderInline(l)}</li>
        ))}
      </ul>
    );
    listBuf = [];
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^### /.test(line)) {
      flushList();
      out.push(
        <h3 key={key++} className="text-sm font-semibold mt-3 mb-1">
          {renderInline(line.slice(4))}
        </h3>
      );
    } else if (/^## /.test(line)) {
      flushList();
      out.push(
        <h2 key={key++} className="text-base font-semibold mt-4 mb-1">
          {renderInline(line.slice(3))}
        </h2>
      );
    } else if (/^# /.test(line)) {
      flushList();
      out.push(
        <h1 key={key++} className="text-lg font-bold mt-4 mb-2">
          {renderInline(line.slice(2))}
        </h1>
      );
    } else if (/^[-*]\s+/.test(line)) {
      listBuf.push(line.replace(/^[-*]\s+/, ''));
    } else if (line.trim() === '') {
      flushList();
      out.push(<div key={key++} className="h-2" />);
    } else {
      flushList();
      out.push(
        <p key={key++} className="text-sm leading-relaxed my-1">
          {renderInline(line)}
        </p>
      );
    }
  }
  flushList();
  return <>{out}</>;
}

function renderInline(text: string): React.ReactNode {
  // bold **x**, italic *x*, code `x`, links autodetect http(s)://
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let k = 0;
  while (remaining.length > 0) {
    const bold = remaining.match(/^(.*?)\*\*(.+?)\*\*/);
    const code = remaining.match(/^(.*?)`(.+?)`/);
    const link = remaining.match(/^(.*?)(https?:\/\/[^\s)]+)/);
    const candidates = [bold, code, link].filter(Boolean) as RegExpMatchArray[];
    if (candidates.length === 0) {
      parts.push(<span key={k++}>{remaining}</span>);
      break;
    }
    const first = candidates.reduce((min, m) =>
      (m.index ?? 0) < (min.index ?? 0) ? m : min
    );
    const before = first[1] ?? '';
    if (before) parts.push(<span key={k++}>{before}</span>);
    if (first === bold) {
      parts.push(
        <strong key={k++} className="font-semibold">
          {first[2]}
        </strong>
      );
    } else if (first === code) {
      parts.push(
        <code key={k++} className="bg-surface2 rounded px-1 py-0.5 text-[12px] font-mono">
          {first[2]}
        </code>
      );
    } else {
      parts.push(
        <a
          key={k++}
          href={first[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          {first[2]}
        </a>
      );
    }
    remaining = remaining.slice((first.index ?? 0) + first[0].length);
  }
  return <>{parts}</>;
}
