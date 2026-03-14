import { z } from "zod";

// Field type definitions
export type FieldDef =
  | { type: "string"; required?: boolean; default?: string }
  | { type: "number"; required?: boolean; default?: number }
  | { type: "boolean"; required?: boolean; default?: boolean }
  | { type: "date"; required?: boolean }
  | { type: "enum"; values: string[]; required?: boolean; default?: string }
  | { type: "array"; items: "string"; required?: boolean; default?: string[] }
  | { type: "ref"; collection: string; required?: boolean };

export interface SchemaDef {
  name: string;
  parent?: string;
  fields: Record<string, FieldDef>;
}

export interface ResolvedSchema {
  name: string;
  parent?: string;
  fields: Record<string, FieldDef>;
  zodSchema: z.ZodObject<any>;
}

// Global schema registry
export const schemaRegistry: Map<string, ResolvedSchema> = new Map();

export function getSchema(name: string): ResolvedSchema | undefined {
  return schemaRegistry.get(name);
}

export function getAllSchemas(): ResolvedSchema[] {
  return Array.from(schemaRegistry.values());
}

/**
 * Returns the parent schema for a given schema, if it has one.
 */
export function getParentSchema(schema: ResolvedSchema): ResolvedSchema | undefined {
  if (!schema.parent) return undefined;
  return schemaRegistry.get(schema.parent);
}

/**
 * Resolves the data directory for a schema.
 * - No parent: returns `data/<collection-name>s/`
 * - Has parent: returns `data/<parentSlug>/<collection-name>s/`
 * - Has parent but no parentSlug: throws error
 */
export function resolveDataDir(schema: ResolvedSchema, parentSlug?: string): string {
  const collectionDir = `${schema.name}s`;

  if (!schema.parent) {
    return `data/${collectionDir}/`;
  }

  if (!parentSlug) {
    throw new Error(
      `[schema-engine] resolveDataDir: schema "${schema.name}" has parent "${schema.parent}" but no parentSlug was provided`
    );
  }

  return `data/${parentSlug}/${collectionDir}/`;
}

function buildFieldZod(def: FieldDef): z.ZodTypeAny {
  let base: z.ZodTypeAny;

  switch (def.type) {
    case "string":
      base = z.string();
      if (!def.required) base = base.optional();
      if ("default" in def && def.default !== undefined) base = (base as any).default(def.default);
      break;

    case "number":
      base = z.number();
      if (!def.required) base = base.optional();
      if ("default" in def && def.default !== undefined) base = (base as any).default(def.default);
      break;

    case "boolean":
      base = z.boolean();
      if (!def.required) base = base.optional();
      if ("default" in def && def.default !== undefined) base = (base as any).default(def.default);
      break;

    case "date":
      base = z.coerce.date().transform((d) => d.toISOString().split("T")[0]);
      if (!def.required) base = base.optional();
      break;

    case "enum": {
      const values = def.values as [string, ...string[]];
      base = z.enum(values);
      if (!def.required) base = base.optional();
      if ("default" in def && def.default !== undefined) base = (base as any).default(def.default);
      break;
    }

    case "array":
      base = z.array(z.string());
      if (!def.required) base = base.optional();
      if ("default" in def && def.default !== undefined) base = (base as any).default(def.default);
      break;

    case "ref":
      // stored as slug string
      base = z.string();
      if (!def.required) base = base.optional();
      break;

    default:
      base = z.string().optional();
  }

  return base;
}

export function defineSchema(def: SchemaDef): ResolvedSchema {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, fieldDef] of Object.entries(def.fields)) {
    shape[key] = buildFieldZod(fieldDef);
  }

  const zodSchema = z.object(shape);

  const resolved: ResolvedSchema = {
    name: def.name,
    parent: def.parent,
    fields: def.fields,
    zodSchema,
  };

  schemaRegistry.set(def.name, resolved);
  process.stderr.write(`[schema-engine] registered schema: ${def.name}\n`);

  // Warn if parent schema is declared but not yet registered
  if (def.parent && !schemaRegistry.has(def.parent)) {
    process.stderr.write(
      `[schema-engine] warning: schema "${def.name}" references parent "${def.parent}" which is not yet registered (order-independent registration is OK)\n`
    );
  }

  return resolved;
}
