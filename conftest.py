"""
Pytest root configuration: ensures repository root is always in sys.path
during test collection in CI and local runners.
"""

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
