import { Test, TestingModule } from "@nestjs/testing";
import { UpdateNotesFieldsTool } from "../update-notes-fields.tool";
import {
  AnkiConnectClient,
  AnkiConnectError,
} from "../../../../clients/anki-connect.client";
import { mockNotes } from "../../../../../test-fixtures/mock-data";
import {
  parseToolResult,
  createMockContext,
} from "../../../../../test-fixtures/test-helpers";

jest.mock("../../../../clients/anki-connect.client");

describe("UpdateNotesFieldsTool", () => {
  let tool: UpdateNotesFieldsTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UpdateNotesFieldsTool, AnkiConnectClient],
    }).compile();

    tool = module.get<UpdateNotesFieldsTool>(UpdateNotesFieldsTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;

    mockContext = createMockContext();

    jest.clearAllMocks();
  });

  describe("updateNotesFields", () => {
    it("should successfully update multiple notes", async () => {
      const noteUpdates = [
        { id: mockNotes.spanish.noteId, fields: { Front: "Updated 1" } },
        { id: mockNotes.japanese.noteId, fields: { Front: "Updated 2" } },
      ];

      ankiClient.invoke
        .mockResolvedValueOnce([mockNotes.spanish])
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce([mockNotes.japanese])
        .mockResolvedValueOnce(null);

      const rawResult = await tool.updateNotesFields(
        { notes: noteUpdates },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.totalRequested).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(true);
    });

    it("should handle partial failures", async () => {
      const noteUpdates = [
        { id: mockNotes.spanish.noteId, fields: { Front: "Updated 1" } },
        { id: 9999999999, fields: { Front: "Updated 2" } },
      ];

      ankiClient.invoke
        .mockResolvedValueOnce([mockNotes.spanish])
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce([]);

      const rawResult = await tool.updateNotesFields(
        { notes: noteUpdates },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toContain("Note not found");
    });

    it("should stop on first error when stopOnFirstError is true", async () => {
      const noteUpdates = [
        { id: 9999999999, fields: { Front: "Updated 1" } },
        { id: mockNotes.spanish.noteId, fields: { Front: "Updated 2" } },
      ];

      ankiClient.invoke.mockResolvedValueOnce([]);

      const rawResult = await tool.updateNotesFields(
        { notes: noteUpdates, stopOnFirstError: true },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.noteIndex).toBe(0);
      expect(result.hint).toContain("stopOnFirstError=true stopped processing");
      expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
    });

    it("should validate fields exist in the model", async () => {
      const noteUpdates = [
        { id: mockNotes.spanish.noteId, fields: { InvalidField: "Value" } },
      ];

      ankiClient.invoke.mockResolvedValueOnce([mockNotes.spanish]);

      const rawResult = await tool.updateNotesFields(
        { notes: noteUpdates },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain("Invalid fields");
    });

    it("should reject empty fields", async () => {
      const noteUpdates = [{ id: mockNotes.spanish.noteId, fields: {} }];

      const rawResult = await tool.updateNotesFields(
        { notes: noteUpdates },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.results[0].error).toContain("No fields provided");
    });

    it("should handle all notes failing", async () => {
      const noteUpdates = [
        { id: 9999999999, fields: { Front: "Updated 1" } },
        { id: 8888888888, fields: { Front: "Updated 2" } },
      ];

      ankiClient.invoke.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const rawResult = await tool.updateNotesFields(
        { notes: noteUpdates },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("All note updates failed");
      expect(result.successCount).toBe(0);
      expect(result.failedCount).toBe(2);
    });

    it("should handle JSON string input", async () => {
      const noteUpdates = JSON.stringify([
        { id: mockNotes.spanish.noteId, fields: { Front: "Updated" } },
      ]);

      ankiClient.invoke
        .mockResolvedValueOnce([mockNotes.spanish])
        .mockResolvedValueOnce(null);

      const rawResult = await tool.updateNotesFields(
        { notes: noteUpdates },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(1);
    });

    it("should reject invalid JSON string", async () => {
      const rawResult = await tool.updateNotesFields(
        { notes: "not valid json" },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("JSON parse error");
    });

    it("should handle network errors gracefully", async () => {
      const noteUpdates = [
        { id: mockNotes.spanish.noteId, fields: { Front: "Updated" } },
      ];

      ankiClient.invoke.mockRejectedValueOnce(new Error("fetch failed"));

      const rawResult = await tool.updateNotesFields(
        { notes: noteUpdates },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.results[0].error).toContain("fetch failed");
    });

    it("should report progress correctly", async () => {
      const noteUpdates = [
        { id: mockNotes.spanish.noteId, fields: { Front: "Updated 1" } },
        { id: mockNotes.japanese.noteId, fields: { Front: "Updated 2" } },
      ];

      ankiClient.invoke
        .mockResolvedValueOnce([mockNotes.spanish])
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce([mockNotes.japanese])
        .mockResolvedValueOnce(null);

      await tool.updateNotesFields({ notes: noteUpdates }, mockContext);

      expect(mockContext.reportProgress).toHaveBeenCalled();
      const lastCall =
        mockContext.reportProgress.mock.calls[
          mockContext.reportProgress.mock.calls.length - 1
        ];
      expect(lastCall[0]).toEqual({ progress: 100, total: 100 });
    });

    it("should include model name in successful results", async () => {
      const noteUpdates = [
        { id: mockNotes.spanish.noteId, fields: { Front: "Updated" } },
      ];

      ankiClient.invoke
        .mockResolvedValueOnce([mockNotes.spanish])
        .mockResolvedValueOnce(null);

      const rawResult = await tool.updateNotesFields(
        { notes: noteUpdates },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.results[0].modelName).toBe("Basic");
    });

    it("should include updated fields list in successful results", async () => {
      const noteUpdates = [
        { id: mockNotes.spanish.noteId, fields: { Front: "Q", Back: "A" } },
      ];

      ankiClient.invoke
        .mockResolvedValueOnce([mockNotes.spanish])
        .mockResolvedValueOnce(null);

      const rawResult = await tool.updateNotesFields(
        { notes: noteUpdates },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.results[0].updatedFields).toEqual(["Front", "Back"]);
    });

    it("should handle media attachments", async () => {
      const noteUpdates = [
        {
          id: mockNotes.spanish.noteId,
          fields: { Front: "With audio" },
          audio: [
            {
              url: "https://example.com/audio.mp3",
              filename: "test.mp3",
              fields: ["Front"],
            },
          ],
        },
      ];

      ankiClient.invoke
        .mockResolvedValueOnce([mockNotes.spanish])
        .mockResolvedValueOnce(null);

      const rawResult = await tool.updateNotesFields(
        { notes: noteUpdates },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "updateNoteFields", {
        note: {
          id: mockNotes.spanish.noteId,
          fields: { Front: "With audio" },
          audio: noteUpdates[0].audio,
        },
      });
    });

    it("should warn about browser conflicts in response", async () => {
      const noteUpdates = [
        { id: mockNotes.spanish.noteId, fields: { Front: "Updated" } },
      ];

      ankiClient.invoke
        .mockResolvedValueOnce([mockNotes.spanish])
        .mockResolvedValueOnce(null);

      const rawResult = await tool.updateNotesFields(
        { notes: noteUpdates },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.warning).toContain("Anki browser");
    });

    it("should handle AnkiConnect errors per note", async () => {
      const noteUpdates = [
        { id: mockNotes.spanish.noteId, fields: { Front: "Updated" } },
      ];

      ankiClient.invoke
        .mockResolvedValueOnce([mockNotes.spanish])
        .mockRejectedValueOnce(
          new AnkiConnectError("update failed", "updateNoteFields"),
        );

      const rawResult = await tool.updateNotesFields(
        { notes: noteUpdates },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain("update failed");
    });
  });
});
