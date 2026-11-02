import type { Account, Media } from "../db";

export type PublishInput = {
  account: Account;
  caption: string;
  media: Media | null;
  /** Absolute path of the media file on disk. */
  mediaPath: string | null;
  /** Public HTTPS URL of the media file (platforms that pull files fetch it from here). */
  mediaUrl: string | null;
  options: Record<string, unknown>;
};

export type PublishResult = {
  externalId?: string;
  url?: string;
  /** Extra information shown next to the result, e.g. "finish in the TikTok app". */
  note?: string;
};

export class PlatformError extends Error {}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Turns an error response body into a short, readable message. */
export function errorMessage(text: string, fallback: string): string {
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // not JSON
  }
  return (
    body?.error?.error_user_msg ||
    body?.error?.message ||
    body?.error_description ||
    (typeof body?.error === "string" ? body.error : null) ||
    text.slice(0, 300) ||
    fallback
  );
}

/** fetch + JSON parsing with a readable error message. */
export async function fetchJson<T = any>(url: string, init: RequestInit = {}, label = "API"): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(60_000) });
  } catch (e) {
    throw new PlatformError(`${label}: błąd połączenia (${(e as Error).message})`);
  }
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // not JSON
  }
  if (!res.ok) {
    throw new PlatformError(`${label} (${res.status}): ${errorMessage(text, res.statusText)}`);
  }
  return body as T;
}

export function parseExtra<T = Record<string, unknown>>(account: Account): T {
  try {
    return JSON.parse(account.extra || "{}") as T;
  } catch {
    return {} as T;
  }
}
