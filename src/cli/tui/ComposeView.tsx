import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { useState } from 'react';

interface ComposeViewProps {
  useAI: boolean;
}

type ComposeField = 'to' | 'subject' | 'body';

export function ComposeView({ useAI }: ComposeViewProps): JSX.Element {
  const { exit } = useApp();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [activeField, setActiveField] = useState<ComposeField>('to');
  const [sending, setSending] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useInput((input: string, key: { escape?: boolean; tab?: boolean; ctrl?: boolean; return?: boolean }) => {
    if (key.escape) {
      exit();
    }
    if (key.tab) {
      const fields: ComposeField[] = ['to', 'subject', 'body'];
      const currentIndex = fields.indexOf(activeField);
      const nextIndex = (currentIndex + 1) % fields.length;
      setActiveField(fields[nextIndex]);
    }
    if (key.ctrl && input === 's') {
      void handleSend();
    }
    if (key.ctrl && input === 'g' && useAI) {
      void handleAIGenerate();
    }
  });

  const handleSend = async (): Promise<void> => {
    if (!to || !subject) return;
    setSending(true);
    setError(null);
    try {
      // TODO: Send email via configured provider
      await new Promise((resolve) => setTimeout(resolve, 1000));
      exit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email');
      setSending(false);
    }
  };

  const handleAIGenerate = async (): Promise<void> => {
    setAiGenerating(true);
    setError(null);
    try {
      // TODO: Generate draft using configured AI provider
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setBody('This is an AI-generated draft. Configure your AI provider with `intentmail config`.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate AI draft');
    } finally {
      setAiGenerating(false);
    }
  };

  if (sending) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>
          <Spinner type="dots" /> Sending email...
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Compose Email {useAI && <Text color="yellow">(AI Assist Enabled)</Text>}
        </Text>
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      <Box marginBottom={1}>
        <Text>To: </Text>
        <TextInput
          value={to}
          onChange={setTo}
          focus={activeField === 'to'}
          placeholder="recipient@example.com"
        />
      </Box>

      <Box marginBottom={1}>
        <Text>Subject: </Text>
        <TextInput
          value={subject}
          onChange={setSubject}
          focus={activeField === 'subject'}
          placeholder="Email subject"
        />
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text>Body:</Text>
        {aiGenerating ? (
          <Text>
            <Spinner type="dots" /> AI generating draft...
          </Text>
        ) : (
          <TextInput
            value={body}
            onChange={setBody}
            focus={activeField === 'body'}
            placeholder="Write your message..."
          />
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          [Tab] next field | [Ctrl+S] send | [Esc] cancel
          {useAI && ' | [Ctrl+G] AI generate'}
        </Text>
      </Box>
    </Box>
  );
}
