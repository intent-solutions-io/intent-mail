/**
 * Attachment Cache Service
 *
 * Manages local file caching for email attachments with LRU eviction.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { getDatabase } from '../database.js';
import { getAttachmentById, updateAttachmentLocalPath } from './attachment-storage.js';
import { StorageError } from '../../types/storage.js';

/**
 * Cache configuration
 */
const CACHE_DIR = './data/attachment-cache';
const MAX_CACHE_SIZE_MB = 500; // 500 MB default cache limit
const MAX_CACHE_SIZE_BYTES = MAX_CACHE_SIZE_MB * 1024 * 1024;

/**
 * Initialize cache directory
 */
export async function initAttachmentCache(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    console.error(`Attachment cache initialized at ${CACHE_DIR}`);
  } catch (error) {
    throw new StorageError(
      `Failed to initialize attachment cache: ${error instanceof Error ? error.message : String(error)}`,
      'CACHE_INIT_ERROR',
      error
    );
  }
}

/**
 * Generate cache file path for an attachment
 */
function getCachePath(attachmentId: number, filename: string): string {
  // Use hash of ID + filename for unique cache file
  const hash = crypto
    .createHash('sha256')
    .update(`${attachmentId}-${filename}`)
    .digest('hex')
    .substring(0, 16);

  // Preserve file extension
  const ext = path.extname(filename);
  const cacheFilename = `${hash}${ext}`;

  return path.join(CACHE_DIR, cacheFilename);
}

/**
 * Check if attachment is cached locally
 */
export async function isAttachmentCached(attachmentId: number): Promise<boolean> {
  const attachment = getAttachmentById(attachmentId);
  if (!attachment || !attachment.localPath) {
    return false;
  }

  try {
    await fs.access(attachment.localPath);
    return true;
  } catch {
    // File doesn't exist - clear localPath in database
    const db = getDatabase();
    db.prepare('UPDATE attachments SET local_path = NULL WHERE id = ?').run(attachmentId);
    return false;
  }
}

/**
 * Save attachment content to cache
 */
export async function cacheAttachment(
  attachmentId: number,
  base64Content: string
): Promise<string> {
  const attachment = getAttachmentById(attachmentId);
  if (!attachment) {
    throw new StorageError('Attachment not found', 'ATTACHMENT_NOT_FOUND');
  }

  // Check if already cached
  const existingPath = attachment.localPath;
  if (existingPath) {
    try {
      await fs.access(existingPath);
      console.error(`Attachment ${attachmentId} already cached at ${existingPath}`);
      return existingPath;
    } catch {
      // File missing - will re-cache
    }
  }

  // Ensure cache directory exists
  await initAttachmentCache();

  // Generate cache file path
  const cachePath = getCachePath(attachmentId, attachment.filename);

  // Decode and write content
  const buffer = Buffer.from(base64Content, 'base64');
  await fs.writeFile(cachePath, buffer);

  // Update database with cache path
  updateAttachmentLocalPath(attachmentId, cachePath);

  console.error(
    `Cached attachment ${attachmentId} (${attachment.filename}, ${buffer.length} bytes) at ${cachePath}`
  );

  // Check cache size and evict if needed
  await evictCacheIfNeeded();

  return cachePath;
}

/**
 * Read cached attachment content
 */
export async function readCachedAttachment(attachmentId: number): Promise<string> {
  const attachment = getAttachmentById(attachmentId);
  if (!attachment) {
    throw new StorageError('Attachment not found', 'ATTACHMENT_NOT_FOUND');
  }

  if (!attachment.localPath) {
    throw new StorageError('Attachment not cached', 'ATTACHMENT_NOT_CACHED');
  }

  try {
    const buffer = await fs.readFile(attachment.localPath);
    return buffer.toString('base64');
  } catch (error) {
    throw new StorageError(
      `Failed to read cached attachment: ${error instanceof Error ? error.message : String(error)}`,
      'CACHE_READ_ERROR',
      error
    );
  }
}

/**
 * Get total cache size in bytes
 */
async function getCacheSize(): Promise<number> {
  try {
    const files = await fs.readdir(CACHE_DIR);
    let totalSize = 0;

    for (const file of files) {
      const filePath = path.join(CACHE_DIR, file);
      const stats = await fs.stat(filePath);
      totalSize += stats.size;
    }

    return totalSize;
  } catch {
    return 0;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  totalFiles: number;
  totalSizeBytes: number;
  totalSizeMB: number;
  limitMB: number;
  usagePercent: number;
}> {
  try {
    const files = await fs.readdir(CACHE_DIR);
    const totalSizeBytes = await getCacheSize();

    return {
      totalFiles: files.length,
      totalSizeBytes,
      totalSizeMB: totalSizeBytes / 1024 / 1024,
      limitMB: MAX_CACHE_SIZE_MB,
      usagePercent: (totalSizeBytes / MAX_CACHE_SIZE_BYTES) * 100,
    };
  } catch {
    return {
      totalFiles: 0,
      totalSizeBytes: 0,
      totalSizeMB: 0,
      limitMB: MAX_CACHE_SIZE_MB,
      usagePercent: 0,
    };
  }
}

/**
 * Evict cache entries if size exceeds limit (LRU strategy)
 */
async function evictCacheIfNeeded(): Promise<void> {
  const currentSize = await getCacheSize();

  if (currentSize <= MAX_CACHE_SIZE_BYTES) {
    return; // Cache size within limit
  }

  console.error(
    `Cache size (${(currentSize / 1024 / 1024).toFixed(2)} MB) exceeds limit (${MAX_CACHE_SIZE_MB} MB), evicting...`
  );

  const db = getDatabase();

  // Get all cached attachments ordered by last access (created_at as proxy for access time)
  const rows = db
    .prepare<unknown[], { id: number; local_path: string; created_at: string }>(
      `SELECT id, local_path, created_at
       FROM attachments
       WHERE local_path IS NOT NULL
       ORDER BY created_at ASC`
    )
    .all();

  let freedSpace = 0;
  const targetToFree = currentSize - MAX_CACHE_SIZE_BYTES;

  for (const row of rows) {
    if (freedSpace >= targetToFree) {
      break;
    }

    try {
      const stats = await fs.stat(row.local_path);
      await fs.unlink(row.local_path);

      // Clear localPath in database
      db.prepare('UPDATE attachments SET local_path = NULL WHERE id = ?').run(row.id);

      freedSpace += stats.size;
      console.error(`Evicted attachment ${row.id} (freed ${stats.size} bytes)`);
    } catch (error) {
      console.error(`Failed to evict ${row.local_path}:`, error);
    }
  }

  console.error(`Cache eviction complete. Freed ${(freedSpace / 1024 / 1024).toFixed(2)} MB`);
}

/**
 * Clear entire cache
 */
export async function clearAttachmentCache(): Promise<void> {
  const db = getDatabase();

  try {
    // Remove all cache files
    const files = await fs.readdir(CACHE_DIR);
    for (const file of files) {
      const filePath = path.join(CACHE_DIR, file);
      await fs.unlink(filePath);
    }

    // Clear all localPath references in database
    db.prepare('UPDATE attachments SET local_path = NULL').run();

    console.error('Attachment cache cleared');
  } catch (error) {
    throw new StorageError(
      `Failed to clear cache: ${error instanceof Error ? error.message : String(error)}`,
      'CACHE_CLEAR_ERROR',
      error
    );
  }
}
