import React, { useState, useEffect } from 'react';
import {
  GitBranch,
  Building2,
  Lock,
  Globe,
  Star,
  Loader2,
  Check,
  Plus,
  ChevronDown,
  Search,
  RefreshCw
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  ownerAvatar: string;
  description: string | null;
  htmlUrl: string;
  isPrivate: boolean;
  language: string | null;
  stars: number;
  updatedAt: string;
  isConnected: boolean;
}

interface GitHubOrg {
  id: number;
  login: string;
  avatarUrl: string;
  description: string | null;
}

interface GitHubBrowserProps {
  onConnect: (repoUrl: string) => Promise<void>;
  isDemo?: boolean;
}

const languageColors: Record<string, string> = {
  TypeScript: 'bg-blue-500',
  JavaScript: 'bg-yellow-400',
  Python: 'bg-blue-400',
  Go: 'bg-cyan-400',
  Rust: 'bg-orange-500',
  Java: 'bg-red-500',
  Ruby: 'bg-red-600',
  PHP: 'bg-purple-500',
  'C#': 'bg-green-500',
  'C++': 'bg-pink-500',
  C: 'bg-gray-500',
  Swift: 'bg-orange-400',
  Kotlin: 'bg-purple-400',
  Dart: 'bg-blue-300',
  HTML: 'bg-orange-600',
  CSS: 'bg-blue-600',
  Shell: 'bg-green-400',
};

const GitHubBrowser: React.FC<GitHubBrowserProps> = ({ onConnect, isDemo }) => {
  const [activeTab, setActiveTab] = useState<'repos' | 'orgs'>('repos');
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [orgs, setOrgs] = useState<GitHubOrg[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [connectingRepo, setConnectingRepo] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 'repos') {
      loadRepos();
    } else {
      loadOrgs();
    }
  }, [activeTab]);

  useEffect(() => {
    if (selectedOrg) {
      loadOrgRepos(selectedOrg);
    }
  }, [selectedOrg]);

  const loadRepos = async (loadPage = 1, append = false) => {
    if (isDemo) {
      setError('GitHub repository browsing is not available in demo mode. Please sign in with GitHub.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/github/repos?page=${loadPage}&perPage=30`, {
        credentials: 'include'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load repositories');
      }

      const data = await res.json();
      setRepos(append ? [...repos, ...data.repos] : data.repos);
      setHasMore(data.hasMore);
      setPage(loadPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repositories');
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrgs = async () => {
    if (isDemo) {
      setError('GitHub repository browsing is not available in demo mode. Please sign in with GitHub.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/github/orgs`, {
        credentials: 'include'
      });

      if (!res.ok) {
        const data = await res.json();
        
        // Provide helpful error message for organization access
        if (res.status === 403 || res.status === 401) {
          throw new Error('Unable to access organizations. If your organization has OAuth App restrictions enabled, ask an admin to approve Bridge. Otherwise, try re-authenticating.');
        }
        
        throw new Error(data.error || data.details || 'Failed to load organizations');
      }

      const data = await res.json();
      setOrgs(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load organizations';
      setError(errorMessage);
      console.error('[GitHubBrowser] Error loading orgs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrgRepos = async (orgName: string, loadPage = 1, append = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/github/orgs/${orgName}/repos?page=${loadPage}&perPage=30`, {
        credentials: 'include'
      });

      if (!res.ok) {
        const data = await res.json();
        
        // Provide helpful error message for organization repo access
        if (res.status === 403 || res.status === 401) {
          throw new Error(`Unable to access ${orgName} repositories. The organization may have OAuth App restrictions. Ask an organization admin to approve Bridge in the organization settings.`);
        }
        
        throw new Error(data.error || data.details || 'Failed to load organization repositories');
      }

      const data = await res.json();
      setRepos(append ? [...repos, ...data.repos] : data.repos);
      setHasMore(data.hasMore);
      setPage(loadPage);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load organization repositories';
      setError(errorMessage);
      console.error('[GitHubBrowser] Error loading org repos:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async (repo: GitHubRepo) => {
    setConnectingRepo(repo.htmlUrl);
    try {
      await onConnect(repo.htmlUrl);
      // Update repo to show as connected
      setRepos(repos.map(r =>
        r.id === repo.id ? { ...r, isConnected: true } : r
      ));
    } catch (err) {
      console.error('Failed to connect repo:', err);
    } finally {
      setConnectingRepo(null);
    }
  };

  const handleLoadMore = () => {
    if (selectedOrg) {
      loadOrgRepos(selectedOrg, page + 1, true);
    } else {
      loadRepos(page + 1, true);
    }
  };

  const filteredRepos = repos.filter(repo => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      repo.name.toLowerCase().includes(q) ||
      repo.owner.toLowerCase().includes(q) ||
      (repo.description?.toLowerCase().includes(q) ?? false)
    );
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  return (
    <div className="bg-bg-800 border border-slate-700 rounded-lg overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-slate-700">
        <button
          onClick={() => { setActiveTab('repos'); setSelectedOrg(null); }}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'repos'
              ? 'bg-slate-800 text-white border-b-2 border-apex-500'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <GitBranch size={16} />
            My Repositories
          </div>
        </button>
        <button
          onClick={() => setActiveTab('orgs')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'orgs'
              ? 'bg-slate-800 text-white border-b-2 border-apex-500'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Building2 size={16} />
            Organizations
          </div>
        </button>
      </div>

      {/* Search bar */}
      {(activeTab === 'repos' || selectedOrg) && !isLoading && !error && repos.length > 0 && (
        <div className="p-3 border-b border-slate-700">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Filter repositories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-white pl-10 pr-4 py-2 rounded text-sm focus:outline-none focus:border-apex-500"
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-h-[400px] overflow-y-auto">
        {isLoading && repos.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 size={24} className="animate-spin mr-2" />
            Loading...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={() => activeTab === 'repos' ? loadRepos() : loadOrgs()}
              className="flex items-center gap-2 text-apex-500 hover:text-apex-400"
            >
              <RefreshCw size={16} />
              Retry
            </button>
          </div>
        ) : activeTab === 'orgs' && !selectedOrg ? (
          // Organization list
          <div className="divide-y divide-slate-700">
            {orgs.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                No organizations found
              </div>
            ) : (
              orgs.map(org => (
                <button
                  key={org.id}
                  onClick={() => setSelectedOrg(org.login)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-800/50 transition-colors text-left"
                >
                  <img
                    src={org.avatarUrl}
                    alt={org.login}
                    className="w-10 h-10 rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium">{org.login}</div>
                    {org.description && (
                      <div className="text-slate-400 text-sm truncate">{org.description}</div>
                    )}
                  </div>
                  <ChevronDown size={16} className="text-slate-500 -rotate-90" />
                </button>
              ))
            )}
          </div>
        ) : (
          // Repository list
          <>
            {selectedOrg && (
              <div className="px-4 py-2 bg-slate-800/50 border-b border-slate-700 flex items-center gap-2">
                <button
                  onClick={() => { setSelectedOrg(null); setRepos([]); loadRepos(); }}
                  className="text-apex-500 hover:text-apex-400 text-sm"
                >
                  Organizations
                </button>
                <span className="text-slate-600">/</span>
                <span className="text-white text-sm">{selectedOrg}</span>
              </div>
            )}
            <div className="divide-y divide-slate-700">
              {filteredRepos.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  {searchQuery ? 'No repositories match your search' : 'No repositories found'}
                </div>
              ) : (
                filteredRepos.map(repo => (
                  <div
                    key={repo.id}
                    className="px-4 py-3 hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white font-medium truncate">{repo.name}</span>
                          {repo.isPrivate ? (
                            <span className="flex items-center gap-1 text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                              <Lock size={10} />
                              Private
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                              <Globe size={10} />
                              Public
                            </span>
                          )}
                        </div>
                        {repo.description && (
                          <p className="text-slate-400 text-sm truncate mb-2">{repo.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          {repo.language && (
                            <span className="flex items-center gap-1">
                              <span className={`w-2 h-2 rounded-full ${languageColors[repo.language] || 'bg-slate-500'}`} />
                              {repo.language}
                            </span>
                          )}
                          {repo.stars > 0 && (
                            <span className="flex items-center gap-1">
                              <Star size={12} />
                              {repo.stars}
                            </span>
                          )}
                          <span>Updated {formatDate(repo.updatedAt)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleConnect(repo)}
                        disabled={repo.isConnected || connectingRepo === repo.htmlUrl}
                        className={`shrink-0 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                          repo.isConnected
                            ? 'bg-green-900/30 text-green-400 cursor-default'
                            : connectingRepo === repo.htmlUrl
                            ? 'bg-slate-700 text-slate-400 cursor-wait'
                            : 'bg-apex-500 text-black hover:bg-apex-400'
                        }`}
                      >
                        {repo.isConnected ? (
                          <span className="flex items-center gap-1">
                            <Check size={14} />
                            Connected
                          </span>
                        ) : connectingRepo === repo.htmlUrl ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <span className="flex items-center gap-1">
                            <Plus size={14} />
                            Connect
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Load more button */}
      {hasMore && !isLoading && (
        <div className="p-3 border-t border-slate-700">
          <button
            onClick={handleLoadMore}
            className="w-full py-2 text-sm text-apex-500 hover:text-apex-400 transition-colors"
          >
            Load more repositories
          </button>
        </div>
      )}

      {/* Loading indicator for pagination */}
      {isLoading && repos.length > 0 && (
        <div className="p-3 border-t border-slate-700 flex justify-center">
          <Loader2 size={20} className="animate-spin text-slate-400" />
        </div>
      )}
    </div>
  );
};

export default GitHubBrowser;
