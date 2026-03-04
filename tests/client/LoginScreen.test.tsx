import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import LoginScreen from '../../components/LoginScreen';

// ─────────────────────────────────────────────
// Mock AuthProvider
// ─────────────────────────────────────────────

const mockLogin = vi.fn();
const mockEnterPreviewMode = vi.fn();

vi.mock('../../components/AuthProvider', () => ({
  useAuth: vi.fn(() => ({
    login: mockLogin,
    enterPreviewMode: mockEnterPreviewMode,
    isLoading: false,
    user: null,
    logout: vi.fn(),
    isPreviewMode: false,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────

describe('LoginScreen – rendering', () => {
  it('renders without crashing', () => {
    render(<LoginScreen />);
    // The heading contains "Bridge // Console"
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('shows the product headline', () => {
    render(<LoginScreen />);
    expect(screen.getByText(/technical debt intelligence platform/i)).toBeInTheDocument();
  });

  it('renders the Connect GitHub button', () => {
    render(<LoginScreen />);
    expect(screen.getByRole('button', { name: /connect github/i })).toBeInTheDocument();
  });

  it('renders the Explore with Sample Data button', () => {
    render(<LoginScreen />);
    expect(screen.getByRole('button', { name: /explore with sample data/i })).toBeInTheDocument();
  });

  it('shows the Install the GitHub App link', () => {
    render(<LoginScreen />);
    expect(screen.getByRole('link', { name: /install the github app/i })).toBeInTheDocument();
  });

  it('displays all three value propositions', () => {
    render(<LoginScreen />);
    expect(screen.getByText(/safe dependency updates/i)).toBeInTheDocument();
    expect(screen.getByText(/health score tracking/i)).toBeInTheDocument();
    expect(screen.getByText(/actionable insights/i)).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────
// Interactions
// ─────────────────────────────────────────────

describe('LoginScreen – interactions', () => {
  it('calls login() when Connect GitHub is clicked', () => {
    render(<LoginScreen />);
    fireEvent.click(screen.getByRole('button', { name: /connect github/i }));
    expect(mockLogin).toHaveBeenCalledOnce();
  });

  it('calls enterPreviewMode() when Explore with Sample Data is clicked', () => {
    render(<LoginScreen />);
    fireEvent.click(screen.getByRole('button', { name: /explore with sample data/i }));
    expect(mockEnterPreviewMode).toHaveBeenCalledOnce();
  });
});

// ─────────────────────────────────────────────
// Loading state
// ─────────────────────────────────────────────

describe('LoginScreen – loading state', () => {
  it('disables both buttons when isLoading is true', async () => {
    // Dynamically override the mock return value for this test
    const { useAuth } = await import('../../components/AuthProvider');
    vi.mocked(useAuth).mockReturnValueOnce({
      login: mockLogin,
      enterPreviewMode: mockEnterPreviewMode,
      isLoading: true,
      user: null,
      logout: vi.fn(),
      isPreviewMode: false,
    });

    render(<LoginScreen />);

    expect(screen.getByRole('button', { name: /connect github/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /explore with sample data/i })).toBeDisabled();
  });
});
