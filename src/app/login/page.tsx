import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await isLoggedIn()) redirect("/");
  return (
    <div className="login-wrap">
      <div className="card login-card stack">
        <div>
          <h1>Jarvis</h1>
          <p className="subtitle">Zaloguj się do panelu.</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
