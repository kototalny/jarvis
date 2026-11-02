import { config } from "./config";
import type { PostStatus, TargetStatus } from "./db";

export function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: config.timezone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(ms);
}

export function formatTime(ms: number): string {
  return new Intl.DateTimeFormat("pl-PL", { timeZone: config.timezone, hour: "2-digit", minute: "2-digit" }).format(ms);
}

/** "YYYY-MM-DD" of a timestamp in the app timezone. */
export function dayKey(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);
}

/** Offset (ms) of the app timezone from UTC at a given instant. */
function tzOffset(ms: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: config.timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(ms);
  const v = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second")) - (ms - (ms % 1000));
}

/** Timestamp of local midnight (app timezone) for a calendar date. */
export function zonedMidnight(year: number, month0: number, day: number): number {
  const guess = Date.UTC(year, month0, day);
  const first = guess - tzOffset(guess);
  return guess - tzOffset(first);
}

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  scheduled: "Zaplanowany",
  publishing: "Publikowanie…",
  published: "Opublikowany",
  partial: "Częściowo",
  failed: "Błąd",
};

export const TARGET_STATUS_LABELS: Record<TargetStatus, string> = {
  pending: "Oczekuje",
  publishing: "Publikowanie…",
  published: "Opublikowano",
  failed: "Błąd",
};
