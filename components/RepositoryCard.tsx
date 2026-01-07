import React from 'react';
import { GitBranch, Calendar, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

interface Repository {
  id: number;
  name: string;
  owner: string;
  repoUrl: string;
  lastScore: number;
  lastScanDate?: string;
  lastScanData?: any;
}

interface RepositoryCardProps {
  repo: Repository;
  onClick: () => void;
}

// Skeleton loader for repository cards
export const RepositoryCardSkeleton: React.FC = () => (
  <div className="w-full bg-bg-800 border-2 border-slate-800 p-6 animate-pulse">
    <div className="flex items-start justify-between mb-4">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-4 h-4 bg-slate-700 rounded" />
          <div className="h-5 w-32 bg-slate-700 rounded" />
        </div>
        <div className="h-3 w-20 bg-slate-800 rounded" />
      </div>
      <div className="w-16 h-16 rounded-full bg-slate-800 ml-4" />
    </div>
    <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-800">
      {[1, 2, 3].map((i) => (
        <div key={i} className="text-center">
          <div className="h-3 w-10 bg-slate-800 rounded mx-auto mb-2" />
          <div className="h-5 w-8 bg-slate-700 rounded mx-auto" />
        </div>
      ))}
    </div>
  </div>
);

const RepositoryCard: React.FC<RepositoryCardProps> = ({ repo, onClick }) => {
  const score = repo.lastScore || 0;
  
  // Score-based color coding
  let scoreColor = 'text-gray-500';
  let scoreBg = 'bg-gray-900/50';
  let borderColor = 'border-gray-800';
  
  if (score >= 90) {
    scoreColor = 'text-blue-500';
    scoreBg = 'bg-blue-950/30';
    borderColor = 'border-blue-500/30';
  } else if (score >= 80) {
    scoreColor = 'text-green-500';
    scoreBg = 'bg-green-950/30';
    borderColor = 'border-green-500/30';
  } else if (score >= 65) {
    scoreColor = 'text-yellow-500';
    scoreBg = 'bg-yellow-950/30';
    borderColor = 'border-yellow-500/30';
  } else if (score >= 50) {
    scoreColor = 'text-orange-500';
    scoreBg = 'bg-orange-950/30';
    borderColor = 'border-orange-500/30';
  } else if (score > 0) {
    scoreColor = 'text-red-500';
    scoreBg = 'bg-red-950/30';
    borderColor = 'border-red-500/30';
  }

  const lastScan = repo.lastScanDate ? new Date(repo.lastScanDate) : null;
  const daysSince = lastScan ? Math.floor((Date.now() - lastScan.getTime()) / (1000 * 60 * 60 * 24)) : null;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-bg-800 border-2 ${borderColor} hover:border-apex-500 transition-all duration-300 p-6 group relative overflow-hidden`}
    >
      {/* Background gradient */}
      <div className={`absolute inset-0 ${scoreBg} opacity-0 group-hover:opacity-100 transition-opacity`}></div>
      
      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <GitBranch size={16} className="text-slate-500 flex-shrink-0" />
              <h3 className="text-lg font-bold text-white truncate font-sans group-hover:text-apex-500 transition-colors">
                {repo.name}
              </h3>
            </div>
            <p className="text-xs text-slate-500 font-mono truncate">
              {repo.owner}
            </p>
          </div>

          {/* Score Badge */}
          {score > 0 ? (
            <div className={`w-16 h-16 rounded-full ${scoreBg} flex items-center justify-center border-2 ${borderColor} flex-shrink-0 ml-4`}>
              <div className="text-center">
                <div className={`text-2xl font-bold ${scoreColor}`}>{score}</div>
                <div className="text-[8px] text-slate-500 uppercase">Health</div>
              </div>
            </div>
          ) : (
            <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center border-2 border-slate-800 flex-shrink-0 ml-4">
              <AlertCircle size={24} className="text-slate-600" />
            </div>
          )}
        </div>

        {/* Metrics */}
        {repo.lastScanData && (
          <div className="grid grid-cols-3 gap-2 mb-4 pt-4 border-t border-slate-800">
            <div className="text-center">
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Issues</div>
              <div className="text-lg font-bold text-white font-mono">
                {(repo.lastScanData.issues?.circularDependencies?.length || 0) + 
                 (repo.lastScanData.issues?.barrelFiles?.length || 0) +
                 (repo.lastScanData.issues?.unusedDependencies?.length || 0)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Files</div>
              <div className="text-lg font-bold text-white font-mono">
                {repo.lastScanData.meta?.totalFiles || 0}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">SLOC</div>
              <div className="text-lg font-bold text-white font-mono">
                {repo.lastScanData.meta?.sloc ? Math.round(repo.lastScanData.meta.sloc / 1000) + 'k' : '0'}
              </div>
            </div>
          </div>
        )}

        {/* Last Scan */}
        {daysSince !== null && (
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <Calendar size={12} />
            <span>
              Last scanned {daysSince === 0 ? 'today' : `${daysSince} day${daysSince !== 1 ? 's' : ''} ago`}
            </span>
          </div>
        )}

        {/* No scan yet */}
        {!repo.lastScanDate && (
          <div className="text-xs text-slate-600 italic">
            No scans yet • Click to start first scan
          </div>
        )}
      </div>

      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-apex-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-apex-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
    </button>
  );
};

export default RepositoryCard;



