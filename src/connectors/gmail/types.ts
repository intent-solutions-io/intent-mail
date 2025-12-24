/**
 * Gmail-Specific Types
 *
 * Types for Gmail API responses and connector state.
 */

/**
 * Gmail OAuth configuration
 */
export interface GmailOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

/**
 * Gmail OAuth tokens
 */
export interface GmailTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO 8601
}

/**
 * Gmail History Types
 * https://developers.google.com/gmail/api/reference/rest/v1/users.history
 */
export enum GmailHistoryType {
  MESSAGE_ADDED = 'messageAdded',
  MESSAGE_DELETED = 'messageDeleted',
  LABEL_ADDED = 'labelAdded',
  LABEL_REMOVED = 'labelRemoved',
}

/**
 * Gmail message format options
 */
export enum GmailMessageFormat {
  MINIMAL = 'minimal',
  FULL = 'full',
  RAW = 'raw',
  METADATA = 'metadata',
}

/**
 * Gmail History record
 */
export interface GmailHistoryRecord {
  id: string;
  messages?: Array<{
    id: string;
    threadId: string;
  }>;
  messagesAdded?: Array<{
    message: {
      id: string;
      threadId: string;
      labelIds?: string[];
    };
  }>;
  messagesDeleted?: Array<{
    message: {
      id: string;
      threadId: string;
    };
  }>;
  labelsAdded?: Array<{
    message: {
      id: string;
      threadId: string;
    };
    labelIds: string[];
  }>;
  labelsRemoved?: Array<{
    message: {
      id: string;
      threadId: string;
    };
    labelIds: string[];
  }>;
}

/**
 * Gmail sync state
 */
export interface GmailSyncState {
  historyId: string;
  lastSyncAt: string; // ISO 8601
}

/**
 * Gmail label
 */
export interface GmailLabel {
  id: string;
  name: string;
  type: 'system' | 'user';
  messageListVisibility?: 'show' | 'hide';
  labelListVisibility?: 'labelShow' | 'labelHide';
}

/**
 * Gmail message metadata
 */
export interface GmailMessageMetadata {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string; // Epoch milliseconds as string
  sizeEstimate: number;
}

/**
 * Gmail message header
 */
export interface GmailMessageHeader {
  name: string;
  value: string;
}

/**
 * Gmail message part (for multipart messages)
 */
export interface GmailMessagePart {
  partId: string;
  mimeType: string;
  filename?: string;
  headers: GmailMessageHeader[];
  body: {
    attachmentId?: string;
    size: number;
    data?: string; // Base64url encoded
  };
  parts?: GmailMessagePart[]; // Nested parts for multipart
}

/**
 * Gmail full message
 */
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  sizeEstimate: number;
  raw?: string; // Base64url encoded (format=raw)
  payload?: {
    partId: string;
    mimeType: string;
    filename: string;
    headers: GmailMessageHeader[];
    body: {
      attachmentId?: string;
      size: number;
      data?: string; // Base64url encoded
    };
    parts?: GmailMessagePart[];
  };
}

/**
 * Gmail API error response
 */
export interface GmailApiError {
  code: number;
  message: string;
  errors?: Array<{
    domain: string;
    reason: string;
    message: string;
  }>;
}

/**
 * Standard Gmail labels (system)
 */
export enum GmailSystemLabel {
  INBOX = 'INBOX',
  SENT = 'SENT',
  DRAFT = 'DRAFT',
  TRASH = 'TRASH',
  SPAM = 'SPAM',
  STARRED = 'STARRED',
  IMPORTANT = 'IMPORTANT',
  UNREAD = 'UNREAD',
  CATEGORY_PERSONAL = 'CATEGORY_PERSONAL',
  CATEGORY_SOCIAL = 'CATEGORY_SOCIAL',
  CATEGORY_PROMOTIONS = 'CATEGORY_PROMOTIONS',
  CATEGORY_UPDATES = 'CATEGORY_UPDATES',
  CATEGORY_FORUMS = 'CATEGORY_FORUMS',
}

/**
 * Gmail sync result
 */
export interface GmailSyncResult {
  messagesAdded: number;
  messagesDeleted: number;
  labelsChanged: number;
  newHistoryId: string;
  syncedAt: string; // ISO 8601
}
