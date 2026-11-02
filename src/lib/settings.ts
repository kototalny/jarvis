import { db } from "./db";

/** API keys that can be set in the panel (Ustawienia). Values in the panel override .env. */
export const SETTING_KEYS = [
  "META_APP_ID",
  "META_APP_SECRET",
  "META_CONFIG_ID",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "TIKTOK_CLIENT_KEY",
  "TIKTOK_CLIENT_SECRET",
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export const SECRET_KEYS: SettingKey[] = ["META_APP_SECRET", "GOOGLE_CLIENT_SECRET", "TIKTOK_CLIENT_SECRET"];

export function getSetting(key: SettingKey): string {
  const row = db().prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined;
  const v = row?.value?.trim();
  return v || (process.env[key] ?? "").trim();
}

export function setSetting(key: SettingKey, value: string) {
  db()
    .prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(key, value.trim());
}
