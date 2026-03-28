"use client";

import { Toaster } from "react-hot-toast";

export function ToastProvider() {
  return (
    <Toaster
      position="bottom-center"
      toastOptions={{
        duration: 3000,
        style: {
          background: "var(--bg-elevated)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-primary)",
          borderRadius: "0.75rem",
          fontSize: "0.8125rem",
          padding: "0.625rem 0.875rem",
          boxShadow: "var(--shadow-lg)",
        },
        success: {
          iconTheme: { primary: "var(--bg-accent)", secondary: "var(--text-inverse)" },
        },
        error: {
          iconTheme: { primary: "var(--text-error)", secondary: "#fff" },
        },
      }}
    />
  );
}
