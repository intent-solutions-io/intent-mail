import { render } from 'ink';
import { createElement } from 'react';
import { ComposeView } from '../tui/ComposeView.js';

interface ComposeOptions {
  ai?: boolean;
}

export async function runComposeCommand(options: ComposeOptions): Promise<void> {
  render(createElement(ComposeView, { useAI: options.ai ?? false }));
}
