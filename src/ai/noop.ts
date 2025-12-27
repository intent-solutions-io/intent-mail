import type {
  AIProvider,
  EmailContext,
  Email,
  EmailThread,
  SearchResult,
} from './provider.js';

/**
 * No-op provider for when AI is disabled or not configured
 */
export class NoOpProvider implements AIProvider {
  readonly name = 'none';
  readonly model = 'none';

  async generateDraft(_context: EmailContext): Promise<string> {
    return 'AI is not configured. Run `intentmail config` to set up an AI provider.';
  }

  async summarize(_emails: Email[]): Promise<string> {
    return 'AI is not configured. Run `intentmail config` to set up an AI provider.';
  }

  async search(_query: string, emails: Email[]): Promise<SearchResult[]> {
    // Basic keyword search fallback
    return emails.map((email) => ({
      email,
      score: 0.5,
      snippet: email.body.substring(0, 100),
    }));
  }

  async suggestReply(_thread: EmailThread): Promise<string> {
    return 'AI is not configured. Run `intentmail config` to set up an AI provider.';
  }

  async isConfigured(): Promise<boolean> {
    return false;
  }
}
