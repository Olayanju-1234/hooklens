"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Cookies from "js-cookie";
import type { ChapterId } from "@/components/flight-deck/hub-scene";
import { Radar } from "@/components/flight-deck/radar";
import { simRadarModel } from "@/components/flight-deck/sim-radar";
import { RecorderBar } from "@/components/flight-deck/recorder-bar";
import { Flap } from "@/components/flight-deck/split-flap";
import { HookMark } from "@/components/flight-deck/hook-mark";
import { createSim, useReducedMotion, useSimReadout, useWebGL } from "@/components/flight-deck/use-sim";
import { DESTINATIONS, SOURCES } from "@/components/flight-deck/sim/catalog";
import { INGRESS_BASE } from "@/lib/api";

const HubScene = dynamic(() => import("@/components/flight-deck/hub-scene"), {
  ssr: false,
  loading: () => <p className="noscript-note">Loading chart…</p>,
});

const OUTAGE_TARGET = "billing";
const REPO = "https://github.com/Olayanju-1234/hooklens";
const INGRESS_HOST = INGRESS_BASE.replace(/^https?:\/\//, "");

interface BoardRow {
  label: string;
  kind: string;
  scheme: string;
  header: string;
  today: boolean;
}

const BOARD: BoardRow[] = [
  ...SOURCES.slice(0, 3).map((s) => ({ label: s.label, kind: s.kind, scheme: s.scheme, header: s.header, today: true })),
  { label: "Mono", kind: "open banking", scheme: "HMAC-SHA512", header: "mono-webhook-secret", today: true },
  ...SOURCES.slice(3).map((s) => ({ label: s.label, kind: s.kind, scheme: s.scheme, header: s.header, today: s.id === "bags" })),
];

function Strip(props: {
  n: string;
  code: string;
  tone: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  fields?: [string, string][];
  actions?: React.ReactNode;
}) {
  return (
    <article className="strip" data-tone={props.tone}>
      <div className="strip-code" aria-hidden>
        <b>{props.code}</b>
        <span>{props.n}</span>
      </div>
      <div className="strip-body">
        <div className="strip-eyebrow">{props.eyebrow}</div>
        <h2>{props.title}</h2>
        {props.children}
        {props.fields && (
          <dl className="strip-fields">
            {props.fields.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {props.actions && <div className="strip-actions">{props.actions}</div>}
      </div>
    </article>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const webgl = useWebGL();
  const [sim] = useState(() => createSim(7));
  const readout = useSimReadout(sim);
  const [radarModel] = useState(() => simRadarModel(sim));
  const [chapter, setChapter] = useState<ChapterId>("hero");
  const [stageActive, setStageActive] = useState(true);
  const [pinned, setPinned] = useState(true);
  const [motionOptIn, setMotionOptIn] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const autoOutage = useRef(false);
  const [boardVisible, setBoardVisible] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

  const { stats, offset, mode } = readout;
  const rewound = offset < -0.05;
  const frozen = reduced && !motionOptIn;

  useEffect(() => {
    if (Cookies.get("token")) router.replace("/dashboard");
  }, [router]);

  useEffect(() => {
    sim.clock.setFrozen(frozen);
  }, [sim, frozen]);

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-chapter]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setChapter(e.target.getAttribute("data-chapter") as ChapterId);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    const wrap = wrapRef.current;
    const stageIo = new IntersectionObserver(([e]) => setStageActive(e.isIntersecting), { threshold: 0 });
    if (wrap) stageIo.observe(wrap);
    const board = boardRef.current;
    const boardIo = new IntersectionObserver(([e]) => e.isIntersecting && setBoardVisible(true), { threshold: 0.3 });
    if (board) boardIo.observe(board);
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (wrap) setPinned(wrap.getBoundingClientRect().bottom > window.innerHeight - 2);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      stageIo.disconnect();
      boardIo.disconnect();
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const act = useCallback(
    (type: "forge" | "burst" | "replay-dead") => {
      if (sim.clock.rewound) return;
      sim.world.act(type, sim.clock.live);
    },
    [sim],
  );

  const toggleDest = useCallback(
    (id: string) => {
      if (sim.clock.rewound) return;
      const down = sim.world.isDown(id, sim.clock.live);
      sim.world.act(down ? "restore" : "outage", sim.clock.live, { dest: id });
    },
    [sim],
  );

  const restoreAndReplay = useCallback(() => {
    if (sim.clock.rewound) return;
    const t = sim.clock.live;
    for (const d of DESTINATIONS) if (sim.world.isDown(d.id, t)) sim.world.act("restore", t, { dest: d.id });
    sim.world.act("replay-dead", t + 0.6);
  }, [sim]);

  useEffect(() => {
    if (chapter !== "holding" || autoOutage.current || sim.clock.rewound) return;
    autoOutage.current = true;
    if (!sim.world.isDown(OUTAGE_TARGET, sim.clock.live)) sim.world.act("outage", sim.clock.live, { dest: OUTAGE_TARGET });
  }, [chapter, sim]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!stageActive || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") sim.clock.step(-5);
      else if (e.key === "ArrowRight") sim.clock.step(5);
      else if (e.key.toLowerCase() === "l") sim.clock.goLive();
      else if (e.key.toLowerCase() === "f") act("forge");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sim, stageActive, act]);

  const billingDown = !!stats?.dests[OUTAGE_TARGET]?.down;
  const anyDown = stats ? Object.values(stats.dests).some((d) => d.down) : false;
  const lockTitle = rewound ? "Return to live to change the simulation" : undefined;
  const billing = DESTINATIONS.find((d) => d.id === OUTAGE_TARGET)!;

  return (
    <div className="fd-root">
      <header className="fd-top">
        <Link href="/" className="fd-mark" aria-label="Hookdash home">
          <HookMark />
          hookdash
        </Link>
        <nav className="fd-nav" aria-label="Site">
          <a href="#sources">Sources</a>
          <Link href="/demo">Live demo</Link>
          <a href={REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <Link href="/login">Log in</Link>
        </nav>
        <Link href="/signup" className="btn">
          Get an ingress URL
        </Link>
      </header>

      <div className="stage-wrap" ref={wrapRef}>
        <div className="stage">
          {webgl === true && (
            <HubScene
              world={sim.world}
              clock={sim.clock}
              stats={stats}
              chapter={chapter}
              reducedMotion={reduced}
              onToggleDest={toggleDest}
              active={stageActive}
            />
          )}
          {webgl === false && (
            <Radar
              className="stage-2d"
              model={radarModel}
              reducedMotion={frozen}
              onToggleDest={toggleDest}
              label="Top-down chart of simulated webhook traffic"
            />
          )}
        </div>

        <main className="chapters">
          <section className="chapter" data-chapter="hero" aria-labelledby="hero-title">
            <div className="hero-copy">
              <div className="hero-kicker">Hookdash · open-source event gateway</div>
              <h1 className="hero-title" id="hero-title">
                Every event,
                <br />
                in flight<span className="dot">.</span>
              </h1>
              <p className="hero-lede">
                One ingress URL for your webhooks. Hookdash checks every signature, delivers each event to every
                destination on its route, retries with backoff when one fails, and keeps a record you can replay.
              </p>
              <div className="hero-cta">
                <Link href="/signup" className="btn">
                  Get an ingress URL
                </Link>
                <code>POST {INGRESS_HOST}/in/usr_…</code>
              </div>
              <p className="hero-hint">
                Everything moving here is simulated traffic. Click a destination to take it down. ← → rewinds.
              </p>
            </div>
          </section>

          <section className="chapter" data-chapter="arrivals" aria-label="Arrivals">
            <Strip
              n="01"
              code="ARR"
              tone="white"
              eyebrow="Arrivals"
              title="Payments today. Everything else next."
              fields={[
                ["verified today", "5 providers"],
                ["on the board", `${BOARD.length} sources`],
                ["next", "Std Webhooks"],
              ]}
            >
              <p>
                Point Stripe, Paystack, Flutterwave, Mono or Bags at your ingress URL and events land with their
                headers, raw body and event type intact. GitHub, Shopify, Clerk, Twilio and other Standard Webhooks
                senders are on the roadmap.
              </p>
            </Strip>
          </section>

          <section className="chapter" data-chapter="seal" aria-label="Signature verification">
            <Strip
              n="02"
              code="SIG"
              tone="cyan"
              eyebrow="The seal"
              title="Proven before it’s trusted."
              fields={[
                ["sealed", stats ? `${stats.sealedPct.toFixed(1)}%` : "—"],
                ["rejected", stats ? `${stats.rejected} / min` : "—"],
                ["compare", "timing-safe"],
              ]}
              actions={
                <button type="button" className="chip" data-tone="red" onClick={() => act("forge")} disabled={rewound}>
                  Forge one
                </button>
              }
            >
              <p>
                Every event passes the gate before anything trusts it: HMAC-SHA512 for Paystack, Stripe&apos;s
                timestamped HMAC-SHA256 with replay protection, and each provider&apos;s own scheme. You can block
                forged events outright. The rose turns one tick per verified event.
              </p>
            </Strip>
          </section>

          <section className="chapter" data-chapter="departures" aria-label="Fan-out">
            <Strip
              n="03"
              code="DEP"
              tone="green"
              eyebrow="Departures"
              title="Distance is latency."
              fields={[
                ["destinations", "per endpoint"],
                ["p50", stats?.p50 ? `${stats.p50} ms` : "—"],
                ["rings", "10ms · 100ms · 1s"],
              ]}
            >
              <p>
                Verified events fan out to every destination on the endpoint, with transforms applied on the way.
                On this chart each destination sits at its median latency, so a slow service is literally far away.
                Green rings mark a 2xx landing.
              </p>
            </Strip>
          </section>

          <section className="chapter" data-chapter="holding" aria-label="Retries">
            <Strip
              n="04"
              code="HLD"
              tone="amber"
              eyebrow="Holding pattern"
              title="Backoff you can see."
              fields={[
                ["holding", stats ? `${stats.holding}` : "—"],
                ["retries", "per endpoint"],
                ["backoff", "exponential"],
              ]}
              actions={
                <button
                  type="button"
                  className="chip"
                  data-tone="amber"
                  aria-pressed={billingDown}
                  onClick={() => toggleDest(OUTAGE_TARGET)}
                  disabled={rewound}
                >
                  {billingDown ? `Restore ${billing.host}` : `Take ${billing.host} down`}
                </button>
              }
            >
              <p>
                When a destination fails, Hookdash retries with exponential backoff and only re-sends to the
                destinations that haven&apos;t succeeded yet. Here each retry climbs one level of the holding stack.{" "}
                {billingDown ? `${billing.host} is down right now. Watch the stack build.` : "Take a destination down to watch it build."}
              </p>
            </Strip>
          </section>

          <section className="chapter" data-chapter="recorder" aria-label="Dead letters and replay">
            <Strip
              n="05"
              code="REC"
              tone="orange"
              eyebrow="The recorder"
              title="Nothing is lost."
              fields={[
                ["dead letters", stats ? `${stats.dead}` : "—"],
                ["replay", "one click"],
                ["export", "CSV · JSON"],
              ]}
              actions={
                <>
                  <button type="button" className="chip" data-tone="magenta" onClick={restoreAndReplay} disabled={rewound}>
                    Restore &amp; replay
                  </button>
                  <button type="button" className="chip chip--quiet" onClick={() => sim.clock.step(-20)}>
                    Rewind 20s
                  </button>
                </>
              }
            >
              <p>
                Deliveries that run out of retries land in the dead-letter queue, drawn in flight-recorder orange
                because they&apos;re meant to be found. Fix the destination, then retry them or replay any event.
                Replays fly the magenta line.
              </p>
            </Strip>
          </section>
        </main>
      </div>

      <div className="hud-layer" data-show={pinned}>
        <dl className="hud-readout" aria-label="Simulated traffic, last 60 seconds">
          <div className="hud-cell">
            <dt>arr / min</dt>
            <dd>{stats ? stats.perMin : "—"}</dd>
          </div>
          <div className="hud-cell">
            <dt>sealed</dt>
            <dd className={stats && stats.rejected ? "tone-red" : undefined}>{stats ? `${stats.sealedPct.toFixed(1)}%` : "—"}</dd>
          </div>
          <div className="hud-cell">
            <dt>holding</dt>
            <dd className={stats && stats.holding ? "tone-amber" : undefined}>{stats ? stats.holding : "—"}</dd>
          </div>
          <div className="hud-cell">
            <dt>dead letters</dt>
            <dd className={stats && stats.dead ? "tone-orange" : undefined}>{stats ? stats.dead : "—"}</dd>
          </div>
          <div className="hud-cell">
            <dt>p50</dt>
            <dd>{stats?.p50 ? `${stats.p50}ms` : "—"}</dd>
          </div>
        </dl>

        <div className="hud-bottom">
          <div className="hud-actions">
            {frozen && (
              <button type="button" className="chip" data-tone="cyan" onClick={() => setMotionOptIn(true)}>
                Play traffic
              </button>
            )}
            <button type="button" className="chip" data-tone="red" onClick={() => act("forge")} disabled={rewound} title={lockTitle}>
              Forge a signature
            </button>
            <button type="button" className="chip" data-tone="cyan" onClick={() => act("burst")} disabled={rewound} title={lockTitle}>
              Burst ×24
            </button>
            <button
              type="button"
              className="chip"
              data-tone="amber"
              aria-pressed={billingDown}
              onClick={() => toggleDest(OUTAGE_TARGET)}
              disabled={rewound}
              title={lockTitle}
            >
              {billingDown ? `Restore ${billing.host}` : `Take ${billing.host} down`}
            </button>
            <button
              type="button"
              className="chip"
              data-tone="magenta"
              onClick={() => act("replay-dead")}
              disabled={rewound || !stats?.dead}
              title={lockTitle ?? (anyDown ? "A destination is still down, so replays to it will fail again" : undefined)}
            >
              Replay dead letters{stats?.dead ? ` (${stats.dead})` : ""}
            </button>
          </div>
          <RecorderBar sim={sim} offset={offset} mode={mode} />
        </div>
      </div>

      <section className="fd-section" id="sources" aria-labelledby="sources-title">
        <div className="fd-section-inner">
          <div className="section-head">
            <span className="eyebrow">Sources board</span>
            <h2 id="sources-title">Not just payments.</h2>
          </div>
          <div className="fids-wrap" ref={boardRef}>
            <table className="fids">
              <thead>
                <tr>
                  <th scope="col">SOURCE</th>
                  <th scope="col">KIND</th>
                  <th scope="col">SIGNATURE</th>
                  <th scope="col">HEADER</th>
                  <th scope="col">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {BOARD.map((s) => {
                  const text = (v: string) => (boardVisible ? v : "".padEnd(v.length, " "));
                  return (
                    <tr key={s.label}>
                      <td>
                        <Flap text={text(s.label)} width={12} reduced={reduced} />
                      </td>
                      <td className="t-src">{s.kind}</td>
                      <td>{s.scheme}</td>
                      <td className="t-src">{s.header}</td>
                      <td className="fids-status" data-s={s.today ? "today" : "next"}>
                        <Flap text={text(s.today ? "ON TIME" : "BOARDING")} width={8} reduced={reduced} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="hero-hint">
            ON TIME = verified by Hookdash today. BOARDING = on the roadmap. A Standard Webhooks recipe alone covers
            Clerk, OpenAI and every other Svix-style sender.
          </p>
        </div>
      </section>

      <section className="fd-section" aria-labelledby="tower-title">
        <div className="fd-section-inner split">
          <div>
            <div className="section-head" style={{ gridTemplateColumns: "1fr", marginBottom: 20 }}>
              <span className="eyebrow">The Tower</span>
              <h2 id="tower-title">The dashboard is the same chart.</h2>
            </div>
            <p>
              Traffic opens on a radar of your routes, an arrivals board that flips as each delivery changes state,
              and a flight recorder for whichever event you click: signature, every attempt per destination, payload
              and replay.
            </p>
            <p>It runs on Canvas 2D, so it works on any machine.</p>
            <div className="hero-cta">
              <Link href="/demo" className="btn btn--ghost">
                Try the live demo →
              </Link>
            </div>
          </div>
          <pre className="term" aria-label="Example webhook delivery">
            <span className="p">$ </span>curl -X POST https://{INGRESS_HOST}/in/usr_3fa9c1d2e7b4 \{"\n"}
            <span className="p">    </span>-H &apos;x-paystack-signature: 9c1f…e04a&apos; \{"\n"}
            <span className="p">    </span>-d &apos;{"{"}&quot;event&quot;:&quot;charge.success&quot;, …{"}"}&apos;{"\n"}
            <span className="ok">200 OK</span>{"\n\n"}
            <span className="p">  </span>
            <span className="ok">✓</span> sealed   charge.success   → api.acme.dev      <span className="ok">200</span> 41ms{"\n"}
            <span className="p">  </span>
            <span className="warn">↻</span> retry 2  charge.success   → billing.internal  <span className="warn">503</span>{"\n"}
            <span className="p">  </span>
            <span className="ok">✓</span> sealed   charge.success   → billing.internal  <span className="ok">200</span> 118ms
          </pre>
        </div>
      </section>

      <footer className="fd-foot">
        <span>© {new Date().getFullYear()} Hookdash · MIT · built in Lagos</span>
        <span className="fd-foot-links">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a href={REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </span>
      </footer>
    </div>
  );
}
