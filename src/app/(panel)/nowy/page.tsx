import Link from "next/link";
import { listAccounts } from "@/lib/db";
import { PLATFORM_RULES } from "@/lib/platforms";
import { PostEditor, type EditorAccount } from "./PostEditor";

export default async function NewPostPage({ searchParams }: { searchParams: Promise<{ dzien?: string }> }) {
  const { dzien } = await searchParams;
  const accounts: EditorAccount[] = listAccounts().map((a) => ({
    id: a.id,
    platform: a.platform,
    name: a.name,
    avatarUrl: a.avatar_url,
  }));
  const initialDay = dzien && /^\d{4}-\d{2}-\d{2}$/.test(dzien) ? dzien : null;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="page-head">
        <div>
          <h1>Nowy post</h1>
          <p className="subtitle">Jeden plik i opis — publikacja na wybranych kontach.</p>
        </div>
      </div>
      {accounts.length === 0 ? (
        <div className="card empty">
          Najpierw podłącz konto. <Link href="/konta">Przejdź do kont →</Link>
        </div>
      ) : (
        <PostEditor accounts={accounts} rules={PLATFORM_RULES} initialDay={initialDay} />
      )}
    </div>
  );
}
