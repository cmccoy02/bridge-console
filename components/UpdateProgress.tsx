import React from 'react';
import { Loader2, GitBranch, Package, RefreshCw, GitPullRequest, CheckCircle2, Terminal, FolderSync } from 'lucide-react';

interface UpdateProgressProps {
  progress: {
    phase: string;
    step: number;
    totalSteps: number;
    percent: number;
    detail?: string;
  } | null;
  repoName?: string;
}

const phaseIcons: Record<string, React.ReactNode> = {
  'Initializing': <Loader2 className="animate-spin" size={20} />,
  'Cloning': <GitBranch size={20} />,
  'Preparing': <GitBranch size={20} />,
  'Clean install': <Package size={20} />,
  'Running npm': <RefreshCw className="animate-spin" size={20} />,
  'Committing': <Terminal size={20} />,
  'Creating': <GitPullRequest size={20} />,
};

const getPhaseIcon = (phase: string) => {
  for (const [key, icon] of Object.entries(phaseIcons)) {
    if (phase.includes(key)) return icon;
  }
  return <Loader2 className="animate-spin" size={20} />;
};

const UpdateProgress: React.FC<UpdateProgressProps> = ({ progress, repoName }) => {
  const currentPhase = progress?.phase || 'Starting...';
  const percent = progress?.percent || 0;
  const step = progress?.step || 1;
  const totalSteps = progress?.totalSteps || 8;
  const detail = progress?.detail;

  return (
    <div className="w-full bg-bg-800 border border-slate-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-green-500">
          {getPhaseIcon(currentPhase)}
          <span className="font-bold text-sm uppercase tracking-wider">Updating Dependencies</span>
        </div>
        <div className="text-slate-500 text-xs font-mono">
          Step {step}/{totalSteps}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Repo name */}
        {repoName && (
          <div className="text-white font-bold text-lg mb-4 truncate">
            {repoName}
          </div>
        )}

        {/* Phase Label */}
        <div className="text-white font-medium mb-2">
          {currentPhase}
        </div>

        {/* Detail (if provided) */}
        {detail && (
          <div className="text-slate-400 text-sm mb-4">
            {detail}
          </div>
        )}

        {/* Progress Bar */}
        <div className="relative h-2 bg-slate-700 rounded-full overflow-hidden mb-2">
          <div
            className="absolute inset-y-0 left-0 bg-green-500 transition-all duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
          {/* Animated shine effect */}
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Percent */}
        <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
          <span>{percent}% complete</span>
        </div>

        {/* Phase Steps Indicator */}
        <div className="mt-6 flex items-center justify-between">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div key={i} className="flex flex-col items-center">
              <div
                className={`
                  w-3 h-3 rounded-full transition-all duration-300
                  ${i + 1 < step ? 'bg-green-500' : ''}
                  ${i + 1 === step ? 'bg-green-500 ring-2 ring-green-500/30' : ''}
                  ${i + 1 > step ? 'bg-slate-700' : ''}
                `}
              />
            </div>
          ))}
        </div>

        {/* Phase Labels (abbreviated) */}
        <div className="mt-2 flex items-center justify-between text-[9px] text-slate-600 uppercase tracking-wider">
          <span>Init</span>
          <span>Clone</span>
          <span>Branch</span>
          <span>Clean</span>
          <span>Update</span>
          <span>Clean</span>
          <span>Push</span>
          <span>PR</span>
        </div>
      </div>

      {/* Tip */}
      <div className="bg-slate-900/50 border-t border-slate-700 px-4 py-2">
        <div className="text-[10px] text-slate-500 text-center">
          This will create a PR with minor/patch dependency updates
        </div>
      </div>
    </div>
  );
};

export default UpdateProgress;
