"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { HookMark } from "@/components/flight-deck/hook-mark";
import { useWebSocket } from "@/hooks/use-websocket";
import { useRef, useEffect, useState } from "react";
import { endpoints as endpointsApi, deadLetter as deadLetterApi, auth as authApi, UserProfile } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";
const INGRESS_BASE = API_URL.replace(/\/api\/?$/, "");
import gsap from "gsap";

const primaryTabs = [
  { label: "Traffic", href: "/dashboard" },
  { label: "History", href: "/dashboard/events" },
  { label: "Routes", href: "/dashboard/endpoints" },
  { label: "Recorder", href: "/dashboard/dead-letter" },
  { label: "Health", href: "/dashboard/stats" },
];

const secondaryGroups = [
  {
    label: "Tools",
    items: [
      { label: "Simulator", href: "/dashboard/test" },
      { label: "Alerts", href: "/dashboard/alerts" },
      { label: "Bags source", href: "/dashboard/bags" },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "API Keys", href: "/dashboard/api-keys" },
      { label: "Audit log", href: "/dashboard/audit" },
      { label: "Provider docs", href: "/dashboard/docs" },
    ],
  },
];

const allSecondaryTabs = secondaryGroups.flatMap((g) => g.items);

export function TabRail() {
  const pathname = usePathname();
  const { logout, ingressSlug, currentWorkspaceId, workspaceList, switchWorkspace } = useAuth();
  const { connected, liveEvents } = useWebSocket();
  const indicatorRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<(HTMLAnchorElement | null)[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [deadLetterCount, setDeadLetterCount] = useState(0);
  const deadLetterRef = useRef(0);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    authApi.me().then(setProfile).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchCount() {
      try {
        const eps = await endpointsApi.list();
        const counts = await Promise.all(
          eps.slice(0, 5).map((ep) => deadLetterApi.list(ep.id).then((items) => items.length).catch(() => 0))
        );
        const total = counts.reduce((a, b) => a + b, 0);
        if (!cancelled && total !== deadLetterRef.current) {
          deadLetterRef.current = total;
          setDeadLetterCount(total);
        }
      } catch {
        // non-critical
      }
    }
    void fetchCount();
    const interval = setInterval(() => void fetchCount(), 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const activeIndex = primaryTabs.findIndex(
    (t) => pathname === t.href || (t.href !== "/dashboard" && pathname.startsWith(t.href)),
  );

  const isSecondaryActive = allSecondaryTabs.some(
    (t) => pathname === t.href || pathname.startsWith(t.href),
  );

  useEffect(() => {
    if (!indicatorRef.current || activeIndex === -1) return;
    const activeTab = tabsRef.current[activeIndex];
    if (!activeTab) return;
    gsap.to(indicatorRef.current, {
      x: activeTab.offsetLeft,
      width: activeTab.offsetWidth,
      opacity: 1,
      duration: 0.3,
      ease: "power3.out",
    });
  }, [activeIndex, pathname]);

  useEffect(() => {
    if (!indicatorRef.current) return;
    if (isSecondaryActive || activeIndex === -1) {
      gsap.to(indicatorRef.current, { opacity: 0, duration: 0.15 });
    }
  }, [isSecondaryActive, activeIndex]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-more-menu]")) setMoreOpen(false);
      if (!target.closest("[data-user-menu]")) setUserMenuOpen(false);
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const liveCount = liveEvents.length;

  return (
    <header className="relative flex items-center h-12 px-4 sm:px-5 bg-bg-secondary border-b border-border-primary shrink-0 z-30">
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="sm:hidden p-1.5 mr-2 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
        aria-label="Menu"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          {mobileMenuOpen ? <path d="M4 4l8 8M12 4l-8 8" /> : <path d="M2 4h12M2 8h12M2 12h12" />}
        </svg>
      </button>

      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2 mr-6 shrink-0 text-text-primary">
        <HookMark size={18} />
        <span className="hidden sm:inline text-[15px] font-extrabold tracking-tight" style={{ fontVariationSettings: '"wdth" 112' }}>hookdash</span>
      </Link>

      {/* Primary tabs */}
      <nav className="relative hidden sm:flex items-center h-full">
        {/* Animated bottom indicator */}
        <div ref={indicatorRef} className="absolute bottom-0 left-0 h-[2px] bg-text-primary pointer-events-none" style={{ width: 0, opacity: 0 }} />

        {primaryTabs.map((tab, i) => {
          const active = i === activeIndex;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              ref={(el) => { tabsRef.current[i] = el; }}
              className={`relative flex items-center gap-1.5 h-full px-3 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors ${
                active ? "text-text-primary" : "text-text-tertiary hover:text-text-primary"
              }`}
            >
              {tab.label}

              {/* Traffic tab — connection dot + session event count */}
              {tab.label === "Traffic" && (
                <span className="flex items-center gap-1">
                  <span className="relative flex h-1.5 w-1.5">
                    {connected && <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-500" />}
                    <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${connected ? "bg-emerald-500" : "bg-red-500"}`} />
                  </span>
                  {liveCount > 0 && (
                    <span className="text-[10px] font-mono tabular-nums text-text-tertiary">{liveCount}</span>
                  )}
                </span>
              )}

              {tab.label === "Recorder" && deadLetterCount > 0 && (
                <span className="px-1 py-px text-[9.5px] font-mono tabular-nums leading-none border border-current text-[var(--s-dead)]">
                  {deadLetterCount}
                </span>
              )}
            </Link>
          );
        })}

        {/* More dropdown */}
        <div className="relative" data-more-menu>
          <button
            onClick={(e) => { e.stopPropagation(); setMoreOpen(!moreOpen); }}
            className={`flex items-center gap-1 h-full px-3 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors cursor-pointer ${
              isSecondaryActive ? "text-text-primary" : "text-text-tertiary hover:text-text-primary"
            }`}
          >
            More
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={`transition-transform duration-200 ${moreOpen ? "rotate-180" : ""}`}>
              <path d="M3 5l3 3 3-3" />
            </svg>
          </button>

          {moreOpen && (
            <div className="absolute top-full left-0 mt-1 w-52 py-1 rounded-sm bg-bg-elevated border border-border-secondary shadow-lg overflow-hidden">
              {secondaryGroups.map((group, gi) => (
                <div key={group.label}>
                  {gi > 0 && <div className="my-1 border-t border-border-primary" />}
                  <p className="px-3 pt-2 pb-1 text-[9px] uppercase tracking-widest text-text-tertiary font-semibold">{group.label}</p>
                  {group.items.map((tab) => {
                    const active = pathname === tab.href || pathname.startsWith(tab.href);
                    return (
                      <Link
                        key={tab.href}
                        href={tab.href}
                        onClick={() => setMoreOpen(false)}
                        className={`flex items-center justify-between px-3 py-2 text-[13px] transition-colors ${
                          active ? "text-text-primary bg-bg-hover" : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
                        }`}
                      >
                        {tab.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-1.5">
        {/* Workspace switcher */}
        {workspaceList.length > 1 && (
          <select
            value={currentWorkspaceId ?? ""}
            onChange={(e) => switchWorkspace(e.target.value)}
            className="hidden sm:block text-[11px] px-2 py-1 rounded-md bg-bg-secondary text-text-secondary border border-border-primary focus:outline-none cursor-pointer"
          >
            {workspaceList.map((ws) => (
              <option key={ws.id} value={ws.id}>{ws.name}</option>
            ))}
          </select>
        )}

        {/* Ingress slug */}
        {ingressSlug && (
          <button
            onClick={() => navigator.clipboard.writeText(`${INGRESS_BASE}/in/${ingressSlug}`)}
            className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-sm bg-bg-secondary text-[11px] font-mono text-text-tertiary hover:text-text-primary transition-colors cursor-copy border border-dashed border-border-secondary"
            title="Click to copy ingress URL"
          >
            <span className="text-text-primary">/in/{ingressSlug}</span>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="opacity-50">
              <rect x="5" y="5" width="8" height="8" rx="1" />
              <path d="M3 11V4a1 1 0 011-1h7" />
            </svg>
          </button>
        )}

        {/* User menu */}
        <div className="relative" data-user-menu>
          <button
            onClick={(e) => { e.stopPropagation(); setUserMenuOpen(!userMenuOpen); }}
            className="flex items-center gap-1.5 p-1 rounded-md hover:bg-bg-hover transition-colors cursor-pointer"
          >
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-bg-accent flex items-center justify-center text-text-inverse text-[10px] font-semibold">
                {profile?.email?.slice(0, 2).toUpperCase() || "?"}
              </div>
            )}
          </button>

          {userMenuOpen && (
            <div className="absolute top-full right-0 mt-1 w-52 py-1 rounded-sm bg-bg-elevated border border-border-secondary shadow-lg">
              {profile && (
                <div className="px-3 py-2 border-b border-border-primary">
                  <p className="text-[12px] font-medium text-text-primary truncate">{profile.email}</p>
                </div>
              )}
              <Link
                href="/dashboard/settings"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-[13px] text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="8" r="2.5" />
                  <path d="M13.3 10a1.1 1.1 0 00.2 1.2l.04.04a1.33 1.33 0 11-1.88 1.88l-.04-.04a1.1 1.1 0 00-1.2-.2 1.1 1.1 0 00-.67 1.01v.12a1.33 1.33 0 11-2.67 0v-.06A1.1 1.1 0 006 12.84a1.1 1.1 0 00-1.2.2l-.04.04a1.33 1.33 0 11-1.88-1.88l.04-.04a1.1 1.1 0 00.2-1.2 1.1 1.1 0 00-1.01-.67h-.12a1.33 1.33 0 110-2.67h.06A1.1 1.1 0 003.16 6a1.1 1.1 0 00-.2-1.2l-.04-.04a1.33 1.33 0 111.88-1.88l.04.04a1.1 1.1 0 001.2.2h.05a1.1 1.1 0 00.67-1.01v-.12a1.33 1.33 0 112.67 0v.06A1.1 1.1 0 0010 3.16a1.1 1.1 0 001.2-.2l.04-.04a1.33 1.33 0 111.88 1.88l-.04.04a1.1 1.1 0 00-.2 1.2v.05a1.1 1.1 0 001.01.67h.12a1.33 1.33 0 010 2.67h-.06a1.1 1.1 0 00-1.01.67z" />
                </svg>
                Settings
              </Link>
              <button
                onClick={() => { setUserMenuOpen(false); logout(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M7 15H4a1 1 0 01-1-1V4a1 1 0 011-1h3M12 12l3-3-3-3M15 9H7" />
                </svg>
                Log out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="absolute top-12 left-0 right-0 bg-bg-primary border-b border-border-primary shadow-lg z-40 sm:hidden">
          <nav className="flex flex-col py-1">
            {[...primaryTabs, ...allSecondaryTabs].map((tab) => {
              const active = pathname === tab.href || (tab.href !== "/dashboard" && pathname.startsWith(tab.href));
              const isDL = tab.label === "Recorder";
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-4 py-2.5 text-[13px] font-medium transition-colors ${
                    active ? "text-text-accent bg-bg-hover" : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {tab.label}
                    {tab.label === "Traffic" && (
                      <span className={`inline-flex rounded-full h-1.5 w-1.5 ${connected ? "bg-emerald-500" : "bg-red-500"}`} />
                    )}
                  </span>
                  {isDL && deadLetterCount > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded bg-red-500/10 text-red-400 leading-none">{deadLetterCount}</span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
