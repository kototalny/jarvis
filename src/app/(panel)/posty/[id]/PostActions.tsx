"use client";

import { useState, useTransition } from "react";
import { deletePost, publishNow, reschedule, retryFailed } from "../../../actions";
import type { PostStatus } from "@/lib/db";

function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function PostActions(props: { postId: number; status: PostStatus; hasFailed: boolean; scheduledAt: number }) {
  const { postId, status, hasFailed } = props;
  const [pending, start] = useTransition();
  const [when, setWhen] = useState(() => toLocalInput(props.scheduledAt));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (status === "publishing") {
    return <div className="alert alert-warn">Trwa publikacja… strona odświeża się automatycznie.</div>;
  }

  return (
    <div className="card stack">
      <h2 style={{ margin: 0 }}>Akcje</h2>
      {status === "scheduled" && (
        <>
          <label className="field">
            Zmień termin
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              <button
                className="btn"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    setSaved(false);
                    const r = await reschedule(postId, new Date(when).toISOString());
                    if (r.error) setError(r.error);
                    else setSaved(true);
                  })
                }
              >
                Zapisz
              </button>
            </div>
          </label>
          {saved && <div className="alert alert-ok">Zapisano nowy termin.</div>}
          <button className="btn btn-primary" disabled={pending} onClick={() => start(() => publishNow(postId))}>
            Opublikuj teraz
          </button>
        </>
      )}
      {hasFailed && (
        <button className="btn btn-primary" disabled={pending} onClick={() => start(() => retryFailed(postId))}>
          Ponów nieudane publikacje
        </button>
      )}
      {error && <div className="alert alert-err">{error}</div>}
      <button
        className="btn btn-danger"
        disabled={pending}
        onClick={() => {
          const msg =
            status === "scheduled"
              ? "Usunąć ten post? Nie zostanie opublikowany."
              : "Usunąć post z panelu? (Nie usuwa go z platform, na których już się ukazał.)";
          if (confirm(msg)) start(() => deletePost(postId));
        }}
      >
        Usuń post
      </button>
    </div>
  );
}
