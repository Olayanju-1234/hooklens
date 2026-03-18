"use client";

import { TimelineStep } from "@/lib/api";

interface EventTimelineProps {
  steps: TimelineStep[];
}

function StepIcon({ status }: { status: TimelineStep["status"] }) {
  const size = 16;
  if (status === "success") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-emerald-500"
      >
        <path d="M4 8.5l2.5 2.5L12 5" />
      </svg>
    );
  }
  if (status === "error") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="text-red-500"
      >
        <path d="M5 5l6 6M11 5l-6 6" />
      </svg>
    );
  }
  if (status === "warning") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-amber-500"
      >
        <path d="M8 3l6 10H2L8 3zM8 7v2.5M8 11.5h.01" />
      </svg>
    );
  }
  // pending
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className="text-text-tertiary"
    >
      <circle cx="8" cy="8" r="5" />
      <path d="M8 5.5V8l2 1.5" />
    </svg>
  );
}

const statusColor: Record<TimelineStep["status"], string> = {
  success: "border-emerald-500",
  error: "border-red-500",
  warning: "border-amber-500",
  pending: "border-border-primary",
};

const statusBg: Record<TimelineStep["status"], string> = {
  success: "bg-emerald-500/10",
  error: "bg-red-500/10",
  warning: "bg-amber-500/10",
  pending: "bg-bg-tertiary",
};

export function EventTimeline({ steps }: EventTimelineProps) {
  if (steps.length === 0) return null;

  return (
    <div className="relative">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        return (
          <div key={`${step.step}-${i}`} className="flex gap-3">
            {/* Vertical line + icon */}
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 ${statusColor[step.status]} ${statusBg[step.status]}`}
              >
                <StepIcon status={step.status} />
              </div>
              {!isLast && (
                <div className="w-px flex-1 min-h-[24px] bg-border-primary" />
              )}
            </div>

            {/* Content */}
            <div className={`pb-5 ${isLast ? "pb-0" : ""}`}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary">
                  {step.step}
                </span>
                {step.latencyMs !== null && (
                  <span className="text-[11px] font-mono text-text-tertiary tabular-nums">
                    {step.latencyMs}ms
                  </span>
                )}
              </div>
              <p className="text-xs text-text-tertiary mt-0.5">{step.detail}</p>
              <p className="text-[10px] font-mono text-text-tertiary mt-1 tabular-nums">
                {new Date(step.timestamp).toLocaleString()}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
