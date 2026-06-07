# SWIT Day

Персональный планировщик рабочего дня. macOS-десктоп сейчас, VDS + Telegram-бот потом.

## Архитектура

Client-server с самого начала:

```
┌──────────────────────────────────────────────────────┐
│  Electron-обёртка (renderer = React + TS + Tailwind) │
│             ↓ HTTP (fetch)                            │
│  Fastify-сервер (Node) + SQLite (better-sqlite3)     │  ← позже выносится на VDS
│             ↑                                         │
│  Telegram-бот (тот же сервер, новый модуль)          │  ← позже
└──────────────────────────────────────────────────────┘
```

На Mac сервер стартует как `child_process.fork` внутри Electron в проде; в dev запускается отдельно через `npm run dev:server`. На VDS — тот же сервер как systemd-сервис, Telegram-бот переиспользует БД.

## Структура

```
SWIT-Day/
├── package.json                       # npm workspaces
├── packages/
│   ├── shared/                        # типы + SQL-схема
│   ├── server/                        # Fastify + SQLite + REST
│   │   └── src/routes/
│   │       ├── projects.ts
│   │       ├── tasks.ts
│   │       ├── notes.ts
│   │       ├── sessions.ts            # work_sessions + task_time_logs
│   │       ├── events.ts
│   │       ├── journal.ts
│   │       ├── reminders.ts
│   │       └── settings.ts
│   └── desktop/
│       └── src/
│           ├── main/index.ts          # Electron main + spawn сервера
│           ├── preload/index.ts       # contextBridge → window.swit
│           └── renderer/src/
│               ├── App.tsx            # роутинг + Cmd+1..7
│               ├── api.ts             # клиент к Fastify
│               ├── store.ts           # Zustand: ui, dayTimer
│               ├── components/        # Sidebar, RightPanel
│               └── pages/             # Today, Tasks, Notes, Calendar, Projects, Journal, Stats, Settings
```

База: `~/Library/Application Support/SWIT Day/swit-day.db` (Mac).
Backend слушает `127.0.0.1:47821`.

## Запуск (после `npm install`)

```bash
# Терминал 1 — сервер
npm run dev:server

# Терминал 2 — Electron + Vite
npm run dev:desktop
```

Для продакшен-сборки `.dmg`:

```bash
npm run build
npm --workspace=packages/desktop run dist
```

## Что уже работает (скелет)

- ✅ Monorepo, типы, SQL-схема всех 9 таблиц
- ✅ Fastify-сервер с CRUD по: projects, tasks, notes, sessions, time-logs, events, journal, reminders, settings
- ✅ Electron-shell + preload + IPC (server URL, нативные нотификации)
- ✅ React-роутинг 7 страниц + Settings, Cmd+1..7
- ✅ Sidebar с SWIT-брендингом, переключатель темы (light/dark)
- ✅ Tailwind с CSS-переменными по дизайн-системе спеки
- ✅ Экран «Сегодня»: главный таймер (Старт/Пауза/Перерыв/Завершить день), добавление задач на сегодня, быстрые заметки, поле «Что сделано» → журнал
- ✅ Правая панель (макет)

---

## ROADMAP — что осталось реализовать

Привязано к фазам из спецификации.

### Фаза 1 (доделать MVP)
- [ ] Persistence таймера: electron-store + восстановление состояния при запуске («продолжить день?»)
- [ ] Прогресс-бар сессий за сегодня (синий = работа, оранжевый = пауза/перерыв)
- [ ] Метрики на экране Сегодня: чистая работа, паузы, начал в, кол-во сессий
- [ ] Блок «Текущая задача» с отдельным таймером задачи (start_time_log при выборе)
- [ ] System tray (`Tray` API): иконка статуса, меню Старт/Пауза/Перерыв/Завершить, текущее время
- [ ] Диалог выбора типа перерыва (Кофе / Обед / Туалет / Другое)
- [ ] Диалог «Завершить день» с настроением и prefill из поля «Что сделано»
- [ ] Обработка перехода через полночь (auto-close session at 23:59)
- [ ] Восстановление оборванных сессий (`ended_at IS NULL` при старте)

### Фаза 2 — Основные экраны
- [ ] Tasks: полные фильтры (Все/Сегодня/Неделя/Проект/Приоритет), сортировка, поиск, группировки
- [ ] Tasks: панель деталей (описание markdown, теги, оценка, подзадачи, лог времени, связанные заметки)
- [ ] Tasks: быстрое добавление с Tab между полями
- [ ] Projects: цвет/иконка picker, страница проекта с вкладками (Задачи/Заметки/Время/События), архивация
- [ ] Journal: запись настроения (1-5 emoji), рефлексия, метрики, тайм-лайн дня
- [ ] Stats: recharts — bar (фокус за неделю), donut (распределение по проектам), heatmap (GitHub-style), линейный (задачи), radar/bar (среднее по дням недели), таблица деталей
- [ ] Notes: переключатель Быстрые/Полные, markdown-редактор с превью, pin, привязки, теги

### Фаза 3 — Польза
- [ ] Calendar: месяц/неделя/день, drag-n-drop событий, дневной план
- [ ] Calendar: модалка добавления события
- [ ] Reminders: scheduler в main process (setInterval, проверка `/reminders/due` каждую минуту → `Notification`)
- [ ] Reminders: snooze (5/15/30 мин / 1 час)
- [ ] Системные напоминания: «начать день», «завершить день», дедлайны задач за 1 день / 1 час
- [ ] Right panel: реальный мини-календарь, ближайшее событие, мини-фокус-чарт за неделю
- [ ] Полный набор хоткеев (Cmd+Space, Cmd+B, Cmd+N, Cmd+Shift+N, Space на таймере задачи)

### Фаза 4 — Полировка macOS
- [ ] Нативное App Menu (File, Edit, View…)
- [ ] Анимации переходов (Framer Motion или CSS)
- [ ] Onboarding на первом запуске (имя, время начала дня, тема)
- [ ] Экспорт CSV (задачи, лог времени, журнал)
- [ ] Экспорт JSON (полный дамп для бэкапа)
- [ ] Импорт JSON
- [ ] Генерация PDF/HTML отчёта за неделю/месяц
- [ ] Иконка приложения (`assets/icons/`), сборка .dmg через electron-builder

### Фаза 5 — Windows
- [ ] Тест tray под Windows
- [ ] Замена macOS-специфичных стилей (titleBarStyle и т.п.)
- [ ] NSIS-сборка .exe

---

## Будущее: VDS + Telegram

Когда дойдём:

### Вынос backend на VDS
1. `packages/server` собирается в standalone Node-бандл (`npm run build --workspace=packages/server`)
2. systemd-юнит на VDS: `node dist/index.js`, env `SWIT_HOST=0.0.0.0`, `SWIT_DATA_DIR=/var/lib/swit-day`
3. nginx-reverse-proxy + HTTPS (Let's Encrypt)
4. Auth: добавить middleware (простой Bearer-токен в `settings.SWIT_API_TOKEN`, на клиенте — Settings → URL backend + токен)
5. На Mac в Settings меняется `baseUrl` на `https://swit.твойдомен` — клиент работает с VDS-базой

### Telegram-бот
1. Новый пакет `packages/telegram` или модуль в `packages/server/src/telegram/`
2. `node-telegram-bot-api` или `grammy`, токен и chat_id из таблицы `settings`
3. Подписка на `reminders` scheduler: при срабатывании напоминания → отправка в Telegram параллельно с локальной нотификацией
4. Команды бота: `/today` (что сегодня в плане), `/done <task>`, `/note <text>`, `/start_day`, `/end_day`
5. Webhook через тот же nginx, либо long-polling

---

## Известные TODO в коде

Каждая страница-заглушка содержит блок `TODO:` внизу с тем, что осталось реализовать на ней. Grep:

```bash
grep -rn "TODO:" packages/desktop/src
```
