import { z } from "zod";
import type { ResolvedSchema } from "./schema-engine.js";
type SchemaArg = ResolvedSchema | z.ZodObject<any>;
/**
 * Creates a new document in <dataDir>/<slug>.md with frontmatter + body.
 * Throws if fields fail schema validation.
 */
export declare function createDocument(dataDir: string, schema: SchemaArg, slug: string, fields: Record<string, any>, body?: string): Promise<void>;
/**
 * Reads a document, returns parsed frontmatter fields and body.
 */
export declare function readDocument(dataDir: string, slug: string): Promise<{
    fields: Record<string, any>;
    body: string;
}>;
/**
 * Lists all documents in dataDir, returning slug + parsed frontmatter for each.
 */
export declare function listDocuments(dataDir: string): Promise<Array<{
    slug: string;
    fields: Record<string, any>;
}>>;
/**
 * Updates an existing document by merging new fields over existing ones.
 * Validates merged result against schema. Optionally replaces body.
 */
export declare function updateDocument(dataDir: string, schema: SchemaArg, slug: string, fields: Record<string, any>, body?: string): Promise<void>;
/**
 * Creates a document in a named collection, resolving the dataDir automatically.
 * Ensures the target directory exists before writing.
 */
export declare function createInCollection(schemaName: string, slug: string, fields: Record<string, any>, body?: string, parentSlug?: string): Promise<void>;
/**
 * Updates a document in a named collection, resolving the dataDir automatically.
 */
export declare function updateInCollection(schemaName: string, slug: string, fields: Record<string, any>, body?: string, parentSlug?: string): Promise<void>;
export {};
