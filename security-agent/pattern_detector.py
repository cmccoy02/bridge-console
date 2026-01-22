"""
Pattern Detector
Detects insecure coding patterns using regex and pattern matching
"""

import os
import re
from typing import List, Dict, Any
from security_policies import (
    get_security_patterns,
    get_cwe_mapping,
    get_severity_weight,
    get_cwe_description,
    get_security_category,
)
from config import FILE_CONFIG


def scan(repo_path: str, languages: List[str]) -> List[Dict[str, Any]]:
    """
    Scan repository for security vulnerabilities

    Args:
        repo_path: Path to the repository
        languages: List of languages to scan for

    Returns:
        List of findings
    """
    print(f"[pattern_detector] Scanning {repo_path} for {languages}")
    findings = []

    excluded_dirs = set(FILE_CONFIG['excluded_dirs'])
    excluded_files = set(FILE_CONFIG['excluded_files'])
    max_file_size = FILE_CONFIG['max_file_size']

    for root, dirs, files in os.walk(repo_path):
        # Skip excluded directories
        dirs[:] = [d for d in dirs if d not in excluded_dirs]

        for f in files:
            # Skip excluded files
            if f in excluded_files:
                continue

            rel_path = os.path.relpath(os.path.join(root, f), repo_path)
            file_path = os.path.join(root, f)

            # Skip non-source files
            if not any(f.endswith(ext) for ext in FILE_CONFIG['supported_extensions']):
                continue

            # Skip large files
            try:
                if os.path.getsize(file_path) > max_file_size:
                    continue
            except OSError:
                continue

            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as file:
                    content = file.read()
                    lines = content.split('\n')

                    # Detect vulnerabilities based on file type
                    if f.endswith('.py') and 'python' in languages:
                        findings.extend(scan_file(rel_path, lines, 'python'))
                    elif f.endswith('.js') and 'javascript' in languages:
                        findings.extend(scan_file(rel_path, lines, 'javascript'))
                    elif f.endswith('.ts') and 'typescript' in languages:
                        findings.extend(scan_file(rel_path, lines, 'typescript'))
                    elif f.endswith('.jsx') and 'javascript' in languages:
                        findings.extend(scan_file(rel_path, lines, 'javascript'))
                    elif f.endswith('.tsx') and 'typescript' in languages:
                        findings.extend(scan_file(rel_path, lines, 'typescript'))
                    elif f.endswith('.java') and 'java' in languages:
                        findings.extend(scan_file(rel_path, lines, 'java'))
                    elif f.endswith('.php') and 'php' in languages:
                        findings.extend(scan_file(rel_path, lines, 'php'))
                    elif f.endswith('.rb') and 'ruby' in languages:
                        findings.extend(scan_file(rel_path, lines, 'ruby'))
                    elif f.endswith('.go') and 'go' in languages:
                        findings.extend(scan_file(rel_path, lines, 'go'))
                    elif f.endswith('.rs') and 'rust' in languages:
                        findings.extend(scan_file(rel_path, lines, 'rust'))
                    elif f.endswith(('.c', '.h')) and 'c' in languages:
                        findings.extend(scan_file(rel_path, lines, 'c'))
                    elif f.endswith(('.cpp', '.cc', '.cxx', '.hpp')) and 'cpp' in languages:
                        findings.extend(scan_file(rel_path, lines, 'cpp'))

            except Exception as e:
                print(f"[pattern_detector] Error scanning {rel_path}: {e}")
                continue

    print(f"[pattern_detector] Found {len(findings)} potential vulnerabilities")
    return findings


def scan_file(file_path: str, lines: List[str], language: str) -> List[Dict[str, Any]]:
    """
    Scan a single file for security vulnerabilities

    Args:
        file_path: Relative path to file
        lines: File content as list of lines
        language: Programming language

    Returns:
        List of findings
    """
    findings = []
    security_patterns = get_security_patterns(language)

    for line_num, line in enumerate(lines, 1):
        # Skip empty lines and comments
        stripped = line.strip()
        if not stripped or stripped.startswith('#') or stripped.startswith('//'):
            continue

        for pattern, issue_type, severity in security_patterns:
            if re.search(pattern, line, re.IGNORECASE):
                match = re.search(pattern, line, re.IGNORECASE)
                exact_match = match.group(0) if match else stripped

                cwe_info = get_cwe_mapping(issue_type)

                findings.append({
                    'file': file_path,
                    'line': line_num,
                    'issue': issue_type,
                    'severity': severity,
                    'code': stripped,
                    'exact_match': exact_match,
                    'description': f'{issue_type.replace("-", " ").title()} vulnerability detected',
                    'solution': f'Review and fix the {issue_type} vulnerability',
                    'cwe': cwe_info['cwe'],
                    'owasp': cwe_info['owasp'],
                    'category': get_security_category(issue_type),
                    'context': get_context_lines(lines, line_num),
                    'language': language
                })

    return findings


def get_context_lines(lines: List[str], line_num: int, context_size: int = 3) -> List[str]:
    """
    Get surrounding context lines for a finding

    Args:
        lines: All lines in file
        line_num: Line number (1-indexed)
        context_size: Number of lines before/after

    Returns:
        List of context lines with line numbers
    """
    start = max(0, line_num - context_size - 1)
    end = min(len(lines), line_num + context_size)

    context = []
    for i in range(start, end):
        prefix = '>>>' if i == line_num - 1 else '   '
        context.append(f'{prefix} {i + 1}: {lines[i]}')

    return context


def normalize_and_prioritize(findings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Normalize findings and calculate priority scores

    Args:
        findings: Raw findings from scanner

    Returns:
        Prioritized findings sorted by priority score
    """
    for finding in findings:
        # Calculate priority score
        severity_weight = get_severity_weight(finding['severity'])

        # Boost for critical CWEs
        cwe_boost = 0
        if finding['cwe'] in ['CWE-94', 'CWE-89', 'CWE-78']:
            cwe_boost = 20
        elif finding['cwe'] in ['CWE-79', 'CWE-22', 'CWE-798']:
            cwe_boost = 10

        finding['priority_score'] = severity_weight + cwe_boost
        finding['priority'] = categorize_priority(finding['priority_score'])

    # Sort by priority score (descending)
    return sorted(findings, key=lambda x: x['priority_score'], reverse=True)


def categorize_priority(score: int) -> str:
    """Categorize priority based on score"""
    if score >= 90:
        return 'critical'
    elif score >= 70:
        return 'high'
    elif score >= 50:
        return 'medium'
    else:
        return 'low'


def explain_and_suggest(prioritized: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Add detailed explanations and suggestions to findings

    Args:
        prioritized: Prioritized findings

    Returns:
        Findings with explanations
    """
    explanations = []

    for finding in prioritized:
        explanation = {
            **finding,
            'explanation': get_cwe_description(finding['cwe']),
            'remediation': get_remediation_suggestion(finding['issue'], finding['language']),
            'references': get_references(finding['cwe']),
        }
        explanations.append(explanation)

    return explanations


def get_remediation_suggestion(issue_type: str, language: str) -> str:
    """Get remediation suggestion for an issue type"""
    suggestions = {
        'sql-injection': 'Use parameterized queries or prepared statements instead of string concatenation.',
        'command-injection': 'Use safe APIs that do not invoke shells, or properly escape/validate all inputs.',
        'code-injection': 'Avoid using eval() or similar dynamic code execution. Use safe alternatives.',
        'xss': 'Sanitize and encode all user input before rendering in HTML. Use Content Security Policy.',
        'path-traversal': 'Validate and sanitize file paths. Use allowlists for permitted directories.',
        'weak-crypto': 'Use modern, secure cryptographic algorithms (e.g., AES-256, SHA-256).',
        'insecure-randomness': 'Use cryptographically secure random number generators.',
        'hardcoded-secret': 'Move secrets to environment variables or a secrets management system.',
        'tls-issues': 'Enable certificate verification and use TLS 1.2 or higher.',
        'buffer-overflow': 'Use safe string functions (e.g., strncpy, snprintf) with proper bounds checking.',
        'memory-leak': 'Ensure all allocated memory is properly freed. Consider using smart pointers.',
        'insecure-deserialization': 'Avoid deserializing untrusted data. Use safe serialization formats.',
        'ssrf': 'Validate and allowlist URLs. Do not pass user input directly to HTTP requests.',
        'xxe': 'Disable external entity processing in XML parsers.',
    }
    return suggestions.get(issue_type, f'Review and fix the {issue_type} vulnerability following security best practices.')


def get_references(cwe: str) -> List[str]:
    """Get reference links for a CWE"""
    return [
        f'https://cwe.mitre.org/data/definitions/{cwe.split("-")[1]}.html',
        f'https://owasp.org/www-community/vulnerabilities/'
    ]
