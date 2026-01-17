import { Injectable, Logger } from "@nestjs/common";
import { Resource, ResourceTemplate } from "@rekog/mcp-nest";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";

interface ModelFieldInfo {
  name: string;
  ord: number;
  sticky: boolean;
  rtl: boolean;
  font: string;
  size: number;
  description: string;
}

interface ModelTemplateInfo {
  name: string;
  ord: number;
  qfmt: string;
  afmt: string;
  bqfmt: string;
  bafmt: string;
  did: number | null;
  bfont: string;
  bsize: number;
}

interface ModelInfo {
  id: number;
  name: string;
  type: number;
  mod: number;
  usn: number;
  sortf: number;
  did: number | null;
  tmpls: ModelTemplateInfo[];
  flds: ModelFieldInfo[];
  css: string;
  latexPre: string;
  latexPost: string;
  latexsvg: boolean;
  req: Array<[number, string, number[]]>;
}

@Injectable()
export class ModelResource {
  private readonly logger = new Logger(ModelResource.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Resource({
    name: "model-list",
    description:
      "List of all Anki note types (models) with their names. Use this to see available models before creating notes.",
    mimeType: "application/json",
    uri: "model://models/list",
  })
  async getModelList({ uri }: { uri: string }) {
    try {
      this.logger.log("Fetching model list");

      const modelNames = await this.ankiClient.invoke<string[]>("modelNames");

      const result = {
        models: modelNames,
        total: modelNames.length,
        commonModels: {
          hasBasic: modelNames.includes("Basic"),
          hasBasicReversed: modelNames.includes("Basic (and reversed card)"),
          hasCloze: modelNames.includes("Cloze"),
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
      this.logger.error("Failed to fetch model list", error);
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
    name: "model-info",
    description:
      "Get detailed information about a specific note type (model), including fields, templates, and CSS styling.",
    mimeType: "application/json",
    uriTemplate: "model://models/{name}/info",
  })
  async getModelInfo({ uri, name }: { uri: string; name: string }) {
    try {
      const decodedName = decodeURIComponent(name);
      this.logger.log(`Fetching info for model: ${decodedName}`);

      const [fieldNames, styling, modelInfo] = await Promise.all([
        this.ankiClient.invoke<string[]>("modelFieldNames", {
          modelName: decodedName,
        }),
        this.ankiClient.invoke<{ css: string }>("modelStyling", {
          modelName: decodedName,
        }),
        this.ankiClient.invoke<Record<string, ModelInfo>>("modelNamesAndIds"),
      ]);

      const modelId = modelInfo[decodedName];

      if (!modelId && fieldNames.length === 0) {
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  error: `Model "${decodedName}" not found`,
                  hint: "Use model://models/list to see available models. Use model://models/{name}/info for model details.",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const result = {
        name: decodedName,
        modelId: modelId || null,
        fields: fieldNames,
        fieldCount: fieldNames.length,
        css: styling?.css || "",
        cssLength: styling?.css?.length || 0,
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
      this.logger.error(`Failed to fetch info for model: ${name}`, error);
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                error: error instanceof Error ? error.message : String(error),
                modelName: name,
                hint: "Make sure the model name is correct. Use model://models/list to see available models. Use model://models/{name}/info for model details.",
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
