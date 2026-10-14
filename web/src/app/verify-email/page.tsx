"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/api";
import { AuthShell, Notice } from "@/components/auth-shell";
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
        <Notice tone="success">Email verified.</Notice>
        <Link href="/dashboard" className="auth-link block">
          Open your dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Notice tone="error">This verification link is invalid or has expired.</Notice>
      <Link href="/login" className="auth-link block">
        Back to login
      </Link>
    </div>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  return (
    <AuthShell title="Verify your email" centered>
      <Suspense fallback={<p className="text-sm text-text-tertiary">Verifying your email…</p>}>
        <VerifyResult token={token} />
      </Suspense>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
