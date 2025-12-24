/**
 * Outlook Delta Sync
 *
 * Incremental email sync using Microsoft Graph delta queries.
 */

import { OutlookClient, GraphMessage } from './client.js';
import { upsertEmail } from '../../storage/services/email-storage.js';
import { upsertAttachmentsForEmail, AttachmentInsertInput } from '../../storage/services/attachment-storage.js';
import { EmailFlag, EmailAddress, EmailUpsertInput } from '../../types/email.js';

/**
 * Fetch attachment metadata for a message
 */
async function fetchAttachmentMetadata(
  client: OutlookClient,
  messageId: string
): Promise<Omit<AttachmentInsertInput, 'emailId'>[]> {
  try {
    const outlookAttachments = await client.listAttachments(messageId);

    return outlookAttachments.map((att) => ({
      filename: att.name,
      mimeType: att.contentType,
      sizeBytes: att.size,
      contentId: att.contentId,
      providerAttachmentId: att.id,
    }));
  } catch (error) {
    console.error(`Failed to fetch attachments for message ${messageId}:`, error);
    return [];
  }
}

/**
 * Convert Graph message to EmailUpsertInput
 */
function graphMessageToEmail(message: GraphMessage, accountId: number): EmailUpsertInput {
  // Convert recipients
  const to: EmailAddress[] = message.toRecipients.map((r) => ({
    address: r.emailAddress.address,
    name: r.emailAddress.name,
  }));

  const cc: EmailAddress[] | undefined = message.ccRecipients?.map((r) => ({
    address: r.emailAddress.address,
    name: r.emailAddress.name,
  }));

  const bcc: EmailAddress[] | undefined = message.bccRecipients?.map((r) => ({
    address: r.emailAddress.address,
    name: r.emailAddress.name,
  }));

  // Convert flags
  const flags: EmailFlag[] = [];
  if (message.isRead) flags.push(EmailFlag.SEEN);
  if (message.isDraft) flags.push(EmailFlag.DRAFT);
  if (message.flag?.flagStatus === 'flagged') flags.push(EmailFlag.FLAGGED);

  // Use categories as labels
  const labels = message.categories || [];

  // Determine body content
  const bodyText = message.body.contentType === 'text' ? message.body.content : undefined;
  const bodyHtml = message.body.contentType === 'html' ? message.body.content : undefined;

  return {
    accountId,
    providerMessageId: message.id,
    threadId: message.conversationId,
    from: {
      address: message.from.emailAddress.address,
      name: message.from.emailAddress.name,
    },
    to,
    cc,
    bcc,
    subject: message.subject,
    bodyText,
    bodyHtml,
    snippet: message.bodyPreview,
    date: message.receivedDateTime || message.sentDateTime,
    receivedAt: message.receivedDateTime,
    flags,
    labels,
    hasAttachments: message.hasAttachments,
    inReplyTo: message.internetMessageId,
  };
}

/**
 * Outlook sync service
 */
export class OutlookSync {
  private client: OutlookClient;
  private accountId: number;

  constructor(client: OutlookClient, accountId: number) {
    this.client = client;
    this.accountId = accountId;
  }

  /**
   * Perform initial sync (fetch all messages up to limit)
   */
  async initialSync(maxMessages: number = 1000): Promise<{
    messagesAdded: number;
    deltaLink: string;
    syncedAt: string;
  }> {
    console.error('Starting initial Outlook sync...');

    let messagesAdded = 0;
    let nextPageToken: string | undefined;
    let deltaLink = '';

    // Fetch messages in pages
    while (messagesAdded < maxMessages) {
      const response = await this.client.listMessages({
        maxResults: Math.min(250, maxMessages - messagesAdded),
        pageToken: nextPageToken,
      });

      // Process messages
      for (const message of response.value) {
        const emailInput = graphMessageToEmail(message, this.accountId);
        const email = upsertEmail(emailInput);

        // Fetch and save attachment metadata if message has attachments
        if (message.hasAttachments) {
          const attachmentMetadata = await fetchAttachmentMetadata(this.client, message.id);
          if (attachmentMetadata.length > 0) {
            upsertAttachmentsForEmail(email.id!, attachmentMetadata);
          }
        }

        messagesAdded++;

        if (messagesAdded >= maxMessages) {
          break;
        }
      }

      console.error(`Fetched ${messagesAdded} messages...`);

      // Check for next page
      if (response['@odata.nextLink'] && messagesAdded < maxMessages) {
        nextPageToken = response['@odata.nextLink'];
      } else {
        break;
      }
    }

    // Get delta link for future incremental syncs
    const deltaResponse = await this.client.getDelta();
    deltaLink = deltaResponse['@odata.deltaLink'] || '';

    return {
      messagesAdded,
      deltaLink,
      syncedAt: new Date().toISOString(),
    };
  }

  /**
   * Perform delta sync (fetch only changes since last sync)
   */
  async deltaSync(deltaLink: string): Promise<{
    messagesAdded: number;
    messagesDeleted: number;
    labelsChanged: number;
    deltaLink: string;
    syncedAt: string;
  }> {
    console.error('Starting Outlook delta sync...');

    let messagesAdded = 0;
    let messagesDeleted = 0;
    let labelsChanged = 0;
    let currentDeltaLink = deltaLink;
    let newDeltaLink = '';

    // Fetch delta changes
    while (true) {
      const response = await this.client.getDelta(currentDeltaLink);

      // Process changes
      for (const message of response.value) {
        // Check if message was deleted (Graph API marks with @removed annotation)
        if ((message as any)['@removed']) {
          messagesDeleted++;
          // Note: We don't actually delete from local storage for now
          continue;
        }

        const emailInput = graphMessageToEmail(message, this.accountId);
        const email = upsertEmail(emailInput);

        // Fetch and save attachment metadata if message has attachments
        if (message.hasAttachments) {
          const attachmentMetadata = await fetchAttachmentMetadata(this.client, message.id);
          if (attachmentMetadata.length > 0) {
            upsertAttachmentsForEmail(email.id!, attachmentMetadata);
          }
        }

        messagesAdded++;
      }

      console.error(`Processed ${messagesAdded} changes...`);

      // Check for next delta page
      if (response['@odata.nextLink']) {
        currentDeltaLink = response['@odata.nextLink'];
      } else if (response['@odata.deltaLink']) {
        newDeltaLink = response['@odata.deltaLink'];
        break;
      } else {
        throw new Error('Delta sync response missing both nextLink and deltaLink');
      }
    }

    return {
      messagesAdded,
      messagesDeleted,
      labelsChanged, // Graph API doesn't track this separately
      deltaLink: newDeltaLink,
      syncedAt: new Date().toISOString(),
    };
  }
}

/**
 * Create Outlook sync service
 */
export function createOutlookSync(client: OutlookClient, accountId: number): OutlookSync {
  return new OutlookSync(client, accountId);
}
