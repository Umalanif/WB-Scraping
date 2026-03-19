# Wildberries Parser (WB-Scraping)

Professional-grade Wildberries.ru data extraction tool with a two-stage architecture, persistent storage, and web UI for control.

![License](https://img.shields.io/badge/license-ISC-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D18-green.svg)
![Prisma](https://img.shields.io/badge/prisma-7.5.0-blue.svg)

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           WB Parser System                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐     ┌──────────────────┐     ┌─────────────────────────┐  │
│  │   miner.js   │────▶│   session.json   │────▶│      parser.js          │  │
│  │ Playwright   │     │ (User-Agent +    │     │  got-scraping + Zod     │  │
│  │ + Anti-Bot   │     │  Cookies + Token)│     │  + Prisma ORM           │  │
│  └──────────────┘     └──────────────────┘     └───────────┬─────────────┘  │
│                                                            │                 │
│                                                            ▼                 │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        Data Storage Layer                             │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐   │   │
│  │  │  SQLite (dev.db)│  │  Excel Export   │  │  JSON Export        │   │   │
│  │  │  (Prisma ORM)   │  │  (ExcelJS)      │  │  (Optional)         │   │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    Web UI (server.js)                                │   │
│  │  - Control Panel (Start/Stop jobs)                                   │   │
│  │  - Real-time Log Viewer                                              │   │
│  │  - Excel Export                                                      │   │
│  │  - Prisma Studio Integration                                         │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Core Components

| Module | Technology | Purpose |
|--------|-----------|---------|
| **miner.js** | PlaywrightCrawler (Crawlee) | Bypass WB protection, extract session (cookies + x_wbaas_token) |
| **parser.js** | got-scraping | High-speed data collection via hidden WB API |
| **server.js** | Express.js | Web UI for job control, log viewing, and data export |
| **index.js** | Bree | Job scheduler for automated runs |
| **schemas.js** | Zod | Runtime data validation (Gatekeeper pattern) |
| **utils/wb-image.js** | Custom | Generate WB CDN image URLs from product IDs |
| **prisma/schema.prisma** | Prisma ORM | SQLite database schema with audit trail |

## 📋 Requirements

- **Node.js** 18 or higher
- **npm** (comes with Node.js)
- **Git** (for cloning the repository)

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/Umalanif/WB-Scraping.git
cd WB-Scraping
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Environment

```bash
# Copy environment configuration template
copy .env.example .env
```

Edit `.env` file to configure:

```env
# Database (Prisma + SQLite)
DATABASE_URL="file:./storage/dev.db"

# Browser mode in miner.js (true = headless, false = visible for debugging)
HEADLESS=true

# Maximum pages to parse per query
MAX_PAGES=5

# Export to JSON (true/false)
OUTPUT_JSON=false

# Rate limiting settings
MAX_RETRIES=3
BASE_DELAY=5000
REQUEST_DELAY=3000

# Log level: fatal, error, warn, info, debug, trace
LOG_LEVEL=info
```

### 4. Initialize Database

```bash
# Apply schema to SQLite and generate Prisma client
npx prisma db push
npx prisma generate
```

## 📖 Usage

### Mode 1: Manual Execution (Recommended for Beginners)

#### Step 1: Extract Session (miner.js)

Launches a headless browser to bypass Wildberries protection and extract authentication tokens.

```bash
# Headless mode (default, no visible browser)
npm run miner

# Visible browser (for debugging)
cross-env HEADLESS=false npm run miner

# Direct execution
node jobs/miner.js
```

**Result:** `session.json` file containing User-Agent and cookies (including `x_wbaas_token`).

#### Step 2: Parse Data (parser.js)

Uses the extracted session to make requests to the hidden `search.wb.ru` API.

```bash
# Default parsing (query: "товар", limit: 100)
npm run parser

# With JSON export enabled
npm run parser:json

# Custom query and limit
node jobs/parser.js "кроссовки" 50

# Custom query with JSON export
cross-env OUTPUT_JSON=true node jobs/parser.js "кроссовки" 50
```

**Result:** Data saved to SQLite (`storage/dev.db`) and optionally exported to JSON.

### Mode 2: Web UI Control Panel (Recommended for Regular Use)

Start the web server for a graphical interface:

```bash
npm run ui
```

Then open your browser to: **http://localhost:3000**

#### Web UI Features:

1. **Miner Control** - Click "Обновить сессию" to extract fresh session
2. **Parser Control** - Set search query and product limit, then click "Запустить парсинг"
3. **Real-time Logs** - View live logs from miner and parser jobs
4. **Excel Export** - Download all products as formatted Excel file
5. **Database Viewer** - Open Prisma Studio to browse/edit data

### Mode 3: Automated Scheduler

Run the Bree scheduler for automated periodic execution:

```bash
npm start
```

**Default Schedule:**
- **miner.js** - Runs every hour (with initial run at startup)
- **parser.js** - Runs every 15 minutes (3-minute delay after miner)

## 📁 Project Structure

```
WB-Scraping/
├── index.js                    # Main entry point (Bree scheduler)
├── server.js                   # Web UI server (Express.js)
├── schemas.js                  # Zod validation schemas
├── .env                        # Environment configuration (gitignored)
├── .env.example                # Environment template
├── .gitignore                  # Git ignore rules
├── package.json                # Dependencies and scripts
├── README.md                   # This file
│
├── jobs/                       # Scheduled job scripts
│   ├── miner.js                # Session extractor (Playwright)
│   └── parser.js               # Main parser (got-scraping)
│
├── utils/                      # Utility functions
│   └── wb-image.js             # WB image URL generator
│
├── prisma/                     # Database configuration
│   ├── schema.prisma           # Prisma schema
│   └── prisma.config.ts        # Prisma config
│
├── generated/                  # Auto-generated Prisma client
│   └── prisma/
│
├── storage/                    # Runtime data (gitignored)
│   ├── dev.db                  # SQLite database
│   ├── datasets/               # Crawlee datasets
│   ├── key_value_stores/       # Crawlee key-value stores
│   └── request_queues/         # Crawlee request queues
│
├── logs/                       # Log files (gitignored)
│   ├── app.log                 # Scheduler logs
│   └── server.log              # Web server logs
│
└── public/                     # Web UI static files
    └── index.html              # Control panel UI
```

## 🔧 Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:./storage/dev.db` | SQLite database connection string |
| `HEADLESS` | `true` | Run browser in headless mode (miner.js) |
| `MAX_PAGES` | `5` | Maximum pages to parse per query |
| `OUTPUT_JSON` | `false` | Export results to JSON file |
| `MAX_RETRIES` | `3` | Maximum retry attempts on rate limit (429) |
| `BASE_DELAY` | `5000` | Base delay (ms) for exponential backoff |
| `REQUEST_DELAY` | `3000` | Delay (ms) between successful requests |
| `LOG_LEVEL` | `info` | Logging verbosity (fatal/error/warn/info/debug/trace) |

### npm Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `start` | `node index.js` | Run Bree job scheduler |
| `miner` | `node jobs/miner.js` | Extract session (via Bree) |
| `parser` | `node jobs/parser.js` | Parse data (via Bree) |
| `parser:json` | `OUTPUT_JSON=true node jobs/parser.js` | Parse with JSON export |
| `ui` | `node server.js` | Start web UI server |

## 🗄️ Database Schema

```prisma
model Product {
  id        Int      @id @unique    // WB article ID
  name      String
  price     Float?
  salePrice Float?
  brand     String?
  rating    Float?
  reviews   Int?
  image     String?                 // Generated WB CDN URL

  // Audit Trail
  sourceUrl String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## 🛡️ Anti-Bot Protection

The parser employs multiple tactics to bypass Wildberries protection:

1. **Hidden API** - Uses undocumented `search.wb.ru` API instead of scraping HTML
2. **Stealth Browser** - Playwright with anti-detection flags disabled
3. **Real Session** - Extracts real User-Agent and cookies from browser
4. **Rate Limiting** - Exponential backoff on 429 errors
5. **403 Protection** - Stops after 3 consecutive 403 errors to prevent IP ban
6. **Request Delays** - Configurable delays between requests
7. **HTTP/2 Support** - Uses HTTP/2 for more realistic requests

## 📊 Data Validation (Zod)

All data passes strict validation before database insertion:

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

**Validation Rules:**
- `id` - Required, must be a positive integer
- `name` - Required, non-empty string (fallback: "Товар #{id}")
- `price`, `salePrice` - Optional, converted from kopecks to rubles
- `brand` - Optional, supports string or object format
- `image` - Nullable, generated from product ID
- `sourceUrl` - Required, must be valid URL

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
  "createdAt": "2026-03-19T10:30:00.000Z",
  "updatedAt": "2026-03-19T10:30:00.000Z"
}
```

## 🔍 Troubleshooting

### miner.js doesn't find x_wbaas_token

**Symptoms:** Miner runs but session.json doesn't contain `x_wbaas_token`

**Solutions:**
1. Increase wait time in miner.js (modify `page.waitForTimeout()`)
2. Run with visible browser for debugging: `HEADLESS=false npm run miner`
3. Check if Wildberries requires captcha completion
4. Try again later - WB may be temporarily blocking your IP

### parser.js gets 429 Too Many Requests

**Symptoms:** Parser logs show "Rate limited (429)" errors

**Solutions:**
1. Parser automatically retries with exponential backoff
2. Increase `BASE_DELAY` in `.env` (e.g., from 5000 to 10000)
3. Increase `REQUEST_DELAY` (e.g., from 3000 to 5000)
4. Reduce `MAX_PAGES` to make fewer requests

### parser.js gets 403 Forbidden

**Symptoms:** Parser stops after 3 consecutive 403 errors

**Solutions:**
1. Run `miner.js` again to get fresh session
2. Wait 15-30 minutes for IP cooldown
3. Use a different IP address or VPN
4. Reduce request frequency in `.env`

### Prisma Errors

**Error:** `Prisma Client could not find its generated client`

**Solution:**
```bash
# Regenerate Prisma client
npx prisma generate

# Re-apply schema to database
npx prisma db push
```

### Database Locked

**Symptoms:** "Database is locked" errors when running parser and UI simultaneously

**Solutions:**
1. Stop the web UI server
2. Ensure no other process is accessing `storage/dev.db`
3. Consider using PostgreSQL for concurrent access

### Excel Export Fails

**Symptoms:** "No data to export" error

**Solutions:**
1. Run parser first to collect data
2. Check that products exist in database via Prisma Studio
3. Verify database path in `.env`

## 🔗 API Reference

### Web UI Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/status` | Get current job status |
| `GET` | `/api/logs` | Get last 100 log lines |
| `POST` | `/api/miner/start` | Start miner job |
| `POST` | `/api/parser/start` | Start parser job |
| `GET` | `/api/export/excel` | Export to Excel |
| `POST` | `/api/prisma/studio` | Launch Prisma Studio |

### Parser Job Parameters

When calling `/api/parser/start`:

```json
{
  "query": "кроссовки",
  "limit": 100
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | `"товар"` | Search query for Wildberries |
| `limit` | number | `100` | Maximum products to collect |

## 📚 Additional Resources

- [Wildberries Seller Documentation](https://wildberries.ru/sellers)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Crawlee Documentation](https://crawlee.dev)
- [got-scraping Documentation](https://github.com/apify/got-scraping)
- [Zod Documentation](https://zod.dev)

## 📄 License

ISC License - See LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support

For issues and questions:
- Open an issue on [GitHub](https://github.com/Umalanif/WB-Scraping/issues)
- Check existing issues for solutions

---

**Made with ❤️ for data extraction enthusiasts**
