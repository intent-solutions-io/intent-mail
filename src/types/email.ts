/**
 * Email Type Definitions
 *
 * Zod schemas and TypeScript types for email entities.
 */

import { z } from 'zod';

/**
 * Email address object schema
 */
export const EmailAddressSchema = z.object({
  address: z.string().email(),
  name: z.string().optional(),
});

export type EmailAddress = z.infer<typeof EmailAddressSchema>;

/**
 * Email attachment schema
 */
export const AttachmentSchema = z.object({
  id: z.number().int().positive(),
  emailId: z.number().int().positive(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  contentId: z.string().optional(),
  providerAttachmentId: z.string().optional(),
  localPath: z.string().optional(),
  createdAt: z.string(),
});

export type Attachment = z.infer<typeof AttachmentSchema>;

/**
 * Attachment input schema for sending emails
 */
export const AttachmentInputSchema = z.object({
  filename: z.string().min(1).describe('File name with extension'),
  mimeType: z.string().min(1).describe('MIME type (e.g., application/pdf, image/png)'),
  content: z.string().describe('Base64-encoded file content'),
  contentId: z.string().optional().describe('Content ID for inline images'),
});

export type AttachmentInput = z.infer<typeof AttachmentInputSchema>;

/**
 * Email attachment row (database representation)
 */
export interface AttachmentRow {
  id: number;
  email_id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  content_id: string | null;
  provider_attachment_id: string | null;
  local_path: string | null;
  created_at: string;
}

/**
 * Email flags enum
 */
export enum EmailFlag {
  SEEN = 'SEEN',
  FLAGGED = 'FLAGGED',
  DRAFT = 'DRAFT',
  ANSWERED = 'ANSWERED',
  DELETED = 'DELETED',
}

/**
 * Email schema (domain object)
 */
export const EmailSchema = z.object({
  id: z.number().int().positive(),
  accountId: z.number().int().positive(),
  providerMessageId: z.string(),
  threadId: z.string().optional(),

  // Core fields
  from: EmailAddressSchema,
  to: z.array(EmailAddressSchema),
  cc: z.array(EmailAddressSchema).optional(),
  bcc: z.array(EmailAddressSchema).optional(),
  subject: z.string(),
  bodyText: z.string().optional(),
  bodyHtml: z.string().optional(),
  snippet: z.string().optional(),

  // Metadata
  date: z.string(),
  receivedAt: z.string().optional(),

  // Flags and labels
  flags: z.array(z.nativeEnum(EmailFlag)),
  labels: z.array(z.string()),

  // Threading
  inReplyTo: z.string().optional(),
  references: z.string().optional(),

  // Sync metadata
  rawHeaders: z.record(z.string()).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  hasAttachments: z.boolean(),

  // Timestamps
  createdAt: z.string(),
  updatedAt: z.string(),

  // Optional attachments (loaded separately)
  attachments: z.array(AttachmentSchema).optional(),
});

export type Email = z.infer<typeof EmailSchema>;

/**
 * Email row (database representation with snake_case)
 */
export interface EmailRow {
  id: number;
  account_id: number;
  provider_message_id: string;
  thread_id: string | null;

  // Core fields
  from_address: string;
  from_name: string | null;
  to_addresses: string;  // JSON array
  cc_addresses: string | null;  // JSON array
  bcc_addresses: string | null;  // JSON array
  subject: string;
  body_text: string | null;
  body_html: string | null;
  snippet: string | null;

  // Metadata
  date: string;
  received_at: string | null;

  // Flags and labels
  flags: string;  // Comma-separated
  labels: string;  // JSON array

  // Threading
  in_reply_to: string | null;
  reference_headers: string | null;

  // Sync metadata
  raw_headers: string | null;  // JSON object
  size_bytes: number | null;
  has_attachments: number;  // 0 or 1

  // Timestamps
  created_at: string;
  updated_at: string;
}

/**
 * Email search filters
 */
export const EmailSearchFiltersSchema = z.object({
  accountId: z.number().int().positive().optional(),
  query: z.string().optional(),  // FTS5 full-text search
  from: z.string().optional(),
  subject: z.string().optional(),
  hasAttachments: z.boolean().optional(),
  flags: z.array(z.nativeEnum(EmailFlag)).optional(),
  labels: z.array(z.string()).optional(),
  threadId: z.string().optional(),
  dateFrom: z.string().optional(),  // ISO 8601
  dateTo: z.string().optional(),    // ISO 8601
  limit: z.number().int().positive().default(50),
  offset: z.number().int().nonnegative().default(0),
});

export type EmailSearchFilters = z.infer<typeof EmailSearchFiltersSchema>;

/**
 * Email upsert input (for sync operations)
 */
export const EmailUpsertInputSchema = z.object({
  accountId: z.number().int().positive(),
  providerMessageId: z.string(),
  threadId: z.string().optional(),

  // Core fields
  from: EmailAddressSchema,
  to: z.array(EmailAddressSchema),
  cc: z.array(EmailAddressSchema).optional(),
  bcc: z.array(EmailAddressSchema).optional(),
  subject: z.string(),
  bodyText: z.string().optional(),
  bodyHtml: z.string().optional(),
  snippet: z.string().optional(),

  // Metadata
  date: z.string(),
  receivedAt: z.string().optional(),

  // Flags and labels
  flags: z.array(z.nativeEnum(EmailFlag)).optional(),
  labels: z.array(z.string()).optional(),

  // Threading
  inReplyTo: z.string().optional(),
  references: z.string().optional(),

  // Sync metadata
  rawHeaders: z.record(z.string()).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  hasAttachments: z.boolean().optional(),
});

export type EmailUpsertInput = z.infer<typeof EmailUpsertInputSchema>;
