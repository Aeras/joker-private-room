import { Smile, X } from "lucide-react";
export const EMOJI_SLUGS = [
  "grinning_face",
  "grinning_squinting_face",
  "grinning_face_with_big_eyes",
  "smiling_face_with_smiling_eyes",
  "slightly_smiling_face",
  "winking_face",
  "smirking_face",
  "face_with_tears_of_joy",
  "rolling_on_the_floor_laughing",
  "thinking_face",
  "zany_face",
  "face_with_tongue",
  "winking_face_with_tongue",
  "smiling_face_with_heart-eyes",
  "loudly_crying_face",
  "pleading_face",
  "angry_face",
  "pouting_face",
  "confused_face",
  "expressionless_face",
  "unamused_face",
  "face_with_rolling_eyes",
  "sleeping_face",
  "face_screaming_in_fear",
  "star-struck",
  "hugging_face",
  "face_with_open_mouth",
  "face_blowing_a_kiss",
  "smiling_face_with_horns",
  "shushing_face",
  "face_with_hand_over_mouth",
  "relieved_face"
] as const;
export function emojiUrl(slug: string): string | null {
  return (EMOJI_SLUGS as readonly string[]).includes(slug) ? `/emojis/fluent/${slug}.svg` : null;
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
        <div role="dialog" aria-label="Επιλογή smiley" className="absolute bottom-11 right-0 w-[min(18rem,85vw)] rounded-2xl border border-primary/35 bg-[#21252b]/95 p-2 shadow-2xl backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between px-1 text-xs text-white/85"><span>Smileys</span><button type="button" onClick={onToggle} aria-label="Κλείσιμο"><X className="h-4 w-4"/></button></div>
          <div className="grid max-h-[min(55vh,22rem)] grid-cols-6 gap-1 overflow-y-auto">
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
