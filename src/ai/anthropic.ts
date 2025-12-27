import Anthropic from '@anthropic-ai/sdk';
import type {
  AIProvider,
  EmailContext,
  Email,
  EmailThread,
  SearchResult,
} from './provider.js';
import {
  buildDraftPrompt,
  buildSummarizePrompt,
  buildSearchPrompt,
  buildReplyPrompt,
  parseSearchRankings,
  keywordSearch,
} from './prompts.js';

interface AnthropicConfig {
  apiKey: string;
  model?: string;
}

/**
 * Anthropic (Claude) provider implementation
 */
export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly model: string;
  private client: Anthropic;

  constructor(config: AnthropicConfig) {
    this.model = config.model ?? 'claude-3-5-sonnet-latest';
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
  }

  private extractText(response: Anthropic.Message): string {
    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock?.type === 'text' ? textBlock.text : '';
  }

  async generateDraft(context: EmailContext): Promise<string> {
    const prompt = buildDraftPrompt(context);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      });
      return this.extractText(response);
    } catch (error) {
      console.error(`[${this.name}] Error in generateDraft:`, error);
      return 'Error: AI provider failed to generate content.';
    }
  }

  async summarize(emails: Email[]): Promise<string> {
    if (emails.length === 0) {
      return 'No emails to summarize.';
    }

    const prompt = buildSummarizePrompt(emails);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      });
      return this.extractText(response);
    } catch (error) {
      console.error(`[${this.name}] Error in summarize:`, error);
      return 'Error: AI provider failed to summarize emails.';
    }
  }

  async search(query: string, emails: Email[]): Promise<SearchResult[]> {
    if (emails.length === 0) {
      return [];
    }

    const prompt = buildSearchPrompt(query, emails);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = this.extractText(response);

      const rankings = parseSearchRankings(text);

      return rankings
        .filter((r) => r.index >= 0 && r.index < emails.length)
        .sort((a, b) => b.score - a.score)
        .map((r) => ({
          email: emails[r.index],
          score: r.score / 100,
          snippet: r.reason,
        }));
    } catch (error) {
      console.error(`[${this.name}] Error in search, falling back to keyword search:`, error);
      return keywordSearch(query, emails);
    }
  }

  async suggestReply(thread: EmailThread): Promise<string> {
    if (thread.messages.length === 0) {
      return '';
    }

    const prompt = buildReplyPrompt(thread);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      });
      return this.extractText(response);
    } catch (error) {
      console.error(`[${this.name}] Error in suggestReply:`, error);
      return 'Error: AI provider failed to generate reply.';
    }
  }

  async isConfigured(): Promise<boolean> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "ok"' }],
      });
      return response.content.length > 0;
    } catch {
      return false;
    }
  }
}
