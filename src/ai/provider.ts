import Conf from 'conf';
import { getSecureCredential } from '../cli/commands/config.js';

/**
 * Email context for AI operations
 */
export interface EmailContext {
  to?: string;
  from?: string;
  subject?: string;
  body?: string;
  context?: string;
  tone?: 'formal' | 'casual' | 'friendly' | 'professional';
}

/**
 * Email data structure
 */
export interface Email {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  date: string;
  threadId?: string;
}

/**
 * Email thread for reply suggestions
 */
export interface EmailThread {
  id: string;
  subject: string;
  messages: Email[];
}

/**
 * Search result with relevance score
 */
export interface SearchResult {
  email: Email;
  score: number;
  snippet: string;
}

/**
 * AI Provider interface - all providers must implement these methods
 */
export interface AIProvider {
  readonly name: string;
  readonly model: string;

  /**
   * Generate an email draft based on context
   */
  generateDraft(context: EmailContext): Promise<string>;

  /**
   * Summarize a list of emails
   */
  summarize(emails: Email[]): Promise<string>;

  /**
   * Semantic search across emails
   */
  search(query: string, emails: Email[]): Promise<SearchResult[]>;

  /**
   * Suggest a reply to an email thread
   */
  suggestReply(thread: EmailThread): Promise<string>;

  /**
   * Check if the provider is properly configured
   */
  isConfigured(): Promise<boolean>;
}

/**
 * Supported AI provider types
 */
export type ProviderType = 'vertex' | 'openai' | 'anthropic' | 'ollama' | 'none';

/**
 * Provider configuration from user settings
 */
export interface ProviderConfig {
  type: ProviderType;
  gcpProject?: string;
  gcpLocation?: string;
  ollamaHost?: string;
}

/**
 * Get the current provider configuration from user settings
 */
export async function getProviderConfig(): Promise<ProviderConfig> {
  const conf = new Conf<{
    aiProvider: ProviderType;
    gcpProject?: string;
    gcpLocation?: string;
    ollamaHost?: string;
  }>({ projectName: 'intentmail' });

  return {
    type: conf.get('aiProvider') ?? 'none',
    gcpProject: conf.get('gcpProject'),
    gcpLocation: conf.get('gcpLocation') ?? 'us-central1',
    ollamaHost: conf.get('ollamaHost') ?? 'http://localhost:11434',
  };
}

/**
 * Create an AI provider instance based on configuration
 */
export async function createProvider(config?: ProviderConfig): Promise<AIProvider> {
  const providerConfig = config ?? await getProviderConfig();

  switch (providerConfig.type) {
    case 'vertex': {
      const { VertexAIProvider } = await import('./vertex.js');
      return new VertexAIProvider({
        project: providerConfig.gcpProject ?? '',
        location: providerConfig.gcpLocation ?? 'us-central1',
      });
    }

    case 'openai': {
      const { OpenAIProvider } = await import('./openai.js');
      const apiKey = await getSecureCredential('openai-api-key');
      return new OpenAIProvider({ apiKey: apiKey ?? '' });
    }

    case 'anthropic': {
      const { AnthropicProvider } = await import('./anthropic.js');
      const apiKey = await getSecureCredential('anthropic-api-key');
      return new AnthropicProvider({ apiKey: apiKey ?? '' });
    }

    case 'ollama': {
      const { OllamaProvider } = await import('./ollama.js');
      return new OllamaProvider({
        host: providerConfig.ollamaHost ?? 'http://localhost:11434',
      });
    }

    case 'none':
    default: {
      const { NoOpProvider } = await import('./noop.js');
      return new NoOpProvider();
    }
  }
}

/**
 * Get the current AI provider based on user configuration
 */
export async function getProvider(): Promise<AIProvider> {
  return createProvider();
}
