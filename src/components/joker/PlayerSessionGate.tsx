import { useEffect, useState } from "react";
import type { PublicPlayer } from "@/domain/players";
import { getCurrentPlayer, logoutPlayer } from "@/services/authFunctions";
import { realIdentityService } from "@/services/realIdentity";
import { authFailureMessage } from "@/lib/auth-feedback";
import { JButton } from "./JButton";

/** Login once using the existing httpOnly server session; no PIN is persisted client-side. */
export function PlayerSessionGate({
  children,
  onAuthenticated,
  allowLogout = true,
  hideConnectedBanner = false,
  className,
}: {
  children: (player: PublicPlayer, logout: () => Promise<void>) => React.ReactNode;
  onAuthenticated?: () => void;
  allowLogout?: boolean;
  hideConnectedBanner?: boolean;
  className?: string;
}) {
  const [player, setPlayer] = useState<PublicPlayer | null>(null);
  const [choices, setChoices] = useState<PublicPlayer[]>([]);
  const [selected, setSelected] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        let current: PublicPlayer | null = null;
        try {
          // Existing sessions must not depend on loading the directory of players.
          current = await getCurrentPlayer();
        } catch {
          current = null;
        }
        if (!mounted) return;
        if (current) {
          setPlayer(current);
          return;
        }
        // Only a player without a valid session needs the name selector.
        const available = await realIdentityService.listPlayers();
        if (!mounted) return;
        setChoices(available);
        setSelected(available[0]?.id ?? "");
      } catch {
        if (mounted) setError("Η σύνδεση δεν είναι διαθέσιμη. Δοκίμασε ξανά.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);
  async function connect(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !selected || !/^\d{4}$/.test(pin)) return;
    setBusy(true); setError("");
    try {
      const result = await realIdentityService.verifyPin(selected, pin);
      if (!result.ok) { setError(authFailureMessage(result)); return; }
      setPlayer(result.player); setPin(""); onAuthenticated?.();
    } catch { setError("Αδυναμία σύνδεσης. Δοκίμασε ξανά."); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    setBusy(true);
    try { await logoutPlayer(); setPlayer(null); }
    catch { setError("Αδυναμία αποσύνδεσης."); }
    finally { setBusy(false); }
  }
  if (loading) return <p role="status" className="text-center">Έλεγχος σύνδεσης…</p>;
  if (player) return <div className={className ?? (hideConnectedBanner ? "contents" : undefined)}>
    {!hideConnectedBanner && <div className="mb-3 flex justify-center items-center gap-3 text-sm">
      <span>Συνδεδεμένος: <strong>{player.displayName}</strong></span>
      {allowLogout && <button className="underline text-muted-foreground" type="button" disabled={busy} onClick={() => void disconnect()}>Αποσύνδεση</button>}
    </div>}
    {children(player, disconnect)}
  </div>;
  return <form onSubmit={connect} className="panel mx-auto max-w-sm space-y-3 p-4">
    <h2 className="text-lg font-semibold text-foreground">Σύνδεση παίκτη</h2>
    <label className="block text-sm text-foreground">Παίκτης
      <select
        aria-label="Παίκτης"
        className="mt-1 w-full rounded-lg bg-secondary p-3 text-foreground font-medium border border-border focus:outline-none focus:ring-2 focus:ring-primary"
        value={selected}
        onChange={e => setSelected(e.target.value)}
      >
        {choices.length === 0 && <option value="" disabled className="bg-secondary text-foreground">Επιλέξτε παίκτη…</option>}
        {choices.map(p => (
          <option key={p.id} value={p.id} className="bg-secondary text-foreground">
            {p.displayName}
          </option>
        ))}
      </select>
    </label>
    <label className="block text-sm text-foreground">Προσωπικό PIN
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        aria-label="Προσωπικό PIN"
        value={pin}
        onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
        className="mt-1 w-full rounded-lg bg-secondary p-3 text-foreground font-medium border border-border focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </label>
    {error && <p role="alert" className="text-negative text-sm">{error}</p>}
    <JButton type="submit" disabled={busy || pin.length !== 4 || !selected} className="w-full">Σύνδεση</JButton>
  </form>;
}
