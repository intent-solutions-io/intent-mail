/**
 * Sync Metrics Service
 *
 * Track and monitor email sync operations for performance and diagnostics.
 */

import { getDatabase } from '../database.js';
import { StorageError } from '../../types/storage.js';

/**
 * Sync metrics record
 */
export interface SyncMetrics {
  id: number;
  accountId: number;
  provider: string;
  syncType: 'initial' | 'delta';
  messagesAdded: number;
  messagesDeleted: number;
  labelsChanged: number;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  syncedAt: string;
  createdAt: string;
}

/**
 * Database row for sync metrics
 */
interface SyncMetricsRow {
  id: number;
  account_id: number;
  provider: string;
  sync_type: string;
  messages_added: number;
  messages_deleted: number;
  labels_changed: number;
  duration_ms: number;
  success: number;
  error_message: string | null;
  synced_at: string;
  created_at: string;
}

/**
 * Convert row to domain object
 */
function rowToMetrics(row: SyncMetricsRow): SyncMetrics {
  return {
    id: row.id,
    accountId: row.account_id,
    provider: row.provider,
    syncType: row.sync_type as 'initial' | 'delta',
    messagesAdded: row.messages_added,
    messagesDeleted: row.messages_deleted,
    labelsChanged: row.labels_changed,
    durationMs: row.duration_ms,
    success: row.success === 1,
    errorMessage: row.error_message || undefined,
    syncedAt: row.synced_at,
    createdAt: row.created_at,
  };
}

/**
 * Create sync metrics table if not exists
 */
export function initSyncMetricsTable(): void {
  const db = getDatabase();

  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      sync_type TEXT NOT NULL CHECK(sync_type IN ('initial', 'delta')),
      messages_added INTEGER NOT NULL DEFAULT 0,
      messages_deleted INTEGER NOT NULL DEFAULT 0,
      labels_changed INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      success INTEGER NOT NULL CHECK(success IN (0, 1)),
      error_message TEXT,
      synced_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sync_metrics_account_id
      ON sync_metrics(account_id);

    CREATE INDEX IF NOT EXISTS idx_sync_metrics_synced_at
      ON sync_metrics(synced_at DESC);

    CREATE INDEX IF NOT EXISTS idx_sync_metrics_success
      ON sync_metrics(success);
  `);
}

/**
 * Record sync metrics
 */
export function recordSyncMetrics(metrics: Omit<SyncMetrics, 'id' | 'createdAt'>): SyncMetrics {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO sync_metrics (
      account_id, provider, sync_type,
      messages_added, messages_deleted, labels_changed,
      duration_ms, success, error_message, synced_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    metrics.accountId,
    metrics.provider,
    metrics.syncType,
    metrics.messagesAdded,
    metrics.messagesDeleted,
    metrics.labelsChanged,
    metrics.durationMs,
    metrics.success ? 1 : 0,
    metrics.errorMessage || null,
    metrics.syncedAt
  );

  const row = db
    .prepare<number[], SyncMetricsRow>('SELECT * FROM sync_metrics WHERE id = ?')
    .get(Number(result.lastInsertRowid));

  if (!row) {
    throw new StorageError('Failed to record sync metrics', 'METRICS_RECORD_ERROR');
  }

  return rowToMetrics(row);
}

/**
 * Get sync metrics for an account
 */
export function getSyncMetricsByAccount(
  accountId: number,
  limit: number = 50
): SyncMetrics[] {
  const db = getDatabase();

  const rows = db
    .prepare<[number, number], SyncMetricsRow>(
      `SELECT * FROM sync_metrics
       WHERE account_id = ?
       ORDER BY synced_at DESC
       LIMIT ?`
    )
    .all(accountId, limit);

  return rows.map(rowToMetrics);
}

/**
 * Get sync statistics for an account
 */
export function getSyncStats(accountId: number): {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  totalMessagesAdded: number;
  totalMessagesDeleted: number;
  averageDurationMs: number;
  lastSyncAt: string | null;
  lastSyncSuccess: boolean | null;
} {
  const db = getDatabase();

  const stats = db
    .prepare<number[], {
      total_syncs: number;
      successful_syncs: number;
      failed_syncs: number;
      total_messages_added: number;
      total_messages_deleted: number;
      avg_duration_ms: number;
      last_sync_at: string | null;
      last_sync_success: number | null;
    }>(
      `SELECT
        COUNT(*) as total_syncs,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_syncs,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_syncs,
        SUM(messages_added) as total_messages_added,
        SUM(messages_deleted) as total_messages_deleted,
        AVG(duration_ms) as avg_duration_ms,
        MAX(synced_at) as last_sync_at,
        (SELECT success FROM sync_metrics WHERE account_id = ? ORDER BY synced_at DESC LIMIT 1) as last_sync_success
       FROM sync_metrics
       WHERE account_id = ?`
    )
    .get(accountId, accountId);

  if (!stats) {
    return {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      totalMessagesAdded: 0,
      totalMessagesDeleted: 0,
      averageDurationMs: 0,
      lastSyncAt: null,
      lastSyncSuccess: null,
    };
  }

  return {
    totalSyncs: stats.total_syncs,
    successfulSyncs: stats.successful_syncs,
    failedSyncs: stats.failed_syncs,
    totalMessagesAdded: stats.total_messages_added,
    totalMessagesDeleted: stats.total_messages_deleted,
    averageDurationMs: Math.round(stats.avg_duration_ms || 0),
    lastSyncAt: stats.last_sync_at,
    lastSyncSuccess: stats.last_sync_success === 1 ? true : stats.last_sync_success === 0 ? false : null,
  };
}

/**
 * Get recent sync errors
 */
export function getRecentSyncErrors(limit: number = 10): SyncMetrics[] {
  const db = getDatabase();

  const rows = db
    .prepare<number, SyncMetricsRow>(
      `SELECT * FROM sync_metrics
       WHERE success = 0
       ORDER BY synced_at DESC
       LIMIT ?`
    )
    .all(limit);

  return rows.map(rowToMetrics);
}

/**
 * Clean old sync metrics (keep last 1000 records per account)
 */
export function cleanOldSyncMetrics(): number {
  const db = getDatabase();

  const result = db.prepare(`
    DELETE FROM sync_metrics
    WHERE id NOT IN (
      SELECT id FROM sync_metrics
      ORDER BY synced_at DESC
      LIMIT 1000
    )
  `).run();

  return result.changes;
}
