#!/bin/bash
set -euo pipefail

echo "🎮 GamerScream Production Deployment"
echo "======================================"

# Check if DOMAIN is set
if [ -z "${1:-}" ]; then
    echo "Usage: ./deploy.sh <your-domain>"
    echo "Example: ./deploy.sh gamerscream.duckdns.org"
    exit 1
fi

DOMAIN=$1
if [[ ! "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]]; then
    echo "Invalid domain"
    exit 1
fi
echo "📡 Domain: $DOMAIN"

export DOMAIN
COMPOSE=(docker compose -f docker-compose.production.yml)

# Check required configuration without printing resolved secret values.
"${COMPOSE[@]}" config --quiet

PREVIOUS_CONTAINER=$("${COMPOSE[@]}" ps -q backend 2>/dev/null || true)
PREVIOUS_BACKEND_IMAGE=""
if [ -n "$PREVIOUS_CONTAINER" ]; then
    PREVIOUS_BACKEND_IMAGE=$(docker inspect --format '{{.Image}}' "$PREVIOUS_CONTAINER" 2>/dev/null || true)
fi
DEPLOY_ID=$(date -u +%Y%m%d%H%M%S)-$$
export BACKEND_IMAGE="gamerscream-backend:deploy-$DEPLOY_ID"

rollback_backend() {
    echo "↩️  Deployment verification failed; attempting backend rollback..."
    if [ -z "$PREVIOUS_BACKEND_IMAGE" ]; then
        echo "No previous backend image is available for automatic rollback."
        return 1
    fi
    local rollback_image="gamerscream-backend:rollback-$DEPLOY_ID"
    if ! docker tag "$PREVIOUS_BACKEND_IMAGE" "$rollback_image"; then
        echo "Could not preserve the previous backend image."
        return 1
    fi
    export BACKEND_IMAGE="$rollback_image"
    if ! "${COMPOSE[@]}" up -d --no-build --wait --wait-timeout 90; then
        echo "Automatic rollback failed; manual recovery is required."
        return 1
    fi
    if ! curl --fail --silent --show-error --connect-timeout 5 --max-time 30 \
        "https://$DOMAIN/api/health" >/dev/null; then
        echo "Rollback containers started, but public health verification failed."
        return 1
    fi
    echo "Previous backend image restored successfully."
}

# Build the backend
echo "🔨 Building backend..."
corepack pnpm --filter server build

# Start everything
echo "🚀 Starting services..."
if ! "${COMPOSE[@]}" up -d --build --wait --wait-timeout 90; then
    rollback_backend || true
    exit 1
fi

echo "🔎 Verifying public health endpoint..."
if ! curl --fail --silent --show-error \
    --retry 10 --retry-all-errors --retry-delay 2 \
    --connect-timeout 5 --max-time 60 \
    "https://$DOMAIN/api/ready" >/dev/null; then
    echo "Deployment failed public health verification; success was not declared."
    rollback_backend || true
    exit 1
fi

echo ""
echo "✅ Deployment complete!"
echo "   API: https://$DOMAIN/api/health"
echo "   LiveKit: wss://$DOMAIN"
echo ""
echo "📋 Check logs: docker compose -f docker-compose.production.yml logs -f"
