"""pytest wrapper around ``backend/smoke_test.py``.

The smoke test is a self-contained script: it starts a stub Portable
Applications Server on loopback and walks the whole catalog → install → launch
→ remove path, printing one line per check. Rather than duplicate those checks
as pytest functions (which would drift), this wrapper runs the script and turns
its failure list into a readable pytest failure.

The one thing it adds is isolation: ``paths.base_dir`` is redirected to a
temporary directory, so running ``pytest`` never deletes the developer's real
``data/`` folder (installs, cached covers, server address). Running
``python backend/smoke_test.py`` directly still uses the real ``data/``.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from backend import paths
from backend import smoke_test


@pytest.fixture()
def isolated_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point every writable path at ``tmp_path`` for the duration of a test."""
    monkeypatch.setattr(paths, "base_dir", lambda: tmp_path)
    # ``failures`` is module state, so a previous run must not leak into this one.
    smoke_test.failures.clear()
    return tmp_path


def test_smoke_suite_passes(isolated_data_dir: Path) -> None:
    """Every check in the smoke test must pass."""
    exit_code = smoke_test.main()

    if smoke_test.failures:
        pytest.fail(
            f"{len(smoke_test.failures)} smoke check(s) failed:\n"
            + "\n".join(f"  - {label}" for label in smoke_test.failures),
            pytrace=False,
        )
    assert exit_code == 0


def test_smoke_suite_leaves_no_state(isolated_data_dir: Path) -> None:
    """The suite must clean up after itself, so repeated runs stay green."""
    smoke_test.main()

    assert not list(paths.apps_dir().iterdir()), "installed apps were left behind"
    assert not list(paths.thumbnails_dir().iterdir()), "cached covers were left behind"
    assert not list(paths.tmp_dir().glob("*.zip")), "partial downloads were left behind"
