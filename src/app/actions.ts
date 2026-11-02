"use server";

import fs from "node:fs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { config, PLATFORM_LABELS, type Platform } from "@/lib/config";
import { dataPath, get, getAccount, getMedia, getPost, run, transaction } from "@/lib/db";
import { PLATFORM_RULES } from "@/lib/platforms";
import { tick } from "@/lib/scheduler";
import { createSessionToken, passwordMatches, SESSION_COOKIE } from "@/lib/session";

// ---------------------------------------------------------------------------
// Login

export async function login(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  if (!config.adminPassword || !config.sessionSecret) {
    return { error: "Ustaw ADMIN_PASSWORD i SESSION_SECRET w pliku .env." };
  }
  if (!(await passwordMatches(String(form.get("password") ?? "")))) {
    await new Promise((r) => setTimeout(r, 1000)); // slow down guessing
    return { error: "Nieprawidłowe hasło." };
  }
  const { token, expires } = await createSessionToken();
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.appUrl.startsWith("https://"),
    expires,
    path: "/",
  });
  redirect("/");
}

// ---------------------------------------------------------------------------
// Posts

export type NewPostInput = {
  caption: string;
  mediaId: string | null;
  /** ISO timestamp, or null = publish now. */
  scheduledAt: string | null;
  targets: { accountId: number; caption: string | null; options: Record<string, unknown> }[];
};

function startPublishingSoon() {
  // Do not block the response; the scheduler picks up everything that is due.
  setTimeout(() => void tick(), 200);
}

export async function createPost(input: NewPostInput): Promise<{ error?: string; id?: number }> {
  await requireAuth();

  const caption = String(input.caption ?? "");
  const media = input.mediaId ? getMedia(String(input.mediaId)) : undefined;
  if (input.mediaId && !media) return { error: "Nie znaleziono wgranego pliku — wgraj go ponownie." };
  if (!Array.isArray(input.targets) || input.targets.length === 0) return { error: "Wybierz co najmniej jedno konto." };

  const targets: { accountId: number; caption: string | null; options: string }[] = [];
  for (const t of input.targets) {
    const account = getAccount(Number(t.accountId));
    if (!account) return { error: "Wybrane konto nie istnieje (odśwież stronę)." };
    const platform = account.platform as Platform;
    const rules = PLATFORM_RULES[platform];
    const text = t.caption ?? caption;
    const label = `${PLATFORM_LABELS[platform]} (${account.name})`;
    if (rules.requiresMedia && !media) return { error: `${label}: wymagany jest plik.` };
    if (rules.videoOnly && media && media.kind !== "video") return { error: `${label}: wymagany jest film.` };
    if (rules.jpegOnly && media?.kind === "image" && media.mime !== "image/jpeg") {
      return { error: `${label}: zdjęcie musi być w formacie JPG.` };
    }
    if (!media && !text.trim()) return { error: `${label}: dodaj tekst albo plik.` };
    if (text.length > rules.captionLimit) {
      return { error: `${label}: opis jest za długi (${text.length}/${rules.captionLimit}).` };
    }
    targets.push({
      accountId: account.id,
      caption: t.caption === null || t.caption === undefined ? null : String(t.caption),
      options: JSON.stringify(t.options && typeof t.options === "object" ? t.options : {}),
    });
  }

  let scheduledAt = Date.now();
  if (input.scheduledAt) {
    const ts = Date.parse(input.scheduledAt);
    if (Number.isNaN(ts)) return { error: "Nieprawidłowa data publikacji." };
    scheduledAt = ts;
  }

  const now = Date.now();
  const postId = transaction(() => {
    const { lastId } = run(
      `INSERT INTO posts (caption, media_id, scheduled_at, status, created_at, updated_at) VALUES (?, ?, ?, 'scheduled', ?, ?)`,
      caption,
      media?.id ?? null,
      scheduledAt,
      now,
      now,
    );
    for (const t of targets) {
      run(
        `INSERT INTO post_targets (post_id, account_id, caption, options, status) VALUES (?, ?, ?, ?, 'pending')`,
        lastId,
        t.accountId,
        t.caption,
        t.options,
      );
    }
    return lastId;
  });

  if (scheduledAt <= Date.now()) startPublishingSoon();
  revalidatePath("/");
  return { id: postId };
}

export async function retryFailed(postId: number) {
  await requireAuth();
  const post = getPost(postId);
  if (!post || post.status === "publishing") return;
  transaction(() => {
    run(`UPDATE post_targets SET status = 'pending', error = NULL WHERE post_id = ? AND status = 'failed'`, postId);
    run(`UPDATE posts SET status = 'scheduled', scheduled_at = ?, updated_at = ? WHERE id = ?`, Date.now(), Date.now(), postId);
  });
  startPublishingSoon();
  revalidatePath(`/posty/${postId}`);
}

export async function publishNow(postId: number) {
  await requireAuth();
  run(
    `UPDATE posts SET scheduled_at = ?, updated_at = ? WHERE id = ? AND status = 'scheduled'`,
    Date.now(),
    Date.now(),
    postId,
  );
  startPublishingSoon();
  revalidatePath(`/posty/${postId}`);
}

export async function reschedule(postId: number, iso: string): Promise<{ error?: string }> {
  await requireAuth();
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return { error: "Nieprawidłowa data." };
  const r = run(
    `UPDATE posts SET scheduled_at = ?, updated_at = ? WHERE id = ? AND status = 'scheduled'`,
    ts,
    Date.now(),
    postId,
  );
  if (r.changes === 0) return { error: "Można zmienić termin tylko zaplanowanego posta." };
  if (ts <= Date.now()) startPublishingSoon();
  revalidatePath(`/posty/${postId}`);
  return {};
}

export async function deletePost(postId: number) {
  await requireAuth();
  const post = getPost(postId);
  if (!post) redirect("/posty");
  if (post.status === "publishing") throw new Error("Nie można usunąć posta w trakcie publikacji.");
  run(`DELETE FROM posts WHERE id = ?`, postId);
  // Remove the file if no other post uses it.
  if (post.media) {
    const used = get<{ n: number }>(`SELECT COUNT(*) AS n FROM posts WHERE media_id = ?`, post.media.id);
    if (!used?.n) {
      run(`DELETE FROM media WHERE id = ?`, post.media.id);
      fs.rmSync(dataPath("uploads", post.media.filename), { force: true });
    }
  }
  revalidatePath("/");
  redirect("/posty");
}

// ---------------------------------------------------------------------------
// Accounts

export async function removeAccount(accountId: number) {
  await requireAuth();
  const busy = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM post_targets WHERE account_id = ? AND status = 'publishing'`,
    accountId,
  );
  if (busy?.n) redirect(`/konta?error=${encodeURIComponent("To konto właśnie publikuje — spróbuj za chwilę.")}`);
  run(`DELETE FROM accounts WHERE id = ?`, accountId);
  revalidatePath("/konta");
  redirect(`/konta?ok=${encodeURIComponent("Konto odłączone.")}`);
}

// ---------------------------------------------------------------------------
// Settings (API keys)

export async function saveSettings(form: FormData) {
  await requireAuth();
  const { SETTING_KEYS, SECRET_KEYS, setSetting } = await import("@/lib/settings");
  for (const key of SETTING_KEYS) {
    const raw = form.get(key);
    if (raw === null) continue;
    const value = String(raw).trim();
    // Secrets are never sent back to the browser: an empty field means "keep the saved value".
    if (SECRET_KEYS.includes(key) && value === "") continue;
    setSetting(key, value);
  }
  revalidatePath("/", "layout");
  redirect(`/ustawienia?ok=${encodeURIComponent("Zapisano ustawienia.")}`);
}
