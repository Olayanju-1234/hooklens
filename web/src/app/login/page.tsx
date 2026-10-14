"use client";

import { useState, FormEvent, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth, getSafeNext } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OAuthButtons } from "@/components/oauth-buttons";
import { AuthShell, Notice } from "@/components/auth-shell";

const OAUTH_ERRORS: Record<string, string> = {
  oauth_failed: "Sign-in with that provider failed. Please try again.",
  oauth_unavailable: "That sign-in provider isn't available right now.",
};

function LoginForm() {
  const { login } = useAuth();
  const searchParams = useSearchParams();
  const next = getSafeNext(searchParams.get("next"));
  const errorParam = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    errorParam ? (OAUTH_ERRORS[errorParam] ?? "Sign-in failed. Please try again.") : "",
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password, next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to see your traffic."
      below={
        <>
          <p>
            <Link href="/forgot-password" className="auth-link font-normal">
              Forgot your password?
            </Link>
          </p>
          <p>
            Don&apos;t have an account?{" "}
            <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"} className="auth-link">
              Sign up
            </Link>
          </p>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required />
        <Button type="submit" loading={loading} className="w-full">Sign in</Button>
      </form>
      <OAuthButtons next={next} />
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
