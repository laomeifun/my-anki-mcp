import { Test, TestingModule } from "@nestjs/testing";
import { AddNotesTool } from "../add-notes.tool";
import {
  AnkiConnectClient,
  AnkiConnectError,
} from "../../../../clients/anki-connect.client";
import {
  parseToolResult,
  createMockContext,
} from "../../../../../test-fixtures/test-helpers";

jest.mock("../../../../clients/anki-connect.client");

describe("AddNotesTool", () => {
  let tool: AddNotesTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let mockContext: ReturnType<typeof createMockContext>;

  const makeNote = (
    overrides: Partial<{
      deckName: string;
      modelName: string;
      fields: Record<string, string>;
      tags: string[];
      allowDuplicate: boolean;
    }> = {},
  ) => {
    return {
      deckName: overrides.deckName ?? "Default",
      modelName: overrides.modelName ?? "Basic",
      fields: overrides.fields ?? { Front: "Question", Back: "Answer" },
      ...(overrides.tags !== undefined && { tags: overrides.tags }),
      ...(overrides.allowDuplicate !== undefined && {
        allowDuplicate: overrides.allowDuplicate,
      }),
    };
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AddNotesTool, AnkiConnectClient],
    }).compile();

    tool = module.get<AddNotesTool>(AddNotesTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;

    mockContext = createMockContext();

    jest.clearAllMocks();
  });

  const setupModelFieldNamesMock = (addNotesResult?: (number | null)[]) => {
    ankiClient.invoke.mockImplementation((action: string, params?: unknown) => {
      if (action === "modelFieldNames") {
        const p = params as { modelName: string };
        if (p.modelName === "Cloze") {
          return Promise.resolve(["Text", "Back Extra"]);
        }
        if (p.modelName === "Vocabulary Advanced") {
          return Promise.resolve([
            "Word",
            "Definition",
            "Example",
            "Pronunciation",
            "Etymology",
            "Notes",
          ]);
        }
        if (p.modelName === "Custom Model") {
          return Promise.resolve([
            "Field-With-Dashes",
            "Field_With_Underscores",
            "Field With Spaces",
          ]);
        }
        if (p.modelName === "Basic (and reversed card)") {
          return Promise.resolve(["Front", "Back"]);
        }
        if (p.modelName === "TestModel") {
          return Promise.resolve(["Front", "Back"]);
        }
        return Promise.resolve(["Front", "Back"]);
      }
      if (action === "addNotes") {
        return Promise.resolve(addNotesResult ?? [null]);
      }
      return Promise.resolve(null);
    });
  };

  describe("Basic Batch Operations", () => {
    it("should successfully add a single note via batch", async () => {
      setupModelFieldNamesMock([1234567890]);
      const notes = [makeNote()];

      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      expect(ankiClient.invoke).toHaveBeenCalledWith("addNotes", {
        notes: [
          {
            deckName: "Default",
            modelName: "Basic",
            fields: { Front: "Question", Back: "Answer" },
          },
        ],
      });
      expect(result.success).toBe(true);
      expect(result.totalRequested).toBe(1);
      expect(result.successCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(result.noteIds).toEqual([1234567890]);
      expect(result.message).toContain("Successfully created all 1 notes");
    });

    it("should successfully add multiple notes", async () => {
      setupModelFieldNamesMock([111, 222, 333]);
      const notes = [
        makeNote({ fields: { Front: "Q1", Back: "A1" } }),
        makeNote({ fields: { Front: "Q2", Back: "A2" } }),
        makeNote({ fields: { Front: "Q3", Back: "A3" } }),
      ];

      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(3);
      expect(result.noteIds).toEqual([111, 222, 333]);
      expect(result.results).toHaveLength(3);
      expect(result.results[0]).toMatchObject({
        index: 0,
        success: true,
        noteId: 111,
      });
      expect(result.results[1]).toMatchObject({
        index: 1,
        success: true,
        noteId: 222,
      });
      expect(result.results[2]).toMatchObject({
        index: 2,
        success: true,
        noteId: 333,
      });
    });

    it("should add notes with tags", async () => {
      setupModelFieldNamesMock([123]);
      const notes = [makeNote({ tags: ["spanish", "vocab"] })];

      await tool.addNotes({ notes }, mockContext);

      expect(ankiClient.invoke).toHaveBeenCalledWith("addNotes", {
        notes: [
          expect.objectContaining({
            tags: ["spanish", "vocab"],
          }),
        ],
      });
    });

    it("should add notes with duplicate options", async () => {
      setupModelFieldNamesMock([123]);
      const notes = [
        makeNote({
          allowDuplicate: true,
        }),
      ];

      await tool.addNotes({ notes }, mockContext);

      expect(ankiClient.invoke).toHaveBeenCalledWith("addNotes", {
        notes: [
          expect.objectContaining({
            options: {
              allowDuplicate: true,
            },
          }),
        ],
      });
    });

    it("should add notes to different decks in same batch", async () => {
      setupModelFieldNamesMock([1, 2, 3]);
      const notes = [
        makeNote({ deckName: "Spanish" }),
        makeNote({ deckName: "French" }),
        makeNote({ deckName: "German" }),
      ];

      await tool.addNotes({ notes }, mockContext);

      expect(ankiClient.invoke).toHaveBeenCalledWith("addNotes", {
        notes: [
          expect.objectContaining({ deckName: "Spanish" }),
          expect.objectContaining({ deckName: "French" }),
          expect.objectContaining({ deckName: "German" }),
        ],
      });
    });

    it("should add notes with different models in same batch", async () => {
      setupModelFieldNamesMock([1, 2]);
      const notes = [
        makeNote({ modelName: "Basic" }),
        makeNote({
          modelName: "Cloze",
          fields: { Text: "{{c1::Answer}}", "Back Extra": "" },
        }),
      ];

      await tool.addNotes({ notes }, mockContext);

      expect(ankiClient.invoke).toHaveBeenCalledWith("addNotes", {
        notes: [
          expect.objectContaining({ modelName: "Basic" }),
          expect.objectContaining({ modelName: "Cloze" }),
        ],
      });
    });
  });

  describe("Partial Failure Handling", () => {
    it("should handle some notes failing (null in response)", async () => {
      // Arrange
      const notes = [
        makeNote({ fields: { Front: "Q1", Back: "A1" } }),
        makeNote({ fields: { Front: "Q2", Back: "A2" } }), // This one will fail
        makeNote({ fields: { Front: "Q3", Back: "A3" } }),
      ];
      setupModelFieldNamesMock([111, null, 333]);

      // Act
      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true); // Still success because some notes succeeded
      expect(result.successCount).toBe(2);
      expect(result.failedCount).toBe(1);
      expect(result.noteIds).toEqual([111, 333]); // Only successful IDs
    });

    it("should correctly identify which notes failed by index", async () => {
      // Arrange
      const notes = [
        makeNote({ deckName: "Deck1" }),
        makeNote({ deckName: "Deck2" }),
        makeNote({ deckName: "Deck3" }),
      ];
      setupModelFieldNamesMock([null, 222, null]);

      // Act
      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.results[0]).toMatchObject({
        index: 0,
        success: false,
        noteId: null,
        deckName: "Deck1",
      });
      expect(result.results[1]).toMatchObject({
        index: 1,
        success: true,
        noteId: 222,
        deckName: "Deck2",
      });
      expect(result.results[2]).toMatchObject({
        index: 2,
        success: false,
        noteId: null,
        deckName: "Deck3",
      });
    });

    it("should return success=true when at least one note succeeds", async () => {
      // Arrange
      const notes = [makeNote(), makeNote(), makeNote()];
      setupModelFieldNamesMock([null, null, 999]);

      // Act
      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.successCount).toBe(1);
      expect(result.failedCount).toBe(2);
    });

    it("should include hint when there are partial failures", async () => {
      // Arrange
      const notes = [makeNote(), makeNote()];
      setupModelFieldNamesMock([111, null]);

      // Act
      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.hint).toContain("Some notes failed");
      expect(result.message).toContain("1 note(s) failed");
    });

    it("should preserve failed note details in results", async () => {
      // Arrange
      const notes = [
        makeNote({ deckName: "TestDeck", modelName: "TestModel" }),
      ];
      setupModelFieldNamesMock([null]);

      // Act
      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      // Assert - all failed so success is false
      expect(result.success).toBe(false);
      expect(result.results[0]).toMatchObject({
        index: 0,
        success: false,
        deckName: "TestDeck",
        modelName: "TestModel",
        error: expect.any(String),
      });
    });
  });

  describe("Complete Failure Handling", () => {
    it("should return success=false when all notes fail", async () => {
      // Arrange
      const notes = [makeNote(), makeNote(), makeNote()];
      setupModelFieldNamesMock([null, null, null]);

      // Act
      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.successCount).toBe(0);
      expect(result.failedCount).toBe(3);
    });

    it("should return all failures in results array", async () => {
      // Arrange
      const notes = [
        makeNote({ deckName: "D1" }),
        makeNote({ deckName: "D2" }),
      ];
      setupModelFieldNamesMock([null, null]);

      // Act
      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.results).toHaveLength(2);
      expect(
        result.results.every((r: { success: boolean }) => r.success === false),
      ).toBe(true);
    });

    it("should provide helpful error message when all fail", async () => {
      // Arrange
      const notes = [makeNote()];
      setupModelFieldNamesMock([null]);

      // Act
      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.error).toContain("All notes failed");
      expect(result.hint).toContain(
        "Check that deck names and model names are correct",
      );
    });
  });

  describe("Validation", () => {
    it("should reject batch when primary field is empty (with stopOnFirstError)", async () => {
      setupModelFieldNamesMock();
      const notes = [
        makeNote({ fields: { Front: "Valid", Back: "Valid" } }),
        makeNote({ fields: { Front: "", Back: "Valid" } }),
      ];

      const rawResult = await tool.addNotes(
        { notes, stopOnFirstError: true },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Primary field");
      expect(result.error).toContain("cannot be empty");
    });

    it("should identify the index of the invalid note (with stopOnFirstError)", async () => {
      setupModelFieldNamesMock();
      const notes = [
        makeNote({ fields: { Front: "Valid", Back: "Valid" } }),
        makeNote({ fields: { Front: "Valid", Back: "Valid" } }),
        makeNote({ fields: { Front: "   ", Back: "Valid" } }),
      ];

      const rawResult = await tool.addNotes(
        { notes, stopOnFirstError: true },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.noteIndex).toBe(2);
    });

    it("should collect validation errors when stopOnFirstError is false", async () => {
      setupModelFieldNamesMock();
      ankiClient.invoke
        .mockImplementationOnce(() => Promise.resolve(["Front", "Back"]))
        .mockResolvedValueOnce([123]);

      const notes = [
        makeNote({ fields: { Front: "Valid", Back: "Valid" } }),
        makeNote({ fields: { Front: "", Back: "Valid" } }),
      ];

      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(1);
      expect(result.failedCount).toBe(1);
    });

    it("should allow empty non-primary fields", async () => {
      setupModelFieldNamesMock();
      ankiClient.invoke
        .mockImplementationOnce(() => Promise.resolve(["Front", "Back"]))
        .mockResolvedValueOnce([123]);

      const notes = [makeNote({ fields: { Front: "Valid", Back: "" } })];

      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.noteIds).toEqual([123]);
    });

    it("should identify primary field name in error (with stopOnFirstError)", async () => {
      setupModelFieldNamesMock();
      const notes = [makeNote({ fields: { Front: "", Back: "Valid" } })];

      const rawResult = await tool.addNotes(
        { notes, stopOnFirstError: true },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.primaryField).toBe("Front");
      expect(result.hint).toContain("first field");
    });
  });

  describe("Error Handling", () => {
    it("should handle AnkiConnect connection errors", async () => {
      // Arrange
      const notes = [makeNote()];
      ankiClient.invoke.mockRejectedValueOnce(new Error("fetch failed"));

      // Act
      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("fetch failed");
      expect(result.totalRequested).toBe(1);
    });

    it("should handle model not found errors", async () => {
      // Arrange
      const notes = [makeNote()];
      ankiClient.invoke.mockRejectedValueOnce(
        new AnkiConnectError("model was not found", "addNotes"),
      );

      // Act
      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.hint).toContain("models not found");
    });

    it("should handle deck not found errors", async () => {
      // Arrange
      const notes = [makeNote()];
      ankiClient.invoke.mockRejectedValueOnce(
        new AnkiConnectError("deck was not found", "addNotes"),
      );

      // Act
      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.hint).toContain("decks not found");
    });

    it("should include totalRequested in error responses", async () => {
      // Arrange
      const notes = [makeNote(), makeNote(), makeNote()];
      ankiClient.invoke.mockRejectedValueOnce(new Error("Connection error"));

      // Act
      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.totalRequested).toBe(3);
    });
  });

  describe("Progress Reporting", () => {
    it("should report progress at multiple stages", async () => {
      // Arrange
      const notes = [makeNote()];
      setupModelFieldNamesMock([123]);

      // Act
      await tool.addNotes({ notes }, mockContext);

      // Assert
      expect(mockContext.reportProgress).toHaveBeenCalledTimes(5);
      expect(mockContext.reportProgress).toHaveBeenNthCalledWith(1, {
        progress: 10,
        total: 100,
      });
      expect(mockContext.reportProgress).toHaveBeenNthCalledWith(2, {
        progress: 25,
        total: 100,
      });
      expect(mockContext.reportProgress).toHaveBeenNthCalledWith(3, {
        progress: 50,
        total: 100,
      });
      expect(mockContext.reportProgress).toHaveBeenNthCalledWith(4, {
        progress: 75,
        total: 100,
      });
      expect(mockContext.reportProgress).toHaveBeenNthCalledWith(5, {
        progress: 100,
        total: 100,
      });
    });

    it("should report progress even when validation fails", async () => {
      // Arrange
      const notes = [makeNote({ fields: { Front: "", Back: "test" } })];

      // Act
      await tool.addNotes({ notes }, mockContext);

      // Assert
      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 10,
        total: 100,
      });
    });
  });

  describe("Response Structure", () => {
    it("should include all required fields on success", async () => {
      // Arrange
      const notes = [makeNote()];
      setupModelFieldNamesMock([123]);

      // Act
      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("totalRequested", 1);
      expect(result).toHaveProperty("successCount", 1);
      expect(result).toHaveProperty("failedCount", 0);
      expect(result).toHaveProperty("noteIds");
      expect(result).toHaveProperty("results");
      expect(result).toHaveProperty("message");
    });

    it("should include results array with per-note details", async () => {
      // Arrange
      const notes = [
        makeNote({ deckName: "D1", modelName: "M1" }),
        makeNote({ deckName: "D2", modelName: "M2" }),
      ];
      setupModelFieldNamesMock([111, 222]);

      // Act
      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({
        index: 0,
        success: true,
        noteId: 111,
        deckName: "D1",
        modelName: "M1",
      });
      expect(result.results[1]).toEqual({
        index: 1,
        success: true,
        noteId: 222,
        deckName: "D2",
        modelName: "M2",
      });
    });

    it("should include noteIds array with only successful IDs", async () => {
      // Arrange
      const notes = [makeNote(), makeNote(), makeNote()];
      setupModelFieldNamesMock([111, null, 333]);

      // Act
      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.noteIds).toEqual([111, 333]);
      expect(result.noteIds).not.toContain(null);
    });

    it("should not include hint when all notes succeed", async () => {
      // Arrange
      const notes = [makeNote()];
      setupModelFieldNamesMock([123]);

      // Act
      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.hint).toBeUndefined();
    });

    it("should include hint when partial failure", async () => {
      // Arrange
      const notes = [makeNote(), makeNote()];
      setupModelFieldNamesMock([123, null]);

      // Act
      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.hint).toBeDefined();
      expect(result.hint).toContain("Some notes failed");
    });
  });

  describe("Edge Cases", () => {
    it("should handle unicode content in fields", async () => {
      // Arrange
      const notes = [
        makeNote({
          fields: {
            Front: "日本語 🇯🇵",
            Back: "Русский 中文 العربية",
          },
        }),
      ];
      setupModelFieldNamesMock([123]);

      // Act
      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(ankiClient.invoke).toHaveBeenCalledWith("addNotes", {
        notes: [
          expect.objectContaining({
            fields: {
              Front: "日本語 🇯🇵",
              Back: "Русский 中文 العربية",
            },
          }),
        ],
      });
    });

    it("should handle HTML content in fields", async () => {
      // Arrange
      const notes = [
        makeNote({
          fields: {
            Front: "<b>Bold</b> and <i>italic</i>",
            Back: "<ul><li>Item 1</li><li>Item 2</li></ul>",
          },
        }),
      ];
      setupModelFieldNamesMock([123]);

      // Act
      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
    });

    it("should handle very long field values", async () => {
      // Arrange
      const longText = "x".repeat(10000);
      const notes = [
        makeNote({
          fields: {
            Front: longText,
            Back: "Short answer",
          },
        }),
      ];
      setupModelFieldNamesMock([123]);

      // Act
      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
    });

    it("should handle notes with many tags", async () => {
      // Arrange
      const manyTags = Array.from({ length: 50 }, (_, i) => `tag${i}`);
      const notes = [makeNote({ tags: manyTags })];
      setupModelFieldNamesMock([123]);

      // Act
      await tool.addNotes({ notes }, mockContext);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledWith("addNotes", {
        notes: [
          expect.objectContaining({
            tags: manyTags,
          }),
        ],
      });
    });

    it("should handle maximum batch size (25 notes)", async () => {
      const notes = Array.from({ length: 25 }, (_, i) =>
        makeNote({ fields: { Front: `Q${i}`, Back: `A${i}` } }),
      );
      const noteIds = Array.from({ length: 25 }, (_, i) => 1000 + i);
      setupModelFieldNamesMock(noteIds);

      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(25);
      expect(result.noteIds).toHaveLength(25);
    });
  });

  describe("Multi-Field Models", () => {
    it("should handle Cloze model with Text and Back Extra fields", async () => {
      const notes = [
        {
          deckName: "Default",
          modelName: "Cloze",
          fields: {
            Text: "The {{c1::capital}} of France is {{c2::Paris}}",
            "Back Extra": "Geography fact",
          },
        },
      ];
      setupModelFieldNamesMock([123]);

      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(ankiClient.invoke).toHaveBeenCalledWith("addNotes", {
        notes: [
          expect.objectContaining({
            modelName: "Cloze",
            fields: {
              Text: "The {{c1::capital}} of France is {{c2::Paris}}",
              "Back Extra": "Geography fact",
            },
          }),
        ],
      });
    });

    it("should handle Basic (and reversed card) model", async () => {
      const notes = [
        {
          deckName: "Default",
          modelName: "Basic (and reversed card)",
          fields: {
            Front: "Hello",
            Back: "你好",
          },
        },
      ];
      setupModelFieldNamesMock([456]);

      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.noteIds).toEqual([456]);
    });

    it("should handle custom model with 5+ fields", async () => {
      const notes = [
        {
          deckName: "Languages",
          modelName: "Vocabulary Advanced",
          fields: {
            Word: "ephemeral",
            Definition: "lasting for a very short time",
            Example: "The ephemeral beauty of cherry blossoms",
            Pronunciation: "/ɪˈfem(ə)rəl/",
            Etymology: "From Greek ephēmeros",
            Notes: "Often used in poetry",
          },
        },
      ];
      setupModelFieldNamesMock([789]);

      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(ankiClient.invoke).toHaveBeenCalledWith("addNotes", {
        notes: [
          expect.objectContaining({
            fields: expect.objectContaining({
              Word: "ephemeral",
              Definition: "lasting for a very short time",
              Etymology: "From Greek ephēmeros",
            }),
          }),
        ],
      });
    });

    it("should handle mixed models with different field counts in same batch", async () => {
      const notes = [
        {
          deckName: "Default",
          modelName: "Basic",
          fields: { Front: "Q1", Back: "A1" } as Record<string, string>,
        },
        {
          deckName: "Default",
          modelName: "Cloze",
          fields: { Text: "{{c1::Answer}}", "Back Extra": "Hint" } as Record<
            string,
            string
          >,
        },
        {
          deckName: "Default",
          modelName: "Basic",
          fields: { Front: "Q2", Back: "A2" } as Record<string, string>,
        },
      ];
      setupModelFieldNamesMock([1, 2, 3]);

      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(3);
    });

    it("should handle fields with special characters in names", async () => {
      const notes = [
        {
          deckName: "Default",
          modelName: "Custom Model",
          fields: {
            "Field-With-Dashes": "value1",
            Field_With_Underscores: "value2",
            "Field With Spaces": "value3",
          },
        },
      ];
      setupModelFieldNamesMock([999]);

      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
    });
  });

  describe("Field Mismatch Handling", () => {
    it("should handle field name mismatch error with helpful hint", async () => {
      const notes = [
        makeNote({
          modelName: "Cloze",
          fields: { Front: "wrong", Back: "fields" },
        }),
      ];
      ankiClient.invoke.mockRejectedValueOnce(
        new AnkiConnectError("field 'Front' not found", "addNotes"),
      );

      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("Field name mismatch");
      expect(result.hint).toContain("modelFieldNames");
      expect(result.modelsUsed).toContain("Cloze");
    });

    it("should include providedFields in failed note results", async () => {
      const notes = [
        {
          deckName: "Default",
          modelName: "Basic",
          fields: { Front: "Q", Back: "A" } as Record<string, string>,
        },
        {
          deckName: "Default",
          modelName: "Cloze",
          fields: { Text: "{{c1::test}}", WrongExtra: "value2" } as Record<
            string,
            string
          >,
        },
      ];
      setupModelFieldNamesMock([111, null]);

      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.successCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.results[1].providedFields).toEqual(["Text", "WrongExtra"]);
      expect(result.results[1].error).toContain("Failed to create note");
    });

    it("should list all unique models when field error occurs", async () => {
      const notes = [
        makeNote({ modelName: "Basic" }),
        makeNote({ modelName: "Cloze" }),
        makeNote({ modelName: "Basic" }),
      ];
      ankiClient.invoke.mockRejectedValueOnce(
        new AnkiConnectError("field error", "addNotes"),
      );

      const rawResult = await tool.addNotes({ notes }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.modelsUsed).toHaveLength(2);
      expect(result.modelsUsed).toContain("Basic");
      expect(result.modelsUsed).toContain("Cloze");
    });
  });
});
