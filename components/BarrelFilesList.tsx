import React from 'react';
import { Package, AlertTriangle } from 'lucide-react';
import { BridgeMetrics } from '../types';

interface BarrelFilesListProps {
  barrels: BridgeMetrics['issues']['barrelFiles'];
}

const BarrelFilesList: React.FC<BarrelFilesListProps> = ({ barrels }) => {
  if (barrels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 font-mono text-xs">
        NO BARREL FILES DETECTED
      </div>
    );
  }

  const sorted = [...barrels].sort((a, b) => {
    const riskScore = { high: 3, medium: 2, low: 1 };
    return riskScore[b.risk] - riskScore[a.risk];
  });

  return (
    <div className="h-full overflow-y-auto pr-2 space-y-2">
      {sorted.map((barrel, idx) => (
        <div 
          key={idx} 
          className={`p-3 border-l-2 ${
            barrel.risk === 'high' ? 'border-red-500 bg-red-950/10' :
            barrel.risk === 'medium' ? 'border-yellow-500 bg-yellow-950/10' :
            'border-blue-500 bg-blue-950/10'
          }`}
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2 flex-1">
              <Package size={14} className="text-slate-400 flex-shrink-0" />
              <span className="text-white text-xs font-mono break-all">
                {barrel.path}
              </span>
            </div>
            <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-bold ml-2 ${
              barrel.risk === 'high' ? 'bg-red-900 text-red-400' :
              barrel.risk === 'medium' ? 'bg-yellow-900 text-yellow-400' :
              'bg-blue-900 text-blue-400'
            }`}>
              {barrel.risk}
            </span>
          </div>
          <div className="text-slate-500 text-[10px] flex items-center gap-1">
            <AlertTriangle size={10} />
            {barrel.exports} re-exports • Impacts build performance
          </div>
        </div>
      ))}
    </div>
  );
};

export default BarrelFilesList;



