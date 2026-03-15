# MODULE: DATA PROCESSING, VALIDATION & STORAGE

## 1. THE ZOD GATEKEEPER (STRICT VALIDATION)

- **Golden Rule:** Scraped data is inherently dirty. NEVER write raw scraped objects directly to a database, JSON, CSV, or external API.
- **Action:** Catch validation errors gracefully using `ZodSchema.safeParse()`. If `success === false`, log the issue using `Pino` (include the URL and validation errors) and `return` to drop the current request. DO NOT use a global `throw` that could crash the crawler process.

## 2. DATA CLEANSING PROTOCOL

Before passing data to Zod, apply basic sanitization:

- Use `.trim()` on all strings.
- Remove invisible whitespace characters (e.g., `\u200B`, `\n`, `\t`) from product titles and descriptions.
- Convert relative URLs (like `/category/item-1`) to absolute URLs.

## 3. DATABASE STORAGE (Prisma / SQLite)

- **Idempotency (Upsert):** Never use simple `insert` or `create` methods. Always use `prisma.model.upsert`. Match by a unique key (SKU or URL) to update existing records and insert new ones. NO DUPLICATES.
- **Audit Trail:** When defining schemas, always include fields like `sourceUrl` (where the data came from), `createdAt`, and `updatedAt`.

## 4. FLAT FILE EXPORTS (JSON / CSV)

If the user requests file-based exports:

- **JSON:** Prefer appending to a file incrementally (JSON Lines format `.jsonl`) or use Crawlee's built-in `Dataset` export features.
- **CSV:** Never build CSV strings manually. Use the `fast-csv` package for exporting tabular data.
