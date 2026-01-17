import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  createSuccessResponse,
  createErrorResponse,
} from "@/mcp/utils/anki.utils";

const NoteUpdateSchema = z.object({
  id: z
    .number()
    .describe(
      "The ID of the note to update. Get this from findNotes or notesInfo.",
    ),
  fields: z
    .record(z.string(), z.string())
    .describe(
      "Field name-value pairs to update. Pass as a native object, NOT a JSON string. " +
        'Only include fields you want to change. Example: {"Front": "<b>New</b>", "Back": "Updated"}. ' +
        "If you are an LLM, do NOT serialize this to a JSON string - pass the object directly.",
    ),
  audio: z
    .array(
      z.object({
        url: z.string().describe("URL of the audio file"),
        filename: z.string().describe("Filename to save as"),
        fields: z.array(z.string()).describe("Fields to add audio to"),
      }),
    )
    .optional()
    .describe("Optional audio files to add to the note"),
  picture: z
    .array(
      z.object({
        url: z.string().describe("URL of the image"),
        filename: z.string().describe("Filename to save as"),
        fields: z.array(z.string()).describe("Fields to add image to"),
      }),
    )
    .optional()
    .describe("Optional images to add to the note"),
});

type NoteUpdate = z.infer<typeof NoteUpdateSchema>;

const NotesUpdateArraySchema = z
  .array(NoteUpdateSchema)
  .min(1)
  .max(10)
  .describe(
    "Array of note update objects. IMPORTANT: Pass as a native array of objects, NOT a JSON string. " +
      "Max 10 notes per call. Each update requires: id (number), fields (object). " +
      "If you are an LLM, do NOT serialize this to a JSON string - pass the array directly.",
  );

interface NoteUpdateResult {
  index: number;
  noteId: number;
  success: boolean;
  updatedFields?: string[];
  modelName?: string;
  error?: string;
}

@Injectable()
export class UpdateNotesFieldsTool {
  private readonly logger = new Logger(UpdateNotesFieldsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "update_notes_fields",
    description:
      "Update fields for multiple notes in a single batch operation. Supports up to 10 notes per call. " +
      "Returns detailed results showing which notes succeeded or failed (partial failures are possible). " +
      "Supports HTML content in fields and preserves CSS styling. " +
      "WARNING: Do not view notes in Anki browser while updating. " +
      "IMPORTANT: Only update notes that the user explicitly asked to modify.",
    parameters: z.object({
      notes: NotesUpdateArraySchema,
      stopOnFirstError: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "If true, stop processing immediately when the first note fails. Useful for debugging (default: false).",
        ),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async updateNotesFields(
    {
      notes,
      stopOnFirstError = false,
    }: { notes: NoteUpdate[]; stopOnFirstError?: boolean },
    context: Context,
  ) {
    try {
      this.logger.log(
        `Updating ${notes.length} note(s) in batch (stopOnFirstError: ${stopOnFirstError})`,
      );
      await context.reportProgress({ progress: 10, total: 100 });

      const results: NoteUpdateResult[] = [];
      const progressPerNote = 80 / notes.length;

      for (let i = 0; i < notes.length; i++) {
        const noteUpdate = notes[i];
        const fieldCount = Object.keys(noteUpdate.fields).length;

        if (fieldCount === 0) {
          const result: NoteUpdateResult = {
            index: i,
            noteId: noteUpdate.id,
            success: false,
            error: "No fields provided for update",
          };
          results.push(result);

          if (stopOnFirstError) {
            return createErrorResponse(
              new Error(`Note at index ${i}: No fields provided for update`),
              {
                noteIndex: i,
                noteId: noteUpdate.id,
                results,
                hint: "stopOnFirstError=true stopped processing.",
              },
            );
          }
          continue;
        }

        try {
          const notesInfo = await this.ankiClient.invoke<any[]>("notesInfo", {
            notes: [noteUpdate.id],
          });

          if (!notesInfo || notesInfo.length === 0 || !notesInfo[0]) {
            const result: NoteUpdateResult = {
              index: i,
              noteId: noteUpdate.id,
              success: false,
              error: "Note not found",
            };
            results.push(result);

            if (stopOnFirstError) {
              return createErrorResponse(
                new Error(
                  `Note at index ${i}: Note ID ${noteUpdate.id} not found`,
                ),
                {
                  noteIndex: i,
                  noteId: noteUpdate.id,
                  results,
                  hint: "stopOnFirstError=true stopped processing. Use findNotes to get valid note IDs.",
                },
              );
            }
            continue;
          }

          const currentNote = notesInfo[0];
          const modelName = currentNote.modelName;
          const existingFields = Object.keys(currentNote.fields);

          const invalidFields = Object.keys(noteUpdate.fields).filter(
            (field) => !existingFields.includes(field),
          );

          if (invalidFields.length > 0) {
            const result: NoteUpdateResult = {
              index: i,
              noteId: noteUpdate.id,
              success: false,
              modelName,
              error: `Invalid fields: ${invalidFields.join(", ")}. Valid fields: ${existingFields.join(", ")}`,
            };
            results.push(result);

            if (stopOnFirstError) {
              return createErrorResponse(
                new Error(
                  `Note at index ${i}: Invalid fields for model "${modelName}"`,
                ),
                {
                  noteIndex: i,
                  noteId: noteUpdate.id,
                  invalidFields,
                  validFields: existingFields,
                  results,
                  hint: "stopOnFirstError=true stopped processing.",
                },
              );
            }
            continue;
          }

          const updateParams: Record<string, unknown> = {
            note: {
              id: noteUpdate.id,
              fields: noteUpdate.fields,
            },
          };

          if (noteUpdate.audio) {
            (updateParams.note as Record<string, unknown>).audio =
              noteUpdate.audio;
          }
          if (noteUpdate.picture) {
            (updateParams.note as Record<string, unknown>).picture =
              noteUpdate.picture;
          }

          await this.ankiClient.invoke<null>("updateNoteFields", updateParams);

          results.push({
            index: i,
            noteId: noteUpdate.id,
            success: true,
            updatedFields: Object.keys(noteUpdate.fields),
            modelName,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          const result: NoteUpdateResult = {
            index: i,
            noteId: noteUpdate.id,
            success: false,
            error: errorMessage,
          };
          results.push(result);

          if (stopOnFirstError) {
            return createErrorResponse(
              new Error(`Note at index ${i}: ${errorMessage}`),
              {
                noteIndex: i,
                noteId: noteUpdate.id,
                results,
                hint: "stopOnFirstError=true stopped processing.",
              },
            );
          }
        }

        await context.reportProgress({
          progress: Math.round(10 + (i + 1) * progressPerNote),
          total: 100,
        });
      }

      await context.reportProgress({ progress: 100, total: 100 });

      const successfulUpdates = results.filter((r) => r.success);
      const failedUpdates = results.filter((r) => !r.success);
      const successCount = successfulUpdates.length;
      const failedCount = failedUpdates.length;

      if (successCount === 0) {
        this.logger.warn(`All ${notes.length} note updates failed`);
        return createErrorResponse(new Error("All note updates failed"), {
          totalRequested: notes.length,
          successCount: 0,
          failedCount,
          results,
          hint: "All updates failed. Check note IDs and field names.",
        });
      }

      const message =
        failedCount > 0
          ? `Updated ${successCount} of ${notes.length} notes. ${failedCount} note(s) failed.`
          : `Successfully updated all ${successCount} notes`;

      this.logger.log(message);

      return createSuccessResponse({
        success: true,
        totalRequested: notes.length,
        successCount,
        failedCount,
        results,
        message,
        warning:
          "If changes don't appear, ensure notes weren't open in Anki browser during update.",
        ...(failedCount > 0 && {
          hint: "Some updates failed. Check the results array for details.",
        }),
      });
    } catch (error) {
      this.logger.error("Failed to update notes", error);

      return createErrorResponse(error, {
        totalRequested: notes.length,
        hint: "Make sure Anki is running and the note IDs are valid",
      });
    }
  }
}
