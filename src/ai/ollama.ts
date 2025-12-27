import type {
  AIProvider,
  EmailContext,
  Email,
  EmailThread,
  SearchResult,
} from './provider.js';

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
    const toneInstructions = {
      formal: 'Use formal, professional language with proper salutations.',
      casual: 'Use casual, friendly language.',
      friendly: 'Use warm, personable language.',
      professional: 'Use clear, professional language.',
    };

    const prompt = `Generate a professional email draft with the following details:
${context.to ? `To: ${context.to}` : ''}
${context.subject ? `Subject: ${context.subject}` : ''}
${context.context ? `Context/Purpose: ${context.context}` : ''}
${context.tone ? `Tone: ${toneInstructions[context.tone]}` : ''}

Generate only the email body, no subject line or headers. Be concise and professional.`;

    return this.generate(prompt);
  }

  async summarize(emails: Email[]): Promise<string> {
    if (emails.length === 0) {
      return 'No emails to summarize.';
    }

    const emailSummaries = emails.map((e, i) =>
      `Email ${i + 1}:
From: ${e.from}
Subject: ${e.subject}
Date: ${e.date}
Body: ${e.body.substring(0, 500)}${e.body.length > 500 ? '...' : ''}`
    ).join('\n\n');

    const prompt = `Summarize the following ${emails.length} emails concisely. Highlight key action items, important dates, and main topics.

${emailSummaries}

Provide a brief summary (2-3 paragraphs max):`;

    return this.generate(prompt);
  }

  async search(query: string, emails: Email[]): Promise<SearchResult[]> {
    if (emails.length === 0) {
      return [];
    }

    const emailList = emails.map((e, i) =>
      `[${i}] From: ${e.from} | Subject: ${e.subject} | Preview: ${e.body.substring(0, 200)}`
    ).join('\n');

    const prompt = `Given the search query: "${query}"

Rank these emails by relevance (0-100 score). Return ONLY a JSON array with format:
[{"index": 0, "score": 85, "reason": "brief reason"}]

Emails:
${emailList}

Return only the JSON array, no other text:`;

    try {
      const text = await this.generate(prompt);

      // Extract JSON from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      const rankings = JSON.parse(jsonMatch[0]) as Array<{ index: number; score: number; reason: string }>;

      return rankings
        .filter((r) => r.index >= 0 && r.index < emails.length)
        .sort((a, b) => b.score - a.score)
        .map((r) => ({
          email: emails[r.index],
          score: r.score / 100,
          snippet: r.reason,
        }));
    } catch {
      // Fallback to basic keyword search
      return emails
        .filter((e) =>
          e.subject.toLowerCase().includes(query.toLowerCase()) ||
          e.body.toLowerCase().includes(query.toLowerCase()) ||
          e.from.toLowerCase().includes(query.toLowerCase())
        )
        .map((email) => ({
          email,
          score: 0.5,
          snippet: email.body.substring(0, 100),
        }));
    }
  }

  async suggestReply(thread: EmailThread): Promise<string> {
    if (thread.messages.length === 0) {
      return '';
    }

    const threadContext = thread.messages.map((m) =>
      `From: ${m.from}
Date: ${m.date}
${m.body}`
    ).join('\n---\n');

    const prompt = `Given this email thread, suggest a professional reply to the most recent message.

Thread Subject: ${thread.subject}

${threadContext}

Generate a concise, professional reply. Include only the email body, no headers:`;

    return this.generate(prompt);
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
