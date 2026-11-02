import type { Platform, Provider } from "../config";
import type { PublishInput, PublishResult } from "./common";
import { metaAuthUrl, metaHandleCallback, publishFacebook, publishInstagram } from "./meta";
import { publishTikTok, tiktokAuthUrl, tiktokHandleCallback } from "./tiktok";
import { publishYouTube, youtubeAuthUrl, youtubeHandleCallback } from "./youtube";

export const publishers: Record<Platform, (input: PublishInput) => Promise<PublishResult>> = {
  facebook: publishFacebook,
  instagram: publishInstagram,
  youtube: publishYouTube,
  tiktok: publishTikTok,
};

export const providers: Record<
  Provider,
  { authUrl: (state: string) => string; handleCallback: (code: string) => Promise<string> }
> = {
  meta: { authUrl: metaAuthUrl, handleCallback: metaHandleCallback },
  youtube: { authUrl: youtubeAuthUrl, handleCallback: youtubeHandleCallback },
  tiktok: { authUrl: tiktokAuthUrl, handleCallback: tiktokHandleCallback },
};

export function isProvider(p: string): p is Provider {
  return p === "meta" || p === "youtube" || p === "tiktok";
}

/** What each platform needs, used by the editor and by server-side validation. */
export const PLATFORM_RULES: Record<
  Platform,
  { captionLimit: number; requiresMedia: boolean; videoOnly: boolean; jpegOnly: boolean }
> = {
  facebook: { captionLimit: 63206, requiresMedia: false, videoOnly: false, jpegOnly: false },
  instagram: { captionLimit: 2200, requiresMedia: true, videoOnly: false, jpegOnly: true },
  youtube: { captionLimit: 5000, requiresMedia: true, videoOnly: true, jpegOnly: false },
  tiktok: { captionLimit: 2200, requiresMedia: true, videoOnly: true, jpegOnly: false },
};
