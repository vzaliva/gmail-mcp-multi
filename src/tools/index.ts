import {
  Tool,
  CallToolRequest,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import { AccountManager } from "../accounts.js";
import { GmailClient } from "../gmail.js";

type AnnotatedTool = Tool & { mutates: boolean };

const ALL_TOOLS: AnnotatedTool[] = [
  {
    name: "list_accounts",
    description: "List all configured Gmail accounts and their authentication status",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    mutates: false,
  },
  {
    name: "authenticate",
    description: "Add or re-authenticate a Gmail account. Opens browser for OAuth flow.",
    inputSchema: {
      type: "object",
      properties: {
        alias: {
          type: "string",
          description: "Friendly name for this account (e.g., 'work', 'personal')",
        },
        email: {
          type: "string",
          description: "Email address for this account (used as login hint)",
        },
      },
      required: ["alias"],
    },
    mutates: false,
  },
  {
    name: "search_emails",
    description: "Search for emails using Gmail query syntax",
    inputSchema: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description: "Account alias or email to use",
        },
        query: {
          type: "string",
          description: "Gmail search query (e.g., 'in:inbox is:unread')",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results (default: 10)",
        },
      },
      required: ["account", "query"],
    },
    mutates: false,
  },
  {
    name: "read_email",
    description: "Get the full content of an email by ID",
    inputSchema: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description: "Account alias or email to use",
        },
        messageId: {
          type: "string",
          description: "The ID of the email message",
        },
      },
      required: ["account", "messageId"],
    },
    mutates: false,
  },
  {
    name: "send_email",
    description: "Send a new email",
    inputSchema: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description: "Account alias or email to use",
        },
        to: {
          type: "array",
          items: { type: "string" },
          description: "Recipient email addresses",
        },
        subject: {
          type: "string",
          description: "Email subject",
        },
        body: {
          type: "string",
          description: "Email body (plain text)",
        },
        cc: {
          type: "array",
          items: { type: "string" },
          description: "CC recipients",
        },
        bcc: {
          type: "array",
          items: { type: "string" },
          description: "BCC recipients",
        },
      },
      required: ["account", "to", "subject", "body"],
    },
    mutates: true,
  },
  {
    name: "list_labels",
    description: "Get all labels for an account",
    inputSchema: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description: "Account alias or email to use",
        },
      },
      required: ["account"],
    },
    mutates: false,
  },
  {
    name: "modify_email",
    description: "Modify email labels (add/remove labels, mark read/unread)",
    inputSchema: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description: "Account alias or email to use",
        },
        messageId: {
          type: "string",
          description: "The ID of the email message",
        },
        addLabelIds: {
          type: "array",
          items: { type: "string" },
          description: "Label IDs to add",
        },
        removeLabelIds: {
          type: "array",
          items: { type: "string" },
          description: "Label IDs to remove",
        },
      },
      required: ["account", "messageId"],
    },
    mutates: true,
  },
  {
    name: "get_attachment",
    description:
      "Download the binary body of a Gmail attachment. Returns the bytes as a base64 blob, or writes them to disk if savePath is provided. The attachmentId is obtained from a prior read_email call (payload.parts[*].body.attachmentId).",
    inputSchema: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description: "Account alias or email to use",
        },
        messageId: {
          type: "string",
          description: "The ID of the email message",
        },
        attachmentId: {
          type: "string",
          description:
            "The attachment ID from payload.parts[*].body.attachmentId in a read_email response",
        },
        savePath: {
          type: "string",
          description:
            "Optional absolute filesystem path. If provided, decoded bytes are written to this path instead of being returned inline. Recommended for large attachments.",
        },
        filename: {
          type: "string",
          description:
            "Optional filename to include in the returned metadata (cosmetic; does not affect what is fetched)",
        },
        mimeType: {
          type: "string",
          description:
            "Optional MIME type to tag the returned resource (defaults to application/octet-stream)",
        },
        format: {
          type: "string",
          enum: ["resource", "text"],
          description:
            "How to return the bytes when savePath is not set. \"resource\" (default) returns an MCP EmbeddedResource block with a base64 blob — the spec-compliant shape. \"text\" embeds the base64 inside a single JSON text block; use this when the MCP client mis-routes binary resource blocks (e.g. Claude.ai currently rejects application/pdf in this path). Ignored when savePath is set.",
        },
      },
      required: ["account", "messageId", "attachmentId"],
    },
    mutates: false,
  },
];

export function getTools(readOnly: boolean): Tool[] {
  return ALL_TOOLS
    .filter((t) => !readOnly || !t.mutates)
    .map(({ mutates: _mutates, ...t }) => t);
}

export async function handleToolCall(
  request: CallToolRequest,
  accountManager: AccountManager,
  gmailClient: GmailClient,
  readOnly: boolean
): Promise<CallToolResult> {
  const { name, arguments: args } = request.params;

  const tool = ALL_TOOLS.find((t) => t.name === name);
  if (!tool) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    };
  }
  if (readOnly && tool.mutates) {
    return {
      content: [
        {
          type: "text",
          text: `Tool "${name}" is disabled in --readonly mode.`,
        },
      ],
    };
  }

  try {
    switch (name) {
      case "list_accounts": {
        const accounts = accountManager.listAccounts();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ accounts }, null, 2),
            },
          ],
        };
      }

      case "authenticate": {
        const { alias, email } = args as { alias: string; email?: string };
        const cmd = `node dist/auth.js ${alias}${email ? ` ${email}` : " <email>"}`;
        return {
          content: [
            {
              type: "text",
              text:
                "Authentication runs as a separate script outside the MCP server " +
                "(it needs to open a browser and listen on a localhost port). " +
                `Run from the gmail-mcp-multi checkout:\n\n  ${cmd}\n\n` +
                "Then call list_accounts to confirm.",
            },
          ],
        };
      }

      case "search_emails": {
        const { account, query, maxResults = 10 } = args as {
          account: string;
          query: string;
          maxResults?: number;
        };
        const client = await gmailClient.getClient(account);
        const response = await client.users.messages.list({
          userId: "me",
          q: query,
          maxResults,
        });

        const messages = response.data.messages || [];
        const results = await Promise.all(
          messages.map(async (msg) => {
            const full = await client.users.messages.get({
              userId: "me",
              id: msg.id!,
              format: "metadata",
              metadataHeaders: ["From", "To", "Subject", "Date"],
            });
            const headers = full.data.payload?.headers || [];
            return {
              id: msg.id,
              subject: headers.find((h) => h.name === "Subject")?.value,
              from: headers.find((h) => h.name === "From")?.value,
              date: headers.find((h) => h.name === "Date")?.value,
            };
          })
        );

        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      }

      case "read_email": {
        const { account, messageId } = args as {
          account: string;
          messageId: string;
        };
        const client = await gmailClient.getClient(account);
        const response = await client.users.messages.get({
          userId: "me",
          id: messageId,
          format: "full",
        });

        return {
          content: [
            { type: "text", text: JSON.stringify(response.data, null, 2) },
          ],
        };
      }

      case "get_attachment": {
        const {
          account,
          messageId,
          attachmentId,
          savePath,
          filename,
          mimeType,
          format,
        } = args as {
          account: string;
          messageId: string;
          attachmentId: string;
          savePath?: string;
          filename?: string;
          mimeType?: string;
          format?: string;
        };
        const client = await gmailClient.getClient(account);
        const response = await client.users.messages.attachments.get({
          userId: "me",
          messageId,
          id: attachmentId,
        });
        const dataB64Url = response.data.data;
        if (!dataB64Url) {
          return {
            content: [
              {
                type: "text",
                text: `Attachment ${attachmentId} on message ${messageId} returned no data.`,
              },
            ],
          };
        }
        const buf = Buffer.from(dataB64Url, "base64url");
        const resolvedMime = mimeType || "application/octet-stream";
        const resolvedName = filename || `attachment-${attachmentId}`;

        if (savePath) {
          fs.writeFileSync(savePath, buf);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    savedTo: savePath,
                    bytesWritten: buf.length,
                    mimeType: resolvedMime,
                    filename: resolvedName,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        if (format === "text") {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    filename: resolvedName,
                    mimeType: resolvedMime,
                    size: buf.length,
                    base64: buf.toString("base64"),
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  filename: resolvedName,
                  mimeType: resolvedMime,
                  size: buf.length,
                },
                null,
                2
              ),
            },
            {
              type: "resource",
              resource: {
                uri: `gmail-attachment:${messageId}:${attachmentId}`,
                mimeType: resolvedMime,
                blob: buf.toString("base64"),
              },
            },
          ],
        };
      }

      case "list_labels": {
        const { account } = args as { account: string };
        const client = await gmailClient.getClient(account);
        const response = await client.users.labels.list({ userId: "me" });

        return {
          content: [
            { type: "text", text: JSON.stringify(response.data.labels, null, 2) },
          ],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
    };
  }
}
