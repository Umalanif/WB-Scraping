# MODULE: ADVANCED SCRAPING & ANTI-BOT TACTICS

## 1. DEVTOOLS FIRST (API OVER UI)

- **Golden Rule:** Browser automation is heavy. Always check for hidden internal APIs (JSON/GraphQL) on the target site. If discovered, bypass crawlers entirely for that endpoint and use `got` or `sendRequest()` to fetch data directly.

## 2. ANTI-BOT & STEALTH TACTICS

- **The Headless Switch:** Configure the `headless` option inside `PlaywrightCrawler` to map to `process.env.HEADLESS === 'true'`. This allows instant switching to `false` for visual debugging.
- **Heavy Artillery (Stealth Plugin):** If standard fingerprinting fails, integrate `puppeteer-extra-plugin-stealth` via `playwright-extra` using `launchContext.launcher`. **CRITICAL:** If you use `playwright-extra`, you MUST disable Crawlee's default `useFingerprints: false` inside `browserPoolOptions` to prevent patching conflicts.

## 3. RATE LIMITS & BLOCK HANDLING

- **429 Too Many Requests:** If encountered, execute `throw new Error('Rate Limited')`. DO NOT write custom `setTimeout` delay loops. Let Crawlee's built-in `maxRequestRetries` mechanism re-queue the task with its native exponential backoff.
- **403 Forbidden:** Track consecutive 403 errors globally. If you receive 3-5 in a row, bypass Crawlee's default retry mechanism and STOP the crawler immediately using `await crawler.teardown()` to prevent permanent IP bans.

## 4. TIMEOUTS & HANG PREVENTION

- **Hard Limits:** Do not rely on default timeouts. Always pass strict timeout limits for navigation and element selectors directly into `PlaywrightCrawler` configuration.

## 5. DATA PROCESSING UTILITIES

- **OCR:** If extracting data via `tesseract.js`, DO NOT run it inside the active crawler `requestHandler`. Save the image buffer to disk/DB and process it asynchronously in a separate Worker Thread to prevent blocking the Event Loop.
- **Fuzzy Matching:** Use the `string-similarity` package when comparing product names or titles across different domains to find matches. DO NOT write custom Levenshtein distance functions.
- **Outbound Rate-Limiting:** If pushing scraped data to third-party APIs (like Telegram), wrap the requests in the `bottleneck` package to prevent getting rate-limited.
