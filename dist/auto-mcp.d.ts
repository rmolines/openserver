import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ResolvedSchema } from "./schema-engine.js";
export declare function registerCollectionTools(server: McpServer, schema: ResolvedSchema, dataDir: string): string[];
export declare function registerChildCollectionTools(server: McpServer, schema: ResolvedSchema): string[];
export declare function registerAllCollections(server: McpServer): void;
