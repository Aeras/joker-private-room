import { useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { getSoundEnabled, setSoundEnabled, subscribeSoundPreference } from "@/lib/soundPreference";
import { t } from "@/i18n/el";
import { JButton } from "../joker/JButton";
export function SoundToggle() {
  const enabled = useSyncExternalStore(subscribeSoundPreference, getSoundEnabled, () => true);
  return (
    <JButton
      variant="outlineGold"
      size="sm"
      className="min-h-11 min-w-11 bg-black/60 px-2"
      aria-label={t.sound}
      aria-pressed={enabled}
      onClick={() => setSoundEnabled(!enabled)}
    >
      {enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
      <span className="hidden lg:inline">{t.sound}</span>
    </JButton>
  );
}
