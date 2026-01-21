import React from 'react';
import { Target, Clock, TrendingUp, AlertTriangle, CheckCircle, ChevronRight, Zap } from 'lucide-react';
import { BridgeMetrics } from '../types';

interface PriorityFocusProps {
  metrics: BridgeMetrics;
  onNavigate?: (tab: 'packages' | 'insights') => void;
}

interface FocusRecommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  title: string;
  reason: string;
  impact: string;
  effort: 'trivial' | 'light' | 'medium' | 'heavy';
  nextStep: string;
  targetTab?: 'packages' | 'insights';
  metric?: number;
}

const PriorityFocus: React.FC<PriorityFocusProps> = ({ metrics, onNavigate }) => {
  const recommendation = analyzeAndRecommend(metrics);

  if (!recommendation) {
    return (
      <div className="bg-green-950/20 border border-green-900/50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-green-900/30 rounded-lg">
            <CheckCircle className="text-green-400" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-green-400">Excellent Health</h3>
            <p className="text-sm text-slate-400">No critical issues detected</p>
          </div>
        </div>
        <p className="text-sm text-slate-300">
          Your repository is in great shape. Keep up the good practices and consider
          enabling automated scans to catch issues early.
        </p>
      </div>
    );
  }

  const priorityColors = {
    critical: { bg: 'bg-red-950/30', border: 'border-red-900/50', text: 'text-red-400', badge: 'bg-red-600' },
    high: { bg: 'bg-orange-950/30', border: 'border-orange-900/50', text: 'text-orange-400', badge: 'bg-orange-600' },
    medium: { bg: 'bg-yellow-950/30', border: 'border-yellow-900/50', text: 'text-yellow-400', badge: 'bg-yellow-600' },
    low: { bg: 'bg-blue-950/30', border: 'border-blue-900/50', text: 'text-blue-400', badge: 'bg-blue-600' }
  };

  const effortLabels = {
    trivial: '< 30 min',
    light: '1-2 hours',
    medium: 'Half day',
    heavy: '1-2 days'
  };

  const colors = priorityColors[recommendation.priority];

  return (
    <div className={`${colors.bg} border ${colors.border} rounded-lg overflow-hidden`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${colors.bg}`}>
            <Target className={colors.text} size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white">Priority Focus</h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase text-white ${colors.badge}`}>
                {recommendation.priority}
              </span>
            </div>
            <p className="text-xs text-slate-400 uppercase tracking-wider">{recommendation.category}</p>
          </div>
        </div>
        <Zap className={colors.text} size={20} />
      </div>

      {/* Content */}
      <div className="p-6 space-y-4">
        {/* Main Recommendation */}
        <div>
          <h4 className="text-xl font-bold text-white mb-2">{recommendation.title}</h4>
          <p className="text-sm text-slate-300 leading-relaxed">{recommendation.reason}</p>
        </div>

        {/* Impact & Effort */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={14} className="text-green-400" />
              <span className="text-xs text-slate-400 uppercase tracking-wider">Impact</span>
            </div>
            <p className="text-sm text-white">{recommendation.impact}</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={14} className="text-blue-400" />
              <span className="text-xs text-slate-400 uppercase tracking-wider">Effort</span>
            </div>
            <p className="text-sm text-white">{effortLabels[recommendation.effort]}</p>
          </div>
        </div>

        {/* Next Step */}
        <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-2">
            <ChevronRight size={16} className={colors.text} />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Next Step</span>
          </div>
          <p className="text-sm text-white">{recommendation.nextStep}</p>
        </div>

        {/* Action Button */}
        {recommendation.targetTab && onNavigate && (
          <button
            onClick={() => onNavigate(recommendation.targetTab!)}
            className={`w-full py-3 rounded font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${colors.badge} text-white hover:opacity-90`}
          >
            View Details
            <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

function analyzeAndRecommend(metrics: BridgeMetrics): FocusRecommendation | null {
  const issues = metrics.issues;
  const score = metrics.score;
  const recommendations: FocusRecommendation[] = [];

  // Check for deprecated packages (CRITICAL)
  const deprecatedPkgs = issues.enhancedDependencies?.filter(d => d.isDeprecated) || [];
  if (deprecatedPkgs.length > 0) {
    recommendations.push({
      priority: 'critical',
      category: 'Security Risk',
      title: `Replace ${deprecatedPkgs.length} Deprecated Package${deprecatedPkgs.length > 1 ? 's' : ''}`,
      reason: `Deprecated packages like "${deprecatedPkgs[0]?.package}" are no longer maintained and may contain unpatched security vulnerabilities. This is your highest priority fix.`,
      impact: 'Eliminates security vulnerabilities and ensures continued support',
      effort: deprecatedPkgs.length > 3 ? 'heavy' : 'medium',
      nextStep: `Research alternatives for ${deprecatedPkgs[0]?.package} and plan the migration. Check the package's npm page for recommended replacements.`,
      targetTab: 'packages'
    });
  }

  // Check for major version updates on core frameworks (HIGH)
  const majorUpdates = issues.enhancedDependencies?.filter(
    d => d.versionDistance?.major && d.versionDistance.major >= 2 &&
    ['react', 'vue', 'angular', 'next', 'express', 'typescript'].some(fw => d.package.includes(fw))
  ) || [];
  if (majorUpdates.length > 0) {
    recommendations.push({
      priority: 'high',
      category: 'Framework Debt',
      title: `Upgrade ${majorUpdates[0].package} (${majorUpdates[0].versionDistance?.major} major versions behind)`,
      reason: `Your core framework is significantly outdated. Being ${majorUpdates[0].versionDistance?.major}+ major versions behind means you're missing important features, performance improvements, and security patches.`,
      impact: 'Unlock new features, better performance, and security updates',
      effort: 'heavy',
      nextStep: `Review the ${majorUpdates[0].package} changelog for breaking changes. Consider creating a separate branch for the upgrade.`,
      targetTab: 'packages'
    });
  }

  // Check for circular dependencies (HIGH)
  if (issues.circularDependencies.length > 5) {
    recommendations.push({
      priority: 'high',
      category: 'Architecture',
      title: 'Break Circular Dependency Chains',
      reason: `You have ${issues.circularDependencies.length} circular dependencies. This makes your code harder to test, refactor, and can cause subtle runtime issues.`,
      impact: 'Cleaner architecture, easier testing, faster builds',
      effort: 'medium',
      nextStep: 'Start with the shortest cycle. Extract shared code into a separate module that both sides can import.',
      targetTab: 'insights'
    });
  }

  // Check for unused dependencies (MEDIUM)
  if (issues.unusedDependencies.length >= 5) {
    recommendations.push({
      priority: 'medium',
      category: 'Maintenance',
      title: `Remove ${issues.unusedDependencies.length} Unused Dependencies`,
      reason: 'Dead dependencies increase your attack surface, slow down installs, and add confusion. This is quick to fix with high reward.',
      impact: 'Faster installs, reduced bundle size, smaller attack surface',
      effort: 'trivial',
      nextStep: `Use Bridge's "Remove via PR" feature to clean up these packages in one click.`,
      targetTab: 'packages'
    });
  }

  // Check for many outdated packages (MEDIUM)
  const outdatedCount = issues.outdatedDependencies.length;
  if (outdatedCount > 20) {
    recommendations.push({
      priority: 'medium',
      category: 'Dependency Freshness',
      title: `Update ${outdatedCount} Outdated Packages`,
      reason: 'Over 20 outdated packages indicates deferred maintenance. Start with patch/minor updates to reduce risk while improving freshness.',
      impact: `Improve dependency score from ${score.breakdown?.dependencies || 0} to 70+`,
      effort: 'light',
      nextStep: 'Use Bridge\'s "Run Minor/Patch Updates" button to safely update non-breaking changes.',
      targetTab: 'packages'
    });
  }

  // Check for low testing score (MEDIUM)
  if (score.breakdown?.testing !== undefined && score.breakdown.testing < 50) {
    recommendations.push({
      priority: 'medium',
      category: 'Quality',
      title: 'Improve Test Coverage',
      reason: `Your testing score is ${score.breakdown.testing}/100. Low test coverage increases the risk of regressions and makes refactoring dangerous.`,
      impact: 'Safer deployments, confident refactoring, better code quality',
      effort: 'heavy',
      nextStep: 'Start by adding tests for your most critical business logic. Even 50% coverage on core paths is valuable.',
      targetTab: 'insights'
    });
  }

  // Check for missing documentation (LOW)
  if (score.breakdown?.documentation !== undefined && score.breakdown.documentation < 40) {
    recommendations.push({
      priority: 'low',
      category: 'Documentation',
      title: 'Improve Project Documentation',
      reason: 'Missing or sparse documentation makes onboarding slow and knowledge siloed. A good README is your project\'s front door.',
      impact: 'Faster onboarding, better collaboration, easier maintenance',
      effort: 'light',
      nextStep: 'Start with a README that explains what the project does, how to run it, and how to contribute.',
      targetTab: 'insights'
    });
  }

  // If score is already excellent, return null
  if (score.total >= 90 && recommendations.length === 0) {
    return null;
  }

  // Sort by priority and return the highest
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recommendations[0] || null;
}

export default PriorityFocus;
