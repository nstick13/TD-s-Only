"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelPanel } from "@/components/ui/PixelPanel";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-16">
      <PixelPanel raised className="w-full max-w-sm flex flex-col gap-4">
        <h1 className="font-pixel text-lg text-retro-yellow">Log In</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 font-mono text-lg">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-field border-2 border-retro-offwhite px-3 py-2 font-mono text-lg text-retro-offwhite"
              autoComplete="email"
            />
          </label>

          <label className="flex flex-col gap-1 font-mono text-lg">
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-field border-2 border-retro-offwhite px-3 py-2 font-mono text-lg text-retro-offwhite"
              autoComplete="current-password"
            />
          </label>

          {error ? (
            <p className="font-mono text-retro-red text-base">{error}</p>
          ) : null}

          <PixelButton type="submit" disabled={loading}>
            {loading ? "Logging In..." : "Log In"}
          </PixelButton>
        </form>

        <p className="font-mono text-base text-center">
          No account?{" "}
          <Link href="/signup" className="text-retro-yellow underline">
            Sign up
          </Link>
        </p>
      </PixelPanel>
    </main>
  );
}
