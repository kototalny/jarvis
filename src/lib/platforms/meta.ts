// Facebook Pages + Instagram (Business/Creator) via the Meta Graph API.
import { config, redirectUri } from "../config";
import { upsertAccount } from "../db";
import { fetchJson, PlatformError, sleep, type PublishInput, type PublishResult } from "./common";

const SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "business_management",
  "instagram_basic",
  "instagram_content_publish",
];

const graph = () => `https://graph.facebook.com/${config.meta.graphVersion}`;

export function metaAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: config.meta.appId,
    redirect_uri: redirectUri("meta"),
    state,
    response_type: "code",
  });
  // "Facebook Login for Business" apps use a configuration ID that lists the permissions.
  if (config.meta.configId) p.set("config_id", config.meta.configId);
  else p.set("scope", SCOPES.join(","));
  return `https://www.facebook.com/${config.meta.graphVersion}/dialog/oauth?${p}`;
}

type PageInfo = {
  id: string;
  name: string;
  access_token: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username?: string; profile_picture_url?: string };
};

/** Exchanges the OAuth code and saves every Facebook Page (and its linked Instagram account). */
export async function metaHandleCallback(code: string): Promise<string> {
  const short = await fetchJson<{ access_token: string }>(
    `${graph()}/oauth/access_token?` +
      new URLSearchParams({
        client_id: config.meta.appId,
        client_secret: config.meta.appSecret,
        redirect_uri: redirectUri("meta"),
        code,
      }),
    {},
    "Meta",
  );
  // Long-lived user token -> page tokens derived from it do not expire.
  const long = await fetchJson<{ access_token: string }>(
    `${graph()}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: config.meta.appId,
        client_secret: config.meta.appSecret,
        fb_exchange_token: short.access_token,
      }),
    {},
    "Meta",
  );
  const pages = await fetchJson<{ data: PageInfo[] }>(
    `${graph()}/me/accounts?` +
      new URLSearchParams({
        fields: "id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}",
        limit: "100",
        access_token: long.access_token,
      }),
    {},
    "Meta",
  );

  let fb = 0;
  let ig = 0;
  for (const page of pages.data ?? []) {
    upsertAccount({
      platform: "facebook",
      external_id: page.id,
      name: page.name,
      avatar_url: page.picture?.data?.url ?? null,
      access_token: page.access_token,
    });
    fb++;
    const igAcc = page.instagram_business_account;
    if (igAcc) {
      upsertAccount({
        platform: "instagram",
        external_id: igAcc.id,
        name: igAcc.username ? `@${igAcc.username}` : `Instagram (${page.name})`,
        avatar_url: igAcc.profile_picture_url ?? null,
        // Instagram publishing uses the token of the Facebook Page it is linked to.
        access_token: page.access_token,
        extra: { pageId: page.id, pageName: page.name },
      });
      ig++;
    }
  }
  if (fb === 0) {
    throw new PlatformError(
      "Nie znaleziono żadnej strony na Facebooku. Upewnij się, że przy logowaniu zaznaczyłeś swoje strony.",
    );
  }
  return `Połączono: ${fb} ${fb === 1 ? "strona" : "strony"} Facebook, ${ig} ${ig === 1 ? "konto" : "konta"} Instagram.`;
}

async function graphPost<T = any>(path: string, params: Record<string, string>, token: string): Promise<T> {
  return fetchJson<T>(
    `${graph()}/${path}`,
    {
      method: "POST",
      body: new URLSearchParams({ ...params, access_token: token }),
      signal: AbortSignal.timeout(5 * 60_000),
    },
    "Meta",
  );
}

async function graphGet<T = any>(path: string, params: Record<string, string>, token: string): Promise<T> {
  return fetchJson<T>(`${graph()}/${path}?${new URLSearchParams({ ...params, access_token: token })}`, {}, "Meta");
}

export async function publishFacebook(input: PublishInput): Promise<PublishResult> {
  const { account, caption, media, mediaUrl } = input;
  const pageId = account.external_id;
  const token = account.access_token;

  if (!media || !mediaUrl) {
    if (!caption.trim()) throw new PlatformError("Post na Facebooku musi mieć tekst albo plik.");
    const r = await graphPost<{ id: string }>(`${pageId}/feed`, { message: caption }, token);
    return { externalId: r.id, url: `https://www.facebook.com/${r.id}` };
  }
  if (media.kind === "image") {
    const r = await graphPost<{ id: string; post_id?: string }>(
      `${pageId}/photos`,
      { url: mediaUrl, message: caption },
      token,
    );
    const id = r.post_id ?? r.id;
    return { externalId: id, url: `https://www.facebook.com/${id}` };
  }
  const r = await graphPost<{ id: string }>(`${pageId}/videos`, { file_url: mediaUrl, description: caption }, token);
  return {
    externalId: r.id,
    url: `https://www.facebook.com/${pageId}/videos/${r.id}`,
    note: "Facebook przetwarza film — może pojawić się na stronie po kilku minutach.",
  };
}

export async function publishInstagram(input: PublishInput): Promise<PublishResult> {
  const { account, caption, media, mediaUrl } = input;
  if (!media || !mediaUrl) throw new PlatformError("Instagram wymaga zdjęcia albo filmu.");
  if (media.kind === "image" && media.mime !== "image/jpeg") {
    throw new PlatformError("Instagram przyjmuje przez API tylko zdjęcia JPEG.");
  }
  const igId = account.external_id;
  const token = account.access_token;

  const containerParams: Record<string, string> =
    media.kind === "image"
      ? { image_url: mediaUrl, caption }
      : { media_type: "REELS", video_url: mediaUrl, caption, share_to_feed: "true" };
  const container = await graphPost<{ id: string }>(`${igId}/media`, containerParams, token);

  // Wait for Instagram to download and process the file (videos can take a few minutes).
  const deadline = Date.now() + 15 * 60_000;
  for (;;) {
    const s = await graphGet<{ status_code?: string; status?: string }>(
      container.id,
      { fields: "status_code,status" },
      token,
    );
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
      throw new PlatformError(`Instagram odrzucił plik: ${s.status ?? s.status_code}`);
    }
    if (Date.now() > deadline) throw new PlatformError("Instagram zbyt długo przetwarza plik (ponad 15 min).");
    await sleep(media.kind === "image" ? 2_000 : 8_000);
  }

  const published = await graphPost<{ id: string }>(`${igId}/media_publish`, { creation_id: container.id }, token);
  let url: string | undefined;
  try {
    url = (await graphGet<{ permalink?: string }>(published.id, { fields: "permalink" }, token)).permalink;
  } catch {
    // permalink is optional
  }
  return { externalId: published.id, url };
}
