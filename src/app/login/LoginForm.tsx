"use client";

import { useActionState } from "react";
import { login } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="stack">
      <label className="field">
        Hasło
        <input type="password" name="password" autoFocus required autoComplete="current-password" />
      </label>
      {state?.error && <div className="alert alert-err">{state.error}</div>}
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Logowanie…" : "Zaloguj"}
      </button>
    </form>
  );
}
