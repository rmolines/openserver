// Schema engine
export {
  defineSchema,
  getSchema,
  getAllSchemas,
  getParentSchema,
  resolveDataDir,
  schemaRegistry,
  setDataDirPrefix,
  getDataDirPrefix,
} from "./schema-engine.js";
export type { FieldDef, SchemaDef, ResolvedSchema } from "./schema-engine.js";

// Create Server
export { createServer, sharedApiRoutes } from "./create-server.js";
export type { CreateServerOptions, ServerHandle, CustomToolDef } from "./create-server.js";

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
  addSchemaRoutes,
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
