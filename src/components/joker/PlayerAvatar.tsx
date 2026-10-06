import { useState } from "react";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

/** Replaceable avatar: renders imageUrl when supplied, otherwise a neutral placeholder. */
export function PlayerAvatar({
  name,
  imageUrl,
  fallbackImageUrl,
  isBot,
  size = "md",
  className,
}: {
  name: string;
  imageUrl?: string | undefined;
  fallbackImageUrl?: string | undefined;
  isBot?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const displayedUrl = failedUrl === imageUrl ? fallbackImageUrl : imageUrl;
  const dims = { sm: "h-9 w-9 text-sm", md: "h-12 w-12 text-base", lg: "h-16 w-16 text-xl" }[size];
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/40 bg-secondary font-display text-primary",
        dims,
        className,
      )}
    >
      {displayedUrl ? (
        <img src={displayedUrl} alt={name} decoding="async" onError={() => setFailedUrl(imageUrl ?? null)} className="h-full w-full object-cover" />
      ) : isBot ? (
        <Bot className="h-1/2 w-1/2" />
      ) : (
        <span>{name.slice(0, 1)}</span>
      )}
    </div>
  );
}
