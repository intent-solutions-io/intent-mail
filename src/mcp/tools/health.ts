/**
 * Health Check Tool
 *
 * Simple tool to verify the MCP server is running and responsive.
 */

import { z } from 'zod';
import { SERVER_NAME, SERVER_VERSION } from '../../config.js';
import { isDatabaseOpen } from '../../storage/database.js';

// Input schema (no inputs required for health check)
const HealthInputSchema = z.object({});

// Output schema
const HealthOutputSchema = z.object({
  status: z.literal('healthy'),
  server: z.string(),
  version: z.string(),
  timestamp: z.string(),
  capabilities: z.object({
    storage: z.boolean(),
    gmail_connector: z.boolean(),
    outlook_connector: z.boolean(),
    rules_engine: z.boolean(),
  }),
});

export const healthTool = {
  definition: {
    name: 'health_check',
    description: 'Check if the IntentMail MCP server is running and healthy',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  handler: async (args: unknown) => {
    // Validate input (empty object expected)
    HealthInputSchema.parse(args);

    // Build health response
    const health = {
      status: 'healthy' as const,
      server: SERVER_NAME,
      version: SERVER_VERSION,
      timestamp: new Date().toISOString(),
      capabilities: {
        storage: isDatabaseOpen(),
        gmail_connector: false, // Will be true once Gmail connector is implemented
        outlook_connector: false, // Will be true once Outlook connector is implemented
        rules_engine: false, // Will be true once rules engine is implemented
      },
    };

    // Validate output
    const validated = HealthOutputSchema.parse(health);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(validated, null, 2),
        },
      ],
    };
  },
};

export type HealthInput = z.infer<typeof HealthInputSchema>;
export type HealthOutput = z.infer<typeof HealthOutputSchema>;
