"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
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
      <div data-theme="dark" className="min-h-screen flex items-center justify-center bg-aurora px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid bg-grid-fade opacity-[0.06]" />
        <div className="absolute inset-0 bg-aurora-layer" />
        <div className="grain" />

        <div className="w-full max-w-[400px] relative z-10 animate-form-enter">
          <div className="glass-card rounded-2xl p-7 text-center">
            <div
              className="w-14 h-14 rounded-2xl bg-bg-accent flex items-center justify-center mx-auto mb-5 shadow-lg"
              style={{ boxShadow: "var(--glow)" }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-inverse)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 12l4 4 8-8" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">
              You&apos;re in
            </h1>
            <p className="text-sm text-text-secondary mt-2">
              Your unique webhook ingress URL:
            </p>
            <div className="mt-5 px-4 py-3.5 rounded-xl bg-bg-tertiary border border-border-primary">
              <p className="font-mono text-sm text-text-accent break-all">
                {typeof window !== "undefined"
                  ? window.location.origin.replace("3001", "3000")
                  : ""}
                /in/{slug}
              </p>
            </div>
            <p className="text-xs text-text-tertiary mt-3">
              Set this as your webhook URL in Paystack, Flutterwave, or any
              provider.
            </p>
            <Button
              onClick={() => router.push("/dashboard")}
              className="w-full mt-8"
            >
              Go to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-theme="dark" className="min-h-screen flex items-center justify-center bg-aurora px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid bg-grid-fade opacity-[0.06]" />
      <div className="absolute inset-0 bg-aurora-layer" />
      <div className="grain" />

      <div className="w-full max-w-[400px] relative z-10 animate-form-enter">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-10">
          <div
            className="w-9 h-9 rounded-xl bg-bg-accent flex items-center justify-center shadow-lg"
            style={{ boxShadow: "var(--glow)" }}
          >
            <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 7h3l2-4 2 8 2-4h3"
                stroke="var(--text-inverse)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="text-lg font-semibold text-text-primary tracking-tight">
            Hookdash
          </span>
        </div>

        {/* Form card */}
        <div className="glass-card rounded-2xl p-7">
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Create your account
          </h1>
          <p className="text-sm text-text-secondary mt-1.5 mb-8">
            Start debugging webhooks in seconds
          </p>

          {error && (
            <div className="mb-5 px-3.5 py-2.5 rounded-lg bg-bg-error text-text-error text-sm border border-red-200/20 animate-error-in">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              minLength={8}
              required
            />
            <Button type="submit" loading={loading} className="w-full">
              Create account
            </Button>
          </form>

          <div className="relative my-7">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full divider-dashed" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-bg-secondary/80 backdrop-blur-sm px-3 text-xs text-text-tertiary rounded-full">
                or continue with
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api"}/auth/google`}
              className="oauth-google flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border-primary bg-bg-secondary/60 backdrop-blur-sm hover:bg-bg-hover text-text-primary text-sm font-medium transition-all duration-200"
            >
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google
            </a>
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api"}/auth/github`}
              className="oauth-github flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border-primary bg-bg-secondary/60 backdrop-blur-sm hover:bg-bg-hover text-text-primary text-sm font-medium transition-all duration-200"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              GitHub
            </a>
          </div>
        </div>

        <p className="text-sm text-text-tertiary text-center mt-6">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-text-accent font-medium hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
