"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { auth as authApi, UserProfile } from "@/lib/api";
import { useState, useRef, useEffect } from "react";
import gsap from "gsap";

const navItems = [
  {
    label: "Live",
    href: "/dashboard",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <circle cx="9" cy="9" r="2.5" />
        <path d="M5.5 4a7 7 0 010 10M12.5 4a7 7 0 000 10" />
      </svg>
    ),
  },
  {
    label: "Events",
    href: "/dashboard/events",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <path d="M3 5h12M3 9h8M3 13h10" />
      </svg>
    ),
  },
  {
    label: "Endpoints",
    href: "/dashboard/endpoints",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 9h3l2-4 2 8 2-4h3" />
      </svg>
    ),
  },
  {
    label: "Stats",
    href: "/dashboard/stats",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <rect x="3" y="10" width="3" height="5" rx="0.5" />
        <rect x="7.5" y="6" width="3" height="9" rx="0.5" />
        <rect x="12" y="3" width="3" height="12" rx="0.5" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { logout, ingressSlug } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const railRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    authApi.me().then(setProfile).catch(() => {});
  }, []);

  // Animate the active indicator position
  useEffect(() => {
    if (!indicatorRef.current || !railRef.current) return;
    const activeIndex = navItems.findIndex((item) => item.href === pathname);
    if (activeIndex === -1) return;

    // 56px logo + 12px padding-top + activeIndex * 48px (item height)
    const top = 56 + 12 + activeIndex * 48;
    gsap.to(indicatorRef.current, {
      y: top,
      duration: 0.3,
      ease: "power3.out",
    });
  }, [pathname]);

  return (
    <aside
      ref={railRef}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className="relative h-screen flex flex-col bg-bg-secondary border-r border-border-primary shrink-0 z-30 overflow-hidden"
      style={{
        width: expanded ? 180 : 56,
        transition: "width 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Active indicator bar */}
      <div
        ref={indicatorRef}
        className="absolute left-0 w-[3px] h-8 rounded-r-full bg-bg-accent"
        style={{ top: 0 }}
      />

      {/* Logo */}
      <div className="h-14 flex items-center px-3.5 shrink-0">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 overflow-hidden"
        >
          <div className="w-7 h-7 rounded-lg bg-bg-accent flex items-center justify-center shrink-0">
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
          <span
            className="text-sm font-semibold text-text-primary tracking-tight whitespace-nowrap"
            style={{
              opacity: expanded ? 1 : 0,
              transition: "opacity 0.2s ease",
            }}
          >
            Hookdash
          </span>
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-3 px-2 space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-2.5 h-10 px-2.5 rounded-lg transition-colors
                ${
                  active
                    ? "text-text-accent bg-bg-accent-subtle"
                    : "text-text-tertiary hover:text-text-primary hover:bg-bg-hover"
                }`}
            >
              <span className="shrink-0 flex items-center justify-center w-5">
                {item.icon}
              </span>
              <span
                className="text-[13px] font-medium whitespace-nowrap"
                style={{
                  opacity: expanded ? 1 : 0,
                  transition: "opacity 0.15s ease",
                }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border-primary p-2 space-y-1">
        {/* User avatar + email */}
        {profile && (
          <div className="flex items-center gap-2 px-2 py-1.5">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt="Avatar"
                className="w-8 h-8 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-bg-accent flex items-center justify-center text-text-inverse text-xs font-semibold shrink-0">
                {profile.email.slice(0, 2).toUpperCase()}
              </div>
            )}
            {expanded && (
              <span className="text-[11px] text-text-secondary truncate">
                {profile.email}
              </span>
            )}
          </div>
        )}
        {/* Ingress slug — only visible expanded */}
        {ingressSlug && expanded && (
          <div className="px-2 py-1.5 rounded-lg bg-bg-tertiary mx-0.5">
            <p className="text-[9px] font-medium text-text-tertiary uppercase tracking-widest">
              Ingress
            </p>
            <p className="text-[11px] font-mono text-text-secondary mt-0.5 truncate">
              /in/{ingressSlug}
            </p>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-2.5 h-10 px-2.5 rounded-lg text-text-tertiary
            hover:bg-bg-hover hover:text-text-primary transition-colors cursor-pointer"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M7 15H4a1 1 0 01-1-1V4a1 1 0 011-1h3M12 12l3-3-3-3M15 9H7" />
          </svg>
          <span
            className="text-[13px] font-medium whitespace-nowrap"
            style={{
              opacity: expanded ? 1 : 0,
              transition: "opacity 0.15s ease",
            }}
          >
            Log out
          </span>
        </button>
      </div>
    </aside>
  );
}
