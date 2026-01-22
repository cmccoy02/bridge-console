"""
Language Detector
Detects programming languages in source files
"""

import os
import re
from typing import Dict, List, Set
from config import FILE_CONFIG

# Language detection patterns
LANGUAGE_PATTERNS = {
    'python': [
        r'^#!.*python',
        r'import\s+\w+',
        r'from\s+\w+\s+import',
        r'def\s+\w+\s*\(',
        r'class\s+\w+',
        r'if\s+__name__\s*==\s*["\']__main__["\']',
    ],
    'java': [
        r'^package\s+\w+',
        r'import\s+java\.',
        r'public\s+class\s+\w+',
        r'public\s+static\s+void\s+main',
    ],
    'javascript': [
        r'^#!.*node',
        r'require\s*\(\s*["\']',
        r'import\s+.*from\s+["\']',
        r'function\s+\w+\s*\(',
        r'const\s+\w+\s*=',
        r'let\s+\w+\s*=',
        r'console\.log',
        r'module\.exports',
    ],
    'typescript': [
        r'import\s+.*from\s+["\']',
        r'interface\s+\w+',
        r'type\s+\w+\s*=',
        r':\s*(string|number|boolean|any)\b',
        r'as\s+(string|number|boolean|any)\b',
    ],
    'php': [
        r'^<\?php',
        r'<\?=',
        r'echo\s+',
        r'\$\w+\s*=',
    ],
    'ruby': [
        r'^#!.*ruby',
        r'require\s+["\']',
        r'def\s+\w+',
        r'class\s+\w+',
        r'puts\s+',
    ],
    'go': [
        r'^package\s+\w+',
        r'import\s+\(',
        r'func\s+\w+\s*\(',
        r'type\s+\w+\s+struct',
        r'fmt\.Print',
    ],
    'rust': [
        r'^#!\[',
        r'use\s+\w+',
        r'fn\s+\w+\s*\(',
        r'struct\s+\w+',
        r'impl\s+\w+',
        r'let\s+mut\s+',
    ],
    'c': [
        r'^#include\s*<',
        r'^#include\s*"',
        r'int\s+main\s*\(',
        r'printf\s*\(',
        r'void\s+\w+\s*\(',
    ],
    'cpp': [
        r'^#include\s*<',
        r'using\s+namespace',
        r'std::',
        r'cout\s*<<',
        r'class\s+\w+\s*{',
        r'public:',
        r'private:',
    ],
    'csharp': [
        r'using\s+System',
        r'namespace\s+\w+',
        r'class\s+\w+',
        r'public\s+static\s+void\s+Main',
        r'Console\.WriteLine',
    ],
}

# File extension to language mapping
EXTENSION_MAP = {
    '.py': 'python',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.java': 'java',
    '.c': 'c',
    '.h': 'c',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.go': 'go',
    '.rs': 'rust',
    '.rb': 'ruby',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
}


def detect_per_file(repo_path: str) -> Dict[str, str]:
    """
    Detect language for each file in repository

    Args:
        repo_path: Path to repository

    Returns:
        Dictionary mapping file paths to languages
    """
    file_languages = {}
    excluded_dirs = set(FILE_CONFIG['excluded_dirs'])

    for root, dirs, files in os.walk(repo_path):
        # Skip excluded directories
        dirs[:] = [d for d in dirs if d not in excluded_dirs]

        for f in files:
            rel_path = os.path.relpath(os.path.join(root, f), repo_path)
            file_path = os.path.join(root, f)

            # First try extension-based detection
            ext = os.path.splitext(f)[1].lower()
            if ext in EXTENSION_MAP:
                file_languages[rel_path] = EXTENSION_MAP[ext]
                continue

            # Try content-based detection
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as file:
                    content = file.read(4096)  # Read first 4KB
                    language = detect_from_content(content)
                    if language:
                        file_languages[rel_path] = language
                    else:
                        file_languages[rel_path] = 'unknown'
            except Exception:
                file_languages[rel_path] = 'unknown'

    return file_languages


def detect_from_content(content: str) -> str:
    """
    Detect language from file content

    Args:
        content: File content

    Returns:
        Detected language or empty string
    """
    max_score = 0
    detected = ''

    for language, patterns in LANGUAGE_PATTERNS.items():
        score = 0
        for pattern in patterns:
            if re.search(pattern, content, re.MULTILINE):
                score += 1

        if score > max_score:
            max_score = score
            detected = language

    return detected if max_score >= 2 else ''


def get_languages_in_repo(repo_path: str) -> List[str]:
    """
    Get list of unique languages in repository

    Args:
        repo_path: Path to repository

    Returns:
        List of language names
    """
    file_languages = detect_per_file(repo_path)

    # Deduplicate while preserving order
    seen: Set[str] = set()
    ordered: List[str] = []

    for lang in file_languages.values():
        if lang not in seen and lang != 'unknown':
            seen.add(lang)
            ordered.append(lang)

    return ordered


def get_file_count_by_language(repo_path: str) -> Dict[str, int]:
    """
    Count files by language

    Args:
        repo_path: Path to repository

    Returns:
        Dictionary mapping languages to file counts
    """
    file_languages = detect_per_file(repo_path)
    counts: Dict[str, int] = {}

    for lang in file_languages.values():
        if lang != 'unknown':
            counts[lang] = counts.get(lang, 0) + 1

    return counts
