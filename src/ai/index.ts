/**
 * AI Provider Layer
 *
 * Pluggable AI provider abstraction supporting:
 * - Vertex AI (Gemini)
 * - OpenAI (GPT)
 * - Anthropic (Claude)
 * - Ollama (Local LLMs)
 */

export {
  type AIProvider,
  type EmailContext,
  type Email,
  type EmailThread,
  type SearchResult,
  type ProviderType,
  type ProviderConfig,
  createProvider,
  getProvider,
  getProviderConfig,
} from './provider.js';

export { VertexAIProvider } from './vertex.js';
export { OpenAIProvider } from './openai.js';
export { AnthropicProvider } from './anthropic.js';
export { OllamaProvider } from './ollama.js';
export { NoOpProvider } from './noop.js';
