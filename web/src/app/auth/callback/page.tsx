"use client";

import { useEffect, useRef } from "react";
import { useAuth, getSafeNext, OAUTH_NEXT_KEY } from "@/lib/auth-context";

function takeOAuthNext(): string | null {
  try {
    const next = getSafeNext(sessionStorage.getItem(OAUTH_NEXT_KEY));
    sessionStorage.removeItem(OAUTH_NEXT_KEY);
    return next;
  } catch {
    return null;
  }
}

export default function AuthCallbackPage() {
  const { setSession } = useAuth();
  const handled = useRef(false);

  useEffect(() => {
    // Strict mode runs effects twice; the hash is gone after the first pass
    if (handled.current) return;
    handled.current = true;

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);
    const error = query.get("error") ?? hash.get("error");
    const token = hash.get("token") ?? query.get("token");
    const slug = hash.get("slug") ?? query.get("slug");
    const next = takeOAuthNext();

    // Drop the token from the address bar before anything else renders
    window.history.replaceState(null, "", window.location.pathname);

    if (error || !token || !slug) {
      window.location.replace(`/login?error=${encodeURIComponent(error ?? "oauth_failed")}`);
      return;
    }

    void setSession(token, slug).then(() => {
      window.location.replace(next ?? "/dashboard");
    });
  }, [setSession]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <p className="text-text-secondary">Signing you in...</p>
    </div>
  );
}
