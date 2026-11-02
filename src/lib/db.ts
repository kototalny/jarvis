import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { config, type Platform } from "./config";

// node:sqlite is loaded at runtime so the bundler never tries to resolve it.
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");

export type Account = {
  id: number;
  platform: Platform;
  external_id: string;
  name: string;
  avatar_url: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: number | null;
  extra: string; // JSON
  created_at: number;
};

export type MediaKind = "image" | "video";

export type Media = {
  id: string;
  filename: string;
  original_name: string;
  mime: string;
  size: number;
  kind: MediaKind;
  created_at: number;
};

export type PostStatus = "scheduled" | "publishing" | "published" | "partial" | "failed";
export type TargetStatus = "pending" | "publishing" | "published" | "failed";

export type Post = {
  id: number;
  caption: string;
  media_id: string | null;
  scheduled_at: number;
  status: PostStatus;
  created_at: number;
  updated_at: number;
};

export type PostTarget = {
  id: number;
  post_id: number;
  account_id: number;
  caption: string | null;
  options: string; // JSON
  status: TargetStatus;
  error: string | null;
  note: string | null;
  external_id: string | null;
  external_url: string | null;
  published_at: number | null;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at INTEGER,
  extra TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  UNIQUE(platform, external_id)
);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caption TEXT NOT NULL DEFAULT '',
  media_id TEXT REFERENCES media(id),
  scheduled_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_due ON posts(status, scheduled_at);

CREATE TABLE IF NOT EXISTS post_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  caption TEXT,
  options TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL,
  error TEXT,
  note TEXT,
  external_id TEXT,
  external_url TEXT,
  published_at INTEGER
);
CREATE INDEX IF NOT EXISTS post_targets_post ON post_targets(post_id);
`;

declare global {
  // eslint-disable-next-line no-var
  var __jarvisDb: DatabaseSyncType | undefined;
}

export function dataPath(...parts: string[]): string {
  return path.resolve(config.dataDir, ...parts);
}

export function db(): DatabaseSyncType {
  if (!globalThis.__jarvisDb) {
    fs.mkdirSync(dataPath("uploads"), { recursive: true });
    const conn = new DatabaseSync(dataPath("jarvis.db"));
    conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    conn.exec(SCHEMA);
    globalThis.__jarvisDb = conn;
  }
  return globalThis.__jarvisDb;
}

type SqlValue = string | number | null;

export function all<T>(sql: string, ...params: SqlValue[]): T[] {
  return db().prepare(sql).all(...params) as T[];
}

export function get<T>(sql: string, ...params: SqlValue[]): T | undefined {
  return db().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: SqlValue[]) {
  const r = db().prepare(sql).run(...params);
  return { changes: Number(r.changes), lastId: Number(r.lastInsertRowid) };
}

export function transaction<T>(fn: () => T): T {
  const conn = db();
  conn.exec("BEGIN");
  try {
    const result = fn();
    conn.exec("COMMIT");
    return result;
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Accounts

export function upsertAccount(a: {
  platform: Platform;
  external_id: string;
  name: string;
  avatar_url?: string | null;
  access_token: string;
  refresh_token?: string | null;
  token_expires_at?: number | null;
  extra?: Record<string, unknown>;
}) {
  run(
    `INSERT INTO accounts (platform, external_id, name, avatar_url, access_token, refresh_token, token_expires_at, extra, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(platform, external_id) DO UPDATE SET
       name = excluded.name,
       avatar_url = excluded.avatar_url,
       access_token = excluded.access_token,
       refresh_token = COALESCE(excluded.refresh_token, accounts.refresh_token),
       token_expires_at = excluded.token_expires_at,
       extra = excluded.extra`,
    a.platform,
    a.external_id,
    a.name,
    a.avatar_url ?? null,
    a.access_token,
    a.refresh_token ?? null,
    a.token_expires_at ?? null,
    JSON.stringify(a.extra ?? {}),
    Date.now(),
  );
}

export function updateAccountTokens(id: number, accessToken: string, refreshToken: string | null, expiresAt: number | null) {
  run(
    `UPDATE accounts SET access_token = ?, refresh_token = COALESCE(?, refresh_token), token_expires_at = ? WHERE id = ?`,
    accessToken,
    refreshToken,
    expiresAt,
    id,
  );
}

export function listAccounts(): Account[] {
  return all<Account>(`SELECT * FROM accounts ORDER BY platform, name`);
}

export function getAccount(id: number): Account | undefined {
  return get<Account>(`SELECT * FROM accounts WHERE id = ?`, id);
}

// ---------------------------------------------------------------------------
// Media

export function getMedia(id: string): Media | undefined {
  return get<Media>(`SELECT * FROM media WHERE id = ?`, id);
}

export function getMediaByFilename(filename: string): Media | undefined {
  return get<Media>(`SELECT * FROM media WHERE filename = ?`, filename);
}

// ---------------------------------------------------------------------------
// Posts

export type PostWithTargets = Post & {
  media: Media | null;
  targets: (PostTarget & { account_name: string; platform: Platform })[];
};

export function getPost(id: number): PostWithTargets | undefined {
  const post = get<Post>(`SELECT * FROM posts WHERE id = ?`, id);
  if (!post) return undefined;
  return hydrate([post])[0];
}

export function listPosts(opts: { from?: number; to?: number; limit?: number; order?: "asc" | "desc" } = {}): PostWithTargets[] {
  const where: string[] = [];
  const params: SqlValue[] = [];
  if (opts.from !== undefined) {
    where.push("scheduled_at >= ?");
    params.push(opts.from);
  }
  if (opts.to !== undefined) {
    where.push("scheduled_at < ?");
    params.push(opts.to);
  }
  const sql =
    `SELECT * FROM posts` +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    ` ORDER BY scheduled_at ${opts.order === "desc" ? "DESC" : "ASC"}` +
    (opts.limit ? ` LIMIT ${Math.floor(opts.limit)}` : "");
  return hydrate(all<Post>(sql, ...params));
}

export function listUpcoming(limit = 10): PostWithTargets[] {
  return hydrate(
    all<Post>(
      `SELECT * FROM posts WHERE status IN ('scheduled', 'publishing') ORDER BY scheduled_at ASC LIMIT ?`,
      limit,
    ),
  );
}

function hydrate(posts: Post[]): PostWithTargets[] {
  if (posts.length === 0) return [];
  const ids = posts.map((p) => p.id);
  const placeholders = ids.map(() => "?").join(",");
  const targets = all<PostTarget & { account_name: string; platform: Platform }>(
    `SELECT t.*, a.name AS account_name, a.platform AS platform
     FROM post_targets t JOIN accounts a ON a.id = t.account_id
     WHERE t.post_id IN (${placeholders})
     ORDER BY a.platform, a.name`,
    ...ids,
  );
  const mediaIds = [...new Set(posts.map((p) => p.media_id).filter((m): m is string => !!m))];
  const media = mediaIds.length
    ? all<Media>(`SELECT * FROM media WHERE id IN (${mediaIds.map(() => "?").join(",")})`, ...mediaIds)
    : [];
  const mediaById = new Map(media.map((m) => [m.id, m]));
  return posts.map((p) => ({
    ...p,
    media: p.media_id ? mediaById.get(p.media_id) ?? null : null,
    targets: targets.filter((t) => t.post_id === p.id),
  }));
}

/** Recomputes a post's overall status from its targets (after publishing finishes). */
export function finalizePostStatus(postId: number) {
  const targets = all<{ status: TargetStatus }>(`SELECT status FROM post_targets WHERE post_id = ?`, postId);
  const ok = targets.filter((t) => t.status === "published").length;
  const failed = targets.filter((t) => t.status === "failed").length;
  let status: PostStatus;
  if (targets.length > 0 && ok === targets.length) status = "published";
  else if (ok > 0) status = "partial";
  else if (failed > 0 || targets.length === 0) status = "failed";
  else status = "scheduled";
  run(`UPDATE posts SET status = ?, updated_at = ? WHERE id = ?`, status, Date.now(), postId);
}
