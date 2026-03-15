import { type ResolvedSchema } from "./schema-engine.js";
export declare function registerCollectionRoutes(schema: ResolvedSchema, dataDir: string): Map<string, (req: Request) => Promise<Response>>;
export declare function registerChildCollectionRoutes(schema: ResolvedSchema): Map<string, (req: Request) => Promise<Response>>;
export declare function registerAllRoutes(): Map<string, (req: Request) => Promise<Response>>;
/**
 * Add routes for a single schema into an existing shared route Map.
 * Call this at runtime after create_schema registers MCP tools so the new
 * schema gets HTTP routes without a server restart.
 */
export declare function addSchemaRoutes(routeMap: Map<string, (req: Request) => Promise<Response>>, schema: ResolvedSchema): void;
