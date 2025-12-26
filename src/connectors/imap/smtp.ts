/**
 * SMTP Connection Manager
 *
 * Manages SMTP connections using nodemailer library.
 */

import { createTransport, Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import { SmtpConfig, ConnectionState } from './types.js';

/**
 * SMTP Connection Manager
 */
export class SmtpConnection {
  private transporter: Transporter<SMTPTransport.SentMessageInfo> | null = null;
  private config: SmtpConfig;
  private state: ConnectionState = ConnectionState.DISCONNECTED;

  constructor(config: SmtpConfig) {
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
    return this.state === ConnectionState.AUTHENTICATED && this.transporter !== null;
  }

  /**
   * Connect to SMTP server
   */
  async connect(): Promise<void> {
    if (this.isConnected()) {
      return;
    }

    this.state = ConnectionState.CONNECTING;

    try {
      this.transporter = createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: {
          user: this.config.auth.user,
          pass: this.config.auth.pass,
        },
        requireTLS: this.config.requireTLS ?? !this.config.secure,
        tls: this.config.tls,
        connectionTimeout: 15000,
        greetingTimeout: 10000,
      });

      this.state = ConnectionState.AUTHENTICATING;

      // Verify connection
      await this.transporter.verify();

      this.state = ConnectionState.AUTHENTICATED;
      console.error(`[SMTP] Connected to ${this.config.host}:${this.config.port}`);
    } catch (error) {
      this.state = ConnectionState.ERROR;
      throw this.mapConnectionError(error);
    }
  }

  /**
   * Disconnect from SMTP server
   */
  async disconnect(): Promise<void> {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
    }
    this.state = ConnectionState.DISCONNECTED;
    console.error('[SMTP] Disconnected');
  }

  /**
   * Send email
   */
  async sendMail(options: {
    from: string;
    to: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string;
    inReplyTo?: string;
    references?: string;
    attachments?: Array<{
      filename: string;
      content?: Buffer | string;
      path?: string;
      contentType?: string;
    }>;
  }): Promise<{ messageId: string }> {
    if (!this.transporter || !this.isConnected()) {
      throw new Error('SMTP not connected');
    }

    try {
      const result = await this.transporter.sendMail({
        from: options.from,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
        bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined,
        subject: options.subject,
        text: options.text,
        html: options.html,
        replyTo: options.replyTo,
        inReplyTo: options.inReplyTo,
        references: options.references,
        attachments: options.attachments,
      });

      console.error(`[SMTP] Email sent: ${result.messageId}`);
      return { messageId: result.messageId };
    } catch (error) {
      throw this.mapSendError(error);
    }
  }

  /**
   * Get the underlying nodemailer transporter
   */
  getTransporter(): Transporter<SMTPTransport.SentMessageInfo> {
    if (!this.transporter || !this.isConnected()) {
      throw new Error('SMTP not connected');
    }
    return this.transporter;
  }

  /**
   * Map SMTP connection errors to user-friendly messages
   */
  private mapConnectionError(error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('EAUTH') || message.includes('Invalid login')) {
      return new Error(
        'Invalid email or app password. ' +
          'For Gmail, create an app password at https://myaccount.google.com/apppasswords'
      );
    }

    if (message.includes('ENOTFOUND')) {
      return new Error(`SMTP server not found: ${this.config.host}. Check the server settings.`);
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

    if (message.includes('STARTTLS')) {
      return new Error('STARTTLS upgrade failed. Try using a secure connection (port 465).');
    }

    return new Error(`SMTP connection failed: ${message}`);
  }

  /**
   * Map SMTP send errors to user-friendly messages
   */
  private mapSendError(error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('553') || message.includes('relaying denied')) {
      return new Error('Email rejected: sender address not authorized. Check your from address.');
    }

    if (message.includes('550') || message.includes('does not exist')) {
      return new Error('Email rejected: recipient address does not exist.');
    }

    if (message.includes('552') || message.includes('size limit')) {
      return new Error('Email rejected: message too large.');
    }

    if (message.includes('421') || message.includes('rate limit')) {
      return new Error('Email rejected: rate limit exceeded. Try again later.');
    }

    return new Error(`Failed to send email: ${message}`);
  }
}

/**
 * Create SMTP connection from credentials
 */
export function createSmtpConnection(
  email: string,
  password: string,
  host: string,
  port: number,
  secure: boolean = false
): SmtpConnection {
  return new SmtpConnection({
    host,
    port,
    secure,
    auth: {
      user: email,
      pass: password,
    },
    requireTLS: !secure,
  });
}
