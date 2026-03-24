"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { auth, ApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await auth.forgotPassword(email);
      setSent(true);
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
            Reset your password
          </h1>
          <p className="text-sm text-text-secondary mt-1.5 mb-8">
            Enter your email and we&apos;ll send you a reset link
          </p>

          {sent ? (
            <div className="px-3.5 py-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-sm border border-emerald-500/20 animate-scale-in">
              Check your email for a password reset link.
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
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
                <Button type="submit" loading={loading} className="w-full">
                  Send reset link
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
