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
  busy = false,
  error = null,
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
  return (
    <Modal open={open} onClose={onClose} title={`💬 ${t.chat}`} className="sm:max-w-md">
      <form
        className="space-y-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim() || busy) return;
          if ((await onSend(to, text.trim())) === false) return;
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
                to === r.value
                  ? "border-primary bg-gold-soft text-primary"
                  : "border-border text-muted-foreground hover:bg-accent",
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
        {error && (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        )}
        <JButton type="submit" className="w-full" disabled={!text.trim() || busy}>
          {t.send}
        </JButton>
      </form>
    </Modal>
  );
}
