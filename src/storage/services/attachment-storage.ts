/**
 * Attachment Storage Service
 *
 * CRUD operations for email attachments.
 */

import { getDatabase } from '../database.js';
import { StorageError } from '../../types/storage.js';
import { Attachment, AttachmentRow } from '../../types/email.js';

/**
 * Convert database row to domain object
 */
function rowToAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    emailId: row.email_id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    contentId: row.content_id || undefined,
    providerAttachmentId: row.provider_attachment_id || undefined,
    localPath: row.local_path || undefined,
    createdAt: row.created_at,
  };
}

/**
 * Attachment data for insertion
 */
export interface AttachmentInsertInput {
  emailId: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  contentId?: string;
  providerAttachmentId?: string;
  localPath?: string;
}

/**
 * Create new attachment
 */
export function createAttachment(input: AttachmentInsertInput): Attachment {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO attachments (
      email_id, filename, mime_type, size_bytes,
      content_id, provider_attachment_id, local_path
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    input.emailId,
    input.filename,
    input.mimeType,
    input.sizeBytes,
    input.contentId || null,
    input.providerAttachmentId || null,
    input.localPath || null
  );

  if (!info.lastInsertRowid) {
    throw new StorageError('Failed to create attachment', 'ATTACHMENT_CREATE_ERROR');
  }

  // Fetch the created attachment
  const row = db
    .prepare<number[], AttachmentRow>(
      'SELECT * FROM attachments WHERE id = ?'
    )
    .get(Number(info.lastInsertRowid));

  if (!row) {
    throw new StorageError('Attachment created but not found', 'ATTACHMENT_NOT_FOUND');
  }

  return rowToAttachment(row);
}

/**
 * Get attachment by ID
 */
export function getAttachmentById(id: number): Attachment | null {
  const db = getDatabase();

  const row = db
    .prepare<number[], AttachmentRow>(
      'SELECT * FROM attachments WHERE id = ?'
    )
    .get(id);

  return row ? rowToAttachment(row) : null;
}

/**
 * List attachments for an email
 */
export function getAttachmentsByEmailId(emailId: number): Attachment[] {
  const db = getDatabase();

  const rows = db
    .prepare<number[], AttachmentRow>(
      'SELECT * FROM attachments WHERE email_id = ? ORDER BY id ASC'
    )
    .all(emailId);

  return rows.map(rowToAttachment);
}

/**
 * Delete attachment by ID
 */
export function deleteAttachment(id: number): void {
  const db = getDatabase();

  const stmt = db.prepare('DELETE FROM attachments WHERE id = ?');
  stmt.run(id);
}

/**
 * Delete all attachments for an email
 * (Note: CASCADE should handle this automatically, but this is explicit)
 */
export function deleteAttachmentsByEmailId(emailId: number): void {
  const db = getDatabase();

  const stmt = db.prepare('DELETE FROM attachments WHERE email_id = ?');
  stmt.run(emailId);
}

/**
 * Batch upsert attachments for an email
 * Deletes existing attachments and inserts new ones
 */
export function upsertAttachmentsForEmail(
  emailId: number,
  attachments: Omit<AttachmentInsertInput, 'emailId'>[]
): Attachment[] {
  const db = getDatabase();

  // Use a transaction for atomic update
  const transaction = db.transaction(() => {
    // Delete existing attachments
    db.prepare('DELETE FROM attachments WHERE email_id = ?').run(emailId);

    // Insert new attachments
    const insertStmt = db.prepare(`
      INSERT INTO attachments (
        email_id, filename, mime_type, size_bytes,
        content_id, provider_attachment_id, local_path
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const att of attachments) {
      insertStmt.run(
        emailId,
        att.filename,
        att.mimeType,
        att.sizeBytes,
        att.contentId || null,
        att.providerAttachmentId || null,
        att.localPath || null
      );
    }
  });

  transaction();

  // Return the inserted attachments
  return getAttachmentsByEmailId(emailId);
}

/**
 * Update attachment local path (after downloading)
 */
export function updateAttachmentLocalPath(id: number, localPath: string): Attachment {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE attachments
    SET local_path = ?
    WHERE id = ?
  `);

  stmt.run(localPath, id);

  const attachment = getAttachmentById(id);
  if (!attachment) {
    throw new StorageError('Attachment not found after update', 'ATTACHMENT_NOT_FOUND');
  }

  return attachment;
}
