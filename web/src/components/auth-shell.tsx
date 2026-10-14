import Link from "next/link";
import type { ReactNode } from "react";
import { HookMark } from "@/components/flight-deck/hook-mark";

interface AuthShellProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  below?: ReactNode;
  centered?: boolean;
}

export function AuthShell({ title, subtitle, children, below, centered = false }: AuthShellProps) {
  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <header className="px-5 sm:px-8 py-5">
        <Link href="/" className="inline-flex items-center gap-2 text-text-primary">
          <HookMark size={20} />
          <span className="text-[16px] font-extrabold tracking-tight" style={{ fontVariationSettings: '"wdth" 112' }}>
            hookdash
          </span>
        </Link>
      </header>
      <main className="flex-1 flex items-start sm:items-center justify-center px-4 pb-16 pt-6 sm:pt-0">
        <div className="w-full max-w-[420px] animate-[fadeSlideIn_0.35s_ease-out]">
          <div className={`auth-card ${centered ? "text-center" : ""}`}>
            <h1 className="auth-title">{title}</h1>
            {subtitle && <p className="auth-sub">{subtitle}</p>}
            <div className="mt-7">{children}</div>
          </div>
          {below && <div className="mt-6 text-center text-sm text-text-tertiary space-y-3">{below}</div>}
        </div>
      </main>
    </div>
  );
}

export function Notice({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  return (
    <div className="auth-notice" data-tone={tone} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
