"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/dashboard");
  }

  async function onLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <main style={{ maxWidth: 420 }}>
      <h1>Login</h1>

      <form onSubmit={onLogin} style={{ display: "grid", gap: 10 }}>
        <label>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        <button type="submit" style={{ padding: 10 }}>
          Sign in
        </button>

        <button type="button" onClick={onLogout} style={{ padding: 10 }}>
          Sign out
        </button>

        {error && <p style={{ color: "crimson" }}>{error}</p>}
      </form>

      <p style={{ marginTop: 16 }}>
        Next step is Supabase setup: create a project, run SQL schema, create a user, and link them in the profiles table.
      </p>
    </main>
  );
}
