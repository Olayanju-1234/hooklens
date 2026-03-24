"use client";

import { useState, FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { auth, ApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await auth.resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
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
        <div className="flex items-center gap-2.5 mb-10">
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

        {/* Form card */}
        <div className="glass-card rounded-2xl p-7">
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Set new password
          </h1>
          <p className="text-sm text-text-secondary mt-1.5 mb-8">
            Choose a strong password for your account
          </p>

          {success ? (
            <div className="space-y-4 animate-scale-in">
              <div className="px-3.5 py-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-sm border border-emerald-500/20">
                Password reset successfully.
              </div>
              <Link
                href="/login"
                className="block text-center text-text-accent font-medium hover:underline"
              >
                Sign in with your new password
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-5 px-3.5 py-2.5 rounded-lg bg-bg-error text-text-error text-sm border border-red-200/20 animate-error-in">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-5">
                <Input
                  label="New password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  required
                  minLength={8}
                />
                <Input
                  label="Confirm password"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter password"
                  required
                />
                <Button type="submit" loading={loading} className="w-full">
                  Reset password
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="text-sm text-text-tertiary text-center mt-6">
          <Link
            href="/login"
            className="text-text-accent font-medium hover:underline"
          >
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
