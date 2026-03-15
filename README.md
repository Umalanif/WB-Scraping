# Wildberries Hybrid Parser (Crawlee + Got + Prisma)

Enterprise-grade parser для Wildberries.ru с двухэтапной архитектурой и персистентным хранением данных.

## 🏗️ Архитектура

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   miner.js      │────▶│   session.json   │────▶│   parser.js     │
│ PlaywrightCrawler│     │ (User-Agent +    │     │ got-scraping +  │
│ + Anti-Bot      │     │  Cookies + Token)│     │ Prisma + Zod    │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │  SQLite (Prisma)│
                                                 │  storage/dev.db │
                                                 └─────────────────┘
```

### Компоненты

| Модуль | Технология | Назначение |
|--------|-----------|------------|
| **miner.js** | PlaywrightCrawler | Обход защиты WB, получение сессии (куки + x_wbaas_token) |
| **parser.js** | got-scraping | Высокоскоростной сбор данных через скрытый API |
| **schemas.js** | Zod | Валидация данных (Gatekeeper pattern) |
| **storage** | Prisma + SQLite | Персистентное хранение с Upsert и Audit Trail |

## 📋 Требования

- Node.js 18+
- npm

## 🚀 Установка

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка окружения

```bash
# Скопируйте пример конфигурации
copy .env.example .env
```

Отредактируйте `.env` при необходимости:

```env
# База данных (Prisma + SQLite)
DATABASE_URL="file:./storage/dev.db"

# Режим браузера в miner.js (true/false)
HEADLESS=true

# Максимум страниц для парсинга
MAX_PAGES=5

# Экспорт в JSON (true/false)
OUTPUT_JSON=false

# Уровень логирования: fatal, error, warn, info, debug, trace
LOG_LEVEL=info
```

### 3. Инициализация базы данных

```bash
# Применить схему к SQLite и сгенерировать клиент
npx prisma db push
npx prisma generate
```

## 📖 Использование

### Этап 1: Добыча сессии (miner.js)

Запускает браузер в headless-режиме, обходит защиту WB, извлекает куки и токен `x_wbaas_token`.

```bash
# Headless режим (по умолчанию)
npm run miner:headless

# Видимый браузер (для отладки)
cross-env HEADLESS=false npm run miner

# Напрямую
node miner.js
```

**Результат:** Файл `session.json` с User-Agent и cookies.

### Этап 2: Парсинг данных (parser.js)

Использует сессию для запросов к скрытому API `search.wb.ru`.

```bash
# Парсинг по умолчанию (запрос: "товар", лимит: 100)
npm run parser

# С экспортом в JSON
npm run parser:json

# Кастомный запрос и лимит
node parser.js "кроссовки" 50

# Кастомный запрос с JSON экспортом
cross-env OUTPUT_JSON=true node parser.js "кроссовки" 50
```

**Результат:** Данные сохраняются в SQLite (`storage/dev.db`) и/или экспортируются в JSON.

## 📁 Структура проекта

```
WB/
├── miner.js              # Добытчик сессии (PlaywrightCrawler)
├── parser.js             # Боевой парсер (got-scraping + Prisma)
├── schemas.js            # Zod схемы валидации
├── prisma/
│   ├── schema.prisma     # Схема базы данных
│   └── migrations/       # Миграции Prisma
├── storage/
│   └── dev.db            # SQLite база данных
├── session.json          # Сохранённая сессия (генерируется)
├── .env                  # Конфигурация окружения
├── .env.example          # Пример конфигурации
├── prisma.config.ts      # Конфигурация Prisma
└── package.json
```

## 🔧 Детали архитектуры

### miner.js

- Использует `PlaywrightCrawler` из Crawlee
- Управляет `headless` через `process.env.HEADLESS`
- Извлекает куки через `page.context().cookies()`
- Ищет токен `x_wbaas_token` в cookies
- Сохраняет сессию в `session.json`
- Graceful shutdown через `crawler.teardown()`

### parser.js

- Использует `got-scraping` для прямых запросов к API
- Читает сессию из `session.json`
- Формирует Cookie header из сохранённых кук
- Валидирует каждый товар через Zod схему (`safeParse`)
- Записывает в SQLite через `prisma.product.upsert` (Idempotency)
- Обрабатывает 429 (retry через Crawlee) и 403 (stop после 3 ошибок)

### schemas.js

- `ProductSchema` — валидация товаров
- `SessionSchema` — валидация сессии
- `validateProduct()` — gatekeeper функция
- `cookiesToHeaderString()` — утилита для Cookie header

### База данных (Prisma Schema)

```prisma
model Product {
  id        Int      @id @unique // Артикул WB
  name      String
  price     Float?
  salePrice Float?
  brand     String?
  rating    Float?
  reviews   Int?
  image     String?

  // Audit Trail
  sourceUrl String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## 🛡️ Anti-Bot тактики

1. **DevTools First** — используется скрытый API `search.wb.ru`
2. **Stealth** — Playwright с эмуляцией реального браузера
3. **Rate Limiting** — обработка 429 через Crawlee retry
4. **403 Protection** — остановка после 3 consecutive 403 ошибок
5. **Fingerprinting** — сохранение реального User-Agent и кук

## 📊 Валидация данных (Zod Gatekeeper)

Все данные проходят через строгую валидацию перед записью в БД:

```javascript
const result = ProductSchema.safeParse(product);
if (result.success) {
    await prisma.product.upsert({
        where: { id: product.id },
        update: product,
        create: { ...product, sourceUrl: url }
    });
} else {
    logger.warn({ errors: result.error.errors }, 'Validation failed');
}
```

## 📝 Пример данных

```json
{
  "id": 123456789,
  "name": "Кроссовки мужские спортивные",
  "price": 5999,
  "salePrice": 3499,
  "brand": "Nike",
  "rating": 4.8,
  "reviews": 1250,
  "image": "https://basket-01.wbbasket.ru/image/...",
  "sourceUrl": "https://www.wildberries.ru/catalog/123456789/detail.aspx",
  "createdAt": "2026-03-15T10:30:00.000Z",
  "updatedAt": "2026-03-15T10:30:00.000Z"
}
```

## 🔍 Troubleshooting

### miner.js не находит x_wbaas_token

- Увеличьте таймаут ожидания
- Запустите с `HEADLESS=false` для визуальной отладки
- Проверьте, что WB не требует капчу

### parser.js получает 403

- Запустите `miner.js` заново для свежей сессии
- Уменьшите `MAX_PAGES`
- Проверьте IP на наличие блокировок

### Rate Limit (429)

- Parser автоматически retry через Crawlee
- Увеличьте задержку между запросами в коде

### Ошибки Prisma

```bash
# Перегенерировать клиент
npx prisma generate

# Применить схему к БД
npx prisma db push
```

## 📄 Лицензия

ISC
