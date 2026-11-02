// TikTok Content Posting API (v2).
import fs from "node:fs/promises";
import { config, redirectUri } from "../config";
import { updateAccountTokens, upsertAccount, type Account } from "../db";
import { errorMessage, fetchJson, PlatformError, sleep, type PublishInput, type PublishResult } from "./common";

const API = "https://open.tiktokapis.com/v2";
const SCOPES = ["user.info.basic", "video.upload", "video.publish"];

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  open_id: string;
  error?: string;
  error_description?: string;
};

type ApiEnvelope<T> = { data: T; error: { code: string; message: string } };

export function tiktokAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_key: config.tiktok.clientKey,
    redirect_uri: redirectUri("tiktok"),
    response_type: "code",
    scope: SCOPES.join(","),
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${p}`;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const tok = await fetchJson<TokenResponse>(
    `${API}/oauth/token/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: config.tiktok.clientKey,
        client_secret: config.tiktok.clientSecret,
        ...params,
      }),
    },
    "TikTok",
  );
  if (tok.error || !tok.access_token) {
    throw new PlatformError(`TikTok: ${tok.error_description || tok.error || "nie udało się pobrać tokenu"}`);
  }
  return tok;
}

async function api<T>(path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetchJson<ApiEnvelope<T>>(
    `${API}${path}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json; charset=UTF-8" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    "TikTok",
  );
  if (res.error && res.error.code !== "ok") {
    throw new PlatformError(`TikTok: ${res.error.message || res.error.code}`);
  }
  return res.data;
}

export async function tiktokHandleCallback(code: string): Promise<string> {
  const tok = await tokenRequest({
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri("tiktok"),
  });
  const info = await api<{ user: { open_id: string; display_name?: string; avatar_url?: string } }>(
    "/user/info/?fields=open_id,display_name,avatar_url",
    tok.access_token,
  );
  const name = info.user.display_name || "Konto TikTok";
  upsertAccount({
    platform: "tiktok",
    external_id: tok.open_id,
    name,
    avatar_url: info.user.avatar_url ?? null,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    token_expires_at: Date.now() + tok.expires_in * 1000,
  });
  return `Połączono konto TikTok: ${name}.`;
}

async function freshToken(account: Account): Promise<string> {
  if (account.token_expires_at && account.token_expires_at > Date.now() + 120_000) return account.access_token;
  if (!account.refresh_token) throw new PlatformError("Brak refresh tokenu TikTok — połącz konto ponownie.");
  const tok = await tokenRequest({ grant_type: "refresh_token", refresh_token: account.refresh_token });
  updateAccountTokens(account.id, tok.access_token, tok.refresh_token, Date.now() + tok.expires_in * 1000);
  return tok.access_token;
}

const MB = 1024 * 1024;

/** TikTok chunk rules: 5–64 MB per chunk; files up to 64 MB may go in one chunk; the last chunk takes the remainder. */
function chunkPlan(size: number) {
  if (size <= 64 * MB) return { chunkSize: size, count: 1 };
  const chunkSize = 10 * MB;
  return { chunkSize, count: Math.floor(size / chunkSize) };
}

export const TIKTOK_PRIVACY = ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"];

export async function publishTikTok(input: PublishInput): Promise<PublishResult> {
  const { account, caption, media, mediaPath, options } = input;
  if (!media || !mediaPath || media.kind !== "video") {
    throw new PlatformError("TikTok (przez API) obsługuje w tym panelu tylko filmy.");
  }
  const token = await freshToken(account);
  const mode = options.mode === "direct" ? "direct" : "inbox";
  const { chunkSize, count } = chunkPlan(media.size);
  const sourceInfo = {
    source: "FILE_UPLOAD",
    video_size: media.size,
    chunk_size: chunkSize,
    total_chunk_count: count,
  };

  let init: { publish_id: string; upload_url: string };
  let privacyUsed: string | null = null;
  if (mode === "direct") {
    const creator = await api<{ privacy_level_options: string[] }>(
      "/post/publish/creator_info/query/",
      token,
      {},
    );
    const allowed = creator.privacy_level_options ?? [];
    const wanted = String(options.privacy || "PUBLIC_TO_EVERYONE");
    privacyUsed = allowed.includes(wanted) ? wanted : allowed.includes("SELF_ONLY") ? "SELF_ONLY" : allowed[0];
    if (!privacyUsed) throw new PlatformError("TikTok nie zwrócił dozwolonych poziomów prywatności.");
    init = await api("/post/publish/video/init/", token, {
      post_info: {
        title: caption.slice(0, 2200),
        privacy_level: privacyUsed,
        disable_comment: false,
        disable_duet: false,
        disable_stitch: false,
      },
      source_info: sourceInfo,
    });
  } else {
    init = await api("/post/publish/inbox/video/init/", token, { source_info: sourceInfo });
  }

  // Upload the file in chunks.
  const fh = await fs.open(mediaPath, "r");
  try {
    for (let i = 0; i < count; i++) {
      const start = i * chunkSize;
      const end = i === count - 1 ? media.size - 1 : start + chunkSize - 1;
      const len = end - start + 1;
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, start);
      const res = await fetch(init.upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": media.mime,
          "Content-Length": String(len),
          "Content-Range": `bytes ${start}-${end}/${media.size}`,
        },
        body: buf,
        signal: AbortSignal.timeout(30 * 60_000),
      });
      if (!res.ok) {
        throw new PlatformError(`TikTok upload (${res.status}): ${errorMessage(await res.text(), res.statusText)}`);
      }
    }
  } finally {
    await fh.close();
  }

  // Follow processing for a while so errors show up in the panel.
  const deadline = Date.now() + 5 * 60_000;
  let status = "PROCESSING_UPLOAD";
  while (Date.now() < deadline) {
    await sleep(5_000);
    const s = await api<{ status: string; fail_reason?: string; publicaly_available_post_id?: string[] }>(
      "/post/publish/status/fetch/",
      token,
      { publish_id: init.publish_id },
    );
    status = s.status;
    if (status === "FAILED") throw new PlatformError(`TikTok odrzucił film: ${s.fail_reason ?? "nieznany powód"}`);
    if (status === "SEND_TO_USER_INBOX" || status === "PUBLISH_COMPLETE") {
      const postId = s.publicaly_available_post_id?.[0];
      return {
        externalId: postId ?? init.publish_id,
        url: postId ? `https://www.tiktok.com/video/${postId}` : undefined,
        note:
          status === "SEND_TO_USER_INBOX"
            ? "Film czeka w powiadomieniach aplikacji TikTok — otwórz je, dodaj opis i opublikuj."
            : privacyUsed === "SELF_ONLY"
              ? "Opublikowano jako prywatny (aplikacja TikTok bez audytu pozwala tylko na to)."
              : undefined,
      };
    }
  }
  return {
    externalId: init.publish_id,
    note: `TikTok wciąż przetwarza film (status: ${status}). Sprawdź aplikację za kilka minut.`,
  };
}
