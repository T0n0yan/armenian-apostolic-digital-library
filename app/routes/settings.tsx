import type { Route } from "./+types/settings";
import { PageHeader, PageShell } from "../components/page-layout";
import { SettingsPanel } from "../components/settings-panel";
import { SiteNav } from "../components/site-nav";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Կարգավորումներ — Հոգևոր ժառանգություն" }];
}

/** The settings as a page (the menu shows the same panel in place). */
export default function Settings() {
  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/" backLabel="Գրադարան" title="Կարգավորումներ" description="Հարմարեցրեք գրադարանը Ձեզ համար։ Կարգավորումները պահվում են այս սարքում։" />
      <div className="mt-4"><SettingsPanel /></div>
    </PageShell>
  );
}
