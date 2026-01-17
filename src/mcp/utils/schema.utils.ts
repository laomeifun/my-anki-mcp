import { z } from "zod";

export interface SafeJsonParseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  position?: number;
  snippet?: string;
  recoveryAttempted?: boolean;
}

/**
 * Attempt to fix common JSON escaping issues.
 * Returns null if no fix could be applied.
 */
function attemptJsonRecovery(input: string): string | null {
  // Strategy 1: If the string looks like it was double-escaped, try unescaping
  if (input.includes('\\\\"') || input.includes("\\\\'")) {
    const fixed = input
      .replace(/\\\\"/g, '\\"')
      .replace(/\\\\'/g, "\\'")
      .replace(/\\\\\//g, "\\/");
    if (fixed !== input) return fixed;
  }

  // Strategy 2: Try to fix unescaped quotes in Chinese text contexts
  // Pattern: Chinese char followed by unescaped quote followed by Chinese char
  const chineseQuotePattern = /([\u4e00-\u9fff])\\?"([\u4e00-\u9fff])/g;
  if (chineseQuotePattern.test(input)) {
    const fixed = input.replace(chineseQuotePattern, '$1"$2');
    if (fixed !== input) return fixed;
  }

  // Strategy 3: Replace smart quotes with regular quotes
  const smartQuoteFixed = input.replace(/[""]/g, '"').replace(/['']/g, "'");
  if (smartQuoteFixed !== input) return smartQuoteFixed;

  return null;
}

export function safeJsonParse<T = unknown>(
  input: string,
  context?: string,
): SafeJsonParseResult<T> {
  try {
    const data = JSON.parse(input) as T;
    return { success: true, data };
  } catch (firstError) {
    const recovered = attemptJsonRecovery(input);
    if (recovered) {
      try {
        const data = JSON.parse(recovered) as T;
        return { success: true, data, recoveryAttempted: true };
      } catch {
        // Recovery didn't help
      }
    }

    const errorInfo: SafeJsonParseResult<T> = {
      success: false,
      recoveryAttempted: recovered !== null,
    };

    if (firstError instanceof SyntaxError) {
      const posMatch = firstError.message.match(/position\s+(\d+)/i);
      if (posMatch) {
        const pos = parseInt(posMatch[1], 10);
        errorInfo.position = pos;
        const start = Math.max(0, pos - 30);
        const end = Math.min(input.length, pos + 30);
        errorInfo.snippet = input.slice(start, end);
        errorInfo.error = `JSON parse error at position ${pos}. Context: "...${errorInfo.snippet}..."`;
      } else {
        errorInfo.error = `JSON parse error: ${firstError.message}`;
      }
    } else {
      errorInfo.error =
        firstError instanceof Error
          ? firstError.message
          : "Unknown parse error";
    }

    if (context) {
      errorInfo.error = `[${context}] ${errorInfo.error}`;
    }

    return errorInfo;
  }
}

export function createJsonTransform<T>(
  validator: (parsed: unknown) => parsed is T,
  typeName: string,
) {
  return (str: string): T => {
    const result = safeJsonParse(str, typeName);

    if (!result.success) {
      throw new Error(result.error);
    }

    if (!validator(result.data)) {
      throw new Error(
        `Invalid ${typeName}: expected ${typeName} but got ${typeof result.data}`,
      );
    }

    return result.data;
  };
}

/**
 * Creates a schema that accepts either an array or a JSON string representing an array.
 * This handles MCP clients that serialize array parameters as JSON strings.
 */
export function jsonArraySchema<T extends z.ZodTypeAny>(
  itemSchema: T,
  options?: { min?: number; max?: number; description?: string },
) {
  const arraySchema = z.array(itemSchema);
  const constrainedArray = options?.min
    ? options?.max
      ? arraySchema.min(options.min).max(options.max)
      : arraySchema.min(options.min)
    : options?.max
      ? arraySchema.max(options.max)
      : arraySchema;

  const isArray = (val: unknown): val is z.infer<typeof constrainedArray> =>
    Array.isArray(val);

  return z
    .union([
      constrainedArray,
      z.string().transform(createJsonTransform(isArray, "array")),
    ])
    .describe(options?.description ?? "");
}

/**
 * Creates a schema that accepts either a record/object or a JSON string representing one.
 * This handles MCP clients that serialize object parameters as JSON strings.
 */
export function jsonRecordSchema(options?: { description?: string }) {
  const isRecord = (val: unknown): val is Record<string, string> =>
    typeof val === "object" && val !== null && !Array.isArray(val);

  return z
    .union([
      z.record(z.string(), z.string()),
      z.string().transform(createJsonTransform(isRecord, "fields object")),
    ])
    .describe(options?.description ?? "");
}

/**
 * Creates a schema that accepts either an object or a JSON string representing one.
 * This handles MCP clients that serialize complex object parameters as JSON strings.
 */
export function jsonObjectSchema<T extends z.ZodRawShape>(
  shape: T,
  options?: { description?: string },
) {
  const objectSchema = z.object(shape);
  type ObjectType = z.infer<typeof objectSchema>;

  const isObject = (val: unknown): val is ObjectType =>
    typeof val === "object" && val !== null && !Array.isArray(val);

  return z
    .union([
      objectSchema,
      z.string().transform(createJsonTransform(isObject, "object")),
    ])
    .describe(options?.description ?? "");
}
