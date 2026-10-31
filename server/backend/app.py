"""Flask application factory.

The same origin serves both the JSON API and the built React frontend, so the
PyWebView window can load ``http://127.0.0.1:<port>/`` and call ``/api/...``
without CORS or ``file://`` restrictions.
"""

from __future__ import annotations

from flask import Flask, jsonify, render_template, request, send_from_directory

from . import config, paths
from .api import catalog, client, distribution, files, system, transfers
from .services import catalog_service

#: Addresses that count as "this machine". The admin UI always reaches the API
#: through one of these (PyWebView loads ``127.0.0.1`` and the Vite dev proxy
#: connects from loopback), so anything else is a client on the LAN.
LOOPBACK_ADDRESSES = {"127.0.0.1", "::1", "::ffff:127.0.0.1"}

#: Admin-only API prefixes. Clients may read the catalog and download archives,
#: but must never reach the management endpoints.
ADMIN_API_PREFIXES = (
    "/api/catalog",
    "/api/files",
    "/api/system",
    "/api/transfers",
    "/api/activity",
)


def create_app() -> Flask:
    web_root = paths.web_dir()

    # Resolve templates from the resource root rather than Flask's inferred
    # ``root_path``. In development that is ``<project>/backend/templates``; in
    # a PyInstaller bundle it is ``<_MEIPASS>/backend/templates``. Both are
    # bundled by ``pyinstaller.spec``, so ``/client`` works in either mode.
    template_root = paths.resource_root() / "backend" / "templates"

    app = Flask(
        __name__,
        template_folder=str(template_root),
        static_folder=str(web_root / "assets"),
        static_url_path="/assets",
    )
    app.config["JSON_SORT_KEYS"] = False

    app.register_blueprint(catalog.bp)
    app.register_blueprint(client.bp)
    app.register_blueprint(files.bp)
    app.register_blueprint(distribution.bp)
    app.register_blueprint(system.bp)
    app.register_blueprint(transfers.bp)

    @app.before_request
    def _guard_admin_api():
        """Reject admin API calls that do not originate from this machine."""
        path = request.path
        if not path.startswith(ADMIN_API_PREFIXES):
            return None
        # Thumbnails are read-only and are needed by the client catalog page.
        if request.method == "GET" and path.startswith("/api/files/thumbnail/"):
            return None
        if request.remote_addr in LOOPBACK_ADDRESSES:
            return None
        return (
            jsonify(
                {
                    "error": "This endpoint is only available on the server machine.",
                    "hint": "Clients should use /api/client/catalog instead.",
                }
            ),
            403,
        )

    @app.get("/")
    def index():
        if not (web_root / "index.html").is_file():
            return _missing_frontend()
        return send_from_directory(web_root, "index.html")

    @app.get("/client")
    def client_catalog_page():
        """Server-rendered catalog for browsers on client computers."""
        return render_template(
            "client.html",
            app_name=config.APP_NAME,
            version=config.VERSION,
            entries=catalog_service.list_entries(),
        )

    @app.get("/<path:asset_path>")
    def spa_fallback(asset_path: str):
        """Serve real files when they exist, otherwise hand routing to the SPA."""
        if asset_path.startswith("api/"):
            return jsonify({"error": "Not found."}), 404
        candidate = web_root / asset_path
        if candidate.is_file():
            return send_from_directory(web_root, asset_path)
        if not (web_root / "index.html").is_file():
            return _missing_frontend()
        return send_from_directory(web_root, "index.html")

    @app.errorhandler(404)
    def not_found(_error):
        return jsonify({"error": "Not found."}), 404

    @app.errorhandler(500)
    def server_error(_error):
        return jsonify({"error": "Internal server error."}), 500

    return app


def _missing_frontend():
    return (
        jsonify(
            {
                "error": "The frontend has not been built.",
                "hint": "Run 'npm run build' in the project root, then restart.",
                "expected": str(paths.web_dir() / "index.html"),
            }
        ),
        503,
    )
