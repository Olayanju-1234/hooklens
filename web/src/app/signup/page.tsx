"use client";

import { useState, FormEvent, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, getSafeNext } from "@/lib/auth-context";
import { ApiError, INGRESS_BASE } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OAuthButtons } from "@/components/oauth-buttons";

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
      <div data-theme="dark" className="min-h-screen flex items-center justify-center bg-[#0a0a09] px-4 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#2ec4a2]/[0.03] blur-[120px] pointer-events-none" />

        <div className="w-full max-w-[400px] relative z-10 animate-[fadeSlideIn_0.5s_ease-out]">
          <div className="rounded-2xl border border-[#1a1a18] bg-[#0c0c0b] p-7 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#2ec4a2] flex items-center justify-center mx-auto mb-5">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0a0a09" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 12l4 4 8-8" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-[#ececea] tracking-tight">You&apos;re in</h1>
            <p className="text-sm text-[#6b6a65] mt-2">Your unique webhook ingress URL:</p>
            <div className="mt-5 px-4 py-3.5 rounded-xl bg-[#111110] border border-[#1e1e1c]">
              <p className="font-mono text-sm text-[#2ec4a2] break-all">
                {INGRESS_BASE}/in/{slug}
              </p>
            </div>
            <p className="text-xs text-[#4a4a45] mt-3">
              Set this as your webhook URL in Paystack, Flutterwave, or any provider.
            </p>
            <Button onClick={() => router.push(next ?? "/dashboard")} className="w-full mt-8">
              {next ? "Continue" : "Go to Dashboard"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-theme="dark" className="min-h-screen flex items-center justify-center bg-[#0a0a09] px-4 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#2ec4a2]/[0.03] blur-[120px] pointer-events-none" />

      <div className="w-full max-w-[400px] relative z-10 animate-[fadeSlideIn_0.5s_ease-out]">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 mb-10">
          <div className="w-8 h-8 rounded-lg bg-[#2ec4a2] flex items-center justify-center">
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
              <path d="M2 7h3l2-4 2 8 2-4h3" stroke="#0a0a09" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-lg font-semibold text-[#ececea] tracking-tight">Hookdash</span>
        </Link>

        {/* Form */}
        <div className="rounded-2xl border border-[#1a1a18] bg-[#0c0c0b] p-7">
          <h1 className="text-2xl font-bold text-[#ececea] tracking-tight">Create your account</h1>
          <p className="text-sm text-[#6b6a65] mt-1.5 mb-8">Start debugging webhooks in seconds</p>

          {error && (
            <div className="mb-5 px-3.5 py-2.5 rounded-lg bg-red-500/5 text-red-400 text-sm border border-red-500/10 animate-[fadeSlideIn_0.2s_ease-out]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} required />
            <Button type="submit" loading={loading} className="w-full">Create account</Button>
          </form>

          <OAuthButtons next={next} />
        </div>

        <p className="text-sm text-[#4a4a45] text-center mt-6">
          Already have an account?{" "}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="text-[#2ec4a2] font-medium hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
