import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import SelectInput from 'ink-select-input';
import { useState, useEffect, useCallback } from 'react';

interface SearchViewProps {
  initialQuery: string;
}

interface SearchResult {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  score: number;
}

interface SelectItem {
  label: string;
  value: string;
}

export function SearchView({ initialQuery }: SearchViewProps): JSX.Element {
  const { exit } = useApp();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async (): Promise<void> => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      // TODO: Implement AI-powered search using configured provider
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setResults([
        {
          id: '1',
          from: 'example@email.com',
          subject: 'Re: ' + query,
          snippet: 'This is a sample search result matching your query...',
          score: 0.95,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useInput((_input: string, key: { escape?: boolean; return?: boolean }) => {
    if (key.escape) {
      exit();
    }
    if (key.return && !loading) {
      void handleSearch();
    }
  });

  useEffect(() => {
    if (initialQuery) {
      void handleSearch();
    }
  }, [initialQuery, handleSearch]);

  const handleSelect = (item: SelectItem): void => {
    // TODO: Open email detail view
    console.log('Selected:', item.value);
  };

  const items: SelectItem[] = results.map((r) => ({
    label: `[${Math.round(r.score * 100)}%] ${r.from} - ${r.subject}`,
    value: r.id,
  }));

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          AI-Powered Search
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>Search: </Text>
        <TextInput
          value={query}
          onChange={setQuery}
          placeholder="Enter search query..."
        />
      </Box>

      {loading ? (
        <Box marginBottom={1}>
          <Text>
            <Spinner type="dots" /> Searching with AI...
          </Text>
        </Box>
      ) : results.length > 0 ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>Found {results.length} results:</Text>
          <SelectInput items={items} onSelect={handleSelect} />
        </Box>
      ) : searched ? (
        <Text dimColor>No results found for &quot;{query}&quot;</Text>
      ) : (
        <Text dimColor>Press Enter to search</Text>
      )}

      <Box marginTop={1}>
        <Text dimColor>[Enter] search | [Esc] back</Text>
      </Box>
    </Box>
  );
}
