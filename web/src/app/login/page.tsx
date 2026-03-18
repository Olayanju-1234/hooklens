"use client";

import { useState, FormEvent, useEffect, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import gsap from "gsap";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!formRef.current) return;
    gsap.fromTo(
      formRef.current,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" },
    );
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary px-4 relative overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 bg-grid bg-grid-fade opacity-40" />

      {/* Gradient orb */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, var(--bg-accent) 0%, transparent 70%)",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
        }}
      />

      <div ref={formRef} className="w-full max-w-sm relative z-10">
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

        <h1 className="text-2xl font-bold text-text-primary tracking-tight">
          Welcome back
        </h1>
        <p className="text-sm text-text-secondary mt-1.5 mb-8">
          Sign in to continue debugging webhooks
        </p>

        {error && (
          <div className="mb-5 px-3.5 py-2.5 rounded-lg bg-bg-error text-text-error text-sm border border-red-200/20">
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
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
          />
          <Button type="submit" loading={loading} className="w-full">
            Sign in
          </Button>
        </form>

        <div className="mt-4 text-center">
          <Link
            href="/forgot-password"
            className="text-sm text-text-tertiary hover:text-text-accent"
          >
            Forgot your password?
          </Link>
        </div>

        <p className="text-sm text-text-tertiary text-center mt-8">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="text-text-accent font-medium hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
