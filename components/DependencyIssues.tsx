import React from 'react';
import { AlertCircle, PackageMinus, PackagePlus } from 'lucide-react';
import { BridgeMetrics } from '../types';

interface DependencyIssuesProps {
  unused: BridgeMetrics['issues']['unusedDependencies'];
  missing: BridgeMetrics['issues']['missingDependencies'];
}

const DependencyIssues: React.FC<DependencyIssuesProps> = ({ unused, missing }) => {
  const missingCount = Object.keys(missing).length;

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
          <div className="flex items-center gap-2 mb-3 text-red-500">
            <PackageMinus size={16} />
            <h4 className="text-xs font-bold uppercase tracking-wider">
              Unused Dependencies ({unused.length})
            </h4>
          </div>
          <div className="space-y-1">
            {unused.map((pkg, idx) => (
              <div 
                key={idx} 
                className="p-2 bg-red-950/20 border border-red-900/50 text-red-400 text-xs font-mono flex items-center justify-between hover:bg-red-950/30 transition-colors"
              >
                <span>{pkg}</span>
                <span className="text-[10px] text-red-600">REMOVE</span>
              </div>
            ))}
          </div>
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



