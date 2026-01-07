import React from 'react';
import { AlertTriangle, CornerDownRight, AlertOctagon } from 'lucide-react';
import { BridgeMetrics } from '../types';

interface DependencyGraphProps {
  cycles: BridgeMetrics['issues']['circularDependencies'];
}

const DependencyGraph: React.FC<DependencyGraphProps> = ({ cycles }) => {
  if (cycles.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-green-500 font-mono text-xs uppercase">
        ✓ System Stable // No Circular Dependencies
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pr-2 font-mono">
      <div className="space-y-6">
        {cycles.map((item, idx) => {
          const isCritical = item.severity === 'critical';
          return (
            <div key={idx} className="relative pl-4 border-l border-slate-800">
              {/* Cycle Header */}
              <div className="flex items-center gap-2 mb-2">
                 <span className={`text-xs font-bold uppercase tracking-widest px-2 py-0.5 border ${
                    isCritical 
                      ? 'bg-red-500/10 border-red-500/20 text-red-500' 
                      : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500'
                 }`}>
                    {isCritical ? <AlertOctagon size={12} className="inline mr-1" /> : <AlertTriangle size={12} className="inline mr-1" />}
                    CYCLE_{idx + 1} // {item.severity.toUpperCase()}
                 </span>
              </div>
              
              {/* The Trace */}
              <div className="flex flex-col gap-1">
                {item.cycle.map((file, fileIdx) => (
                  <div key={fileIdx} className="relative flex items-center gap-2 group">
                     {/* Connector Line Logic */}
                     <div className="w-2 h-px bg-slate-700"></div>
                     
                     <div className={`text-xs text-slate-400 bg-black/50 border px-2 py-1 flex-1 break-all hover:text-white transition-colors ${
                        isCritical ? 'border-red-900 hover:border-red-500' : 'border-slate-800 hover:border-yellow-500'
                     }`}>
                        {file}
                     </div>
                     
                     {fileIdx === item.cycle.length - 1 && (
                        <div className={`absolute -left-4 bottom-[-10px] w-4 h-4 border-l border-b opacity-50 ${
                           isCritical ? 'border-red-500' : 'border-yellow-500'
                        }`}></div>
                     )}
                  </div>
                ))}
                
                <div className={`flex items-center gap-2 mt-1 ml-4 text-[10px] uppercase font-bold tracking-widest ${
                   isCritical ? 'text-red-500' : 'text-yellow-500'
                }`}>
                    <CornerDownRight size={12} />
                    <span>Loopback Detected • {item.cycle.length} files involved</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DependencyGraph;