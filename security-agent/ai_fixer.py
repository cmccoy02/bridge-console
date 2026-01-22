"""
AI-powered Code Fixer using Google Gemini 3 Pro
Generates secure code solutions for security vulnerabilities
"""

import os
import re
import json
from typing import Dict, Any, Optional, List

try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

from config import GEMINI_API_KEY, GEMINI_MODEL_NAME


class AIFixer:
    """AI-powered security code fixer using Google Gemini"""

    def __init__(self, api_key: str = None, model_name: str = None):
        """
        Initialize the AI Fixer with Google Gemini

        Args:
            api_key: Google API key (defaults to env var)
            model_name: Gemini model name (defaults to gemini-2.0-flash)
        """
        self.api_key = api_key or GEMINI_API_KEY
        self.model_name = model_name or GEMINI_MODEL_NAME
        self.model = None

        if GEMINI_AVAILABLE and self.api_key:
            try:
                genai.configure(api_key=self.api_key)
                self.model = genai.GenerativeModel(self.model_name)
            except Exception as e:
                print(f"[AIFixer] Failed to initialize Gemini: {e}")

    def is_available(self) -> bool:
        """Check if AI fixer is available"""
        return self.model is not None

    def generate_secure_solution(self, issue_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate a secure code solution for a security issue

        Args:
            issue_data: Dictionary containing issue information

        Returns:
            Dictionary with the secure solution and metadata
        """
        if not self.is_available():
            return {
                'success': False,
                'error': 'Gemini API not available. Check GEMINI_API_KEY.',
                'solution_code': '',
                'explanation': ''
            }

        # Extract issue information
        vulnerability_type = issue_data.get('issue', 'Unknown')
        cwe_id = issue_data.get('cwe', 'Unknown')
        file_path = issue_data.get('file', 'Unknown')
        line_number = issue_data.get('line', 0)
        problematic_code = issue_data.get('code', '')
        description = issue_data.get('description', '')
        context = issue_data.get('context', [])
        language = issue_data.get('language', self._detect_language(file_path))

        prompt = self._create_fix_prompt(
            vulnerability_type=vulnerability_type,
            cwe_id=cwe_id,
            language=language,
            problematic_code=problematic_code,
            description=description,
            context=context,
            line_number=line_number
        )

        try:
            response = self.model.generate_content(prompt)
            solution_text = response.text.strip()

            # Extract the solution code from the response
            solution_code = self._extract_solution_code(solution_text, language)

            return {
                'success': True,
                'solution_code': solution_code,
                'explanation': solution_text,
                'language': language,
                'original_code': problematic_code,
                'line_number': line_number,
                'file_path': file_path
            }

        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'solution_code': '',
                'explanation': f'Failed to generate solution: {str(e)}'
            }

    def generate_batch_solutions(self, findings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Generate solutions for multiple findings

        Args:
            findings: List of security findings

        Returns:
            List of solutions
        """
        solutions = []
        for finding in findings:
            solution = self.generate_secure_solution(finding)
            solution['finding_id'] = finding.get('id', id(finding))
            solutions.append(solution)
        return solutions

    def explain_vulnerability(self, issue_data: Dict[str, Any]) -> str:
        """
        Generate a detailed explanation of a vulnerability

        Args:
            issue_data: Dictionary containing issue information

        Returns:
            Detailed explanation string
        """
        if not self.is_available():
            return self._get_fallback_explanation(issue_data)

        vulnerability_type = issue_data.get('issue', 'Unknown')
        cwe_id = issue_data.get('cwe', 'Unknown')
        code = issue_data.get('code', '')
        language = issue_data.get('language', 'unknown')

        prompt = f"""You are a security expert. Explain this vulnerability in detail:

Vulnerability Type: {vulnerability_type}
CWE: {cwe_id}
Language: {language}
Code: {code}

Provide:
1. What this vulnerability is
2. Why it's dangerous
3. How an attacker could exploit it
4. The best way to fix it

Be concise but thorough."""

        try:
            response = self.model.generate_content(prompt)
            return response.text.strip()
        except Exception as e:
            return self._get_fallback_explanation(issue_data)

    def _create_fix_prompt(self, vulnerability_type: str, cwe_id: str, language: str,
                           problematic_code: str, description: str, context: List[str],
                           line_number: int) -> str:
        """Create a prompt for code fixing"""
        context_str = '\n'.join(context) if context else 'No context available'

        return f"""You are an expert cybersecurity developer specializing in secure coding practices.
Your task is to provide a secure, production-ready code fix for a security vulnerability.

## Vulnerability Details
- Type: {vulnerability_type}
- CWE: {cwe_id}
- Language: {language}
- Line: {line_number}

## Problematic Code
```{language}
{problematic_code}
```

## Context
```
{context_str}
```

## Description
{description}

## Instructions
1. Analyze the vulnerability and understand its security implications
2. Provide a secure replacement for the problematic code
3. Ensure the fix maintains the original functionality
4. Follow security best practices for {language}

## Response Format
Provide your response in this format:

### Fixed Code
```{language}
[Your secure code here]
```

### Explanation
[Brief explanation of what was changed and why]

### Security Notes
[Any additional security considerations]"""

    def _extract_solution_code(self, response: str, language: str) -> str:
        """Extract code block from AI response"""
        # Try to find code block with language tag
        pattern = rf'```{language}\n(.*?)```'
        match = re.search(pattern, response, re.DOTALL | re.IGNORECASE)
        if match:
            return match.group(1).strip()

        # Try generic code block
        pattern = r'```\n?(.*?)```'
        match = re.search(pattern, response, re.DOTALL)
        if match:
            return match.group(1).strip()

        # Return everything after "Fixed Code" header if present
        if '### Fixed Code' in response:
            parts = response.split('### Fixed Code')
            if len(parts) > 1:
                code_section = parts[1].split('###')[0]
                return code_section.strip().strip('`').strip()

        return ''

    def _detect_language(self, file_path: str) -> str:
        """Detect language from file extension"""
        ext_map = {
            '.py': 'python',
            '.js': 'javascript',
            '.ts': 'typescript',
            '.jsx': 'javascript',
            '.tsx': 'typescript',
            '.java': 'java',
            '.c': 'c',
            '.cpp': 'cpp',
            '.h': 'c',
            '.hpp': 'cpp',
            '.go': 'go',
            '.rs': 'rust',
            '.rb': 'ruby',
            '.php': 'php',
        }
        ext = os.path.splitext(file_path)[1].lower()
        return ext_map.get(ext, 'unknown')

    def _get_fallback_explanation(self, issue_data: Dict[str, Any]) -> str:
        """Get fallback explanation when AI is not available"""
        vulnerability_type = issue_data.get('issue', 'Unknown')
        cwe_id = issue_data.get('cwe', 'Unknown')

        explanations = {
            'sql-injection': 'SQL Injection allows attackers to manipulate database queries. Use parameterized queries instead of string concatenation.',
            'command-injection': 'Command Injection allows attackers to execute arbitrary system commands. Use safe APIs and validate all inputs.',
            'code-injection': 'Code Injection (eval) allows attackers to execute arbitrary code. Avoid eval() and similar functions.',
            'xss': 'Cross-Site Scripting (XSS) allows attackers to inject malicious scripts. Sanitize all user inputs.',
            'path-traversal': 'Path Traversal allows attackers to access files outside intended directories. Validate and sanitize file paths.',
            'hardcoded-secret': 'Hardcoded secrets expose sensitive credentials. Use environment variables or a secrets manager.',
            'weak-crypto': 'Weak cryptography can be broken by attackers. Use modern, secure algorithms like AES-256.',
            'insecure-randomness': 'Insecure random values are predictable. Use cryptographically secure random generators.',
        }

        return explanations.get(vulnerability_type,
            f'{vulnerability_type} ({cwe_id}) is a security vulnerability that should be reviewed and fixed.')
