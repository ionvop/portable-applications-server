"""Pytest configuration for the backend smoke suite.

The smoke test is the single source of truth for API coverage. It was written
as a standalone script that writes into the real ``data`` folder, so this
wrapper redirects ``paths.data_dir()`` at a temporary directory through
``PAS_DATA_DIR`` before the script runs. A pytest run therefore never touches
``data/catalog.db`` or the managed applications folder.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Iterator

import pytest

from backend import paths


@pytest.fixture(autouse=True, scope="session")
def isolated_data_dir(tmp_path_factory: pytest.TempPathFactory) -> Iterator[Path]:
    """Point every backend path helper at a throwaway data folder."""
    data_root = tmp_path_factory.mktemp("pas-data")
    previous = os.environ.get(paths.DATA_DIR_ENV)
    os.environ[paths.DATA_DIR_ENV] = str(data_root)
    try:
        yield data_root
    finally:
        if previous is None:
            os.environ.pop(paths.DATA_DIR_ENV, None)
        else:
            os.environ[paths.DATA_DIR_ENV] = previous
