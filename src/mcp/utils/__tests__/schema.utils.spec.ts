import { z } from "zod";
import { safeJsonParse, jsonStringToNative } from "../schema.utils";

describe("schema.utils", () => {
  describe("safeJsonParse", () => {
    describe("basic parsing", () => {
      it("should parse valid JSON object", () => {
        const result = safeJsonParse('{"key": "value"}');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({ key: "value" });
        }
      });

      it("should parse valid JSON array", () => {
        const result = safeJsonParse("[1, 2, 3]");
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual([1, 2, 3]);
        }
      });

      it("should parse valid JSON string", () => {
        const result = safeJsonParse('"hello"');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe("hello");
        }
      });

      it("should parse nested objects", () => {
        const result = safeJsonParse('{"outer": {"inner": "value"}}');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({ outer: { inner: "value" } });
        }
      });

      it("should parse arrays of objects", () => {
        const result = safeJsonParse('[{"id": 1}, {"id": 2}]');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual([{ id: 1 }, { id: 2 }]);
        }
      });
    });

    describe("double-stringify handling", () => {
      it("should handle double-stringified JSON object", () => {
        const original = { Front: "Question", Back: "Answer" };
        const doubleStringified = JSON.stringify(JSON.stringify(original));
        const result = safeJsonParse(doubleStringified);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(original);
        }
      });

      it("should handle double-stringified JSON array", () => {
        const original = [1, 2, 3];
        const doubleStringified = JSON.stringify(JSON.stringify(original));
        const result = safeJsonParse(doubleStringified);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(original);
        }
      });

      it("should handle triple-stringified JSON (within maxDepth)", () => {
        const original = { key: "value" };
        const tripleStringified = JSON.stringify(
          JSON.stringify(JSON.stringify(original)),
        );
        const result = safeJsonParse(tripleStringified, { maxDepth: 4 });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(original);
        }
      });

      it("should stop at maxDepth and return partially parsed result", () => {
        const original = { key: "value" };
        const tripleStringified = JSON.stringify(
          JSON.stringify(JSON.stringify(original)),
        );
        const result = safeJsonParse(tripleStringified, { maxDepth: 2 });
        expect(result.success).toBe(true);
        if (result.success) {
          // After 2 levels, we get a string, not the final object
          expect(typeof result.data).toBe("string");
        }
      });
    });

    describe("smart quotes normalization", () => {
      it("should normalize curly double quotes", () => {
        const input = '{"key": "value"}'; // Using smart quotes
        const result = safeJsonParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({ key: "value" });
        }
      });

      it("should normalize curly single quotes in strings", () => {
        const input = '{"key": "it\u2019s working"}';
        const result = safeJsonParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({ key: "it\u2019s working" });
        }
      });

      it("should normalize various Unicode quote characters", () => {
        const input = "{\u201ckey\u201d: \u201cvalue\u201d}";
        const result = safeJsonParse(input);
        expect(result.success).toBe(true);
      });

      it("should skip normalization when disabled", () => {
        const input = "{\u201ckey\u201d: \u201cvalue\u201d}";
        const result = safeJsonParse(input, { normalizeSmartQuotes: false });
        expect(result.success).toBe(false);
      });
    });

    describe("error handling", () => {
      it("should fail on empty string", () => {
        const result = safeJsonParse("");
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain("Empty string");
        }
      });

      it("should fail on whitespace-only string", () => {
        const result = safeJsonParse("   ");
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain("Empty string");
        }
      });

      it("should fail on invalid JSON", () => {
        const result = safeJsonParse("{invalid json}");
        expect(result.success).toBe(false);
      });

      it("should fail on non-JSON-like string", () => {
        const result = safeJsonParse("hello world");
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain("Does not look like JSON");
        }
      });

      it("should fail on plain number string", () => {
        const result = safeJsonParse("12345");
        expect(result.success).toBe(false);
      });

      it("should provide meaningful error message for syntax error", () => {
        const result = safeJsonParse('{"key": }');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.length).toBeGreaterThan(0);
        }
      });
    });

    describe("edge cases", () => {
      it("should handle JSON with unicode characters", () => {
        const result = safeJsonParse('{"日本語": "中文", "emoji": "🎉"}');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({ 日本語: "中文", emoji: "🎉" });
        }
      });

      it("should handle JSON with escaped characters", () => {
        const result = safeJsonParse('{"text": "line1\\nline2\\ttab"}');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({ text: "line1\nline2\ttab" });
        }
      });

      it("should handle JSON with null values", () => {
        const result = safeJsonParse('{"value": null}');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({ value: null });
        }
      });

      it("should handle JSON with boolean values", () => {
        const result = safeJsonParse('{"active": true, "disabled": false}');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({ active: true, disabled: false });
        }
      });

      it("should handle JSON with number values", () => {
        const result = safeJsonParse(
          '{"int": 42, "float": 3.14, "negative": -10}',
        );
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({ int: 42, float: 3.14, negative: -10 });
        }
      });

      it("should handle empty object", () => {
        const result = safeJsonParse("{}");
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({});
        }
      });

      it("should handle empty array", () => {
        const result = safeJsonParse("[]");
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual([]);
        }
      });

      it("should trim whitespace before parsing", () => {
        const result = safeJsonParse('  \n\t{"key": "value"}\n  ');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({ key: "value" });
        }
      });
    });

    describe("prototype pollution protection", () => {
      it("should return objects with null prototype", () => {
        const result = safeJsonParse('{"key": "value"}');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(Object.getPrototypeOf(result.data)).toBe(null);
        }
      });

      it("should return nested objects with null prototype", () => {
        const result = safeJsonParse('{"outer": {"inner": "value"}}');
        expect(result.success).toBe(true);
        if (result.success) {
          const data = result.data as { outer: object };
          expect(Object.getPrototypeOf(data)).toBe(null);
          expect(Object.getPrototypeOf(data.outer)).toBe(null);
        }
      });
    });
  });

  describe("jsonStringToNative", () => {
    describe("passthrough for native values", () => {
      it("should pass through native object unchanged", () => {
        const schema = jsonStringToNative(z.record(z.string(), z.string()), {
          paramName: "fields",
        });
        const input = { Front: "Q", Back: "A" };
        const result = schema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(input);
        }
      });

      it("should pass through native array unchanged", () => {
        const schema = jsonStringToNative(z.array(z.number()), {
          paramName: "notes",
        });
        const input = [1, 2, 3];
        const result = schema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(input);
        }
      });

      it("should pass through number unchanged", () => {
        const schema = jsonStringToNative(z.number(), { paramName: "id" });
        const result = schema.safeParse(42);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(42);
        }
      });

      it("should pass through null unchanged", () => {
        const schema = jsonStringToNative(z.null(), { paramName: "value" });
        const result = schema.safeParse(null);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(null);
        }
      });
    });

    describe("JSON string conversion", () => {
      it("should parse JSON string to object", () => {
        const schema = jsonStringToNative(z.record(z.string(), z.string()), {
          paramName: "fields",
        });
        const input = '{"Front": "Question", "Back": "Answer"}';
        const result = schema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({ Front: "Question", Back: "Answer" });
        }
      });

      it("should parse JSON string to array", () => {
        const schema = jsonStringToNative(z.array(z.number()), {
          paramName: "notes",
        });
        const input = "[1234567890, 9876543210]";
        const result = schema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual([1234567890, 9876543210]);
        }
      });

      it("should handle double-stringified input", () => {
        const schema = jsonStringToNative(z.record(z.string(), z.string()), {
          paramName: "fields",
        });
        const original = { Front: "Q", Back: "A" };
        const input = JSON.stringify(JSON.stringify(original));
        const result = schema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(original);
        }
      });

      it("should handle smart quotes in JSON string", () => {
        const schema = jsonStringToNative(z.record(z.string(), z.string()), {
          paramName: "fields",
        });
        const input = '{"Front": "Question"}';
        const result = schema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({ Front: "Question" });
        }
      });
    });

    describe("error messages", () => {
      it("should include paramName in error message for invalid JSON", () => {
        const schema = jsonStringToNative(z.record(z.string(), z.string()), {
          paramName: "fields",
        });
        const result = schema.safeParse("{invalid}");
        expect(result.success).toBe(false);
        if (!result.success) {
          const message = result.error.issues[0].message;
          expect(message).toContain("fields");
          expect(message).toContain("Invalid JSON string");
        }
      });

      it("should suggest using native value in error message", () => {
        const schema = jsonStringToNative(z.array(z.number()), {
          paramName: "notes",
        });
        const result = schema.safeParse("not-json");
        expect(result.success).toBe(false);
        if (!result.success) {
          const message = result.error.issues[0].message;
          expect(message).toContain("native value");
        }
      });

      it("should fail validation when parsed value doesn't match schema", () => {
        const schema = jsonStringToNative(z.array(z.number()), {
          paramName: "notes",
        });
        // Valid JSON but wrong type (strings instead of numbers)
        const result = schema.safeParse('["a", "b", "c"]');
        expect(result.success).toBe(false);
      });

      it("should fail for empty JSON string", () => {
        const schema = jsonStringToNative(z.record(z.string(), z.string()), {
          paramName: "fields",
        });
        const result = schema.safeParse("");
        expect(result.success).toBe(false);
      });
    });

    describe("complex nested schemas", () => {
      it("should work with nested object schemas", () => {
        const noteSchema = z.object({
          deckName: z.string(),
          modelName: z.string(),
          fields: z.record(z.string(), z.string()),
        });
        const schema = jsonStringToNative(noteSchema, { paramName: "note" });

        const input = JSON.stringify({
          deckName: "Test",
          modelName: "Basic",
          fields: { Front: "Q", Back: "A" },
        });

        const result = schema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.deckName).toBe("Test");
          expect(result.data.fields).toEqual({ Front: "Q", Back: "A" });
        }
      });

      it("should work with array of objects schema", () => {
        const templateSchema = z.object({
          Name: z.string(),
          Front: z.string(),
          Back: z.string(),
        });
        const schema = jsonStringToNative(z.array(templateSchema), {
          paramName: "cardTemplates",
        });

        const input = JSON.stringify([
          { Name: "Card 1", Front: "{{Front}}", Back: "{{Back}}" },
          { Name: "Card 2", Front: "{{Back}}", Back: "{{Front}}" },
        ]);

        const result = schema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toHaveLength(2);
          expect(result.data[0].Name).toBe("Card 1");
        }
      });
    });

    describe("real-world MCP client scenarios", () => {
      it("should handle fields parameter as JSON string (common MCP client issue)", () => {
        const schema = jsonStringToNative(z.record(z.string(), z.string()), {
          paramName: "fields",
        });

        // This is what some MCP clients send
        const mcpClientInput = '{"Front":"What is 2+2?","Back":"4"}';
        const result = schema.safeParse(mcpClientInput);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({
            Front: "What is 2+2?",
            Back: "4",
          });
        }
      });

      it("should handle notes array as JSON string (add_notes issue)", () => {
        const noteSchema = z.object({
          deckName: z.string(),
          modelName: z.string(),
          fields: z.record(z.string(), z.string()),
        });
        const schema = jsonStringToNative(z.array(noteSchema), {
          paramName: "notes",
        });

        const mcpClientInput = JSON.stringify([
          {
            deckName: "Default",
            modelName: "Basic",
            fields: { Front: "Q1", Back: "A1" },
          },
        ]);

        const result = schema.safeParse(mcpClientInput);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toHaveLength(1);
          expect(result.data[0].fields.Front).toBe("Q1");
        }
      });

      it("should handle note IDs array as JSON string (notes_info issue)", () => {
        const schema = jsonStringToNative(z.array(z.number()), {
          paramName: "notes",
        });

        const mcpClientInput = "[1234567890123456, 1234567890123457]";
        const result = schema.safeParse(mcpClientInput);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual([1234567890123456, 1234567890123457]);
        }
      });
    });
  });
});
