// Minimal Cloudflare binding shapes for Node-run tests; the Worker build uses worker-configuration.d.ts.
declare global {
  interface R2Object { size: number; httpEtag?: string; httpMetadata?: { contentType?: string } }
  interface R2ObjectBody extends R2Object { body: ReadableStream }
  interface R2Bucket {
    head(key: string): Promise<R2Object | null>;
    get(key: string, options?: { range?: { offset: number; length: number } }): Promise<R2ObjectBody | null>;
  }
  interface D1Database {
    prepare(query: string): { bind(...values: unknown[]): { first<T>(): Promise<T | null> } };
  }
}
export {};
