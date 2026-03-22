"use client";

import { useState, useEffect } from "react";
import { useWebSocket } from "@/hooks/use-websocket";
import { useAuth } from "@/lib/auth-context";
import { events as eventsApi, endpoints as endpointsApi, Endpoint } from "@/lib/api";
import {
  StatusBadge,
  MethodBadge,
  SignatureBadge,
} from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Onboarding } from "@/components/onboarding";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";
const BASE_URL = API_URL.replace(/\/api\/?$/, "");

const TEST_PAYLOADS = [
  {
    label: "Paystack · charge.success",
    body: {
      event: "charge.success",
      data: {
        id: 3_000_000_000 + Math.floor(Math.random() * 999_999),
        domain: "test",
        status: "success",
        reference: `test_${Date.now()}`,
        amount: 50000,
        currency: "NGN",
        channel: "card",
        customer: { email: "test@example.com", customer_code: "CUS_test123" },
        paid_at: new Date().toISOString(),
      },
    },
  },
  {
    label: "Flutterwave · charge.completed",
    body: {
      event: "charge.completed",
      data: {
        id: Math.floor(Math.random() * 999_999),
        tx_ref: `flw_test_${Date.now()}`,
        flw_ref: "FLW-MOCK-REF",
        amount: 250,
        currency: "NGN",
        status: "successful",
        payment_type: "card",
        customer: { email: "buyer@example.com", name: "Test Buyer" },
        created_at: new Date().toISOString(),
      },
    },
  },
  {
    label: "Custom · ping",
    body: {
      event: "ping",
      timestamp: new Date().toISOString(),
      message: "Hello from Hookdash test event!",
    },
  },
];

export default function DashboardPage() {
  const { liveEvents, clearEvents, addEvents, removeEvent } = useWebSocket();
  const { ingressSlug } = useAuth();
  const [sending, setSending] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checkingEndpoints, setCheckingEndpoints] = useState(true);

  useEffect(() => {
    const dismissed = localStorage.getItem("hookdash_onboarding_dismissed");
    if (dismissed === "true") {
      setCheckingEndpoints(false);
      return;
    }
    endpointsApi
      .list()
      .then((list) => {
        if (list.length === 0) {
          setShowOnboarding(true);
        }
      })
      .catch(() => {
        // Failed to fetch — skip onboarding check
      })
      .finally(() => setCheckingEndpoints(false));
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function handleOnboardingComplete(_endpoint: Endpoint) {
    setShowOnboarding(false);
    localStorage.setItem("hookdash_onboarding_dismissed", "true");
  }

  async function sendTestEvent() {
    if (!ingressSlug) return;
    setSending(true);
    try {
      const payload =
        TEST_PAYLOADS[Math.floor(Math.random() * TEST_PAYLOADS.length)];

      // Optimistic: show the event immediately
      const optimisticId = `optimistic_${Date.now()}`;
      const eventType = (payload.body as Record<string, unknown>)
        .event as string;
      addEvents([
        {
          id: optimisticId,
          provider: "paystack",
          eventType,
          signatureValid: null,
          receivedAt: new Date().toISOString(),
          forwardStatus: "pending",
          method: "POST",
          path: `/in/${ingressSlug}`,
          bodyPreview: JSON.stringify(payload.body).slice(0, 200),
        },
      ]);

      await fetch(`${BASE_URL}/in/${ingressSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload.body),
      });

      // Replace optimistic event with real data from the server
      setTimeout(async () => {
        try {
          const res = await eventsApi.list({ limit: "5" });
          const mapped = res.items.map((e) => ({
            id: e.id,
            provider: e.provider,
            eventType: e.eventType,
            signatureValid: e.signatureValid,
            receivedAt: e.receivedAt,
            forwardStatus: e.forwardStatus,
            method: e.method,
            path: e.path,
            bodyPreview: e.body ? JSON.stringify(e.body).slice(0, 200) : "",
          }));
          // Remove optimistic entry and merge real data
          removeEvent(optimisticId);
          addEvents(mapped);
        } catch {
          // Non-critical, ignore
        }
      }, 800);
    } finally {
      setSending(false);
    }
  }

  if (checkingEndpoints) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-border-secondary border-t-text-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <>
      <div className="px-4 sm:px-6 py-6 mx-auto max-w-6xl w-full">
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-text-tertiary font-mono tabular-nums">
            {liveEvents.length} event{liveEvents.length !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-2">
            {ingressSlug && (
              <Button
                variant="secondary"
                size="sm"
                onClick={sendTestEvent}
                loading={sending}
              >
                Send test event
              </Button>
            )}
            {liveEvents.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearEvents}>
                Clear
              </Button>
            )}
          </div>
        </div>

        {liveEvents.length === 0 ? (
          <div className="space-y-6">
            {/* Getting Started */}
            {ingressSlug && (
              <div className="p-5 rounded-xl bg-bg-secondary border border-border-primary">
                <h2 className="text-sm font-semibold text-text-primary mb-3">Getting Started</h2>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-bg-accent text-text-inverse text-xs font-bold shrink-0">1</span>
                    <div>
                      <p className="text-sm text-text-primary font-medium">Copy your ingress URL</p>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-xs font-mono text-text-accent bg-bg-tertiary px-2 py-1 rounded break-all">
                          {BASE_URL}/in/{ingressSlug}
                        </code>
                        <button
                          onClick={() => navigator.clipboard.writeText(`${BASE_URL}/in/${ingressSlug}`)}
                          className="text-text-tertiary hover:text-text-primary cursor-pointer shrink-0"
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            <rect x="5" y="5" width="8" height="8" rx="1" />
                            <path d="M3 11V4a1 1 0 011-1h7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-bg-accent text-text-inverse text-xs font-bold shrink-0">2</span>
                    <div>
                      <p className="text-sm text-text-primary font-medium">Set it as your webhook URL</p>
                      <p className="text-xs text-text-tertiary mt-0.5">Paste it in Paystack, Flutterwave, Mono, or any provider&apos;s webhook settings</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-bg-accent text-text-inverse text-xs font-bold shrink-0">3</span>
                    <div>
                      <p className="text-sm text-text-primary font-medium">Watch events arrive in real time</p>
                      <p className="text-xs text-text-tertiary mt-0.5">Or send a test event now to see it work</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <Button size="sm" onClick={sendTestEvent} loading={sending}>
                    Send test event
                  </Button>
                </div>
              </div>
            )}

            <EmptyState
              icon={
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 18 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <circle cx="9" cy="9" r="2.5" />
                  <path d="M5.5 4a7 7 0 010 10M12.5 4a7 7 0 000 10" />
                </svg>
              }
              title="Waiting for webhooks"
              description="Send a webhook to your ingress URL and it will appear here in real time"
            />
          </div>
        ) : (
          <div className="space-y-1">
            {liveEvents.map((event, i) => (
              <Link key={event.id} href={`/dashboard/events/${event.id}`}>
                <div
                  className="animate-slide-in flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 py-3 rounded-xl
                    bg-bg-secondary border border-border-primary
                    hover:border-border-secondary hover:shadow-sm
                    cursor-pointer group"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <MethodBadge method={event.method} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary truncate group-hover:text-text-accent">
                        {event.eventType || "unknown"}
                      </span>
                      {event.provider && (
                        <span className="text-[11px] text-text-tertiary font-medium">
                          {event.provider}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-tertiary font-mono mt-0.5 truncate max-w-md">
                      {event.bodyPreview}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0 sm:ml-0 ml-0">
                    <SignatureBadge valid={event.signatureValid} />
                    <StatusBadge status={event.forwardStatus} />
                    <span className="text-[11px] text-text-tertiary font-mono tabular-nums ml-auto sm:ml-0">
                      {new Date(event.receivedAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
