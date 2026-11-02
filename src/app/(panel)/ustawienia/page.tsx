import { config, isProviderConfigured, redirectUri, type Provider } from "@/lib/config";
import { getSetting, SECRET_KEYS, type SettingKey } from "@/lib/settings";
import { saveSettings } from "../../actions";

const SECTIONS: {
  provider: Provider;
  title: string;
  console: string;
  fields: { key: SettingKey; label: string; hint?: string }[];
}[] = [
  {
    provider: "meta",
    title: "Facebook + Instagram",
    console: "https://developers.facebook.com/apps",
    fields: [
      { key: "META_APP_ID", label: "App ID" },
      { key: "META_APP_SECRET", label: "App Secret" },
      {
        key: "META_CONFIG_ID",
        label: "Configuration ID (opcjonalnie)",
        hint: "Tylko jeśli aplikacja używa „Facebook Login for Business”. Przy zwykłym Facebook Login zostaw puste.",
      },
    ],
  },
  {
    provider: "youtube",
    title: "YouTube (Google)",
    console: "https://console.cloud.google.com/apis/credentials",
    fields: [
      { key: "GOOGLE_CLIENT_ID", label: "Client ID" },
      { key: "GOOGLE_CLIENT_SECRET", label: "Client secret" },
    ],
  },
  {
    provider: "tiktok",
    title: "TikTok",
    console: "https://developers.tiktok.com/apps",
    fields: [
      { key: "TIKTOK_CLIENT_KEY", label: "Client key" },
      { key: "TIKTOK_CLIENT_SECRET", label: "Client secret" },
    ],
  },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="page-head">
        <div>
          <h1>Ustawienia</h1>
          <p className="subtitle">Klucze API z konsol deweloperskich platform. Instrukcja krok po kroku jest w README.</p>
        </div>
      </div>
      {ok && <div className="alert alert-ok">{ok}</div>}
      <div className="alert alert-info small">
        Adres panelu: <code>{config.appUrl}</code>. Jeśli to nie jest adres, pod którym otwierasz panel, popraw{" "}
        <code>APP_URL</code> w pliku <code>.env</code> na serwerze.
      </div>

      <form action={saveSettings} className="stack">
        {SECTIONS.map((s) => {
          const configured = isProviderConfigured(s.provider);
          return (
            <div key={s.provider} className="card stack">
              <div className="row">
                <h2 style={{ margin: 0 }} className="grow">
                  {s.title}
                </h2>
                <span className={`badge ${configured ? "published" : ""}`}>
                  {configured ? "Skonfigurowano" : "Brak kluczy"}
                </span>
              </div>
              <div className="small muted">
                Redirect URI do wklejenia w{" "}
                <a href={s.console} target="_blank" rel="noreferrer">
                  konsoli deweloperskiej ↗
                </a>
                :<br />
                <code>{redirectUri(s.provider)}</code>
              </div>
              {s.fields.map((f) => {
                const secret = SECRET_KEYS.includes(f.key);
                const current = getSetting(f.key);
                return (
                  <label key={f.key} className="field">
                    {f.label}
                    {secret ? (
                      <input
                        type="password"
                        name={f.key}
                        autoComplete="off"
                        placeholder={current ? "•••••••• zapisane — zostaw puste, aby nie zmieniać" : ""}
                      />
                    ) : (
                      <input type="text" name={f.key} defaultValue={current} autoComplete="off" />
                    )}
                    {f.hint && <span className="hint">{f.hint}</span>}
                  </label>
                );
              })}
            </div>
          );
        })}
        <div>
          <button className="btn btn-primary">Zapisz ustawienia</button>
        </div>
      </form>
    </div>
  );
}
