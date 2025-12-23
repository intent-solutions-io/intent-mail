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
import { healthTool } from './mcp/tools/health.js';

const SERVER_NAME = 'intentmail-mcp-server';
const SERVER_VERSION = '0.1.0';

async function main() {
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
      tools: [
        healthTool.definition,
        // More tools will be added here:
        // - search_emails
        // - get_thread
        // - apply_label
        // - send_email
        // - create_rule
        // - run_plan
      ],
    };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'health_check':
        return await healthTool.handler(args);

      // More tool handlers will be added here

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`${SERVER_NAME} v${SERVER_VERSION} started successfully`);
  console.error('Listening on stdio...');
}

// Run server
main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
