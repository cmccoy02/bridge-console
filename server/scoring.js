/**
 * Bridge Technical Debt Scoring Engine v2.0
 *
 * Comprehensive, deterministic scoring system that produces:
 * 1. A 1-100 "Bridge Score" for executive/PM visibility
 * 2. Detailed breakdown by category
 * 3. Prioritized, actionable tasks for developers
 *
 * Categories and Weights:
 * - Dependencies (30%): Package health, security, maintenance
 * - Architecture (25%): Code structure, coupling, complexity
 * - Code Quality (20%): Size, duplication, patterns
 * - Testing (15%): Coverage, test presence
 * - Documentation (10%): README, comments, guides
 */

// =============================================================================
// WEIGHT CONFIGURATION
// =============================================================================

const WEIGHTS = {
  dependencies: {
    weight: 0.30,
    penalties: {
      deprecated: 25,           // Per deprecated package - severe
      criticalOutdated: 10,     // 3+ major versions behind
      highOutdated: 5,          // 2 major versions behind
      mediumOutdated: 2,        // 1 major version behind
      lowOutdated: 0.5,         // Minor/patch only
      unusedDep: 3,             // Per unused dependency
      missingDep: 15,           // Per missing dependency - runtime risk
      securityVuln: 20,         // Per security vulnerability
    },
    maxPenalty: 100
  },

  architecture: {
    weight: 0.25,
    penalties: {
      criticalCircular: 20,     // Circular dep with 5+ files
      warningCircular: 10,      // Circular dep with <5 files
      highRiskBarrel: 8,        // 20+ exports
      mediumRiskBarrel: 4,      // 10-20 exports
      lowRiskBarrel: 1,         // 5-10 exports
      godFile: 15,              // File >500 lines
      largeFile: 5,             // File 300-500 lines
      deepNesting: 3,           // Per deeply nested directory
    },
    maxPenalty: 100
  },

  codeQuality: {
    weight: 0.20,
    penalties: {
      noTypeScript: 20,         // Pure JS project (no TS)
      mixedTsJs: 10,            // Mixed TS/JS files
      largeFunction: 5,         // Functions >50 lines (estimated)
      duplicatePatterns: 8,     // Detected duplicate patterns
      todoFixme: 0.5,           // Per TODO/FIXME comment
      consoleLogs: 0.3,         // Per console.log in production code
    },
    maxPenalty: 100
  },

  testing: {
    weight: 0.15,
    penalties: {
      noTestFiles: 40,          // No test files found
      lowTestRatio: 20,         // <10% test files
      mediumTestRatio: 10,      // 10-20% test files
      noTestConfig: 15,         // No jest/vitest/mocha config
    },
    maxPenalty: 100
  },

  documentation: {
    weight: 0.10,
    penalties: {
      noReadme: 30,             // No README file
      shortReadme: 15,          // README <500 chars
      noContributing: 5,        // No CONTRIBUTING guide
      noChangelog: 5,           // No CHANGELOG
      lowCommentRatio: 10,      // Very few comments
    },
    maxPenalty: 100
  }
};

// =============================================================================
// EFFORT & IMPACT DEFINITIONS
// =============================================================================

const EFFORT_LEVELS = {
  trivial: { label: 'Trivial', hours: '< 1 hour', color: 'green' },
  light: { label: 'Light', hours: '1-4 hours', color: 'blue' },
  medium: { label: 'Medium', hours: '4-16 hours', color: 'yellow' },
  heavy: { label: 'Heavy', hours: '2-5 days', color: 'orange' },
  major: { label: 'Major', hours: '1-2 weeks', color: 'red' }
};

const IMPACT_LEVELS = {
  critical: { label: 'Critical', description: 'Blocks releases or causes outages', color: 'red' },
  high: { label: 'High', description: 'Significantly affects velocity or quality', color: 'orange' },
  medium: { label: 'Medium', description: 'Creates friction but workaroundable', color: 'yellow' },
  low: { label: 'Low', description: 'Nice to have improvement', color: 'blue' }
};

// =============================================================================
// SCORING FUNCTIONS
// =============================================================================

function calculateDependencyScore(data) {
  const config = WEIGHTS.dependencies;
  let penalty = 0;
  const details = [];
  const issues = [];

  // Deprecated packages
  const deprecatedCount = data.dependencyAnalysis?.deprecatedCount || 0;
  if (deprecatedCount > 0) {
    const p = deprecatedCount * config.penalties.deprecated;
    penalty += p;
    details.push(`${deprecatedCount} deprecated packages (-${p})`);
    issues.push({
      type: 'deprecated',
      count: deprecatedCount,
      severity: 'critical',
      message: `${deprecatedCount} deprecated package${deprecatedCount > 1 ? 's' : ''} must be replaced`
    });
  }

  // Outdated by priority
  if (data.dependencyAnalysis) {
    const { criticalCount, highCount, mediumCount, lowCount } = data.dependencyAnalysis;

    if (criticalCount > 0) {
      const p = criticalCount * config.penalties.criticalOutdated;
      penalty += p;
      details.push(`${criticalCount} critically outdated packages (-${p})`);
      issues.push({
        type: 'outdated-critical',
        count: criticalCount,
        severity: 'critical',
        message: `${criticalCount} package${criticalCount > 1 ? 's are' : ' is'} 3+ major versions behind`
      });
    }

    if (highCount > 0) {
      const p = highCount * config.penalties.highOutdated;
      penalty += p;
      details.push(`${highCount} high-priority outdated packages (-${p})`);
      issues.push({
        type: 'outdated-high',
        count: highCount,
        severity: 'high',
        message: `${highCount} package${highCount > 1 ? 's are' : ' is'} significantly outdated`
      });
    }

    if (mediumCount > 0) {
      const p = mediumCount * config.penalties.mediumOutdated;
      penalty += p;
      details.push(`${mediumCount} medium-priority outdated packages (-${p})`);
    }

    if (lowCount > 0) {
      const p = Math.round(lowCount * config.penalties.lowOutdated);
      penalty += p;
      details.push(`${lowCount} low-priority updates available (-${p})`);
    }
  } else if (data.outdatedDependencies?.length > 0) {
    // Fallback to basic outdated count
    const count = data.outdatedDependencies.length;
    const p = count * config.penalties.mediumOutdated;
    penalty += p;
    details.push(`${count} outdated packages (-${p})`);
  }

  // Unused dependencies
  const unusedCount = data.unusedDependencies?.length || 0;
  if (unusedCount > 0) {
    const p = unusedCount * config.penalties.unusedDep;
    penalty += p;
    details.push(`${unusedCount} unused dependencies (-${p})`);
    issues.push({
      type: 'unused',
      count: unusedCount,
      severity: 'medium',
      message: `${unusedCount} unused dependenc${unusedCount > 1 ? 'ies' : 'y'} bloating the project`
    });
  }

  // Missing dependencies
  const missingCount = Object.keys(data.missingDependencies || {}).length;
  if (missingCount > 0) {
    const p = missingCount * config.penalties.missingDep;
    penalty += p;
    details.push(`${missingCount} missing dependencies (-${p}) [RUNTIME RISK]`);
    issues.push({
      type: 'missing',
      count: missingCount,
      severity: 'critical',
      message: `${missingCount} missing dependenc${missingCount > 1 ? 'ies' : 'y'} may cause runtime errors`
    });
  }

  // Security vulnerabilities (if available)
  const vulnCount = data.vulnerabilities?.length || 0;
  if (vulnCount > 0) {
    const p = vulnCount * config.penalties.securityVuln;
    penalty += p;
    details.push(`${vulnCount} security vulnerabilities (-${p}) [SECURITY RISK]`);
    issues.push({
      type: 'vulnerability',
      count: vulnCount,
      severity: 'critical',
      message: `${vulnCount} known security vulnerabilit${vulnCount > 1 ? 'ies' : 'y'}`
    });
  }

  penalty = Math.min(penalty, config.maxPenalty);
  const score = Math.max(0, 100 - penalty);

  return {
    score,
    weight: config.weight,
    weightedScore: score * config.weight,
    penalty,
    details: details.length > 0 ? details : ['All dependencies are healthy'],
    issues
  };
}

function calculateArchitectureScore(data) {
  const config = WEIGHTS.architecture;
  let penalty = 0;
  const details = [];
  const issues = [];

  // Circular dependencies
  const circularDeps = data.circularDependencies || [];
  const criticalCycles = circularDeps.filter(c => c.severity === 'critical' || (c.cycle?.length || 0) >= 5);
  const warningCycles = circularDeps.filter(c => c.severity === 'warning' || (c.cycle?.length || 0) < 5);

  if (criticalCycles.length > 0) {
    const p = criticalCycles.length * config.penalties.criticalCircular;
    penalty += p;
    details.push(`${criticalCycles.length} critical circular dependencies (-${p})`);
    issues.push({
      type: 'circular-critical',
      count: criticalCycles.length,
      severity: 'high',
      message: `${criticalCycles.length} large circular dependency chain${criticalCycles.length > 1 ? 's' : ''}`
    });
  }

  if (warningCycles.length > 0) {
    const p = warningCycles.length * config.penalties.warningCircular;
    penalty += p;
    details.push(`${warningCycles.length} circular dependencies (-${p})`);
    issues.push({
      type: 'circular',
      count: warningCycles.length,
      severity: 'medium',
      message: `${warningCycles.length} circular dependency cycle${warningCycles.length > 1 ? 's' : ''}`
    });
  }

  // Barrel files
  const barrelFiles = data.barrelFiles || [];
  const highRisk = barrelFiles.filter(b => b.risk === 'high');
  const mediumRisk = barrelFiles.filter(b => b.risk === 'medium');
  const lowRisk = barrelFiles.filter(b => b.risk === 'low');

  if (highRisk.length > 0) {
    const p = highRisk.length * config.penalties.highRiskBarrel;
    penalty += p;
    details.push(`${highRisk.length} high-risk barrel files (20+ exports) (-${p})`);
    issues.push({
      type: 'barrel-high',
      count: highRisk.length,
      severity: 'medium',
      message: `${highRisk.length} barrel file${highRisk.length > 1 ? 's' : ''} harming build performance`
    });
  }

  if (mediumRisk.length > 0) {
    const p = mediumRisk.length * config.penalties.mediumRiskBarrel;
    penalty += p;
    details.push(`${mediumRisk.length} medium-risk barrel files (-${p})`);
  }

  if (lowRisk.length > 0) {
    const p = lowRisk.length * config.penalties.lowRiskBarrel;
    penalty += p;
    details.push(`${lowRisk.length} low-risk barrel files (-${p})`);
  }

  // Large files (god files)
  const largeFiles = data.largeFiles || [];
  const godFiles = largeFiles.filter(f => f.lines > 500);
  const bigFiles = largeFiles.filter(f => f.lines > 300 && f.lines <= 500);

  if (godFiles.length > 0) {
    const p = godFiles.length * config.penalties.godFile;
    penalty += p;
    details.push(`${godFiles.length} god files (500+ lines) (-${p})`);
    issues.push({
      type: 'god-file',
      count: godFiles.length,
      severity: 'high',
      message: `${godFiles.length} file${godFiles.length > 1 ? 's' : ''} exceeding 500 lines need refactoring`
    });
  }

  if (bigFiles.length > 0) {
    const p = bigFiles.length * config.penalties.largeFile;
    penalty += p;
    details.push(`${bigFiles.length} large files (300-500 lines) (-${p})`);
  }

  // Deep nesting
  const deepDirs = data.deepDirectories || 0;
  if (deepDirs > 0) {
    const p = deepDirs * config.penalties.deepNesting;
    penalty += p;
    details.push(`${deepDirs} deeply nested directories (-${p})`);
  }

  penalty = Math.min(penalty, config.maxPenalty);
  const score = Math.max(0, 100 - penalty);

  return {
    score,
    weight: config.weight,
    weightedScore: score * config.weight,
    penalty,
    details: details.length > 0 ? details : ['Architecture is clean'],
    issues
  };
}

function calculateCodeQualityScore(data) {
  const config = WEIGHTS.codeQuality;
  let penalty = 0;
  const details = [];
  const issues = [];

  // TypeScript usage
  const hasTypeScript = data.hasTypeScript || false;
  const hasMixedTsJs = data.hasMixedTsJs || false;

  if (!hasTypeScript) {
    penalty += config.penalties.noTypeScript;
    details.push(`No TypeScript (-${config.penalties.noTypeScript})`);
    issues.push({
      type: 'no-typescript',
      severity: 'medium',
      message: 'Project lacks TypeScript for type safety'
    });
  } else if (hasMixedTsJs) {
    penalty += config.penalties.mixedTsJs;
    details.push(`Mixed TypeScript/JavaScript (-${config.penalties.mixedTsJs})`);
    issues.push({
      type: 'mixed-ts-js',
      severity: 'low',
      message: 'Inconsistent TypeScript usage across files'
    });
  }

  // TODO/FIXME comments
  const todoCount = data.todoCount || 0;
  if (todoCount > 0) {
    const p = Math.min(20, Math.round(todoCount * config.penalties.todoFixme));
    penalty += p;
    details.push(`${todoCount} TODO/FIXME comments (-${p})`);
    if (todoCount > 20) {
      issues.push({
        type: 'todos',
        count: todoCount,
        severity: 'low',
        message: `${todoCount} TODO/FIXME comments indicating incomplete work`
      });
    }
  }

  // Console.log statements
  const consoleCount = data.consoleLogCount || 0;
  if (consoleCount > 0) {
    const p = Math.min(15, Math.round(consoleCount * config.penalties.consoleLogs));
    penalty += p;
    details.push(`${consoleCount} console.log statements (-${p})`);
    if (consoleCount > 20) {
      issues.push({
        type: 'console-logs',
        count: consoleCount,
        severity: 'low',
        message: `${consoleCount} console.log statements should be removed`
      });
    }
  }

  // Large functions (estimated from file analysis)
  const largeFuncCount = data.largeFunctionCount || 0;
  if (largeFuncCount > 0) {
    const p = largeFuncCount * config.penalties.largeFunction;
    penalty += p;
    details.push(`${largeFuncCount} estimated large functions (-${p})`);
    issues.push({
      type: 'large-functions',
      count: largeFuncCount,
      severity: 'medium',
      message: `${largeFuncCount} large function${largeFuncCount > 1 ? 's' : ''} should be broken down`
    });
  }

  penalty = Math.min(penalty, config.maxPenalty);
  const score = Math.max(0, 100 - penalty);

  return {
    score,
    weight: config.weight,
    weightedScore: score * config.weight,
    penalty,
    details: details.length > 0 ? details : ['Code quality is good'],
    issues
  };
}

function calculateTestingScore(data) {
  const config = WEIGHTS.testing;
  let penalty = 0;
  const details = [];
  const issues = [];

  const testFileCount = data.testFileCount || 0;
  const totalFiles = data.totalFiles || 1;
  const testRatio = testFileCount / totalFiles;
  const hasTestConfig = data.hasTestConfig || false;

  if (testFileCount === 0) {
    penalty += config.penalties.noTestFiles;
    details.push(`No test files found (-${config.penalties.noTestFiles})`);
    issues.push({
      type: 'no-tests',
      severity: 'high',
      message: 'No automated tests found in the project'
    });
  } else if (testRatio < 0.1) {
    penalty += config.penalties.lowTestRatio;
    details.push(`Low test coverage: ${Math.round(testRatio * 100)}% test files (-${config.penalties.lowTestRatio})`);
    issues.push({
      type: 'low-tests',
      severity: 'medium',
      message: `Only ${testFileCount} test file${testFileCount > 1 ? 's' : ''} (${Math.round(testRatio * 100)}% of codebase)`
    });
  } else if (testRatio < 0.2) {
    penalty += config.penalties.mediumTestRatio;
    details.push(`Moderate test coverage: ${Math.round(testRatio * 100)}% test files (-${config.penalties.mediumTestRatio})`);
  }

  if (!hasTestConfig && testFileCount > 0) {
    penalty += config.penalties.noTestConfig;
    details.push(`No test configuration file (-${config.penalties.noTestConfig})`);
  }

  penalty = Math.min(penalty, config.maxPenalty);
  const score = Math.max(0, 100 - penalty);

  return {
    score,
    weight: config.weight,
    weightedScore: score * config.weight,
    penalty,
    details: details.length > 0 ? details : ['Testing setup is solid'],
    issues,
    metrics: {
      testFileCount,
      testRatio: Math.round(testRatio * 100)
    }
  };
}

function calculateDocumentationScore(data) {
  const config = WEIGHTS.documentation;
  let penalty = 0;
  const details = [];
  const issues = [];

  const hasReadme = data.hasReadme || false;
  const readmeLength = data.readmeLength || 0;
  const hasChangelog = data.hasChangelog || false;
  const hasContributing = data.hasContributing || false;

  if (!hasReadme) {
    penalty += config.penalties.noReadme;
    details.push(`No README file (-${config.penalties.noReadme})`);
    issues.push({
      type: 'no-readme',
      severity: 'high',
      message: 'Project lacks a README file'
    });
  } else if (readmeLength < 500) {
    penalty += config.penalties.shortReadme;
    details.push(`README is too short (<500 chars) (-${config.penalties.shortReadme})`);
    issues.push({
      type: 'short-readme',
      severity: 'low',
      message: 'README needs more documentation'
    });
  }

  if (!hasChangelog) {
    penalty += config.penalties.noChangelog;
    details.push(`No CHANGELOG file (-${config.penalties.noChangelog})`);
  }

  if (!hasContributing) {
    penalty += config.penalties.noContributing;
    details.push(`No CONTRIBUTING guide (-${config.penalties.noContributing})`);
  }

  penalty = Math.min(penalty, config.maxPenalty);
  const score = Math.max(0, 100 - penalty);

  return {
    score,
    weight: config.weight,
    weightedScore: score * config.weight,
    penalty,
    details: details.length > 0 ? details : ['Documentation is complete'],
    issues
  };
}

// =============================================================================
// TASK GENERATION
// =============================================================================

function generateActionableTasks(allIssues, data) {
  const tasks = [];

  // Process all issues and generate tasks
  allIssues.forEach(issue => {
    const task = issueToTask(issue, data);
    if (task) tasks.push(task);
  });

  // Sort by priority score (impact * urgency - effort)
  const priorityMap = { critical: 4, high: 3, medium: 2, low: 1 };
  const effortMap = { trivial: 1, light: 2, medium: 3, heavy: 4, major: 5 };

  tasks.sort((a, b) => {
    const aScore = priorityMap[a.impact] * 2 - effortMap[a.effort];
    const bScore = priorityMap[b.impact] * 2 - effortMap[b.effort];
    return bScore - aScore;
  });

  // Add priority rank
  tasks.forEach((task, idx) => {
    task.rank = idx + 1;
  });

  return tasks;
}

function issueToTask(issue, data) {
  switch (issue.type) {
    case 'deprecated':
      return {
        id: 'deprecated-packages',
        title: `Replace ${issue.count} deprecated package${issue.count > 1 ? 's' : ''}`,
        description: 'Deprecated packages are no longer maintained and may have security issues. Replace them with modern alternatives.',
        category: 'Dependencies',
        impact: 'critical',
        effort: issue.count > 3 ? 'heavy' : issue.count > 1 ? 'medium' : 'light',
        consequence: 'Security vulnerabilities, breaking changes without warning',
        command: 'Review package deprecation notices and find replacements',
        items: data.enhancedDependencies?.filter(d => d.deprecated)?.map(d => d.package) || []
      };

    case 'outdated-critical':
      return {
        id: 'critical-updates',
        title: `Update ${issue.count} critically outdated package${issue.count > 1 ? 's' : ''}`,
        description: 'These packages are 3+ major versions behind, likely causing compatibility issues.',
        category: 'Dependencies',
        impact: 'critical',
        effort: issue.count > 5 ? 'heavy' : issue.count > 2 ? 'medium' : 'light',
        consequence: 'Security risks, incompatibility with modern tools',
        command: 'npm update or follow upgrade path in Packages tab'
      };

    case 'outdated-high':
      return {
        id: 'high-updates',
        title: `Update ${issue.count} significantly outdated package${issue.count > 1 ? 's' : ''}`,
        description: 'These packages are behind and should be updated soon.',
        category: 'Dependencies',
        impact: 'high',
        effort: issue.count > 5 ? 'medium' : 'light',
        consequence: 'Missing features, potential security patches',
        command: 'npm update or follow upgrade path'
      };

    case 'missing':
      return {
        id: 'missing-deps',
        title: `Add ${issue.count} missing dependenc${issue.count > 1 ? 'ies' : 'y'}`,
        description: 'Code references packages that are not in package.json. This can cause runtime errors.',
        category: 'Dependencies',
        impact: 'critical',
        effort: 'trivial',
        consequence: 'Runtime crashes, broken builds',
        command: `npm install ${Object.keys(data.missingDependencies || {}).join(' ')}`,
        items: Object.keys(data.missingDependencies || {})
      };

    case 'unused':
      return {
        id: 'unused-deps',
        title: `Remove ${issue.count} unused dependenc${issue.count > 1 ? 'ies' : 'y'}`,
        description: 'These packages are installed but never imported. Removing them reduces install time and security surface.',
        category: 'Dependencies',
        impact: 'low',
        effort: 'trivial',
        consequence: 'Bloated node_modules, slower installs',
        command: `npm uninstall ${(data.unusedDependencies || []).join(' ')}`,
        items: data.unusedDependencies || []
      };

    case 'vulnerability':
      return {
        id: 'security-vulns',
        title: `Fix ${issue.count} security vulnerabilit${issue.count > 1 ? 'ies' : 'y'}`,
        description: 'Known security vulnerabilities exist in dependencies.',
        category: 'Security',
        impact: 'critical',
        effort: 'medium',
        consequence: 'Potential exploitation, compliance violations',
        command: 'npm audit fix'
      };

    case 'circular-critical':
    case 'circular':
      return {
        id: 'circular-deps',
        title: `Refactor ${issue.count} circular dependenc${issue.count > 1 ? 'ies' : 'y'}`,
        description: 'Circular dependencies make code harder to understand and can cause subtle bugs.',
        category: 'Architecture',
        impact: issue.severity === 'high' ? 'high' : 'medium',
        effort: issue.count > 3 ? 'heavy' : 'medium',
        consequence: 'Difficult refactoring, unpredictable behavior',
        suggestion: 'Extract shared code to a separate module or use dependency injection'
      };

    case 'barrel-high':
      return {
        id: 'barrel-files',
        title: `Refactor ${issue.count} large barrel file${issue.count > 1 ? 's' : ''}`,
        description: 'Barrel files with many exports hurt tree-shaking and increase bundle size.',
        category: 'Architecture',
        impact: 'medium',
        effort: 'medium',
        consequence: 'Larger bundles, slower builds',
        suggestion: 'Use direct imports or split into smaller modules',
        items: data.barrelFiles?.filter(b => b.risk === 'high')?.map(b => b.path) || []
      };

    case 'god-file':
      return {
        id: 'god-files',
        title: `Split ${issue.count} god file${issue.count > 1 ? 's' : ''}`,
        description: 'Files over 500 lines are hard to maintain and test.',
        category: 'Architecture',
        impact: 'high',
        effort: issue.count > 2 ? 'heavy' : 'medium',
        consequence: 'Hard to maintain, test, and review',
        suggestion: 'Break into smaller, focused modules',
        items: data.largeFiles?.filter(f => f.lines > 500)?.map(f => `${f.path} (${f.lines} lines)`) || []
      };

    case 'no-typescript':
      return {
        id: 'add-typescript',
        title: 'Add TypeScript to the project',
        description: 'TypeScript provides type safety and better developer experience.',
        category: 'Code Quality',
        impact: 'medium',
        effort: 'major',
        consequence: 'More runtime errors, harder refactoring'
      };

    case 'mixed-ts-js':
      return {
        id: 'migrate-to-ts',
        title: 'Complete TypeScript migration',
        description: 'Some files are still JavaScript. Migrate them for consistency.',
        category: 'Code Quality',
        impact: 'low',
        effort: 'medium',
        consequence: 'Inconsistent type safety'
      };

    case 'no-tests':
      return {
        id: 'add-tests',
        title: 'Set up automated testing',
        description: 'No test files found. Add tests to catch bugs early.',
        category: 'Testing',
        impact: 'high',
        effort: 'heavy',
        consequence: 'Undetected bugs, risky deployments',
        suggestion: 'Start with Jest or Vitest, add tests for critical paths first'
      };

    case 'low-tests':
      return {
        id: 'increase-coverage',
        title: 'Increase test coverage',
        description: `Only ${issue.count || 0} test files found. Add more tests.`,
        category: 'Testing',
        impact: 'medium',
        effort: 'heavy',
        consequence: 'Low confidence in changes',
        suggestion: 'Aim for 30-40% test file ratio, focus on critical paths'
      };

    case 'no-readme':
      return {
        id: 'add-readme',
        title: 'Create a README file',
        description: 'A README helps new developers understand the project.',
        category: 'Documentation',
        impact: 'medium',
        effort: 'light',
        consequence: 'Poor onboarding, lost context'
      };

    case 'short-readme':
      return {
        id: 'expand-readme',
        title: 'Expand the README',
        description: 'README is too short. Add setup instructions, architecture overview.',
        category: 'Documentation',
        impact: 'low',
        effort: 'light',
        consequence: 'Developers waste time figuring things out'
      };

    case 'todos':
      return {
        id: 'resolve-todos',
        title: `Address ${issue.count} TODO/FIXME comments`,
        description: 'Many TODO comments indicate incomplete work that was never finished.',
        category: 'Code Quality',
        impact: 'low',
        effort: 'medium',
        consequence: 'Accumulated technical debt'
      };

    case 'large-functions':
      return {
        id: 'refactor-functions',
        title: `Refactor ${issue.count} large function${issue.count > 1 ? 's' : ''}`,
        description: 'Large functions are hard to understand and test.',
        category: 'Code Quality',
        impact: 'medium',
        effort: 'medium',
        consequence: 'Hard to maintain and debug'
      };

    default:
      return null;
  }
}

// =============================================================================
// GRADE AND STATUS
// =============================================================================

function getGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function getStatus(score) {
  if (score >= 90) return { label: 'Excellent', color: 'green', description: 'Minimal tech debt, well-maintained' };
  if (score >= 80) return { label: 'Good', color: 'blue', description: 'Some debt but manageable' };
  if (score >= 70) return { label: 'Fair', color: 'yellow', description: 'Growing debt, needs attention' };
  if (score >= 60) return { label: 'Poor', color: 'orange', description: 'Significant debt affecting velocity' };
  return { label: 'Critical', color: 'red', description: 'Tech debt is severely impacting the team' };
}

function getExecutiveSummary(score, issues, tasks) {
  const status = getStatus(score);
  const criticalTasks = tasks.filter(t => t.impact === 'critical').length;
  const highTasks = tasks.filter(t => t.impact === 'high').length;

  let summary = `This repository has a Bridge Score of ${score}/100 (${status.label}). `;

  if (score >= 80) {
    summary += 'The codebase is well-maintained with low technical debt. ';
  } else if (score >= 60) {
    summary += 'There is moderate technical debt that should be addressed to prevent velocity slowdown. ';
  } else {
    summary += 'Technical debt is high and likely affecting team productivity. Immediate action is recommended. ';
  }

  if (criticalTasks > 0) {
    summary += `There ${criticalTasks === 1 ? 'is' : 'are'} ${criticalTasks} critical issue${criticalTasks > 1 ? 's' : ''} requiring immediate attention. `;
  }

  if (highTasks > 0) {
    summary += `Additionally, ${highTasks} high-priority improvement${highTasks > 1 ? 's' : ''} should be scheduled soon.`;
  }

  return summary;
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

export function calculateTechDebtScore(data) {
  console.log('[Scoring] Calculating comprehensive Bridge Score...');

  // Calculate all dimension scores
  const dependencies = calculateDependencyScore(data);
  const architecture = calculateArchitectureScore(data);
  const codeQuality = calculateCodeQualityScore(data);
  const testing = calculateTestingScore(data);
  const documentation = calculateDocumentationScore(data);

  // Calculate weighted total
  const weightedTotal =
    dependencies.weightedScore +
    architecture.weightedScore +
    codeQuality.weightedScore +
    testing.weightedScore +
    documentation.weightedScore;

  const totalScore = Math.round(weightedTotal);

  // Collect all issues
  const allIssues = [
    ...dependencies.issues,
    ...architecture.issues,
    ...codeQuality.issues,
    ...testing.issues,
    ...documentation.issues
  ];

  // Generate prioritized tasks
  const tasks = generateActionableTasks(allIssues, data);

  // Generate executive summary
  const summary = getExecutiveSummary(totalScore, allIssues, tasks);

  console.log(`[Scoring] Bridge Score: ${totalScore} (${getGrade(totalScore)}) - ${tasks.length} actionable tasks`);

  return {
    total: totalScore,
    grade: getGrade(totalScore),
    status: getStatus(totalScore).label,
    statusDetails: getStatus(totalScore),

    // For exec/PM view
    executiveSummary: summary,

    // Detailed breakdown
    breakdown: {
      dependencies: Math.round(dependencies.score),
      architecture: Math.round(architecture.score),
      codeQuality: Math.round(codeQuality.score),
      testing: Math.round(testing.score),
      documentation: Math.round(documentation.score)
    },

    // Weight information for transparency
    weights: {
      dependencies: WEIGHTS.dependencies.weight,
      architecture: WEIGHTS.architecture.weight,
      codeQuality: WEIGHTS.codeQuality.weight,
      testing: WEIGHTS.testing.weight,
      documentation: WEIGHTS.documentation.weight
    },

    // Full details for drill-down
    details: {
      dependencies,
      architecture,
      codeQuality,
      testing,
      documentation
    },

    // Actionable tasks for developers
    tasks,

    // Summary stats
    stats: {
      totalIssues: allIssues.length,
      criticalIssues: allIssues.filter(i => i.severity === 'critical').length,
      highIssues: allIssues.filter(i => i.severity === 'high').length,
      mediumIssues: allIssues.filter(i => i.severity === 'medium').length,
      lowIssues: allIssues.filter(i => i.severity === 'low').length
    }
  };
}

// Export effort and impact level definitions for UI
export const EFFORT_DEFINITIONS = EFFORT_LEVELS;
export const IMPACT_DEFINITIONS = IMPACT_LEVELS;
