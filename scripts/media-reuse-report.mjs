// Միայն ընթերցում․ մեդիայի արտաքին օգտագործման համախմբված տվյալներ, առանց IP-ների կամ անձնական URL-ների։
import { appendFileSync, writeFileSync } from "node:fs";

const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error("Cloudflare-ի գործող հասանելիությունը բացակայում է։");
const until = new Date();
const since = new Date(until.getTime() - 24 * 60 * 60 * 1000);
const report = { from: since.toISOString(), until: until.toISOString(), zoneAvailable: false, analytics: null, transforms: null, errors: [] };
async function call(path, body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok || data.success === false || data.errors?.length) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(data.errors ?? []).slice(0, 600)}`);
  }
  return data;
}
try {
  const zones = await call("/zones?name=apostolic.am&per_page=1");
  const zone = zones.result?.find((item) => item.name === "apostolic.am");
  if (!zone) throw new Error("apostolic.am գոտին հասանելի չէ այս API իրավունքով։");
  report.zoneAvailable = true;
  report.plan = zone.plan?.name ?? null;
  try {
    const result = await call("/graphql", {
      query: `query($zone: string!, $from: Time!, $until: Time!) {
        viewer { zones(filter: {zoneTag: $zone}) {
          httpRequestsAdaptiveGroups(limit: 1000, filter: {datetime_geq: $from, datetime_lt: $until, clientRequestHTTPHost_in: ["media.apostolic.am", "media-staging.apostolic.am"]}, orderBy: [count_DESC]) {
            count sum { edgeResponseBytes } dimensions { clientRequestHTTPHost clientRefererHost }
          }
        } }
      }`, variables: { zone: zone.id, from: report.from, until: report.until },
    });
    const rows = result.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups;
    if (!Array.isArray(rows)) throw new Error("Վիճակագրության տվյալները բացակայում են։");
    report.analytics = { sampled: true, possiblyTruncated: rows.length >= 1000, rows };
  } catch (error) { report.errors.push(`Վիճակագրություն՝ ${error.message}`); }
  try {
    const rules = await call(`/zones/${zone.id}/rulesets/phases/http_response_headers_transform/entrypoint`);
    report.transforms = (rules.result?.rules ?? []).map(({ description, expression, enabled, action_parameters }) => ({ description, expression, enabled, headers: Object.keys(action_parameters?.headers ?? {}) }));
  } catch (error) { report.errors.push(`Պատասխանի վերնագրերի կանոններ՝ ${error.message}`); }
} catch (error) { report.errors.push(error.message); }
writeFileSync("media-reuse-report.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  `\n## Մեդիայի արտաքին օգտագործում\n\n${report.from} — ${report.until}\n\n` +
  (report.analytics ? "Հասանելի են համախմբված, հնարավոր ընտրանքային տվյալներ։ Արտաքին հղումը ինքնին չարաշահման ապացույց չէ։" : "Չափումը հասանելի չէ․ սա չի նշանակում զրո արտաքին օգտագործում։") +
  "\n\nՄանրամասները՝ media-reuse-report արտեֆակտում։\n");
