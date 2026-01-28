"""
Bridge Security Agent
AI-powered code security scanner and autonomous fixer
The engineer that lives inside your code.
"""

from scanner import SecurityScanner, scan_repository
from ai_fixer import AIFixer
from patcher import SecurityPatcher, apply_security_fixes
import language_detector
import pattern_detector
import security_policies

__version__ = '1.0.0'

__all__ = [
    'SecurityScanner',
    'scan_repository',
    'AIFixer',
    'SecurityPatcher',
    'apply_security_fixes',
    'language_detector',
    'pattern_detector',
    'security_policies',
]
