# WB Scraping — Wildberries product scraper with scheduled jobs and exportable results.

[Features](#features) · [Tech Stack](#tech-stack) · [Quick Start](#quick-start) · [Environment Variables](#environment-variables)

│ JavaScript scraper stack with Bree, Playwright, Prisma, Express, and Excel export tooling.

## Features

- Harvests Wildberries session data with a scheduled Playwright miner.
- Scrapes marketplace product data and stores it in SQLite via Prisma.
- Exposes REST endpoints for job control, status checks, logs, and exports.
- Generates formatted Excel reports from stored product data.
- Includes structured logging and Docker-based deployment support.

## Tech Stack

```text
┌────────────┬──────────────────────────────────────────────┐
│ Layer      │ Technology                                   │
├────────────┼──────────────────────────────────────────────┤
│ Runtime    │ Node.js / JavaScript                         │
├────────────┼──────────────────────────────────────────────┤
│ Crawling   │ Crawlee / Playwright / got-scraping         │
├────────────┼──────────────────────────────────────────────┤
│ API        │ Express                                      │
├────────────┼──────────────────────────────────────────────┤
│ Scheduling │ Bree                                         │
├────────────┼──────────────────────────────────────────────┤
│ Database   │ Prisma ORM / LibSQL / SQLite                │
├────────────┼──────────────────────────────────────────────┤
│ Validation │ Zod                                          │
├────────────┼──────────────────────────────────────────────┤
│ Logging    │ Pino                                         │
├────────────┼──────────────────────────────────────────────┤
│ Export     │ ExcelJS                                      │
└────────────┴──────────────────────────────────────────────┘
```

## Quick Start

```bash
git clone https://github.com/Umalanif/WB-Scraping.git
cd WB-Scraping
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm start
```

## Environment Variables

```text
┌──────────────────────┬──────────────────────────────────────────────┬──────────┐
│ Variable             │ Description                                  │ Required │
├──────────────────────┼──────────────────────────────────────────────┼──────────┤
│ DATABASE_URL         │ SQLite database path                         │ No       │
├──────────────────────┼──────────────────────────────────────────────┼──────────┤
│ HEADLESS             │ Runs miner in headless mode                  │ No       │
├──────────────────────┼──────────────────────────────────────────────┼──────────┤
│ MAX_PAGES            │ Maximum pages per parser run                 │ No       │
├──────────────────────┼──────────────────────────────────────────────┼──────────┤
│ OUTPUT_JSON          │ Saves parser output to JSON                  │ No       │
├──────────────────────┼──────────────────────────────────────────────┼──────────┤
│ MAX_RETRIES          │ Retry attempts on rate limits or failures    │ No       │
├──────────────────────┼──────────────────────────────────────────────┼──────────┤
│ BASE_DELAY           │ Base exponential backoff delay               │ No       │
├──────────────────────┼──────────────────────────────────────────────┼──────────┤
│ REQUEST_DELAY        │ Delay between successful page requests       │ No       │
├──────────────────────┼──────────────────────────────────────────────┼──────────┤
│ RATE_LIMIT_RPS       │ Worker rate limit                            │ No       │
├──────────────────────┼──────────────────────────────────────────────┼──────────┤
│ WB_COOKIE            │ Wildberries auth cookie                      │ No       │
├──────────────────────┼──────────────────────────────────────────────┼──────────┤
│ WB_API_BASE          │ Wildberries API base URL                     │ No       │
├──────────────────────┼──────────────────────────────────────────────┼──────────┤
│ PRICE_DROP_THRESHOLD │ Alert threshold percentage                   │ No       │
├──────────────────────┼──────────────────────────────────────────────┼──────────┤
│ PROXY_LIST           │ Optional proxy list                          │ No       │
├──────────────────────┼──────────────────────────────────────────────┼──────────┤
│ TELEGRAM_BOT_TOKEN   │ Telegram bot token for alerts                │ No       │
├──────────────────────┼──────────────────────────────────────────────┼──────────┤
│ TELEGRAM_CHAT_ID     │ Telegram chat ID for alerts                  │ No       │
├──────────────────────┼──────────────────────────────────────────────┼──────────┤
│ LOG_LEVEL            │ Logger verbosity                             │ No       │
└──────────────────────┴──────────────────────────────────────────────┴──────────┘
```

## Project Structure

```text
jobs/
  miner.js
  parser.js
prisma/
  prisma.config.ts
  schema.prisma
public/
  index.html
utils/
  wb-image.js
index.js
server.js
```

## License

ISC
