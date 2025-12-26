# Quick Start Guide - IntentMail

Get IntentMail running in 5 minutes.

## Prerequisites

- Node.js 20+ (`node --version`)
- Gmail account
- 5 minutes for OAuth setup

---

## Step 1: Get OAuth Credentials (One-Time)

### 1.1 Create Google Cloud Project

1. Go to: https://console.cloud.google.com/apis/credentials
2. Click **Create Project** (or select existing)
3. Name: `IntentMail` → Click **Create**

### 1.2 Enable Gmail API

1. Go to: https://console.cloud.google.com/apis/library/gmail.googleapis.com
2. Click **Enable**

### 1.3 Configure OAuth Consent Screen

1. Go to: https://console.cloud.google.com/apis/credentials/consent
2. Choose **External** (for personal Gmail)
3. Fill in required fields:
   - App name: `IntentMail Dev`
   - User support email: your Gmail
   - Developer contact: your Gmail
4. Click **Save and Continue** (skip scopes)
5. Add Test Users:
   - Click **Add Users**
   - Enter your Gmail address
   - Click **Save**
6. Click **Back to Dashboard**

### 1.4 Create OAuth Client ID

1. Go to: https://console.cloud.google.com/apis/credentials
2. Click **Create Credentials** → **OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Name: `IntentMail Local`
5. Authorized redirect URIs:
   ```
   http://localhost:3000/oauth/callback
   ```
6. Click **Create**
7. **Copy Client ID and Client Secret** (you'll need these)

---

## Step 2: Install IntentMail

```bash
# Clone repository
git clone https://github.com/intent-solutions-io/intent-mail.git
cd intent-mail

# Install dependencies
npm install

# Build TypeScript
npm run build
```

---

## Step 3: Configure OAuth

```bash
# Create .env file
cp .env.example .env

# Edit .env and paste your credentials
nano .env  # or use any text editor
```

Your `.env` should look like:

```bash
GMAIL_CLIENT_ID=123456789-abc123xyz.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-your-secret-here
GMAIL_REDIRECT_URI=http://localhost:3000/oauth/callback
```

**Save and close.**

---

## Step 4: Test OAuth Flow

### Option A: Automatic (Opens Browser)

```bash
node test-oauth-auto.js
```

This will:
1. ✅ Open your browser automatically
2. ✅ Start OAuth callback server
3. ✅ Wait for you to authorize
4. ✅ Complete authorization
5. ✅ Create account in database

**Just click "Allow" when prompted!**

### Option B: Manual (Copy/Paste)

```bash
node test-oauth.js
```

This will:
1. Show you an authorization URL
2. You open it in browser
3. Click "Allow"
4. Copy the code from the redirect URL
5. Paste it back in terminal

---

## Step 5: Connect to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "intentmail": {
      "command": "node",
      "args": ["/FULL/PATH/TO/intent-mail/dist/index.js"]
    }
  }
}
```

**Replace `/FULL/PATH/TO/` with actual path!**

To get path:
```bash
pwd
# Copy output and use: /that/output/dist/index.js
```

**Restart Claude Desktop.**

---

## Step 6: Use IntentMail

In Claude Desktop, try:

```
Use the health_check tool
```

Should return:
```json
{
  "status": "healthy",
  "capabilities": {
    "storage": true
  }
}
```

**Authorize Gmail:**
```
Use mail_auth_start with provider: gmail
```

Click the URL, authorize, done! Now use any of the 19 tools:

```
Use mail_search to find emails about "invoice"
```

---

## Troubleshooting

### "OAuth callback timeout"

**Problem:** Callback server didn't receive authorization.

**Fix:**
1. Check port 3000 is available:
   ```bash
   lsof -i :3000
   ```
2. If blocked, kill process:
   ```bash
   kill -9 <PID>
   ```
3. Try again

### "Redirect URI mismatch"

**Problem:** Redirect URI doesn't match Google Cloud Console.

**Fix:**
1. Go to: https://console.cloud.google.com/apis/credentials
2. Click your OAuth client
3. Ensure redirect URI is exactly:
   ```
   http://localhost:3000/oauth/callback
   ```
4. Save changes
5. Wait 5 minutes for Google to update
6. Try again

### "Access blocked: IntentMail has not completed Google verification"

**Problem:** App is not verified (normal for development).

**Fix:**
1. Click **Advanced**
2. Click **Go to IntentMail (unsafe)**
3. This is safe - it's YOUR app!
4. Google shows this for all unverified apps

### "Database is locked"

**Fix:**
```bash
# Stop all IntentMail processes
pkill -f intentmail

# Remove lock files
rm ./data/intentmail.db-shm ./data/intentmail.db-wal

# Restart
npm start
```

---

## Docker Alternative

Prefer Docker? See [DOCKER.md](DOCKER.md):

```bash
docker-compose up -d
```

Connect via:
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

---

## Next Steps

- **Read [FAQ.md](FAQ.md)** - Common questions
- **Read [README.md](README.md)** - Full documentation
- **Check [DOCKER.md](DOCKER.md)** - Docker deployment
- **Report issues:** https://github.com/intent-solutions-io/intent-mail/issues

---

## Why OAuth Instead of App Passwords?

**OAuth is better:**
- ✅ More secure (no password storage)
- ✅ Fine-grained permissions (you control what IntentMail can access)
- ✅ Revocable (disable access anytime without changing password)
- ✅ Required by Google (app passwords being phased out)
- ✅ Same as Gmail mobile app uses

**App passwords:**
- ❌ Full account access (all or nothing)
- ❌ Can't revoke without changing
- ❌ Being deprecated by Google
- ❌ Less secure

**IntentMail only uses OAuth 2.0 with PKCE (most secure).**

---

**Need help?** Open an issue or check [FAQ.md](FAQ.md)!
