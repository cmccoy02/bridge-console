import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
    const storedUser = localStorage.getItem('bridge_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        localStorage.removeItem('bridge_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = async () => {
    try {
      const res = await fetch('/api/auth/github');
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
      const res = await fetch('/api/auth/demo', { method: 'POST' });
      const userData = await res.json();
      
      setUser(userData);
      localStorage.setItem('bridge_user', JSON.stringify(userData));
    } catch (error) {
      console.error('Demo login error:', error);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('bridge_user');
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, loginDemo, logout }}>
      {children}
    </AuthContext.Provider>
  );
};



