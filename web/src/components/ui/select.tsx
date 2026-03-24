import { SelectHTMLAttributes, forwardRef } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ label, options, className = "", id, ...props }, ref) {
    const selectId = id || label?.toLowerCase().replace(/\s/g, "-");
    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-text-primary"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={`w-full px-3 py-2.5 pr-9 text-sm rounded-lg appearance-none
              bg-bg-secondary text-text-primary
              border border-border-primary
              focus:outline-none focus:border-border-focus focus:shadow-[0_0_0_3px_var(--glow-accent)]
              disabled:opacity-50 disabled:cursor-not-allowed
              ${className}`}
            style={{ transitionProperty: "border-color, box-shadow, background-color", transitionDuration: "200ms", transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <svg
            className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-tertiary"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>
    );
  },
);
