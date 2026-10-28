import assert from "node:assert/strict";
import test from "node:test";
import { readCloudflareUsage, usagePercent } from "../app/data/cloudflare-usage.server";
const settings = { CF_ANALYTICS_ACCOUNT_ID: "a".repeat(32), CF_ANALYTICS_TOKEN: "fixture-metrics-token" };
const now = new Date("2026-10-28T17:00:00Z");
test("missing analytics credentials never fabricate zero usage or send a request", async () => {
  const result = await readCloudflareUsage({}, async () => { throw Error("must not fetch"); }, now);
  assert.equal(result.configured, false); assert.ok(result.metrics.every((m) => m.used === null));
  assert.equal(usagePercent(null, 100), null); assert.equal(usagePercent(125, 100), 125);
});
test("analytics uses UTC account-wide totals and isolates provider failures", async () => {
  const seen: string[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, "https://api.cloudflare.com/client/v4/graphql");
    const body = JSON.parse(String(init?.body)); const query: string = body.query; seen.push(query);
    if (query.includes("r2Storage")) return new Response("denied", { status: 403 });
    if (query.includes("r2Operations")) return Response.json({ data: { viewer: { accounts: [{ r2OperationsAdaptiveGroups: [
      { sum: { requests: 20 }, dimensions: { actionType: "PutObject" } },
      { sum: { requests: 30 }, dimensions: { actionType: "GetObject" } },
      { sum: { requests: 99 }, dimensions: { actionType: "DeleteObject" } },
    ] }] } } });
    if (query.includes("durableObjects")) return Response.json({ data: { viewer: { accounts: [{ durableObjectsInvocationsAdaptiveGroups: [{ sum: { requests: 7 } }] }] } } });
    const dataset = query.includes("workersInvocations") ? "workersInvocationsAdaptive" : query.includes("d1Analytics") ? "d1AnalyticsAdaptiveGroups" : "d1StorageAdaptiveGroups";
    const rows = dataset === "workersInvocationsAdaptive" ? [{ sum: { requests: 42000 } }] : dataset === "d1AnalyticsAdaptiveGroups" ? [{ sum: { rowsRead: 100, rowsWritten: 12 } }] : [{ max: { databaseSizeBytes: 1000 } }, { max: { databaseSizeBytes: 2000 } }];
    return Response.json({ data: { viewer: { accounts: [{ [dataset]: rows }] } } });
  };
  const result = await readCloudflareUsage(settings, fetcher, now);
  assert.equal(result.from, "2026-10-28T00:00:00.000Z");
  assert.equal(result.metrics[0].used, 42000); assert.equal(result.metrics[3].used, 3000);
  assert.equal(result.metrics[4].used, null); assert.ok(result.metrics[4].error);
  assert.equal(result.metrics.find((m) => m.id === "r2-a")?.used, 20);
  assert.equal(result.metrics.find((m) => m.id === "r2-b")?.used, 30);
  assert.equal(result.metrics.find((m) => m.id === "do-requests")?.used, 7);
  assert.equal(result.metrics.find((m) => m.id === "d1-largest")?.used, 2000);
  assert.ok(seen.find((q) => q.includes("r2Operations"))?.includes("2026-10-01T00:00:00.000Z"));
  assert.ok(seen.every((q) => !q.includes("scriptName:")));
  assert.ok(!JSON.stringify(result).includes(settings.CF_ANALYTICS_TOKEN));
});
test("GraphQL errors and missing numeric fields are unknown, not healthy zero", async () => {
  for (const payload of [{ errors: [{ message: "permission denied" }] }, { data: { viewer: { accounts: [] } } }]) {
    const result = await readCloudflareUsage(settings, async () => Response.json(payload), now);
    assert.ok(result.metrics.every((m) => m.used === null && m.error));
  }
});
