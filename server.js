import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pino from 'pino';
import { spawn, exec } from 'child_process';
import 'dotenv/config';
import { PrismaClient } from './generated/prisma/client.ts';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import ExcelJS from 'exceljs';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create logger
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
                    destination: 1,
                },
            },
            {
                target: 'pino/file',
                options: {
                    destination: join(__dirname, 'logs', 'server.log'),
                },
            },
        ],
    },
});

// Initialize Prisma Client with LibSQL adapter
const libsql = new PrismaLibSql({
    url: process.env.DATABASE_URL || 'file:database.db',
});
const prisma = new PrismaClient({
    adapter: libsql,
});

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Global state for tracking process status
/** @type {{ status: 'idle' | 'running', job: null | 'miner' | 'parser', pid: number | null, startTime: string | null }} */
let currentStatus = {
    status: 'idle',
    job: null,
    pid: null,
    startTime: null,
};

// Middleware
app.use(express.json());

// Serve static files from public directory
app.use(express.static(join(__dirname, 'public')));

// Middleware to add cache-control headers to all API responses
app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

// Basic health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET /api/status - Return current process status
app.get('/api/status', (req, res) => {
    res.json(currentStatus);
});

// GET /api/logs - Return last 100 lines from app.log
app.get('/api/logs', (req, res) => {
    const logPath = join(__dirname, 'logs', 'app.log');
    
    try {
        if (!fs.existsSync(logPath)) {
            return res.json({ lines: [], error: null });
        }
        
        const content = fs.readFileSync(logPath, 'utf-8');
        const allLines = content.split('\n').filter(line => line.trim() !== '');
        const lastLines = allLines.slice(-100);
        
        res.json({ lines: lastLines, error: null });
    } catch (error) {
        logger.error({ error: error.message }, 'Failed to read logs');
        res.status(500).json({ lines: [], error: error.message });
    }
});

// POST /api/miner/start - Start miner.js
app.post('/api/miner/start', (req, res) => {
    if (currentStatus.status === 'running') {
        logger.warn({ currentJob: currentStatus.job }, 'Conflict: Process already running');
        return res.status(409).json({
            error: 'Conflict',
            message: `Another process (${currentStatus.job}) is already running`,
            currentStatus,
        });
    }

    logger.info('Starting miner.js');

    const child = spawn('node', [join(__dirname, 'jobs', 'miner.js')], {
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    currentStatus = {
        status: 'running',
        job: 'miner',
        pid: child.pid,
        startTime: new Date().toISOString(),
    };

    logger.info({ pid: child.pid }, 'Miner process started');

    // Handle stdout
    child.stdout.on('data', (data) => {
        logger.info({ job: 'miner', output: data.toString().trim() }, 'Miner output');
    });

    // Handle stderr
    child.stderr.on('data', (data) => {
        logger.warn({ job: 'miner', output: data.toString().trim() }, 'Miner error');
    });

    // Handle process close
    child.on('close', (code) => {
        logger.info({ job: 'miner', exitCode: code }, 'Miner process finished');
        currentStatus = {
            status: 'idle',
            job: null,
            pid: null,
            startTime: null,
        };
    });

    // Handle process error
    child.on('error', (error) => {
        logger.error({ job: 'miner', error: error.message }, 'Miner process error');
        currentStatus = {
            status: 'idle',
            job: null,
            pid: null,
            startTime: null,
        };
    });

    res.json({
        message: 'Miner started',
        pid: child.pid,
        startTime: currentStatus.startTime,
    });
});

// POST /api/parser/start - Start parser.js with optional parameters
app.post('/api/parser/start', (req, res) => {
    if (currentStatus.status === 'running') {
        logger.warn({ currentJob: currentStatus.job }, 'Conflict: Process already running');
        return res.status(409).json({
            error: 'Conflict',
            message: `Another process (${currentStatus.job}) is already running`,
            currentStatus,
        });
    }

    const { query = 'товар', limit = 100 } = req.body || {};

    logger.info({ query, limit }, 'Starting parser.js');

    const child = spawn('node', [join(__dirname, 'jobs', 'parser.js'), query, limit.toString()], {
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    currentStatus = {
        status: 'running',
        job: 'parser',
        pid: child.pid,
        startTime: new Date().toISOString(),
    };

    logger.info({ pid: child.pid }, 'Parser process started');

    // Handle stdout
    child.stdout.on('data', (data) => {
        logger.info({ job: 'parser', output: data.toString().trim() }, 'Parser output');
    });

    // Handle stderr
    child.stderr.on('data', (data) => {
        logger.warn({ job: 'parser', output: data.toString().trim() }, 'Parser error');
    });

    // Handle process close
    child.on('close', (code) => {
        logger.info({ job: 'parser', exitCode: code }, 'Parser process finished');
        currentStatus = {
            status: 'idle',
            job: null,
            pid: null,
            startTime: null,
        };
    });

    // Handle process error
    child.on('error', (error) => {
        logger.error({ job: 'parser', error: error.message }, 'Parser process error');
        currentStatus = {
            status: 'idle',
            job: null,
            pid: null,
            startTime: null,
        };
    });

    res.json({
        message: 'Parser started',
        pid: child.pid,
        startTime: currentStatus.startTime,
        params: { query, limit },
    });
});

/**
 * Convert UTC date to Moscow time (UTC+3) and format as DD.MM.YYYY HH:mm:ss
 * @param {Date|string|number} date - UTC date to convert
 * @returns {string}
 */
function formatMoscowTime(date) {
    if (!date) return '';

    const utcDate = new Date(date);
    const moscowOffset = 3 * 60 * 60 * 1000;
    const moscowTime = new Date(utcDate.getTime() + moscowOffset);

    const day = String(moscowTime.getUTCDate()).padStart(2, '0');
    const month = String(moscowTime.getUTCMonth() + 1).padStart(2, '0');
    const year = moscowTime.getUTCFullYear();
    const hours = String(moscowTime.getUTCHours()).padStart(2, '0');
    const minutes = String(moscowTime.getUTCMinutes()).padStart(2, '0');
    const seconds = String(moscowTime.getUTCSeconds()).padStart(2, '0');

    return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
}

/**
 * Generate timestamp for filename
 * @returns {string}
 */
function generateFilenameTimestamp() {
    const now = new Date();
    const moscowOffset = 3 * 60 * 60 * 1000;
    const moscowTime = new Date(now.getTime() + moscowOffset);

    const year = moscowTime.getUTCFullYear();
    const month = String(moscowTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(moscowTime.getUTCDate()).padStart(2, '0');
    const hours = String(moscowTime.getUTCHours()).padStart(2, '0');
    const minutes = String(moscowTime.getUTCMinutes()).padStart(2, '0');
    const seconds = String(moscowTime.getUTCSeconds()).padStart(2, '0');

    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

// GET /api/export/excel - Export products to Excel file
app.get('/api/export/excel', async (req, res) => {
    try {
        logger.info('Starting Excel export via API...');

        // Fetch all products from database
        const products = await prisma.product.findMany({
            orderBy: { updatedAt: 'desc' },
        });

        logger.info({ count: products.length }, 'Products fetched for export');

        if (products.length === 0) {
            logger.warn('No products found for export');
            return res.status(404).json({ error: 'No data to export' });
        }

        // Create workbook and worksheet
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'WB Parser';
        workbook.created = new Date();

        const worksheet = workbook.addWorksheet('Товары');

        // Define columns
        worksheet.columns = [
            { header: 'Артикул', key: 'id', width: 15 },
            { header: 'Название', key: 'name', width: 50 },
            { header: 'Базовая цена', key: 'price', width: 15 },
            { header: 'Цена со скидкой', key: 'salePrice', width: 15 },
            { header: 'Бренд', key: 'brand', width: 25 },
            { header: 'Рейтинг', key: 'rating', width: 12 },
            { header: 'Отзывы', key: 'reviews', width: 12 },
            { header: 'Ссылка на фото', key: 'image', width: 40 },
            { header: 'Ссылка на источник', key: 'sourceUrl', width: 40 },
            { header: 'Создан (МСК)', key: 'createdAt', width: 22 },
            { header: 'Обновлен (МСК)', key: 'updatedAt', width: 22 },
        ];

        // Style header row
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, size: 12 };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4472C4' },
        };
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

        // Add data rows
        products.forEach((product) => {
            worksheet.addRow({
                id: product.id,
                name: product.name,
                price: product.price !== null ? `${product.price.toFixed(2)} ₽` : '',
                salePrice: product.salePrice !== null ? `${product.salePrice.toFixed(2)} ₽` : '',
                brand: product.brand || '',
                rating: product.rating !== null ? product.rating.toFixed(1) : '',
                reviews: product.reviews || 0,
                image: product.image || '',
                sourceUrl: product.sourceUrl,
                createdAt: formatMoscowTime(product.createdAt),
                updatedAt: formatMoscowTime(product.updatedAt),
            });
        });

        // Style data rows
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                row.alignment = { vertical: 'middle', wrapText: true };
                row.height = 40;

                if (rowNumber % 2 === 0) {
                    row.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFF2F2F2' },
                    };
                }
            }
        });

        // Auto-filter on header row
        worksheet.autoFilter = 'A1:K1';

        // Generate filename with timestamp
        const timestamp = generateFilenameTimestamp();
        const filename = `wildberries_report_${timestamp}.xlsx`;

        // Write to buffer and send
        logger.info({ filename }, 'Generating Excel file in memory...');
        const buffer = await workbook.xlsx.writeBuffer();

        // Set headers for file download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        logger.info({ filename, totalProducts: products.length }, 'Excel export completed');
        res.send(buffer);
    } catch (error) {
        logger.error({ error: error.message, stack: error.stack }, 'Excel export failed');
        res.status(500).json({ error: 'Export failed', message: error.message });
    }
});

// POST /api/prisma/studio - Launch Prisma Studio
app.post('/api/prisma/studio', (req, res) => {
    logger.info('Launching Prisma Studio...');

    const databaseUrl = process.env.DATABASE_URL || 'file:database.db';
    
    exec(`npx prisma studio --url "${databaseUrl}"`, (error, stdout, stderr) => {
        if (error) {
            logger.error({ error: error.message }, 'Failed to launch Prisma Studio');
            return res.status(500).json({ error: 'Failed to launch Prisma Studio', message: error.message });
        }

        logger.info('Prisma Studio launched successfully');
        res.json({ message: 'Prisma Studio launched', url: 'http://localhost:5555' });
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
    logger.error({ error: err.message, stack: err.stack }, 'Express error');
    res.status(500).json({ error: 'Internal Server Error' });
});

// Start server
app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Server started on http://localhost:' + PORT);
});

export default app;
