import { createFileRoute } from "@tanstack/react-router";
import { ScreenShell, SectionLabel } from "@/components/joker/ScreenShell";
import { t } from "@/i18n/el";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Ρυθμίσεις — JOKER" },
      { name: "description", content: "Ρυθμίσεις του ιδιωτικού παιχνιδιού JOKER." },
      { property: "og:title", content: "Ρυθμίσεις — JOKER" },
      { property: "og:description", content: "Ρυθμίσεις του ιδιωτικού παιχνιδιού JOKER." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <ScreenShell title={t.settings}>
      <SectionLabel>{t.demoMode}</SectionLabel>
      <div className="panel p-5 text-sm text-muted-foreground">
        Η εφαρμογή τρέχει τοπικά με δοκιμαστικούς παίκτες. Οι ρυθμίσεις θα προστεθούν σύντομα.
      </div>
    </ScreenShell>
  );
}
