// Minimal Cloudflare binding shapes for Node-run tests; the Worker build uses worker-configuration.d.ts.
declare global {
  interface R2Object { size: number; httpEtag?: string; httpMetadata?: { contentType?: string } }
  interface R2ObjectBody extends R2Object { body: ReadableStream }
  interface R2Bucket {
    list(options?: { limit?: number; cursor?: string }): Promise<{ objects: Array<{ key: string; size: number; uploaded: Date }>; truncated: boolean; cursor?: string }>;
    head(key: string): Promise<R2Object | null>;
    get(key: string, options?: { range?: { offset: number; length: number } }): Promise<R2ObjectBody | null>;
  }
  interface D1Result<T = Record<string, unknown>> { results: T[]; success: boolean; meta: { changes: number; [key: string]: unknown } }
  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = Record<string, unknown>>(): Promise<T | null>;
    all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
    run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  }
  interface D1Database {
    prepare(query: string): D1PreparedStatement;
    batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  }
}
export {};
