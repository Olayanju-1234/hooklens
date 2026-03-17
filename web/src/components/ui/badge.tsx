type BadgeVariant = "default" | "success" | "error" | "warning" | "info";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-bg-tertiary text-text-secondary",
  success: "bg-bg-success text-text-success",
  error: "bg-bg-error text-text-error",
  warning: "bg-bg-warning text-text-warning",
  info: "bg-bg-info text-text-primary",
};

export function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md
        ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeVariant> = {
    forwarded: "success",
    failed: "error",
    pending: "warning",
    skipped: "default",
  };
  return <Badge variant={map[status] || "default"}>{status}</Badge>;
}

export function MethodBadge({ method }: { method: string }) {
  const map: Record<string, BadgeVariant> = {
    POST: "info",
    GET: "success",
    PUT: "warning",
    DELETE: "error",
  };
  return (
    <Badge variant={map[method] || "default"}>
      <span className="font-mono">{method}</span>
    </Badge>
  );
}

export function SignatureBadge({ valid }: { valid: boolean | null }) {
  if (valid === null) return <Badge variant="default">no sig</Badge>;
  return valid ? (
    <Badge variant="success">valid</Badge>
  ) : (
    <Badge variant="error">invalid</Badge>
  );
}
