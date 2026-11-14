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
    <label className={cn("flex cursor-pointer items-center justify-between gap-2 select-none", disabled && "cursor-not-allowed opacity-40")}>
      {label ? <span className="text-xs text-stone-300 font-medium">{label}</span> : null}
      <div className="relative inline-flex items-center shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <div className={cn(
          "w-11 h-6 rounded-full transition-colors border",
          checked ? "bg-[#f5c15d] border-[#f5c15d]" : "bg-black/60 border-white/20"
        )} />
        <div className={cn(
          "absolute top-1 left-1 h-4 w-4 rounded-full transition-transform shadow-sm",
          checked ? "translate-x-5 bg-[#1a1202]" : "translate-x-0 bg-stone-400"
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
          <div role="radiogroup" className="pregame-rules-list space-y-2">
            {options.map((r) => {
              const active = r.id === rulesetId;
              const isPopular = r.id === "popular";
              return (
                <button
                  key={r.id}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setRulesetId(r.id)}
                  className={cn(
                    "panel pregame-rule-card w-full text-left transition-all active:scale-[0.99] rounded-2xl p-3 sm:p-3.5 flex items-center justify-between",
                    active
                      ? "!border-[#f5c15d] !bg-gradient-to-r !from-[#f5c15d]/15 !to-[#f5c15d]/5 ring-2 ring-[#f5c15d]/50 shadow-[0_4px_20px_rgba(245,193,93,0.18)]"
                      : "border-white/10 bg-[#1e2024] opacity-80 hover:opacity-100 hover:border-white/30"
                  )}
                >
                  <div className="min-w-0 pr-3 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="pregame-rule-title font-display font-bold text-white text-xs sm:text-sm">{r.name}</span>
                      {isPopular && (
                        <span className="text-[10px] font-bold text-[#f5c15d] bg-[#f5c15d]/20 px-2 py-0.5 rounded-md border border-[#f5c15d]/30">
                          Προτεινόμενο
                        </span>
                      )}
                    </div>
                    <span className="pregame-rule-description block text-[11px] sm:text-xs text-stone-300 line-clamp-1">{r.description}</span>
                  </div>
                  <div className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors",
                    active ? "bg-[#f5c15d] text-[#1a1202] font-black text-xs" : "border border-white/30"
                  )}>
                    {active ? "✓" : null}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col">
          <SectionLabel>{t.botBehavior}</SectionLabel>
          <div className="panel pregame-bot-panel flex flex-col justify-between h-full rounded-2xl bg-[#1e2024] p-3 sm:p-4 border border-white/10 shadow-md">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#292a2f] border border-white/5">
                <div>
                  <span className="text-xs font-bold text-white block">{t.botsTalk}</span>
                  <span className="text-[11px] text-stone-400 block">Ζωντανές αντιδράσεις σε κάθε μπάζα</span>
                </div>
                <Toggle checked={botsTalk} onChange={(v) => {
                  setBotsTalk(v);
                  if (!v) {
                    setAllowProfanity(false);
                    setAiEnabled(false);
                    setTtsEnabled(false);
                    setShowDialogueText(true);
                  }
                }} label="" />
              </div>

              {botsTalk ? (
                <div className="space-y-1.5 border-t border-white/10 pt-2">
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
                  <div className="pt-1">
                    <p className="mb-1 text-[11px] text-stone-400 font-medium">{t.banterIntensity}</p>
                    <div role="radiogroup" className="grid grid-cols-3 gap-1.5">
                      {DIALOGUE_INTENSITIES.map((value) => (
                        <button key={value} type="button" role="radio" aria-checked={intensity === value} onClick={() => setIntensity(value)} className={cn("min-h-8 rounded-lg border px-1.5 py-1 text-[11px] font-medium transition-all active:scale-[0.98]", intensity === value ? "border-[#f5c15d] bg-[#f5c15d]/20 text-[#f5c15d] font-bold" : "border-white/10 bg-[#292a2f] text-stone-300 hover:text-white")}>
                          {intensityLabels[value]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs leading-relaxed text-stone-400">{t.botsNote}</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </ScreenShell>
  );
}
