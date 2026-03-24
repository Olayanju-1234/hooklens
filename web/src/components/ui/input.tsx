import { InputHTMLAttributes, forwardRef, useState } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className = "", id, onFocus, onBlur, value, ...props },
  ref,
) {
  const inputId = id || label?.toLowerCase().replace(/\s/g, "-");
  const [focused, setFocused] = useState(false);
  const hasValue = value !== undefined && value !== "";
  const isActive = focused || hasValue;

  return (
    <div className="space-y-1.5">
      <div className="relative">
        {label && (
          <label
            htmlFor={inputId}
            className={`absolute left-3 transition-all duration-200 pointer-events-none z-10
              ${
                isActive
                  ? "-top-2.5 text-[11px] font-medium text-text-accent bg-bg-secondary px-1"
                  : "top-1/2 -translate-y-1/2 text-sm text-text-tertiary"
              }`}
            style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          value={value}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          className={`w-full px-3 py-2.5 text-sm rounded-lg
            bg-bg-secondary text-text-primary
            border border-border-primary
            placeholder:text-text-tertiary placeholder:transition-opacity placeholder:duration-200
            focus:outline-none focus:border-border-focus focus:bg-bg-tertiary/50
            disabled:opacity-50 disabled:cursor-not-allowed
            ${
              error
                ? "border-red-500/60 shadow-[0_0_0_3px_var(--glow-error)] animate-shake"
                : "focus:shadow-[0_0_0_3px_var(--glow-accent)]"
            }
            ${isActive ? "placeholder:opacity-0" : "placeholder:opacity-100"}
            ${className}`}
          style={{ transitionProperty: "border-color, box-shadow, background-color", transitionDuration: "200ms", transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
          {...props}
        />
      </div>
      {error && (
        <p className="text-xs text-text-error animate-error-in">{error}</p>
      )}
    </div>
  );
});
