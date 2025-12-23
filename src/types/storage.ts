/**
 * Storage Types
 *
 * Migration types, error handling, and search result types.
 */

import { z } from 'zod';

/**
 * Migration schema for version tracking
 */
export const MigrationSchema = z.object({
  version: z.number().int().positive(),
  name: z.string(),
  up: z.string(), // SQL to apply
  down: z.string().optional(), // SQL to rollback (optional)
  checksum: z.string(), // SHA-256 of 'up' SQL
});

export type Migration = z.infer<typeof MigrationSchema>;

/**
 * Migration database row type
 */
export interface MigrationRow {
  id: number;
  version: number;
  name: string;
  applied_at: string;
  checksum: string;
}

/**
 * Custom error class for storage operations
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * Search result with pagination metadata
 */
export interface SearchResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}
