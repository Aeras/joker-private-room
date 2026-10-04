import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { JButton } from "@/components/joker/JButton";
import { ScreenShell, SectionLabel } from "@/components/joker/ScreenShell";
import { DIALOGUE_INTENSITIES, type DialogueIntensity } from "@/domain/dialoguePolicy";
import type { PublicPlayer } from "@/domain/players";
import { RULESET_LIST, type RulesetId } from "@/domain/rulesets";
import { t } from "@/i18n/el";
import { authFailureMessage } from "@/lib/auth-feedback";
import { roomFailureMessage } from "@/lib/room-feedback";
import { cn } from "@/lib/utils";
import { realIdentityService } from "@/services/realIdentity";
import { createProductionRoom } from "@/services/roomFunctions";

export const Route = createFileRoute("/create")({
  head: () => ({ meta: [{ title: "Δημιουργία παιχνιδιού — JOKER" }] }),
  component: CreateGame,
});

function Toggle({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className={cn("flex min-h-12 cursor-pointer items-center gap-3", disabled && "cursor-not-allowed opacity-40")}>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="flex h-6 w-6 items-center justify-center rounded-md border border-primary/50 bg-secondary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
        {checked && <Check className="h-4 w-4 text-primary-foreground" />}
      </span>
      <span className="text-foreground">{label}</span>
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
  const [host, setHost] = useState<PublicPlayer | null>(null);
  const [verifiedHost, setVerifiedHost] = useState<PublicPlayer | null>(null);
  const [pin, setPin] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
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

  const unlock = async () => {
    if (!host || authBusy) return;
    setAuthError(null);
    setAuthBusy(true);
    try {
      const result = await realIdentityService.verifyPin(host.id, pin);
      if (!result.ok) { setAuthError(authFailureMessage(result)); return; }
      if (result.player.role !== "host") { setAuthError(t.invalidPin); return; }
      setVerifiedHost(result.player);
      setPin("");
    } finally { setAuthBusy(false); }
  };

  const create = async () => {
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

  if (!verifiedHost) {
    return (
      <ScreenShell title={t.createGame}>
        <div className="space-y-6">
          <div><SectionLabel>Host</SectionLabel><div className="panel p-4 text-center font-display text-xl">{host?.displayName ?? "Φόρτωση…"}</div></div>
          <div><SectionLabel>{t.pin}</SectionLabel><input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" type="password" autoComplete="off" placeholder="••••" className="h-12 w-full rounded-xl border border-input bg-secondary px-4 text-center text-2xl tracking-[0.5em] text-foreground focus:outline-none focus:ring-2 focus:ring-ring" /></div>
          {authError && <p className="text-sm text-negative">{authError}</p>}
          <JButton size="lg" className="w-full" onClick={unlock} disabled={!host || pin.length !== 4 || authBusy}>Συνέχεια</JButton>
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={t.createGame} footer={<div className="space-y-2">{roomError && <p className="text-sm text-negative">{roomError}</p>}<JButton size="lg" className="w-full" onClick={create} disabled={busy || rulesetId !== "popular"}>{t.createRoom}</JButton></div>}>
      <SectionLabel>{t.chooseGame}</SectionLabel>
      <div role="radiogroup" className="space-y-3">
        {RULESET_LIST.map((r) => {
          const active = r.id === rulesetId;
          const available = r.id === "popular";
          return <button key={r.id} role="radio" aria-checked={active} aria-disabled={!available} disabled={!available} onClick={() => available && setRulesetId(r.id)} className={cn("panel flex w-full items-center gap-4 p-4 text-left transition-shadow", active && "ring-gold", !available && "cursor-not-allowed opacity-45")}><span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", active ? "border-primary" : "border-muted-foreground")}>{active && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}</span><span><span className="block font-display text-lg text-foreground">{r.name}</span><span className="block text-sm text-muted-foreground">{available ? r.description : t.rulesetNotImplemented}</span></span></button>;
        })}
      </div>
      <div className="mt-8">
        <SectionLabel>{t.botBehavior}</SectionLabel>
        <div className="panel px-4 py-2">
          <Toggle
            checked={botsTalk}
            onChange={(v) => {
              setBotsTalk(v);
              if (!v) {
                setAllowProfanity(false);
                setAiEnabled(false);
              }
            }}
            label={t.botsTalk}
          />
          {botsTalk && (
            <div className="space-y-2 border-t border-border pl-4">
              <Toggle checked={allowProfanity} onChange={setAllowProfanity} label={t.allowProfanity} />
              <Toggle checked={aiEnabled} onChange={setAiEnabled} label={t.useAiBanter} />
              <div className="pb-3 pt-1">
                <p className="mb-2 text-sm text-muted-foreground">{t.banterIntensity}</p>
                <div role="radiogroup" className="grid grid-cols-3 gap-2">
                  {DIALOGUE_INTENSITIES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={intensity === value}
                      onClick={() => setIntensity(value)}
                      className={cn(
                        "min-h-10 rounded-lg border px-2 text-sm",
                        intensity === value ? "border-primary bg-gold-soft text-primary" : "border-border text-muted-foreground",
                      )}
                    >
                      {intensityLabels[value]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        <p className="mt-2 px-1 text-xs text-muted-foreground">{t.botsNote}</p>
      </div>
    </ScreenShell>
  );
}
