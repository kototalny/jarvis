"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { PLATFORM_LABELS, type Platform } from "@/lib/config";
import type { PLATFORM_RULES } from "@/lib/platforms";
import { createPost } from "../../actions";

export type EditorAccount = { id: number; platform: Platform; name: string; avatarUrl: string | null };

type Uploaded = { id: string; kind: "image" | "video"; mime: string; size: number; path: string; name: string };

type TargetState = {
  on: boolean;
  customCaption: boolean;
  caption: string;
  title: string; // YouTube
  privacy: string; // YouTube / TikTok
  mode: "inbox" | "direct"; // TikTok
};

const ORDER: Platform[] = ["facebook", "instagram", "youtube", "tiktok"];

function defaultTarget(platform: Platform): TargetState {
  return {
    on: false,
    customCaption: false,
    caption: "",
    title: "",
    privacy: platform === "tiktok" ? "PUBLIC_TO_EVERYONE" : "public",
    mode: "inbox",
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function defaultWhen(initialDay: string | null): string {
  if (initialDay) return `${initialDay}T12:00`;
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

function formatSize(bytes: number) {
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function PostEditor(props: {
  accounts: EditorAccount[];
  rules: typeof PLATFORM_RULES;
  initialDay: string | null;
}) {
  const { accounts, rules } = props;
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [caption, setCaption] = useState("");
  const [media, setMedia] = useState<Uploaded | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const [targets, setTargets] = useState<Record<number, TargetState>>(() =>
    Object.fromEntries(accounts.map((a) => [a.id, { ...defaultTarget(a.platform), on: accounts.length === 1 }])),
  );
  const [when, setWhen] = useState<"now" | "later">(props.initialDay ? "later" : "now");
  const [dateTime, setDateTime] = useState(() => defaultWhen(props.initialDay));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const sorted = useMemo(
    () => [...accounts].sort((a, b) => ORDER.indexOf(a.platform) - ORDER.indexOf(b.platform) || a.name.localeCompare(b.name)),
    [accounts],
  );

  const update = (id: number, patch: Partial<TargetState>) =>
    setTargets((t) => ({ ...t, [id]: { ...t[id], ...patch } }));

  function upload(file: File) {
    setError(null);
    const okTypes = ["image/jpeg", "image/png", "video/mp4", "video/quicktime"];
    if (!okTypes.includes(file.type)) {
      setError("Dozwolone pliki: JPG, PNG, MP4, MOV.");
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media");
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setProgress(null);
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // ignore
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.id) {
        setMedia({ id: body.id, kind: body.kind, mime: body.mime, size: body.size, path: body.path, name: file.name });
      } else {
        setError(body?.error || `Nie udało się wgrać pliku (HTTP ${xhr.status}).`);
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Błąd sieci podczas wgrywania pliku.");
    };
    setProgress(0);
    xhr.send(file);
  }

  /** Problems that block publishing to a given account with the current media. */
  function problemFor(platform: Platform): string | null {
    const r = rules[platform];
    if (r.requiresMedia && !media) return r.videoOnly ? "wymaga filmu" : "wymaga zdjęcia lub filmu";
    if (r.videoOnly && media && media.kind !== "video") return "wymaga filmu";
    if (r.jpegOnly && media?.kind === "image" && media.mime !== "image/jpeg") return "zdjęcie musi być JPG";
    return null;
  }

  function submit() {
    setError(null);
    const chosen = sorted.filter((a) => targets[a.id]?.on);
    if (chosen.length === 0) return setError("Wybierz co najmniej jedno konto.");
    for (const a of chosen) {
      const p = problemFor(a.platform);
      if (p) return setError(`${PLATFORM_LABELS[a.platform]} (${a.name}): ${p}.`);
    }
    let scheduledAt: string | null = null;
    if (when === "later") {
      const d = new Date(dateTime);
      if (Number.isNaN(d.getTime())) return setError("Podaj poprawną datę i godzinę.");
      if (d.getTime() < Date.now() - 60_000) return setError("Ta data już minęła.");
      scheduledAt = d.toISOString();
    }
    start(async () => {
      const res = await createPost({
        caption,
        mediaId: media?.id ?? null,
        scheduledAt,
        targets: chosen.map((a) => {
          const t = targets[a.id];
          const options: Record<string, unknown> = {};
          if (a.platform === "youtube") Object.assign(options, { title: t.title, privacy: t.privacy });
          if (a.platform === "tiktok") Object.assign(options, { mode: t.mode, privacy: t.privacy });
          return { accountId: a.id, caption: t.customCaption ? t.caption : null, options };
        }),
      });
      if (res.error) setError(res.error);
      else if (res.id) router.push(`/posty/${res.id}`);
    });
  }

  const chosenPlatforms = [...new Set(sorted.filter((a) => targets[a.id]?.on).map((a) => a.platform))];
  const tightestLimit = chosenPlatforms.length
    ? Math.min(...chosenPlatforms.map((p) => rules[p].captionLimit))
    : null;

  return (
    <div className="grid-2">
      <div className="stack">
        <div className="card stack">
          <h2 style={{ margin: 0 }}>Plik</h2>
          {media ? (
            <div className="stack" style={{ gap: 10 }}>
              {media.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="preview-media" src={media.path} alt="" />
              ) : (
                <video className="preview-media" src={media.path} controls preload="metadata" />
              )}
              <div className="row small">
                <span className="grow truncate muted">
                  {media.name} · {formatSize(media.size)}
                </span>
                <button className="btn btn-sm" onClick={() => setMedia(null)}>
                  Usuń
                </button>
              </div>
            </div>
          ) : progress !== null ? (
            <div className="stack" style={{ gap: 8 }}>
              <div className="small muted">Wgrywanie… {progress}%</div>
              <div className="progress">
                <div style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : (
            <label
              className={`dropzone${drag ? " drag" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const f = e.dataTransfer.files?.[0];
                if (f) upload(f);
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Przeciągnij plik albo kliknij, aby wybrać</div>
              <div className="small">Zdjęcie JPG/PNG albo film MP4/MOV. Na TikTok i YouTube Shorts najlepiej pionowy film 9:16.</div>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,video/mp4,video/quicktime"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>

        <div className="card stack">
          <label className="field">
            Opis
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Treść posta, hashtagi…"
            />
          </label>
          {tightestLimit !== null && (
            <div className={`counter${caption.length > tightestLimit ? " over" : ""}`}>
              {caption.length} / {tightestLimit}
            </div>
          )}
        </div>
      </div>

      <div className="stack">
        <div className="card stack">
          <h2 style={{ margin: 0 }}>Gdzie publikować</h2>
          {sorted.map((a) => {
            const t = targets[a.id];
            const problem = problemFor(a.platform);
            return (
              <div key={a.id} className={`acc-option${t.on ? " on" : ""}`}>
                <label>
                  <input type="checkbox" checked={t.on} onChange={(e) => update(a.id, { on: e.target.checked })} />
                  <PlatformIcon platform={a.platform} />
                  <span className="grow truncate">{a.name}</span>
                  {problem && <span className="small muted">{problem}</span>}
                </label>

                {t.on && (
                  <div className="acc-extra">
                    {a.platform === "youtube" && (
                      <>
                        <label className="field">
                          Tytuł filmu
                          <input
                            type="text"
                            maxLength={100}
                            value={t.title}
                            placeholder="Domyślnie: pierwsza linia opisu"
                            onChange={(e) => update(a.id, { title: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          Widoczność
                          <select value={t.privacy} onChange={(e) => update(a.id, { privacy: e.target.value })}>
                            <option value="public">Publiczny</option>
                            <option value="unlisted">Niepubliczny (tylko z linkiem)</option>
                            <option value="private">Prywatny</option>
                          </select>
                        </label>
                      </>
                    )}
                    {a.platform === "tiktok" && (
                      <>
                        <label className="field">
                          Sposób publikacji
                          <select
                            value={t.mode}
                            onChange={(e) => update(a.id, { mode: e.target.value as TargetState["mode"] })}
                          >
                            <option value="inbox">Do skrzynki TikTok — dokończę w aplikacji</option>
                            <option value="direct">Publikuj od razu (pełne działanie po audycie TikTok)</option>
                          </select>
                        </label>
                        {t.mode === "inbox" ? (
                          <div className="hint">
                            Opis z panelu nie przechodzi do skrzynki — wklejasz go w aplikacji TikTok.
                          </div>
                        ) : (
                          <label className="field">
                            Kto może oglądać
                            <select value={t.privacy} onChange={(e) => update(a.id, { privacy: e.target.value })}>
                              <option value="PUBLIC_TO_EVERYONE">Wszyscy</option>
                              <option value="FOLLOWER_OF_CREATOR">Obserwujący</option>
                              <option value="MUTUAL_FOLLOW_FRIENDS">Znajomi</option>
                              <option value="SELF_ONLY">Tylko ja</option>
                            </select>
                            <span className="hint">
                              Bez audytu TikTok pozwala tylko na „Tylko ja” — panel wybierze to automatycznie.
                            </span>
                          </label>
                        )}
                      </>
                    )}
                    <label className="row small" style={{ cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={t.customCaption}
                        onChange={(e) =>
                          update(a.id, { customCaption: e.target.checked, caption: t.caption || caption })
                        }
                      />
                      Inny opis dla tego konta
                    </label>
                    {t.customCaption && (
                      <>
                        <textarea
                          value={t.caption}
                          onChange={(e) => update(a.id, { caption: e.target.value })}
                          style={{ minHeight: 90 }}
                        />
                        <div className={`counter${t.caption.length > rules[a.platform].captionLimit ? " over" : ""}`}>
                          {t.caption.length} / {rules[a.platform].captionLimit}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="card stack">
          <h2 style={{ margin: 0 }}>Kiedy</h2>
          <div className="seg">
            <button className={when === "now" ? "on" : ""} onClick={() => setWhen("now")}>
              Teraz
            </button>
            <button className={when === "later" ? "on" : ""} onClick={() => setWhen("later")}>
              Zaplanuj
            </button>
          </div>
          {when === "later" && (
            <input type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} />
          )}
          {error && <div className="alert alert-err">{error}</div>}
          <button className="btn btn-primary" disabled={pending || progress !== null} onClick={submit}>
            {pending ? "Zapisywanie…" : when === "now" ? "Opublikuj teraz" : "Zaplanuj post"}
          </button>
        </div>
      </div>
    </div>
  );
}
