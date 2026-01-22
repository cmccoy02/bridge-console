"""
Bridge Security Agent
AI-powered code security scanner and fixer
"""

from scanner import SecurityScanner, scan_repository
from ai_fixer import AIFixer
import language_detector
import pattern_detector
import security_policies

__version__ = '1.0.0'

__all__ = [
    'SecurityScanner',
    'scan_repository',
    'AIFixer',
    'language_detector',
    'pattern_detector',
    'security_policies',
]
