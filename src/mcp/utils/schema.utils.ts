import { z } from "zod";

export interface SafeJsonParseOptions {
  maxDepth?: number;
  normalizeSmartQuotes?: boolean;
}

export type SafeJsonParseResult =
  | { success: true; data: unknown }
  | { success: false; error: string };

function normalizeSmartQuotes(input: string): string {
  return input
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'");
}

function looksLikeJson(input: string): boolean {
  const s = input.trim();
  if (s.length === 0) return false;
  const first = s[0];
  return first === "{" || first === "[" || first === '"';
}

function toNullPrototype(value: unknown, depth = 0): unknown {
  if (depth > 50) return value;

  if (Array.isArray(value)) {
    return value.map((v) => toNullPrototype(v, depth + 1));
  }

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const proto = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) {
      const out = Object.create(null) as Record<string, unknown>;
      for (const [k, v] of Object.entries(value)) {
        out[k] = toNullPrototype(v, depth + 1);
      }
      return out;
    }
  }

  return value;
}

export function safeJsonParse(
  input: string,
  options: SafeJsonParseOptions = {},
): SafeJsonParseResult {
  const maxDepth = options.maxDepth ?? 3;
  const normalize = options.normalizeSmartQuotes ?? true;

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { success: false, error: "Empty string" };
  }

  const candidates = normalize
    ? [trimmed, normalizeSmartQuotes(trimmed)]
    : [trimmed];

  const uniqueCandidates = [...new Set(candidates)];
  const errors: string[] = [];

  for (const candidate of uniqueCandidates) {
    if (!looksLikeJson(candidate)) {
      errors.push(
        "Does not look like JSON (expected it to start with '{', '[', or '\"')",
      );
      continue;
    }

    let current: unknown = candidate;

    try {
      for (let depth = 0; depth < maxDepth; depth++) {
        if (typeof current !== "string") break;

        const s = current.trim();
        if (!looksLikeJson(s)) break;

        current = JSON.parse(s);
      }

      return { success: true, data: toNullPrototype(current) };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    success: false,
    error:
      errors.length > 0 ? errors.join(" | ") : "Failed to parse JSON string",
  };
}

export interface JsonStringSchemaOptions {
  paramName: string;
  maxDepth?: number;
  normalizeSmartQuotes?: boolean;
}

export function jsonStringToNative<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  options: JsonStringSchemaOptions,
) {
  return z.preprocess((value, ctx) => {
    if (typeof value !== "string") {
      return value;
    }

    const parsed = safeJsonParse(value, {
      maxDepth: options.maxDepth,
      normalizeSmartQuotes: options.normalizeSmartQuotes,
    });

    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `Invalid JSON string for "${options.paramName}": ${parsed.error}. ` +
          "Pass a native value (recommended) or a valid JSON string.",
      });
      return z.NEVER;
    }

    return parsed.data;
  }, schema);
}
