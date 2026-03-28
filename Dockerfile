# Dockerfile for WB-Scraping Parser
# Optimized build with Node.js base image

FROM node:20-slim

# Set Node.js environment
ENV NODE_ENV=production
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies for Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install dependencies and Playwright browsers
RUN npm ci --only=production && \
    npx playwright install --with-deps chromium && \
    npx playwright install-deps chromium

# Copy Prisma schema and generate client
COPY prisma/ ./prisma/
RUN npx prisma generate

# Copy the rest of the application
COPY . .

# Create necessary directories
RUN mkdir -p /app/logs /app/generated/prisma

# Make entrypoint script executable
RUN chmod +x /app/docker-entrypoint.sh

# Expose application port
EXPOSE 3000

# Set entrypoint
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# Default command
CMD ["npm", "start"]
