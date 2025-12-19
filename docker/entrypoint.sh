#!/bin/sh
set -e

echo "--- Entrypoint: Environment Check ---"
echo "DATABASE_URL: $DATABASE_URL"
echo "APP_BASE_URL: $APP_BASE_URL"
echo "------------------------------------"

echo "Running database migrations..."
pnpm db:push --force

echo "Starting the application..."
exec "$@"
