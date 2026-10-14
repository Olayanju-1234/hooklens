"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { endpoints as endpointsApi, Endpoint, INGRESS_BASE } from "@/lib/api";
import { PROVIDERS } from "@/lib/providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import toast from "react-hot-toast";
import gsap from "gsap";

const TOTAL_STEPS = 3;

interface OnboardingProps {
  onComplete: (endpoint: Endpoint) => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const { ingressSlug } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("paystack");
  const [creating, setCreating] = useState(false);
  const [createdEndpoint, setCreatedEndpoint] = useState<Endpoint | null>(null);
  const [copied, setCopied] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const stepContentRef = useRef<HTMLDivElement>(null);

  // Animate container on mount
  useEffect(() => {
    if (!containerRef.current) return;
    gsap.fromTo(
      containerRef.current,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" },
    );
  }, []);

  // Animate step transitions
  useEffect(() => {
    if (!stepContentRef.current) return;
    gsap.fromTo(
      stepContentRef.current,
      { opacity: 0, x: 12 },
      { opacity: 1, x: 0, duration: 0.3, ease: "power2.out" },
    );
  }, [step]);

  async function handleCreateEndpoint() {
    if (!name.trim()) {
      toast.error("Endpoint name is required");
      return;
    }
    setCreating(true);
    try {
      const endpoint = await endpointsApi.create({ name: name.trim(), provider });
      setCreatedEndpoint(endpoint);
      toast.success("Endpoint created");
      setStep(2);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create endpoint");
    } finally {
      setCreating(false);
    }
  }

  function handleCopyUrl() {
    navigator.clipboard.writeText(ingressUrl);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  function handleFinish() {
    localStorage.setItem("hookdash_onboarding_dismissed", "true");
    if (createdEndpoint) {
      onComplete(createdEndpoint);
    }
  }

  function handleGoToEvents() {
    localStorage.setItem("hookdash_onboarding_dismissed", "true");
    if (createdEndpoint) {
      onComplete(createdEndpoint);
    }
    router.push("/dashboard/events");
  }

  const ingressUrl = createdEndpoint
    ? `${INGRESS_BASE}/in/${createdEndpoint.ingressSlug}`
    : `${INGRESS_BASE}/in/${ingressSlug}`;

  return (
    <div className="flex items-center justify-center min-h-[70vh] px-4">
      <div ref={containerRef} className="w-full max-w-lg">
        {/* Stepper */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors duration-200 ${
                  s <= step
                    ? "bg-bg-accent text-text-inverse"
                    : "bg-bg-tertiary text-text-tertiary"
                }`}
              >
                {s < step ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M3 8.5l3.5 3.5L13 4" />
                  </svg>
                ) : (
                  s
                )}
              </div>
              {s < TOTAL_STEPS && (
                <div
                  className={`w-12 h-0.5 rounded transition-colors duration-200 ${
                    s < step ? "bg-bg-accent" : "bg-bg-tertiary"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-xl p-6">
          <div ref={stepContentRef}>
            {/* Step 1: Create endpoint */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">
                    Welcome to Hookdash!
                  </h2>
                  <p className="text-sm text-text-tertiary mt-1">
                    Create your first endpoint to start receiving webhooks. Pick a
                    name and select your provider.
                  </p>
                </div>

                <div className="space-y-4">
                  <Input
                    label="Endpoint name"
                    placeholder="e.g. Production Paystack"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateEndpoint();
                    }}
                  />
                  <Select
                    label="Provider"
                    options={PROVIDERS}
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                  />
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleCreateEndpoint} loading={creating}>
                    Create endpoint
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Ingress URL */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">
                    Your ingress URL
                  </h2>
                  <p className="text-sm text-text-tertiary mt-1">
                    Copy this URL and paste it in your{" "}
                    <span className="text-text-primary font-medium">
                      {PROVIDERS.find((p) => p.value === provider)?.label ?? provider}
                    </span>{" "}
                    webhook settings dashboard.
                  </p>
                </div>

                <div className="bg-bg-primary border border-border-primary rounded-lg p-4">
                  <p className="text-[10px] uppercase tracking-widest text-text-tertiary font-medium mb-2">
                    Webhook URL
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono text-text-accent break-all flex-1">
                      {ingressUrl}
                    </code>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleCopyUrl}
                      className="shrink-0"
                    >
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>

                <div className="bg-bg-primary border border-border-primary rounded-lg p-4">
                  <p className="text-xs text-text-tertiary leading-relaxed">
                    <span className="text-text-primary font-medium">Where to paste it:</span>{" "}
                    Go to your payment provider&apos;s dashboard, find the webhook or
                    callback URL setting, and paste this URL. All incoming webhooks
                    will appear in your events feed in real time.
                  </p>
                </div>

                <div className="flex justify-between">
                  <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button onClick={() => setStep(3)}>Continue</Button>
                </div>
              </div>
            )}

            {/* Step 3: Done */}
            {step === 3 && (
              <div className="space-y-5 text-center">
                <div className="flex justify-center">
                  <div className="w-14 h-14 rounded-full bg-bg-accent/10 flex items-center justify-center">
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--bg-accent)"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  </div>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-text-primary">
                    You&apos;re all set!
                  </h2>
                  <p className="text-sm text-text-tertiary mt-1">
                    Your endpoint{" "}
                    <span className="text-text-primary font-medium">{name}</span>{" "}
                    is ready. Start receiving webhooks or send a test event to see
                    it in action.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-3 pt-2">
                  <Button variant="secondary" onClick={handleFinish}>
                    Go to dashboard
                  </Button>
                  <Button onClick={handleGoToEvents}>View events</Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-text-tertiary mt-4">
          Step {step} of {TOTAL_STEPS}
        </p>
      </div>
    </div>
  );
}
