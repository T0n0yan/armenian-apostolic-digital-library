export type GitHubEnv = { GITHUB_SYNC_TOKEN?: string; GITHUB_SYNC_REPO?: string };
export type DeployInfo = { branch: string; status: string; conclusion: string | null; at: string; url: string; title: string };
export type GitHubUsage = {
  configured: boolean;
  error?: string;
  minutes: number; // մոտավոր՝ այս ամիս
  limit: number;
  runs: number;
  byWorkflow: Array<{ name: string; runs: number; minutes: number }>;
  deploys: DeployInfo[];
  monthStart: string;
};

/** Փակ ռեպոյի անվճար փաթեթը՝ 2000 րոպե ամսական։ */
export const ACTIONS_LIMIT = 2000;

type Run = { name: string; head_branch: string; status: string; conclusion: string | null; run_started_at: string; updated_at: string; html_url: string; display_title: string };

/** Ամեն գործարկման րոպեները՝ կլորացված վերև (GitHub-ն էլ է այդպես հաշվում)։ */
export function runMinutes(run: Pick<Run, "run_started_at" | "updated_at" | "status">) {
  if (run.status !== "completed") return 0;
  const ms = Date.parse(run.updated_at) - Date.parse(run.run_started_at);
  return Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 60_000) : 1;
}

/** GitHub Actions-ի այս ամսվա րոպեները և վերջին deploy-ները՝ «Կայքի վիճակը» էջի համար։ */
export async function readGitHubUsage(env: GitHubEnv, now = new Date()): Promise<GitHubUsage> {
  const monthStart = `${now.toISOString().slice(0, 7)}-01`;
  const empty: GitHubUsage = { configured: false, minutes: 0, limit: ACTIONS_LIMIT, runs: 0, byWorkflow: [], deploys: [], monthStart };
  const token = env.GITHUB_SYNC_TOKEN?.trim();
  if (!token) return empty;
  const repository = env.GITHUB_SYNC_REPO?.trim() || "T0n0yan/armenian-apostolic-digital-library";
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "armenian-apostolic-digital-library", "x-github-api-version": "2022-11-28" };
  const runs: Run[] = [];
  try {
    // Առավելագույնը 10 էջ (1000 գործարկում), որ Worker-ի սահմանը չանցնի։
    for (let page = 1; page <= 10; page += 1) {
      const response = await fetch(`https://api.github.com/repos/${repository}/actions/runs?created=>=${monthStart}&per_page=100&page=${page}`, { headers });
      if (!response.ok) return { ...empty, configured: true, error: `GitHub-ը պատասխանեց ${response.status}. բանալին պետք է «Actions: read» իրավունք ունենա։` };
      const body = await response.json() as { total_count: number; workflow_runs: Run[] };
      runs.push(...body.workflow_runs);
      if (runs.length >= body.total_count || body.workflow_runs.length < 100) break;
    }
  } catch {
    return { ...empty, configured: true, error: "GitHub-ին միանալ չհաջողվեց։" };
  }
  const groups = new Map<string, { runs: number; minutes: number }>();
  let minutes = 0;
  for (const run of runs) {
    const value = runMinutes(run);
    minutes += value;
    const group = groups.get(run.name) ?? { runs: 0, minutes: 0 };
    group.runs += 1; group.minutes += value;
    groups.set(run.name, group);
  }
  const deploys = ["main", "staging"].map((branch) => runs.find((run) => run.name === "Deploy" && run.head_branch === branch))
    .filter((run): run is Run => Boolean(run))
    .map((run) => ({ branch: run.head_branch, status: run.status, conclusion: run.conclusion, at: run.run_started_at, url: run.html_url, title: run.display_title }));
  return {
    configured: true, minutes, limit: ACTIONS_LIMIT, runs: runs.length, deploys, monthStart,
    byWorkflow: [...groups].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.minutes - a.minutes),
  };
}
