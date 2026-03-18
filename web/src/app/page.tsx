"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import gsap from "gsap";

/* ── Animated webhook pulse line ───────────────────────────────── */
function WebhookPulse() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = canvas!.offsetWidth * dpr;
      canvas!.height = canvas!.offsetHeight * dpr;
      ctx!.scale(dpr, dpr);
    }
    resize();
    window.addEventListener("resize", resize);

    function draw() {
      const w = canvas!.offsetWidth;
      const h = canvas!.offsetHeight;
      ctx!.clearRect(0, 0, w, h);

      const centerY = h / 2;
      time += 0.015;

      // Draw multiple pulse lines with different phases
      const lines = [
        { color: "rgba(46, 196, 162, 0.6)", width: 2, phase: 0, amp: 40 },
        { color: "rgba(46, 196, 162, 0.25)", width: 1.5, phase: 1.2, amp: 30 },
        { color: "rgba(46, 196, 162, 0.12)", width: 1, phase: 2.4, amp: 50 },
      ];

      for (const line of lines) {
        ctx!.beginPath();
        ctx!.strokeStyle = line.color;
        ctx!.lineWidth = line.width;
        ctx!.lineCap = "round";

        for (let x = 0; x < w; x += 2) {
          const progress = x / w;
          // ECG-like heartbeat pattern
          const pulse = Math.exp(-Math.pow((progress * 6 + time * 2 + line.phase) % 6 - 3, 2) * 2);
          const wave = Math.sin(progress * 12 + time * 3 + line.phase) * 8;
          const spike = pulse * line.amp * Math.sin((progress * 6 + time * 2 + line.phase) % 6 * Math.PI);
          const y = centerY + spike + wave * (1 - pulse * 0.5);

          if (x === 0) ctx!.moveTo(x, y);
          else ctx!.lineTo(x, y);
        }
        ctx!.stroke();
      }

      // Glowing dot traveling along the main line
      const dotX = ((time * 0.4) % 1) * w;
      const dotProgress = dotX / w;
      const dotPulse = Math.exp(-Math.pow((dotProgress * 6 + time * 2) % 6 - 3, 2) * 2);
      const dotWave = Math.sin(dotProgress * 12 + time * 3) * 8;
      const dotSpike = dotPulse * 40 * Math.sin((dotProgress * 6 + time * 2) % 6 * Math.PI);
      const dotY = centerY + dotSpike + dotWave * (1 - dotPulse * 0.5);

      ctx!.beginPath();
      ctx!.arc(dotX, dotY, 4, 0, Math.PI * 2);
      ctx!.fillStyle = "rgba(46, 196, 162, 0.9)";
      ctx!.fill();

      // Glow around dot
      const gradient = ctx!.createRadialGradient(dotX, dotY, 0, dotX, dotY, 20);
      gradient.addColorStop(0, "rgba(46, 196, 162, 0.4)");
      gradient.addColorStop(1, "rgba(46, 196, 162, 0)");
      ctx!.beginPath();
      ctx!.arc(dotX, dotY, 20, 0, Math.PI * 2);
      ctx!.fillStyle = gradient;
      ctx!.fill();

      animationId = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-[200px] sm:h-[260px]"
      style={{ display: "block" }}
    />
  );
}

/* ── Animated typing terminal ──────────────────────────────────── */
const terminalLines = [
  { time: "12:04:01.342", method: "POST", event: "charge.success", sig: "valid", result: "→ forwarded (200, 42ms)", sigColor: "text-emerald-400", resultColor: "text-text-tertiary" },
  { time: "12:04:03.118", method: "POST", event: "transfer.completed", sig: "valid", result: "→ 3 destinations (200, 200, 502)", sigColor: "text-emerald-400", resultColor: "text-yellow-400" },
  { time: "12:04:03.119", method: "POST", event: "transfer.completed", sig: "—", result: "→ retry #1 dest:3 (200, 58ms)", sigColor: "text-text-tertiary", resultColor: "text-emerald-400" },
  { time: "12:04:05.887", method: "POST", event: "charge.failed", sig: "invalid", result: "→ blocked (enforcement)", sigColor: "text-red-400", resultColor: "text-red-400" },
  { time: "12:04:05.888", method: "    ", event: "alert:slack", sig: "", result: "→ #webhook-alerts notified", sigColor: "text-text-tertiary", resultColor: "text-purple-400" },
  { time: "12:04:08.203", method: "POST", event: "payment.successful", sig: "valid", result: "→ transformed + forwarded (200, 51ms)", sigColor: "text-emerald-400", resultColor: "text-text-tertiary" },
  { time: "12:04:09.771", method: "POST", event: "invoice.created", sig: "valid", result: "→ deduplicated (seen 2m ago)", sigColor: "text-emerald-400", resultColor: "text-yellow-400" },
];

function AnimatedTerminal() {
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisibleLines((prev) => {
        if (prev >= terminalLines.length) {
          // Reset after a pause
          setTimeout(() => setVisibleLines(0), 1500);
          return prev;
        }
        return prev + 1;
      });
    }, 800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rounded-2xl border border-border-primary bg-[#0c0c0b] overflow-hidden shadow-2xl">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[#1e1e1c]">
        <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
        <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
        <span className="w-3 h-3 rounded-full bg-[#28c840]" />
        <span className="ml-4 text-[11px] text-[#6b6a65] font-mono tracking-wide uppercase">
          hookdash — live stream
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-500" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[10px] text-emerald-400 font-mono">connected</span>
        </span>
      </div>

      {/* Terminal body */}
      <div className="p-5 font-mono text-[11px] sm:text-[12px] leading-7 min-h-[280px] overflow-hidden">
        {terminalLines.slice(0, visibleLines).map((line, i) => (
          <div
            key={i}
            className="animate-slide-in flex flex-wrap gap-x-2"
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <span className="text-[#4a4a45]">{line.time}</span>
            <span className="text-emerald-400 font-semibold">{line.method}</span>
            <span className="text-[#8b8b85]">{line.event}</span>
            {line.sig && (
              <span className={line.sigColor}>
                {line.sig !== "—" ? `sig:${line.sig}` : ""}
              </span>
            )}
            <span className={line.resultColor}>{line.result}</span>
          </div>
        ))}
        <div className="text-[#4a4a45] mt-1">
          <span className="animate-pulse">▌</span>
        </div>
      </div>
    </div>
  );
}

/* ── Floating webhook cards ────────────────────────────────────── */
function FloatingCard({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    gsap.fromTo(
      ref.current,
      { opacity: 0, y: 40, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.8, delay, ease: "power3.out" },
    );
    // Continuous float
    gsap.to(ref.current, {
      y: -6,
      duration: 3 + delay,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
      delay: delay + 0.8,
    });
  }, [delay]);

  return (
    <div ref={ref} className={`opacity-0 ${className}`}>
      {children}
    </div>
  );
}

/* ── Feature section with visual demos ─────────────────────────── */
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://hookdash-api.onrender.com/api";

function CodeBlock() {
  return (
    <div className="rounded-xl border border-border-primary bg-[#0c0c0b] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#1e1e1c]">
        <span className="text-[10px] text-[#6b6a65] font-mono">cURL</span>
      </div>
      <pre className="p-4 text-[11px] sm:text-[12px] leading-6 font-mono text-[#9c9b96] overflow-x-auto">
        <span className="text-emerald-400">curl</span> -X POST \{"\n"}
        {"  "}{API_URL.replace("/api", "")}/in/
        <span className="text-[#2ec4a2]">usr_a3f8c1d9e2b0</span> \{"\n"}
        {"  "}-H <span className="text-yellow-300">&quot;Content-Type: application/json&quot;</span> \{"\n"}
        {"  "}-d <span className="text-yellow-300">&apos;{"{"}&quot;event&quot;:&quot;charge.success&quot;,&quot;data&quot;:{"{"}...{"}"}{"}"}{"'"}</span>
      </pre>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────── */
export default function LandingPage() {
  const router = useRouter();
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = Cookies.get("token");
    if (token) router.replace("/dashboard");
  }, [router]);

  useEffect(() => {
    if (!heroRef.current) return;
    const tl = gsap.timeline();
    tl.fromTo(
      "[data-hero-badge]",
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" },
    )
      .fromTo(
        "[data-hero-title]",
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" },
        "-=0.3",
      )
      .fromTo(
        "[data-hero-sub]",
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" },
        "-=0.4",
      )
      .fromTo(
        "[data-hero-cta]",
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" },
        "-=0.3",
      );
  }, []);

  return (
    <div className="min-h-screen bg-bg-primary overflow-hidden">
      {/* ── Nav ─────────────────────────────────────────── */}
      <nav className="relative z-20 flex items-center justify-between px-6 sm:px-10 py-5 max-w-7xl mx-auto">
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
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/Olayanju-1234/hooklens"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-sm text-text-tertiary hover:text-text-primary transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            GitHub
          </a>
          <Link
            href="/login"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="px-4 py-2 rounded-lg text-sm font-medium bg-bg-accent text-text-inverse hover:bg-bg-accent-hover transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────── */}
      <section ref={heroRef} className="relative pt-12 sm:pt-20 pb-8">
        {/* Background effects */}
        <div className="absolute inset-0 bg-grid bg-grid-fade opacity-20 pointer-events-none" />
        <div
          className="absolute pointer-events-none"
          style={{
            width: "800px",
            height: "800px",
            top: "-200px",
            left: "50%",
            transform: "translateX(-50%)",
            background:
              "radial-gradient(circle, var(--bg-accent) 0%, transparent 60%)",
            opacity: 0.07,
            filter: "blur(80px)",
          }}
        />

        <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 text-center">
          {/* Badge */}
          <div
            data-hero-badge
            className="opacity-0 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-border-primary bg-bg-secondary text-xs font-medium text-text-secondary mb-8"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-500" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            Open source &middot; Self-hostable &middot; Free
          </div>

          {/* Title */}
          <h1
            data-hero-title
            className="opacity-0 text-[clamp(2.5rem,7vw,5rem)] font-bold text-text-primary leading-[1.05] tracking-tight"
          >
            Your webhooks,
            <br />
            <span className="relative">
              <span className="relative z-10 text-transparent bg-clip-text" style={{
                backgroundImage: "linear-gradient(135deg, var(--bg-accent) 0%, #a78bfa 50%, var(--bg-accent) 100%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 3s ease-in-out infinite",
              }}>
                under control
              </span>
            </span>
          </h1>

          {/* Sub */}
          <p
            data-hero-sub
            className="opacity-0 mt-6 text-lg sm:text-xl text-text-secondary max-w-2xl mx-auto leading-relaxed"
          >
            Inspect every payload. Replay failures. Forward to multiple
            destinations. Catch signature fraud before it hits your server.
          </p>

          {/* CTAs */}
          <div
            data-hero-cta
            className="opacity-0 mt-10 flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <Link
              href="/signup"
              className="group relative px-7 py-3.5 rounded-xl text-sm font-semibold bg-bg-accent text-text-inverse hover:bg-bg-accent-hover transition-all active:scale-[0.97]"
              style={{ boxShadow: "var(--glow)" }}
            >
              Start inspecting
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="inline ml-2 transition-transform group-hover:translate-x-0.5"
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
              className="px-7 py-3.5 rounded-xl text-sm font-medium bg-bg-secondary text-text-primary border border-border-primary hover:border-border-secondary hover:bg-bg-hover transition-all"
            >
              View source
            </a>
          </div>
        </div>

        {/* Webhook pulse visualization */}
        <div className="relative z-10 max-w-4xl mx-auto mt-10 px-6">
          <WebhookPulse />
        </div>
      </section>

      {/* ── Live Terminal ───────────────────────────────── */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 sm:px-10 pb-28">
        <AnimatedTerminal />

        {/* Floating context cards */}
        <div className="hidden lg:block">
          <FloatingCard
            className="absolute -left-4 top-20"
            delay={1.2}
          >
            <div className="px-3.5 py-2.5 rounded-xl bg-bg-secondary border border-border-primary shadow-lg text-xs">
              <div className="text-text-tertiary mb-1">Forwarded to</div>
              <div className="text-text-primary font-mono text-[11px]">3 destinations</div>
              <div className="flex gap-1 mt-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
              </div>
            </div>
          </FloatingCard>

          <FloatingCard
            className="absolute -right-4 top-44"
            delay={1.8}
          >
            <div className="px-3.5 py-2.5 rounded-xl bg-bg-secondary border border-border-primary shadow-lg text-xs">
              <div className="text-text-tertiary mb-1">Latency (p95)</div>
              <div className="text-2xl font-bold text-text-accent font-mono">42ms</div>
            </div>
          </FloatingCard>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────── */}
      <section className="relative border-t border-border-primary bg-bg-secondary">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-text-primary tracking-tight">
              Three lines. You&apos;re live.
            </h2>
            <p className="mt-3 text-text-secondary max-w-lg mx-auto">
              Point your provider&apos;s webhook URL at Hookdash. That&apos;s the entire setup.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div className="space-y-8">
              {[
                {
                  step: "01",
                  title: "Create an endpoint",
                  desc: "Pick your provider. Get a unique ingress URL. Set it in your dashboard — Paystack, Flutterwave, Mono, or anything.",
                },
                {
                  step: "02",
                  title: "Every event streams live",
                  desc: "Headers, body, signature status, timing — all in real-time via WebSocket. No polling. No refresh.",
                },
                {
                  step: "03",
                  title: "Forward, transform, alert",
                  desc: "Route to multiple destinations. Reshape payloads mid-flight. Get alerted on failures before your users notice.",
                },
              ].map((item) => (
                <div key={item.step} className="flex gap-5">
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-bg-accent-subtle flex items-center justify-center text-text-accent font-mono text-sm font-bold">
                    {item.step}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-text-primary mb-1">
                      {item.title}
                    </h3>
                    <p className="text-sm text-text-secondary leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <CodeBlock />
            </div>
          </div>
        </div>
      </section>

      {/* ── Capabilities grid ──────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 sm:px-10 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-text-primary tracking-tight">
            Not just a logger
          </h2>
          <p className="mt-3 text-text-secondary">
            A full webhook operations platform.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border-primary rounded-2xl overflow-hidden border border-border-primary">
          {[
            {
              title: "Multi-destination forwarding",
              desc: "Send each event to N URLs simultaneously. Independent retry per destination.",
              visual: (
                <div className="flex items-center gap-1 mt-3">
                  <div className="h-px flex-1 bg-text-accent" />
                  <div className="flex flex-col gap-1">
                    <div className="h-px w-8 bg-text-accent" />
                    <div className="h-px w-8 bg-text-accent" />
                    <div className="h-px w-8 bg-text-accent" />
                  </div>
                </div>
              ),
            },
            {
              title: "Exponential backoff + DLQ",
              desc: "Failed forwards retry with backoff. Exhausted events land in a dead letter queue for manual retry.",
              visual: (
                <div className="flex items-end gap-1 mt-3 h-6">
                  {[2, 4, 8, 16, 32].map((h, i) => (
                    <div
                      key={i}
                      className="w-3 rounded-sm bg-text-accent opacity-60"
                      style={{ height: `${Math.min(h, 24)}px` }}
                    />
                  ))}
                </div>
              ),
            },
            {
              title: "HMAC signature verification",
              desc: "Auto-verify Paystack, Flutterwave, Mono signatures. Block forged events at the gate.",
              visual: (
                <div className="flex items-center gap-2 mt-3 font-mono text-[10px]">
                  <span className="text-emerald-400">sha256:</span>
                  <span className="text-text-tertiary">a1b2c3...f8e9</span>
                  <span className="text-emerald-400">✓</span>
                </div>
              ),
            },
            {
              title: "Payload transforms",
              desc: "Rename fields, inject values, strip sensitive data — all before forwarding. Zero code changes.",
              visual: (
                <div className="flex items-center gap-2 mt-3 font-mono text-[10px]">
                  <span className="text-text-tertiary">{"{"} amount</span>
                  <span className="text-text-accent">→</span>
                  <span className="text-text-primary">amount_kobo {"}"}</span>
                </div>
              ),
            },
            {
              title: "Event diff & replay",
              desc: "Compare any two payloads side-by-side. Replay events with one click — same headers, same body.",
              visual: (
                <div className="flex gap-2 mt-3 font-mono text-[10px]">
                  <span className="text-red-400 line-through">pending</span>
                  <span className="text-text-tertiary">→</span>
                  <span className="text-emerald-400">success</span>
                </div>
              ),
            },
            {
              title: "Slack, Discord & email alerts",
              desc: "Get notified when forwards fail, signatures break, or events stop coming. Configurable per workspace.",
              visual: (
                <div className="flex items-center gap-2 mt-3">
                  {["#slack", "discord", "email"].map((ch) => (
                    <span
                      key={ch}
                      className="px-2 py-0.5 rounded bg-bg-accent-subtle text-text-accent text-[10px] font-medium"
                    >
                      {ch}
                    </span>
                  ))}
                </div>
              ),
            },
          ].map((f) => (
            <div
              key={f.title}
              className="p-6 bg-bg-primary hover:bg-bg-hover transition-colors"
            >
              <h3 className="text-sm font-semibold text-text-primary">
                {f.title}
              </h3>
              <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
                {f.desc}
              </p>
              {f.visual}
            </div>
          ))}
        </div>
      </section>

      {/* ── Built for Africa ───────────────────────────── */}
      <section className="border-t border-border-primary bg-bg-secondary">
        <div className="max-w-4xl mx-auto px-6 sm:px-10 py-24 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border-primary bg-bg-primary text-xs font-medium text-text-secondary mb-6">
            Built for African developers
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-text-primary tracking-tight">
            First-class PSP support
          </h2>
          <p className="mt-4 text-text-secondary max-w-xl mx-auto leading-relaxed">
            Built-in test payload suites, webhook documentation, and signature
            verification for the providers you actually use.
          </p>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
            {[
              { name: "Paystack", events: "12 events" },
              { name: "Flutterwave", events: "10 events" },
              { name: "Mono", events: "8 events" },
              { name: "Custom", events: "any webhook" },
            ].map((p) => (
              <div
                key={p.name}
                className="px-6 py-4 rounded-xl border border-border-primary bg-bg-primary hover:border-border-secondary transition-colors"
              >
                <div className="text-base font-semibold text-text-primary">
                  {p.name}
                </div>
                <div className="text-xs text-text-tertiary mt-0.5">
                  {p.events}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 100%, var(--bg-accent) 0%, transparent 60%)",
            opacity: 0.05,
          }}
        />
        <div className="relative z-10 max-w-4xl mx-auto px-6 sm:px-10 py-28 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-text-primary tracking-tight">
            Stop <span className="text-text-tertiary line-through">guessing</span>.
            <br />
            Start seeing.
          </h2>
          <p className="mt-4 text-text-secondary">
            Free. Open source. Deploy on your own infra or use ours.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center mt-8 px-7 py-3.5 rounded-xl text-sm font-semibold bg-bg-accent text-text-inverse hover:bg-bg-accent-hover transition-all active:scale-[0.97]"
            style={{ boxShadow: "var(--glow)" }}
          >
            Create free account
          </Link>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────── */}
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
              Hookdash
            </span>
          </div>
          <div className="flex items-center gap-6">
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
              Log in
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
