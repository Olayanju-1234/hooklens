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
    <div className="min-h-screen flex items-center justify-center bg-bg-primary px-4">
      <div className="w-full max-w-sm text-center">
        <Suspense
          fallback={
            <p className="text-text-secondary">Verifying your email...</p>
          }
        >
          <VerifyResult token={token} />
        </Suspense>
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
