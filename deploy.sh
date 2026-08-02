#!/bin/bash
set -e

echo "=== Prize App Deployment Script ==="

# Check if .env.production exists
if [ ! -f .env.production ]; then
  echo "ERROR: .env.production not found. Copy .env.production.example and fill in your values."
  exit 1
fi

echo "Building Docker images..."
docker compose -f docker-compose.prod.yml build

echo "Starting services..."
docker compose -f docker-compose.prod.yml up -d

echo "Waiting for database to be ready..."
sleep 10

echo "Running database migrations..."
docker compose -f docker-compose.prod.yml exec -T app npx prisma migrate deploy

echo "=== Deployment complete ==="
echo "App should be running at http://localhost:3000"
echo "Check status: docker compose -f docker-compose.prod.yml ps"
echo "View logs: docker compose -f docker-compose.prod.yml logs -f app"