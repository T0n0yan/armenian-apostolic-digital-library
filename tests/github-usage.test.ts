import assert from "node:assert/strict";
import test from "node:test";

import { readGitHubUsage, runMinutes } from "../app/data/github-usage.server";

test("runMinutes կլորացնում է վերև", () => {
  assert.equal(runMinutes({ status: "completed", run_started_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:45Z" }), 1);
  assert.equal(runMinutes({ status: "completed", run_started_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:02:01Z" }), 3);
  assert.equal(runMinutes({ status: "in_progress", run_started_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:09:00Z" }), 0);
});

test("առանց բանալու՝ միացված չէ", async () => {
  assert.equal((await readGitHubUsage({})).configured, false);
});

test("հաշվում է րոպեները և վերջին deploy-ները", async () => {
  const original = globalThis.fetch;
  const run = (name: string, branch: string, seconds: number) => ({ name, head_branch: branch, status: "completed", conclusion: "success", run_started_at: "2026-11-01T10:00:00Z", updated_at: new Date(Date.parse("2026-11-01T10:00:00Z") + seconds * 1000).toISOString(), html_url: "u", display_title: "t" });
  globalThis.fetch = (async () => new Response(JSON.stringify({ total_count: 3, workflow_runs: [run("Deploy", "staging", 70), run("Deploy", "main", 30), run("Cloud sync", "main", 200)] }))) as typeof fetch;
  try {
    const usage = await readGitHubUsage({ GITHUB_SYNC_TOKEN: "x" }, new Date("2026-11-02T00:00:00Z"));
    assert.equal(usage.minutes, 2 + 1 + 4);
    assert.equal(usage.runs, 3);
    assert.deepEqual(usage.deploys.map((deploy) => deploy.branch), ["main", "staging"]);
    assert.equal(usage.byWorkflow[0].name, "Cloud sync");
    assert.equal(usage.monthStart, "2026-11-01");
  } finally { globalThis.fetch = original; }
});
