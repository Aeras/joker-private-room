import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { biribaDiagnostics, type DebugEvent, type DebugMatch } from "@/services/biribaDiagnostics";
import { createDiagnosticZip } from "@/biriba/diagnosticsZip";

export const Route = createFileRoute("/biriba-debug")({ component: BiribaDiagnosticsPage });

function exportZip(match: DebugMatch, events: DebugEvent[], onlyPlayer?: string) {
  const subset = onlyPlayer ? events.filter(event => event.playerId === onlyPlayer) : events;
  const sessions = new Map<string, DebugEvent[]>();
  for (const event of subset) {
    const key = `${event.playerId}_${event.sessionKey}`;
    sessions.set(key, [...(sessions.get(key) ?? []), event]);
  }
  const warnings = subset.filter(event => ["warning", "error", "long_task", "frame_gap", "animation_timeout", "slow_action"].includes(event.kind));
  const summary = [
    "# BIRIBA Black Box — Codex diagnostic report",
    "",
    `Room: ${match.code ?? match.roomId}`,
    `First event: ${match.first_event}`,
    `Last event: ${match.last_event}`,
    `Events: ${subset.length}`,
    `Warnings: ${warnings.length}`,
    "",
    "## Instructions",
    "Analyze the chronological per-client timelines, correlate actions by revision and timestamps.",
    "Look for delays between action_start and action_end, animation_start and animation_end,",
    "frame gaps, errors and out-of-order revisions. Device events indicate platform/viewport.",
    "Do not assume that missing frame-level visuals are proof of a visual bug.",
    "",
    "## Warning and error events",
    ...warnings.slice(0, 300).map(e => `- ${e.at} | ${e.player} | ${e.kind} | ${JSON.stringify(e.details)}`),
    "",
    "All files contain diagnostics only; no credentials or opponents' hidden cards."
  ].join("\n");
  const files: Record<string, string> = {
    "REPORT.md": summary,
    "README.md": "BIRIBA Black Box. timeline.json: all captured events in order. player_*.json: separate device sessions. No video is included. The log reflects browser telemetry and publicly observed actions, not private card hands.\n",
    "timeline.json": JSON.stringify(subset, null, 2),
    "metadata.json": JSON.stringify({ room: match, playerFilter: onlyPlayer ?? null, exportedAt: new Date().toISOString() }, null, 2),
  };
  let n = 0;
  for (const logs of sessions.values()) {
    const player = logs[0]?.player?.replace(/[^a-zA-Z0-9]/g, "") || "player";
    files[`player_${++n}_${player}.json`] = JSON.stringify(logs, null, 2);
  }
  const objectUrl = URL.createObjectURL(createDiagnosticZip(files));
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `biriba-blackbox-${(match.code ?? "match").replace(/[^A-Z0-9]/gi, "")}${onlyPlayer ? "-player" : ""}.zip`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 20000);
}

function BiribaDiagnosticsPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [matches, setMatches] = useState<DebugMatch[]>([]);
  const [selected, setSelected] = useState("");
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [playerFilter, setPlayerFilter] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const status = await biribaDiagnostics({ data: { action: "status" } });
    if (!status.ok || !status.isAdmin) { setAuthorized(false); return; }
    setAuthorized(true);
    setEnabled(status.enabled ?? false);
    const list = await biribaDiagnostics({ data: { action: "list" } });
    if (list.ok) setMatches(list.matches ?? []);
    else setMessage("Δεν φορτώθηκε η λίστα διαγνωστικών.");
  }, []);
  useEffect(() => { void refresh().catch(() => setAuthorized(false)); }, [refresh]);

  const open = async (roomId: string) => {
    setBusy(true); setMessage(""); setSelected(roomId); setEvents([]); setPlayerFilter("");
    try {
      const response = await biribaDiagnostics({ data: { action: "export", roomId } });
      if (response.ok) setEvents(response.events ?? []);
      else setMessage("Δεν ήταν δυνατή η ανάκτηση του αρχείου.");
    } finally { setBusy(false); }
  };
  const match = matches.find(item => item.roomId === selected);
  const participants = useMemo(() => {
    const found = new Map<string, string>();
    for (const event of events) found.set(event.playerId, event.player);
    return Array.from(found, ([id, name]) => ({ id, name }));
  }, [events]);

  const toggle = async () => {
    setBusy(true);
    try {
      const result = await biribaDiagnostics({ data: { action: "toggle", payload: { enabled: !enabled } } });
      if (result.ok) { setEnabled(!enabled); setMessage(!enabled ? "Η καταγραφή ενεργοποιήθηκε." : "Η καταγραφή σταμάτησε. Τα υπάρχοντα αρχεία διατηρούνται."); }
    } finally { setBusy(false); }
  };
  const purge = async (roomId?: string) => {
    const scope = roomId ? "την επιλεγμένη παρτίδα" : "ΟΛΑ τα διαγνωστικά";
    if (!window.confirm(`Να διαγραφούν οριστικά τα αρχεία για ${scope}; Τα δεδομένα των παιχνιδιών δεν θα επηρεαστούν.`)) return;
    if (window.prompt('Πληκτρολόγησε DELETE για επιβεβαίωση') !== "DELETE") return;
    setBusy(true);
    try {
      const result = await biribaDiagnostics({ data: { action: "purge", roomId,
        payload: { confirm: "DELETE_BIRIBA_DIAGNOSTICS" } } });
      if (!result.ok) { setMessage("Η διαγραφή απέτυχε."); return; }
      setSelected(""); setEvents([]); await refresh(); setMessage("Τα επιλεγμένα διαγνωστικά διαγράφηκαν.");
    } finally { setBusy(false); }
  };
  if (authorized === null) return <main className="mx-auto max-w-4xl p-8 text-white">Έλεγχος πρόσβασης…</main>;
  if (!authorized) return <main className="mx-auto max-w-4xl p-8 text-white"><h1>Μη εξουσιοδοτημένη πρόσβαση</h1><Link to="/biriba">Επιστροφή</Link></main>;

  return (
    <main className="min-h-screen bg-[#10191a] p-4 text-white sm:p-7">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-2xl font-bold">BIRIBA Black Box</h1><p className="text-sm text-white/60">Ιδιωτικά διαγνωστικά — πρόσβαση μόνο Admin</p></div>
          <Link className="rounded-lg border border-white/40 px-4 py-2" to="/biriba">Επιστροφή στη Μπιρίμπα</Link>
        </header>
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-white/20 p-4">
          <span className="text-sm">Καταγραφή: <b>{enabled ? "Ενεργή" : "Ανενεργή"}</b></span>
          <button disabled={busy} onClick={() => void toggle()} className="rounded bg-emerald-700 px-4 py-2 text-sm">{enabled ? "Παύση καταγραφής" : "Ενεργοποίηση καταγραφής"}</button>
          <button disabled={busy} onClick={() => void refresh()} className="rounded border border-white/30 px-4 py-2 text-sm">Ανανέωση</button>
          <button disabled={busy} onClick={() => void purge()} className="ml-auto rounded border border-red-500/60 px-4 py-2 text-sm text-red-200">Εκκαθάριση όλων</button>
        </section>
        {message && <p role="status" className="rounded border border-white/20 p-2 text-sm">{message}</p>}
        <div className="grid gap-5 md:grid-cols-[minmax(280px,1fr)_minmax(330px,1.6fr)]">
          <section className="space-y-3">
            <h2 className="font-semibold">Παρτίδες ({matches.length})</h2>
            <input aria-label="Αναζήτηση παρτίδας" value={search} onChange={e => setSearch(e.target.value)} placeholder="Παίκτης ή δωμάτιο" className="w-full rounded-lg border border-white/20 bg-black/30 p-2"/>
            <div className="max-h-[65vh] space-y-2 overflow-auto">
              {matches.filter(item => (`${item.code} ${item.players.join(" ")}`).toLowerCase().includes(search.toLowerCase())).map(item => (
                <button key={item.roomId} type="button" disabled={busy} onClick={() => void open(item.roomId)}
                  className={`w-full rounded-xl border p-3 text-left text-sm ${selected === item.roomId ? "border-amber-400" : "border-white/20"}`}>
                  <div className="flex justify-between gap-2"><b>{item.code ?? "Παρτίδα"}</b><span>{item.eventCount} γεγονότα</span></div>
                  <div className="mt-1 text-white/70">{item.players.join(", ")}</div>
                  <div className="mt-1 text-xs text-white/60">{new Date(item.last_event).toLocaleString("el-GR")} · {item.playerCount} συσκευές · {item.warningCount} προειδοποιήσεις</div>
                </button>
              ))}
            </div>
          </section>
          <section className="space-y-3 rounded-xl border border-white/20 p-4">
            <h2 className="font-semibold">Λεπτομέρειες παρτίδας</h2>
            {!match && <p className="text-white/60">Επίλεξε μια παρτίδα από τη λίστα.</p>}
            {match && <>
              <p className="text-sm text-white/70">Δωμάτιο {match.code} · {events.length} καταγεγραμμένα συμβάντα</p>
              <label className="block text-sm">Παίκτης / συσκευή
                <select className="mt-1 w-full rounded-lg border border-white/20 bg-[#10191a] p-2" value={playerFilter} onChange={e => setPlayerFilter(e.target.value)}>
                  <option value="">Όλοι οι παίκτες</option>
                  {participants.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy || !events.length} onClick={() => exportZip(match, events, playerFilter || undefined)}
                  className="rounded bg-emerald-700 px-4 py-2 text-sm">Λήψη ZIP {playerFilter ? "παίκτη" : "παρτίδας"}</button>
                <button disabled={busy} onClick={() => void purge(match.roomId)} className="rounded border border-red-500/60 px-3 py-2 text-sm text-red-200">Διαγραφή παρτίδας</button>
              </div>
              <div className="max-h-[48vh] overflow-auto rounded-lg bg-black/30 p-3 text-xs">
                {events.filter(e => !playerFilter || e.playerId === playerFilter).slice(-120).map(e => (
                  <div key={e.id} className="border-b border-white/10 py-2">
                    <span className="text-white/50">{new Date(e.at).toLocaleTimeString("el-GR")}</span> <b>{e.player}</b> · {e.kind}
                    <pre className="whitespace-pre-wrap break-all text-white/60">{JSON.stringify(e.details.data ?? {})}</pre>
                  </div>
                ))}
              </div>
            </>}
          </section>
        </div>
        <p className="text-xs text-white/50">Αυτόματη διατήρηση έως 7 ημέρες. Οι διαγνωστικές καταγραφές δεν περιέχουν κρυφά φύλλα ή PIN. Η πλήρης αφαίρεση των πινάκων απαιτεί ξεχωριστή επιβεβαιωμένη διαδικασία.</p>
      </div>
    </main>
  );
}
