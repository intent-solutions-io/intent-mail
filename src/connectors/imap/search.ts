/**
 * IMAP Search Module
 *
 * Search emails directly on IMAP server without full sync.
 */

import { SearchObject } from 'imapflow';
import { simpleParser } from 'mailparser';
import { ImapConnection } from './connection.js';
import { EmailAddress } from '../../types/email.js';

/**
 * IMAP search options
 */
export interface ImapSearchOptions {
  folder?: string;       // Folder to search (default: INBOX)
  query?: string;        // Text to search in subject/body
  from?: string;         // From address filter
  to?: string;           // To address filter
  subject?: string;      // Subject filter
  since?: Date;          // Messages since date
  before?: Date;         // Messages before date
  seen?: boolean;        // Filter by seen status
  flagged?: boolean;     // Filter by flagged status
  hasAttachment?: boolean; // Filter by attachment presence
  limit?: number;        // Max results (default: 50)
}

/**
 * IMAP search result
 */
export interface ImapSearchResult {
  uid: number;
  messageId: string;
  from: EmailAddress;
  to: EmailAddress[];
  subject: string;
  date: Date;
  snippet: string;
  flags: string[];
  hasAttachments: boolean;
  size: number;
}

/**
 * IMAP Search
 */
export class ImapSearch {
  private connection: ImapConnection;

  constructor(connection: ImapConnection) {
    this.connection = connection;
  }

  /**
   * Search emails on IMAP server
   */
  async search(options: ImapSearchOptions): Promise<ImapSearchResult[]> {
    const client = this.connection.getClient();
    const folder = options.folder || 'INBOX';
    const limit = options.limit || 50;

    console.error(`[IMAP Search] Searching in ${folder}...`);

    const lock = await client.getMailboxLock(folder);
    try {
      // Build IMAP search query
      const searchQuery = this.buildSearchQuery(options);

      // Execute search
      const searchResult = await client.search(searchQuery, { uid: true });

      if (!searchResult || !Array.isArray(searchResult) || searchResult.length === 0) {
        console.error('[IMAP Search] No results found');
        return [];
      }

      console.error(`[IMAP Search] Found ${searchResult.length} matches, fetching up to ${limit}...`);

      // Limit results and fetch in reverse order (newest first)
      const uidsToFetch = searchResult.slice(-limit).reverse();
      const uidRange = uidsToFetch.join(',');

      // Fetch message details
      const results: ImapSearchResult[] = [];

      for await (const message of client.fetch(uidRange, {
        uid: true,
        envelope: true,
        flags: true,
        size: true,
        bodyStructure: true,
        source: { start: 0, maxLength: 2000 }, // Just enough for snippet
      }, { uid: true })) {
        try {
          const result = await this.parseSearchResult(message);
          if (result) {
            results.push(result);
          }
        } catch (err) {
          console.error(`[IMAP Search] Error parsing message ${message.uid}:`, err);
        }
      }

      return results;
    } finally {
      lock.release();
    }
  }

  /**
   * Build IMAP SEARCH query from options
   */
  private buildSearchQuery(options: ImapSearchOptions): SearchObject {
    const query: SearchObject = {};

    // Text search in subject and body
    if (options.query) {
      // IMAP OR search for text in multiple fields
      query.or = [
        { subject: options.query },
        { body: options.query },
      ];
    }

    // From filter
    if (options.from) {
      query.from = options.from;
    }

    // To filter
    if (options.to) {
      query.to = options.to;
    }

    // Subject filter (more specific than query)
    if (options.subject && !options.query) {
      query.subject = options.subject;
    }

    // Date filters
    if (options.since) {
      query.since = options.since;
    }

    if (options.before) {
      query.before = options.before;
    }

    // Flag filters
    if (options.seen !== undefined) {
      query.seen = options.seen;
    }

    if (options.flagged !== undefined) {
      query.flagged = options.flagged;
    }

    return query;
  }

  /**
   * Parse fetch result into search result
   */
  private async parseSearchResult(message: any): Promise<ImapSearchResult | null> {
    const envelope = message.envelope;
    if (!envelope) return null;

    // Parse from address
    const fromAddr = envelope.from?.[0];
    const from: EmailAddress = fromAddr
      ? { address: fromAddr.address || 'unknown', name: fromAddr.name }
      : { address: 'unknown' };

    // Parse to addresses
    const to: EmailAddress[] = (envelope.to || []).map((addr: any) => ({
      address: addr.address || 'unknown',
      name: addr.name,
    }));

    // Get snippet from partial source
    let snippet = '';
    if (message.source) {
      try {
        const parsed = await simpleParser(message.source);
        const text = parsed.text || '';
        snippet = text.substring(0, 200).replace(/\s+/g, ' ').trim();
        if (text.length > 200) snippet += '...';
      } catch {
        // Ignore parse errors for snippet
      }
    }

    // Map flags
    const flags: string[] = [];
    if (message.flags?.has('\\Seen')) flags.push('SEEN');
    if (message.flags?.has('\\Flagged')) flags.push('FLAGGED');
    if (message.flags?.has('\\Answered')) flags.push('ANSWERED');
    if (message.flags?.has('\\Draft')) flags.push('DRAFT');

    // Check for attachments
    const hasAttachments = this.checkForAttachments(message.bodyStructure);

    return {
      uid: message.uid,
      messageId: envelope.messageId || `imap-${message.uid}`,
      from,
      to,
      subject: envelope.subject || '(No Subject)',
      date: envelope.date || new Date(),
      snippet,
      flags,
      hasAttachments,
      size: message.size || 0,
    };
  }

  /**
   * Check body structure for attachments
   */
  private checkForAttachments(structure: any): boolean {
    if (!structure) return false;

    if (structure.disposition === 'attachment') {
      return true;
    }

    if (structure.childNodes) {
      for (const child of structure.childNodes) {
        if (this.checkForAttachments(child)) {
          return true;
        }
      }
    }

    return false;
  }
}

/**
 * Create IMAP search instance
 */
export function createImapSearch(connection: ImapConnection): ImapSearch {
  return new ImapSearch(connection);
}
