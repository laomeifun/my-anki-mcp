import { Injectable, Logger } from "@nestjs/common";
import { Resource } from "@rekog/mcp-nest";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";

@Injectable()
export class TagResource {
  private readonly logger = new Logger(TagResource.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Resource({
    name: "tag-list",
    description:
      "List of all tags used across all notes in Anki. Use this to see existing tags before adding new ones.",
    mimeType: "application/json",
    uri: "tag://tags/list",
  })
  async getTagList({ uri }: { uri: string }) {
    try {
      this.logger.log("Fetching tag list");

      const tags = await this.ankiClient.invoke<string[]>("getTags");

      const tagsByPrefix: Record<string, string[]> = {};
      const topLevelTags: string[] = [];

      for (const tag of tags) {
        if (tag.includes("::")) {
          const prefix = tag.split("::")[0];
          if (!tagsByPrefix[prefix]) {
            tagsByPrefix[prefix] = [];
          }
          tagsByPrefix[prefix].push(tag);
        } else {
          topLevelTags.push(tag);
        }
      }

      const result = {
        tags,
        total: tags.length,
        hierarchy: {
          topLevel: topLevelTags,
          grouped: tagsByPrefix,
        },
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
      this.logger.error("Failed to fetch tag list", error);
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
