import React, { useState } from 'react';

interface Task {
  id: string;
  rank: number;
  title: string;
  description: string;
  category: string;
  impact: 'critical' | 'high' | 'medium' | 'low';
  effort: 'trivial' | 'light' | 'medium' | 'heavy' | 'major';
  consequence: string;
  command?: string;
  suggestion?: string;
  items?: string[];
}

interface ActionableTasksProps {
  tasks: Task[];
  executiveSummary?: string;
  stats?: {
    totalIssues: number;
    criticalIssues: number;
    highIssues: number;
    mediumIssues: number;
    lowIssues: number;
  };
}

const IMPACT_STYLES = {
  critical: {
    bg: 'bg-red-500/20',
    border: 'border-red-500/50',
    text: 'text-red-400',
    badge: 'bg-red-500/30 text-red-300',
    icon: '🚨'
  },
  high: {
    bg: 'bg-orange-500/20',
    border: 'border-orange-500/50',
    text: 'text-orange-400',
    badge: 'bg-orange-500/30 text-orange-300',
    icon: '⚠️'
  },
  medium: {
    bg: 'bg-yellow-500/20',
    border: 'border-yellow-500/50',
    text: 'text-yellow-400',
    badge: 'bg-yellow-500/30 text-yellow-300',
    icon: '📋'
  },
  low: {
    bg: 'bg-blue-500/20',
    border: 'border-blue-500/50',
    text: 'text-blue-400',
    badge: 'bg-blue-500/30 text-blue-300',
    icon: '💡'
  }
};

const EFFORT_LABELS: Record<string, { label: string; hours: string; color: string }> = {
  trivial: { label: 'Trivial', hours: '< 1 hour', color: 'text-green-400' },
  light: { label: 'Light', hours: '1-4 hours', color: 'text-blue-400' },
  medium: { label: 'Medium', hours: '4-16 hours', color: 'text-yellow-400' },
  heavy: { label: 'Heavy', hours: '2-5 days', color: 'text-orange-400' },
  major: { label: 'Major', hours: '1-2 weeks', color: 'text-red-400' }
};

const CATEGORY_ICONS: Record<string, string> = {
  'Dependencies': '📦',
  'Architecture': '🏗️',
  'Code Quality': '✨',
  'Testing': '🧪',
  'Documentation': '📚',
  'Security': '🔒'
};

export default function ActionableTasks({ tasks, executiveSummary, stats }: ActionableTasksProps) {
  const [filter, setFilter] = useState<string>('all');
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const filteredTasks = filter === 'all'
    ? tasks
    : tasks.filter(t => t.impact === filter);

  const handleCopyCommand = (command: string, taskId: string) => {
    navigator.clipboard.writeText(command);
    setCopiedCommand(taskId);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  if (!tasks || tasks.length === 0) {
    return (
      <div className="p-6 text-center">
        <div className="text-4xl mb-4">🎉</div>
        <h3 className="text-xl font-medium text-green-400 mb-2">No Issues Detected</h3>
        <p className="text-slate-400">Your codebase is in great shape! No actionable tasks at this time.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Executive Summary */}
      {executiveSummary && (
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <h3 className="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
            <span className="text-lg">📊</span> Executive Summary
          </h3>
          <p className="text-slate-200 leading-relaxed">{executiveSummary}</p>
        </div>
      )}

      {/* Issue Stats */}
      {stats && (
        <div className="grid grid-cols-5 gap-2">
          <div className="bg-slate-800/30 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-slate-200">{stats.totalIssues}</div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">Total</div>
          </div>
          <div className="bg-red-500/10 rounded-lg p-3 text-center border border-red-500/20">
            <div className="text-2xl font-bold text-red-400">{stats.criticalIssues}</div>
            <div className="text-xs text-red-400/70 uppercase tracking-wider">Critical</div>
          </div>
          <div className="bg-orange-500/10 rounded-lg p-3 text-center border border-orange-500/20">
            <div className="text-2xl font-bold text-orange-400">{stats.highIssues}</div>
            <div className="text-xs text-orange-400/70 uppercase tracking-wider">High</div>
          </div>
          <div className="bg-yellow-500/10 rounded-lg p-3 text-center border border-yellow-500/20">
            <div className="text-2xl font-bold text-yellow-400">{stats.mediumIssues}</div>
            <div className="text-xs text-yellow-400/70 uppercase tracking-wider">Medium</div>
          </div>
          <div className="bg-blue-500/10 rounded-lg p-3 text-center border border-blue-500/20">
            <div className="text-2xl font-bold text-blue-400">{stats.lowIssues}</div>
            <div className="text-xs text-blue-400/70 uppercase tracking-wider">Low</div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-slate-700/50 pb-3">
        {['all', 'critical', 'high', 'medium', 'low'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              filter === f
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            {f === 'all' ? 'All Tasks' : f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== 'all' && (
              <span className="ml-1.5 text-xs opacity-70">
                ({tasks.filter(t => t.impact === f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Task List */}
      <div className="space-y-3">
        {filteredTasks.map((task) => {
          const style = IMPACT_STYLES[task.impact];
          const effort = EFFORT_LABELS[task.effort];
          const isExpanded = expandedTask === task.id;

          return (
            <div
              key={task.id}
              className={`rounded-lg border ${style.border} ${style.bg} overflow-hidden transition-all`}
            >
              {/* Task Header */}
              <div
                className="p-4 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => setExpandedTask(isExpanded ? null : task.id)}
              >
                <div className="flex items-start gap-3">
                  {/* Rank */}
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-300">
                    #{task.rank}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${style.badge}`}>
                        {style.icon} {task.impact.toUpperCase()}
                      </span>
                      <span className="text-xs text-slate-500">
                        {CATEGORY_ICONS[task.category]} {task.category}
                      </span>
                    </div>
                    <h4 className="font-medium text-slate-100">{task.title}</h4>
                    <p className="text-sm text-slate-400 mt-1">{task.description}</p>
                  </div>

                  {/* Effort Badge */}
                  <div className="flex-shrink-0 text-right">
                    <div className={`text-sm font-medium ${effort.color}`}>
                      {effort.label}
                    </div>
                    <div className="text-xs text-slate-500">{effort.hours}</div>
                  </div>

                  {/* Expand Icon */}
                  <div className="flex-shrink-0 text-slate-500">
                    <svg
                      className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-0 border-t border-white/5">
                  <div className="mt-4 space-y-4">
                    {/* Consequence */}
                    <div>
                      <h5 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                        If Not Addressed
                      </h5>
                      <p className="text-sm text-red-300/80">{task.consequence}</p>
                    </div>

                    {/* Command or Suggestion */}
                    {task.command && (
                      <div>
                        <h5 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                          Action
                        </h5>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 bg-slate-900/50 px-3 py-2 rounded text-sm font-mono text-cyan-300 border border-slate-700/50">
                            {task.command}
                          </code>
                          {task.command.startsWith('npm') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyCommand(task.command!, task.id);
                              }}
                              className="px-3 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded text-sm transition-colors"
                            >
                              {copiedCommand === task.id ? '✓ Copied' : 'Copy'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {task.suggestion && (
                      <div>
                        <h5 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                          Suggestion
                        </h5>
                        <p className="text-sm text-slate-300">{task.suggestion}</p>
                      </div>
                    )}

                    {/* Items List */}
                    {task.items && task.items.length > 0 && (
                      <div>
                        <h5 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                          Affected Items ({task.items.length})
                        </h5>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {task.items.slice(0, 10).map((item, idx) => (
                            <div
                              key={idx}
                              className="text-xs font-mono text-slate-400 bg-slate-900/30 px-2 py-1 rounded"
                            >
                              {item}
                            </div>
                          ))}
                          {task.items.length > 10 && (
                            <div className="text-xs text-slate-500 italic">
                              ...and {task.items.length - 10} more
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredTasks.length === 0 && (
        <div className="text-center py-8 text-slate-500">
          No {filter} priority tasks found.
        </div>
      )}
    </div>
  );
}
