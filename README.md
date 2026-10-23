# Filmless

Киноигра для компании по ссылке. Next.js + NestJS + TypeScript, Tailwind CSS и shadcn/ui.

## Статус

Работают создание комнаты, вход по ссылке, выбор категории и режима, список игроков, готовность и восстановление соединения. Комнаты пока хранятся в памяти одного API и исчезают при его перезапуске, срок жизни — 2 часа. Доступна полная демопартия: 3 раунда, подсказки, русский поиск, очки, финал и реванш. Вместо кинокадров — собственные схематичные иллюстрации; добавлен импорт ПоискКино и подготовка реальных изображений, но живой каталог ещё не наполнен. API health проверяет процесс, а не готовность базы.

## Запуск одной командой через Docker

Нужен запущенный Docker Desktop или Docker Engine с Compose.

```sh
docker compose up --build -d --wait
```

Открыть http://localhost:3000. Compose собирает приложения, запускает PostgreSQL, применяет миграции, затем запускает API, сайт и Caddy с поддержкой WebSocket. Ключи кино-API для лобби не нужны. Первая сборка требует интернета и занимает несколько минут.

```sh
docker compose logs -f api web
docker compose down
```

Остановка сохраняет базу в volume. По умолчанию сайт доступен только с этого компьютера. Для проверки с телефона в одной сети задайте `BIND_ADDRESS=0.0.0.0 WEB_ORIGIN=http://<IP-компьютера>:3000` перед командой запуска и открывайте этот адрес. Для публичного размещения понадобятся домен, HTTPS и production-секреты.

Проверка двух игроков через HTTP и WebSocket после установки зависимостей: `pnpm test:smoke`. Полная партия с реальными таймерами (около 3 минут): `pnpm test:game`. Порт можно изменить через `WEB_PORT`, адрес smoke-проверки — через `BASE_URL`.

## Локальный запуск без контейнеров приложений

Нужны Node.js 24.11+ (ветка 24), pnpm 11.17.0; Docker для PostgreSQL.

```sh
pnpm install
cp .env.example .env
pnpm --filter @filmless/contracts build
pnpm dev
```

Web: http://localhost:3000. API: http://localhost:3001/api/health.

```sh
pnpm db:up
pnpm --filter @filmless/api db:generate
pnpm --filter @filmless/api db:migrate
```

Compose использует локальные dev-реквизиты и слушает PostgreSQL только на loopback. Для production нужны отдельные секреты и конфигурация. `db:down` сохраняет volume.

## Проверки

```sh
pnpm check
pnpm format
```

Pre-commit: lint-staged (ESLint + Prettier), затем typecheck. Commit-msg: Conventional Commits, например `feat: add room lobby`. Pre-push: lint, typecheck, tests. CI повторяет проверки и production build; локальные хуки можно обойти, поэтому CI обязателен перед merge. Remote и branch protection пока не настроены.

Правила и ограничения текущей игры: [docs/GAMEPLAY.md](docs/GAMEPLAY.md). Для запуска партии нужны двое подключённых и готовых игроков.

## Каталог и API

Импорт, проверки изображений и публикация: [docs/CONTENT_PIPELINE.md](docs/CONTENT_PIPELINE.md).

Ключи только в `.env`, никогда в `NEXT_PUBLIC_*`. Исследование и выбор источников: [docs/CONTENT_SOURCES.md](docs/CONTENT_SOURCES.md).

```sh
pnpm api:probe poiskkino 258687
pnpm api:probe kinopoisk-unofficial 258687
pnpm api:probe tmdb-movie 157336
```

Скрипт выполняет ограниченное число запросов, не скачивает изображения, сохраняет локальный отчёт в игнорируемую папку `reports/`. Отсутствие ключа завершается понятной ошибкой. Цифры полученных изображений не являются оценкой пригодности для игры.

## Структура

- `apps/web` — Next.js, Tailwind, shadcn/ui, TanStack Query.
- `apps/api` — NestJS, доменные правила, Prisma.
- `packages/contracts` — общие типы и runtime-схемы.
- `docs` — PRD, архитектура, исследования.

Не включать правильные ответы в публичные контракты раунда. Сначала проверить права и качество asset, затем публиковать вопрос.

Аккаунты: [настройка почты, Яндекса и Twitch](docs/AUTH.md). Локальные письма доступны в [Mailpit](http://localhost:8025); они не доставляются на внешнюю почту. Тренировка и комнаты с друзьями работают без регистрации; случайные дуэли — после входа.

## Тестовый деплой

Конфигурация Render находится в `render.yaml`. Порядок запуска, перенос каталога и ограничения бесплатного тарифа описаны в [инструкции по деплою](docs/DEPLOYMENT.md).
