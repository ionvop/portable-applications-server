"""Shared pytest setup for the client backend tests.

The backend is a plain package inside the repository rather than an installed
distribution, so the project root has to be importable before ``import backend``
works. ``smoke_test.py`` does the same thing at module scope; doing it here
means the tests can be run from any working directory.
"""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
