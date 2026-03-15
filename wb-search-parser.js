import { PlaywrightCrawler, Dataset } from 'crawlee';
import { z } from 'zod';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const ProductSchema = z.object({
    id: z.number(),
    name: z.string(),
    price: z.number().optional(),
    salePrice: z.number().optional(),
    brand: z.string().optional(),
    rating: z.number().optional(),
    reviews: z.number().optional(),
    image: z.string().optional().nullable(),
});

const SearchQuerySchema = z.object({
    query: z.string(),
    limit: z.number().default(100),
});

async function main() {
    const { query = 'товар', limit = 100 } = SearchQuerySchema.parse({
        query: process.argv[2] || 'товар',
        limit: parseInt(process.argv[3]) || 100,
    });

    const products = [];

    const crawler = new PlaywrightCrawler({
        launchContext: {
            launchOptions: {
                userAgent: USER_AGENT,
                headless: true,
                args: ['--disable-blink-features=AutomationControlled'],
            },
        },
        requestHandler: async ({ page, log }) => {
            const interceptedProducts = new Map();

            await page.route('**/__internal/u-search/**', async (route) => {
                try {
                    const response = await route.fetch({ maxRedirects: 0, timeout: 10000 });
                    const text = await response.text();
                    
                    try {
                        const json = JSON.parse(text);
                        const productsArray = json?.products || json?.data?.products || json?.data?.items || [];
                        
                        if (productsArray.length > 0) {
                            productsArray.forEach((p) => {
                                if (p.id && !interceptedProducts.has(p.id)) {
                                    const priceData = p.meta?.price || p.price || p.priceU;
                                    const salePriceData = p.meta?.salePrice || p.salePrice || p.salePriceU;
                                    
                                    const product = {
                                        id: p.id,
                                        name: p.name || p.title,
                                        price: priceData,
                                        salePrice: salePriceData,
                                        brand: p.brand,
                                        rating: p.reviewRating || p.rating || p.nmReviewRating,
                                        reviews: p.feedbacks || p.nmFeedbacks,
                                        image: null, // Image URLs not available in search API response
                                    };

                                    const validated = ProductSchema.safeParse(product);
                                    if (validated.success) {
                                        interceptedProducts.set(p.id, validated.data);
                                    }
                                }
                            });
                        }
                    } catch (e) {
                        // Ignore JSON parse errors
                    }

                    await route.fulfill({ response });
                } catch (e) {
                    await route.continue();
                }
            });

            await page.goto('https://www.wildberries.ru/', { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2000);

            const searchUrl = `https://www.wildberries.ru/catalog/0/search.aspx?search=${encodeURIComponent(query)}`;
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

            await page.waitForTimeout(3000);

            for (let i = 0; i < 5 && products.length < limit; i++) {
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await page.waitForTimeout(1500);
                
                products.push(...Array.from(interceptedProducts.values()));
                
                if (products.length >= limit) break;
            }

            log.info(`Intercepted ${products.length} products`);
        },

        failedRequestHandler: async ({ request, log }) => {
            log.warning(`Request failed: ${request.url}`);
        },
        maxRequestRetries: 1,
        navigationTimeoutSecs: 60,
    });

    await crawler.run(['https://www.wildberries.ru/']);

    const result = products.slice(0, limit);
    console.log(JSON.stringify(result, null, 2));

    await Dataset.pushData(result);
}

main().catch(console.error);
