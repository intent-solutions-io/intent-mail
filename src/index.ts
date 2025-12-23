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
import { initDatabase, closeDatabase } from './storage/database.js';
import { runMigrations } from './storage/migrations.js';

async function main() {
  // Initialize database and run migrations
  console.error('Initializing database...');
  await initDatabase();
  runMigrations();
  console.error('Database ready');

  // Centralized tool registry
  const allTools = [
    healthTool,
    // More tools will be added here:
    // - search_emails
    // - get_thread
    // - apply_label
    // - send_email
    // - create_rule
    // - run_plan
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
