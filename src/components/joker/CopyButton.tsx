import { Check, Copy, Link2 } from "lucide-react";
import { useState } from "react";
import { t } from "@/i18n/el";
import { JButton } from "./JButton";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function CopyButton({ text, label, kind = "code" }: { text: string; label: string; kind?: "code" | "link" }) {
  const [done, setDone] = useState(false);
  const Icon = done ? Check : kind === "link" ? Link2 : Copy;
  return (
    <JButton
      variant="secondary"
      size="md"
      className="flex-1"
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
    >
      <Icon className="h-4 w-4" />
      {done ? t.copied : label}
    </JButton>
  );
}
