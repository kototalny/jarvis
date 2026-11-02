import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PlatformIcon } from "@/components/PlatformIcon";
import { listPosts } from "@/lib/db";
import { formatDateTime, POST_STATUS_LABELS } from "@/lib/format";

export default function PostsPage() {
  const posts = listPosts({ order: "desc", limit: 200 });
  return (
    <div className="stack" style={{ gap: 24 }}>
      <AutoRefresh active={posts.some((p) => p.status === "publishing")} />
      <div className="page-head">
        <div>
          <h1>Posty</h1>
          <p className="subtitle">Wszystkie zaplanowane i opublikowane posty.</p>
        </div>
        <Link className="btn btn-primary" href="/nowy">
          + Nowy post
        </Link>
      </div>
      <div className="card">
        {posts.length === 0 ? (
          <div className="empty">
            Nie ma jeszcze żadnych postów. <Link href="/nowy">Utwórz pierwszy →</Link>
          </div>
        ) : (
          <div className="list">
            {posts.map((p) => (
              <Link key={p.id} href={`/posty/${p.id}`} className="list-item" style={{ textDecoration: "none" }}>
                {p.media ? (
                  p.media.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="thumb" src={`/media/${p.media.filename}`} alt="" />
                  ) : (
                    <video className="thumb" src={`/media/${p.media.filename}#t=0.5`} muted preload="metadata" />
                  )
                ) : (
                  <div className="thumb" />
                )}
                <div className="grow">
                  <div className="truncate">{p.caption || p.media?.original_name || "(bez opisu)"}</div>
                  <div className="row small muted" style={{ gap: 6, marginTop: 4 }}>
                    {formatDateTime(p.scheduled_at)} ·
                    {p.targets.map((t) => (
                      <span key={t.id} className="row" style={{ gap: 4 }} title={t.account_name}>
                        <PlatformIcon platform={t.platform} />
                      </span>
                    ))}
                  </div>
                </div>
                <span className={`badge ${p.status}`}>{POST_STATUS_LABELS[p.status]}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
