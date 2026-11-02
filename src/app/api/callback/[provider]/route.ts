import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { isProvider, providers } from "@/lib/platforms";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (!isProvider(provider)) return new Response("Not found", { status: 404 });

  const back = (key: "ok" | "error", msg: string) => {
    const res = NextResponse.redirect(`${config.appUrl}/konta?${key}=${encodeURIComponent(msg)}`);
    res.cookies.delete(`oauth_state_${provider}`);
    return res;
  };

  const q = req.nextUrl.searchParams;
  const error = q.get("error_description") || q.get("error_message") || q.get("error");
  if (error) return back("error", `Logowanie przerwane: ${error}`);

  const state = q.get("state");
  const expected = req.cookies.get(`oauth_state_${provider}`)?.value;
  if (!state || !expected || state !== expected) {
    return back("error", "Nieprawidłowy parametr state — spróbuj połączyć konto jeszcze raz.");
  }
  const code = q.get("code");
  if (!code) return back("error", "Brak kodu autoryzacji.");

  try {
    return back("ok", await providers[provider].handleCallback(code));
  } catch (e) {
    console.error(`[jarvis] OAuth ${provider}:`, e);
    return back("error", (e as Error).message);
  }
}
