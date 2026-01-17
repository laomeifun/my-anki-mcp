import { parseCliArgs } from "../cli";
import * as fs from "fs";
import * as path from "path";

describe("CLI Module", () => {
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
  });

  describe("parseCliArgs", () => {
    it("should return default options when no arguments provided", () => {
      process.argv = ["node", "ankimcp"];

      const options = parseCliArgs();

      expect(options).toEqual({
        ankiConnect: "http://localhost:8765",
      });
    });

    it("should parse custom anki-connect URL", () => {
      process.argv = [
        "node",
        "ankimcp",
        "--anki-connect",
        "http://192.168.1.50:8765",
      ];

      const options = parseCliArgs();

      expect(options.ankiConnect).toBe("http://192.168.1.50:8765");
    });

    it("should parse short form anki-connect option", () => {
      process.argv = ["node", "ankimcp", "-a", "http://example.com:8765"];

      const options = parseCliArgs();

      expect(options.ankiConnect).toBe("http://example.com:8765");
    });
  });

  describe("getVersion", () => {
    it("should read version from package.json", () => {
      const packageJsonPath = path.join(__dirname, "../../package.json");
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

      expect(packageJson.version).toBeDefined();
      expect(typeof packageJson.version).toBe("string");
      expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+/);
    });

    it("should handle --version flag", () => {
      process.argv = ["node", "ankimcp", "--version"];

      const writeSpy = jest.spyOn(process.stdout, "write").mockImplementation();
      const exitSpy = jest.spyOn(process, "exit").mockImplementation((() => {
        throw new Error(`process.exit called`);
      }) as never);

      try {
        parseCliArgs();
      } catch (e) {
        if (!(e instanceof Error && e.message === "process.exit called")) {
          throw e;
        }
      }

      const packageJsonPath = path.join(__dirname, "../../package.json");
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

      const output = writeSpy.mock.calls.map((call) => call[0]).join("");
      expect(output).toContain(packageJson.version);

      writeSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });
});
