/**
 * Dependency Prioritization Engine
 *
 * Implements intelligent prioritization for package updates based on:
 * - Version distance (how far behind)
 * - Package category (framework, build tool, etc.)
 * - Peer dependencies (packages that need to move together)
 * - Blocking relationships (what unlocks what)
 * - Deprecated packages
 */

import https from 'https';

// Core framework packages - highest priority
const CORE_FRAMEWORKS = new Set([
  'react', 'react-dom', 'next', 'vue', 'nuxt', 'angular', '@angular/core',
  'svelte', 'solid-js', 'preact', 'gatsby', 'remix', 'astro'
]);

// Build tools - high priority (affect development workflow)
const BUILD_TOOLS = new Set([
  'webpack', 'vite', 'rollup', 'esbuild', 'parcel', 'turbopack',
  'babel', '@babel/core', 'typescript', 'swc', 'tsup', 'unbuild'
]);

// Testing frameworks
const TESTING_TOOLS = new Set([
  'jest', 'vitest', 'mocha', 'cypress', 'playwright', '@testing-library/react',
  '@testing-library/jest-dom', 'enzyme', 'ava', 'tap', 'supertest'
]);

// Type definition packages
const TYPE_DEFINITIONS = /^@types\//;

// Known peer dependency relationships (package -> required peers)
const PEER_DEPENDENCY_GROUPS = {
  'react': ['react-dom'],
  'react-dom': ['react'],
  '@testing-library/react': ['react', 'react-dom'],
  'next': ['react', 'react-dom'],
  'gatsby': ['react', 'react-dom'],
  '@babel/core': ['@babel/preset-env', '@babel/preset-react', '@babel/preset-typescript'],
  'eslint': ['eslint-plugin-*', '@typescript-eslint/*'],
  'typescript': ['@types/*'],
  'vue': ['vue-router', 'vuex', 'pinia'],
  'nuxt': ['vue'],
};

/**
 * Parse semantic version string
 */
function parseVersion(version) {
  // Remove range specifiers (^, ~, >=, etc.)
  const cleaned = version.replace(/^[\^~>=<]+/, '').split('-')[0];
  const parts = cleaned.split('.').map(p => parseInt(p, 10) || 0);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
    raw: version
  };
}

/**
 * Calculate version distance between current and latest
 */
function calculateVersionDistance(current, latest) {
  const curr = parseVersion(current);
  const lat = parseVersion(latest);

  const major = Math.max(0, lat.major - curr.major);
  const minor = major > 0 ? lat.minor : Math.max(0, lat.minor - curr.minor);
  const patch = (major > 0 || minor > 0) ? lat.patch : Math.max(0, lat.patch - curr.patch);

  return {
    major,
    minor,
    patch,
    totalBehind: (major * 100) + (minor * 10) + patch
  };
}

/**
 * Categorize package by its purpose
 */
function categorizePackage(packageName) {
  if (CORE_FRAMEWORKS.has(packageName)) return 'core-framework';
  if (BUILD_TOOLS.has(packageName)) return 'build-tool';
  if (TESTING_TOOLS.has(packageName)) return 'testing';
  if (TYPE_DEFINITIONS.test(packageName)) return 'type-definitions';
  return 'utility';
}

/**
 * Fetch package info from npm registry
 */
async function fetchNpmPackageInfo(packageName) {
  return new Promise((resolve) => {
    const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;

    const req = https.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const pkg = JSON.parse(data);
          resolve({
            deprecated: pkg.versions?.[pkg['dist-tags']?.latest]?.deprecated || null,
            peerDependencies: pkg.versions?.[pkg['dist-tags']?.latest]?.peerDependencies || {},
            description: pkg.description || ''
          });
        } catch {
          resolve({ deprecated: null, peerDependencies: {}, description: '' });
        }
      });
    });

    req.on('error', () => resolve({ deprecated: null, peerDependencies: {}, description: '' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ deprecated: null, peerDependencies: {}, description: '' });
    });
  });
}

/**
 * Calculate priority score for a package (0-100, higher = more urgent)
 */
function calculatePriorityScore(pkg, allPackages) {
  let score = 0;
  const reasons = [];

  // 1. Category-based scoring
  switch (pkg.category) {
    case 'core-framework':
      score += 30;
      reasons.push('Core framework - impacts entire application');
      break;
    case 'build-tool':
      score += 25;
      reasons.push('Build tool - affects development workflow');
      break;
    case 'testing':
      score += 15;
      reasons.push('Testing tool - important for code quality');
      break;
    case 'type-definitions':
      score += 5;
      reasons.push('Type definitions - low runtime impact');
      break;
    default:
      score += 10;
  }

  // 2. Version distance scoring
  const { major, minor } = pkg.versionDistance;
  if (major >= 3) {
    score += 25;
    reasons.push(`${major} major versions behind - significant update needed`);
  } else if (major >= 2) {
    score += 20;
    reasons.push(`${major} major versions behind`);
  } else if (major === 1) {
    score += 15;
    reasons.push('One major version behind');
  } else if (minor >= 5) {
    score += 10;
    reasons.push(`${minor} minor versions behind`);
  } else if (minor >= 2) {
    score += 5;
    reasons.push(`${minor} minor versions behind`);
  }

  // 3. Deprecated package bonus
  if (pkg.isDeprecated) {
    score += 20;
    reasons.push('Package is deprecated');
  }

  // 4. Blocks other packages bonus
  if (pkg.blocks && pkg.blocks.length > 0) {
    const blocksCount = pkg.blocks.length;
    score += Math.min(15, blocksCount * 5);
    reasons.push(`Blocks ${blocksCount} other package(s) from upgrading`);
  }

  // 5. Is a production dependency (not devDependency)
  if (!pkg.isDevDependency) {
    score += 5;
    reasons.push('Production dependency');
  }

  return {
    score: Math.min(100, score),
    reasons
  };
}

/**
 * Determine priority tier from score
 */
function getPriorityTier(score) {
  if (score >= 70) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

/**
 * Map priority tier to legacy severity
 */
function tierToSeverity(tier) {
  switch (tier) {
    case 'critical': return 'High';
    case 'high': return 'High';
    case 'medium': return 'Medium';
    default: return 'Low';
  }
}

/**
 * Build blocking relationships between packages
 */
function buildBlockingRelationships(packages, packageJson) {
  const allDeps = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {})
  };

  const packageNames = new Set(packages.map(p => p.package));

  for (const pkg of packages) {
    pkg.blockedBy = [];
    pkg.blocks = [];
    pkg.dependsOn = [];

    // Check known peer dependency groups
    const knownPeers = PEER_DEPENDENCY_GROUPS[pkg.package] || [];
    for (const peer of knownPeers) {
      if (peer.includes('*')) {
        // Wildcard pattern (e.g., '@types/*')
        const prefix = peer.replace('*', '');
        for (const otherPkg of packages) {
          if (otherPkg.package.startsWith(prefix) && otherPkg.package !== pkg.package) {
            if (!pkg.peerDependencies.includes(otherPkg.package)) {
              pkg.peerDependencies.push(otherPkg.package);
            }
          }
        }
      } else if (packageNames.has(peer)) {
        if (!pkg.peerDependencies.includes(peer)) {
          pkg.peerDependencies.push(peer);
        }
      }
    }

    // Check if this package's upgrade would be blocked by peer dependencies
    for (const peer of pkg.peerDependencies) {
      if (packageNames.has(peer)) {
        const peerPkg = packages.find(p => p.package === peer);
        if (peerPkg && peerPkg.versionDistance.major > 0) {
          pkg.blockedBy.push(peer);
        }
      }
    }
  }

  // Build blocks relationships (inverse of blockedBy)
  for (const pkg of packages) {
    for (const blocker of pkg.blockedBy) {
      const blockerPkg = packages.find(p => p.package === blocker);
      if (blockerPkg && !blockerPkg.blocks.includes(pkg.package)) {
        blockerPkg.blocks.push(pkg.package);
      }
    }
  }

  return packages;
}

/**
 * Generate upgrade paths - recommended order for updates
 */
function generateUpgradePaths(packages) {
  const paths = [];
  const processed = new Set();

  // Sort by priority score descending
  const sorted = [...packages].sort((a, b) => b.priorityScore - a.priorityScore);

  let order = 1;

  // First: Handle deprecated packages
  const deprecated = sorted.filter(p => p.isDeprecated && !processed.has(p.package));
  if (deprecated.length > 0) {
    paths.push({
      order: order++,
      packages: deprecated.map(p => p.package),
      reason: 'Deprecated packages - should be replaced or upgraded immediately',
      effort: deprecated.length > 3 ? 'high' : 'medium',
      riskLevel: 'review',
      unlocks: deprecated.flatMap(p => p.blocks)
    });
    deprecated.forEach(p => processed.add(p.package));
  }

  // Second: Core frameworks with their peer dependencies
  const coreFrameworks = sorted.filter(p =>
    p.category === 'core-framework' && !processed.has(p.package)
  );

  for (const framework of coreFrameworks) {
    const group = [framework.package];
    const peers = framework.peerDependencies.filter(peer =>
      packages.some(p => p.package === peer && !processed.has(p.package))
    );
    group.push(...peers);

    if (group.length > 0) {
      const hasMajorUpdate = packages
        .filter(p => group.includes(p.package))
        .some(p => p.versionDistance.major > 0);

      paths.push({
        order: order++,
        packages: [...new Set(group)],
        reason: `Core framework upgrade${peers.length > 0 ? ' with peer dependencies' : ''}`,
        effort: hasMajorUpdate ? 'high' : 'medium',
        riskLevel: hasMajorUpdate ? 'breaking' : 'review',
        unlocks: framework.blocks
      });
      group.forEach(p => processed.add(p));
    }
  }

  // Third: Build tools
  const buildTools = sorted.filter(p =>
    p.category === 'build-tool' && !processed.has(p.package)
  );

  if (buildTools.length > 0) {
    const hasMajorUpdate = buildTools.some(p => p.versionDistance.major > 0);
    paths.push({
      order: order++,
      packages: buildTools.map(p => p.package),
      reason: 'Build tool updates',
      effort: hasMajorUpdate ? 'medium' : 'low',
      riskLevel: hasMajorUpdate ? 'review' : 'safe',
      unlocks: buildTools.flatMap(p => p.blocks)
    });
    buildTools.forEach(p => processed.add(p.package));
  }

  // Fourth: High priority remaining packages
  const highPriority = sorted.filter(p =>
    (p.priority === 'critical' || p.priority === 'high') && !processed.has(p.package)
  );

  if (highPriority.length > 0) {
    paths.push({
      order: order++,
      packages: highPriority.map(p => p.package),
      reason: 'High priority updates (security or significant version gap)',
      effort: 'medium',
      riskLevel: 'review',
      unlocks: highPriority.flatMap(p => p.blocks)
    });
    highPriority.forEach(p => processed.add(p.package));
  }

  // Fifth: Testing tools
  const testingTools = sorted.filter(p =>
    p.category === 'testing' && !processed.has(p.package)
  );

  if (testingTools.length > 0) {
    paths.push({
      order: order++,
      packages: testingTools.map(p => p.package),
      reason: 'Testing tool updates',
      effort: 'low',
      riskLevel: 'safe',
      unlocks: []
    });
    testingTools.forEach(p => processed.add(p.package));
  }

  // Sixth: Type definitions
  const typeDefs = sorted.filter(p =>
    p.category === 'type-definitions' && !processed.has(p.package)
  );

  if (typeDefs.length > 0) {
    paths.push({
      order: order++,
      packages: typeDefs.map(p => p.package),
      reason: 'Type definition updates (low risk)',
      effort: 'low',
      riskLevel: 'safe',
      unlocks: []
    });
    typeDefs.forEach(p => processed.add(p.package));
  }

  // Finally: Everything else
  const remaining = sorted.filter(p => !processed.has(p.package));

  if (remaining.length > 0) {
    paths.push({
      order: order++,
      packages: remaining.map(p => p.package),
      reason: 'Remaining utility package updates',
      effort: 'low',
      riskLevel: 'safe',
      unlocks: []
    });
  }

  return paths;
}

/**
 * Identify quick wins - high impact, low effort updates
 */
function identifyQuickWins(packages) {
  return packages
    .filter(p => {
      // Quick win criteria:
      // - Not a major version update (lower risk)
      // - Has decent priority score (meaningful impact)
      // - Is a dev dependency OR is type definitions (lower risk)
      const isMinorOrPatch = p.versionDistance.major === 0;
      const hasImpact = p.priorityScore >= 20;
      const isLowRisk = p.isDevDependency || p.category === 'type-definitions';

      return isMinorOrPatch && hasImpact && isLowRisk;
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 5)
    .map(p => p.package);
}

/**
 * Main analysis function - enhances basic outdated packages with full prioritization
 */
export async function analyzeAndPrioritize(basicOutdated, packageJson) {
  console.log('[Prioritization] Starting enhanced dependency analysis...');

  const devDeps = new Set(Object.keys(packageJson.devDependencies || {}));

  // Fetch npm registry info for each package (with concurrency limit)
  const packages = [];
  const batchSize = 10;

  for (let i = 0; i < basicOutdated.length; i += batchSize) {
    const batch = basicOutdated.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (pkg) => {
        const npmInfo = await fetchNpmPackageInfo(pkg.package);
        const versionDistance = calculateVersionDistance(pkg.current, pkg.latest);
        const category = categorizePackage(pkg.package);

        return {
          package: pkg.package,
          current: pkg.current,
          latest: pkg.latest,
          versionDistance,
          isDeprecated: !!npmInfo.deprecated,
          deprecationMessage: npmInfo.deprecated || undefined,
          peerDependencies: Object.keys(npmInfo.peerDependencies),
          dependsOn: [],
          blockedBy: [],
          blocks: [],
          category,
          isDevDependency: devDeps.has(pkg.package),
          priority: 'low', // Will be calculated
          priorityScore: 0, // Will be calculated
          priorityReasons: [], // Will be calculated
          severity: pkg.severity // Legacy
        };
      })
    );
    packages.push(...results);
  }

  // Build blocking relationships
  buildBlockingRelationships(packages, packageJson);

  // Calculate priority scores
  for (const pkg of packages) {
    const { score, reasons } = calculatePriorityScore(pkg, packages);
    pkg.priorityScore = score;
    pkg.priorityReasons = reasons;
    pkg.priority = getPriorityTier(score);
    pkg.severity = tierToSeverity(pkg.priority);
  }

  // Sort by priority score
  packages.sort((a, b) => b.priorityScore - a.priorityScore);

  // Generate upgrade paths
  const upgradePaths = generateUpgradePaths(packages);

  // Identify quick wins
  const quickWins = identifyQuickWins(packages);

  // Build summary
  const summary = {
    totalOutdated: packages.length,
    criticalCount: packages.filter(p => p.priority === 'critical').length,
    highCount: packages.filter(p => p.priority === 'high').length,
    mediumCount: packages.filter(p => p.priority === 'medium').length,
    lowCount: packages.filter(p => p.priority === 'low').length,
    deprecatedCount: packages.filter(p => p.isDeprecated).length,
    avgVersionsBehind: packages.length > 0
      ? Math.round(packages.reduce((sum, p) => sum + p.versionDistance.totalBehind, 0) / packages.length)
      : 0,
    byCategory: packages.reduce((acc, p) => {
      acc[p.category] = (acc[p.category] || 0) + 1;
      return acc;
    }, {}),
    upgradePaths,
    quickWins
  };

  console.log(`[Prioritization] Analysis complete: ${summary.criticalCount} critical, ${summary.highCount} high, ${summary.deprecatedCount} deprecated`);

  return {
    enhancedDependencies: packages,
    dependencyAnalysis: summary
  };
}
