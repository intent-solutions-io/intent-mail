/**
 * Gmail Delta Sync
 *
 * Implements incremental sync using Gmail History API.
 */

import { GmailClient } from './client.js';
import {
  GmailHistoryType,
  GmailMessage,
  GmailMessageFormat,
  GmailSyncResult,
} from './types.js';
import {
  EmailAddress,
  EmailFlag,
  EmailUpsertInput,
} from '../../types/email.js';
import { upsertEmail, deleteEmail } from '../../storage/services/email-storage.js';
import { upsertAttachmentsForEmail, AttachmentInsertInput } from '../../storage/services/attachment-storage.js';

/**
 * Extract attachment metadata from Gmail message parts
 */
function extractAttachmentMetadata(gmailMessage: GmailMessage): Omit<AttachmentInsertInput, 'emailId'>[] {
  const attachments: Omit<AttachmentInsertInput, 'emailId'>[] = [];

  const extractFromParts = (parts: any[]) => {
    for (const part of parts || []) {
      if (part.filename && part.body?.attachmentId) {
        // Extract Content-ID header for inline images
        const contentId = part.headers?.find((h: any) => h.name === 'Content-ID')?.value;

        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          sizeBytes: part.body.size || 0,
          contentId: contentId,
          providerAttachmentId: part.body.attachmentId,
        });
      }

      // Recursively process nested parts
      if (part.parts) {
        extractFromParts(part.parts);
      }
    }
  };

  if (gmailMessage.payload?.parts) {
    extractFromParts(gmailMessage.payload.parts);
  }

  return attachments;
}

/**
 * Parse Gmail message to Email domain object
 */
function parseGmailMessage(
  gmailMessage: GmailMessage,
  accountId: number
): EmailUpsertInput {
  const headers = gmailMessage.payload?.headers || [];

  // Helper to get header value
  const getHeader = (name: string): string | undefined => {
    const header = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
    return header?.value;
  };

  // Parse email addresses from header
  const parseEmailAddress = (headerValue?: string): EmailAddress | undefined => {
    if (!headerValue) return undefined;

    // Simple email parsing (format: "Name <email@domain.com>" or "email@domain.com")
    const match = headerValue.match(/(.*?)\s*<(.+?)>|(.+)/);
    if (!match) return undefined;

    const name = match[1]?.trim();
    const address = match[2] || match[3];

    return {
      address: address.trim(),
      name: name || undefined,
    };
  };

  // Parse multiple email addresses (comma or semicolon separated)
  const parseEmailAddresses = (headerValue?: string): EmailAddress[] => {
    if (!headerValue) return [];

    return headerValue
      .split(/[,;]/)
      .map((addr) => parseEmailAddress(addr.trim()))
      .filter((addr): addr is EmailAddress => addr !== undefined);
  };

  // Parse labels to flags
  const flags: EmailFlag[] = [];
  const labelIds = gmailMessage.labelIds || [];

  if (!labelIds.includes('UNREAD')) {
    flags.push(EmailFlag.SEEN);
  }
  if (labelIds.includes('STARRED')) {
    flags.push(EmailFlag.FLAGGED);
  }
  if (labelIds.includes('DRAFT')) {
    flags.push(EmailFlag.DRAFT);
  }
  if (labelIds.includes('TRASH')) {
    flags.push(EmailFlag.DELETED);
  }

  // Extract body text and HTML
  let bodyText: string | undefined;
  let bodyHtml: string | undefined;

  const extractBody = (part: any) => {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      bodyText = Buffer.from(part.body.data, 'base64url').toString('utf-8');
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      bodyHtml = Buffer.from(part.body.data, 'base64url').toString('utf-8');
    }

    if (part.parts) {
      part.parts.forEach(extractBody);
    }
  };

  if (gmailMessage.payload) {
    extractBody(gmailMessage.payload);
  }

  // Parse from address (required)
  const from = parseEmailAddress(getHeader('From'));
  if (!from) {
    throw new Error(`Message ${gmailMessage.id} has no From header`);
  }

  // Parse to addresses (required)
  const to = parseEmailAddresses(getHeader('To'));
  if (to.length === 0) {
    throw new Error(`Message ${gmailMessage.id} has no To header`);
  }

  // Build email object
  const email: EmailUpsertInput = {
    accountId,
    providerMessageId: gmailMessage.id,
    threadId: gmailMessage.threadId,

    // Core fields
    from,
    to,
    cc: parseEmailAddresses(getHeader('Cc')),
    bcc: parseEmailAddresses(getHeader('Bcc')),
    subject: getHeader('Subject') || '(No Subject)',
    bodyText,
    bodyHtml,
    snippet: gmailMessage.snippet,

    // Metadata
    date: new Date(parseInt(gmailMessage.internalDate)).toISOString(),
    receivedAt: getHeader('Received')
      ? new Date(getHeader('Received')!).toISOString()
      : undefined,

    // Flags and labels
    flags,
    labels: labelIds,

    // Threading
    inReplyTo: getHeader('In-Reply-To'),
    references: getHeader('References'),

    // Sync metadata
    rawHeaders: Object.fromEntries(
      headers.map((h) => [h.name, h.value])
    ),
    sizeBytes: gmailMessage.sizeEstimate,
    hasAttachments: gmailMessage.payload?.parts?.some(
      (part) => part.filename && part.filename.length > 0
    ),
  };

  return email;
}

/**
 * Gmail delta sync service
 */
export class GmailSync {
  constructor(private client: GmailClient, private accountId: number) {}

  /**
   * Perform initial full sync
   * Fetches all messages in inbox and stores them
   */
  async initialSync(maxMessages = 1000): Promise<GmailSyncResult> {
    console.log(`Starting initial sync for account ${this.accountId}...`);

    let messagesAdded = 0;
    let pageToken: string | undefined;
    const startTime = new Date().toISOString();

    do {
      // List messages (defaults to inbox)
      const listResult = await this.client.listMessages({
        maxResults: Math.min(100, maxMessages - messagesAdded),
        pageToken,
      });

      if (listResult.messages.length === 0) {
        break;
      }

      // Fetch full message details
      const messageIds = listResult.messages.map((m) => m.id);
      const messages = await this.client.batchGetMessages(
        messageIds,
        GmailMessageFormat.FULL
      );

      // Store each message
      for (const gmailMessage of messages) {
        try {
          const emailData = parseGmailMessage(gmailMessage, this.accountId);
          const email = await upsertEmail(emailData);

          // Extract and save attachment metadata
          const attachmentMetadata = extractAttachmentMetadata(gmailMessage);
          if (attachmentMetadata.length > 0) {
            upsertAttachmentsForEmail(email.id!, attachmentMetadata);
          }

          messagesAdded++;
        } catch (error) {
          console.error(
            `Failed to parse message ${gmailMessage.id}:`,
            error instanceof Error ? error.message : String(error)
          );
        }
      }

      pageToken = listResult.nextPageToken;

      console.log(`Synced ${messagesAdded} messages...`);
    } while (pageToken && messagesAdded < maxMessages);

    // Get current historyId for future delta syncs
    const lastMessage = await this.client.getMessage(
      (await this.client.listMessages({ maxResults: 1 })).messages[0].id,
      GmailMessageFormat.MINIMAL
    );

    return {
      messagesAdded,
      messagesDeleted: 0,
      labelsChanged: 0,
      newHistoryId: lastMessage.historyId,
      syncedAt: startTime,
    };
  }

  /**
   * Perform delta sync using History API
   * Only fetches changes since last historyId
   */
  async deltaSync(startHistoryId: string): Promise<GmailSyncResult> {
    console.log(
      `Starting delta sync from historyId ${startHistoryId} for account ${this.accountId}...`
    );

    let messagesAdded = 0;
    let messagesDeleted = 0;
    let labelsChanged = 0;
    let pageToken: string | undefined;
    let currentHistoryId = startHistoryId;
    const startTime = new Date().toISOString();

    const processedMessageIds = new Set<string>();

    do {
      // Get history changes
      const historyResult = await this.client.listHistory({
        startHistoryId,
        historyTypes: [
          GmailHistoryType.MESSAGE_ADDED,
          GmailHistoryType.MESSAGE_DELETED,
          GmailHistoryType.LABEL_ADDED,
          GmailHistoryType.LABEL_REMOVED,
        ],
        maxResults: 100,
        pageToken,
      });

      currentHistoryId = historyResult.historyId;

      // Process history records
      for (const record of historyResult.history) {
        // Handle messages added
        if (record.messagesAdded) {
          for (const added of record.messagesAdded) {
            if (processedMessageIds.has(added.message.id)) continue;
            processedMessageIds.add(added.message.id);

            try {
              const gmailMessage = await this.client.getMessage(
                added.message.id,
                GmailMessageFormat.FULL
              );
              const emailData = parseGmailMessage(gmailMessage, this.accountId);
              const email = await upsertEmail(emailData);

              // Extract and save attachment metadata
              const attachmentMetadata = extractAttachmentMetadata(gmailMessage);
              if (attachmentMetadata.length > 0) {
                upsertAttachmentsForEmail(email.id!, attachmentMetadata);
              }

              messagesAdded++;
            } catch (error) {
              console.error(
                `Failed to sync added message ${added.message.id}:`,
                error instanceof Error ? error.message : String(error)
              );
            }
          }
        }

        // Handle messages deleted
        if (record.messagesDeleted) {
          for (const deleted of record.messagesDeleted) {
            try {
              // Delete from local storage
              const email = await import('../../storage/services/email-storage.js').then(
                (m) => m.getEmailByProviderMessageId(this.accountId, deleted.message.id)
              );
              if (email) {
                await deleteEmail(email.id);
                messagesDeleted++;
              }
            } catch (error) {
              console.error(
                `Failed to delete message ${deleted.message.id}:`,
                error instanceof Error ? error.message : String(error)
              );
            }
          }
        }

        // Handle labels added/removed
        if (record.labelsAdded || record.labelsRemoved) {
          const messageIds = [
            ...(record.labelsAdded?.map((l) => l.message.id) || []),
            ...(record.labelsRemoved?.map((l) => l.message.id) || []),
          ];

          for (const messageId of messageIds) {
            if (processedMessageIds.has(messageId)) continue;
            processedMessageIds.add(messageId);

            try {
              // Re-fetch message to get updated labels
              const gmailMessage = await this.client.getMessage(
                messageId,
                GmailMessageFormat.FULL
              );
              const emailData = parseGmailMessage(gmailMessage, this.accountId);
              const email = await upsertEmail(emailData);

              // Extract and save attachment metadata
              const attachmentMetadata = extractAttachmentMetadata(gmailMessage);
              if (attachmentMetadata.length > 0) {
                upsertAttachmentsForEmail(email.id!, attachmentMetadata);
              }

              labelsChanged++;
            } catch (error) {
              console.error(
                `Failed to update labels for message ${messageId}:`,
                error instanceof Error ? error.message : String(error)
              );
            }
          }
        }
      }

      pageToken = historyResult.nextPageToken;
    } while (pageToken);

    console.log(
      `Delta sync complete: +${messagesAdded} -${messagesDeleted} ~${labelsChanged} messages`
    );

    return {
      messagesAdded,
      messagesDeleted,
      labelsChanged,
      newHistoryId: currentHistoryId,
      syncedAt: startTime,
    };
  }

  /**
   * Sync messages (auto-detect initial vs delta)
   */
  async sync(lastHistoryId?: string): Promise<GmailSyncResult> {
    if (!lastHistoryId) {
      return await this.initialSync();
    } else {
      return await this.deltaSync(lastHistoryId);
    }
  }
}

/**
 * Create Gmail sync service
 */
export function createGmailSync(
  client: GmailClient,
  accountId: number
): GmailSync {
  return new GmailSync(client, accountId);
}
