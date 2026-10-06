import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { JButton } from "@/components/joker/JButton";
import { ScreenShell, SectionLabel } from "@/components/joker/ScreenShell";
import { DIALOGUE_INTENSITIES, type DialogueIntensity } from "@/domain/dialoguePolicy";
import type { PublicPlayer } from "@/domain/players";
import type { RulesetId } from "@/domain/rulesets";
import { PUBLIC_RULESET_OPTIONS, type RulesetOption } from "@/domain/rulesetPresentation";
import { useCurrentActiveGame } from "@/hooks/useCurrentActiveGame";
import { t } from "@/i18n/el";
import { authFailureMessage } from "@/lib/auth-feedback";
import { roomFailureMessage } from "@/lib/room-feedback";
import { cn } from "@/lib/utils";
import { realIdentityService } from "@/services/realIdentity";
import { createProductionRoom, getAvailableRulesets } from "@/services/roomFunctions";

export const Route = createFileRoute("/create")({
  head: () => ({ meta: [{ title: "Δημιουργία παιχνιδιού — JOKER" }] }),
  component: CreateGame,
});

function Toggle({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className={cn("flex min-h-10 cursor-pointer items-center gap-3", disabled && "cursor-not-allowed opacity-40")}>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="flex h-5 w-5 items-center justify-center rounded-md border border-primary/50 bg-secondary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
        {checked && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
      </span>
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}

const intensityLabels: Record<DialogueIntensity, string> = {
  conservative: t.banterConservative,
  normal: t.banterNormal,
  chaos: t.banterChaos,
};

function CreateGame() {
  const navigate = useNavigate();
  const activeLookup = useCurrentActiveGame();
  const [host, setHost] = useState<PublicPlayer | null>(null);
  const [verifiedHost, setVerifiedHost] = useState<PublicPlayer | null>(null);
  const [pin, setPin] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [options, setOptions] = useState<RulesetOption[]>(PUBLIC_RULESET_OPTIONS);
  const [rulesetId, setRulesetId] = useState<RulesetId>("popular");
  const [botsTalk, setBotsTalk] = useState(false);
  const [allowProfanity, setAllowProfanity] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [intensity, setIntensity] = useState<DialogueIntensity>("normal");
  const [busy, setBusy] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const createActionId = useRef<string | null>(null);

  useEffect(() => {
    realIdentityService.listPlayers().then((list) => setHost(list.find((p) => p.role === "host") ?? null)).catch(() => setAuthError(t.authUnavailable));
  }, []);

  useEffect(() => {
    if (activeLookup.status !== "active") return;
    void navigate({
      to: "/table",
      search: { code: activeLookup.activeGame.roomCode, gameId: activeLookup.activeGame.gameId },
    });
  }, [activeLookup.activeGame, activeLookup.status, navigate]);

  const unlock = async () => {
    if (!host || authBusy) return;
    setAuthError(null);
    setAuthBusy(true);
    try {
      const result = await realIdentityService.verifyPin(host.id, pin);
      if (!result.ok) { setAuthError(authFailureMessage(result)); return; }
      if (result.player.role !== "host") { setAuthError(t.invalidPin); return; }

      const current = await activeLookup.refresh();
      if (current.ok && current.activeGame) {
        void navigate({ to: "/table", search: { code: current.activeGame.roomCode, gameId: current.activeGame.gameId } });
        return;
      }
      if (!current.ok && current.code === "SERVICE_UNAVAILABLE") {
        setAuthError("Δεν ήταν δυνατός ο έλεγχος ενεργού παιχνιδιού. Δοκίμασε ξανά.");
        return;
      }

      const available = await getAvailableRulesets();
      if (!available.ok) { setAuthError(t.authUnavailable); return; }
      setOptions(available.options);
      setVerifiedHost(result.player);
      setPin("");
    } finally { setAuthBusy(false); }
  };

  const createRoom = async () => {
    if (!verifiedHost || busy) return;
    setBusy(true);
    setRoomError(null);
    createActionId.current ??= crypto.randomUUID();
    try {
      const result = await createProductionRoom({
        data: {
          actionId: createActionId.current,
          rulesetId,
          botsTalk,
          allowProfanity: botsTalk && allowProfanity,
          aiEnabled: botsTalk && aiEnabled,
          intensity,
        },
      });
      if (!result.ok) {
        if (result.code === "ACTIVE_GAME_EXISTS" && result.activeGame?.roomCode) {
          createActionId.current = null;
          navigate({ to: "/lobby", search: { code: result.activeGame.roomCode } });
          return;
        }
        if (result.code !== "SERVICE_UNAVAILABLE") createActionId.current = null;
        setRoomError(roomFailureMessage(result));
        return;
      }
      createActionId.current = null;
      navigate({ to: "/lobby", search: { code: result.room.code } });
    } finally { setBusy(false); }
  };

  if (activeLookup.status === "loading" || activeLookup.status === "active") {
    return <div className="surface-room min-h-dvh" />;
  }

  if (activeLookup.status === "error") {
    return (
      <ScreenShell title={t.createGame} variant="pregame" contentClassName="pregame-centered-content">
        <div className="panel max-w-xl space-y-3 p-4">
          <p className="text-sm text-negative">Δεν ήταν δυνατός ο έλεγχος ενεργού παιχνιδιού.</p>
          <JButton className="pregame-primary-button w-full" onClick={() => void activeLookup.refresh()}>Δοκιμή ξανά</JButton>
        </div>
      </ScreenShell>
    );
  }

  if (!verifiedHost) {
    return (
      <ScreenShell title={t.createGame} variant="pregame" contentClassName="pregame-centered-content">
        <div className="pregame-auth-card">
          <div>
            <SectionLabel>Host</SectionLabel>
            <div className="panel flex h-24 items-center justify-center px-6 text-center font-display text-2xl">{host?.displayName ?? "Φόρτωση…"}</div>
          </div>
          <div>
            <SectionLabel>{t.pin}</SectionLabel>
            <input value={pin} onChange={(e) => setPin(e.target.value.replace(/D/g, "").slice(0, 4))} inputMode="numeric" type="password" autoComplete="off" placeholder="••••" className="h-16 w-full rounded-xl border border-input bg-secondary px-4 text-center text-3xl tracking-[0.5em] text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="flex items-end">
            <JButton size="lg" className="pregame-primary-button h-16 w-full" onClick={unlock} disabled={!host || pin.length !== 4 || authBusy}>Συνέχεια</JButton>
          </div>
          {authError && <p className="col-span-full text-center text-sm text-negative">{authError}</p>}
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={t.createGame}
      variant="pregame"
      contentClassName="pregame-form-content"
      footer={
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          {roomError && <p className="flex-1 text-sm text-negative">{roomError}</p>}
          <JButton size="lg" className="pregame-primary-button ml-auto min-w-64" onClick={createRoom} disabled={busy}>{t.createRoom}</JButton>
        </div>
      }
    >
      <div className="pregame-create-grid">
        <section>
          <SectionLabel>{t.chooseGame}</SectionLabel>
          <div role="radiogroup" className="grid gap-2">
            {options.map((r) => {
              const active = r.id === rulesetId;
              return (
                <button key={r.id} role="radio" aria-checked={active} onClick={() => setRulesetId(r.id)} className={cn("panel flex min-h-20 w-full items-center gap-4 p-3 text-left transition-all active:scale-[0.99]", active && "ring-gold")}>
                  <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", active ? "border-primary" : "border-muted-foreground")}>{active && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}</span>
                  <span><span className="block font-display text-lg text-foreground">{r.name}</span><span className="block text-xs text-muted-foreground">{r.description}</span></span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <SectionLabel>{t.botBehavior}</SectionLabel>
          <div className="panel h-full px-4 py-2">
            <Toggle checked={botsTalk} onChange={(v) => {
              setBotsTalk(v);
              if (!v) {
                setAllowProfanity(false);
                setAiEnabled(false);
              }
            }} label={t.botsTalk} />
            {botsTalk ? (
              <div className="space-y-1 border-t border-border pt-1">
                <Toggle checked={allowProfanity} onChange={setAllowProfanity} label={t.allowProfanity} />
                <Toggle checked={aiEnabled} onChange={setAiEnabled} label={t.useAiBanter} />
                <div className="pt-1">
                  <p className="mb-2 text-xs text-muted-foreground">{t.banterIntensity}</p>
                  <div role="radiogroup" className="grid grid-cols-3 gap-2">
                    {DIALOGUE_INTENSITIES.map((value) => (
                      <button key={value} type="button" role="radio" aria-checked={intensity === value} onClick={() => setIntensity(value)} className={cn("min-h-10 rounded-lg border px-2 text-xs transition-all active:scale-[0.98]", intensity === value ? "border-primary bg-gold-soft text-primary" : "border-border text-muted-foreground")}>
                        {intensityLabels[value]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t.botsNote}</p>
            )}
          </div>
        </section>
      </div>
    </ScreenShell>
  );
}
