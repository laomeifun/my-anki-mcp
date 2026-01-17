import { Command } from "commander";
import { readFileSync } from "fs";
import { join } from "path";

export interface CliOptions {
  ankiConnect: string;
}

function getPackageJson() {
  try {
    return JSON.parse(
      readFileSync(join(__dirname, "../package.json"), "utf-8"),
    );
  } catch {
    return { version: "0.0.0", name: "ankimcp" };
  }
}

function getVersion(): string {
  return getPackageJson().version;
}

export function parseCliArgs(): CliOptions {
  const program = new Command();

  program
    .name("ankimcp")
    .description("AnkiMCP Server - Model Context Protocol server for Anki")
    .version(getVersion())
    .option(
      "-a, --anki-connect <url>",
      "AnkiConnect URL",
      "http://localhost:8765",
    )
    .addHelpText(
      "after",
      `
Examples:
  $ ankimcp                                    # Use defaults
  $ ankimcp --anki-connect http://localhost:8765

MCP client configuration (Cursor, Cline, Zed, Claude Desktop, etc.):
  {
    "mcpServers": {
      "anki-mcp": {
        "command": "npx",
        "args": ["-y", "@laomeifun/my-anki-mcp"]
      }
    }
  }
`,
    );

  program.parse();

  const options = program.opts<CliOptions>();

  return {
    ankiConnect: options.ankiConnect,
  };
}
