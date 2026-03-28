import { z } from 'zod';

/**
 * @typedef {Object} Product
 * @property {number} id - Wildberries product ID
 * @property {string} name - Product name/title
 * @property {number} [price] - Original price in rubles
 * @property {number} [salePrice] - Sale price in rubles
 * @property {string} [brand] - Product brand
 * @property {number} [rating] - Product rating (0-5)
 * @property {number} [reviews] - Number of reviews
 * @property {string|null} [image] - Product image URL
 * @property {string} sourceUrl - Source URL for Audit Trail (per storage.md)
 */

/**
 * @typedef {Object} SessionData
 * @property {string} userAgent - User-Agent string
 * @property {Array<{name: string, value: string, domain?: string, path?: string}>} cookies - Array of cookie objects
 */

export const ProductSchema = z.object({
    id: z.number(),
    name: z.string().trim().min(1),
    price: z.number().optional(),
    salePrice: z.number().optional(),
    brand: z.string().trim().optional(),
    rating: z.number().optional(),
    reviews: z.number().optional(),
    // Разрешаем null — товар без изображения всё равно сохраняется
    image: z.string().nullable().optional().default(null),
    sourceUrl: z.string().url(), // Audit Trail field (per storage.md)
});

export const SessionSchema = z.object({
    userAgent: z.string().min(1),
    cookies: z.array(
        z.object({
            name: z.string(),
            value: z.string(),
            domain: z.string().optional(),
            path: z.string().optional(),
        })
    ),
});

/**
 * Validates and cleans product data
 * @param {unknown} data - Raw product data to validate
 * @returns {{ success: boolean, data?: Product, error?: z.ZodError }}
 */
export function validateProduct(data) {
    return ProductSchema.safeParse(data);
}

/**
 * Validates session data
 * @param {unknown} data - Raw session data to validate
 * @returns {{ success: boolean, data?: SessionData, error?: z.ZodError }}
 */
export function validateSession(data) {
    return SessionSchema.safeParse(data);
}

/**
 * Converts cookie array to Cookie header string
 * @param {Array<{name: string, value: string}>} cookies
 * @returns {string}
 */
export function cookiesToHeaderString(cookies) {
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

/**
 * Schema for SKU array validation (Express API input)
 * Accepts array of numbers or numeric strings
 */
export const SkuArraySchema = z.array(
    z.union([
        z.number(),
        z.string().regex(/^\d+$/).transform((val) => parseInt(val, 10)),
    ])
).min(1).max(100); // 1-100 SKUs per request

/**
 * Validates SKU array input
 * @param {unknown} data - Raw data to validate
 * @returns {{ success: boolean, data?: number[], error?: z.ZodError }}
 */
export function validateSkuArray(data) {
    return SkuArraySchema.safeParse(data);
}
