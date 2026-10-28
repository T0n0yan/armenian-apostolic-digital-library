/** Account-wide, read-only provider metrics. Never infer zero from a failed/missing dataset. */
export type UsageEnv = { CF_ANALYTICS_ACCOUNT_ID?: string; CF_ANALYTICS_TOKEN?: string };
export type UsageMetric = { id: string; label: string; used: number | null; limit: number; unit: string; period: string; error?: string };
export type UsageSnapshot = { configured: boolean; sampledAt: string; from: string; metrics: UsageMetric[] };
const definitions = [
  { id: "workers", label: "Workers հարցումներ", limit: 100_000, unit: "հարցում", period: "Այսօր՝ UTC 00:00-ից" },
  { id: "d1-read", label: "D1 կարդացած տողեր", limit: 5_000_000, unit: "տող", period: "Այսօր՝ UTC 00:00-ից" },
  { id: "d1-write", label: "D1 գրած տողեր", limit: 100_000, unit: "տող", period: "Այսօր՝ UTC 00:00-ից" },
  { id: "d1-storage", label: "D1 ընդհանուր պահեստ", limit: 5_000_000_000, unit: "byte", period: "Վերջին հասանելի չափում" },
  { id: "r2-storage", label: "R2 ընդհանուր պահեստ", limit: 10_000_000_000, unit: "byte", period: "Վերջին օրվա առավելագույն ծավալների գումար" },
  { id: "d1-largest", label: "D1 ամենամեծ բազան", limit: 500_000_000, unit: "byte", period: "Վերջին հասանելի չափում" },
  { id: "r2-a", label: "R2 Class A գործողություններ", limit: 1_000_000, unit: "հարցում", period: "Այս ամսվա սկզբից՝ UTC" },
  { id: "r2-b", label: "R2 Class B գործողություններ", limit: 10_000_000, unit: "հարցում", period: "Այս ամսվա սկզբից՝ UTC" },
  { id: "do-requests", label: "Durable Objects հարցումներ", limit: 100_000, unit: "հարցում", period: "Այսօր՝ UTC 00:00-ից" },
] as const;
// Operation classes: https://developers.cloudflare.com/r2/pricing/#class-a-operations
const classA = new Set("ListBuckets PutBucket ListObjects ListObjectsV2 PutObject CopyObject CompleteMultipartUpload CreateMultipartUpload LifecycleStorageTierTransition ListMultipartUploads UploadPart UploadPartCopy ListParts PutBucketEncryption PutBucketCors PutBucketLifecycleConfiguration".toLowerCase().split(" "));
const classB = new Set("HeadBucket HeadObject GetObject UsageSummary GetBucketEncryption GetBucketLocation GetBucketCors GetBucketLifecycleConfiguration".toLowerCase().split(" "));
const freeOperations = new Set("DeleteObject DeleteObjects DeleteBucket AbortMultipartUpload".toLowerCase().split(" "));
let cached: { account: string; token: string; at: number; snapshot: UsageSnapshot } | null = null;
export function validUsageNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0; }
export function usagePercent(used: number | null, limit: number) { return used === null ? null : used / limit * 100; }

export async function readCloudflareUsage(env: UsageEnv, requestFetch: typeof fetch = fetch, now = new Date()): Promise<UsageSnapshot> {
  const account = env.CF_ANALYTICS_ACCOUNT_ID?.trim();
  const token = env.CF_ANALYTICS_TOKEN?.trim();
  const from = `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
  const metrics: UsageMetric[] = definitions.map((item) => ({ ...item, used: null }));
  const configured = Boolean(account && /^[a-f0-9]{32}$/i.test(account) && token);
  if (!configured) return { configured: false, sampledAt: now.toISOString(), from, metrics };
  if (requestFetch === fetch && cached && cached.account === account && cached.token === token && now.getTime() - cached.at < 60_000 && cached.snapshot.from === from) return cached.snapshot;
  async function query(dataset: string, filter: string, fields: string) {
    const response = await requestFetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ query: `query($account: string!) { viewer { accounts(filter: {accountTag: $account}) { ${dataset}(limit: 1000, filter: {${filter}}) { ${fields} } } } }`, variables: { account } }),
    });
    if (!response.ok) throw new Error(`Cloudflare HTTP ${response.status}`);
    const payload = await response.json() as { errors?: unknown[]; data?: { viewer?: { accounts?: Record<string, unknown>[] } } };
    if (payload.errors?.length) throw new Error("Cloudflare dataset unavailable");
    const rows = payload.data?.viewer?.accounts?.[0]?.[dataset];
    if (!Array.isArray(rows) || rows.length >= 1000) throw new Error("Incomplete Cloudflare dataset");
    return rows as Array<{ sum?: Record<string, number>; max?: Record<string, number>; dimensions?: { actionType?: string } }>;
  }
  const until = now.toISOString();
  const day = now.toISOString().slice(0, 10);
  const failure = "Տվյալը հասանելի չէ․ ստուգեք API իրավունքը կամ փորձեք ավելի ուշ։";
  async function group(ids: string[], load: () => Promise<number[]>) {
    try {
      const values = await load();
      if (values.length !== ids.length || values.some((v) => !validUsageNumber(v))) throw new Error("Missing metric");
      ids.forEach((id, i) => { metrics.find((m) => m.id === id)!.used = values[i]; });
    } catch { ids.forEach((id) => { metrics.find((m) => m.id === id)!.error = failure; }); }
  }
  const sum = (rows: Array<{sum?: Record<string, number>}>, field: string) => rows.reduce((n, row) => n + (validUsageNumber(row.sum?.[field]) ? row.sum![field] : NaN), 0);
  await Promise.all([
    group(["workers"], async () => [sum(await query("workersInvocationsAdaptive", `datetime_geq: "${from}", datetime_leq: "${until}"`, "sum { requests }"), "requests")]),
    group(["d1-read", "d1-write"], async () => {
      const rows = await query("d1AnalyticsAdaptiveGroups", `date_geq: "${day}", date_leq: "${day}"`, "sum { rowsRead rowsWritten }");
      return [sum(rows, "rowsRead"), sum(rows, "rowsWritten")];
    }),
    group(["d1-storage", "d1-largest"], async () => {
      const rows = await query("d1StorageAdaptiveGroups", `date_geq: "${day}", date_leq: "${day}"`, "max { databaseSizeBytes } dimensions { databaseId }");
      if (!rows.length) throw new Error("No storage samples");
      const sizes = rows.map((row) => validUsageNumber(row.max?.databaseSizeBytes) ? row.max!.databaseSizeBytes : NaN);
      return [sizes.reduce((a, b) => a + b, 0), Math.max(...sizes)];
    }),
    group(["r2-storage"], async () => {
      const since = new Date(now.getTime() - 86_400_000).toISOString();
      const rows = await query("r2StorageAdaptiveGroups", `datetime_geq: "${since}", datetime_leq: "${until}"`, "max { payloadSize metadataSize } dimensions { bucketName }");
      if (!rows.length) throw new Error("No storage samples");
      return [rows.reduce((n, row) => n + (row.max?.payloadSize ?? NaN) + (row.max?.metadataSize ?? NaN), 0)];
    }),
    group(["r2-a", "r2-b"], async () => {
      const month = `${day.slice(0, 7)}-01T00:00:00.000Z`;
      const rows = await query("r2OperationsAdaptiveGroups", `datetime_geq: "${month}", datetime_leq: "${until}"`, "sum { requests } dimensions { actionType }");
      let a = 0, b = 0;
      for (const row of rows) {
        if (!validUsageNumber(row.sum?.requests)) throw new Error("Missing operation count");
        const action = row.dimensions?.actionType?.toLowerCase() ?? "";
        if (classA.has(action)) a += row.sum!.requests;
        else if (classB.has(action)) b += row.sum!.requests;
        else if (!freeOperations.has(action) && row.sum!.requests > 0) throw new Error("Unknown operation class");
      }
      return [a, b];
    }),
    group(["do-requests"], async () => [sum(await query("durableObjectsInvocationsAdaptiveGroups", `date_geq: "${day}", date_leq: "${day}"`, "sum { requests }"), "requests")]),
  ]);
  const snapshot = { configured: true, sampledAt: until, from, metrics };
  if (requestFetch === fetch) cached = { account: account!, token: token!, at: now.getTime(), snapshot };
  return snapshot;
}
