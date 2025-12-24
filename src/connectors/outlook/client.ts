/**
 * Outlook Graph API Client
 *
 * Microsoft Graph API client for email operations.
 */

import { OutlookOAuth } from './oauth.js';

/**
 * Graph API base URL
 */
const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * User profile from Graph API
 */
export interface OutlookUserProfile {
  emailAddress: string;
  displayName: string;
  id: string;
}

/**
 * Email address in Graph API format
 */
export interface GraphEmailAddress {
  name?: string;
  address: string;
}

/**
 * Message from Graph API
 */
export interface GraphMessage {
  id: string;
  conversationId: string;
  subject: string;
  bodyPreview: string;
  body: {
    contentType: string;
    content: string;
  };
  from: {
    emailAddress: GraphEmailAddress;
  };
  toRecipients: Array<{ emailAddress: GraphEmailAddress }>;
  ccRecipients?: Array<{ emailAddress: GraphEmailAddress }>;
  bccRecipients?: Array<{ emailAddress: GraphEmailAddress }>;
  receivedDateTime: string;
  sentDateTime: string;
  hasAttachments: boolean;
  isRead: boolean;
  isDraft: boolean;
  flag?: {
    flagStatus: string;
  };
  categories?: string[];
  internetMessageId?: string;
  conversationIndex?: string;
}

/**
 * Messages response from Graph API
 */
export interface GraphMessagesResponse {
  value: GraphMessage[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

/**
 * Outlook Graph API client
 */
export class OutlookClient {
  private oauth: OutlookOAuth;

  constructor(oauth: OutlookOAuth) {
    this.oauth = oauth;
  }

  /**
   * Make authenticated Graph API request
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const accessToken = this.oauth.getAccessToken();

    const response = await fetch(`${GRAPH_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Graph API request failed: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get user profile
   */
  async getUserProfile(): Promise<OutlookUserProfile> {
    const data = await this.request<{ mail: string; displayName: string; id: string }>('/me');

    return {
      emailAddress: data.mail,
      displayName: data.displayName,
      id: data.id,
    };
  }

  /**
   * List messages (paginated)
   */
  async listMessages(options: {
    maxResults?: number;
    pageToken?: string;
  }): Promise<GraphMessagesResponse> {
    const params = new URLSearchParams();

    if (options.maxResults) {
      params.set('$top', options.maxResults.toString());
    }

    // Select only fields we need to reduce payload size
    params.set(
      '$select',
      'id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,hasAttachments,isRead,isDraft,flag,categories,internetMessageId,conversationIndex'
    );

    params.set('$orderby', 'receivedDateTime desc');

    const endpoint = options.pageToken || `/me/messages?${params}`;

    return this.request<GraphMessagesResponse>(endpoint);
  }

  /**
   * Get delta changes (incremental sync)
   */
  async getDelta(deltaLink?: string): Promise<GraphMessagesResponse> {
    const endpoint = deltaLink || '/me/messages/delta';

    return this.request<GraphMessagesResponse>(endpoint);
  }

  /**
   * Get single message by ID
   */
  async getMessage(messageId: string): Promise<GraphMessage> {
    return this.request<GraphMessage>(`/me/messages/${messageId}`);
  }

  /**
   * Send message
   */
  async sendMessage(message: {
    subject: string;
    body: {
      contentType: 'Text' | 'HTML';
      content: string;
    };
    toRecipients: Array<{ emailAddress: GraphEmailAddress }>;
    ccRecipients?: Array<{ emailAddress: GraphEmailAddress }>;
    bccRecipients?: Array<{ emailAddress: GraphEmailAddress }>;
    internetMessageId?: string;
  }): Promise<void> {
    await this.request<void>('/me/sendMail', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  /**
   * Mark message as read/unread
   */
  async updateMessage(messageId: string, update: { isRead?: boolean }): Promise<GraphMessage> {
    return this.request<GraphMessage>(`/me/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    });
  }

  /**
   * Add categories (labels) to message
   */
  async addCategories(messageId: string, categories: string[]): Promise<GraphMessage> {
    // Get current categories
    const message = await this.getMessage(messageId);
    const currentCategories = message.categories || [];

    // Merge and deduplicate
    const newCategories = Array.from(new Set([...currentCategories, ...categories]));

    return this.request<GraphMessage>(`/me/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ categories: newCategories }),
    });
  }

  /**
   * Remove categories from message
   */
  async removeCategories(messageId: string, categoriesToRemove: string[]): Promise<GraphMessage> {
    // Get current categories
    const message = await this.getMessage(messageId);
    const currentCategories = message.categories || [];

    // Filter out categories to remove
    const newCategories = currentCategories.filter((cat) => !categoriesToRemove.includes(cat));

    return this.request<GraphMessage>(`/me/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ categories: newCategories }),
    });
  }

  /**
   * Move message to folder
   */
  async moveMessage(messageId: string, destinationFolderId: string): Promise<GraphMessage> {
    return this.request<GraphMessage>(`/me/messages/${messageId}/move`, {
      method: 'POST',
      body: JSON.stringify({ destinationId: destinationFolderId }),
    });
  }

  /**
   * Delete message
   */
  async deleteMessage(messageId: string): Promise<void> {
    await this.request<void>(`/me/messages/${messageId}`, {
      method: 'DELETE',
    });
  }
}

/**
 * Create Outlook Graph API client
 */
export function createOutlookClient(oauth: OutlookOAuth): OutlookClient {
  return new OutlookClient(oauth);
}
