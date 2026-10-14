import Link from "next/link";
import type { ReactNode } from "react";

export const LEGAL_CONTACT = "horlarhyanjuhjoseph@gmail.com";

interface LegalPageProps {
  title: string;
  updated: string;
  children: ReactNode;
}

export function LegalPage({ title, updated, children }: LegalPageProps) {
  return (
    <div data-theme="dark" className="min-h-screen bg-[#0a0a09] text-[#ececea] px-4 sm:px-6">
      <div className="max-w-2xl mx-auto py-16 sm:py-24">
        <Link href="/" className="inline-flex items-center gap-2.5 mb-12">
          <div className="w-8 h-8 rounded-lg bg-[#2ec4a2] flex items-center justify-center">
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
              <path d="M2 7h3l2-4 2 8 2-4h3" stroke="#0a0a09" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-lg font-semibold tracking-tight">Hookdash</span>
        </Link>

        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-[#6b6a65] mt-2 mb-12">Last updated {updated}</p>

        <div className="space-y-10 text-[15px] leading-7 text-[#b5b4ae] [&_h2]:text-[#ececea] [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:text-[#2ec4a2] [&_a]:underline-offset-2 hover:[&_a]:underline [&_strong]:text-[#ececea] [&_strong]:font-medium">
          {children}
        </div>

        <div className="mt-16 pt-6 border-t border-[#1a1a18] flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#4a4a45]">
          <Link href="/" className="hover:text-[#ececea] transition-colors">Home</Link>
          <Link href="/privacy" className="hover:text-[#ececea] transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-[#ececea] transition-colors">Terms</Link>
        </div>
      </div>
    </div>
  );
}
