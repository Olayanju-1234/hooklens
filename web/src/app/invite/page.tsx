"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { workspaces, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { AuthShell, Notice } from "@/components/auth-shell";
import { Suspense } from "react";

function InviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { token: authToken, isLoading, refreshWorkspaces, switchWorkspace } = useAuth();
  const token = searchParams.get("token") ?? "";
  const [error, setError] = useState(token ? "" : "This invite link is missing its token.");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoading || authToken || !token) return;
    const next = `/invite?token=${encodeURIComponent(token)}`;
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [isLoading, authToken, token, router]);

  async function handleAccept() {
    setError("");
    setLoading(true);
    try {
      const membership = await workspaces.acceptInvite(token);
      await refreshWorkspaces();
      switchWorkspace(membership.workspaceId, "/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to accept invite");
      setLoading(false);
    }
  }

  if (isLoading || (!authToken && token)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <div className="w-5 h-5 border-2 border-border-secondary border-t-text-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AuthShell title="Workspace invitation" subtitle="You've been invited to join a workspace on Hookdash." centered>
      {error && <Notice tone="error">{error}</Notice>}
      <Button onClick={handleAccept} loading={loading} disabled={!token} className="w-full">Accept invitation</Button>
    </AuthShell>
  );
}

export default function InvitePage() {
  return (
    <Suspense>
      <InviteContent />
    </Suspense>
  );
}
