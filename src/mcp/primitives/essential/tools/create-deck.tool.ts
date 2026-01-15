import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  createSuccessResponse,
  createErrorResponse,
} from "@/mcp/utils/anki.utils";

/**
 * Tool for creating new Anki decks
 */
@Injectable()
export class CreateDeckTool {
  private readonly logger = new Logger(CreateDeckTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "create_deck",
    description:
      'Create a new empty Anki deck. Supports nested structure using "::" separator (e.g., "Languages::Japanese::JLPT::N5"). All parent decks are created automatically. Will not overwrite existing decks. ' +
      "IMPORTANT: This tool ONLY creates an empty deck. DO NOT add cards or notes after creating a deck unless the user EXPLICITLY asks to add them. Wait for user instructions before adding any content.",
    parameters: z.object({
      deck_name: z
        .string()
        .min(1)
        .describe(
          'The name of the deck to create. Use "::" for nested structure (e.g., "Parent::Child::Grandchild")',
        )
        .refine(
          (name) => {
            const parts = name.split("::");
            return parts.every((part) => part.trim() !== "");
          },
          {
            message: "Deck name parts cannot be empty",
          },
        ),
    }),
  })
  async createDeck({ deck_name }: { deck_name: string }, context: Context) {
    try {
      // Check for empty parts
      const parts = deck_name.split("::");
      if (parts.some((part) => part.trim() === "")) {
        return createErrorResponse(
          new Error("Deck name parts cannot be empty"),
          { deckName: deck_name },
        );
      }

      this.logger.log(`Creating deck: ${deck_name}`);
      await context.reportProgress({ progress: 25, total: 100 });

      // Create the deck using AnkiConnect
      const deckId = await this.ankiClient.invoke<number>("createDeck", {
        deck: deck_name,
      });

      await context.reportProgress({ progress: 75, total: 100 });

      if (!deckId) {
        this.logger.warn(`Deck may already exist: ${deck_name}`);

        // Check if deck exists by listing all decks
        const existingDecks =
          await this.ankiClient.invoke<string[]>("deckNames");
        const deckExists = existingDecks.includes(deck_name);

        await context.reportProgress({ progress: 100, total: 100 });

        if (deckExists) {
          return createSuccessResponse({
            success: true,
            message: `Deck "${deck_name}" already exists`,
            deckName: deck_name,
            created: false,
            exists: true,
          });
        }

        return createErrorResponse(
          new Error("Failed to create deck - unknown error"),
          { deckName: deck_name },
        );
      }

      await context.reportProgress({ progress: 100, total: 100 });
      this.logger.log(
        `Successfully created deck: ${deck_name} with ID: ${deckId}`,
      );

      const response: any = {
        success: true,
        deckId: deckId,
        deckName: deck_name,
        message: `Successfully created deck "${deck_name}"`,
        created: true,
      };

      // If it's a nested structure, note the hierarchy
      if (parts.length > 1) {
        response.hierarchy = parts;
        response.depth = parts.length;
        response.message = `Successfully created deck "${deck_name}" (${parts.length} levels)`;
      }

      return createSuccessResponse(response);
    } catch (error) {
      this.logger.error(`Failed to create deck ${deck_name}`, error);

      // Check if it's a duplicate deck error
      if (error instanceof Error && error.message.includes("already exists")) {
        return createSuccessResponse({
          success: true,
          message: `Deck "${deck_name}" already exists`,
          deckName: deck_name,
          created: false,
          exists: true,
        });
      }

      return createErrorResponse(error, {
        deckName: deck_name,
        hint: "Make sure Anki is running and the deck name is valid",
      });
    }
  }
}
