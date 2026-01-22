/**
 * Multi-language package detection and outdated dependency checking
 * Supports: JavaScript/Node, Python, Ruby, Elixir, Go, Rust
 */

import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

// Package manager configurations
const PACKAGE_MANAGERS = {
  npm: {
    name: 'npm',
    language: 'JavaScript',
    lockFiles: ['package-lock.json', 'npm-shrinkwrap.json'],
    manifestFile: 'package.json',
    installCmd: 'npm install --ignore-scripts --no-audit --no-fund',
    outdatedCmd: null, // Handled separately via ncu
  },
  yarn: {
    name: 'yarn',
    language: 'JavaScript',
    lockFiles: ['yarn.lock'],
    manifestFile: 'package.json',
    installCmd: 'yarn install --ignore-scripts',
    outdatedCmd: 'yarn outdated --json',
  },
  pnpm: {
    name: 'pnpm',
    language: 'JavaScript',
    lockFiles: ['pnpm-lock.yaml'],
    manifestFile: 'package.json',
    installCmd: 'pnpm install --ignore-scripts',
    outdatedCmd: 'pnpm outdated --format json',
  },
  pip: {
    name: 'pip',
    language: 'Python',
    lockFiles: [],
    manifestFile: 'requirements.txt',
    installCmd: 'pip install -r requirements.txt --quiet',
    outdatedCmd: 'pip list --outdated --format=json',
  },
  pipenv: {
    name: 'pipenv',
    language: 'Python',
    lockFiles: ['Pipfile.lock'],
    manifestFile: 'Pipfile',
    installCmd: 'pipenv install',
    outdatedCmd: 'pipenv update --outdated --dry-run',
  },
  poetry: {
    name: 'poetry',
    language: 'Python',
    lockFiles: ['poetry.lock'],
    manifestFile: 'pyproject.toml',
    installCmd: 'poetry install --no-interaction',
    outdatedCmd: 'poetry show --outdated --no-ansi',
  },
  bundler: {
    name: 'bundler',
    language: 'Ruby',
    lockFiles: ['Gemfile.lock'],
    manifestFile: 'Gemfile',
    installCmd: 'bundle install --quiet',
    outdatedCmd: 'bundle outdated --parseable',
  },
  mix: {
    name: 'mix',
    language: 'Elixir',
    lockFiles: ['mix.lock'],
    manifestFile: 'mix.exs',
    installCmd: 'mix deps.get',
    outdatedCmd: 'mix hex.outdated',
  },
  cargo: {
    name: 'cargo',
    language: 'Rust',
    lockFiles: ['Cargo.lock'],
    manifestFile: 'Cargo.toml',
    installCmd: 'cargo fetch',
    outdatedCmd: 'cargo outdated --format json',
  },
  gomod: {
    name: 'go',
    language: 'Go',
    lockFiles: ['go.sum'],
    manifestFile: 'go.mod',
    installCmd: 'go mod download',
    outdatedCmd: null, // Go modules don't have built-in outdated check
  },
};

/**
 * Detect which package managers are present in a repository
 */
export async function detectPackageManagers(repoPath) {
  const detected = [];

  for (const [key, config] of Object.entries(PACKAGE_MANAGERS)) {
    const manifestPath = path.join(repoPath, config.manifestFile);
    if (await fs.pathExists(manifestPath)) {
      // Check for lock file to determine which JS package manager
      if (config.language === 'JavaScript') {
        // For JS, check lock files to determine npm vs yarn vs pnpm
        let hasLockFile = false;
        for (const lockFile of config.lockFiles) {
          if (await fs.pathExists(path.join(repoPath, lockFile))) {
            hasLockFile = true;
            break;
          }
        }
        // Only add npm if no other JS package manager detected
        if (key === 'npm' && !hasLockFile) {
          // Check if yarn.lock or pnpm-lock exists
          const hasYarn = await fs.pathExists(path.join(repoPath, 'yarn.lock'));
          const hasPnpm = await fs.pathExists(path.join(repoPath, 'pnpm-lock.yaml'));
          if (!hasYarn && !hasPnpm) {
            detected.push({ key, ...config });
          }
        } else if (hasLockFile) {
          detected.push({ key, ...config });
        }
      } else {
        detected.push({ key, ...config });
      }
    }
  }

  return detected;
}

/**
 * Parse Python requirements.txt file
 */
async function parsePythonRequirements(repoPath) {
  const reqPath = path.join(repoPath, 'requirements.txt');
  const deps = [];

  try {
    const content = await fs.readFile(reqPath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;

      // Parse package==version or package>=version etc.
      const match = trimmed.match(/^([a-zA-Z0-9_-]+)([<>=!~]+)?(.+)?$/);
      if (match) {
        deps.push({
          name: match[1],
          currentVersion: match[3] || 'unspecified',
          constraint: match[2] || '',
        });
      }
    }
  } catch (e) {
    console.warn('[PackageDetection] Failed to parse requirements.txt:', e.message);
  }

  return deps;
}

/**
 * Parse pyproject.toml for Poetry/Python projects
 */
async function parsePyprojectToml(repoPath) {
  const pyprojectPath = path.join(repoPath, 'pyproject.toml');
  const deps = [];

  try {
    const content = await fs.readFile(pyprojectPath, 'utf-8');

    // Simple TOML parsing for dependencies section
    const depsMatch = content.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(?:\[|$)/);
    if (depsMatch) {
      const depsSection = depsMatch[1];
      const lines = depsSection.split('\n');

      for (const line of lines) {
        const match = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*["']?([^"'\n]+)["']?/);
        if (match && match[1] !== 'python') {
          deps.push({
            name: match[1],
            currentVersion: match[2].replace(/[\^~>=<]/g, '').trim(),
            constraint: match[2],
          });
        }
      }
    }
  } catch (e) {
    console.warn('[PackageDetection] Failed to parse pyproject.toml:', e.message);
  }

  return deps;
}

/**
 * Parse Ruby Gemfile
 */
async function parseGemfile(repoPath) {
  const gemfilePath = path.join(repoPath, 'Gemfile');
  const deps = [];

  try {
    const content = await fs.readFile(gemfilePath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      // Match gem 'name', 'version' or gem 'name', '~> version'
      const match = line.match(/gem\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/);
      if (match) {
        deps.push({
          name: match[1],
          currentVersion: match[2] ? match[2].replace(/[~>=<\s]/g, '') : 'unspecified',
          constraint: match[2] || '',
        });
      }
    }
  } catch (e) {
    console.warn('[PackageDetection] Failed to parse Gemfile:', e.message);
  }

  return deps;
}

/**
 * Parse Elixir mix.exs
 */
async function parseMixExs(repoPath) {
  const mixPath = path.join(repoPath, 'mix.exs');
  const deps = [];

  try {
    const content = await fs.readFile(mixPath, 'utf-8');

    // Find defp deps do section
    const depsMatch = content.match(/defp?\s+deps(?:\(\))?\s+do\s*\[([\s\S]*?)\]/);
    if (depsMatch) {
      const depsSection = depsMatch[1];
      // Match {:name, "~> version"} or {:name, ">= version"}
      const depMatches = depsSection.matchAll(/\{:(\w+),\s*["']([^"']+)["']/g);

      for (const match of depMatches) {
        deps.push({
          name: match[1],
          currentVersion: match[2].replace(/[~>=<\s]/g, ''),
          constraint: match[2],
        });
      }
    }
  } catch (e) {
    console.warn('[PackageDetection] Failed to parse mix.exs:', e.message);
  }

  return deps;
}

/**
 * Parse Rust Cargo.toml
 */
async function parseCargoToml(repoPath) {
  const cargoPath = path.join(repoPath, 'Cargo.toml');
  const deps = [];

  try {
    const content = await fs.readFile(cargoPath, 'utf-8');

    // Parse [dependencies] section
    const depsMatch = content.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/);
    if (depsMatch) {
      const depsSection = depsMatch[1];
      const lines = depsSection.split('\n');

      for (const line of lines) {
        // Match name = "version" or name = { version = "x.x" }
        const simpleMatch = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*["']([^"']+)["']/);
        const complexMatch = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*\{[^}]*version\s*=\s*["']([^"']+)["']/);

        const match = simpleMatch || complexMatch;
        if (match) {
          deps.push({
            name: match[1],
            currentVersion: match[2].replace(/[\^~>=<]/g, ''),
            constraint: match[2],
          });
        }
      }
    }
  } catch (e) {
    console.warn('[PackageDetection] Failed to parse Cargo.toml:', e.message);
  }

  return deps;
}

/**
 * Parse Go go.mod file
 */
async function parseGoMod(repoPath) {
  const goModPath = path.join(repoPath, 'go.mod');
  const deps = [];

  try {
    const content = await fs.readFile(goModPath, 'utf-8');
    const lines = content.split('\n');
    let inRequire = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('require (')) {
        inRequire = true;
        continue;
      }
      if (trimmed === ')') {
        inRequire = false;
        continue;
      }

      // Match require statements
      const reqMatch = trimmed.match(/^(?:require\s+)?([^\s]+)\s+v?([^\s]+)/);
      if (reqMatch && (inRequire || trimmed.startsWith('require '))) {
        deps.push({
          name: reqMatch[1],
          currentVersion: reqMatch[2],
          constraint: reqMatch[2],
        });
      }
    }
  } catch (e) {
    console.warn('[PackageDetection] Failed to parse go.mod:', e.message);
  }

  return deps;
}

/**
 * Check for outdated Python packages
 */
async function checkPythonOutdated(repoPath, timeout = 60000) {
  const outdated = [];

  try {
    // Try pip list --outdated
    const { stdout } = await execPromise('pip list --outdated --format=json', {
      cwd: repoPath,
      timeout,
    });

    const packages = JSON.parse(stdout);
    for (const pkg of packages) {
      outdated.push({
        package: pkg.name,
        current: pkg.version,
        latest: pkg.latest_version,
        severity: determineSeverity(pkg.version, pkg.latest_version),
        language: 'Python',
        packageManager: 'pip',
      });
    }
  } catch (e) {
    console.warn('[PackageDetection] pip outdated check failed:', e.message);
  }

  return outdated;
}

/**
 * Check for outdated Ruby gems
 */
async function checkRubyOutdated(repoPath, timeout = 60000) {
  const outdated = [];

  try {
    const { stdout } = await execPromise('bundle outdated --parseable', {
      cwd: repoPath,
      timeout,
    });

    // Parse output: gem-name (newest x.x.x, installed x.x.x)
    const lines = stdout.split('\n');
    for (const line of lines) {
      const match = line.match(/^([^\s]+)\s+\(newest\s+([^,]+),\s+installed\s+([^)]+)\)/);
      if (match) {
        outdated.push({
          package: match[1],
          current: match[3],
          latest: match[2],
          severity: determineSeverity(match[3], match[2]),
          language: 'Ruby',
          packageManager: 'bundler',
        });
      }
    }
  } catch (e) {
    // bundle outdated returns exit code 1 when there are outdated gems
    if (e.stdout) {
      const lines = e.stdout.split('\n');
      for (const line of lines) {
        const match = line.match(/([^\s]+)\s+\(newest\s+([^,]+),\s+installed\s+([^,)]+)/);
        if (match) {
          outdated.push({
            package: match[1],
            current: match[3],
            latest: match[2],
            severity: determineSeverity(match[3], match[2]),
            language: 'Ruby',
            packageManager: 'bundler',
          });
        }
      }
    } else {
      console.warn('[PackageDetection] bundle outdated check failed:', e.message);
    }
  }

  return outdated;
}

/**
 * Check for outdated Elixir packages
 */
async function checkElixirOutdated(repoPath, timeout = 60000) {
  const outdated = [];

  try {
    const { stdout } = await execPromise('mix hex.outdated', {
      cwd: repoPath,
      timeout,
    });

    // Parse mix hex.outdated output
    const lines = stdout.split('\n');
    for (const line of lines) {
      // Match: package_name    1.0.0    1.2.0    update possible
      const match = line.match(/^([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+(update|major)/i);
      if (match) {
        outdated.push({
          package: match[1],
          current: match[2],
          latest: match[3],
          severity: match[4].toLowerCase() === 'major' ? 'High' : 'Medium',
          language: 'Elixir',
          packageManager: 'mix',
        });
      }
    }
  } catch (e) {
    console.warn('[PackageDetection] mix hex.outdated check failed:', e.message);
  }

  return outdated;
}

/**
 * Check for outdated Rust crates
 */
async function checkRustOutdated(repoPath, timeout = 60000) {
  const outdated = [];

  try {
    // cargo-outdated must be installed: cargo install cargo-outdated
    const { stdout } = await execPromise('cargo outdated --format json', {
      cwd: repoPath,
      timeout,
    });

    const data = JSON.parse(stdout);
    if (data.dependencies) {
      for (const dep of data.dependencies) {
        if (dep.project !== dep.latest) {
          outdated.push({
            package: dep.name,
            current: dep.project,
            latest: dep.latest,
            severity: determineSeverity(dep.project, dep.latest),
            language: 'Rust',
            packageManager: 'cargo',
          });
        }
      }
    }
  } catch (e) {
    console.warn('[PackageDetection] cargo outdated check failed:', e.message);
  }

  return outdated;
}

/**
 * Determine severity based on semver difference
 */
function determineSeverity(current, latest) {
  try {
    // Extract major version numbers
    const currentMajor = parseInt(current.replace(/^v?/, '').split('.')[0] || '0');
    const latestMajor = parseInt(latest.replace(/^v?/, '').split('.')[0] || '0');

    if (latestMajor > currentMajor + 2) return 'High';
    if (latestMajor > currentMajor) return 'Medium';
    return 'Low';
  } catch (e) {
    return 'Medium';
  }
}

/**
 * Parse dependencies from manifest file based on package manager
 */
export async function parseDependencies(repoPath, packageManager) {
  switch (packageManager.key) {
    case 'pip':
      return parsePythonRequirements(repoPath);
    case 'poetry':
      return parsePyprojectToml(repoPath);
    case 'bundler':
      return parseGemfile(repoPath);
    case 'mix':
      return parseMixExs(repoPath);
    case 'cargo':
      return parseCargoToml(repoPath);
    case 'gomod':
      return parseGoMod(repoPath);
    default:
      return [];
  }
}

/**
 * Check for outdated packages for a specific package manager
 */
export async function checkOutdated(repoPath, packageManager, timeout = 60000) {
  switch (packageManager.key) {
    case 'pip':
    case 'pipenv':
    case 'poetry':
      return checkPythonOutdated(repoPath, timeout);
    case 'bundler':
      return checkRubyOutdated(repoPath, timeout);
    case 'mix':
      return checkElixirOutdated(repoPath, timeout);
    case 'cargo':
      return checkRustOutdated(repoPath, timeout);
    default:
      return [];
  }
}

/**
 * Main function: Analyze all package managers in a repository
 */
export async function analyzeMultiLanguagePackages(repoPath) {
  console.log('[PackageDetection] Detecting package managers...');
  const managers = await detectPackageManagers(repoPath);

  const results = {
    packageManagers: managers.map(m => ({ name: m.name, language: m.language })),
    byLanguage: {},
    allOutdated: [],
    summary: {
      totalPackages: 0,
      totalOutdated: 0,
      languages: [],
    },
  };

  for (const manager of managers) {
    // Skip npm - it's handled separately by ncu
    if (manager.key === 'npm' || manager.key === 'yarn' || manager.key === 'pnpm') {
      console.log(`[PackageDetection] Skipping ${manager.name} (handled by ncu)`);
      continue;
    }

    console.log(`[PackageDetection] Analyzing ${manager.name} (${manager.language})...`);

    try {
      // Parse current dependencies
      const deps = await parseDependencies(repoPath, manager);

      // Check for outdated
      const outdated = await checkOutdated(repoPath, manager);

      results.byLanguage[manager.language] = {
        packageManager: manager.name,
        dependencies: deps,
        outdated,
        totalPackages: deps.length,
        outdatedCount: outdated.length,
      };

      results.allOutdated.push(...outdated);
      results.summary.totalPackages += deps.length;
      results.summary.totalOutdated += outdated.length;

      if (!results.summary.languages.includes(manager.language)) {
        results.summary.languages.push(manager.language);
      }

      console.log(`[PackageDetection] ${manager.language}: ${deps.length} packages, ${outdated.length} outdated`);
    } catch (e) {
      console.warn(`[PackageDetection] Failed to analyze ${manager.name}:`, e.message);
      results.byLanguage[manager.language] = {
        packageManager: manager.name,
        error: e.message,
        dependencies: [],
        outdated: [],
      };
    }
  }

  return results;
}

export default {
  detectPackageManagers,
  parseDependencies,
  checkOutdated,
  analyzeMultiLanguagePackages,
  PACKAGE_MANAGERS,
};
