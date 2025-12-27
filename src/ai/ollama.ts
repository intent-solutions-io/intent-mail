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

interface OllamaConfig {
  host: string;
  model?: string;
}

interface OllamaResponse {
  model: string;
  response: string;
  done: boolean;
}

/**
 * Ollama (local LLM) provider implementation
 */
export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  readonly model: string;
  private host: string;

  constructor(config: OllamaConfig) {
    this.host = config.host.replace(/\/$/, ''); // Remove trailing slash
    this.model = config.model ?? 'llama3.2';
  }

  private async generate(prompt: string): Promise<string> {
    const response = await fetch(`${this.host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json() as OllamaResponse;
    return data.response;
  }

  async generateDraft(context: EmailContext): Promise<string> {
    const prompt = buildDraftPrompt(context);

    try {
      return await this.generate(prompt);
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
      return await this.generate(prompt);
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
      const text = await this.generate(prompt);

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
      return await this.generate(prompt);
    } catch (error) {
      console.error(`[${this.name}] Error in suggestReply:`, error);
      return 'Error: AI provider failed to generate reply.';
    }
  }

  async isConfigured(): Promise<boolean> {
    try {
      const response = await fetch(`${this.host}/api/tags`, {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
