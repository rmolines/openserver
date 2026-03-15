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
export declare function setDataDirPrefix(prefix: string): void;
export declare function getDataDirPrefix(): string;
export declare function getSchema(name: string): ResolvedSchema | undefined;
export declare function getAllSchemas(): ResolvedSchema[];
export declare function getParentSchema(schema: ResolvedSchema): ResolvedSchema | undefined;
export declare function resolveDataDir(schema: ResolvedSchema, parentSlug?: string): string;
export declare function defineSchema(def: SchemaDef): ResolvedSchema;
