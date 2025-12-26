/**
 * IMAP Connection Manager
 *
 * Manages IMAP connections using imapflow library.
 */

import { ImapFlow } from 'imapflow';
import { ImapConfig, ConnectionState, ImapFolder } from './types.js';

/**
 * IMAP Connection Manager
 */
export class ImapConnection {
  private client: ImapFlow | null = null;
  private config: ImapConfig;
  private state: ConnectionState = ConnectionState.DISCONNECTED;

  constructor(config: ImapConfig) {
    this.config = config;
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === ConnectionState.AUTHENTICATED && this.client !== null;
  }

  /**
   * Get the underlying ImapFlow client
   */
  getClient(): ImapFlow {
    if (!this.client || !this.isConnected()) {
      throw new Error('IMAP not connected');
    }
    return this.client;
  }

  /**
   * Connect to IMAP server
   */
  async connect(): Promise<void> {
    if (this.isConnected()) {
      return;
    }

    this.state = ConnectionState.CONNECTING;

    try {
      this.client = new ImapFlow({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: {
          user: this.config.auth.user,
          pass: this.config.auth.pass,
        },
        logger: this.config.logger
          ? {
              debug: (msg: object) => console.error('[IMAP DEBUG]', msg),
              info: (msg: object) => console.error('[IMAP INFO]', msg),
              warn: (msg: object) => console.error('[IMAP WARN]', msg),
              error: (msg: object) => console.error('[IMAP ERROR]', msg),
            }
          : false,
        connectionTimeout: this.config.connectionTimeout || 30000,
        greetingTimeout: this.config.greetingTimeout || 15000,
        socketTimeout: this.config.socketTimeout || 300000,
      });

      // Handle connection events
      this.client.on('error', (err: Error) => {
        console.error('[IMAP] Connection error:', err.message);
        this.state = ConnectionState.ERROR;
      });

      this.client.on('close', () => {
        console.error('[IMAP] Connection closed');
        this.state = ConnectionState.DISCONNECTED;
      });

      this.state = ConnectionState.AUTHENTICATING;
      await this.client.connect();
      this.state = ConnectionState.AUTHENTICATED;

      console.error(`[IMAP] Connected to ${this.config.host}:${this.config.port}`);
    } catch (error) {
      this.state = ConnectionState.ERROR;
      throw this.mapConnectionError(error);
    }
  }

  /**
   * Disconnect from IMAP server
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.logout();
      } catch (error) {
        // Ignore logout errors
      }
      this.client = null;
    }
    this.state = ConnectionState.DISCONNECTED;
    console.error('[IMAP] Disconnected');
  }

  /**
   * List all mailboxes/folders
   */
  async listFolders(): Promise<ImapFolder[]> {
    const client = this.getClient();
    const folders: ImapFolder[] = [];

    const mailboxes = await client.list();

    for (const mailbox of mailboxes) {
      // Get folder status for message counts
      let messageCount = 0;
      let unseenCount = 0;
      let uidValidity: bigint | undefined;
      let uidNext: number | undefined;
      let highestModseq: bigint | undefined;

      try {
        const status = await client.status(mailbox.path, {
          messages: true,
          unseen: true,
          uidValidity: true,
          uidNext: true,
          highestModseq: true,
        });
        messageCount = status.messages ?? 0;
        unseenCount = status.unseen ?? 0;
        uidValidity = status.uidValidity;
        uidNext = status.uidNext;
        highestModseq = status.highestModseq;
      } catch {
        // Some folders may not support STATUS
      }

      folders.push({
        name: mailbox.name,
        path: mailbox.path,
        delimiter: mailbox.delimiter || '/',
        flags: mailbox.flags ? Array.from(mailbox.flags) : [],
        specialUse: this.mapSpecialUse(mailbox.specialUse),
        messageCount,
        unseenCount,
        uidValidity,
        uidNext,
        highestModseq,
      });
    }

    return folders;
  }

  /**
   * Select a mailbox for operations
   */
  async selectFolder(path: string): Promise<{ exists: number; uidValidity: bigint }> {
    const client = this.getClient();
    const mailbox = await client.mailboxOpen(path);
    return {
      exists: mailbox.exists,
      uidValidity: mailbox.uidValidity,
    };
  }

  /**
   * Send NOOP to keep connection alive
   */
  async noop(): Promise<boolean> {
    try {
      const client = this.getClient();
      await client.noop();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Map IMAP errors to user-friendly messages
   */
  private mapConnectionError(error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('AUTHENTICATIONFAILED') || message.includes('Invalid credentials')) {
      return new Error(
        'Invalid email or app password. ' +
          'For Gmail, create an app password at https://myaccount.google.com/apppasswords'
      );
    }

    if (message.includes('ENOTFOUND')) {
      return new Error(`Server not found: ${this.config.host}. Check the IMAP host setting.`);
    }

    if (message.includes('ETIMEDOUT') || message.includes('timeout')) {
      return new Error('Connection timed out. Check your internet connection and firewall settings.');
    }

    if (message.includes('ECONNREFUSED')) {
      return new Error(`Connection refused by ${this.config.host}:${this.config.port}. Check server settings.`);
    }

    if (message.includes('certificate')) {
      return new Error('SSL certificate error. The server certificate could not be verified.');
    }

    return new Error(`IMAP connection failed: ${message}`);
  }

  /**
   * Map special use flags to our enum
   */
  private mapSpecialUse(
    specialUse?: string
  ): 'inbox' | 'sent' | 'drafts' | 'trash' | 'junk' | 'archive' | 'all' | undefined {
    if (!specialUse) return undefined;

    const mapping: Record<string, 'inbox' | 'sent' | 'drafts' | 'trash' | 'junk' | 'archive' | 'all'> = {
      '\\Inbox': 'inbox',
      '\\Sent': 'sent',
      '\\Drafts': 'drafts',
      '\\Trash': 'trash',
      '\\Junk': 'junk',
      '\\Archive': 'archive',
      '\\All': 'all',
    };

    return mapping[specialUse];
  }
}

/**
 * Create IMAP connection from credentials
 */
export function createImapConnection(
  email: string,
  password: string,
  host: string,
  port: number,
  secure: boolean = true
): ImapConnection {
  return new ImapConnection({
    host,
    port,
    secure,
    auth: {
      user: email,
      pass: password,
    },
  });
}
