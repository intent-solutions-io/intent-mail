import { Box, Text, useApp, useInput } from 'ink';
import Spinner from 'ink-spinner';
import SelectInput from 'ink-select-input';
import { useState, useEffect } from 'react';

interface Email {
  id: string;
  from: string;
  subject: string;
  date: string;
  unread: boolean;
}

interface SelectItem {
  label: string;
  value: string;
}

export function InboxView(): JSX.Element {
  const { exit } = useApp();
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useInput((input: string) => {
    if (input === 'q') {
      exit();
    }
  });

  useEffect(() => {
    const loadEmails = async (): Promise<void> => {
      try {
        // TODO: Load emails from configured account
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setEmails([
          {
            id: '1',
            from: 'example@email.com',
            subject: 'Welcome to IntentMail',
            date: new Date().toISOString(),
            unread: true,
          },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load emails');
      } finally {
        setLoading(false);
      }
    };

    void loadEmails();
  }, []);

  const handleSelect = (item: SelectItem): void => {
    // TODO: Open email detail view
    setSelectedId(item.value);
  };

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>
          <Spinner type="dots" /> Loading inbox...
        </Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
        <Text dimColor>Press q to quit</Text>
      </Box>
    );
  }

  const items: SelectItem[] = emails.map((e) => ({
    label: `${e.unread ? '*' : ' '} ${e.from} - ${e.subject}`,
    value: e.id,
  }));

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Inbox ({emails.length} emails)
        </Text>
      </Box>

      {selectedId && (
        <Box marginBottom={1}>
          <Text color="green">Selected: {selectedId}</Text>
        </Box>
      )}

      {emails.length === 0 ? (
        <Text dimColor>No emails found. Run `intentmail config` to set up your account.</Text>
      ) : (
        <SelectInput items={items} onSelect={handleSelect} />
      )}

      <Box marginTop={1}>
        <Text dimColor>[q] quit | [c] compose | [/] search</Text>
      </Box>
    </Box>
  );
}
