import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Token storage key for cross-domain auth
const AUTH_TOKEN_KEY = 'bridge_auth_token';

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && (window as any).bridge?.isElectron;

// Electron bridge type
interface ElectronBridge {
  isElectron: boolean;
  openExternal: (url: string) => Promise<void>;
  getOAuthRedirectUri: () => Promise<string>;
  onOAuthCallback: (callback: (data: { code: string }) => void) => () => void;
  onOAuthError: (callback: (data: { error: string; description: string }) => void) => () => void;
}

const bridge: ElectronBridge | undefined = isElectron ? (window as any).bridge : undefined;

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
  getAuthHeaders: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper to get stored auth token
const getStoredToken = (): string | null => {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
};

// Helper to store auth token
const storeToken = (token: string): void => {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch (e) {
    console.warn('[Auth] Failed to store token:', e);
  }
};

// Helper to clear stored auth token
const clearStoredToken = (): void => {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // Ignore
  }
};

// Export helper to get auth headers for API calls
export const getAuthHeaders = (): Record<string, string> => {
  const token = getStoredToken();
  if (token) {
    return { 'Authorization': `Bearer ${token}` };
  }
  return {};
};

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

  // Check for auth token in URL (web OAuth callback) or existing session
  useEffect(() => {
    const handleAuth = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const authToken = urlParams.get('auth_token');
      const authError = urlParams.get('auth_error');
      
      // Clear URL params
      if (authToken || authError) {
        window.history.replaceState({}, '', window.location.pathname);
      }
      
      if (authError) {
        console.error('[Auth] OAuth error:', authError);
        alert(`Authentication failed: ${authError}`);
        setIsLoading(false);
        return;
      }
      
      if (authToken) {
        console.log('[Auth] Found auth token, exchanging for session...');
        try {
          const res = await fetch(`${API_URL}/api/auth/exchange-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ token: authToken })
          });
          
          if (res.ok) {
            const userData = await res.json();
            console.log('[Auth] Token exchanged, user:', userData.username);
            // Store the JWT for subsequent API calls (needed for cross-domain)
            if (userData.accessToken) {
              storeToken(userData.accessToken);
              console.log('[Auth] Stored auth token for API calls');
            }
            setUser(userData);
            setIsLoading(false);
            return;
          } else {
            const error = await res.json();
            console.error('[Auth] Token exchange failed:', error);
          }
        } catch (error) {
          console.error('[Auth] Token exchange error:', error);
        }
      }
      
      // No token in URL, check for existing session
      checkSession();
    };
    
    handleAuth();
  }, []);

  // Listen for OAuth callbacks from Electron
  useEffect(() => {
    if (!isElectron || !bridge) return;

    // Listen for OAuth callback with auth code
    const cleanupCallback = bridge.onOAuthCallback(async ({ code }) => {
      console.log('[Auth] Received OAuth callback in Electron');
      try {
        await handleOAuthCallback(code);
      } catch (error) {
        console.error('[Auth] OAuth callback failed:', error);
        alert('Failed to complete GitHub authentication. Please try again.');
      }
    });

    // Listen for OAuth errors
    const cleanupError = bridge.onOAuthError(({ error, description }) => {
      console.error('[Auth] OAuth error:', error, description);
      alert(`GitHub authentication failed: ${description || error}`);
    });

    return () => {
      cleanupCallback();
      cleanupError();
    };
  }, []);

  const checkSession = async () => {
    try {
      // Include Authorization header if we have a stored token
      const headers: Record<string, string> = {};
      const storedToken = getStoredToken();
      if (storedToken) {
        headers['Authorization'] = `Bearer ${storedToken}`;
      }
      
      const res = await fetch(`${API_URL}/api/auth/me`, {
        credentials: 'include',
        headers
      });

      if (res.ok) {
        const userData = await res.json();
        console.log('[Auth] Session found:', userData.username);
        setUser(userData);
      } else {
        console.log('[Auth] No active session');
        // Clear stored token if session check fails
        clearStoredToken();
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

      // Tell server whether we're in Electron or Web
      const platform = isElectron ? 'electron' : 'web';
      
      const res = await fetch(`${API_URL}/api/auth/github?platform=${platform}`, {
        credentials: 'include'
      });
      const data = await res.json();

      if (data.authUrl) {
        if (isElectron && bridge?.openExternal) {
          // In Electron: open browser and poll using the auth token
          console.log('[Auth] Opening GitHub auth in external browser (Electron mode)');
          console.log('[Auth] Auth token for polling:', data.authToken);
          
          await bridge.openExternal(data.authUrl);
          
          // Poll for auth completion using the pending auth token
          if (data.authToken) {
            const pollForAuth = () => {
              let attempts = 0;
              const maxAttempts = 60; // 2 minutes max
              
              const poll = setInterval(async () => {
                attempts++;
                try {
                  const authRes = await fetch(`${API_URL}/api/auth/check-pending/${data.authToken}`, {
                    credentials: 'include'
                  });
                  
                  const result = await authRes.json();
                  console.log('[Auth] Poll result:', result.status);
                  
                  if (result.status === 'completed') {
                    console.log('[Auth] Auth completed! User:', result.user?.username);
                    clearInterval(poll);
                    setUser(result.user);
                  } else if (result.status === 'error') {
                    console.error('[Auth] Auth failed:', result.error);
                    clearInterval(poll);
                    alert(`Authentication failed: ${result.error}`);
                  } else if (result.status === 'not_found') {
                    console.warn('[Auth] Auth token expired or invalid');
                    clearInterval(poll);
                  }
                } catch (e) {
                  console.error('[Auth] Poll error:', e);
                }
                
                if (attempts >= maxAttempts) {
                  console.log('[Auth] Stopped polling after timeout');
                  clearInterval(poll);
                }
              }, 1500); // Poll every 1.5 seconds
            };
            
            pollForAuth();
          }
        } else {
          // In web, just redirect - callback will set cookie and redirect back
          console.log('[Auth] Redirecting to GitHub auth (Web mode)');
          window.location.href = data.authUrl;
        }
      } else if (data.error) {
        console.error('Login error:', data.error);
        alert(data.message || 'GitHub OAuth not configured. Please set up GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.');
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
      const headers = getAuthHeaders();
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers
      });

      // Clear stored auth token
      clearStoredToken();
      setUser(null);
      setIsPreviewMode(false);
    } catch (error) {
      console.error('Logout error:', error);
      clearStoredToken();
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
      handleOAuthCallback,
      getAuthHeaders
    }}>
      {children}
    </AuthContext.Provider>
  );
};
