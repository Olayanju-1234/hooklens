"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { workspaces, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";

function InviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAccept() {
    setError("");
    setLoading(true);
    try {
      await workspaces.acceptInvite(token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to accept invite");
    } finally {
      setLoading(false);
    }
  }

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
          <h1 className="text-2xl font-bold text-[#ececea] tracking-tight mb-2">Workspace Invitation</h1>
          <p className="text-sm text-[#6b6a65] mb-8">
            You&apos;ve been invited to join a workspace on Hookdash.
          </p>

          {error && (
            <div className="mb-5 px-3.5 py-2.5 rounded-lg bg-red-500/5 text-red-400 text-sm border border-red-500/10 animate-[fadeSlideIn_0.2s_ease-out]">
              {error}
            </div>
          )}

          <Button onClick={handleAccept} loading={loading} className="w-full">Accept Invitation</Button>
        </div>
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense>
      <InviteContent />
    </Suspense>
  );
}
