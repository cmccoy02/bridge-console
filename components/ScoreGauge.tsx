import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface ScoreGaugeProps {
  score: number;
  label: string;
  grade?: 'A' | 'B' | 'C' | 'D' | 'F';
  status?: string;
}

const ScoreGauge: React.FC<ScoreGaugeProps> = ({ score, label, grade, status }) => {
  const data = [
    { name: 'Score', value: score },
    { name: 'Remaining', value: 100 - score },
  ];

  // Color based on score/grade
  let color = '#ff5e00'; // Default Apex Orange
  let statusColor = 'text-orange-400';

  if (score >= 90) {
    color = '#3b82f6'; // Blue for excellent
    statusColor = 'text-blue-400';
  } else if (score >= 80) {
    color = '#10b981'; // Green for good
    statusColor = 'text-green-400';
  } else if (score >= 70) {
    color = '#eab308'; // Yellow for fair
    statusColor = 'text-yellow-400';
  } else if (score >= 60) {
    color = '#f97316'; // Orange for poor
    statusColor = 'text-orange-400';
  } else {
    color = '#ef4444'; // Red for critical
    statusColor = 'text-red-400';
  }

  const COLORS = [color, '#121212'];

  return (
    <div className="flex flex-col items-center justify-center h-full relative">
      <div className="w-full h-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="70%"
              startAngle={180}
              endAngle={0}
              innerRadius={65}
              outerRadius={85}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
              cornerRadius={2}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Center Text */}
      <div className="absolute top-[50%] text-center transform -translate-y-1/2 mt-6">
        <div className="flex items-baseline justify-center gap-2">
          <div className="text-5xl font-black text-white font-sans tracking-tighter shadow-glow">
              {score}
          </div>
          {grade && (
            <div className={`text-2xl font-bold ${statusColor}`}>
              {grade}
            </div>
          )}
        </div>
        <div className="text-[10px] text-slate-500 uppercase tracking-[0.2em] mt-1">
            {label}
        </div>
        {status && (
          <div className={`text-[10px] uppercase tracking-wider mt-0.5 ${statusColor}`}>
            {status}
          </div>
        )}
      </div>

      {/* Decorative Ticks */}
      <div className="absolute bottom-2 w-full flex justify-between px-12 text-[9px] text-slate-600 font-mono">
         <span>0</span>
         <span>50</span>
         <span>100</span>
      </div>
    </div>
  );
};

export default ScoreGauge;