import { select, input, password } from '@inquirer/prompts';
import Conf from 'conf';
import keytar from 'keytar';

const SERVICE_NAME = 'intentmail';

interface IntentMailConfig {
  aiProvider: 'vertex' | 'openai' | 'anthropic' | 'ollama' | 'none';
  gcpProject?: string;
  gcpLocation?: string;
  ollamaHost?: string;
  emailAccount?: string;
}

const config = new Conf<IntentMailConfig>({
  projectName: 'intentmail',
  defaults: {
    aiProvider: 'none',
  },
});

async function setSecureCredential(key: string, value: string): Promise<void> {
  await keytar.setPassword(SERVICE_NAME, key, value);
}

export async function getSecureCredential(key: string): Promise<string | null> {
  return keytar.getPassword(SERVICE_NAME, key);
}

export async function runConfigCommand(): Promise<void> {
  console.log('\n  IntentMail Configuration\n');

  const aiProvider = await select({
    message: 'Choose AI provider:',
    default: config.get('aiProvider'),
    choices: [
      { name: 'Vertex AI (Google Cloud)', value: 'vertex' as const },
      { name: 'OpenAI', value: 'openai' as const },
      { name: 'Anthropic (Claude)', value: 'anthropic' as const },
      { name: 'Ollama (Local)', value: 'ollama' as const },
      { name: 'None (Manual only)', value: 'none' as const },
    ],
  });

  const updates: Partial<IntentMailConfig> = { aiProvider };

  if (aiProvider === 'vertex') {
    updates.gcpProject = await input({
      message: 'GCP Project ID:',
      default: config.get('gcpProject') ?? '',
    });
    updates.gcpLocation = await input({
      message: 'GCP Location:',
      default: config.get('gcpLocation') ?? 'us-central1',
    });
  }

  if (aiProvider === 'openai') {
    const existingKey = await getSecureCredential('openai-api-key');
    const keyPrompt = existingKey ? ' (leave empty to keep existing)' : '';
    const apiKey = await password({
      message: `OpenAI API Key${keyPrompt}:`,
    });
    if (apiKey) {
      await setSecureCredential('openai-api-key', apiKey);
      console.log('  API key stored securely in system keychain');
    }
  }

  if (aiProvider === 'anthropic') {
    const existingKey = await getSecureCredential('anthropic-api-key');
    const keyPrompt = existingKey ? ' (leave empty to keep existing)' : '';
    const apiKey = await password({
      message: `Anthropic API Key${keyPrompt}:`,
    });
    if (apiKey) {
      await setSecureCredential('anthropic-api-key', apiKey);
      console.log('  API key stored securely in system keychain');
    }
  }

  if (aiProvider === 'ollama') {
    updates.ollamaHost = await input({
      message: 'Ollama Host:',
      default: config.get('ollamaHost') ?? 'http://localhost:11434',
    });
  }

  updates.emailAccount = await input({
    message: 'Email account (e.g., user@gmail.com):',
    default: config.get('emailAccount') ?? '',
  });

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      config.set(key as keyof IntentMailConfig, value);
    }
  }

  console.log('\n  Configuration saved to:', config.path);
  console.log('  API keys stored securely in system keychain');
  console.log('  Run `intentmail` to start the TUI.\n');
}
