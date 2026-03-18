"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { useWebSocket } from "@/hooks/use-websocket";
import { useRef, useEffect } from "react";
import gsap from "gsap";

const tabs = [
  { label: "Live", href: "/dashboard" },
  { label: "Events", href: "/dashboard/events" },
  { label: "Endpoints", href: "/dashboard/endpoints" },
  { label: "Test", href: "/dashboard/test" },
  { label: "Analytics", href: "/dashboard/stats" },
  { label: "Alerts", href: "/dashboard/alerts" },
  { label: "Audit", href: "/dashboard/audit" },
  { label: "Docs", href: "/dashboard/docs" },
];

export function TabRail() {
  const pathname = usePathname();
  const { logout, ingressSlug, currentWorkspaceId, workspaceList, switchWorkspace } = useAuth();
  const { theme, toggle } = useTheme();
  const { connected } = useWebSocket();
  const indicatorRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<(HTMLAnchorElement | null)[]>([]);

  const activeIndex = tabs.findIndex(
    (t) =>
      pathname === t.href ||
      (t.href !== "/dashboard" && pathname.startsWith(t.href)),
  );

  useEffect(() => {
    if (!indicatorRef.current || activeIndex === -1) return;
    const activeTab = tabsRef.current[activeIndex];
    if (!activeTab) return;

    gsap.to(indicatorRef.current, {
      x: activeTab.offsetLeft,
      width: activeTab.offsetWidth,
      duration: 0.35,
      ease: "power3.out",
    });
  }, [activeIndex, pathname]);

  return (
    <header className="relative flex items-center h-12 px-4 sm:px-6 bg-bg-secondary border-b border-border-primary shrink-0 z-30">
      {/* Logo */}
      <Link
        href="/dashboard"
        className="flex items-center gap-2 mr-4 sm:mr-6 shrink-0"
      >
        <div className="w-6 h-6 rounded-md bg-bg-accent flex items-center justify-center">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path
              d="M2 7h3l2-4 2 8 2-4h3"
              stroke="var(--text-inverse)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <span className="hidden sm:inline text-sm font-semibold text-text-primary tracking-tight">
          Hookdash
        </span>
      </Link>

      {/* Tabs */}
      <nav className="relative flex items-center gap-0 sm:gap-0.5 h-full overflow-x-auto no-scrollbar">
        {/* Sliding underline indicator */}
        <div
          ref={indicatorRef}
          className="absolute bottom-0 left-0 h-[2px] bg-bg-accent rounded-full"
          style={{ width: 0 }}
        />

        {tabs.map((tab, i) => {
          const active = i === activeIndex;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              ref={(el) => {
                tabsRef.current[i] = el;
              }}
              className={`relative flex items-center h-full px-2.5 sm:px-3 text-[12px] sm:text-[13px] font-medium transition-colors whitespace-nowrap
                ${
                  active
                    ? "text-text-accent"
                    : "text-text-tertiary hover:text-text-primary"
                }`}
            >
              {tab.label}
              {tab.label === "Live" && (
                <span className="relative flex h-1.5 w-1.5 ml-1.5">
                  {connected && (
                    <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-500" />
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                      connected ? "bg-emerald-500" : "bg-red-500"
                    }`}
                  />
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-2">
        {/* Workspace switcher */}
        {workspaceList.length > 0 && (
          <select
            value={currentWorkspaceId ?? ""}
            onChange={(e) => switchWorkspace(e.target.value)}
            className="hidden sm:block text-[11px] px-2 py-1 rounded-md bg-bg-tertiary text-text-primary border border-border-primary focus:outline-none focus:ring-1 focus:ring-bg-accent cursor-pointer"
          >
            {workspaceList.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>
        )}

        {/* Ingress slug */}
        {ingressSlug && (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-bg-tertiary">
            <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">
              Ingress
            </span>
            <code className="text-[11px] font-mono text-text-accent">
              /in/{ingressSlug}
            </code>
          </div>
        )}

        {/* Settings */}
        <Link
          href="/dashboard/settings"
          className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors"
          aria-label="Settings"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="8" cy="8" r="2.5" />
            <path d="M13.3 10a1.1 1.1 0 00.2 1.2l.04.04a1.33 1.33 0 11-1.88 1.88l-.04-.04a1.1 1.1 0 00-1.2-.2 1.1 1.1 0 00-.67 1.01v.12a1.33 1.33 0 11-2.67 0v-.06A1.1 1.1 0 006 12.84a1.1 1.1 0 00-1.2.2l-.04.04a1.33 1.33 0 11-1.88-1.88l.04-.04a1.1 1.1 0 00.2-1.2 1.1 1.1 0 00-1.01-.67h-.12a1.33 1.33 0 110-2.67h.06A1.1 1.1 0 003.16 6a1.1 1.1 0 00-.2-1.2l-.04-.04a1.33 1.33 0 111.88-1.88l.04.04a1.1 1.1 0 001.2.2h.05a1.1 1.1 0 00.67-1.01v-.12a1.33 1.33 0 112.67 0v.06A1.1 1.1 0 0010 3.16a1.1 1.1 0 001.2-.2l.04-.04a1.33 1.33 0 111.88 1.88l-.04.04a1.1 1.1 0 00-.2 1.2v.05a1.1 1.1 0 001.01.67h.12a1.33 1.33 0 010 2.67h-.06a1.1 1.1 0 00-1.01.67z" />
          </svg>
        </Link>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
          aria-label="Toggle theme"
        >
          {theme === "light" ? (
            <svg
              width="15"
              height="15"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M8 1v1M8 14v1M1 8h1M14 8h1M3.05 3.05l.7.7M12.25 12.25l.7.7M12.25 3.05l-.7.7M3.05 12.25l-.7.7" />
              <circle cx="8" cy="8" r="3" />
            </svg>
          ) : (
            <svg
              width="15"
              height="15"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M14 9.5A6 6 0 016.5 2 6 6 0 1014 9.5z" />
            </svg>
          )}
        </button>

        {/* Logout */}
        <button
          onClick={logout}
          className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
          aria-label="Log out"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M7 15H4a1 1 0 01-1-1V4a1 1 0 011-1h3M12 12l3-3-3-3M15 9H7" />
          </svg>
        </button>
      </div>
    </header>
  );
}
