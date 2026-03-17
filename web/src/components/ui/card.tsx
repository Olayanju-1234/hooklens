interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

export function Card({ children, className = "", padding = true }: CardProps) {
  return (
    <div
      className={`bg-bg-secondary border border-border-primary rounded-xl
        ${padding ? "p-5" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {description && (
          <p className="text-xs text-text-tertiary mt-0.5">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="px-4 py-4 bg-bg-secondary border border-border-primary rounded-xl">
      <p className="text-[10px] uppercase tracking-widest text-text-tertiary font-medium">
        {label}
      </p>
      <p className="text-2xl font-semibold text-text-primary mt-1.5 font-mono tabular-nums">
        {value}
      </p>
      {sub && <p className="text-xs text-text-accent mt-1 font-medium">{sub}</p>}
    </div>
  );
}
