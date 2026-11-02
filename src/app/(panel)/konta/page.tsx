import { PlatformIcon } from "@/components/PlatformIcon";
import { config, isProviderConfigured, PLATFORM_LABELS, redirectUri, type Platform, type Provider } from "@/lib/config";
import { listAccounts } from "@/lib/db";
import { removeAccount } from "../../actions";

const PROVIDERS: { id: Provider; label: string; platforms: Platform[]; env: string; hint: string }[] = [
  {
    id: "meta",
    label: "Facebook + Instagram",
    platforms: ["facebook", "instagram"],
    env: "META_APP_ID, META_APP_SECRET",
    hint: "Łączy wszystkie Twoje strony na Facebooku i konta Instagram (Business/Twórca) do nich podpięte.",
  },
  {
    id: "youtube",
    label: "YouTube",
    platforms: ["youtube"],
    env: "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET",
    hint: "Bez audytu Google filmy z API trafiają na YouTube jako prywatne.",
  },
  {
    id: "tiktok",
    label: "TikTok",
    platforms: ["tiktok"],
    env: "TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET",
    hint: "Bez audytu TikTok: film trafia do skrzynki w aplikacji albo publikuje się jako prywatny.",
  },
];

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const accounts = listAccounts();
  const insecure = !config.appUrl.startsWith("https://");

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="page-head">
        <div>
          <h1>Konta</h1>
          <p className="subtitle">Podłącz konta, na które chcesz publikować.</p>
        </div>
      </div>

      {ok && <div className="alert alert-ok">{ok}</div>}
      {error && <div className="alert alert-err">{error}</div>}
      {insecure && (
        <div className="alert alert-warn">
          APP_URL to <code>{config.appUrl}</code>. Instagram i Facebook pobierają pliki z publicznego adresu HTTPS, a
          TikTok wymaga HTTPS przy logowaniu — na produkcji ustaw adres swojej domeny.
        </div>
      )}

      <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {PROVIDERS.map((p) => {
          const configured = isProviderConfigured(p.id);
          const connected = accounts.filter((a) => p.platforms.includes(a.platform));
          return (
            <div key={p.id} className="card stack">
              <div className="row">
                {p.platforms.map((pl) => (
                  <PlatformIcon key={pl} platform={pl} />
                ))}
                <h2 style={{ margin: 0 }}>{p.label}</h2>
              </div>
              <p className="small muted" style={{ margin: 0 }}>
                {p.hint}
              </p>

              {connected.length > 0 && (
                <div className="list">
                  {connected.map((a) => (
                    <div key={a.id} className="list-item">
                      {a.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="avatar" src={a.avatar_url} alt="" />
                      ) : (
                        <div className="avatar" />
                      )}
                      <div className="grow">
                        <div className="truncate">{a.name}</div>
                        <div className="small muted">{PLATFORM_LABELS[a.platform]}</div>
                      </div>
                      <form action={removeAccount.bind(null, a.id)}>
                        <button className="btn btn-sm btn-danger">Odłącz</button>
                      </form>
                    </div>
                  ))}
                </div>
              )}

              {configured ? (
                <a className="btn btn-primary" href={`/api/connect/${p.id}`}>
                  {connected.length ? "Połącz ponownie / dodaj" : "Połącz"}
                </a>
              ) : (
                <div className="alert alert-info small">
                  Uzupełnij w pliku <code>.env</code>: <code>{p.env}</code> i uruchom panel ponownie.
                </div>
              )}
              <div className="small muted">
                Adres przekierowania (Redirect URI) do wpisania w konsoli deweloperskiej:
                <br />
                <code>{redirectUri(p.id)}</code>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
