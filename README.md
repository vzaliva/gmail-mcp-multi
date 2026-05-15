# gmail-mcp-multi

A Gmail MCP server with native multi-account support. Manage multiple Gmail accounts from a single server instance.

Unlike other Gmail MCPs that require running separate server instances per account, this one lets you specify which account to use on each tool call—making it easy to manage personal and work inboxes from Claude Code, Cursor, or any MCP client.

## Features

- **Multi-account support** - Single server instance, unlimited Gmail accounts
- **Account aliases** - Use friendly names like "work" or "personal" instead of email addresses
- **Full Gmail API** - Search, read, send, label, and manage emails
- **Batch operations** - Bulk modify or delete emails efficiently
- **Auto token refresh** - Handles OAuth token refresh automatically

## Installation

```bash
npm install -g gmail-mcp-multi
```

Or run directly with npx:
```bash
npx gmail-mcp-multi
```

## Quick Start

### 1. Set up Google Cloud OAuth

You'll need OAuth credentials from Google Cloud Console:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Enable the Gmail API
4. Create OAuth 2.0 credentials (Desktop app type)
5. Download the credentials JSON

### 2. Configure the MCP

Create `~/.gmail-mcp/oauth-keys.json` with your OAuth credentials.

### 3. Add to your MCP client

**Claude Code (`~/.claude/settings.json`):**
```json
{
  "mcpServers": {
    "gmail": {
      "command": "npx",
      "args": ["gmail-mcp-multi"]
    }
  }
}
```

#### Read-only mode

Pass `--readonly` (or set `GMAIL_MCP_READONLY=1`) to disable every mutating
tool — `send_email`, `modify_email`, and any future delete/label-edit tools.
Only search/read/list operations remain available, both in the advertised tool
list and at dispatch time. Useful when handing the server to an autonomous
agent:

```json
{
  "mcpServers": {
    "gmail-readonly": {
      "command": "npx",
      "args": ["gmail-mcp-multi", "--readonly"]
    }
  }
}
```

### 4. Authenticate accounts

Authentication runs as a one-off Node script (it needs to open a browser and
listen on a localhost port, which doesn't fit inside an MCP request). After
`npm run build`, from the project checkout:

```bash
node dist/auth.js personal you@gmail.com
node dist/auth.js work you@company.com
```

Each invocation prints a Google authorization URL, listens on
`http://127.0.0.1:<random-port>` for the redirect, exchanges the code for
tokens, and writes them to `~/.gmail-mcp/accounts/<alias>/credentials.json`.

The script requests the `gmail.readonly` scope, so the resulting tokens
can never mutate the mailbox even if the MCP server is later started
without `--readonly`.

For multi-org setups (accounts in different Google Workspace
organizations), drop a per-account `oauth-keys.json` into
`~/.gmail-mcp/accounts/<alias>/` before running the script — see
"Configuration" below.

### 5. Use it!

```
search_emails({ account: "work", query: "in:inbox is:unread" })
search_emails({ account: "personal", query: "from:mom" })
```

## Tools

All tools that interact with Gmail require an `account` parameter (alias or email).

> Tools that mutate the mailbox (send, modify, delete, label edits) are filtered out when the server is started with `--readonly`.

### Account Management
| Tool | Description |
|------|-------------|
| `list_accounts` | List all configured accounts and auth status |
| `authenticate` | Add or re-authenticate an account |

### Email Operations
| Tool | Description |
|------|-------------|
| `search_emails` | Search emails using Gmail query syntax |
| `read_email` | Get full content of an email by ID |
| `get_attachment` | Download an attachment's binary body (see "Attachments" below) |
| `send_email` | Send a new email |
| `draft_email` | Create a draft |
| `modify_email` | Add/remove labels, mark read/unread |
| `delete_email` | Trash or permanently delete |
| `batch_modify_emails` | Bulk label operations |
| `batch_delete_emails` | Bulk delete |

### Label Management
| Tool | Description |
|------|-------------|
| `list_labels` | Get all labels for an account |
| `create_label` | Create a new label |
| `delete_label` | Delete a label |

### Attachments

`read_email` returns the full Gmail message payload including the recursive
MIME part tree. Each part that has an external attachment exposes a
`body.attachmentId`. Pass that ID to `get_attachment` to download the bytes:

```
# 1. Find the message and read it
read_email({ account: "work", messageId: "<id>" })

# 2. Walk payload.parts, locate the PDF (mimeType "application/pdf"),
#    grab its body.attachmentId, then either:

# a) Write the file directly to disk (recommended for large attachments)
get_attachment({
  account: "work",
  messageId: "<id>",
  attachmentId: "<id>",
  savePath: "/tmp/report.pdf",
  filename: "report.pdf",
  mimeType: "application/pdf"
})

# b) Receive the bytes inline as a base64 resource block
get_attachment({
  account: "work",
  messageId: "<id>",
  attachmentId: "<id>",
  filename: "photo.jpg",
  mimeType: "image/jpeg"
})
```

When `savePath` is omitted the tool returns the bytes inline. By default
(`format: "resource"`) the response has two content blocks: a JSON text
block with `{ filename, mimeType, size }` and an MCP `EmbeddedResource`
whose `blob` field is standard base64. The resource `uri` is an opaque
identifier of the form `gmail-attachment:<messageId>:<attachmentId>` and is
not dereferenceable — the bytes are in the `blob` field.

Some MCP clients mis-route `EmbeddedResource` blocks containing
non-image binary (Claude.ai, for example, currently funnels them through
an `image` content-block validator that rejects `application/pdf`). For
those clients, pass `format: "text"` to get a single text block instead:

```
get_attachment({
  account: "work",
  messageId: "<id>",
  attachmentId: "<id>",
  filename: "report.pdf",
  mimeType: "application/pdf",
  format: "text"
})
```

The response is then `[{ type: "text", text: JSON.stringify({ filename, mimeType, size, base64 }) }]` — the consumer parses the JSON and base64-decodes the `base64` field. `format` is ignored when `savePath` is set; unknown `format` values fall through to the default `"resource"` behavior.

When chatting with Claude on a client that exhibits this mis-routing, tell the model up front, e.g.:

> "Use `get_attachment` with `format: "text"`, then parse the JSON and base64-decode the `base64` field to access the bytes."

The model will pick the right call shape and decode the payload in its own code-execution sandbox (writing to `/tmp` inside its container, not on your machine).

Note: very small attachments are sometimes inlined by Gmail directly into
`payload.parts[i].body.data` with no `attachmentId`. Those bytes are already
present in the `read_email` response (also base64url-encoded) and don't need
a separate `get_attachment` call.

## Configuration

Credentials are stored in `~/.gmail-mcp/`:

```
~/.gmail-mcp/
├── config.json           # Account aliases and settings
├── oauth-keys.json       # Default Google OAuth app credentials
└── accounts/
    ├── work/
    │   ├── oauth-keys.json    # Optional: per-account OAuth client
    │   └── credentials.json
    └── personal/
        └── credentials.json
```

For each account, `oauth-keys.json` is looked up first in the account
directory and falls back to the top-level `~/.gmail-mcp/oauth-keys.json`.
This lets you mix accounts that belong to different Google Cloud
projects or Workspace organizations — useful when one organization's
admin won't whitelist a third-party OAuth client owned by another.

## Development

```bash
git clone https://github.com/dmorrill/gmail-mcp-multi.git
cd gmail-mcp-multi
npm install
npm run build
npm run dev
```

## Contributing

Contributions welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
