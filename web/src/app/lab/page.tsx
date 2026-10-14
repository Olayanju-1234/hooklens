"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChapterId } from "@/components/lab/hub-scene";
import { RouteMap2D } from "@/components/lab/route-map-2d";
import { RecorderBar } from "@/components/lab/recorder-bar";
import { Flap } from "@/components/lab/split-flap";
import { LabMark } from "@/components/lab/lab-mark";
import { createSim, useReducedMotion, useSimReadout, useWebGL } from "@/components/lab/use-sim";
import { DESTINATIONS, SOURCES } from "@/components/lab/sim/catalog";

const HubScene = dynamic(() => import("@/components/lab/hub-scene"), {
  ssr: false,
  loading: () => <p className="noscript-note">Loading chart…</p>,
});

const OUTAGE_TARGET = "billing";
const SUPPORTED_TODAY = new Set(["stripe", "paystack", "flutterwave", "bags"]);

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

export default function LabLanding() {
  const reduced = useReducedMotion();
  const webgl = useWebGL();
  const [sim] = useState(() => createSim(7));
  const readout = useSimReadout(sim);
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
    (type: "forge" | "burst" | "replay-dead", dest?: string) => {
      if (sim.clock.rewound) return;
      sim.world.act(type, sim.clock.live, dest ? { dest } : {});
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
  const lockTitle = rewound ? "Return to live to change the world" : undefined;
  const billing = DESTINATIONS.find((d) => d.id === OUTAGE_TARGET)!;

  return (
    <div className="lab-root" data-lab-theme="night">
      <header className="lab-top">
        <Link href="/lab" className="lab-mark" aria-label="Hookdash lab home">
          <LabMark />
          hookdash
        </Link>
        <nav className="lab-nav" aria-label="Lab">
          <a href="#sources">Sources</a>
          <Link href="/lab/tower">The Tower</Link>
          <a href="https://github.com/Olayanju-1234/hooklens" target="_blank" rel="noreferrer">
            Source
          </a>
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
            <RouteMap2D
              className="stage-2d"
              world={sim.world}
              clock={sim.clock}
              theme="night"
              stats={stats}
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
                Webhooks from payments, code, commerce, chains and AI agents, all landing on one gateway that proves
                each one is genuine, delivers it everywhere it needs to go, and records every moment so you can rewind.
              </p>
              <div className="hero-cta">
                <Link href="/signup" className="btn">
                  Get an ingress URL
                </Link>
                <code>npx hookdash listen 3000</code>
              </div>
              <p className="hero-hint">
                Everything moving here is simulated webhook traffic. Click a destination to take it down. ← → rewinds.
              </p>
            </div>
          </section>

          <section className="chapter" data-chapter="arrivals" aria-label="Arrivals">
            <Strip
              n="01"
              code="ARR"
              tone="white"
              eyebrow="Arrivals"
              title="Any provider. One door."
              fields={[
                ["sources", `${SOURCES.length} on chart`],
                ["recipes", "Std Webhooks + 9"],
                ["ingress", "one URL each"],
              ]}
            >
              <p>
                Payments, code, commerce, identity, messaging, on-chain and agent callbacks each get their own ingress
                URL. Hookdash reads event type and delivery id from wherever the provider puts them: GitHub&apos;s
                <code> X-GitHub-Event</code>, Stripe&apos;s <code>evt_</code> ids, Svix&apos;s <code>webhook-id</code>.
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
                ["schemes", "hex · b64 · ts"],
              ]}
              actions={
                <button type="button" className="chip" data-tone="red" onClick={() => act("forge")} disabled={rewound}>
                  Forge one
                </button>
              }
            >
              <p>
                Every packet passes the gate. HMAC-SHA256 or SHA-512, SHA-1 over URL and params, hex or base64,
                timestamped or not. Each provider is one recipe. The rose turns one tick per verified event; forged
                packets never get through, and they break apart where you can see them.
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
                ["destinations", `${DESTINATIONS.length}`],
                ["p50", stats?.p50 ? `${stats.p50} ms` : "—"],
                ["rings", "10ms · 100ms · 1s"],
              ]}
            >
              <p>
                Verified events fan out to every destination on their route. Each destination sits at its median
                latency, with rings at 10 ms, 100 ms and 1 s, so a slow service is far away. Green rings mark a 2xx
                landing.
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
                ["attempts", "4 max"],
                ["backoff", "×2 per level"],
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
                When a destination fails, its deliveries don&apos;t disappear into a queue. They climb a holding stack
                above it, one level per retry, and each level holds twice as long as the one below.{" "}
                {billingDown ? `${billing.host} is down right now. Watch the stack build.` : "Take a destination down to watch the stack build."}
              </p>
            </Strip>
          </section>

          <section className="chapter" data-chapter="recorder" aria-label="Dead letters and replay">
            <Strip
              n="05"
              code="REC"
              tone="orange"
              eyebrow="The recorder"
              title="Rewind anything."
              fields={[
                ["dead letters", stats ? `${stats.dead}` : "—"],
                ["recorder", "2 min window"],
                ["replay", rewound ? "locked" : "ready"],
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
                Deliveries that run out of retries land as dead letters, painted flight-recorder orange because
                they&apos;re meant to be found. Drag the recorder back to watch any moment again. Once the destination
                is healthy, replay them; replays fly the magenta line.
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
              title={lockTitle ?? (anyDown ? "A destination is still down — replays to it will fail again" : undefined)}
            >
              Replay dead letters{stats?.dead ? ` (${stats.dead})` : ""}
            </button>
          </div>
          <RecorderBar sim={sim} offset={offset} mode={mode} />
        </div>
      </div>

      <section className="lab-section" id="sources" aria-labelledby="sources-title">
        <div className="lab-section-inner">
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
                {SOURCES.map((s, i) => {
                  const today = SUPPORTED_TODAY.has(s.id);
                  const text = (v: string) => (boardVisible ? v : "".padEnd(v.length, " "));
                  return (
                    <tr key={s.id} style={{ ["--row" as string]: i }}>
                      <td>
                        <Flap text={text(s.label)} width={12} reduced={reduced} />
                      </td>
                      <td className="t-src">{s.kind}</td>
                      <td>{s.scheme}</td>
                      <td className="t-src">{s.header}</td>
                      <td className="fids-status" data-s={today ? "today" : "next"}>
                        <Flap text={text(today ? "ON TIME" : "BOARDING")} width={8} reduced={reduced} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="hero-hint">
            ON TIME = verified by Hookdash today. BOARDING = next on the roadmap. Standard Webhooks alone covers Clerk,
            OpenAI and every other Svix-style sender.
          </p>
        </div>
      </section>

      <section className="lab-section" aria-labelledby="tower-title">
        <div className="lab-section-inner split">
          <div>
            <div className="section-head" style={{ gridTemplateColumns: "1fr", marginBottom: 20 }}>
              <span className="eyebrow">The Tower</span>
              <h2 id="tower-title">The dashboard is the same chart.</h2>
            </div>
            <p>
              The live view becomes a tower: a top-down radar of your routes, an arrivals board that flips as states
              change, and a flight recorder for whichever event you click. Every attempt, every hold and every replay
              sits on one strip.
            </p>
            <p>It runs on Canvas 2D, so it works without WebGL and in daylight.</p>
            <Link href="/lab/tower" className="btn btn--ghost">
              Open the Tower →
            </Link>
          </div>
          <pre className="term" aria-label="Example CLI session">
            <span className="p">$ </span>npx hookdash listen 3000 --source stripe{"\n"}
            <span className="p">  </span>
            <span className="ok">✓</span> sealed  payment_intent.succeeded  evt_3Qx…  → localhost:3000  <span className="ok">200</span> 41ms{"\n"}
            <span className="p">  </span>
            <span className="warn">↻</span> hold 2/4 invoice.paid  evt_3Qy…  → localhost:3000  <span className="warn">503</span>{"\n"}
            <span className="p">  </span>
            <span className="ok">✓</span> sealed  invoice.paid  evt_3Qy…  → localhost:3000  <span className="ok">200</span> 38ms{"\n"}
            <span className="p">$ </span>npx hookdash replay --since 10m --status dead --to localhost:3000{"\n"}
            <span className="p">  </span>
            <span className="rep">⟲</span> replaying 7 dead letters at original spacing ×10
          </pre>
        </div>
      </section>

      <footer className="lab-foot">
        <span>Hookdash · MIT · built in Lagos</span>
        <span>Lab prototype · all traffic simulated</span>
      </footer>
    </div>
  );
}
