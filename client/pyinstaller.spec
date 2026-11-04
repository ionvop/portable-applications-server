# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller build definition for the Portable Applications Client.

Build with ``build.bat`` (or ``pyinstaller --noconfirm pyinstaller.spec``).

Layout produced in ``release/PortableApplicationsClient/``::

    PortableApplicationsClient.exe
    _internal/
        dist/                     <- built frontend (paths.web_dir())
        ...                       <- Python runtime and dependencies
    data/                         <- created on first run, beside the exe
        apps/                     <- downloaded applications and games
        tmp/                      <- in-flight downloads
        client.db                 <- install state
        client.log                <- startup log (windowed build has no console)
        settings.json             <- server address

Two rules keep the build portable:

* Read-only resources live inside the bundle and are reached through
  ``paths.resource_root()`` (``sys._MEIPASS`` when frozen).
* Writable state lives in ``paths.base_dir()``, which is the directory holding
  the executable — never ``_MEIPASS``, which is a throwaway extraction folder.

The build is *onedir*: the executable starts instantly and the bundled files can
be inspected, at the cost of shipping a folder instead of a single file.

``build.bat`` verifies the result by running ``PortableApplicationsClient.exe
--selftest`` in place and again from a copy in ``%TEMP%``; the exe is windowed,
so the verdict travels in the exit code and in ``data/selftest.log``.
"""

from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

# ``SPECPATH`` is injected by PyInstaller and points at this file's directory.
project_root = Path(SPECPATH).resolve()

#: Read-only resources, copied verbatim into the bundle root.
#: ``dist`` must keep its name because ``paths.web_dir()`` appends
#: ``config.WEB_DIR_NAME`` ("dist") to the resource root.
datas = [
    (str(project_root / "dist"), "dist"),
]

# pywebview imports its platform backend dynamically, so static analysis misses
# it. Collecting the whole package is cheap and covers the Windows backends
# (EdgeChromium via pythonnet, plus the WinForms fallback).
hiddenimports = collect_submodules("webview") + [
    "webview.platforms.edgechromium",
    "webview.platforms.winforms",
    "clr_loader",
    "pythonnet",
    # Imported lazily inside ``main.main`` so a normal start never pays for it.
    # Listed explicitly so a future refactor cannot silently drop the selftest
    # that ``build.bat`` depends on.
    "backend.selftest",
]

# Modules that are never used and only bloat the bundle.
excludes = [
    "pytest",
    "unittest",
    "pydoc",
    "tkinter.test",
    "test",
]

a = Analysis(
    [str(project_root / "run.py")],
    pathex=[str(project_root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="PortableApplicationsClient",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    # Windowed build: the app is a desktop window, not a console program.
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="PortableApplicationsClient",
)
