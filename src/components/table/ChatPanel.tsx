import { useState } from "react";
import { X, Send } from "lucide-react";
import { EPHEMERAL_MESSAGE_MAX_LENGTH } from "@/services/ephemeral";
import { t } from "@/i18n/el";
import { cn } from "@/lib/utils";

export interface Recipient {
  value: number | "all";
  label: string;
}

export const QUICK_CHAT_PHRASES = [
  "Γειά σας",
  "Τώρα Τώρα",
  "Που είναι όλα τα Τζόκερ;",
  "Τυχερός",
  "Αρχίδι",
  "Δε μου δίνει καλά χαρτιά.",
  "Πάλι;",
  "Καλή κίνηση",
  "Γαμιέσαι",
  "Καλαααααα",
  "Θα σε γαμήσω",
  "Παράτα με",
  "Είμαι βασιλιάς.",
  "Παρ' το",
  "Μπράβο",
  "Μαλάκας",
] as const;

export function ChatPanel({
  open, onClose, recipients, onSend, busy = false, error = null,
}: {
  open: boolean;
  onClose: () => void;
  recipients: Recipient[];
  onSend: (to: number | "all", text: string) => void | Promise<boolean | void>;
  busy?: boolean;
  error?: string | null;
}) {
  const [to, setTo] = useState<number | "all">("all");
  const [text, setText] = useState("");
  if (!open) return null;
  const send = async (message: string) => {
    if (!message.trim() || busy) return;
    if ((await onSend(to, message.trim())) === false) return;
    setText("");
    onClose();
  };
  return (
    <div role="dialog" aria-label="Γρήγορα μηνύματα" className="pointer-events-auto absolute bottom-[calc(max(.75rem,env(safe-area-inset-bottom))+3.3rem)] right-[max(.75rem,env(safe-area-inset-right))] z-[135] flex max-h-[min(75dvh,33rem)] w-[min(17.5rem,88vw)] flex-col rounded-2xl border border-primary/50 bg-[#171b20]/95 text-white shadow-2xl backdrop-blur-md">
      <div className="flex shrink-0 items-center justify-between border-b border-white/15 px-3 py-2">
        <strong className="text-xs font-semibold">Μηνύματα</strong>
        <button type="button" onClick={onClose} aria-label="Κλείσιμο μηνυμάτων" className="rounded p-1 hover:bg-white/10"><X size={17}/></button>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-2">
        <div className="grid grid-cols-2 gap-1.5">
          {recipients.map(r => (
            <button key={String(r.value)} type="button" onClick={() => setTo(r.value)}
              aria-pressed={to === r.value} title={r.label}
              className={cn("min-h-9 truncate rounded-lg border px-1.5 py-1 text-xs", r.value === "all" && "col-span-2",
                to === r.value ? "border-primary bg-primary/25 text-primary" : "border-white/20 bg-white/5 hover:bg-white/10")}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="my-2 border-t border-primary/25"/>
        <div className="flex flex-col gap-1">
          {QUICK_CHAT_PHRASES.map(phrase => (
            <button type="button" key={phrase} disabled={busy} onClick={() => void send(phrase)}
              className="min-h-8 rounded-lg px-2.5 py-1.5 text-left text-xs leading-tight hover:bg-white/15 active:bg-primary/20 disabled:opacity-40">
              {phrase}
            </button>
          ))}
        </div>
      </div>
      <form className="flex shrink-0 items-center gap-1.5 border-t border-white/15 p-2" onSubmit={e => { e.preventDefault(); void send(text); }}>
        <input type="text" inputMode="text" autoComplete="off" enterKeyHint="send" value={text}
          maxLength={EPHEMERAL_MESSAGE_MAX_LENGTH} onChange={e => setText(e.target.value)}
          placeholder={t.messagePlaceholder}
          className="h-10 min-w-0 flex-1 rounded-lg border border-white/20 bg-black/45 px-2 text-base text-white placeholder:text-white/45 focus:border-primary focus:outline-none" />
        <button type="submit" disabled={!text.trim() || busy} aria-label={t.send}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40">
          <Send size={17}/>
        </button>
      </form>
      {error && <p role="alert" className="px-3 pb-2 text-xs text-negative">{error}</p>}
    </div>
  );
}
