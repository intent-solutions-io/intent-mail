/**
 * Database Migration System
 *
 * Version-based migrations with checksum verification.
 */

import { createHash } from 'crypto';
import { getDatabase } from './database.js';
import { Migration, MigrationRow, StorageError } from '../types/storage.js';
import { ALL_SCHEMA } from './schema.js';

/**
 * Calculate SHA-256 checksum of SQL string
 */
function calculateChecksum(sql: string): string {
  return createHash('sha256').update(sql.trim()).digest('hex');
}

/**
 * Migration definitions
 *
 * Note: v1 includes IMAP support columns since the initial schema was updated
 * to support both OAuth and IMAP authentication from the start.
 */
const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: ALL_SCHEMA.join('\n\n'),
    checksum: '', // Will be calculated
  },
];

// Calculate checksums for all migrations
migrations.forEach((migration) => {
  migration.checksum = calculateChecksum(migration.up);
});

/**
 * Get applied migrations from database
 */
function getAppliedMigrations(): MigrationRow[] {
  const db = getDatabase();

  // Ensure migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      checksum TEXT NOT NULL
    );
  `);

  const stmt = db.prepare('SELECT * FROM migrations ORDER BY version ASC');
  return stmt.all() as MigrationRow[];
}

/**
 * Apply a single migration
 */
function applyMigration(migration: Migration): void {
  const db = getDatabase();

  console.log(`Applying migration v${migration.version}: ${migration.name}`);

  // Run migration in transaction
  const transaction = db.transaction(() => {
    // Execute migration SQL
    db.exec(migration.up);

    // Record migration
    db.prepare(`
      INSERT INTO migrations (version, name, checksum)
      VALUES (?, ?, ?)
    `).run(migration.version, migration.name, migration.checksum);
  });

  transaction();

  console.log(`✓ Migration v${migration.version} applied successfully`);
}

/**
 * Run all pending migrations
 */
export function runMigrations(): void {
  console.log('Checking for pending migrations...');

  const appliedMigrations = getAppliedMigrations();
  const appliedVersions = new Map(
    appliedMigrations.map((m) => [m.version, m])
  );

  let migrationsApplied = 0;

  for (const migration of migrations) {
    const applied = appliedVersions.get(migration.version);

    if (applied) {
      // Migration already applied - verify checksum
      if (applied.checksum !== migration.checksum) {
        throw new StorageError(
          `Migration v${migration.version} checksum mismatch! ` +
            `Database has been tampered with or migration changed after application.\n` +
            `Expected: ${migration.checksum}\n` +
            `Got: ${applied.checksum}`,
          'MIGRATION_CHECKSUM_MISMATCH'
        );
      }
      console.log(`✓ Migration v${migration.version} already applied (checksum verified)`);
      continue;
    }

    // Apply pending migration
    applyMigration(migration);
    migrationsApplied++;
  }

  if (migrationsApplied === 0) {
    console.log('All migrations up to date');
  } else {
    console.log(`Applied ${migrationsApplied} migration(s)`);
  }
}

/**
 * Get current schema version
 */
export function getCurrentVersion(): number {
  const appliedMigrations = getAppliedMigrations();

  if (appliedMigrations.length === 0) {
    return 0;
  }

  return Math.max(...appliedMigrations.map((m) => m.version));
}

/**
 * Get migration history
 */
export function getMigrationHistory(): MigrationRow[] {
  return getAppliedMigrations();
}
