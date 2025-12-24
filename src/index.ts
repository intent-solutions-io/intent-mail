#!/usr/bin/env node

/**
 * IntentMail MCP Server
 *
 * Provides MCP tools for programmatic email access with Gmail/Outlook connectors.
 * Features: search, thread operations, labels, rules-as-code automation.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SERVER_NAME, SERVER_VERSION } from './config.js';
import { healthTool } from './mcp/tools/health.js';
import { mailSearchTool } from './mcp/tools/mail-search.js';
import { mailGetThreadTool } from './mcp/tools/mail-get-thread.js';
import { mailApplyLabelTool } from './mcp/tools/mail-apply-label.js';
import { mailListLabelsTool } from './mcp/tools/mail-list-labels.js';
import { mailListAccountsTool } from './mcp/tools/mail-list-accounts.js';
import { mailAuthStartTool } from './mcp/tools/mail-auth-start.js';
import { mailAuthCompleteTool } from './mcp/tools/mail-auth-complete.js';
import { mailSyncTool } from './mcp/tools/mail-sync.js';
import { mailSyncStatsTool } from './mcp/tools/mail-sync-stats.js';
import { mailSendTool } from './mcp/tools/mail-send.js';
import { mailListAttachmentsTool } from './mcp/tools/mail-list-attachments.js';
import { mailGetAttachmentTool } from './mcp/tools/mail-get-attachment.js';
import { mailListRulesTool } from './mcp/tools/mail-list-rules.js';
import { mailCreateRuleTool } from './mcp/tools/mail-create-rule.js';
import { mailDeleteRuleTool } from './mcp/tools/mail-delete-rule.js';
import { mailApplyRuleTool } from './mcp/tools/mail-apply-rule.js';
import { initDatabase, closeDatabase } from './storage/database.js';
import { runMigrations } from './storage/migrations.js';
import { initSyncMetricsTable } from './storage/services/sync-metrics.js';
import { initAttachmentCache } from './storage/services/attachment-cache.js';

async function main() {
  // Initialize database and run migrations
  console.error('Initializing database...');
  await initDatabase();
  runMigrations();
  initSyncMetricsTable();
  await initAttachmentCache();
  console.error('Database ready');

  // Centralized tool registry
  const allTools = [
    healthTool,
    mailAuthStartTool,
    mailAuthCompleteTool,
    mailListAccountsTool,
    mailSyncTool,
    mailSyncStatsTool,
    mailSearchTool,
    mailGetThreadTool,
    mailListLabelsTool,
    mailApplyLabelTool,
    mailSendTool,
    mailListAttachmentsTool,
    mailGetAttachmentTool,
    mailListRulesTool,
    mailCreateRuleTool,
    mailDeleteRuleTool,
    mailApplyRuleTool,
  ];

  // Create MCP server instance
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: allTools.map((tool) => tool.definition),
    };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const tool = allTools.find((t) => t.definition.name === name);
    if (tool) {
      return await tool.handler(args);
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`${SERVER_NAME} v${SERVER_VERSION} started successfully`);
  console.error('Listening on stdio...');
}

// Graceful shutdown handler
process.on('SIGINT', () => {
  console.error('Shutting down gracefully...');
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('Shutting down gracefully...');
  closeDatabase();
  process.exit(0);
});

// Run server
main().catch((error) => {
  console.error('Server error:', error);
  closeDatabase();
  process.exit(1);
});
