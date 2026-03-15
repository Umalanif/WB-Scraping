# Wildberries Hybrid Parser (Crawlee + Got)

Enterprise-grade parser for Wildberries.ru using a two-stage architecture:
- **miner.js** - PlaywrightCrawler для обхода защиты и получения сессии
- **parser.js** - got-scraping для высокоскоростного сбора данных с Zod валидацией

## 📋 Требования

- Node.js 18+
- npm

## 🚀 Установка

```bash
npm install
```

## 📖 Использование

### Этап 1: Добыча сессии (miner.js)

Скрипт запускает браузер, получает куки и токен `x_wbaas_token`, сохраняет в `session.json`.

```bash
# Запуск в headless режиме (по умолчанию)
npm run miner:headless

# Запуск с видимым браузером (для отладки)
cross-env HEADLESS=false npm run miner

# Или напрямую
node miner.js
```

**Результат:** Файл `session.json` с User-Agent и cookies.

### Этап 2: Парсинг данных (parser.js)

Использует сессию из `session.json` для запросов к API Wildberries.

```bash
# Парсинг по умолчанию (запрос: "товар", лимит: 100)
npm run parser

# С экспортом в JSON файл
npm run parser:json

# Кастомный запрос и лимит
node parser.js "кроссовки" 50

# Кастомный запрос с JSON экспортом
cross-env OUTPUT_JSON=true node parser.js "кроссовки" 50
```

## ⚙️ Конфигурация

Скопируйте `.env.example` в `.env` для настройки:

```bash
# HEADLESS=true|false - режим браузера в miner.js
# MAX_PAGES=5 - максимум страниц для парсинга
# OUTPUT_JSON=true|false - экспорт в JSON файл
# LOG_LEVEL=info - уровень логирования (fatal, error, warn, info, debug, trace)
```

## 📁 Структура проекта

```
WB/
├── miner.js           # Добытчик сессии (Playwright)
├── parser.js          # Боевой парсер (got-scraping)
├── schemas.js         # Zod схемы валидации
├── session.json       # Сохранённая сессия (генерируется)
├── .env.example       # Пример конфигурации
└── package.json
```

## 🔧 Архитектура

### miner.js
- Импортирует `PlaywrightCrawler` из `crawlee`
- Управляет `headless` через `process.env.HEADLESS`
- Извлекает куки через `page.context().cookies()`
- Ищет токен `x_wbaas_token`
- Сохраняет сессию в `session.json`
- Graceful shutdown через `crawler.teardown()`

### parser.js
- Использует `got-scraping` для прямых запросов к API
- Читает сессию из `session.json`
- Формирует Cookie header из сохранённых кук
- Валидирует каждый товар через Zod схему
- Пишет в Dataset только валидные данные (`success === true`)
- Обрабатывает 429 (retry через Crawlee) и 403 (stop после 3 ошибок)

### schemas.js
- `ProductSchema` - валидация товаров
- `SessionSchema` - валидация сессии
- `validateProduct()` - gatekeeper функция
- `cookiesToHeaderString()` - утилита для Cookie header

## 🛡️ Anti-Bot тактики

1. **DevTools First** - используется скрытый API `search.wb.ru`
2. **Stealth** - Playwright с эмуляцией реального браузера
3. **Rate Limiting** - обработка 429 через Crawlee retry
4. **403 Protection** - остановка после 3 consecutive 403 ошибок
5. **Fingerprinting** - сохранение реального User-Agent и кук

## 📊 Валидация данных

Все данные проходят через Zod gatekeeper:

```javascript
const result = ProductSchema.safeParse(product);
if (result.success) {
    // Запись в базу/Dataset
} else {
    // Логирование и отбрасывание
    logger.warn({ errors: result.error.errors }, 'Validation failed');
}
```

## 📝 Примеры данных

```json
{
  "id": 123456789,
  "name": "Кроссовки мужские спортивные",
  "price": 5999,
  "salePrice": 3499,
  "brand": "Nike",
  "rating": 4.8,
  "reviews": 1250,
  "image": "https://basket-01.wbbasket.ru/image/..."
}
```

## 🔍 Troubleshooting

### miner.js не находит x_wbaas_token
- Увеличьте таймаут ожидания
- Запустите с `HEADLESS=false` для визуальной отладки
- Проверьте, что WB не требует капчу

### parser.js получает 403
- Запустите miner.js заново для свежей сессии
- Уменьшите `MAX_PAGES`
- Проверьте IP на наличие блокировок

### Rate Limit (429)
- Parser автоматически retry через Crawlee
- Увеличьте задержку между запросами в коде

## 📄 Лицензия

ISC
