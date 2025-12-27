import { z } from 'zod';
import type { EmailContext, Email, EmailThread } from './provider.js';

/**
 * Tone instructions for email drafting
 */
export const TONE_INSTRUCTIONS: Record<string, string> = {
  formal: 'Use formal, professional language with proper salutations.',
  casual: 'Use casual, friendly language.',
  friendly: 'Use warm, personable language.',
  professional: 'Use clear, professional language.',
};

/**
 * Build prompt for email draft generation
 */
export function buildDraftPrompt(context: EmailContext): string {
  const toneInstruction = context.tone ? TONE_INSTRUCTIONS[context.tone] : '';

  return `Generate a professional email draft with the following details:
${context.to ? `To: ${context.to}` : ''}
${context.subject ? `Subject: ${context.subject}` : ''}
${context.context ? `Context/Purpose: ${context.context}` : ''}
${toneInstruction ? `Tone: ${toneInstruction}` : ''}

Generate only the email body, no subject line or headers. Be concise and professional.`;
}

/**
 * Build prompt for email summarization
 */
export function buildSummarizePrompt(emails: Email[]): string {
  const emailSummaries = emails.map((e, i) =>
    `Email ${i + 1}:
From: ${e.from}
Subject: ${e.subject}
Date: ${e.date}
Body: ${e.body.substring(0, 500)}${e.body.length > 500 ? '...' : ''}`
  ).join('\n\n');

  return `Summarize the following ${emails.length} emails concisely. Highlight key action items, important dates, and main topics.

${emailSummaries}

Provide a brief summary (2-3 paragraphs max):`;
}

/**
 * Build prompt for semantic search
 */
export function buildSearchPrompt(query: string, emails: Email[]): string {
  const emailList = emails.map((e, i) =>
    `[${i}] From: ${e.from} | Subject: ${e.subject} | Preview: ${e.body.substring(0, 200)}`
  ).join('\n');

  return `Given the search query: "${query}"

Rank these emails by relevance (0-100 score). Return ONLY a JSON array with format:
[{"index": 0, "score": 85, "reason": "brief reason"}]

Emails:
${emailList}

Return only the JSON array, no other text:`;
}

/**
 * Build prompt for reply suggestion
 */
export function buildReplyPrompt(thread: EmailThread): string {
  const threadContext = thread.messages.map((m) =>
    `From: ${m.from}
Date: ${m.date}
${m.body}`
  ).join('\n---\n');

  return `Given this email thread, suggest a professional reply to the most recent message.

Thread Subject: ${thread.subject}

${threadContext}

Generate a concise, professional reply. Include only the email body, no headers:`;
}

/**
 * Zod schema for search ranking results from LLM
 */
export const SearchRankingSchema = z.object({
  index: z.number().int(),
  score: z.number().min(0).max(100),
  reason: z.string(),
});

export const SearchRankingsSchema = z.array(SearchRankingSchema);

export type SearchRanking = z.infer<typeof SearchRankingSchema>;

/**
 * Parse and validate search rankings from LLM response
 */
export function parseSearchRankings(text: string): SearchRanking[] {
  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\[[\s\S]*?\]/);
  if (!jsonMatch) {
    return [];
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return SearchRankingsSchema.parse(parsed);
  } catch {
    return [];
  }
}

/**
 * Basic keyword search fallback
 */
export function keywordSearch(query: string, emails: Email[]): Array<{ email: Email; score: number; snippet: string }> {
  const lowerQuery = query.toLowerCase();
  return emails
    .filter((e) =>
      e.subject.toLowerCase().includes(lowerQuery) ||
      e.body.toLowerCase().includes(lowerQuery) ||
      e.from.toLowerCase().includes(lowerQuery)
    )
    .map((email) => ({
      email,
      score: 0.5,
      snippet: email.body.substring(0, 100),
    }));
}
