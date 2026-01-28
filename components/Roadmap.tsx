import React, { useState, useEffect, useMemo } from 'react';
import {
  Map,
  Target,
  Calendar,
  Flag,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  Filter,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Circle,
  XCircle,
  Pause,
  ArrowRight,
  Loader2,
  X,
  GitBranch,
  Link as LinkIcon,
  User,
  Tag,
  Import,
} from 'lucide-react';
import { LoadingIndicator, Skeleton, ProgressBar } from './LoadingIndicator';
import {
  RoadmapItem,
  RoadmapItemStatus,
  RoadmapItemPriority,
  RoadmapView,
  RoadmapMilestone,
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const STATUS_ICONS: Record<RoadmapItemStatus, React.ReactNode> = {
  planned: <Circle size={14} className="text-slate-400" />,
  'in-progress': <Loader2 size={14} className="text-blue-400 animate-spin" />,
  blocked: <Pause size={14} className="text-red-400" />,
  completed: <CheckCircle2 size={14} className="text-green-400" />,
  cancelled: <XCircle size={14} className="text-slate-500" />,
};

const STATUS_COLORS: Record<RoadmapItemStatus, string> = {
  planned: 'bg-slate-800 border-slate-700 text-slate-300',
  'in-progress': 'bg-blue-950/50 border-blue-800/50 text-blue-300',
  blocked: 'bg-red-950/50 border-red-800/50 text-red-300',
  completed: 'bg-green-950/50 border-green-800/50 text-green-300',
  cancelled: 'bg-slate-900 border-slate-800 text-slate-500',
};

const PRIORITY_COLORS: Record<RoadmapItemPriority, string> = {
  critical: 'bg-red-500 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-blue-500 text-white',
};

const PRIORITY_BORDER: Record<RoadmapItemPriority, string> = {
  critical: 'border-l-red-500',
  high: 'border-l-orange-500',
  medium: 'border-l-yellow-500',
  low: 'border-l-blue-500',
};

interface RoadmapProps {
  repositoryId?: number; // If provided, filter to this repo
}

const Roadmap: React.FC<RoadmapProps> = ({ repositoryId }) => {
  const [loading, setLoading] = useState(true);
  const [viewData, setViewData] = useState<RoadmapView | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'timeline' | 'kanban'>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<RoadmapItemStatus[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<RoadmapItemPriority[]>([]);

  useEffect(() => {
    loadRoadmap();
  }, [repositoryId]);

  const loadRoadmap = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (repositoryId) params.set('repositoryId', String(repositoryId));

      const response = await fetch(`${API_BASE}/api/roadmap/view?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to load roadmap');

      const data = await response.json();
      setViewData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter items
  const filteredItems = useMemo(() => {
    if (!viewData) return [];

    return viewData.items.filter((item) => {
      if (statusFilter.length > 0 && !statusFilter.includes(item.status)) return false;
      if (priorityFilter.length > 0 && !priorityFilter.includes(item.priority)) return false;
      return true;
    });
  }, [viewData, statusFilter, priorityFilter]);

  // Group items by status for kanban view
  const kanbanColumns = useMemo(() => {
    const columns: Record<RoadmapItemStatus, RoadmapItem[]> = {
      planned: [],
      'in-progress': [],
      blocked: [],
      completed: [],
      cancelled: [],
    };

    filteredItems.forEach((item) => {
      columns[item.status].push(item);
    });

    return columns;
  }, [filteredItems]);

  const updateItemStatus = async (itemId: number, newStatus: RoadmapItemStatus) => {
    try {
      await fetch(`${API_BASE}/api/roadmap/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      loadRoadmap();
    } catch (err) {
      console.error('Failed to update item:', err);
    }
  };

  if (loading) {
    return (
      <div className="bg-bg-800 border border-slate-800 p-6 rounded-lg">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton variant="circular" width={40} height={40} />
          <div className="flex-1">
            <Skeleton width="30%" height={20} className="mb-2" />
            <Skeleton width="50%" height={16} />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Skeleton height={60} />
          <Skeleton height={60} />
          <Skeleton height={60} />
          <Skeleton height={60} />
        </div>
        <div className="space-y-3">
          <Skeleton height={80} />
          <Skeleton height={80} />
          <Skeleton height={80} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-bg-800 border border-red-800/50 p-6 rounded-lg">
        <div className="flex items-center gap-3 text-red-400 mb-3">
          <AlertTriangle size={20} />
          <span className="text-sm font-bold">Failed to Load Roadmap</span>
        </div>
        <p className="text-xs text-slate-400 mb-4">{error}</p>
        <button
          onClick={loadRoadmap}
          className="px-3 py-1.5 text-xs bg-apex-600 hover:bg-apex-500 text-white rounded transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!viewData) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-bg-800 border border-slate-800 p-6 rounded-lg">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-apex-500/20 rounded-lg flex items-center justify-center">
              <Map size={20} className="text-apex-400" />
            </div>
            <div>
              <h3 className="text-lg font-ocr font-bold text-white uppercase">
                {repositoryId ? 'Repository Roadmap' : 'Organization Roadmap'}
              </h3>
              <p className="text-xs text-slate-400">
                Plan and track tasks across {repositoryId ? 'this repository' : 'all repositories'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs bg-apex-600 hover:bg-apex-500 text-white rounded transition-colors"
            >
              <Plus size={14} />
              Add Item
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded transition-colors ${
                showFilters ? 'bg-apex-500/20 text-apex-400' : 'hover:bg-slate-800 text-slate-500'
              }`}
            >
              <Filter size={16} />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-3 mb-4">
          <div className="bg-slate-900/50 rounded p-3 text-center">
            <div className="text-xl font-bold text-white">{viewData.stats.totalItems}</div>
            <div className="text-[10px] text-slate-500">Total</div>
          </div>
          <div className="bg-blue-950/30 rounded p-3 text-center">
            <div className="text-xl font-bold text-blue-400">
              {viewData.stats.byStatus['in-progress'] || 0}
            </div>
            <div className="text-[10px] text-blue-400/60">In Progress</div>
          </div>
          <div className="bg-red-950/30 rounded p-3 text-center">
            <div className="text-xl font-bold text-red-400">{viewData.stats.overdueCount}</div>
            <div className="text-[10px] text-red-400/60">Overdue</div>
          </div>
          <div className="bg-yellow-950/30 rounded p-3 text-center">
            <div className="text-xl font-bold text-yellow-400">{viewData.stats.upcomingCount}</div>
            <div className="text-[10px] text-yellow-400/60">Due Soon</div>
          </div>
          <div className="bg-green-950/30 rounded p-3 text-center">
            <div className="text-xl font-bold text-green-400">
              {viewData.stats.byStatus.completed || 0}
            </div>
            <div className="text-[10px] text-green-400/60">Completed</div>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-2 border-t border-slate-800 pt-4">
          {(['list', 'kanban', 'timeline'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 text-xs font-bold uppercase rounded transition-colors ${
                viewMode === mode
                  ? 'bg-apex-500 text-black'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-slate-800 animate-fade-in-subtle">
            <div className="flex flex-wrap gap-4">
              <div>
                <label className="block text-[10px] text-slate-500 uppercase mb-2">Status</label>
                <div className="flex gap-1">
                  {(['planned', 'in-progress', 'blocked', 'completed'] as RoadmapItemStatus[]).map(
                    (status) => (
                      <button
                        key={status}
                        onClick={() =>
                          setStatusFilter((prev) =>
                            prev.includes(status)
                              ? prev.filter((s) => s !== status)
                              : [...prev, status]
                          )
                        }
                        className={`px-2 py-1 text-[10px] rounded transition-colors ${
                          statusFilter.includes(status)
                            ? STATUS_COLORS[status]
                            : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {status}
                      </button>
                    )
                  )}
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 uppercase mb-2">Priority</label>
                <div className="flex gap-1">
                  {(['critical', 'high', 'medium', 'low'] as RoadmapItemPriority[]).map(
                    (priority) => (
                      <button
                        key={priority}
                        onClick={() =>
                          setPriorityFilter((prev) =>
                            prev.includes(priority)
                              ? prev.filter((p) => p !== priority)
                              : [...prev, priority]
                          )
                        }
                        className={`px-2 py-1 text-[10px] rounded transition-colors ${
                          priorityFilter.includes(priority)
                            ? PRIORITY_COLORS[priority]
                            : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {priority}
                      </button>
                    )
                  )}
                </div>
              </div>
              {(statusFilter.length > 0 || priorityFilter.length > 0) && (
                <button
                  onClick={() => {
                    setStatusFilter([]);
                    setPriorityFilter([]);
                  }}
                  className="text-xs text-slate-500 hover:text-white self-end"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* List View */}
      {viewMode === 'list' && (
        <div className="bg-bg-800 border border-slate-800 rounded-lg overflow-hidden">
          {filteredItems.length === 0 ? (
            <div className="p-12 text-center">
              <Target size={48} className="mx-auto mb-4 text-slate-700" />
              <h4 className="text-lg font-bold text-slate-400 mb-2">No items yet</h4>
              <p className="text-sm text-slate-500 mb-4">
                Add items to your roadmap to track priorities across repositories
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 text-sm bg-apex-600 hover:bg-apex-500 text-white rounded transition-colors"
              >
                Add First Item
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {filteredItems.map((item) => (
                <RoadmapItemRow
                  key={item.id}
                  item={item}
                  expanded={expandedItem === item.id}
                  onToggle={() => setExpandedItem(expandedItem === item.id ? null : item.id!)}
                  onStatusChange={(status) => updateItemStatus(item.id!, status)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Kanban View */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-4 gap-4">
          {(['planned', 'in-progress', 'blocked', 'completed'] as RoadmapItemStatus[]).map(
            (status) => (
              <div key={status} className="bg-bg-800 border border-slate-800 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-slate-900/50 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    {STATUS_ICONS[status]}
                    <span className="text-xs font-bold text-slate-300 uppercase">{status}</span>
                    <span className="text-xs text-slate-600 ml-auto">
                      {kanbanColumns[status].length}
                    </span>
                  </div>
                </div>
                <div className="p-2 space-y-2 max-h-[500px] overflow-y-auto">
                  {kanbanColumns[status].map((item) => (
                    <div
                      key={item.id}
                      className={`p-3 rounded border-l-2 bg-slate-900/50 ${PRIORITY_BORDER[item.priority]}`}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <span className="text-xs font-medium text-white line-clamp-2">
                          {item.title}
                        </span>
                        <span
                          className={`text-[8px] px-1 py-0.5 rounded ${PRIORITY_COLORS[item.priority]}`}
                        >
                          {item.priority[0].toUpperCase()}
                        </span>
                      </div>
                      {item.targetDate && (
                        <div className="flex items-center gap-1 text-[10px] text-slate-500">
                          <Calendar size={10} />
                          {item.targetDate}
                        </div>
                      )}
                      {item.repoName && (
                        <div className="text-[10px] text-slate-600 mt-1">{item.repoName}</div>
                      )}
                    </div>
                  ))}
                  {kanbanColumns[status].length === 0 && (
                    <div className="text-xs text-slate-600 text-center py-4">No items</div>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Timeline View */}
      {viewMode === 'timeline' && (
        <div className="bg-bg-800 border border-slate-800 rounded-lg p-4">
          {viewData.timeline.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Calendar size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No dated items to display</p>
            </div>
          ) : (
            <div className="space-y-6">
              {viewData.timeline.map((week, idx) => (
                <div key={week.date} className="relative">
                  {/* Timeline line */}
                  {idx < viewData.timeline.length - 1 && (
                    <div className="absolute left-3 top-8 bottom-0 w-px bg-slate-800" />
                  )}

                  {/* Week header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-6 h-6 rounded-full bg-apex-500/20 border border-apex-500/50 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-apex-500" />
                    </div>
                    <span className="text-sm font-bold text-white">
                      Week of {new Date(week.date).toLocaleDateString()}
                    </span>
                    <span className="text-xs text-slate-500">
                      {week.items.length} items
                    </span>
                  </div>

                  {/* Items */}
                  <div className="ml-9 space-y-2">
                    {week.milestones.map((ms) => (
                      <div
                        key={ms.id}
                        className="p-3 bg-purple-950/30 border border-purple-800/30 rounded-lg flex items-center gap-3"
                      >
                        <Flag size={14} className="text-purple-400" />
                        <span className="text-sm font-medium text-purple-300">{ms.title}</span>
                        <span className="text-xs text-purple-500 ml-auto">{ms.targetDate}</span>
                      </div>
                    ))}
                    {week.items.map((item) => (
                      <div
                        key={item.id}
                        className={`p-3 rounded-lg border ${STATUS_COLORS[item.status]}`}
                      >
                        <div className="flex items-center gap-2">
                          {STATUS_ICONS[item.status]}
                          <span className="text-sm font-medium flex-1">{item.title}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              PRIORITY_COLORS[item.priority]
                            }`}
                          >
                            {item.priority}
                          </span>
                        </div>
                        {item.repoName && (
                          <div className="text-[10px] text-slate-500 mt-1 ml-6">
                            {item.repoName}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Item Modal */}
      {showAddModal && (
        <AddItemModal
          repositoryId={repositoryId}
          onClose={() => setShowAddModal(false)}
          onSave={() => {
            setShowAddModal(false);
            loadRoadmap();
          }}
        />
      )}
    </div>
  );
};

// Roadmap Item Row Component
const RoadmapItemRow: React.FC<{
  item: RoadmapItem;
  expanded: boolean;
  onToggle: () => void;
  onStatusChange: (status: RoadmapItemStatus) => void;
}> = ({ item, expanded, onToggle, onStatusChange }) => {
  const isOverdue =
    item.targetDate &&
    item.status !== 'completed' &&
    item.status !== 'cancelled' &&
    new Date(item.targetDate) < new Date();

  return (
    <div className={`${expanded ? 'bg-slate-900/30' : ''}`}>
      <div
        className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-900/20"
        onClick={onToggle}
      >
        {STATUS_ICONS[item.status]}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">{item.title}</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_COLORS[item.priority]}`}
            >
              {item.priority}
            </span>
            {item.source !== 'manual' && (
              <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">
                {item.source}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
            {item.repoName && (
              <span className="flex items-center gap-1">
                <GitBranch size={10} />
                {item.repoName}
              </span>
            )}
            {item.targetDate && (
              <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-400' : ''}`}>
                <Calendar size={10} />
                {item.targetDate}
                {isOverdue && <AlertTriangle size={10} />}
              </span>
            )}
            {item.assignee && (
              <span className="flex items-center gap-1">
                <User size={10} />
                {item.assignee}
              </span>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronUp size={16} className="text-slate-500" />
        ) : (
          <ChevronDown size={16} className="text-slate-500" />
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-slate-800/50 animate-fade-in-subtle">
          {item.description && (
            <p className="text-xs text-slate-400 mb-3">{item.description}</p>
          )}

          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] text-slate-500 uppercase">Status:</span>
            {(['planned', 'in-progress', 'blocked', 'completed'] as RoadmapItemStatus[]).map(
              (status) => (
                <button
                  key={status}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(status);
                  }}
                  className={`px-2 py-1 text-[10px] rounded transition-colors ${
                    item.status === status ? STATUS_COLORS[status] : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                  }`}
                >
                  {status}
                </button>
              )
            )}
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-500">
            {item.sourceUrl && (
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-apex-400"
                onClick={(e) => e.stopPropagation()}
              >
                <LinkIcon size={12} />
                Source
              </a>
            )}
            {item.estimatedHours && (
              <span className="flex items-center gap-1">
                <Clock size={12} />
                Est: {item.estimatedHours}h
              </span>
            )}
            {item.tags && item.tags.length > 0 && (
              <span className="flex items-center gap-1">
                <Tag size={12} />
                {item.tags.join(', ')}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Add Item Modal
const AddItemModal: React.FC<{
  repositoryId?: number;
  onClose: () => void;
  onSave: () => void;
}> = ({ repositoryId, onClose, onSave }) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'medium' as RoadmapItemPriority,
    targetDate: '',
    category: '',
    estimatedHours: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/roadmap/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          repositoryId: repositoryId || undefined,
          title: form.title,
          description: form.description || undefined,
          priority: form.priority,
          targetDate: form.targetDate || undefined,
          category: form.category || undefined,
          estimatedHours: form.estimatedHours ? parseFloat(form.estimatedHours) : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create item');
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
          <h3 className="text-lg font-bold text-white">Add Roadmap Item</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="What needs to be done?"
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Additional details..."
              rows={2}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    priority: e.target.value as RoadmapItemPriority,
                  }))
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white"
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Target Date</label>
              <input
                type="date"
                value={form.targetDate}
                onChange={(e) => setForm((prev) => ({ ...prev, targetDate: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Category</label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                placeholder="e.g., security"
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Est. Hours</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={form.estimatedHours}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, estimatedHours: e.target.value }))
                }
                placeholder="4"
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white"
              />
            </div>
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
              disabled={saving || !form.title}
              className="flex-1 px-4 py-2 bg-apex-600 hover:bg-apex-500 text-white rounded text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus size={14} />
                  Create Item
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Roadmap;
