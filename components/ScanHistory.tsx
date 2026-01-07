import React, { useState, useEffect } from 'react';
import { Clock, TrendingUp, TrendingDown, Download, ChevronDown, ChevronUp } from 'lucide-react';

interface Scan {
  id: number;
  status: string;
  createdAt: string;
  score: number;
  aiScore: number;
}

interface ScanHistoryProps {
  repositoryId: number;
  onExport: (scanId: number) => void;
}

const ScanHistory: React.FC<ScanHistoryProps> = ({ repositoryId, onExport }) => {
  const [scans, setScans] = useState<Scan[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isExpanded && scans.length === 0) {
      loadHistory();
    }
  }, [isExpanded, repositoryId]);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/repositories/${repositoryId}/history`);
      if (res.ok) {
        const data = await res.json();
        setScans(data);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getScoreChange = (index: number) => {
    if (index >= scans.length - 1) return null;
    const current = scans[index].aiScore || scans[index].score || 0;
    const previous = scans[index + 1].aiScore || scans[index + 1].score || 0;
    return current - previous;
  };

  return (
    <div className="bg-bg-800 border border-slate-800 mt-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-900/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-slate-500" />
          <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">
            Scan History
          </span>
          {scans.length > 0 && (
            <span className="text-[10px] bg-slate-800 text-slate-500 px-2 py-0.5 rounded">
              {scans.length} scans
            </span>
          )}
        </div>
        {isExpanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
      </button>

      {isExpanded && (
        <div className="border-t border-slate-800 p-4">
          {isLoading ? (
            <div className="text-center py-4 text-slate-500 text-xs font-mono">
              Loading history...
            </div>
          ) : scans.length === 0 ? (
            <div className="text-center py-4 text-slate-500 text-xs font-mono">
              No completed scans yet
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
              {scans.map((scan, idx) => {
                const score = scan.aiScore || scan.score || 0;
                const change = getScoreChange(idx);
                const scoreColor = score > 80 ? 'text-green-500' : score > 50 ? 'text-yellow-500' : 'text-red-500';

                return (
                  <div 
                    key={scan.id}
                    className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-colors group"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`text-xl font-bold font-mono ${scoreColor}`}>
                        {score}
                      </div>
                      <div>
                        <div className="text-xs text-white font-mono">
                          {formatDate(scan.createdAt)}
                        </div>
                        {change !== null && change !== 0 && (
                          <div className={`text-[10px] flex items-center gap-1 ${change > 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {change > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {change > 0 ? '+' : ''}{change} from previous
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <button
                      onClick={() => onExport(scan.id)}
                      className="opacity-0 group-hover:opacity-100 p-2 text-slate-500 hover:text-apex-500 transition-all"
                      title="Export scan"
                    >
                      <Download size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ScanHistory;



