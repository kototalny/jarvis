import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { config, isProviderConfigured } from "@/lib/config";
import { isProvider, providers } from "@/lib/platforms";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (!isProvider(provider)) return new Response("Not found", { status: 404 });
  if (!isProviderConfigured(provider)) {
    return NextResponse.redirect(`${config.appUrl}/konta?error=${encodeURIComponent("Brak kluczy API w pliku .env.")}`);
  }
  const state = crypto.randomBytes(24).toString("hex");
  const res = NextResponse.redirect(providers[provider].authUrl(state));
  res.cookies.set(`oauth_state_${provider}`, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.appUrl.startsWith("https://"),
    maxAge: 600,
    path: "/",
  });
  return res;
}
