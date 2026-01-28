import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  Calendar,
  PieChart,
  BarChart3,
  Plus,
  Download,
  Settings,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  Check,
  X,
  FileText,
} from 'lucide-react';
import { LoadingIndicator, ProgressBar, Skeleton } from './LoadingIndicator';
import { CapExEntry, CapExCategory, CapExSummary } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const CATEGORY_LABELS: Record<CapExCategory, string> = {
  'new-feature': 'New Feature',
  'enhancement': 'Enhancement',
  'maintenance': 'Maintenance',
  'bug-fix': 'Bug Fix',
  'infrastructure': 'Infrastructure',
  'technical-debt': 'Technical Debt',
  'documentation': 'Documentation',
  'testing': 'Testing',
  'security': 'Security',
};

const CATEGORY_COLORS: Record<CapExCategory, string> = {
  'new-feature': 'bg-green-500',
  'enhancement': 'bg-blue-500',
  'maintenance': 'bg-yellow-500',
  'bug-fix': 'bg-red-500',
  'infrastructure': 'bg-purple-500',
  'technical-debt': 'bg-orange-500',
  'documentation': 'bg-slate-500',
  'testing': 'bg-cyan-500',
  'security': 'bg-pink-500',
};

const DEFAULT_CAPITALIZABLE: Record<CapExCategory, boolean> = {
  'new-feature': true,
  'enhancement': true,
  'maintenance': false,
  'bug-fix': false,
  'infrastructure': true,
  'technical-debt': false,
  'documentation': false,
  'testing': true,
  'security': true,
};

interface SoftwareCapitalizationProps {
  repositoryId?: number;
}

const SoftwareCapitalization: React.FC<SoftwareCapitalizationProps> = ({
  repositoryId,
}) => {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<CapExEntry[]>([]);
  const [summary, setSummary] = useState<CapExSummary | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedView, setExpandedView] = useState<'entries' | 'chart' | null>(null);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0], // Start of year
    end: new Date().toISOString().split('T')[0], // Today
  });
  const [error, setError] = useState<string | null>(null);

  // Load data
  useEffect(() => {
    loadData();
  }, [repositoryId, dateRange]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (repositoryId) params.set('repositoryId', String(repositoryId));
      if (dateRange.start) params.set('startDate', dateRange.start);
      if (dateRange.end) params.set('endDate', dateRange.end);

      const [entriesRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE}/api/capex/entries?${params}`, { credentials: 'include' }),
        fetch(`${API_BASE}/api/capex/summary?${params}`, { credentials: 'include' }),
      ]);

      if (!entriesRes.ok || !summaryRes.ok) {
        throw new Error('Failed to load CapEx data');
      }

      const entriesData = await entriesRes.json();
      const summaryData = await summaryRes.json();

      setEntries(entriesData);
      setSummary(summaryData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Calculate capitalizable percentage
  const getCapitalizationRate = () => {
    if (!summary || summary.totalHours === 0) return 0;
    return Math.round((summary.capitalizableHours / summary.totalHours) * 100);
  };

  if (loading) {
    return (
      <div className="bg-bg-800 border border-slate-800 p-6 rounded-lg">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton variant="circular" width={40} height={40} />
          <div className="flex-1">
            <Skeleton width="40%" height={20} className="mb-2" />
            <Skeleton width="60%" height={16} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Skeleton height={80} />
          <Skeleton height={80} />
          <Skeleton height={80} />
        </div>
        <Skeleton height={200} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-bg-800 border border-red-800/50 p-6 rounded-lg">
        <div className="flex items-center gap-3 text-red-400 mb-3">
          <AlertCircle size={20} />
          <span className="text-sm font-bold">Failed to Load CapEx Data</span>
        </div>
        <p className="text-xs text-slate-400 mb-4">{error}</p>
        <button
          onClick={loadData}
          className="px-3 py-1.5 text-xs bg-apex-600 hover:bg-apex-500 text-white rounded transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-bg-800 border border-slate-800 p-6 rounded-lg">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
              <DollarSign size={20} className="text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-ocr font-bold text-white uppercase">
                Software Capitalization
              </h3>
              <p className="text-xs text-slate-400">
                Track and report capitalizable development hours
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs bg-apex-600 hover:bg-apex-500 text-white rounded transition-colors"
            >
              <Plus size={14} />
              Log Time
            </button>
            <button className="p-2 hover:bg-slate-800 rounded transition-colors text-slate-500">
              <Download size={16} />
            </button>
            <button className="p-2 hover:bg-slate-800 rounded transition-colors text-slate-500">
              <Settings size={16} />
            </button>
          </div>
        </div>

        {/* Date Range */}
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-slate-500" />
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
            />
            <span className="text-slate-500">to</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
            />
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-slate-900/50 rounded-lg p-4">
            <div className="text-2xl font-bold text-white mb-1">
              {summary?.totalHours.toFixed(1) || '0'}h
            </div>
            <div className="text-xs text-slate-500">Total Hours</div>
          </div>
          <div className="bg-green-950/30 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-400 mb-1">
              {summary?.capitalizableHours.toFixed(1) || '0'}h
            </div>
            <div className="text-xs text-green-400/60">Capitalizable</div>
          </div>
          <div className="bg-red-950/30 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-400 mb-1">
              {summary?.expensedHours.toFixed(1) || '0'}h
            </div>
            <div className="text-xs text-red-400/60">Expensed</div>
          </div>
          <div className="bg-apex-950/30 rounded-lg p-4">
            <div className="text-2xl font-bold text-apex-400 mb-1">
              {getCapitalizationRate()}%
            </div>
            <div className="text-xs text-apex-400/60">Cap Rate</div>
            <ProgressBar
              progress={getCapitalizationRate()}
              size="sm"
              color="apex"
              className="mt-2"
            />
          </div>
        </div>
      </div>

      {/* By Category Breakdown */}
      <div className="bg-bg-800 border border-slate-800 rounded-lg overflow-hidden">
        <div
          className="flex items-center justify-between px-4 py-3 bg-slate-900/50 border-b border-slate-800 cursor-pointer"
          onClick={() => setExpandedView(expandedView === 'chart' ? null : 'chart')}
        >
          <div className="flex items-center gap-2">
            <PieChart size={16} className="text-apex-500" />
            <h4 className="text-sm font-bold text-slate-300">Hours by Category</h4>
          </div>
          {expandedView === 'chart' ? (
            <ChevronUp size={16} className="text-slate-500" />
          ) : (
            <ChevronDown size={16} className="text-slate-500" />
          )}
        </div>

        {(expandedView === 'chart' || !expandedView) && (
          <div className="p-4">
            <div className="space-y-3">
              {summary &&
                Object.entries(summary.byCategory).map(([category, data]) => (
                  <div key={category} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded ${CATEGORY_COLORS[category as CapExCategory]}`} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-300">
                          {CATEGORY_LABELS[category as CapExCategory] || category}
                        </span>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-slate-400">{data.hours.toFixed(1)}h</span>
                          <span className="text-green-400">
                            ({data.capitalizableHours.toFixed(1)}h cap)
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
                        <div
                          className="h-full bg-green-500/60"
                          style={{
                            width: `${
                              summary.totalHours > 0
                                ? (data.capitalizableHours / summary.totalHours) * 100
                                : 0
                            }%`,
                          }}
                        />
                        <div
                          className="h-full bg-red-500/40"
                          style={{
                            width: `${
                              summary.totalHours > 0
                                ? ((data.hours - data.capitalizableHours) / summary.totalHours) * 100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Recent Entries */}
      <div className="bg-bg-800 border border-slate-800 rounded-lg overflow-hidden">
        <div
          className="flex items-center justify-between px-4 py-3 bg-slate-900/50 border-b border-slate-800 cursor-pointer"
          onClick={() => setExpandedView(expandedView === 'entries' ? null : 'entries')}
        >
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-apex-500" />
            <h4 className="text-sm font-bold text-slate-300">
              Recent Entries ({entries.length})
            </h4>
          </div>
          {expandedView === 'entries' ? (
            <ChevronUp size={16} className="text-slate-500" />
          ) : (
            <ChevronDown size={16} className="text-slate-500" />
          )}
        </div>

        {expandedView === 'entries' && (
          <div className="max-h-[400px] overflow-y-auto">
            {entries.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <FileText size={32} className="mx-auto mb-3 opacity-50" />
                <p className="text-sm">No time entries recorded yet</p>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="mt-3 text-apex-500 hover:underline text-sm"
                >
                  Log your first entry
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {entries.slice(0, 20).map((entry) => (
                  <div key={entry.id} className="px-4 py-3 hover:bg-slate-900/30">
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded ${
                            CATEGORY_COLORS[entry.category as CapExCategory]
                          }`}
                        />
                        <span className="text-sm text-white">
                          {CATEGORY_LABELS[entry.category as CapExCategory] || entry.category}
                        </span>
                        {entry.isCapitalizable && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-green-950/50 text-green-400 rounded">
                            CAP
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-mono text-apex-400">
                        {entry.hoursSpent}h
                      </span>
                    </div>
                    {entry.description && (
                      <p className="text-xs text-slate-400 line-clamp-1 ml-4">
                        {entry.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1 ml-4 text-[10px] text-slate-500">
                      <span>{entry.date}</span>
                      {entry.ticketId && <span>#{entry.ticketId}</span>}
                      {entry.repoName && <span>{entry.repoName}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Weekly Trend */}
      {summary?.weeklyTrend && summary.weeklyTrend.length > 0 && (
        <div className="bg-bg-800 border border-slate-800 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={16} className="text-apex-500" />
            <h4 className="text-sm font-bold text-slate-300">Weekly Trend</h4>
          </div>
          <div className="flex items-end gap-1 h-24">
            {summary.weeklyTrend.map((week, idx) => {
              const maxHours = Math.max(...summary.weeklyTrend!.map((w) => w.totalHours));
              const height = maxHours > 0 ? (week.totalHours / maxHours) * 100 : 0;
              const capHeight = maxHours > 0 ? (week.capitalizableHours / maxHours) * 100 : 0;

              return (
                <div
                  key={week.week}
                  className="flex-1 flex flex-col items-center gap-1"
                  title={`Week ${week.week}: ${week.totalHours.toFixed(1)}h total, ${week.capitalizableHours.toFixed(1)}h capitalizable`}
                >
                  <div
                    className="w-full bg-slate-700 rounded-t relative overflow-hidden"
                    style={{ height: `${height}%` }}
                  >
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-green-500/60"
                      style={{ height: `${(week.capitalizableHours / week.totalHours) * 100 || 0}%` }}
                    />
                  </div>
                  <span className="text-[8px] text-slate-600">{week.week.slice(-2)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Entry Modal */}
      {showAddForm && (
        <AddEntryModal
          repositoryId={repositoryId}
          onClose={() => setShowAddForm(false)}
          onSave={() => {
            setShowAddForm(false);
            loadData();
          }}
        />
      )}
    </div>
  );
};

// Add Entry Modal Component
const AddEntryModal: React.FC<{
  repositoryId?: number;
  onClose: () => void;
  onSave: () => void;
}> = ({ repositoryId, onClose, onSave }) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    hoursSpent: '',
    category: 'new-feature' as CapExCategory,
    description: '',
    ticketId: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const isCapitalizable = DEFAULT_CAPITALIZABLE[form.category];
      const response = await fetch(`${API_BASE}/api/capex/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          repositoryId,
          date: form.date,
          hoursSpent: parseFloat(form.hoursSpent),
          category: form.category,
          isCapitalizable,
          capitalizablePercent: isCapitalizable ? 100 : 0,
          description: form.description,
          ticketId: form.ticketId || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save entry');
      }

      onSave();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-bg-800 border border-slate-700 rounded-lg w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white">Log Time Entry</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Hours</label>
              <input
                type="number"
                step="0.25"
                min="0.25"
                value={form.hoursSpent}
                onChange={(e) => setForm((prev) => ({ ...prev, hoursSpent: e.target.value }))}
                placeholder="2.5"
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Category</label>
            <select
              value={form.category}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, category: e.target.value as CapExCategory }))
              }
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white"
            >
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label} {DEFAULT_CAPITALIZABLE[value as CapExCategory] ? '(Cap)' : '(Exp)'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="What did you work on?"
              rows={2}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Ticket ID (optional)</label>
            <input
              type="text"
              value={form.ticketId}
              onChange={(e) => setForm((prev) => ({ ...prev, ticketId: e.target.value }))}
              placeholder="JIRA-123"
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-950/30 border border-red-800/50 rounded text-xs text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.hoursSpent}
              className="flex-1 px-4 py-2 bg-apex-600 hover:bg-apex-500 text-white rounded text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check size={14} />
                  Save Entry
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SoftwareCapitalization;
