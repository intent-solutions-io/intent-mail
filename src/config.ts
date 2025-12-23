/**
 * Shared Configuration
 *
 * Single source of truth for server metadata to avoid duplication.
 */

export const SERVER_NAME = 'intentmail-mcp-server';
export const SERVER_VERSION = '0.1.0';

/**
 * Database configuration
 */
export const DB_PATH = process.env.INTENTMAIL_DB_PATH || './data/intentmail.db';
