/**
 * Generates a direct Wildberries product image URL (Updated: March 2026).
 * Uses mathematical distribution across CDN servers (baskets) based on product ID.
 *
 * @param {number} id - Product article ID (nmId). Must be a positive integer.
 * @param {'big'|'tm'|'c246x328'|'c516x688'|'tm_retina'|'max'} [size='big'] - Image size variant.
 * @returns {string|null} Full URL to .webp image, or null if ID is invalid.
 */
export function generateWbImageUrl(id, size = 'big') {
    if (!id || typeof id !== 'number' || id <= 0) {
        return null;
    }

    const vol = Math.floor(id / 100000);
    const part = Math.floor(id / 1000);
    let basket = '01';

    // Basket ranges based on ID volume (Updated: March 2026)
    // Note: WB dynamically redistributes products, so ranges are approximate
    if (vol <= 143) basket = '01';
    else if (vol <= 287) basket = '02';
    else if (vol <= 431) basket = '03';
    else if (vol <= 719) basket = '04';
    else if (vol <= 1007) basket = '05';
    else if (vol <= 1061) basket = '06';
    else if (vol <= 1115) basket = '07';
    else if (vol <= 1169) basket = '08';
    else if (vol <= 1313) basket = '09';
    else if (vol <= 1601) basket = '10';
    else if (vol <= 1655) basket = '11';
    else if (vol <= 1919) basket = '12';
    else if (vol <= 2045) basket = '13';
    else if (vol <= 2189) basket = '14';
    else if (vol <= 2405) basket = '15';
    else if (vol <= 2621) basket = '16';
    else if (vol <= 2837) basket = '17';
    else if (vol <= 3053) basket = '18';
    else if (vol <= 3269) basket = '19';
    else if (vol <= 3701) basket = '20';
    else if (vol <= 4133) basket = '21';
    else if (vol <= 4565) basket = '22';
    else if (vol <= 4997) basket = '23';
    else if (vol <= 5429) basket = '24';
    else if (vol <= 5645) basket = '25';
    else basket = '26';

    // All baskets use .ru domain (baskets 21+ on .net return 404)
    const domain = 'wbbasket.ru';

    return `https://basket-${basket}.${domain}/vol${vol}/part${part}/${id}/images/${size}/1.webp`;
}
