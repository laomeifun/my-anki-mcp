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
import { safeJsonParse } from "@/mcp/utils/schema.utils";

const NoteInputSchema = z.object({
  deckName: z.string().min(1).describe("The deck to add the note to"),
  modelName: z
    .string()
    .min(1)
    .describe('The note type/model to use (e.g., "Basic", "Cloze")'),
  fields: z
    .record(z.string(), z.string())
    .describe(
      'MUST pass as object, NOT as JSON string. Example: {"Front": "question", "Back": "answer"}',
    ),
  tags: z
    .array(z.string())
    .optional()
    .describe("Optional tags to add to the note"),
  allowDuplicate: z
    .boolean()
    .optional()
    .describe("Whether to allow adding duplicate notes (defaults to false)"),
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

const NotesArraySchema = z
  .union([
    z.array(NoteInputSchema).min(1).max(10),
    z.string().transform((str) => {
      const result = safeJsonParse<NoteInput[]>(str, "notes array");
      if (!result.success) {
        throw new Error(result.error);
      }
      if (!Array.isArray(result.data)) {
        throw new Error(
          "Invalid notes: expected array but got object or primitive",
        );
      }
      return result.data;
    }),
  ])
  .describe(
    "MUST pass as array of objects, NOT as JSON string. Max 10 notes per call. Each note requires deckName, modelName, and fields object.",
  );

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
    name: "add_notes",
    description:
      "Add multiple notes to Anki in a single batch operation. Supports up to 10 notes per call (for larger batches, call multiple times). " +
      "Returns detailed results showing which notes succeeded or failed (partial failures are possible). " +
      "Use modelNames to see available note types and modelFieldNames to see required fields. " +
      "IMPORTANT: Only create notes that were explicitly requested by the user.",
    parameters: z.object({
      notes: NotesArraySchema,
      stopOnFirstError: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "If true, stop processing immediately when the first note fails validation. Useful for debugging (default: false).",
        ),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  })
  async addNotes(
    {
      notes,
      stopOnFirstError = false,
    }: { notes: NoteInput[] | string; stopOnFirstError?: boolean },
    context: Context,
  ) {
    // Fallback: handle notes passed as JSON string (for direct method calls or MCP clients)
    let parsedNotes: NoteInput[];
    if (typeof notes === "string") {
      const parseResult = safeJsonParse<NoteInput[]>(notes, "notes");
      if (!parseResult.success) {
        return createErrorResponse(new Error(parseResult.error!), {
          hint: "Check for unescaped quotes or special characters in field values",
          ...(parseResult.snippet && { errorContext: parseResult.snippet }),
        });
      }
      if (!Array.isArray(parseResult.data)) {
        return createErrorResponse(
          new Error("Invalid notes parameter: parsed value is not an array"),
          { hint: "notes must be an array of note objects" },
        );
      }
      parsedNotes = parseResult.data;
    } else {
      parsedNotes = notes;
    }

    try {
      this.logger.log(
        `Adding ${parsedNotes.length} note(s) in batch (stopOnFirstError: ${stopOnFirstError})`,
      );
      await context.reportProgress({ progress: 10, total: 100 });

      // Step 1: Fetch model field names for all unique models to identify primary fields
      const uniqueModels = [...new Set(parsedNotes.map((n) => n.modelName))];
      const modelFieldsMap = new Map<string, string[]>();

      for (const modelName of uniqueModels) {
        const fields = await this.ankiClient.invoke<string[]>(
          "modelFieldNames",
          { modelName },
        );
        if (!fields || fields.length === 0) {
          return createErrorResponse(
            new Error(`Model "${modelName}" not found or has no fields`),
            {
              modelName,
              hint: "Use modelNames tool to see available models.",
            },
          );
        }
        modelFieldsMap.set(modelName, fields);
      }

      // Step 2: Validate only the primary (first) field is not empty for each note
      // AnkiConnect requires the first field to have content for duplicate checking
      const validationErrors: Array<{
        index: number;
        error: string;
        noteInfo: { deckName: string; modelName: string };
      }> = [];

      for (let i = 0; i < parsedNotes.length; i++) {
        const note = parsedNotes[i];
        const modelFields = modelFieldsMap.get(note.modelName)!;
        const primaryField = modelFields[0];
        const primaryValue = note.fields[primaryField];

        if (!primaryValue || primaryValue.trim() === "") {
          const errorInfo = {
            index: i,
            error: `Primary field "${primaryField}" cannot be empty`,
            noteInfo: { deckName: note.deckName, modelName: note.modelName },
          };

          if (stopOnFirstError) {
            return createErrorResponse(
              new Error(
                `Note at index ${i}: Primary field "${primaryField}" cannot be empty.`,
              ),
              {
                noteIndex: i,
                deckName: note.deckName,
                modelName: note.modelName,
                primaryField,
                hint: `The first field of the "${note.modelName}" model must have content. stopOnFirstError=true stopped processing.`,
              },
            );
          }

          validationErrors.push(errorInfo);
        }
      }

      // If we have validation errors and didn't stop early, report them all
      if (
        validationErrors.length > 0 &&
        validationErrors.length === parsedNotes.length
      ) {
        return createErrorResponse(new Error("All notes failed validation"), {
          validationErrors,
          hint: "All notes have empty primary fields. Use stopOnFirstError=true to debug one at a time.",
        });
      }

      // Filter out invalid notes for processing
      const validNoteIndices = new Set(
        parsedNotes
          .map((_, i) => i)
          .filter((i) => !validationErrors.some((e) => e.index === i)),
      );
      const validNotes = parsedNotes.filter((_, i) => validNoteIndices.has(i));

      // If no valid notes remain, return error
      if (validNotes.length === 0) {
        return createErrorResponse(
          new Error("No valid notes to add after validation"),
          {
            validationErrors,
            hint: `All ${parsedNotes.length} notes failed validation. Check primary field values.`,
          },
        );
      }

      await context.reportProgress({ progress: 25, total: 100 });

      const ankiNotes = validNotes.map((note) => {
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

      const validIndicesArray = Array.from(validNoteIndices);
      const apiResults: NoteResult[] = noteIds.map((noteId, idx) => {
        const originalIndex = validIndicesArray[idx];
        const note = validNotes[idx];
        if (noteId !== null) {
          return {
            index: originalIndex,
            success: true,
            noteId,
            deckName: note.deckName,
            modelName: note.modelName,
          };
        } else {
          return {
            index: originalIndex,
            success: false,
            noteId: null,
            deckName: note.deckName,
            modelName: note.modelName,
            providedFields: Object.keys(note.fields),
            error:
              "Failed to create note. Possible causes: duplicate note, invalid field names for this model, or missing required fields.",
          };
        }
      });

      const validationFailResults: NoteResult[] = validationErrors.map((e) => ({
        index: e.index,
        success: false,
        noteId: null,
        deckName: e.noteInfo.deckName,
        modelName: e.noteInfo.modelName,
        error: e.error,
      }));

      const results: NoteResult[] = [
        ...apiResults,
        ...validationFailResults,
      ].sort((a, b) => a.index - b.index);

      const successfulNotes = results.filter((r) => r.success);
      const failedNotes = results.filter((r) => !r.success);
      const successCount = successfulNotes.length;
      const failedCount = failedNotes.length;

      await context.reportProgress({ progress: 100, total: 100 });

      // Step 5: Build response based on outcome
      if (successCount === 0) {
        // All failed
        this.logger.warn(`All ${parsedNotes.length} notes failed to create`);
        return createErrorResponse(new Error("All notes failed to create"), {
          totalRequested: parsedNotes.length,
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
          ? `Created ${successCount} of ${parsedNotes.length} notes. ${failedCount} note(s) failed.`
          : `Successfully created all ${successCount} notes`;

      this.logger.log(message);

      return createSuccessResponse({
        success: true,
        totalRequested: parsedNotes.length,
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
            totalRequested: parsedNotes.length,
            hint: "One or more models not found. Use modelNames tool to see available models.",
          });
        }
        if (error.message.includes("deck")) {
          return createErrorResponse(error, {
            totalRequested: parsedNotes.length,
            hint: "One or more decks not found. Use list_decks tool to see available decks or createDeck to create new ones.",
          });
        }
        if (error.message.includes("field")) {
          const uniqueModels = [
            ...new Set(parsedNotes.map((n) => n.modelName)),
          ];
          return createErrorResponse(error, {
            totalRequested: parsedNotes.length,
            modelsUsed: uniqueModels,
            hint: "Field name mismatch. Use modelFieldNames tool to see required fields for each model. Common models: Basic (Front, Back), Cloze (Text, Back Extra), Basic (and reversed card) (Front, Back).",
          });
        }
      }

      return createErrorResponse(error, {
        totalRequested: parsedNotes.length,
        hint: "Make sure Anki is running and all deck/model names are correct",
      });
    }
  }
}
