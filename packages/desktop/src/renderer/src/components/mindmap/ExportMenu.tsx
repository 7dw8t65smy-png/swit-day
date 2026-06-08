import { useEffect, useRef, useState } from 'react';
import { Download, FileText, FileCode, Image as ImageIcon, FileType } from 'lucide-react';
import { useMindMap } from '../../lib/mindmap/store';
import { getTheme } from '../../lib/mindmap/themes';
import { toMarkdown, toOpml, toSvg } from '../../lib/mindmap/exporters';
import { pushToast } from '../../hooks/useToasts';

type Format = 'md' | 'opml' | 'svg' | 'png';

const ITEMS: { format: Format; label: string; ext: string; icon: typeof FileText }[] = [
  { format: 'md', label: 'Markdown', ext: 'md', icon: FileText },
  { format: 'opml', label: 'OPML', ext: 'opml', icon: FileCode },
  { format: 'svg', label: 'SVG', ext: 'svg', icon: FileType },
  { format: 'png', label: 'PNG', ext: 'png', icon: ImageIcon }
];

function slugify(title: string): string {
  const s = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || 'mind-map';
}

async function svgToPngBase64(svg: string, scale = 2): Promise<string> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('svg load failed'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, img.width * scale);
    canvas.height = Math.max(1, img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1] ?? '';
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function ExportMenu(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  async function run(format: Format, ext: string): Promise<void> {
    const { doc, title } = useMindMap.getState();
    if (!doc || busy) return;
    setOpen(false);
    setBusy(true);
    try {
      const theme = getTheme(doc.theme);
      let data: string;
      let base64 = false;
      if (format === 'md') data = toMarkdown(doc, title);
      else if (format === 'opml') data = toOpml(doc, title);
      else if (format === 'svg') data = toSvg(doc, theme);
      else {
        data = await svgToPngBase64(toSvg(doc, theme));
        base64 = true;
      }
      const res = await window.swit.saveFile({
        defaultName: `${slugify(title)}.${ext}`,
        data,
        base64
      });
      if (res.saved) pushToast({ kind: 'info', message: `Экспортировано: ${ext.toUpperCase()}` });
    } catch {
      pushToast({ kind: 'error', message: 'Не удалось экспортировать' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        title="Экспорт"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className={[
          'p-2 rounded-md transition-colors',
          open ? 'bg-accent/15 text-accent' : 'text-muted hover:text-ink hover:bg-surface2',
          busy ? 'opacity-40 cursor-not-allowed' : ''
        ].join(' ')}
      >
        <Download size={16} />
      </button>

      {open && (
        <div className="mind-theme-menu">
          {ITEMS.map(({ format, label, ext, icon: Icon }) => (
            <button key={format} className="mind-theme-item" onClick={() => void run(format, ext)}>
              <Icon size={15} className="text-muted" />
              <span className="mind-theme-name">{label}</span>
              <span className="text-faint text-xs">.{ext}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
