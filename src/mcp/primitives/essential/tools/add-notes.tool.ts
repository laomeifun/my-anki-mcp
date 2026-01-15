import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { NoteOptions } from "@/mcp/types/anki.types";
import {
  createSuccessResponse,
  createErrorResponse,
} from "@/mcp/utils/anki.utils";

/**
 * Schema for individual note input (matches addNote tool structure)
 */
const NoteInputSchema = z.object({
  deckName: z.string().min(1).describe("The deck to add the note to"),
  modelName: z
    .string()
    .min(1)
    .describe('The note type/model to use (e.g., "Basic", "Cloze")'),
  fields: z
    .record(z.string(), z.string())
    .describe(
      'Field values as key-value pairs (e.g., {"Front": "question", "Back": "answer"})',
    ),
  tags: z
    .array(z.string())
    .optional()
    .describe("Optional tags to add to the note"),
  allowDuplicate: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to allow adding duplicate notes"),
  duplicateScope: z
    .enum(["deck", "collection"])
    .optional()
    .describe("Scope for duplicate checking"),
  duplicateScopeOptions: z
    .object({
      deckName: z
        .string()
        .optional()
        .describe("Specific deck to check for duplicates"),
      checkChildren: z
        .boolean()
        .optional()
        .default(false)
        .describe("Check child decks for duplicates"),
      checkAllModels: z
        .boolean()
        .optional()
        .default(false)
        .describe("Check across all note types"),
    })
    .optional()
    .describe("Advanced duplicate checking options"),
});

type NoteInput = z.infer<typeof NoteInputSchema>;

/**
 * Result for each note in the batch
 */
interface NoteResult {
  index: number;
  success: boolean;
  noteId: number | null;
  deckName: string;
  modelName: string;
  providedFields?: string[];
  error?: string;
}

/**
 * Tool for adding multiple notes to Anki in a single batch operation
 */
@Injectable()
export class AddNotesTool {
  private readonly logger = new Logger(AddNotesTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "addNotes",
    description:
      "Add multiple notes to Anki in a single batch operation. Supports up to 25 notes per call. " +
      "Returns detailed results showing which notes succeeded or failed (partial failures are possible). " +
      "Use modelNames to see available note types and modelFieldNames to see required fields. " +
      "IMPORTANT: Only create notes that were explicitly requested by the user.",
    parameters: z.object({
      notes: z
        .array(NoteInputSchema)
        .min(1)
        .max(25)
        .describe(
          "Array of notes to add (1-25 notes). Each note requires deckName, modelName, and fields.",
        ),
    }),
  })
  async addNotes({ notes }: { notes: NoteInput[] }, context: Context) {
    try {
      this.logger.log(`Adding ${notes.length} note(s) in batch`);
      await context.reportProgress({ progress: 10, total: 100 });

      // Step 1: Pre-validate all notes for empty fields
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        const emptyFields = Object.entries(note.fields).filter(
          ([_, value]) =>
            !value || (typeof value === "string" && value.trim() === ""),
        );
        if (emptyFields.length > 0) {
          return createErrorResponse(
            new Error(
              `Note at index ${i} has empty fields: ${emptyFields.map(([key]) => key).join(", ")}`,
            ),
            {
              noteIndex: i,
              deckName: note.deckName,
              modelName: note.modelName,
              emptyFields: emptyFields.map(([key]) => key),
              hint: "All fields must have non-empty values. Fix the validation errors and retry the entire batch.",
            },
          );
        }
      }

      await context.reportProgress({ progress: 25, total: 100 });

      // Step 2: Build AnkiConnect params for each note
      const ankiNotes = notes.map((note) => {
        const noteParams: Record<string, unknown> = {
          deckName: note.deckName,
          modelName: note.modelName,
          fields: note.fields,
        };

        if (note.tags && note.tags.length > 0) {
          noteParams.tags = note.tags;
        }

        // Build options
        const options: NoteOptions = {};
        let hasOptions = false;

        if (note.allowDuplicate !== undefined) {
          options.allowDuplicate = note.allowDuplicate;
          hasOptions = true;
        }
        if (note.duplicateScope !== undefined) {
          options.duplicateScope = note.duplicateScope;
          hasOptions = true;
        }
        if (note.duplicateScopeOptions !== undefined) {
          options.duplicateScopeOptions = note.duplicateScopeOptions;
          hasOptions = true;
        }
        if (hasOptions) {
          noteParams.options = options;
        }

        return noteParams;
      });

      await context.reportProgress({ progress: 50, total: 100 });

      // Step 3: Call AnkiConnect addNotes
      const noteIds = await this.ankiClient.invoke<(number | null)[]>(
        "addNotes",
        { notes: ankiNotes },
      );

      await context.reportProgress({ progress: 75, total: 100 });

      // Step 4: Parse results and build detailed response
      const results: NoteResult[] = noteIds.map((noteId, index) => {
        const note = notes[index];
        if (noteId !== null) {
          return {
            index,
            success: true,
            noteId,
            deckName: note.deckName,
            modelName: note.modelName,
          };
        } else {
          return {
            index,
            success: false,
            noteId: null,
            deckName: note.deckName,
            modelName: note.modelName,
            providedFields: Object.keys(note.fields),
            error:
              "Failed to create note. Possible causes: duplicate note, invalid field names for this model, or missing required fields. Use modelFieldNames to verify correct field names.",
          };
        }
      });

      const successfulNotes = results.filter((r) => r.success);
      const failedNotes = results.filter((r) => !r.success);
      const successCount = successfulNotes.length;
      const failedCount = failedNotes.length;

      await context.reportProgress({ progress: 100, total: 100 });

      // Step 5: Build response based on outcome
      if (successCount === 0) {
        // All failed
        this.logger.warn(`All ${notes.length} notes failed to create`);
        return createErrorResponse(new Error("All notes failed to create"), {
          totalRequested: notes.length,
          successCount: 0,
          failedCount,
          results,
          hint: "All notes failed. Check that deck names and model names are correct, and that notes are not duplicates.",
        });
      }

      // At least some succeeded
      const createdNoteIds = successfulNotes.map((r) => r.noteId);
      const message =
        failedCount > 0
          ? `Created ${successCount} of ${notes.length} notes. ${failedCount} note(s) failed.`
          : `Successfully created all ${successCount} notes`;

      this.logger.log(message);

      return createSuccessResponse({
        success: true,
        totalRequested: notes.length,
        successCount,
        failedCount,
        noteIds: createdNoteIds,
        results,
        message,
        ...(failedCount > 0 && {
          hint: "Some notes failed to create (likely duplicates). Check the results array for details.",
        }),
      });
    } catch (error) {
      this.logger.error("Failed to add notes", error);

      if (error instanceof Error) {
        if (error.message.includes("model")) {
          return createErrorResponse(error, {
            totalRequested: notes.length,
            hint: "One or more models not found. Use modelNames tool to see available models.",
          });
        }
        if (error.message.includes("deck")) {
          return createErrorResponse(error, {
            totalRequested: notes.length,
            hint: "One or more decks not found. Use list_decks tool to see available decks or createDeck to create new ones.",
          });
        }
        if (error.message.includes("field")) {
          const uniqueModels = [...new Set(notes.map((n) => n.modelName))];
          return createErrorResponse(error, {
            totalRequested: notes.length,
            modelsUsed: uniqueModels,
            hint: "Field name mismatch. Use modelFieldNames tool to see required fields for each model. Common models: Basic (Front, Back), Cloze (Text, Back Extra), Basic (and reversed card) (Front, Back).",
          });
        }
      }

      return createErrorResponse(error, {
        totalRequested: notes.length,
        hint: "Make sure Anki is running and all deck/model names are correct",
      });
    }
  }
}
