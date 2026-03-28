#!/bin/sh
set -e

echo "Starting WB Parser initialization..."

# Run Prisma migrations to ensure database is set up
echo "Running Prisma database sync..."
npx prisma db push --url "$DATABASE_URL"

echo "Database ready!"

# Start the application
echo "Starting application..."
exec "$@"
