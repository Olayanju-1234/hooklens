"use client";

import { useState } from "react";
import { useWebSocket } from "@/hooks/use-websocket";
import { useAuth } from "@/lib/auth-context";
import { events as eventsApi } from "@/lib/api";
import {
  StatusBadge,
  MethodBadge,
  SignatureBadge,
} from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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
  const { liveEvents, clearEvents, addEvents } = useWebSocket();
  const { ingressSlug } = useAuth();
  const [sending, setSending] = useState(false);

  async function sendTestEvent() {
    if (!ingressSlug) return;
    setSending(true);
    try {
      const payload =
        TEST_PAYLOADS[Math.floor(Math.random() * TEST_PAYLOADS.length)];
      await fetch(`${BASE_URL}/in/${ingressSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload.body),
      });
      // Fallback: poll for latest events in case WebSocket missed the broadcast
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
          addEvents(mapped);
        } catch {
          // Non-critical fallback, ignore errors
        }
      }, 1500);
    } finally {
      setSending(false);
    }
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
            action={
              ingressSlug ? (
                <Button
                  variant="primary"
                  size="md"
                  onClick={sendTestEvent}
                  loading={sending}
                  className="mt-4"
                >
                  Send test event
                </Button>
              ) : undefined
            }
          />
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
