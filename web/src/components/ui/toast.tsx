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
          borderRadius: "3px",
          fontSize: "0.8125rem",
          padding: "0.625rem 0.875rem",
          boxShadow: "var(--shadow-lg)",
        },
        success: {
          iconTheme: { primary: "var(--s-ok)", secondary: "#fff" },
        },
        error: {
          iconTheme: { primary: "var(--text-error)", secondary: "#fff" },
        },
      }}
    />
  );
}
