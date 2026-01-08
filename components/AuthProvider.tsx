import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface User {
  id: number;
  username: string;
  email: string;
  avatarUrl: string;
  isDemo?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: () => void;
  loginDemo: () => Promise<void>;
  logout: () => void;
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
        setUser(userData);
      }
    } catch (error) {
      console.error('Session check error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/github`, {
        credentials: 'include'
      });
      const data = await res.json();

      if (data.demoMode) {
        // OAuth not configured, use demo mode
        await loginDemo();
      } else if (data.authUrl) {
        // Redirect to GitHub
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error('Login error:', error);
      // Fallback to demo mode
      await loginDemo();
    }
  };

  const loginDemo = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/demo`, {
        method: 'POST',
        credentials: 'include'
      });
      const userData = await res.json();

      setUser(userData);
    } catch (error) {
      console.error('Demo login error:', error);
    }
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
      } else {
        throw new Error('OAuth callback failed');
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
    } catch (error) {
      console.error('Logout error:', error);
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, loginDemo, logout, handleOAuthCallback }}>
      {children}
    </AuthContext.Provider>
  );
};
