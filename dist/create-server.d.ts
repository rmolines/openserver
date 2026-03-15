import type { ZodType } from "zod";
import type { ResolvedSchema } from "./schema-engine.js";
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
}
export interface ServerHandle {
    start(): Promise<void>;
}
export declare function createServer(options: CreateServerOptions): ServerHandle;
