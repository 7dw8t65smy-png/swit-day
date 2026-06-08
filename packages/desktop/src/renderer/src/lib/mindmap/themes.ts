// Визуальные темы карты: палитра веток, цвет корня и класс холста для
// фоновой атмосферы. Тема хранится в doc.theme (ключ). Чистые данные.

export interface MindMapThemeDef {
  key: string;
  label: string;
  /** Палитра цветов веток 1-го уровня (наследуется вглубь). */
  branchColors: string[];
  /** Цвет центрального узла. */
  rootColor: string;
  /** CSS-класс холста для фона/атмосферы. */
  canvasClass: string;
}

export const DEFAULT_THEME = 'classic';

export const THEMES: MindMapThemeDef[] = [
  {
    key: 'classic',
    label: 'Классика',
    rootColor: '#334155',
    canvasClass: '',
    branchColors: ['#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#059669', '#0891B2', '#CA8A04', '#DC2626']
  },
  {
    key: 'aurora',
    label: 'Аврора',
    rootColor: '#4C1D95',
    canvasClass: 'mind-canvas--aurora',
    branchColors: ['#7C3AED', '#2563EB', '#0891B2', '#DB2777', '#9333EA', '#0EA5E9', '#C026D3', '#4F46E5']
  },
  {
    key: 'forest',
    label: 'Лес',
    rootColor: '#14532D',
    canvasClass: 'mind-canvas--forest',
    branchColors: ['#059669', '#0D9488', '#65A30D', '#CA8A04', '#16A34A', '#0891B2', '#4D7C0F', '#15803D']
  },
  {
    key: 'sunset',
    label: 'Закат',
    rootColor: '#7C2D12',
    canvasClass: 'mind-canvas--sunset',
    branchColors: ['#EA580C', '#DC2626', '#DB2777', '#D97706', '#F59E0B', '#E11D48', '#C2410C', '#BE123C']
  },
  {
    key: 'ocean',
    label: 'Океан',
    rootColor: '#0C4A6E',
    canvasClass: 'mind-canvas--ocean',
    branchColors: ['#0EA5E9', '#2563EB', '#0891B2', '#06B6D4', '#3B82F6', '#0284C7', '#155E75', '#1D4ED8']
  },
  {
    key: 'mono',
    label: 'Графит',
    rootColor: '#1E293B',
    canvasClass: 'mind-canvas--mono',
    branchColors: ['#475569', '#64748B', '#334155', '#52525B', '#71717A', '#3F3F46', '#57534E', '#44403C']
  }
];

const BY_KEY = new Map(THEMES.map((t) => [t.key, t]));

export function getTheme(key?: string | null): MindMapThemeDef {
  return (key && BY_KEY.get(key)) || BY_KEY.get(DEFAULT_THEME) || THEMES[0];
}
