import { BridgeMetrics } from '../types';

// Sample repositories for preview mode
export const sampleRepositories = [
  {
    id: 1,
    name: 'frontend-app',
    owner: 'acme-corp',
    repoUrl: 'https://github.com/acme-corp/frontend-app',
    lastScore: 72,
    lastScanId: 1,
    lastScanDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 2,
    name: 'api-service',
    owner: 'acme-corp',
    repoUrl: 'https://github.com/acme-corp/api-service',
    lastScore: 85,
    lastScanId: 2,
    lastScanDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 3,
    name: 'shared-components',
    owner: 'acme-corp',
    repoUrl: 'https://github.com/acme-corp/shared-components',
    lastScore: 58,
    lastScanId: 3,
    lastScanDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 4,
    name: 'mobile-app',
    owner: 'acme-corp',
    repoUrl: 'https://github.com/acme-corp/mobile-app',
    lastScore: 91,
    lastScanId: 4,
    lastScanDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  }
];

// Sample metrics for the frontend-app repository
export const sampleMetrics: BridgeMetrics = {
  id: 1,
  status: 'completed',
  meta: {
    scanDate: new Date().toISOString(),
    projectName: 'frontend-app',
    repoUrl: 'https://github.com/acme-corp/frontend-app',
    totalFiles: 247,
    sloc: 45000,
    repoAgeDays: 730,
    branchCount: 23,
    deadBranchCount: 5,
    staleBranches: [
      { name: 'feature/old-payment', daysSinceUpdate: 245, status: 'dead' as const, lastCommitDate: '2024-05-01' },
      { name: 'fix/legacy-auth', daysSinceUpdate: 198, status: 'dead' as const, lastCommitDate: '2024-07-15' },
      { name: 'experiment/new-ui', daysSinceUpdate: 180, status: 'dead' as const, lastCommitDate: '2024-08-01' },
      { name: 'feature/dark-mode-v1', daysSinceUpdate: 165, status: 'dead' as const, lastCommitDate: '2024-08-15' },
      { name: 'refactor/api-layer', daysSinceUpdate: 120, status: 'dead' as const, lastCommitDate: '2024-09-22' },
      { name: 'feature/notifications', daysSinceUpdate: 95, status: 'stale' as const, lastCommitDate: '2024-10-17' }
    ],
    languageBreakdown: {
      TypeScript: 85,
      JavaScript: 8,
      CSS: 5,
      HTML: 2
    },
    hasTypeScript: true,
    hasMixedTsJs: true,
    testFileCount: 45,
    hasTestConfig: true,
    hasReadme: true,
    readmeLength: 2500,
    hasChangelog: true,
    hasContributing: false
  },
  score: {
    total: 72,
    grade: 'C',
    status: 'Needs Attention',
    executiveSummary: 'This codebase has moderate technical debt that should be addressed. There are 12 outdated dependencies including 2 with security vulnerabilities. The architecture shows 3 circular dependency chains that could impact maintainability. Recommend prioritizing dependency updates and refactoring the shared utilities module.',
    breakdown: {
      dependencies: 68,
      architecture: 70,
      codeQuality: 75,
      testing: 80,
      documentation: 65
    },
    weights: {
      dependencies: 0.30,
      architecture: 0.25,
      codeQuality: 0.20,
      testing: 0.15,
      documentation: 0.10
    },
    tasks: [
      {
        id: '1',
        rank: 1,
        title: 'Update lodash to fix security vulnerability',
        description: 'lodash has a known prototype pollution vulnerability in versions < 4.17.21',
        category: 'dependencies',
        impact: 'critical',
        effort: 'trivial',
        consequence: 'Potential security breach through prototype pollution attack',
        command: 'npm update lodash'
      },
      {
        id: '2',
        rank: 2,
        title: 'Remove 5 unused dependencies',
        description: 'moment, underscore, and 3 others are installed but never imported',
        category: 'dependencies',
        impact: 'medium',
        effort: 'light',
        consequence: 'Reduces bundle size by ~150KB and speeds up installs',
        command: 'npm uninstall moment underscore query-string is-promise is-url'
      },
      {
        id: '3',
        rank: 3,
        title: 'Break circular dependency in utils module',
        description: 'utils/index.ts → helpers/format.ts → utils/date.ts → utils/index.ts',
        category: 'architecture',
        impact: 'high',
        effort: 'medium',
        consequence: 'Prevents potential runtime issues and improves testability',
        suggestion: 'Extract shared types to a separate types.ts file'
      },
      {
        id: '4',
        rank: 4,
        title: 'Address 23 TODO comments',
        description: 'Found TODO/FIXME comments indicating incomplete work',
        category: 'codeQuality',
        impact: 'medium',
        effort: 'medium',
        consequence: 'Reduces technical debt and improves code completeness'
      },
      {
        id: '5',
        rank: 5,
        title: 'Add CONTRIBUTING.md',
        description: 'Missing contribution guidelines for the project',
        category: 'documentation',
        impact: 'low',
        effort: 'light',
        consequence: 'Improves onboarding for new contributors'
      }
    ],
    stats: {
      totalIssues: 28,
      criticalIssues: 2,
      highIssues: 5,
      mediumIssues: 15,
      lowIssues: 6
    }
  },
  issues: {
    circularDependencies: [
      { cycle: ['utils/index.ts', 'helpers/format.ts', 'utils/date.ts', 'utils/index.ts'], severity: 'critical' },
      { cycle: ['components/Modal.tsx', 'hooks/useModal.ts', 'components/Modal.tsx'], severity: 'warning' },
      { cycle: ['services/api.ts', 'services/auth.ts', 'services/api.ts'], severity: 'warning' }
    ],
    barrelFiles: [
      { path: 'components/index.ts', exports: 45, risk: 'high' },
      { path: 'utils/index.ts', exports: 28, risk: 'medium' },
      { path: 'hooks/index.ts', exports: 12, risk: 'low' }
    ],
    unusedDependencies: ['moment', 'underscore', 'query-string', 'is-promise', 'is-url'],
    missingDependencies: {},
    outdatedDependencies: [
      { package: 'lodash', current: '4.17.19', latest: '4.17.21', severity: 'High' },
      { package: 'react', current: '18.2.0', latest: '18.3.1', severity: 'Low' },
      { package: 'typescript', current: '5.0.4', latest: '5.3.3', severity: 'Medium' },
      { package: 'vite', current: '4.5.0', latest: '5.4.0', severity: 'Medium' },
      { package: '@types/react', current: '18.2.0', latest: '18.3.0', severity: 'Low' }
    ],
    enhancedDependencies: [
      {
        package: 'lodash',
        current: '4.17.19',
        latest: '4.17.21',
        versionDistance: { major: 0, minor: 0, patch: 2, totalBehind: 2 },
        isDeprecated: false,
        peerDependencies: [],
        dependsOn: [],
        blockedBy: [],
        blocks: [],
        priority: 'critical',
        priorityScore: 95,
        priorityReasons: ['Security vulnerability', 'Patch update available'],
        category: 'utility',
        isDevDependency: false,
        severity: 'High'
      }
    ]
  },
  codeQuality: {
    todoCount: 23,
    consoleLogCount: 8,
    deepDirectories: 2,
    todoItems: [
      { file: 'src/components/Dashboard.tsx', line: 45, type: 'TODO', text: 'Add loading state', context: '// TODO: Add loading state' },
      { file: 'src/utils/api.ts', line: 78, type: 'FIXME', text: 'Handle error cases', context: '// FIXME: Handle error cases' },
      { file: 'src/hooks/useAuth.ts', line: 23, type: 'TODO', text: 'Implement refresh token', context: '// TODO: Implement refresh token' }
    ],
    consoleLogItems: [
      { file: 'src/services/api.ts', line: 34, type: 'log', context: 'console.log("API response:", data)' },
      { file: 'src/components/Form.tsx', line: 89, type: 'error', context: 'console.error("Form validation failed")' }
    ]
  }
};

// Aggregate stats for organization overview
export const sampleOrgStats = {
  totalRepos: 4,
  avgScore: 76.5,
  totalIssues: 47,
  criticalIssues: 3,
  reposNeedingAttention: 2,
  scoreDistribution: {
    excellent: 1,  // 90+
    good: 1,       // 70-89
    fair: 1,       // 50-69
    poor: 1        // <50
  },
  topIssues: [
    { type: 'Outdated Dependencies', count: 23, repos: ['frontend-app', 'shared-components'] },
    { type: 'Circular Dependencies', count: 8, repos: ['frontend-app', 'api-service'] },
    { type: 'Unused Dependencies', count: 12, repos: ['frontend-app', 'shared-components', 'mobile-app'] },
    { type: 'TODO Comments', count: 45, repos: ['frontend-app', 'api-service', 'shared-components'] }
  ],
  trends: [
    { date: '2024-12-01', avgScore: 68 },
    { date: '2024-12-08', avgScore: 70 },
    { date: '2024-12-15', avgScore: 72 },
    { date: '2024-12-22', avgScore: 74 },
    { date: '2024-12-29', avgScore: 75 },
    { date: '2025-01-05', avgScore: 76 },
    { date: '2025-01-12', avgScore: 76.5 }
  ]
};
