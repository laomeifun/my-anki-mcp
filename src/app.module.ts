import { DynamicModule, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { McpModule, McpTransportType } from "@rekog/mcp-nest";
import {
  McpPrimitivesAnkiEssentialModule,
  ANKI_CONFIG,
  ESSENTIAL_MCP_TOOLS,
} from "./mcp/primitives/essential";
import { AnkiConfigService } from "./anki-config.service";

@Module({})
export class AppModule {
  static forStdio(): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          cache: true,
          envFilePath: [".env.local", ".env"],
        }),

        McpModule.forRoot({
          name: process.env.MCP_SERVER_NAME || "anki-mcp-server",
          version: process.env.MCP_SERVER_VERSION || "1.0.0",
          transport: McpTransportType.STDIO,
        }),

        McpPrimitivesAnkiEssentialModule.forRoot({
          ankiConfigProvider: {
            provide: ANKI_CONFIG,
            useClass: AnkiConfigService,
          },
        }),
      ],
      providers: [AnkiConfigService, ...ESSENTIAL_MCP_TOOLS],
    };
  }
}
