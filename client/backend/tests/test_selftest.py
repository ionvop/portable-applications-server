"""Tests for the packaged-build selftest.

``backend/selftest.py`` is what ``build.bat`` runs against the frozen exe, so it
must be exercised from source too — otherwise a broken check would only be
discovered after a full PyInstaller build.

The frontend is faked: the real ``dist/`` may not exist in a fresh checkout, and
the selftest only cares that whatever ``paths.web_dir()`` points at is served.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from backend import config, main, paths, selftest


@pytest.fixture()
def isolated_build(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point the data folder and the frontend at ``tmp_path``."""
    data = tmp_path / "data"
    web = tmp_path / "dist"
    (web / "assets").mkdir(parents=True)
    (web / "index.html").write_text(
        '<!doctype html><html><body><div id="root"></div>'
        '<script src="/assets/index-test.js"></script></body></html>',
        encoding="utf-8",
    )
    (web / "assets" / "index-test.js").write_text("console.log('ok')", encoding="utf-8")

    monkeypatch.setattr(paths, "base_dir", lambda: tmp_path)
    monkeypatch.setattr(paths, "web_dir", lambda: web)
    return tmp_path


def test_selftest_passes_and_writes_a_report(isolated_build: Path) -> None:
    report = isolated_build / "selftest.log"

    assert selftest.run(report) == 0

    text = report.read_text(encoding="utf-8")
    assert selftest.PASS_MARKER in text
    assert selftest.FAIL_MARKER not in text
    # The checks the build script relies on must actually be present.
    assert "index.html is bundled" in text
    assert "data folder is writable" in text
    assert "GET / returns 200" in text
    assert "local server answers over HTTP" in text


def test_selftest_creates_the_data_folder(isolated_build: Path) -> None:
    assert not (isolated_build / "data").exists()

    assert selftest.run(isolated_build / "selftest.log") == 0

    assert (isolated_build / "data" / config.DB_FILE_NAME).is_file()


def test_selftest_fails_without_a_frontend(isolated_build: Path) -> None:
    (isolated_build / "dist" / "index.html").unlink()
    report = isolated_build / "selftest.log"

    assert selftest.run(report) == 1

    text = report.read_text(encoding="utf-8")
    assert selftest.FAIL_MARKER in text
    assert "index.html is bundled" in text


def test_selftest_fails_when_an_asset_is_missing(isolated_build: Path) -> None:
    (isolated_build / "dist" / "assets" / "index-test.js").unlink()
    report = isolated_build / "selftest.log"

    assert selftest.run(report) == 1
    assert "GET /assets/index-test.js returns 200" in report.read_text(encoding="utf-8")


def test_main_selftest_does_not_open_a_window(
    isolated_build: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """``--selftest`` must return before pywebview is imported."""
    import builtins

    real_import = builtins.__import__

    def guarded_import(name, *args, **kwargs):
        if name == "webview":
            raise AssertionError("--selftest must not import webview")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", guarded_import)
    report = isolated_build / "selftest.log"

    assert main.main(["--selftest", "--selftest-log", str(report)]) == 0
    assert selftest.PASS_MARKER in report.read_text(encoding="utf-8")


def test_selftest_log_argument_parsing() -> None:
    assert main._selftest_log_argument(["--selftest"]) is None
    assert main._selftest_log_argument(["--selftest-log", "a.log"]) == "a.log"
    assert main._selftest_log_argument(["--selftest-log=b.log"]) == "b.log"
    # A trailing flag with no value must not raise.
    assert main._selftest_log_argument(["--selftest-log"]) is None
