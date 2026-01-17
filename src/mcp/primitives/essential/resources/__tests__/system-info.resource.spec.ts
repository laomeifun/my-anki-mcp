import { SystemInfoResource } from "../system-info.resource";

describe("SystemInfoResource", () => {
  let resource: SystemInfoResource;

  beforeEach(() => {
    resource = new SystemInfoResource();
  });

  describe("getSystemInfo", () => {
    it("should return formatted system information", () => {
      const uri = "system://info";
      const result = resource.getSystemInfo({ uri });

      expect(result).toHaveProperty("contents");
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]).toHaveProperty("uri");
      expect(result.contents[0].uri).toBe(uri);
      expect(result.contents[0]).toHaveProperty("mimeType");
      expect(result.contents[0].mimeType).toBe("application/json");
      expect(result.contents[0]).toHaveProperty("text");
    });

    it("should return valid JSON", () => {
      const result = resource.getSystemInfo({ uri: "system://info" });
      const text = result.contents[0].text;

      expect(() => JSON.parse(text)).not.toThrow();
    });

    it("should include all required system information fields", () => {
      const result = resource.getSystemInfo({ uri: "system://info" });
      const data = JSON.parse(result.contents[0].text);

      expect(data).toHaveProperty("platform");
      expect(data).toHaveProperty("release");
      expect(data).toHaveProperty("type");
      expect(data).toHaveProperty("arch");
      expect(data).toHaveProperty("cpus");
      expect(data).toHaveProperty("totalMemory");
      expect(data).toHaveProperty("freeMemory");
      expect(data).toHaveProperty("uptime");
      expect(data).toHaveProperty("hostname");
      expect(data).toHaveProperty("nodeVersion");
      expect(data).toHaveProperty("env");
    });

    it("should format memory as GB", () => {
      const result = resource.getSystemInfo({ uri: "system://info" });
      const data = JSON.parse(result.contents[0].text);

      expect(data.totalMemory).toMatch(/^\d+ GB$/);
      expect(data.freeMemory).toMatch(/^\d+ GB$/);
    });

    it("should format uptime as hours", () => {
      const result = resource.getSystemInfo({ uri: "system://info" });
      const data = JSON.parse(result.contents[0].text);

      expect(data.uptime).toMatch(/^\d+ hours$/);
    });

    it("should include CPU count as number", () => {
      const result = resource.getSystemInfo({ uri: "system://info" });
      const data = JSON.parse(result.contents[0].text);

      expect(typeof data.cpus).toBe("number");
      expect(data.cpus).toBeGreaterThan(0);
    });

    it("should include NODE_ENV in environment", () => {
      const result = resource.getSystemInfo({ uri: "system://info" });
      const data = JSON.parse(result.contents[0].text);

      expect(data.env).toHaveProperty("NODE_ENV");
      expect(typeof data.env.NODE_ENV).toBe("string");
    });

    it("should default NODE_ENV to development when not set", () => {
      const originalEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;

      const result = resource.getSystemInfo({ uri: "system://info" });
      const data = JSON.parse(result.contents[0].text);

      expect(data.env.NODE_ENV).toBe("development");

      // Restore
      if (originalEnv !== undefined) {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it("should include Node.js version", () => {
      const result = resource.getSystemInfo({ uri: "system://info" });
      const data = JSON.parse(result.contents[0].text);

      expect(data.nodeVersion).toBe(process.version);
      expect(data.nodeVersion).toMatch(/^v\d+\.\d+\.\d+/);
    });

    it("should handle different URI values", () => {
      const uri1 = "system://info";
      const uri2 = "custom://path";

      const result1 = resource.getSystemInfo({ uri: uri1 });
      const result2 = resource.getSystemInfo({ uri: uri2 });

      expect(result1.contents[0].uri).toBe(uri1);
      expect(result2.contents[0].uri).toBe(uri2);
    });
  });

  describe("getEnvironmentVariable", () => {
    const originalEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
      originalEnv.NODE_ENV = process.env.NODE_ENV;
      originalEnv.LOG_LEVEL = process.env.LOG_LEVEL;
      originalEnv.ANKI_CONNECT_URL = process.env.ANKI_CONNECT_URL;
      originalEnv.HOST = process.env.HOST;
      originalEnv.PORT = process.env.PORT;
    });

    afterEach(() => {
      process.env.NODE_ENV = originalEnv.NODE_ENV;
      process.env.LOG_LEVEL = originalEnv.LOG_LEVEL;
      process.env.ANKI_CONNECT_URL = originalEnv.ANKI_CONNECT_URL;
      process.env.HOST = originalEnv.HOST;
      process.env.PORT = originalEnv.PORT;
    });

    it("should return existing allowlisted environment variable", () => {
      process.env.LOG_LEVEL = "debug";

      const result = resource.getEnvironmentVariable({
        uri: "env://log_level",
        name: "log_level",
      });

      expect(result).toHaveProperty("contents");
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].text).toBe("debug");
    });

    it("should return correct mimeType for environment variables", () => {
      process.env.LOG_LEVEL = "info";

      const result = resource.getEnvironmentVariable({
        uri: "env://log_level",
        name: "log_level",
      });

      expect(result.contents[0].mimeType).toBe("text/plain");
    });

    it("should deny access to non-allowlisted variables", () => {
      const result = resource.getEnvironmentVariable({
        uri: "env://some_random_var",
        name: "some_random_var",
      });

      expect(result.contents[0].text).toContain("Access denied");
      expect(result.contents[0].text).toContain("not in the allowed");
    });

    it("should handle case-insensitive variable names (uppercase conversion)", () => {
      process.env.ANKI_CONNECT_URL = "http://test:8765";

      const result = resource.getEnvironmentVariable({
        uri: "env://anki_connect_url",
        name: "anki_connect_url",
      });

      expect(result.contents[0].text).toBe("http://test:8765");
    });

    it("should handle uppercase variable names", () => {
      process.env.HOST = "0.0.0.0";

      const result = resource.getEnvironmentVariable({
        uri: "env://host",
        name: "HOST",
      });

      expect(result.contents[0].text).toBe("0.0.0.0");
    });

    it("should return correct URI in response", () => {
      process.env.PORT = "3000";
      const uri = "env://port";

      const result = resource.getEnvironmentVariable({
        uri,
        name: "port",
      });

      expect(result.contents[0].uri).toBe(uri);
    });

    it("should return '(not set)' for unset allowlisted variable", () => {
      delete process.env.LOG_LEVEL;

      const result = resource.getEnvironmentVariable({
        uri: "env://log_level",
        name: "log_level",
      });

      expect(result.contents[0].text).toBe("(not set)");
    });

    it("should block access to variables with sensitive patterns", () => {
      const result = resource.getEnvironmentVariable({
        uri: "env://api_key",
        name: "api_key",
      });

      expect(result.contents[0].text).toContain("Access denied");
    });

    it("should block access to SECRET variables", () => {
      const result = resource.getEnvironmentVariable({
        uri: "env://my_secret",
        name: "my_secret",
      });

      expect(result.contents[0].text).toContain("Access denied");
    });

    it("should block access to TOKEN variables", () => {
      const result = resource.getEnvironmentVariable({
        uri: "env://auth_token",
        name: "auth_token",
      });

      expect(result.contents[0].text).toContain("Access denied");
    });

    it("should allow access to NODE_ENV", () => {
      process.env.NODE_ENV = "test";

      const result = resource.getEnvironmentVariable({
        uri: "env://node_env",
        name: "node_env",
      });

      expect(result.contents[0].text).toBe("test");
    });

    it("should handle numeric environment variable values", () => {
      process.env.PORT = "8080";

      const result = resource.getEnvironmentVariable({
        uri: "env://port",
        name: "port",
      });

      expect(result.contents[0].text).toBe("8080");
    });
  });
});
