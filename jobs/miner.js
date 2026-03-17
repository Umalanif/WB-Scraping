import { PlaywrightCrawler } from 'crawlee';
import { writeFile, readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pino from 'pino';
import { parentPort } from 'worker_threads';
import { validateSession } from '../schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create logger with job tag for log traceability
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
        },
    },
}).child({ job: 'miner' });

const SESSION_FILE = join(__dirname, '..', 'session.json');
const WB_URL = 'https://www.wildberries.ru/';

/**
 * @typedef {import('../schemas.js').SessionData} SessionData
 */

/**
 * Saves session data to disk
 * @param {SessionData} sessionData
 * @returns {Promise<void>}
 */
async function saveSession(sessionData) {
    await writeFile(SESSION_FILE, JSON.stringify(sessionData, null, 2), 'utf-8');
    logger.info({ file: SESSION_FILE }, 'Session saved to file');
}

/**
 * Loads session data from disk
 * @returns {Promise<SessionData|null>}
 */
async function loadSession() {
    try {
        const content = await readFile(SESSION_FILE, 'utf-8');
        return JSON.parse(content);
    } catch {
        return null;
    }
}

/**
 * Checks if existing session is valid and has x_wbaas_token
 * @param {SessionData} session
 * @returns {Promise<boolean>}
 */
async function hasValidSession(session) {
    const validated = validateSession(session);
    if (!validated.success) {
        return false;
    }
    return session.cookies.some((c) => c.name === 'x_wbaas_token');
}

async function main() {
    const headless = process.env.HEADLESS === 'true';
    logger.info({ headless }, 'Starting Miner with configuration');

    const existingSession = await loadSession();
    if (existingSession && await hasValidSession(existingSession)) {
        logger.info('Valid session with x_wbaas_token already exists. Skipping mining.');
        parentPort.postMessage('done');
        process.exit(0);
    }

    logger.warn('No valid session found. Starting session mining...');

    let crawler = null;

    // Graceful shutdown handler
    parentPort.on('message', async (message) => {
        if (message === 'cancel') {
            logger.warn('Received cancel signal. Shutting down...');
            if (crawler) {
                await crawler.teardown();
            }
            parentPort.postMessage('done');
            process.exit(0);
        }
    });

    crawler = new PlaywrightCrawler({
        headless,
        launchContext: {
            launchOptions: {
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                ],
            },
        },
        navigationTimeoutSecs: 30,
        requestHandler: async ({ page, request, log }) => {
            log.info({ url: request.url }, 'Processing request');

            try {
                await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
                await page.waitForTimeout(2000);

                const cookies = await page.context().cookies();
                const userAgent = await page.evaluate(() => navigator.userAgent);

                log.info({ cookiesCount: cookies.length, userAgent }, 'Extracted browser fingerprint');

                const xWbaasToken = cookies.find((c) => c.name === 'x_wbaas_token');

                if (xWbaasToken) {
                    const sessionData = {
                        userAgent,
                        cookies,
                    };

                    const validated = validateSession(sessionData);
                    if (validated.success) {
                        await saveSession(sessionData);
                        log.info({ token: xWbaasToken.value.substring(0, 10) + '...' }, 'Found x_wbaas_token');

                        logger.info('Session mining complete. Shutting down crawler...');
                        await crawler.teardown();
                        parentPort.postMessage('done');
                        process.exit(0);
                    } else {
                        log.error({ errors: validated.error.errors }, 'Session validation failed');
                    }
                } else {
                    log.warn('x_wbaas_token not found in cookies. Continuing to wait...');

                    const allCookies = await page.context().cookies();
                    log.info(
                        { availableCookies: allCookies.map((c) => c.name) },
                        'Available cookies'
                    );
                }
            } catch (error) {
                log.error({ error: error.message }, 'Error extracting session');
            }
        },
        failedRequestHandler: async ({ request, log }) => {
            log.error({ url: request.url }, 'Request failed');
        },
        maxRequestRetries: 2,
    });

    try {
        await crawler.run([WB_URL]);

        const finalSession = await loadSession();
        if (!finalSession || !finalSession.cookies.some((c) => c.name === 'x_wbaas_token')) {
            logger.error('Failed to extract x_wbaas_token after all attempts');
            parentPort.postMessage('done');
            process.exit(1);
        }

        logger.info('Miner completed successfully');
        parentPort.postMessage('done');
        process.exit(0);
    } catch (error) {
        logger.error({ error: error.message }, 'Miner crashed');
        parentPort.postMessage('done');
        process.exit(1);
    }
}

main().catch((error) => {
    logger.fatal({ error: error.message, stack: error.stack }, 'Unhandled exception');
    parentPort.postMessage('done');
    process.exit(1);
});
