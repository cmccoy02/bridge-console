import React, { useState } from 'react';
import { GitBranch, Calendar, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { BridgeMetrics } from '../types';

interface RepoIntelProps {
  meta: BridgeMetrics['meta'];
}

const RepoIntel: React.FC<RepoIntelProps> = ({ meta }) => {
  const [showBranches, setShowBranches] = useState(false);
  
  if (!meta.languageBreakdown) return null;

  // Calculate percentages for languages
  const totalBytes = Object.values(meta.languageBreakdown).reduce((a, b) => a + b, 0);
  const languages = Object.entries(meta.languageBreakdown)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4) // Top 4
    .map(([lang, bytes]) => {
      const exactPercent = (bytes / totalBytes) * 100;
      const roundedPercent = Math.round(exactPercent);
      
      return {
        name: lang,
        percent: roundedPercent,
        displayPercent: roundedPercent === 0 && exactPercent > 0 ? '<1' : roundedPercent.toString()
      };
    });

  const staleBranches = meta.staleBranches || [];
  const deadCount = staleBranches.filter(b => b.status === 'dead').length;
  const staleCount = staleBranches.filter(b => b.status === 'stale').length;

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Top Section: Age, Branches, Languages */}
      <div className="grid grid-cols-2 gap-4">
        {/* Left: Age & Branch Count */}
        <div className="flex flex-col gap-4 justify-center">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-slate-900 border border-slate-700 text-apex-500">
                <Calendar size={18} />
             </div>
             <div>
                <div className="text-xl font-bold font-sans text-white leading-none">
                   {meta.repoAgeDays} <span className="text-xs font-mono text-slate-500">DAYS</span>
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">
                   Repo Age
                </div>
             </div>
          </div>

          <div className="flex items-center gap-3">
             <div className="p-2 bg-slate-900 border border-slate-700 text-white">
                <GitBranch size={18} />
             </div>
             <div>
                <div className="text-xl font-bold font-sans text-white leading-none flex items-center gap-2">
                   {meta.branchCount}
                   {staleBranches.length > 0 && (
                      <span className="text-[10px] bg-red-950 text-red-500 border border-red-900 px-1 py-0.5 rounded">
                         {staleBranches.length} STALE
                      </span>
                   )}
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">
                   Total Branches
                </div>
             </div>
          </div>
        </div>

        {/* Right: Language Breakdown */}
        <div className="border-l border-slate-800 pl-4 flex flex-col justify-center gap-2">
           {languages.map(l => (
              <div key={l.name} className="flex flex-col">
                 <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400 mb-1">
                    <span>{l.name}</span>
                    <span>{l.displayPercent}%</span>
                 </div>
                 <div className="w-full h-1 bg-slate-800">
                    <div 
                      className="h-full bg-apex-500" 
                      style={{ width: `${Math.max(l.percent, 1)}%`, opacity: l.name === 'TypeScript' ? 1 : 0.5 }}
                    ></div>
                 </div>
              </div>
           ))}
        </div>
      </div>

      {/* Stale Branches Section */}
      {staleBranches.length > 0 && (
        <div className="border-t border-slate-800 pt-4 flex-1 flex flex-col">
          <button 
            onClick={() => setShowBranches(!showBranches)}
            className="flex items-center justify-between w-full text-left mb-2 hover:text-white transition-colors group"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-yellow-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 group-hover:text-white">
                Stale Branches ({deadCount} dead, {staleCount} aging)
              </span>
            </div>
            {showBranches ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showBranches && (
            <div className="overflow-y-auto flex-1 space-y-1 pr-1">
              {staleBranches.slice(0, 10).map((branch, idx) => (
                <div 
                  key={idx} 
                  className={`p-2 border-l-2 text-xs font-mono ${
                    branch.status === 'dead' 
                      ? 'border-red-500 bg-red-950/10' 
                      : 'border-yellow-500 bg-yellow-950/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white font-bold truncate flex-1">
                      {branch.name}
                    </span>
                    <span className={`text-[9px] uppercase px-1 py-0.5 rounded ${
                      branch.status === 'dead' 
                        ? 'bg-red-900 text-red-400' 
                        : 'bg-yellow-900 text-yellow-400'
                    }`}>
                      {branch.status}
                    </span>
                  </div>
                  <div className="text-slate-500 text-[10px]">
                    Last update: {branch.daysSinceUpdate} days ago
                  </div>
                </div>
              ))}
              {staleBranches.length > 10 && (
                <div className="text-center text-slate-600 text-[10px] pt-2">
                  + {staleBranches.length - 10} more stale branches
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RepoIntel;