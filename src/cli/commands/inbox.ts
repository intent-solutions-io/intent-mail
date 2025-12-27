import { render } from 'ink';
import { createElement } from 'react';
import { InboxView } from '../tui/InboxView.js';

export async function runInboxCommand(): Promise<void> {
  render(createElement(InboxView));
}
