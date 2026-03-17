import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';
import pino from 'pino';
import { PrismaClient } from './generated/prisma/client.ts';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import 'dotenv/config';

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
        ],
    },
});

// Initialize Prisma with LibSQL adapter
const libsql = new PrismaLibSql({
    url: process.env.DATABASE_URL || 'file:database.db',
});
const prisma = new PrismaClient({
    adapter: libsql,
});

/**
 * Convert UTC date to Moscow time (UTC+3) and format as DD.MM.YYYY HH:mm:ss
 * @param {Date|string|number} date - UTC date to convert
 * @returns {string}
 */
function formatMoscowTime(date) {
    if (!date) return '';
    
    const utcDate = new Date(date);
    
    // Convert to Moscow time (UTC+3)
    const moscowOffset = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
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

async function main() {
    try {
        logger.info('Starting Excel export...');
        
        // Fetch all products from database
        logger.info('Fetching products from database...');
        const products = await prisma.product.findMany({
            orderBy: { createdAt: 'desc' },
        });
        
        logger.info({ count: products.length }, 'Products fetched from database');
        
        if (products.length === 0) {
            logger.warn('No products found in database. Nothing to export.');
            await prisma.$disconnect();
            process.exit(0);
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
                
                // Alternate row colors for better readability
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
        worksheet.autoFilter = `A1:K1`;
        
        // Create exports directory
        const exportsDir = join(__dirname, 'exports');
        mkdirSync(exportsDir, { recursive: true });
        
        // Generate filename with timestamp
        const timestamp = generateFilenameTimestamp();
        const filename = `wildberries_report_${timestamp}.xlsx`;
        const filepath = join(exportsDir, filename);
        
        // Write file
        logger.info({ filepath }, 'Writing Excel file...');
        await workbook.xlsx.writeFile(filepath);
        
        logger.info(
            { filepath, totalProducts: products.length, file: filename },
            'Excel export completed successfully'
        );
        
        await prisma.$disconnect();
        logger.info('Export finished');
        process.exit(0);
    } catch (error) {
        logger.fatal({ error: error.message, stack: error.stack }, 'Export failed');
        await prisma.$disconnect().catch(() => {});
        process.exit(1);
    }
}

main();
