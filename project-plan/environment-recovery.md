# Восстановление Docker Desktop 5 октября 2026 года

Во время проверки на C: закончилось место. Пользователь освободил место; npm/typecheck/тесты/сборка снова работают. Обычный перезапуск Docker Desktop завершился таймаутом. После запуска Docker показал ошибку и не поднял engine.

## Причина, подтверждённая журналом

Docker Desktop 4.80.0 не мог удалить служебный AF_UNIX-сокет `dockerInference`; Windows возвращал ошибку доступа. Файл существовал с атрибутом ReparsePoint. Права каталога разрешали полный доступ. После смены каталога ошибка первого сокета исчезла, но запуск остановился на другом таком же сокете — `docker-secrets-engine/engine.sock`. В этом каталоге находился только сокет.

Аналогичная проблема описана в [репозитории Docker](https://github.com/docker/desktop-feedback/issues/527), в том числе для [обоих служебных сокетов](https://github.com/docker/desktop-feedback/issues/531). Причина связи с заполнением диска точно не установлена.

## Что сделано

Процессы Docker остановлены; runtime-каталоги переименованы с сохранением содержимого. Docker запущен снова. Резервные каталоги:

- `C:/Users/Admin/AppData/Local/Docker/run.recovery-20261005`.
- `C:/Users/Admin/AppData/Local/Docker/run.recovery-20261005-2`.
- `C:/Users/Admin/AppData/Local/docker-secrets-engine.recovery-20261005`.

Образы, контейнеры, volumes и диски WSL не сбрасывались. Factory reset, Docker prune и удаление данных не выполнялись. Исходные runtime-объекты сохранены для диагностики.

Проверка восстановления пройдена: `docker info --format '{{.ServerVersion}}'` вернул 29.6.1. Текущий образ проекта собран, контейнер запущен; через него работают реальные HTTP-запросы к API. Приложение оставлено работающим. Итог — в implementation-status.md.
