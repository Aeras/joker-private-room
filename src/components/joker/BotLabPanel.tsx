import { useEffect, useRef, useState } from "react";
import { JButton } from "./JButton";
import { latencyInterval } from "@/lib/botLabStatistics";

const tiers = ["strong-basic-v1", "memory-inference-v1", "probability-simulation-v1"] as const;
type JobConfig = {
  games: number;
  seed: number;
  ruleset: string;
  compare: boolean;
  lineup: string[] | null;
};
export interface LabJobView {
  id: string;
  status: string;
  config: JobConfig;
  total_games: number;
  completed_games: number;
  started_games: number;
  created_at: string;
  updated_at: string;
  errors: number;
  last_error: string | null;
  currentDeal: number | null;
  currentStep: number | null;
}
export interface LabListView {
  jobs: LabJobView[];
  workerEnabled: boolean;
}
type StatsGroup = {
  tier: string;
  version: string;
  participations: number;
  outright: number;
  tied: number;
  win_share: number;
  mean_score: number;
  median_score: number;
  penalties: number;
  penalty_points: number;
  premia: number;
  bonus: number;
  removed: number;
  joker_won: number;
  joker_lost: number;
  jokerModes: Record<string, number>;
  exactByDealSize: Record<string, { exact: number; under: number; over: number; deals: number }>;
  latencyHistogram: number[];
};
interface Stats {
  groups: StatsGroup[];
  startedGames: number;
  completedGames: number;
  errors: number;
  rejectedActions: number;
  latencyBounds: number[];
  comparison: null | {
    independentSeeds: number;
    matchedGames: number;
    meanScoreDelta: number | null;
    meanWinShareDelta: number | null;
    approximate95ScoreCI: number[] | null;
    approximate95WinShareCI: number[] | null;
  };
}
export type LabApi = (
  action: "list" | "create" | "cancel" | "stats" | "results",
  payload?: Record<string, unknown>,
) => Promise<unknown>;
const number = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("el-GR", { maximumFractionDigits: 2 });
const tierName = (id: string) => `Tier ${tiers.indexOf(id as (typeof tiers)[number]) + 1}`;
const active = (job: LabJobView) => ["queued", "running"].includes(job.status);
export function BotLabPanel({ initial, api }: { initial: LabListView; api: LabApi }) {
  const [list, setList] = useState(initial),
    [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [games, setGames] = useState(10),
    [seed, setSeed] = useState("810000");
  const [ruleset, setRuleset] = useState("popular"),
    [randomMix, setRandomMix] = useState(true),
    [compare, setCompare] = useState(false);
  const [lineup, setLineup] = useState<string[]>([...tiers, tiers[0]]);
  const [selected, setSelected] = useState<string | null>(initial.jobs[0]?.id ?? null);
  const [stats, setStats] = useState<Stats | null>(null),
    [inspection, setInspection] = useState<unknown[]>([]);
  const [offset, setOffset] = useState(0);
  const generation = useRef(0),
    detailGeneration = useRef(0),
    polling = useRef(false),
    mounted = useRef(true);
  const mutation = useRef(false);
  const job = list.jobs.find((j) => j.id === selected);
  const hasActive = list.jobs.some(active);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // These counters intentionally invalidate in-flight responses, not DOM refs.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      detailGeneration.current++;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (!cancelled && !document.hidden && !polling.current && !mutation.current) {
        polling.current = true;
        const ticket = generation.current;
        try {
          const value = (await api("list")) as LabListView;
          if (!cancelled && mounted.current && ticket === generation.current) {
            setList(value);
            setError(null);
          }
        } catch (e) {
          if (!cancelled && ticket === generation.current)
            setError(e instanceof Error ? e.message : "SERVICE_UNAVAILABLE");
        } finally {
          polling.current = false;
        }
      }
      if (!cancelled && hasActive) timer = setTimeout(() => void refresh(), 3000);
    };
    const resume = () => {
      if (!document.hidden) {
        if (timer) clearTimeout(timer);
        void refresh();
      }
    };
    if (hasActive) timer = setTimeout(() => void refresh(), 3000);
    document.addEventListener("visibilitychange", resume);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [api, hasActive]);
  useEffect(() => {
    detailGeneration.current++;
    setStats(null);
    setInspection([]);
    setOffset(0);
  }, [selected]);
  const mutate = async (action: "create" | "cancel") => {
    if (mutation.current) return;
    mutation.current = true;
    generation.current++;
    setBusy(true);
    setError(null);
    try {
      const value = (await api(
        action,
        action === "create"
          ? {
              requestId: crypto.randomUUID(),
              config: {
                games,
                seed: Number(seed),
                ruleset,
                compare,
                lineup: randomMix ? null : lineup,
              },
            }
          : { jobId: selected },
      )) as LabJobView;
      if (mounted.current) {
        setList((old) => ({
          ...old,
          jobs: [value, ...old.jobs.filter((j) => j.id !== value.id)].slice(0, 30),
        }));
        setSelected(value.id);
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "SERVICE_UNAVAILABLE");
    } finally {
      mutation.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const refreshList = async () => {
    if (polling.current || mutation.current) return;
    polling.current = true;
    const ticket = ++generation.current;
    try {
      const value = (await api("list")) as LabListView;
      if (mounted.current && ticket === generation.current) {
        setList(value);
        setError(null);
      }
    } catch (e) {
      if (mounted.current && ticket === generation.current)
        setError(e instanceof Error ? e.message : "SERVICE_UNAVAILABLE");
    } finally {
      polling.current = false;
    }
  };
  const details = async (nextOffset = offset) => {
    if (!selected) return;
    const ticket = ++detailGeneration.current;
    setBusy(true);
    try {
      const [s, r] = await Promise.all([
        api("stats", { jobId: selected }),
        api("results", { jobId: selected, offset: nextOffset }),
      ]);
      if (mounted.current && ticket === detailGeneration.current) {
        setStats(s as Stats);
        setInspection((r as { results: unknown[] }).results);
        setOffset(nextOffset);
      }
    } catch (e) {
      if (mounted.current && ticket === detailGeneration.current)
        setError(e instanceof Error ? e.message : "SERVICE_UNAVAILABLE");
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const input = "min-h-11 w-full rounded-lg border border-border bg-secondary px-3 text-foreground";
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Ιδιωτικές προσομοιώσεις με τον κανονικό engine. Μπορείς να κλείσεις τον browser: η εργασία
        συνεχίζεται στη βάση.
      </p>
      {!list.workerEnabled && (
        <p role="status" className="rounded-lg border border-primary/40 p-3">
          Ο worker δεν έχει ενεργοποιηθεί. Χρειάζεται η ολοκλήρωση της εγκατάστασης backend πριν
          ξεκινήσει εργασία.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-negative p-3">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void mutate("create");
        }}
        className="panel space-y-4 p-4"
      >
        <h2 className="font-display text-xl text-primary">Νέα εργασία</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            Παιχνίδια
            <select
              className={input}
              value={games}
              onChange={(e) => setGames(Number(e.target.value))}
            >
              {[10, 100, 1000, 5000].map((n) => (
                <option key={n} value={n}>
                  {n.toLocaleString("el-GR")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Παραλλαγή
            <select className={input} value={ruleset} onChange={(e) => setRuleset(e.target.value)}>
              {[
                ["popular", "Popular — Our Rules"],
                ["classic", "Κλασικό Τζόκερ"],
                ["minus", "Minus"],
                ["panagiotis", "Panagiotis Special"],
              ].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Seed
            <input
              className={input}
              type="number"
              required
              min={0}
              max={4294966045}
              step={1}
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
            />
          </label>
        </div>
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={randomMix}
            onChange={(e) => setRandomMix(e.target.checked)}
          />
          Τυχαίο μείγμα Tier 1/2/3
        </label>
        {!randomMix && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {lineup.map((value, i) => (
              <label key={i}>
                Θέση {i + 1}
                <select
                  className={input}
                  value={value}
                  onChange={(e) =>
                    setLineup((old) => old.map((v, n) => (n === i ? e.target.value : v)))
                  }
                >
                  {tiers.map((t) => (
                    <option key={t} value={t}>
                      {tierName(t)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
          Σύγκριση competitive-v2 με baseline
        </label>
        {compare && (
          <p className="text-sm text-muted-foreground">
            Εκτελούνται {number(games * 2)} πραγματικά παιχνίδια. Αναβαθμίζεται μόνο η θέση 1 της
            σύνθεσης· οι τρεις αντίπαλοι μένουν baseline. Ίδια seeds/μοίρασμα, εναλλαγή θέσεων και
            dealer. Τα 10 δείγματα αφήνουν μισή τελευταία τετράδα· προτίμησε 100 ή περισσότερα.
          </p>
        )}
        <JButton type="submit" disabled={busy || hasActive || !list.workerEnabled}>
          Έναρξη benchmark
        </JButton>
      </form>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl text-primary">Ιστορικό εργασιών</h2>
          <JButton variant="secondary" disabled={busy} onClick={() => void refreshList()}>
            Ανανέωση
          </JButton>
        </div>
        {!list.jobs.length && <p>Δεν υπάρχουν εργασίες.</p>}
        <div className="grid gap-2 md:grid-cols-2">
          {list.jobs.map((j) => (
            <button
              key={j.id}
              onClick={() => setSelected(j.id)}
              className={`panel min-w-0 p-3 text-left ${j.id === selected ? "ring-2 ring-primary" : ""}`}
            >
              <strong>
                {j.config.ruleset} · {j.status}
              </strong>
              <p>
                {j.completed_games} / {j.total_games} ολοκληρωμένα · {j.started_games} ξεκίνησαν
              </p>
              <p className="text-xs text-muted-foreground">
                Seed {j.config.seed} · {new Date(j.created_at).toLocaleString("el-GR")}
              </p>
            </button>
          ))}
        </div>
      </section>
      {job && (
        <section className="panel space-y-3 p-4">
          <h2 className="font-display text-xl text-primary">Επιλεγμένη εργασία</h2>
          <p className="break-all text-xs text-muted-foreground">{job.id}</p>
          <progress
            aria-label="Αποθηκευμένη πρόοδος"
            className="w-full"
            max={job.total_games}
            value={job.completed_games}
          />
          <p>
            {job.completed_games} / {job.total_games} · {job.status}
            {job.currentDeal != null
              ? ` · Μοιρασιά ${job.currentDeal}/24 · βήμα ${job.currentStep}`
              : ""}
          </p>
          {job.last_error && <p role="alert">{job.last_error}</p>}
          <div className="flex flex-wrap gap-2">
            {active(job) && (
              <JButton variant="secondary" disabled={busy} onClick={() => void mutate("cancel")}>
                Ακύρωση εργασίας
              </JButton>
            )}
            <JButton disabled={busy || job.completed_games === 0} onClick={() => void details()}>
              Στατιστικά και αποφάσεις
            </JButton>
          </div>
        </section>
      )}
      {stats && (
        <section className="space-y-3">
          <h2 className="font-display text-xl text-primary">
            Αποτελέσματα · {stats.completedGames} ολοκληρωμένα / {stats.startedGames} ξεκίνησαν
          </h2>
          <p>
            Σφάλματα: {stats.errors} · Απορριφθείσες κινήσεις: {stats.rejectedActions}
          </p>
          <p className="text-xs text-muted-foreground">
            Συμμετοχές ανά tier/version· οι ισόβαθμες νίκες μοιράζουν το win share. Τα p50/p95/p99
            είναι διαστήματα histogram σε ms.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {[
                    "Tier / version",
                    "Συμμετοχές",
                    "Νίκες / ισοπαλίες",
                    "Win share",
                    "Μέσο / διάμεσο σκορ",
                    "p50 / p95 / p99",
                  ].map((h) => (
                    <th key={h} className="p-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.groups.map((g) => (
                  <tr key={g.tier + g.version} className="border-t border-border">
                    <td className="p-2">
                      {tierName(g.tier)}
                      <br />
                      {g.version}
                    </td>
                    <td className="p-2">{g.participations}</td>
                    <td className="p-2">
                      {g.outright} / {g.tied}
                    </td>
                    <td className="p-2">{number((100 * g.win_share) / g.participations)}%</td>
                    <td className="p-2">
                      {number(g.mean_score)} / {number(g.median_score)}
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      {[0.5, 0.95, 0.99]
                        .map((q) => latencyInterval(g.latencyHistogram, stats.latencyBounds, q))
                        .join(" / ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {stats.groups.map((g) => (
            <details key={g.tier + g.version} className="panel p-3">
              <summary className="cursor-pointer">
                {tierName(g.tier)} · {g.version}: δηλώσεις, Joker και πριμιές
              </summary>
              <p className="my-3">
                Ποινές: {g.penalties} / {number(g.penalty_points)} πόντοι · Πριμιές: {g.premia} / +
                {number(g.bonus)} · Αφαιρέσεις: {number(g.removed)}
                <br />
                Joker: {g.joker_won} κερδισμένα / {g.joker_lost} χαμένα ·{" "}
                {Object.entries(g.jokerModes)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ")}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      {["Φύλλα", "Ακριβής", "Κάτω", "Πάνω", "Ακριβής %"].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(g.exactByDealSize).map(([n, row]) => (
                      <tr key={n}>
                        <td>{n}</td>
                        <td>{row.exact}</td>
                        <td>{row.under}</td>
                        <td>{row.over}</td>
                        <td>{number((100 * row.exact) / row.deals)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
          {stats.comparison && (
            <div className="panel p-4">
              <h3>Matched σύγκριση — θέση 1 της σύνθεσης</h3>
              <p>
                {stats.comparison.matchedGames} ζεύγη / {stats.comparison.independentSeeds}{" "}
                ανεξάρτητα seeds
                <br />
                Διαφορά σκορ: {number(stats.comparison.meanScoreDelta)} · Διαφορά win share:{" "}
                {number(
                  stats.comparison.meanWinShareDelta == null
                    ? null
                    : stats.comparison.meanWinShareDelta * 100,
                )}{" "}
                ποσοστιαίες μονάδες
              </p>
              <p>
                {stats.comparison.approximate95ScoreCI
                  ? `95% CI σκορ: ${stats.comparison.approximate95ScoreCI.map(number).join(" έως ")} · win share: ${stats.comparison.approximate95WinShareCI?.map((v) => number(v * 100)).join(" έως ")} ποσοστιαίες μονάδες`
                  : "Δεν εμφανίζεται CI πριν από 30 ανεξάρτητα seeds."}
              </p>
            </div>
          )}
          <details className="panel p-3">
            <summary className="cursor-pointer">
              Έλεγχος αποφάσεων προσομοίωσης ({offset}–{offset + inspection.length})
            </summary>
            <p className="my-2 text-sm">
              Περιορισμένο δείγμα αποφάσεων ανά παιχνίδι, όχι πλήρες replay. Δεν περιλαμβάνει
              πραγματικά παιχνίδια ή κρυφά χέρια.
            </p>
            <pre className="max-h-80 overflow-auto rounded-lg bg-black/30 p-3 text-xs">
              {JSON.stringify(inspection, null, 2)}
            </pre>
            <div className="mt-3 flex gap-2">
              <JButton
                disabled={busy || offset === 0}
                onClick={() => void details(Math.max(0, offset - 20))}
              >
                Προηγούμενα
              </JButton>
              <JButton
                disabled={busy || offset + 20 >= stats.completedGames}
                onClick={() => void details(offset + 20)}
              >
                Επόμενα
              </JButton>
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
