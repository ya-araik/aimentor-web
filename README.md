# ИИ Ментор

Веб-клиент существующего API: кабинет студента, чат и задания, навыки и прогресс, административный дашборд с 13 визуализациями, включая два интерактивных 3D-рельефа.

## Запуск для заказчика

Нужны **Docker с Docker Compose v2** и доступ сервера к API. Node.js и npm на сервер устанавливать не требуется: сборка выполняется внутри Docker.

1. Скопировать `.env.example` в **`.env` в корне репозитория**, рядом с `compose.yaml`.
2. Проверить `API_UPSTREAM` — адрес существующего API — и `WEB_PORT` — порт приложения. В примере указан текущий API из Swagger.
3. Из корня репозитория выполнить:

```sh
docker compose up -d --build
```

Открыть **`http://localhost:8080`** на сервере или **`http://SERVER_IP:8080`** с другого компьютера. При другом `WEB_PORT` подставить этот порт.

Это вся обязательная настройка. `web/.env.local` для Docker не нужен. База данных и собственный бэкенд не запускаются; приложение работает с API, указанным в корневом `.env`.

Подробности, обновление и устранение ошибок — в [инструкции развёртывания](DEPLOYMENT.md).

## Управление

```sh
docker compose ps
docker compose logs --tail=100 web
docker compose down
```

Для обновления получить новую версию репозитория и снова выполнить `docker compose up -d --build`. После изменения только `.env` достаточно `docker compose up -d`: адрес API применяется при запуске контейнера, пересборка фронтенда не нужна.

## Документация продукта

- [Как студенту пользоваться приложением](project-plan/student-guide.md).
- [Аналитика администратора: графики, формулы и управление 3D](project-plan/admin-analytics.md).
- [Архитектура](project-plan/system-design.md), [тикеты](project-plan/tickets.md), [состояние реализации](project-plan/implementation-status.md).
- [Контракт API](project-plan/contracts/aimmentor.openapi.json).

Известные замечания к API сохранены в [отдельном документе](project-plan/customer-api-requirements.md). По договорённости они временно отложены и не являются условием запуска этой поставки.

## Для разработчика

Для работы без Docker рекомендуется Node.js 24 и npm. Только для этого режима используется отдельный `web/.env.local`:

```sh
cd web
npm ci
```

Скопировать `web/.env.example` в `web/.env.local`, затем из `web`:

```sh
npm run generate:api
npm run dev
```

`VITE_DEMO_MODE=true` включает учебные данные только в режиме разработки. Демо-вход: `student` / `student123` или `admin` / `admin123`. Для реального API задать `VITE_DEMO_MODE=false` и `API_UPSTREAM` в `web/.env.local`. Docker всегда собирает рабочий клиент без dev-моков; локальные `.env` в образ не попадают.

Проверки из `web`:

```sh
npm run typecheck
npm test
npm run build
```

Проверка чистой поставки из корня: `node scripts/deployment-review.mjs`. Ей нужны Docker, Node.js и Git; эти инструменты, кроме Docker, нужны только для проверки, не для развёртывания. Скрипт собирает отдельную чистую копию, проверяет запуск с одним `.env`, прокси и изменение настроек без пересборки. Отчёт — `.local/deployment-review/`.

Браузерные проверки: `scripts/browser-smoke.mjs`, `scripts/dashboard-review.mjs`, `scripts/three-d-review.mjs`. Нужны Playwright с Chromium и локальный `.local/integration-accounts.json`; при внешнем пакете задать `PLAYWRIGHT_PACKAGE`, при другом адресе — `WEB_URL`. Доступы и артефакты исключены из Git и Docker. По умолчанию проверки только читают API; флаги `--exercise-chat` и `--exercise-registration` у browser-smoke выполняют соответствующие тестовые операции.
