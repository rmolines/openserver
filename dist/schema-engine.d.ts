import { z } from "zod";
export type FieldDef = {
    type: "string";
    required?: boolean;
    default?: string;
} | {
    type: "number";
    required?: boolean;
    default?: number;
} | {
    type: "boolean";
    required?: boolean;
    default?: boolean;
} | {
    type: "date";
    required?: boolean;
} | {
    type: "enum";
    values: string[];
    required?: boolean;
    default?: string;
} | {
    type: "array";
    items: "string";
    required?: boolean;
    default?: string[];
} | {
    type: "ref";
    collection: string;
    required?: boolean;
};
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
export declare const schemaRegistry: Map<string, ResolvedSchema>;
export declare function getSchema(name: string): ResolvedSchema | undefined;
export declare function getAllSchemas(): ResolvedSchema[];
/**
 * Returns the parent schema for a given schema, if it has one.
 */
export declare function getParentSchema(schema: ResolvedSchema): ResolvedSchema | undefined;
/**
 * Resolves the data directory for a schema.
 * - No parent: returns `data/<collection-name>s/`
 * - Has parent: returns `data/<parentSlug>/<collection-name>s/`
 * - Has parent but no parentSlug: throws error
 */
export declare function resolveDataDir(schema: ResolvedSchema, parentSlug?: string): string;
export declare function defineSchema(def: SchemaDef): ResolvedSchema;
