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

const ParticleNetwork = dynamic(() => import("@/components/landing/particle-network"), {
  ssr: false,
});

/* ─── Stagger-reveal for scroll sections ───────────────── */
function useScrollReveal(selector: string, stagger = 0.08) {
  useEffect(() => {
    const els = document.querySelectorAll(selector);
    els.forEach((el) => {
      gsap.fromTo(
        el,
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          ease: "power3.out",
          scrollTrigger: {
            trigger: el,
            start: "top 85%",
            once: true,
          },
        },
      );
    });
    return () => ScrollTrigger.getAll().forEach((t) => t.kill());
  }, [selector, stagger]);
}

/* ─── Counter that counts up on scroll ─────────────────── */
function CountUp({ end, suffix = "" }: { end: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          const duration = 1200;
          const start = performance.now();
          const animate = (now: number) => {
            const t = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            setValue(Math.round(eased * end));
            if (t < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
          observer.unobserve(el);
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [end]);

  return (
    <span ref={ref}>
      {value}
      {suffix}
    </span>
  );
}

/* ─── Typing code block — no terminal chrome ───────────── */
function TypedCode() {
  const lines = [
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

  const [visibleCount, setVisibleCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          lines.forEach((_, i) => {
            setTimeout(() => setVisibleCount((prev) => Math.max(prev, i + 1)), lines[i].delay);
          });
          observer.unobserve(el);
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const highlight = (line: string) => {
    return line
      .replace(/(import|from|const|await|for|of|new)/g, '<span class="text-[#c4b5fd]">$1</span>')
      .replace(/'([^']*)'/g, "'<span class=\"text-[#f5d78a]\">$1</span>'")
      .replace(/(\/\/.*)/g, '<span class="text-[#4a4a45]">$1</span>')
      .replace(/(\{|\}|\(|\))/g, '<span class="text-[#6b6a65]">$1</span>');
  };

  return (
    <div ref={ref} className="relative">
      <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-[#2ec4a2]/20 via-transparent to-transparent" />
      <div className="relative rounded-2xl bg-[#0a0a09] border border-[#1e1e1c] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1e1e1c]">
          <span className="text-[11px] text-[#4a4a45] font-mono">replay-failed.ts</span>
          <span className="text-[10px] text-[#2ec4a2] font-mono">hookdash-sdk</span>
        </div>
        <div className="p-5 font-mono text-[12px] sm:text-[13px] leading-7 min-h-[320px]">
          {lines.slice(0, visibleCount).map((line, i) => (
            <div
              key={i}
              className="flex gap-4 animate-[fadeSlideIn_0.3s_ease-out]"
            >
              <span className="text-[#2a2a28] select-none w-5 text-right shrink-0 text-[11px]">
                {i + 1}
              </span>
              {line.text ? (
                <span
                  className="text-[#9c9b96]"
                  dangerouslySetInnerHTML={{ __html: highlight(line.text) }}
                />
              ) : (
                <span>&nbsp;</span>
              )}
            </div>
          ))}
          <div className="flex gap-4">
            <span className="text-[#2a2a28] select-none w-5 text-right shrink-0 text-[11px]">
              {visibleCount + 1}
            </span>
            <span className="text-[#2ec4a2] animate-pulse">|</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Live event stream — real-time feed ───────────────── */
function LiveFeed() {
  const events = [
    { type: "charge.success", sig: true, dest: "api.myapp.com", status: 200, ms: 42 },
    { type: "transfer.completed", sig: true, dest: "staging.myapp.com", status: 200, ms: 127 },
    { type: "charge.failed", sig: false, dest: null, status: null, ms: null },
    { type: "invoice.created", sig: true, dest: "api.myapp.com", status: 200, ms: 38 },
    { type: "payment.successful", sig: true, dest: "partner-api.co", status: 502, ms: null },
    { type: "subscription.created", sig: true, dest: "api.myapp.com", status: 200, ms: 33 },
    { type: "refund.processed", sig: true, dest: "api.myapp.com", status: 200, ms: 51 },
    { type: "transfer.failed", sig: false, dest: null, status: null, ms: null },
  ];

  const [feed, setFeed] = useState<typeof events>([]);

  useEffect(() => {
    let idx = 0;
    const interval = setInterval(() => {
      setFeed((prev) => {
        const next = [events[idx % events.length], ...prev].slice(0, 6);
        idx++;
        return next;
      });
    }, 1400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-1">
      {feed.map((evt, i) => (
        <div
          key={`${evt.type}-${i}`}
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg font-mono text-[11px] sm:text-[12px] animate-[fadeSlideIn_0.3s_ease-out]"
          style={{
            background: i === 0 ? "rgba(46, 196, 162, 0.04)" : "transparent",
            opacity: 1 - i * 0.12,
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: evt.sig ? "#2ec4a2" : "#ef4444" }}
          />
          <span className="text-[#ececea] w-44 truncate">{evt.type}</span>
          {evt.dest ? (
            <>
              <span className="text-[#4a4a45] mx-1">&rarr;</span>
              <span className="text-[#6b6a65] flex-1 truncate">{evt.dest}</span>
              <span className={evt.status === 200 ? "text-[#2ec4a2]" : "text-yellow-400"}>
                {evt.status}
              </span>
              {evt.ms && <span className="text-[#3a3a36] w-12 text-right">{evt.ms}ms</span>}
            </>
          ) : (
            <span className="text-red-400/60 flex-1">blocked — invalid signature</span>
          )}
        </div>
      ))}
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

  // Hero entrance — staggered text reveal
  useEffect(() => {
    if (!heroRef.current) return;
    const tl = gsap.timeline({ defaults: { ease: "power4.out" } });
    tl.fromTo("[data-hero]", { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.15 });
  }, []);

  // Scroll reveals
  useScrollReveal("[data-reveal]");

  // Parallax on hero visual
  useEffect(() => {
    const visual = document.querySelector("[data-hero-visual]");
    if (!visual) return;
    gsap.to(visual, {
      y: -60,
      ease: "none",
      scrollTrigger: {
        trigger: visual,
        start: "top bottom",
        end: "bottom top",
        scrub: 1,
      },
    });
  }, []);

  return (
    <div data-theme="dark" className="min-h-screen bg-[#0a0a09] text-[#ececea] overflow-x-hidden">
      {/* ── Nav ───────────────────────────────────────── */}
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
              href="https://github.com/Olayanju-1234/hooklens"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 text-xs text-[#6b6a65] hover:text-[#ececea] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              GitHub
            </a>
            <Link href="/login" className="text-xs text-[#6b6a65] hover:text-[#ececea] transition-colors">
              Log in
            </Link>
            <MagneticButton
              href="/signup"
              className="px-4 py-2 rounded-lg text-xs font-medium bg-[#2ec4a2] text-[#0a0a09] hover:bg-[#44d4b4] transition-colors"
            >
              Get started
            </MagneticButton>
          </div>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────── */}
      <section ref={heroRef} className="relative min-h-screen flex items-center justify-center pt-16">
        <ParticleNetwork />

        <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 text-center">
          <div data-hero className="opacity-0 mb-8">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#2ec4a2]/20 bg-[#2ec4a2]/5 text-[11px] text-[#2ec4a2] font-mono">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[#2ec4a2] animate-ping opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#2ec4a2]" />
              </span>
              Open source &middot; Self-hostable
            </span>
          </div>

          <h1 data-hero className="opacity-0 text-5xl sm:text-7xl lg:text-[5.5rem] font-bold leading-[0.95] tracking-tighter">
            <span className="block">Stop debugging</span>
            <span className="block mt-2 bg-gradient-to-r from-[#2ec4a2] via-[#44d4b4] to-[#2ec4a2] bg-clip-text text-transparent bg-[length:200%_auto] animate-[gradientShift_4s_ease-in-out_infinite]">
              webhooks
            </span>
            <span className="block mt-2 text-[#4a4a45]">blindly.</span>
          </h1>

          <p data-hero className="opacity-0 mt-8 text-base sm:text-lg text-[#6b6a65] leading-relaxed max-w-xl mx-auto">
            Hookdash captures every webhook, verifies signatures, forwards to
            your servers, and replays failures. Every header, every byte, in real time.
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
              href="https://github.com/Olayanju-1234/hooklens"
              className="px-8 py-4 rounded-xl text-sm font-medium border border-[#222220] text-[#9c9b96] hover:text-[#ececea] hover:border-[#333330] transition-all"
              strength={0.15}
            >
              View source
            </MagneticButton>
          </div>

          <div data-hero className="opacity-0 mt-12 flex items-center justify-center gap-6 text-[11px] text-[#4a4a45] font-mono">
            {["Paystack", "Flutterwave", "Mono", "Stripe"].map((p) => (
              <span key={p} className="hover:text-[#6b6a65] transition-colors cursor-default">{p}</span>
            ))}
            <span>+ any webhook</span>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
          <span className="text-[10px] text-[#3a3a36] font-mono tracking-wider uppercase">scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-[#3a3a36] to-transparent" />
        </div>
      </section>

      {/* ── Stats strip ───────────────────────────────── */}
      <section className="border-y border-[#1a1a18]">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-16 grid grid-cols-2 sm:grid-cols-4 gap-8">
          {[
            { value: 14, suffix: "", label: "webhook providers" },
            { value: 200, suffix: "ms", label: "avg forward latency" },
            { value: 99, suffix: ".9%", label: "delivery rate" },
            { value: 0, suffix: "", label: "vendor lock-in", static: true },
          ].map((stat) => (
            <div key={stat.label} data-reveal className="text-center">
              <div className="text-3xl sm:text-4xl font-bold text-[#ececea] font-mono tracking-tight">
                {stat.static ? "0" : <CountUp end={stat.value} suffix={stat.suffix} />}
              </div>
              <div className="mt-2 text-xs text-[#4a4a45]">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Live feed + explanation ────────────────────── */}
      <section className="relative">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-32">
          <div className="grid lg:grid-cols-[1fr_1.2fr] gap-16 items-center">
            <div data-reveal>
              <DecodeText
                text="Every header. Every byte. Real time."
                as="h2"
                className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight"
                speed={25}
              />
              <p className="mt-6 text-sm text-[#6b6a65] leading-relaxed">
                When Paystack sends a webhook and your handler returns a 500,
                you&apos;re stuck reading server logs and guessing. Hookdash streams
                every event the moment it arrives &mdash; method, headers, body,
                signature check, forward result, and timing.
              </p>
              <p className="mt-3 text-sm text-[#4a4a45] leading-relaxed">
                WebSocket-powered. Events appear before your server even
                processes them.
              </p>
            </div>
            <div data-reveal data-hero-visual className="relative">
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-b from-[#2ec4a2]/5 to-transparent blur-xl" />
              <div className="relative rounded-2xl border border-[#1a1a18] bg-[#0c0c0b] p-4 overflow-hidden">
                <div className="flex items-center justify-between mb-3 px-2">
                  <span className="text-[10px] text-[#4a4a45] font-mono uppercase tracking-wider">Live events</span>
                  <span className="flex items-center gap-1.5">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-[#2ec4a2] animate-ping opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#2ec4a2]" />
                    </span>
                    <span className="text-[10px] text-[#2ec4a2] font-mono">streaming</span>
                  </span>
                </div>
                <LiveFeed />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Bento grid — features ─────────────────────── */}
      <section className="border-t border-[#1a1a18]">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-32">
          <div data-reveal className="mb-16">
            <DecodeText
              text="Built for webhook infrastructure."
              as="h2"
              className="text-3xl sm:text-4xl font-bold tracking-tight"
              delay={100}
            />
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[#1a1a18] rounded-2xl overflow-hidden border border-[#1a1a18]">
            {[
              {
                title: "Multi-destination routing",
                desc: "One webhook, many servers. Route to production, staging, and partner endpoints simultaneously. Each retries independently.",
                accent: "#2ec4a2",
                large: true,
              },
              {
                title: "Signature verification",
                desc: "HMAC-SHA512 for Paystack, SHA-256 for Flutterwave, custom for Mono. Automatic detection. Block forged events.",
                accent: "#c4b5fd",
                large: true,
              },
              {
                title: "One-click replay",
                desc: "Same headers, same body, same content-type. When a forward fails at 3am, just hit replay.",
                accent: "#f5d78a",
                large: true,
              },
              {
                title: "Payload transforms",
                desc: "Rename fields, inject values, strip sensitive data mid-flight. Zero code changes.",
                accent: "#f5a3a0",
              },
              {
                title: "Dead letter queue",
                desc: "Exhausted retries? Events land safely. Replay when you're ready.",
                accent: "#7dd3fc",
              },
              {
                title: "Audit log",
                desc: "Every action logged — who did what, when. Compliance-ready.",
                accent: "#c4b5fd",
              },
              {
                title: "Team workspaces",
                desc: "Invite members, assign roles, scope everything to workspaces.",
                accent: "#2ec4a2",
              },
              {
                title: "Alerting",
                desc: "Slack, Discord, email. Get notified when forwards fail or signatures break.",
                accent: "#f5d78a",
              },
              {
                title: "API keys",
                desc: "Scoped programmatic access. Generate, rotate, revoke anytime.",
                accent: "#7dd3fc",
              },
            ].map((f) => (
              <div
                key={f.title}
                data-reveal
                className={`group bg-[#0c0c0b] p-7 transition-colors hover:bg-[#111110] ${f.large ? "sm:col-span-1" : ""}`}
              >
                <div
                  className="w-1 h-6 rounded-full mb-5 transition-all group-hover:h-8"
                  style={{ background: f.accent }}
                />
                <h3 className="text-sm font-semibold text-[#ececea] mb-2">{f.title}</h3>
                <p className="text-xs text-[#6b6a65] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SDK section — typed code ───────────────────── */}
      <section className="border-t border-[#1a1a18]">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-32">
          <div className="grid lg:grid-cols-[1fr_1.3fr] gap-16 items-center">
            <div data-reveal>
              <span className="text-[11px] text-[#2ec4a2] font-mono uppercase tracking-wider">Developer SDK</span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
                Integrate in<br />minutes, not days.
              </h2>
              <p className="mt-6 text-sm text-[#6b6a65] leading-relaxed">
                Official Node.js SDK. Zero dependencies. Manage webhooks
                programmatically, verify signatures with timing-safe comparison,
                and mirror live traffic with Express middleware.
              </p>
              <div className="mt-8 flex flex-col gap-3">
                <code className="inline-flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[#111110] border border-[#1e1e1c] text-[13px] font-mono text-[#9c9b96] w-fit">
                  <span className="text-[#4a4a45]">$</span>
                  npm install hookdash-sdk
                </code>
                <div className="flex gap-6 text-[11px] font-mono text-[#4a4a45]">
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

      {/* ── African developers section ─────────────────── */}
      <section className="border-t border-[#1a1a18]">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-32">
          <div data-reveal className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-[11px] text-[#2ec4a2] font-mono uppercase tracking-wider">Built in Lagos</span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight">
              First-class support for the providers you actually use.
            </h2>
            <p className="mt-6 text-sm text-[#6b6a65] leading-relaxed">
              Not every payment gateway works like Stripe. Hookdash ships with
              built-in signature verification, test payload suites, and webhook
              documentation for African PSPs.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { name: "Paystack", scheme: "HMAC-SHA512", events: "12 test events" },
              { name: "Flutterwave", scheme: "SHA-256 hash", events: "10 test events" },
              { name: "Mono", scheme: "Signature header", events: "8 test events" },
              { name: "Custom", scheme: "Bring your own", events: "Any HTTP webhook" },
            ].map((p) => (
              <div
                key={p.name}
                data-reveal
                className="group relative p-6 rounded-xl border border-[#1a1a18] bg-[#0c0c0b] hover:border-[#2a2a28] transition-colors"
              >
                <div className="absolute top-0 left-6 w-8 h-px bg-[#2ec4a2] opacity-0 group-hover:opacity-100 transition-opacity" />
                <h3 className="text-base font-semibold mb-3">{p.name}</h3>
                <div className="space-y-1.5 text-xs text-[#6b6a65]">
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-[#2ec4a2]" />
                    {p.scheme}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-[#2ec4a2]" />
                    {p.events}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────── */}
      <section className="border-t border-[#1a1a18] bg-[#0c0c0b]">
        <div className="max-w-4xl mx-auto px-6 sm:px-10 py-32">
          <div data-reveal className="text-center mb-20">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Three steps. That&apos;s it.
            </h2>
          </div>

          <div className="space-y-0">
            {[
              {
                step: "01",
                title: "Create an endpoint",
                desc: "Pick your provider, get a unique ingress URL.",
                code: "hookdash-api.onrender.com/in/usr_a3f8c1d9",
              },
              {
                step: "02",
                title: "Paste in your provider dashboard",
                desc: "Go to Paystack \u2192 Settings \u2192 Webhooks \u2192 paste your Hookdash URL.",
                code: null,
              },
              {
                step: "03",
                title: "Watch events stream in",
                desc: "Every webhook hits Hookdash first. Verified, transformed, forwarded.",
                code: null,
              },
            ].map((item) => (
              <div key={item.step} data-reveal className="group flex gap-8 py-10 border-b border-[#1a1a18] last:border-0">
                <span className="text-4xl font-bold text-[#1e1e1c] group-hover:text-[#2ec4a2]/20 transition-colors font-mono shrink-0">
                  {item.step}
                </span>
                <div>
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="text-sm text-[#6b6a65] mt-1.5">{item.desc}</p>
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

      {/* ── Open source ───────────────────────────────── */}
      <section className="border-t border-[#1a1a18]">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-32">
          <div data-reveal className="relative rounded-2xl overflow-hidden">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#2ec4a2]/10 via-transparent to-[#c4b5fd]/5" />
            <div className="relative p-10 sm:p-16 grid lg:grid-cols-[1.2fr_auto] gap-10 items-center">
              <div>
                <div className="flex items-center gap-2 mb-5">
                  <span className="w-2 h-2 rounded-full bg-[#2ec4a2]" />
                  <span className="text-[11px] text-[#2ec4a2] font-mono uppercase tracking-wider">MIT Licensed</span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                  Your infrastructure.<br />Your data.
                </h2>
                <p className="mt-5 text-sm text-[#6b6a65] leading-relaxed max-w-md">
                  Hookdash is fully open source. Deploy on your own servers with
                  Docker, one-click deploy on Render, or use our hosted version.
                  Your webhook data never leaves your control.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <MagneticButton
                  href="https://github.com/Olayanju-1234/hooklens"
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

      {/* ── CTA ───────────────────────────────────────── */}
      <section className="border-t border-[#1a1a18]">
        <div className="max-w-4xl mx-auto px-6 sm:px-10 py-40 text-center">
          <div data-reveal>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter leading-[0.95]">
              <span className="block">Stop guessing.</span>
              <span className="block mt-2 text-[#4a4a45]">Start seeing.</span>
            </h2>
            <p className="mt-8 text-sm text-[#4a4a45]">
              Free forever for open source. No credit card required.
            </p>
            <MagneticButton
              href="/signup"
              className="inline-flex items-center mt-12 px-10 py-4.5 rounded-xl text-sm font-semibold bg-[#2ec4a2] text-[#0a0a09] hover:bg-[#44d4b4] transition-all hover:shadow-[0_0_60px_rgba(46,196,162,0.3)] active:scale-[0.97]"
              strength={0.2}
            >
              Create free account
            </MagneticButton>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────── */}
      <footer className="border-t border-[#1a1a18]">
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
              <p className="text-xs text-[#4a4a45] leading-relaxed mb-4">
                Open source webhook infrastructure for developers.
              </p>
              <div className="flex items-center gap-1.5 text-[11px] text-[#4a4a45]">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#2ec4a2]" />
                Built in Lagos
              </div>
            </div>

            <div>
              <div className="text-[11px] text-[#3a3a36] uppercase tracking-wider font-medium mb-4">Product</div>
              <div className="space-y-2.5">
                <Link href="/signup" className="block text-xs text-[#6b6a65] hover:text-[#ececea] transition-colors">Get started</Link>
                <Link href="/login" className="block text-xs text-[#6b6a65] hover:text-[#ececea] transition-colors">Log in</Link>
                <span className="block text-xs text-[#4a4a45]">Pricing</span>
                <span className="block text-xs text-[#4a4a45]">Changelog</span>
              </div>
            </div>

            <div>
              <div className="text-[11px] text-[#3a3a36] uppercase tracking-wider font-medium mb-4">Resources</div>
              <div className="space-y-2.5">
                <span className="block text-xs text-[#4a4a45]">Documentation</span>
                <span className="block text-xs text-[#4a4a45]">API reference</span>
                <span className="block text-xs text-[#4a4a45]">SDK guide</span>
                <span className="block text-xs text-[#4a4a45]">Status</span>
              </div>
            </div>

            <div>
              <div className="text-[11px] text-[#3a3a36] uppercase tracking-wider font-medium mb-4">Community</div>
              <div className="space-y-2.5">
                <a href="https://github.com/Olayanju-1234/hooklens" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-[#6b6a65] hover:text-[#ececea] transition-colors">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                  GitHub
                </a>
                <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-[#6b6a65] hover:text-[#ececea] transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  Twitter / X
                </a>
                <span className="block text-xs text-[#4a4a45]">Discord</span>
              </div>
            </div>
          </div>

          <div className="mt-14 pt-6 border-t border-[#1a1a18] flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-[11px] text-[#3a3a36]">
              &copy; {new Date().getFullYear()} Hookdash. MIT License.
            </span>
            <span className="text-[11px] text-[#3a3a36]">
              Made with intent.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
