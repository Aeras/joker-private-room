import { Smile, X } from "lucide-react";
export const EMOJI_SLUGS = [
  "wave",
  "laugh",
  "point-laugh",
  "cry",
  "angry",
  "wink",
  "facepalm",
  "thumbs-up",
  "applause",
  "surprised",
  "flirty-wink",
  "kiss",
  "heart-eyes",
  "shrug",
  "celebrate",
  "peekaboo",
  "please",
  "thinking",
  "sleepy",
  "cool"
] as const;
export function emojiUrl(slug: string): string | null {
  return (EMOJI_SLUGS as readonly string[]).includes(slug) ? `/emojis/joker/${slug}.webp` : null;
}
export function EmojiPicker({ open, onToggle, onSelect, busy }: {
  open: boolean;
  onToggle: () => void;
  onSelect: (slug: string) => void;
  busy: boolean;
}) {
  return (
    <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-[calc(max(.75rem,env(safe-area-inset-right))+3.4rem)] z-[75]">
      {open && (
        <div role="dialog" aria-label="Επιλογή smiley" className="absolute bottom-11 right-0 w-[min(20rem,85vw)] rounded-2xl border border-primary/35 bg-[#21252b]/95 p-2 shadow-2xl backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between px-1 text-xs text-white/85"><span>Smileys</span><button type="button" onClick={onToggle} aria-label="Κλείσιμο"><X className="h-4 w-4"/></button></div>
          <div className="grid max-h-[min(55vh,22rem)] grid-cols-5 gap-1 overflow-y-auto">
            {EMOJI_SLUGS.map(slug => (
              <button type="button" key={slug} disabled={busy} aria-label={slug.replaceAll("_"," ").replaceAll("-"," ")} title={slug.replaceAll("_"," ")}
                onClick={() => onSelect(slug)} className="aspect-square rounded-lg p-1 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">
                <img src={emojiUrl(slug)!} alt="" className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        </div>
      )}
      <button type="button" onClick={onToggle} aria-expanded={open} aria-label="Άνοιγμα smileys" className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/55 bg-black/80 text-primary shadow-lg hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        <Smile className="h-5 w-5"/>
      </button>
    </div>
  );
}
