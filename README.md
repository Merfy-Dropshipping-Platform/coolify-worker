# Coolify Worker

Микросервис для взаимодействия с Coolify API. Предоставляет RPC-интерфейс для Sites Service
и других сервисов, изолируя логику работы с внешним API деплоя.

## Архитектура

```
Sites Service (3114)    Orders Service (3115)
      │                       │
      │ RPC                   │ RPC
      ▼                       ▼
┌─────────────────────────────────────────┐
│         Coolify Worker (3116)           │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │      CoolifyService             │    │
│  │  ─ getOrCreateProject()         │    │
│  │  ─ createStaticSiteApp()        │    │
│  │  ─ restartApplication()         │    │
│  │  ─ setDomain()                  │    │
│  │  ─ toggleMaintenance()          │    │
│  │  ─ deleteApplication()          │    │
│  │  ─ health()                     │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
                    │
                    │ HTTP (retry + backoff)
                    ▼
          ┌─────────────────┐
          │   Coolify API   │
          │ 176.57.218.121  │
          └─────────────────┘
```

## Требования

- Node.js 24+
- pnpm 10
- RabbitMQ
- Доступ к Coolify API

## Быстрый старт

1) Установить зависимости
```bash
pnpm install
```

2) Скопировать `.env.example` в `.env` и настроить:
```env
# RabbitMQ
RABBITMQ_URL=amqp://rabbitmq:password@localhost:5672

# Coolify API (Production)
COOLIFY_API_URL=http://176.57.218.121:8000
COOLIFY_API_TOKEN=2|...
COOLIFY_SERVER_UUID=oo0kocc8ks0wccgc88kocwss
COOLIFY_PROJECT_UUID=cck0k8sscwos8sgs408kgok8
COOLIFY_MODE=http

# MinIO (для nginx-minio-proxy)
S3_PUBLIC_ENDPOINT=https://minio.merfy.ru
S3_BUCKET=merfy-sites
```

3) Запустить сервис
```bash
pnpm run start:dev
```

## RPC Methods

| Pattern | Описание | Параметры |
|---------|----------|-----------|
| `coolify.health` | Проверка API | `{}` |
| `coolify.get_or_create_project` | Получить/создать проект | `{ tenantId, companyName }` |
| `coolify.create_static_site_app` | Создать приложение | `{ projectUuid, name, subdomain, sitePath }` |
| `coolify.restart_application` | Перезапуск | `{ appUuid }` |
| `coolify.set_domain` | Установить домен | `{ appUuid, domain }` |
| `coolify.toggle_maintenance` | Maintenance mode | `{ appUuid, enabled }` |
| `coolify.delete_application` | Удалить приложение | `{ appUuid }` |

## Retry Logic

HTTP клиент реализует exponential backoff:

```typescript
// 3 попытки с задержками: 1s, 2s, 4s
for (attempt = 0; attempt <= 3; attempt++) {
  try {
    return await fetch(url);
  } catch {
    await delay(1000 * 2^attempt);
  }
}
```

Повторяет запрос при:
- HTTP 5xx ошибках
- Network errors (timeout, connection refused)

Не повторяет при:
- HTTP 4xx ошибках (client error)
- Validation errors

## Переменные окружения

| Переменная | Описание | Обязательно |
|------------|----------|-------------|
| `RABBITMQ_URL` | URL подключения к RabbitMQ | Да |
| `COOLIFY_API_URL` | URL Coolify API | Да |
| `COOLIFY_API_TOKEN` | Bearer токен | Да |
| `COOLIFY_SERVER_UUID` | UUID сервера | Да |
| `COOLIFY_PROJECT_UUID` | Default project UUID | Нет |
| `COOLIFY_ENVIRONMENT_NAME` | Имя окружения (default: production) | Нет |
| `COOLIFY_WILDCARD_DOMAIN` | Wildcard домен (default: merfy.ru) | Нет |
| `S3_PUBLIC_ENDPOINT` | Публичный URL MinIO | Да |
| `S3_BUCKET` | Bucket для статики | Да |

## Структура проекта

```
coolify-worker/
├── src/
│   ├── coolify/
│   │   ├── coolify.controller.ts   # RPC обработчики
│   │   ├── coolify.service.ts      # Бизнес-логика + HTTP
│   │   └── coolify.module.ts       # NestJS модуль
│   ├── app.module.ts
│   └── main.ts
├── .env.example
└── package.json
```

## Интеграция с nginx-minio-proxy

Coolify Worker создаёт приложения на основе nginx-minio-proxy — Docker образа,
который проксирует запросы к MinIO bucket:

```
Browser → Coolify App (nginx) → MinIO → sites/{subdomain}/index.html
```

Env переменные для приложения:
- `MINIO_URL` — S3_PUBLIC_ENDPOINT
- `BUCKET` — S3_BUCKET
- `SITE_PATH` — путь к статике (sites/{subdomain})

## Troubleshooting

### Coolify API недоступен

```bash
# Проверить доступность
curl -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
  $COOLIFY_API_URL/api/v1/version

# Проверить через RPC
# Из Sites Service вызвать coolify.health
```

### Приложение не создаётся

1. Проверить `COOLIFY_SERVER_UUID` — должен быть валидный сервер
2. Проверить что nginx-minio-proxy repo доступен
3. Проверить логи Coolify Worker

### Домен не применяется

1. Проверить DNS записи
2. Проверить что Coolify выдал SSL
3. Проверить статус приложения в Coolify Dashboard

## Команды

- `pnpm run start:dev` — запуск в watch-режиме
- `pnpm run build` — сборка в `dist/`
- `pnpm run lint:check` — ESLint
