import { Injectable, Logger } from "@nestjs/common";
import { Resource, ResourceTemplate } from "@rekog/mcp-nest";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";

interface DeckStats {
  deck_id: number;
  name: string;
  new_count: number;
  learn_count: number;
  review_count: number;
  total_in_deck: number;
}

interface DeckTreeNode {
  name: string;
  deckId: number;
  children: DeckTreeNode[];
}

@Injectable()
export class DeckResource {
  private readonly logger = new Logger(DeckResource.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Resource({
    name: "deck-list",
    description:
      "List of all Anki decks with their IDs. Use this to see available decks before creating notes or getting cards.",
    mimeType: "application/json",
    uri: "deck://list",
  })
  async getDeckList({ uri }: { uri: string }) {
    try {
      this.logger.log("Fetching deck list");

      const deckNamesAndIds =
        await this.ankiClient.invoke<Record<string, number>>("deckNamesAndIds");

      const decks = Object.entries(deckNamesAndIds).map(([name, id]) => ({
        name,
        id,
        level: (name.match(/::/g) || []).length,
      }));

      decks.sort((a, b) => a.name.localeCompare(b.name));

      const result = {
        decks,
        total: decks.length,
        timestamp: new Date().toISOString(),
      };

      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      this.logger.error("Failed to fetch deck list", error);
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                error: error instanceof Error ? error.message : String(error),
                hint: "Make sure Anki is running with AnkiConnect installed",
              },
              null,
              2,
            ),
          },
        ],
      };
    }
  }

  @ResourceTemplate({
    name: "deck-stats",
    description:
      "Get detailed statistics for a specific deck including new, learning, and review card counts. Use '::' for nested decks (e.g., 'Parent::Child').",
    mimeType: "application/json",
    uriTemplate: "deck://{name}/stats",
  })
  async getDeckStats({ uri, name }: { uri: string; name: string }) {
    try {
      const decodedName = decodeURIComponent(name);
      this.logger.log(`Fetching stats for deck: ${decodedName}`);

      const stats = await this.ankiClient.invoke<Record<string, DeckStats>>(
        "getDeckStats",
        { decks: [decodedName] },
      );

      const deckStats = Object.values(stats)[0];

      if (!deckStats) {
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  error: `Deck "${decodedName}" not found`,
                  hint: "Use deck://list to see available decks",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const result = {
        name: deckStats.name,
        deckId: deckStats.deck_id,
        cardCounts: {
          new: deckStats.new_count,
          learning: deckStats.learn_count,
          review: deckStats.review_count,
          total: deckStats.total_in_deck,
        },
        dueToday:
          deckStats.new_count + deckStats.learn_count + deckStats.review_count,
        timestamp: new Date().toISOString(),
      };

      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      this.logger.error(`Failed to fetch stats for deck: ${name}`, error);
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                error: error instanceof Error ? error.message : String(error),
                deckName: name,
                hint: "Make sure the deck name is correct. Use deck://list to see available decks.",
              },
              null,
              2,
            ),
          },
        ],
      };
    }
  }

  @Resource({
    name: "deck-tree",
    description:
      "Get the hierarchical tree structure of all decks, showing parent-child relationships.",
    mimeType: "application/json",
    uri: "deck://tree",
  })
  async getDeckTree({ uri }: { uri: string }) {
    try {
      this.logger.log("Fetching deck tree");

      const deckTree = await this.ankiClient.invoke<DeckTreeNode[]>("deckTree");

      const simplifyTree = (
        nodes: DeckTreeNode[],
      ): Array<{ name: string; id: number; children: any[] }> => {
        return nodes.map((node) => ({
          name: node.name,
          id: node.deckId,
          children: node.children ? simplifyTree(node.children) : [],
        }));
      };

      const result = {
        tree: simplifyTree(deckTree),
        timestamp: new Date().toISOString(),
      };

      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      this.logger.error("Failed to fetch deck tree", error);
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                error: error instanceof Error ? error.message : String(error),
                hint: "Make sure Anki is running with AnkiConnect installed",
              },
              null,
              2,
            ),
          },
        ],
      };
    }
  }
}
