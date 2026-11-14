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
import { getCurrentPlayer } from "@/services/authFunctions";

const AI_BANTER_CREATOR_PLAYER_ID = "a1f36a77-1732-44d4-8c3b-4623a6e6ed0c";
import { createProductionRoom, getAvailableRulesets } from "@/services/roomFunctions";

export const Route = createFileRoute("/create")({
  head: () => ({ meta: [{ title: "Δημιουργία παιχνιδιού — JOKER" }] }),
  component: CreateGame,
});

function Toggle({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className={cn("flex min-h-8 cursor-pointer items-center justify-between gap-3 select-none py-0.5", disabled && "cursor-not-allowed opacity-40")}>
      <span className="text-xs sm:text-sm text-foreground font-medium">{label}</span>
      <div className="relative inline-flex items-center shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <div className={cn(
          "w-9 h-5 sm:w-10 sm:h-5 rounded-full transition-colors border",
          checked ? "bg-primary border-primary" : "bg-black/50 border-white/20"
        )} />
        <div className={cn(
          "absolute top-0.5 left-0.5 h-4 w-4 rounded-full transition-transform",
          checked ? "translate-x-4 sm:translate-x-5 bg-background shadow-sm" : "translate-x-0 bg-muted-foreground/70"
        )} />
      </div>
    </label>
  );
}

const intensityLabels: Record<DialogueIntensity, string> = {
  conservative: t.banterConservative,
  normal: t.banterNormal,
  chaos: t.banterChaos,
};

export function CreateGame() {
  const navigate = useNavigate();
  const activeLookup = useCurrentActiveGame();
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionFailed, setSessionFailed] = useState(false);
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [players, setPlayers] = useState<PublicPlayer[]>([]);
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
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [showDialogueText, setShowDialogueText] = useState(true);
  const [intensity, setIntensity] = useState<DialogueIntensity>("normal");
  const [busy, setBusy] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const createActionId = useRef<string | null>(null);

  useEffect(() => {
    realIdentityService.listPlayers()
      .then((list) => {
        setPlayers(list);
        setHost((current) => current ?? list[0] ?? null);
      })
      .catch(() => setAuthError(t.authUnavailable));
  }, []);

  useEffect(() => {
    let mounted = true;
    setSessionLoading(true);
    setSessionFailed(false);
    void (async () => {
      const current = await getCurrentPlayer();
      if (!current || !mounted) return;
      setVerifiedHost(current);
      setHost(current);
      const available = await getAvailableRulesets();
      if (mounted && available.ok) setOptions(available.options);
    })().catch(() => { if (mounted) setSessionFailed(true); })
      .finally(() => { if (mounted) setSessionLoading(false); });
    return () => { mounted = false; };
  }, [sessionAttempt]);

  useEffect(() => {
    if (activeLookup.status !== "waiting") return;
    void navigate({ to: "/lobby", search: { code: activeLookup.roomCode } });
  }, [activeLookup.status, activeLookup.status === "waiting" ? activeLookup.roomCode : null, navigate]);

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
          aiEnabled: botsTalk && verifiedHost.id === AI_BANTER_CREATOR_PLAYER_ID && aiEnabled,
          ttsEnabled: botsTalk && verifiedHost.id === AI_BANTER_CREATOR_PLAYER_ID && ttsEnabled,
          showDialogueText: !(botsTalk && verifiedHost.id === AI_BANTER_CREATOR_PLAYER_ID && ttsEnabled) || showDialogueText,
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

  if (sessionLoading) {
    return <ScreenShell title={t.createGame} variant="pregame" contentClassName="pregame-centered-content"><p role="status">{t.sessionLoading}</p></ScreenShell>;
  }
  if (sessionFailed) {
    return <ScreenShell title={t.createGame} variant="pregame" contentClassName="pregame-centered-content"><div><p role="alert">{t.sessionLoadFailed}</p><JButton onClick={() => setSessionAttempt(n => n + 1)}>Δοκιμή ξανά</JButton></div></ScreenShell>;
  }
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
          <div className="pregame-auth-block">
            <SectionLabel>Host</SectionLabel>
            <select
              value={host?.id ?? ""}
              onChange={(event) => {
                const next = players.find((player) => player.id === event.target.value) ?? null;
                setHost(next);
                setPin("");
                setAuthError(null);
              }}
              className="pregame-auth-control pregame-host-control w-full border border-input bg-secondary px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Παίκτης"
              disabled={players.length === 0 || authBusy}
            >
              {players.length === 0 ? (
                <option value="">Φόρτωση…</option>
              ) : (
                players.map((player) => (
                  <option key={player.id} value={player.id}>{player.displayName}</option>
                ))
              )}
            </select>
          </div>
          <div className="pregame-auth-block">
            <SectionLabel>{t.pin}</SectionLabel>
            <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" type="password" autoComplete="off" placeholder="••••" className="pregame-auth-control pregame-pin-input w-full border border-input bg-secondary text-center text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="pregame-auth-action">
            <JButton size="lg" className="pregame-primary-button pregame-auth-control w-full" onClick={unlock} disabled={!host || pin.length !== 4 || authBusy}>Συνέχεια</JButton>
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
      fixedViewport={true}
      contentClassName="pregame-form-content !py-1 sm:!py-2"
      footer={
        <div className="pregame-create-footer !py-0">
          {roomError && <p className="flex-1 text-xs sm:text-sm text-negative truncate">{roomError}</p>}
          <JButton size="lg" className="pregame-primary-button pregame-create-cta" onClick={createRoom} disabled={busy}>{t.createRoom}</JButton>
        </div>
      }
    >
      <div className="pregame-create-grid">
        <section className="flex flex-col">
          <SectionLabel>{t.chooseGame}</SectionLabel>
          <div role="radiogroup" className="pregame-rules-list">
            {options.map((r) => {
              const active = r.id === rulesetId;
              return (
                <button
                  key={r.id}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setRulesetId(r.id)}
                  className={cn(
                    "panel pregame-rule-card w-full text-left transition-all active:scale-[0.99] rounded-2xl",
                    active ? "ring-gold border-primary/80 bg-primary/10 shadow-[0_0_15px_rgba(214,175,96,0.15)]" : "border-border/40 hover:border-border/80"
                  )}
                >
                  <span className={cn(
                    "flex h-4 w-4 sm:h-5 sm:w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                    active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/60"
                  )}>
                    {active && <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-background" />}
                  </span>
                  <span className="min-w-0">
                    <span className="pregame-rule-title block font-display font-semibold text-foreground text-xs sm:text-sm">{r.name}</span>
                    <span className="pregame-rule-description block text-[10px] sm:text-xs text-muted-foreground line-clamp-1">{r.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col">
          <SectionLabel>{t.botBehavior}</SectionLabel>
          <div className="panel pregame-bot-panel flex flex-col justify-between h-full rounded-2xl">
            <Toggle checked={botsTalk} onChange={(v) => {
              setBotsTalk(v);
              if (!v) {
                setAllowProfanity(false);
                setAiEnabled(false);
                setTtsEnabled(false);
                setShowDialogueText(true);
              }
            }} label={t.botsTalk} />
            {botsTalk ? (
              <div className="space-y-1 border-t border-border/40 pt-1">
                <Toggle checked={allowProfanity} onChange={setAllowProfanity} label={t.allowProfanity} />
                {verifiedHost.id === AI_BANTER_CREATOR_PLAYER_ID && (
                  <div>
                    <Toggle
                      checked={aiEnabled}
                      onChange={setAiEnabled}
                      label={t.useAiBanter}
                    />
                    <div className="ml-6 space-y-0.5">
                      <Toggle
                        checked={ttsEnabled}
                        onChange={(value) => {
                          setTtsEnabled(value);
                          if (!value) setShowDialogueText(true);
                        }}
                        label={t.botVoice}
                      />
                      {ttsEnabled && (
                        <Toggle
                          checked={showDialogueText}
                          onChange={setShowDialogueText}
                          label={t.showBotMessages}
                        />
                      )}
                    </div>
                  </div>
                )}
                <div className="pt-0.5">
                  <p className="mb-1 text-[11px] text-muted-foreground">{t.banterIntensity}</p>
                  <div role="radiogroup" className="grid grid-cols-3 gap-1.5">
                    {DIALOGUE_INTENSITIES.map((value) => (
                      <button key={value} type="button" role="radio" aria-checked={intensity === value} onClick={() => setIntensity(value)} className={cn("min-h-8 rounded-lg border px-1.5 py-1 text-[11px] font-medium transition-all active:scale-[0.98]", intensity === value ? "border-primary bg-gold-soft text-primary font-semibold" : "border-border/60 text-muted-foreground hover:text-foreground")}>
                        {intensityLabels[value]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t.botsNote}</p>
            )}
          </div>
        </section>
      </div>
    </ScreenShell>
  );
}
