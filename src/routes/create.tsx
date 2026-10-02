import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useState } from "react";
import { JButton } from "@/components/joker/JButton";
import { ScreenShell, SectionLabel } from "@/components/joker/ScreenShell";
import { DEMO_HOST } from "@/demo/mockIdentity";
import { mockRoomService } from "@/demo/mockRooms";
import { RULESET_LIST, type RulesetId } from "@/domain/rulesets";
import { t } from "@/i18n/el";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Δημιουργία παιχνιδιού — JOKER" },
      { name: "description", content: "Διάλεξε παραλλαγή και ρυθμίσεις bots για νέο δωμάτιο." },
      { property: "og:title", content: "Δημιουργία παιχνιδιού — JOKER" },
      { property: "og:description", content: "Διάλεξε παραλλαγή και ρυθμίσεις bots για νέο δωμάτιο." },
    ],
  }),
  component: CreateGame,
});

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
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

function CreateGame() {
  const navigate = useNavigate();
  const [rulesetId, setRulesetId] = useState<RulesetId>("popular");
  const [botsTalk, setBotsTalk] = useState(false);
  const [allowProfanity, setAllowProfanity] = useState(false);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    await mockRoomService.createRoom({
      host: DEMO_HOST,
      rulesetId,
      botSettings: { botsTalk, allowProfanity: botsTalk && allowProfanity },
    });
    navigate({ to: "/lobby" });
  };

  return (
    <ScreenShell
      title={t.createGame}
      footer={
        <JButton size="lg" className="w-full" onClick={create} disabled={busy}>
          {t.createRoom}
        </JButton>
      }
    >
      <SectionLabel>{t.chooseGame}</SectionLabel>
      <div role="radiogroup" className="space-y-3">
        {RULESET_LIST.map((r) => {
          const active = r.id === rulesetId;
          return (
            <button
              key={r.id}
              role="radio"
              aria-checked={active}
              onClick={() => setRulesetId(r.id)}
              className={cn(
                "panel flex w-full items-center gap-4 p-4 text-left transition-shadow",
                active && "ring-gold",
              )}
            >
              <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", active ? "border-primary" : "border-muted-foreground")}>
                {active && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
              </span>
              <span>
                <span className="block font-display text-lg text-foreground">{r.name}</span>
                <span className="block text-sm text-muted-foreground">{r.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-8">
        <SectionLabel>{t.botBehavior}</SectionLabel>
        <div className="panel px-4 py-2">
          <Toggle
            checked={botsTalk}
            onChange={(v) => {
              setBotsTalk(v);
              if (!v) setAllowProfanity(false);
            }}
            label={t.botsTalk}
          />
          {botsTalk && (
            <div className="border-t border-border pl-4">
              <Toggle checked={allowProfanity} onChange={setAllowProfanity} label={t.allowProfanity} />
            </div>
          )}
        </div>
        <p className="mt-2 px-1 text-xs text-muted-foreground">{t.botsNote}</p>
      </div>
    </ScreenShell>
  );
}
