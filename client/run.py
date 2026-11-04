"""Convenience launcher: ``python run.py`` from the project root."""

import sys

from backend.main import main

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
