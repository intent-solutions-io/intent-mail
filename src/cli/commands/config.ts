import { select, input, password } from '@inquirer/prompts';
import Conf from 'conf';

interface IntentMailConfig {
  aiProvider: 'vertex' | 'openai' | 'anthropic' | 'ollama' | 'none';
  gcpProject?: string;
  gcpLocation?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  ollamaHost?: string;
  emailAccount?: string;
}

const config = new Conf<IntentMailConfig>({
  projectName: 'intentmail',
  defaults: {
    aiProvider: 'none',
  },
});

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
    updates.openaiApiKey = await password({
      message: 'OpenAI API Key:',
    });
  }

  if (aiProvider === 'anthropic') {
    updates.anthropicApiKey = await password({
      message: 'Anthropic API Key:',
    });
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
    if (value !== undefined && value !== '') {
      config.set(key as keyof IntentMailConfig, value);
    }
  }

  console.log('\n  Configuration saved to:', config.path);
  console.log('  Run `intentmail` to start the TUI.\n');
}
