"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { TabRail } from "@/components/layout/tab-rail";
import { WebSocketProvider } from "@/hooks/use-websocket";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { token, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !token) {
      router.replace("/login");
    }
  }, [token, isLoading, router]);

  if (isLoading || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <div className="w-5 h-5 border-2 border-border-secondary border-t-text-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <WebSocketProvider>
      <div className="flex flex-col h-screen overflow-hidden bg-bg-primary">
        <TabRail />
        <main className="flex-1 overflow-y-auto">
          <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
        </main>
      </div>
    </WebSocketProvider>
  );
}
