import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className = "", id, ...props },
  ref,
) {
  const inputId = id || label?.toLowerCase().replace(/\s/g, "-");

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-[13px] font-medium text-text-secondary">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={`w-full px-3 py-2.5 text-sm rounded-lg
          bg-bg-secondary text-text-primary
          border border-border-primary
          placeholder:text-text-tertiary
          transition-colors duration-150
          focus:outline-none focus:border-border-focus focus:bg-bg-tertiary/50
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? "border-red-500/60" : ""}
          ${className}`}
        {...props}
      />
      {error && (
        <p className="text-xs text-text-error">{error}</p>
      )}
    </div>
  );
});
