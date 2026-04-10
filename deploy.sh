#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# auren — Build & Deploy Script
# ──────────────────────────────────────────────

APP_NAME="auren"
IMAGE_TAG="${IMAGE_TAG:-latest}"
PORT=4006

echo ">> Building Docker image: ${APP_NAME}:${IMAGE_TAG}"
docker build -t "${APP_NAME}:${IMAGE_TAG}" .

echo ">> Stopping existing container (if any)"
docker rm -f "$APP_NAME" 2>/dev/null || true

echo ">> Starting container on port ${PORT}"
docker run -d \
  --name "$APP_NAME" \
  --restart unless-stopped \
  -p "${PORT}:3000" \
  --env-file .env \
  "${APP_NAME}:${IMAGE_TAG}"

echo ""
echo ">> auren is running at http://localhost:${PORT}"
echo ">> Logs: docker logs -f ${APP_NAME}"
