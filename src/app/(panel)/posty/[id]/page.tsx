import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PlatformIcon } from "@/components/PlatformIcon";
import { PLATFORM_LABELS } from "@/lib/config";
import { getPost } from "@/lib/db";
import { formatDateTime, POST_STATUS_LABELS, TARGET_STATUS_LABELS } from "@/lib/format";
import { PostActions } from "./PostActions";

function describeOptions(platform: string, raw: string): string | null {
  let o: Record<string, unknown> = {};
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (platform === "youtube") {
    const privacy = { public: "publiczny", unlisted: "niepubliczny", private: "prywatny" }[String(o.privacy)] ?? "publiczny";
    return `Tytuł: ${o.title || "(pierwsza linia opisu)"} · ${privacy}`;
  }
  if (platform === "tiktok") {
    return o.mode === "direct" ? `Publikacja bezpośrednia · ${o.privacy ?? "PUBLIC_TO_EVERYONE"}` : "Do skrzynki TikTok (wersja robocza)";
  }
  return null;
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = getPost(Number(id));
  if (!post) notFound();

  const due = post.status === "scheduled" && post.scheduled_at <= Date.now() + 30_000;
  const inProgress = post.status === "publishing" || due;
  const hasFailed = post.targets.some((t) => t.status === "failed");

  return (
    <div className="stack" style={{ gap: 24 }}>
      <AutoRefresh active={inProgress} />
      <div className="page-head">
        <div>
          <div className="small muted">
            <Link href="/posty">← Posty</Link>
          </div>
          <h1>Post #{post.id}</h1>
          <p className="subtitle">
            {post.status === "scheduled" ? "Zaplanowany na " : "Termin: "}
            {formatDateTime(post.scheduled_at)}
          </p>
        </div>
        <span className={`badge ${post.status}`} style={{ fontSize: 14, padding: "4px 12px" }}>
          {POST_STATUS_LABELS[post.status]}
        </span>
      </div>

      <div className="grid-2">
        <div className="stack">
          <div className="card stack">
            <h2 style={{ margin: 0 }}>Platformy</h2>
            {post.targets.length === 0 && <div className="muted">Konta tego posta zostały odłączone.</div>}
            {post.targets.map((t) => {
              const opts = describeOptions(t.platform, t.options);
              return (
                <div key={t.id} className="acc-option">
                  <div className="row">
                    <PlatformIcon platform={t.platform} />
                    <div className="grow">
                      <strong>{PLATFORM_LABELS[t.platform]}</strong> <span className="muted">{t.account_name}</span>
                    </div>
                    <span className={`badge ${t.status}`}>{TARGET_STATUS_LABELS[t.status]}</span>
                  </div>
                  {(opts || t.caption !== null || t.error || t.note || t.external_url || t.published_at) && (
                    <div className="acc-extra small">
                      {opts && <div className="muted">{opts}</div>}
                      {t.caption !== null && (
                        <div>
                          <span className="muted">Własny opis:</span> {t.caption || "(pusty)"}
                        </div>
                      )}
                      {t.error && <div className="alert alert-err">{t.error}</div>}
                      {t.note && <div className="alert alert-warn">{t.note}</div>}
                      {t.published_at && <div className="muted">Opublikowano {formatDateTime(t.published_at)}</div>}
                      {t.external_url && (
                        <a href={t.external_url} target="_blank" rel="noreferrer">
                          Zobacz na {PLATFORM_LABELS[t.platform]} ↗
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <PostActions
            postId={post.id}
            status={post.status}
            hasFailed={hasFailed}
            scheduledAt={post.scheduled_at}
          />
        </div>

        <div className="card stack">
          {post.media &&
            (post.media.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="preview-media" src={`/media/${post.media.filename}`} alt="" />
            ) : (
              <video className="preview-media" src={`/media/${post.media.filename}`} controls preload="metadata" />
            ))}
          <div style={{ whiteSpace: "pre-wrap" }}>{post.caption || <span className="muted">(bez opisu)</span>}</div>
        </div>
      </div>
    </div>
  );
}
