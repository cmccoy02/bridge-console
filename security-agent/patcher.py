"""
Security Patcher
Applies AI-generated fixes to source files
Part of Bridge's autonomous code security system
"""

import os
import re
import difflib
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime


class SecurityPatcher:
    """Applies security fixes to source code files"""

    def __init__(self, repo_path: str):
        """
        Initialize the patcher with a repository path

        Args:
            repo_path: Path to the cloned repository
        """
        self.repo_path = repo_path
        self.applied_patches: List[Dict[str, Any]] = []
        self.failed_patches: List[Dict[str, Any]] = []

    def apply_fix(self, finding: Dict[str, Any], fix: Dict[str, Any]) -> Dict[str, Any]:
        """
        Apply a single fix to the codebase

        Args:
            finding: The security finding (contains file, line, code)
            fix: The AI-generated fix (contains solution_code)

        Returns:
            Result dictionary with success status and details
        """
        file_path = os.path.join(self.repo_path, finding['file'])

        if not os.path.exists(file_path):
            return {
                'success': False,
                'error': f"File not found: {finding['file']}",
                'finding': finding
            }

        try:
            # Read the original file
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                original_content = f.read()
                original_lines = original_content.split('\n')

            # Get the problematic code and the fix
            problematic_code = finding.get('code', '').strip()
            solution_code = fix.get('solution_code', '').strip()
            line_number = finding.get('line', 0)

            if not solution_code:
                return {
                    'success': False,
                    'error': 'No solution code provided',
                    'finding': finding
                }

            # Strategy 1: Direct line replacement if fix is a single line
            if '\n' not in solution_code and line_number > 0:
                result = self._apply_line_replacement(
                    file_path, original_lines, line_number,
                    problematic_code, solution_code
                )
                if result['success']:
                    self.applied_patches.append(result)
                    return result

            # Strategy 2: Try to find and replace the exact code block
            result = self._apply_block_replacement(
                file_path, original_content,
                problematic_code, solution_code, finding
            )

            if result['success']:
                self.applied_patches.append(result)
            else:
                self.failed_patches.append(result)

            return result

        except Exception as e:
            error_result = {
                'success': False,
                'error': str(e),
                'finding': finding,
                'file': finding['file']
            }
            self.failed_patches.append(error_result)
            return error_result

    def _apply_line_replacement(
        self, file_path: str, lines: List[str],
        line_number: int, old_code: str, new_code: str
    ) -> Dict[str, Any]:
        """Replace a specific line in the file"""

        if line_number < 1 or line_number > len(lines):
            return {
                'success': False,
                'error': f'Line {line_number} out of range (file has {len(lines)} lines)'
            }

        # Get the original line (0-indexed)
        original_line = lines[line_number - 1]

        # Preserve indentation
        indent = len(original_line) - len(original_line.lstrip())
        indented_fix = ' ' * indent + new_code.lstrip()

        # Create the new content
        new_lines = lines.copy()
        new_lines[line_number - 1] = indented_fix
        new_content = '\n'.join(new_lines)

        # Write back
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)

        return {
            'success': True,
            'file': os.path.relpath(file_path, self.repo_path),
            'line': line_number,
            'original': original_line.strip(),
            'replacement': new_code.strip(),
            'strategy': 'line_replacement'
        }

    def _apply_block_replacement(
        self, file_path: str, content: str,
        old_code: str, new_code: str, finding: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Replace a code block in the file"""

        # Try exact match first
        if old_code in content:
            new_content = content.replace(old_code, new_code, 1)
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)

            return {
                'success': True,
                'file': os.path.relpath(file_path, self.repo_path),
                'line': finding.get('line', 0),
                'original': old_code[:100] + ('...' if len(old_code) > 100 else ''),
                'replacement': new_code[:100] + ('...' if len(new_code) > 100 else ''),
                'strategy': 'block_replacement'
            }

        # Try fuzzy matching (ignore whitespace differences)
        normalized_old = ' '.join(old_code.split())

        for line_num, line in enumerate(content.split('\n'), 1):
            normalized_line = ' '.join(line.split())
            if normalized_old in normalized_line or normalized_line in normalized_old:
                # Found a match, replace this line
                lines = content.split('\n')
                indent = len(line) - len(line.lstrip())
                lines[line_num - 1] = ' ' * indent + new_code.lstrip()
                new_content = '\n'.join(lines)

                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(new_content)

                return {
                    'success': True,
                    'file': os.path.relpath(file_path, self.repo_path),
                    'line': line_num,
                    'original': line.strip()[:100],
                    'replacement': new_code.strip()[:100],
                    'strategy': 'fuzzy_replacement'
                }

        return {
            'success': False,
            'error': 'Could not locate code to replace',
            'file': os.path.relpath(file_path, self.repo_path),
            'finding': finding
        }

    def apply_batch(
        self, findings: List[Dict[str, Any]],
        fixes: Dict[int, Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Apply multiple fixes in batch

        Args:
            findings: List of security findings
            fixes: Dictionary mapping finding index to fix

        Returns:
            Summary of all applied patches
        """
        results = {
            'applied': [],
            'failed': [],
            'total': len(fixes),
            'success_count': 0,
            'failure_count': 0
        }

        for idx, fix in fixes.items():
            if idx >= len(findings):
                continue

            finding = findings[idx]
            result = self.apply_fix(finding, fix)

            if result['success']:
                results['applied'].append(result)
                results['success_count'] += 1
            else:
                results['failed'].append(result)
                results['failure_count'] += 1

        return results

    def generate_diff(self, original: str, modified: str) -> str:
        """Generate a unified diff between original and modified content"""
        original_lines = original.splitlines(keepends=True)
        modified_lines = modified.splitlines(keepends=True)

        diff = difflib.unified_diff(
            original_lines, modified_lines,
            fromfile='original', tofile='modified',
            lineterm=''
        )

        return ''.join(diff)

    def get_summary(self) -> Dict[str, Any]:
        """Get a summary of all patches applied"""
        return {
            'total_applied': len(self.applied_patches),
            'total_failed': len(self.failed_patches),
            'applied': self.applied_patches,
            'failed': self.failed_patches,
            'files_modified': list(set(
                p.get('file', '') for p in self.applied_patches if p.get('success')
            ))
        }


def apply_security_fixes(
    repo_path: str,
    findings: List[Dict[str, Any]],
    fixes: Dict[int, Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Convenience function to apply security fixes to a repository

    Args:
        repo_path: Path to the repository
        findings: List of security findings
        fixes: Dictionary mapping finding indices to fixes

    Returns:
        Summary of applied patches
    """
    patcher = SecurityPatcher(repo_path)
    results = patcher.apply_batch(findings, fixes)
    results['summary'] = patcher.get_summary()
    return results
