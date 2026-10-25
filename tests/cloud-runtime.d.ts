// Runtime bindings needed by transitive Node-test imports. No process.env augmentation.
declare module "cloudflare:workers" {
  export const env: { DB: D1Database; MEDIA: R2Bucket } & Record<string, unknown>;
}
