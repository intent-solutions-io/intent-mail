/**
 * Database Schema Definitions
 *
 * SQL schema constants for all tables and indexes.
 */

/**
 * Migrations tracking table
 */
export const MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now')),
  checksum TEXT NOT NULL
);
`;

/**
 * Email accounts table (Gmail, Outlook, etc.)
 */
export const ACCOUNTS_TABLE = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL CHECK(provider IN ('gmail', 'outlook')),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,

  -- OAuth tokens (plaintext for Phase 1, encrypt later)
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TEXT,

  -- Delta sync state
  last_history_id TEXT,  -- Gmail History API
  delta_token TEXT,       -- Outlook Graph API
  last_sync_at TEXT,

  -- Status
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * Emails table (multi-account, all providers)
 */
export const EMAILS_TABLE = `
CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,

  -- Provider-specific ID (Gmail message ID or Outlook Graph ID)
  provider_message_id TEXT NOT NULL,
  thread_id TEXT,

  -- Core email fields
  from_address TEXT NOT NULL,
  from_name TEXT,
  to_addresses TEXT NOT NULL,  -- JSON array
  cc_addresses TEXT,            -- JSON array
  bcc_addresses TEXT,           -- JSON array
  subject TEXT NOT NULL,
  body_text TEXT,
  body_html TEXT,
  snippet TEXT,

  -- Metadata
  date TEXT NOT NULL,
  received_at TEXT,

  -- Flags (comma-separated: SEEN, FLAGGED, etc.)
  flags TEXT DEFAULT '',

  -- Labels/folders (JSON array)
  labels TEXT DEFAULT '[]',

  -- Threading
  in_reply_to TEXT,
  reference_headers TEXT,

  -- Sync metadata
  raw_headers TEXT,  -- JSON object
  size_bytes INTEGER,
  has_attachments INTEGER NOT NULL DEFAULT 0 CHECK(has_attachments IN (0, 1)),

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE (account_id, provider_message_id)
);
`;

/**
 * Attachments table (metadata only, no file storage yet)
 */
export const ATTACHMENTS_TABLE = `
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id INTEGER NOT NULL,

  -- Attachment metadata
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content_id TEXT,  -- For inline images

  -- Provider-specific ID
  provider_attachment_id TEXT,

  -- File storage (Phase 1: null, Phase 2: local path)
  local_path TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
);
`;

/**
 * Rules table (email automation)
 */
export const RULES_TABLE = `
CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,

  -- Rule metadata
  name TEXT NOT NULL,
  description TEXT,

  -- Trigger type
  trigger TEXT NOT NULL CHECK(trigger IN ('on_new_email', 'manual', 'scheduled')),

  -- Conditions and actions (stored as JSON)
  conditions TEXT NOT NULL,  -- JSON array of conditions
  actions TEXT NOT NULL,     -- JSON array of actions

  -- Status
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
`;

/**
 * FTS5 virtual table for full-text search
 * Tokenizer: porter (stemming) + unicode61 (international chars)
 */
export const EMAILS_FTS_TABLE = `
CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
  subject,
  body_text,
  from_name,
  from_address,
  content='emails',
  content_rowid='id',
  tokenize='porter unicode61'
);
`;

/**
 * FTS trigger: sync on INSERT
 */
export const FTS_INSERT_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS emails_fts_insert AFTER INSERT ON emails BEGIN
  INSERT INTO emails_fts(rowid, subject, body_text, from_name, from_address)
  VALUES (new.id, new.subject, new.body_text, new.from_name, new.from_address);
END;
`;

/**
 * FTS trigger: sync on UPDATE
 */
export const FTS_UPDATE_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS emails_fts_update AFTER UPDATE ON emails BEGIN
  UPDATE emails_fts
  SET subject = new.subject,
      body_text = new.body_text,
      from_name = new.from_name,
      from_address = new.from_address
  WHERE rowid = old.id;
END;
`;

/**
 * FTS trigger: sync on DELETE
 */
export const FTS_DELETE_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS emails_fts_delete AFTER DELETE ON emails BEGIN
  DELETE FROM emails_fts WHERE rowid = old.id;
END;
`;

/**
 * Indexes for common queries
 */
export const INDEXES = [
  // Accounts indexes
  'CREATE INDEX IF NOT EXISTS idx_accounts_provider ON accounts(provider);',
  'CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);',
  'CREATE INDEX IF NOT EXISTS idx_accounts_is_active ON accounts(is_active);',

  // Emails indexes (composite index for date-based queries per account)
  'CREATE INDEX IF NOT EXISTS idx_emails_account_date ON emails(account_id, date DESC);',
  'CREATE INDEX IF NOT EXISTS idx_emails_thread_id ON emails(thread_id);',
  'CREATE INDEX IF NOT EXISTS idx_emails_from_address ON emails(from_address);',
  'CREATE INDEX IF NOT EXISTS idx_emails_flags ON emails(flags);',

  // Attachments indexes
  'CREATE INDEX IF NOT EXISTS idx_attachments_email_id ON attachments(email_id);',
  'CREATE INDEX IF NOT EXISTS idx_attachments_filename ON attachments(filename);',

  // Rules indexes
  'CREATE INDEX IF NOT EXISTS idx_rules_account_id ON rules(account_id);',
  'CREATE INDEX IF NOT EXISTS idx_rules_is_active ON rules(is_active);',
  'CREATE INDEX IF NOT EXISTS idx_rules_trigger ON rules(trigger);',
];

/**
 * All schema components in order
 */
export const ALL_SCHEMA = [
  MIGRATIONS_TABLE,
  ACCOUNTS_TABLE,
  EMAILS_TABLE,
  ATTACHMENTS_TABLE,
  RULES_TABLE,
  EMAILS_FTS_TABLE,
  FTS_INSERT_TRIGGER,
  FTS_UPDATE_TRIGGER,
  FTS_DELETE_TRIGGER,
  ...INDEXES,
];
