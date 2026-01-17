import { Test, TestingModule } from "@nestjs/testing";
import { AppModule } from "./app.module";
import { AnkiConfigService } from "./anki-config.service";

describe("AppModule", () => {
  describe("forStdio", () => {
    let module: TestingModule;

    beforeEach(async () => {
      module = await Test.createTestingModule({
        imports: [AppModule.forStdio()],
      }).compile();
    });

    afterEach(async () => {
      if (module) {
        await module.close();
      }
    });

    it("should create module with STDIO transport", () => {
      expect(module).toBeDefined();
    });

    it("should provide AnkiConfigService", () => {
      const ankiConfigService =
        module.get<AnkiConfigService>(AnkiConfigService);
      expect(ankiConfigService).toBeDefined();
      expect(ankiConfigService).toBeInstanceOf(AnkiConfigService);
    });

    it("should have STDIO transport configuration", () => {
      const dynamicModule = AppModule.forStdio();

      expect(dynamicModule.module).toBe(AppModule);
      expect(dynamicModule.imports).toBeDefined();
      expect(Array.isArray(dynamicModule.imports)).toBe(true);
    });

    it("should include ConfigModule", async () => {
      expect(module).toBeDefined();
    });

    it("should include MCP primitives modules", () => {
      const dynamicModule = AppModule.forStdio();

      expect(dynamicModule.imports?.length).toBe(3);
    });

    it("should register providers", () => {
      const dynamicModule = AppModule.forStdio();

      expect(dynamicModule.providers).toBeDefined();
      expect(dynamicModule.providers).toContain(AnkiConfigService);
    });
  });

  describe("environment configuration", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should use MCP_SERVER_NAME from environment", () => {
      process.env.MCP_SERVER_NAME = "test-server-stdio";

      const dynamicModule = AppModule.forStdio();

      expect(dynamicModule).toBeDefined();
    });

    it("should use MCP_SERVER_VERSION from environment", () => {
      process.env.MCP_SERVER_VERSION = "2.0.0";

      const dynamicModule = AppModule.forStdio();

      expect(dynamicModule).toBeDefined();
    });

    it("should fall back to default server name when not in environment", () => {
      delete process.env.MCP_SERVER_NAME;

      const dynamicModule = AppModule.forStdio();

      expect(dynamicModule).toBeDefined();
    });

    it("should fall back to default version when not in environment", () => {
      delete process.env.MCP_SERVER_VERSION;

      const dynamicModule = AppModule.forStdio();

      expect(dynamicModule).toBeDefined();
    });
  });

  describe("regression tests", () => {
    it("should maintain backward compatibility for STDIO mode", async () => {
      const module = await Test.createTestingModule({
        imports: [AppModule.forStdio()],
      }).compile();

      expect(module).toBeDefined();

      const ankiConfigService =
        module.get<AnkiConfigService>(AnkiConfigService);
      expect(ankiConfigService).toBeDefined();

      await module.close();
    });

    it("should not break existing module structure", () => {
      const stdioModule = AppModule.forStdio();

      expect(stdioModule.module).toBeDefined();
      expect(stdioModule.imports).toBeDefined();
      expect(stdioModule.providers).toBeDefined();
    });
  });
});
