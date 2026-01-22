import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileCode,
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  AlertCircle,
  Bug,
  Lock,
  Database,
  Terminal,
  Code,
  Key,
} from 'lucide-react';

interface SecurityFinding {
  id?: number;
  file: string;
  line: number;
  issue: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  code: string;
  exact_match?: string;
  description: string;
  solution?: string;
  cwe: string;
  owasp?: string;
  category: string;
  context?: string[];
  language: string;
  explanation?: string;
  remediation?: string;
  references?: string[];
  priority_score?: number;
  priority?: string;
}

interface SecurityScanResult {
  success: boolean;
  repo: string;
  scan_date: string;
  duration_seconds: number;
  languages: string[];
  language_counts: Record<string, number>;
  findings: SecurityFinding[];
  fixes?: any[];
  summary: {
    status: string;
    message: string;
    risk_level: string;
    severity_counts?: Record<string, number>;
    category_counts?: Record<string, number>;
    top_issues?: any[];
  };
  stats: {
    total_findings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    files_scanned: number;
  };
}

interface SecurityFindingsProps {
  scanId?: number;
  repositoryId: number;
  repoUrl: string;
  defaultBranch?: string;
  onScanStart?: () => void;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const SecurityFindings: React.FC<SecurityFindingsProps> = ({
  scanId,
  repositoryId,
  repoUrl,
  defaultBranch = 'main',
  onScanStart,
}) => {
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentScanId, setCurrentScanId] = useState<number | null>(scanId || null);
  const [scanResult, setScanResult] = useState<SecurityScanResult | null>(null);
  const [progress, setProgress] = useState<{ step: string; percent: number; message: string } | null>(null);
  const [expandedFinding, setExpandedFinding] = useState<number | null>(null);
  const [generatingFix, setGeneratingFix] = useState<number | null>(null);
  const [fixes, setFixes] = useState<Record<number, any>>({});
  const [copiedFix, setCopiedFix] = useState<number | null>(null);

  // Poll for scan status
  useEffect(() => {
    if (!currentScanId || scanResult) return;

    const pollStatus = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/security/scan/${currentScanId}`, {
          credentials: 'include',
        });

        if (!response.ok) throw new Error('Failed to fetch scan status');

        const data = await response.json();

        if (data.status === 'completed' && data.results) {
          setScanResult(data.results);
          setScanning(false);
          setProgress(null);
        } else if (data.status === 'failed') {
          setError(data.progress?.message || 'Scan failed');
          setScanning(false);
          setProgress(null);
        } else if (data.progress) {
          setProgress(data.progress);
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    };

    if (scanning) {
      const interval = setInterval(pollStatus, 2000);
      return () => clearInterval(interval);
    }
  }, [currentScanId, scanning, scanResult]);

  // Start a new security scan
  const startScan = async (generateFixes = false) => {
    setLoading(true);
    setError(null);
    setScanResult(null);
    setProgress(null);

    try {
      const response = await fetch(`${API_BASE}/api/security/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ repositoryId, generateFixes }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start scan');
      }

      const data = await response.json();
      setCurrentScanId(data.scanId);
      setScanning(true);
      onScanStart?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Generate AI fix for a finding
  const generateFix = async (finding: SecurityFinding, index: number) => {
    setGeneratingFix(index);

    try {
      const response = await fetch(`${API_BASE}/api/security/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ finding }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate fix');
      }

      const fix = await response.json();
      setFixes((prev) => ({ ...prev, [index]: fix }));
    } catch (err: any) {
      setFixes((prev) => ({
        ...prev,
        [index]: { success: false, error: err.message },
      }));
    } finally {
      setGeneratingFix(null);
    }
  };

  // Copy fix to clipboard
  const copyFix = async (fix: any, index: number) => {
    if (!fix.solution_code) return;
    await navigator.clipboard.writeText(fix.solution_code);
    setCopiedFix(index);
    setTimeout(() => setCopiedFix(null), 2000);
  };

  // Get GitHub file URL
  const getFileUrl = (file: string, line: number) => {
    const baseUrl = repoUrl.replace('.git', '');
    return `${baseUrl}/blob/${defaultBranch}/${file}#L${line}`;
  };

  // Get severity badge styling
  const getSeverityBadge = (severity: string) => {
    const styles: Record<string, string> = {
      critical: 'bg-red-950/50 text-red-400 border border-red-800/50',
      high: 'bg-orange-950/50 text-orange-400 border border-orange-800/50',
      medium: 'bg-yellow-950/50 text-yellow-400 border border-yellow-800/50',
      low: 'bg-blue-950/50 text-blue-400 border border-blue-800/50',
    };
    return styles[severity] || 'bg-slate-800 text-slate-400';
  };

  // Get category icon
  const getCategoryIcon = (category: string) => {
    const icons: Record<string, React.ReactNode> = {
      injection: <Database size={12} />,
      'command-injection': <Terminal size={12} />,
      'code-injection': <Code size={12} />,
      authentication: <Lock size={12} />,
      cryptography: <Key size={12} />,
      secrets: <Key size={12} />,
    };
    return icons[category] || <Bug size={12} />;
  };

  // Get risk level color
  const getRiskLevelColor = (level: string) => {
    const colors: Record<string, string> = {
      critical: 'text-red-400',
      high: 'text-orange-400',
      medium: 'text-yellow-400',
      low: 'text-blue-400',
    };
    return colors[level] || 'text-slate-400';
  };

  // Render scan in progress
  if (scanning && progress) {
    return (
      <div className="bg-bg-800 border border-slate-800 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Loader2 size={20} className="text-apex-500 animate-spin" />
          <span className="text-sm font-bold text-slate-200">Security Scan in Progress</span>
        </div>
        <div className="space-y-3">
          <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-apex-600 to-apex-500 transition-all duration-500"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>{progress.message}</span>
            <span>{progress.percent}%</span>
          </div>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="bg-bg-800 border border-red-800/50 p-6">
        <div className="flex items-center gap-3 text-red-400 mb-3">
          <AlertCircle size={20} />
          <span className="text-sm font-bold">Security Scan Failed</span>
        </div>
        <p className="text-xs text-slate-400 mb-4">{error}</p>
        <button
          onClick={() => startScan()}
          className="px-3 py-1.5 text-xs bg-apex-600 hover:bg-apex-500 text-white rounded transition-colors"
        >
          Retry Scan
        </button>
      </div>
    );
  }

  // Render empty state (no scan yet)
  if (!scanResult && !loading) {
    return (
      <div className="bg-bg-800 border border-slate-800 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield size={20} className="text-slate-500" />
          <span className="text-sm font-bold text-slate-300">Security Analysis</span>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Scan this repository for security vulnerabilities including SQL injection, XSS, command injection, hardcoded secrets, and more.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => startScan(false)}
            disabled={loading}
            className="px-3 py-1.5 text-xs bg-apex-600 hover:bg-apex-500 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 size={12} className="animate-spin" />}
            Run Security Scan
          </button>
          <button
            onClick={() => startScan(true)}
            disabled={loading}
            className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Sparkles size={12} />
            Scan with AI Fixes
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="bg-bg-800 border border-slate-800 p-6">
        <div className="flex items-center justify-center gap-3 py-8">
          <Loader2 size={20} className="text-apex-500 animate-spin" />
          <span className="text-sm text-slate-400">Starting security scan...</span>
        </div>
      </div>
    );
  }

  // Render scan results
  if (!scanResult) return null;

  const { findings, summary, stats, languages } = scanResult;

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <div className="bg-bg-800 border border-slate-800 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {stats.critical > 0 ? (
              <ShieldAlert size={24} className="text-red-500" />
            ) : stats.high > 0 ? (
              <ShieldAlert size={24} className="text-orange-500" />
            ) : stats.total_findings > 0 ? (
              <Shield size={24} className="text-yellow-500" />
            ) : (
              <ShieldCheck size={24} className="text-green-500" />
            )}
            <div>
              <h3 className="text-sm font-bold text-slate-200">Security Analysis</h3>
              <p className={`text-xs ${getRiskLevelColor(summary.risk_level)}`}>
                {summary.status.replace('-', ' ').toUpperCase()} - {summary.risk_level.toUpperCase()} Risk
              </p>
            </div>
          </div>
          <button
            onClick={() => startScan()}
            className="p-2 hover:bg-slate-800 rounded transition-colors"
            title="Re-scan"
          >
            <RefreshCw size={16} className="text-slate-500" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-3 mb-4">
          <div className="bg-slate-900/50 p-2 rounded text-center">
            <div className="text-lg font-bold text-slate-200">{stats.total_findings}</div>
            <div className="text-[10px] text-slate-500">Total</div>
          </div>
          <div className="bg-red-950/30 p-2 rounded text-center">
            <div className="text-lg font-bold text-red-400">{stats.critical}</div>
            <div className="text-[10px] text-red-400/60">Critical</div>
          </div>
          <div className="bg-orange-950/30 p-2 rounded text-center">
            <div className="text-lg font-bold text-orange-400">{stats.high}</div>
            <div className="text-[10px] text-orange-400/60">High</div>
          </div>
          <div className="bg-yellow-950/30 p-2 rounded text-center">
            <div className="text-lg font-bold text-yellow-400">{stats.medium}</div>
            <div className="text-[10px] text-yellow-400/60">Medium</div>
          </div>
          <div className="bg-blue-950/30 p-2 rounded text-center">
            <div className="text-lg font-bold text-blue-400">{stats.low}</div>
            <div className="text-[10px] text-blue-400/60">Low</div>
          </div>
        </div>

        {/* Summary message */}
        <p className="text-xs text-slate-400">{summary.message}</p>

        {/* Languages scanned */}
        {languages.length > 0 && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800">
            <span className="text-[10px] text-slate-500">Languages:</span>
            {languages.map((lang) => (
              <span key={lang} className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">
                {lang}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Findings List */}
      {findings.length > 0 ? (
        <div className="bg-bg-800 border border-slate-800">
          <div className="px-4 py-3 border-b border-slate-800">
            <h4 className="text-sm font-bold text-slate-300">Security Findings</h4>
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            {findings.map((finding, idx) => (
              <div key={idx} className="border-b border-slate-800/50 last:border-0">
                {/* Finding Header */}
                <button
                  onClick={() => setExpandedFinding(expandedFinding === idx ? null : idx)}
                  className="w-full px-4 py-3 flex items-start gap-3 hover:bg-slate-900/50 transition-colors text-left"
                >
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${getSeverityBadge(finding.severity)}`}>
                    {finding.severity.toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getCategoryIcon(finding.category)}
                      <span className="text-sm text-slate-200 font-medium">
                        {finding.issue.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </span>
                      <span className="text-[10px] text-slate-600 font-mono">{finding.cwe}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <FileCode size={12} className="text-slate-500" />
                      <span className="text-slate-400 font-mono truncate">{finding.file}</span>
                      <span className="text-slate-600">:</span>
                      <span className="text-apex-500 font-mono">{finding.line}</span>
                    </div>
                  </div>
                  {expandedFinding === idx ? (
                    <ChevronUp size={16} className="text-slate-500 flex-shrink-0" />
                  ) : (
                    <ChevronDown size={16} className="text-slate-500 flex-shrink-0" />
                  )}
                </button>

                {/* Expanded Details */}
                {expandedFinding === idx && (
                  <div className="px-4 pb-4 space-y-3">
                    {/* Code snippet */}
                    <div className="bg-slate-900 rounded p-3">
                      <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-all">
                        {finding.code}
                      </pre>
                    </div>

                    {/* Description */}
                    <div>
                      <h5 className="text-xs font-bold text-slate-400 mb-1">Description</h5>
                      <p className="text-xs text-slate-300">{finding.explanation || finding.description}</p>
                    </div>

                    {/* Remediation */}
                    {finding.remediation && (
                      <div>
                        <h5 className="text-xs font-bold text-slate-400 mb-1">Recommended Fix</h5>
                        <p className="text-xs text-slate-300">{finding.remediation}</p>
                      </div>
                    )}

                    {/* Context */}
                    {finding.context && finding.context.length > 0 && (
                      <div>
                        <h5 className="text-xs font-bold text-slate-400 mb-1">Context</h5>
                        <pre className="text-[11px] text-slate-500 font-mono bg-slate-900/50 rounded p-2 overflow-x-auto">
                          {finding.context.join('\n')}
                        </pre>
                      </div>
                    )}

                    {/* AI Fix */}
                    {fixes[idx] ? (
                      <div className="bg-green-950/20 border border-green-800/30 rounded p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Sparkles size={14} className="text-green-400" />
                            <span className="text-xs font-bold text-green-400">AI-Generated Fix</span>
                          </div>
                          {fixes[idx].solution_code && (
                            <button
                              onClick={() => copyFix(fixes[idx], idx)}
                              className="p-1 hover:bg-green-800/30 rounded transition-colors"
                            >
                              {copiedFix === idx ? (
                                <Check size={14} className="text-green-400" />
                              ) : (
                                <Copy size={14} className="text-slate-400" />
                              )}
                            </button>
                          )}
                        </div>
                        {fixes[idx].success ? (
                          <>
                            {fixes[idx].solution_code && (
                              <pre className="text-xs text-slate-300 font-mono bg-slate-900/50 rounded p-2 overflow-x-auto mb-2">
                                {fixes[idx].solution_code}
                              </pre>
                            )}
                            <p className="text-xs text-slate-400">{fixes[idx].explanation}</p>
                          </>
                        ) : (
                          <p className="text-xs text-red-400">{fixes[idx].error}</p>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => generateFix(finding, idx)}
                        disabled={generatingFix === idx}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs bg-apex-600/20 hover:bg-apex-600/30 text-apex-400 rounded transition-colors disabled:opacity-50"
                      >
                        {generatingFix === idx ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />
                            Generating fix...
                          </>
                        ) : (
                          <>
                            <Sparkles size={12} />
                            Generate AI Fix
                          </>
                        )}
                      </button>
                    )}

                    {/* References and links */}
                    <div className="flex items-center gap-3 pt-2 border-t border-slate-800">
                      <a
                        href={getFileUrl(finding.file, finding.line)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-apex-500 hover:text-apex-400 transition-colors"
                      >
                        <ExternalLink size={12} />
                        View in GitHub
                      </a>
                      {finding.references && finding.references[0] && (
                        <a
                          href={finding.references[0]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-400 transition-colors"
                        >
                          <ExternalLink size={12} />
                          CWE Reference
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-bg-800 border border-green-800/30 p-6 text-center">
          <ShieldCheck size={32} className="text-green-400 mx-auto mb-3" />
          <h4 className="text-sm font-bold text-green-400 mb-1">No Vulnerabilities Found</h4>
          <p className="text-xs text-slate-500">
            This repository passed the security scan with no detected issues.
          </p>
        </div>
      )}
    </div>
  );
};

export default SecurityFindings;
