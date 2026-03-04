import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary, { InlineError } from '../../components/ErrorBoundary';

// Suppress expected console.error output from React's error boundary internals
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper: a component that unconditionally throws
const ThrowingChild: React.FC<{ message?: string }> = ({ message = 'Test error' }) => {
  throw new Error(message);
};

// Helper: a component that renders fine
const GoodChild: React.FC = () => <div data-testid="child">All good</div>;

// ─────────────────────────────────────────────
// ErrorBoundary – happy path
// ─────────────────────────────────────────────

describe('ErrorBoundary – happy path', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders multiple children', () => {
    render(
      <ErrorBoundary>
        <span data-testid="a">A</span>
        <span data-testid="b">B</span>
      </ErrorBoundary>
    );
    expect(screen.getByTestId('a')).toBeInTheDocument();
    expect(screen.getByTestId('b')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────
// ErrorBoundary – error state
// ─────────────────────────────────────────────

describe('ErrorBoundary – error state', () => {
  it('shows the error UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild message="Kaboom!" />
      </ErrorBoundary>
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    // The error message appears in the visible UI (at least one element should contain it)
    const matches = screen.getAllByText(/Kaboom!/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('shows "Refresh Page" and "Try Again" buttons', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    );
    expect(screen.getByRole('button', { name: /refresh page/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('"Try Again" resets the error state and re-renders children', () => {
    // We need a child whose throwing behavior we can toggle
    let shouldThrow = true;
    const ToggleChild: React.FC = () => {
      if (shouldThrow) throw new Error('initial error');
      return <div data-testid="recovered">recovered</div>;
    };

    render(
      <ErrorBoundary>
        <ToggleChild />
      </ErrorBoundary>
    );

    // Error UI is visible
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

    // Stop throwing, then click Try Again
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByTestId('recovered')).toBeInTheDocument();
  });

  it('renders a custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom!</div>}>
        <ThrowingChild />
      </ErrorBoundary>
    );
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────
// InlineError
// ─────────────────────────────────────────────

describe('InlineError', () => {
  it('renders the error message', () => {
    render(<InlineError message="Network request failed" />);
    expect(screen.getByText('Network request failed')).toBeInTheDocument();
  });

  it('shows Retry button when onRetry is provided', () => {
    const onRetry = vi.fn();
    render(<InlineError message="Oops" onRetry={onRetry} />);
    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('does NOT show Retry button when onRetry is absent', () => {
    render(<InlineError message="Oops" />);
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('shows dismiss button when onDismiss is provided', () => {
    const onDismiss = vi.fn();
    render(<InlineError message="Oops" onDismiss={onDismiss} />);
    const dismissBtn = screen.getByRole('button', { name: /×/i });
    expect(dismissBtn).toBeInTheDocument();
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
