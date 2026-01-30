/**
 * JavaScript-based Security Scanner
 * Pattern-based security vulnerability detection for common issues
 * Works without Python dependency - suitable for production deployment
 */

import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';

// Security patterns to detect
const SECURITY_PATTERNS = {
  // Hardcoded Secrets
  hardcoded_secrets: [
    {
      name: 'Hardcoded API Key',
      pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"`]([a-zA-Z0-9_\-]{20,})['"`]/gi,
      severity: 'high',
      cwe: 'CWE-798',
      description: 'Hardcoded API key found. Store secrets in environment variables.',
      fix: 'Move the API key to an environment variable and access it via process.env.API_KEY'
    },
    {
      name: 'Hardcoded Password',
      pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"`]([^'"`]{4,})['"`]/gi,
      severity: 'critical',
      cwe: 'CWE-798',
      description: 'Hardcoded password found. Never store passwords in source code.',
      fix: 'Use environment variables or a secrets manager for credentials'
    },
    {
      name: 'Hardcoded Secret/Token',
      pattern: /(?:secret|token|auth)\s*[:=]\s*['"`]([a-zA-Z0-9_\-]{16,})['"`]/gi,
      severity: 'high',
      cwe: 'CWE-798',
      description: 'Hardcoded secret or token found.',
      fix: 'Store secrets in environment variables or use a secrets manager'
    },
    {
      name: 'AWS Access Key',
      pattern: /AKIA[0-9A-Z]{16}/g,
      severity: 'critical',
      cwe: 'CWE-798',
      description: 'AWS Access Key ID found in source code.',
      fix: 'Remove AWS keys from code. Use IAM roles or environment variables'
    },
    {
      name: 'Private Key',
      pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
      severity: 'critical',
      cwe: 'CWE-798',
      description: 'Private key found in source code.',
      fix: 'Never commit private keys. Use secure key management'
    }
  ],

  // SQL Injection
  sql_injection: [
    {
      name: 'SQL Injection Risk',
      pattern: /(?:query|execute|run)\s*\(\s*['"`](?:SELECT|INSERT|UPDATE|DELETE|DROP).*\$\{|(?:query|execute|run)\s*\(\s*['"`].*['"`]\s*\+/gi,
      severity: 'critical',
      cwe: 'CWE-89',
      description: 'Potential SQL injection vulnerability. String concatenation in SQL query.',
      fix: 'Use parameterized queries or prepared statements instead of string concatenation'
    },
    {
      name: 'Raw SQL Query',
      pattern: /\.raw\s*\(\s*['"`].*\$\{/gi,
      severity: 'high',
      cwe: 'CWE-89',
      description: 'Raw SQL query with string interpolation detected.',
      fix: 'Use query builder methods or parameterized queries'
    }
  ],

  // XSS (Cross-Site Scripting)
  xss: [
    {
      name: 'Dangerous innerHTML',
      pattern: /\.innerHTML\s*=\s*(?!['"`]<)/g,
      severity: 'high',
      cwe: 'CWE-79',
      description: 'Setting innerHTML with dynamic content can lead to XSS.',
      fix: 'Use textContent for text, or sanitize HTML with DOMPurify'
    },
    {
      name: 'React dangerouslySetInnerHTML',
      pattern: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:/g,
      severity: 'medium',
      cwe: 'CWE-79',
      description: 'Using dangerouslySetInnerHTML without sanitization.',
      fix: 'Sanitize HTML content with DOMPurify before rendering'
    },
    {
      name: 'document.write',
      pattern: /document\.write\s*\(/g,
      severity: 'high',
      cwe: 'CWE-79',
      description: 'document.write can introduce XSS vulnerabilities.',
      fix: 'Use DOM manipulation methods instead of document.write'
    },
    {
      name: 'eval() Usage',
      pattern: /\beval\s*\(/g,
      severity: 'critical',
      cwe: 'CWE-95',
      description: 'eval() executes arbitrary code and is a security risk.',
      fix: 'Avoid eval(). Use JSON.parse() for JSON data or Function constructor for limited cases'
    }
  ],

  // Command Injection
  command_injection: [
    {
      name: 'Command Injection Risk',
      pattern: /(?:exec|spawn|execSync|spawnSync)\s*\(\s*(?:['"`].*\$\{|.*\+)/g,
      severity: 'critical',
      cwe: 'CWE-78',
      description: 'Command execution with user input can lead to command injection.',
      fix: 'Validate and sanitize all inputs. Use arrays for arguments instead of string concatenation'
    },
    {
      name: 'Shell Command with Template',
      pattern: /child_process.*exec.*`[^`]*\$\{/g,
      severity: 'critical',
      cwe: 'CWE-78',
      description: 'Shell command with template literal interpolation.',
      fix: 'Use execFile with array arguments or validate/escape all user inputs'
    }
  ],

  // Path Traversal
  path_traversal: [
    {
      name: 'Path Traversal Risk',
      pattern: /(?:readFile|writeFile|readdir|unlink|rmdir|access|stat)\s*\(.*(?:req\.|params\.|query\.|body\.)/g,
      severity: 'high',
      cwe: 'CWE-22',
      description: 'File operation with user-controlled path.',
      fix: 'Validate paths and use path.resolve() with a safe base directory'
    },
    {
      name: 'Unrestricted File Upload Path',
      pattern: /path\.join\s*\(.*(?:req\.|params\.|query\.|body\.)/g,
      severity: 'medium',
      cwe: 'CWE-22',
      description: 'Path construction with user input.',
      fix: 'Validate that the resolved path stays within allowed directories'
    }
  ],

  // Insecure Dependencies
  insecure_practices: [
    {
      name: 'Disabled SSL/TLS Verification',
      pattern: /rejectUnauthorized\s*:\s*false/g,
      severity: 'high',
      cwe: 'CWE-295',
      description: 'SSL/TLS certificate verification disabled.',
      fix: 'Enable certificate verification in production. Only disable for local development'
    },
    {
      name: 'Weak Crypto Algorithm',
      pattern: /createCipher\s*\(\s*['"`](?:des|rc4|md5)/gi,
      severity: 'high',
      cwe: 'CWE-327',
      description: 'Weak cryptographic algorithm detected.',
      fix: 'Use strong algorithms like AES-256-GCM, SHA-256, or bcrypt'
    },
    {
      name: 'Math.random for Security',
      pattern: /Math\.random\s*\(\s*\).*(?:token|key|secret|password|auth|session)/gi,
      severity: 'high',
      cwe: 'CWE-330',
      description: 'Math.random() is not cryptographically secure.',
      fix: 'Use crypto.randomBytes() or crypto.randomUUID() for security-sensitive values'
    },
    {
      name: 'HTTP Instead of HTTPS',
      pattern: /['"`]http:\/\/(?!localhost|127\.0\.0\.1)/g,
      severity: 'medium',
      cwe: 'CWE-319',
      description: 'Insecure HTTP URL found (non-localhost).',
      fix: 'Use HTTPS for all external communications'
    }
  ],

  // Authentication Issues
  auth_issues: [
    {
      name: 'JWT Without Verification',
      pattern: /jwt\.decode\s*\(/g,
      severity: 'high',
      cwe: 'CWE-347',
      description: 'JWT decode without verification bypasses signature validation.',
      fix: 'Always use jwt.verify() to validate JWT tokens'
    },
    {
      name: 'Weak JWT Secret',
      pattern: /jwt\.sign\s*\([^,]+,\s*['"`](?:secret|password|123|test)/gi,
      severity: 'critical',
      cwe: 'CWE-798',
      description: 'Weak or default JWT secret detected.',
      fix: 'Use a strong, randomly generated secret stored in environment variables'
    },
    {
      name: 'Missing CSRF Protection',
      pattern: /app\.(?:post|put|delete|patch)\s*\([^)]*(?:req\.body|req\.params)/g,
      severity: 'medium',
      cwe: 'CWE-352',
      description: 'State-changing endpoint may lack CSRF protection.',
      fix: 'Implement CSRF tokens for state-changing operations'
    }
  ],

  // Information Exposure
  info_exposure: [
    {
      name: 'Stack Trace Exposure',
      pattern: /res\.(?:send|json)\s*\(\s*(?:err|error)(?:\.stack|\.message)?/g,
      severity: 'medium',
      cwe: 'CWE-209',
      description: 'Error details may be exposed to users.',
      fix: 'Log full errors server-side, return generic messages to users'
    },
    {
      name: 'Console.log Sensitive Data',
      pattern: /console\.log\s*\([^)]*(?:password|token|secret|key|auth)/gi,
      severity: 'medium',
      cwe: 'CWE-532',
      description: 'Sensitive data may be logged to console.',
      fix: 'Remove sensitive data logging or use secure logging practices'
    }
  ]
};

// File extensions to scan
const SCAN_EXTENSIONS = [
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'py', 'rb', 'php', 'java', 'go', 'rs',
  'vue', 'svelte'
];

// Files/directories to ignore
const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/coverage/**',
  '**/*.min.js',
  '**/*.bundle.js',
  '**/vendor/**',
  '**/__pycache__/**'
];

/**
 * Scan a file for security vulnerabilities
 */
async function scanFile(filePath, content) {
  const findings = [];
  const lines = content.split('\n');
  const relativePath = filePath;

  for (const [category, patterns] of Object.entries(SECURITY_PATTERNS)) {
    for (const rule of patterns) {
      // Reset regex lastIndex
      rule.pattern.lastIndex = 0;

      let match;
      while ((match = rule.pattern.exec(content)) !== null) {
        // Find line number
        const beforeMatch = content.substring(0, match.index);
        const lineNumber = beforeMatch.split('\n').length;
        const lineContent = lines[lineNumber - 1] || '';

        // Skip if in a comment
        const trimmedLine = lineContent.trim();
        if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*') || trimmedLine.startsWith('#')) {
          continue;
        }

        findings.push({
          id: `${category}-${findings.length + 1}`,
          rule: rule.name,
          category,
          severity: rule.severity,
          cwe: rule.cwe,
          description: rule.description,
          fix: rule.fix,
          file: relativePath,
          line: lineNumber,
          column: match.index - beforeMatch.lastIndexOf('\n'),
          code_snippet: lineContent.trim().substring(0, 200),
          matched_text: match[0].substring(0, 100)
        });
      }
    }
  }

  return findings;
}

/**
 * Run security scan on a repository
 */
export async function runSecurityScanJS(repoPath, options = {}, progressCallback = null) {
  const { generateFixes = false } = options;
  const startTime = Date.now();

  const allFindings = [];
  const stats = {
    files_scanned: 0,
    total_findings: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    scan_duration_ms: 0
  };

  try {
    if (progressCallback) {
      await progressCallback('scanning', 0, 'Starting security scan...');
    }

    // Find all scannable files
    const patterns = SCAN_EXTENSIONS.map(ext => `**/*.${ext}`);
    const files = await glob(patterns, {
      cwd: repoPath,
      ignore: IGNORE_PATTERNS,
      absolute: false
    });

    const totalFiles = files.length;
    console.log(`[SecurityScanner] Found ${totalFiles} files to scan`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fullPath = path.join(repoPath, file);

      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const findings = await scanFile(file, content);
        allFindings.push(...findings);
        stats.files_scanned++;

        // Update progress
        if (progressCallback && i % 10 === 0) {
          const percent = Math.round((i / totalFiles) * 100);
          await progressCallback('scanning', percent, `Scanning ${file}...`);
        }
      } catch (err) {
        // Skip files that can't be read (binary, etc.)
        console.warn(`[SecurityScanner] Skipping ${file}: ${err.message}`);
      }
    }

    // Calculate stats
    stats.total_findings = allFindings.length;
    stats.critical = allFindings.filter(f => f.severity === 'critical').length;
    stats.high = allFindings.filter(f => f.severity === 'high').length;
    stats.medium = allFindings.filter(f => f.severity === 'medium').length;
    stats.low = allFindings.filter(f => f.severity === 'low').length;
    stats.scan_duration_ms = Date.now() - startTime;

    if (progressCallback) {
      await progressCallback('complete', 100, 'Scan complete');
    }

    // Group findings by file
    const findingsByFile = {};
    for (const finding of allFindings) {
      if (!findingsByFile[finding.file]) {
        findingsByFile[finding.file] = [];
      }
      findingsByFile[finding.file].push(finding);
    }

    // Sort findings by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    allFindings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return {
      success: true,
      stats,
      findings: allFindings,
      findings_by_file: findingsByFile,
      scan_time: new Date().toISOString(),
      scanner_version: '1.0.0-js'
    };

  } catch (error) {
    console.error('[SecurityScanner] Scan failed:', error);
    return {
      success: false,
      error: error.message,
      stats,
      findings: allFindings
    };
  }
}

/**
 * Check if security scanner is available (always true for JS version)
 */
export function isSecurityScannerAvailable() {
  return true;
}

/**
 * Get supported languages
 */
export function getSupportedLanguagesJS() {
  return ['javascript', 'typescript', 'python', 'ruby', 'php', 'java', 'go', 'rust'];
}

/**
 * Get severity color for UI
 */
export function getSeverityColorJS(severity) {
  const colors = {
    critical: '#dc2626',
    high: '#ea580c',
    medium: '#ca8a04',
    low: '#2563eb'
  };
  return colors[severity] || '#6b7280';
}

/**
 * Get severity badge class for UI
 */
export function getSeverityBadgeClassJS(severity) {
  const classes = {
    critical: 'bg-red-100 text-red-800 border-red-200',
    high: 'bg-orange-100 text-orange-800 border-orange-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    low: 'bg-blue-100 text-blue-800 border-blue-200'
  };
  return classes[severity] || 'bg-gray-100 text-gray-800 border-gray-200';
}
