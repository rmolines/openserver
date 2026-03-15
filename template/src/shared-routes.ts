/**
 * Module-level shared mutable route map.
 *
 * server.ts populates this after calling registerAllRoutes(), then the
 * HTTP fetch handler reads from it on every request. meta-tools/schemas.ts
 * mutates it at runtime when create_schema adds a new collection, so new
 * REST routes are immediately available without a server restart.
 */
export const sharedApiRoutes = new Map<string, (req: Request) => Promise<Response>>();
