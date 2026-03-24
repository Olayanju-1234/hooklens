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
      setError(
        err instanceof ApiError ? err.message : "Failed to accept invite",
      );
    } finally {
      setLoading(false);
    }
  }

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
          <h1 className="text-2xl font-bold text-text-primary tracking-tight mb-2">
            Workspace Invitation
          </h1>
          <p className="text-sm text-text-secondary mb-8">
            You&apos;ve been invited to join a workspace on Hookdash.
          </p>

          {error && (
            <div className="mb-5 px-3.5 py-2.5 rounded-lg bg-bg-error text-text-error text-sm border border-red-200/20 animate-error-in">
              {error}
            </div>
          )}

          <Button onClick={handleAccept} loading={loading} className="w-full">
            Accept Invitation
          </Button>
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
