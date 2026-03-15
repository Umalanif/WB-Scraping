ТЗ v2.0: Enterprise Гибридный Парсер (Crawlee + Got)
Цель: Разделить процесс на два модуля. miner.js пробивает защиту WB с помощью PlaywrightCrawler и сохраняет отпечаток. parser.js использует этот отпечаток для высокоскоростного сбора данных через got-scraping (или встроенный sendRequest) с обязательной Zod валидацией.

Этап 1: Создание Добытчика (miner.js)
Скрипт должен запустить полноценный crawler, получить куку и корректно завершить работу.

Инициализация:

Импортируй PlaywrightCrawler из crawlee и логгер Pino.

Создай инстанс краулера. Параметр headless должен управляться через process.env.HEADLESS === 'true'.

Логика requestHandler:

Зайди на главную WB (https://www.wildberries.ru/).

Вытащи текущие куки браузера: const cookies = await page.context().cookies().

Вытащи сгенерированный crawlee User-Agent: const ua = await page.evaluate(() => navigator.userAgent).

Ищи куку x_wbaas_token. Если она есть — сохрани объект { userAgent: ua, cookies: cookies } в файл session.json (через fs/promises).

Завершение (Graceful Shutdown):

Как только токен найден и сохранен, прерви работу краулера через await crawler.teardown() и залогируй успех через Pino.

Этап 2: Создание Боевого Парсера (parser.js)
Скрипт без браузера, работающий напрямую с Hidden API.

Инициализация и Схемы:

Импортируй got-scraping (поставляется вместе с crawlee) и zod.

Создай схему ProductSchema (id, название, цена) для валидации.

Чтение сессии:

Прочитай session.json. Склей куки в правильную строку Cookie: name=value; name2=value2.

Сбор данных (got-scraping):

Используй URL API Wildberries (https://search.wb.ru/...).

В опциях запроса жестко передай headers.cookie и headerGeneratorOptions: { browsers: [{ name: 'chrome' }] } (или передай готовый User-Agent из файла).

Валидация (Zod Gatekeeper):

Полученный JSON прогони через ProductSchema.safeParse().

Правило: Писать в базу (или Dataset) только те товары, где success === true. Ошибки валидации логировать через Pino и отбрасывать (не использовать throw).

Сохранение:

Сохрани валидированные данные в встроенный Dataset от Crawlee.
