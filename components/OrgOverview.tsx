import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Package,
  GitBranch,
  FileCode,
  AlertCircle,
  ArrowRight
} from 'lucide-react';

interface Repository {
  id: number;
  name: string;
  owner: string;
  repoUrl: string;
  lastScore: number;
  lastScanDate?: string;
}

interface OrgOverviewProps {
  repositories: Repository[];
  onRepoClick: (repo: Repository) => void;
}

const OrgOverview: React.FC<OrgOverviewProps> = ({ repositories, onRepoClick }) => {
  // Calculate aggregate stats
  const totalRepos = repositories.length;
  const avgScore = totalRepos > 0
    ? Math.round(repositories.reduce((sum, r) => sum + (r.lastScore || 0), 0) / totalRepos)
    : 0;

  const reposNeedingAttention = repositories.filter(r => (r.lastScore || 0) < 70).length;
  const healthyRepos = repositories.filter(r => (r.lastScore || 0) >= 80).length;

  // Score distribution
  const distribution = {
    excellent: repositories.filter(r => r.lastScore >= 90).length,
    good: repositories.filter(r => r.lastScore >= 70 && r.lastScore < 90).length,
    fair: repositories.filter(r => r.lastScore >= 50 && r.lastScore < 70).length,
    poor: repositories.filter(r => r.lastScore < 50).length
  };

  const distributionData = [
    { name: 'Excellent (90+)', value: distribution.excellent, color: '#3b82f6' },
    { name: 'Good (70-89)', value: distribution.good, color: '#10b981' },
    { name: 'Fair (50-69)', value: distribution.fair, color: '#eab308' },
    { name: 'Needs Work (<50)', value: distribution.poor, color: '#ef4444' }
  ].filter(d => d.value > 0);

  // Repos sorted by score (lowest first = needs most attention)
  const reposByPriority = [...repositories]
    .filter(r => r.lastScore !== undefined)
    .sort((a, b) => (a.lastScore || 0) - (b.lastScore || 0));

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-blue-400';
    if (score >= 80) return 'text-green-400';
    if (score >= 70) return 'text-yellow-400';
    if (score >= 60) return 'text-orange-400';
    return 'text-red-400';
  };

  const getScoreBg = (score: number) => {
    if (score >= 90) return 'bg-blue-500/10 border-blue-500/30';
    if (score >= 80) return 'bg-green-500/10 border-green-500/30';
    if (score >= 70) return 'bg-yellow-500/10 border-yellow-500/30';
    if (score >= 60) return 'bg-orange-500/10 border-orange-500/30';
    return 'bg-red-500/10 border-red-500/30';
  };

  if (totalRepos === 0) {
    return null;
  }

  return (
    <div className="mb-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Organization Overview</h2>
          <p className="text-sm text-slate-500">Health status across all {totalRepos} repositories</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Avg Score */}
        <div className="bg-bg-800 border border-slate-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-8 h-8 rounded flex items-center justify-center border ${getScoreBg(avgScore)}`}>
              {avgScore >= 70 ? (
                <CheckCircle size={16} className={getScoreColor(avgScore)} />
              ) : (
                <AlertCircle size={16} className={getScoreColor(avgScore)} />
              )}
            </div>
            <span className="text-xs text-slate-500 uppercase">Avg Score</span>
          </div>
          <div className={`text-3xl font-bold ${getScoreColor(avgScore)}`}>
            {avgScore}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            across {totalRepos} repos
          </div>
        </div>

        {/* Healthy Repos */}
        <div className="bg-bg-800 border border-slate-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded flex items-center justify-center border bg-green-500/10 border-green-500/30">
              <TrendingUp size={16} className="text-green-400" />
            </div>
            <span className="text-xs text-slate-500 uppercase">Healthy</span>
          </div>
          <div className="text-3xl font-bold text-green-400">
            {healthyRepos}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            score 80+
          </div>
        </div>

        {/* Needs Attention */}
        <div className="bg-bg-800 border border-slate-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded flex items-center justify-center border bg-orange-500/10 border-orange-500/30">
              <AlertTriangle size={16} className="text-orange-400" />
            </div>
            <span className="text-xs text-slate-500 uppercase">Attention</span>
          </div>
          <div className="text-3xl font-bold text-orange-400">
            {reposNeedingAttention}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            score below 70
          </div>
        </div>

        {/* Score Distribution */}
        <div className="bg-bg-800 border border-slate-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-slate-500 uppercase">Distribution</span>
          </div>
          <div className="flex items-end gap-1 h-10">
            {distributionData.map((d, i) => (
              <div
                key={i}
                className="flex-1 rounded-t"
                style={{
                  backgroundColor: d.color,
                  height: `${Math.max(20, (d.value / totalRepos) * 100)}%`,
                  opacity: d.value > 0 ? 1 : 0.2
                }}
                title={`${d.name}: ${d.value}`}
              />
            ))}
          </div>
          <div className="flex justify-between text-[9px] text-slate-600 mt-1">
            <span>Poor</span>
            <span>Excellent</span>
          </div>
        </div>
      </div>

      {/* Priority Repos */}
      {reposNeedingAttention > 0 && (
        <div className="bg-bg-800 border border-slate-800 p-4">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-orange-400" />
            <h3 className="text-sm font-bold text-white uppercase">Priority Repositories</h3>
            <span className="text-xs text-slate-500">
              Focus on these first
            </span>
          </div>
          <div className="space-y-2">
            {reposByPriority.slice(0, 3).map((repo) => (
              <button
                key={repo.id}
                onClick={() => onRepoClick(repo)}
                className="w-full flex items-center justify-between p-3 bg-slate-900/50 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors rounded group"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded flex items-center justify-center border font-bold ${getScoreBg(repo.lastScore)} ${getScoreColor(repo.lastScore)}`}>
                    {repo.lastScore}
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-white">{repo.name}</div>
                    <div className="text-xs text-slate-500">{repo.owner}</div>
                  </div>
                </div>
                <ArrowRight size={16} className="text-slate-600 group-hover:text-apex-500 transition-colors" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <div className="bg-bg-800 border border-slate-800 p-3">
          <Package size={16} className="mx-auto text-slate-500 mb-1" />
          <div className="text-xs text-slate-500">Avg Dependencies</div>
          <div className="text-lg font-bold text-white">~45</div>
        </div>
        <div className="bg-bg-800 border border-slate-800 p-3">
          <GitBranch size={16} className="mx-auto text-slate-500 mb-1" />
          <div className="text-xs text-slate-500">Stale Branches</div>
          <div className="text-lg font-bold text-yellow-400">~12</div>
        </div>
        <div className="bg-bg-800 border border-slate-800 p-3">
          <FileCode size={16} className="mx-auto text-slate-500 mb-1" />
          <div className="text-xs text-slate-500">Total SLOC</div>
          <div className="text-lg font-bold text-white">~180K</div>
        </div>
        <div className="bg-bg-800 border border-slate-800 p-3">
          <AlertCircle size={16} className="mx-auto text-slate-500 mb-1" />
          <div className="text-xs text-slate-500">Open Issues</div>
          <div className="text-lg font-bold text-orange-400">~28</div>
        </div>
      </div>
    </div>
  );
};

export default OrgOverview;
