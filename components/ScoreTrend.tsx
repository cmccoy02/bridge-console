import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';

interface Scan {
  id: number;
  status: string;
  createdAt: string;
  score: number;
  aiScore: number;
}

interface ScoreTrendProps {
  repositoryId: number;
}

const ScoreTrend: React.FC<ScoreTrendProps> = ({ repositoryId }) => {
  const [scans, setScans] = useState<Scan[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [repositoryId]);

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

  if (isLoading) {
    return (
      <div className="bg-bg-800 border border-slate-800 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-slate-500" />
          <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">Score Trend</span>
        </div>
        <div className="h-32 flex items-center justify-center text-slate-500 text-xs font-mono">
          Loading...
        </div>
      </div>
    );
  }

  if (scans.length < 2) {
    return (
      <div className="bg-bg-800 border border-slate-800 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-slate-500" />
          <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">Score Trend</span>
        </div>
        <div className="h-32 flex items-center justify-center text-slate-500 text-xs font-mono">
          Need 2+ scans to show trend
        </div>
      </div>
    );
  }

  // Prepare chart data (reverse to show oldest first)
  const chartData = [...scans].reverse().map((scan, idx) => ({
    name: new Date(scan.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    score: scan.aiScore || scan.score || 0,
    fullDate: scan.createdAt
  }));

  // Calculate trend
  const latestScore = chartData[chartData.length - 1]?.score || 0;
  const firstScore = chartData[0]?.score || 0;
  const totalChange = latestScore - firstScore;
  const avgScore = Math.round(chartData.reduce((sum, d) => sum + d.score, 0) / chartData.length);

  // Recent trend (last 3 scans)
  const recentScans = chartData.slice(-3);
  const recentChange = recentScans.length >= 2
    ? recentScans[recentScans.length - 1].score - recentScans[0].score
    : 0;

  // Determine trend direction and color
  let TrendIcon = Minus;
  let trendColor = 'text-slate-400';
  let trendText = 'Stable';
  let lineColor = '#64748b'; // slate

  if (totalChange > 5) {
    TrendIcon = TrendingUp;
    trendColor = 'text-green-400';
    trendText = `+${totalChange} overall`;
    lineColor = '#10b981'; // green
  } else if (totalChange < -5) {
    TrendIcon = TrendingDown;
    trendColor = 'text-red-400';
    trendText = `${totalChange} overall`;
    lineColor = '#ef4444'; // red
  }

  // Score color for current
  const scoreColor = latestScore >= 80 ? 'text-green-400' : latestScore >= 60 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="bg-bg-800 border border-slate-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-apex-500" />
          <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">Score Trend</span>
          <span className="text-[10px] bg-slate-800 text-slate-500 px-2 py-0.5 rounded">
            {scans.length} scans
          </span>
        </div>
        <div className={`flex items-center gap-1 text-xs ${trendColor}`}>
          <TrendIcon size={14} />
          <span>{trendText}</span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex gap-6 mb-4 text-xs">
        <div>
          <span className="text-slate-500">Current:</span>
          <span className={`ml-2 font-bold ${scoreColor}`}>{latestScore}</span>
        </div>
        <div>
          <span className="text-slate-500">Average:</span>
          <span className="ml-2 font-mono text-white">{avgScore}</span>
        </div>
        <div>
          <span className="text-slate-500">First:</span>
          <span className="ml-2 font-mono text-slate-400">{firstScore}</span>
        </div>
      </div>

      {/* Chart */}
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <XAxis
              dataKey="name"
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#1e293b' }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              ticks={[0, 50, 100]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '4px',
                fontSize: '12px'
              }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(value: number) => [value, 'Score']}
            />
            <ReferenceLine y={50} stroke="#334155" strokeDasharray="3 3" />
            <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.3} />
            <Line
              type="monotone"
              dataKey="score"
              stroke={lineColor}
              strokeWidth={2}
              dot={{ fill: lineColor, strokeWidth: 0, r: 3 }}
              activeDot={{ r: 5, fill: '#ff5e00' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Insight */}
      {totalChange !== 0 && (
        <div className={`mt-3 text-xs p-2 rounded ${totalChange > 0 ? 'bg-green-950/30 text-green-400' : 'bg-red-950/30 text-red-400'}`}>
          {totalChange > 0
            ? `Health improved by ${totalChange} points since first scan`
            : `Health declined by ${Math.abs(totalChange)} points since first scan`
          }
        </div>
      )}
    </div>
  );
};

export default ScoreTrend;
