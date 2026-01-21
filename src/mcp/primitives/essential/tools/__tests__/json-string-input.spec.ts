import { z } from "zod";
import { jsonStringToNative } from "../../../../utils/schema.utils";

describe("Tool Schema JSON String Robustness", () => {
  describe("add_note fields schema", () => {
    const FieldsSchema = jsonStringToNative(z.record(z.string(), z.string()), {
      paramName: "fields",
    });

    it("should accept native object", () => {
      const result = FieldsSchema.safeParse({ Front: "Q", Back: "A" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ Front: "Q", Back: "A" });
      }
    });

    it("should accept JSON string", () => {
      const input = JSON.stringify({ Front: "Question", Back: "Answer" });
      const result = FieldsSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ Front: "Question", Back: "Answer" });
      }
    });

    it("should accept double-stringified JSON", () => {
      const original = { Front: "Q", Back: "A" };
      const input = JSON.stringify(JSON.stringify(original));
      const result = FieldsSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(original);
      }
    });

    it("should accept smart quotes", () => {
      const input = '{"Front": "Question", "Back": "Answer"}';
      const result = FieldsSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should handle unicode in JSON string", () => {
      const input = JSON.stringify({ Front: "日本語 🎌", Back: "中文" });
      const result = FieldsSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ Front: "日本語 🎌", Back: "中文" });
      }
    });

    it("should handle HTML in JSON string", () => {
      const input = JSON.stringify({
        Front: "<b>Bold</b>",
        Back: "<ul><li>Item</li></ul>",
      });
      const result = FieldsSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.Front).toBe("<b>Bold</b>");
      }
    });

    it("should reject invalid JSON string", () => {
      const result = FieldsSchema.safeParse("{invalid}");
      expect(result.success).toBe(false);
    });

    it("should reject non-JSON-like string", () => {
      const result = FieldsSchema.safeParse("just a plain string");
      expect(result.success).toBe(false);
    });
  });

  describe("add_notes notes array schema", () => {
    const NoteInputSchema = z.object({
      deckName: z.string().min(1),
      modelName: z.string().min(1),
      fields: jsonStringToNative(z.record(z.string(), z.string()), {
        paramName: "fields",
      }),
      tags: z.array(z.string()).optional(),
    });

    const NotesArraySchema = jsonStringToNative(
      z.array(NoteInputSchema).min(1).max(10),
      { paramName: "notes" },
    );

    it("should accept native array", () => {
      const input = [
        {
          deckName: "Test",
          modelName: "Basic",
          fields: { Front: "Q", Back: "A" },
        },
      ];
      const result = NotesArraySchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should accept JSON string of array", () => {
      const original = [
        {
          deckName: "Test",
          modelName: "Basic",
          fields: { Front: "Q", Back: "A" },
        },
        {
          deckName: "Test",
          modelName: "Basic",
          fields: { Front: "Q2", Back: "A2" },
        },
      ];
      const input = JSON.stringify(original);
      const result = NotesArraySchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].deckName).toBe("Test");
      }
    });

    it("should accept double-stringified notes array", () => {
      const original = [
        {
          deckName: "Test",
          modelName: "Basic",
          fields: { Front: "Q", Back: "A" },
        },
      ];
      const input = JSON.stringify(JSON.stringify(original));
      const result = NotesArraySchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should accept notes with fields as nested JSON string", () => {
      const input = [
        {
          deckName: "Test",
          modelName: "Basic",
          fields: JSON.stringify({ Front: "Q", Back: "A" }),
        },
      ];
      const result = NotesArraySchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].fields).toEqual({ Front: "Q", Back: "A" });
      }
    });

    it("should reject empty array", () => {
      const result = NotesArraySchema.safeParse([]);
      expect(result.success).toBe(false);
    });

    it("should reject array exceeding max size", () => {
      const input = Array.from({ length: 11 }, () => ({
        deckName: "Test",
        modelName: "Basic",
        fields: { Front: "Q", Back: "A" },
      }));
      const result = NotesArraySchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("update_note_fields note schema", () => {
    const NoteUpdateSchema = z.object({
      id: z.number(),
      fields: jsonStringToNative(z.record(z.string(), z.string()), {
        paramName: "fields",
      }),
    });

    const NoteObjectSchema = jsonStringToNative(NoteUpdateSchema, {
      paramName: "note",
    });

    it("should accept native object", () => {
      const input = { id: 123, fields: { Front: "Updated" } };
      const result = NoteObjectSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should accept JSON string of note object", () => {
      const original = { id: 123, fields: { Front: "Updated" } };
      const input = JSON.stringify(original);
      const result = NoteObjectSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(123);
        expect(result.data.fields).toEqual({ Front: "Updated" });
      }
    });

    it("should accept note with fields as nested JSON string", () => {
      const input = {
        id: 123,
        fields: JSON.stringify({ Front: "Updated" }),
      };
      const result = NoteObjectSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fields).toEqual({ Front: "Updated" });
      }
    });

    it("should accept double-stringified note", () => {
      const original = { id: 123, fields: { Front: "Updated" } };
      const input = JSON.stringify(JSON.stringify(original));
      const result = NoteObjectSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe("delete_notes notes array schema", () => {
    const NotesArraySchema = jsonStringToNative(
      z.array(z.number()).min(1).max(100),
      { paramName: "notes" },
    );

    it("should accept native array of numbers", () => {
      const result = NotesArraySchema.safeParse([1, 2, 3]);
      expect(result.success).toBe(true);
    });

    it("should accept JSON string of number array", () => {
      const input = JSON.stringify([1234567890, 9876543210]);
      const result = NotesArraySchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([1234567890, 9876543210]);
      }
    });

    it("should accept double-stringified number array", () => {
      const original = [111, 222, 333];
      const input = JSON.stringify(JSON.stringify(original));
      const result = NotesArraySchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(original);
      }
    });

    it("should reject array with non-numbers", () => {
      const result = NotesArraySchema.safeParse(["a", "b"]);
      expect(result.success).toBe(false);
    });
  });

  describe("create_model schemas", () => {
    const InOrderFieldsSchema = jsonStringToNative(
      z.array(z.string().min(1)).min(1),
      { paramName: "inOrderFields" },
    );

    const CardTemplateSchema = z.object({
      Name: z.string().min(1),
      Front: z.string(),
      Back: z.string(),
    });

    const CardTemplatesSchema = jsonStringToNative(
      z.array(CardTemplateSchema).min(1),
      { paramName: "cardTemplates" },
    );

    describe("inOrderFields", () => {
      it("should accept native array", () => {
        const result = InOrderFieldsSchema.safeParse(["Front", "Back"]);
        expect(result.success).toBe(true);
      });

      it("should accept JSON string", () => {
        const input = JSON.stringify(["Front", "Back", "Extra"]);
        const result = InOrderFieldsSchema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(["Front", "Back", "Extra"]);
        }
      });

      it("should accept double-stringified", () => {
        const original = ["Field1", "Field2"];
        const input = JSON.stringify(JSON.stringify(original));
        const result = InOrderFieldsSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it("should reject empty array", () => {
        const result = InOrderFieldsSchema.safeParse([]);
        expect(result.success).toBe(false);
      });

      it("should reject array with empty strings", () => {
        const result = InOrderFieldsSchema.safeParse(["Front", ""]);
        expect(result.success).toBe(false);
      });
    });

    describe("cardTemplates", () => {
      it("should accept native array", () => {
        const input = [
          { Name: "Card 1", Front: "{{Front}}", Back: "{{Back}}" },
        ];
        const result = CardTemplatesSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it("should accept JSON string", () => {
        const original = [
          { Name: "Card 1", Front: "{{Front}}", Back: "{{Back}}" },
          { Name: "Card 2", Front: "{{Back}}", Back: "{{Front}}" },
        ];
        const input = JSON.stringify(original);
        const result = CardTemplatesSchema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toHaveLength(2);
        }
      });

      it("should accept double-stringified", () => {
        const original = [
          { Name: "Card 1", Front: "{{Front}}", Back: "{{Back}}" },
        ];
        const input = JSON.stringify(JSON.stringify(original));
        const result = CardTemplatesSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it("should reject empty array", () => {
        const result = CardTemplatesSchema.safeParse([]);
        expect(result.success).toBe(false);
      });

      it("should reject invalid template structure", () => {
        const input = [{ InvalidKey: "value" }];
        const result = CardTemplatesSchema.safeParse(input);
        expect(result.success).toBe(false);
      });
    });
  });

  describe("Real-world MCP client scenarios", () => {
    const FieldsSchema = jsonStringToNative(z.record(z.string(), z.string()), {
      paramName: "fields",
    });

    it("should handle MCP client sending fields as JSON string (common issue)", () => {
      const mcpClientInput = '{"Front":"What is 2+2?","Back":"4"}';
      const result = FieldsSchema.safeParse(mcpClientInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.Front).toBe("What is 2+2?");
        expect(result.data.Back).toBe("4");
      }
    });

    it("should handle MCP client sending with extra escaping", () => {
      const original = { Front: 'Test with "quotes"', Back: "And\nnewlines" };
      const mcpClientInput = JSON.stringify(original);
      const result = FieldsSchema.safeParse(mcpClientInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.Front).toBe('Test with "quotes"');
        expect(result.data.Back).toBe("And\nnewlines");
      }
    });

    it("should handle complex cloze content in JSON string", () => {
      const input = JSON.stringify({
        Text: "The {{c1::capital}} of France is {{c2::Paris}}",
        "Back Extra": "Geography fact",
      });
      const result = FieldsSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.Text).toContain("{{c1::capital}}");
      }
    });

    it("should handle deeply nested JSON (triple stringify within maxDepth)", () => {
      const original = { Front: "Q", Back: "A" };
      const triple = JSON.stringify(JSON.stringify(JSON.stringify(original)));
      const result = FieldsSchema.safeParse(triple);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(original);
      }
    });
  });

  describe("Error message quality", () => {
    const FieldsSchema = jsonStringToNative(z.record(z.string(), z.string()), {
      paramName: "fields",
    });

    it("should include paramName in error for invalid JSON", () => {
      const result = FieldsSchema.safeParse("{invalid}");
      expect(result.success).toBe(false);
      if (!result.success) {
        const message = result.error.issues[0].message;
        expect(message).toContain("fields");
      }
    });

    it("should suggest using native value", () => {
      const result = FieldsSchema.safeParse("not json at all");
      expect(result.success).toBe(false);
      if (!result.success) {
        const message = result.error.issues[0].message;
        expect(message).toContain("native value");
      }
    });
  });
});
