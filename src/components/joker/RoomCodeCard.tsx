import { t } from "@/i18n/el";
import { CopyButton } from "./CopyButton";

export function RoomCodeCard({ code }: { code: string }) {
  return (
    <div className="panel min-w-0 p-3 text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t.roomCode}</p>
      <p className="my-2 font-display text-5xl tracking-[0.25em] text-primary">{code}</p>
      <div className="mt-4 flex gap-2">
        <CopyButton text={code} label={t.copyCode} className="whitespace-nowrap px-3 text-xs sm:text-sm" />
      </div>
    </div>
  );
}
