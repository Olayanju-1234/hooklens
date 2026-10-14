"use client";

import { useState, FormEvent, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, getSafeNext } from "@/lib/auth-context";
import { ApiError, INGRESS_BASE } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OAuthButtons } from "@/components/oauth-buttons";
import { AuthShell, Notice } from "@/components/auth-shell";

function SignupForm() {
  const { signup } = useAuth();
  const router = useRouter();
  const next = getSafeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const ingressSlug = await signup(email, password);
      setSlug(ingressSlug);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (slug) {
    return (
      <AuthShell
        title="You're in"
        subtitle="This is your ingress URL. Paste it into your provider's webhook settings."
      >
        <div className="ingress-box">
          {INGRESS_BASE}/in/{slug}
        </div>
        <p className="mt-3 text-xs text-text-tertiary">Works for Stripe, Paystack, Flutterwave, Mono, Bags or any JSON webhook.</p>
        <Button onClick={() => router.push(next ?? "/dashboard")} className="w-full mt-7">
          {next ? "Continue" : "Open your dashboard"}
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Get an ingress URL and watch your first webhook land."
      below={
        <p>
          Already have an account?{" "}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="auth-link">
            Sign in
          </Link>
        </p>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} required />
        <Button type="submit" loading={loading} className="w-full">Create account</Button>
      </form>
      <OAuthButtons next={next} />
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
