import { type ResolvedSchema } from "./schema-engine.js";
export declare function registerCollectionRoutes(schema: ResolvedSchema, dataDir: string): Map<string, (req: Request) => Promise<Response>>;
export declare function registerChildCollectionRoutes(schema: ResolvedSchema): Map<string, (req: Request) => Promise<Response>>;
export declare function registerAllRoutes(): Map<string, (req: Request) => Promise<Response>>;
