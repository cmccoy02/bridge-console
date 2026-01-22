/**
 * Security Scanner - Node.js Wrapper
 * Spawns the Python security agent and processes results
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SECURITY_AGENT_PATH = path.join(__dirname, '..', 'security-agent');

/**
 * Check if Python security agent is available
 * @returns {Promise<boolean>}
 */
export async function isSecurityAgentAvailable() {
  return new Promise((resolve) => {
    const checkProcess = spawn('python3', ['-c', 'import sys; sys.exit(0)'], {
      cwd: SECURITY_AGENT_PATH,
    });

    checkProcess.on('close', (code) => {
      if (code !== 0) {
        resolve(false);
        return;
      }

      // Check if security agent files exist
      const scannerPath = path.join(SECURITY_AGENT_PATH, 'scanner.py');
      resolve(fs.existsSync(scannerPath));
    });

    checkProcess.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Run security scan on a repository
 * @param {string} repoPath - Path to the repository
 * @param {object} options - Scan options
 * @param {function} progressCallback - Progress callback function
 * @returns {Promise<object>}
 */
export async function runSecurityScan(repoPath, options = {}, progressCallback = null) {
  const {
    generateFixes = false,
    geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
  } = options;

  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PYTHONPATH: SECURITY_AGENT_PATH,
    };

    if (geminiApiKey) {
      env.GEMINI_API_KEY = geminiApiKey;
    }

    // Build Python command to run scanner
    const pythonScript = `
import sys
import json
sys.path.insert(0, '${SECURITY_AGENT_PATH.replace(/\\/g, '\\\\')}')

from scanner import scan_repository

def progress_callback(step, progress, message):
    print(json.dumps({'type': 'progress', 'step': step, 'progress': progress, 'message': message}), flush=True)

result = scan_repository(
    '${repoPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',
    gemini_api_key=${geminiApiKey ? `'${geminiApiKey}'` : 'None'},
    progress_callback=progress_callback,
    generate_fixes=${generateFixes ? 'True' : 'False'}
)

print(json.dumps({'type': 'result', 'data': result}), flush=True)
`;

    const pythonProcess = spawn('python3', ['-c', pythonScript], {
      cwd: SECURITY_AGENT_PATH,
      env,
    });

    let outputBuffer = '';
    let errorBuffer = '';

    pythonProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'progress' && progressCallback) {
            progressCallback(parsed.step, parsed.progress, parsed.message);
          } else if (parsed.type === 'result') {
            outputBuffer = JSON.stringify(parsed.data);
          }
        } catch (e) {
          // Non-JSON output, append to buffer
          console.log('[SecurityScanner]', line);
        }
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      errorBuffer += data.toString();
      console.error('[SecurityScanner Error]', data.toString());
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Security scan failed with code ${code}: ${errorBuffer}`));
        return;
      }

      try {
        const result = JSON.parse(outputBuffer);
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse scan results: ${e.message}`));
      }
    });

    pythonProcess.on('error', (err) => {
      reject(new Error(`Failed to start security scanner: ${err.message}`));
    });
  });
}

/**
 * Generate AI fix for a specific finding
 * @param {object} finding - Security finding
 * @param {string} geminiApiKey - Gemini API key
 * @returns {Promise<object>}
 */
export async function generateAIFix(finding, geminiApiKey = null) {
  const apiKey = geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: 'Gemini API key not configured',
      solution_code: '',
      explanation: '',
    };
  }

  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PYTHONPATH: SECURITY_AGENT_PATH,
      GEMINI_API_KEY: apiKey,
    };

    const findingJson = JSON.stringify(finding).replace(/'/g, "\\'").replace(/\\/g, '\\\\');

    const pythonScript = `
import sys
import json
sys.path.insert(0, '${SECURITY_AGENT_PATH.replace(/\\/g, '\\\\')}')

from ai_fixer import AIFixer

fixer = AIFixer()
finding = json.loads('${findingJson}')
result = fixer.generate_secure_solution(finding)

print(json.dumps(result), flush=True)
`;

    const pythonProcess = spawn('python3', ['-c', pythonScript], {
      cwd: SECURITY_AGENT_PATH,
      env,
    });

    let outputBuffer = '';
    let errorBuffer = '';

    pythonProcess.stdout.on('data', (data) => {
      outputBuffer += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorBuffer += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        resolve({
          success: false,
          error: `AI fix generation failed: ${errorBuffer}`,
          solution_code: '',
          explanation: '',
        });
        return;
      }

      try {
        const result = JSON.parse(outputBuffer.trim());
        resolve(result);
      } catch (e) {
        resolve({
          success: false,
          error: `Failed to parse AI fix result: ${e.message}`,
          solution_code: '',
          explanation: '',
        });
      }
    });

    pythonProcess.on('error', (err) => {
      resolve({
        success: false,
        error: `Failed to start AI fixer: ${err.message}`,
        solution_code: '',
        explanation: '',
      });
    });
  });
}

/**
 * Get supported languages for security scanning
 * @returns {string[]}
 */
export function getSupportedLanguages() {
  return [
    'python',
    'javascript',
    'typescript',
    'java',
    'go',
    'rust',
    'ruby',
    'php',
    'c',
    'cpp',
    'csharp',
  ];
}

/**
 * Map severity to color for UI
 * @param {string} severity
 * @returns {string}
 */
export function getSeverityColor(severity) {
  const colors = {
    critical: '#dc2626', // red-600
    high: '#ea580c',     // orange-600
    medium: '#ca8a04',   // yellow-600
    low: '#2563eb',      // blue-600
  };
  return colors[severity] || '#6b7280'; // gray-500
}

/**
 * Map severity to badge class
 * @param {string} severity
 * @returns {string}
 */
export function getSeverityBadgeClass(severity) {
  const classes = {
    critical: 'bg-red-100 text-red-800 border-red-200',
    high: 'bg-orange-100 text-orange-800 border-orange-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    low: 'bg-blue-100 text-blue-800 border-blue-200',
  };
  return classes[severity] || 'bg-gray-100 text-gray-800 border-gray-200';
}
