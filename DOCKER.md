# Docker Deployment Guide

## Quick Start (Local Docker)

### 1. Prerequisites

```bash
docker --version   # Docker 20.10 or higher
docker-compose --version  # Docker Compose 2.0 or higher
```

### 2. Build and Run

```bash
# Build Docker image
docker-compose build

# Start container (runs in background)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop container
docker-compose down
```

### 3. Connect from MCP Client

**For Claude Desktop:**

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "intentmail": {
      "command": "docker",
      "args": ["exec", "-i", "intentmail-mcp-server", "node", "dist/index.js"]
    }
  }
}
```

**For any MCP client (programmatic):**

```bash
# Connect via stdio
docker exec -i intentmail-mcp-server node dist/index.js
```

---

## Docker Hub Deployment (Public Distribution)

### 1. Build Multi-Platform Image

```bash
# Build for AMD64 and ARM64 (M1/M2 Macs, ARM servers)
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 -t yourusername/intentmail:latest --push .
```

### 2. Users Pull and Run

```bash
# Pull image
docker pull yourusername/intentmail:latest

# Create data directory
mkdir -p ./data

# Create .env file with OAuth credentials
cat > .env <<EOF
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REDIRECT_URI=http://localhost:3000/oauth/callback
EOF

# Run container
docker run -d \
  --name intentmail \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/.env:/app/.env:ro \
  yourusername/intentmail:latest
```

### 3. Connect

```json
{
  "mcpServers": {
    "intentmail": {
      "command": "docker",
      "args": ["exec", "-i", "intentmail", "node", "dist/index.js"]
    }
  }
}
```

---

## Google Cloud Run Deployment (Serverless)

**Note:** MCP servers use stdio (not HTTP), so Cloud Run is **not recommended**. MCP requires persistent stdio connections, which Cloud Run doesn't support well.

**Better alternatives:**
- Local Docker (recommended)
- Google Compute Engine (VM with Docker)
- Google Kubernetes Engine (GKE)

---

## Environment Variables

Create `.env` file:

```bash
# Database
INTENTMAIL_DB_PATH=./data/intentmail.db

# Gmail OAuth (required)
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REDIRECT_URI=http://localhost:3000/oauth/callback

# Outlook OAuth (optional)
OUTLOOK_CLIENT_ID=your-outlook-client-id
OUTLOOK_CLIENT_SECRET=your-outlook-client-secret
OUTLOOK_REDIRECT_URI=http://localhost:3000/oauth/callback

# Logging
LOG_LEVEL=info
```

---

## Data Persistence

**Important:** Mount volumes to preserve data:

```yaml
volumes:
  - ./data:/app/data              # SQLite database + attachments
  - ./.env:/app/.env:ro           # OAuth credentials (read-only)
```

Without volumes, data is lost when container stops!

---

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs intentmail

# Common issues:
# 1. Missing .env file
# 2. Permission issues with ./data directory
# 3. Port conflicts (OAuth callback server)
```

### Database locked errors

```bash
# Stop container
docker-compose down

# Remove lock file
rm ./data/intentmail.db-shm ./data/intentmail.db-wal

# Restart
docker-compose up -d
```

### OAuth callback not working

```bash
# OAuth server runs on host port 3000 (not in container)
# Make sure port 3000 is available:
lsof -i :3000

# If blocked, change port in .env:
GMAIL_REDIRECT_URI=http://localhost:3001/oauth/callback
```

---

## Security Notes

**DO NOT:**
- Commit `.env` to version control
- Share OAuth credentials publicly
- Expose container ports unnecessarily

**DO:**
- Use `.env.example` as template
- Keep credentials in `.env` (gitignored)
- Run container as non-root user (done automatically)
- Use read-only volume mounts for sensitive files

---

## Advanced: Custom Network

```yaml
# docker-compose.yml
services:
  intentmail:
    networks:
      - intentmail-network

networks:
  intentmail-network:
    driver: bridge
```

---

## Distribution Checklist

Before publishing to Docker Hub:

- [ ] Remove all secrets from image
- [ ] Use `.env.example` with placeholders
- [ ] Test on both AMD64 and ARM64
- [ ] Document OAuth setup clearly
- [ ] Include health check
- [ ] Add version tags (not just `latest`)

```bash
# Tag with version
docker tag intentmail:latest yourusername/intentmail:0.1.0
docker push yourusername/intentmail:0.1.0
docker push yourusername/intentmail:latest
```
