// Client-safe platform constants (no server imports here).
export type Platform = "facebook" | "instagram" | "youtube" | "tiktok";
export type Provider = "meta" | "youtube" | "tiktok";

export const PLATFORM_LABELS: Record<Platform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
};
