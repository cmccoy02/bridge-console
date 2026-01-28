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
      language?: string;  // e.g., 'JavaScript', 'Python', 'Ruby', 'Elixir'
      packageManager?: string;  // e.g., 'npm', 'pip', 'bundler', 'mix'
    }>;

    // Enhanced dependency analysis
    enhancedDependencies?: EnhancedOutdatedDependency[];
    dependencyAnalysis?: DependencyAnalysisSummary;

    // Multi-language package analysis
    multiLanguagePackages?: MultiLanguagePackageAnalysis;
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

// Multi-language package detection types
export interface MultiLanguagePackageAnalysis {
  packageManagers: Array<{
    name: string;
    language: string;
  }>;
  byLanguage: Record<string, {
    packageManager: string;
    dependencies: Array<{
      name: string;
      currentVersion: string;
      constraint: string;
    }>;
    outdated: Array<{
      package: string;
      current: string;
      latest: string;
      severity: 'Low' | 'Medium' | 'High';
      language: string;
      packageManager: string;
    }>;
    totalPackages: number;
    outdatedCount: number;
    error?: string;
  }>;
  allOutdated: Array<{
    package: string;
    current: string;
    latest: string;
    severity: 'Low' | 'Medium' | 'High';
    language: string;
    packageManager: string;
  }>;
  summary: {
    totalPackages: number;
    totalOutdated: number;
    languages: string[];
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

// ===== SOFTWARE CAPITALIZATION (CapEx) TYPES =====

export type CapExCategory =
  | 'new-feature'          // Capitalizableork that adds new functionality
  | 'enhancement'          // Capitalizable - improvements to existing features
  | 'maintenance'          // Not capitalizable - keeping existing functionality working
  | 'bug-fix'              // Not capitalizable - fixing defects
  | 'infrastructure'       // Partially capitalizable - depends on context
  | 'technical-debt'       // Not capitalizable - paying down existing debt
  | 'documentation'        // Typically not capitalizable
  | 'testing'              // Partially capitalizable - if part of new feature
  | 'security';            // Partially capitalizable - depends on context

export interface CapExEntry {
  id?: number;
  repositoryId: number;
  userId: number;
  repoName?: string;               // Populated from JOIN in API responses
  repoUrl?: string;                // Populated from JOIN in API responses

  // Time tracking
  date: string;                    // YYYY-MM-DD format
  hoursSpent: number;              // Decimal hours (e.g., 2.5)

  // Categorization
  category: CapExCategory;
  isCapitalizable: boolean;        // Whether this work can be capitalized
  capitalizablePercent: number;    // 0-100, portion that's capitalizable

  // Description
  description: string;
  ticketId?: string;               // Jira/Linear/GitHub issue number
  prUrl?: string;                  // Associated PR URL

  // Calculated fields (for reporting)
  capitalizableHours?: number;     // hoursSpent * (capitalizablePercent / 100)
  expensedHours?: number;          // hoursSpent - capitalizableHours

  // Metadata
  createdAt?: string;
  updatedAt?: string;
}

export interface CapExSummary {
  repositoryId?: number;           // null for org-wide summary
  period: {
    start: string;
    end: string;
  };

  // Totals
  totalHours: number;
  capitalizableHours: number;
  expensedHours: number;
  capitalizationRate: number;      // Percentage (0-100)

  // By category
  byCategory: Record<CapExCategory, {
    hours: number;
    capitalizableHours: number;
    entries: number;
  }>;

  // By repository (for org-wide)
  byRepository?: Record<number, {
    name: string;
    hours: number;
    capitalizableHours: number;
  }>;

  // Trends
  weeklyTrend?: Array<{
    week: string;
    totalHours: number;
    capitalizableHours: number;
  }>;
}

export interface CapExSettings {
  id?: number;
  userId: number;

  // Default capitalization rates by category
  defaultRates: Record<CapExCategory, number>;

  // Fiscal year settings
  fiscalYearStart: string;         // MM-DD format (e.g., "01-01" for Jan 1)

  // Export settings
  exportFormat: 'csv' | 'xlsx' | 'json';

  createdAt?: string;
  updatedAt?: string;
}

// ===== ROADMAP TYPES =====

export type RoadmapItemStatus =
  | 'planned'              // Not started, on the roadmap
  | 'in-progress'          // Currently being worked on
  | 'blocked'              // Blocked by dependencies or issues
  | 'completed'            // Finished
  | 'cancelled';           // No longer planned

export type RoadmapItemPriority = 'critical' | 'high' | 'medium' | 'low';

export type RoadmapItemSource =
  | 'manual'               // Manually added by user
  | 'scan-task'            // Generated from Bridge scan
  | 'security-finding'     // From security scan
  | 'dependency-update'    // From dependency analysis
  | 'github-issue';        // Imported from GitHub

export interface RoadmapItem {
  id?: number;
  userId: number;
  repositoryId?: number;           // null for org-wide items
  repoName?: string;               // Populated from JOIN in API responses

  // Core fields
  title: string;
  description?: string;
  status: RoadmapItemStatus;
  priority: RoadmapItemPriority;

  // Source tracking
  source: RoadmapItemSource;
  sourceId?: string;               // ID from source system (scan ID, issue number, etc.)
  sourceUrl?: string;              // Link back to source

  // Timing
  targetDate?: string;             // When this should be completed
  startDate?: string;              // When work began
  completedDate?: string;          // When it was finished

  // Effort estimation
  estimatedHours?: number;
  actualHours?: number;

  // Dependencies
  blockedBy?: number[];            // IDs of items that block this one
  blocks?: number[];               // IDs of items this blocks

  // Categorization
  category?: string;               // e.g., "dependencies", "security", "architecture"
  tags?: string[];                 // Free-form tags

  // Assignment
  assignee?: string;               // GitHub username or email

  // Metadata
  createdAt?: string;
  updatedAt?: string;
}

export interface RoadmapMilestone {
  id?: number;
  userId: number;

  // Core fields
  title: string;
  description?: string;
  targetDate: string;

  // Status
  status: 'upcoming' | 'in-progress' | 'completed' | 'missed';
  completedDate?: string;

  // Items
  itemIds: number[];               // RoadmapItem IDs in this milestone

  // Progress
  totalItems: number;
  completedItems: number;
  progressPercent: number;

  // Metadata
  createdAt?: string;
  updatedAt?: string;
}

export interface RoadmapView {
  // Filter state
  repositories?: number[];         // Filter by repos (empty = all)
  statuses?: RoadmapItemStatus[];
  priorities?: RoadmapItemPriority[];
  dateRange?: {
    start: string;
    end: string;
  };

  // Aggregated data
  items: RoadmapItem[];
  milestones: RoadmapMilestone[];

  // Statistics
  stats: {
    totalItems: number;
    byStatus: Record<RoadmapItemStatus, number>;
    byPriority: Record<RoadmapItemPriority, number>;
    byRepository: Record<number, { name: string; count: number }>;
    overdueCount: number;
    upcomingCount: number;        // Due in next 14 days
  };

  // Timeline data for visualization
  timeline: Array<{
    date: string;
    items: RoadmapItem[];
    milestones: RoadmapMilestone[];
  }>;
}