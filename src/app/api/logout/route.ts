import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST() {
  const res = NextResponse.redirect(`${config.appUrl}/login`, 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
