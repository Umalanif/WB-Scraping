import { gotScraping } from 'got-scraping';
import { Dataset } from 'crawlee';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pino from 'pino';
import { validateProduct, cookiesToHeaderString, SessionSchema } from './schemas.js';

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
 * @returns {{ success: boolean, data?: Product }}
 */
function extractProduct(item) {
    const priceData = item.price?.total?.sum || item.price?.sale?.sum || item.priceU;
    const salePriceData = item.price?.sale?.sum || item.salePriceU;

    const product = {
        id: item.id,
        name: item.name || item.title || '',
        price: priceData ? Number(priceData) / 100 : undefined,
        salePrice: salePriceData ? Number(salePriceData) / 100 : undefined,
        brand: item.brand?.name || item.brand || undefined,
        rating: item.reviewRating || item.rating || item.nmReviewRating,
        reviews: item.feedbacks || item.nmFeedbacks || 0,
        image: item.image?.url || item.imageU || null,
    };

    return validateProduct(product);
}

async function main() {
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

    while (allProducts.length < limit && page <= maxPages) {
        const url = buildSearchUrl(query, page);
        logger.info({ page, url }, 'Fetching page');

        try {
            const response = await gotScraping.get(url, {
                headers: {
                    cookie: cookieHeader,
                    'user-agent': session.userAgent,
                    'accept': 'application/json, text/plain, */*',
                    'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
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

            const data = JSON.parse(response.body);
            const items = data?.products || data?.data?.products || data?.data?.items || [];

            if (items.length === 0) {
                logger.info({ page }, 'No more products found');
                break;
            }

            logger.info({ page, itemsFound: items.length }, 'Processing items');

            for (const item of items) {
                const result = extractProduct(item);

                if (result.success) {
                    allProducts.push(result.data);
                    logger.debug({ id: result.data.id, name: result.data.name }, 'Validated product');
                } else {
                    logger.warn(
                        { id: item.id, errors: result.error.errors },
                        'Product validation failed'
                    );
                }

                if (allProducts.length >= limit) {
                    break;
                }
            }

            logger.info({ page, totalProducts: allProducts.length }, 'Page complete');
            page++;

            await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
            if (error.response?.statusCode === 429) {
                logger.error('Rate limited (429). Throwing for Crawlee retry mechanism.');
                throw new Error('Rate Limited');
            }

            if (error.response?.statusCode === 403) {
                consecutive403s++;
                logger.warn({ consecutive403s }, 'Received 403 Forbidden');

                if (consecutive403s >= MAX_CONSECUTIVE_403) {
                    logger.error(
                        { consecutive403s },
                        'Too many consecutive 403 errors. Stopping to prevent IP ban.'
                    );
                    break;
                }
                continue;
            }

            logger.error({ error: error.message, page }, 'Request failed');
            page++;
        }
    }

    const result = allProducts.slice(0, limit);
    logger.info({ totalProducts: result.length }, 'Parsing complete');

    await Dataset.pushData(result);
    logger.info(`Saved ${result.length} products to Dataset`);

    if (process.env.OUTPUT_JSON === 'true') {
        const { writeFile } = await import('fs/promises');
        const outputFile = join(__dirname, `products-${query.replace(/\s+/g, '-')}.json`);
        await writeFile(outputFile, JSON.stringify(result, null, 2), 'utf-8');
        logger.info({ file: outputFile }, 'Exported products to JSON file');
    }
}

main().catch((error) => {
    logger.fatal({ error: error.message, stack: error.stack }, 'Parser crashed');
    process.exit(1);
});
