#!/bin/bash
set -e

echo "🎮 GamerScream Production Deployment"
echo "======================================"

# Check if DOMAIN is set
if [ -z "$1" ]; then
    echo "Usage: ./deploy.sh <your-domain>"
    echo "Example: ./deploy.sh gamerscream.duckdns.org"
    exit 1
fi

DOMAIN=$1
echo "📡 Domain: $DOMAIN"

# Update Caddyfile with domain
export DOMAIN
sed -i "s/{\\\$DOMAIN}/$DOMAIN/g" Caddyfile

# Build the backend
echo "🔨 Building backend..."
cd apps/server
npm install
npm run build
cd ../..

# Start everything
echo "🚀 Starting services..."
docker compose -f docker-compose.production.yml up -d --build

echo ""
echo "✅ Deployment complete!"
echo "   API: https://$DOMAIN/api/health"
echo "   LiveKit: wss://$DOMAIN"
echo ""
echo "📋 Check logs: docker compose -f docker-compose.production.yml logs -f"
