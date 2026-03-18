"use client";

import { useEffect, useState } from "react";
import {
  docs as docsApi,
  ProviderDoc,
  EventDoc,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useFadeIn } from "@/hooks/use-gsap";

export default function DocsPage() {
  const [providers, setProviders] = useState<ProviderDoc[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [providerDetail, setProviderDetail] = useState<
    (ProviderDoc & { events: EventDoc[] }) | null
  >(null);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const contentRef = useFadeIn<HTMLDivElement>();

  async function fetchProviders() {
    setLoading(true);
    setFetchError("");
    try {
      const list = await docsApi.providers();
      setProviders(list);
      if (list.length > 0) {
        setSelectedProvider(list[0].provider);
      }
    } catch (err) {
      setFetchError(
        err instanceof Error ? err.message : "Failed to load docs",
      );
    } finally {
      setLoading(false);
    }
  }

  async function fetchProviderDetail(provider: string) {
    setDetailLoading(true);
    try {
      const detail = await docsApi.provider(provider);
      setProviderDetail(detail);
      setExpandedEvent(null);
    } catch {
      setProviderDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void fetchProviders();
  }, []);

  useEffect(() => {
    if (selectedProvider) {
      void fetchProviderDetail(selectedProvider);
    }
  }, [selectedProvider]);

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
            strokeLinejoin="round"
          >
            <path d="M3 3h12v12H3zM7 3v12M3 7h12" />
          </svg>
        }
        title="No provider docs"
        description="Provider documentation will appear here once available"
      />
    );
  }

  return (
    <div ref={contentRef} className="px-4 sm:px-6 py-6 mx-auto max-w-6xl w-full">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left panel: Provider list */}
        <div className="lg:w-64 shrink-0">
          <h2 className="text-sm font-semibold text-text-primary mb-3">
            Providers
          </h2>
          <div className="space-y-1">
            {providers.map((p) => (
              <button
                key={p.provider}
                onClick={() => setSelectedProvider(p.provider)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-all cursor-pointer
                  ${
                    selectedProvider === p.provider
                      ? "bg-bg-accent-subtle text-text-accent border border-border-focus"
                      : "bg-bg-secondary border border-border-primary text-text-secondary hover:border-border-secondary hover:text-text-primary"
                  }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{p.displayName}</span>
                  <span className="text-[10px] font-mono text-text-tertiary tabular-nums">
                    {p.eventCount} event{p.eventCount !== 1 ? "s" : ""}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right panel: Provider detail */}
        <div className="flex-1 min-w-0">
          {detailLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-5 h-5 border-2 border-border-secondary border-t-text-accent rounded-full animate-spin" />
            </div>
          ) : providerDetail ? (
            <div>
              {/* Provider header */}
              <Card className="mb-4">
                <h2 className="text-base font-semibold text-text-primary">
                  {providerDetail.displayName}
                </h2>
                <p className="text-xs text-text-tertiary mt-1">
                  {providerDetail.description}
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-medium">
                      Signature Header
                    </span>
                    <code className="text-xs font-mono text-text-accent bg-bg-accent-subtle px-1.5 py-0.5 rounded">
                      {providerDetail.signatureHeader}
                    </code>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-medium">
                      Method
                    </span>
                    <code className="text-xs font-mono text-text-accent bg-bg-accent-subtle px-1.5 py-0.5 rounded">
                      {providerDetail.signatureMethod}
                    </code>
                  </div>
                </div>
              </Card>

              {/* Events list */}
              <h3 className="text-sm font-semibold text-text-primary mb-3">
                Events ({providerDetail.events.length})
              </h3>
              <div className="space-y-2">
                {providerDetail.events.map((evt) => {
                  const isExpanded = expandedEvent === evt.eventType;
                  return (
                    <div
                      key={evt.eventType}
                      className="rounded-xl bg-bg-secondary border border-border-primary overflow-hidden"
                    >
                      <button
                        onClick={() =>
                          setExpandedEvent(
                            isExpanded ? null : evt.eventType,
                          )
                        }
                        className="w-full text-left px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-bg-hover transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono font-medium text-text-primary">
                            {evt.eventType}
                          </code>
                        </div>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          className={`text-text-tertiary transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        >
                          <path d="M3 5l4 4 4-4" />
                        </svg>
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-border-primary">
                          <p className="text-xs text-text-tertiary mt-3 mb-3">
                            {evt.description}
                          </p>
                          {evt.fields.length > 0 && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-border-primary">
                                    <th className="text-left py-2 pr-4 font-medium text-text-tertiary uppercase tracking-widest text-[10px]">
                                      Path
                                    </th>
                                    <th className="text-left py-2 pr-4 font-medium text-text-tertiary uppercase tracking-widest text-[10px]">
                                      Type
                                    </th>
                                    <th className="text-left py-2 pr-4 font-medium text-text-tertiary uppercase tracking-widest text-[10px]">
                                      Description
                                    </th>
                                    <th className="text-left py-2 font-medium text-text-tertiary uppercase tracking-widest text-[10px]">
                                      Required
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {evt.fields.map((field) => (
                                    <tr
                                      key={field.path}
                                      className="border-b border-border-primary last:border-0"
                                    >
                                      <td className="py-2 pr-4 font-mono text-text-accent">
                                        {field.path}
                                      </td>
                                      <td className="py-2 pr-4 text-text-secondary">
                                        {field.type}
                                      </td>
                                      <td className="py-2 pr-4 text-text-secondary">
                                        {field.description}
                                      </td>
                                      <td className="py-2">
                                        <Badge
                                          variant={
                                            field.required
                                              ? "warning"
                                              : "default"
                                          }
                                        >
                                          {field.required ? "yes" : "no"}
                                        </Badge>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-text-tertiary text-center py-12">
              Select a provider to view documentation
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
