// YouTube Data API v3 (resumable upload).
import fs from "node:fs";
import { Readable } from "node:stream";
import { config, redirectUri } from "../config";
import { updateAccountTokens, upsertAccount, type Account } from "../db";
import { errorMessage, fetchJson, PlatformError, type PublishInput, type PublishResult } from "./common";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];
const TOKEN_URL = "https://oauth2.googleapis.com/token";

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string };

export function youtubeAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: redirectUri("youtube"),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function youtubeHandleCallback(code: string): Promise<string> {
  const tok = await fetchJson<TokenResponse>(
    TOKEN_URL,
    {
      method: "POST",
      body: new URLSearchParams({
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: redirectUri("youtube"),
        grant_type: "authorization_code",
      }),
    },
    "Google",
  );
  const channels = await fetchJson<{
    items?: { id: string; snippet: { title: string; thumbnails?: { default?: { url: string } } } }[];
  }>(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${tok.access_token}` } },
    "YouTube",
  );
  const ch = channels.items?.[0];
  if (!ch) throw new PlatformError("To konto Google nie ma kanału YouTube.");
  upsertAccount({
    platform: "youtube",
    external_id: ch.id,
    name: ch.snippet.title,
    avatar_url: ch.snippet.thumbnails?.default?.url ?? null,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token ?? null,
    token_expires_at: Date.now() + tok.expires_in * 1000,
  });
  return `Połączono kanał YouTube: ${ch.snippet.title}.`;
}

async function freshToken(account: Account): Promise<string> {
  if (account.token_expires_at && account.token_expires_at > Date.now() + 120_000) return account.access_token;
  if (!account.refresh_token) throw new PlatformError("Brak refresh tokenu YouTube — połącz kanał ponownie.");
  const tok = await fetchJson<TokenResponse>(
    TOKEN_URL,
    {
      method: "POST",
      body: new URLSearchParams({
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        refresh_token: account.refresh_token,
        grant_type: "refresh_token",
      }),
    },
    "Google",
  );
  const expiresAt = Date.now() + tok.expires_in * 1000;
  updateAccountTokens(account.id, tok.access_token, tok.refresh_token ?? null, expiresAt);
  return tok.access_token;
}

function cleanTitle(s: string): string {
  const t = s.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  return (t || "Nowy film").slice(0, 100);
}

export async function publishYouTube(input: PublishInput): Promise<PublishResult> {
  const { account, caption, media, mediaPath, options } = input;
  if (!media || !mediaPath || media.kind !== "video") throw new PlatformError("YouTube wymaga pliku wideo.");

  const token = await freshToken(account);
  const title = cleanTitle(String(options.title || caption.split("\n")[0] || ""));
  const privacy = ["public", "unlisted", "private"].includes(String(options.privacy))
    ? String(options.privacy)
    : "public";

  const init = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(media.size),
        "X-Upload-Content-Type": media.mime,
      },
      body: JSON.stringify({
        snippet: { title, description: caption.replace(/[<>]/g, "").slice(0, 5000), categoryId: "22" },
        status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
      }),
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!init.ok) {
    throw new PlatformError(`YouTube (${init.status}): ${errorMessage(await init.text(), init.statusText)}`);
  }
  const uploadUrl = init.headers.get("location");
  if (!uploadUrl) throw new PlatformError("YouTube nie zwrócił adresu uploadu.");

  const body = Readable.toWeb(fs.createReadStream(mediaPath)) as ReadableStream;
  const video = await fetchJson<{ id: string; status?: { privacyStatus?: string; uploadStatus?: string } }>(
    uploadUrl,
    {
      method: "PUT",
      headers: { "Content-Type": media.mime, "Content-Length": String(media.size) },
      body,
      // @ts-expect-error -- required by Node's fetch for streamed bodies
      duplex: "half",
      signal: AbortSignal.timeout(2 * 60 * 60_000),
    },
    "YouTube",
  );
  const lockedPrivate = privacy !== "private" && video.status?.privacyStatus === "private";
  return {
    externalId: video.id,
    url: `https://youtu.be/${video.id}`,
    note: lockedPrivate
      ? "YouTube ustawił film jako prywatny (projekt API bez audytu). Zmień widoczność w YouTube Studio albo przejdź audyt."
      : undefined,
  };
}
