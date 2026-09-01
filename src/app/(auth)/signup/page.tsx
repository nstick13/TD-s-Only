"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelPanel } from "@/components/ui/PixelPanel";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // display_name is stashed in auth user metadata; the
    // handle_new_user() DB trigger copies it into profiles.display_name
    // when the auth.users row is created (see supabase/migrations).
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-16">
      <PixelPanel raised className="w-full max-w-sm flex flex-col gap-4">
        <h1 className="font-pixel text-lg text-retro-yellow">Sign Up</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 font-mono text-lg">
            Display Name
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="bg-field border-2 border-retro-offwhite px-3 py-2 font-mono text-lg text-retro-offwhite"
              autoComplete="nickname"
            />
          </label>

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
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-field border-2 border-retro-offwhite px-3 py-2 font-mono text-lg text-retro-offwhite"
              autoComplete="new-password"
            />
          </label>

          {error ? (
            <p className="font-mono text-retro-red text-base">{error}</p>
          ) : null}

          <PixelButton type="submit" disabled={loading}>
            {loading ? "Signing Up..." : "Sign Up"}
          </PixelButton>
        </form>

        <p className="font-mono text-base text-center">
          Already have an account?{" "}
          <Link href="/login" className="text-retro-yellow underline">
            Log in
          </Link>
        </p>
      </PixelPanel>
    </main>
  );
}
