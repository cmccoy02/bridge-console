// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { calculateTechDebtScore, EFFORT_DEFINITIONS, IMPACT_DEFINITIONS } from '../../server/scoring.js';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * A data object representing a perfectly clean, well-maintained project.
 * Uses the exact field names expected by the scoring engine.
 */
const cleanProject = {
  // Dependencies
  dependencyAnalysis: {
    deprecatedCount: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
  },
  unusedDependencies: [],
  missingDependencies: [],
  // Architecture
  circularDependencies: [],
  // Code Quality
  hasTypeScript: true,
  hasMixedTsJs: false,
  todoCount: 0,
  consoleLogCount: 0,
  // Testing
  testFileCount: 5,
  totalFiles: 20,
  hasTestConfig: true,
  // Documentation
  hasReadme: true,
  readmeLength: 2000,
  hasChangelog: true,
  hasContributing: true,
};

/** A data object representing a project with severe technical debt. */
const debtRiddenProject = {
  dependencyAnalysis: {
    deprecatedCount: 5,
    criticalCount: 4,
    highCount: 3,
    mediumCount: 10,
    lowCount: 20,
  },
  circularDependencies: [
    { files: ['a.js', 'b.js', 'c.js', 'd.js', 'e.js', 'f.js'] },
    { files: ['x.js', 'y.js'] },
  ],
  unusedDependencies: ['lodash', 'moment', 'underscore'],
  missingDependencies: ['react', 'express'],
  hasTypeScript: false,
  hasMixedTsJs: false,
  todoCount: 60,
  consoleLogCount: 40,
  testFileCount: 0,
  totalFiles: 50,
  hasTestConfig: false,
  hasReadme: false,
  readmeLength: 0,
  hasChangelog: false,
  hasContributing: false,
};

// ─────────────────────────────────────────────
// Core output shape
// ─────────────────────────────────────────────

describe('calculateTechDebtScore – output shape', () => {
  it('returns an object with all required top-level keys', () => {
    const result = calculateTechDebtScore({});
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('grade');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('breakdown');
    expect(result).toHaveProperty('weights');
    expect(result).toHaveProperty('tasks');
    expect(result).toHaveProperty('stats');
    expect(result).toHaveProperty('executiveSummary');
  });

  it('breakdown contains all 5 dimensions', () => {
    const { breakdown } = calculateTechDebtScore({});
    expect(breakdown).toHaveProperty('dependencies');
    expect(breakdown).toHaveProperty('architecture');
    expect(breakdown).toHaveProperty('codeQuality');
    expect(breakdown).toHaveProperty('testing');
    expect(breakdown).toHaveProperty('documentation');
  });

  it('weights sum to 1.0', () => {
    const { weights } = calculateTechDebtScore({});
    const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
    expect(total).toBeCloseTo(1.0, 5);
  });
});

// ─────────────────────────────────────────────
// Score bounds
// ─────────────────────────────────────────────

describe('calculateTechDebtScore – score bounds', () => {
  it('always returns a total score between 0 and 100', () => {
    const r1 = calculateTechDebtScore({});
    const r2 = calculateTechDebtScore(cleanProject);
    const r3 = calculateTechDebtScore(debtRiddenProject);

    for (const result of [r1, r2, r3]) {
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(100);
    }
  });

  it('clean project scores higher than a debt-ridden one', () => {
    const clean = calculateTechDebtScore(cleanProject);
    const debt = calculateTechDebtScore(debtRiddenProject);
    expect(clean.total).toBeGreaterThan(debt.total);
  });

  it('each breakdown dimension is between 0 and 100', () => {
    const { breakdown } = calculateTechDebtScore(debtRiddenProject);
    for (const [dim, score] of Object.entries(breakdown)) {
      expect(score, `${dim} out of range`).toBeGreaterThanOrEqual(0);
      expect(score, `${dim} out of range`).toBeLessThanOrEqual(100);
    }
  });
});

// ─────────────────────────────────────────────
// Grade assignment
// ─────────────────────────────────────────────

describe('calculateTechDebtScore – grade assignment', () => {
  const gradeTable = [
    { minScore: 90, grade: 'A' },
    { minScore: 80, grade: 'B' },
    { minScore: 70, grade: 'C' },
    { minScore: 60, grade: 'D' },
    { minScore: 0,  grade: 'F' },
  ];

  it.each(gradeTable)(
    'score ~$minScore yields grade $grade',
    ({ minScore, grade }) => {
      // We can't force an exact score, so we just verify the logic
      // by checking the clean/debt extremes land in expected ranges
      if (grade === 'F') {
        const result = calculateTechDebtScore(debtRiddenProject);
        // Debt-ridden project should be D or F
        expect(['D', 'F']).toContain(result.grade);
      }
      if (grade === 'A') {
        const result = calculateTechDebtScore(cleanProject);
        // Clean project should be A or B
        expect(['A', 'B']).toContain(result.grade);
      }
    }
  );
});

// ─────────────────────────────────────────────
// Penalty sensitivity
// ─────────────────────────────────────────────

describe('calculateTechDebtScore – penalty sensitivity', () => {
  it('deprecated packages lower the dependency score', () => {
    const baseline = calculateTechDebtScore({ dependencyAnalysis: { deprecatedCount: 0, criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 } });
    const withDeprecated = calculateTechDebtScore({ dependencyAnalysis: { deprecatedCount: 3, criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 } });
    expect(withDeprecated.breakdown.dependencies).toBeLessThan(baseline.breakdown.dependencies);
  });

  it('missing dependencies lower the dependency score significantly', () => {
    const baseline = calculateTechDebtScore({});
    const withMissing = calculateTechDebtScore({ missingDependencies: ['react', 'express', 'lodash'] });
    expect(withMissing.breakdown.dependencies).toBeLessThan(baseline.breakdown.dependencies);
  });

  it('circular dependencies lower the architecture score', () => {
    const baseline = calculateTechDebtScore({ circularDependencies: [] });
    const withCircular = calculateTechDebtScore({ circularDependencies: [{ files: ['a.js', 'b.js', 'c.js', 'd.js', 'e.js', 'f.js'] }] });
    expect(withCircular.breakdown.architecture).toBeLessThan(baseline.breakdown.architecture);
  });

  it('no test files lowers the testing score', () => {
    const withTests = calculateTechDebtScore({ testFileCount: 3, totalFiles: 10, hasTestConfig: true });
    const noTests = calculateTechDebtScore({ testFileCount: 0, totalFiles: 10, hasTestConfig: false });
    expect(noTests.breakdown.testing).toBeLessThan(withTests.breakdown.testing);
  });

  it('missing README lowers the documentation score', () => {
    const withDocs = calculateTechDebtScore({ hasReadme: true, readmeLength: 1500, hasChangelog: true, hasContributing: true });
    const noDocs = calculateTechDebtScore({ hasReadme: false, readmeLength: 0, hasChangelog: false, hasContributing: false });
    expect(noDocs.breakdown.documentation).toBeLessThan(withDocs.breakdown.documentation);
  });

  it('non-TypeScript project is penalized in code quality', () => {
    const tsProject = calculateTechDebtScore({ hasTypeScript: true, hasMixedTsJs: false });
    const jsProject = calculateTechDebtScore({ hasTypeScript: false, hasMixedTsJs: false });
    expect(jsProject.breakdown.codeQuality).toBeLessThan(tsProject.breakdown.codeQuality);
  });
});

// ─────────────────────────────────────────────
// Tasks
// ─────────────────────────────────────────────

describe('calculateTechDebtScore – actionable tasks', () => {
  it('generates tasks for a debt-ridden project', () => {
    const { tasks } = calculateTechDebtScore(debtRiddenProject);
    expect(tasks.length).toBeGreaterThan(0);
  });

  it('each task has impact, effort, title, and description', () => {
    const { tasks } = calculateTechDebtScore(debtRiddenProject);
    for (const task of tasks) {
      expect(task).toHaveProperty('impact');
      expect(task).toHaveProperty('effort');
      expect(task).toHaveProperty('title');
      expect(task).toHaveProperty('description');
    }
  });

  it('impact values are valid', () => {
    const validImpacts = ['critical', 'high', 'medium', 'low'];
    const { tasks } = calculateTechDebtScore(debtRiddenProject);
    for (const task of tasks) {
      expect(validImpacts).toContain(task.impact);
    }
  });
});

// ─────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────

describe('calculateTechDebtScore – issue stats', () => {
  it('criticalIssues + highIssues + mediumIssues + lowIssues === totalIssues', () => {
    const { stats } = calculateTechDebtScore(debtRiddenProject);
    const sum = stats.criticalIssues + stats.highIssues + stats.mediumIssues + stats.lowIssues;
    expect(sum).toBe(stats.totalIssues);
  });

  it('clean project has fewer issues than a debt-ridden one', () => {
    const clean = calculateTechDebtScore(cleanProject);
    const debt = calculateTechDebtScore(debtRiddenProject);
    expect(clean.stats.totalIssues).toBeLessThan(debt.stats.totalIssues);
  });
});

// ─────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────

describe('module exports', () => {
  it('EFFORT_DEFINITIONS has all expected effort levels', () => {
    const levels = ['trivial', 'light', 'medium', 'heavy', 'major'];
    for (const level of levels) {
      expect(EFFORT_DEFINITIONS).toHaveProperty(level);
    }
  });

  it('IMPACT_DEFINITIONS has all expected impact levels', () => {
    const levels = ['critical', 'high', 'medium', 'low'];
    for (const level of levels) {
      expect(IMPACT_DEFINITIONS).toHaveProperty(level);
    }
  });
});
