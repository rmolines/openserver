// Schema engine
export {
  defineSchema,
  getSchema,
  getAllSchemas,
  getParentSchema,
  resolveDataDir,
  schemaRegistry,
} from "./schema-engine.js";
export type { FieldDef, SchemaDef, ResolvedSchema } from "./schema-engine.js";

// Auto MCP
export {
  registerCollectionTools,
  registerChildCollectionTools,
  registerAllCollections,
} from "./auto-mcp.js";

// Auto API
export {
  registerCollectionRoutes,
  registerChildCollectionRoutes,
  registerAllRoutes,
} from "./auto-api.js";

// FS DB
export {
  createDocument,
  readDocument,
  listDocuments,
  updateDocument,
  createInCollection,
  updateInCollection,
} from "./fs-db.js";

// Query
export { query, getDocument, queryCollection, getFromCollection } from "./query.js";
export type { QueryOptions, QueryResult } from "./query.js";

// Watcher
export { startWatcher } from "./watcher.js";
