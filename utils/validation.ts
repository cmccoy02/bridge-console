/**
 * Validation utilities for Bridge
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  normalized?: string;
}

/**
 * Validates a GitHub repository URL
 * Accepts formats:
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo.git
 * - github.com/owner/repo
 * - owner/repo
 */
export function validateGitHubUrl(url: string): ValidationResult {
  const trimmed = url.trim();
  
  if (!trimmed) {
    return { isValid: false, error: 'Repository URL is required' };
  }

  // Normalize various input formats
  let normalized = trimmed;
  
  // Handle owner/repo format
  if (/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    normalized = `https://github.com/${trimmed}`;
  }
  
  // Add https:// if missing
  if (normalized.startsWith('github.com')) {
    normalized = `https://${normalized}`;
  }
  
  // Remove trailing .git
  normalized = normalized.replace(/\.git$/, '');
  
  // Remove trailing slash
  normalized = normalized.replace(/\/$/, '');

  // Validate URL structure
  const githubUrlPattern = /^https:\/\/github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)$/;
  const match = normalized.match(githubUrlPattern);
  
  if (!match) {
    // Check for common issues
    if (!normalized.includes('github.com')) {
      return { isValid: false, error: 'Only GitHub repositories are supported' };
    }
    if (normalized.includes('github.com/') && !normalized.match(/github\.com\/[^/]+\/[^/]+/)) {
      return { isValid: false, error: 'Invalid format. Use: github.com/owner/repo' };
    }
    return { isValid: false, error: 'Invalid GitHub URL format' };
  }

  const [, owner, repo] = match;

  // Validate owner and repo names
  if (owner.length > 39) {
    return { isValid: false, error: 'Owner name is too long (max 39 characters)' };
  }

  if (repo.length > 100) {
    return { isValid: false, error: 'Repository name is too long (max 100 characters)' };
  }

  // Check for reserved names
  const reservedOwners = ['settings', 'security', 'features', 'pulls', 'issues', 'marketplace', 'explore'];
  if (reservedOwners.includes(owner.toLowerCase())) {
    return { isValid: false, error: `"${owner}" is not a valid owner name` };
  }

  return { 
    isValid: true, 
    normalized 
  };
}

/**
 * Extracts owner and repo name from a GitHub URL
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const validation = validateGitHubUrl(url);
  if (!validation.isValid || !validation.normalized) {
    return null;
  }
  
  const match = validation.normalized.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  
  return { owner: match[1], repo: match[2] };
}

/**
 * Checks if a string looks like it might be a GitHub URL
 * Used for showing early feedback before full validation
 */
export function looksLikeGitHubUrl(input: string): boolean {
  const trimmed = input.trim().toLowerCase();
  return (
    trimmed.includes('github') ||
    /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(trimmed)
  );
}

