import React, { useState } from 'react';
import { AlertCircle, PackageMinus, PackagePlus, Trash2, Check, Loader2 } from 'lucide-react';
import { BridgeMetrics } from '../types';

interface DependencyIssuesProps {
  unused: BridgeMetrics['issues']['unusedDependencies'];
  missing: BridgeMetrics['issues']['missingDependencies'];
  onRemovePackages?: (packages: string[]) => Promise<void>;
  isRemoving?: boolean;
}

const DependencyIssues: React.FC<DependencyIssuesProps> = ({
  unused,
  missing,
  onRemovePackages,
  isRemoving = false
}) => {
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set());
  const missingCount = Object.keys(missing).length;

  const togglePackage = (pkg: string) => {
    setSelectedPackages(prev => {
      const next = new Set(prev);
      if (next.has(pkg)) {
        next.delete(pkg);
      } else {
        next.add(pkg);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedPackages(new Set(unused));
  };

  const clearSelection = () => {
    setSelectedPackages(new Set());
  };

  const handleRemove = async () => {
    if (onRemovePackages && selectedPackages.size > 0) {
      await onRemovePackages(Array.from(selectedPackages));
      setSelectedPackages(new Set());
    }
  };

  if (unused.length === 0 && missingCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 font-mono text-xs">
        ALL DEPENDENCIES CLEAN
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pr-2 space-y-4">
      {/* Unused Dependencies */}
      {unused.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-red-500">
              <PackageMinus size={16} />
              <h4 className="text-xs font-bold uppercase tracking-wider">
                Unused Dependencies ({unused.length})
              </h4>
            </div>
            {onRemovePackages && (
              <div className="flex items-center gap-2">
                {selectedPackages.size > 0 ? (
                  <button
                    onClick={clearSelection}
                    className="text-[10px] text-slate-500 hover:text-white"
                  >
                    Clear
                  </button>
                ) : (
                  <button
                    onClick={selectAll}
                    className="text-[10px] text-slate-500 hover:text-white"
                  >
                    Select All
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="space-y-1">
            {unused.map((pkg, idx) => (
              <div
                key={idx}
                onClick={() => onRemovePackages && togglePackage(pkg)}
                className={`p-2 border text-xs font-mono flex items-center justify-between transition-colors ${
                  selectedPackages.has(pkg)
                    ? 'bg-red-900/40 border-red-600 text-red-300'
                    : 'bg-red-950/20 border-red-900/50 text-red-400 hover:bg-red-950/30'
                } ${onRemovePackages ? 'cursor-pointer' : ''}`}
              >
                <div className="flex items-center gap-2">
                  {onRemovePackages && (
                    <div className={`w-4 h-4 border flex items-center justify-center ${
                      selectedPackages.has(pkg)
                        ? 'bg-red-600 border-red-500'
                        : 'border-red-700'
                    }`}>
                      {selectedPackages.has(pkg) && <Check size={12} className="text-white" />}
                    </div>
                  )}
                  <span>{pkg}</span>
                </div>
                <span className="text-[10px] text-red-600">UNUSED</span>
              </div>
            ))}
          </div>

          {/* Remove action button */}
          {onRemovePackages && selectedPackages.size > 0 && (
            <button
              onClick={handleRemove}
              disabled={isRemoving}
              className="mt-3 w-full py-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
            >
              {isRemoving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Creating PR...
                </>
              ) : (
                <>
                  <Trash2 size={14} />
                  Remove {selectedPackages.size} Package{selectedPackages.size !== 1 ? 's' : ''} via PR
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Missing Dependencies */}
      {missingCount > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3 text-yellow-500">
            <PackagePlus size={16} />
            <h4 className="text-xs font-bold uppercase tracking-wider">
              Missing Dependencies ({missingCount})
            </h4>
          </div>
          <div className="space-y-2">
            {Object.entries(missing).map(([pkg, files], idx) => (
              <div 
                key={idx} 
                className="p-2 bg-yellow-950/20 border border-yellow-900/50"
              >
                <div className="text-yellow-400 text-xs font-bold font-mono mb-1">
                  {pkg}
                </div>
                <div className="text-slate-500 text-[10px]">
                  Used in {Array.isArray(files) ? files.length : 0} file(s)
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DependencyIssues;



