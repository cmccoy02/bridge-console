import React, { useState } from 'react';
import { Trash2, GitBranch, Package, Loader2, ExternalLink, AlertTriangle, Check, X } from 'lucide-react';

interface StaleBranch {
  name: string;
  daysSinceUpdate: number;
  status: 'dead' | 'stale' | 'active';
  lastCommitDate: string;
}

interface QuickActionsProps {
  repositoryId: number;
  repoUrl: string;
  staleBranches?: StaleBranch[];
  unusedDependencies?: string[];
  onUpdateClick?: () => void;
  onCleanupClick?: () => void;
  isUpdating?: boolean;
  isCleaningUp?: boolean;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const QuickActions: React.FC<QuickActionsProps> = ({
  repositoryId,
  repoUrl,
  staleBranches = [],
  unusedDependencies = [],
  onUpdateClick,
  onCleanupClick,
  isUpdating = false,
  isCleaningUp = false
}) => {
  const [isDeletingBranches, setIsDeletingBranches] = useState(false);
  const [branchDeleteResult, setBranchDeleteResult] = useState<{ success: boolean; message: string; deleted?: string[] } | null>(null);
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(new Set());

  const deadBranches = staleBranches.filter(b => b.status === 'dead');
  const hasQuickActions = deadBranches.length > 0 || unusedDependencies.length > 0;

  // Initialize selected branches with all dead branches
  React.useEffect(() => {
    setSelectedBranches(new Set(deadBranches.map(b => b.name)));
  }, [staleBranches]);

  const toggleBranch = (name: string) => {
    const newSelected = new Set(selectedBranches);
    if (newSelected.has(name)) {
      newSelected.delete(name);
    } else {
      newSelected.add(name);
    }
    setSelectedBranches(newSelected);
  };

  const handleDeleteBranches = async () => {
    if (selectedBranches.size === 0) return;

    setIsDeletingBranches(true);
    setBranchDeleteResult(null);

    try {
      const response = await fetch(`${API_URL}/api/repositories/${repositoryId}/branches/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ branches: Array.from(selectedBranches) })
      });

      const data = await response.json();

      if (response.ok) {
        setBranchDeleteResult({
          success: true,
          message: `Successfully deleted ${data.deleted?.length || 0} branches`,
          deleted: data.deleted
        });
        // Remove deleted branches from selection
        setSelectedBranches(prev => {
          const newSet = new Set(prev);
          (data.deleted || []).forEach((b: string) => newSet.delete(b));
          return newSet;
        });
      } else {
        setBranchDeleteResult({
          success: false,
          message: data.error || 'Failed to delete branches'
        });
      }
    } catch (err) {
      setBranchDeleteResult({
        success: false,
        message: 'Failed to connect to server'
      });
    } finally {
      setIsDeletingBranches(false);
    }
  };

  if (!hasQuickActions && !onUpdateClick) {
    return null;
  }

  return (
    <div className="bg-bg-800 border border-slate-800 p-4">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle size={16} className="text-apex-500" />
        <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">Quick Actions</span>
      </div>

      <div className="space-y-4">
        {/* Dead Branches Cleanup */}
        {deadBranches.length > 0 && (
          <div className="border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <GitBranch size={16} className="text-red-400" />
                <span className="text-sm font-medium text-white">
                  {deadBranches.length} Dead Branch{deadBranches.length !== 1 ? 'es' : ''}
                </span>
                <span className="text-[10px] text-slate-500">
                  (6+ months inactive)
                </span>
              </div>
              <button
                onClick={handleDeleteBranches}
                disabled={isDeletingBranches || selectedBranches.size === 0}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-medium rounded transition-colors"
              >
                {isDeletingBranches ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={12} />
                    Delete Selected ({selectedBranches.size})
                  </>
                )}
              </button>
            </div>

            {/* Branch Selection */}
            <div className="space-y-1 max-h-[150px] overflow-y-auto">
              {deadBranches.map((branch) => (
                <label
                  key={branch.name}
                  className="flex items-center gap-2 p-2 hover:bg-slate-900/50 rounded cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={selectedBranches.has(branch.name)}
                    onChange={() => toggleBranch(branch.name)}
                    className="rounded border-slate-600 bg-slate-800 text-apex-500 focus:ring-apex-500"
                  />
                  <span className="text-xs font-mono text-slate-300 flex-1 truncate">
                    {branch.name}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {branch.daysSinceUpdate}d ago
                  </span>
                </label>
              ))}
            </div>

            {/* Result Message */}
            {branchDeleteResult && (
              <div className={`mt-3 p-2 rounded text-xs flex items-center gap-2 ${
                branchDeleteResult.success
                  ? 'bg-green-950/30 text-green-400'
                  : 'bg-red-950/30 text-red-400'
              }`}>
                {branchDeleteResult.success ? <Check size={14} /> : <X size={14} />}
                {branchDeleteResult.message}
              </div>
            )}
          </div>
        )}

        {/* Unused Dependencies Cleanup */}
        {unusedDependencies.length > 0 && onCleanupClick && (
          <div className="border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package size={16} className="text-yellow-400" />
                <span className="text-sm font-medium text-white">
                  {unusedDependencies.length} Unused Package{unusedDependencies.length !== 1 ? 's' : ''}
                </span>
              </div>
              <button
                onClick={onCleanupClick}
                disabled={isCleaningUp}
                className="flex items-center gap-2 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-medium rounded transition-colors"
              >
                {isCleaningUp ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Creating PR...
                  </>
                ) : (
                  <>
                    <Trash2 size={12} />
                    Remove & Create PR
                  </>
                )}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {unusedDependencies.slice(0, 8).map((dep) => (
                <span key={dep} className="px-2 py-0.5 bg-slate-800 text-slate-400 text-[10px] font-mono rounded">
                  {dep}
                </span>
              ))}
              {unusedDependencies.length > 8 && (
                <span className="px-2 py-0.5 text-slate-500 text-[10px]">
                  +{unusedDependencies.length - 8} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Patch Updates */}
        {onUpdateClick && (
          <div className="border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package size={16} className="text-green-400" />
                <span className="text-sm font-medium text-white">
                  Run Safe Updates
                </span>
                <span className="text-[10px] text-slate-500">
                  (minor/patch only)
                </span>
              </div>
              <button
                onClick={onUpdateClick}
                disabled={isUpdating}
                className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-medium rounded transition-colors"
              >
                {isUpdating ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Package size={12} />
                    Update & Create PR
                  </>
                )}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Updates packages, validates with build/lint/test, then creates a PR if all checks pass.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickActions;
