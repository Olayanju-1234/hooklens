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
    <div data-theme="dark" className="min-h-screen flex items-center justify-center bg-[#0a0a09] px-4 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#2ec4a2]/[0.03] blur-[120px] pointer-events-none" />

      <div className="w-full max-w-[400px] relative z-10 animate-[fadeSlideIn_0.5s_ease-out]">
        <Link href="/" className="flex items-center gap-2.5 mb-10">
          <div className="w-8 h-8 rounded-lg bg-[#2ec4a2] flex items-center justify-center">
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
              <path d="M2 7h3l2-4 2 8 2-4h3" stroke="#0a0a09" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-lg font-semibold text-[#ececea] tracking-tight">Hookdash</span>
        </Link>

        <div className="rounded-2xl border border-[#1a1a18] bg-[#0c0c0b] p-7">
          <h1 className="text-2xl font-bold text-[#ececea] tracking-tight">Reset your password</h1>
          <p className="text-sm text-[#6b6a65] mt-1.5 mb-8">Enter your email and we&apos;ll send you a reset link</p>

          {sent ? (
            <div className="px-3.5 py-2.5 rounded-lg bg-[#2ec4a2]/5 text-[#2ec4a2] text-sm border border-[#2ec4a2]/10 animate-[fadeSlideIn_0.3s_ease-out]">
              Check your email for a password reset link.
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-5 px-3.5 py-2.5 rounded-lg bg-red-500/5 text-red-400 text-sm border border-red-500/10 animate-[fadeSlideIn_0.2s_ease-out]">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-5">
                <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
                <Button type="submit" loading={loading} className="w-full">Send reset link</Button>
              </form>
            </>
          )}
        </div>

        <p className="text-sm text-[#4a4a45] text-center mt-6">
          <Link href="/login" className="text-[#2ec4a2] font-medium hover:underline">Back to login</Link>
        </p>
      </div>
    </div>
  );
}
