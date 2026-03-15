export interface QueryOptions {
    where?: Record<string, any>;
    sort?: {
        field: string;
        order?: "asc" | "desc";
    };
}
export interface QueryResult {
    slug: string;
    fields: Record<string, any>;
    body: string;
}
export declare function query(dataDir: string, options?: QueryOptions): Promise<QueryResult[]>;
export declare function getDocument(dataDir: string, slug: string): Promise<QueryResult>;
/**
 * Query a named collection by schema name.
 * If the schema has a parent, parentSlug scopes the query to a specific parent directory.
 * If parentSlug is omitted and schema has parent, aggregates across ALL parent dirs.
 */
export declare function queryCollection(schemaName: string, options?: QueryOptions & {
    parentSlug?: string;
}): Promise<QueryResult[]>;
/**
 * Retrieve a single document from a named collection by schema name and slug.
 */
export declare function getFromCollection(schemaName: string, slug: string, parentSlug?: string): Promise<QueryResult>;
