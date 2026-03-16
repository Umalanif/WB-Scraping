# Wildberries Hybrid Parser (Crawlee + Got + Prisma)

Enterprise-grade Wildberries.ru parser with two-stage architecture and persistent data storage.

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   miner.js      │────▶│   session.json   │────▶│   parser.js     │
│ PlaywrightCrawler│     │ (User-Agent +    │     │ got-scraping +  │
│ + Anti-Bot      │     │  Cookies + Token)│     │ Prisma + Zod    │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │  SQLite (Prisma)│
                                                 │  storage/dev.db │
                                                 └─────────────────┘
```

### Components

| Module | Technology | Purpose |
|--------|-----------|------------|
| **miner.js** | PlaywrightCrawler | Bypass WB protection, extract session (cookies + x_wbaas_token) |
| **parser.js** | got-scraping | High-speed data collection via hidden API |
| **schemas.js** | Zod | Data validation (Gatekeeper pattern) |
| **utils/wb-image.js** | Custom | Generate WB image URLs from product IDs |
| **storage** | Prisma + SQLite | Persistent storage with Upsert and Audit Trail |

## 📋 Requirements

- Node.js 18+
- npm

## 🚀 Installation

### 1. Install dependencies

```bash
npm install
```

### 2. Setup environment

```bash
# Copy environment configuration
copy .env.example .env
```

Edit `.env` as needed:

```env
# Database (Prisma + SQLite)
DATABASE_URL="file:./storage/dev.db"

# Browser mode in miner.js (true/false)
HEADLESS=true

# Maximum pages to parse
MAX_PAGES=5

# Export to JSON (true/false)
OUTPUT_JSON=false

# Retry settings for rate limiting
MAX_RETRIES=3
BASE_DELAY=5000
REQUEST_DELAY=3000

# Log level: fatal, error, warn, info, debug, trace
LOG_LEVEL=info
```

### 3. Initialize database

```bash
# Apply schema to SQLite and generate client
npx prisma db push
npx prisma generate
```

## 📖 Usage

### Step 1: Extract Session (miner.js)

Launches browser in headless mode, bypasses WB protection, extracts cookies and `x_wbaas_token`.

```bash
# Headless mode (default)
npm run miner

# Visible browser (for debugging)
cross-env HEADLESS=false npm run miner

# Direct execution
node miner.js
```

**Result:** `session.json` file with User-Agent and cookies.

### Step 2: Parse Data (parser.js)

Uses session to make requests to hidden `search.wb.ru` API.

```bash
# Default parsing (query: "товар", limit: 100)
npm run parser

# With JSON export
npm run parser:json

# Custom query and limit
node parser.js "кроссовки" 50

# Custom query with JSON export
cross-env OUTPUT_JSON=true node parser.js "кроссовки" 50
```

**Result:** Data saved to SQLite (`storage/dev.db`) and/or exported to JSON.

## 📁 Project Structure

```
WB/
├── miner.js                  # Session extractor (PlaywrightCrawler)
├── parser.js                 # Main parser (got-scraping + Prisma)
├── schemas.js                # Zod validation schemas
├── utils/
│   └── wb-image.js           # WB image URL generator
├── prisma/
│   └── schema.prisma         # Database schema
├── storage/
│   └── dev.db                # SQLite database (gitignored)
├── .env                      # Environment configuration (gitignored)
├── .env.example              # Example configuration
├── session.json              # Saved session (gitignored)
├── .gitignore
├── package.json
└── README.md
```

## 🔧 Architecture Details

### miner.js

- Uses `PlaywrightCrawler` from Crawlee
- Controls `headless` via `process.env.HEADLESS`
- Extracts cookies via `page.context().cookies()`
- Searches for `x_wbaas_token` in cookies
- Saves session to `session.json`
- Graceful shutdown via `crawler.teardown()`

### parser.js

- Uses `got-scraping` for direct API requests
- Reads session from `session.json`
- Builds Cookie header from saved cookies
- Validates each product through Zod schema (`safeParse`)
- Writes to SQLite via `prisma.product.upsert` (Idempotency)
- Handles 429 (exponential backoff) and 403 (stop after 3 consecutive)

### schemas.js

- `ProductSchema` — product validation
- `SessionSchema` — session validation
- `validateProduct()` — gatekeeper function
- `validateSession()` — session gatekeeper
- `cookiesToHeaderString()` — Cookie header utility

### utils/wb-image.js

- `generateWbImageUrl(id, size)` — generates WB CDN image URLs
- Supports multiple size variants: `big`, `tm`, `c246x328`, etc.
- Uses mathematical distribution across CDN baskets

### Database (Prisma Schema)

```prisma
model Product {
  id        Int      @id @unique // WB article ID
  name      String
  price     Float?
  salePrice Float?
  brand     String?
  rating    Float?
  reviews   Int?
  image     String?

  // Audit Trail
  sourceUrl String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## 🛡️ Anti-Bot Tactics

1. **DevTools First** — uses hidden `search.wb.ru` API
2. **Stealth** — Playwright with real browser emulation
3. **Rate Limiting** — exponential backoff on 429
4. **403 Protection** — stops after 3 consecutive 403 errors
5. **Fingerprinting** — saves real User-Agent and cookies

## 📊 Data Validation (Zod Gatekeeper)

All data passes strict validation before database write:

```javascript
const result = ProductSchema.safeParse(product);
if (result.success) {
    await prisma.product.upsert({
        where: { id: product.id },
        update: product,
        create: { ...product, sourceUrl: url }
    });
} else {
    logger.warn({ errors: result.error.errors }, 'Validation failed');
}
```

## 📝 Sample Data

```json
{
  "id": 123456789,
  "name": "Кроссовки мужские спортивные",
  "price": 5999,
  "salePrice": 3499,
  "brand": "Nike",
  "rating": 4.8,
  "reviews": 1250,
  "image": "https://basket-01.wbbasket.ru/vol1234/part123456/123456789/images/big/1.webp",
  "sourceUrl": "https://www.wildberries.ru/catalog/123456789/detail.aspx",
  "createdAt": "2026-03-15T10:30:00.000Z",
  "updatedAt": "2026-03-15T10:30:00.000Z"
}
```

## 🔍 Troubleshooting

### miner.js doesn't find x_wbaas_token

- Increase timeout wait
- Run with `HEADLESS=false` for visual debugging
- Check if WB requires captcha

### parser.js gets 403

- Run `miner.js` again for fresh session
- Reduce `MAX_PAGES`
- Check IP for blocks

### Rate Limit (429)

- Parser automatically retries with exponential backoff
- Increase `BASE_DELAY` and `REQUEST_DELAY` in `.env`

### Prisma Errors

```bash
# Regenerate client
npx prisma generate

# Apply schema to database
npx prisma db push
```

## 📄 License

ISC
