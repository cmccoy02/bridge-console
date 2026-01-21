import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && (window as any).bridge?.isElectron;

export interface User {
  id: number;
  username: string;
  email: string;
  avatarUrl: string;
  accessToken?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isPreviewMode: boolean;
  login: () => void;
  logout: () => void;
  enterPreviewMode: () => void;
  exitPreviewMode: () => void;
  handleOAuthCallback: (code: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  // Check for existing session on mount
  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        credentials: 'include'
      });

      if (res.ok) {
        const userData = await res.json();
        // Only set user if they have a real GitHub account (not demo)
        if (userData.githubId && userData.githubId !== 'demo-user') {
          setUser(userData);
        }
      }
    } catch (error) {
      console.error('Session check error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async () => {
    try {
      // Exit preview mode when attempting login
      setIsPreviewMode(false);

      const res = await fetch(`${API_URL}/api/auth/github`, {
        credentials: 'include'
      });
      const data = await res.json();

      if (data.authUrl) {
        // Redirect to GitHub
        if (isElectron && (window as any).bridge?.openExternal) {
          // In Electron, open in external browser
          (window as any).bridge.openExternal(data.authUrl);
        } else {
          window.location.href = data.authUrl;
        }
      } else if (data.error) {
        console.error('Login error:', data.error);
        alert('GitHub OAuth not configured. Please set up GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.');
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Failed to connect to server. Please make sure the backend is running.');
    }
  };

  const enterPreviewMode = () => {
    setIsPreviewMode(true);
  };

  const exitPreviewMode = () => {
    setIsPreviewMode(false);
  };

  const handleOAuthCallback = async (code: string) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/github/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ code })
      });

      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        setIsPreviewMode(false);
      } else {
        const error = await res.json();
        throw new Error(error.error || 'OAuth callback failed');
      }
    } catch (error) {
      console.error('OAuth callback error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });

      setUser(null);
      setIsPreviewMode(false);
    } catch (error) {
      console.error('Logout error:', error);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isPreviewMode,
      login,
      logout,
      enterPreviewMode,
      exitPreviewMode,
      handleOAuthCallback
    }}>
      {children}
    </AuthContext.Provider>
  );
};
