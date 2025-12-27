import { render } from 'ink';
import { createElement } from 'react';
import { SearchView } from '../tui/SearchView.js';

export async function runSearchCommand(query: string): Promise<void> {
  render(createElement(SearchView, { initialQuery: query }));
}
