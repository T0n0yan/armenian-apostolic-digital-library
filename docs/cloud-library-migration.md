# Cloud library migration design

This document describes the local-only preparation for moving public library reads away from the live Telegram Bridge. It does not authorize creating a bucket, applying a remote migration, importing Telegram history, or deploying a Worker.

## Data ownership

- Telegram remains the editorial source of truth.
- D1 stores the public read model: sources, topics, canonical materials, ordered rich-text blocks, media metadata, searchable fields, sync checkpoints/runs/failures.
- Private R2 stores immutable public-library media objects. Bucket names and object keys are never exposed directly to clients.
- Existing `app_users`, `saved_materials`, personal notes, mapping/review state, and aggregate search analytics remain separate from public library tables.

The inventory used for capacity planning contains 161 canonical materials and 113 unique media assets, approximately 3.076 GiB of measured originals. Initial staging capacity should allow about 5 GiB. Six media references did not expose a usable size/location and must enter the retryable failure ledger rather than being guessed or silently marked ready.

## Sync lifecycle

1. A read-only Telegram adapter lists dynamic forum topics and cursor-pages each topic history.
2. Canonical material JSON receives a stable SHA-256 content hash. Albums use their canonical message plus ordered constituent identities.
3. A target stages the D1 material as non-public, reports which immutable objects are missing, and accepts streamed media without buffering the whole object in the Bridge.
4. Object keys use `v1/{chatId}/{messageId}/{contentHash}/{mediaIndex}/original.{ext}`. Unchanged retries skip existing objects; edited content gets a new immutable key.
5. Only after every required media object succeeds does the target atomically mark the material `ready`. Failures remain retryable and visible in `library_sync_failures`.
6. The cursor advances after a page is durably handled. A repeated cursor stops the importer. Dry-run performs Telegram reads and planning but no D1/R2 writes.
7. Incremental/reconcile runs refresh edited/new/deleted state. A Bridge restart resumes from D1 checkpoints; Telegram content is never cached to local disk.

The importer boundary is intentionally storage-agnostic. A later checkpoint must implement the D1/R2 target and its transaction ordering, then run a small staging dry-run before any full import.

## Public reads

Public home/topic/detail/search/bookmark hydration reads only `library_*` D1 tables. `/media/:chatId/:messageId/:mediaIndex` verifies a ready public material in D1 and streams the corresponding private R2 object with `HEAD`, `200`, `206`, and `416` semantics. Telegram, the Bridge, and the Tunnel are not on the normal user-request path.

## Rollback and promotion

Migration `0012_cloud_library.sql` is additive. Before remote apply, export staging D1 and record a Time Travel bookmark. If import validation fails, keep active traffic on the current version, delete only the inactive imported rows/objects in a separately approved cleanup, or restore staging from the captured point. Do not drop existing user/reference tables. Production uses the same code and schema with separate D1/R2 bindings and credentials; source code does not change.
