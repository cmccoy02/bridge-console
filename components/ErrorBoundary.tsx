import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Bug, Copy, CheckCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Bridge Error]', error, errorInfo);
    this.setState({ errorInfo });
    
    // TODO: Send to Sentry when configured
    // Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
  }

  private handleRefresh = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private copyErrorDetails = async () => {
    const { error, errorInfo } = this.state;
    const details = `
Bridge Error Report
==================
Time: ${new Date().toISOString()}
URL: ${window.location.href}

Error: ${error?.message}
Stack: ${error?.stack}

Component Stack:
${errorInfo?.componentStack || 'N/A'}
    `.trim();

    try {
      await navigator.clipboard.writeText(details);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-bg-900 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-bg-800 border border-red-900/50 rounded-lg overflow-hidden">
            {/* Header */}
            <div className="bg-red-950/30 border-b border-red-900/50 px-4 py-3 flex items-center gap-3">
              <AlertTriangle className="text-red-500" size={24} />
              <div>
                <h2 className="font-bold text-white">Something went wrong</h2>
                <p className="text-red-400 text-sm">Bridge encountered an unexpected error</p>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Error message */}
              <div className="bg-black/30 border border-slate-700 rounded p-3 font-mono text-sm text-red-300 break-all">
                {this.state.error?.message || 'Unknown error'}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={this.handleRefresh}
                  className="flex-1 flex items-center justify-center gap-2 bg-apex-500 hover:bg-apex-400 text-black font-bold py-3 px-4 rounded transition-colors"
                >
                  <RefreshCw size={16} />
                  Refresh Page
                </button>
                <button
                  onClick={this.handleReset}
                  className="flex-1 flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-4 rounded transition-colors"
                >
                  Try Again
                </button>
              </div>

              {/* Copy error details */}
              <button
                onClick={this.copyErrorDetails}
                className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-white py-2 text-sm transition-colors"
              >
                {this.state.copied ? (
                  <>
                    <CheckCircle size={14} className="text-green-500" />
                    Copied to clipboard
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    Copy error details for bug report
                  </>
                )}
              </button>

              {/* Debug info (collapsed) */}
              <details className="text-xs">
                <summary className="text-slate-500 cursor-pointer hover:text-slate-300 flex items-center gap-1">
                  <Bug size={12} />
                  Technical details
                </summary>
                <pre className="mt-2 p-2 bg-black/30 border border-slate-700 rounded overflow-auto max-h-32 text-slate-400">
                  {this.state.error?.stack}
                </pre>
              </details>
            </div>

            {/* Footer */}
            <div className="bg-slate-900/50 border-t border-slate-700 px-4 py-2 text-center">
              <span className="text-[10px] text-slate-500">
                If this keeps happening, please{' '}
                <a 
                  href="https://github.com/your-repo/issues" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-apex-500 hover:underline"
                >
                  report an issue
                </a>
              </span>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

// Inline error display for non-critical errors
export const InlineError: React.FC<{
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}> = ({ message, onRetry, onDismiss }) => (
  <div className="bg-red-950/20 border border-red-900/50 rounded-lg p-4 flex items-start gap-3">
    <AlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
    <div className="flex-1 min-w-0">
      <p className="text-red-400 text-sm font-medium">{message}</p>
    </div>
    <div className="flex gap-2 flex-shrink-0">
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs text-slate-400 hover:text-white px-2 py-1 border border-slate-700 rounded hover:border-slate-500 transition-colors"
        >
          Retry
        </button>
      )}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-slate-500 hover:text-white transition-colors"
        >
          ×
        </button>
      )}
    </div>
  </div>
);

