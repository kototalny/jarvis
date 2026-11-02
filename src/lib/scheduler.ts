import { all, run } from "./db";
import { publishPost } from "./publish";

const INTERVAL_MS = 20_000;

declare global {
  // eslint-disable-next-line no-var
  var __jarvisScheduler: { timer: NodeJS.Timeout; running: boolean } | undefined;
}

/** Picks up posts whose time has come. Safe to call any time (e.g. right after "publish now"). */
export async function tick() {
  const state = globalThis.__jarvisScheduler;
  if (!state || state.running) return;
  state.running = true;
  try {
    const due = all<{ id: number }>(
      `SELECT id FROM posts WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at`,
      Date.now(),
    );
    const claimed = due.filter(
      (p) =>
        run(`UPDATE posts SET status = 'publishing', updated_at = ? WHERE id = ? AND status = 'scheduled'`, Date.now(), p.id)
          .changes === 1,
    );
    await Promise.allSettled(claimed.map((p) => publishPost(p.id)));
  } catch (e) {
    console.error("[jarvis] błąd harmonogramu:", e);
  } finally {
    state.running = false;
  }
}

export function startScheduler() {
  if (globalThis.__jarvisScheduler) return;

  // A restart in the middle of publishing leaves targets in an unknown state.
  // Mark them failed instead of retrying automatically, to avoid double posts.
  try {
    const stuck = run(
      `UPDATE post_targets SET status = 'failed',
         error = 'Publikacja przerwana (restart serwera). Sprawdź platformę i w razie potrzeby ponów.'
       WHERE status = 'publishing'`,
    );
    run(`UPDATE posts SET status = 'failed' WHERE status = 'publishing'`);
    if (stuck.changes) console.warn(`[jarvis] oznaczono ${stuck.changes} przerwanych publikacji jako nieudane`);
  } catch (e) {
    console.error("[jarvis] nie udało się otworzyć bazy danych:", e);
  }

  globalThis.__jarvisScheduler = { timer: setInterval(tick, INTERVAL_MS), running: false };
  setTimeout(tick, 3_000);
  console.log("[jarvis] harmonogram publikacji uruchomiony");
}
