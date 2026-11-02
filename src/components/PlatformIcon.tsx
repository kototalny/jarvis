import type { Platform } from "@/lib/platform-meta";

const LETTERS: Record<Platform, string> = { facebook: "f", instagram: "IG", youtube: "▶", tiktok: "♪" };

export function PlatformIcon({ platform }: { platform: Platform }) {
  return (
    <span className={`pf pf-${platform}`} aria-label={platform} title={platform}>
      {LETTERS[platform]}
    </span>
  );
}
