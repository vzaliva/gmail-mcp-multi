#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { AccountManager } from "./accounts.js";
import { GmailClient } from "./gmail.js";
import { tools, handleToolCall } from "./tools/index.js";

const server = new Server(
  {
    name: "gmail-mcp-multi",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const accountManager = new AccountManager();
const gmailClient = new GmailClient(accountManager);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  return handleToolCall(request, accountManager, gmailClient);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Gmail MCP Multi server running on stdio");
}

main().catch(console.error);
