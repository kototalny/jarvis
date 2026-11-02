import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./session";

export async function isLoggedIn(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** For server actions: they can be called directly, so check the session again. */
export async function requireAuth(): Promise<void> {
  if (!(await isLoggedIn())) throw new Error("Brak autoryzacji.");
}
