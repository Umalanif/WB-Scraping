import Bree from 'bree';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pino from 'pino';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure logs directory exists
const logsDir = join(__dirname, 'logs');
mkdirSync(logsDir, { recursive: true });

// Create logger with file output
const logger = pino({
    timestamp: pino.stdTimeFunctions.isoTime,
    level: process.env.LOG_LEVEL || 'info',
    transport: {
        targets: [
            {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'SYS:standard',
                    destination: 1, // stdout
                },
            },
            {
                target: 'pino/file',
                options: {
                    destination: join(logsDir, 'app.log'),
                },
            },
        ],
    },
});

// Create Bree instance
const bree = new Bree({
    root: join(__dirname, 'jobs'),
    defaultExtension: process.env.BREE_EXTENSION || 'js',
    logger,
    outputWorkerMetadata: true,
    jobs: [
        {
            name: 'miner',
            interval: '1h', // Run every hour
            runOnInit: true, // Run immediately on startup
        },
        {
            name: 'parser',
            interval: '15m', // Run every 15 minutes
            runOnInit: false, // Don't run immediately
            delay: '3m', // First run after 3 minutes (wait for miner to complete)
        },
    ],
    maxWorkers: 2, // Limit concurrency to prevent RAM exhaustion with Playwright
});

// Graceful shutdown handler
async function gracefulShutdown(signal) {
    logger.info({ signal }, 'Received shutdown signal. Stopping Bree...');
    await bree.stop();
    logger.info('All workers stopped. Exiting...');
    process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Error handlers
process.on('uncaughtException', (error) => {
    logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception');
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.fatal({ reason, promise }, 'Unhandled rejection');
    process.exit(1);
});

// Main entry point
async function main() {
    try {
        logger.info('Starting Bree scheduler...');
        await bree.start();
        logger.info('Bree scheduler started successfully');
        logger.info(
            { jobs: bree.config.jobs.map((j) => ({ name: j.name, interval: j.interval, runOnInit: j.runOnInit })) },
            'Scheduled jobs'
        );
    } catch (error) {
        logger.fatal({ error: error.message, stack: error.stack }, 'Failed to start Bree');
        process.exit(1);
    }
}

main();
