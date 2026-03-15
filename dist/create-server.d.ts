import type { ResolvedSchema } from "./schema-engine.js";
export interface CreateServerOptions {
    schemas: ResolvedSchema[];
    dataDir?: string;
    port?: number;
    name?: string;
    version?: string;
    viewsDir?: string;
}
export interface ServerHandle {
    start(): Promise<void>;
}
export declare function createServer(options: CreateServerOptions): ServerHandle;
