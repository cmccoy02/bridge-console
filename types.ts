// Priority tiers for dependency updates
export type PriorityTier = 'critical' | 'high' | 'medium' | 'low';

// Score dimension detail for breakdown display
export interface ScoreDimensionDetail {
  score: number;
  weight: number;
  weightedScore: number;
  penalty: number;
  details: string[];
  issues?: Array<{
    type: string;
    count?: number;
    severity: string;
    message: string;
  }>;
}

// Actionable task generated from scoring
export interface ActionableTask {
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

// Issue stats for summary view
export interface IssueStats {
  totalIssues: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
}

// Status details with color coding
export interface StatusDetails {
  label: string;
  color: string;
  description: string;
}

// Version distance breakdown
export interface VersionDistance {
  major: number;      // Number of major versions behind
  minor: number;      // Number of minor versions behind
  patch: number;      // Number of patch versions behind
  totalBehind: number; // Weighted score: major*100 + minor*10 + patch
}

// Enhanced outdated dependency with full analysis
export interface EnhancedOutdatedDependency {
  package: string;
  current: string;
  latest: string;

  // Version analysis
  versionDistance: VersionDistance;
  isDeprecated: boolean;
  deprecationMessage?: string;

  // Relationship analysis
  peerDependencies: string[];     // Packages that should be upgraded together
  dependsOn: string[];            // Packages this one depends on
  blockedBy: string[];            // Packages that must be upgraded first
  blocks: string[];               // Packages waiting on this upgrade

  // Prioritization
  priority: PriorityTier;
  priorityScore: number;          // 0-100, higher = more urgent
  priorityReasons: string[];      // Why this priority was assigned

  // Categorization
  category: 'core-framework' | 'build-tool' | 'testing' | 'utility' | 'type-definitions' | 'other';
  isDevDependency: boolean;

  // Legacy field for backwards compatibility
  severity: 'Low' | 'Medium' | 'High';
}

// Upgrade path recommendation
export interface UpgradePath {
  order: number;
  packages: string[];             // Packages to upgrade in this step
  reason: string;                 // Why these go together
  effort: 'low' | 'medium' | 'high';
  riskLevel: 'safe' | 'review' | 'breaking';
  unlocks: string[];              // What can be upgraded after this
}

// Dependency analysis summary
export interface DependencyAnalysisSummary {
  totalOutdated: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  deprecatedCount: number;
  avgVersionsBehind: number;

  // Grouped by category
  byCategory: Record<string, number>;

  // Suggested upgrade paths
  upgradePaths: UpgradePath[];

  // Quick wins - high impact, low effort
  quickWins: string[];
}

export interface BridgeMetrics {
  id?: number; // Database ID
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  meta: {
    scanDate: string;
    projectName: string;
    repoUrl?: string;
    totalFiles: number;
    sloc: number;
    // Git Metrics
    repoAgeDays?: number;
    languageBreakdown?: Record<string, number>; // { TypeScript: 80, CSS: 20 }
    branchCount?: number;
    deadBranchCount?: number;
    staleBranches?: Array<{
      name: string;
      daysSinceUpdate: number;
      status: 'dead' | 'stale' | 'active';
      lastCommitDate: string;
    }>;
    // Code Quality Metrics
    hasTypeScript?: boolean;
    hasMixedTsJs?: boolean;
    testFileCount?: number;
    hasTestConfig?: boolean;
    hasReadme?: boolean;
    readmeLength?: number;
    hasChangelog?: boolean;
    hasContributing?: boolean;
  };
  score: {
    total: number;
    grade?: 'A' | 'B' | 'C' | 'D' | 'F';
    status?: string;
    statusDetails?: StatusDetails;

    // Executive summary for non-technical stakeholders
    executiveSummary?: string;

    // New 5-category breakdown
    breakdown: {
      dependencies?: number;
      architecture?: number;
      codeQuality?: number;
      testing?: number;
      documentation?: number;
      // Legacy fields for backwards compatibility
      coupling?: number;
      freshness?: number;
      cleanliness?: number;
      complexity?: number;
      hygiene?: number;
    };

    // Weight information for transparency
    weights?: {
      dependencies?: number;
      architecture?: number;
      codeQuality?: number;
      testing?: number;
      documentation?: number;
    };

    details?: {
      dependencies?: ScoreDimensionDetail;
      architecture?: ScoreDimensionDetail;
      codeQuality?: ScoreDimensionDetail;
      testing?: ScoreDimensionDetail;
      documentation?: ScoreDimensionDetail;
      // Legacy fields
      coupling?: ScoreDimensionDetail;
      freshness?: ScoreDimensionDetail;
      cleanliness?: ScoreDimensionDetail;
      complexity?: ScoreDimensionDetail;
      hygiene?: ScoreDimensionDetail;
    };

    // Actionable tasks for developers
    tasks?: ActionableTask[];

    // Issue statistics
    stats?: IssueStats;

    // Legacy summary format
    summary?: {
      issueCount: number;
      topIssues: string[];
      recommendations: Array<{
        priority: 'critical' | 'high' | 'medium' | 'low';
        category: string;
        action: string;
        impact: string;
      }>;
    };
  };
  issues: {
    circularDependencies: Array<{
      cycle: string[];
      severity: 'critical' | 'warning';
    }>;
    barrelFiles: Array<{
      path: string;
      exports: number;
      risk: 'high' | 'medium' | 'low';
    }>;
    unusedDependencies: string[];
    missingDependencies: Record<string, string[]>; // { "missing-pkg": ["file1.ts", "file2.ts"] }

    // Legacy format for backwards compatibility
    outdatedDependencies: Array<{
      package: string;
      current: string;
      latest: string;
      severity: 'Low' | 'Medium' | 'High';
    }>;

    // Enhanced dependency analysis
    enhancedDependencies?: EnhancedOutdatedDependency[];
    dependencyAnalysis?: DependencyAnalysisSummary;
  };
  aiAnalysis?: {
    score: number;
    forecast: Array<{
      period: string;
      predictedScore: number;
      confidence: string;
    }>;
    insights: Array<{
      category: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      description: string;
      impact: string;
    }>;
    prioritization: Array<{
      rank: number;
      task: string;
      effort: 'low' | 'medium' | 'high';
      impact: 'low' | 'medium' | 'high';
      reasoning: string;
    }>;
    summary: string;
  };
  codeQuality?: {
    todoCount: number;
    consoleLogCount: number;
    deepDirectories?: number;
    todoItems?: Array<{
      file: string;
      line: number;
      type: string;
      text: string;
      context: string;
    }>;
    consoleLogItems?: Array<{
      file: string;
      line: number;
      type: string;
      context: string;
    }>;
  };
}

// ===== AGENT TYPES =====

export type AgentType =
  | 'package-update'
  | 'unused-deps'
  | 'security-audit'
  | 'code-cleanup';

export interface AgentConfig {
  autoApprove?: boolean;
  createPR?: boolean;
  branchPrefix?: string;
  // Package update specific
  updateStrategy?: 'patch' | 'minor' | 'major';
  excludePackages?: string[];
  // Code cleanup specific
  removeConsoleLogs?: boolean;
  removeTodos?: boolean;
}

export type AgentRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Agent {
  id: number;
  userId: number;
  name: string;
  type: AgentType;
  config: AgentConfig;
  schedule: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRunResult {
  success: boolean;
  changes?: string[];
  errors?: string[];
  prUrl?: string;
}

export interface AgentRun {
  id: number;
  agentId: number;
  repositoryId: number;
  status: AgentRunStatus;
  startedAt: string | null;
  completedAt: string | null;
  result: AgentRunResult | null;
  logs: string | null;
  createdAt: string;
}

// ===== UPDATE JOB TYPES =====

export interface UpdateJobProgress {
  phase: string;
  step: number;
  totalSteps: number;
  percent: number;
  detail?: string;
  timestamp?: string;
}

export interface PackageChange {
  name: string;
  from: string;
  to: string;
  isDev: boolean;
}

export interface UpdateJobResult {
  prUrl?: string;
  prNumber?: number;
  changedPackages: PackageChange[];
  baseBranch?: string;
  headBranch?: string;
  message?: string;
  error?: string;
}

export type UpdateJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface UpdateJob {
  id: number;
  repositoryId: number;
  userId: number;
  status: UpdateJobStatus;
  progress: UpdateJobProgress | null;
  result: UpdateJobResult | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

// ===== AUTOMATION SETTINGS =====

export type AutomationFrequency = 'manual' | 'daily' | 'weekly' | 'monthly';

export interface AutomationSettings {
  id?: number;
  repositoryId: number;

  // Scan automation
  scanEnabled: boolean;
  scanFrequency: AutomationFrequency;
  scanDayOfWeek?: number; // 0-6 for weekly
  scanDayOfMonth?: number; // 1-31 for monthly
  scanTime?: string; // HH:MM format

  // Patch update automation
  patchEnabled: boolean;
  patchFrequency: AutomationFrequency;
  patchDayOfWeek?: number;
  patchDayOfMonth?: number;
  patchTime?: string;
  patchAutoMerge?: boolean;

  // Report automation
  reportEnabled: boolean;
  reportFrequency: AutomationFrequency;
  reportDayOfWeek?: number;
  reportDayOfMonth?: number;
  reportTime?: string;
  reportRecipients?: string[];

  // Timestamps
  createdAt?: string;
  updatedAt?: string;
}