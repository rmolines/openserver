import type { ZodType } from "zod";
import type { ResolvedSchema } from "./schema-engine.js";
/**
 * Shared mutable route map for this server instance.
 * Exported so runtime callers (e.g. create_schema) can mutate it after start().
 * This module-level variable is intentionally a singleton per process — it is
 * populated by createServer() and remains stable so the fetch handler always
 * reads the latest routes without being restarted.
 */
export declare let sharedApiRoutes: Map<string, (req: Request) => Promise<Response>> | null;
export interface CustomToolDef {
    name: string;
    description?: string;
    inputSchema: Record<string, ZodType>;
    handler: (args: any) => Promise<any>;
}
export interface CreateServerOptions {
    schemas: ResolvedSchema[];
    dataDir?: string;
    port?: number;
    name?: string;
    version?: string;
    viewsDir?: string;
    tools?: CustomToolDef[];
    transport?: "stdio" | "http";
}
export interface ServerHandle {
    start(): Promise<void>;
}
export declare function createServer(options: CreateServerOptions): ServerHandle;
