"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/api";
import { Suspense } from "react";

const verifyCache = new Map<string, Promise<boolean>>();

function getVerifyPromise(token: string): Promise<boolean> {
  if (!token) return Promise.resolve(false);
  if (!verifyCache.has(token)) {
    verifyCache.set(
      token,
      auth
        .verifyEmail(token)
        .then(() => true)
        .catch(() => false),
    );
  }
  return verifyCache.get(token)!;
}

function VerifyResult({ token }: { token: string }) {
  const success = use(getVerifyPromise(token));

  if (success) {
    return (
      <div className="space-y-4">
        <div className="px-3.5 py-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-sm border border-emerald-500/20">
          Email verified successfully!
        </div>
        <Link
          href="/dashboard"
          className="block text-text-accent font-medium hover:underline"
        >
          Go to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="px-3.5 py-2.5 rounded-lg bg-bg-error text-text-error text-sm border border-red-200/20">
        Invalid or expired verification link.
      </div>
      <Link
        href="/login"
        className="block text-text-accent font-medium hover:underline"
      >
        Back to login
      </Link>
    </div>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  return (
    <div data-theme="dark" className="min-h-screen flex items-center justify-center bg-aurora px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid bg-grid-fade opacity-[0.06]" />
      <div className="absolute inset-0 bg-aurora-layer" />
      <div className="grain" />

      <div className="w-full max-w-[400px] relative z-10 animate-form-enter">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
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

        <div className="glass-card rounded-2xl p-7 text-center">
          <Suspense
            fallback={
              <p className="text-text-secondary">Verifying your email...</p>
            }
          >
            <VerifyResult token={token} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
