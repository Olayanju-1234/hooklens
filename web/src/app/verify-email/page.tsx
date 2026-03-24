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
        <div className="px-3.5 py-2.5 rounded-lg bg-[#2ec4a2]/5 text-[#2ec4a2] text-sm border border-[#2ec4a2]/10">
          Email verified successfully!
        </div>
        <Link href="/dashboard" className="block text-[#2ec4a2] font-medium hover:underline">
          Go to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="px-3.5 py-2.5 rounded-lg bg-red-500/5 text-red-400 text-sm border border-red-500/10">
        Invalid or expired verification link.
      </div>
      <Link href="/login" className="block text-[#2ec4a2] font-medium hover:underline">
        Back to login
      </Link>
    </div>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  return (
    <div data-theme="dark" className="min-h-screen flex items-center justify-center bg-[#0a0a09] px-4 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#2ec4a2]/[0.03] blur-[120px] pointer-events-none" />

      <div className="w-full max-w-[400px] relative z-10 animate-[fadeSlideIn_0.5s_ease-out]">
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="w-8 h-8 rounded-lg bg-[#2ec4a2] flex items-center justify-center">
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
              <path d="M2 7h3l2-4 2 8 2-4h3" stroke="#0a0a09" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-lg font-semibold text-[#ececea] tracking-tight">Hookdash</span>
        </div>

        <div className="rounded-2xl border border-[#1a1a18] bg-[#0c0c0b] p-7 text-center">
          <Suspense fallback={<p className="text-[#6b6a65]">Verifying your email...</p>}>
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
