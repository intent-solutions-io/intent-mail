#!/bin/bash
# Quick start script for IntentMail

set -e

echo "🚀 IntentMail Quick Start"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ No .env file found!"
    echo ""
    echo "Please create .env from .env.example:"
    echo "  cp .env.example .env"
    echo "  # Edit .env and add your Gmail OAuth credentials"
    echo ""
    exit 1
fi

# Check if built
if [ ! -d dist ]; then
    echo "📦 Building TypeScript..."
    npm run build
fi

# Create data directory
mkdir -p ./data

echo "✅ Starting IntentMail MCP server..."
echo ""
echo "Next steps:"
echo "1. In Claude Desktop, use: mail_auth_start"
echo "2. Click the URL to authorize Gmail"
echo "3. Use any of the 19 MCP tools!"
echo ""

npm start
