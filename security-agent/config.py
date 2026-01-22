"""
Security Agent Configuration
Handles configuration, security policies, and AI model configuration.
Uses Google Gemini 3 Pro for AI-powered code analysis and fixes.
"""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Google Gemini Configuration (replacing Qwen3)
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', os.getenv('GOOGLE_API_KEY', ''))
GEMINI_MODEL_NAME = os.getenv('GEMINI_MODEL_NAME', 'gemini-2.0-flash')

# Gemini API endpoint
GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

# Security Policy Configuration
SECURITY_POLICIES = {
    'severity_thresholds': {
        'critical': 100,
        'high': 80,
        'medium': 60,
        'low': 40,
        'info': 20
    },
    'enabled_checks': {
        'injection': True,
        'xss': True,
        'path_traversal': True,
        'cryptography': True,
        'hardcoded_secrets': True,
        'banned_apis': True,
        'general_issues': True
    },
    'language_specific_policies': {
        'python': {
            'banned_imports': ['pickle', 'marshal', 'yaml', 'eval', 'exec'],
            'required_imports': ['os', 'sys', 'subprocess'],
            'severity_overrides': {
                'eval': 'critical',
                'exec': 'critical',
                'pickle.loads': 'high'
            }
        },
        'java': {
            'banned_imports': ['java.io.ObjectInputStream', 'java.beans.XMLDecoder'],
            'required_imports': ['java.sql', 'java.security'],
            'severity_overrides': {
                'ObjectInputStream.readObject': 'high',
                'XMLDecoder.readObject': 'high'
            }
        },
        'javascript': {
            'banned_imports': ['eval', 'Function', 'child_process'],
            'required_imports': ['fs', 'path', 'crypto'],
            'severity_overrides': {
                'eval': 'critical',
                'Function': 'critical',
                'child_process.exec': 'high'
            }
        },
        'typescript': {
            'banned_imports': ['eval', 'Function', 'child_process'],
            'required_imports': ['fs', 'path', 'crypto'],
            'severity_overrides': {
                'eval': 'critical',
                'Function': 'critical',
                'child_process.exec': 'high'
            }
        }
    }
}

# CWE (Common Weakness Enumeration) Configuration
CWE_CONFIG = {
    'enabled_cwes': [
        'CWE-89',   # SQL Injection
        'CWE-78',   # Command Injection
        'CWE-79',   # XSS
        'CWE-22',   # Path Traversal
        'CWE-94',   # Code Injection
        'CWE-327',  # Weak Crypto
        'CWE-330',  # Insecure Randomness
        'CWE-295',  # TLS Issues
        'CWE-798',  # Hardcoded Secrets
        'CWE-120',  # Buffer Overflow
        'CWE-401',  # Memory Leak
        'CWE-119',  # Unsafe Code
        'CWE-477',  # Banned API
        'CWE-502',  # Insecure Deserialization
        'CWE-918',  # SSRF
        'CWE-611',  # XXE
        'CWE-362',  # Race Condition
        'CWE-269',  # Privilege Escalation
        'CWE-90',   # LDAP Injection
        'CWE-943'   # NoSQL Injection
    ],
    'cwe_priorities': {
        'CWE-89': 95,    # SQL Injection
        'CWE-78': 95,    # Command Injection
        'CWE-79': 90,    # XSS
        'CWE-22': 90,    # Path Traversal
        'CWE-94': 100,   # Code Injection
        'CWE-327': 70,   # Weak Crypto
        'CWE-330': 70,   # Insecure Randomness
        'CWE-295': 85,   # TLS Issues
        'CWE-798': 85,   # Hardcoded Secrets
        'CWE-120': 90,   # Buffer Overflow
        'CWE-401': 60,   # Memory Leak
        'CWE-119': 75,   # Unsafe Code
        'CWE-477': 65,   # Banned API
        'CWE-502': 90,   # Insecure Deserialization
        'CWE-918': 85,   # SSRF
        'CWE-611': 85,   # XXE
        'CWE-362': 70,   # Race Condition
        'CWE-269': 80,   # Privilege Escalation
        'CWE-90': 85,    # LDAP Injection
        'CWE-943': 85    # NoSQL Injection
    }
}

# OWASP Top 10 Configuration
OWASP_CONFIG = {
    'categories': {
        'A01:2021 - Broken Access Control': 95,
        'A02:2021 - Cryptographic Failures': 85,
        'A03:2021 - Injection': 100,
        'A04:2021 - Insecure Design': 75,
        'A05:2021 - Security Misconfiguration': 70,
        'A06:2021 - Vulnerable and Outdated Components': 80,
        'A07:2021 - Identification and Authentication Failures': 85,
        'A08:2021 - Software and Data Integrity Failures': 80,
        'A09:2021 - Security Logging and Monitoring Failures': 60,
        'A10:2021 - Server-Side Request Forgery': 85
    }
}

# File processing configuration
FILE_CONFIG = {
    'max_file_size': 10 * 1024 * 1024,  # 10MB
    'supported_extensions': [
        '.py', '.js', '.ts', '.jsx', '.tsx',
        '.java', '.c', '.cpp', '.cc', '.h', '.hpp',
        '.go', '.rs', '.rb', '.php', '.cs',
        '.swift', '.kt', '.scala', '.clj'
    ],
    'excluded_dirs': [
        'node_modules', 'venv', '__pycache__', '.git',
        'dist', 'build', 'target', '.next', '.nuxt',
        'vendor', 'deps', '_build', 'coverage'
    ],
    'excluded_files': [
        'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
        'Cargo.lock', 'Gemfile.lock', 'poetry.lock',
        'mix.lock', 'go.sum'
    ]
}

# Scan configuration
SCAN_CONFIG = {
    'parallel_processing': True,
    'max_workers': 4,
    'timeout': 300,  # 5 minutes
    'memory_limit': 1024,  # MB
    'enable_ast_analysis': True,
    'enable_regex_analysis': True,
    'enable_semantic_analysis': False  # Requires additional setup
}
