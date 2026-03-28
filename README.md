# WB Parser — Wildberries Product Scraper

![Node.js](https://img.shields.io/badge/Node.js-22.x-green) ![License](https://img.shields.io/badge/License-ISC-blue) ![API](https://img.shields.io/badge/API-REST-brightgreen) ![Database](https://img.shields.io/badge/Database-SQLite/LibSQL-orange)

> Production-grade scraper for Wildberries marketplace with automated session harvesting, job scheduler, and REST API.

---

## Key Features

- **Bree automation** — job scheduler with configurable intervals (miner: 1h, parser: 15min)
- **Playwright session mining** — headless browser automatically extracts `x_wbaas_token` and cookies
- **Header rotation** — `got-scraping` with dynamic User-Agent and request header generation
- **Retry with exponential backoff** — automatic retry on 403/429/CAPTCHA up to 3 attempts
- **Excel export** — formatted reports with colors, autofilter, and Moscow timezone
- **Prisma ORM + LibSQL** — SQLite database with audit trail (createdAt, updatedAt)
- **Zod validation** — strict Product and SessionData checks at runtime
- **Pino logging** — dual-output: stdout (pretty) + file `logs/app.log`
- **Graceful shutdown** — clean process termination on SIGINT/SIGTERM
- **REST API** — manage scraper via HTTP: start/stop jobs, export data, view logs

---

## Stack

| Layer | Library | Version | Purpose |
|-------|---------|---------|---------|
| **Runtime** | Node.js | 22.x | Execution environment (ES Modules) |
| **Web Server** | Express | 5.x | REST API endpoints |
| **Scheduler** | Bree | 9.x | Background job scheduler |
| **Browser Automation** | Crawlee + Playwright | 3.x / 1.x | Session extraction |
| **HTTP Client** | got-scraping | 4.x | WB Search API scraping |
| **Database** | Prisma + LibSQL | 7.x | ORM for SQLite |
| **Validation** | Zod | 4.x | Runtime data validation |
| **Logging** | Pino + pino-pretty | 10.x / 13.x | Structured logging |
| **Excel Export** | ExcelJS | 4.x | .xlsx report generation |
| **Config** | dotenv | 17.x | Environment variables |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Wildberries.ru                              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP/Playwright
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  index.js — Bree Scheduler                                            │
│  ┌─────────────────┐    ┌─────────────────┐                         │
│  │ miner.js        │───▶│ parser.js        │                         │
│  │ (Crawlee)       │    │ (got-scraping)   │                         │
│  │ Extracts        │    │ Scrapes products │                         │
│  │ x_wbaas_token   │    │ from Search API  │                         │
│  └────────┬────────┘    └────────┬────────┘                         │
│           │ session.json          │ upsert Product[]                   │
│           ▼                       ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │              Prisma Client + LibSQL Adapter                   │     │
│  │                      SQLite: dev.db                            │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                              ▲                                        │
│  ┌───────────────────────────┴───────────────────────────────────┐   │
│  │ server.js — Express API                                        │   │
│  │ GET /api/status  |  POST /api/parser/start  |  GET /export    │   │
│  └───────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Installation & Usage

### Option 1: Docker (Recommended)

Quick start with Docker Compose:

```bash
# 1. Clone repository and navigate to project
git clone https://github.com/Umalanif/WB-Scraping.git
cd WB-Scraping

# 2. Create environment file from example
cp .env.example .env
# Edit .env as needed (optional - defaults work out of the box)

# 3. Start with Docker Compose
docker compose up -d

# 4. Check logs
docker compose logs -f

# 5. Access API at http://localhost:3000
```

**Docker Compose Features:**
- Automatic database initialization with `prisma db push`
- Persistent volumes for `dev.db`, `logs`, and Prisma generated files
- Health check endpoint monitoring
- Automatic restart on failure

**Environment Variables in Docker:**
All variables from `.env` can be overridden in `docker-compose.yml` or via `.env` file.

**Stopping Docker:**
```bash
docker compose down
```

---

### Option 2: Manual Installation

### Prerequisites

- Node.js 18+ (recommended 22.x)
- npm 10+

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env as needed

# 3. Generate Prisma client
npx prisma generate

# 4. Create/migrate database
npx prisma db push

# 5. Start scheduler (recommended for production)
npm start

# Alternative: start API server only
npm run ui
```

### npm Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start Bree scheduler (miner + parser) |
| `npm run ui` | Start REST API server only |
| `npm run miner` | Run miner manually (headless) |
| `npm run parser` | Run parser manually (query: "товар", limit: 100) |
| `npm run parser:json` | Same + save output to JSON |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | REST API port |
| `DATABASE_URL` | `file:dev.db` | SQLite database path |
| `LOG_LEVEL` | `info` | trace/debug/info/warn/error |
| `MAX_PAGES` | `5` | Max pages per parse run |
| `MAX_RETRIES` | `3` | Max retry attempts on error |
| `BASE_DELAY` | `5000` | Base backoff delay (ms) |
| `REQUEST_DELAY` | `3000` | Delay between pages (ms) |
| `HEADLESS` | `true` | Playwright headless mode |
| `OUTPUT_JSON` | `false` | Save results to JSON file |
| `BREE_EXTENSION` | `js` | Worker file extension |

---

## API Reference

### `GET /api/health` — Health Check

Verifies REST API server is running.

**Response `200 OK`:**
```json
{ "status": "ok", "timestamp": "2024-03-19T12:00:00.000Z" }
```

---

### `GET /api/status` — Process Status

Returns current state of background processes.

**Response `200 OK`:**
```json
{ "status": "idle", "job": null, "pid": null, "startTime": null }
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `string` | `idle` / `running` |
| `job` | `string\|null` | `miner` or `parser` |
| `pid` | `number\|null` | Process ID |
| `startTime` | `string\|null` | ISO start timestamp |

---

### `POST /api/miner/start` — Start Miner

Launches `miner.js` to harvest a Wildberries session.

**Response `200 OK`:**
```json
{ "message": "Miner started", "pid": 12345, "startTime": "2024-03-19T12:00:00.000Z" }
```

**Response `409 Conflict`:**
```json
{
  "error": "Conflict",
  "message": "Another process (parser) is already running",
  "currentStatus": { "status": "running", "job": "parser", "pid": 12346, "startTime": "..." }
}
```

---

### `POST /api/parser/start` — Start Parser

Launches `parser.js` with specified parameters.

**Request Body:**
```json
{ "query": "iphone 15", "limit": 100 }
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | `string` | `"товар"` | Wildberries search query |
| `limit` | `integer` | `100` | Max products to collect |

**Response `200 OK`:**
```json
{
  "message": "Parser started",
  "pid": 12347,
  "startTime": "2024-03-19T12:00:00.000Z",
  "params": { "query": "iphone 15", "limit": 100 }
}
```

---

### `GET /api/export/excel` — Export to Excel

Exports all products from the database to `.xlsx`.

**Response `200 OK`:**
- **Content-Type:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **Content-Disposition:** `attachment; filename="wildberries_report_20240319_120000.xlsx"`

**Response `404 Not Found`:**
```json
{ "error": "No data to export" }
```

---

### `GET /api/logs` — Application Logs

Returns the last 100 lines from `logs/app.log`.

**Response `200 OK`:**
```json
{
  "lines": [
    "2024-03-19T12:00:00.000Z INFO: Server started on http://localhost:3000"
  ],
  "error": null
}
```

---

### `POST /api/prisma/studio` — Prisma Studio

Launches the visual database editor.

**Response `200 OK`:**
```json
{ "message": "Prisma Studio launched", "url": "http://localhost:5555" }
```

---

## Database Schema

### Model: `Product`

```prisma
model Product {
  id        Int      @id @unique   // Wildberries article ID
  name      String                // Product name
  price     Float?                // Base price (₽)
  salePrice Float?                // Sale price (₽)
  brand     String?               // Brand name
  rating    Float?                // Rating (0–5)
  reviews   Int?                 // Number of reviews
  image     String?               // WB image URL

  // Audit Trail
  sourceUrl String                // Product page URL on Wildberries
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `Int` | No | Wildberries article (PK) |
| `name` | `String` | No | Product name |
| `price` | `Float` | Yes | Base price in rubles |
| `salePrice` | `Float` | Yes | Discounted price |
| `brand` | `String` | Yes | Brand name |
| `rating` | `Float` | Yes | Rating (0.0–5.0) |
| `reviews` | `Int` | Yes | Number of reviews |
| `image` | `String` | Yes | Generated image URL |
| `sourceUrl` | `String` | No | Direct product URL on WB |
| `createdAt` | `DateTime` | No | Record creation timestamp |
| `updatedAt` | `DateTime` | No | Last update timestamp |

---

## Development

### JSDoc Typing

The project uses **JSDoc annotations** instead of TypeScript for type documentation.

### Project Structure

```
WB/
├── index.js              # Bree scheduler entry point
├── server.js             # Express REST API
├── schemas.js            # Zod schemas + JSDoc types
├── utils/
│   └── wb-image.js       # WB image URL generator
├── jobs/
│   ├── miner.js          # Crawlee session extractor
│   └── parser.js         # WB API product parser
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── prisma.config.ts  # Prisma configuration
├── public/               # Static frontend files
├── logs/                 # Application logs
│   ├── app.log           # Structured logs
│   └── server.log        # Server logs
├── session.json          # WB session (auto-generated)
└── dev.db                # SQLite database (auto-created)
```

### Working with Sessions

Miner saves the session to `session.json`:
```json
{
  "userAgent": "Mozilla/5.0 ...",
  "cookies": [
    {
      "name": "x_wbaas_token",
      "value": "abc123...",
      "domain": ".wildberries.ru",
      "path": "/"
    }
  ]
}
```

On **IP change** or **block** — delete `session.json` and restart miner.

### Debugging

```bash
# Verbose logging
LOG_LEVEL=debug npm start

# Visible browser
HEADLESS=false npm run miner

# Manual run with params
node jobs/parser.js "ноутбук" 50
```

---

## Troubleshooting

| Code | Cause | Action |
|------|-------|--------|
| `403` | IP ban or CAPTCHA | Pause 3+ min, retry |
| `429` | Rate limiting | Exponential backoff |
| `HTML` instead of `JSON` | WB CAPTCHA | HTML saved to `debug-page-N.html` |
| `409 Conflict` | Process already running | Wait for completion |

---

## Performance Notes

- **Max concurrency:** 2 workers (RAM constraint for Playwright)
- **Request delay:** 3 sec between pages
- **Batch DB writes:** Prisma transaction for atomic upsert
- **Image URLs:** Generated locally via `utils/wb-image.js`

---

## OpenAPI (swagger.json)

Full API specification is available in `swagger.json`. Can be imported into Swagger UI, Postman, or Insomnia.
