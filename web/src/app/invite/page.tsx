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
    <div className="min-h-screen flex items-center justify-center bg-bg-primary px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold text-text-primary tracking-tight mb-2">
          Workspace Invitation
        </h1>
        <p className="text-sm text-text-secondary mb-8">
          You&apos;ve been invited to join a workspace on Hookdash.
        </p>

        {error && (
          <div className="mb-5 px-3.5 py-2.5 rounded-lg bg-bg-error text-text-error text-sm border border-red-200/20">
            {error}
          </div>
        )}

        <Button onClick={handleAccept} loading={loading} className="w-full">
          Accept Invitation
        </Button>
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
