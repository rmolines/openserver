export { defineSchema, getSchema, getAllSchemas, getParentSchema, resolveDataDir, schemaRegistry, } from "./schema-engine.js";
export type { FieldDef, SchemaDef, ResolvedSchema } from "./schema-engine.js";
export { registerCollectionTools, registerChildCollectionTools, registerAllCollections, } from "./auto-mcp.js";
export { registerCollectionRoutes, registerChildCollectionRoutes, registerAllRoutes, } from "./auto-api.js";
export { createDocument, readDocument, listDocuments, updateDocument, createInCollection, updateInCollection, } from "./fs-db.js";
export { query, getDocument, queryCollection, getFromCollection } from "./query.js";
export type { QueryOptions, QueryResult } from "./query.js";
export { startWatcher } from "./watcher.js";
