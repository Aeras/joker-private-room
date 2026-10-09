import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { BotLabPanel, type LabApi, type LabListView } from "@/components/joker/BotLabPanel";
import { botLabRequest } from "@/services/botLabFunctions";

const api: LabApi = async (action, payload) => {
  const response = await botLabRequest({ data: { action, ...(payload ? { payload } : {}) } });
  if (!response.ok) throw Error(response.code);
  return JSON.parse(response.json);
};
export const Route = createFileRoute("/bot-lab")({
  ssr: false,
  beforeLoad: async () => {
    const response = await botLabRequest({ data: { action: "access" } });
    if (!response.ok || JSON.parse(response.json).allowed !== true) throw redirect({ to: "/" });
  },
  loader: async () => (await api("list")) as LabListView,
  component: BotLabPage,
  errorComponent: () => (
    <main className="p-6">
      <p>Το Bot Lab δεν είναι διαθέσιμο.</p>
      <Link to="/">Επιστροφή στην αρχική</Link>
    </main>
  ),
});
function BotLabPage() {
  const initial = Route.useLoaderData();
  return (
    <div className="surface-room min-h-dvh text-foreground">
      <main className="mx-auto max-w-6xl space-y-5 px-[max(1rem,env(safe-area-inset-left))] py-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-display text-3xl text-primary">JOKER Bot Lab</h1>
          <Link to="/">← Αρχική</Link>
        </header>
        <BotLabPanel initial={initial} api={api} />
      </main>
    </div>
  );
}
