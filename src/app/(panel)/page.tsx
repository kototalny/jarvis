import Link from "next/link";
import { PlatformIcon } from "@/components/PlatformIcon";
import { listAccounts, listPosts, listUpcoming, type PostWithTargets } from "@/lib/db";
import { dayKey, formatDateTime, formatTime, POST_STATUS_LABELS, zonedMidnight } from "@/lib/format";
import type { Platform } from "@/lib/platform-meta";

const MONTHS = [
  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
];
const WEEKDAYS = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function uniquePlatforms(p: PostWithTargets): Platform[] {
  return [...new Set(p.targets.map((t) => t.platform))];
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const todayKey = dayKey(Date.now());
  const [ty, tm] = todayKey.split("-").map(Number);
  const match = m?.match(/^(\d{4})-(\d{2})$/);
  const year = match ? Number(match[1]) : ty;
  const month0 = match ? Number(match[2]) - 1 : tm - 1;

  // Grid: Monday-first weeks covering the whole month.
  const first = new Date(Date.UTC(year, month0, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const totalCells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: totalCells }, (_, i) => {
    const d = new Date(Date.UTC(year, month0, 1 - lead + i));
    return {
      key: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month0,
      y: d.getUTCFullYear(),
      m0: d.getUTCMonth(),
    };
  });

  const from = zonedMidnight(cells[0].y, cells[0].m0, cells[0].day);
  const lastCell = cells[cells.length - 1];
  const to = zonedMidnight(lastCell.y, lastCell.m0, lastCell.day + 1);
  const posts = listPosts({ from, to });
  const byDay = new Map<string, PostWithTargets[]>();
  for (const p of posts) {
    const k = dayKey(p.scheduled_at);
    byDay.set(k, [...(byDay.get(k) ?? []), p]);
  }

  const prev = new Date(Date.UTC(year, month0 - 1, 1));
  const next = new Date(Date.UTC(year, month0 + 1, 1));
  const monthParam = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;

  const upcoming = listUpcoming(8);
  const hasAccounts = listAccounts().length > 0;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="page-head">
        <div>
          <h1>
            {MONTHS[month0]} {year}
          </h1>
          <p className="subtitle">Kalendarz publikacji</p>
        </div>
        <div className="row">
          <Link className="btn" href={`/?m=${monthParam(prev)}`} aria-label="Poprzedni miesiąc">
            ←
          </Link>
          <Link className="btn" href="/">
            Dziś
          </Link>
          <Link className="btn" href={`/?m=${monthParam(next)}`} aria-label="Następny miesiąc">
            →
          </Link>
          <Link className="btn btn-primary" href="/nowy">
            + Nowy post
          </Link>
        </div>
      </div>

      {!hasAccounts && (
        <div className="alert alert-info">
          Nie masz jeszcze podłączonych kont. <Link href="/konta">Podłącz pierwsze konto →</Link>
        </div>
      )}

      <div className="cal">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-head">
            {w}
          </div>
        ))}
        {cells.map((c) => (
          <div
            key={c.key}
            className={`cal-day${c.inMonth ? "" : " other"}${c.key === todayKey ? " today" : ""}`}
          >
            <div className="cal-num">
              <span>{c.day}</span>
              {c.key >= todayKey && (
                <Link className="add" href={`/nowy?dzien=${c.key}`} title="Zaplanuj post na ten dzień">
                  +
                </Link>
              )}
            </div>
            {(byDay.get(c.key) ?? []).map((p) => (
              <Link key={p.id} href={`/posty/${p.id}`} className={`cal-post ${p.status}`} title={p.caption}>
                <span className="t">{formatTime(p.scheduled_at)}</span>
                {uniquePlatforms(p).map((pl) => (
                  <PlatformIcon key={pl} platform={pl} />
                ))}
                <span className="c">{p.caption || p.media?.original_name || "(bez opisu)"}</span>
              </Link>
            ))}
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Najbliższe publikacje</h2>
        {upcoming.length === 0 ? (
          <div className="empty">Brak zaplanowanych postów.</div>
        ) : (
          <div className="list">
            {upcoming.map((p) => (
              <Link key={p.id} href={`/posty/${p.id}`} className="list-item" style={{ textDecoration: "none" }}>
                <div style={{ width: 150 }} className="small muted">
                  {formatDateTime(p.scheduled_at)}
                </div>
                <div className="row" style={{ gap: 4 }}>
                  {uniquePlatforms(p).map((pl) => (
                    <PlatformIcon key={pl} platform={pl} />
                  ))}
                </div>
                <div className="grow truncate">{p.caption || p.media?.original_name || "(bez opisu)"}</div>
                <span className={`badge ${p.status}`}>{POST_STATUS_LABELS[p.status]}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
