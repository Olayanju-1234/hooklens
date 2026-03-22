"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import gsap from "gsap";

/* ─────────────────────────────────────────────────────────────────
   Dashboard Preview — hero visual with 3D parallax tilt
   Shows an actual product mockup, not abstract decoration.
   ───────────────────────────────────────────────────────────────── */

const mockEvents = [
  { method: "POST", event: "charge.success", sig: "valid" as const, status: "forwarded", latency: "42ms", time: "2s ago" },
  { method: "POST", event: "transfer.completed", sig: "valid" as const, status: "forwarded", latency: "127ms", time: "5s ago" },
  { method: "POST", event: "charge.failed", sig: "invalid" as const, status: "blocked", latency: "—", time: "8s ago" },
  { method: "POST", event: "invoice.created", sig: "valid" as const, status: "forwarded", latency: "38ms", time: "12s ago" },
];

function DashboardPreview() {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    cardRef.current.style.transform = `rotateY(${x * 8}deg) rotateX(${-y * 5}deg)`;
    cardRef.current.style.transition = "transform 0.08s ease-out";
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (!cardRef.current) return;
    cardRef.current.style.transform = "rotateY(-3deg) rotateX(2deg)";
    cardRef.current.style.transition = "transform 0.5s ease-out";
  }, []);

  return (
    <div style={{ perspective: "1200px" }}>
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="rounded-2xl border border-[#1e1e1c] bg-[#0c0c0b] overflow-hidden shadow-2xl"
        style={{ transform: "rotateY(-3deg) rotateX(2deg)", transformStyle: "preserve-3d" }}
      >
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1e1e1c]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
          <div className="ml-3 flex items-center gap-4 text-[10px] font-mono text-[#6b6a65]">
            <span className="text-[#ececea]">Events</span>
            <span>Endpoints</span>
            <span>Settings</span>
          </div>
          <span className="ml-auto flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-500" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            <span className="text-[9px] text-emerald-400 font-mono">live</span>
          </span>
        </div>

        {/* Event list */}
        <div className="divide-y divide-[#1a1a18]">
          {mockEvents.map((evt, i) => (
            <div key={i}>
              <div className={`px-4 py-2.5 flex items-center gap-3 text-[11px] font-mono ${i === 0 ? "bg-[#141413]" : "hover:bg-[#111110]"}`}>
                <span className="w-1 h-1 rounded-full" style={{ background: evt.sig === "valid" ? "#2ec4a2" : "#ef4444" }} />
                <span className="text-[#2ec4a2] font-semibold w-8">{evt.method}</span>
                <span className="text-[#ececea] flex-1">{evt.event}</span>
                <span className={evt.sig === "valid" ? "text-emerald-400" : "text-red-400"}>{evt.sig}</span>
                <span className="text-[#6b6a65] w-12 text-right">{evt.latency}</span>
                <span className="text-[#4a4a45] w-12 text-right">{evt.time}</span>
              </div>

              {/* Expanded detail for first event */}
              {i === 0 && (
                <div className="px-4 pb-3 bg-[#141413]">
                  <div className="rounded-lg border border-[#1e1e1c] bg-[#0c0c0b] overflow-hidden text-[10px] font-mono">
                    {/* Headers */}
                    <div className="px-3 py-1.5 border-b border-[#1e1e1c] text-[9px] text-[#6b6a65] uppercase tracking-wider">Headers</div>
                    <div className="px-3 py-2 text-[#9c9b96] border-b border-[#1e1e1c] space-y-0.5">
                      <div><span className="text-[#6b6a65]">x-paystack-signature:</span> sha512=a1b2c3d4e5f6...</div>
                      <div><span className="text-[#6b6a65]">content-type:</span> application/json</div>
                    </div>
                    {/* Body */}
                    <div className="px-3 py-1.5 border-b border-[#1e1e1c] text-[9px] text-[#6b6a65] uppercase tracking-wider">Body</div>
                    <div className="px-3 py-2 text-[#9c9b96] border-b border-[#1e1e1c]">
                      <div>{"{"}</div>
                      <div className="pl-3"><span className="text-[#2ec4a2]">&quot;event&quot;</span>: <span className="text-yellow-300">&quot;charge.success&quot;</span>,</div>
                      <div className="pl-3"><span className="text-[#2ec4a2]">&quot;data&quot;</span>: {"{"} <span className="text-[#2ec4a2]">&quot;amount&quot;</span>: <span className="text-purple-300">50000</span>, <span className="text-[#2ec4a2]">&quot;currency&quot;</span>: <span className="text-yellow-300">&quot;NGN&quot;</span> {"}"}</div>
                      <div>{"}"}</div>
                    </div>
                    {/* Forward results */}
                    <div className="px-3 py-1.5 border-b border-[#1e1e1c] text-[9px] text-[#6b6a65] uppercase tracking-wider">Forwarded</div>
                    <div className="px-3 py-2 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400">&#10003;</span>
                        <span className="text-[#9c9b96]">api.myapp.com/webhooks</span>
                        <span className="text-[#6b6a65] ml-auto">200</span>
                        <span className="text-[#6b6a65]">42ms</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400">&#10003;</span>
                        <span className="text-[#9c9b96]">staging.myapp.com/hooks</span>
                        <span className="text-[#6b6a65] ml-auto">200</span>
                        <span className="text-[#6b6a65]">38ms</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Live Terminal — typing animation showing real webhook activity
   ───────────────────────────────────────────────────────────────── */
const terminalLines = [
  { time: "12:04:01", text: "POST charge.success", detail: "sig:valid → forwarded (200, 42ms)", color: "text-[#9c9b96]" },
  { time: "12:04:03", text: "POST transfer.completed", detail: "sig:valid → 3 destinations (200, 200, 502)", color: "text-yellow-400" },
  { time: "12:04:03", text: "  └─ retry", detail: "dest:3 backoff:2s → (200, 58ms)", color: "text-emerald-400" },
  { time: "12:04:05", text: "POST charge.failed", detail: "sig:invalid → blocked (enforcement on)", color: "text-red-400" },
  { time: "12:04:05", text: "  └─ alert", detail: "#webhook-alerts → slack notified", color: "text-purple-400" },
  { time: "12:04:08", text: "POST payment.successful", detail: "sig:valid → transform + forward (200, 51ms)", color: "text-[#9c9b96]" },
  { time: "12:04:09", text: "POST invoice.created", detail: "sig:valid → deduplicated (seen 2m ago)", color: "text-yellow-400" },
  { time: "12:04:12", text: "POST subscription.created", detail: "sig:valid → forwarded (200, 33ms)", color: "text-[#9c9b96]" },
];

function LiveTerminal() {
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisibleLines((prev) => {
        if (prev >= terminalLines.length) {
          setTimeout(() => setVisibleLines(0), 2000);
          return prev;
        }
        return prev + 1;
      });
    }, 900);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rounded-2xl border border-[#1e1e1c] bg-[#0c0c0b] overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-[#1e1e1c]">
        <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 text-[10px] text-[#6b6a65] font-mono tracking-wide">
          hookdash stream — production
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-500" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[10px] text-emerald-400 font-mono">connected</span>
        </span>
      </div>
      <div className="p-5 font-mono text-[11px] sm:text-[12px] leading-7 min-h-[260px]">
        {terminalLines.slice(0, visibleLines).map((line, i) => (
          <div key={i} className="animate-slide-in flex gap-x-3" style={{ animationDelay: `${i * 0.04}s` }}>
            <span className="text-[#3a3a36] shrink-0">{line.time}</span>
            <span className="text-[#ececea] shrink-0">{line.text}</span>
            <span className={`${line.color} truncate`}>{line.detail}</span>
          </div>
        ))}
        <span className="text-[#3a3a36] animate-pulse">▌</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Scroll reveal hook — IntersectionObserver, no library needed
   ───────────────────────────────────────────────────────────────── */
function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("reveal-visible");
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useReveal();
  return <div ref={ref} className={`reveal ${className}`}>{children}</div>;
}

/* ─────────────────────────────────────────────────────────────────
   Webhook flow diagram — CSS-based, shows the actual routing
   ───────────────────────────────────────────────────────────────── */
function FlowDiagram() {
  return (
    <div className="rounded-2xl border border-[#1e1e1c] bg-[#0c0c0b] p-6 sm:p-8 font-mono text-[11px] sm:text-[12px]">
      <div className="flex items-start gap-4">
        {/* Source */}
        <div className="space-y-3 shrink-0">
          <div className="px-3 py-2 rounded-lg border border-[#1e1e1c] bg-[#141413] text-[#9c9b96]">
            paystack webhook
          </div>
        </div>

        {/* Arrow into Hookdash */}
        <div className="flex flex-col items-center justify-center pt-3 shrink-0">
          <div className="w-8 sm:w-12 h-px bg-[#2ec4a2]" />
        </div>

        {/* Hookdash node */}
        <div className="shrink-0">
          <div className="px-4 py-2.5 rounded-lg border border-[#2ec4a2]/30 bg-[#2ec4a2]/5 text-[#2ec4a2] font-semibold text-center">
            hookdash
            <div className="text-[9px] text-[#6b6a65] font-normal mt-0.5">verify &middot; transform &middot; route</div>
          </div>
        </div>

        {/* Arrows out */}
        <div className="flex flex-col items-center justify-center pt-1 shrink-0">
          <svg width="24" height="60" viewBox="0 0 24 60" className="text-[#2ec4a2]">
            <path d="M0 30 L24 8" stroke="currentColor" strokeWidth="1" fill="none" />
            <path d="M0 30 L24 30" stroke="currentColor" strokeWidth="1" fill="none" />
            <path d="M0 30 L24 52" stroke="currentColor" strokeWidth="1" fill="none" />
          </svg>
        </div>

        {/* Destinations */}
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-lg border border-[#1e1e1c] bg-[#141413] text-[#9c9b96] truncate">
              api.myapp.com
            </div>
            <span className="text-emerald-400 text-[10px] shrink-0">200 ✓</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-lg border border-[#1e1e1c] bg-[#141413] text-[#9c9b96] truncate">
              staging.myapp.com
            </div>
            <span className="text-emerald-400 text-[10px] shrink-0">200 ✓</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-lg border border-[#1e1e1c] bg-[#141413] text-[#9c9b96] truncate">
              partner-api.co/hooks
            </div>
            <span className="text-yellow-400 text-[10px] shrink-0">502 ↻</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Signature verification visual
   ───────────────────────────────────────────────────────────────── */
function SignatureVisual() {
  return (
    <div className="rounded-2xl border border-[#1e1e1c] bg-[#0c0c0b] p-6 font-mono text-[11px] sm:text-[12px] space-y-4">
      {/* Valid signature */}
      <div className="space-y-2">
        <div className="text-[9px] text-[#6b6a65] uppercase tracking-wider">Incoming header</div>
        <div className="text-[#9c9b96]">
          <span className="text-[#6b6a65]">x-paystack-signature: </span>
          sha512=a1b2c3d4e5f6a8b9...
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="text-[#6b6a65]">HMAC-SHA512(body, secret)</span>
          <span className="text-[#6b6a65]">=</span>
          <span className="text-[#9c9b96]">sha512=a1b2c3d4e5f6a8b9...</span>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 text-[10px]">&#10003;</span>
          <span className="text-emerald-400">Signature valid — forwarding</span>
        </div>
      </div>

      <div className="border-t border-[#1e1e1c]" />

      {/* Invalid signature */}
      <div className="space-y-2">
        <div className="text-[#9c9b96]">
          <span className="text-[#6b6a65]">x-paystack-signature: </span>
          sha512=deadbeef000000...
        </div>
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-red-500/10 flex items-center justify-center text-red-400 text-[10px]">&#10007;</span>
          <span className="text-red-400">Signature mismatch — blocked</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Main landing page
   ───────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const router = useRouter();
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = Cookies.get("token");
    if (token) router.replace("/dashboard");
  }, [router]);

  // Hero entrance animation
  useEffect(() => {
    if (!heroRef.current) return;
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.fromTo("[data-h-text]", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.12 })
      .fromTo("[data-h-visual]", { opacity: 0, y: 40, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.8 }, "-=0.3");
  }, []);

  return (
    <div data-theme="dark" className="min-h-screen bg-aurora">
      {/* ── Nav ─────────────────────────────────────────── */}
      <nav className="relative z-20 flex items-center justify-between px-6 sm:px-10 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-md bg-bg-accent flex items-center justify-center"
            style={{ boxShadow: "var(--glow)" }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M2 7h3l2-4 2 8 2-4h3" stroke="var(--text-inverse)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-text-primary tracking-tight">Hookdash</span>
        </div>
        <div className="flex items-center gap-5">
          <a
            href="https://github.com/Olayanju-1234/hooklens"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            GitHub
          </a>
          <Link href="/login" className="text-xs text-text-secondary hover:text-text-primary">
            Log in
          </Link>
          <Link
            href="/signup"
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-bg-accent text-text-inverse hover:bg-bg-accent-hover"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* ── Hero — split layout ──────────────────────────── */}
      <section ref={heroRef} className="relative pt-16 sm:pt-24 pb-20">
        <div className="absolute inset-0 bg-grid bg-grid-fade opacity-[0.08] pointer-events-none" />

        <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-10 grid lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-16 items-center">
          {/* Left — text */}
          <div>
            <div data-h-text className="opacity-0 inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border-primary bg-bg-secondary text-[11px] text-text-tertiary mb-6">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-500" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              Open source &middot; Self-hostable
            </div>

            <h1 data-h-text className="opacity-0 text-4xl sm:text-5xl lg:text-[3.5rem] font-bold text-text-primary leading-[1.1] tracking-tight">
              Stop debugging webhooks
              <br />
              with <span className="text-text-tertiary font-mono text-[0.85em]">console.log</span>
            </h1>

            <p data-h-text className="opacity-0 mt-5 text-base sm:text-lg text-text-secondary leading-relaxed max-w-lg">
              Hookdash captures every webhook, verifies signatures, forwards to
              your servers, and replays failures. See headers, payload, timing,
              and forward status in real time.
            </p>

            <div data-h-text className="opacity-0 mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="group px-6 py-3 rounded-xl text-sm font-semibold bg-bg-accent text-text-inverse hover:bg-bg-accent-hover active:scale-[0.97] transition-all"
                style={{ boxShadow: "var(--glow)" }}
              >
                Start for free
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="inline ml-1.5 transition-transform group-hover:translate-x-0.5">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <a
                href="https://github.com/Olayanju-1234/hooklens"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 rounded-xl text-sm font-medium border border-border-primary text-text-primary hover:bg-bg-hover transition-all"
              >
                Star on GitHub
              </a>
            </div>

            <div data-h-text className="opacity-0 mt-8 flex items-center gap-4 text-[11px] text-text-tertiary">
              <span>Works with</span>
              {["Paystack", "Flutterwave", "Mono", "Stripe"].map((p) => (
                <span key={p} className="text-text-secondary font-medium">{p}</span>
              ))}
              <span className="text-text-tertiary">+ any webhook</span>
            </div>
          </div>

          {/* Right — product mockup */}
          <div data-h-visual className="opacity-0">
            <DashboardPreview />
          </div>
        </div>
      </section>

      {/* ── Product demo — live terminal ─────────────────── */}
      <section className="border-t border-border-primary bg-bg-secondary">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-24">
          <Reveal>
            <div className="grid lg:grid-cols-[1fr_1.4fr] gap-12 items-center">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight leading-tight">
                  Every header.<br />Every byte.<br />In real time.
                </h2>
                <p className="mt-4 text-sm text-text-secondary leading-relaxed">
                  When Paystack sends a webhook and your handler returns a 500,
                  you&apos;re stuck reading server logs and guessing. Hookdash streams
                  every event the moment it arrives — method, headers, body,
                  signature check, forward result, and timing. No polling.
                  No refresh.
                </p>
                <p className="mt-3 text-sm text-text-secondary leading-relaxed">
                  WebSocket-powered. Events appear before your server even
                  processes them.
                </p>
              </div>
              <LiveTerminal />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Feature: Multi-destination forwarding ────────── */}
      <section className="border-t border-border-primary">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-24">
          <Reveal>
            <div className="grid lg:grid-cols-[1.4fr_1fr] gap-12 items-center">
              <FlowDiagram />
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight leading-tight">
                  One webhook,<br />many destinations.
                </h2>
                <p className="mt-4 text-sm text-text-secondary leading-relaxed">
                  Route each event to your production API, staging server, and
                  partner endpoint — simultaneously. Each destination retries
                  independently with exponential backoff. One failure doesn&apos;t
                  block the others.
                </p>
                <p className="mt-3 text-sm text-text-secondary leading-relaxed">
                  Exhausted retries land in a dead letter queue. Replay them
                  whenever you&apos;re ready.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Feature: Signature verification ──────────────── */}
      <section className="border-t border-border-primary bg-bg-secondary">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-24">
          <Reveal>
            <div className="grid lg:grid-cols-[1fr_1.3fr] gap-12 items-center">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight leading-tight">
                  Trust nothing.<br />Verify everything.
                </h2>
                <p className="mt-4 text-sm text-text-secondary leading-relaxed">
                  Paystack uses HMAC-SHA512. Flutterwave uses SHA-256. Mono uses
                  something else entirely. Hookdash knows each provider&apos;s
                  signature scheme and verifies automatically.
                </p>
                <p className="mt-3 text-sm text-text-secondary leading-relaxed">
                  Turn on enforcement to block events that fail verification
                  before they touch your server. Get alerted on Slack when
                  someone sends forged events.
                </p>
              </div>
              <SignatureVisual />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Feature: Replay & Transform ──────────────────── */}
      <section className="border-t border-border-primary">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-24">
          <Reveal>
            <div className="grid lg:grid-cols-2 gap-12 items-start">
              {/* Replay */}
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-text-primary tracking-tight">
                  Replay any event
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Same headers. Same body. Same content-type. One click.
                  When a forward fails at 3am, you don&apos;t need to reconstruct
                  the payload from logs — just hit replay.
                </p>
                <div className="rounded-xl border border-[#1e1e1c] bg-[#0c0c0b] p-4 font-mono text-[11px]">
                  <div className="flex items-center gap-2 text-[#6b6a65]">
                    <span>Event</span>
                    <span className="text-[#ececea]">evt_7f8a2c1d</span>
                    <span className="ml-auto text-red-400">failed (502)</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-[#1e1e1c] flex items-center gap-2">
                    <span className="text-[#6b6a65]">Replay #1</span>
                    <span className="text-emerald-400">→ 200 OK (38ms)</span>
                    <span className="text-emerald-400 ml-auto">&#10003;</span>
                  </div>
                </div>
              </div>

              {/* Transform */}
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-text-primary tracking-tight">
                  Transform payloads mid-flight
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Rename fields, inject values, strip sensitive data — all
                  before forwarding. Your downstream services get exactly the
                  shape they expect. Zero code changes on either side.
                </p>
                <div className="rounded-xl border border-[#1e1e1c] bg-[#0c0c0b] p-4 font-mono text-[11px] space-y-2">
                  <div className="text-[9px] text-[#6b6a65] uppercase tracking-wider">Transform rule</div>
                  <div className="flex items-center gap-3">
                    <span className="text-[#9c9b96]">data.amount</span>
                    <span className="text-[#2ec4a2]">→</span>
                    <span className="text-[#ececea]">data.amount_kobo</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[#9c9b96]">data.card.bin</span>
                    <span className="text-red-400">×</span>
                    <span className="text-[#6b6a65]">removed</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[#6b6a65]">+</span>
                    <span className="text-[#ececea]">meta.source</span>
                    <span className="text-[#6b6a65]">=</span>
                    <span className="text-yellow-300">&quot;hookdash&quot;</span>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Everything else ──────────────────────────────── */}
      <section className="border-t border-border-primary bg-bg-secondary">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-24">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight mb-10">
              And the rest
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-6">
              {[
                { title: "Workspace & teams", desc: "Invite team members, assign roles, scope everything to workspaces." },
                { title: "API key auth", desc: "Generate scoped API keys for programmatic access. Revoke anytime." },
                { title: "Audit log", desc: "Every action logged — who did what, when. Compliance-ready." },
                { title: "Slack, Discord & email alerts", desc: "Get notified when forwards fail, signatures break, or events stop." },
                { title: "CSV & JSON export", desc: "Export your event history for analysis or archival. Filter by date." },
                { title: "Custom response codes", desc: "Return any status code to the webhook sender. Test retry behavior." },
                { title: "Provider test suites", desc: "Built-in test payloads for Paystack, Flutterwave, Mono. No real events needed." },
                { title: "Swagger API docs", desc: "Full OpenAPI documentation at /api/docs. Try endpoints directly." },
                { title: "Event deduplication", desc: "Detect and flag duplicate events based on payload fingerprinting." },
              ].map((f) => (
                <div key={f.title} className="py-3 border-b border-border-primary">
                  <div className="text-sm font-medium text-text-primary">{f.title}</div>
                  <div className="text-xs text-text-secondary mt-1 leading-relaxed">{f.desc}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Built for African developers ─────────────────── */}
      <section className="border-t border-border-primary">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-24">
          <Reveal>
            <div className="grid lg:grid-cols-[1fr_1.2fr] gap-12 items-center">
              <div>
                <div className="text-[11px] text-text-accent font-mono uppercase tracking-wider mb-3">Built for African developers</div>
                <h2 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight leading-tight">
                  First-class support for the providers you actually use.
                </h2>
                <p className="mt-4 text-sm text-text-secondary leading-relaxed">
                  Not every payment gateway works like Stripe. Hookdash ships
                  with built-in signature verification, test payload suites, and
                  webhook documentation for African PSPs. No plugins. No config.
                  It just works.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { name: "Paystack", detail: "HMAC-SHA512 verification, 12 test event types, full webhook docs" },
                  { name: "Flutterwave", detail: "Secret hash verification, 10 test event types, payload schemas" },
                  { name: "Mono", detail: "Signature verification, 8 test event types, DirectPay + Connect" },
                  { name: "Custom", detail: "Any HTTP webhook. Bring your own signature scheme or skip verification" },
                ].map((p) => (
                  <div
                    key={p.name}
                    className="p-4 rounded-xl border border-border-primary bg-bg-secondary hover:border-border-secondary transition-colors"
                  >
                    <div className="text-sm font-semibold text-text-primary">{p.name}</div>
                    <div className="text-[11px] text-text-tertiary mt-1.5 leading-relaxed">{p.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── How it works — quick setup ───────────────────── */}
      <section className="border-t border-border-primary bg-bg-secondary">
        <div className="max-w-4xl mx-auto px-6 sm:px-10 py-24">
          <Reveal>
            <div className="text-center mb-14">
              <h2 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
                Three steps. That&apos;s it.
              </h2>
            </div>

            <div className="space-y-0">
              {[
                {
                  step: "1",
                  title: "Create an endpoint",
                  desc: "Pick your provider, get a unique ingress URL. Looks like: hookdash-api.onrender.com/in/usr_a3f8c1d9",
                },
                {
                  step: "2",
                  title: "Paste it in your provider's dashboard",
                  desc: "Go to Paystack → Settings → Webhooks → paste your Hookdash URL. Same for Flutterwave, Mono, or any provider.",
                },
                {
                  step: "3",
                  title: "Watch events stream in",
                  desc: "Every webhook hits Hookdash first. You see it instantly. It gets verified, transformed, and forwarded to your actual servers.",
                },
              ].map((item, i) => (
                <div key={item.step} className="flex gap-5 py-6">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full border border-border-secondary bg-bg-primary flex items-center justify-center text-text-accent font-mono text-sm font-bold shrink-0">
                      {item.step}
                    </div>
                    {i < 2 && <div className="w-px flex-1 bg-border-primary mt-2" />}
                  </div>
                  <div className="pb-2">
                    <h3 className="text-base font-semibold text-text-primary">{item.title}</h3>
                    <p className="text-sm text-text-secondary mt-1 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Open source ──────────────────────────────────── */}
      <section className="border-t border-border-primary">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-24">
          <Reveal>
            <div className="rounded-2xl border border-border-primary bg-bg-secondary p-8 sm:p-12 grid lg:grid-cols-[1fr_auto] gap-8 items-center">
              <div>
                <div className="text-[11px] text-text-accent font-mono uppercase tracking-wider mb-3">MIT Licensed</div>
                <h2 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
                  Your infrastructure. Your data.
                </h2>
                <p className="mt-3 text-sm text-text-secondary leading-relaxed max-w-lg">
                  Hookdash is fully open source. Deploy on your own servers with
                  Docker, one-click deploy on Render, or use our hosted version.
                  Your webhook data never leaves your control.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <a
                  href="https://github.com/Olayanju-1234/hooklens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 rounded-xl text-sm font-medium border border-border-primary text-text-primary hover:bg-bg-hover transition-all text-center"
                >
                  View on GitHub
                </a>
                <Link
                  href="/signup"
                  className="px-6 py-3 rounded-xl text-sm font-semibold bg-bg-accent text-text-inverse hover:bg-bg-accent-hover transition-all text-center"
                >
                  Use hosted version
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── SDK ───────────────────────────────────────────── */}
      <section className="border-t border-border-primary">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-24">
          <Reveal>
            <div className="text-center mb-12">
              <div className="text-[11px] text-text-accent font-mono uppercase tracking-wider mb-3">Developer SDK</div>
              <h2 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
                Integrate in minutes
              </h2>
              <p className="mt-3 text-sm text-text-secondary max-w-lg mx-auto leading-relaxed">
                Use the official Node.js SDK to manage webhooks programmatically,
                verify signatures, and mirror live traffic to Hookdash.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {/* API Client */}
              <div className="rounded-xl border border-border-primary bg-bg-secondary p-6">
                <div className="text-xs font-mono text-text-accent mb-3">API Client</div>
                <pre className="text-[13px] text-text-primary font-mono leading-relaxed overflow-x-auto whitespace-pre">
{`import { Hookdash } from 'hookdash-sdk'

const hd = new Hookdash({
  apiKey: 'hd_live_...',
})

// List recent events
const events = await hd.events.list({
  provider: 'paystack',
  limit: 20,
})

// Replay a failed webhook
await hd.events.replay(events.data[0].id)`}
                </pre>
              </div>

              {/* Signature Verification */}
              <div className="rounded-xl border border-border-primary bg-bg-secondary p-6">
                <div className="text-xs font-mono text-text-accent mb-3">Verify Signatures</div>
                <pre className="text-[13px] text-text-primary font-mono leading-relaxed overflow-x-auto whitespace-pre">
{`import { verify } from 'hookdash-sdk/verify'

app.post('/webhook', (req, res) => {
  const sig = req.headers[
    'x-paystack-signature'
  ]

  if (!verify.paystack(
    JSON.stringify(req.body),
    sig, process.env.SECRET
  )) {
    return res.status(401).end()
  }

  // Valid — process event
})`}
                </pre>
              </div>

              {/* Middleware */}
              <div className="rounded-xl border border-border-primary bg-bg-secondary p-6">
                <div className="text-xs font-mono text-text-accent mb-3">Express Middleware</div>
                <pre className="text-[13px] text-text-primary font-mono leading-relaxed overflow-x-auto whitespace-pre">
{`import { capture } from 'hookdash-sdk/middleware'

// Mirror webhooks to Hookdash
// Zero latency — async fire & forget
app.use('/webhooks', capture({
  slug: 'usr_a1b2c3d4e5f6',
}))

app.post('/webhooks/paystack',
  (req, res) => {
    // Normal handler runs as usual
    processPayment(req.body)
    res.sendStatus(200)
  }
)`}
                </pre>
              </div>
            </div>

            <div className="mt-8 text-center">
              <code className="inline-block px-4 py-2 rounded-lg bg-bg-tertiary border border-border-primary text-sm font-mono text-text-primary">
                npm install hookdash-sdk
              </code>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────── */}
      <section className="border-t border-border-primary">
        <div className="max-w-4xl mx-auto px-6 sm:px-10 py-28 text-center">
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-bold text-text-primary tracking-tight">
              Stop guessing.<br />Start seeing.
            </h2>
            <p className="mt-4 text-text-secondary text-sm">
              Free forever for open source. No credit card required.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center mt-8 px-7 py-3.5 rounded-xl text-sm font-semibold bg-bg-accent text-text-inverse hover:bg-bg-accent-hover transition-all active:scale-[0.97]"
              style={{ boxShadow: "var(--glow)" }}
            >
              Create free account
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="border-t border-border-primary">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-bg-accent flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                <path d="M2 7h3l2-4 2 8 2-4h3" stroke="var(--text-inverse)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-xs text-text-tertiary">Hookdash</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-text-tertiary">
            <a href="https://github.com/Olayanju-1234/hooklens" target="_blank" rel="noopener noreferrer" className="hover:text-text-secondary">GitHub</a>
            <Link href="/login" className="hover:text-text-secondary">Log in</Link>
            <Link href="/signup" className="hover:text-text-secondary">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
