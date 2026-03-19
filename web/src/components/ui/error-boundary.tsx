"use client";

import { Component, type ReactNode } from "react";
import { Button } from "./button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 px-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-bg-error flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--text-error)" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="10" cy="10" r="8" />
              <path d="M10 6.5v4M10 13.5v.01" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-text-primary">
              Something went wrong
            </h2>
            <p className="mt-1 text-sm text-text-secondary max-w-md">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={this.handleRetry}>
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
