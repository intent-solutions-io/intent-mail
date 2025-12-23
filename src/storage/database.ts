/**
 * Database Connection Singleton
 *
 * Manages SQLite connection lifecycle with WAL mode and foreign keys enabled.
 */

import Database from 'better-sqlite3';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { DB_PATH } from '../config.js';
import { StorageError } from '../types/storage.js';

let db: Database.Database | null = null;

/**
 * Initialize database connection
 * - Creates data directory if needed
 * - Enables foreign keys
 * - Enables WAL mode for concurrency
 */
export async function initDatabase(): Promise<void> {
  if (db) {
    return; // Already initialized
  }

  try {
    // Create data directory if it doesn't exist
    const dataDir = dirname(DB_PATH);
    await mkdir(dataDir, { recursive: true });

    // Open database connection
    db = new Database(DB_PATH);

    // Enable foreign key constraints
    db.pragma('foreign_keys = ON');

    // Enable WAL mode for better concurrency (readers don't block writers)
    db.pragma('journal_mode = WAL');

    console.log(`Database initialized at ${DB_PATH}`);
  } catch (error) {
    throw new StorageError(
      `Failed to initialize database: ${error instanceof Error ? error.message : String(error)}`,
      'DB_INIT_ERROR',
      error
    );
  }
}

/**
 * Get database connection
 * @throws {StorageError} If database is not initialized
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new StorageError(
      'Database not initialized. Call initDatabase() first.',
      'DB_NOT_INITIALIZED'
    );
  }
  return db;
}

/**
 * Close database connection gracefully
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log('Database connection closed');
  }
}

/**
 * Check if database is open
 */
export function isDatabaseOpen(): boolean {
  return db !== null && db.open;
}
