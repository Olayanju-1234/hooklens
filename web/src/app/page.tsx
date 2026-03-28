"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import DecodeText from "@/components/landing/decode-text";
import MagneticButton from "@/components/landing/magnetic-button";

gsap.registerPlugin(ScrollTrigger);

const ParticleNetwork = dynamic(
  () => import("@/components/landing/particle-network"),
  { ssr: false },
);

function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll("[data-reveal]");
    els.forEach((el) => {
      gsap.fromTo(
        el,
        { opacity: 0, y: 32 },
        {
          opacity: 1,
          y: 0,
          duration: 0.65,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
        },
      );
    });
    return () => ScrollTrigger.getAll().forEach((t) => t.kill());
  }, []);
}

/* ─── Live event feed ───────────────────────────────────── */
const WEBHOOK_EVENTS = [
  { type: "charge.success",      provider: "paystack",    sig: true,  dest: "api.myapp.com",     status: 200, ms: 42  },
  { type: "transfer.completed",  provider: "paystack",    sig: true,  dest: "staging.myapp.com", status: 200, ms: 127 },
  { type: "charge.failed",       provider: "paystack",    sig: false, dest: null,                status: null, ms: null },
  { type: "token_launch",        provider: "bags",        sig: true,  dest: "api.myapp.com",     status: 200, ms: 38  },
  { type: "payment.successful",  provider: "flutterwave", sig: true,  dest: "partner-api.co",    status: 502, ms: null },
  { type: "swap",                provider: "bags",        sig: true,  dest: "api.myapp.com",     status: 200, ms: 29  },
  { type: "invoice.created",     provider: "mono",        sig: true,  dest: "api.myapp.com",     status: 200, ms: 55  },
  { type: "fee_claim_available", provider: "bags",        sig: true,  dest: "bot.myapp.com",     status: 200, ms: 18  },
];

const PROVIDER_COLORS: Record<string, string> = {
  paystack:    "#10b981",
  flutterwave: "#f59e0b",
  mono:        "#3b82f6",
  bags:        "#a855f7",
};

function LiveFeed() {
  const [feed, setFeed] = useState<typeof WEBHOOK_EVENTS>([]);
  const idx = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFeed((prev) => {
        const next = [WEBHOOK_EVENTS[idx.current % WEBHOOK_EVENTS.length], ...prev].slice(0, 7);
        idx.current++;
        return next;
      });
    }, 1300);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-px">
      {feed.map((evt, i) => (
        <div
          key={`${evt.type}-${i}`}
          className="grid grid-cols-[8px_140px_80px_1fr_52px_48px] items-center gap-3 px-4 py-2 font-mono text-[11px] sm:text-[12px] transition-all"
          style={{ opacity: Math.max(1 - i * 0.13, 0.15) }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: evt.sig ? (PROVIDER_COLORS[evt.provider] ?? "#2ec4a2") : "#ef4444" }}
          />
          <span className="text-[#ececea] truncate">{evt.type}</span>
          <span className="truncate" style={{ color: PROVIDER_COLORS[evt.provider] ?? "#6b6a65" }}>{evt.provider}</span>
          {evt.dest ? (
            <>
              <span className="text-[#3a3a36] truncate">{evt.dest}</span>
              <span className={`text-right ${evt.status === 200 ? "text-[#2ec4a2]" : "text-yellow-400"}`}>{evt.status}</span>
              <span className="text-[#2a2a28] text-right">{evt.ms ? `${evt.ms}ms` : "—"}</span>
            </>
          ) : (
            <>
              <span className="text-red-400/50 col-span-2">blocked — invalid signature</span>
              <span />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Bags event feed ───────────────────────────────────── */
const BAGS_EVENTS = [
  { type: "token_launch",        mint: "7xKq...f4Rp", name: "MOON",   ms: 12  },
  { type: "swap",                mint: "3mPz...w9Vc", name: "DOGE2",  ms: 8   },
  { type: "fee_claim_available", mint: "9aLn...k2Qx", name: "PEPE",   ms: 5   },
  { type: "token_launch",        mint: "2bYt...r7Md", name: "BONK2",  ms: 21  },
  { type: "swap",                mint: "5jNw...p1Zs", name: "WIF",    ms: 9   },
];

function BagsFeed() {
  const [feed, setFeed] = useState<typeof BAGS_EVENTS>([]);
  const idx = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFeed((prev) => {
        const next = [BAGS_EVENTS[idx.current % BAGS_EVENTS.length], ...prev].slice(0, 5);
        idx.current++;
        return next;
      });
    }, 1600);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-px">
      {feed.map((evt, i) => (
        <div
          key={`${evt.type}-${i}`}
          className="flex items-center gap-4 px-4 py-2.5 font-mono text-[12px]"
          style={{ opacity: Math.max(1 - i * 0.18, 0.15) }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
          <span className="text-purple-300 w-28 shrink-0">{evt.type}</span>
          <span className="text-[#ececea] w-16 shrink-0">${evt.name}</span>
          <span className="text-[#4a4a45] flex-1 truncate">{evt.mint}</span>
          <span className="text-purple-500/60">{evt.ms}ms</span>
          <span className="text-emerald-500/80 text-[10px]">200</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Typed code block ──────────────────────────────────── */
const TYPED_CODE_LINES = [
  { text: "import { Hookdash } from 'hookdash-sdk'", delay: 0 },
  { text: "", delay: 200 },
  { text: "const hd = new Hookdash({", delay: 400 },
  { text: "  apiKey: process.env.HOOKDASH_KEY", delay: 600 },
  { text: "})", delay: 800 },
  { text: "", delay: 1000 },
  { text: "const events = await hd.events.list({", delay: 1200 },
  { text: "  provider: 'paystack',", delay: 1400 },
  { text: "  status: 'failed'", delay: 1600 },
  { text: "})", delay: 1800 },
  { text: "", delay: 2000 },
  { text: "// Replay all failed events", delay: 2200 },
  { text: "for (const evt of events.data) {", delay: 2400 },
  { text: "  await hd.events.replay(evt.id)", delay: 2600 },
  { text: "}", delay: 2800 },
];

function TypedCode() {
  const [visibleCount, setVisibleCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          TYPED_CODE_LINES.forEach((_, i) => {
            setTimeout(() => setVisibleCount((p) => Math.max(p, i + 1)), TYPED_CODE_LINES[i].delay);
          });
          observer.unobserve(el);
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const highlight = (line: string) =>
    line
      .replace(/(import|from|const|await|for|of|new)/g, '<span class="text-[#c4b5fd]">$1</span>')
      .replace(/'([^']*)'/g, "'<span class=\"text-[#f5d78a]\">$1</span>'")
      .replace(/(\/\/.*)/g, '<span class="text-[#4a4a45]">$1</span>')
      .replace(/(\{|\}|\(|\))/g, '<span class="text-[#6b6a65]">$1</span>');

  return (
    <div ref={ref} className="relative">
      <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-[#2ec4a2]/15 via-transparent to-transparent" />
      <div className="relative rounded-2xl bg-[#0a0a09] border border-[#1e1e1c] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1e1e1c]">
          <span className="text-[11px] text-[#4a4a45] font-mono">replay-failed.ts</span>
          <span className="text-[10px] text-[#2ec4a2] font-mono">hookdash-sdk</span>
        </div>
        <div className="p-5 font-mono text-[12px] sm:text-[13px] leading-7 min-h-[300px]">
          {TYPED_CODE_LINES.slice(0, visibleCount).map((line, i) => (
            <div key={i} className="flex gap-4 animate-[fadeSlideIn_0.3s_ease-out]">
              <span className="text-[#2a2a28] select-none w-5 text-right shrink-0 text-[11px]">{i + 1}</span>
              {line.text ? (
                <span className="text-[#9c9b96]" dangerouslySetInnerHTML={{ __html: highlight(line.text) }} />
              ) : <span>&nbsp;</span>}
            </div>
          ))}
          <div className="flex gap-4">
            <span className="text-[#2a2a28] select-none w-5 text-right shrink-0 text-[11px]">{visibleCount + 1}</span>
            <span className="text-[#2ec4a2] animate-pulse">|</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const router = useRouter();
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = Cookies.get("token");
    if (token) router.replace("/dashboard");
  }, [router]);

  useEffect(() => {
    if (!heroRef.current) return;
    gsap.fromTo(
      "[data-hero]",
      { opacity: 0, y: 40 },
      { opacity: 1, y: 0, duration: 0.8, stagger: 0.12, ease: "power4.out" },
    );
  }, []);

  useScrollReveal();

  return (
    <div data-theme="dark" className="min-h-screen bg-[#0a0a09] text-[#ececea] overflow-x-hidden">

      {/* ── Nav ─────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0a0a09]/80 border-b border-white/[0.04]">
        <div className="flex items-center justify-between px-6 sm:px-10 py-4 max-w-7xl mx-auto">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#2ec4a2] flex items-center justify-center">
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M2 7h3l2-4 2 8 2-4h3" stroke="#0a0a09" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight">Hookdash</span>
          </Link>
          <div className="flex items-center gap-6">
            <a
              href="https://github.com/Olayanju-1234/hookdash"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 text-xs text-[#6b6a65] hover:text-[#ececea] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              GitHub
            </a>
            <Link href="/login" className="text-xs text-[#6b6a65] hover:text-[#ececea] transition-colors">Log in</Link>
            <MagneticButton
              href="/signup"
              className="px-4 py-2 rounded-lg text-xs font-medium bg-[#2ec4a2] text-[#0a0a09] hover:bg-[#44d4b4] transition-colors"
            >
              Get started
            </MagneticButton>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────── */}
      <section ref={heroRef} className="relative min-h-screen flex items-center justify-center pt-16">
        <ParticleNetwork />
        <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 text-center">

          <div data-hero className="opacity-0 mb-8">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#2ec4a2]/20 bg-[#2ec4a2]/5 text-[11px] text-[#2ec4a2] font-mono">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[#2ec4a2] animate-ping opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#2ec4a2]" />
              </span>
              Open source &middot; Self-hostable &middot; Bags ecosystem
            </span>
          </div>

          <h1 data-hero className="opacity-0 text-5xl sm:text-7xl lg:text-[5.5rem] font-bold leading-[0.95] tracking-tighter">
            <span className="block">Stop debugging</span>
            <span className="block mt-2 text-[#2ec4a2]">webhooks</span>
            <span className="block mt-2 text-[#3a3a36]">blindly.</span>
          </h1>

          <p data-hero className="opacity-0 mt-8 text-base sm:text-lg text-[#6b6a65] leading-relaxed max-w-xl mx-auto">
            One ingress URL. Your providers point at it — Hookdash handles the rest.
            HMAC verification, exponential backoff, dead letter queuing, one-click replay.
            Every event. Every header. Every byte.
          </p>

          <div data-hero className="opacity-0 mt-12 flex flex-wrap items-center justify-center gap-4">
            <MagneticButton
              href="/signup"
              className="group px-8 py-4 rounded-xl text-sm font-semibold bg-[#2ec4a2] text-[#0a0a09] hover:bg-[#44d4b4] transition-all hover:shadow-[0_0_40px_rgba(46,196,162,0.3)] active:scale-[0.97]"
              strength={0.2}
            >
              Start for free
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="inline ml-2 transition-transform group-hover:translate-x-1">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </MagneticButton>
            <MagneticButton
              href="https://github.com/Olayanju-1234/hookdash"
              className="px-8 py-4 rounded-xl text-sm font-medium border border-[#222220] text-[#9c9b96] hover:text-[#ececea] hover:border-[#333330] transition-all"
              strength={0.15}
            >
              View source
            </MagneticButton>
          </div>

          <div data-hero className="opacity-0 mt-10 flex items-center justify-center gap-5 text-[11px] text-[#3a3a36] font-mono">
            {["Paystack", "Flutterwave", "Mono", "Bags", "+ any webhook"].map((p) => (
              <span key={p} className={`hover:text-[#6b6a65] transition-colors cursor-default ${p === "Bags" ? "text-purple-600 hover:text-purple-400" : ""}`}>{p}</span>
            ))}
          </div>
        </div>

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
          <span className="text-[10px] text-[#2a2a28] font-mono tracking-wider uppercase">scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-[#2a2a28] to-transparent" />
        </div>
      </section>

      {/* ── Full-width live feed ─────────────────────────── */}
      <section className="border-y border-[#111110] bg-[#080807]">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] text-[#3a3a36] font-mono uppercase tracking-wider">Example event stream</span>
            <span className="text-[10px] text-[#3a3a36] font-mono">simulated</span>
          </div>
          <div className="border border-[#141413] rounded-xl overflow-hidden divide-y divide-[#0f0f0e]">
            <div className="grid grid-cols-[8px_140px_80px_1fr_52px_48px] gap-3 px-4 py-2 bg-[#0c0c0b]">
              {["", "event", "provider", "destination", "status", "lat"].map((h, i) => (
                <span key={i} className="text-[9px] uppercase tracking-widest text-[#2a2a28] font-medium">{h}</span>
              ))}
            </div>
            <LiveFeed />
          </div>
        </div>
      </section>

      {/* ── Feature 1: Real-time capture ─────────────────── */}
      <section className="border-b border-[#111110]">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-28">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            <div data-reveal>
              <span className="text-[10px] text-[#2ec4a2] font-mono uppercase tracking-wider">Real-time capture</span>
              <DecodeText
                text="Every header. Every byte."
                as="h2"
                className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight leading-tight"
                speed={25}
              />
              <p className="mt-6 text-sm text-[#6b6a65] leading-relaxed">
                When Paystack fires a webhook and your handler returns a 500, you&apos;re stuck reading server logs and guessing. Hookdash streams every event the moment it arrives — method, headers, body, signature check, forward result, and timing.
              </p>
              <div className="mt-8 space-y-3">
                {[
                  "WebSocket-powered. Events appear before your server processes them",
                  "HMAC-SHA512 · SHA-256 · custom — automatic per-provider detection",
                  "Forward to multiple destinations simultaneously",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 text-sm text-[#6b6a65]">
                    <span className="w-1 h-1 rounded-full bg-[#2ec4a2] shrink-0 mt-2" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div data-reveal className="relative">
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-b from-[#2ec4a2]/5 to-transparent blur-xl" />
              <div className="relative rounded-2xl border border-[#1a1a18] bg-[#0c0c0b] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a18]">
                  <span className="text-[10px] text-[#4a4a45] font-mono uppercase tracking-wider">incoming events</span>
                  <span className="text-[10px] text-[#3a3a36] font-mono">simulated</span>
                </div>
                <div className="py-2">
                  <LiveFeed />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Bags section ─────────────────────────────────── */}
      <section className="relative border-b border-[#1a1218] bg-[#0d0a10] overflow-hidden">
        {/* Purple glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-purple-900/20 blur-[80px] rounded-full" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[200px] bg-purple-800/10 blur-[60px] rounded-full" />
        </div>

        <div className="relative max-w-6xl mx-auto px-6 sm:px-10 py-28">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            <div data-reveal className="relative rounded-2xl border border-purple-900/40 bg-[#0a080d] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-purple-900/30">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  <span className="text-[10px] text-purple-500 font-mono uppercase tracking-wider">bags restream</span>
                </div>
                <span className="text-[10px] text-purple-600 font-mono">wss://restream.bags.fm/ws</span>
              </div>
              <div className="py-2">
                <BagsFeed />
              </div>
              <div className="px-4 py-3 border-t border-purple-900/20 flex items-center justify-between">
                <span className="text-[10px] font-mono text-purple-700">HMAC-SHA256 verified</span>
                <span className="text-[10px] font-mono text-purple-700">forwarded → your endpoint</span>
              </div>
            </div>

            <div data-reveal>
              <span className="text-[10px] text-purple-400 font-mono uppercase tracking-wider">Solana integration</span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
                Bags Restream,<br />
                <span className="text-purple-400">delivered.</span>
              </h2>
              <p className="mt-6 text-sm text-[#6b6a65] leading-relaxed">
                Hookdash bridges the Bags WebSocket into your existing HTTP infrastructure. Token launches, swaps, and fee claims — all converted to signed webhooks and forwarded to your endpoints automatically.
              </p>
              <div className="mt-8 space-y-3">
                {[
                  "Token launch events with creator, mint, and initial buy data",
                  "Fee claim alerts when your LP positions are ready to collect",
                  "Per-endpoint launch filters — creators watchlist, min buy, symbol patterns",
                  "Slack & Discord alert templates built for Bags events",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 text-sm text-[#6b6a65]">
                    <span className="w-1 h-1 rounded-full bg-purple-500 shrink-0 mt-2" />
                    {item}
                  </div>
                ))}
              </div>
              <div className="mt-8">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border border-purple-800/60 text-purple-300 hover:bg-purple-900/30 hover:border-purple-700 transition-all"
                >
                  Connect Bags
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature 2: SDK + replay ──────────────────────── */}
      <section className="border-b border-[#111110]">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-28">
          <div className="grid lg:grid-cols-[1fr_1.2fr] gap-20 items-center">
            <div data-reveal>
              <span className="text-[10px] text-[#2ec4a2] font-mono uppercase tracking-wider">Developer SDK</span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
                Integrate in<br />minutes, not days.
              </h2>
              <p className="mt-6 text-sm text-[#6b6a65] leading-relaxed">
                Official Node.js SDK. Zero dependencies. Manage webhooks programmatically, verify signatures with timing-safe comparison, and replay failures without touching your provider dashboard.
              </p>
              <div className="mt-8 space-y-3">
                <code className="inline-flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[#111110] border border-[#1e1e1c] text-[13px] font-mono text-[#9c9b96] w-fit">
                  <span className="text-[#3a3a36]">$</span>
                  npm install hookdash-sdk
                </code>
                <div className="flex gap-5 text-[11px] font-mono text-[#3a3a36]">
                  <span>TypeScript-first</span>
                  <span>ESM + CJS</span>
                  <span>0 deps</span>
                </div>
              </div>
            </div>
            <div data-reveal>
              <TypedCode />
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────── */}
      <section className="border-b border-[#111110] bg-[#0c0c0b]">
        <div className="max-w-4xl mx-auto px-6 sm:px-10 py-28">
          <div data-reveal className="mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Three steps. That&apos;s it.</h2>
          </div>
          <div className="space-y-0">
            {[
              {
                step: "01",
                title: "Create an endpoint",
                desc: "Pick your provider, get a unique ingress URL. Configure signature verification, retry policy, and forward destinations.",
                code: "hookdash-web.vercel.app/in/usr_a3f8c1d9",
              },
              {
                step: "02",
                title: "Paste in your provider dashboard",
                desc: "Go to Paystack → Settings → Webhooks → paste your Hookdash URL. Same for Flutterwave, Mono, Bags, or any custom provider.",
                code: null,
              },
              {
                step: "03",
                title: "Watch events stream in",
                desc: "Every webhook hits Hookdash first. Verified against the provider's signature scheme, transformed if needed, forwarded to your servers.",
                code: null,
              },
            ].map((item) => (
              <div key={item.step} data-reveal className="group flex gap-8 py-10 border-b border-[#111110] last:border-0">
                <span className="text-4xl font-bold text-[#161614] group-hover:text-[#2ec4a2]/15 transition-colors font-mono shrink-0 tabular-nums">
                  {item.step}
                </span>
                <div>
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="text-sm text-[#6b6a65] mt-2 leading-relaxed">{item.desc}</p>
                  {item.code && (
                    <code className="inline-block mt-3 px-3 py-1.5 rounded bg-[#111110] border border-[#1e1e1c] text-[11px] font-mono text-[#2ec4a2]">
                      {item.code}
                    </code>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Providers ────────────────────────────────────── */}
      <section className="border-b border-[#111110]">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-20">
          <div data-reveal className="mb-10">
            <span className="text-[10px] text-[#3a3a36] font-mono uppercase tracking-wider">Supported providers</span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight">First-class support for the providers you actually use.</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-[#111110] border border-[#111110] rounded-xl overflow-hidden">
            {[
              { name: "Paystack",    scheme: "HMAC-SHA512",    events: "12 test events", color: "#10b981" },
              { name: "Flutterwave", scheme: "SHA-256 hash",   events: "10 test events", color: "#f59e0b" },
              { name: "Mono",        scheme: "Signature header", events: "8 test events",  color: "#3b82f6" },
              { name: "Bags",        scheme: "HMAC-SHA256",    events: "3 test events",  color: "#a855f7" },
              { name: "Custom",      scheme: "Bring your own", events: "Any HTTP webhook", color: "#71717a" },
            ].map((p) => (
              <div key={p.name} data-reveal className="group bg-[#0c0c0b] p-6 hover:bg-[#0f0f0e] transition-colors">
                <div className="w-1.5 h-1.5 rounded-full mb-4 transition-all group-hover:scale-150" style={{ background: p.color }} />
                <h3 className="text-sm font-semibold mb-3">{p.name}</h3>
                <div className="space-y-1.5 text-[11px] text-[#4a4a45]">
                  <div>{p.scheme}</div>
                  <div>{p.events}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Open source ──────────────────────────────────── */}
      <section className="border-b border-[#111110]">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-28">
          <div data-reveal className="relative rounded-2xl border border-[#1a1a18] overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[#2ec4a2]/8 via-transparent to-[#c4b5fd]/4 pointer-events-none" />
            <div className="relative p-10 sm:p-16 grid lg:grid-cols-[1.2fr_auto] gap-10 items-center">
              <div>
                <div className="flex items-center gap-2 mb-5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2ec4a2]" />
                  <span className="text-[11px] text-[#2ec4a2] font-mono uppercase tracking-wider">MIT Licensed</span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                  Your infrastructure.<br />Your data.
                </h2>
                <p className="mt-5 text-sm text-[#6b6a65] leading-relaxed max-w-md">
                  Hookdash is fully open source. Deploy on your own servers with Docker, one-click deploy on Render, or use our hosted version. Your webhook data never leaves your control.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <MagneticButton
                  href="https://github.com/Olayanju-1234/hookdash"
                  className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-sm font-medium border border-[#222220] text-[#ececea] hover:border-[#333330] hover:bg-[#111110] transition-all text-center"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="shrink-0">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                  View on GitHub
                </MagneticButton>
                <MagneticButton
                  href="/signup"
                  className="px-8 py-3.5 rounded-xl text-sm font-semibold bg-[#2ec4a2] text-[#0a0a09] hover:bg-[#44d4b4] transition-all hover:shadow-[0_0_30px_rgba(46,196,162,0.25)] text-center"
                >
                  Use hosted version
                </MagneticButton>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────── */}
      <section>
        <div className="max-w-4xl mx-auto px-6 sm:px-10 py-40 text-center">
          <div data-reveal>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter leading-[0.95]">
              <span className="block">Stop guessing.</span>
              <span className="block mt-2 text-[#3a3a36]">Start seeing.</span>
            </h2>
            <p className="mt-8 text-sm text-[#3a3a36]">Free forever for open source. No credit card required.</p>
            <MagneticButton
              href="/signup"
              className="inline-flex items-center mt-12 px-10 py-4 rounded-xl text-sm font-semibold bg-[#2ec4a2] text-[#0a0a09] hover:bg-[#44d4b4] transition-all hover:shadow-[0_0_60px_rgba(46,196,162,0.3)] active:scale-[0.97]"
              strength={0.2}
            >
              Create free account
            </MagneticButton>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="border-t border-[#111110]">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-16">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-10">
            <div className="col-span-2 sm:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 rounded bg-[#2ec4a2] flex items-center justify-center">
                  <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                    <path d="M2 7h3l2-4 2 8 2-4h3" stroke="#0a0a09" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="text-sm font-semibold">Hookdash</span>
              </div>
              <p className="text-xs text-[#3a3a36] leading-relaxed mb-4">Open source webhook infrastructure for developers.</p>
              <div className="flex items-center gap-1.5 text-[11px] text-[#3a3a36]">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#2ec4a2]" />
                Built in Lagos
              </div>
            </div>

            <div>
              <div className="text-[10px] text-[#2a2a28] uppercase tracking-wider font-medium mb-4">Product</div>
              <div className="space-y-2.5">
                <Link href="/signup" className="block text-xs text-[#4a4a45] hover:text-[#ececea] transition-colors">Get started</Link>
                <Link href="/login" className="block text-xs text-[#4a4a45] hover:text-[#ececea] transition-colors">Log in</Link>
                <span className="block text-xs text-[#2a2a28]">Changelog</span>
              </div>
            </div>

            <div>
              <div className="text-[10px] text-[#2a2a28] uppercase tracking-wider font-medium mb-4">Integrations</div>
              <div className="space-y-2.5">
                {["Paystack", "Flutterwave", "Mono", "Bags (Solana)", "Custom"].map((p) => (
                  <span key={p} className={`block text-xs ${p === "Bags (Solana)" ? "text-purple-700" : "text-[#2a2a28]"}`}>{p}</span>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] text-[#2a2a28] uppercase tracking-wider font-medium mb-4">Community</div>
              <div className="space-y-2.5">
                <a href="https://github.com/Olayanju-1234/hookdash" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-[#4a4a45] hover:text-[#ececea] transition-colors">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                  GitHub
                </a>
                <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-[#4a4a45] hover:text-[#ececea] transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  Twitter / X
                </a>
              </div>
            </div>
          </div>

          <div className="mt-14 pt-6 border-t border-[#111110] flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-[11px] text-[#2a2a28]">&copy; {new Date().getFullYear()} Hookdash. MIT License.</span>
            <span className="text-[11px] text-[#2a2a28]">Made with intent.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
