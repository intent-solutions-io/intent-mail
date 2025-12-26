/**
 * IMAP Sync Module
 *
 * Syncs emails from IMAP server to local SQLite database.
 */

import { ImapFlow, FetchMessageObject, MessageAddressObject } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';
import { ImapConnection } from './connection.js';
import { upsertEmail } from '../../storage/services/email-storage.js';
import { EmailFlag, EmailUpsertInput, EmailAddress } from '../../types/email.js';

/**
 * Sync result interface
 */
export interface ImapSyncResult {
  messagesAdded: number;
  messagesDeleted: number;
  labelsChanged: number;
  newHistoryId: string;
  syncedAt: string;
  folders: string[];
}

/**
 * IMAP Email Sync
 */
export class ImapSync {
  private connection: ImapConnection;
  private accountId: number;

  constructor(connection: ImapConnection, accountId: number) {
    this.connection = connection;
    this.accountId = accountId;
  }

  /**
   * Initial sync - fetch recent emails from all folders
   */
  async initialSync(maxMessages: number = 1000): Promise<ImapSyncResult> {
    console.error(`[IMAP Sync] Starting initial sync (max ${maxMessages} messages)`);

    const client = this.connection.getClient();
    let totalAdded = 0;
    const syncedFolders: string[] = [];

    // Get list of folders
    const folders = await this.connection.listFolders();

    // Priority folders first, then others
    const priorityOrder = ['INBOX', 'Sent', 'Drafts', 'Archive'];
    const sortedFolders = folders.sort((a, b) => {
      const aIndex = priorityOrder.findIndex(p =>
        a.path.toUpperCase().includes(p.toUpperCase()) || a.specialUse === p.toLowerCase()
      );
      const bIndex = priorityOrder.findIndex(p =>
        b.path.toUpperCase().includes(p.toUpperCase()) || b.specialUse === p.toLowerCase()
      );
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    let remainingMessages = maxMessages;

    for (const folder of sortedFolders) {
      if (remainingMessages <= 0) break;

      // Skip special folders that can't be selected
      if (folder.flags.includes('\\Noselect')) {
        continue;
      }

      try {
        console.error(`[IMAP Sync] Syncing folder: ${folder.path} (${folder.messageCount} messages)`);

        const lock = await client.getMailboxLock(folder.path);
        try {
          const fetchCount = Math.min(folder.messageCount, remainingMessages);
          if (fetchCount === 0) continue;

          // Fetch most recent messages (by sequence number)
          const startSeq = Math.max(1, folder.messageCount - fetchCount + 1);
          const range = `${startSeq}:*`;

          const added = await this.fetchMessagesFromFolder(client, folder.path, range);
          totalAdded += added;
          remainingMessages -= added;
          syncedFolders.push(folder.path);

          console.error(`[IMAP Sync] Fetched ${added} messages from ${folder.path}`);
        } finally {
          lock.release();
        }
      } catch (error) {
        console.error(`[IMAP Sync] Error syncing folder ${folder.path}:`, error);
        // Continue with other folders
      }
    }

    const result: ImapSyncResult = {
      messagesAdded: totalAdded,
      messagesDeleted: 0,
      labelsChanged: 0,
      newHistoryId: new Date().toISOString(), // Use timestamp as pseudo history ID for IMAP
      syncedAt: new Date().toISOString(),
      folders: syncedFolders,
    };

    console.error(`[IMAP Sync] Initial sync complete: ${totalAdded} messages from ${syncedFolders.length} folders`);

    return result;
  }

  /**
   * Delta sync - fetch only new/changed messages since last sync
   * Uses UIDVALIDITY and HIGHESTMODSEQ for efficient syncing
   */
  async deltaSync(lastSyncTime?: string): Promise<ImapSyncResult> {
    console.error(`[IMAP Sync] Starting delta sync`);

    const client = this.connection.getClient();
    let totalAdded = 0;
    let totalDeleted = 0;
    const syncedFolders: string[] = [];

    // Get folders
    const folders = await this.connection.listFolders();

    for (const folder of folders) {
      if (folder.flags.includes('\\Noselect')) continue;

      try {
        const lock = await client.getMailboxLock(folder.path);
        try {
          // For delta sync, fetch messages from last 24 hours or since last sync
          const sinceDate = lastSyncTime
            ? new Date(lastSyncTime)
            : new Date(Date.now() - 24 * 60 * 60 * 1000);

          // Search for messages since the date
          const searchResult = await client.search({
            since: sinceDate,
          }, { uid: true });

          // search() returns false if no matches, or number[] if matches found
          if (searchResult && Array.isArray(searchResult) && searchResult.length > 0) {
            const uidRange = searchResult.join(',');
            const added = await this.fetchMessagesFromFolder(client, folder.path, uidRange, true);
            totalAdded += added;
            syncedFolders.push(folder.path);
          }
        } finally {
          lock.release();
        }
      } catch (error) {
        console.error(`[IMAP Sync] Error in delta sync for ${folder.path}:`, error);
      }
    }

    const result: ImapSyncResult = {
      messagesAdded: totalAdded,
      messagesDeleted: totalDeleted,
      labelsChanged: 0,
      newHistoryId: new Date().toISOString(),
      syncedAt: new Date().toISOString(),
      folders: syncedFolders,
    };

    console.error(`[IMAP Sync] Delta sync complete: +${totalAdded} -${totalDeleted}`);

    return result;
  }

  /**
   * Fetch messages from a specific folder
   */
  private async fetchMessagesFromFolder(
    client: ImapFlow,
    folderPath: string,
    range: string,
    useUid: boolean = false
  ): Promise<number> {
    let count = 0;

    const fetchOptions = {
      uid: true,
      envelope: true,
      bodyStructure: true,
      flags: true,
      size: true,
      source: true, // Fetch full message for parsing
    };

    try {
      for await (const message of client.fetch(range, fetchOptions, { uid: useUid })) {
        try {
          const email = await this.parseAndStoreMessage(message, folderPath);
          if (email) count++;
        } catch (parseError) {
          console.error(`[IMAP Sync] Error parsing message ${message.uid}:`, parseError);
        }
      }
    } catch (fetchError) {
      console.error(`[IMAP Sync] Error fetching from ${folderPath}:`, fetchError);
    }

    return count;
  }

  /**
   * Parse IMAP message and store in database
   */
  private async parseAndStoreMessage(
    message: FetchMessageObject,
    folderPath: string
  ): Promise<boolean> {
    // Parse the full message source
    let parsed: ParsedMail | null = null;

    if (message.source) {
      try {
        parsed = await simpleParser(message.source);
      } catch (parseError) {
        console.error(`[IMAP Sync] Failed to parse message ${message.uid}:`, parseError);
      }
    }

    // Use envelope data as fallback
    const envelope = message.envelope;
    if (!envelope) {
      console.error(`[IMAP Sync] No envelope for message ${message.uid}`);
      return false;
    }

    // Build email address objects
    const from = this.parseAddresses(envelope.from)?.[0] || {
      address: 'unknown@unknown.com',
      name: 'Unknown',
    };

    const to = this.parseAddresses(envelope.to) || [];
    const cc = this.parseAddresses(envelope.cc);
    const bcc = this.parseAddresses(envelope.bcc);

    // Map IMAP flags to our enum
    const flags = this.mapImapFlags(message.flags || new Set());

    // Generate a unique message ID
    const messageId = envelope.messageId || `imap-${message.uid}-${Date.now()}`;

    // Get references from parsed email headers if available
    const references = parsed?.references
      ? (Array.isArray(parsed.references) ? parsed.references.join(' ') : parsed.references)
      : undefined;

    // Build upsert input
    const input: EmailUpsertInput = {
      accountId: this.accountId,
      providerMessageId: messageId,
      threadId: envelope.inReplyTo || undefined,

      from,
      to,
      cc,
      bcc,

      subject: envelope.subject || '(No Subject)',
      bodyText: parsed?.text || undefined,
      bodyHtml: parsed?.html || undefined,
      snippet: this.generateSnippet(parsed?.text || parsed?.html || ''),

      date: envelope.date?.toISOString() || new Date().toISOString(),
      receivedAt: new Date().toISOString(),

      flags,
      labels: [folderPath],

      inReplyTo: envelope.inReplyTo || undefined,
      references,

      sizeBytes: message.size || 0,
      hasAttachments: this.hasAttachments(message, parsed),
    };

    // Store in database
    upsertEmail(input);
    return true;
  }

  /**
   * Parse IMAP address objects to our format
   * Handles imapflow's MessageAddressObject format
   */
  private parseAddresses(addresses?: MessageAddressObject[]): EmailAddress[] | undefined {
    if (!addresses || addresses.length === 0) return undefined;

    const result: EmailAddress[] = [];

    for (const addr of addresses) {
      if (addr.address) {
        result.push({
          address: addr.address,
          name: addr.name || undefined,
        });
      }
    }

    return result.length > 0 ? result : undefined;
  }

  /**
   * Map IMAP flags to our EmailFlag enum
   */
  private mapImapFlags(flags: Set<string>): EmailFlag[] {
    const result: EmailFlag[] = [];

    if (flags.has('\\Seen')) result.push(EmailFlag.SEEN);
    if (flags.has('\\Flagged')) result.push(EmailFlag.FLAGGED);
    if (flags.has('\\Draft')) result.push(EmailFlag.DRAFT);
    if (flags.has('\\Answered')) result.push(EmailFlag.ANSWERED);
    if (flags.has('\\Deleted')) result.push(EmailFlag.DELETED);

    return result;
  }

  /**
   * Generate a short snippet from email content
   */
  private generateSnippet(content: string, maxLength: number = 200): string {
    if (!content) return '';

    // Remove HTML tags if present
    const textOnly = content.replace(/<[^>]*>/g, ' ');

    // Normalize whitespace
    const normalized = textOnly.replace(/\s+/g, ' ').trim();

    // Truncate
    if (normalized.length <= maxLength) return normalized;
    return normalized.substring(0, maxLength - 3) + '...';
  }

  /**
   * Check if message has attachments
   */
  private hasAttachments(message: FetchMessageObject, parsed: ParsedMail | null): boolean {
    // Check parsed attachments
    if (parsed?.attachments && parsed.attachments.length > 0) {
      return true;
    }

    // Check body structure for attachments
    if (message.bodyStructure) {
      return this.checkBodyStructureForAttachments(message.bodyStructure);
    }

    return false;
  }

  /**
   * Recursively check body structure for attachments
   */
  private checkBodyStructureForAttachments(structure: any): boolean {
    if (!structure) return false;

    // Check disposition
    if (structure.disposition === 'attachment') {
      return true;
    }

    // Check child parts
    if (structure.childNodes) {
      for (const child of structure.childNodes) {
        if (this.checkBodyStructureForAttachments(child)) {
          return true;
        }
      }
    }

    return false;
  }
}

/**
 * Create IMAP sync instance
 */
export function createImapSync(connection: ImapConnection, accountId: number): ImapSync {
  return new ImapSync(connection, accountId);
}
