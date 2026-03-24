<!-- session_id: fe4f6355-3fdb-4c08-9054-2c4f218c8a82 -->
# Fix: MCP Server crash on startup — unhandled async rejection in McpLogger

## Context

The MCP server crashes immediately on startup with `Error: Not connected`. MCP SDK v1.27.1's `sendLoggingMessage()` is `async`, but `McpLogger.sendLog()` calls it with a sync `try/catch` that cannot catch rejected promises. When `KnowledgeRegistry.loadAll()` logs during `registerAllFeatures()` (constructor, before stdio handshake), the rejected promise crashes Node.

## 1. Fix `_mcp_server/src/core/logger.ts` (line 18-40)

Layer `.catch()` inside the existing `try/catch` — keep sync protection, add async protection:

```ts
sendLog(args: LoggingMessageNotification["params"]) {
    try {
        void this.server.server.sendLoggingMessage({ ...args }).catch(
            (error: unknown) => {
                if (error instanceof Error && error.message === "Not connected") {
                    return;
                }
                console.error(
                    "CRITICAL: Failed to send log to MCP server. Logging system may be compromised.",
                    {
                        error: error instanceof Error ? error.message : String(error),
                        originalLogger: args.logger,
                        originalLogLevel: args.level,
                        stack: error instanceof Error ? error.stack : undefined,
                    },
                );
            },
        );
    } catch (error) {
        // Sync throw from SDK or mock
        if (error instanceof Error && error.message === "Not connected") {
            return;
        }
        console.error(
            "CRITICAL: Failed to send log to MCP server. Logging system may be compromised.",
            {
                error: error instanceof Error ? error.message : String(error),
                originalLogger: args.logger,
                originalLogLevel: args.level,
                stack: error instanceof Error ? error.stack : undefined,
            },
        );
    }
}
```

## 2. Update `_mcp_server/tests/unit/logger.test.ts`

Update existing tests to cover async behavior and add a new test case:

- **"should send log messages"** — mock with `mockResolvedValue(undefined)` (returns Promise like real SDK)
- **"should handle server not connected errors gracefully"** — keep sync throw test (validates try/catch still works)
- **NEW: "should handle async not-connected rejection gracefully"** — mock with `mockRejectedValue(new Error("Not connected"))`, assert no unhandled rejection
- **NEW: "should console.error on unexpected async rejection"** — mock with `mockRejectedValue(new Error("Something else"))`, assert `console.error` is called

## Verification

```bash
cd _mcp_server && npm run build && npm run lint && npm test
```

Then: run `node _mcp_server/dist/cli.js` standalone — should start without crashing. Finally `/mcp` in Claude Code to confirm connection.
