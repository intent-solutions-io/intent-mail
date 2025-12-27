import OpenAI from 'openai';
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

interface OpenAIConfig {
  apiKey: string;
  model?: string;
}

/**
 * OpenAI (GPT) provider implementation
 */
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  readonly model: string;
  private client: OpenAI;

  constructor(config: OpenAIConfig) {
    this.model = config.model ?? 'gpt-4o-mini';
    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
  }

  async generateDraft(context: EmailContext): Promise<string> {
    const prompt = buildDraftPrompt(context);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
      });
      return response.choices[0]?.message?.content ?? '';
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
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
      });
      return response.choices[0]?.message?.content ?? '';
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
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
      });
      const text = response.choices[0]?.message?.content ?? '[]';

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
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
      });
      return response.choices[0]?.message?.content ?? '';
    } catch (error) {
      console.error(`[${this.name}] Error in suggestReply:`, error);
      return 'Error: AI provider failed to generate reply.';
    }
  }

  async isConfigured(): Promise<boolean> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'Say "ok"' }],
        max_tokens: 10,
      });
      return !!response.choices[0]?.message?.content;
    } catch {
      return false;
    }
  }
}
