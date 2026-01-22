import React, { useState } from 'react';
import { AlertCircle, ArrowUp, ChevronDown, ChevronRight, AlertTriangle, Link, Zap, Package, Copy, Check, ExternalLink } from 'lucide-react';
import { BridgeMetrics, EnhancedOutdatedDependency, DependencyAnalysisSummary } from '../types';

// Hook for copy to clipboard with feedback
const useCopyToClipboard = () => {
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      setTimeout(() => setCopiedText(null), 2000);
      return true;
    } catch (err) {
      console.error('Failed to copy:', err);
      return false;
    }
  };

  return { copy, copiedText };
};

interface TriageListProps {
  outdated: BridgeMetrics['issues']['outdatedDependencies'];
  enhanced?: EnhancedOutdatedDependency[];
  analysis?: DependencyAnalysisSummary;
}

const PriorityBadge: React.FC<{ priority: string }> = ({ priority }) => {
  const styles = {
    critical: 'bg-red-950/30 text-red-400 border-red-800',
    high: 'bg-orange-950/30 text-orange-400 border-orange-800',
    medium: 'bg-yellow-950/30 text-yellow-400 border-yellow-800',
    low: 'bg-slate-800/30 text-slate-400 border-slate-700'
  };

  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase border rounded ${styles[priority as keyof typeof styles] || styles.low}`}>
      {priority}
    </span>
  );
};

const CategoryBadge: React.FC<{ category: string }> = ({ category }) => {
  const labels: Record<string, string> = {
    'core-framework': 'CORE',
    'build-tool': 'BUILD',
    'testing': 'TEST',
    'type-definitions': 'TYPES',
    'utility': 'UTIL',
    'other': 'OTHER'
  };

  return (
    <span className="px-1 py-0.5 text-[9px] font-medium uppercase bg-slate-800/50 text-slate-500 border border-slate-700 rounded">
      {labels[category] || category}
    </span>
  );
};

const LanguageBadge: React.FC<{ language?: string; packageManager?: string }> = ({ language, packageManager }) => {
  if (!language || language === 'JavaScript') return null;

  const styles: Record<string, string> = {
    'Python': 'bg-blue-950/30 text-blue-400 border-blue-800',
    'Ruby': 'bg-red-950/30 text-red-400 border-red-800',
    'Elixir': 'bg-purple-950/30 text-purple-400 border-purple-800',
    'Rust': 'bg-orange-950/30 text-orange-400 border-orange-800',
    'Go': 'bg-cyan-950/30 text-cyan-400 border-cyan-800'
  };

  const icons: Record<string, string> = {
    'Python': '🐍',
    'Ruby': '💎',
    'Elixir': '💧',
    'Rust': '🦀',
    'Go': '🐹'
  };

  return (
    <span className={`px-1 py-0.5 text-[9px] font-medium uppercase border rounded flex items-center gap-0.5 ${styles[language] || 'bg-slate-800/50 text-slate-500 border-slate-700'}`}>
      <span className="text-[8px]">{icons[language]}</span>
      {packageManager || language}
    </span>
  );
};

// Get package registry URL based on language
const getPackageUrl = (pkgName: string, language?: string, packageManager?: string): string => {
  if (!language || language === 'JavaScript') {
    return `https://www.npmjs.com/package/${pkgName}`;
  }

  switch (language) {
    case 'Python':
      return `https://pypi.org/project/${pkgName}`;
    case 'Ruby':
      return `https://rubygems.org/gems/${pkgName}`;
    case 'Elixir':
      return `https://hex.pm/packages/${pkgName}`;
    case 'Rust':
      return `https://crates.io/crates/${pkgName}`;
    case 'Go':
      return `https://pkg.go.dev/${pkgName}`;
    default:
      return `https://www.npmjs.com/package/${pkgName}`;
  }
};

// Get registry label based on language
const getRegistryLabel = (language?: string): string => {
  if (!language || language === 'JavaScript') return 'npm';

  const labels: Record<string, string> = {
    'Python': 'PyPI',
    'Ruby': 'RubyGems',
    'Elixir': 'Hex',
    'Rust': 'Crates.io',
    'Go': 'pkg.go.dev'
  };

  return labels[language] || 'npm';
};

const VersionDistance: React.FC<{ distance: EnhancedOutdatedDependency['versionDistance'] }> = ({ distance }) => {
  const { major, minor, patch } = distance;

  return (
    <div className="flex gap-1 text-[10px]">
      {major > 0 && <span className="text-red-400">{major}M</span>}
      {minor > 0 && <span className="text-yellow-400">{minor}m</span>}
      {patch > 0 && <span className="text-blue-400">{patch}p</span>}
      {major === 0 && minor === 0 && patch === 0 && <span className="text-green-400">current</span>}
    </div>
  );
};

const TriageList: React.FC<TriageListProps> = ({ outdated, enhanced, analysis }) => {
  const [expandedPkg, setExpandedPkg] = useState<string | null>(null);
  const [showUpgradePaths, setShowUpgradePaths] = useState(false);
  const { copy, copiedText } = useCopyToClipboard();

  // Use enhanced data if available, otherwise fall back to basic
  const useEnhanced = enhanced && enhanced.length > 0;

  // Generate install command for a package
  const getInstallCommand = (pkgName: string, version: string) => {
    return `npm install ${pkgName}@${version}`;
  };

  // Generate bulk install command for a list of packages
  const getBulkInstallCommand = (packages: Array<{ package: string; latest: string }>) => {
    return `npm install ${packages.map(p => `${p.package}@${p.latest}`).join(' ')}`;
  };

  if (outdated.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 font-mono text-xs">
        ALL PACKAGES OPTIMIZED
      </div>
    );
  }

  // Enhanced view with full prioritization
  if (useEnhanced && analysis) {
    return (
      <div className="h-full overflow-y-auto pr-1 font-mono text-xs">
        {/* Summary Header */}
        <div className="sticky top-0 z-20 bg-slate-900 border-b border-slate-700 p-3 mb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 uppercase tracking-wider text-[10px]">Dependency Analysis</span>
            <div className="flex gap-2">
              {analysis.criticalCount > 0 && (
                <span className="px-1.5 py-0.5 bg-red-950/30 text-red-400 border border-red-800 rounded text-[10px]">
                  {analysis.criticalCount} CRITICAL
                </span>
              )}
              {analysis.deprecatedCount > 0 && (
                <span className="px-1.5 py-0.5 bg-orange-950/30 text-orange-400 border border-orange-800 rounded text-[10px]">
                  {analysis.deprecatedCount} DEPRECATED
                </span>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-red-950/20 border border-red-900/30 rounded p-1">
              <div className="text-red-400 font-bold">{analysis.criticalCount}</div>
              <div className="text-[9px] text-slate-500">Critical</div>
            </div>
            <div className="bg-orange-950/20 border border-orange-900/30 rounded p-1">
              <div className="text-orange-400 font-bold">{analysis.highCount}</div>
              <div className="text-[9px] text-slate-500">High</div>
            </div>
            <div className="bg-yellow-950/20 border border-yellow-900/30 rounded p-1">
              <div className="text-yellow-400 font-bold">{analysis.mediumCount}</div>
              <div className="text-[9px] text-slate-500">Medium</div>
            </div>
            <div className="bg-slate-800/20 border border-slate-700/30 rounded p-1">
              <div className="text-slate-400 font-bold">{analysis.lowCount}</div>
              <div className="text-[9px] text-slate-500">Low</div>
            </div>
          </div>

          {/* Quick Wins */}
          {analysis.quickWins && analysis.quickWins.length > 0 && (
            <div className="mt-2 p-2 bg-green-950/20 border border-green-900/30 rounded">
              <div className="flex items-center gap-1 text-green-400 text-[10px] mb-1">
                <Zap size={10} />
                <span className="uppercase tracking-wider">Quick Wins</span>
              </div>
              <div className="text-slate-300 text-[10px]">
                {analysis.quickWins.join(', ')}
              </div>
            </div>
          )}

          {/* Upgrade Paths Toggle */}
          {analysis.upgradePaths && analysis.upgradePaths.length > 0 && (
            <button
              onClick={() => setShowUpgradePaths(!showUpgradePaths)}
              className="mt-2 w-full flex items-center justify-between p-2 bg-apex-500/10 border border-apex-500/30 rounded hover:bg-apex-500/20 transition-colors"
            >
              <span className="text-apex-500 text-[10px] uppercase tracking-wider flex items-center gap-1">
                <Package size={10} />
                Suggested Upgrade Order ({analysis.upgradePaths.length} steps)
              </span>
              {showUpgradePaths ? <ChevronDown size={12} className="text-apex-500" /> : <ChevronRight size={12} className="text-apex-500" />}
            </button>
          )}
        </div>

        {/* Upgrade Paths Expanded - OUTSIDE sticky header so scroll works properly */}
        {showUpgradePaths && analysis.upgradePaths && (
          <div className="space-y-2 mb-4 px-3 pb-2">
            {analysis.upgradePaths.map((path, idx) => {
              // Find enhanced packages for this path to get latest versions
              const pathPackages = path.packages
                .map(pkgName => enhanced?.find(p => p.package === pkgName))
                .filter((p): p is EnhancedOutdatedDependency => p !== undefined);
              const installCmd = getBulkInstallCommand(pathPackages);

              return (
                <div key={idx} className="p-2 bg-slate-800/50 border border-slate-700 rounded">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-apex-500 font-bold">Step {path.order}</span>
                    <div className="flex gap-1">
                      <span className={`px-1 py-0.5 text-[9px] rounded ${
                        path.riskLevel === 'breaking' ? 'bg-red-950/30 text-red-400' :
                        path.riskLevel === 'review' ? 'bg-yellow-950/30 text-yellow-400' :
                        'bg-green-950/30 text-green-400'
                      }`}>
                        {path.riskLevel.toUpperCase()}
                      </span>
                      <span className={`px-1 py-0.5 text-[9px] rounded ${
                        path.effort === 'high' ? 'bg-red-950/30 text-red-400' :
                        path.effort === 'medium' ? 'bg-yellow-950/30 text-yellow-400' :
                        'bg-green-950/30 text-green-400'
                      }`}>
                        {path.effort.toUpperCase()} EFFORT
                      </span>
                    </div>
                  </div>
                  <div className="text-slate-300 text-[10px] mb-1">{path.reason}</div>
                  <div className="text-white text-[10px] mb-2">{path.packages.join(', ')}</div>
                  
                  {/* Copy command for this step */}
                  {pathPackages.length > 0 && (
                    <button
                      onClick={() => copy(installCmd)}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors w-full justify-center ${
                        copiedText === installCmd
                          ? 'bg-green-950/30 text-green-400 border border-green-800'
                          : 'bg-slate-900 text-slate-400 border border-slate-700 hover:border-apex-500 hover:text-apex-500'
                      }`}
                    >
                      {copiedText === installCmd ? (
                        <>
                          <Check size={10} />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={10} />
                          Copy: npm install {path.packages.length} package{path.packages.length > 1 ? 's' : ''}
                        </>
                      )}
                    </button>
                  )}
                  
                  {path.unlocks && path.unlocks.length > 0 && (
                    <div className="text-slate-500 text-[9px] mt-2">
                      Unlocks: {path.unlocks.join(', ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Package List */}
        <div className="space-y-1">
          {enhanced.map((pkg, idx) => (
            <div key={idx} className="bg-slate-800/30 border border-slate-700/50 rounded hover:border-slate-600 transition-colors">
              {/* Main Row */}
              <div
                className="p-2 cursor-pointer flex items-center gap-2"
                onClick={() => setExpandedPkg(expandedPkg === pkg.package ? null : pkg.package)}
              >
                {expandedPkg === pkg.package ? <ChevronDown size={12} className="text-slate-500" /> : <ChevronRight size={12} className="text-slate-500" />}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold truncate">{pkg.package}</span>
                    {pkg.isDeprecated && (
                      <span className="flex items-center gap-0.5 text-orange-400 text-[9px]">
                        <AlertTriangle size={10} />
                        DEPRECATED
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-slate-500 text-[10px]">
                    <span>{pkg.current}</span>
                    <ArrowUp size={8} className="text-apex-500" />
                    <span className="text-apex-500">{pkg.latest}</span>
                    <VersionDistance distance={pkg.versionDistance} />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <CategoryBadge category={pkg.category} />
                  <PriorityBadge priority={pkg.priority} />
                </div>
              </div>

              {/* Expanded Details */}
              {expandedPkg === pkg.package && (
                <div className="px-3 pb-2 border-t border-slate-700/50 pt-2 space-y-2">
                  {/* Quick Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copy(getInstallCommand(pkg.package, pkg.latest));
                      }}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
                        copiedText === getInstallCommand(pkg.package, pkg.latest)
                          ? 'bg-green-950/30 text-green-400 border border-green-800'
                          : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-500'
                      }`}
                    >
                      {copiedText === getInstallCommand(pkg.package, pkg.latest) ? (
                        <>
                          <Check size={10} />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={10} />
                          Copy install command
                        </>
                      )}
                    </button>
                    <a
                      href={`https://www.npmjs.com/package/${pkg.package}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-500 hover:text-white transition-colors"
                    >
                      <ExternalLink size={10} />
                      npm
                    </a>
                  </div>

                  {/* Priority Reasons */}
                  {pkg.priorityReasons && pkg.priorityReasons.length > 0 && (
                    <div>
                      <div className="text-slate-500 text-[9px] uppercase mb-1">Why this priority:</div>
                      <ul className="text-slate-400 text-[10px] list-disc list-inside">
                        {pkg.priorityReasons.map((reason, i) => (
                          <li key={i}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Deprecation Message */}
                  {pkg.deprecationMessage && (
                    <div className="p-2 bg-orange-950/20 border border-orange-900/30 rounded">
                      <div className="text-orange-400 text-[9px] uppercase mb-1">Deprecation Notice:</div>
                      <div className="text-slate-300 text-[10px]">{pkg.deprecationMessage}</div>
                    </div>
                  )}

                  {/* Peer Dependencies */}
                  {pkg.peerDependencies && pkg.peerDependencies.length > 0 && (
                    <div>
                      <div className="text-slate-500 text-[9px] uppercase mb-1 flex items-center gap-1">
                        <Link size={10} />
                        Upgrade Together:
                      </div>
                      <div className="text-apex-500 text-[10px]">{pkg.peerDependencies.join(', ')}</div>
                    </div>
                  )}

                  {/* Blocking Relationships */}
                  {pkg.blockedBy && pkg.blockedBy.length > 0 && (
                    <div className="p-2 bg-red-950/20 border border-red-900/30 rounded">
                      <div className="text-red-400 text-[9px] uppercase mb-1">Blocked by:</div>
                      <div className="text-slate-300 text-[10px]">{pkg.blockedBy.join(', ')}</div>
                    </div>
                  )}

                  {pkg.blocks && pkg.blocks.length > 0 && (
                    <div className="p-2 bg-green-950/20 border border-green-900/30 rounded">
                      <div className="text-green-400 text-[9px] uppercase mb-1">Upgrading this unlocks:</div>
                      <div className="text-slate-300 text-[10px]">{pkg.blocks.join(', ')}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Legacy view (fallback when enhanced data not available)
  const priorityOrder = [
    'react', 'vue', 'angular', 'svelte',
    'react-dom', 'vue-router', 'react-router', 'react-router-dom',
    'next', 'nuxt', 'gatsby', 'vite', 'webpack',
    'typescript', '@types/react', '@types/node',
    'eslint', 'prettier', 'jest', 'vitest'
  ];

  const sorted = [...outdated].sort((a, b) => {
    const severityScore = { High: 3, Medium: 2, Low: 1 };
    const severityDiff = severityScore[b.severity] - severityScore[a.severity];
    if (severityDiff !== 0) return severityDiff;

    const aPriority = priorityOrder.indexOf(a.package);
    const bPriority = priorityOrder.indexOf(b.package);

    if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
    if (aPriority !== -1) return -1;
    if (bPriority !== -1) return 1;

    return a.package.localeCompare(b.package);
  });

  return (
    <div className="h-full overflow-y-auto pr-1">
      <table className="w-full text-left border-collapse font-mono text-xs">
        <thead className="bg-slate-900 text-slate-500 sticky top-0 z-10">
          <tr>
            <th className="p-2 border-b border-slate-700 uppercase tracking-wider">Pkg</th>
            <th className="p-2 border-b border-slate-700 uppercase tracking-wider">Ver</th>
            <th className="p-2 border-b border-slate-700 uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {sorted.map((pkg, idx) => (
            <tr key={idx} className="hover:bg-slate-800/30 transition-colors group">
              <td className="p-2 text-white font-bold">
                <div className="flex items-center gap-2">
                  {pkg.package}
                  <LanguageBadge language={pkg.language} packageManager={pkg.packageManager} />
                </div>
              </td>
              <td className="p-2 text-slate-400">
                <div className="flex flex-col">
                   <span className="opacity-60">{pkg.current}</span>
                   <span className="text-apex-500 flex items-center gap-1">
                      <ArrowUp size={10} /> {pkg.latest}
                   </span>
                </div>
              </td>
              <td className="p-2">
                <span className={`
                  px-1 py-0.5 text-[10px] font-bold uppercase border
                  ${pkg.severity === 'High' ? 'bg-red-950/20 text-red-500 border-red-900' : ''}
                  ${pkg.severity === 'Medium' ? 'bg-yellow-950/20 text-yellow-500 border-yellow-900' : ''}
                  ${pkg.severity === 'Low' ? 'bg-blue-950/20 text-blue-500 border-blue-900' : ''}
                `}>
                  {pkg.severity}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TriageList;