"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  testPayloads as testApi,
  TestProvider,
  TestEventType,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useFadeIn } from "@/hooks/use-gsap";

export default function TestPage() {
  const [providers, setProviders] = useState<TestProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [eventTypes, setEventTypes] = useState<TestEventType[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [payloadText, setPayloadText] = useState<string>("");
  const [payloadError, setPayloadError] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [payloadLoading, setPayloadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [fetchError, setFetchError] = useState("");

  const contentRef = useFadeIn<HTMLDivElement>();

  async function fetchProviders() {
    setLoading(true);
    setFetchError("");
    try {
      const list = await testApi.providers();
      setProviders(list);
      if (list.length > 0) {
        setSelectedProvider(list[0].provider);
      }
    } catch (err) {
      setFetchError(
        err instanceof Error ? err.message : "Failed to load providers",
      );
    } finally {
      setLoading(false);
    }
  }

  async function fetchEventTypes(provider: string) {
    setEventsLoading(true);
    setSelectedEvent(null);
    setPayload(null);
    setSendResult(null);
    try {
      const types = await testApi.eventTypes(provider);
      setEventTypes(types);
      if (types.length > 0) {
        setSelectedEvent(types[0].eventType);
      }
    } catch {
      setEventTypes([]);
    } finally {
      setEventsLoading(false);
    }
  }

  async function fetchPayload(provider: string, eventType: string) {
    setPayloadLoading(true);
    setSendResult(null);
    setPayloadError("");
    try {
      const res = await testApi.payload(provider, eventType);
      setPayload(res.payload);
      setPayloadText(JSON.stringify(res.payload, null, 2));
    } catch {
      // For custom/unknown providers with no template, start with a blank slate
      const blank = { type: "custom.event", data: {} };
      setPayload(blank);
      setPayloadText(JSON.stringify(blank, null, 2));
    } finally {
      setPayloadLoading(false);
    }
  }

  function handlePayloadEdit(text: string) {
    setPayloadText(text);
    setPayloadError("");
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      setPayload(parsed);
    } catch {
      setPayloadError("Invalid JSON");
    }
  }

  async function handleSend() {
    if (!selectedProvider || !selectedEvent || payloadError) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await testApi.send(selectedProvider, selectedEvent, payload ?? undefined);
      setSendResult({
        success: true,
        message: res.status || "Event sent successfully",
      });
    } catch (err) {
      setSendResult({
        success: false,
        message: err instanceof Error ? err.message : "Failed to send",
      });
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    void fetchProviders();
  }, []);

  useEffect(() => {
    if (selectedProvider) {
      void fetchEventTypes(selectedProvider);
    }
  }, [selectedProvider]);

  useEffect(() => {
    if (selectedProvider && selectedEvent) {
      void fetchPayload(selectedProvider, selectedEvent);
    }
  }, [selectedProvider, selectedEvent]);

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-sm text-text-error">{fetchError}</p>
        <button
          onClick={() => void fetchProviders()}
          className="text-xs text-text-accent hover:underline cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-border-secondary border-t-text-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (providers.length === 0) {
    return (
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
            <path d="M5 3l8 5-8 5V3z" />
          </svg>
        }
        title="No test providers"
        description="Test payloads will be available once providers are configured"
      />
    );
  }

  return (
    <div ref={contentRef} className="px-4 sm:px-6 py-6 mx-auto max-w-6xl w-full">
      <div className="space-y-6">
        {/* Provider selector */}
        <section>
          <h2 className="text-sm font-semibold text-text-primary mb-3">
            Select Provider
          </h2>
          <div className="flex flex-wrap gap-2">
            {providers.map((p) => (
              <button
                key={p.provider}
                onClick={() => setSelectedProvider(p.provider)}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer
                  ${
                    selectedProvider === p.provider
                      ? "bg-bg-accent-subtle text-text-accent border border-border-focus"
                      : "bg-bg-secondary text-text-secondary border border-border-primary hover:border-border-secondary hover:text-text-primary"
                  }`}
              >
                <div className="flex items-center gap-2">
                  <span>{p.displayName}</span>
                  <span className="text-[10px] font-mono text-text-tertiary tabular-nums">
                    {p.eventCount}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Event type selector */}
        {selectedProvider && (
          <section>
            <h2 className="text-sm font-semibold text-text-primary mb-3">
              Event Type
            </h2>
            {eventsLoading ? (
              <div className="flex items-center justify-center h-16">
                <div className="w-4 h-4 border-2 border-border-secondary border-t-text-accent rounded-full animate-spin" />
              </div>
            ) : eventTypes.length === 0 ? (
              <p className="text-xs text-text-tertiary py-4">
                No event types available
              </p>
            ) : (
              <div className="space-y-1">
                {eventTypes.map((evt) => (
                  <button
                    key={evt.eventType}
                    onClick={() => setSelectedEvent(evt.eventType)}
                    className={`w-full text-left px-4 py-3 rounded-xl transition-all cursor-pointer
                      ${
                        selectedEvent === evt.eventType
                          ? "bg-bg-accent-subtle border border-border-focus"
                          : "bg-bg-secondary border border-border-primary hover:border-border-secondary"
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <code
                        className={`text-sm font-mono font-medium ${
                          selectedEvent === evt.eventType
                            ? "text-text-accent"
                            : "text-text-primary"
                        }`}
                      >
                        {evt.eventType}
                      </code>
                    </div>
                    {evt.description && (
                      <p className="text-xs text-text-tertiary mt-0.5">
                        {evt.description}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Payload preview */}
        {selectedEvent && (
          <section>
            <Card>
              <CardHeader
                title="Payload Preview"
                description={`${selectedProvider} / ${selectedEvent}`}
                action={
                  <Button size="sm" loading={sending} onClick={handleSend}>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    >
                      <path d="M1 1l12 6-12 6V8l8-1-8-1V1z" />
                    </svg>
                    Send to Ingress
                  </Button>
                }
              />

              {sendResult && (
                <div
                  className={`mb-3 px-3 py-2 rounded-lg text-sm ${
                    sendResult.success
                      ? "bg-bg-success text-text-success"
                      : "bg-bg-error text-text-error"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{sendResult.message}</span>
                    {sendResult.success && (
                      <Link
                        href="/dashboard"
                        className="text-xs underline hover:no-underline"
                      >
                        View in Live
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {payloadLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-4 h-4 border-2 border-border-secondary border-t-text-accent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="relative">
                  <textarea
                    value={payloadText}
                    onChange={(e) => handlePayloadEdit(e.target.value)}
                    spellCheck={false}
                    className={`w-full text-xs font-mono text-text-secondary bg-bg-tertiary rounded-lg p-3.5 resize-y min-h-64 max-h-[500px] outline-none border focus:border-border-focus transition-colors ${payloadError ? "border-border-error" : "border-border-primary"}`}
                  />
                  {payloadError && (
                    <p className="text-[10px] text-text-error mt-1">{payloadError}</p>
                  )}
                  <p className="text-[10px] text-text-tertiary mt-1">Edit the JSON payload before sending</p>
                </div>
              )}
            </Card>
          </section>
        )}
      </div>
    </div>
  );
}
