import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./lib/session";

export async function middleware(req: NextRequest) {
  if (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Brak autoryzacji." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  runtime: "nodejs",
  // Public: login page, uploaded media (platforms fetch it), Next internals.
  // /api/media is excluded so large uploads are not buffered by middleware;
  // that route checks the session itself.
  matcher: ["/((?!login|media/|api/media|_next/|favicon.ico|icon.svg).*)"],
};
