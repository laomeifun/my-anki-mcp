import { z } from "zod";

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

  return z
    .union([
      constrainedArray,
      z.string().transform((str) => {
        try {
          const parsed = JSON.parse(str);
          if (Array.isArray(parsed)) {
            return parsed;
          }
          throw new Error("Not an array");
        } catch {
          throw new Error("Invalid JSON string for array parameter");
        }
      }),
    ])
    .describe(options?.description ?? "");
}

/**
 * Creates a schema that accepts either a record/object or a JSON string representing one.
 * This handles MCP clients that serialize object parameters as JSON strings.
 */
export function jsonRecordSchema(options?: { description?: string }) {
  return z
    .union([
      z.record(z.string(), z.string()),
      z.string().transform((str) => {
        try {
          const parsed = JSON.parse(str);
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            !Array.isArray(parsed)
          ) {
            return parsed as Record<string, string>;
          }
          throw new Error("Not an object");
        } catch {
          throw new Error("Invalid JSON string for object parameter");
        }
      }),
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

  return z
    .union([
      objectSchema,
      z.string().transform((str) => {
        try {
          const parsed = JSON.parse(str);
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            !Array.isArray(parsed)
          ) {
            return parsed as ObjectType;
          }
          throw new Error("Not an object");
        } catch {
          throw new Error("Invalid JSON string for object parameter");
        }
      }),
    ])
    .describe(options?.description ?? "");
}
