import { User, Palette, Briefcase, Bell, Plug, Database, Info, type LucideIcon } from 'lucide-react';
import type { Category } from './types';

export const PAGES: { value: string; label: string }[] = [
  { value: '/today', label: 'Сегодня' },
  { value: '/tasks', label: 'Задачи' },
  { value: '/habits', label: 'Рутины' },
  { value: '/notes', label: 'Заметки' },
  { value: '/calendar', label: 'Календарь' },
  { value: '/journal', label: 'Журнал' },
  { value: '/stats', label: 'Статистика' }
];

export const CATEGORIES: { key: Category; label: string; icon: LucideIcon }[] = [
  { key: 'general', label: 'Общие', icon: User },
  { key: 'appearance', label: 'Внешний вид', icon: Palette },
  { key: 'workday', label: 'Рабочий день', icon: Briefcase },
  { key: 'notifications', label: 'Уведомления', icon: Bell },
  { key: 'integrations', label: 'Интеграции', icon: Plug },
  { key: 'data', label: 'Данные', icon: Database },
  { key: 'about', label: 'О программе', icon: Info }
];
