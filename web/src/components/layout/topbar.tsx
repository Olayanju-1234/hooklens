"use client";

import { useTheme } from "@/lib/theme-context";
import { useWebSocket } from "@/hooks/use-websocket";

export function Topbar({ title }: { title: string }) {
  const { theme, toggle } = useTheme();

  return (
    <header className="flex items-center justify-between px-6 py-5 shrink-0">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-text-primary tracking-tight">
          {title}
        </h1>
        <ConnectionPill />
      </div>
      <button
        onClick={toggle}
        className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
        aria-label="Toggle theme"
      >
        {theme === "light" ? (
          <svg
            width="16"
            height="16"
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
            width="16"
            height="16"
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
    </header>
  );
}

function ConnectionPill() {
  const { connected } = useWebSocket();
  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium tracking-wide
        ${
          connected
            ? "text-emerald-600 bg-emerald-500/10"
            : "text-red-400 bg-red-500/10"
        }`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {connected && (
          <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-500" />
        )}
        <span
          className={`relative inline-flex rounded-full h-1.5 w-1.5 ${connected ? "bg-emerald-500" : "bg-red-500"}`}
        />
      </span>
      {connected ? "Live" : "Offline"}
    </div>
  );
}
