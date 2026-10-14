import Link from "next/link";
import type { ReactNode } from "react";
import { HookMark } from "@/components/flight-deck/hook-mark";

export const LEGAL_CONTACT = "horlarhyanjuhjoseph@gmail.com";

interface LegalPageProps {
  title: string;
  updated: string;
  children: ReactNode;
}

export function LegalPage({ title, updated, children }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary px-4 sm:px-6">
      <div className="max-w-2xl mx-auto py-14 sm:py-20">
        <Link href="/" className="inline-flex items-center gap-2 mb-12 text-text-primary">
          <HookMark size={20} />
          <span className="text-[16px] font-extrabold tracking-tight" style={{ fontVariationSettings: '"wdth" 112' }}>
            hookdash
          </span>
        </Link>

        <h1 className="auth-title" style={{ fontSize: 36 }}>{title}</h1>
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-tertiary mt-3 mb-12">Last updated {updated}</p>

        <div className="space-y-10 text-[15px] leading-7 text-text-secondary [&_h2]:text-text-primary [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:text-text-primary [&_a]:underline [&_a]:underline-offset-2 [&_strong]:text-text-primary [&_strong]:font-semibold">
          {children}
        </div>

        <div className="mt-16 pt-6 border-t border-border-primary flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">
          <Link href="/" className="hover:text-text-primary transition-colors">Home</Link>
          <Link href="/privacy" className="hover:text-text-primary transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-text-primary transition-colors">Terms</Link>
        </div>
      </div>
    </div>
  );
}
