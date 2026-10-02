import { t } from "@/i18n/el";
import { roomInviteUrl } from "@/services/rooms";
import { CopyButton } from "./CopyButton";

export function RoomCodeCard({ code }: { code: string }) {
  return (
    <div className="panel p-5 text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t.roomCode}</p>
      <p className="my-2 font-display text-5xl tracking-[0.25em] text-primary">{code}</p>
      <div className="mt-4 flex gap-2">
        <CopyButton text={code} label={t.copyCode} />
        <CopyButton text={roomInviteUrl(code)} label={t.copyLink} kind="link" />
      </div>
    </div>
  );
}
