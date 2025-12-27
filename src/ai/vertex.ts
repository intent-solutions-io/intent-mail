import { VertexAI } from '@google-cloud/vertexai';
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

interface VertexConfig {
  project: string;
  location: string;
  model?: string;
}

/**
 * Vertex AI (Gemini) provider implementation
 */
export class VertexAIProvider implements AIProvider {
  readonly name = 'vertex';
  readonly model: string;
  private vertexai: VertexAI;
  private generativeModel: ReturnType<VertexAI['getGenerativeModel']>;

  constructor(config: VertexConfig) {
    this.model = config.model ?? 'gemini-2.0-flash-exp';
    this.vertexai = new VertexAI({
      project: config.project,
      location: config.location,
    });
    this.generativeModel = this.vertexai.getGenerativeModel({
      model: this.model,
    });
  }

  async generateDraft(context: EmailContext): Promise<string> {
    const prompt = buildDraftPrompt(context);

    try {
      const result = await this.generativeModel.generateContent(prompt);
      const response = result.response;
      return response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
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
      const result = await this.generativeModel.generateContent(prompt);
      const response = result.response;
      return response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
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
      const result = await this.generativeModel.generateContent(prompt);
      const response = result.response;
      const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';

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
      const result = await this.generativeModel.generateContent(prompt);
      const response = result.response;
      return response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    } catch (error) {
      console.error(`[${this.name}] Error in suggestReply:`, error);
      return 'Error: AI provider failed to generate reply.';
    }
  }

  async isConfigured(): Promise<boolean> {
    try {
      const result = await this.generativeModel.generateContent('Say "ok"');
      return !!result.response;
    } catch {
      return false;
    }
  }
}
