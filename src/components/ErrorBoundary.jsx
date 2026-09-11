import React from "react";
import { AlertTriangle, RotateCw, Inbox, RefreshCw } from "lucide-react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorId: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    this.setState({ errorId: Math.random().toString(36).slice(2, 10) });
    console.error("[ErrorBoundary]", error, info?.componentStack || info);
  }

  reset = () => this.setState({ hasError: false, error: null, errorId: null });

  render() {
    if (this.state.hasError) {
      const fallback = this.props.fallback;
      if (typeof fallback === "function") {
        return fallback({ error: this.state.error, errorId: this.state.errorId, reset: this.reset });
      }
      return <DefaultFallback error={this.state.error} errorId={this.state.errorId} reset={this.reset} />;
    }
    return this.props.children;
  }
}

export function DefaultFallback({ error, errorId, reset }) {
  const isDev = import.meta.env?.DEV;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <div>
        <h2 className="font-heading text-xl text-foreground">Something went wrong</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          An unexpected error occurred while rendering this page. Your data is safe.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <RotateCw className="h-4 w-4" /> Retry
        </button>
        <a
          href="/"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Inbox className="h-4 w-4" /> Go to Inbox
        </a>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" /> Reload App
        </button>
      </div>
      {isDev && error && (
        <div className="mt-4 max-w-lg rounded-md border border-border bg-muted/50 p-3 text-left">
          <p className="font-mono text-xs text-muted-foreground">Error ID: {errorId}</p>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-destructive">
            {error.message}
          </pre>
        </div>
      )}
    </div>
  );
}