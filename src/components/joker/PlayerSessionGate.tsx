import { useEffect, useState } from "react";
import type { PublicPlayer } from "@/domain/players";
import { getCurrentPlayer, logoutPlayer } from "@/services/authFunctions";
import { realIdentityService } from "@/services/realIdentity";
import { authFailureMessage } from "@/lib/auth-feedback";
import { JButton } from "./JButton";
import { cardImageFormat, isCardImageAdmin, saveCardImageFormat, type CardImageFormat } from "@/assets/cardFormat";

/** Login once using the existing httpOnly server session; no PIN is persisted client-side. */
export function PlayerSessionGate({ children, onAuthenticated, allowLogout = true }: { children: (player: PublicPlayer) => React.ReactNode; onAuthenticated?: () => void; allowLogout?: boolean }) {
  const [player, setPlayer] = useState<PublicPlayer | null>(null);
  const [choices, setChoices] = useState<PublicPlayer[]>([]);
  const [selected, setSelected] = useState("");
  const [pin, setPin] = useState("");
  const [format, setFormat] = useState<CardImageFormat>(() => cardImageFormat());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        // Existing sessions must not depend on loading the directory of players.
        const current = await getCurrentPlayer();
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
      saveCardImageFormat(isCardImageAdmin(result.player) ? format : "png");
      setPlayer(result.player); setPin(""); onAuthenticated?.();
      // Ensure preload and Canvas texture caches use the same format consistently.
      window.location.reload();
    } catch { setError("Αδυναμία σύνδεσης. Δοκίμασε ξανά."); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    setBusy(true);
    try { await logoutPlayer(); saveCardImageFormat("png"); setFormat("png"); setPlayer(null); }
    catch { setError("Αδυναμία αποσύνδεσης."); }
    finally { setBusy(false); }
  }
  if (loading) return <p role="status" className="text-center">Έλεγχος σύνδεσης…</p>;
  if (player) return <div>
    <div className="mb-3 flex justify-center items-center gap-3 text-sm">
      <span>Συνδεδεμένος: <strong>{player.displayName}</strong></span>
      {allowLogout && <button className="underline text-muted-foreground" type="button" disabled={busy} onClick={() => void disconnect()}>Αποσύνδεση</button>}
    </div>
    {isCardImageAdmin(player) && (
      <label className="mb-3 flex items-center justify-center gap-2 text-sm">Τράπουλα
        <select aria-label="Μορφή εικόνων τράπουλας" className="rounded-lg bg-secondary px-3 py-2" value={format} onChange={e => {
          const next = e.target.value as CardImageFormat;
          saveCardImageFormat(next);
          setFormat(next);
          window.location.reload();
        }}>
          <option value="png">PNG</option>
          <option value="webp">WebP</option>
        </select>
      </label>
    )}
    {children(player)}
  </div>;
  return <form onSubmit={connect} className="panel mx-auto max-w-sm space-y-3 p-4">
    <h2 className="text-lg font-semibold">Σύνδεση παίκτη</h2>
    <label className="block text-sm">Παίκτης
      <select aria-label="Παίκτης" className="mt-1 w-full rounded-lg bg-secondary p-3" value={selected} onChange={e => setSelected(e.target.value)}>
        {choices.map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}
      </select>
    </label>
    <label className="block text-sm">Προσωπικό PIN
      <input type="password" inputMode="numeric" autoComplete="off" aria-label="Προσωπικό PIN" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} className="mt-1 w-full rounded-lg bg-secondary p-3" />
    </label>
    {choices.some(p => p.id === selected && isCardImageAdmin(p)) && (
      <label className="block text-sm">Μορφή εικόνων τράπουλας (μόνο για δοκιμή)
        <select aria-label="Μορφή εικόνων τράπουλας" className="mt-1 w-full rounded-lg bg-secondary p-3" value={format} onChange={e => setFormat(e.target.value as CardImageFormat)}>
          <option value="png">PNG (αρχική)</option>
          <option value="webp">WebP (δοκιμαστική)</option>
        </select>
      </label>
    )}
    {error && <p role="alert" className="text-negative text-sm">{error}</p>}
    <JButton type="submit" disabled={busy || pin.length !== 4 || !selected} className="w-full">Σύνδεση</JButton>
  </form>;
}
