"""
Security Policies Configuration
Centralized security policy definitions for vulnerability detection
"""

# CWE (Common Weakness Enumeration) mappings
CWE_MAPPINGS = {
    'sql-injection': {'cwe': 'CWE-89', 'owasp': 'A03:2021 - Injection', 'severity': 'high'},
    'nosql-injection': {'cwe': 'CWE-943', 'owasp': 'A03:2021 - Injection', 'severity': 'high'},
    'command-injection': {'cwe': 'CWE-78', 'owasp': 'A03:2021 - Injection', 'severity': 'high'},
    'ldap-injection': {'cwe': 'CWE-90', 'owasp': 'A03:2021 - Injection', 'severity': 'high'},
    'xss': {'cwe': 'CWE-79', 'owasp': 'A03:2021 - Injection', 'severity': 'high'},
    'path-traversal': {'cwe': 'CWE-22', 'owasp': 'A01:2021 - Broken Access Control', 'severity': 'high'},
    'weak-crypto': {'cwe': 'CWE-327', 'owasp': 'A02:2021 - Cryptographic Failures', 'severity': 'medium'},
    'insecure-randomness': {'cwe': 'CWE-330', 'owasp': 'A02:2021 - Cryptographic Failures', 'severity': 'medium'},
    'tls-issues': {'cwe': 'CWE-295', 'owasp': 'A02:2021 - Cryptographic Failures', 'severity': 'high'},
    'hardcoded-secret': {'cwe': 'CWE-798', 'owasp': 'A07:2021 - Identification and Authentication Failures', 'severity': 'high'},
    'code-injection': {'cwe': 'CWE-94', 'owasp': 'A03:2021 - Injection', 'severity': 'critical'},
    'buffer-overflow': {'cwe': 'CWE-120', 'owasp': 'A06:2021 - Vulnerable and Outdated Components', 'severity': 'high'},
    'memory-leak': {'cwe': 'CWE-401', 'owasp': 'A06:2021 - Vulnerable and Outdated Components', 'severity': 'medium'},
    'unsafe-code': {'cwe': 'CWE-119', 'owasp': 'A06:2021 - Vulnerable and Outdated Components', 'severity': 'medium'},
    'banned-api': {'cwe': 'CWE-676', 'owasp': 'A06:2021 - Vulnerable and Outdated Components', 'severity': 'medium'},
    'insecure-deserialization': {'cwe': 'CWE-502', 'owasp': 'A08:2021 - Software and Data Integrity Failures', 'severity': 'high'},
    'ssrf': {'cwe': 'CWE-918', 'owasp': 'A10:2021 - Server-Side Request Forgery', 'severity': 'high'},
    'xxe': {'cwe': 'CWE-611', 'owasp': 'A05:2021 - Security Misconfiguration', 'severity': 'high'},
    'race-condition': {'cwe': 'CWE-362', 'owasp': 'A04:2021 - Insecure Design', 'severity': 'medium'},
    'privilege-escalation': {'cwe': 'CWE-269', 'owasp': 'A01:2021 - Broken Access Control', 'severity': 'high'},
}

# Severity weights for prioritization
SEVERITY_WEIGHTS = {
    'critical': 100,
    'high': 80,
    'medium': 60,
    'low': 40,
    'info': 20
}

# Security patterns by language
SECURITY_PATTERNS = {
    'python': [
        # SQL Injection
        (r'execute\s*\(\s*["\'].*%.*["\']', 'sql-injection', 'high'),
        (r'execute\s*\(\s*["\'].*\+.*["\']', 'sql-injection', 'high'),
        (r'execute\s*\(\s*f["\']', 'sql-injection', 'high'),
        (r'cursor\.execute\s*\(\s*["\'].*%s', 'sql-injection', 'high'),
        (r'\.raw\s*\(\s*["\'].*%', 'sql-injection', 'high'),

        # Command Injection
        (r'os\.system\s*\(', 'command-injection', 'high'),
        (r'os\.popen\s*\(', 'command-injection', 'high'),
        (r'subprocess\.call\s*\(\s*["\']', 'command-injection', 'high'),
        (r'subprocess\.run\s*\(\s*["\']', 'command-injection', 'high'),
        (r'subprocess\.Popen\s*\(\s*["\'].*shell\s*=\s*True', 'command-injection', 'critical'),

        # Code Injection
        (r'\beval\s*\(', 'code-injection', 'critical'),
        (r'\bexec\s*\(', 'code-injection', 'critical'),
        (r'compile\s*\(.*,.*["\']exec["\']', 'code-injection', 'high'),

        # Path Traversal
        (r'open\s*\(\s*[^,]+\+', 'path-traversal', 'high'),
        (r'os\.path\.join\s*\(.*request', 'path-traversal', 'high'),

        # Weak Crypto
        (r'hashlib\.md5\s*\(', 'weak-crypto', 'medium'),
        (r'hashlib\.sha1\s*\(', 'weak-crypto', 'medium'),
        (r'DES\.new\s*\(', 'weak-crypto', 'high'),
        (r'Blowfish\.new\s*\(', 'weak-crypto', 'medium'),

        # Insecure Randomness
        (r'random\.random\s*\(', 'insecure-randomness', 'medium'),
        (r'random\.randint\s*\(', 'insecure-randomness', 'medium'),

        # Hardcoded Secrets
        (r'password\s*=\s*["\'][^"\']+["\']', 'hardcoded-secret', 'high'),
        (r'api_key\s*=\s*["\'][^"\']+["\']', 'hardcoded-secret', 'high'),
        (r'secret\s*=\s*["\'][^"\']+["\']', 'hardcoded-secret', 'high'),
        (r'token\s*=\s*["\'][a-zA-Z0-9]{20,}["\']', 'hardcoded-secret', 'high'),

        # Insecure Deserialization
        (r'pickle\.loads?\s*\(', 'insecure-deserialization', 'high'),
        (r'yaml\.load\s*\([^,]+\)', 'insecure-deserialization', 'high'),
        (r'marshal\.loads?\s*\(', 'insecure-deserialization', 'high'),

        # SSRF
        (r'requests\.get\s*\(\s*[^,]*\+', 'ssrf', 'high'),
        (r'urllib\.request\.urlopen\s*\(\s*[^,]*\+', 'ssrf', 'high'),

        # XXE
        (r'etree\.parse\s*\(', 'xxe', 'medium'),
        (r'xml\.dom\.minidom\.parse\s*\(', 'xxe', 'medium'),

        # TLS Issues
        (r'verify\s*=\s*False', 'tls-issues', 'high'),
        (r'ssl\._create_unverified_context', 'tls-issues', 'high'),
    ],

    'javascript': [
        # SQL Injection
        (r'query\s*\(\s*["\'].*\+', 'sql-injection', 'high'),
        (r'query\s*\(\s*`.*\$\{', 'sql-injection', 'high'),
        (r'execute\s*\(\s*["\'].*\+', 'sql-injection', 'high'),

        # Command Injection
        (r'exec\s*\(\s*["\']', 'command-injection', 'high'),
        (r'execSync\s*\(\s*["\']', 'command-injection', 'high'),
        (r'spawn\s*\(\s*["\'].*\+', 'command-injection', 'high'),
        (r'child_process\.exec\s*\(', 'command-injection', 'high'),

        # Code Injection
        (r'\beval\s*\(', 'code-injection', 'critical'),
        (r'new\s+Function\s*\(', 'code-injection', 'critical'),
        (r'setTimeout\s*\(\s*["\']', 'code-injection', 'high'),
        (r'setInterval\s*\(\s*["\']', 'code-injection', 'high'),

        # XSS
        (r'innerHTML\s*=', 'xss', 'high'),
        (r'outerHTML\s*=', 'xss', 'high'),
        (r'document\.write\s*\(', 'xss', 'high'),
        (r'\.html\s*\(\s*[^)]*\+', 'xss', 'high'),

        # Path Traversal
        (r'fs\.readFileSync\s*\(\s*[^,]*\+', 'path-traversal', 'high'),
        (r'fs\.readFile\s*\(\s*[^,]*\+', 'path-traversal', 'high'),
        (r'path\.join\s*\(.*req\.', 'path-traversal', 'high'),

        # Hardcoded Secrets
        (r'password\s*[=:]\s*["\'][^"\']+["\']', 'hardcoded-secret', 'high'),
        (r'apiKey\s*[=:]\s*["\'][^"\']+["\']', 'hardcoded-secret', 'high'),
        (r'secret\s*[=:]\s*["\'][^"\']+["\']', 'hardcoded-secret', 'high'),
        (r'token\s*[=:]\s*["\'][a-zA-Z0-9]{20,}["\']', 'hardcoded-secret', 'high'),

        # Insecure Randomness
        (r'Math\.random\s*\(', 'insecure-randomness', 'medium'),

        # SSRF
        (r'fetch\s*\(\s*[^)]*\+', 'ssrf', 'high'),
        (r'axios\.\w+\s*\(\s*[^)]*\+', 'ssrf', 'high'),

        # Prototype Pollution
        (r'Object\.assign\s*\(\s*\{\}', 'unsafe-code', 'medium'),
        (r'\[.*\]\s*=.*req\.', 'unsafe-code', 'high'),
    ],

    'java': [
        # SQL Injection
        (r'executeQuery\s*\(\s*["\'].*\+', 'sql-injection', 'high'),
        (r'executeUpdate\s*\(\s*["\'].*\+', 'sql-injection', 'high'),
        (r'createQuery\s*\(\s*["\'].*\+', 'sql-injection', 'high'),
        (r'Statement\s+\w+\s*=.*createStatement', 'sql-injection', 'medium'),

        # Command Injection
        (r'Runtime\.getRuntime\(\)\.exec\s*\(', 'command-injection', 'high'),
        (r'ProcessBuilder\s*\(\s*["\']', 'command-injection', 'high'),

        # Code Injection
        (r'ScriptEngine.*eval\s*\(', 'code-injection', 'critical'),
        (r'Interpreter.*eval\s*\(', 'code-injection', 'critical'),

        # Path Traversal
        (r'new\s+File\s*\(\s*[^)]*\+', 'path-traversal', 'high'),
        (r'Paths\.get\s*\(\s*[^)]*\+', 'path-traversal', 'high'),

        # XSS
        (r'\.getParameter\s*\([^)]+\)', 'xss', 'medium'),
        (r'response\.getWriter\(\)\.print', 'xss', 'medium'),

        # Weak Crypto
        (r'Cipher\.getInstance\s*\(\s*["\']DES', 'weak-crypto', 'high'),
        (r'MessageDigest\.getInstance\s*\(\s*["\']MD5', 'weak-crypto', 'medium'),
        (r'MessageDigest\.getInstance\s*\(\s*["\']SHA-1', 'weak-crypto', 'medium'),

        # Hardcoded Secrets
        (r'password\s*=\s*["\'][^"\']+["\']', 'hardcoded-secret', 'high'),
        (r'apiKey\s*=\s*["\'][^"\']+["\']', 'hardcoded-secret', 'high'),

        # Insecure Deserialization
        (r'ObjectInputStream.*readObject\s*\(', 'insecure-deserialization', 'high'),
        (r'XMLDecoder.*readObject\s*\(', 'insecure-deserialization', 'high'),

        # XXE
        (r'DocumentBuilder.*parse\s*\(', 'xxe', 'medium'),
        (r'SAXParser.*parse\s*\(', 'xxe', 'medium'),

        # TLS Issues
        (r'TrustAllCertificates', 'tls-issues', 'high'),
        (r'setHostnameVerifier.*ALLOW_ALL', 'tls-issues', 'high'),
    ],

    'typescript': [],  # Use JavaScript patterns

    'go': [
        # SQL Injection
        (r'db\.Query\s*\(\s*["\'].*\+', 'sql-injection', 'high'),
        (r'db\.Exec\s*\(\s*["\'].*\+', 'sql-injection', 'high'),
        (r'fmt\.Sprintf\s*\(\s*["\'].*SELECT', 'sql-injection', 'high'),

        # Command Injection
        (r'exec\.Command\s*\(', 'command-injection', 'high'),
        (r'os/exec\.Command\s*\(', 'command-injection', 'high'),

        # Path Traversal
        (r'filepath\.Join\s*\(.*r\.URL', 'path-traversal', 'high'),
        (r'os\.Open\s*\(\s*[^)]*\+', 'path-traversal', 'high'),

        # Hardcoded Secrets
        (r'password\s*:?=\s*["\'][^"\']+["\']', 'hardcoded-secret', 'high'),
        (r'apiKey\s*:?=\s*["\'][^"\']+["\']', 'hardcoded-secret', 'high'),

        # TLS Issues
        (r'InsecureSkipVerify:\s*true', 'tls-issues', 'high'),
    ],

    'rust': [
        # Command Injection
        (r'Command::new\s*\(', 'command-injection', 'medium'),
        (r'\.arg\s*\(\s*&?format!', 'command-injection', 'high'),

        # Unsafe Code
        (r'unsafe\s*\{', 'unsafe-code', 'medium'),

        # Hardcoded Secrets
        (r'password\s*=\s*["\'][^"\']+["\']', 'hardcoded-secret', 'high'),
    ],

    'php': [
        # SQL Injection
        (r'mysql_query\s*\(\s*["\'].*\$', 'sql-injection', 'high'),
        (r'mysqli_query\s*\([^,]+,\s*["\'].*\$', 'sql-injection', 'high'),
        (r'\->query\s*\(\s*["\'].*\$', 'sql-injection', 'high'),

        # Command Injection
        (r'system\s*\(', 'command-injection', 'high'),
        (r'exec\s*\(', 'command-injection', 'high'),
        (r'shell_exec\s*\(', 'command-injection', 'high'),
        (r'passthru\s*\(', 'command-injection', 'high'),
        (r'`.*\$', 'command-injection', 'high'),

        # Code Injection
        (r'\beval\s*\(', 'code-injection', 'critical'),
        (r'assert\s*\(\s*\$', 'code-injection', 'high'),
        (r'create_function\s*\(', 'code-injection', 'high'),

        # Path Traversal
        (r'include\s*\(\s*\$', 'path-traversal', 'high'),
        (r'require\s*\(\s*\$', 'path-traversal', 'high'),
        (r'file_get_contents\s*\(\s*\$', 'path-traversal', 'high'),

        # XSS
        (r'echo\s+\$_', 'xss', 'high'),
        (r'print\s+\$_', 'xss', 'high'),

        # Hardcoded Secrets
        (r'\$password\s*=\s*["\'][^"\']+["\']', 'hardcoded-secret', 'high'),
    ],

    'ruby': [
        # SQL Injection
        (r'\.where\s*\(\s*["\'].*#\{', 'sql-injection', 'high'),
        (r'\.execute\s*\(\s*["\'].*#\{', 'sql-injection', 'high'),

        # Command Injection
        (r'system\s*\(', 'command-injection', 'high'),
        (r'exec\s*\(', 'command-injection', 'high'),
        (r'`.*#\{', 'command-injection', 'high'),
        (r'%x\[.*#\{', 'command-injection', 'high'),

        # Code Injection
        (r'\beval\s*\(', 'code-injection', 'critical'),
        (r'instance_eval\s*\(', 'code-injection', 'high'),
        (r'class_eval\s*\(', 'code-injection', 'high'),

        # Path Traversal
        (r'File\.read\s*\(\s*[^)]*\+', 'path-traversal', 'high'),
        (r'File\.open\s*\(\s*[^)]*\+', 'path-traversal', 'high'),

        # Hardcoded Secrets
        (r'password\s*=\s*["\'][^"\']+["\']', 'hardcoded-secret', 'high'),
    ],

    'c': [
        # Buffer Overflow
        (r'strcpy\s*\(', 'buffer-overflow', 'high'),
        (r'strcat\s*\(', 'buffer-overflow', 'high'),
        (r'sprintf\s*\(', 'buffer-overflow', 'high'),
        (r'gets\s*\(', 'buffer-overflow', 'critical'),
        (r'scanf\s*\(\s*["\']%s', 'buffer-overflow', 'high'),

        # Command Injection
        (r'system\s*\(', 'command-injection', 'high'),
        (r'popen\s*\(', 'command-injection', 'high'),
        (r'execl\s*\(', 'command-injection', 'high'),

        # Memory Issues
        (r'malloc\s*\([^)]+\)[^;]*;[^f]*$', 'memory-leak', 'medium'),
        (r'free\s*\([^)]+\);.*free\s*\(\1\)', 'unsafe-code', 'high'),
    ],

    'cpp': [
        # Buffer Overflow
        (r'strcpy\s*\(', 'buffer-overflow', 'high'),
        (r'strcat\s*\(', 'buffer-overflow', 'high'),
        (r'sprintf\s*\(', 'buffer-overflow', 'high'),
        (r'gets\s*\(', 'buffer-overflow', 'critical'),

        # Command Injection
        (r'system\s*\(', 'command-injection', 'high'),
        (r'popen\s*\(', 'command-injection', 'high'),

        # Unsafe Operations
        (r'reinterpret_cast\s*<', 'unsafe-code', 'medium'),
        (r'const_cast\s*<', 'unsafe-code', 'medium'),
    ],
}


def get_security_patterns(language):
    """Get security patterns for a specific language"""
    patterns = SECURITY_PATTERNS.get(language, [])
    # For TypeScript, also use JavaScript patterns
    if language == 'typescript':
        patterns = SECURITY_PATTERNS.get('javascript', [])
    return patterns


def get_cwe_mapping(issue_type):
    """Get CWE mapping for an issue type"""
    return CWE_MAPPINGS.get(issue_type, {
        'cwe': 'Unknown',
        'owasp': 'Unknown',
        'severity': 'medium'
    })


def get_severity_weight(severity):
    """Get weight for a severity level"""
    return SEVERITY_WEIGHTS.get(severity, 50)


def get_cwe_description(cwe):
    """Get human-readable description for a CWE"""
    descriptions = {
        'CWE-89': 'SQL Injection - Improper neutralization of SQL commands',
        'CWE-78': 'OS Command Injection - Improper neutralization of OS commands',
        'CWE-79': 'Cross-site Scripting (XSS) - Improper neutralization of input during web page generation',
        'CWE-22': 'Path Traversal - Improper limitation of a pathname to a restricted directory',
        'CWE-94': 'Code Injection - Improper control of generation of code',
        'CWE-327': 'Use of Broken or Risky Cryptographic Algorithm',
        'CWE-330': 'Use of Insufficiently Random Values',
        'CWE-295': 'Improper Certificate Validation',
        'CWE-798': 'Use of Hard-coded Credentials',
        'CWE-120': 'Buffer Copy without Checking Size of Input (Buffer Overflow)',
        'CWE-401': 'Missing Release of Memory after Effective Lifetime (Memory Leak)',
        'CWE-119': 'Improper Restriction of Operations within Bounds of a Memory Buffer',
        'CWE-502': 'Deserialization of Untrusted Data',
        'CWE-918': 'Server-Side Request Forgery (SSRF)',
        'CWE-611': 'Improper Restriction of XML External Entity Reference (XXE)',
        'CWE-362': 'Concurrent Execution using Shared Resource with Improper Synchronization (Race Condition)',
        'CWE-269': 'Improper Privilege Management',
        'CWE-90': 'LDAP Injection',
        'CWE-943': 'Improper Neutralization of Special Elements in Data Query Logic (NoSQL Injection)',
        'CWE-676': 'Use of Potentially Dangerous Function (Banned API)',
    }
    return descriptions.get(cwe, f'{cwe} - Security vulnerability')


def get_security_category(issue_type):
    """Get security category for an issue type"""
    categories = {
        'sql-injection': 'Injection',
        'nosql-injection': 'Injection',
        'command-injection': 'Injection',
        'ldap-injection': 'Injection',
        'code-injection': 'Injection',
        'xss': 'Cross-Site Scripting',
        'path-traversal': 'Access Control',
        'weak-crypto': 'Cryptography',
        'insecure-randomness': 'Cryptography',
        'tls-issues': 'Cryptography',
        'hardcoded-secret': 'Secrets Management',
        'buffer-overflow': 'Memory Safety',
        'memory-leak': 'Memory Safety',
        'unsafe-code': 'Code Safety',
        'banned-api': 'Code Safety',
        'insecure-deserialization': 'Data Integrity',
        'ssrf': 'Network Security',
        'xxe': 'XML Security',
        'race-condition': 'Concurrency',
        'privilege-escalation': 'Access Control',
    }
    return categories.get(issue_type, 'General Security')


def get_banned_apis(language):
    """Get list of banned APIs for a language"""
    banned = {
        'python': ['eval', 'exec', 'pickle.loads', 'marshal.loads', 'yaml.load'],
        'javascript': ['eval', 'Function', 'setTimeout(string)', 'setInterval(string)'],
        'java': ['Runtime.exec', 'ObjectInputStream.readObject', 'XMLDecoder.readObject'],
        'c': ['gets', 'strcpy', 'strcat', 'sprintf', 'scanf'],
        'cpp': ['gets', 'strcpy', 'strcat', 'sprintf'],
        'php': ['eval', 'system', 'exec', 'shell_exec', 'passthru'],
        'ruby': ['eval', 'instance_eval', 'class_eval', 'system', 'exec'],
    }
    return banned.get(language, [])
