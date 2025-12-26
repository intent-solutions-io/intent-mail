/**
 * IMAP/SMTP Connector
 *
 * Exports all IMAP/SMTP connection and authentication functionality.
 */

// Types
export * from './types.js';

// Connection classes
export { ImapConnection, createImapConnection } from './connection.js';
export { SmtpConnection, createSmtpConnection } from './smtp.js';

// Provider configurations
export {
  IMAP_PROVIDERS,
  detectProvider,
  getProviderConfig,
  createCustomProvider,
} from './providers.js';

// Authentication
export {
  validateImapCredentials,
  buildImapCredentials,
  maskPassword,
  getProviderInfo,
} from './auth.js';

// Sync
export { ImapSync, ImapSyncResult, createImapSync } from './sync.js';

// Search
export { ImapSearch, ImapSearchOptions, ImapSearchResult, createImapSearch } from './search.js';
