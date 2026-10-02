import { useState } from "react";
import { EPHEMERAL_MESSAGE_MAX_LENGTH } from "@/services/ephemeral";
import { t } from "@/i18n/el";
import { cn } from "@/lib/utils";
import { JButton } from "../joker/JButton";
import { Modal } from "../joker/Modal";

export interface Recipient {
  value: number | "all";
  label: string;
}

export function ChatPanel({
  open,
  onClose,
  recipients,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  recipients: Recipient[];
  onSend: (to: number | "all", text: string) => void;
}) {
  const [to, setTo] = useState<number | "all">("all");
  const [text, setText] = useState("");
  return (
    <Modal open={open} onClose={onClose} title={`💬 ${t.chat}`} className="sm:max-w-md">
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onSend(to, text.trim());
          setText("");
          onClose();
        }}
      >
        <div className="flex flex-wrap gap-2">
          {recipients.map((r) => (
            <button
              type="button"
              key={String(r.value)}
              onClick={() => setTo(r.value)}
              className={cn(
                "h-10 rounded-full border px-4 text-sm transition-colors",
                to === r.value ? "border-primary bg-gold-soft text-primary" : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <input
          autoFocus
          value={text}
          maxLength={EPHEMERAL_MESSAGE_MAX_LENGTH}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.messagePlaceholder}
          className="h-12 w-full rounded-xl border border-input bg-secondary px-4 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <JButton type="submit" className="w-full" disabled={!text.trim()}>
          {t.send}
        </JButton>
      </form>
    </Modal>
  );
}
