"""
Security Scanner
Main entry point for security scanning operations
"""

import os
import json
import tempfile
import shutil
from datetime import datetime
from typing import Dict, Any, List, Optional, Callable
from git import Repo, InvalidGitRepositoryError

import language_detector
import pattern_detector
from ai_fixer import AIFixer
from config import SCAN_CONFIG


class SecurityScanner:
    """Main security scanner class"""

    def __init__(self, gemini_api_key: str = None):
        """
        Initialize the security scanner

        Args:
            gemini_api_key: Optional Gemini API key for AI-powered fixes
        """
        self.ai_fixer = AIFixer(api_key=gemini_api_key) if gemini_api_key else None

    def scan(self, repo_path_or_url: str,
             progress_callback: Optional[Callable] = None,
             generate_fixes: bool = False) -> Dict[str, Any]:
        """
        Scan a repository for security vulnerabilities

        Args:
            repo_path_or_url: Local path or Git URL
            progress_callback: Optional callback function(step, progress, message)
            generate_fixes: Whether to generate AI fixes for findings

        Returns:
            Dictionary with scan results
        """
        start_time = datetime.now()
        temp_dir = None

        try:
            # Step 1: Resolve repository path
            if progress_callback:
                progress_callback('init', 5, 'Initializing scan...')

            repo_path = self._resolve_repo_path(repo_path_or_url)
            is_temp = repo_path != repo_path_or_url

            if is_temp:
                temp_dir = repo_path
                if progress_callback:
                    progress_callback('clone', 15, 'Cloned repository...')

            # Step 2: Detect languages
            if progress_callback:
                progress_callback('detect_langs', 25, 'Detecting languages...')

            languages = language_detector.get_languages_in_repo(repo_path)
            language_counts = language_detector.get_file_count_by_language(repo_path)

            # Step 3: Scan for patterns
            if progress_callback:
                progress_callback('scan', 40, 'Scanning for vulnerabilities...')

            findings = pattern_detector.scan(repo_path, languages)

            # Step 4: Prioritize findings
            if progress_callback:
                progress_callback('prioritize', 60, 'Prioritizing findings...')

            prioritized = pattern_detector.normalize_and_prioritize(findings)

            # Step 5: Generate explanations
            if progress_callback:
                progress_callback('explain', 75, 'Generating explanations...')

            explained = pattern_detector.explain_and_suggest(prioritized)

            # Step 6: Generate AI fixes if requested
            fixes = []
            if generate_fixes and self.ai_fixer and self.ai_fixer.is_available():
                if progress_callback:
                    progress_callback('fix', 85, 'Generating AI-powered fixes...')

                # Only generate fixes for top priority issues
                top_issues = explained[:10]  # Limit to top 10
                fixes = self.ai_fixer.generate_batch_solutions(top_issues)

            # Step 7: Build summary
            if progress_callback:
                progress_callback('summary', 95, 'Building summary...')

            summary = self._build_summary(explained)

            # Build result
            end_time = datetime.now()
            duration = (end_time - start_time).total_seconds()

            result = {
                'success': True,
                'repo': repo_path_or_url,
                'scan_date': start_time.isoformat(),
                'duration_seconds': duration,
                'languages': languages,
                'language_counts': language_counts,
                'findings': explained,
                'fixes': fixes,
                'summary': summary,
                'stats': {
                    'total_findings': len(explained),
                    'critical': sum(1 for f in explained if f.get('severity') == 'critical'),
                    'high': sum(1 for f in explained if f.get('severity') == 'high'),
                    'medium': sum(1 for f in explained if f.get('severity') == 'medium'),
                    'low': sum(1 for f in explained if f.get('severity') == 'low'),
                    'files_scanned': len(language_detector.detect_per_file(repo_path)),
                }
            }

            if progress_callback:
                progress_callback('complete', 100, 'Scan complete!')

            return result

        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'repo': repo_path_or_url,
                'scan_date': datetime.now().isoformat(),
            }

        finally:
            # Clean up temp directory if we cloned
            if temp_dir and os.path.exists(temp_dir):
                try:
                    shutil.rmtree(temp_dir)
                except Exception:
                    pass

    def _resolve_repo_path(self, repo_path_or_url: str) -> str:
        """
        Resolve repository path, cloning if necessary

        Args:
            repo_path_or_url: Local path or Git URL

        Returns:
            Local path to repository
        """
        # Check if it's a local path
        if os.path.isdir(repo_path_or_url):
            return repo_path_or_url

        # Check if it's a Git URL
        if repo_path_or_url.startswith(('http://', 'https://', 'git@', 'git://')):
            temp_dir = tempfile.mkdtemp(prefix='security_scan_')
            try:
                Repo.clone_from(repo_path_or_url, temp_dir)
                return temp_dir
            except Exception as e:
                shutil.rmtree(temp_dir, ignore_errors=True)
                raise ValueError(f"Failed to clone repository: {e}")

        # Try as relative path
        if os.path.isdir(os.path.abspath(repo_path_or_url)):
            return os.path.abspath(repo_path_or_url)

        raise ValueError(f"Invalid repository path or URL: {repo_path_or_url}")

    def _build_summary(self, findings: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Build executive summary of findings"""
        if not findings:
            return {
                'status': 'clean',
                'message': 'No security vulnerabilities detected.',
                'risk_level': 'low',
                'top_issues': [],
            }

        # Count by severity
        severity_counts = {}
        for f in findings:
            sev = f.get('severity', 'unknown')
            severity_counts[sev] = severity_counts.get(sev, 0) + 1

        # Count by category
        category_counts = {}
        for f in findings:
            cat = f.get('category', 'unknown')
            category_counts[cat] = category_counts.get(cat, 0) + 1

        # Determine risk level
        critical = severity_counts.get('critical', 0)
        high = severity_counts.get('high', 0)

        if critical > 0:
            risk_level = 'critical'
            status = 'critical'
        elif high > 3:
            risk_level = 'high'
            status = 'needs-attention'
        elif high > 0:
            risk_level = 'medium'
            status = 'review-recommended'
        else:
            risk_level = 'low'
            status = 'acceptable'

        # Top issues
        top_issues = [
            {
                'file': f['file'],
                'line': f['line'],
                'issue': f['issue'],
                'severity': f['severity'],
                'cwe': f['cwe'],
            }
            for f in findings[:5]
        ]

        message = self._generate_summary_message(len(findings), severity_counts, category_counts)

        return {
            'status': status,
            'message': message,
            'risk_level': risk_level,
            'severity_counts': severity_counts,
            'category_counts': category_counts,
            'top_issues': top_issues,
        }

    def _generate_summary_message(self, total: int,
                                   severity_counts: Dict[str, int],
                                   category_counts: Dict[str, int]) -> str:
        """Generate human-readable summary message"""
        critical = severity_counts.get('critical', 0)
        high = severity_counts.get('high', 0)

        if critical > 0:
            return (f"Found {total} security issues including {critical} critical vulnerabilities "
                    f"that require immediate attention. Review and fix the critical issues first.")
        elif high > 0:
            return (f"Found {total} security issues with {high} high-severity vulnerabilities. "
                    f"These should be addressed in the next development cycle.")
        elif total > 0:
            return (f"Found {total} security issues of medium or low severity. "
                    f"Review when time permits to improve overall security posture.")
        else:
            return "No security vulnerabilities detected. Good job!"


def scan_repository(repo_path_or_url: str,
                    gemini_api_key: str = None,
                    progress_callback: Optional[Callable] = None,
                    generate_fixes: bool = False) -> Dict[str, Any]:
    """
    Convenience function to scan a repository

    Args:
        repo_path_or_url: Local path or Git URL
        gemini_api_key: Optional Gemini API key
        progress_callback: Optional progress callback
        generate_fixes: Whether to generate AI fixes

    Returns:
        Scan results dictionary
    """
    scanner = SecurityScanner(gemini_api_key=gemini_api_key)
    return scanner.scan(repo_path_or_url,
                        progress_callback=progress_callback,
                        generate_fixes=generate_fixes)


if __name__ == '__main__':
    import sys

    if len(sys.argv) < 2:
        print("Usage: python scanner.py <repo_path_or_url>")
        sys.exit(1)

    repo = sys.argv[1]
    gemini_key = os.environ.get('GEMINI_API_KEY')

    def progress(step, pct, msg):
        print(f"[{pct:3d}%] {msg}")

    result = scan_repository(repo, gemini_api_key=gemini_key, progress_callback=progress)

    if result['success']:
        print(f"\nScan completed in {result['duration_seconds']:.2f}s")
        print(f"Languages: {', '.join(result['languages'])}")
        print(f"Total findings: {result['stats']['total_findings']}")
        print(f"  Critical: {result['stats']['critical']}")
        print(f"  High: {result['stats']['high']}")
        print(f"  Medium: {result['stats']['medium']}")
        print(f"  Low: {result['stats']['low']}")
        print(f"\nSummary: {result['summary']['message']}")
    else:
        print(f"Scan failed: {result.get('error', 'Unknown error')}")
        sys.exit(1)
