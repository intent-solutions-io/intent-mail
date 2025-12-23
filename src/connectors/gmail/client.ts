/**
 * Gmail API Client
 *
 * Wrapper around Google APIs client for Gmail operations.
 */

import { google, gmail_v1 } from 'googleapis';
import { GmailOAuth } from './oauth.js';
import {
  GmailMessage,
  GmailMessageFormat,
  GmailHistoryRecord,
  GmailLabel,
  GmailMessageMetadata,
} from './types.js';

/**
 * Gmail API client wrapper
 */
export class GmailClient {
  private gmail: gmail_v1.Gmail;
  private userId = 'me'; // Special value for authenticated user

  constructor(oauth: GmailOAuth) {
    this.gmail = google.gmail({ version: 'v1', auth: oauth.getClient() });
  }

  /**
   * Get user's email address
   */
  async getUserProfile(): Promise<{ emailAddress: string; messagesTotal: number }> {
    const response = await this.gmail.users.getProfile({ userId: this.userId });

    return {
      emailAddress: response.data.emailAddress || '',
      messagesTotal: response.data.messagesTotal || 0,
    };
  }

  /**
   * Get a single message by ID
   */
  async getMessage(
    messageId: string,
    format: GmailMessageFormat = GmailMessageFormat.FULL
  ): Promise<GmailMessage> {
    const response = await this.gmail.users.messages.get({
      userId: this.userId,
      id: messageId,
      format,
    });

    return response.data as GmailMessage;
  }

  /**
   * List messages with optional query
   * https://support.google.com/mail/answer/7190?hl=en (Gmail search operators)
   */
  async listMessages(params: {
    query?: string;
    labelIds?: string[];
    maxResults?: number;
    pageToken?: string;
  }): Promise<{
    messages: GmailMessageMetadata[];
    nextPageToken?: string;
    resultSizeEstimate: number;
  }> {
    const response = await this.gmail.users.messages.list({
      userId: this.userId,
      q: params.query,
      labelIds: params.labelIds,
      maxResults: params.maxResults || 50,
      pageToken: params.pageToken,
    });

    return {
      messages: (response.data.messages || []) as GmailMessageMetadata[],
      nextPageToken: response.data.nextPageToken || undefined,
      resultSizeEstimate: response.data.resultSizeEstimate || 0,
    };
  }

  /**
   * Get message history (changes since historyId)
   * https://developers.google.com/gmail/api/reference/rest/v1/users.history/list
   */
  async listHistory(params: {
    startHistoryId: string;
    historyTypes?: string[];
    labelId?: string;
    maxResults?: number;
    pageToken?: string;
  }): Promise<{
    history: GmailHistoryRecord[];
    nextPageToken?: string;
    historyId: string;
  }> {
    const response = await this.gmail.users.history.list({
      userId: this.userId,
      startHistoryId: params.startHistoryId,
      historyTypes: params.historyTypes,
      labelId: params.labelId,
      maxResults: params.maxResults || 100,
      pageToken: params.pageToken,
    });

    return {
      history: (response.data.history || []) as GmailHistoryRecord[],
      nextPageToken: response.data.nextPageToken || undefined,
      historyId: response.data.historyId || params.startHistoryId,
    };
  }

  /**
   * Batch get multiple messages
   * More efficient than individual getMessage calls
   */
  async batchGetMessages(
    messageIds: string[],
    format: GmailMessageFormat = GmailMessageFormat.FULL
  ): Promise<GmailMessage[]> {
    // Gmail API doesn't have a native batch get, so we use batch requests
    const messages: GmailMessage[] = [];

    // Process in chunks of 100 (API limit)
    const chunkSize = 100;
    for (let i = 0; i < messageIds.length; i += chunkSize) {
      const chunk = messageIds.slice(i, i + chunkSize);

      const promises = chunk.map((id) => this.getMessage(id, format));
      const results = await Promise.all(promises);

      messages.push(...results);
    }

    return messages;
  }

  /**
   * Get all labels
   */
  async listLabels(): Promise<GmailLabel[]> {
    const response = await this.gmail.users.labels.list({
      userId: this.userId,
    });

    return (response.data.labels || []).map((label) => ({
      id: label.id || '',
      name: label.name || '',
      type: label.type === 'system' ? 'system' : 'user',
      messageListVisibility: label.messageListVisibility as 'show' | 'hide',
      labelListVisibility: label.labelListVisibility as 'labelShow' | 'labelHide',
    }));
  }

  /**
   * Modify message labels
   */
  async modifyMessageLabels(
    messageId: string,
    addLabelIds?: string[],
    removeLabelIds?: string[]
  ): Promise<GmailMessage> {
    const response = await this.gmail.users.messages.modify({
      userId: this.userId,
      id: messageId,
      requestBody: {
        addLabelIds,
        removeLabelIds,
      },
    });

    return response.data as GmailMessage;
  }

  /**
   * Trash a message
   */
  async trashMessage(messageId: string): Promise<GmailMessage> {
    const response = await this.gmail.users.messages.trash({
      userId: this.userId,
      id: messageId,
    });

    return response.data as GmailMessage;
  }

  /**
   * Untrash a message
   */
  async untrashMessage(messageId: string): Promise<GmailMessage> {
    const response = await this.gmail.users.messages.untrash({
      userId: this.userId,
      id: messageId,
    });

    return response.data as GmailMessage;
  }

  /**
   * Permanently delete a message
   */
  async deleteMessage(messageId: string): Promise<void> {
    await this.gmail.users.messages.delete({
      userId: this.userId,
      id: messageId,
    });
  }

  /**
   * Send a message
   */
  async sendMessage(rawMessage: string): Promise<GmailMessage> {
    const response = await this.gmail.users.messages.send({
      userId: this.userId,
      requestBody: {
        raw: rawMessage, // Base64url encoded RFC 2822 message
      },
    });

    return response.data as GmailMessage;
  }

  /**
   * Get attachment data
   */
  async getAttachment(
    messageId: string,
    attachmentId: string
  ): Promise<{ data: string; size: number }> {
    const response = await this.gmail.users.messages.attachments.get({
      userId: this.userId,
      messageId,
      id: attachmentId,
    });

    return {
      data: response.data.data || '',
      size: response.data.size || 0,
    };
  }

  /**
   * Watch for changes (push notifications)
   * Requires setting up Cloud Pub/Sub topic
   */
  async watch(topicName: string, labelIds?: string[]): Promise<{
    historyId: string;
    expiration: string;
  }> {
    const response = await this.gmail.users.watch({
      userId: this.userId,
      requestBody: {
        topicName,
        labelIds,
      },
    });

    return {
      historyId: response.data.historyId || '',
      expiration: response.data.expiration ? String(response.data.expiration) : '',
    };
  }

  /**
   * Stop watching for changes
   */
  async stopWatch(): Promise<void> {
    await this.gmail.users.stop({
      userId: this.userId,
    });
  }
}

/**
 * Create Gmail client from OAuth instance
 */
export function createGmailClient(oauth: GmailOAuth): GmailClient {
  return new GmailClient(oauth);
}
