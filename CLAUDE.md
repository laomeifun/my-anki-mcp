# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP server enabling AI assistants to interact with Anki via AnkiConnect. Built with NestJS and `@rekog/mcp-nest`.

- **Package**: `@laomeifun/my-anki-mcp` (npm)
- **License**: AGPL-3.0-or-later
- **Status**: Beta (0.x.x) - breaking changes allowed

## Quick Reference

```bash
# Build & Run
npm run build                    # Build → dist/ (both entry points)
npm run start:dev:stdio          # STDIO mode with watch
npm run start:dev:http           # HTTP mode with watch

# Testing
npm test                         # All tests
npm test -- path/to/file.spec.ts # Single test file
npm run test:cov                 # With coverage (70% threshold)

# Quality
npm run lint && npm run type-check   # Pre-commit checks (also runs via Husky pre-push)

# Debugging
npm run inspector:stdio          # MCP Inspector UI for testing tools
npm run inspector:stdio:debug    # With debugger on port 9229
```

## Architecture

### Entry Points

Two separate entry points compiled in single build:

| Mode  | Entry                | Use Case                          | Logging |
| ----- | -------------------- | --------------------------------- | ------- |
| STDIO | `dist/main-stdio.js` | Claude Desktop, MCP clients       | stderr  |
| HTTP  | `dist/main-http.js`  | Web-based AI (ChatGPT, claude.ai) | stdout  |

### Core Files

```
src/
├── main-stdio.ts          # STDIO bootstrap: NestFactory.createApplicationContext()
├── main-http.ts           # HTTP bootstrap: NestFactory.create() + guards
├── app.module.ts          # Root module with forStdio()/forHttp() factories
├── cli.ts                 # Commander CLI (--port, --host, --anki-connect, --ngrok)
├── anki-config.service.ts # IAnkiConfig implementation
└── mcp/
    ├── clients/anki-connect.client.ts  # HTTP client using ky (retries, error handling)
    └── primitives/essential/           # Core tools, prompts, resources
```

### Module System

```
AppModule → McpModule.forRoot() → McpPrimitivesAnkiEssentialModule.forRoot()
```

All tools/prompts/resources are providers auto-discovered by `@rekog/mcp-nest`.

### Path Aliases

- `@/*` → `src/*`
- `@test/*` → `test/*`

## Adding New Tools

### Essential Tools (general Anki operations)

1. Create `src/mcp/primitives/essential/tools/your-tool.tool.ts`
2. Export from `src/mcp/primitives/essential/index.ts`
3. Add to `MCP_PRIMITIVES` array
4. **Update `manifest.json`** ← Use snake_case for tool names (e.g., `create_deck`)
5. Create test: `src/mcp/primitives/essential/tools/__tests__/your-tool.tool.spec.ts`

### Tool Pattern

```typescript
// 1. Zod schema for input validation
// 2. Extend base tool from @rekog/mcp-nest
// 3. Implement execute() calling AnkiConnectClient
// 4. Return strongly-typed results
```

See `src/mcp/primitives/essential/tools/sync.tool.ts` for minimal example.

## Testing

```bash
npm test -- src/mcp/primitives/essential/tools/__tests__/sync.tool.spec.ts
```

- Mock `AnkiConnectClient` in unit tests (see existing tests)
- Use `test/workflows/*.spec.ts` for multi-tool scenarios
- Test helpers: `src/test-fixtures/test-helpers.ts` (`parseToolResult()`, `createMockContext()`)

### E2E Tests (requires Docker)

```bash
npm run e2e:up              # Start Anki + AnkiConnect containers
npm run e2e:test            # Run E2E tests
npm run e2e:down            # Stop containers
npm run e2e:full:local      # All-in-one: start, test, cleanup
```

## Release Process

1. Update version in `package.json` (single source of truth)
2. **Add new tools to `manifest.json` tools array** ← Critical!
3. Commit and tag: `git tag -a v0.x.0 -m "message" && git push origin v0.x.0`
4. GitHub Actions handles: version sync, build, MCPB bundle, release

**Don't run `npm run mcpb:bundle` manually** - CI handles it.

## MCPB Bundle Notes

Bundle uses STDIO entry point. Key gotchas:

- User config keys in `manifest.json` must be **snake_case** (e.g., `anki_connect_url`)
- Peer dependencies of `@rekog/mcp-nest` must stay as direct deps (JWT, passport modules)
- `mcpb clean` removes devDeps to optimize size (47MB → ~10MB)
- Use **npm** (not pnpm) - `mcpb clean` doesn't work with pnpm's node_modules

## Planning Documents

Check `.claude-draft/` for implementation plans and analysis:

- `ACTIONS_IMPLEMENTATION.md` - AnkiConnect API coverage tracking
- `PROJECT_SUMMARY.md` - Architecture decisions
- `TEST_PLAN.md` - Testing strategy

## Environment

Default AnkiConnect URL: `http://localhost:8765` (override: `ANKI_CONNECT_URL`)

## Security Notes

### HTTP Mode (`--ngrok`)

- Origin validation guard prevents DNS rebinding attacks from browsers
- Direct API calls (curl, MCP clients) are allowed without Origin header
- For public exposure, consider the inherent security-through-obscurity of ngrok URLs

### Environment Variable Resource

The `env://{name}` resource restricts access to a safe allowlist:

- `NODE_ENV`, `LOG_LEVEL`, `HOST`, `PORT`, `ALLOWED_ORIGINS`
- `ANKI_CONNECT_URL`, `ANKI_CONNECT_API_VERSION`, `ANKI_CONNECT_TIMEOUT`

Sensitive variables (containing `KEY`, `SECRET`, `TOKEN`, etc.) are blocked.

## Resource URI Design

**Important**: `@rekog/mcp-nest` strips the protocol when matching resources, so all URIs share the same path namespace.

### URI Structure

All resource URIs must include a type prefix in the path to avoid conflicts:

```
{protocol}://{type}/{action}
{protocol}://{type}/{param}/{action}
```

| Resource   | URI                          | Path (after stripping protocol) |
| ---------- | ---------------------------- | ------------------------------- |
| Deck list  | `deck://decks/list`          | `decks/list`                    |
| Deck stats | `deck://decks/{name}/stats`  | `decks/{name}/stats`            |
| Deck tree  | `deck://decks/tree`          | `decks/tree`                    |
| Model list | `model://models/list`        | `models/list`                   |
| Model info | `model://models/{name}/info` | `models/{name}/info`            |
| Tag list   | `tag://tags/list`            | `tags/list`                     |

### Why This Matters

The framework uses `path-to-regexp` for matching and **ResourceTemplates take priority** over static Resources. Without unique path prefixes:

- `deck://list` → path `list`
- `model://{name}` → path `:name`
- `:name` matches `list` → **Wrong handler called!**

## Tool Naming Convention

**Use snake_case** for ALL tool names:

- ✅ `create_deck`, `get_due_cards`, `list_decks`, `rate_card`, `add_note`, `find_notes`
- ❌ Avoid camelCase: `addNote`, `findNotes`, `notesInfo`

## Tool Design Guidelines

### Parameter Descriptions

Always include in `.describe()`:

- Default values: `"Maximum cards to return (default: 10, max: 50)"`
- Format requirements: `"MUST pass as object, NOT as JSON string"`
- Examples when helpful: `'Use "::" for nested structure (e.g., "Parent::Child")'`

### Error Responses

Use `createErrorResponse()` with:

```typescript
return createErrorResponse(error, {
  hint: "Actionable suggestion for the user",
  // Optional: help LLM decide next action
  errorType: "CONNECTION_ERROR" | "VALIDATION_ERROR" | "NOT_FOUND",
  recoverable: true,
});
```

### Batch Operations

- Limit batch sizes (10 for notes, 100 for tags)
- Support `stopOnFirstError` parameter for debugging
- Return per-item results for partial success handling

### JSON Parameter Handling

Tools accepting complex objects should:

1. Accept both object and JSON string formats
2. Use `safeJsonParse()` from `schema.utils.ts` for detailed error messages
3. Include recovery for common issues (double-escaping, smart quotes)
