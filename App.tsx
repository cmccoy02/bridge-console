import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BridgeMetrics, UpdateJobResult, AutomationSettings, AutomationFrequency } from './types';
import ScoreGauge from './components/ScoreGauge';
import DependencyGraph from './components/DependencyGraph';
import TriageList from './components/TriageList';
import RepoIntel from './components/RepoIntel';
import BarrelFilesList from './components/BarrelFilesList';
import DependencyIssues from './components/DependencyIssues';
import RepositoryCard, { RepositoryCardSkeleton } from './components/RepositoryCard';
import AddRepositoryCard from './components/AddRepositoryCard';
import { AuthProvider, useAuth } from './components/AuthProvider';
import LoginScreen from './components/LoginScreen';
import ScanHistory from './components/ScanHistory';
import ScanProgress from './components/ScanProgress';
import ErrorBoundary, { InlineError } from './components/ErrorBoundary';
import ActionableTasks from './components/ActionableTasks';
import WelcomeScreen from './components/WelcomeScreen';
import ConnectionError from './components/ConnectionError';
import { validateGitHubUrl, type ValidationResult } from './utils/validation';
import mockData from './mock-bridge-metrics.json';
import {
  Terminal,
  Activity,
  ShieldAlert,
  Cpu,
  ChevronRight,
  Database,
  Loader2,
  LayoutDashboard,
  Package,
  Brain,
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
  Download,
  LogOut,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  Bot,
  Link as LinkIcon,
  Save,
  Clock,
  Calendar,
  FileText,
  ToggleLeft,
  ToggleRight,
  Check,
  Shield
  // DollarSign, Map - moved to central dashboard
} from 'lucide-react';
import GitHubBrowser from './components/GitHubBrowser';
import SecurityFindings from './components/SecurityFindings';
// CapEx and Roadmap moved to central dashboard
// import SoftwareCapitalization from './components/SoftwareCapitalization';
// import Roadmap from './components/Roadmap';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

type TabType = 'overview' | 'packages' | 'security' | 'insights' | 'automations';
type ViewMode = 'repositories' | 'repository-detail' | 'add-repository';
type AddRepoMode = 'url' | 'browse';

interface Repository {
  id: number;
  name: string;
  owner: string;
  repoUrl: string;
  lastScore: number;
  lastScanId?: number;
  lastScanDate?: string;
  lastScanData?: any;
}

// Wrapped App component with auth
const AppContent: React.FC = () => {
  const { user, logout, isLoading: authLoading, handleOAuthCallback } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('repositories');
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [metrics, setMetrics] = useState<BridgeMetrics | null>(null);
  const [repoUrl, setRepoUrl] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [currentScanId, setCurrentScanId] = useState<number | null>(null);
  const [scanProgress, setScanProgress] = useState<{
    phase: string;
    step: number;
    totalSteps: number;
    percent: number;
    detail?: string;
    elapsed?: number;
  } | null>(null);
  const [urlValidation, setUrlValidation] = useState<ValidationResult>({ isValid: true });
  const [isLoadingRepos, setIsLoadingRepos] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'score' | 'date'>('date');
  const [filterNeedsAttention, setFilterNeedsAttention] = useState(false);
  const [addRepoMode, setAddRepoMode] = useState<AddRepoMode>('browse');

  // Update job state
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentUpdateJobId, setCurrentUpdateJobId] = useState<number | null>(null);
  const [updateResult, setUpdateResult] = useState<UpdateJobResult | null>(null);
  const updatePollRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup job state (for removing unused dependencies)
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{ prUrl?: string; message?: string; error?: string } | null>(null);

  // Handle OAuth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
      handleOAuthCallback(code)
        .then(() => {
          // Clear the URL params
          window.history.replaceState({}, '', window.location.pathname);
        })
        .catch((err) => {
          console.error('OAuth callback failed:', err);
          window.history.replaceState({}, '', window.location.pathname);
        });
    }
  }, [handleOAuthCallback]);

  // Check backend connection and load repositories with retry
  // NOTE: This hook must be called unconditionally before any early returns
  useEffect(() => {
    // Only run if user is authenticated
    if (!user || authLoading) return;

    let retryCount = 0;
    const maxRetries = 5;
    const retryDelay = 2000;

    const checkBackend = async () => {
      try {
        console.log('[Bridge] Checking backend connection... (attempt', retryCount + 1, ')');
        const res = await fetch(`${API_URL}/api/health`);
        if (res.ok) {
          const data = await res.json();
          console.log('[Bridge] Backend connected:', data);
          setBackendConnected(true);
          setError(null);
          if (!data.hasGitHubToken) {
            setError('Backend running but GITHUB_TOKEN not found. Add it to your .env file.');
          }

          // Load repositories
          loadRepositories();
        } else {
          throw new Error('Backend returned non-OK status');
        }
      } catch (err) {
        console.error('[Bridge] Backend connection failed:', err);
        retryCount++;

        if (retryCount < maxRetries) {
          setStatusMessage(`Connecting to server... (${retryCount}/${maxRetries})`);
          setTimeout(checkBackend, retryDelay);
        } else {
          setBackendConnected(false);
          setStatusMessage('');
          setError('Could not connect to backend server. Please ensure the server is running.');
        }
      }
    };
    checkBackend();
  }, [user, authLoading]);

  // Cleanup update poll on unmount
  useEffect(() => {
    return () => {
      if (updatePollRef.current) {
        clearInterval(updatePollRef.current);
      }
    };
  }, []);

  // Retry backend connection
  const retryConnection = async () => {
    setError(null);
    setStatusMessage('Reconnecting...');
    try {
      const res = await fetch(`${API_URL}/api/health`);
      if (res.ok) {
        const data = await res.json();
        setBackendConnected(true);
        setStatusMessage('');
        if (!data.hasGitHubToken) {
          setError('Backend running but GITHUB_TOKEN not found. Add it to your .env file.');
        }
        loadRepositories();
      } else {
        throw new Error('Backend not available');
      }
    } catch (err) {
      setBackendConnected(false);
      setStatusMessage('');
      setError('Could not connect to backend server.');
    }
  };

  // Show login screen if not authenticated
  if (authLoading) {
    return (
      <div className="min-h-screen bg-bg-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-apex-500" size={48} />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const loadRepositories = async () => {
    setIsLoadingRepos(true);
    try {
      console.log('[Bridge] Loading repositories...');
      const res = await fetch(`${API_URL}/api/repositories`, {
        credentials: 'include'
      });
      console.log('[Bridge] Load repositories status:', res.status);

      if (res.ok) {
        const contentType = res.headers.get('content-type');

        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          setRepositories(data);
          console.log('[Bridge] Loaded repositories:', data.length);
        } else {
          console.error('[Bridge] Non-JSON response when loading repos');
          const text = await res.text();
          console.error('[Bridge] Response text:', text.substring(0, 200));
        }
      } else {
        console.error('[Bridge] Failed to load repositories, status:', res.status);
      }
    } catch (err) {
      console.error('[Bridge] Failed to load repositories:', err);
    } finally {
      setIsLoadingRepos(false);
    }
  };

  // Disconnect/remove a repository
  const disconnectRepository = async (repoId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/repositories/${repoId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (res.ok) {
        // Remove from local state
        setRepositories(prev => prev.filter(r => r.id !== repoId));
        console.log('[Bridge] Repository disconnected:', repoId);
      } else {
        console.error('[Bridge] Failed to disconnect repository:', res.status);
        setError('Failed to disconnect repository');
      }
    } catch (err) {
      console.error('[Bridge] Error disconnecting repository:', err);
      setError('Error disconnecting repository');
    }
  };

  // Poll for results with progress tracking
  const pollStatus = async (scanId: number) => {
    console.log('[Bridge] Starting to poll scan:', scanId);
    setScanProgress(null);

    const interval = setInterval(async () => {
        try {
            const res = await fetch(`${API_URL}/api/scan/${scanId}`, {
              credentials: 'include'
            });
            
            if (!res.ok) {
              console.error('[Bridge] Poll failed with status:', res.status);
              clearInterval(interval);
              setError(`POLL_FAILED: Server returned ${res.status}`);
              setIsScanning(false);
              setScanProgress(null);
              return;
            }
            
            const data = await res.json();
            console.log('[Bridge] Poll result:', data.status, data.progress?.phase);
            
            // Update progress if available
            if (data.progress) {
              setScanProgress(data.progress);
            }
            
            if (data.status === 'completed') {
                console.log('[Bridge] Scan completed successfully');
                clearInterval(interval);
                setMetrics(data.data);
                setIsScanning(false);
                setScanProgress(null);
            } else if (data.status === 'failed') {
                console.log('[Bridge] Scan failed on server');
                clearInterval(interval);
                setError('SCAN_FAILED: Remote server could not process repository. Check backend logs.');
                setIsScanning(false);
                setScanProgress(null);
            }
        } catch (e) {
            console.error('[Bridge] Poll exception:', e);
            clearInterval(interval);
            setError('CONNECTION_LOST: Backend stopped responding');
            setIsScanning(false);
            setScanProgress(null);
        }
    }, 1500); // Poll slightly faster for better progress updates
  };

  const startScan = async (e?: React.FormEvent, repositoryId?: number) => {
    if (e) e.preventDefault();
    
    const urlToScan = selectedRepo?.repoUrl || repoUrl;
    const repoId = selectedRepo?.id || repositoryId;
    
    if (!urlToScan) {
      setError('Please enter a repository URL');
      return;
    }

    console.log('[Bridge] Starting scan for:', urlToScan);
    setIsScanning(true);
    setStatusMessage('INITIATING_SECURE_HANDSHAKE...');
    setError(null);
    setMetrics(null);

    try {
        console.log('[Bridge] Sending POST request to /api/scan');
        const res = await fetch(`${API_URL}/api/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ repoUrl: urlToScan, repositoryId: repoId })
        });
        
        console.log('[Bridge] Response status:', res.status);
        
        if (!res.ok) {
          const errorText = await res.text();
          console.error('[Bridge] Server error:', errorText);
          throw new Error(`Server returned ${res.status}: ${errorText}`);
        }
        
        const data = await res.json();
        console.log('[Bridge] Scan initiated, ID:', data.scanId);
        
        if (!data.scanId) {
          throw new Error('No scan ID returned from server');
        }
        
        setCurrentScanId(data.scanId);
        pollStatus(data.scanId);

    } catch (err) {
        console.error('[Bridge] Scan failed:', err);
        setError(`SCAN_INIT_FAILED: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setIsScanning(false);
    }
  };

  // Trigger minor/patch update for selected repository
  const triggerUpdate = async () => {
    if (!selectedRepo) return;

    setIsUpdating(true);
    setUpdateResult(null);
    setError(null);

    try {
      console.log('[Bridge] Triggering update for:', selectedRepo.name);
      const res = await fetch(`${API_URL}/api/repositories/${selectedRepo.id}/update`, {
        method: 'POST',
        credentials: 'include'
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to trigger update');
      }

      const data = await res.json();
      console.log('[Bridge] Update job created:', data.jobId);
      setCurrentUpdateJobId(data.jobId);
      pollUpdateStatus(data.jobId);
    } catch (err) {
      console.error('[Bridge] Update trigger failed:', err);
      setError(err instanceof Error ? err.message : 'Update failed');
      setIsUpdating(false);
    }
  };

  // Poll update job status
  const pollUpdateStatus = (jobId: number) => {
    // Clear any existing poll
    if (updatePollRef.current) {
      clearInterval(updatePollRef.current);
    }

    updatePollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/update-jobs/${jobId}`, {
          credentials: 'include'
        });

        if (!res.ok) {
          clearInterval(updatePollRef.current!);
          updatePollRef.current = null;
          setError('Failed to get update status');
          setIsUpdating(false);
          return;
        }

        const data = await res.json();

        if (data.status === 'completed') {
          clearInterval(updatePollRef.current!);
          updatePollRef.current = null;
          setIsUpdating(false);
          setUpdateResult(data.result);
          console.log('[Bridge] Update completed:', data.result);
        } else if (data.status === 'failed') {
          clearInterval(updatePollRef.current!);
          updatePollRef.current = null;
          setIsUpdating(false);
          setError(data.result?.error || 'Update failed');
        }
      } catch (e) {
        console.error('[Bridge] Update poll error:', e);
        clearInterval(updatePollRef.current!);
        updatePollRef.current = null;
        setError('Lost connection to server');
        setIsUpdating(false);
      }
    }, 1500);
  };

  // Trigger cleanup job to remove unused dependencies
  const triggerCleanup = async (packages: string[]) => {
    if (!selectedRepo || packages.length === 0) return;

    setIsCleaningUp(true);
    setCleanupResult(null);
    setError(null);

    try {
      console.log('[Bridge] Triggering cleanup for:', selectedRepo.name, 'packages:', packages);
      const res = await fetch(`${API_URL}/api/repositories/${selectedRepo.id}/cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ packages })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to trigger cleanup');
      }

      const data = await res.json();
      console.log('[Bridge] Cleanup job created:', data.jobId);
      pollCleanupStatus(data.jobId);
    } catch (err) {
      console.error('[Bridge] Cleanup trigger failed:', err);
      setError(err instanceof Error ? err.message : 'Cleanup failed');
      setIsCleaningUp(false);
    }
  };

  // Poll cleanup job status
  const pollCleanupStatus = (jobId: number) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/cleanup-jobs/${jobId}`, {
          credentials: 'include'
        });

        if (!res.ok) {
          clearInterval(interval);
          setError('Failed to get cleanup status');
          setIsCleaningUp(false);
          return;
        }

        const data = await res.json();

        if (data.status === 'completed') {
          clearInterval(interval);
          setIsCleaningUp(false);
          setCleanupResult(data.result);
          console.log('[Bridge] Cleanup completed:', data.result);
        } else if (data.status === 'failed') {
          clearInterval(interval);
          setIsCleaningUp(false);
          setError(data.result?.error || 'Cleanup failed');
        }
      } catch (e) {
        console.error('[Bridge] Cleanup poll error:', e);
        clearInterval(interval);
        setError('Lost connection to server');
        setIsCleaningUp(false);
      }
    }, 1500);
  };

  // Validate URL on change
  const handleUrlChange = (value: string) => {
    setRepoUrl(value);
    if (value.trim()) {
      const validation = validateGitHubUrl(value);
      setUrlValidation(validation);
    } else {
      setUrlValidation({ isValid: true }); // Don't show error for empty
    }
  };

  const addRepository = async () => {
    // Validate before submission
    const validation = validateGitHubUrl(repoUrl);
    setUrlValidation(validation);
    
    if (!validation.isValid) {
      return;
    }

    const normalizedUrl = validation.normalized || repoUrl;

    try {
      console.log('[Bridge] Adding repository:', normalizedUrl);

      const res = await fetch(`${API_URL}/api/repositories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ repoUrl: normalizedUrl })
      });

      console.log('[Bridge] Add repository response status:', res.status);
      console.log('[Bridge] Response content-type:', res.headers.get('content-type'));

      if (!res.ok) {
        const contentType = res.headers.get('content-type');
        
        // Check if response is JSON
        if (contentType && contentType.includes('application/json')) {
          const error = await res.json();
          throw new Error(error.error || 'Failed to add repository');
        } else {
          // Response is HTML or other format
          const text = await res.text();
          console.error('[Bridge] Non-JSON response:', text.substring(0, 200));
          throw new Error(`Server error: ${res.status} ${res.statusText}`);
        }
      }

      const data = await res.json();
      console.log('[Bridge] Repository added:', data);

      await loadRepositories();
      setViewMode('repositories');
      setRepoUrl('');
      setError(null);
    } catch (err) {
      console.error('[Bridge] Add repository failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to add repository');
    }
  };

  const selectRepository = (repo: Repository) => {
    setSelectedRepo(repo);
    setViewMode('repository-detail');
    setActiveTab('overview');
    
    // Load existing scan data if available
    if (repo.lastScanData) {
      setMetrics(repo.lastScanData);
    } else {
      setMetrics(null);
    }
  };

  const backToRepositories = () => {
    setViewMode('repositories');
    setSelectedRepo(null);
    setMetrics(null);
    setRepoUrl('');
    setError(null);
    setCurrentScanId(null);
    loadRepositories();
  };

  const exportCurrentScan = () => {
    if (currentScanId || selectedRepo?.lastScanId) {
      const scanId = currentScanId || selectedRepo?.lastScanId;
      window.open(`${API_URL}/api/scans/${scanId}/export`, '_blank');
    } else if (metrics) {
      // Fallback: export current metrics as JSON
      const blob = new Blob([JSON.stringify(metrics, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bridge-scan-${metrics.meta.projectName}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleExportScan = (scanId: number) => {
    window.open(`${API_URL}/api/scans/${scanId}/export`, '_blank');
  };

  const resetSystem = () => {
    if (viewMode === 'repository-detail') {
      // Just reload the scan data
      startScan(undefined, selectedRepo?.id);
    } else {
      setMetrics(null);
      setRepoUrl('');
      setError(null);
    }
  };

  return (
    <div className="min-h-screen text-slate-300 font-mono crt-flicker flex flex-col">
      
      {/* --- HUD HEADER --- */}
      <header className="border-b-2 border-slate-800 bg-bg-900/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-apex-500 text-black flex items-center justify-center font-bold text-xl clip-path-slant">
              B
            </div>
            <div>
              <h1 className="font-ocr font-bold text-xl tracking-widest text-white leading-none">
                BRIDGE <span className="text-apex-500">//</span> CONSOLE
              </h1>
              <div className="flex items-center gap-2 text-[10px] text-slate-500 tracking-[0.2em] mt-1">
                <span className={`w-2 h-2 rounded-full ${
                  backendConnected === false ? 'bg-red-500 animate-pulse' :
                  isScanning ? 'bg-yellow-500 animate-ping' : 
                  'bg-green-500 animate-pulse'
                }`}></span>
                {backendConnected === false ? 'BACKEND OFFLINE' :
                 isScanning ? 'SYSTEM BUSY' : 'SYSTEM ONLINE'}
              </div>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-6 text-xs font-bold tracking-widest text-slate-500">
             <div className="flex items-center gap-3">
                {user.avatarUrl && (
                  <img 
                    src={user.avatarUrl} 
                    alt={user.username}
                    className="w-8 h-8 rounded-full border border-slate-700"
                  />
                )}
                <span className="text-white">{user.username}</span>
                {user.isDemo && (
                  <span className="text-[10px] bg-yellow-900/30 text-yellow-500 px-2 py-0.5 rounded">DEMO</span>
                )}
             </div>
             <button 
               onClick={logout}
               className="flex items-center gap-2 text-slate-500 hover:text-red-500 transition-colors"
             >
               <LogOut size={14} />
               <span>Logout</span>
             </button>
          </div>
        </div>
      </header>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 p-4 md:p-8 max-w-[1600px] mx-auto w-full">

        {/* Show connection error when backend is offline */}
        {backendConnected === false && (
          <ConnectionError
            onRetry={retryConnection}
            message={error || undefined}
          />
        )}

        {/* VIEW: REPOSITORIES OVERVIEW */}
        {viewMode === 'repositories' && !isScanning && backendConnected !== false && (
          <div className="animate-in fade-in duration-500">
            {/* Show Welcome Screen for first-time users with no repositories */}
            {!isLoadingRepos && repositories.length === 0 ? (
              <WelcomeScreen onGetStarted={() => setViewMode('add-repository')} />
            ) : (
              <>
                <div className="mb-6">
                  <h2 className="text-3xl font-ocr font-black text-white mb-2 uppercase">
                    {user?.username}'s Dashboard
                  </h2>
                  <p className="text-slate-400 font-mono text-sm">
                    Monitor technical debt across your repositories
                  </p>
                </div>

                {/* Search and Filter Bar */}
                {!isLoadingRepos && repositories.length > 0 && (
              <div className="mb-6 flex flex-col sm:flex-row gap-3">
                {/* Search Input */}
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search repositories..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-bg-800 border border-slate-700 text-white pl-10 pr-4 py-2 rounded focus:outline-none focus:border-apex-500 font-mono text-sm transition-colors"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Sort Dropdown */}
                <div className="relative">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'name' | 'score' | 'date')}
                    className="appearance-none bg-bg-800 border border-slate-700 text-white pl-10 pr-8 py-2 rounded focus:outline-none focus:border-apex-500 font-mono text-sm cursor-pointer"
                  >
                    <option value="date">Recent</option>
                    <option value="score">Health Score</option>
                    <option value="name">Name</option>
                  </select>
                  <ArrowUpDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                </div>

                {/* Needs Attention Filter */}
                <button
                  onClick={() => setFilterNeedsAttention(!filterNeedsAttention)}
                  className={`flex items-center gap-2 px-4 py-2 rounded border font-mono text-sm transition-colors ${
                    filterNeedsAttention
                      ? 'bg-red-950/30 border-red-700 text-red-400'
                      : 'bg-bg-800 border-slate-700 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <AlertTriangle size={14} />
                  <span className="hidden sm:inline">Needs Attention</span>
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {isLoadingRepos ? (
                // Show skeleton loaders while loading
                <>
                  <RepositoryCardSkeleton />
                  <RepositoryCardSkeleton />
                  <RepositoryCardSkeleton />
                </>
              ) : (
                <>
                  {repositories
                    // Filter by search query
                    .filter(repo => {
                      if (!searchQuery) return true;
                      const q = searchQuery.toLowerCase();
                      return (
                        repo.name.toLowerCase().includes(q) ||
                        repo.owner.toLowerCase().includes(q)
                      );
                    })
                    // Filter by needs attention
                    .filter(repo => {
                      if (!filterNeedsAttention) return true;
                      return repo.lastScore > 0 && repo.lastScore < 70;
                    })
                    // Sort
                    .sort((a, b) => {
                      switch (sortBy) {
                        case 'name':
                          return a.name.localeCompare(b.name);
                        case 'score':
                          return (b.lastScore || 0) - (a.lastScore || 0);
                        case 'date':
                        default:
                          // Sort by lastScanDate, newest first
                          if (!a.lastScanDate && !b.lastScanDate) return 0;
                          if (!a.lastScanDate) return 1;
                          if (!b.lastScanDate) return -1;
                          return new Date(b.lastScanDate).getTime() - new Date(a.lastScanDate).getTime();
                      }
                    })
                    .map(repo => (
                      <RepositoryCard
                        key={repo.id}
                        repo={repo}
                        onClick={() => selectRepository(repo)}
                        onDisconnect={disconnectRepository}
                      />
                    ))
                  }
                  {/* Show "no results" message if filtered to empty */}
                  {repositories.length > 0 && 
                   repositories.filter(r => {
                     const matchesSearch = !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.owner.toLowerCase().includes(searchQuery.toLowerCase());
                     const matchesFilter = !filterNeedsAttention || (r.lastScore > 0 && r.lastScore < 70);
                     return matchesSearch && matchesFilter;
                   }).length === 0 && (
                    <div className="col-span-full text-center py-12 text-slate-500">
                      <Search size={32} className="mx-auto mb-3 opacity-50" />
                      <p className="font-mono text-sm">No repositories match your filters</p>
                      <button
                        onClick={() => { setSearchQuery(''); setFilterNeedsAttention(false); }}
                        className="mt-2 text-apex-500 hover:underline text-sm"
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
                  <AddRepositoryCard onClick={() => setViewMode('add-repository')} />
                </>
              )}
            </div>
              </>
            )}
          </div>
        )}

        {/* VIEW: ADD REPOSITORY */}
        {viewMode === 'add-repository' && !isScanning && backendConnected !== false && (
          <div className="min-h-[70vh] flex flex-col items-center justify-start pt-8 animate-in fade-in zoom-in duration-500">

             <div className="w-full max-w-2xl relative">
                {/* Back Button */}
                <button
                  onClick={backToRepositories}
                  className="mb-6 flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                >
                  <ArrowLeft size={16} />
                  <span className="text-sm uppercase tracking-wider font-bold">Back to Repositories</span>
                </button>

                {/* Decorative Brackets */}
                <div className="absolute -top-6 -left-6 w-12 h-12 border-t-4 border-l-4 border-slate-700"></div>
                <div className="absolute -bottom-6 -right-6 w-12 h-12 border-b-4 border-r-4 border-slate-700"></div>
                <div className="absolute -top-6 -right-6 w-12 h-12 border-t-4 border-r-4 border-apex-500"></div>
                <div className="absolute -bottom-6 -left-6 w-12 h-12 border-b-4 border-l-4 border-apex-500"></div>

                <div className="bg-bg-800 border-2 border-slate-800 p-8 md:p-12 relative overflow-hidden">
                   {/* Background Grid */}
                   <div className="absolute inset-0 opacity-10 bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:20px_20px]"></div>

                   <h2 className="text-3xl font-ocr font-black text-white mb-2 uppercase relative">
                      Connect Repository
                   </h2>
                   <p className="text-slate-400 mb-6 font-mono text-sm border-l-2 border-apex-500 pl-4 relative">
                      Browse your GitHub repositories or enter a URL directly
                   </p>

                   {/* Mode Toggle */}
                   <div className="flex gap-2 mb-6 relative">
                     <button
                       onClick={() => setAddRepoMode('browse')}
                       className={`flex-1 py-2 px-4 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                         addRepoMode === 'browse'
                           ? 'bg-apex-500 text-black'
                           : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                       }`}
                     >
                       <Search size={16} />
                       Browse Repos
                     </button>
                     <button
                       onClick={() => setAddRepoMode('url')}
                       className={`flex-1 py-2 px-4 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                         addRepoMode === 'url'
                           ? 'bg-apex-500 text-black'
                           : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                       }`}
                     >
                       <LinkIcon size={16} />
                       Enter URL
                     </button>
                   </div>

                   {/* GitHub Browser */}
                   {addRepoMode === 'browse' && (
                     <div className="relative mb-6">
                       <GitHubBrowser
                         onConnect={async (url) => {
                           const res = await fetch(`${API_URL}/api/repositories`, {
                             method: 'POST',
                             headers: { 'Content-Type': 'application/json' },
                             credentials: 'include',
                             body: JSON.stringify({ repoUrl: url })
                           });
                           if (!res.ok) {
                             const data = await res.json();
                             throw new Error(data.error || 'Failed to connect');
                           }
                           await loadRepositories();
                         }}
                         isDemo={user?.isDemo}
                       />
                     </div>
                   )}

                   {/* URL Input Form */}
                   {addRepoMode === 'url' && (
                     <form onSubmit={(e) => { e.preventDefault(); addRepository(); }} className="mb-6 relative">
                        <div className="relative group">
                          <div className={`absolute -inset-1 ${urlValidation.isValid ? 'bg-apex-500' : 'bg-red-500'} opacity-20 group-hover:opacity-40 blur transition duration-200`}></div>
                          <div className="relative flex bg-black">
                             <div className={`flex items-center justify-center w-12 bg-slate-900 border-y border-l ${urlValidation.isValid ? 'border-slate-700 text-slate-400' : 'border-red-700 text-red-400'}`}>
                                <Terminal size={20} />
                             </div>
                             <input
                                type="text"
                                placeholder="github.com/owner/repo or owner/repo"
                                className={`w-full bg-black border text-white px-4 py-4 focus:outline-none font-mono transition-colors ${
                                  urlValidation.isValid
                                    ? 'border-slate-700 focus:border-apex-500'
                                    : 'border-red-700 focus:border-red-500'
                                }`}
                                value={repoUrl}
                                onChange={(e) => handleUrlChange(e.target.value)}
                             />
                             <button
                                type="submit"
                                disabled={!repoUrl || !urlValidation.isValid}
                                className="px-8 bg-apex-500 hover:bg-apex-400 disabled:bg-slate-800 disabled:text-slate-600 text-black font-bold uppercase tracking-wider transition-colors flex items-center gap-2"
                             >
                                Connect <ChevronRight size={16} />
                             </button>
                          </div>
                        </div>
                        {/* Validation feedback */}
                        {repoUrl && !urlValidation.isValid && urlValidation.error && (
                          <div className="mt-2 text-red-400 text-xs font-mono flex items-center gap-2">
                            <AlertTriangle size={12} />
                            {urlValidation.error}
                          </div>
                        )}
                        {repoUrl && urlValidation.isValid && urlValidation.normalized && urlValidation.normalized !== repoUrl && (
                          <div className="mt-2 text-slate-500 text-xs font-mono">
                            Will connect: {urlValidation.normalized}
                          </div>
                        )}
                     </form>
                   )}

                   {error && (
                       <div className="mb-6 relative">
                         <InlineError 
                           message={error}
                           onDismiss={() => setError(null)}
                           onRetry={() => { setError(null); addRepository(); }}
                         />
                       </div>
                   )}
                </div>
             </div>
          </div>
        )}

        {/* VIEW: REPOSITORY DETAIL (unchanged from original scanner input) */}
        {viewMode === 'repository-detail' && !metrics && !isScanning && backendConnected !== false && (
          <div className="h-[70vh] flex flex-col items-center justify-center animate-in fade-in zoom-in duration-500">
             
             <div className="w-full max-w-2xl relative">
                {/* Back Button */}
                <button 
                  onClick={backToRepositories}
                  className="mb-6 flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                >
                  <ArrowLeft size={16} />
                  <span className="text-sm uppercase tracking-wider font-bold">Back to Repositories</span>
                </button>

                {/* Decorative Brackets */}
                <div className="absolute -top-6 -left-6 w-12 h-12 border-t-4 border-l-4 border-slate-700"></div>
                <div className="absolute -bottom-6 -right-6 w-12 h-12 border-b-4 border-r-4 border-slate-700"></div>
                <div className="absolute -top-6 -right-6 w-12 h-12 border-t-4 border-r-4 border-apex-500"></div>
                <div className="absolute -bottom-6 -left-6 w-12 h-12 border-b-4 border-l-4 border-apex-500"></div>

                <div className="bg-bg-800 border-2 border-slate-800 p-8 md:p-12 relative overflow-hidden text-center">
                   {/* Background Grid */}
                   <div className="absolute inset-0 opacity-10 bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:20px_20px]"></div>

                   <h2 className="text-3xl font-ocr font-black text-white mb-2 uppercase relative z-10">
                      {selectedRepo?.name}
                   </h2>
                   <p className="text-slate-400 mb-8 font-mono text-sm relative z-10">
                      {selectedRepo?.owner}
                   </p>

                   <button
                     onClick={(e) => {
                       e.preventDefault();
                       startScan(undefined, selectedRepo?.id);
                     }}
                     className="px-8 py-4 bg-apex-500 hover:bg-apex-400 text-black font-bold uppercase tracking-wider transition-colors flex items-center gap-2 mx-auto relative z-10 cursor-pointer"
                   >
                      <RefreshCw size={20} />
                      Start New Scan
                   </button>
                </div>
             </div>
          </div>
        )}

        {/* VIEW: SCANNING STATE */}
        {isScanning && (
           <div className="h-[70vh] flex flex-col items-center justify-center animate-in fade-in duration-300">
              <ScanProgress 
                progress={scanProgress}
                repoName={selectedRepo?.name || repoUrl.split('/').pop()?.replace('.git', '')}
              />
           </div>
        )}

        {/* VIEW: DASHBOARD */}
        {viewMode === 'repository-detail' && metrics && backendConnected !== false && (
           <div className="animate-in slide-in-from-bottom-4 duration-700">
              {/* Dashboard Header */}
              <div className="flex justify-between items-end mb-6 border-b border-slate-800 pb-2">
                 <div className="flex items-center gap-4">
                    <button 
                      onClick={backToRepositories}
                      className="text-slate-400 hover:text-white transition-colors"
                    >
                      <ArrowLeft size={20} />
                    </button>
                    <div>
                       <h2 className="text-2xl text-white font-ocr font-bold uppercase">
                          {metrics.meta.projectName}
                       </h2>
                       <div className="flex gap-4 text-xs font-mono text-slate-500 mt-1">
                          <span>FILES: {metrics.meta.totalFiles}</span>
                          <span>|</span>
                          <span>SLOC: {metrics.meta.sloc}</span>
                          <span>|</span>
                          <span>SCAN_ID: {metrics.meta.scanDate.split('T')[0]}</span>
                       </div>
                    </div>
                 </div>
                 <div className="flex items-center gap-3">
                    <button 
                       onClick={() => exportCurrentScan()}
                       className="text-xs font-bold text-slate-400 hover:text-white border border-slate-700 bg-slate-900 px-4 py-2 uppercase tracking-wider transition-colors flex items-center gap-2"
                    >
                       <Download size={14} />
                       Export
                    </button>
                    <button 
                       onClick={resetSystem}
                       className="text-xs font-bold text-apex-500 hover:text-apex-400 border border-apex-900/50 bg-apex-950/20 px-4 py-2 uppercase tracking-wider transition-colors flex items-center gap-2"
                    >
                       <RefreshCw size={14} />
                       Rescan
                    </button>
                 </div>
              </div>

              {/* Tab Navigation */}
              <div className="flex gap-2 mb-6 border-b border-slate-800">
                 <TabButton 
                    active={activeTab === 'overview'} 
                    onClick={() => setActiveTab('overview')}
                    icon={<LayoutDashboard size={16} />}
                    label="Overview"
                    badge={metrics.score.total}
                 />
                 <TabButton 
                    active={activeTab === 'packages'} 
                    onClick={() => setActiveTab('packages')}
                    icon={<Package size={16} />}
                    label="Packages"
                    badge={metrics.issues.outdatedDependencies.length + metrics.issues.unusedDependencies.length}
                 />
                 <TabButton
                    active={activeTab === 'insights'}
                    onClick={() => setActiveTab('insights')}
                    icon={<Brain size={16} />}
                    label="Insights"
                    badge={metrics.aiAnalysis?.insights?.length || 0}
                 />
                 <TabButton
                    active={activeTab === 'security'}
                    onClick={() => setActiveTab('security')}
                    icon={<Shield size={16} />}
                    label="Security"
                    badge={0}
                 />
                 <TabButton
                    active={activeTab === 'automations'}
                    onClick={() => setActiveTab('automations')}
                    icon={<Bot size={16} />}
                    label="Automations"
                    badge={0}
                 />
              </div>

              {/* Tab Content */}
              {activeTab === 'overview' && <OverviewTab metrics={metrics} />}
              {activeTab === 'packages' && (
                <>
                  {/* Update Success Banner */}
                  {updateResult?.prUrl && (
                    <div className="mb-6 p-4 bg-green-950/30 border border-green-900/50 rounded-lg">
                      <div className="flex items-center gap-2 text-green-400 mb-2">
                        <RefreshCw size={20} />
                        <span className="font-bold">Pull Request Created!</span>
                      </div>
                      <a
                        href={updateResult.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-400 hover:text-green-300 underline flex items-center gap-1"
                      >
                        <LinkIcon size={14} />
                        {updateResult.prUrl}
                      </a>
                      {updateResult.changedPackages && updateResult.changedPackages.length > 0 && (
                        <div className="mt-3 text-sm text-slate-400">
                          <span className="font-medium text-white">{updateResult.changedPackages.length}</span> packages updated:
                          <div className="mt-2 flex flex-wrap gap-2">
                            {updateResult.changedPackages.slice(0, 5).map((pkg) => (
                              <span key={pkg.name} className="px-2 py-0.5 bg-slate-800 rounded text-xs font-mono">
                                {pkg.name}
                              </span>
                            ))}
                            {updateResult.changedPackages.length > 5 && (
                              <span className="px-2 py-0.5 bg-slate-800 rounded text-xs">
                                +{updateResult.changedPackages.length - 5} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      <button
                        onClick={() => setUpdateResult(null)}
                        className="mt-3 text-xs text-slate-500 hover:text-slate-400"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  {/* No Updates Message */}
                  {updateResult && !updateResult.prUrl && updateResult.message && (
                    <div className="mb-6 p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
                      <div className="flex items-center gap-2 text-slate-400">
                        <RefreshCw size={20} />
                        <span>{updateResult.message}</span>
                      </div>
                      <button
                        onClick={() => setUpdateResult(null)}
                        className="mt-3 text-xs text-slate-500 hover:text-slate-400"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  <PackagesTab
                    metrics={metrics}
                    onTriggerUpdate={triggerUpdate}
                    isUpdating={isUpdating}
                    onRemovePackages={triggerCleanup}
                    isCleaningUp={isCleaningUp}
                    cleanupResult={cleanupResult}
                    onDismissCleanupResult={() => setCleanupResult(null)}
                  />
                </>
              )}
              {activeTab === 'security' && selectedRepo && metrics && (
                <SecurityFindings
                  scanId={currentScanId}
                  repositoryId={selectedRepo.id}
                  repoUrl={selectedRepo.repoUrl}
                  defaultBranch="main"
                />
              )}
              {activeTab === 'insights' && <InsightsTab metrics={metrics} />}
              {activeTab === 'automations' && selectedRepo && (
                <AutomationsTab repositoryId={selectedRepo.id} />
              )}

              {/* Scan History */}
              {selectedRepo && (
                <ScanHistory 
                  repositoryId={selectedRepo.id} 
                  onExport={handleExportScan}
                />
              )}
           </div>
        )}
      </main>
    </div>
  );
};

// --- Subcomponents ---

const DashboardCard: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <div className={`bg-bg-800 border border-slate-800 relative group overflow-hidden ${className}`}>
     {/* Corner Accents */}
     <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-apex-500"></div>
     <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-slate-700 group-hover:border-apex-500 transition-colors"></div>
     <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-slate-700 group-hover:border-apex-500 transition-colors"></div>
     <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-apex-500"></div>
     
     {/* Header */}
     <div className="px-4 py-2 bg-slate-900/50 border-b border-slate-800 flex justify-between items-center">
        <h3 className="text-xs font-bold text-apex-500 uppercase tracking-widest">{title}</h3>
        <div className="flex gap-1">
           <div className="w-1 h-1 bg-slate-600 rounded-full"></div>
           <div className="w-1 h-1 bg-slate-600 rounded-full"></div>
           <div className="w-1 h-1 bg-slate-600 rounded-full"></div>
        </div>
     </div>

     {/* Content */}
     <div className="p-4 h-[calc(100%-33px)]">
        {children}
     </div>
  </div>
);

const MetricStat: React.FC<{ label: string; value: number }> = ({ label, value }) => {
   const color = value > 80 ? 'text-green-500' : value > 50 ? 'text-yellow-500' : 'text-red-500';
   return (
      <div className="flex flex-col items-center">
         <span className={`text-xl font-bold font-sans ${color}`}>{value}%</span>
         <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
   )
}

const AnomalyRow: React.FC<{ icon: React.ReactNode; label: string; value: number; danger: boolean }> = ({ icon, label, value, danger }) => (
   <div className={`flex items-center justify-between p-3 border-l-2 ${danger ? 'border-red-500 bg-red-950/10' : 'border-green-500 bg-green-950/10'}`}>
      <div className="flex items-center gap-3">
         <span className={danger ? 'text-red-500' : 'text-green-500'}>{icon}</span>
         <span className="text-sm font-bold text-slate-300 uppercase">{label}</span>
      </div>
      <span className="font-mono text-white font-bold">{value}</span>
   </div>
);

const TabButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number }> = ({ active, onClick, icon, label, badge }) => (
   <button
      onClick={onClick}
      className={`
         px-4 py-3 flex items-center gap-2 font-bold uppercase tracking-wider text-xs transition-all relative
         ${active 
            ? 'text-apex-500 border-b-2 border-apex-500' 
            : 'text-slate-500 hover:text-slate-300 border-b-2 border-transparent'
         }
      `}
   >
      {icon}
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
         <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
            active ? 'bg-apex-500 text-black' : 'bg-slate-800 text-slate-400'
         }`}>
            {badge}
         </span>
      )}
   </button>
);

// Tab Content Components
const OverviewTab: React.FC<{ metrics: BridgeMetrics }> = ({ metrics }) => (
   <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
         <DashboardCard title="System Health">
            <ScoreGauge
               score={metrics.score.total}
               label="Tech Debt Score"
               grade={metrics.score.grade}
               status={metrics.score.status}
            />
            <div className="grid grid-cols-2 gap-2 mt-6 border-t border-slate-800 pt-4">
               <MetricStat label="Coupling" value={metrics.score.breakdown.coupling} />
               <MetricStat label="Freshness" value={metrics.score.breakdown.freshness} />
               <MetricStat label="Clean" value={metrics.score.breakdown.cleanliness} />
               <MetricStat label="Complexity" value={metrics.score.breakdown.complexity} />
               {metrics.score.breakdown.hygiene !== undefined && (
                  <MetricStat label="Hygiene" value={metrics.score.breakdown.hygiene} />
               )}
            </div>
         </DashboardCard>

         <DashboardCard title="Repo Intel" className="min-h-[300px]">
            <RepoIntel meta={metrics.meta} />
         </DashboardCard>
      </div>

      <div className="col-span-12 lg:col-span-8 flex flex-col gap-6">
         <DashboardCard title="Critical Issues">
            <div className="space-y-4">
               <AnomalyRow icon={<Activity size={16} />} label="Circular Dependencies" value={metrics.issues.circularDependencies.length} danger={metrics.issues.circularDependencies.length > 0} />
               <AnomalyRow icon={<AlertTriangle size={16} />} label="Barrel Files" value={metrics.issues.barrelFiles.length} danger={metrics.issues.barrelFiles.filter(b => b.risk === 'high').length > 0} />
               <AnomalyRow icon={<ShieldAlert size={16} />} label="Outdated Packages" value={metrics.issues.outdatedDependencies.length} danger={metrics.issues.outdatedDependencies.length > 5} />
               <AnomalyRow icon={<Cpu size={16} />} label="Unused Dependencies" value={metrics.issues.unusedDependencies.length} danger={metrics.issues.unusedDependencies.length > 0} />
            </div>
         </DashboardCard>

         <DashboardCard title="Dependency Graph" className="h-[400px]">
            <DependencyGraph cycles={metrics.issues.circularDependencies} />
         </DashboardCard>
      </div>
   </div>
);

interface PackagesTabProps {
  metrics: BridgeMetrics;
  onTriggerUpdate?: () => void;
  isUpdating?: boolean;
  onRemovePackages?: (packages: string[]) => Promise<void>;
  isCleaningUp?: boolean;
  cleanupResult?: { prUrl?: string; message?: string; error?: string } | null;
  onDismissCleanupResult?: () => void;
}

const PackagesTab: React.FC<PackagesTabProps> = ({
  metrics,
  onTriggerUpdate,
  isUpdating,
  onRemovePackages,
  isCleaningUp,
  cleanupResult,
  onDismissCleanupResult
}) => (
   <div className="space-y-6">
      {/* Update Button Header */}
      <div className="flex justify-between items-center">
         <h3 className="text-slate-400 text-sm uppercase tracking-wider">
            Dependency Management
         </h3>
         {onTriggerUpdate && (
            <button
               onClick={onTriggerUpdate}
               disabled={isUpdating}
               className={`px-4 py-2 text-sm font-bold uppercase tracking-wider flex items-center gap-2 transition-colors rounded ${
                  isUpdating
                     ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                     : 'bg-green-600 hover:bg-green-500 text-white'
               }`}
            >
               {isUpdating ? (
                  <>
                     <Loader2 className="animate-spin" size={16} />
                     Updating...
                  </>
               ) : (
                  <>
                     <RefreshCw size={16} />
                     Run Minor/Patch Updates
                  </>
               )}
            </button>
         )}
      </div>

      <div className="grid grid-cols-12 gap-6">
         <div className="col-span-12 lg:col-span-6 flex flex-col gap-6">
            <DashboardCard title="Outdated Packages" className="h-[500px]">
               <TriageList
                  outdated={metrics.issues.outdatedDependencies}
                  enhanced={metrics.issues.enhancedDependencies}
                  analysis={metrics.issues.dependencyAnalysis}
               />
            </DashboardCard>
         </div>

         <div className="col-span-12 lg:col-span-6 flex flex-col gap-6">
            {/* Cleanup Success Banner */}
            {cleanupResult?.prUrl && (
              <div className="p-4 bg-green-950/30 border border-green-900/50 rounded-lg">
                <div className="flex items-center gap-2 text-green-400 mb-2">
                  <RefreshCw size={20} />
                  <span className="font-bold">Cleanup PR Created!</span>
                </div>
                <a
                  href={cleanupResult.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-400 hover:text-green-300 underline flex items-center gap-1"
                >
                  <LinkIcon size={14} />
                  {cleanupResult.prUrl}
                </a>
                {cleanupResult.message && (
                  <p className="mt-2 text-sm text-slate-400">{cleanupResult.message}</p>
                )}
                {onDismissCleanupResult && (
                  <button
                    onClick={onDismissCleanupResult}
                    className="mt-3 text-xs text-slate-500 hover:text-slate-400"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            )}

            <DashboardCard title="Dependency Issues" className="h-[500px]">
               <DependencyIssues
                  unused={metrics.issues.unusedDependencies}
                  missing={metrics.issues.missingDependencies}
                  onRemovePackages={onRemovePackages}
                  isRemoving={isCleaningUp}
               />
            </DashboardCard>
         </div>
      </div>
   </div>
);

const InsightsTab: React.FC<{ metrics: BridgeMetrics }> = ({ metrics }) => {
   const { score } = metrics;
   const details = score.details;
   const tasks = score.tasks || [];
   const stats = score.stats;
   const executiveSummary = score.executiveSummary;
   const breakdown = score.breakdown || {};
   const weights = score.weights || {};

   // Category icons for the breakdown
   const categoryIcons: Record<string, string> = {
      dependencies: '[DEP]',
      architecture: '[ARC]',
      codeQuality: '[QTY]',
      testing: '[TST]',
      documentation: '[DOC]'
   };

   const categoryLabels: Record<string, string> = {
      dependencies: 'Dependencies',
      architecture: 'Architecture',
      codeQuality: 'Code Quality',
      testing: 'Testing',
      documentation: 'Documentation'
   };

   return (
      <div className="space-y-6">
         {/* Score Breakdown - New 5-category view */}
         <DashboardCard title="Bridge Score Breakdown">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4">
               {Object.entries(breakdown).map(([key, value]) => {
                  const scoreValue = value as number;
                  const weight = weights[key as keyof typeof weights] || 0;
                  const detail = details?.[key as keyof typeof details];

                  return (
                     <div
                        key={key}
                        className={`rounded-lg p-4 border transition-all hover:border-cyan-500/30 ${
                           scoreValue >= 80 ? 'bg-green-500/10 border-green-500/30' :
                           scoreValue >= 60 ? 'bg-yellow-500/10 border-yellow-500/30' :
                           'bg-red-500/10 border-red-500/30'
                        }`}
                     >
                        <div className="flex items-center gap-2 mb-3">
                           <span className="text-lg">{categoryIcons[key] || '📊'}</span>
                           <span className="text-slate-300 text-xs uppercase tracking-wider font-medium">
                              {categoryLabels[key] || key}
                           </span>
                        </div>
                        <div className="flex items-baseline gap-2 mb-2">
                           <span className={`text-3xl font-bold ${
                              scoreValue >= 80 ? 'text-green-400' :
                              scoreValue >= 60 ? 'text-yellow-400' :
                              'text-red-400'
                           }`}>{scoreValue}</span>
                           <span className="text-slate-500 text-sm">/100</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mb-3">
                           Weight: {Math.round((weight as number) * 100)}%
                        </div>
                        {/* Progress bar */}
                        <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                           <div
                              className={`h-full rounded-full transition-all ${
                                 scoreValue >= 80 ? 'bg-green-500' :
                                 scoreValue >= 60 ? 'bg-yellow-500' :
                                 'bg-red-500'
                              }`}
                              style={{ width: `${scoreValue}%` }}
                           />
                        </div>
                        {/* Top detail */}
                        {detail?.details && detail.details.length > 0 && (
                           <div className="mt-3 text-[10px] text-slate-400 line-clamp-2">
                              {detail.details[0]}
                           </div>
                        )}
                     </div>
                  );
               })}
            </div>
         </DashboardCard>

         {/* Actionable Tasks */}
         <DashboardCard title="Actionable Tasks">
            <div className="p-4">
               <ActionableTasks
                  tasks={tasks}
                  executiveSummary={executiveSummary}
                  stats={stats}
               />
            </div>
         </DashboardCard>
      </div>
   );
};

// Automations Tab Component
const AutomationsTab: React.FC<{ repositoryId: number }> = ({ repositoryId }) => {
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(`${API_URL}/api/repositories/${repositoryId}/automation-settings`, {
          credentials: 'include'
        });

        if (res.ok) {
          const data = await res.json();
          setSettings(data);
        } else {
          setError('Failed to load automation settings');
        }
      } catch (err) {
        setError('Failed to connect to server');
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [repositoryId]);

  // Save settings
  const saveSettings = async () => {
    if (!settings) return;

    try {
      setIsSaving(true);
      setError(null);
      setSaveSuccess(false);

      const res = await fetch(`${API_URL}/api/repositories/${repositoryId}/automation-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(settings)
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save settings');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setIsSaving(false);
    }
  };

  const updateSetting = <K extends keyof AutomationSettings>(key: K, value: AutomationSettings[K]) => {
    if (settings) {
      setSettings({ ...settings, [key]: value });
    }
  };

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  if (isLoading) {
    return (
      <div className="bg-bg-800 border border-slate-700 rounded-lg p-8 flex items-center justify-center">
        <Loader2 className="animate-spin text-apex-500" size={32} />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="bg-bg-800 border border-slate-700 rounded-lg p-8 text-center">
        <AlertTriangle className="mx-auto mb-4 text-red-500" size={32} />
        <p className="text-slate-400">{error || 'Failed to load settings'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Save Button */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-ocr font-bold text-white uppercase">Automation Settings</h3>
          <p className="text-sm text-slate-400">Configure automated workflows for this repository</p>
        </div>
        <button
          onClick={saveSettings}
          disabled={isSaving}
          className={`px-4 py-2 rounded flex items-center gap-2 font-bold uppercase text-sm transition-colors ${
            saveSuccess
              ? 'bg-green-600 text-white'
              : 'bg-apex-500 hover:bg-apex-400 text-black'
          } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isSaving ? (
            <Loader2 className="animate-spin" size={16} />
          ) : saveSuccess ? (
            <Check size={16} />
          ) : (
            <Save size={16} />
          )}
          {saveSuccess ? 'Saved' : 'Save Settings'}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Scheduled Scans */}
      <AutomationCard
        title="Scheduled Scans"
        description="Automatically run health scans on a schedule"
        icon={<Activity size={24} />}
        color="blue"
        enabled={settings.scanEnabled}
        onToggle={(v) => updateSetting('scanEnabled', v)}
      >
        <FrequencySelector
          frequency={settings.scanFrequency}
          dayOfWeek={settings.scanDayOfWeek}
          dayOfMonth={settings.scanDayOfMonth}
          time={settings.scanTime}
          onFrequencyChange={(v) => updateSetting('scanFrequency', v)}
          onDayOfWeekChange={(v) => updateSetting('scanDayOfWeek', v)}
          onDayOfMonthChange={(v) => updateSetting('scanDayOfMonth', v)}
          onTimeChange={(v) => updateSetting('scanTime', v)}
          disabled={!settings.scanEnabled}
        />
      </AutomationCard>

      {/* Patch Updates */}
      <AutomationCard
        title="Automated Patch Updates"
        description="Automatically update minor and patch versions"
        icon={<Package size={24} />}
        color="green"
        enabled={settings.patchEnabled}
        onToggle={(v) => updateSetting('patchEnabled', v)}
      >
        <FrequencySelector
          frequency={settings.patchFrequency}
          dayOfWeek={settings.patchDayOfWeek}
          dayOfMonth={settings.patchDayOfMonth}
          time={settings.patchTime}
          onFrequencyChange={(v) => updateSetting('patchFrequency', v)}
          onDayOfWeekChange={(v) => updateSetting('patchDayOfWeek', v)}
          onDayOfMonthChange={(v) => updateSetting('patchDayOfMonth', v)}
          onTimeChange={(v) => updateSetting('patchTime', v)}
          disabled={!settings.patchEnabled}
        />
        <div className="mt-4 pt-4 border-t border-slate-700">
          <label className={`flex items-center gap-3 cursor-pointer ${!settings.patchEnabled ? 'opacity-50' : ''}`}>
            <input
              type="checkbox"
              checked={settings.patchAutoMerge}
              onChange={(e) => updateSetting('patchAutoMerge', e.target.checked)}
              disabled={!settings.patchEnabled}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-apex-500 focus:ring-apex-500"
            />
            <div>
              <span className="text-sm text-white font-medium">Auto-merge PRs</span>
              <p className="text-xs text-slate-500">Automatically merge if all checks pass</p>
            </div>
          </label>
        </div>
      </AutomationCard>

      {/* Weekly Reports */}
      <AutomationCard
        title="Weekly Reports"
        description="Receive periodic health summaries via email"
        icon={<FileText size={24} />}
        color="purple"
        enabled={settings.reportEnabled}
        onToggle={(v) => updateSetting('reportEnabled', v)}
      >
        <FrequencySelector
          frequency={settings.reportFrequency}
          dayOfWeek={settings.reportDayOfWeek}
          dayOfMonth={settings.reportDayOfMonth}
          time={settings.reportTime}
          onFrequencyChange={(v) => updateSetting('reportFrequency', v)}
          onDayOfWeekChange={(v) => updateSetting('reportDayOfWeek', v)}
          onDayOfMonthChange={(v) => updateSetting('reportDayOfMonth', v)}
          onTimeChange={(v) => updateSetting('reportTime', v)}
          disabled={!settings.reportEnabled}
          showDayOfMonth={settings.reportFrequency === 'monthly'}
        />
        <div className="mt-4 pt-4 border-t border-slate-700">
          <p className="text-xs text-slate-500 mb-2">
            Reports will be sent to your registered email address.
          </p>
        </div>
      </AutomationCard>

      {/* Info Banner */}
      <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
        <div className="flex items-start gap-3">
          <Clock size={20} className="text-slate-400 mt-0.5" />
          <div>
            <p className="text-sm text-slate-300">
              Automations run in the background. Times are based on your local timezone.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Note: The scheduler service is not yet active. Settings are saved for when the feature launches.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Automation Card Component
const AutomationCard: React.FC<{
  title: string;
  description: string;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'purple' | 'orange';
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  children: React.ReactNode;
}> = ({ title, description, icon, color, enabled, onToggle, children }) => {
  const colorClasses = {
    blue: { bg: 'bg-blue-900/20', border: 'border-blue-900/50', icon: 'text-blue-400' },
    green: { bg: 'bg-green-900/20', border: 'border-green-900/50', icon: 'text-green-400' },
    purple: { bg: 'bg-purple-900/20', border: 'border-purple-900/50', icon: 'text-purple-400' },
    orange: { bg: 'bg-orange-900/20', border: 'border-orange-900/50', icon: 'text-orange-400' }
  };

  const colors = colorClasses[color];

  return (
    <div className={`rounded-lg border ${enabled ? colors.border : 'border-slate-700'} ${enabled ? colors.bg : 'bg-bg-800'} overflow-hidden transition-colors`}>
      <div className="p-4 flex items-center justify-between border-b border-slate-700/50">
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-lg ${enabled ? colors.bg : 'bg-slate-800'}`}>
            <span className={enabled ? colors.icon : 'text-slate-500'}>{icon}</span>
          </div>
          <div>
            <h4 className="font-ocr font-bold text-white text-sm uppercase">{title}</h4>
            <p className="text-xs text-slate-400">{description}</p>
          </div>
        </div>
        <button
          onClick={() => onToggle(!enabled)}
          className="text-slate-400 hover:text-white transition-colors"
        >
          {enabled ? (
            <ToggleRight size={32} className="text-apex-500" />
          ) : (
            <ToggleLeft size={32} />
          )}
        </button>
      </div>
      <div className={`p-4 ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        {children}
      </div>
    </div>
  );
};

// Frequency Selector Component
const FrequencySelector: React.FC<{
  frequency: AutomationFrequency;
  dayOfWeek?: number;
  dayOfMonth?: number;
  time?: string;
  onFrequencyChange: (freq: AutomationFrequency) => void;
  onDayOfWeekChange: (day: number) => void;
  onDayOfMonthChange: (day: number) => void;
  onTimeChange: (time: string) => void;
  disabled?: boolean;
  showDayOfMonth?: boolean;
}> = ({
  frequency,
  dayOfWeek = 1,
  dayOfMonth = 1,
  time = '09:00',
  onFrequencyChange,
  onDayOfWeekChange,
  onDayOfMonthChange,
  onTimeChange,
  disabled = false,
  showDayOfMonth = false
}) => {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <div className="space-y-4">
      {/* Frequency Selection */}
      <div className="flex gap-2">
        {(['manual', 'daily', 'weekly', 'monthly'] as AutomationFrequency[]).map((freq) => (
          <button
            key={freq}
            onClick={() => onFrequencyChange(freq)}
            disabled={disabled}
            className={`px-3 py-1.5 rounded text-xs font-bold uppercase transition-colors ${
              frequency === freq
                ? 'bg-apex-500 text-black'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {freq}
          </button>
        ))}
      </div>

      {/* Additional Options */}
      {frequency !== 'manual' && (
        <div className="flex flex-wrap gap-4">
          {/* Day of Week (for weekly) */}
          {frequency === 'weekly' && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Day of Week</label>
              <select
                value={dayOfWeek}
                onChange={(e) => onDayOfWeekChange(parseInt(e.target.value))}
                disabled={disabled}
                className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-apex-500"
              >
                {dayNames.map((name, idx) => (
                  <option key={idx} value={idx}>{name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Day of Month (for monthly) */}
          {frequency === 'monthly' && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Day of Month</label>
              <select
                value={dayOfMonth}
                onChange={(e) => onDayOfMonthChange(parseInt(e.target.value))}
                disabled={disabled}
                className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-apex-500"
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </div>
          )}

          {/* Time */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => onTimeChange(e.target.value)}
              disabled={disabled}
              className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-apex-500"
            />
          </div>
        </div>
      )}

      {/* Manual Mode Info */}
      {frequency === 'manual' && (
        <p className="text-xs text-slate-500">
          Run this automation manually from the dashboard when needed.
        </p>
      )}
    </div>
  );
};

// Main App wrapper with Auth and Error Boundary
const App: React.FC = () => (
  <ErrorBoundary>
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  </ErrorBoundary>
);

export default App;