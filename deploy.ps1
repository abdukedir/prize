# Prize App Deployment Script (Windows PowerShell)
# Usage: .\deploy.ps1

$ErrorActionPreference = "Stop"

Write-Host "=== Prize App Deployment Script ===" -ForegroundColor Cyan

if (-not (Test-Path ".env.production")) {
  Write-Host "ERROR: .env.production not found. Copy .env.production.example and fill in your values." -ForegroundColor Red
  exit 1
}

Write-Host "Building Docker images..." -ForegroundColor Yellow
docker compose -f docker-compose.prod.yml build

Write-Host "Starting services..." -ForegroundColor Yellow
docker compose -f docker-compose.prod.yml up -d

Write-Host "Waiting for database to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

Write-Host "Running database migrations..." -ForegroundColor Yellow
docker compose -f docker-compose.prod.yml exec -T app npx prisma migrate deploy

Write-Host "=== Deployment complete ===" -ForegroundColor Green
Write-Host "App should be running at http://localhost:3000" -ForegroundColor Green
Write-Host "Check status: docker compose -f docker-compose.prod.yml ps" -ForegroundColor Gray
Write-Host "View logs: docker compose -f docker-compose.prod.yml logs -f app" -ForegroundColor Gray