"""Pytest entry point for the backend smoke suite.

``backend/smoke_test.py`` remains the single source of truth: it exercises
every route and knows how to build its own fixtures. This module only adapts it
to pytest so CI can run it, and so failures show up as a normal test result.

Run it with ``python -m pytest`` (or ``npm test``).
"""

from __future__ import annotations

import pytest

from backend import paths
from backend import smoke_test


def test_smoke_suite_passes() -> None:
    web_index = paths.web_dir() / "index.html"
    if not web_index.is_file():
        pytest.skip(
            "built frontend missing; run 'npm run build' before the smoke suite "
            f"(expected {web_index})"
        )

    exit_code = smoke_test.main()

    # ``check`` already prints a per-assertion report; surface the collected
    # labels in the failure message so a red CI run names the broken checks.
    assert exit_code == 0, "smoke test failures: " + ", ".join(smoke_test.failures)
