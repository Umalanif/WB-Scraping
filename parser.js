import { gotScraping } from 'got-scraping';
import { Dataset } from 'crawlee';
import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pino from 'pino';
import { validateProduct, cookiesToHeaderString, SessionSchema } from './schemas.js';
import { PrismaClient } from './generated/prisma/client.ts';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { generateWbImageUrl } from './utils/wb-image.js';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
        },
    },
});

// Initialize Prisma with LibSQL adapter
const libsql = new PrismaLibSql({
    url: process.env.DATABASE_URL || 'file:database.db',
});
const prisma = new PrismaClient({
    adapter: libsql,
});

const SESSION_FILE = join(__dirname, 'session.json');

/**
 * @typedef {import('./schemas.js').Product} Product
 * @typedef {import('./schemas.js').SessionData} SessionData
 */

/**
 * Loads session data from session.json
 * @returns {Promise<SessionData|null>}
 */
async function loadSession() {
    try {
        const content = await readFile(SESSION_FILE, 'utf-8');
        const data = JSON.parse(content);
        const validated = SessionSchema.safeParse(data);
        if (validated.success) {
            return validated.data;
        } else {
            logger.error({ errors: validated.error.errors }, 'Invalid session data');
            return null;
        }
    } catch (error) {
        logger.error({ error: error.message }, 'Failed to load session file');
        return null;
    }
}

/**
 * Builds WB search API URL
 * @param {string} query - Search query
 * @param {number} page - Page number (1-based)
 * @returns {string}
 */
function buildSearchUrl(query, page = 1) {
    const baseUrl = 'https://search.wb.ru/exactmatch/ru/common/v4/search';
    const params = new URLSearchParams({
        appType: '1',
        curr: 'rub',
        dest: '-1257786',
        query: query,
        resultset: 'catalog',
        sort: 'popular',
        page: page.toString(),
        limit: '100',
    });
    return `${baseUrl}?${params.toString()}`;
}

/**
 * Extracts and validates product from WB API response
 * @param {Object} item - Raw product item from API
 * @param {string} sourceUrl - URL of the page where product was extracted
 * @returns {{ success: boolean, data?: Product }}
 */
function extractProduct(item, sourceUrl) {
    // Пропускаем товары без id — невозможно сгенерировать image URL
    if (!item.id) {
        return { success: false, error: { errors: [{ path: ['id'], message: 'Product ID is required' }] } };
    }

    // 1. Попытка достать цену по-старому (на случай, если WB вернет старый формат)
    let priceData = item.price?.total?.sum || item.price?.sale?.sum || item.priceU;
    let salePriceData = item.price?.sale?.sum || item.salePriceU;

    // 2. Достаем цену по-новому (из массива sizes)
    if (!priceData && item.sizes && item.sizes.length > 0) {
        const sizeWithPrice = item.sizes.find(s => s.price);
        if (sizeWithPrice) {
            priceData = sizeWithPrice.price.basic; // Базовая цена (перечеркнутая)
            salePriceData = sizeWithPrice.price.total || sizeWithPrice.price.product; // Цена со скидкой
        }
    }

    // Генерация URL изображения на основе артикула
    // Приводим id к числу, т.к. WB может возвращать его как строку
    const numericId = typeof item.id === 'string' ? Number(item.id) : item.id;
    const imageUrl = generateWbImageUrl(numericId);

    // Формируем прямую ссылку на товар WB для открытия в браузере
    const productUrl = `https://www.wildberries.ru/catalog/${numericId}/detail.aspx`;

    // Формируем name с fallback на "Товар #{id}", если название пустое
    const rawName = (item.name || item.title || '').trim();
    const name = rawName || `Товар #${numericId}`;

    const product = {
        id: numericId,
        name,
        price: priceData ? Number(priceData) / 100 : undefined,
        salePrice: salePriceData ? Number(salePriceData) / 100 : undefined,
        // Обрабатываем brand как строку или объект
        brand: typeof item.brand === 'string' ? item.brand.trim() : (item.brand?.name || undefined),
        rating: item.reviewRating || item.rating || item.nmReviewRating,
        reviews: item.feedbacks || item.nmFeedbacks || 0,
        // Разрешаем null для image — товар без изображения всё равно ценен
        image: imageUrl,
        sourceUrl: productUrl,
    };

    return validateProduct(product);
}

async function main() {
    try {
        const query = process.argv[2] || 'товар';
        const limit = parseInt(process.argv[3]) || 100;
        const maxPages = parseInt(process.env.MAX_PAGES) || 5;

        logger.info({ query, limit, maxPages }, 'Starting Parser');

        const session = await loadSession();
        if (!session) {
            logger.error('No valid session found. Run miner.js first.');
            process.exit(1);
        }

        const hasToken = session.cookies.some((c) => c.name === 'x_wbaas_token');
        if (!hasToken) {
            logger.error('Session missing x_wbaas_token. Run miner.js again.');
            process.exit(1);
        }

        const cookieHeader = cookiesToHeaderString(session.cookies);
        logger.info({ cookieHeader: cookieHeader.substring(0, 50) + '...' }, 'Loaded session with token');

        const allProducts = [];
        let page = 1;
        let consecutive403s = 0;
        const MAX_CONSECUTIVE_403 = 3;
        const MAX_RETRIES = parseInt(process.env.MAX_RETRIES) || 3;
        const BASE_DELAY = parseInt(process.env.BASE_DELAY) || 5000;
        const REQUEST_DELAY = parseInt(process.env.REQUEST_DELAY) || 3000;

        while (allProducts.length < limit && page <= maxPages) {
            const url = buildSearchUrl(query, page);
            logger.info({ page, url }, 'Fetching page');

            let retries = 0;
            let success = false;

            while (!success && retries < MAX_RETRIES) {
                try {
                    const response = await gotScraping.get(url, {
                        headers: {
                            cookie: cookieHeader,
                            'user-agent': session.userAgent,
                            'accept': 'application/json, text/plain, */*',
                            'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                            'referer': 'https://www.wildberries.ru/',
                            'origin': 'https://www.wildberries.ru',
                        },
                        headerGeneratorOptions: {
                            browsers: [{ name: 'chrome' }],
                        },
                        timeout: {
                            request: 15000,
                        },
                        http2: true,
                        retry: {
                            limit: 2,
                        },
                    });

                    consecutive403s = 0;

                    // Check if response is HTML instead of JSON
                    const contentType = response.headers['content-type'] || '';
                    if (contentType.includes('text/html') || response.body.trim().startsWith('<!DOCTYPE')) {
                        logger.error(
                            { page, contentType, statusCode: response.statusCode, retry: retries + 1 },
                            'Received HTML instead of JSON. Possible CAPTCHA or block.'
                        );
                        // Save HTML for debugging on first attempt
                        if (retries === 0) {
                            const debugFile = join(__dirname, `debug-page-${page}.html`);
                            await writeFile(debugFile, response.body, 'utf-8');
                            logger.warn({ file: debugFile }, 'HTML response saved for debugging');
                        }
                        throw new Error('HTML response received instead of JSON');
                    }

                    const data = JSON.parse(response.body);
                    const items = data?.products || data?.data?.products || data?.data?.items || [];

                    if (items.length === 0) {
                        logger.info({ page }, 'No more products found');
                        success = true;
                        break;
                    }

                    logger.info({ page, itemsFound: items.length }, 'Processing items');

                    let skippedCount = 0;
                    for (const item of items) {
                        const result = extractProduct(item, url);

                        if (result.success) {
                            allProducts.push(result.data);
                            logger.debug({ id: result.data.id, name: result.data.name }, 'Validated product');
                        } else {
                            skippedCount++;
                            logger.debug(
                                { id: item.id, errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`) },
                                'Product validation failed'
                            );
                        }

                        if (allProducts.length >= limit) {
                            break;
                        }
                    }

                    if (skippedCount > 0) {
                        logger.warn({ page, skipped: skippedCount, accepted: items.length - skippedCount }, 'Some products skipped');
                    }

                    logger.info({ page, totalProducts: allProducts.length }, 'Page complete');
                    success = true;
                    page++;
                    // Delay before next page
                    await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY));
                } catch (error) {
                    retries++;

                    if (error.response?.statusCode === 429 || error.message === 'HTML response received instead of JSON') {
                        const delay = BASE_DELAY * Math.pow(2, retries - 1);
                        logger.warn(
                            { page, retry: retries, maxRetries: MAX_RETRIES, delay, error: error.message },
                            'Rate limited or CAPTCHA. Retrying with exponential backoff...'
                        );
                        await new Promise((resolve) => setTimeout(resolve, delay));
                        continue;
                    }

                    if (error.response?.statusCode === 403) {
                        consecutive403s++;
                        logger.warn({ page, consecutive403s }, 'Received 403 Forbidden');

                        if (consecutive403s >= MAX_CONSECUTIVE_403) {
                            logger.error(
                                { consecutive403s },
                                'Too many consecutive 403 errors. Stopping to prevent IP ban.'
                            );
                            return;
                        }
                        const delay = BASE_DELAY * retries;
                        logger.warn({ page, retry: retries, delay }, 'Retrying after 403...');
                        await new Promise((resolve) => setTimeout(resolve, delay));
                        continue;
                    }

                    logger.error({ error: error.message, page }, 'Request failed');
                    const delay = BASE_DELAY * retries;
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }
            }

            if (!success) {
                logger.error({ page, retries }, 'Failed to fetch page after all retries');
                break;
            }
        }

        const result = allProducts.slice(0, limit);
        logger.info({ totalProducts: result.length }, 'Parsing complete');

        // Save each product to database using upsert (idempotency pattern per storage.md)
        let savedCount = 0;
        for (const product of result) {
            await prisma.product.upsert({
                where: { id: product.id },
                update: {
                    name: product.name,
                    price: product.price,
                    salePrice: product.salePrice,
                    brand: product.brand,
                    rating: product.rating,
                    reviews: product.reviews,
                    image: product.image,
                    sourceUrl: product.sourceUrl,
                },
                create: {
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    salePrice: product.salePrice,
                    brand: product.brand,
                    rating: product.rating,
                    reviews: product.reviews,
                    image: product.image,
                    sourceUrl: product.sourceUrl,
                },
            });
            savedCount++;
        }
        logger.info({ savedCount }, 'Products saved to database via upsert');

        if (process.env.OUTPUT_JSON === 'true') {
            const { writeFile } = await import('fs/promises');
            const outputFile = join(__dirname, `products-${query.replace(/\s+/g, '-')}.json`);
            await writeFile(outputFile, JSON.stringify(result, null, 2), 'utf-8');
            logger.info({ file: outputFile }, 'Exported products to JSON file');
        }
    } finally {
        await prisma.$disconnect();
        logger.info('Prisma disconnected');
    }
}

main().catch((error) => {
    logger.fatal({ error: error.message, stack: error.stack }, 'Parser crashed');
    process.exit(1);
});
