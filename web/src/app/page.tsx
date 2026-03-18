"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import gsap from "gsap";

const features = [
  {
    title: "Real-time Streaming",
    description:
      "Watch webhooks arrive live via WebSocket. No refresh needed.",
    icon: (
      <path
        d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    ),
  },
  {
    title: "Multi-Destination Forwarding",
    description:
      "Forward events to multiple URLs with auto-retry and exponential backoff.",
    icon: (
      <path
        d="M6 3v12M18 3v12M6 9h12M6 15l6-6 6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    ),
  },
  {
    title: "Signature Verification",
    description:
      "Validate HMAC signatures from Paystack, Flutterwave, Mono, and custom providers.",
    icon: (
      <path
        d="M12 2L4 6v6c0 5 3.5 9.7 8 11 4.5-1.3 8-6 8-11V6l-8-4z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    ),
  },
  {
    title: "Event Diff & Replay",
    description:
      "Compare payloads side-by-side and replay any event with one click.",
    icon: (
      <path
        d="M12 3v18M3 12h18M8 8l4-4 4 4M8 16l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    ),
  },
  {
    title: "Payload Transforms",
    description:
      "Rename, remove, or inject fields before forwarding — zero code changes.",
    icon: (
      <path
        d="M4 6h16M4 12h10M4 18h6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    ),
  },
  {
    title: "Alerting Engine",
    description:
      "Get notified on Slack, Discord, or email when forwards fail or signatures break.",
    icon: (
      <path
        d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9zM13.7 21a2 2 0 01-3.4 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    ),
  },
];

const providers = ["Paystack", "Flutterwave", "Mono", "Stripe", "Custom"];

export default function LandingPage() {
  const router = useRouter();
  const heroRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);

  // Redirect if already logged in
  useEffect(() => {
    const token = Cookies.get("token");
    if (token) {
      router.replace("/dashboard");
    }
  }, [router]);

  useEffect(() => {
    if (!heroRef.current) return;
    const els = heroRef.current.querySelectorAll("[data-animate]");
    gsap.fromTo(
      els,
      { opacity: 0, y: 30 },
      {
        opacity: 1,
        y: 0,
        duration: 0.7,
        stagger: 0.12,
        ease: "power3.out",
      },
    );
  }, []);

  useEffect(() => {
    if (!featuresRef.current) return;
    const cards = featuresRef.current.querySelectorAll("[data-card]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            gsap.fromTo(
              entry.target,
              { opacity: 0, y: 20 },
              { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" },
            );
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 },
    );
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 sm:px-10 py-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg bg-bg-accent flex items-center justify-center"
            style={{ boxShadow: "var(--glow)" }}
          >
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 7h3l2-4 2 8 2-4h3"
                stroke="var(--text-inverse)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="text-base font-semibold text-text-primary tracking-tight">
            Hookdash
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-bg-accent text-text-inverse hover:bg-bg-accent-hover transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid bg-grid-fade opacity-30" />
        <div
          className="absolute w-[600px] h-[600px] rounded-full opacity-15 blur-3xl pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, var(--bg-accent) 0%, transparent 70%)",
            top: "10%",
            left: "50%",
            transform: "translateX(-50%)",
          }}
        />

        <div
          ref={heroRef}
          className="relative max-w-4xl mx-auto px-6 sm:px-10 pt-20 pb-24 text-center"
        >
          <div
            data-animate
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-bg-secondary border border-border-primary text-xs font-medium text-text-secondary mb-8"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Open source webhook debugger
          </div>

          <h1
            data-animate
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-text-primary tracking-tight leading-[1.1]"
          >
            Inspect, replay &amp; debug
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--bg-accent)] to-purple-500">
              webhooks in real time
            </span>
          </h1>

          <p
            data-animate
            className="mt-6 text-lg sm:text-xl text-text-secondary max-w-2xl mx-auto leading-relaxed"
          >
            One ingress URL. Multi-destination forwarding, auto-retry with
            exponential backoff, payload transforms, signature verification, and
            built-in test suites for African PSPs.
          </p>

          <div
            data-animate
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <Link
              href="/signup"
              className="inline-flex items-center px-6 py-3 rounded-lg text-sm font-medium bg-bg-accent text-text-inverse hover:bg-bg-accent-hover transition-all active:scale-[0.98] shadow-lg"
              style={{ boxShadow: "var(--glow)" }}
            >
              Start debugging — free
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="ml-2"
              >
                <path
                  d="M3 8h10M9 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <a
              href="https://github.com/Olayanju-1234/hooklens"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-6 py-3 rounded-lg text-sm font-medium bg-bg-secondary text-text-primary border border-border-primary hover:border-border-secondary hover:bg-bg-hover transition-all"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="mr-2"
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              View on GitHub
            </a>
          </div>

          {/* Provider pills */}
          <div data-animate className="mt-12 flex items-center justify-center gap-2 flex-wrap">
            <span className="text-xs text-text-tertiary mr-1">Works with</span>
            {providers.map((p) => (
              <span
                key={p}
                className="px-2.5 py-1 rounded-md bg-bg-secondary border border-border-primary text-xs font-medium text-text-secondary"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Terminal preview */}
      <section className="max-w-4xl mx-auto px-6 sm:px-10 pb-20">
        <div className="rounded-xl border border-border-primary bg-bg-secondary overflow-hidden shadow-2xl">
          <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border-primary bg-bg-tertiary">
            <span className="w-3 h-3 rounded-full bg-red-500/80" />
            <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <span className="w-3 h-3 rounded-full bg-green-500/80" />
            <span className="ml-3 text-xs text-text-tertiary font-mono">
              hookdash — live events
            </span>
          </div>
          <div className="p-5 font-mono text-xs leading-6 text-text-secondary overflow-x-auto">
            <div>
              <span className="text-text-tertiary">12:04:01</span>{" "}
              <span className="text-emerald-400">POST</span>{" "}
              <span className="text-text-primary">/in/usr_a3f8c1d9e2b0</span>{" "}
              <span className="text-text-tertiary">→</span>{" "}
              <span className="text-blue-400">charge.success</span>{" "}
              <span className="text-emerald-400">sig:valid</span>{" "}
              <span className="text-text-tertiary">→ forwarded (200, 42ms)</span>
            </div>
            <div>
              <span className="text-text-tertiary">12:04:03</span>{" "}
              <span className="text-emerald-400">POST</span>{" "}
              <span className="text-text-primary">/in/usr_a3f8c1d9e2b0</span>{" "}
              <span className="text-text-tertiary">→</span>{" "}
              <span className="text-blue-400">transfer.completed</span>{" "}
              <span className="text-emerald-400">sig:valid</span>{" "}
              <span className="text-text-tertiary">→ forwarded (200, 38ms)</span>
            </div>
            <div>
              <span className="text-text-tertiary">12:04:05</span>{" "}
              <span className="text-emerald-400">POST</span>{" "}
              <span className="text-text-primary">/in/usr_a3f8c1d9e2b0</span>{" "}
              <span className="text-text-tertiary">→</span>{" "}
              <span className="text-blue-400">charge.failed</span>{" "}
              <span className="text-red-400">sig:invalid</span>{" "}
              <span className="text-yellow-400">→ blocked (enforcement on)</span>
            </div>
            <div>
              <span className="text-text-tertiary">12:04:08</span>{" "}
              <span className="text-emerald-400">POST</span>{" "}
              <span className="text-text-primary">/in/usr_a3f8c1d9e2b0</span>{" "}
              <span className="text-text-tertiary">→</span>{" "}
              <span className="text-blue-400">payment.successful</span>{" "}
              <span className="text-emerald-400">sig:valid</span>{" "}
              <span className="text-text-tertiary">→ forwarded (200, 51ms) → retried (502, attempt 2)</span>
            </div>
            <div className="text-text-tertiary mt-1">
              <span className="animate-pulse">▌</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 sm:px-10 pb-24">
        <div className="text-center mb-14">
          <h2 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
            Everything you need to debug webhooks
          </h2>
          <p className="mt-3 text-text-secondary max-w-lg mx-auto">
            Built for developers integrating African payment providers — but
            works with any webhook source.
          </p>
        </div>

        <div
          ref={featuresRef}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {features.map((f) => (
            <div
              key={f.title}
              data-card
              className="p-5 rounded-xl border border-border-primary bg-bg-secondary hover:border-border-secondary transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-bg-tertiary flex items-center justify-center text-text-accent mb-4">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  {f.icon}
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-text-primary mb-1.5">
                {f.title}
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border-primary bg-bg-secondary">
        <div className="max-w-4xl mx-auto px-6 sm:px-10 py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
            Stop guessing. Start seeing.
          </h2>
          <p className="mt-3 text-text-secondary max-w-md mx-auto">
            Set up in 30 seconds. No credit card. No vendor lock-in.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center mt-8 px-6 py-3 rounded-lg text-sm font-medium bg-bg-accent text-text-inverse hover:bg-bg-accent-hover transition-all active:scale-[0.98]"
            style={{ boxShadow: "var(--glow)" }}
          >
            Create free account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border-primary">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-bg-accent flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                <path
                  d="M2 7h3l2-4 2 8 2-4h3"
                  stroke="var(--text-inverse)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-xs text-text-tertiary">
              Hookdash — Open source webhook debugger
            </span>
          </div>
          <div className="flex items-center gap-5">
            <a
              href="https://github.com/Olayanju-1234/hooklens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
            >
              GitHub
            </a>
            <Link
              href="/login"
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
            >
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
