import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Shown instead of the default panel. Receives a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Without this, a single render error anywhere unmounts the whole tree and
 * leaves a blank white page with nothing in the UI to act on.
 *
 * Errors are re-thrown to window.onerror so whatever monitoring is configured
 * still records them — the boundary changes what the user sees, not whether
 * the failure is reported.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error", error, info.componentStack);
    window.dispatchEvent(
      new CustomEvent("naada:render-error", { detail: { error, info } }),
    );
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink px-4 py-16">
        <div className="w-full max-w-[440px] border border-line bg-surface p-6">
          <p className="t-micro text-fault">Something broke</p>
          <h1 className="t-h2 mt-2">This screen didn't load</h1>
          <p className="t-body mt-3 text-paper/80">
            The rest of Showzy is still working. Try again, or head back to what's on
            — if it keeps happening, the details below help us fix it.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" onClick={this.reset}>
              Try again
            </Button>
            <Button onClick={() => { window.location.href = "/"; }}>
              Back to what's on
            </Button>
          </div>

          <details className="mt-5 border-t border-line pt-4">
            <summary className="t-small cursor-pointer text-muted hover:text-paper">
              Technical details
            </summary>
            <pre className="t-mono mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11px] text-muted">
              {error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
